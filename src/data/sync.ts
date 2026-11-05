/**
 * Sync engine.
 *
 * Deliberately framework-free: it takes an outbox and a transport, and it is
 * therefore testable without Supabase, a browser or React. The React layer
 * (`src/auth/SyncProvider`) only wires it to the session and to `online` events.
 *
 * Policy (matches the approved blueprint):
 *   1. Writes are queued locally first; the UI never waits for the network.
 *   2. Draining is idempotent — rows carry client-generated ids, so a replayed
 *      entry is an upsert, never a duplicate.
 *   3. A conflict is detected by comparing the server `updated_at` with the
 *      version the local edit was based on. When the server is newer we do not
 *      overwrite it: the entry is dropped from the queue and reported, so the UI
 *      can say "the cloud copy was newer" instead of silently losing data.
 *   4. Failures stay in the queue with a retry count; after MAX_ATTEMPTS they are
 *      dead-lettered and surfaced, never retried forever.
 */
import { MAX_ATTEMPTS, type Outbox, type OutboxEntry } from './outbox';
import type { SyncTable } from './types';

export interface SyncTransport {
  /** Current `updated_at` of a row, or null when it does not exist yet. */
  fetchUpdatedAt(table: SyncTable, id: string): Promise<string | null>;
  upsert(table: SyncTable, row: Record<string, unknown>): Promise<void>;
  remove(table: SyncTable, id: string): Promise<void>;
}

export type SyncEvent =
  | { type: 'pushed'; table: SyncTable; id: string; operation: 'upsert' | 'delete' }
  | { type: 'conflict'; table: SyncTable; id: string; local: string | null; server: string }
  | { type: 'retry'; table: SyncTable; id: string; attempts: number; message: string }
  | { type: 'dead-letter'; table: SyncTable; id: string; message: string }
  | { type: 'offline' };

export interface SyncSummary {
  status: 'ok' | 'offline' | 'partial';
  pushed: number;
  conflicts: number;
  failed: number;
  deadLettered: number;
  remaining: number;
  events: SyncEvent[];
}

export interface SyncEngineOptions {
  outbox: Outbox;
  transport: SyncTransport;
  onEvent?: (event: SyncEvent) => void;
  batchSize?: number;
  /** Injected for tests. */
  isOnline?: () => boolean;
}

function isNewer(server: string, base: string): boolean {
  const serverTime = Date.parse(server);
  const baseTime = Date.parse(base);
  if (Number.isNaN(serverTime)) return false;
  if (Number.isNaN(baseTime)) return true;
  return serverTime > baseTime;
}

export class SyncEngine {
  private options: SyncEngineOptions;

  private running = false;

  constructor(options: SyncEngineOptions) {
    this.options = options;
  }

  get outbox(): Outbox {
    return this.options.outbox;
  }

  private emit(event: SyncEvent, summary: SyncSummary): void {
    summary.events.push(event);
    this.options.onEvent?.(event);
  }

  private online(): boolean {
    if (this.options.isOnline) return this.options.isOnline();
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    return true;
  }

  /** Drain the queue. Safe to call concurrently — extra calls are no-ops. */
  async flush(): Promise<SyncSummary> {
    const summary: SyncSummary = {
      status: 'ok',
      pushed: 0,
      conflicts: 0,
      failed: 0,
      deadLettered: 0,
      remaining: 0,
      events: [],
    };

    if (!this.online()) {
      this.emit({ type: 'offline' }, summary);
      summary.status = 'offline';
      summary.remaining = this.options.outbox.size();
      return summary;
    }

    if (this.running) {
      summary.remaining = this.options.outbox.size();
      return summary;
    }

    this.running = true;
    try {
      const batch = this.options.outbox.take(this.options.batchSize ?? 20);
      for (const entry of batch) {
        await this.process(entry, summary);
      }
    } finally {
      this.running = false;
    }

    summary.remaining = this.options.outbox.size();
    if (summary.failed > 0 || summary.deadLettered > 0) summary.status = 'partial';
    return summary;
  }

  private async process(entry: OutboxEntry, summary: SyncSummary): Promise<void> {
    try {
      if (entry.operation === 'delete') {
        await this.options.transport.remove(entry.table, entry.id);
        this.options.outbox.ack([entry.key]);
        summary.pushed += 1;
        this.emit(
          { type: 'pushed', table: entry.table, id: entry.id, operation: 'delete' },
          summary,
        );
        return;
      }

      if (!entry.payload) {
        this.options.outbox.ack([entry.key]);
        return;
      }

      // Conflict check only makes sense for rows that existed before this edit.
      if (entry.baseUpdatedAt) {
        const serverUpdatedAt = await this.options.transport.fetchUpdatedAt(
          entry.table,
          entry.id,
        );
        if (serverUpdatedAt && isNewer(serverUpdatedAt, entry.baseUpdatedAt)) {
          this.options.outbox.ack([entry.key]);
          summary.conflicts += 1;
          this.emit(
            {
              type: 'conflict',
              table: entry.table,
              id: entry.id,
              local: entry.baseUpdatedAt,
              server: serverUpdatedAt,
            },
            summary,
          );
          return;
        }
      }

      await this.options.transport.upsert(entry.table, entry.payload);
      this.options.outbox.ack([entry.key]);
      summary.pushed += 1;
      this.emit({ type: 'pushed', table: entry.table, id: entry.id, operation: 'upsert' }, summary);
    } catch (error) {
      const message = String((error as { message?: string } | null)?.message ?? error);
      const { attempts, deadLettered } = this.options.outbox.fail(entry.key, message);
      if (deadLettered || attempts >= MAX_ATTEMPTS) {
        summary.deadLettered += 1;
        this.emit({ type: 'dead-letter', table: entry.table, id: entry.id, message }, summary);
      } else {
        summary.failed += 1;
        this.emit(
          { type: 'retry', table: entry.table, id: entry.id, attempts, message },
          summary,
        );
      }
    }
  }
}
