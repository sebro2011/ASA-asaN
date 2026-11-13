/**
 * A bounded, TTL cache for upstream responses.
 *
 * Three NASA proxies re-hit their upstream on every request, which spends the
 * shared DEMO_KEY quota (25 requests/hour) on identical answers. This is the
 * minimum machinery that fixes that without a dependency:
 *
 * - **TTL per cache**, because the upstream data has different lifetimes: EPIC
 *   publishes a few frames a day, NeoWs once a day, the Exoplanet Archive
 *   essentially never.
 * - **Bounded**, because an unbounded map is a memory leak with a nice name.
 *   Least-recently-stored entries are evicted first.
 * - **No background timer.** Expiry is checked on read; a serverless function
 *   that is idle should not hold a timer open.
 * - **No stale-while-error.** An expired entry is gone: the route then reports
 *   the upstream failure instead of serving yesterday's numbers as today's.
 */

export interface TtlCacheOptions {
  /** How long a stored value stays valid. */
  ttlMs: number;
  /** Hard ceiling on entries. Oldest-stored are evicted first. */
  maxEntries?: number;
  /** Injectable clock, so expiry can be tested without waiting. */
  now?: () => number;
}

export interface TtlHit<T> {
  value: T;
  /** When the value was stored (ms since epoch). */
  storedAt: number;
  /** Milliseconds the entry has been stored. */
  ageMs: number;
  /** Milliseconds of validity remaining. */
  remainingMs: number;
}

export interface TtlCache<T> {
  get(key: string): TtlHit<T> | null;
  /**
   * Stores a value and returns the timestamp it was stored at, so a response can
   * report exactly the time the entry holds instead of reading the clock twice.
   * `storedAt` exists so tests can create an aged entry.
   */
  set(key: string, value: T, storedAt?: number): number;
  delete(key: string): void;
  clear(): void;
  readonly size: number;
  readonly ttlMs: number;
  readonly maxEntries: number;
}

export function createTtlCache<T>(options: TtlCacheOptions): TtlCache<T> {
  const { ttlMs, maxEntries = 100 } = options;
  const now = options.now || Date.now;
  const entries = new Map<string, { value: T; storedAt: number }>();

  return {
    ttlMs,
    maxEntries,

    get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      const ageMs = now() - entry.storedAt;
      if (ageMs >= ttlMs) {
        // Expired entries are removed, not retained as "stale but usable":
        // no caller here is allowed to present old data as current.
        entries.delete(key);
        return null;
      }
      return {
        value: entry.value,
        storedAt: entry.storedAt,
        ageMs: Math.max(0, ageMs),
        remainingMs: Math.max(0, ttlMs - ageMs),
      };
    },

    set(key, value, storedAt) {
      if (entries.has(key)) entries.delete(key);
      const stampedAt = storedAt ?? now();
      entries.set(key, { value, storedAt: stampedAt });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      return stampedAt;
    },

    delete(key) {
      entries.delete(key);
    },

    clear() {
      entries.clear();
    },

    get size() {
      return entries.size;
    },
  };
}

/** Seconds, for a `Cache-Control: max-age` header. Never negative. */
export function maxAgeSeconds(remainingMs: number): number {
  return Math.max(0, Math.floor(remainingMs / 1000));
}
