import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRateLimiter,
  pruneRateEntries,
  clientKey,
  RATE_PRUNE_THRESHOLD,
  RATE_MAX_ENTRIES,
} from '../server/requestRateLimit.ts';

/**
 * The API's coarse limiter. These tests exist because the limiter used to hold
 * every client it had ever seen in one module-level map and the NOVA bucket was
 * constructed inside a request handler — both of which are invisible from the
 * outside until the process runs out of memory or the limit stops applying.
 */

function fakeReq(ip, path = '/api/test', extra = {}) {
  return { ip, path, socket: { remoteAddress: ip }, headers: {}, method: 'POST', ...extra };
}

function fakeRes() {
  const headers = {};
  const res = {
    headers,
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      headers[name.toLowerCase()] = String(value);
      return res;
    },
    status(code) {
      res.statusCode = code;
      return { json(body) { res.body = body; return res; } };
    },
  };
  return res;
}

function hit(limiter, ip, path) {
  const res = fakeRes();
  let nexted = false;
  limiter(fakeReq(ip, path), res, () => { nexted = true; });
  return { res, nexted };
}

test('allows exactly `max` requests, then refuses with 429 and Retry-After', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3, keyPrefix: 't' });

  for (let index = 0; index < 3; index += 1) {
    const { res, nexted } = hit(limiter, '203.0.113.7');
    assert.equal(nexted, true, `request ${index + 1} should pass`);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['x-ratelimit-limit'], '3');
    assert.equal(res.headers['x-ratelimit-remaining'], String(3 - index - 1));
  }

  const refused = hit(limiter, '203.0.113.7');
  assert.equal(refused.nexted, false);
  assert.equal(refused.res.statusCode, 429);
  assert.equal(refused.res.body.code, 'rate-limit');
  assert.match(refused.res.body.error, /too many/i);
  assert.ok(Number(refused.res.headers['retry-after']) >= 1, 'Retry-After must be a positive number of seconds');
});

test('a custom code and message reach the client unchanged', () => {
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 1,
    keyPrefix: 'nova-chat',
    code: 'RATE_LIMITED',
    message: 'Too many NOVA requests. Please wait a moment and try again.',
  });
  hit(limiter, '203.0.113.8');
  const refused = hit(limiter, '203.0.113.8');
  assert.equal(refused.res.body.code, 'RATE_LIMITED');
  assert.match(refused.res.body.error, /NOVA/);
});

test('the window resets on its exact boundary, not before', () => {
  let now = 1_000_000;
  const limiter = createRateLimiter({ windowMs: 10_000, max: 2, keyPrefix: 'w' }, () => now);
  hit(limiter, '198.51.100.1');
  hit(limiter, '198.51.100.1');
  assert.equal(hit(limiter, '198.51.100.1').res.statusCode, 429);

  now += 9_999;
  assert.equal(hit(limiter, '198.51.100.1').res.statusCode, 429, 'still inside the window');

  now += 1;
  const afterReset = hit(limiter, '198.51.100.1');
  assert.equal(afterReset.res.statusCode, 200, 'a new window starts at exactly windowMs');
  assert.equal(afterReset.nexted, true);
});

test('separate clients have separate buckets', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, keyPrefix: 'per-client' });
  assert.equal(hit(limiter, '198.51.100.2').res.statusCode, 200);
  assert.equal(hit(limiter, '198.51.100.2').res.statusCode, 429);
  assert.equal(hit(limiter, '198.51.100.3').res.statusCode, 200, 'a different client is unaffected');
});

test('each limiter owns its store, so unrelated routes cannot evict each other', () => {
  const mars = createRateLimiter({ windowMs: 60_000, max: 1, keyPrefix: 'mars' });
  const community = createRateLimiter({ windowMs: 60_000, max: 1, keyPrefix: 'community' });
  assert.equal(hit(mars, '192.0.2.9').res.statusCode, 200);
  assert.equal(hit(community, '192.0.2.9').res.statusCode, 200);
  assert.notEqual(mars.store.entries, community.store.entries);
  assert.equal(mars.store.size(), 1);
  assert.equal(community.store.size(), 1);
});

test('skip() lets a request through without consuming budget', () => {
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 1,
    keyPrefix: 'skip',
    skip: (req) => req.path === '/api/health',
  });
  for (let index = 0; index < 5; index += 1) {
    const { res, nexted } = hit(limiter, '192.0.2.10', '/api/health');
    assert.equal(nexted, true);
    assert.equal(res.statusCode, 200);
  }
  assert.equal(limiter.store.size(), 0, 'a skipped request must not create an entry');
});

test('pruneRateEntries drops only windows that have elapsed', () => {
  const entries = new Map();
  entries.set('old:a', { count: 5, windowStart: 0 });
  entries.set('fresh:b', { count: 1, windowStart: 9_500 });

  const removed = pruneRateEntries(entries, 10_000, 10_000);
  assert.equal(removed, 1);
  assert.equal(entries.has('old:a'), false);
  assert.equal(entries.has('fresh:b'), true);
});

test('memory stays bounded: the store prunes itself instead of growing forever', () => {
  let now = 0;
  const limiter = createRateLimiter({ windowMs: 1_000, max: 5, keyPrefix: 'leak' }, () => now);

  // More distinct clients than the prune threshold, all inside one window.
  for (let index = 0; index < RATE_PRUNE_THRESHOLD + 200; index += 1) {
    hit(limiter, `2001:db8::${index}`);
  }
  assert.ok(
    limiter.store.size() <= RATE_MAX_ENTRIES,
    `store must stay under the hard cap, saw ${limiter.store.size()}`,
  );

  // Once the window has elapsed the sweep reclaims every entry.
  now = 5_000;
  hit(limiter, '2001:db8::ffff');
  assert.equal(limiter.store.size(), 1, 'expired clients are forgotten, not accumulated');
});

test('clientKey prefers the Express-resolved address and never reads headers', () => {
  assert.equal(
    clientKey({ ip: '203.0.113.50', socket: { remoteAddress: '10.0.0.1' }, headers: { 'x-forwarded-for': '1.2.3.4' } }),
    '203.0.113.50',
  );
  assert.equal(clientKey({ socket: { remoteAddress: '10.0.0.2' } }), '10.0.0.2');
  assert.equal(clientKey({}), 'unknown');
});
