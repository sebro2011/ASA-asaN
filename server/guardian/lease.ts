/**
 * Distributed lease — "only one instance runs the sweep".
 *
 * Scheduled monitoring is the classic serverless stampede: Vercel cron (or two
 * overlapping invocations, or a retry) can start several sweeps at once, and a
 * sweep is exactly the moment the fleet should be *cheapest*, not most expensive.
 *
 * The lease is a TTL record in the store with an owner id. Correctness depends on
 * the store providing an atomic acquire — Postgres does (row-level), memory does
 * within one process. When the store cannot promise atomicity the lease still
 * runs, but `capabilities.atomicLease` is false and the dashboard says so.
 *
 * Renewal: the holder extends its own lease every `ttl/3` while working. If the
 * renewal fails (store outage or takeover), the work is told through
 * `onLeaseLost` so it can stop early instead of writing over the new holder.
 */

import type { GuardianStore } from './types';

export interface LeaseOutcome<T> {
  acquired: boolean;
  /** Present when acquired. */
  value?: T;
  holder?: string | null;
}

export interface LeaseOptions {
  key: string;
  owner: string;
  ttlMs: number;
  /** Numbers of ms between renewals; defaults to ttl/3. */
  renewEveryMs?: number;
  onLeaseLost?: () => void;
}

export interface LeaseHandle {
  renew(): Promise<boolean>;
  release(): Promise<void>;
}

export async function acquireLease(
  store: GuardianStore,
  { key, owner, ttlMs }: LeaseOptions,
): Promise<LeaseHandle | null> {
  const acquired = await store.acquireLease(key, owner, ttlMs);
  if (!acquired) return null;
  return {
    renew: () => store.renewLease(key, owner, ttlMs),
    release: () => store.releaseLease(key, owner),
  };
}

/**
 * Runs `work` while holding the lease, or returns `{ acquired: false }` without
 * calling it. The lease is always released, including on throw.
 */
export async function withLease<T>(
  store: GuardianStore,
  options: LeaseOptions,
  work: (handle: LeaseHandle) => Promise<T>,
): Promise<LeaseOutcome<T>> {
  const handle = await acquireLease(store, options);
  if (!handle) {
    const holder = await store.leaseHolder(options.key).catch(() => null);
    return { acquired: false, holder: holder?.owner ?? null };
  }

  const renewEveryMs = Math.max(1_000, options.renewEveryMs ?? Math.floor(options.ttlMs / 3));
  let lost = false;
  const timer = setInterval(() => {
    void handle
      .renew()
      .then((ok) => {
        if (!ok && !lost) {
          lost = true;
          options.onLeaseLost?.();
        }
      })
      .catch(() => {
        if (!lost) {
          lost = true;
          options.onLeaseLost?.();
        }
      });
  }, renewEveryMs);
  // Do not keep the process alive just for a heartbeat.
  if (typeof timer.unref === 'function') timer.unref();

  try {
    const value = await work(handle);
    return { acquired: true, value };
  } finally {
    clearInterval(timer);
    await handle.release().catch(() => {});
  }
}

export function newInstanceId(prefix = 'gdn'): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
