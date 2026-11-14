/**
 * Bounded retry for one-shot network reads.
 *
 * The app talks to NASA, YouTube and Vercel from a browser, over mobile links and
 * cold serverless instances. A single failed request used to be permanent: the
 * tile said UNAVAILABLE, or the gallery said "check your connection", until the
 * viewer pressed Retry themselves. One silent second attempt turns almost all of
 * those transient failures back into data, and it is bounded so a genuinely down
 * service still ends in an honest error quickly.
 *
 * Rules kept here so they cannot drift per call site:
 * - the caller's abort is never retried (the page moved on; a retry would race it)
 * - attempts are counted, not timed, so the worst case is predictable
 * - the delay is fixed and short: a retry is a rescue, not a backoff loop
 */

export interface RetryPolicy {
  /** Total attempts, including the first one. */
  attempts: number;
  /** Wait before each retry; index 0 follows the first failure. */
  delaysMs: number[];
}

/** One extra attempt after ~0.9 s: enough for a cold start or a dropped packet. */
export const TRANSIENT_RETRY: RetryPolicy = { attempts: 2, delaysMs: [900] };

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

/** A caller abort is a decision, not a failure. */
export function isRetryable(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name !== 'AbortError';
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  run: (attempt: number) => Promise<T>,
  policy: RetryPolicy = TRANSIENT_RETRY,
  options: { signal?: AbortSignal; wait?: (ms: number) => Promise<void> } = {}
): Promise<T> {
  const attempts = Math.max(1, Math.floor(policy.attempts));
  const wait = options.wait ?? sleep;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (options.signal?.aborted) throw abortError();
    try {
      return await run(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || options.signal?.aborted || !isRetryable(error)) throw error;
      const delay = policy.delaysMs[attempt - 1] ?? policy.delaysMs[policy.delaysMs.length - 1] ?? 0;
      if (delay > 0) await wait(delay);
    }
  }
  throw lastError;
}
