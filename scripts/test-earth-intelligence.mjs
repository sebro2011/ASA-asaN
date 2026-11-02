/**
 * Earth Intelligence Lab — unit tests for the pure data layer.
 *
 * Run with:  npm run test:earth
 * (equivalently: node --import tsx --test scripts/test-earth-intelligence.mjs)
 *
 * These tests cover the logic that decides what the UI is allowed to claim:
 * observation-date availability, POWER parsing/statistics, the deterministic
 * analyst, the report builder and the integrity of the verified layer catalog.
 * Live NASA service checks live in scripts/verify-earth-services.mjs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDomain,
  checkAvailability,
  classifyDescribeDomainsError,
  describeCoverage,
  domainDates,
  isIsoDate,
  latestReportedDate,
  nearestDateInDomain,
  parseTimeValues
} from '../src/lib/earth/domains.ts';
import {
  analyzeTrend,
  benjaminiHochbergCorrection,
  bonferroniCorrection,
  buildPowerUrl,
  buildSeriesStats,
  completenessFraction,
  hamedRaoCorrection,
  lag1Autocorrelation,
  leastSquaresTrend,
  mannKendallS,
  mannKendallTest,
  mannKendallVariance,
  mannKendallZ,
  meanOf,
  missingDataReport,
  normalCdf,
  normalQuantile,
  normalTwoTailedP,
  parseParameter,
  parsePowerResponse,
  POWER_PARAMETERS,
  precipMonthlyTotal,
  precipMonthlyTotals,
  sensSlope,
  sensSlopeConfidenceInterval,
  validateParameterQuality
} from '../src/lib/earth/power.ts';
import { buildLocalAnalystAnswer, classifyQuestion, describeSeries } from '../src/lib/earth/analysis.ts';
import { buildAnalystContext, buildMarkdownReport, contextForRequest, powerSeriesCsv } from '../src/lib/earth/context.ts';
import {
  GIBS_LAYERS,
  DEFAULT_LAYER_ID,
  getGibsLayer,
  layersByCategory,
  describeDomainsUrl,
  wmtsTileUrl,
  wmsGetMapUrl
} from '../src/lib/earth/gibsCatalog.ts';
import { imagerySource } from '../src/lib/earth/gibsClient.ts';
import { validateCoordinates, boundingBoxAround } from '../src/lib/earth/geo.ts';
import { searchGazetteer, SRI_LANKA_PLACES } from '../src/lib/earth/geocode.ts';

/* ----------------------------- domains ----------------------------- */

const SAMPLE_DOMAIN_XML = `
<DomainSet>
  <Dimension>
    <Identifier>Time</Identifier>
    <Value>2000-02-24/2000-04-25/P1D</Value>
    <Value>2000-04-28/2001-06-15/P1D</Value>
  </Dimension>
  <Dimension>
    <Identifier>Time</Identifier>
    <Value>2012-01-01T00:00:00Z</Value>
  </Dimension>
</DomainSet>`;

test('parseTimeValues reads ISO ranges and single instants, and drops duplicates', () => {
  const ranges = parseTimeValues(SAMPLE_DOMAIN_XML);
  assert.equal(ranges.length, 3);
  assert.deepEqual(ranges[0], { start: '2000-02-24', end: '2000-04-25', period: 'P1D' });
  assert.deepEqual(ranges[2], { start: '2012-01-01', end: '2012-01-01', period: 'P0D' });
});

test('parseTimeValues tolerates service whitespace and trailing counters', () => {
  const ranges = parseTimeValues('time\n2019-07-23/2021-02-19/P1D,2021-02-22/2022-11-08/P1D11');
  assert.equal(ranges.length, 2);
  assert.equal(ranges[0].start, '2019-07-23');
  assert.equal(ranges[1].end, '2022-11-08');
});

test('classifyDescribeDomainsError reports the three GIBS failure modes', () => {
  assert.equal(classifyDescribeDomainsError('<ExceptionText>Invalid Layer</ExceptionText>')?.code, 'invalid-layer');
  assert.equal(classifyDescribeDomainsError('TILEMATRIXSET is invalid for LAYER')?.code, 'invalid-tilematrixset');
  assert.equal(classifyDescribeDomainsError('<ows:ExceptionReport/>')?.code, 'service-error');
  assert.equal(classifyDescribeDomainsError('2000-02-24/2000-04-25/P1D'), null);
});

