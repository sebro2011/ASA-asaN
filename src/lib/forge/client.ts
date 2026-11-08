/**
 * NOVA HYPOTHESIS FORGE — browser client.
 *
 * Thin typed transport for the Forge API. It never contains a key, never
 * retries silently against another provider, and surfaces the server's own
 * error code so the UI can say what actually happened.
 */

import type { DatasetDescriptor, Hypothesis, Investigation, LanguageCode, ResearchPlan, ResearchRequest } from './types';

export type ForgeErrorCode =
  | 'INVALID_REQUEST'
  | 'QUESTION_TOO_LONG'
  | 'RATE_LIMITED'
  | 'SOURCE_UNAVAILABLE'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'INTERNAL_ERROR'
  | 'UNKNOWN';

export type ForgeResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ForgeErrorCode; message: string; retryAfter?: number };

export interface ForgeCatalogue {
  datasets: DatasetDescriptor[];
  capabilities: {
    nasaKey: 'key' | 'demo' | 'none';
    noaaKeyless: true;
    liveInvestigation: boolean;
    engine: string;
  };
}

const MAX_QUESTION_CHARS = 1200;
const DEFAULT_TIMEOUT_MS = 45_000;

function normaliseCode(code: unknown, status?: number): ForgeErrorCode {
  const known = new Set<ForgeErrorCode>([
    'INVALID_REQUEST',
    'QUESTION_TOO_LONG',
    'RATE_LIMITED',
    'SOURCE_UNAVAILABLE',
    'NETWORK',
    'TIMEOUT',
    'INTERNAL_ERROR',
    'UNKNOWN',
  ]);
  if (typeof code === 'string' && known.has(code as ForgeErrorCode)) return code as ForgeErrorCode;
  if (status === 400) return 'INVALID_REQUEST';
  if (status === 413) return 'QUESTION_TOO_LONG';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 504) return 'TIMEOUT';
  return 'UNKNOWN';
}

async function post<T>(path: string, body: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ForgeResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      return {
        ok: false,
        code: normaliseCode(payload?.code, response.status),
        message: typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`,
        retryAfter: Number(response.headers.get('Retry-After')) || undefined,
      };
    }
    if (!payload || payload.ok !== true) {
      return { ok: false, code: 'UNKNOWN', message: 'Unexpected response shape.' };
    }
    return { ok: true, data: payload as unknown as T };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      code: aborted ? 'TIMEOUT' : 'NETWORK',
      message: aborted ? 'The investigation took too long.' : 'Could not reach the investigation service.',
    };
  } finally {
    clearTimeout(timer);
  }
}

function validateQuestion(question: string): string | null {
  const trimmed = question.trim();
  if (trimmed.length < 8) return 'Ask a fuller research question (at least 8 characters).';
  if (trimmed.length > MAX_QUESTION_CHARS) return 'That question is too long. Shorten it and retry.';
  return null;
}

export interface InterpretPayload {
  request: ResearchRequest;
  hypotheses: Hypothesis[];
  plan: ResearchPlan;
}

export interface InvestigatePayload {
  investigation: Investigation;
}

export async function fetchCatalogue(): Promise<ForgeResult<ForgeCatalogue>> {
  try {
    const response = await fetch('/api/forge/catalogue', { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      return { ok: false, code: normaliseCode(undefined, response.status), message: `HTTP ${response.status}` };
    }
    const payload = (await response.json()) as { ok?: boolean; datasets?: DatasetDescriptor[]; capabilities?: ForgeCatalogue['capabilities'] };
    if (!payload?.ok || !Array.isArray(payload.datasets)) {
      return { ok: false, code: 'UNKNOWN', message: 'Unexpected catalogue response.' };
    }
    return {
      ok: true,
      data: {
        datasets: payload.datasets,
        capabilities:
          payload.capabilities ?? {
            nasaKey: 'none',
            noaaKeyless: true,
            liveInvestigation: false,
            engine: 'unknown',
          },
      },
    };
  } catch {
    return { ok: false, code: 'NETWORK', message: 'Could not reach the investigation service.' };
  }
}

export async function interpretResearch(
  question: string,
  language?: LanguageCode,
  context?: ResearchRequest | null,
): Promise<ForgeResult<InterpretPayload>> {
  const problem = validateQuestion(question);
  if (problem) return { ok: false, code: 'INVALID_REQUEST', message: problem };
  return post<InterpretPayload>('/api/forge/interpret', {
    question: question.trim(),
    language,
    context: context ?? undefined,
  });
}

export async function runInvestigation(
  question: string,
  options: { language?: LanguageCode; context?: ResearchRequest | null; hypothesisId?: string } = {},
): Promise<ForgeResult<InvestigatePayload>> {
  const problem = validateQuestion(question);
  if (problem) return { ok: false, code: 'INVALID_REQUEST', message: problem };
  return post<InvestigatePayload>(
    '/api/forge/investigate',
    {
      question: question.trim(),
      language: options.language,
      context: options.context ?? undefined,
      hypothesisId: options.hypothesisId,
    },
    DEFAULT_TIMEOUT_MS,
  );
}
