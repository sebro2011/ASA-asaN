/**
 * COSMORA Earth Intelligence — Multi-Agency Space Apps research hub tests.
 *
 * Pure unit tests for the resource matrix, the native-format parsers
 * (GES DISC asc2, NOAA GSOM, KNMI .dat, Giovanni/AppEEARS/NOAA CSV),
 * the Giovanni / GES DISC / AppEEARS URL & task builders, the validated
 * statistical cross-agency analysis, and the Express `/api/earth/*`
 * route contracts (stubbed at the `fetch` boundary — no live NASA/NOAA/
 * KNMI calls, no secrets required).
 *
 * Run with:  node --import tsx --test scripts/test-earth-space-apps.mjs
 */

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { earthRouter } from '../server/earthIntelligence.ts';

const realFetch = globalThis.fetch;

const CMR_PAYLOAD = {
  feed: {
    entry: [
      {
        producer_granule_id: 'SWOT_L2_LR_SSH_Basic_2.0_20260101T000000Z_001',
        title: 'SWOT_L2_LR_SSH_Basic_2.0_20260101T000000Z_001',
        dataset_id: 'SWOT_L2_LR_SSH_Basic_2.0',
        time_start: '2026-01-01T00:00:00Z',
        time_end: '2026-01-01T01:00:00Z',
        cycle_number: 1,
        pass_number: 1
      }
    ]
  }
};

const KNMI_DMI_TEXT = `# KNMI Climate Explorer - DMI
   YYYY   MM    dmi
  2020    1   -0.20
  2020    2    0.10
`;

before(() => {
  globalThis.fetch = async (url, options) => {
    const target = String(url);
    if (target.includes('cmr.earthdata.nasa.gov')) {
      return new Response(JSON.stringify(CMR_PAYLOAD), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cmr-hits': '1'
        }
      });
    }
    if (target.includes('climexp.knmi.nl')) {
      return new Response(KNMI_DMI_TEXT, {
        status: 200,
        headers: { 'content-type': 'text/plain' }
      });
    }
    return realFetch(url, options);
  };
});

after(() => {
  globalThis.fetch = realFetch;
});
import {
  SPACE_APPS_RESOURCE_MATRIX,
  parseGesDiscAsc2,
  parseNoaaGsomSeries,
  parseKnmiAsciiSeries,
  parseExternalTimeSeriesCsv,
  buildGiovanniDeepLink,
  buildGesDiscDataRodUrl,
  buildAppeearsPointTaskSpec,
  analyzeExternalSeries
} from '../src/lib/earth/spaceAppsResources.ts';
import { computeDatasetHydrology, computeHistoricalSplit, tTest } from '../src/lib/earth/climateEngine.ts';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

let server;

async function withServer(fn) {
  const app = express();
  app.use('/api/earth', earthRouter);
  await new Promise((resolve) => {
    server = app.listen(0, () => resolve());
  });
  try {
    const addr = server.address();
    const baseUrl = `http://127.0.0.1:${addr.port}`;
    await fn(app, baseUrl);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
    server = null;
  }
}

