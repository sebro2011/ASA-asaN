/**
 * Integration tests for the Earth Intelligence endpoints.
 *
 * The Express router is mounted on a real HTTP server and every upstream NASA
 * service (POWER, GIBS, FIRMS) is replaced by a stub at the `fetch` boundary, so
 * these tests exercise the *actual* request handling, validation, caching,
 * degradation and error mapping that the browser client depends on.
 *
 * Run with:  npm run test:earth-server
 *
 * The model path of `POST /api/earth/analyst` is not exercised here (it needs a
 * real Gemini key); the not-configured path, input validation and rate limiting
 * are covered.
 */

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const realFetch = globalThis.fetch;
const upstream = [];

const CSV = [
  'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
  '7.21,80.63,331.2,0.4,0.4,2026-04-08,0530,N20,VIIRS,n,2.0NRT,295.1,12.4,D',
  '8.02,80.51,318.9,0.4,0.4,2026-04-08,0532,N20,VIIRS,l,2.0NRT,290.7,4.1,D',
  '6.71,80.11,305.4,0.4,0.4,2026-04-07,1010,N20,VIIRS,h,2.0NRT,281.3,21.9,D',
  'not-a-lat,80.11,305.4,0.4,0.4,2026-04-07,1010,N20,VIIRS,h,2.0NRT,281.3,21.9,D'
].join('\n');

function imageResponse() {
  return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
    status: 200,
    headers: { 'content-type': 'image/png', 'content-length': '4' }
  });
}

const DOMAIN_XML = (layer) => `<DomainSet>
  <Dimension>
    <Identifier>Time</Identifier>
    <Value>2000-02-24/2000-04-25/P1D</Value>
    <Value>2015-11-24/2026-10-11/P1D</Value>
  </Dimension>
</DomainSet>`.replace('Time', 'Time');

const mainStub = async (url, options = {}) => {
  const target = String(url);
  upstream.push({ url: target, method: options.method || 'GET' });

  if (target.startsWith('https://power.larc.nasa.gov/')) {
    const params = new URL(target).searchParams;
    const codes = params.get('parameters').split(',');
    if (codes.length > 2) {
      return new Response('Invalid Parameter(s): TOO_MANY', { status: 400 });
    }
    const parameter = {};
    for (const code of codes) {
      parameter[code] = {};
      for (let month = 1; month <= 12; month += 1) {
        parameter[code][`2020${String(month).padStart(2, '0')}`] = code === 'T2M' ? 25 + month : -999;
      }
    }
    return new Response(
      JSON.stringify({
        header: { title: 'NASA POWER', version: 'v9' },
        geometry: { coordinates: [79.86, 6.92, 12] },
        parameters: { T2M: { units: 'C', longname: 'Temperature at 2 Meters' } },
        properties: { parameter }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }

  if (target.includes('gibs.earthdata.nasa.gov')) {
    if (target.endsWith('/all.xml')) {
      if (target.includes('NotARealGibsLayer')) {
        return new Response('Unable to access -- invalid LAYER(s)', { status: 200, headers: { 'content-type': 'text/plain' } });
      }
      if (target.includes('VIIRS_Black_Marble')) {
        return new Response('TILEMATRIXSET is invalid for LAYER', { status: 200, headers: { 'content-type': 'text/plain' } });
      }
      return new Response(DOMAIN_XML(), { status: 200, headers: { 'content-type': 'text/xml' } });
    }
    // Tile probe.
    if (target.includes('/2019-01-01/')) {
      return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } });
    }
    return imageResponse();
  }

  if (target.includes('firms.modaps.eosdis.nasa.gov/api/area/')) {
    if (target.includes('BADKEY')) {
      return new Response('Invalid MAP_KEY', { status: 400, headers: { 'content-type': 'text/plain' } });
    }
    return new Response(CSV, { status: 200, headers: { 'content-type': 'text/csv' } });
  }

  return new Response('unexpected upstream ' + target, { status: 500 });
};

// Swappable stub: keeps `globalThis.fetch` stable so an individual test can
// simulate an upstream failure without leaking that stub into later tests.
let stubImpl = mainStub;
globalThis.fetch = (url, options) => stubImpl(url, options);

const { earthRouter } = await import('../server/earthIntelligence.ts');

const app = express();
app.use(express.json());
app.use('/api/earth', earthRouter);

