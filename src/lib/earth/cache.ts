/**
 * Small provenance-aware cache for Earth Intelligence Lab requests.
 *
 * Two layers:
 *  1. an in-memory map (per tab session), and
 *  2. `localStorage` with a TTL, so returning to the Lab does not re-download
 *     imagery metadata or climate archives.
 *
 * Cache hits are reported to the UI as `status: 'cached'` with the *original*
 * retrieval timestamp preserved — a cached value is never presented as a live
 * observation.
 */

const PREFIX = 'earth_intel_cache_v1:';

interface Envelope<T> {
  storedAt: number;
  ttlMs: number;
  value: T;
}

const memory = new Map<string, Envelope<unknown>>();

function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

export interface CacheHit<T> {
  value: T;
  storedAt: string;
  ageMs: number;
}

export function cacheGet<T>(key: string): CacheHit<T> | null {
  const now = Date.now();
  const inMemory = memory.get(key) as Envelope<T> | undefined;
  if (inMemory) {
    if (now - inMemory.storedAt <= inMemory.ttlMs) {
      return { value: inMemory.value, storedAt: new Date(inMemory.storedAt).toISOString(), ageMs: now - inMemory.storedAt };
    }
    memory.delete(key);
  }

  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (!parsed || typeof parsed.storedAt !== 'number' || now - parsed.storedAt > parsed.ttlMs) {
      window.localStorage.removeItem(PREFIX + key);
      return null;
    }
    memory.set(key, parsed);
    return { value: parsed.value, storedAt: new Date(parsed.storedAt).toISOString(), ageMs: now - parsed.storedAt };
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  const envelope: Envelope<T> = { storedAt: Date.now(), ttlMs, value };
  memory.set(key, envelope);
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(envelope));
  } catch {
    /* quota exceeded / private mode — memory cache still applies */
  }
}

export function cacheClear(prefix = ''): void {
  for (const key of [...memory.keys()]) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
  if (!canUseStorage()) return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith(PREFIX + prefix)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

/** TTL policy per data family. */
export const TTL = {
  /** Observation-date domains change slowly. */
  domain: 6 * HOUR,
  /** Tile service probes are cheap but should not repeat constantly. */
  probe: 30 * 60 * 1000,
  /** POWER monthly archives update roughly daily. */
  power: 12 * HOUR,
  /** Place search results. */
  geocode: 7 * DAY
} as const;
