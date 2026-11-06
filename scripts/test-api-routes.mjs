/**
 * API contract test — every route, in-process, no network.
 *
 * The app is booted on an ephemeral port and every entry in `scripts/api-routes.mjs`
 * is replayed. The assertions are deliberately about *contract*, not about data:
 *
 *   - the route exists (a 404 means it was renamed, unrouted or swallowed)
 *   - the handler answers JSON, never an HTML error page
 *   - a crash (500/501) fails the run
 *   - every non-2xx body carries a machine-readable `code` (or the legacy
 *     `error` code used by the community router)
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-api-routes.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { API_ROUTES, verdict } from './api-routes.mjs';

async function startServer() {
  const { app } = await import('../server.ts');
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

async function call(base, route) {
  const response = await fetch(base + route.path, {
    method: route.method,
    headers: { Accept: 'application/json', ...(route.body ? { 'Content-Type': 'application/json' } : {}) },
    body: route.body ? JSON.stringify(route.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: response.status, contentType, body };
}

test('every documented route exists and answers JSON', async () => {
  const { server, base } = await startServer();
  const failures = [];
  try {
    for (const route of API_ROUTES) {
      const response = await call(base, route);
      const outcome = verdict(route, response.status, response.body);
      if (!response.contentType.includes('json')) {
        failures.push(`${route.method} ${route.path} → ${response.status} ${response.contentType || '(no type)'}`);
        continue;
      }
      if (outcome !== 'ok') {
        failures.push(
          `${route.method} ${route.path} → ${response.status} ${outcome} (${route.why})`,
        );
      }
    }
  } finally {
    server.close();
  }

  assert.deepEqual(failures, [], `broken routes:\n${failures.join('\n')}`);
});

test('an unknown API path is a 404, so the inventory above is the real surface', async () => {
  const { server, base } = await startServer();
  try {
    const response = await fetch(`${base}/api/does-not-exist`);
    assert.equal(response.status, 404);
  } finally {
    server.close();
  }
});

test('every failure is machine-readable, in one of the two documented shapes', async () => {
  const { server, base } = await startServer();
  const offenders = [];
  try {
    for (const route of API_ROUTES) {
      if (route.method !== 'POST') continue;
      const response = await call(base, route);
      if (response.status < 400 || !response.body) continue;
      const hasCode = typeof response.body.code === 'string' && response.body.code.length > 0;
      const hasLegacyCode = typeof response.body.error === 'string';
      if (!hasCode && !hasLegacyCode) offenders.push(`${route.path} → ${JSON.stringify(response.body)}`);
    }
  } finally {
    server.close();
  }
  assert.deepEqual(offenders, [], `error bodies without a code:\n${offenders.join('\n')}`);
});

test('the AI endpoints reject bad input before touching a provider', async () => {
  const { server, base } = await startServer();
  try {
    for (const path of ['/api/nova/chat', '/api/chat', '/api/openrouter/chat']) {
      const response = await fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      });
      const body = await response.json();
      assert.equal(response.status, 400, `${path} rejects an empty history`);
      // No provider is configured in the test environment, so a valid request
      // must not be able to reach the network either.
      assert.equal(body.code, 'INVALID_MESSAGES');
    }
  } finally {
    server.close();
  }
});
