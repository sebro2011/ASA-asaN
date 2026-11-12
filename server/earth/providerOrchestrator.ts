/**
 * AI provider orchestration for the Earth Science Analyst.
 *
 * The analyst used to call Gemini once and, on any failure, hand the raw error to
 * the browser. A 503 from Google is *temporary* — retrying it, then moving to a
 * provider whose key is already configured, is the difference between "the
 * analyst is broken" and "the analyst answered". Nothing here invents a result:
 * if every remote provider refuses, the deterministic local engine answers and
 * the response says so.
 *
 * Rules encoded below:
 *  - retry only transient failures (429, 500, 502, 503, 504, timeouts, network),
 *    never auth/config errors (400, 401, 403, 404, 422) — retrying those is just
 *    a slower way to fail;
 *  - exponential backoff with jitter, capped attempts, and a hard deadline;
 *  - a provider that keeps failing is skipped for a cooldown (circuit breaker)
 *    so one dead provider does not add latency to every later request;
 *  - every provider call is bounded by a timeout and honours the caller's abort;
 *  - identical in-flight requests share one execution (duplicate protection);
 *  - the metadata records who answered, which model, how many attempts, whether
 *    a fallback happened, and the timestamp — never a key.
 */

export type ProviderId = 'gemini' | 'openrouter' | 'arena' | 'forge';

export type ExecutionMode = 'remote' | 'local';

export interface ProviderChainEntry {
  provider: ProviderId;
  model?: string;
  outcome: 'ok' | 'error' | 'skipped';
  code?: string;
  status?: number;
  attempts: number;
  ms: number;
  reason?: string;
}

export interface AnalystMetadata {
  mode: ExecutionMode;
  provider: ProviderId | 'local';
  providerLabel: string;
  model?: string;
  attempts: number;
  retries: number;
  fallback: boolean;
  fallbackReason?: string;
  providerChain: ProviderChainEntry[];
  generatedAt: string;
  deduped: boolean;
  durationMs: number;
  noticeCode?: AnalystNoticeCode;
}

export type AnalystNoticeCode =
  | 'primary-unavailable'
  | 'all-providers-unavailable'
  | 'local-mode'
  | 'model-response-unusable'
  | 'no-observations';

export class ProviderError extends Error {
  status?: number;
  code: string;
  retryable: boolean;
  retryAfterMs?: number;

  constructor(message: string, options: { status?: number; code?: string; retryable?: boolean; retryAfterMs?: number } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = options.status;
    this.code = options.code || (options.status ? classifyStatus(options.status).code : 'PROVIDER_ERROR');
    this.retryable = options.retryable ?? classifyStatus(options.status).retryable;
    this.retryAfterMs = options.retryAfterMs;
  }
}

/**
 * Transient = "try again". Permanent = "this request will never succeed".
 * An unknown status is treated as permanent: retrying an unexplained 4xx three
 * times only makes the user wait longer for the same answer.
 */
export function classifyStatus(status?: number): { retryable: boolean; code: string } {
  if (!status) return { retryable: true, code: 'NETWORK_ERROR' };
  if (status === 429) return { retryable: true, code: 'RATE_LIMITED' };
  if (status === 408 || status === 504) return { retryable: true, code: 'TIMEOUT' };
  if (status >= 500 && status <= 599) return { retryable: true, code: 'PROVIDER_UNAVAILABLE' };
  if (status === 401 || status === 403) return { retryable: false, code: 'AUTH_ERROR' };
  if (status === 404) return { retryable: false, code: 'MODEL_NOT_FOUND' };
  if (status === 400 || status === 422) return { retryable: false, code: 'BAD_REQUEST' };
  if (status === 402) return { retryable: false, code: 'CREDIT_REQUIRED' };
  return { retryable: false, code: 'PROVIDER_ERROR' };
}

export interface ProviderGenerateArgs {
  question: string;
  context: unknown;
  lang: string;
  signal: AbortSignal;
  timeoutMs: number;
}

