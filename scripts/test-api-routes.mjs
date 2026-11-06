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
    assert.match(response.headers.get('content-type') || '', /json/);
    assert.equal((await response.json()).code, 'NOT_FOUND');
  } finally {
    server.close();
  }
});

test('a malformed body is a typed 400, never an HTML error page', async () => {
  const { server, base } = await startServer();
  try {
    const response = await fetch(`${base}/api/nova/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"messages": ',
    });
    assert.equal(response.status, 400);
    assert.match(response.headers.get('content-type') || '', /json/);
    const body = await response.json();
    assert.equal(body.code, 'INVALID_JSON');
    assert.ok(body.error);
  } finally {
    server.close();
  }
});

test('an oversized body is refused with a code, not a stack trace', async () => {
  const { server, base } = await startServer();
  try {
    const response = await fetch(`${base}/api/nova/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(200_000) }] }),
    });
    assert.ok([400, 413].includes(response.status), `got ${response.status}`);
    const body = await response.json();
    assert.ok(body.code, 'the refusal carries a code');
    assert.equal(response.headers.get('cache-control'), 'no-store');
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

/* -------------------------------------------------------------------- CORS */

test('same-origin POSTs survive a configured allow-list (the Vercel preview trap)', async () => {
  const { decideCors, parseAllowHosts } = await import('../server/cors.ts');
  const allowHosts = parseAllowHosts('https://nova.example.com');

  const sameOrigin = decideCors({
    origin: 'https://nova-preview-abc.vercel.app',
    host: 'nova-preview-abc.vercel.app',
    allowHosts,
    dev: false,
  });
  assert.equal(sameOrigin.grant, true);
  assert.equal(sameOrigin.reason, 'same-origin');

  const listed = decideCors({
    origin: 'https://nova.example.com',
    host: 'nova-preview-abc.vercel.app',
    allowHosts,
    dev: false,
  });
  assert.equal(listed.grant, true);
  assert.equal(listed.reason, 'allow-list');

  const foreign = decideCors({
    origin: 'https://evil.example.net',
    host: 'nova-preview-abc.vercel.app',
    allowHosts,
    dev: false,
  });
  assert.equal(foreign.grant, false, 'a foreign origin is never granted');
});

test('an unknown origin is refused a grant, never a 403', async () => {
  const { server, base } = await startServer();
  try {
    const response = await fetch(`${base}/api/health`, {
      headers: { Origin: 'https://evil.example.net' },
    });
    assert.notEqual(response.status, 403, 'CORS is enforced by the browser, not a 403');
    assert.match(response.headers.get('vary') || '', /origin/i);
    assert.equal((await response.json()).status, 'ok');

    // Development echoes any origin (iframe previews); production withholds the
    // grant for anything that is neither same-origin nor allow-listed.
    const dev = process.env.NODE_ENV !== 'production';
    assert.equal(
      response.headers.get('access-control-allow-origin'),
      dev ? 'https://evil.example.net' : null,
    );
  } finally {
    server.close();
  }
});

test('a same-origin request is echoed back so the browser will read the body', async () => {
  const { server, base } = await startServer();
  try {
    const origin = new URL(base).origin;
    const response = await fetch(`${base}/api/health`, { headers: { Origin: origin } });
    // The app is imported once per process, so NODE_ENV decides dev vs prod here;
    // either way a same-origin request must be granted.
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  } finally {
    server.close();
  }
});