test('buildDomain throws typed errors and computes min/max coverage', () => {
  assert.throws(() => buildDomain({ layerId: 'X', xml: 'Invalid Layer', sourceUrl: 'u' }), /invalid/i);

  const domain = buildDomain({ layerId: 'X', xml: SAMPLE_DOMAIN_XML, sourceUrl: 'https://example.test/x.xml' });
  assert.equal(domain.minDate, '2000-02-24');
  assert.equal(domain.maxDate, '2012-01-01');
  assert.equal(domain.ranges.length, 3);
});

test('checkAvailability distinguishes available, gap and unknown dates', () => {
  const domain = buildDomain({ layerId: 'X', xml: SAMPLE_DOMAIN_XML, sourceUrl: 'u' });
  assert.equal(checkAvailability(domain, 'X', '2000-03-01').verdict, 'available');
  assert.equal(checkAvailability(domain, 'X', '2001-07-01').verdict, 'outside-domain');
  assert.equal(checkAvailability(domain, 'X', '2000-04-26').nearestDate, '2000-04-25');
  assert.equal(checkAvailability(null, 'X', '2000-03-01').verdict, 'unknown');
});

test('domainDates and latestReportedDate never look into the future', () => {
  const domain = buildDomain({
    layerId: 'X',
    xml: 'time2020-01-01/2099-12-31/P1D1',
    sourceUrl: 'u'
  });
  const dates = domainDates(domain, 500);
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(dates.every((date) => date <= today), 'no future observation dates are offered');
  assert.ok(latestReportedDate(domain) <= today);
});

test('describeCoverage summarises gaps', () => {
  const domain = buildDomain({ layerId: 'X', xml: SAMPLE_DOMAIN_XML, sourceUrl: 'u' });
  const coverage = describeCoverage(domain);
  assert.match(coverage, /2000-02-24 → 2012-01-01/);
  assert.match(coverage, /reported periods/);
  assert.equal(describeCoverage(null), undefined);
});

test('isIsoDate rejects impossible calendar dates', () => {
  assert.equal(isIsoDate('2024-02-29'), true);
  assert.equal(isIsoDate('2023-02-29'), false);
  assert.equal(isIsoDate('2024-13-01'), false);
  assert.equal(isIsoDate('2024-1-1'), false);
});

test('nearestDateInDomain clamps to range boundaries', () => {
  const domain = buildDomain({ layerId: 'X', xml: SAMPLE_DOMAIN_XML, sourceUrl: 'u' });
  assert.equal(nearestDateInDomain(domain, '1999-01-01'), '2000-02-24');
  assert.equal(nearestDateInDomain(domain, '2015-01-01'), '2012-01-01');
});

/* ------------------------------ POWER ------------------------------ */

test('parseParameter skips fill values and the month-13 annual aggregate', () => {
  const parsed = parseParameter({ '201901': 27.5, '201902': -999, '201913': 27.9, '2019': 5, '201903': 'nope' });
  assert.equal(parsed.size, 1);
  assert.equal(parsed.get('201901'), 27.5);
});

test('buildPowerUrl requests only the requested parameters and clamps years', () => {
  const url = buildPowerUrl(6.9271, 79.8612, ['T2M', 'PRECTOTCORR'], 2015, 2024);
  assert.match(url, /parameters=T2M%2CPRECTOTCORR/);
  assert.match(url, /latitude=6\.9271/);
  assert.match(url, /longitude=79\.8612/);
  assert.match(url, /start=2015&end=2024/);
});

test('leastSquaresTrend needs at least two complete years', () => {
  assert.equal(leastSquaresTrend([{ year: 2020, mean: 1, complete: true }]), null);
  const trend = leastSquaresTrend([
    { year: 2018, mean: 10, complete: true },
    { year: 2019, mean: 12, complete: true },
    { year: 2020, mean: 14, complete: true },
    { year: 2021, mean: 99, complete: false }
  ]);
  assert.equal(trend?.years, 3);
  assert.ok(Math.abs((trend?.slopePerYear ?? 0) - 2) < 1e-9);
});

test('buildSeriesStats computes mean, extremes, annual means and completeness', () => {
  const rows = [];
  for (let month = 1; month <= 12; month += 1) {
    rows.push({ date: `2020-${String(month).padStart(2, '0')}`, year: 2020, month, values: { T2M: 20 + month } });
  }
  rows.push({ date: '2021-01', year: 2021, month: 1, values: { T2M: null } });

  const stats = buildSeriesStats(rows, 'T2M', '°C');
  assert.equal(stats.count, 12);
  assert.equal(stats.mean, 26.5);
  assert.equal(stats.min?.date, '2020-01');
  assert.equal(stats.max?.date, '2020-12');
  assert.equal(stats.annual.find((entry) => entry.year === 2020)?.complete, true);
  assert.equal(stats.annual.find((entry) => entry.year === 2021)?.complete, false);
  assert.equal(stats.trend, null);
});

