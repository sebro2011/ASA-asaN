/**
 * NASA proxy caching + client timeouts.
 *
 * Three proxies used to re-hit their upstream on every request, which spends the
 * shared DEMO_KEY quota (25/hour) on identical answers. These tests hold the
 * cache to the claims made about it: it expires, it is bounded, it never labels a
 * stale value as fresh, and an upstream failure is still an outage — not a reason
 * to serve yesterday's numbers.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-nasa-cache.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTtlCache, maxAgeSeconds } from '../server/ttlCache.ts';

/* ------------------------------------------------------------ the cache itself */

test('a value is served inside the TTL and gone after it', () => {
  let now = 1_000_000;
  const cache = createTtlCache({ ttlMs: 10_000, now: () => now });

  cache.set('a', { value: 1 });
  const hit = cache.get('a');
  assert.equal(hit.value.value, 1);
  assert.equal(hit.ageMs, 0);
  assert.equal(hit.remainingMs, 10_000);

  now += 9_999;
  assert.ok(cache.get('a'), 'valid until the boundary');
  now += 1;
  assert.equal(cache.get('a'), null, 'expired exactly at ttlMs');
  assert.equal(cache.size, 0, 'an expired entry is dropped, not kept as stale');
});

test('the cache is bounded and evicts the oldest entry first', () => {
  const cache = createTtlCache({ ttlMs: 60_000, maxEntries: 3 });
  for (const key of ['a', 'b', 'c', 'd']) cache.set(key, key);

  assert.equal(cache.size, 3);
  assert.equal(cache.get('a'), null, 'the oldest entry made room for the newest');
  assert.ok(cache.get('d'));
});

test('overwriting a key does not grow the cache or serve the old value', () => {
  const cache = createTtlCache({ ttlMs: 60_000, maxEntries: 5 });
  cache.set('k', 'first');
  cache.set('k', 'second');
  assert.equal(cache.size, 1);
  assert.equal(cache.get('k').value, 'second');
});

test('an expired entry can be re-stored with an explicit timestamp', () => {
  let now = 0;
  const cache = createTtlCache({ ttlMs: 1_000, now: () => now });
  cache.set('x', 'old', now - 5_000);
  assert.equal(cache.get('x'), null);
  cache.set('x', 'new');
  assert.equal(cache.get('x').value, 'new');
});

test('maxAgeSeconds never emits a negative or fractional header value', () => {
  assert.equal(maxAgeSeconds(9_999), 9);
  assert.equal(maxAgeSeconds(0), 0);
  assert.equal(maxAgeSeconds(-500), 0);
});

/* --------------------------------------------------------------- the routes */

function installFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    // The test itself talks to the local server over fetch; only upstream
    // traffic is stubbed, or the assertions would be testing the stub.
    if (target.includes('127.0.0.1') || target.includes('localhost')) {
      return original(target, init);
    }
    calls.push(target);
    return handler(target, init);
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

function jsonResponse(body, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) };
}

