/**
 * Fleet-wide circuit breaker.
 *
 * The orchestrator already has a per-process breaker
 * (`server/earth/providerOrchestrator.ts`, `circuits` Map). That is the right
 * tool for "this lambda has seen three failures in a row". It is *not* a fleet
 * breaker: on Vercel a hundred instances each need to see three failures before
 * any of them slows down, which is precisely the traffic surge a breaker exists
 * to prevent.
 *
 * This module keeps the state in the Guardian store, so any instance that can
 * reach the store sees the same state. Three rules make it safe to share:
 *
 *  1. **Fail open.** If the store cannot be reached, requests are allowed and
 *     the answer is marked `storeDegraded`. Blocking traffic because a monitor
 *     is unreachable is worse than not breaking the circuit.
 *  2. **One trial.** The transition open → half-open is a compare-and-set, so
 *     exactly one instance gets to try the provider; the rest keep the fast
 *     path until it reports back.
 *  3. **Cooldown with jitter.** The reopen delay is multiplied by
 *     1 + jitter·random, so a fleet that failed together does not retry together.
 */

import type { GuardianStore, ProbeOutcome } from './types';

export type BreakerStateName = 'closed' | 'open' | 'half-open';

export interface BreakerState {
  state: BreakerStateName;
  /** Consecutive `down` outcomes. */
  failures: number;
  /** Consecutive `degraded` outcomes, informational. */
  degradations: number;
  openedAt: number | null;
  cooldownUntil: number | null;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  lastCode: string | null;
  /** Version of the record this snapshot was read from. */
  version: number;
  updatedAt: number;
}

export interface BreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
  /** 0..1 fraction of cooldown added at random. */
  jitter: number;
  /** State record TTL; long enough that a quiet day does not erase a trip. */
  ttlMs: number;
}

export const DEFAULT_BREAKER_CONFIG: BreakerConfig = {
  failureThreshold: 3,
  cooldownMs: 60_000,
  jitter: 0.25,
  ttlMs: 24 * 60 * 60 * 1000,
};

export interface AllowDecision {
  allowed: boolean;
  state: BreakerStateName;
  /** Present when denied: when the next trial becomes possible. */
  retryAt?: number;
  /** True when this instance won the half-open trial. */
  trial?: boolean;
  /** True when the store failed and the decision was made without fleet state. */
  storeDegraded?: boolean;
}

export type BreakerRecordOutcome = ProbeOutcome | 'ok' | 'down' | 'degraded';

export interface Breaker {
  allow(providerId: string): Promise<AllowDecision>;
  record(providerId: string, outcome: BreakerRecordOutcome, code?: string): Promise<BreakerState | null>;
  /** Open immediately, regardless of the consecutive-failure counter. */
  trip(providerId: string, code?: string): Promise<BreakerState | null>;
  snapshot(providerId: string): Promise<BreakerState | null>;
  snapshotAll(providerIds: string[]): Promise<Record<string, BreakerState | null>>;
  reset(providerId: string): Promise<void>;
}

const CLOSED: Omit<BreakerState, 'version'> = {
  state: 'closed',
  failures: 0,
  degradations: 0,
  openedAt: null,
  cooldownUntil: null,
  lastFailureAt: null,
  lastSuccessAt: null,
  lastCode: null,
  updatedAt: 0,
};

const keyFor = (providerId: string) => `breaker:${providerId}`;

function cooldownWithJitter(config: BreakerConfig, random: () => number): number {
  const factor = 1 + config.jitter * random();
  return Math.round(config.cooldownMs * factor);
}