async function getJson(baseUrl, path) {
  const res = await fetch(`${baseUrl}${path}`, { headers: { Accept: 'application/json' } });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/* ------------------------------------------------------------------ */
/* Resource matrix                                                    */
/* ------------------------------------------------------------------ */

test('resource matrix has seven entries with valid agency taxonomy', (t) => {
  assert.equal(SPACE_APPS_RESOURCE_MATRIX.length, 7);
  const ids = SPACE_APPS_RESOURCE_MATRIX.map((r) => r.id);
  assert.ok(ids.includes('nasa-power'));
  assert.ok(ids.includes('nasa-hydrology-rods'));
  assert.ok(ids.includes('nasa-giovanni'));
  assert.ok(ids.includes('nasa-appeears'));
  assert.ok(ids.includes('noaa-cdo'));
  assert.ok(ids.includes('knmi-climexp'));
  assert.ok(ids.includes('csa-swot'));

  const categories = [];
  for (const res of SPACE_APPS_RESOURCE_MATRIX) {
    assert.ok(typeof res.name === 'string' && res.name.length > 0);
    assert.ok(typeof res.agencyLabel === 'string' && res.agencyLabel.length > 0);
    assert.ok(
      ['nasa', 'partner-agency', 'research-institution', 'community'].includes(res.agencyCategory),
      `${res.id} has invalid agencyCategory`
    );
    assert.ok(
      ['live-keyless-api', 'live-token-api', 'portal-workflow-and-import'].includes(
        res.integrationMode
      ),
      `${res.id} has invalid integrationMode`
    );
    assert.ok(typeof res.usableApiSummary === 'string' && res.usableApiSummary.length > 0);
    assert.ok(typeof res.rateLimitPolicy === 'string' && res.rateLimitPolicy.length > 0);
    assert.ok(Array.isArray(res.primaryVariables) && res.primaryVariables.length > 0);
    assert.ok(typeof res.limitationsNote === 'string' && res.limitationsNote.length > 0);
    assert.ok(typeof res.officialUrl === 'string' && res.officialUrl.startsWith('http'));
    categories.push(res.agencyCategory);
  }

  assert.ok(categories.includes('nasa'), 'at least one Official NASA resource');
  assert.ok(categories.includes('partner-agency'), 'at least one Partner Agency resource');
  assert.ok(categories.includes('research-institution'), 'at least one Research Institution resource');
});

test('resource matrix honesty: portals are not mislabelled as keyless background APIs', (t) => {
  const byId = Object.fromEntries(SPACE_APPS_RESOURCE_MATRIX.map((r) => [r.id, r]));
  assert.equal(byId['nasa-giovanni'].integrationMode, 'portal-workflow-and-import');
  assert.equal(byId['nasa-appeears'].integrationMode, 'portal-workflow-and-import');
  assert.equal(byId['knmi-climexp'].agencyCategory, 'research-institution');
  assert.equal(byId['csa-swot'].agencyCategory, 'partner-agency');
  assert.ok(/CSA|CNES|NASA|UKSA/.test(byId['csa-swot'].agencyLabel));
});

/* ------------------------------------------------------------------ */
/* Native-format parsers                                              */
/* ------------------------------------------------------------------ */

const GESDISC_ASC2 = `param_short_name=SoilMoi0_10cm_inst
latitude=6.9271
longitude=79.8612
BeginDate=2020-01-01
EndDate=2020-03-31
data
2020-01 0.234
2020-02 0.210
2020-03 -999.0
`;

test('parseGesDiscAsc2 filters missing fill values and returns a series', (t) => {
  const series = parseGesDiscAsc2(GESDISC_ASC2, {
    latitude: 6.9271,
    longitude: 79.8612
  });
  assert.equal(series.sourceId, 'nasa-hydrology-rods');
  assert.equal(series.agencyCategory, 'nasa');
  assert.equal(series.points.length, 2); // -999.0 fill removed
  assert.equal(series.points[0].date, '2020-01');
  assert.equal(series.points[0].value, 0.234);
  assert.equal(series.points[1].date, '2020-02');
  assert.equal(series.points[1].value, 0.21);
});

const KNMI_DAT = `# STATION data
# De Bilt, Netherlands
   YYYY   MM   value
  2020    1   5.20
  2020    2   6.10
  2020    3  -999.00
`;

test('parseKnmiAsciiSeries parses KNMI ASCII and drops sentinels', (t) => {
  const series = parseKnmiAsciiSeries(KNMI_DAT, {
    title: 'KNMI test',
    variableLabel: 'Test variable',
    unit: '°C',
    sourceUrl: 'https://climexp.knmi.nl/test',
    retrievedAt: '2026-01-01T00:00:00Z',
    spatialNote: 'test'
  });
  assert.equal(series.points.length, 2);
  assert.equal(series.points[0].value, 5.2);
  assert.equal(series.points[1].value, 6.1);
});

const NOAA_GSOM_RECORDS = [
  { station: 'USW00012839', datatype: 'TAVG', date: '2020-01-01', value: 24.5 },
  { station: 'USW00012839', datatype: 'TAVG', date: '2020-02-01', value: 26.0 },
  { station: 'USW00012839', datatype: 'TAVG', date: '2020-03-01', value: -9999 }
];

test('parseNoaaGsomSeries builds a gauge series with units', (t) => {
  const series = parseNoaaGsomSeries({
    station: { id: 'USW00012839', name: 'Colombo Test', latitude: 6.9, longitude: 79.9 },
    records: NOAA_GSOM_RECORDS,
    datatype: 'TAVG',
    sourceUrl: 'https://www.ncei.noaa.gov/cdo-web/api/v2/test'
  });
  assert.equal(series.points.length, 2); // -9999 filtered
  assert.equal(series.unit, '°C');
  assert.equal(series.agencyCategory, 'partner-agency');
  assert.equal(series.points[0].value, 24.5);
});

const GIOVANNI_CSV = `# Giovanni subsetted time series
# Parameter: GPM_3IMERGDF_07_precipitation
date,precipitation
2020-01,120.5
2020-02,95.0
2020-03,200.0
`;

test('parseExternalTimeSeriesCsv auto-detects Giovanni CSV', (t) => {
  const series = parseExternalTimeSeriesCsv(GIOVANNI_CSV);
  assert.equal(series.points.length, 3);
  assert.equal(series.points[0].date, '2020-01');
  assert.equal(series.points[0].value, 120.5);
  assert.equal(series.agencyCategory, 'nasa');
});

/* ------------------------------------------------------------------ */
/* URL & task builders                                                */
/* ------------------------------------------------------------------ */

test('buildGiovanniDeepLink encodes bbox, dates and variable', (t) => {
  const url = buildGiovanniDeepLink({
    bbox: { west: 79.5, south: 5.9, east: 81.9, north: 10.0 },
    startYear: 2015,
    endYear: 2024,
    dataField: 'GPM_3IMERGDF_07_precipitation'
  });
  assert.ok(url.startsWith('https://giovanni.gsfc.nasa.gov/'));
  assert.ok(url.includes('#service=ArAvTs'));
  assert.ok(url.includes('GPM_3IMERGDF_07_precipitation'));
  assert.ok(url.includes('2015-01-01') && url.includes('2024-12-31'));
});

test('buildGesDiscDataRodUrl builds a GES DISC rod URL', (t) => {
  const url = buildGesDiscDataRodUrl({
    latitude: 6.9271,
    longitude: 79.8612,
    startYear: 2000,
    endYear: 2020,
    variable: 'GLDAS2:GLDAS_NOAH025_M_v2.1:SoilMoi0_10cm_inst'
  });
  assert.ok(url.startsWith('https://'));
  assert.ok(url.includes('SoilMoi0_10cm_inst'));
  assert.ok(url.includes('2000-01-01') && url.includes('2020-12-31'));
});

test('buildAppeearsPointTaskSpec emits valid API v1 point task JSON', (t) => {
  const spec = buildAppeearsPointTaskSpec({
    label: 'Colombo',
    latitude: 6.9271,
    longitude: 79.8612,
    startYear: 2015,
    endYear: 2024
  });
  assert.equal(spec.task_type, 'point');
  assert.ok(spec.task_name.startsWith('COSMORA_'));
  assert.ok(spec.params && typeof spec.params === 'object');
  assert.ok(Array.isArray(spec.params.layers));
  assert.ok(spec.params.layers.some((layer) => layer.product === 'SPL3SMP_E.006'));
  assert.equal(spec.params.dates[0].startDate, '01-01-2015');
  assert.equal(spec.params.dates[0].endDate, '12-31-2024');
});

/* ------------------------------------------------------------------ */
/* Validated statistical analysis on external series                  */
/* ------------------------------------------------------------------ */

function makePowerDataset() {
  const rows = [];
  for (let y = 1995; y <= 2024; y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      rows.push({
        date: `${y}-${String(m).padStart(2, '0')}`,
        year: y,
        month: m,
        values: { PRECTOTCORR: 3 + Math.sin(m) + (y - 1995) * 0.1, T2M: 25 + Math.sin(m) }
      });
    }
  }
  return {
    latitude: 6.9271,
    longitude: 79.8612,
    placeLabel: 'Colombo',
    rows,
    available: ['PRECTOTCORR', 'T2M'],
    unavailable: [],
    requestedParameters: ['PRECTOTCORR', 'T2M'],
    startYear: 1995,
    endYear: 2024,
    stats: {
      PRECTOTCORR: {
        unit: 'mm/day',
        mean: 3.0,
        min: { value: 2.0, date: '1995-01' },
        max: { value: 4.0, date: '1995-07' },
        annual: []
      },
      T2M: {
        unit: '°C',
        mean: 27.0,
        min: { value: 24.0, date: '1995-01' },
        max: { value: 30.0, date: '1995-07' },
        annual: []
      }
    }
  };
}