test('parsePowerResponse separates returned from unreturned parameters', () => {
  const payload = {
    header: { title: 'NASA POWER', version: 'v9' },
    geometry: { coordinates: [79.86, 6.92, 12] },
    properties: {
      parameter: {
        T2M: { '202001': 26.1, '202002': 27.2 },
        PRECTOTCORR: { '202001': 1.1, '202002': -999 }
      }
    }
  };
  const parsed = parsePowerResponse(payload, ['T2M', 'PRECTOTCORR', 'WS2M']);
  assert.deepEqual(parsed.available, ['T2M', 'PRECTOTCORR']);
  assert.deepEqual(parsed.unavailable, ['WS2M']);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[1].values.PRECTOTCORR, null);
  assert.equal(parsed.elevationMeters, 12);
});

test('POWER parameter metadata stays consistent with the core set', () => {
  const codes = POWER_PARAMETERS.map((parameter) => parameter.code);
  assert.deepEqual([...new Set(codes)], codes, 'no duplicated parameter codes');
  assert.ok(codes.includes('T2M') && codes.includes('PRECTOTCORR'));
  assert.ok(POWER_PARAMETERS.every((parameter) => parameter.unit && parameter.notes));
});

test('meanOf ignores nulls and returns null for empty input', () => {
  assert.equal(meanOf([1, null, 3, undefined]), 2);
  assert.equal(meanOf([]), null);
});

/* ---------------------------- deterministic analyst ---------------------------- */

const baseContext = {
  areaLabel: 'Sri Lanka (island-wide)',
  latitude: 7.8731,
  longitude: 80.7718,
  dates: ['2024-08-01'],
  layers: [
    {
      id: DEFAULT_LAYER_ID,
      title: 'MODIS Terra — Corrected Reflectance (True Color)',
      category: 'true-color',
      unit: 'reflectance (RGB composite, no physical unit)',
      coverage: '2000-02-24 → 2026-10-11',
      availability: { verdict: 'available', requestedDate: '2024-08-01', detail: 'inside a reported observation period' },
      provenanceUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/X/default/GoogleMapsCompatible_Level9/all/all.xml'
    }
  ],
  domains: [],
  power: {
    placeLabel: 'Sri Lanka (island-wide)',
    latitude: 7.8731,
    longitude: 80.7718,
    requestedParameters: ['T2M', 'PRECTOTCORR'],
    available: ['T2M'],
    unavailable: ['PRECTOTCORR'],
    rows: 240,
    firstMonth: '2005-01',
    lastMonth: '2025-12',
    stats: [
      {
        code: 'T2M',
        unit: '°C',
        count: 240,
        mean: 27.11,
        min: { value: 24.2, date: '2006-01' },
        max: { value: 30.1, date: '2019-04' },
        trend: { slopePerYear: 0.021, fromYear: 2005, toYear: 2024, years: 20 },
        annual: []
      }
    ],
    sourceUrl: 'https://power.larc.nasa.gov/api/temporal/monthly/point?...',
    retrievedAt: '2026-10-11T00:00:00.000Z'
  },
  dataGaps: ['PRECTOTCORR was requested but not returned.']
};

test('local analyst separates verified, derived, interpretation, limitations and gaps', () => {
  const answer = buildLocalAnalystAnswer('Is vegetation increasing here?', baseContext);
  const kinds = answer.sections.map((section) => section.kind);
  assert.deepEqual(kinds, ['verified', 'derived', 'interpretation', 'limitations', 'gaps']);
  assert.equal(answer.provider, 'local');
  assert.equal(answer.groundedInRetrievedData, true);

  const verified = answer.sections.find((section) => section.kind === 'verified').bullets.join(' ');
  assert.match(verified, /27\.11/, 'retrieved mean appears in the verified section');
  assert.match(verified, /240 monthly records/);

  const derived = answer.sections.find((section) => section.kind === 'derived').bullets.join(' ');
  assert.match(derived, /0\.021/);

  const gaps = answer.sections.find((section) => section.kind === 'gaps').bullets.join(' ');
  assert.match(gaps, /PRECTOTCORR/);

  const interpretation = answer.sections.find((section) => section.kind === 'interpretation').bullets.join(' ');
  assert.match(interpretation, /must not be presented as a verified climate trend/i);
});

