/**
 * Graphics presets and the automatic fallback policy.
 *
 * Three presets, not a slider per effect: every knob exposed separately is a
 * support burden and a source of "it looks broken on my device" reports. The
 * presets differ along axes that actually cost frame time:
 *
 *              high      balanced    low
 *   chunk r   3         2           2
 *   LOD bands 92/210 m  →           46/120 m
 *   dust      1400       900          400
 *   shadows   2048      1024        off
 *   dpr       ≤2         ≤1.5        ≤1
 *   grain     full      full        0.45
 *   detail    4 scales  4 scales    2 scales
 *
 * **Shadows are a small, cheap pass, not a full-scene one.** The shadow camera is
 * a 64 m box that follows the player, and only the objects close enough to matter
 * cast into it: the astronaut, the rover, the station modules and the instanced
 * rocks. Terrain *receives* shadows but never casts them — a terrain shadow pass
 * over ~98 chunks would double the scene's draw calls to darken ground that the
 * dust-hazed ambient already fills. The lowest preset drops shadows entirely,
 * because a CPU rasteriser on a tablet pays for every fragment twice.
 *
 * Dynamic resolution: if the measured frame time stays above the target for a
 * sustained period, the pixel ratio drops in steps; it never rises again in the
 * same session (a resolution that oscillates is worse than one that is slightly
 * low). The HUD reports the change, so a player never wonders why it got softer.
 */

export type QualityPreset = 'high' | 'balanced' | 'low';

export interface QualitySettings {
  preset: QualityPreset;
  /** Streaming radius, in chunks. */
  chunkRadius: number;
  /** Distance bands for LOD, metres. */
  lodHigh: number;
  lodMedium: number;
  /** Dust particles drawn. */
  dustCount: number;
  /** Shadow map edge in texels; 0 disables the shadow pass entirely. */
  shadowMapSize: number;
  /** Upper bound on device pixel ratio. */
  maxPixelRatio: number;
  /** Terrain shader grain amount. */
  grain: number;
  /** Antialiasing on the WebGL context. */
  antialias: boolean;
}

export const QUALITY_PRESETS: Record<QualityPreset, QualitySettings> = {
  high: {
    preset: 'high',
    chunkRadius: 3,
    lodHigh: 92,
    lodMedium: 210,
    dustCount: 1400,
    shadowMapSize: 2048,
    maxPixelRatio: 2,
    grain: 1,
    antialias: true,
  },
  balanced: {
    preset: 'balanced',
    chunkRadius: 2,
    lodHigh: 92,
    lodMedium: 210,
    dustCount: 900,
    shadowMapSize: 1024,
    maxPixelRatio: 1.5,
    grain: 1,
    antialias: true,
  },
  low: {
    preset: 'low',
    chunkRadius: 2,
    lodHigh: 46,
    lodMedium: 120,
    dustCount: 400,
    shadowMapSize: 0,
    maxPixelRatio: 1,
    grain: 0.35,
    antialias: false,
  },
};

export const QUALITY_ORDER: QualityPreset[] = ['low', 'balanced', 'high'];

/** Hardware facts the detector reads; injectable so the choice is testable. */
export interface DeviceSignals {
  /** `navigator.hardwareConcurrency`, or null if unavailable. */
  cores: number | null;
  /** `navigator.deviceMemory` (GB), or null if unavailable. */
  deviceMemory: number | null;
  /** True for a phone/tablet user agent. */
  mobile: boolean;
  /** True when the WebGL renderer reports a software rasteriser. */
  softwareRenderer: boolean;
  /** Coarse pointer (finger) as the primary input. */
  touchPrimary: boolean;
}

/**
 * Picks a starting preset.
 *
 * Conservative on purpose: the first impression of a game is its frame rate, and
 * a player who can raise the preset in Settings is happier than one whose tablet
 * stutters until they find the option. A software rasteriser (SwiftShader) gets
 * `low` regardless of core count, because cores do not help a CPU rasteriser.
 */
export function choosePreset(signals: DeviceSignals): QualityPreset {
  if (signals.softwareRenderer) return 'low';

  const cores = signals.cores ?? 4;
  const memory = signals.deviceMemory;

  if (signals.mobile || signals.touchPrimary) {
    // A modern tablet (8+ cores, 8 GB) can hold `balanced`; a phone cannot.
    if (cores >= 8 && (memory === null || memory >= 6)) return 'balanced';
    return 'low';
  }

  if (cores <= 4 || (memory !== null && memory <= 4)) return 'balanced';
  return 'high';
}

/**
 * Next pixel ratio after a sustained slow period.
 *
 * `current` is the ratio in use; the result is never above the preset's ceiling
 * and never below the floor, so a device cannot be driven to a 1-pixel buffer by a
 * background tab that is throttled rather than slow.
 */
export function lowerPixelRatio(current: number, preset: QualitySettings): number {
  const floor = 0.7;
  const step = 0.25;
  const next = Math.min(current, preset.maxPixelRatio) - step;
  return Math.max(floor, Number(next.toFixed(2)));
}

/** Frame-time budget in ms for a 60 FPS target, with headroom for vsync jitter. */
export const FRAME_BUDGET_MS = 16.5;

/** How many consecutive slow frames trigger a resolution step down. */
export const SLOW_FRAMES_BEFORE_DOWNSCALE = 90;

export interface FrameSampler {
  /** Rolling mean frame time, ms. */
  mean: number;
  /** Consecutive frames above the budget. */
  slowRun: number;
  frames: number;
  /** Frames per second, smoothed. */
  fps: number;
}

export function createFrameSampler(): FrameSampler {
  return { mean: FRAME_BUDGET_MS, slowRun: 0, frames: 0, fps: 60 };
}

/**
 * Folds one frame's duration into the sampler.
 *
 * Exponential smoothing (0.1) so a single dropped frame does not step the
 * resolution down, and the slow-run counter requires ~1.5 s of sustained slowness
 * at 60 FPS before acting.
 */
export function sampleFrame(sampler: FrameSampler, frameMs: number): FrameSampler {
  const clamped = Math.min(frameMs, 250);
  const mean = sampler.mean * 0.9 + clamped * 0.1;
  const slow = clamped > FRAME_BUDGET_MS * 1.35;
  return {
    mean,
    slowRun: slow ? sampler.slowRun + 1 : 0,
    frames: sampler.frames + 1,
    fps: mean > 0 ? Math.min(240, 1000 / mean) : 0,
  };
}

export function shouldDownscale(sampler: FrameSampler): boolean {
  return sampler.slowRun >= SLOW_FRAMES_BEFORE_DOWNSCALE;
}
