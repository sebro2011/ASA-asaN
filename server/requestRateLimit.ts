/**
 * Per-instance request rate limiting for the Express API.
 *
 * This is the *coarse* limiter: it protects one process from one abusive client.
 * It is deliberately not distributed — fleet-wide budgets belong to
 * `server/guardian/rateLimit.ts`, which stores its counters in Postgres. Keeping
 * the two separate means the cheap, always-on path never needs a network round
 * trip.
 *
 * Two properties matter for a long-running container:
 *
 * 1. **Bounded memory.** The previous implementation kept every client it had
 *    ever seen in one module-level `Map`, forever. A client rotating through
 *    IPv6 addresses could therefore grow it without limit — a slow memory leak
 *    that is also a denial-of-service vector. Each limiter now owns its own map
 *    and prunes expired entries once the map crosses a threshold, with a hard
 *    cap as a final backstop.
 * 2. **One map per limiter.** Sharing a single map across limiters made the
 *    prune window ambiguous (every entry would have to carry its own window),
 *    and it coupled unrelated routes: a burst on `/api/mars` could evict
 *    `/api/community` state.
 */

export type RateEntry = { count: number; windowStart: number };

/** Above this many tracked clients, expired entries are swept on the next call. */
export const RATE_PRUNE_THRESHOLD = 5_000;

/** Absolute ceiling. Reached only when the threshold sweep freed nothing. */
export const RATE_MAX_ENTRIES = 10_000;

export interface RateLimitOptions {
  /** Window length in milliseconds. A window starts at the first request. */
  windowMs: number;
  /** Requests allowed per window, per key. The (max + 1)th gets a 429. */
  max: number;
  /** Namespace, so two routes never share a bucket for the same client. */
  keyPrefix: string;
  /** Return true to let a request through without counting it. */
  skip?: (req: RateLimitedRequest) => boolean;
  /** Wire code returned on 429. */
  code?: string;
  message?: string;
}

export interface RateLimitedRequest {
  ip?: string;
  socket?: { remoteAddress?: string };
  path?: string;
  headers?: Record<string, unknown>;
  method?: string;
}

export interface RateLimitedResponse {
  setHeader(name: string, value: string): unknown;
  status(code: number): { json(body: unknown): unknown };
}

export interface RateLimitStore {
  readonly entries: Map<string, RateEntry>;
  /** Number of tracked clients — used by tests and by the prune assertions. */
  size(): number;
}

/**
 * Removes entries whose window has already elapsed. Exported so a test can
 * assert eviction without timing a real request stream.
 */
export function pruneRateEntries(
  entries: Map<string, RateEntry>,
  windowMs: number,
  now: number,
): number {
  let removed = 0;
  for (const [key, entry] of entries) {
    if (now - entry.windowStart >= windowMs) {
      entries.delete(key);
      removed += 1;
    }
  }
  return removed;
}

/** Drops the oldest windows until the map is back under the hard cap. */
function enforceCap(entries: Map<string, RateEntry>): void {
  if (entries.size <= RATE_MAX_ENTRIES) return;
  const ordered = [...entries.entries()].sort((a, b) => a[1].windowStart - b[1].windowStart);
  const excess = entries.size - RATE_MAX_ENTRIES;
  for (let index = 0; index < excess; index += 1) {
    entries.delete(ordered[index][0]);
  }
}

/** Key for a request: the resolved client address, never a header read directly. */
export function clientKey(req: RateLimitedRequest): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export interface RateLimiter {
  (req: RateLimitedRequest, res: RateLimitedResponse, next: () => void): unknown;
  /** The limiter's own store, for diagnostics and tests. */
  store: RateLimitStore;
}

/**
 * Builds a limiter. Create it **once** per route family and reuse the returned
 * function: a limiter created inside a request handler would start with an empty
 * bucket every time and therefore never limit anything.
 */
export function createRateLimiter(options: RateLimitOptions, now: () => number = Date.now): RateLimiter {
  const entries = new Map<string, RateEntry>();

  const limiter = ((req: RateLimitedRequest, res: RateLimitedResponse, next: () => void) => {
    if (options.skip?.(req)) return next();

    const current = now();
    if (entries.size >= RATE_PRUNE_THRESHOLD) {
      pruneRateEntries(entries, options.windowMs, current);
      enforceCap(entries);
    }

    const key = `${options.keyPrefix}:${clientKey(req)}`;
    const entry = entries.get(key) || { count: 0, windowStart: current };
    if (current - entry.windowStart >= options.windowMs) {
      entry.count = 0;
      entry.windowStart = current;
    }
    entry.count += 1;
    entries.set(key, entry);

    const resetSeconds = Math.ceil((entry.windowStart + options.windowMs - current) / 1000);
    res.setHeader('X-RateLimit-Limit', String(options.max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.max - entry.count)));
    res.setHeader('X-RateLimit-Reset', String(resetSeconds));

    if (entry.count > options.max) {
      // Retry-After is what lets a client wait instead of hammering; the NOVA
      // chat handler already sends it, and one endpoint must not answer 429 two
      // different ways.
      res.setHeader('Retry-After', String(Math.max(1, resetSeconds)));
      res.status(429).json({
        error: options.message || 'Too many requests. Please wait before trying again.',
        code: options.code || 'rate-limit',
      });
      return undefined;
    }

    return next();
  }) as RateLimiter;

  limiter.store = { entries, size: () => entries.size };

  return limiter;
}