test('local analyst never invents sources outside the retrieved context', () => {
  const answer = buildLocalAnalystAnswer('What do you see?', baseContext);
  const allowed = new Set([
    baseContext.layers[0].provenanceUrl,
    baseContext.power.sourceUrl
  ]);
  assert.ok(answer.sources.length > 0);
  for (const source of answer.sources) {
    assert.ok(allowed.has(source.url), `source ${source.url} must come from the retrieved bundle`);
  }
});

test('question classification routes trend/imagery/fire/flood framing', () => {
  assert.equal(classifyQuestion('Is temperature increasing?'), 'trend');
  assert.equal(classifyQuestion('What do these two images show?'), 'imagery');
  assert.equal(classifyQuestion('Where are the fire hotspots?'), 'fire');
  assert.equal(classifyQuestion('How large was the flood?'), 'flood');
  assert.equal(classifyQuestion('Hello'), 'general');
});

test('describeSeries states the record length and hedges the slope', () => {
  const lines = describeSeries(baseContext.power.stats[0]);
  assert.match(lines[0], /240 monthly values/);
  assert.match(lines[1], /Least-squares slope/);
});

/* ------------------------------ context + report ------------------------------ */

test('buildAnalystContext records provenance gaps without inventing values', () => {
  const context = buildAnalystContext({
    area: { label: 'Colombo', latitude: 6.9271, longitude: 79.8612, source: 'gazetteer', bounds: [6.75, 79.75, 7.1, 80.05] },
    primaryDate: '2024-08-01',
    compareDate: '2023-08-01',
    layers: [{ layer: getGibsLayer(DEFAULT_LAYER_ID), domain: null, availability: undefined, probeOk: false }],
    power: null
  });
  assert.equal(context.dates.length, 2);
  assert.ok(context.dataGaps.some((gap) => /cannot establish a trend/i.test(gap)));
  assert.ok(context.dataGaps.some((gap) => /domain/i.test(gap)));
  assert.ok(context.dataGaps.some((gap) => /renderable image/i.test(gap)));
  assert.ok(context.dataGaps.some((gap) => /POWER archive was retrieved/i.test(gap)));
});

test('the request bundle is JSON serialisable and free of undefined values', () => {
  const context = buildAnalystContext({
    area: { label: 'Colombo', latitude: 6.9271, longitude: 79.8612, source: 'gazetteer' },
    primaryDate: '2024-08-01',
    layers: [{ layer: getGibsLayer(DEFAULT_LAYER_ID), domain: null }],
    power: null
  });
  const body = contextForRequest(context, 'What is available?');
  const json = JSON.stringify(body);
  assert.ok(json.length > 0);
  assert.equal(json.includes('undefined'), false);
});