test('analyzeExternalSeries runs Mann–Kendall, Pettitt and Bretherton correlation', (t) => {
  const series = {
    id: 'custom-csv',
    sourceId: 'custom-csv',
    title: 'Imported NOAA PRCP',
    variableLabel: 'Monthly total precipitation',
    unit: 'mm/month',
    agencyLabel: 'NOAA NCEI Climate Data Online',
    agencyCategory: 'partner-agency',
    sourceUrl: 'https://www.ncei.noaa.gov/cdo-web/api/v2/test',
    retrievedAt: '2026-01-01T00:00:00Z',
    spatialNote: 'nearest gauge station',
    coverageStart: '2000-01',
    coverageEnd: '2024-12',
    points: []
  };
  for (let y = 2000; y <= 2024; y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      series.points.push({
        date: `${y}-${String(m).padStart(2, '0')}`,
        year: y,
        month: m,
        value: 100 + (y - 2000) * 0.5 + Math.sin(m)
      });
    }
  }

  const analysis = analyzeExternalSeries(series, makePowerDataset(), 'PRECTOTCORR');
  assert.equal(analysis.series.title, 'Imported NOAA PRCP');
  assert.equal(analysis.completeYearsCount, 25);
  assert.ok(analysis.mannKendall.eligible);
  assert.equal(typeof analysis.mannKendall.pValue, 'number');
  assert.ok(analysis.mannKendall.pValue >= 0 && analysis.mannKendall.pValue <= 1);
  assert.equal(typeof analysis.mannKendall.interpretation, 'string');
  assert.ok(analysis.pettitt.eligible);
  assert.ok(analysis.seasonalMannKendall.eligible);
  assert.equal(typeof analysis.seasonalMannKendall.interpretation, 'string');
  assert.equal(typeof analysis.pettitt.interpretation, 'string');
  assert.ok(analysis.correlationWithPower !== null);
  assert.ok(analysis.correlationWithPower.eligible);
  assert.ok(typeof analysis.correlationWithPower.pearsonR === 'number');
});

