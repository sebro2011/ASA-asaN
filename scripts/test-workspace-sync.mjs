/**
 * Cloud synchronisation — engine and outbox tests (Phase 3B).
 *
 * The engine is transport-agnostic, so these tests use an in-memory "cloud" that
 * records every call. That is enough to prove the properties that actually
 * matter: nothing is lost offline, replays do not duplicate, a newer cloud row is
 * never overwritten, and failures are bounded.
 *
 * Run: node --import tsx --test scripts/test-workspace-sync.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Outbox, MAX_ATTEMPTS } from '../src/data/outbox.ts';
import { SyncEngine } from '../src/data/sync.ts';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

/** A tiny fake cloud: rows keyed by table:id, ordered call log. */
function fakeCloud(initial = {}) {
  const rows = new Map(Object.entries(initial));
  const calls = [];
  let failNext = 0;
  return {
    rows,
    calls,
    failTimes(times) {
      failNext = times;
    },
    transport: {
      async fetchUpdatedAt(table, id) {
        calls.push(['fetch', table, id]);
        return rows.get(`${table}:${id}`)?.updated_at ?? null;
      },
      async upsert(table, row) {
        calls.push(['upsert', table, row.id]);
        if (failNext > 0) {
          failNext -= 1;
          throw new Error('network down');
        }
        rows.set(`${table}:${row.id}`, row);
      },
      async remove(table, id) {
        calls.push(['delete', table, id]);
        rows.delete(`${table}:${id}`);
      },
    },
  };
}

function newEngine(cloud, storage, options = {}) {
  const outbox = new Outbox(storage);
  const events = [];
  const engine = new SyncEngine({
    outbox,
    transport: cloud.transport,
    onEvent: (event) => events.push(event),
    isOnline: options.isOnline ?? (() => true),
    batchSize: options.batchSize,
  });
  return { engine, outbox, events };
}

test('the outbox keeps one entry per row and preserves the base version', () => {
  const storage = memoryStorage();
  const outbox = new Outbox(storage);

  assert.equal(
    outbox.enqueue({ table: 'tasks', id: 't1', operation: 'upsert', payload: { id: 't1', title: 'a' } }),
    'added',
  );
  assert.equal(
    outbox.enqueue({
      table: 'tasks',
      id: 't1',
      operation: 'upsert',
      payload: { id: 't1', title: 'b' },
      baseUpdatedAt: '2026-01-01T00:00:00.000Z',
    }),
    'replaced',
  );

  const entries = outbox.list();
  assert.equal(entries.length, 1, 'one entry per (table, id)');
  assert.equal(entries[0].payload.title, 'b', 'newest payload wins');
  assert.equal(entries[0].baseUpdatedAt, '2026-01-01T00:00:00.000Z');

  // A queued delete supersedes a queued upsert of the same row.
  outbox.enqueue({ table: 'tasks', id: 't1', operation: 'delete' });
  assert.equal(outbox.list()[0].operation, 'delete');
  outbox.enqueue({ table: 'tasks', id: 't1', operation: 'upsert', payload: { id: 't1' } });
  assert.equal(outbox.list()[0].baseUpdatedAt, '2026-01-01T00:00:00.000Z', 'base kept across ops');
});

test('offline flushes send nothing and keep everything queued', async () => {
  const storage = memoryStorage();
  const cloud = fakeCloud();
  const { engine, outbox } = newEngine(cloud, storage, { isOnline: () => false });

  outbox.enqueue({ table: 'tasks', id: 't1', operation: 'upsert', payload: { id: 't1' } });
  const summary = await engine.flush();

  assert.equal(summary.status, 'offline');
  assert.equal(summary.pushed, 0);
  assert.equal(summary.remaining, 1);
  assert.equal(cloud.calls.length, 0, 'no network calls while offline');
  assert.equal(summary.events[0].type, 'offline');
});

test('a drained queue is idempotent: replaying the same writes creates no duplicates', async () => {
  const storage = memoryStorage();
  const cloud = fakeCloud();
  const { engine, outbox } = newEngine(cloud, storage);

  const payload = { id: 'doc-1', user_id: 'u1', title: 'Notes', updated_at: '2026-02-02T00:00:00.000Z' };
  outbox.enqueue({ table: 'documents', id: 'doc-1', operation: 'upsert', payload });

  const first = await engine.flush();
  assert.equal(first.status, 'ok');
  assert.equal(first.pushed, 1);
  assert.equal(outbox.size(), 0, 'entry removed only after the server confirmed');
  assert.equal(cloud.rows.size, 1);

  // Same row queued again (e.g. the user hit save twice across a reconnect).
  outbox.enqueue({ table: 'documents', id: 'doc-1', operation: 'upsert', payload });
  await engine.flush();
  assert.equal(cloud.rows.size, 1, 'upsert by primary key, not an insert');
});

test('a newer cloud row is never overwritten — the conflict is reported instead', async () => {
  const storage = memoryStorage();
  const cloud = fakeCloud({
    'documents:doc-1': {
      id: 'doc-1',
      title: 'Cloud version',
      updated_at: '2026-03-03T00:00:00.000Z',
    },
  });
  const { engine, outbox, events } = newEngine(cloud, storage);

  outbox.enqueue({
    table: 'documents',
    id: 'doc-1',
    operation: 'upsert',
    payload: { id: 'doc-1', title: 'My stale edit', updated_at: '2026-03-01T00:00:00.000Z' },
    baseUpdatedAt: '2026-03-01T00:00:00.000Z',
  });

  const summary = await engine.flush();

  assert.equal(summary.conflicts, 1);
  assert.equal(summary.pushed, 0);
  assert.equal(cloud.rows.get('documents:doc-1').title, 'Cloud version', 'cloud row untouched');
  assert.equal(outbox.size(), 0, 'the stale edit is not retried forever');
  const conflict = events.find((event) => event.type === 'conflict');
  assert.ok(conflict);
  assert.equal(conflict.server, '2026-03-03T00:00:00.000Z');
});

