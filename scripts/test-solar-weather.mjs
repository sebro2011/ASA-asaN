/**
 * Solar weather integrity — `/api/solar-weather` must never invent a measurement.
 *
 * Regression target: the endpoint used to answer a NOAA outage with
 * `{ kpIndex: 2, status: 'quiet' }` and `success: true`, which the client
 * rendered as a live "NOAA SWPC feed". These tests pin the replacement contract:
 *
 *   1. no observation yet + upstream down  → 503, `success: false`, no Kp anywhere
 *   2. upstream up                         → parsed Kp + NOAA G-scale + timestamp
 *   3. upstream down again                 → the *same* Kp marked `stale`, with the
 *                                            timestamp of the observation, never a new number
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-solar-weather.mjs
 */
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';

const realFetch = globalThis.fetch;
let noaaMode = 'down';
let noaaCalls = 0;

const KP_TABLE = [
  ['time_tag', 'Kp', 'a_running', 'station_count'],
  ['2026-11-12 09:00:00.000', '1.67', '4', '8'],
  ['2026-11-12 12:00:00.000', '5.33', '18', '8'],
];
const PLASMA_TABLE = [
  ['time_tag', 'density', 'speed', 'temperature'],
  ['2026-11-12 11:00:00.000', '5.48', '412.6', '120000'],
  ['2026-11-12 12:00:00.000', '6.02', '587.4', '141000'],
];

globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes('services.swpc.noaa.gov')) {
    noaaCalls += 1;
    if (noaaMode === 'down') {
      // A 500 is the realistic outage; the handler must not fall back to a value.
      return new Response('upstream error', { status: 500 });
    }
    if (url.includes('planetary_k_index') || url.includes('noaa-planetary-k-index')) {
      return new Response(JSON.stringify(KP_TABLE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('plasma')) {
      return new Response(JSON.stringify(PLASMA_TABLE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }
  return realFetch(input, init);
};

let server;
let base;

before(async () => {
  const { app } = await import('../server.ts');
  const { parsePlanetaryKIndex, parsePlasmaSpeed, kpStormScale } = await import('../server/nasaRoutes.ts');
  globalThis.__parsers = { parsePlanetaryKIndex, parsePlasmaSpeed, kpStormScale };
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  globalThis.fetch = realFetch;
  if (server) server.close();
});

const callSolarWeather = async () => {
  const response = await realFetch(`${base}/api/solar-weather`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  return { status: response.status, body: await response.json() };
};

test('the Kp parser accepts both published SWPC shapes and maps the NOAA G-scale', () => {
  const { parsePlanetaryKIndex, kpStormScale } = globalThis.__parsers;

  // Shape 2: `json/planetary_k_index.json` — objects, observed on production.
  const objectShape = parsePlanetaryKIndex([
    { time_tag: '2026-11-12T09:00:00', kp_index: 1.67, estimated_kp: 1.67 },
    { time_tag: '2026-11-12T12:00:00', kp_index: 6.0, estimated_kp: 6.33, kp: 6.0 },
  ]);
  // `kp_index` is the official planetary index; `estimated_kp` is the preliminary
  // estimate, so the official value wins when both are present.
  assert.equal(objectShape.kpIndex, 6.0);
  assert.equal(objectShape.stormKey, 'G2');
  assert.equal(objectShape.observedAt, '2026-11-12T12:00:00.000Z');

  const objectEstimatedOnly = parsePlanetaryKIndex([{ time_tag: '2026-11-12T12:00:00', estimated_kp: 4.0 }]);
  assert.equal(objectEstimatedOnly.kpIndex, 4.0, 'estimated_kp is the fallback');
  assert.equal(objectEstimatedOnly.stormKey, 'G0');
  const parsed = parsePlanetaryKIndex(KP_TABLE);
  assert.equal(parsed.kpIndex, 5.33, 'the newest row wins');
  assert.equal(parsed.stormKey, 'G1');
  assert.equal(parsed.stormStatus, 'minor');
  assert.equal(parsed.observedAt, '2026-11-12T12:00:00.000Z');

  // Non-numeric and out-of-range slots are skipped, not defaulted.
  assert.equal(parsePlanetaryKIndex([['t', 'null'], ['t2', '12']]), null);
  assert.equal(parsePlanetaryKIndex([]), null);
  assert.equal(parsePlanetaryKIndex({}), null);
  assert.equal(parsePlanetaryKIndex([{ time_tag: '2026-11-12T12:00:00' }]), null, 'a row with no Kp is not a calm reading');

  assert.equal(kpStormScale(9).stormKey, 'G5');
  assert.equal(kpStormScale(4.99).stormKey, 'G0');
});

test('the plasma parser takes the newest finite speed', () => {
  const { parsePlasmaSpeed } = globalThis.__parsers;
  const parsed = parsePlasmaSpeed(PLASMA_TABLE);
  assert.equal(parsed.speedKmS, 587.4);
  assert.equal(parsed.observedAt, '2026-11-12T12:00:00.000Z');
  assert.equal(parsePlasmaSpeed([['t', '1', 'null']]), null);
});

test('an outage with no earlier observation is an error, never a calm reading', async () => {
  noaaMode = 'down';
  const { status, body } = await callSolarWeather();
  assert.equal(status, 503);
  assert.equal(body.success, false);
  assert.equal(body.code, 'UPSTREAM_UNAVAILABLE');
  assert.ok(!JSON.stringify(body).includes('"kpIndex"'), 'no Kp may appear in an outage payload');
  assert.ok(!JSON.stringify(body).includes('quiet'), 'no invented condition may appear');
  assert.ok(noaaCalls > 0, 'the handler really tried the upstream');
  // The failure carries a coarse reason from a fixed set — enough for an operator
  // to tell "NOAA refused us" from "we timed out", and nothing internal.
  assert.ok(
    /^(timeout|network|http|shape|ok)(,(timeout|network|http|shape|ok)){2}$/.test(body.reason),
    `reason must be coarse, got ${body.reason}`,
  );
  assert.match(body.reason, /http/, 'a 500 from the upstream is reported as http');
});

test('a live observation is parsed, scaled and timestamped', async () => {
  noaaMode = 'up';
  const { status, body } = await callSolarWeather();
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.stale, false);
  assert.equal(body.source, 'NOAA SWPC');
  assert.equal(body.data.kpIndex, 5.33);
  assert.equal(body.data.stormKey, 'G1');
  assert.equal(body.data.stormStatus, 'minor');
  assert.equal(body.data.observedAt, '2026-11-12T12:00:00.000Z');
  assert.equal(body.data.solarWindSpeedKmS, 587.4);
  assert.ok(body.fetchedAt, 'the response says when it was fetched');
  globalThis.__firstObservation = body;
});

test('a later outage serves the last measured observation, marked stale', async () => {
  noaaMode = 'down';
  const { status, body } = await callSolarWeather();
  assert.equal(status, 200);
  assert.equal(body.stale, true);
  assert.equal(body.code, 'CACHED');
  assert.equal(body.data.kpIndex, globalThis.__firstObservation.data.kpIndex, 'the value is the measurement, not a new guess');
  assert.equal(body.data.observedAt, globalThis.__firstObservation.data.observedAt);
  assert.equal(body.fetchedAt, globalThis.__firstObservation.fetchedAt, 'the timestamp is when it was measured');
  assert.match(body.note, /last observation/i);
});