/* ------------------------------------------------------------------ */
/* Hydrology summary on a POWER dataset                               */
/* ------------------------------------------------------------------ */

test('computeDatasetHydrology returns a valid hydrological summary', (t) => {
  const summary = computeDatasetHydrology(makePowerDataset());
  assert.equal(typeof summary.methodLabel, 'string');
  assert.equal(typeof summary.caveat, 'string');
  assert.equal(typeof summary.eligible, 'boolean');
  assert.ok(Array.isArray(summary.points));
  assert.equal(typeof summary.severeDroughtMonths, 'number');
  assert.equal(typeof summary.severeWetMonths, 'number');
  assert.ok(summary.soilSurfaceMean === null || typeof summary.soilSurfaceMean === 'number');
  assert.ok(summary.soilRootMean === null || typeof summary.soilRootMean === 'number');
});

test('tTest picks Welch when variances differ and Student when equal', (t) => {
  // Clearly unequal variances -> Welch's unequal-variance test.
  const unequal = tTest([1, 2, 3, 4, 5], [10, 11, 12, 13, 100], 0.05);
  assert.ok(unequal.eligible);
  assert.equal(unequal.testName, "Welch's t-test (unequal variances)");
  assert.ok(typeof unequal.pValue === 'number' && unequal.pValue >= 0 && unequal.pValue <= 1);
  assert.ok(Array.isArray(unequal.confidenceInterval95));
  assert.equal(typeof unequal.interpretation, 'string');

  // Equal variances -> Student's pooled test, not significant.
  const equal = tTest([1, 2, 3, 4, 5], [2, 3, 4, 5, 6], 0.05);
  assert.ok(equal.eligible);
  assert.equal(equal.testName, "Student's t-test (equal variances)");
  assert.equal(equal.equalVariancesAssumed, true);
  assert.ok(equal.pValue >= 0.05);

  // Deliberately large shift -> significant, CI excludes zero.
  const shifted = tTest([1, 2, 3, 4, 5], [11, 12, 13, 14, 15], 0.05);
  assert.ok(shifted.eligible);
  assert.equal(shifted.significantAt05, true);
  assert.ok(shifted.confidenceInterval95[0] > 0 || shifted.confidenceInterval95[1] > 0);

  // Insufficient samples.
  const tooSmall = tTest([1], [2, 3], 0.05);
  assert.equal(tooSmall.eligible, false);
  assert.equal(tooSmall.significantAt05, null);
});