test('markdown report contains provenance, timestamps and explicit exclusions', () => {
  const context = buildAnalystContext({
    area: { label: 'Colombo', latitude: 6.9271, longitude: 79.8612, source: 'gazetteer' },
    primaryDate: '2024-08-01',
    layers: [{ layer: getGibsLayer(DEFAULT_LAYER_ID), domain: null }],
    power: null
  });
  const markdown = buildMarkdownReport({
    area: { label: 'Colombo', latitude: 6.9271, longitude: 79.8612, source: 'gazetteer' },
    primaryDate: '2024-08-01',
    layers: [{ layer: getGibsLayer(DEFAULT_LAYER_ID), domain: null }],
    power: null,
    context,
    generatedAt: '2026-10-11T00:00:00.000Z'
  });
  assert.match(markdown, /# Earth Intelligence Lab — observation report/);
  assert.match(markdown, /What is not included in this report/);
  assert.match(markdown, /No values are interpolated/);
  assert.match(markdown, /No NASA POWER archive was retrieved/);
  assert.match(markdown, /gibs\.earthdata\.nasa\.gov/);
});

test('power CSV exports only retrieved parameters and keeps nulls empty', () => {
  const csv = powerSeriesCsv({
    latitude: 6.9,
    longitude: 79.8,
    placeLabel: 'Colombo',
    rows: [
      { date: '2020-01', year: 2020, month: 1, values: { T2M: 26.1, WS2M: null } },
      { date: '2020-02', year: 2020, month: 2, values: { T2M: 27.4, WS2M: null } }
    ],
    available: ['T2M'],
    unavailable: ['WS2M'],
    requestedParameters: ['T2M', 'WS2M'],
    startYear: 2020,
    endYear: 2020,
    gridNote: 'grid',
    stats: {}
  });
  assert.match(csv.split('\n')[0], /^month,T2M,T2M_unit/);
  assert.match(csv, /2020-01,26\.1/);
  assert.equal(csv.includes('WS2M'), false);
});

/* -------------------------------- catalog -------------------------------- */

test('catalog entries are unique, complete and free of layers GIBS rejected', () => {
  const ids = GIBS_LAYERS.map((layer) => layer.id);
  assert.deepEqual([...new Set(ids)], ids, 'layer identifiers are unique');
  assert.ok(ids.length >= 15, 'catalog keeps a useful breadth of datasets');

  const rejected = ['MODIS_Aqua_Chlorophyll_A', 'MODIS_Terra_Snow_Cover', 'MOD44B_Combined_Fractional_Non-Photosynthetic_Vegetation'];
  rejected.forEach((id) => assert.equal(ids.includes(id), false, `${id} was rejected by GIBS and must not ship`));

  for (const layer of GIBS_LAYERS) {
    assert.ok(layer.title && layer.summary, `${layer.id} has human readable metadata`);
    assert.ok(layer.limitations.length > 30, `${layer.id} documents its limitations`);
    assert.ok(layer.appropriateFor.length > 0, `${layer.id} documents its intended use`);
    assert.equal(layer.verifiedOn, '2026-10-11');
    assert.ok(['describe-domains', 'catalog'].includes(layer.verification));
    if (layer.service === 'wmts') {
      assert.match(layer.tileMatrixSet || '', /^GoogleMapsCompatible_Level\d+$/);
      assert.ok(['jpg', 'png'].includes(layer.format));
    }
  }
  assert.ok(getGibsLayer(DEFAULT_LAYER_ID), 'default layer exists');
});

test('imagery URLs follow the documented GIBS REST patterns', () => {
  const layer = getGibsLayer(DEFAULT_LAYER_ID);
  const domainUrl = describeDomainsUrl(layer);
  assert.match(domainUrl, /wmts\/epsg3857\/best\/1\.0\.0\/MODIS_Terra_CorrectedReflectance_TrueColor\/default\/GoogleMapsCompatible_Level9\/all\/all\.xml/);

  const tile = wmtsTileUrl(layer, '2024-08-01', layer.tileMatrixSet, 'jpg', 4, 6, 12);
  assert.match(tile, /\/default\/2024-08-01\/GoogleMapsCompatible_Level9\/4\/6\/12\.jpg$/);

  const source = imagerySource(layer, '2024-08-01');
  assert.equal(source.type, 'wmts');
  assert.match(source.url, /\{z\}\/\{y\}\/\{x\}\.jpg$/);

  const fireLayer = getGibsLayer('VIIRS_SNPP_Thermal_Anomalies_375m_All');
  const fireSource = imagerySource(fireLayer, '2024-08-01');
  assert.equal(fireSource.type, 'wms');
  assert.match(fireSource.url, /TIME=2024-08-01/);
  assert.match(fireSource.url, /LAYERS=VIIRS_SNPP_Thermal_Anomalies_375m_All/);

  const wms = wmsGetMapUrl({ layer, time: '2024-08-01', bbox3857: [0, 0, 1000, 1000], width: 256, height: 256 });
  assert.match(wms, /CRS=EPSG%3A3857|CRS=EPSG:3857/);
  assert.match(wms, /TIME=2024-08-01/);
});

/* ---------------------------- geo + gazetteer ---------------------------- */

test('coordinate validation rejects out-of-range input', () => {
  assert.equal(validateCoordinates(6.9, 79.8), true);
  assert.equal(validateCoordinates(91, 0), false);
  assert.equal(validateCoordinates(0, 181), false);
  assert.equal(validateCoordinates(Number.NaN, 10), false);
});

test('bounding boxes are clamped to valid latitudes and longitudes', () => {
  const bounds = boundingBoxAround(89.5, 179.5, 2);
  assert.equal(bounds[3] <= 180, true);
  assert.equal(bounds[2] <= 90, true);
});

test('Sri Lankan gazetteer covers districts, forests and coasts with valid coordinates', () => {
  assert.ok(SRI_LANKA_PLACES.length >= 20);
  for (const place of SRI_LANKA_PLACES) {
    assert.ok(validateCoordinates(place.latitude, place.longitude), `${place.name} has valid coordinates`);
    assert.ok(place.latitude > 5.5 && place.latitude < 10, `${place.name} lies within Sri Lanka's latitude band`);
    assert.ok(place.longitude > 79 && place.longitude < 82, `${place.name} lies within Sri Lanka's longitude band`);
  }
  const results = searchGazetteer('sinharaja');
  assert.equal(results[0].label, 'Sinharaja Forest Reserve');
  assert.equal(searchGazetteer('colombo')[0].label, 'Colombo');
});

/* ---------------------------- catalog grouping ---------------------------- */

test('catalog groups every layer by category and sorts by priority', () => {
  const grouped = layersByCategory();
  const groupedTotal = Object.values(grouped).reduce((sum, list) => sum + list.length, 0);
  assert.equal(groupedTotal, GIBS_LAYERS.length, 'every layer appears in exactly one category group');
  for (const [category, list] of Object.entries(grouped)) {
    assert.ok(list.length > 0, `${category} group is not empty`);
    const priorities = list.map((layer) => layer.priority || 0);
    assert.deepEqual([...priorities].sort((a, b) => b - a), priorities, `${category} is sorted by priority`);
  }
  assert.ok(grouped['true-color'].length >= 3);
  assert.ok(grouped.fire.length >= 2);
});

/* ------------------------------ statistics ------------------------------ */

test('normalCdf is symmetric and monotone', () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-9, 'normalCdf(0) ≈ 0.5');
  assert.ok(normalCdf(1) > normalCdf(0));
  assert.ok(normalCdf(-1) < normalCdf(0));
  assert.ok(Math.abs(normalCdf(-1) - (1 - normalCdf(1))) < 1e-9, 'symmetry');
  assert.ok(normalCdf(3) > 0.99);
});