test('an edit based on the current cloud row is written normally', async () => {
  const storage = memoryStorage();
  const cloud = fakeCloud({
    'tasks:t1': { id: 't1', title: 'old', updated_at: '2026-03-03T00:00:00.000Z' },
  });
  const { engine, outbox } = newEngine(cloud, storage);

  outbox.enqueue({
    table: 'tasks',
    id: 't1',
    operation: 'upsert',
    payload: { id: 't1', title: 'new' },
    baseUpdatedAt: '2026-03-03T00:00:00.000Z',
  });

  const summary = await engine.flush();
  assert.equal(summary.pushed, 1);
  assert.equal(cloud.rows.get('tasks:t1').title, 'new');
});

test('failures stay queued, retry, then dead-letter instead of looping forever', async () => {
  const storage = memoryStorage();
  const cloud = fakeCloud();
  const { engine, outbox, events } = newEngine(cloud, storage);

  cloud.failTimes(1);
  outbox.enqueue({ table: 'tasks', id: 't1', operation: 'upsert', payload: { id: 't1', title: 'x' } });

  const first = await engine.flush();
  assert.equal(first.failed, 1);
  assert.equal(outbox.size(), 1, 'the write is not lost');
  assert.equal(outbox.list()[0].attempts, 1);
  assert.equal(events.filter((event) => event.type === 'retry').length, 1);

  // Keep failing until the attempt cap is reached.
  cloud.failTimes(MAX_ATTEMPTS);
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) await engine.flush();

  assert.equal(outbox.list()[0].deadLettered, true, 'dead-lettered after the cap');
  const dead = events.filter((event) => event.type === 'dead-letter');
  assert.equal(dead.length, 1);
  assert.equal(dead[0].table, 'tasks');

  const attemptsSoFar = cloud.calls.filter((call) => call[0] === 'upsert').length;
  const afterDeath = await engine.flush();
  assert.equal(afterDeath.pushed, 0);
  assert.equal(
    cloud.calls.filter((call) => call[0] === 'upsert').length,
    attemptsSoFar,
    'a dead-lettered entry is never retried again',
  );
});

test('deletes are pushed once and the queue survives a page reload', async () => {
  const storage = memoryStorage();
  const cloud = fakeCloud({ 'tasks:t1': { id: 't1', title: 'x', updated_at: '2026-01-01T00:00:00.000Z' } });
  const first = newEngine(cloud, storage);

  first.outbox.enqueue({ table: 'tasks', id: 't1', operation: 'delete' });
  // Reload: a brand-new engine over the same storage must still see the work.
  const second = newEngine(cloud, storage);
  assert.equal(second.outbox.size(), 1, 'queue is durable');

  const summary = await second.engine.flush();
  assert.equal(summary.pushed, 1);
  assert.equal(cloud.rows.has('tasks:t1'), false, 'row removed');
  assert.equal(second.outbox.size(), 0);
});

test('the queue is capped and the oldest entries are dropped', () => {
  const storage = memoryStorage();
  const outbox = new Outbox(storage, 3);

  outbox.enqueue({ table: 'tasks', id: 't1', operation: 'upsert', payload: { id: 't1' } });
  outbox.enqueue({ table: 'tasks', id: 't2', operation: 'upsert', payload: { id: 't2' } });
  outbox.enqueue({ table: 'tasks', id: 't3', operation: 'upsert', payload: { id: 't3' } });
  const outcome = outbox.enqueue({ table: 'tasks', id: 't4', operation: 'upsert', payload: { id: 't4' } });

  assert.equal(outcome, 'dropped');
  const ids = outbox.list().map((entry) => entry.id);
  assert.deepEqual(ids, ['t2', 't3', 't4'], 'oldest dropped, newest kept');
});

test('pending counts separate upserts, deletes and dead letters', async () => {
  const storage = memoryStorage();
  const cloud = fakeCloud();
  const { outbox } = newEngine(cloud, storage);

  outbox.enqueue({ table: 'tasks', id: 't1', operation: 'upsert', payload: { id: 't1' } });
  outbox.enqueue({ table: 'tasks', id: 't2', operation: 'delete' });
  outbox.fail('tasks:t2', 'boom');

  const pending = outbox.pending();
  assert.equal(pending.upserts, 1);
  assert.equal(pending.deletes, 1);
  assert.equal(pending.dead, 0, 'one failure is not a dead letter yet');
});

test('a corrupt queue is ignored rather than crashing the app', () => {
  const storage = memoryStorage();
  storage.setItem('nova_sync_outbox_v1', '{not json');
  const outbox = new Outbox(storage);
  assert.deepEqual(outbox.list(), []);
  assert.equal(
    outbox.enqueue({ table: 'tasks', id: 't1', operation: 'upsert', payload: { id: 't1' } }),
    'added',
  );
  assert.equal(outbox.size(), 1);
});