test('computeHistoricalSplit reports a two-sample t-test on epoch means', (t) => {
  const dataset = makePowerDataset();
  const split = computeHistoricalSplit(dataset, 'PRECTOTCORR');
  assert.ok(split !== null);
  assert.ok(split.tTest !== null);
  assert.ok(
    ['Student\'s t-test (equal variances)', "Welch's t-test (unequal variances)"].includes(
      split.tTest.testName
    ),
    `unexpected test name: ${split.tTest.testName}`
  );
  assert.equal(split.tTest.n1, split.earlyYears);
  assert.equal(split.tTest.n2, split.recentYears);
  assert.ok(typeof split.tTest.pValue === 'number' && split.tTest.pValue >= 0 && split.tTest.pValue <= 1);
  assert.ok(typeof split.tTest.interpretation === 'string');
});

/* ------------------------------------------------------------------ */
/* Express route contracts (stubbed fetch at the boundary)            */
/* ------------------------------------------------------------------ */

test('GET /api/earth/sources reports server capability flags', async (t) => {
  await withServer(async (_app, baseUrl) => {
    const res = await getJson(baseUrl, '/api/earth/sources');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(typeof res.body.retrievedAt === 'string');
    assert.equal(typeof res.body.serverCapabilities.noaaCdoConfigured, 'boolean');
    assert.equal(typeof res.body.serverCapabilities.gesDiscEarthdataConfigured, 'boolean');
    assert.equal(res.body.resources.length, 7);
  });
});

test('GET /api/earth/swot/granules returns CMR discovery shape', async (t) => {
  await withServer(async (_app, baseUrl) => {
    const res = await getJson(
      baseUrl,
      '/api/earth/swot/granules?west=79.5&south=5.9&east=81.9&north=10&collection=SWOT_L2_LR_SSH_Basic_2.0'
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.collection, 'SWOT_L2_LR_SSH_Basic_2.0');
    assert.ok(typeof res.body.totalHits === 'number');
    assert.ok(Array.isArray(res.body.granules));
    assert.ok(typeof res.body.agencyAttribution === 'string' && res.body.agencyAttribution.length > 0);
    assert.ok(/CSA/.test(res.body.agencyAttribution));
    assert.ok(typeof res.body.retrievedAt === 'string');
  });
});

test('GET /api/earth/noaa/cdo returns 503 when NOAA_CDO_TOKEN is unset', async (t) => {
  const saved = process.env.NOAA_CDO_TOKEN;
  delete process.env.NOAA_CDO_TOKEN;
  try {
    await withServer(async (_app, baseUrl) => {
      const res = await getJson(
        baseUrl,
        '/api/earth/noaa/cdo?latitude=6.9&longitude=79.9&start=2010&end=2020&datatype=PRCP'
      );
      assert.equal(res.status, 503);
      assert.equal(res.body.ok, false);
      assert.ok(/NOAA_CDO_TOKEN/.test(res.body.message));
    });
  } finally {
    if (saved === undefined) delete process.env.NOAA_CDO_TOKEN;
    else process.env.NOAA_CDO_TOKEN = saved;
  }
});

test('GET /api/earth/hydrology/gesdisc returns 503 + rodUrl when Earthdata token unset', async (t) => {
  const saved = process.env.EARTHDATA_BEARER_TOKEN;
  delete process.env.EARTHDATA_BEARER_TOKEN;
  try {
    await withServer(async (_app, baseUrl) => {
      const res = await getJson(
        baseUrl,
        '/api/earth/hydrology/gesdisc?latitude=6.9&longitude=79.9&start=2000&end=2020&variable=SoilMoi0_10cm_inst'
      );
      assert.equal(res.status, 503);
      assert.equal(res.body.ok, false);
      assert.ok(typeof res.body.rodUrl === 'string' && res.body.rodUrl.startsWith('https://'));
      assert.ok(/EARTHDATA_BEARER_TOKEN/.test(res.body.message));
    });
  } finally {
    if (saved === undefined) delete process.env.EARTHDATA_BEARER_TOKEN;
    else process.env.EARTHDATA_BEARER_TOKEN = saved;
  }
});

test('GET /api/earth/knmi/index allows only nino34/dmi', async (t) => {
  await withServer(async (_app, baseUrl) => {
    const okRes = await getJson(baseUrl, '/api/earth/knmi/index?id=dmi');
    assert.equal(okRes.status, 200);
    assert.equal(okRes.body.ok, true);
    assert.ok(okRes.body.series.title.toLowerCase().includes('dipole'));

    const badRes = await getJson(baseUrl, '/api/earth/knmi/index?id=not-an-index');
    assert.equal(badRes.status, 400);
  });
});
