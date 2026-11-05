/**
 * Legacy local-data import (Phase 3B).
 *
 * The rules under test are the ones that protect user data:
 *   * the local key is never deleted by the import;
 *   * a retry re-uses the same conversation id (no duplicate thread);
 *   * a failed verification leaves the marker unverified and the local copy intact.
 *
 * Run: node --import tsx --test scripts/test-workspace-import.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  deriveTitle,
  importLegacyThread,
  parseLegacyThread,
  localThreadCount,
  LEGACY_THREAD_KEY,
  MIGRATION_MARKER_KEY,
} from '../src/data/legacyImport.ts';

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    has: (key) => map.has(key),
  };
}

/** Fake cloud conversation store used by the injected import dependencies. */
function fakeCloud(options = {}) {
  const conversations = new Map();
  const messages = new Map();
  const calls = { ensure: [], insert: [], count: 0 };
  let failEnsure = options.failEnsure ?? 0;
  let dropMessages = options.dropMessages ?? 0;

  return {
    conversations,
    messages,
    calls,
    deps: {
      readRaw: () => null,
      readMarker: () => null,
      writeMarker: () => {},
      async ensureConversation({ id, title, lastMessageAt }) {
        calls.ensure.push(id);
        if (failEnsure > 0) {
          failEnsure -= 1;
          throw new Error('network down');
        }
        if (!conversations.has(id)) conversations.set(id, { id, title, lastMessageAt });
      },
      async insertMessages(conversationId, list) {
        calls.insert.push(list.length);
        const stored = messages.get(conversationId) ?? [];
        const incoming = dropMessages > 0 ? list.slice(0, list.length - dropMessages) : list;
        messages.set(conversationId, [...stored, ...incoming]);
      },
      async countMessages(conversationId) {
        calls.count += 1;
        return (messages.get(conversationId) ?? []).length;
      },
    },
  };
}