test('normalQuantile inverts normalCdf', () => {
  for (const p of [0.01, 0.05, 0.5, 0.95, 0.99]) {
    assert.ok(Math.abs(normalCdf(normalQuantile(p)) - p) < 1e-6, `p=${p}`);
  }
});

test('normalTwoTailedP returns valid p-values', () => {
  assert.ok(Math.abs(normalTwoTailedP(0) - 1) < 1e-8, 'p(0) ≈ 1');
  assert.ok(normalTwoTailedP(1.96) < 0.051, 'z=1.96 gives p≈0.05');
  assert.ok(normalTwoTailedP(1.96) > 0.049);
  assert.ok(normalTwoTailedP(2.58) < 0.011, 'z=2.58 gives p≈0.01');
});

test('mannKendallS computes the S statistic', () => {
  // Strictly increasing series: every pair contributes +1
  assert.equal(mannKendallS([1, 2, 3, 4, 5]), 10); // 5*4/2 = 10
  // Strictly decreasing series: every pair contributes -1
  assert.equal(mannKendallS([5, 4, 3, 2, 1]), -10);
  // Constant series: S = 0
  assert.equal(mannKendallS([3, 3, 3, 3]), 0);
});

test('mannKendallVariance applies tie correction', () => {
  const noTies = mannKendallVariance([1, 2, 3, 4, 5]);
  assert.equal(noTies, (5 * 4 * 15) / 18); // n(n-1)(2n+5)/18 = 500/18 ≈ 27.78

  const withTies = mannKendallVariance([1, 1, 2, 2, 3]);
  assert.ok(withTies < noTies, 'ties reduce the variance');
});

test('mannKendallZ applies continuity correction', () => {
  assert.equal(mannKendallZ(0, 10), 0);
  assert.equal(mannKendallZ(5, 10), (5 - 1) / Math.sqrt(10));
  assert.equal(mannKendallZ(-5, 10), (-5 + 1) / Math.sqrt(10));
  assert.equal(mannKendallZ(1, 0), null); // zero variance
});