export interface ProviderAdapter {
  id: ProviderId;
  label: string;
  model: string;
  isConfigured(): boolean;
  /** Returns the raw model text; must throw ProviderError on failure. */
  generate(args: ProviderGenerateArgs): Promise<string>;
}

export interface OrchestratorOptions {
  providers: ProviderAdapter[];
  /** Max attempts per provider, including the first. */
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Whole-run deadline across providers. */
  deadlineMs?: number;
  /** Consecutive failures before a provider is skipped. */
  circuitFailureThreshold?: number;
  /** How long a tripped circuit stays open. */
  circuitCooldownMs?: number;
  /** Parses provider text into the analyst payload; throw to reject. */
  parseAnswer: (text: string, context: unknown) => unknown;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  log?: (event: Record<string, unknown>) => void;
}

export interface OrchestratorRun<T = unknown> {
  ok: boolean;
  answer: T | null;
  metadata: AnalystMetadata;
  /** Provider text that failed to parse, kept server-side for logging only. */
  unparsable?: { provider: ProviderId; model?: string };
}

const DEFAULTS = {
  maxAttempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 3_000,
  timeoutMs: 12_000,
  deadlineMs: 30_000,
  circuitFailureThreshold: 3,
  circuitCooldownMs: 60_000,
};

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ProviderError('aborted', { code: 'ABORTED', retryable: false }));
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new ProviderError('aborted', { code: 'ABORTED', retryable: false }));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
    };
    signal?.addEventListener?.('abort', onAbort);
  });
}