async function withServer(run) {
  const { app } = await import('../server.ts');
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const NEOWS_BODY = {
  near_earth_objects: {
    '2026-11-13': [
      {
        id: '2000001',
        name: '(2026 AB)',
        nasa_jpl_url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=2000001',
        is_potentially_hazardous_asteroid: false,
        estimated_diameter: { kilometers: { estimated_diameter_min: 0.01, estimated_diameter_max: 0.02 } },
        close_approach_data: [
          {
            close_approach_date: '2026-11-13',
            relative_velocity: { kilometers_per_hour: '1000' },
            miss_distance: { kilometers: '1000000' },
          },
        ],
      },
    ],
  },
};

test('NeoWs answers from cache on the second request and says so honestly', async () => {
  const { neowsCache } = await import('../server/nasaRoutes.ts');
  neowsCache.clear();
  const fetchState = installFetch(async (url) => {
    if (url.includes('/neo/rest/v1/feed')) return jsonResponse(NEOWS_BODY);
    return jsonResponse({});
  });

  try {
    await withServer(async (base) => {
      const first = await fetch(`${base}/api/asteroids/neows?start_date=2026-11-13&end_date=2026-11-13`);
      const firstBody = await first.json();
      assert.equal(first.status, 200);
      assert.equal(firstBody.cached, false, 'a fresh answer is labelled fresh');
      assert.ok(firstBody.fetchedAt, 'and carries when it was fetched');
      assert.match(first.headers.get('cache-control') || '', /public, max-age=\d+/);
      assert.doesNotMatch(first.headers.get('cache-control') || '', /no-store/);

      const second = await fetch(`${base}/api/asteroids/neows?start_date=2026-11-13&end_date=2026-11-13`);
      const secondBody = await second.json();
      assert.equal(secondBody.cached, true, 'the second request is a cache hit');
      assert.deepEqual(secondBody.data, firstBody.data, 'and it is the same data');
      assert.equal(secondBody.fetchedAt, firstBody.fetchedAt, 'with the original fetch time, not now');

      const upstreamCalls = fetchState.calls.filter((url) => url.includes('/neo/rest/v1/feed'));
      assert.equal(upstreamCalls.length, 1, 'NASA was called once for two requests');
    });
  } finally {
    fetchState.restore();
  }
});

test('a different date range is a different cache entry', async () => {
  const { neowsCache } = await import('../server/nasaRoutes.ts');
  neowsCache.clear();
  const fetchState = installFetch(async (url) => (url.includes('/neo/rest/v1/feed') ? jsonResponse(NEOWS_BODY) : jsonResponse({})));

  try {
    await withServer(async (base) => {
      await fetch(`${base}/api/asteroids/neows?start_date=2026-11-13&end_date=2026-11-13`);
      const other = await fetch(`${base}/api/asteroids/neows?start_date=2026-11-12&end_date=2026-11-12`);
      const body = await other.json();
      assert.equal(body.cached, false, 'another range is not answered from this range’s entry');
      assert.equal(fetchState.calls.filter((url) => url.includes('/neo/rest/v1/feed')).length, 2);
    });
  } finally {
    fetchState.restore();
  }
});

test('an upstream outage stays an outage: no cached number is dressed up as current', async () => {
  const { neowsCache } = await import('../server/nasaRoutes.ts');
  neowsCache.clear();

  const fetchState = installFetch(async () => {
    throw new TypeError('fetch failed: stubbed NASA outage');
  });

  try {
    await withServer(async (base) => {
      const response = await fetch(`${base}/api/asteroids/neows?start_date=2026-11-13&end_date=2026-11-13`);
      const body = await response.json();
      assert.equal(response.status, 503);
      assert.equal(body.code, 'NEOWS_UNAVAILABLE');
      assert.equal(body.data, null, 'no data object at all, cached or otherwise');
      assert.equal(body.cached, undefined, 'a failure is not labelled as a cache hit');
    });
  } finally {
    fetchState.restore();
  }
});

test('EPIC caches its frame list too', async () => {
  const { epicCache } = await import('../server/nasaRoutes.ts');
  epicCache.clear();

  const frames = [
    {
      image: 'epic_1b_20261112003633',
      date: '2026-11-12 00:36:33',
      caption: 'Earth from DSCOVR',
      identifier: 'x',
      centroid_coordinates: { lat: 1, lon: 2 },
    },
  ];
  const fetchState = installFetch(async (url) => (url.includes('/EPIC/api/natural') ? jsonResponse(frames) : jsonResponse({})));

  try {
    await withServer(async (base) => {
      const first = await (await fetch(`${base}/api/epic`)).json();
      const second = await (await fetch(`${base}/api/epic`)).json();
      assert.equal(first.cached, false);
      assert.equal(second.cached, true);
      assert.deepEqual(second.frames, first.frames);
      assert.equal(fetchState.calls.filter((url) => url.includes('/EPIC/api')).length, 1);
    });
  } finally {
    fetchState.restore();
  }
});

/* ------------------------------------------------------------ client timeouts */

test('the two legacy client helpers cannot hang forever', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../lib/nasaApi.js', import.meta.url), 'utf8');

  for (const endpoint of ['/api/satellites', '/api/news']) {
    const call = new RegExp(`fetch\\('${endpoint.replace('/', '\\/')}',\\s*\\{[^}]*signal`, 's');
    assert.match(source, call, `${endpoint} must pass an abort signal`);
  }
  assert.match(source, /CLIENT_FETCH_TIMEOUT_MS/);
});

test('a timed-out satellites request resolves to an empty list, not a rejection', async () => {
  const { fetchSatellites } = await import('../lib/nasaApi.js');
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  const seen = [];

  // Simulate the browser: the signal aborts and the fetch rejects with AbortError.
  AbortSignal.timeout = () => {
    const controller = new AbortController();
    controller.abort();
    return controller.signal;
  };
  globalThis.fetch = async (_url, init) => {
    seen.push(Boolean(init?.signal));
    throw Object.assign(new Error('aborted'), { name: 'AbortError' });
  };

  try {
    const result = await fetchSatellites();
    assert.deepEqual(result, [], 'the caller gets an empty registry it can render');
    assert.equal(seen[0], true, 'the request carried a signal');
  } finally {
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
  }
});

test('a timed-out news request falls back to clearly labelled samples', async () => {
  const { fetchNasaNews } = await import('../lib/nasaApi.js');
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;

  AbortSignal.timeout = () => {
    const controller = new AbortController();
    controller.abort();
    return controller.signal;
  };
  globalThis.fetch = async () => {
    throw Object.assign(new Error('aborted'), { name: 'AbortError' });
  };

  try {
    const articles = await fetchNasaNews();
    assert.ok(Array.isArray(articles) && articles.length > 0, 'the UI has something to render');
    assert.ok(articles.every((item) => item._isSample === true), 'and every item is marked as not live');
  } finally {
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
  }
});
