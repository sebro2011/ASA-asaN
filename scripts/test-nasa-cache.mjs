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

const CAD_BODY = {
  signature: { source: 'NASA/JPL Close Approach Data API', version: '1.4' },
  count: 2,
  fields: ['des', 'orbit_id', 'jd', 'cd', 'dist', 'dist_min', 'dist_max', 'v_rel', 'v_inf', 't_sigma_f', 'h', 'fullname'],
  // Exactly the shape the live API returned on 2026-11-13: dates are `2026-Nov-13`,
  // not ISO, and `fullname` arrives space-padded.
  data: [
    ['2026 AB1', '12', '2461388.5', '2026-Nov-13 04:12', '0.034512', '0.034300', '0.034724', '12.44', '13.10', '< 00:01', '22.1', '       (2026 AB1)'],
    ['2026 CD2', '4', '2461389.5', '2026-Nov-14 19:40', '0.081200', '0.081000', '0.081400', '5.02', '5.71', '< 00:01', '25.8', '       (2026 CD2)'],
  ],
};

const NEOWS_FAILS = async (url) => {
  if (url.includes('/neo/rest/v1/feed')) return jsonResponse({ error: 'stubbed outage' }, 500);
  if (url.includes('ssd-api.jpl.nasa.gov/cad.api')) return jsonResponse(CAD_BODY);
  return jsonResponse({});
};

test('when NeoWs fails the panel still gets real close approaches, from JPL, labelled derived', async () => {
  const { neowsCache, neowsCadCache } = await import('../server/nasaRoutes.ts');
  neowsCache.clear();
  neowsCadCache.clear();
  const fetchState = installFetch(NEOWS_FAILS);

  try {
    await withServer(async (base) => {
      const response = await fetch(`${base}/api/asteroids/neows?start_date=2026-11-13&end_date=2026-11-19`);
      const body = await response.json();

      assert.equal(response.status, 200, 'the panel is not left with a dead tile');
      assert.equal(body.isFallback, true, 'and the payload says the feed is a fallback');
      assert.equal(body.fallbackSource, 'jpl-cad');
      assert.equal(body.data.source, 'jpl-cad');
      assert.equal(body.data.element_count, 2);
      assert.deepEqual(Object.keys(body.data.near_earth_objects).sort(), ['2026-11-13', '2026-11-14']);
      assert.equal(body.degraded.primary, 'nasa-neows');
      assert.equal(body.degraded.upstreamStatus, 500, 'the reason NeoWs failed is reported, not swallowed');

      const first = body.data.near_earth_objects['2026-11-13'][0];
      assert.equal(first.name, '(2026 AB1)');
      assert.equal(first.is_potentially_hazardous_asteroid, null, 'no PHA flag is invented');
      assert.equal(first.estimated_diameter, null, 'no diameter is invented');
      // 0.034512 AU = 5 163 km… converted, not guessed.
      const km = Number(first.close_approach_data[0].miss_distance.kilometers);
      assert.ok(Math.abs(km - 0.034512 * 149_597_870.7) < 1, 'AU -> km is the real conversion');
      const lunar = Number(first.close_approach_data[0].miss_distance.lunar);
      assert.ok(Math.abs(lunar - 0.034512 * (149_597_870.7 / 384_400)) < 1e-6, 'AU -> lunar distances too');
      assert.equal(first.close_approach_data[0].relative_velocity.kilometers_per_second, '12.44', 'JPL velocity passes through');
      assert.equal(body.data.hazardFlags, 'unavailable');

      const again = await (await fetch(`${base}/api/asteroids/neows?start_date=2026-11-13&end_date=2026-11-19`)).json();
      assert.equal(again.cached, true, 'the derived answer is cached separately');
      assert.equal(again.isFallback, true, 'and stays labelled after caching');
      const cadCalls = fetchState.calls.filter((url) => url.includes('cad.api'));
      assert.equal(cadCalls.length, 1, 'JPL was asked once for two page loads');
      assert.match(cadCalls[0], /dist-max=0\.2/, 'the request states the envelope it used');
      assert.match(cadCalls[0], /body=Earth/);
    });
  } finally {
    fetchState.restore();
  }
});

test('JPL dates are parsed as written, and an unparseable date is dropped, not guessed', async () => {
  const { cadDateToIso } = await import('../server/nasaRoutes.ts');
  assert.equal(cadDateToIso('2026-Nov-13 01:22'), '2026-11-13');
  assert.equal(cadDateToIso('2026-Dec-01 23:59'), '2026-12-01');
  assert.equal(cadDateToIso('  2026-Jan-05 00:00 '), '2026-01-05');
  assert.equal(cadDateToIso('2026-11-13 04:12'), null, 'an ISO string is not one of JPL’s formats');
  assert.equal(cadDateToIso(''), null);
  assert.equal(cadDateToIso(null), null);
  assert.equal(cadDateToIso('2026-Foo-13'), null);
  assert.equal(cadDateToIso('2026-Nov-99'), null);
});

test('a derived answer is never stored under the live key', async () => {
  const { neowsCache, neowsCadCache } = await import('../server/nasaRoutes.ts');
  neowsCache.clear();
  neowsCadCache.clear();
  const fetchState = installFetch(NEOWS_FAILS);

  try {
    await withServer(async (base) => {
      const derived = await (await fetch(`${base}/api/asteroids/neows?start_date=2026-11-13&end_date=2026-11-13`)).json();
      assert.equal(derived.isFallback, true);
      assert.equal(neowsCache.get('2026-11-13..2026-11-13'), null, 'nothing derived enters the live cache');
    });
  } finally {
    fetchState.restore();
  }
});

test('when both sources fail the 503 carries the reason, not just a shrug', async () => {
  const { neowsCache, neowsCadCache } = await import('../server/nasaRoutes.ts');
  neowsCache.clear();
  neowsCadCache.clear();
  const fetchState = installFetch(async (url) => {
    if (url.includes('/neo/rest/v1/feed')) return jsonResponse({ error: 'quota' }, 429);
    if (url.includes('cad.api')) return jsonResponse({ error: 'down' }, 503);
    return jsonResponse({});
  });

  try {
    await withServer(async (base) => {
      const response = await fetch(`${base}/api/asteroids/neows?start_date=2026-11-13&end_date=2026-11-13`);
      const body = await response.json();
      assert.equal(response.status, 503);
      assert.equal(body.code, 'NEOWS_UNAVAILABLE');
      assert.equal(body.data, null);
      assert.equal(body.fallbackReason, 'rate-limited', 'a 429 is named as a rate limit');
      assert.equal(body.upstreamStatus, 429);
      assert.equal(typeof body.upstreamMs, 'number');
      assert.equal(body.fallback.ok, false);
      assert.equal(body.fallback.source, 'jpl-cad');
      assert.equal(body.fallback.upstreamStatus, 503);
      assert.doesNotMatch(JSON.stringify(body), /api_key/, 'no key material in the failure');
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