export function createOrchestrator(options: OrchestratorOptions) {
  const config = { ...DEFAULTS, ...options };
  const now = options.now || Date.now;
  const sleep = options.sleep || abortableSleep;
  const random = options.random || Math.random;
  const log = options.log || (() => {});

  /** providerId → { failures, openedAt } */
  const circuits = new Map<string, { failures: number; openedAt: number }>();
  const inFlight = new Map<string, Promise<OrchestratorRun>>();

  function circuitFor(id: ProviderId, at: number) {
    const entry = circuits.get(id);
    if (!entry) return { open: false, failures: 0 };
    if (entry.failures < config.circuitFailureThreshold) return { open: false, failures: entry.failures };
    const open = at - entry.openedAt < config.circuitCooldownMs;
    return { open, failures: entry.failures };
  }

  function recordFailure(id: ProviderId, at: number) {
    const entry = circuits.get(id) || { failures: 0, openedAt: 0 };
    const failures = entry.failures + 1;
    circuits.set(id, { failures, openedAt: failures >= config.circuitFailureThreshold ? at : entry.openedAt });
  }

  function recordSuccess(id: ProviderId) {
    circuits.delete(id);
  }

  /** Exponential backoff with jitter: base·2^n, ±40 %, capped. */
  function backoffMs(attempt: number): number {
    const exponential = Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** (attempt - 1));
    const jitter = 0.6 + random() * 0.8; // 0.6× – 1.4×
    return Math.round(Math.min(config.maxDelayMs, exponential * jitter));
  }

  async function callProvider(
    provider: ProviderAdapter,
    args: Omit<ProviderGenerateArgs, 'signal' | 'timeoutMs'>,
    outerSignal: AbortSignal,
    deadline: number,
    runStartedAt: number,
  ): Promise<{ text: string | null; entry: ProviderChainEntry; error?: ProviderError }> {
    const started = now();
    let attempts = 0;
    let lastError: ProviderError | undefined;

    while (attempts < config.maxAttempts) {
      if (outerSignal.aborted) {
        lastError = new ProviderError('aborted by caller', { code: 'ABORTED', retryable: false });
        break;
      }
      if (now() >= deadline) {
        lastError = new ProviderError('analysis deadline exceeded', { code: 'DEADLINE_EXCEEDED', retryable: false });
        break;
      }
      attempts += 1;

      const controller = new AbortController();
      const onOuterAbort = () => controller.abort();
      outerSignal.addEventListener?.('abort', onOuterAbort);
      const remaining = Math.max(1, Math.min(config.timeoutMs, deadline - now()));
      const timer = setTimeout(() => controller.abort(), remaining);

      let attemptTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Bound the attempt here as well as inside the adapter: a provider call
        // that ignores its abort signal must still not hold the request open.
        const guard = new Promise<never>((_, reject) => {
          attemptTimer = setTimeout(
            () => reject(new ProviderError(`${provider.id} exceeded ${remaining} ms`, { code: 'TIMEOUT', retryable: true })),
            remaining
          );
        });
        const text = await Promise.race([
          provider.generate({ ...args, signal: controller.signal, timeoutMs: remaining }),
          guard
        ]);
        return {
          text,
          entry: { provider: provider.id, model: provider.model, outcome: 'ok', attempts, ms: now() - started },
        };
      } catch (error) {
        const failure =
          error instanceof ProviderError
            ? error
            : new ProviderError((error as Error)?.message || 'provider call failed', {
                code: (error as Error)?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
                retryable: true,
              });
        if (failure.code === 'ABORTED') {
          lastError = failure;
          break;
        }
        lastError = failure;
        log({
          event: 'earth.analyst.provider.attempt',
          provider: provider.id,
          model: provider.model,
          attempt: attempts,
          code: failure.code,
          status: failure.status,
          retryable: failure.retryable,
          ms: now() - started,
          sinceStartMs: now() - runStartedAt,
        });
        if (!failure.retryable) break;
        if (attempts >= config.maxAttempts) break;
        const delay = Math.max(failure.retryAfterMs ?? 0, backoffMs(attempts));
        try {
          await sleep(Math.min(delay, Math.max(0, deadline - now())), outerSignal);
        } catch {
          lastError = new ProviderError('aborted while backing off', { code: 'ABORTED', retryable: false });
          break;
        }
      } finally {
        if (attemptTimer) clearTimeout(attemptTimer);
        clearTimeout(timer);
        outerSignal.removeEventListener?.('abort', onOuterAbort);
      }
    }

    return {
      text: null,
      error: lastError,
      entry: {
        provider: provider.id,
        model: provider.model,
        outcome: 'error',
        code: lastError?.code,
        status: lastError?.status,
        attempts,
        ms: now() - started,
        reason: lastError?.message ? String(lastError.message).slice(0, 180) : undefined,
      },
    };
  }

  async function runOnce(args: { question: string; context: unknown; lang: string; signal?: AbortSignal }): Promise<OrchestratorRun> {
    const runStartedAt = now();
    const deadline = runStartedAt + config.deadlineMs;
    const controller = new AbortController();
    const outer = args.signal;
    const onAbort = () => controller.abort();
    outer?.addEventListener?.('abort', onAbort);

    const chain: ProviderChainEntry[] = [];
    let retries = 0;
    let attempts = 0;

    try {
      for (const provider of config.providers) {
        if (!provider.isConfigured()) {
          chain.push({ provider: provider.id, model: provider.model, outcome: 'skipped', attempts: 0, ms: 0, code: 'NOT_CONFIGURED' });
          continue;
        }
        const circuit = circuitFor(provider.id, now());
        if (circuit.open) {
          chain.push({ provider: provider.id, model: provider.model, outcome: 'skipped', attempts: 0, ms: 0, code: 'CIRCUIT_OPEN' });
          log({ event: 'earth.analyst.provider.skipped', provider: provider.id, reason: 'circuit-open', failures: circuit.failures });
          continue;
        }
        if (controller.signal.aborted) break;
        if (now() >= deadline) break;

        const result = await callProvider(
          provider,
          { question: args.question, context: args.context, lang: args.lang },
          controller.signal,
          deadline,
          runStartedAt,
        );
        attempts += result.entry.attempts;
        retries += Math.max(0, result.entry.attempts - 1);
        chain.push(result.entry);

        if (result.text !== null) {
          recordSuccess(provider.id);
          const parsed = parseSafely((text) => config.parseAnswer(text, args.context), result.text);
          if (parsed.ok) {
            const failedBefore = chain.filter((entry) => entry.outcome === 'error');
            return {
              ok: true,
              answer: parsed.value,
              metadata: {
                mode: 'remote',
                provider: provider.id,
                providerLabel: provider.label,
                model: provider.model,
                attempts,
                retries,
                fallback: failedBefore.length > 0,
                fallbackReason: failedBefore[0]?.code,
                providerChain: chain,
                generatedAt: new Date(now()).toISOString(),
                deduped: false,
                durationMs: now() - runStartedAt,
                noticeCode: failedBefore.length ? 'primary-unavailable' : undefined,
              },
            };
          }
          // A model that answers with something we cannot read is a provider
          // failure, not a reason to show raw text to the user.
          log({ event: 'earth.analyst.provider.unparsable', provider: provider.id, model: provider.model });
          chain[chain.length - 1] = { ...result.entry, outcome: 'error', code: 'UNPARSABLE_RESPONSE' };
          recordFailure(provider.id, now());
          continue;
        }

        recordFailure(provider.id, now());
      }
    } finally {
      outer?.removeEventListener?.('abort', onAbort);
    }

    const attempted = chain.filter((entry) => entry.outcome !== 'skipped');
    const allConfiguredFailed = attempted.length > 0;
    return {
      ok: false,
      answer: null,
      metadata: {
        mode: 'local',
        provider: 'local',
        providerLabel: 'Local Earth Intelligence',
        attempts,
        retries,
        fallback: true,
        fallbackReason: chain.find((entry) => entry.outcome === 'error')?.code || 'NO_PROVIDER_CONFIGURED',
        providerChain: chain,
        generatedAt: new Date(now()).toISOString(),
        deduped: false,
        durationMs: now() - runStartedAt,
        noticeCode: allConfiguredFailed ? 'all-providers-unavailable' : undefined,
      },
    };
  }

  function parseSafely(parse: (text: string) => unknown, text: string): { ok: true; value: unknown } | { ok: false } {
    try {
      const value = parse(text);
      if (value === null || value === undefined) return { ok: false };
      return { ok: true, value };
    } catch {
      return { ok: false };
    }
  }

  return {
    /** Runs the chain. Identical concurrent requests share one execution. */
    async run(args: {
      question: string;
      context: unknown;
      lang: string;
      signal?: AbortSignal;
      dedupeKey?: string;
    }): Promise<OrchestratorRun> {
      const key = args.dedupeKey;
      if (!key) return runOnce(args);

      const existing = inFlight.get(key);
      if (existing) {
        const shared = await existing;
        return {
          ...shared,
          metadata: { ...shared.metadata, deduped: true },
        };
      }

      const promise = runOnce(args).finally(() => inFlight.delete(key));
      inFlight.set(key, promise);
      return promise;
    },
    /**
     * Provider health as this process currently sees it: configuration plus the
     * breaker state, i.e. providers that recently failed hard. This is a *cheap*
     * check — it never spends a provider request just to look healthy.
     */
    health() {
      return config.providers.map((provider) => {
        const circuit = circuitFor(provider.id, now());
        return {
          provider: provider.id,
          label: provider.label,
          model: provider.model,
          configured: provider.isConfigured(),
          state: !provider.isConfigured() ? ('unconfigured' as const) : circuit.open ? ('open' as const) : ('closed' as const),
          consecutiveFailures: circuit.failures,
        };
      });
    },
    /** Test seam: clears circuit state and in-flight bookkeeping. */
    reset() {
      circuits.clear();
      inFlight.clear();
    },
  };
}