let server;
let base;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api/earth`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const get = (path) => realFetch(base + path);
const post = (path, body) =>
  realFetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/* ------------------------------- health ------------------------------- */

test('GET /health reports capabilities without leaking any key', async () => {
  process.env.FIRMS_MAP_KEY = 'SECRET_KEY_VALUE';
  const response = await get('/health');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.capabilities.powerProxy, true);
  assert.equal(body.capabilities.gibsDomains, true);
  assert.equal(body.capabilities.firmsHotspots, true);
  assert.equal(body.capabilities.aiAnalyst, false, 'no GEMINI_API_KEY is configured in the test environment');
  assert.equal(JSON.stringify(body).includes('SECRET_KEY_VALUE'), false, 'the FIRMS key must never be echoed');
  delete process.env.FIRMS_MAP_KEY;
});

/* -------------------------------- POWER -------------------------------- */

test('GET /power validates arguments before touching the network', async () => {
  const before = upstream.length;
  const response = await get('/power?latitude=999&longitude=0&start=2020&end=2021&parameters=T2M');
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.code, 'invalid-arguments');
  assert.equal(upstream.length, before, 'no upstream request was made');

  const reversed = await get('/power?latitude=6.9&longitude=79.8&start=2021&end=2020');
  assert.equal(reversed.status, 400);
  assert.equal((await reversed.json()).code, 'invalid-range');
});

test('GET /power proxies NASA POWER, caches it and returns the raw payload', async () => {
  const response = await get('/power?latitude=6.9271&longitude=79.8612&start=2020&end=2020&parameters=T2M,PRECTOTCORR');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.provider, 'NASA POWER');
  assert.deepEqual(body.usedParameters, ['T2M', 'PRECTOTCORR']);
  assert.equal(body.degraded, false);
  assert.equal(body.fromCache, false);
  assert.equal(body.payload.properties.parameter.T2M['202001'], 26);
  assert.equal(body.payload.properties.parameter.PRECTOTCORR['202001'], -999, 'fill values are passed through untouched for the client to filter');

  const again = await (await get('/power?latitude=6.9271&longitude=79.8612&start=2020&end=2020&parameters=T2M,PRECTOTCORR')).json();
  assert.equal(again.fromCache, true);
  assert.equal(again.retrievedAt, body.retrievedAt, 'the cached envelope is returned unchanged');
});

test('GET /power degrades to the core parameter set when POWER rejects the list', async () => {
  const response = await get('/power?latitude=6.9271&longitude=79.8612&start=2020&end=2020&parameters=T2M,RH2M,WS2M,PRECTOTCORR');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.degraded, true);
  assert.deepEqual(body.usedParameters, ['T2M', 'PRECTOTCORR']);
  assert.equal(body.payload.properties.parameter.RH2M, undefined, 'the degraded response only contains core parameters');
});

test('GET /power maps an upstream failure to a typed 502 and an unreachable service to a typed 504', async () => {
  stubImpl = async (url) => {
    if (String(url).startsWith('https://power.larc.nasa.gov/')) {
      return new Response('service unavailable', { status: 503 });
    }
    return new Response('unexpected', { status: 500 });
  };
  const response = await get('/power?latitude=1.1&longitude=2.2&start=2020&end=2020&parameters=T2M');
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.code, 'power-error');
  assert.match(body.sourceUrl, /power\.larc\.nasa\.gov/);

  stubImpl = async () => {
    throw new TypeError('fetch failed');
  };
  const unreachable = await get('/power?latitude=1.3&longitude=2.4&start=2020&end=2020&parameters=T2M');
  assert.equal(unreachable.status, 504);
  assert.equal((await unreachable.json()).code, 'power-timeout');
  stubImpl = mainStub;
});

/* ------------------------------ GIBS domain ------------------------------ */

test('GET /gibs/domains returns the parsed observation-date domain and caches it', async () => {
  const response = await get('/gibs/domains?layer=MODIS_Terra_CorrectedReflectance_TrueColor&tileMatrixSet=GoogleMapsCompatible_Level9');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.minDate, '2000-02-24');
  assert.equal(body.maxDate, '2026-10-11');
  assert.equal(body.ranges.length, 2);
  assert.match(body.coverage, /2000-02-24 → 2026-10-11/);
  assert.match(body.sourceUrl, /DescribeDomains|all\/all\.xml/);

  const cached = await (await get('/gibs/domains?layer=MODIS_Terra_CorrectedReflectance_TrueColor&tileMatrixSet=GoogleMapsCompatible_Level9')).json();
  assert.equal(cached.fromCache, true);
});

test('GET /gibs/domains reports an invalid layer as 422 and an invalid tile matrix set with its own code', async () => {
  const invalid = await get('/gibs/domains?layer=NotARealGibsLayer&tileMatrixSet=GoogleMapsCompatible_Level9');
  assert.equal(invalid.status, 422);
  const invalidBody = await invalid.json();
  assert.equal(invalidBody.code, 'invalid-layer');

  const tms = await get('/gibs/domains?layer=VIIRS_Black_Marble&tileMatrixSet=GoogleMapsCompatible_Level9');
  assert.equal(tms.status, 422);
  assert.equal((await tms.json()).code, 'invalid-tilematrixset');
});

test('GET /gibs/domains rejects a malformed layer id without an upstream call', async () => {
  const before = upstream.length;
  const response = await get('/gibs/domains?layer=' + encodeURIComponent('<script>'));
  assert.equal(response.status, 400);
  assert.equal(upstream.length, before);
});

/* ------------------------------- GIBS probe ------------------------------- */

test('GET /gibs/probe confirms a servable tile and records the content type', async () => {
  const response = await get('/gibs/probe?layer=MODIS_Terra_CorrectedReflectance_TrueColor&date=2024-08-01');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.contentType, 'image/png');
  assert.match(body.sourceUrl, /\/default\/2024-08-01\/GoogleMapsCompatible_Level9\/1\/1\/1\.jpg$/);
  assert.match(body.note, /nearest available day/i);
});

test('GET /gibs/probe reports a missing date as not-ok instead of pretending success', async () => {
  const body = await (await get('/gibs/probe?layer=MODIS_Terra_CorrectedReflectance_TrueColor&date=2019-01-01')).json();
  assert.equal(body.ok, false);
  assert.equal(body.status, 404);
  assert.match(body.note, /did not serve an image/);
});

test('GET /gibs/probe validates the date format', async () => {
  const response = await get('/gibs/probe?layer=MODIS_Terra_CorrectedReflectance_TrueColor&date=01-02-2024');
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'invalid-date');
});

/* --------------------------------- FIRMS --------------------------------- */

test('GET /firms/hotspots states the capability is unavailable when no MAP_KEY is configured', async () => {
  delete process.env.FIRMS_MAP_KEY;
  const response = await get('/firms/hotspots?source=VIIRS_SNPP_NRT&west=79&east=82&south=6&north=10&dayRange=1');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, false);
  assert.equal(body.code, 'not-configured');
  assert.match(body.docsUrl, /firms\.modaps\.eosdis\.nasa\.gov/);
});

test('GET /firms/hotspots aggregates real CSV rows and never echoes the MAP_KEY', async () => {
  process.env.FIRMS_MAP_KEY = 'TEST_MAP_KEY';
  const response = await get('/firms/hotspots?source=VIIRS_SNPP_NRT&west=79&east=82&south=6&north=10&dayRange=1');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.detectionCount, 3, 'the row with a non-numeric latitude is dropped');
  assert.deepEqual(body.byDay, { '2026-04-08': 2, '2026-04-07': 1 });
  assert.equal(body.meanFrp, 12.8);
  assert.deepEqual(body.confidenceCounts, { n: 1, l: 1, h: 1 });
  assert.equal(JSON.stringify(body).includes('TEST_MAP_KEY'), false, 'the key must not appear in the response');

  const upstreamFirms = upstream.filter((call) => call.url.includes('firms.modaps.eosdis.nasa.gov/api/area/'));
  assert.ok(upstreamFirms.some((call) => call.url.includes('TEST_MAP_KEY/')), 'the key is used upstream');

  const badBbox = await get('/firms/hotspots?source=VIIRS_SNPP_NRT&west=82&east=79&south=6&north=10&dayRange=1');
  assert.equal(badBbox.status, 400);
  assert.equal((await badBbox.json()).code, 'invalid-bbox');

  delete process.env.FIRMS_MAP_KEY;
});

/* --------------------------------- analyst --------------------------------- */

test('POST /analyst validates the question and reports the missing AI configuration', async () => {
  const empty = await post('/analyst', { question: '', context: {}, lang: 'en' });
  assert.equal(empty.status, 400);
  assert.equal((await empty.json()).code, 'invalid-question');

  const tooLong = await post('/analyst', { question: 'x'.repeat(801), context: {}, lang: 'en' });
  assert.equal(tooLong.status, 400);

  const noKey = await post('/analyst', { question: 'Is Sri Lanka warming?', context: { areaLabel: 'Colombo' }, lang: 'en' });
  const body = await noKey.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, 'ai-not-configured');
  assert.equal(body.provider, 'local');
});

test('POST /analyst is rate limited per client', async () => {
  let limited = 0;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const response = await post('/analyst', { question: `probe ${attempt}`, context: {}, lang: 'en' });
    if (response.status === 429) limited += 1;
  }
  assert.ok(limited > 0, 'the analyst endpoint must throttle repeated calls');
});

/* --------------------------- client fallback chain --------------------------- */

test('the browser client falls back to a direct POWER call when the server proxy is unavailable', async () => {
  const { fetchPowerDataset } = await import('../src/lib/earth/power.ts');
  stubImpl = async (url) => {
    const target = String(url);
    if (target.startsWith('/api/earth/')) {
      return new Response('no server here', { status: 404 });
    }
    if (target.startsWith('https://power.larc.nasa.gov/')) {
      const codes = new URL(target).searchParams.get('parameters').split(',');
      const parameter = {};
      for (const code of codes) {
        parameter[code] = {};
        for (let month = 1; month <= 12; month += 1) {
          parameter[code][`202001`] = 26.5;
        }
      }
      return new Response(
        JSON.stringify({
          header: { title: 'NASA POWER' },
          geometry: { coordinates: [79.86, 6.92, 12] },
          properties: { parameter }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    return new Response('unexpected ' + target, { status: 500 });
  };

  const sourced = await fetchPowerDataset({
    latitude: 6.9271,
    longitude: 79.8612,
    placeLabel: 'Colombo',
    startYear: 2020,
    endYear: 2020,
    parameters: ['T2M'],
    force: true
  });
  assert.equal(sourced.data?.rows.length, 1);
  assert.equal(sourced.data?.stats.T2M.mean, 26.5);
  assert.match(sourced.provenance.sourceUrl, /power\.larc\.nasa\.gov/);
  assert.equal(sourced.status, 'live');
  stubImpl = mainStub;
});
