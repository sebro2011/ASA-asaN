/** NeoWs failure and fallback integrity tests using injected upstream responses. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { app } from '../server.ts';
import { clearNasaApiCache, fetchAsteroidsNeows } from '../lib/nasaApi.js';

const realFetch = globalThis.fetch;

test('NeoWs route reports an outage, not invented close approaches', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const upstream of [() => { throw new Error('offline'); }, () => new Response('{"unexpected":true}', { status: 200 })]) {
      globalThis.fetch = async (...args) => upstream(...args);
      const response = await realFetch(base + '/api/asteroids/neows?start_date=2020-01-01');
      const body = await response.json();
      assert.equal(response.status, 503);
      assert.equal(body.code, 'NEOWS_UNAVAILABLE');
      assert.equal(body.data, null);
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ element_count: 0, near_earth_objects: {} }), { status: 200 });
    const response = await realFetch(base + '/api/asteroids/neows?start_date=2020-01-01');
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.near_earth_objects, {});
  } finally {
    globalThis.fetch = realFetch;
    await new Promise(resolve => server.close(resolve));
  }
});

test('client rejects legacy sample response, tries direct feed, and never caches sample', async () => {
  clearNasaApiCache();
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (String(url).startsWith('/api/')) return new Response(JSON.stringify({ isFallback: true, data: { near_earth_objects: { fake: [] } } }), { status: 200 });
    return new Response(JSON.stringify({ near_earth_objects: { '2020-01-01': [] } }), { status: 200 });
  };
  try {
    const data = await fetchAsteroidsNeows('2020-01-01', '2020-01-01');
    assert.deepEqual(Object.keys(data.near_earth_objects), ['2020-01-01']);
    assert.equal(calls.length, 2);
    await fetchAsteroidsNeows('2020-01-01', '2020-01-01');
    assert.equal(calls.length, 2);
    clearNasaApiCache();
    globalThis.fetch = async url => String(url).startsWith('/api/')
      ? new Response(JSON.stringify({ isFallback: true, data: { near_earth_objects: { fake: [] } } }), { status: 200 })
      : new Response('', { status: 503 });
    assert.equal(await fetchAsteroidsNeows('2020-01-01', '2020-01-01'), null);
  } finally {
    clearNasaApiCache();
    globalThis.fetch = realFetch;
  }
});

test('radar does not activate sample data or issue alerts during an outage', async () => {
  const source = await readFile(new URL('../src/components/AsteroidRadar.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /setAsteroids\(MOCK_NEOWS_FALLBACK\)/);
  assert.doesNotMatch(source, /checkAndNotifyCloseApproaches\(MOCK_NEOWS_FALLBACK\)/);
  assert.match(source, /setAsteroids\(\[\]\);[\s\S]*?setIsFallback\(true\)/);
  assert.match(source, /6 \* 24 \* 60 \* 60 \* 1000/);
});

test('EPIC route refuses invented fallback frames and leaves missing telemetry empty', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    globalThis.fetch = async () => { throw new Error('offline'); };
    const failed = await realFetch(base + '/api/epic');
    assert.equal(failed.status, 503);
    assert.deepEqual((await failed.json()).frames, []);
    globalThis.fetch = async () => new Response(JSON.stringify([{ identifier: '1', image: 'epic_1b_20200101000000', date: '2020-01-01 00:00:00' }]), { status: 200 });
    const response = await realFetch(base + '/api/epic');
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.frames[0].centroidCoords, null);
    assert.equal(body.frames[0].sunPos, null);
    assert.equal(body.frames[0].distanceKm, null);
    assert.match(body.frames[0].imageUrl, /\/2020\/01\/01\/png\/epic_1b_20200101000000\.png$/);
  } finally {
    globalThis.fetch = realFetch;
    await new Promise(resolve => server.close(resolve));
  }
});

test('EPIC client refuses legacy sample frames', async () => {
  const { fetchEpicEarthImagery } = await import('../lib/nasaApi.js');
  clearNasaApiCache();
  globalThis.fetch = async () => new Response(JSON.stringify({ isFallback: true, frames: [{ identifier: 'fake' }] }), { status: 200 });
  try {
    assert.deepEqual(await fetchEpicEarthImagery(), []);
  } finally {
    globalThis.fetch = realFetch;
    clearNasaApiCache();
  }
});

test('APOD historical requests cannot poison today cache and failures never invent entries', async () => {
  const { apodCache } = await import('../server/nasaRoutes.ts');
  apodCache.clear();
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const calls = [];
  try {
    globalThis.fetch = async url => {
      calls.push(String(url));
      const date = new URL(url).searchParams.get('date') || '2026-11-12';
      return new Response(JSON.stringify({ date, title: `Entry ${date}`, url: 'https://apod.nasa.gov/a.jpg', media_type: 'image' }), { status: 200 });
    };
    const historical = await (await realFetch(base + '/api/apod?date=2020-01-02')).json();
    assert.equal(historical.data.date, '2020-01-02');
    const today = await (await realFetch(base + '/api/apod')).json();
    assert.equal(today.data.date, '2026-11-12');
    assert.equal(calls.length, 2, 'today must be fetched separately');
    const invalid = await realFetch(base + '/api/apod?date=2020-02-30');
    assert.equal(invalid.status, 400);
    const invalidRange = await realFetch(base + '/api/apod-range?start_date=2021-01-01&end_date=2020-01-01');
    assert.equal(invalidRange.status, 400);
    globalThis.fetch = async () => { throw new Error('offline'); };
    const failed = await realFetch(base + '/api/apod?date=2019-01-02');
    assert.equal(failed.status, 503);
    assert.equal((await failed.json()).data, null);
    const failedRange = await realFetch(base + '/api/apod-range?start_date=2020-01-01&end_date=2020-01-02');
    assert.equal(failedRange.status, 503);
    assert.deepEqual((await failedRange.json()).data, []);
  } finally {
    globalThis.fetch = realFetch;
    apodCache.clear();
    await new Promise(resolve => server.close(resolve));
  }
});

test('APOD client rejects old sample responses and mismatched dates', async () => {
  const { fetchApod } = await import('../lib/nasaApi.js');
  clearNasaApiCache();
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ isFallback: true, data: { title: 'sample', url: 'https://example.test/x', date: '2020-01-01' } }), { status: 200 });
    assert.equal(await fetchApod('2020-01-01'), null);
    globalThis.fetch = async () => new Response(JSON.stringify({ data: { title: 'wrong date', url: 'https://example.test/x', date: '2020-01-02' } }), { status: 200 });
    assert.equal(await fetchApod('2020-01-01'), null);
  } finally { globalThis.fetch = realFetch; clearNasaApiCache(); }
});

test('exoplanet endpoint and client do not substitute sample catalog on outage', async () => {
  const { fetchExoplanets } = await import('../lib/nasaApi.js');
  clearNasaApiCache();
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    globalThis.fetch = async () => { throw new Error('offline'); };
    const response = await realFetch(base + '/api/exoplanets');
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'EXOPLANETS_UNAVAILABLE');
    globalThis.fetch = async () => new Response(JSON.stringify({ isFallback: true, exoplanets: [{ pl_name: 'fake' }] }), { status: 200 });
    assert.deepEqual(await fetchExoplanets(), []);
    globalThis.fetch = async () => new Response(JSON.stringify([{ pl_name: 'Example b', pl_eqt: null }]), { status: 200 });
    const valid = await realFetch(base + '/api/exoplanets');
    assert.equal((await valid.json()).exoplanets[0].pl_eqt, null);
  } finally {
    globalThis.fetch = realFetch;
    clearNasaApiCache();
    await new Promise(resolve => server.close(resolve));
  }
});

test('exoplanet UI does not substitute measurements or a habitability score', async () => {
  const source = await readFile(new URL('../src/components/ExoplanetLab.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /selectedPlanet\.esi \|\| 0\.82/);
  assert.doesNotMatch(source, /selectedPlanet\.pl_eqt \|\| 255/);
  assert.doesNotMatch(source, /'124 ly'/);
  assert.match(source, /Illustrative procedural textures are not observations/);
});

test('ISS endpoint returns unavailable before a fix and labels a genuine last-known fix', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    globalThis.fetch = async () => { throw new Error('offline'); };
    const empty = await realFetch(base + '/api/iss');
    assert.equal(empty.status, 503);
    assert.equal((await empty.json()).data, null);
    globalThis.fetch = async () => new Response(JSON.stringify({ latitude: 6, longitude: 80, altitude: 410, velocity: 27000, timestamp: 1600000000 }), { status: 200 });
    const live = await (await realFetch(base + '/api/iss')).json();
    assert.equal(live.data.timestamp, 1600000000000);
    globalThis.fetch = async () => { throw new Error('offline'); };
    const stale = await (await realFetch(base + '/api/iss')).json();
    assert.equal(stale.isFallback, true);
    assert.equal(stale.data.timestamp, 1600000000000);
    assert.match(stale.note, /not a current fix/);
  } finally {
    globalThis.fetch = realFetch;
    await new Promise(resolve => server.close(resolve));
  }
});

test('ISS client never treats an old server fallback as a live fix', async () => {
  const { fetchIssLocation } = await import('../lib/nasaApi.js');
  try {
    globalThis.fetch = async url => String(url).startsWith('https:')
      ? new Response('', { status: 503 })
      : new Response(JSON.stringify({ isFallback: true, data: { latitude: 1, longitude: 2, altitude: 410, velocity: 27000, timestamp: 1600000000000 } }), { status: 200 });
    const result = await fetchIssLocation();
    assert.equal(result._isSample, true);
    assert.equal(result.simulated, true);
    globalThis.fetch = async () => new Response(JSON.stringify({ latitude: 1, longitude: 2, altitude: 410, velocity: 27000, timestamp: 1600000000 }), { status: 200 });
    const live = await fetchIssLocation();
    assert.equal(live.timestamp, 1600000000000);
    assert.equal(live._isSample, false);
  } finally { globalThis.fetch = realFetch; }
});

test('ISS displays do not present distance divided by speed as a pass prediction', async () => {
  for (const name of ['../src/components/ISSTracker.jsx', '../components/IssTracker2D.jsx']) {
    const source = await readFile(new URL(name, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /countdownFormatted|minutesToClosest/);
    assert.match(source, /Next-pass time is not predict/);
  }
});