function depsFor(storage, cloud) {
  return {
    ...cloud.deps,
    readRaw: () => storage.getItem(LEGACY_THREAD_KEY),
    readMarker: () => {
      const raw = storage.getItem(MIGRATION_MARKER_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    writeMarker: (marker) => storage.setItem(MIGRATION_MARKER_KEY, JSON.stringify(marker)),
  };
}

const THREAD = JSON.stringify([
  { role: 'user', text: 'What is a Lagrange point?', timestamp: '2026-01-02T10:00:00.000Z' },
  { role: 'assistant', text: 'A gravitational balance point between two bodies.' },
  { role: 'system', text: 'ignored' },
  { role: 'assistant', text: '' },
]);

test('the parser accepts every shape the assistant has written and drops noise', () => {
  const messages = parseLegacyThread(THREAD);
  assert.equal(messages.length, 2, 'system and empty messages are dropped');
  assert.equal(messages[0].role, 'user');
  assert.equal(messages[0].content, 'What is a Lagrange point?');
  assert.equal(messages[0].createdAt, '2026-01-02T10:00:00.000Z');
  assert.equal(messages[1].role, 'assistant');

  // `content` instead of `text`, and offline-fallback notices are dropped.
  const alternative = parseLegacyThread(
    JSON.stringify([
      { role: 'user', content: 'hello' },
      { role: 'assistant', text: '[Local offline fallback; may be incomplete] low confidence' },
      { role: 'assistant', content: '   ' },
    ]),
  );
  assert.equal(alternative.length, 1);
  assert.equal(alternative[0].content, 'hello');

  assert.deepEqual(parseLegacyThread('not json'), []);
  assert.deepEqual(parseLegacyThread('{"role":"user"}'), []);
  assert.deepEqual(parseLegacyThread(null), []);
});

test('the title comes from the first user message, capped and cleaned', () => {
  const long = 'a'.repeat(200);
  assert.equal(deriveTitle([{ role: 'assistant', content: 'hi' }, { role: 'user', content: '  spaced   out  ' }]), 'spaced out');
  assert.equal(deriveTitle([{ role: 'assistant', content: 'only assistant' }]), 'Imported conversation');
  const capped = deriveTitle([{ role: 'user', content: long }]);
  assert.equal(capped.length, 80);
  assert.ok(capped.endsWith('…'));
});

test('a first import writes the thread, verifies it and keeps the local copy', async () => {
  const storage = memoryStorage({ [LEGACY_THREAD_KEY]: THREAD });
  const cloud = fakeCloud();

  const result = await importLegacyThread(depsFor(storage, cloud));

  assert.equal(result.status, 'imported');
  assert.equal(result.count, 2);
  assert.equal(cloud.conversations.size, 1);
  assert.equal(cloud.messages.get(result.conversationId).length, 2);
  assert.equal(cloud.calls.count, 1, 'the import verified what it wrote');

  const marker = JSON.parse(storage.getItem(MIGRATION_MARKER_KEY));
  assert.equal(marker.status, 'done');
  assert.equal(marker.conversationId, result.conversationId);
  assert.equal(marker.count, 2);

  assert.equal(storage.has(LEGACY_THREAD_KEY), true, 'the local thread is never deleted');
  assert.equal(localThreadCount(storage), 2);
});

test('a second call is a no-op', async () => {
  const storage = memoryStorage({ [LEGACY_THREAD_KEY]: THREAD });
  const cloud = fakeCloud();
  const deps = depsFor(storage, cloud);

  const first = await importLegacyThread(deps);
  const before = cloud.calls.ensure.length;
  const second = await importLegacyThread(deps);

  assert.equal(second.status, 'already-imported');
  assert.equal(second.conversationId, first.conversationId);
  assert.equal(cloud.calls.ensure.length, before, 'no second conversation was created');
});

test('a retry after a failure re-uses the same conversation id', async () => {
  const storage = memoryStorage({ [LEGACY_THREAD_KEY]: THREAD });
  const cloud = fakeCloud({ failEnsure: 1 });
  const deps = depsFor(storage, cloud);

  const failed = await importLegacyThread(deps);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.localDataKept, true);
  const pendingMarker = JSON.parse(storage.getItem(MIGRATION_MARKER_KEY));
  assert.equal(pendingMarker.status, 'failed');
  assert.equal(storage.has(LEGACY_THREAD_KEY), true);

  const retried = await importLegacyThread(deps);
  assert.equal(retried.status, 'imported');
  assert.equal(retried.conversationId, failed.conversationId, 'same id, so no duplicate thread');
  assert.equal(cloud.conversations.size, 1);
  assert.equal(cloud.calls.ensure.length, 2, 'the first attempt is visible in the call log');
});

test('a verification mismatch is reported as a failure and nothing is claimed', async () => {
  const storage = memoryStorage({ [LEGACY_THREAD_KEY]: THREAD });
  const cloud = fakeCloud({ dropMessages: 1 });
  const deps = depsFor(storage, cloud);

  const result = await importLegacyThread(deps);

  assert.equal(result.status, 'failed');
  assert.match(result.error, /verification failed: expected 2, found 1/);
  const marker = JSON.parse(storage.getItem(MIGRATION_MARKER_KEY));
  assert.equal(marker.status, 'failed');
  assert.equal(marker.count, 1);
  assert.equal(storage.has(LEGACY_THREAD_KEY), true, 'local history still on the device');
});

test('nothing is written when there is no local thread', async () => {
  const storage = memoryStorage();
  const cloud = fakeCloud();
  const deps = depsFor(storage, cloud);

  const result = await importLegacyThread(deps);

  assert.equal(result.status, 'empty');
  assert.equal(cloud.calls.ensure.length, 0);
  assert.equal(storage.has(MIGRATION_MARKER_KEY), false, 'no marker for an empty import');
});

test('a corrupt local thread is empty, not a crash', async () => {
  const storage = memoryStorage({ [LEGACY_THREAD_KEY]: '{"broken":' });
  const cloud = fakeCloud();
  const result = await importLegacyThread(depsFor(storage, cloud));
  assert.equal(result.status, 'empty');
  assert.equal(cloud.calls.ensure.length, 0);
});
