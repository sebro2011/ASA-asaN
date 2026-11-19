/**
 * The Earth Intelligence rate limiter must not grow without bound.
 *
 * A source audit of `server/earthIntelligence.ts` found that `rateBuckets` was
 * only ever *overwritten*: an entry was deleted when the same client came back
 * after its window closed, and never otherwise. A client that appears once — or
 * a caller rotating source addresses — left an entry behind forever, so the map
 * grew with the number of distinct clients the process had ever seen. This is
 * the same defect `server/requestRateLimit.ts` documents and fixes for the other
 * NAS-powered routes; the Earth router kept its own copy of the unbounded
 * pattern.
 *
 * Scope of the claim: this is a bounded-memory defect. Nothing here shows that
 * production exhausted memory — the ceiling needs thousands of distinct clients
 * inside one process lifetime — and it is not reported as an exploited
 * vulnerability.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-earth-rate-limit-memory.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

/* The router imports without a Gemini key: the analyst provider is only resolved
 * on the POST /analyst path, which these tests do not call. */
const {
  earthRouter,
  EARTH_RATE_MAX_BUCKETS,
  EARTH_RATE_PRUNE_THRESHOLD,
  enforceRateCap,
  earthRateBucketCount,
  sweepRateBuckets,
  touchRateBucket
} = await import('../server/earthIntelligence.ts');

const NOW = 1_700_000_000_000;

function bucket(resetAt, count = 1) {
  return { count, resetAt };
}

/* ------------------------------------------------- expiration and capacity */

test('the ceiling is a real bound, not the same number as the sweep threshold', () => {
  assert.ok(EARTH_RATE_MAX_BUCKETS > EARTH_RATE_PRUNE_THRESHOLD);
  assert.ok(EARTH_RATE_MAX_BUCKETS <= 20_000, 'a bound this large would be decoration');
});

test('closed windows are swept and open windows are untouched', () => {
  const map = new Map([
    ['power:expired-1', bucket(NOW - 1)],
    ['power:expired-2', bucket(NOW)],
    ['power:open', bucket(NOW + 30_000)]
  ]);
  assert.equal(sweepRateBuckets(map, NOW), 2, 'a window closes at its own reset time');
  assert.deepEqual([...map.keys()], ['power:open']);
});

test('a sweep that finds nothing still leaves every live client limited', () => {
  const map = new Map([...Array.from({ length: 50 }, (_, i) => [`power:live-${i}`, bucket(NOW + 60_000)])]);
  assert.equal(sweepRateBuckets(map, NOW), 0);
  assert.equal(map.size, 50);
});

test('sweeping an empty map is a no-op', () => {
  assert.equal(sweepRateBuckets(new Map(), NOW), 0);
});

test('the cap trims the map back to the ceiling, dropping the soonest-to-expire first', () => {
  const size = EARTH_RATE_MAX_BUCKETS + 250;
  const map = new Map();
  for (let index = 0; index < size; index += 1) {
    // resetAt increases with the index, so the first entries are the oldest.
    map.set(`power:client-${index}`, bucket(NOW + index * 1_000));
  }
  enforceRateCap(map);
  assert.equal(map.size, EARTH_RATE_MAX_BUCKETS);
  assert.equal(map.has('power:client-0'), false, 'the oldest window is evicted');
  assert.equal(map.has(`power:client-${size - 1}`), true, 'the newest window survives');
});

test('the cap never touches a map that is already under it', () => {
  const map = new Map([['power:a', bucket(NOW + 1_000)], ['power:b', bucket(NOW + 2_000)]]);
  enforceRateCap(map);
  assert.equal(map.size, 2);
});

test('a long run of distinct clients with the sweep in place stays bounded', () => {
  // Reproduces the reported shape without 10,000 HTTP requests: 30,000 clients
  // arrive one after another, each with a 60 s window, and the limiter runs the
  // same two calls it runs in production.
  const map = new Map();
  const windowMs = 60_000;
  let clock = NOW;
  for (let index = 0; index < 30_000; index += 1) {
    clock += 4; // ~4 ms between requests: the windows genuinely expire over time
    touchRateBucket(map, `power:client-${index}`, clock, windowMs);
  }
  assert.ok(
    map.size <= EARTH_RATE_MAX_BUCKETS,
    `30 000 distinct clients must not leave more than ${EARTH_RATE_MAX_BUCKETS} buckets (left ${map.size})`
  );
});

/* ------------------------------------------------------------- over HTTP */

async function withServer(run) {
  const app = express();
  app.use('/api/earth', earthRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}/api/earth`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('repeated probes are still limited, and the 429 contract is unchanged', async () => {
  await withServer(async (base) => {
    // /swot/granules allows 20 per minute; no upstream call leaves this process
    // because the sandbox has no egress, but every request passes the limiter.
    const statuses = [];
    for (let attempt = 0; attempt < 26; attempt += 1) {
      const response = await fetch(`${base}/swot/granules`);
      statuses.push(response.status);
      if (attempt === 0) assert.notEqual(response.status, 429, 'the first request of a window is never limited');
      if (response.status === 429) {
        const body = await response.json();
        assert.equal(body.ok, false);
        assert.equal(body.code, 'rate-limited');
        assert.equal(typeof body.retryAfter, 'number');
        assert.ok(Number(response.headers.get('retry-after')) >= 1);
      }
    }
    assert.ok(statuses.filter((status) => status === 429).length > 0, 'the limiter still throttles');
    assert.ok(
      statuses.slice(0, 20).some((status) => status !== 429),
      'requests inside the budget still reach the handler'
    );
  });
});

test('a client-supplied forwarding header cannot multiply buckets', async () => {
  await withServer(async (base) => {
    const start = earthRateBucketCount();
    for (let index = 0; index < 20; index += 1) {
      await fetch(`${base}/knmi/index`, { headers: { 'X-Forwarded-For': `203.0.113.${index + 1}` } });
    }
    const added = earthRateBucketCount() - start;
    assert.ok(added <= 1, `20 spoofed addresses must not create 20 buckets (added ${added})`);
  });
});

test('the live store never exceeds the documented ceiling', () => {
  assert.ok(earthRateBucketCount() <= EARTH_RATE_MAX_BUCKETS, `tracked clients: ${earthRateBucketCount()}`);
});
