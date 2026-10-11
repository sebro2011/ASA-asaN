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
  buildPowerUrl,
  buildSeriesStats,
  leastSquaresTrend,
  meanOf,
  parseParameter,
  parsePowerResponse,
  POWER_PARAMETERS
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