export function createBreaker(
  store: GuardianStore,
  options: {
    config?: Partial<BreakerConfig>;
    now?: () => number;
    random?: () => number;
    /** CAS attempts before giving up on a contended record. */
    maxCasAttempts?: number;
  } = {},
): Breaker {
  const config: BreakerConfig = { ...DEFAULT_BREAKER_CONFIG, ...options.config };
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const maxAttempts = Math.max(1, options.maxCasAttempts ?? 3);

  /** Read + mutate with CAS. Returns the new state, or the observed one on loss. */
  async function mutate(
    providerId: string,
    mutateFn: (current: Omit<BreakerState, 'version'>) => Omit<BreakerState, 'version'>,
  ): Promise<BreakerState | null> {
    const key = keyFor(providerId);
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const stored = await store.getJson<Omit<BreakerState, 'version'>>(key);
      const base = stored?.value ?? CLOSED;
      const at = now();
      const next = { ...mutateFn({ ...base, updatedAt: at }), updatedAt: at };
      const result = await store.compareAndSetJson(key, stored ? stored.version : null, next, {
        ttlMs: config.ttlMs,
      });
      if (result.ok) return { ...next, version: result.stored?.version ?? 0 };
      // Someone else wrote first: re-read and retry the mutation against fresh state.
    }
    const current = await store.getJson<Omit<BreakerState, 'version'>>(key);
    return current ? { ...current.value, version: current.version } : null;
  }

  async function allow(providerId: string): Promise<AllowDecision> {
    let stored: Awaited<ReturnType<typeof store.getJson<Omit<BreakerState, 'version'>>>> = null;
    try {
      stored = await store.getJson<Omit<BreakerState, 'version'>>(keyFor(providerId));
    } catch {
      // Fail open: no fleet state is better than no traffic.
      return { allowed: true, state: 'closed', storeDegraded: true };
    }
    if (!stored) return { allowed: true, state: 'closed' };

    const state = stored.value;
    const at = now();
    if (state.state === 'closed') return { allowed: true, state: 'closed' };

    if (state.state === 'open') {
      const retryAt = state.cooldownUntil ?? state.openedAt ?? at;
      if (at < retryAt) return { allowed: false, state: 'open', retryAt };
      // Cooldown elapsed: exactly one instance wins the transition to half-open.
      try {
        const won = await store.compareAndSetJson(
          keyFor(providerId),
          stored.version,
          { ...state, state: 'half-open', updatedAt: at },
          { ttlMs: config.ttlMs },
        );
        if (won.ok) return { allowed: true, state: 'half-open', trial: true };
        return { allowed: false, state: 'open', retryAt: at + Math.round(config.cooldownMs / 4) };
      } catch {
        return { allowed: true, state: 'open', storeDegraded: true };
      }
    }

    // half-open with no winner recorded yet is treated as "someone is trialling".
    return { allowed: false, state: 'half-open', retryAt: at + Math.round(config.cooldownMs / 4) };
  }

  async function record(
    providerId: string,
    outcome: BreakerRecordOutcome,
    explicitCode?: string,
  ): Promise<BreakerState | null> {
    const status =
      typeof outcome === 'string'
        ? outcome
        : outcome.status === 'ok'
          ? 'ok'
          : outcome.status === 'degraded'
            ? 'degraded'
            : 'down';
    const code = explicitCode ?? (typeof outcome === 'string' ? null : outcome.code) ?? null;

    try {
      return await mutate(providerId, (current) => {
        const at = now();
        if (status === 'ok') {
          return { ...current, ...CLOSED, lastSuccessAt: at, lastCode: code, updatedAt: at };
        }
        if (status === 'degraded') {
          return { ...current, degradations: current.degradations + 1, lastCode: code, updatedAt: at };
        }
        const failures = current.failures + 1;
        const shouldOpen = failures >= config.failureThreshold;
        return {
          ...current,
          failures,
          lastFailureAt: at,
          lastCode: code,
          state: shouldOpen ? 'open' : current.state === 'half-open' ? 'open' : current.state,
          openedAt: shouldOpen ? at : current.openedAt,
          cooldownUntil: shouldOpen ? at + cooldownWithJitter(config, random) : current.cooldownUntil,
          updatedAt: at,
        };
      });
    } catch {
      // Never let monitoring break the request path.
      return null;
    }
  }

  /**
   * Used after a failed recovery verification: a circuit that was just reset and
   * STILL fails should be open, not "closed with one failure" — otherwise the
   * operator's reset appears to have worked.
   */
  async function trip(providerId: string, code?: string): Promise<BreakerState | null> {
    try {
      return await mutate(providerId, (current) => {
        const at = now();
        return {
          ...current,
          state: 'open',
          failures: Math.max(current.failures, config.failureThreshold),
          openedAt: at,
          cooldownUntil: at + cooldownWithJitter(config, random),
          lastFailureAt: at,
          lastCode: code ?? current.lastCode,
          updatedAt: at,
        };
      });
    } catch {
      return null;
    }
  }

  async function snapshot(providerId: string): Promise<BreakerState | null> {
    try {
      const stored = await store.getJson<Omit<BreakerState, 'version'>>(keyFor(providerId));
      if (!stored) return null;
      return { ...stored.value, version: stored.version };
    } catch {
      return null;
    }
  }

  async function snapshotAll(providerIds: string[]): Promise<Record<string, BreakerState | null>> {
    const entries = await Promise.all(providerIds.map(async (id) => [id, await snapshot(id)] as const));
    return Object.fromEntries(entries);
  }

  async function reset(providerId: string): Promise<void> {
    await store.setJson(keyFor(providerId), { ...CLOSED, updatedAt: now() }, { ttlMs: config.ttlMs });
  }

  return { allow, record, trip, snapshot, snapshotAll, reset };
}

/** Human-readable, credential-free description of a breaker state. */
export function describeBreaker(state: BreakerState | null): string {
  if (!state) return 'not yet observed';
  if (state.state === 'closed') return `closed (${state.failures} consecutive failures)`;
  if (state.state === 'half-open') return 'half-open — one trial in progress';
  const retryAt = state.cooldownUntil ?? state.openedAt ?? 0;
  return `open until ${new Date(retryAt).toISOString()}`;
}