test('mannKendallTest detects increasing and decreasing trends', () => {
  const increasing = mannKendallTest([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], {
    total: 10, valid: 10, missing: 0, missingIndices: [],
    validValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    validIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  });
  assert.equal(increasing.trend, 'increasing');
  assert.ok(increasing.significant, 'perfectly increasing series is significant');
  assert.ok(increasing.s > 0);

  const decreasing = mannKendallTest([10, 9, 8, 7, 6, 5, 4, 3, 2, 1], {
    total: 10, valid: 10, missing: 0, missingIndices: [],
    validValues: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    validIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  });
  assert.equal(decreasing.trend, 'decreasing');
  assert.ok(decreasing.significant);
  assert.ok(decreasing.s < 0);

  const noTrend = mannKendallTest([5, 5, 5, 5, 5], {
    total: 5, valid: 5, missing: 0, missingIndices: [],
    validValues: [5, 5, 5, 5, 5],
    validIndices: [0, 1, 2, 3, 4]
  });
  assert.equal(noTrend.trend, 'no-trend');
  assert.ok(!noTrend.significant);
});

test('mannKendallTest handles ties correctly', () => {
  const withTies = mannKendallTest([1, 2, 2, 3, 4, 5, 6, 7, 8, 9], {
    total: 10, valid: 10, missing: 0, missingIndices: [],
    validValues: [1, 2, 2, 3, 4, 5, 6, 7, 8, 9],
    validIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  });
  assert.ok(withTies.variance < (10 * 9 * 25) / 18, 'tie correction reduces variance');
});

test('sensSlope computes the median of pairwise slopes', () => {
  // Linear series y = x: slope = 1
  const linear = sensSlope([0, 1, 2, 3, 4]);
  assert.equal(linear.slope, 1);
  assert.equal(linear.nPairs, 10); // 5*4/2

  // Constant series: slope = 0
  const constant = sensSlope([3, 3, 3]);
  assert.equal(constant.slope, 0);

  // Fewer than 2 observations: null
  const tooFew = sensSlope([42]);
  assert.equal(tooFew.slope, null);
  assert.equal(tooFew.nPairs, 0);
});

test('sensSlopeConfidenceInterval produces a valid interval', () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const sen = sensSlope(values);
  const ci = sensSlopeConfidenceInterval(sen.slopes, values.length, { alpha: 0.05 });
  assert.ok(ci !== null);
  assert.ok(ci.lower <= sen.slope, 'lower bound <= slope');
  assert.ok(ci.upper >= sen.slope, 'upper bound >= slope');
  assert.equal(ci.alpha, 0.05);
  assert.ok(ci.nPairs > 0);
});

test('analyzeTrend combines MK test, Sen slope, CI and Hamed-Rao', () => {
  const values = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const missing = {
    total: 12, valid: 11, missing: 1, missingIndices: [5],
    validValues: values,
    validIndices: [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11]
  };
  const result = analyzeTrend(values, missing, {
    parameterCode: 'T2M',
    observationsPerYear: 12
  });

  assert.equal(result.trend, 'increasing');
  assert.ok(result.significant);
  assert.ok(result.senSlope !== null);
  assert.ok(result.senSlope.slope !== null);
  assert.ok(result.senSlope.slope > 0);
  assert.ok(result.senSlopeCi !== null);
  assert.ok(result.senSlopeCi.lower <= result.senSlope.slope);
  assert.ok(result.senSlopeCi.upper >= result.senSlope.slope);
  assert.equal(result.observationsPerYear, 12);
  assert.ok(result.senSlopePerYear !== null);
  assert.ok(Math.abs(result.senSlopePerYear - result.senSlope.slope * 12) < 1e-9);
  assert.ok(result.hamedRao.note.length > 0);
  assert.ok(result.missing.missing === 1);
});

test('analyzeTrend with insufficient data returns null trend', () => {
  const result = analyzeTrend([42], {
    total: 1, valid: 1, missing: 0, missingIndices: [],
    validValues: [42], validIndices: [0]
  });
  assert.equal(result.trend, 'no-trend');
  assert.equal(result.senSlope.slope, null);
  assert.equal(result.senSlopeCi, null);
});

test('lag1Autocorrelation detects serial correlation', () => {
  // Positively autocorrelated: each value close to the previous
  const pos = lag1Autocorrelation([1, 1.1, 1.2, 1.3, 1.4]);
  assert.ok(pos > 0.5, `strong positive autocorrelation: ${pos}`);

  // Alternating: negative autocorrelation
  const neg = lag1Autocorrelation([1, 0, 1, 0, 1, 0]);
  assert.ok(neg < -0.5, `strong negative autocorrelation: ${neg}`);

  // Constant: zero
  const zero = lag1Autocorrelation([5, 5, 5]);
  assert.equal(zero, 0);
});

