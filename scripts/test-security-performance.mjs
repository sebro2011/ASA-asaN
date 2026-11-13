/** Phase 6: Security & Performance verification.
 *
 * Verifies that security headers are applied to every response, rate limiting
 * returns 429 after exceeding the per-IP window, and cache headers are set
 * appropriately for API responses.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { app } from '../server.ts';

let server;
let port;

async function start() {
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    });
  });
}

async function stop() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
}

function request(path, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const SECURITY_HEADERS = [
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
  'content-security-policy',
];

test('security headers are set on every API response', async () => {
  await start();
  try {
    const res = await request('/api/health');
    assert.equal(res.statusCode, 200);
    for (const header of SECURITY_HEADERS) {
      assert.ok(res.headers[header], `missing security header: ${header}`);
    }
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
    assert.ok(String(res.headers['content-security-policy']).includes("default-src 'self'"));
    assert.ok(String(res.headers['content-security-policy']).includes("object-src 'none'"));
    assert.ok(String(res.headers['permissions-policy']).includes('camera=()'));
  } finally {
    await stop();
  }
});

test('cache headers: cacheable GET endpoints get Cache-Control, others get no-store', async () => {
  await start();
  try {
    const config = await request('/api/nova/config');
    assert.ok(String(config.headers['cache-control']).includes('max-age=60'));

    const health = await request('/api/health');
    assert.ok(String(health.headers['cache-control']).includes('max-age=60'));

    // A non-cacheable GET API path should not be cached. (Runs before rate
    // limiting exhausts the /api/youtube/meta window in later tests.)
    const meta = await request('/api/youtube/meta?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.ok(String(meta.headers['cache-control']).includes('no-store'));
  } finally {
    await stop();
  }
});

test('rate limit headers are present on allowed requests', async () => {
  await start();
  try {
    const res = await request('/api/youtube/meta?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.ok(res.headers['x-ratelimit-limit']);
    assert.ok(res.headers['x-ratelimit-remaining']);
    assert.ok(res.headers['x-ratelimit-reset']);
  } finally {
    await stop();
  }
});

test('rate limiting returns 429 after exceeding the per-IP window', async () => {
  await start();
  try {
    // YouTube meta limit is 30/min; make 31 requests to trigger 429 on the last.
    let last;
    for (let i = 0; i < 31; i++) {
      last = await request('/api/youtube/meta?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    }
    assert.equal(last.statusCode, 429, `expected 429, got ${last.statusCode}`);
    assert.equal(last.headers['x-ratelimit-limit'], '30');
    assert.equal(last.headers['x-ratelimit-remaining'], '0');
    const body = JSON.parse(last.body);
    assert.equal(body.code, 'rate-limit');
  } finally {
    await stop();
  }
});

test('the service worker never answers an API navigation with the app shell', async () => {
  // The generated worker falls back to index.html for navigations. Without a
  // denylist, opening /api/nova/config in a tab renders the SPA (HTTP 200, HTML)
  // and a healthy endpoint looks broken.
  const config = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
  const match = /navigateFallbackDenylist:\s*\[([^\]]*)\]/.exec(config);

  assert.ok(match, 'vite.config.ts declares a navigateFallbackDenylist');
  assert.match(match[1], /\^\\\/api\\\//, 'the denylist covers /api/*');
});

test('PWA runtime image caching does not capture POWER JSON', async () => {
  const config = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(config, /url\.pathname !== '\/api\/earth\/power'/);
  assert.match(config, /urlPattern:\s*\(\{ request \}\) => request\.destination === 'image'/);
  assert.doesNotMatch(config, /url\.hostname\.includes\('nasa\.gov'\)/);
});

test('proxy trust is bounded, not blanket (audit M3)', () => {
  // This test used to assert `trust proxy === false`, which pinned the bug: with
  // trust disabled, `req.ip` is the platform proxy's address for every visitor,
  // so each per-IP rate limit collapsed into one bucket shared by the whole
  // deployment. The replacement asserts the shape that is actually correct — a
  // known hop count, never `true`, which would make req.ip forgeable via
  // X-Forwarded-For.
  const trust = app.get('trust proxy');
  assert.notEqual(trust, undefined, 'Express default (undefined) means no proxy support at all');
  assert.notEqual(trust, true, 'trusting every hop makes the client IP attacker-controlled');
  assert.ok(trust === false || (typeof trust === 'number' && trust >= 1 && trust <= 10), `unexpected trust value: ${trust}`);
});
