/**
 * Hardware awareness.
 *
 * The engine must not pretend it has a GPU, and must not load several models on
 * a laptop. This module reads what the OS actually reports and turns it into one
 * of three resource profiles with concrete limits that the model fabric and the
 * orchestrator obey.
 */
import os from 'node:os';

export const PROFILES = {
  low: {
    id: 'low',
    label: 'Low resource',
    contextTokens: 2048,
    maxConcurrentModels: 1,
    maxConcurrentTasks: 1,
    backgroundJobs: 0,
    notes: ['One model at a time', 'Small context', 'Lazy loading', 'No background indexing'],
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    contextTokens: 8192,
    maxConcurrentModels: 1,
    maxConcurrentTasks: 2,
    backgroundJobs: 1,
    notes: ['Adaptive routing', 'On-demand embeddings', 'Throttled background work'],
  },
  high: {
    id: 'high',
    label: 'High performance',
    contextTokens: 32768,
    maxConcurrentModels: 2,
    maxConcurrentTasks: 4,
    backgroundJobs: 2,
    notes: ['GPU preferred', 'Larger context', 'Controlled parallelism'],
  },
};

const GB = 1024 ** 3;

/** Parse an env override such as `NOVA_RESOURCE_PROFILE=low`. */
function envProfile(env) {
  const value = (env.NOVA_RESOURCE_PROFILE || '').toLowerCase();
  return value === 'low' || value === 'balanced' || value === 'high' ? value : null;
}

/** VRAM is only reported when the operator states it; the engine never guesses. */
function gpuFromEnv(env) {
  const vram = Number(env.NOVA_GPU_VRAM_GB);
  if (!Number.isFinite(vram) || vram <= 0) return null;
  return { vendor: env.NOVA_GPU_VENDOR || 'unknown', vramGb: vram, source: 'env' };
}

/**
 * @param {{ env?: Record<string,string|undefined>, cpus?: Function, totalmem?: Function,
 *           freemem?: Function, loadavg?: Function }} options
 */
export function detectHardware({
  env = process.env,
  cpus = () => os.cpus(),
  totalmem = () => os.totalmem(),
  freemem = () => os.freemem(),
  loadavg = () => os.loadavg(),
} = {}) {
  const cpuList = safe(cpus, []) || [];
  const totalRamGb = round(safe(totalmem, 0) / GB);
  const freeRamGb = round(safe(freemem, 0) / GB);
  const gpu = gpuFromEnv(env);
  const load1 = round((safe(loadavg, [0]) || [0])[0] ?? 0);
  const cpuCount = cpuList.length || 1;
  const forced = envProfile(env);

  const reported = {
    cpuCount,
    cpuModel: cpuList[0]?.model?.trim() || 'unknown',
    totalRamGb,
    freeRamGb,
    load1,
    loadPerCpu: round(load1 / cpuCount),
    gpu,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
  };

  const profileId = forced || inferProfile(reported);
  return {
    ...reported,
    profile: PROFILES[profileId],
    profileSource: forced ? 'env' : 'detected',
  };
}

/** Conservative thresholds: a profile is only raised when the numbers support it. */
export function inferProfile({ totalRamGb, freeRamGb, gpu, loadPerCpu = 0 }) {
  const vram = gpu?.vramGb ?? 0;
  if (totalRamGb >= 32 && (vram >= 8 || loadPerCpu < 1.5)) return 'high';
  if (totalRamGb >= 12) return 'balanced';
  if (totalRamGb >= 8 && freeRamGb >= 3) return 'balanced';
  return 'low';
}

/** Choose the largest context a request may use under this profile. */
export function contextBudget(hardware, requested) {
  const limit = hardware?.profile?.contextTokens ?? PROFILES.low.contextTokens;
  const value = Number(requested);
  if (!Number.isFinite(value) || value <= 0) return limit;
  return Math.min(Math.floor(value), limit);
}

/** A rough memory estimate for a model, used only to refuse obviously unsafe loads. */
export function estimateModelMemoryGb({ parametersB = 7, quantisationBits = 4, contextTokens = 4096 } = {}) {
  const weights = (Number(parametersB) * Number(quantisationBits)) / 8;
  const kvCache = (Number(contextTokens) / 1024) * 0.12;
  return round(weights + kvCache + 0.6);
}

/** True when the profile can hold this model next to what is already loaded. */
export function canLoadModel(hardware, model, loadedGb = 0) {
  const available = (hardware?.gpu?.vramGb ?? hardware?.freeRamGb ?? 0) + 0;
  const needed = estimateModelMemoryGb(model) + Number(loadedGb || 0);
  return { allowed: needed <= available, neededGb: needed, availableGb: round(available) };
}

function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function round(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}