test('hamedRaoCorrection inflates variance for positive autocorrelation', () => {
  const values = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2];
  const s = mannKendallS(values);
  const variance = mannKendallVariance(values);
  const z = mannKendallZ(s, variance);
  const hr = hamedRaoCorrection(values, s, variance, z, 0.05);

  assert.ok(hr.correctionFactor >= 1, 'positive autocorrelation inflates variance');
  assert.ok(hr.adjustedVariance >= variance);
  assert.ok(hr.adjustedPValue >= hr.uncorrectedPValue, 'corrected p-value is more conservative');
  assert.ok(hr.note.length > 0);
});

test('missingDataReport identifies fill values and nulls', () => {
  const report = missingDataReport([1, null, -999, 4, undefined, 6], {
    fillThreshold: -900
  });
  assert.equal(report.total, 6);
  assert.equal(report.valid, 3);
  assert.equal(report.missing, 3);
  assert.deepEqual(report.missingIndices, [1, 2, 4]);
  assert.deepEqual(report.validValues, [1, 4, 6]);
});

test('completenessFraction reports valid share', () => {
  assert.equal(completenessFraction({ total: 10, valid: 8, missing: 2, missingIndices: [], validValues: [], validIndices: [] }), 0.8);
  assert.equal(completenessFraction({ total: 0, valid: 0, missing: 0, missingIndices: [], validValues: [], validIndices: [] }), 0);
});

test('validateParameterQuality flags out-of-range values', () => {
  const good = validateParameterQuality('T2M', [15, 20, 25, 30]);
  assert.equal(good.implausible.length, 0);
  assert.ok(good.note.includes('All 4 values fall within the plausible range'));

  const bad = validateParameterQuality('T2M', [15, 20, 100, 30]);
  assert.equal(bad.implausible.length, 1);
  assert.equal(bad.implausibleValues[0], 100);
  assert.ok(bad.note.includes('outside the plausible range'));

  const unknown = validateParameterQuality('UNKNOWN_CODE', [1, 2, 3]);
  assert.equal(unknown.implausible.length, 0);
});

test('bonferroniCorrection adjusts alpha', () => {
  const result = bonferroniCorrection([0.01, 0.04, 0.001], { alpha: 0.05 });
  assert.equal(result.m, 3);
  assert.equal(result.adjustedAlpha, 0.05 / 3);
  assert.equal(result.significant[0], true);   // 0.01 < 0.0167
  assert.equal(result.significant[1], false);  // 0.04 > 0.0167
  assert.equal(result.significant[2], true);   // 0.001 < 0.0167
  assert.equal(result.adjustedPValues[0], 0.03); // 0.01 * 3
  assert.equal(result.adjustedPValues[2], 0.003); // 0.001 * 3
});

test('benjaminiHochbergCorrection controls FDR', () => {
  const result = benjaminiHochbergCorrection([0.001, 0.01, 0.04, 0.5], { alpha: 0.05 });
  assert.equal(result.m, 4);
  assert.equal(result.alpha, 0.05);
  assert.ok(result.significant[0], 'smallest p-value is significant');
  assert.ok(result.thresholdRank >= 1);
});

test('precipMonthlyTotal converts mm/day to mm/month', () => {
  // January has 31 days: 2 mm/day × 31 = 62 mm
  assert.equal(precipMonthlyTotal(2, 2024, 1), 62);
  // February 2024 (leap year) has 29 days: 1 mm/day × 29 = 29 mm
  assert.equal(precipMonthlyTotal(1, 2024, 2), 29);
  // February 2023 (non-leap) has 28 days
  assert.equal(precipMonthlyTotal(1, 2023, 2), 28);
  // Missing rate → null
  assert.equal(precipMonthlyTotal(null, 2024, 1), null);
  assert.equal(precipMonthlyTotal(undefined, 2024, 1), null);
});

test('precipMonthlyTotals converts all rows for PRECTOTCORR', () => {
  const rows = [
    { date: '2024-01', year: 2024, month: 1, values: { PRECTOTCORR: 2 } },
    { date: '2024-02', year: 2024, month: 2, values: { PRECTOTCORR: null } },
    { date: '2024-03', year: 2024, month: 3, values: { PRECTOTCORR: 1.5 } }
  ];
  const totals = precipMonthlyTotals(rows, 'PRECTOTCORR');
  assert.equal(totals.length, 3);
  assert.equal(totals[0].totalMm, 62);  // 2 × 31
  assert.equal(totals[1].totalMm, null); // missing
  assert.equal(totals[2].totalMm, 1.5 * 31); // 46.5
});
