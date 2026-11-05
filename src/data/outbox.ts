/**
 * Durable outbox for cloud writes.
 *
 * Every mutation is written locally first (so the UI is instant and offline-safe)
 * and queued here. The sync engine drains the queue towards Supabase; entries are
 * removed only after the server confirms them, so a crash or a lost connection
 * can never silently drop a change.
 *
 * Key facts:
 *   * one entry per (table, id) — a newer local edit replaces the older one, which
 *     is what "last write wins on this device" means;
 *   * rows carry a client-generated primary key, so replaying an entry is an
 *     idempotent upsert rather than a duplicate row;
 *   * the queue is capped (oldest dropped, counted) so it cannot fill storage.
 */
import type { SyncTable } from './types';

export type OutboxOperation = 'upsert' | 'delete';

export interface OutboxEntry {
  /** `${table}:${id}` — the dedupe key. */
  key: string;
  table: SyncTable;
  id: string;
  operation: OutboxOperation;
  payload: Record<string, unknown> | null;
  /** `updated_at` of the row this edit was based on (null for a new row). */
  baseUpdatedAt: string | null;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  deadLettered: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const OUTBOX_KEY = 'nova_sync_outbox_v1';
export const OUTBOX_CAP = 400;
export const MAX_ATTEMPTS = 5;

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/** localStorage when available, otherwise process-lifetime memory (tests, SSR). */
export function defaultStorage(): StorageLike {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const probe = 'nova_probe';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    }
  } catch {
    /* storage can be blocked (private mode, quota) — fall through */
  }
  return memoryStorage();
}

export class Outbox {
  private storage: StorageLike;

  private cap: number;

  constructor(storage: StorageLike = defaultStorage(), cap: number = OUTBOX_CAP) {
    this.storage = storage;
    this.cap = cap;
  }

  list(): OutboxEntry[] {
    const raw = this.storage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (entry): entry is OutboxEntry =>
          !!entry && typeof entry.key === 'string' && typeof entry.id === 'string',
      );
    } catch {
      return [];
    }
  }

  private write(entries: OutboxEntry[]): void {
    try {
      this.storage.setItem(OUTBOX_KEY, JSON.stringify(entries));
    } catch {
      // Quota exceeded: drop the oldest half rather than lose the newest edits.
      try {
        this.storage.setItem(
          OUTBOX_KEY,
          JSON.stringify(entries.slice(Math.ceil(entries.length / 2))),
        );
      } catch {
        /* nothing more we can do without lying about persistence */
      }
    }
  }

  size(): number {
    return this.list().length;
  }

  pending(): { upserts: number; deletes: number; dead: number } {
    return this.list().reduce(
      (acc, entry) => {
        if (entry.deadLettered) acc.dead += 1;
        else if (entry.operation === 'delete') acc.deletes += 1;
        else acc.upserts += 1;
        return acc;
      },
      { upserts: 0, deletes: 0, dead: 0 },
    );
  }

  /**
   * Queue a write. Returns `replaced` when an older edit of the same row was
   * superseded (the base timestamp is preserved so conflict detection still
   * compares against the version the user actually started from).
   */
  enqueue(input: {
    table: SyncTable;
    id: string;
    operation: OutboxOperation;
    payload?: Record<string, unknown> | null;
    baseUpdatedAt?: string | null;
    now?: string;
  }): 'added' | 'replaced' | 'dropped' {
    const key = `${input.table}:${input.id}`;
    const entries = this.list();
    const existingIndex = entries.findIndex((entry) => entry.key === key);
    const now = input.now ?? new Date().toISOString();

    if (existingIndex >= 0) {
      const existing = entries[existingIndex];
      entries[existingIndex] = {
        ...existing,
        operation: input.operation,
        payload: input.payload ?? existing.payload,
        // Keep the original base version: it is the server version the local
        // change was made against, which is what conflict detection compares to.
        baseUpdatedAt:
          input.baseUpdatedAt !== undefined ? input.baseUpdatedAt : existing.baseUpdatedAt,
        attempts: 0,
        lastError: null,
        deadLettered: false,
      };
      this.write(entries);
      return 'replaced';
    }

    entries.push({
      key,
      table: input.table,
      id: input.id,
      operation: input.operation,
      payload: input.payload ?? null,
      baseUpdatedAt: input.baseUpdatedAt ?? null,
      createdAt: now,
      attempts: 0,
      lastError: null,
      deadLettered: false,
    });

    let outcome: 'added' | 'dropped' = 'added';
    if (entries.length > this.cap) {
      // Drop the oldest still-pending entries; the caller can surface `dropped`.
      const overflow = entries.length - this.cap;
      entries.splice(0, overflow);
      outcome = 'dropped';
    }
    this.write(entries);
    return outcome;
  }

  /** Oldest pending entries first. Dead-lettered entries are never retried. */
  take(limit = 20): OutboxEntry[] {
    return this.list()
      .filter((entry) => !entry.deadLettered)
      .slice(0, limit);
  }

  ack(keys: string[]): void {
    const dropping = new Set(keys);
    this.write(this.list().filter((entry) => !dropping.has(entry.key)));
  }

  fail(key: string, message: string): { attempts: number; deadLettered: boolean } {
    const entries = this.list();
    const entry = entries.find((candidate) => candidate.key === key);
    if (!entry) return { attempts: 0, deadLettered: false };
    entry.attempts += 1;
    entry.lastError = message.slice(0, 240);
    entry.deadLettered = entry.attempts >= MAX_ATTEMPTS;
    this.write(entries);
    return { attempts: entry.attempts, deadLettered: entry.deadLettered };
  }

  clear(): void {
    this.storage.removeItem(OUTBOX_KEY);
  }
}
