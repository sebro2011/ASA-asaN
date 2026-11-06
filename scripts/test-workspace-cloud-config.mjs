/**
 * Client-side cloud config probe (`src/data/config.ts`).
 *
 * The distinction these tests pin is the one the UI now depends on: "the server
 * says it has no credentials" is an operator problem, while "we never got an
 * answer" is retryable. Collapsing them into one vague message is what made a
 * cold start look like a broken deployment.
 *
 * Run: node --import tsx --test scripts/test-workspace-cloud-config.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CONFIG_TIMEOUT_MS, loadCloudConfig, resetCloudConfigCache } from '../src/data/config.ts';

function respond(body, { status = 200, contentType = 'application/json' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => {
      if (typeof body === 'string') throw new SyntaxError('Unexpected token <');
      return body;
    },
  };
}

async function probe(fetchImpl) {
  resetCloudConfigCache();
  globalThis.fetch = fetchImpl;
  return loadCloudConfig();
}

test('a healthy deployment returns the origin and the publishable key', async () => {
  const config = await probe(async () =>
    respond({ enabled: true, url: 'https://project.supabase.co', publishableKey: 'sb_publishable_test_key_123456' }),
  );
  assert.deepEqual(config, {
    enabled: true,
    url: 'https://project.supabase.co',
    publishableKey: 'sb_publishable_test_key_123456',
  });
});

test('missing credentials stay an operator problem, not a network one', async () => {
  const config = await probe(async () => respond({ enabled: false, reason: 'not-configured' }));
  assert.deepEqual(config, { enabled: false, reason: 'not-configured' });
});

test('a 404 means the route is not deployed', async () => {
  const config = await probe(async () => respond({}, { status: 404 }));
  assert.deepEqual(config, { enabled: false, reason: 'route-missing' });
});

test('a 5xx means the function started and failed', async () => {
  const config = await probe(async () => respond({}, { status: 503 }));
  assert.deepEqual(config, { enabled: false, reason: 'server-error' });
});

test('an HTML answer means the SPA rewrite swallowed the API call', async () => {
  const config = await probe(async () =>
    respond('<!doctype html>', { contentType: 'text/html; charset=utf-8' }),
  );
  assert.deepEqual(config, { enabled: false, reason: 'invalid-response' });
});

test('a network failure is unreachable, and a slow start is a timeout', async () => {
  const offline = await probe(async () => {
    throw new TypeError('Failed to fetch');
  });
  assert.deepEqual(offline, { enabled: false, reason: 'unreachable' });

  const slow = await probe(async () => {
    const error = new Error('The operation was aborted due to timeout');
    error.name = 'TimeoutError';
    throw error;
  });
  assert.deepEqual(slow, { enabled: false, reason: 'timeout' });
});

test('the probe allows for a cold start and is memoised until it is reset', async () => {
  assert.ok(CONFIG_TIMEOUT_MS >= 15_000, 'a cold start must not be mistaken for an outage');

  let calls = 0;
  resetCloudConfigCache();
  globalThis.fetch = async () => {
    calls += 1;
    return respond({ enabled: false, reason: 'not-configured' });
  };

  await loadCloudConfig();
  await loadCloudConfig();
  assert.equal(calls, 1, 'a settled probe is reused for the page load');

  resetCloudConfigCache();
  await loadCloudConfig();
  assert.equal(calls, 2, 'resetting the cache really re-probes');
});
