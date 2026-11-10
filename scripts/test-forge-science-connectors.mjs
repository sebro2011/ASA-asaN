/**
 * NOVA FORGE — shared connector adapter tests.
 *
 * No network is used: every call goes through an injected `fetchImpl`, so these
 * tests describe the adapter's contract (allowlist, timeout, cache, rate limit,
 * schema validation, key redaction, fault isolation) rather than a live service.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONNECTORS,
  assertAllowedUrl,
  sanitiseUrl,
  takeToken,
  resetRateLimits,
  clearConnectorCache,
  fetchConnector,
  connectorAvailability,
  rowToSeries,
} from '../server/forge/scienceConnectors.ts';

const jsonResponse = (payload, init = {}) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

const validateRows = (payload) => {
  if (!payload || !Array.isArray(payload.rows)) return { ok: false, reason: 'missing rows array' };
  return { ok: true, value: payload.rows };
};

test('the SSRF guard accepts only the declared https host', () => {
  assert.equal(assertAllowedUrl('https://api.nasa.gov/planetary/apod', 'api.nasa.gov').ok, true);
  assert.equal(assertAllowedUrl('http://api.nasa.gov/x', 'api.nasa.gov').ok, false);
  assert.equal(assertAllowedUrl('https://evil.example/x', 'api.nasa.gov').ok, false);
  assert.equal(assertAllowedUrl('https://api.nasa.gov@evil.example/x', 'api.nasa.gov').ok, false);
  assert.equal(assertAllowedUrl('https://user:pw@api.nasa.gov/x', 'api.nasa.gov').ok, false);
  assert.equal(assertAllowedUrl('//evil.example/x', 'api.nasa.gov').ok, false);
  assert.equal(assertAllowedUrl('https://sub.api.nasa.gov/x', 'api.nasa.gov').ok, false);
});

test('credentials are stripped from any URL that leaves the adapter', () => {
  const sanitised = sanitiseUrl('https://api.nasa.gov/planetary/apod?api_key=SECRET123&date=2024-01-01');
  assert.ok(!sanitised.includes('SECRET123'));
  assert.ok(sanitised.includes('date=2024-01-01'));
});

test('a successful retrieval is wrapped with attribution and a clean URL', async () => {
  clearConnectorCache();
  const result = await fetchConnector({
    connector: 'nasa-exoplanet-tap',
    path: '/TAP/sync?query=select+top+1+*+from+ps',
    validate: validateRows,
    fetchOptions: { fetchImpl: async () => jsonResponse({ rows: [{ pl_name: 'Kepler-186 f' }] }), now: () => 1_000_000 },
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.data.length, 1);
  assert.match(result.attribution, /NASA Exoplanet Archive/);
  assert.ok(!result.requestUrl.includes('api_key'));
  assert.equal(result.cacheHit, false);
});

test('the second identical request is served from cache, not the network', async () => {
  clearConnectorCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({ rows: [{ a: 1 }] });
  };
  const options = {
    connector: 'jpl-small-body-db',
    path: '/sbdb.api?sstr=433',
    validate: validateRows,
    fetchOptions: { fetchImpl, now: () => 5_000_000 },
  };
  const first = await fetchConnector(options);
  const second = await fetchConnector(options);
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(calls, 1);
  assert.equal(second.status, 'ok');
});

test('a refresh bypasses the cache deliberately', async () => {
  clearConnectorCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({ rows: [] });
  };
  const base = { connector: 'nasa-osdr', path: '/x', validate: validateRows };
  await fetchConnector({ ...base, fetchOptions: { fetchImpl, now: () => 9_000_000 } });
  await fetchConnector({ ...base, fetchOptions: { fetchImpl, now: () => 9_000_000, refresh: true } });
  assert.equal(calls, 2);
});

test('a timeout is reported as a timeout and never as data', async () => {
  clearConnectorCache();
  const fetchImpl = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
  const result = await fetchConnector({
    connector: 'nasa-exoplanet-tap',
    path: '/TAP/sync?query=slow',
    validate: validateRows,
    fetchOptions: { fetchImpl, timeoutMs: 20, maxAttempts: 1 },
  });
  assert.equal(result.status, 'timeout');
  assert.equal(result.data, null);
  assert.equal(result.code, 'timeout');
  assert.match(result.message, /did not respond within 20 ms/);
});

test('a schema mismatch is rejected rather than partially trusted', async () => {
  clearConnectorCache();
  const result = await fetchConnector({
    connector: 'jpl-small-body-db',
    path: '/sbdb.api?sstr=bad',
    validate: validateRows,
    fetchOptions: { fetchImpl: async () => jsonResponse({ unexpected: true }) },
  });
  assert.equal(result.status, 'schema-invalid');
  assert.equal(result.data, null);
  assert.match(result.message, /missing rows array/);
});

test('a redirect is refused instead of followed off the allowlist', async () => {
  clearConnectorCache();
  const result = await fetchConnector({
    connector: 'nasa-open-api',
    path: '/planetary/apod',
    validate: validateRows,
    fetchOptions: {
      fetchImpl: async () => new Response('', { status: 302, headers: { location: 'https://evil.example/steal' } }),
    },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.code, 'redirect-blocked');
});

test('HTTP 429 is reported as rate limited without retrying', async () => {
  clearConnectorCache();
  let calls = 0;
  const result = await fetchConnector({
    connector: 'nasa-osdr',
    path: '/429',
    validate: validateRows,
    fetchOptions: {
      fetchImpl: async () => {
        calls += 1;
        return new Response('', { status: 429 });
      },
      maxAttempts: 3,
    },
  });
  assert.equal(result.status, 'rate-limited');
  assert.equal(calls, 1);
});

test('a 500 is retried and then reported as unavailable', async () => {
  clearConnectorCache();
  let calls = 0;
  const result = await fetchConnector({
    connector: 'nasa-osdr',
    path: '/500',
    validate: validateRows,
    fetchOptions: {
      fetchImpl: async () => {
        calls += 1;
        return new Response('', { status: 503 });
      },
      maxAttempts: 2,
    },
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(calls, 2);
  assert.equal(result.code, 'http-503');
});

test('a network error becomes a typed result, never an exception', async () => {
  clearConnectorCache();
  const result = await fetchConnector({
    connector: 'nasa-osdr',
    path: '/network',
    validate: validateRows,
    fetchOptions: {
      fetchImpl: async () => {
        throw Object.assign(new Error('boom at /internal/path'), { name: 'TypeError' });
      },
      maxAttempts: 1,
    },
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.code, 'network-error');
  assert.ok(!result.message.includes('/internal/path'), 'internal detail leaked into the message');
});

test('the token bucket refuses a burst beyond the per-minute limit', () => {
  resetRateLimits();
  const now = 42_000_000;
  const allowed = Array.from({ length: 12 }, () => takeToken('test-host', 10, now));
  assert.equal(allowed.filter(Boolean).length, 10);
  assert.equal(allowed.slice(10).every((value) => value === false), true);
  // One minute later the bucket has refilled.
  assert.equal(takeToken('test-host', 10, now + 60_001), true);
});

test('a rate-limited host returns a typed rate-limited result', async () => {
  resetRateLimits();
  clearConnectorCache();
  const now = 77_000_000;
  for (let index = 0; index < 20; index += 1) takeToken(CONNECTORS['nasa-exoplanet-tap'].host, 20, now);
  const result = await fetchConnector({
    connector: 'nasa-exoplanet-tap',
    path: '/limited',
    validate: validateRows,
    fetchOptions: { fetchImpl: async () => jsonResponse({ rows: [] }), now: () => now },
  });
  assert.equal(result.status, 'rate-limited');
  resetRateLimits();
});

test('connector availability is descriptor-based and never probes the network', () => {
  const availability = connectorAvailability({});
  assert.equal(availability.length, 4);
  const keyed = availability.find((entry) => entry.id === 'nasa-open-api');
  assert.equal(keyed.requiresKey, true);
  assert.equal(keyed.configured, false);
  assert.match(keyed.note, /NASA_API_KEY/);
  const configured = connectorAvailability({ NASA_API_KEY: 'x' }).find((entry) => entry.id === 'nasa-open-api');
  assert.equal(configured.configured, true);
});

test('row normalisation drops unusable rows and reports how many', () => {
  const { series, reason } = rowToSeries(
    [
      { time: '2024-01-01', value: '12.5' },
      { time: '2024-01-02', value: '' },
      { time: null, value: 3 },
      { time: '2024-01-03', value: 'n/a' },
    ],
    { name: 'temperature', unit: 'K', sourceUnit: 'K', valueColumn: 'value', timeColumn: 'time' },
  );
  assert.equal(series.values.length, 1);
  assert.equal(series.values[0], 12.5);
  assert.equal(series.missing, 3);
  assert.match(reason, /3 row\(s\) dropped/);
});

test('normalisation never turns a missing value into zero', () => {
  const { series } = rowToSeries(
    [
      { time: '2024-01-01', value: null },
      { time: '2024-01-02', value: 0 },
    ],
    { name: 'x', unit: 'K', sourceUnit: 'K', valueColumn: 'value', timeColumn: 'time' },
  );
  assert.deepEqual(series.values, [0]);
  assert.equal(series.missing, 1);
});
