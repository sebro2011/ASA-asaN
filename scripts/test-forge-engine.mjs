/**
 * NOVA HYPOTHESIS FORGE — scientific engine unit tests.
 *
 * Run with:  npm run test:forge
 *
 * Every reference value below is checkable independently:
 *  - Pearson r for {1..5} vs {2,4,5,4,5} is 0.7745966692…;
 *  - Student's t two-tailed p at t = 2.048, df = 28 is 0.05;
 *  - the 2×2 table has odds ratio 15 and φ = 7/12;
 *  - the synthetic series encode a known one-step lead, so the
 *    cross-correlation must recover exactly that lag.
 *
 * The fixtures under scripts/fixtures/forge/ are synthetic payloads shaped like
 * the published NASA/NOAA responses. They are used ONLY by tests; they are never
 * served by the app and are never presented as observations.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  alignSeries,
  compareGroups,
  correlationTest,
  crossCorrelation,
  describe,
  detectAnomalies,
  erfc,
  linearRegression,
  missingReport,
  quantile,
  regularizedIncompleteBeta,
  sampleStdDev,
  spearman,
  studentTTwoTailedP,
  twoByTwoTable,
} from '../src/lib/forge/analysis.ts';
import {
  containsKeyword,
  detectLanguage,
  detectVariables,
  interpret,
  parseRegion,
  parseTimeRange,
  scoreDomain,
} from '../src/lib/forge/interpreter.ts';
import { generateHypotheses, decideHypothesis, activeStatement } from '../src/lib/forge/hypotheses.ts';
import { buildPlan, coverageVerdict } from '../src/lib/forge/planner.ts';
import {
  normaliseKp,
  normaliseSolarWind,
  normaliseDonki,
  normaliseNeoWs,
  normalisePower,
  normaliseTle,
  normaliseApod,
  normaliseMarsPhotos,
  parseUtcTimestamp,
  parseValue,
} from '../src/lib/forge/normalize.ts';
import { assembleInvestigation } from '../src/lib/forge/orchestrator.ts';
import { buildPassport, passportToHtml, passportToJson, passportToMarkdown } from '../src/lib/forge/passport.ts';
import { FORGE_STRINGS, forgeText } from '../src/lib/forge/strings.ts';
import { compareInvestigations } from '../src/lib/forge/memory.ts';
import { DATASETS, VARIABLES } from '../src/lib/forge/vocab.ts';

const fixture = (name) =>
  JSON.parse(fs.readFileSync(new URL(`./fixtures/forge/${name}`, import.meta.url), 'utf8'));

const adapter = (payload, sourceUrl = 'https://example.invalid/data') => ({
  payload,
  payloadText: JSON.stringify(payload),
  retrievedAt: '2024-05-12T00:00:00.000Z',
  sourceUrl,
});

/* ---------------------------------------------------------------- analysis */

test('descriptive statistics match hand-computed values', () => {
  const stats = describe([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.equal(stats.n, 8);
  assert.equal(stats.mean, 5);
  assert.equal(stats.median, 4.5);
  assert.ok(Math.abs(stats.sd - 2.138089935) < 1e-6, `sd was ${stats.sd}`);
  assert.equal(stats.min, 2);
  assert.equal(stats.max, 9);
  assert.equal(quantile([1, 2, 3, 4], 0.25), 1.75);
  assert.equal(sampleStdDev([5]), null);
});

test('Pearson correlation and its p-value match reference values', () => {
  const result = correlationTest([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]);
  assert.equal(result.n, 5);
  assert.ok(Math.abs(result.r - 0.7745966692) < 1e-9, `r was ${result.r}`);
  // t = 2.1213 on 3 df → two-tailed p ≈ 0.1240 (textbook table)
  assert.ok(result.p > 0.12 && result.p < 0.13, `p was ${result.p}`);
});

test("Student's t two-tailed p-value reproduces the 0.05 critical value", () => {
  const p = studentTTwoTailedP(2.048, 28);
  assert.ok(Math.abs(p - 0.05) < 5e-4, `p was ${p}`);
  assert.equal(studentTTwoTailedP(0, 10), 1);
  assert.ok(studentTTwoTailedP(1.959964, 1_000_000) > 0.0499);
  assert.ok(studentTTwoTailedP(1.959964, 1_000_000) < 0.0501);
  // Regularized incomplete beta sanity: I_0.5(1,1) = 0.5
  assert.ok(Math.abs(regularizedIncompleteBeta(1, 1, 0.5) - 0.5) < 1e-12);
  // erfc(0) = 1
  assert.ok(Math.abs(erfc(0) - 1) < 2e-7);
});

test('Spearman rank correlation equals Pearson on ranks', () => {
  const result = spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]);
  assert.ok(Math.abs(result.r - 1) < 1e-12);
  const inverse = spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]);
  assert.ok(Math.abs(inverse.r + 1) < 1e-12);
});

test('linear regression recovers a known slope and r²', () => {
  const regression = linearRegression([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
  assert.ok(Math.abs(regression.slope - 2) < 1e-12);
  assert.ok(Math.abs(regression.intercept) < 1e-12);
  assert.ok(Math.abs(regression.r2 - 1) < 1e-12);
});

test('cross-correlation finds an injected one-sample lead', () => {
  const response = Array.from({ length: 40 }, (_, i) => 2 + Math.sin(i / 4));
  const driver = Array.from({ length: 40 }, (_, i) => 300 + 50 * Math.sin((i + 1) / 4));
  const result = crossCorrelation(driver, response, 4);
  assert.equal(result.bestLagSteps, 1);
  assert.ok(result.bestR > 0.9);
});

test('2×2 table matches hand-computed odds ratio and φ', () => {
  const table = twoByTwoTable(30, 10, 10, 50);
  assert.equal(table.oddsRatio, 15);
  assert.ok(Math.abs((table.phi ?? 0) - 7 / 12) < 1e-9, `phi was ${table.phi}`);
  assert.ok(table.chiSquare > 10);
  assert.ok(table.p < 0.001);
});

test('compareGroups (Welch) separates two distinct samples', () => {
  const result = compareGroups([1, 1.1, 0.9, 1.05], [5, 5.1, 4.9, 5.05]);
  assert.ok(result.changePercent > 300);
  assert.ok(result.p < 0.01);
});

test('missingReport infers cadence and counts gaps', () => {
  const times = [
    '2024-01-01T00:00:00.000Z',
    '2024-01-01T01:00:00.000Z',
    '2024-01-01T03:00:00.000Z',
    '2024-01-01T04:00:00.000Z',
  ];
  const result = missingReport(times, [1, null, 3, 4]);
  assert.equal(result.cadenceMs, 3_600_000);
  assert.equal(result.expected, 5);
  assert.equal(result.present, 3);
  assert.equal(result.missing, 1);
});

test('alignSeries pairs by nearest timestamp and never invents a value', () => {
  const driver = [
    { time: '2024-01-01T00:00:00.000Z', value: 1, unit: 'x', missing: false, raw: '1' },
    { time: '2024-01-01T03:00:00.000Z', value: 2, unit: 'x', missing: false, raw: '2' },
  ];
  const response = [
    { time: '2024-01-01T01:00:00.000Z', value: 10, unit: 'y', missing: false, raw: '10' },
    { time: '2024-01-01T09:00:00.000Z', value: 20, unit: 'y', missing: false, raw: '20' },
  ];
  const paired = alignSeries(driver, response, 90 * 60 * 1000);
  assert.deepEqual(paired.driver, [1, null]);
  assert.equal(paired.pairedCount, 1);
});

test('anomaly detection uses the sample standard deviation', () => {
  const values = [1, 1, 1, 1, 1, 1, 1, 1, 1, 10];
  const result = detectAnomalies(values, 2);
  assert.ok(result.indices.includes(9));
  assert.ok(result.count >= 1);
});

/* ------------------------------------------------------------- interpreter */

test('language detection distinguishes Sinhala, Tamil and English', () => {
  assert.equal(detectLanguage('Did a solar storm affect Earth?'), 'en');
  assert.equal(detectLanguage('සූර්ය කුණාටුව පෘථිවියට බලපෑවාද?'), 'si');
  assert.equal(detectLanguage('சூரிய புயல் பூமியை பாதித்ததா?'), 'ta');
});

test('short ASCII keywords respect word boundaries', () => {
  assert.equal(containsKeyword('this mission is ready', 'iss'), false);
  assert.equal(containsKeyword('the ISS orbit', 'iss'), true);
});

test('domain scoring is language independent', () => {
  assert.equal(scoreDomain('Was there a geomagnetic storm?').domain, 'space-weather');
  assert.equal(scoreDomain('සූර්ය කුණාටුවක් පෘථිවි චුම්බක ක්ෂේත්‍රයට බලපෑවාද?').domain, 'space-weather');
  assert.equal(scoreDomain('சூரிய புயல் காந்தப்புலத்தை பாதித்ததா?').domain, 'space-weather');
});

test('interpreter builds a structured request and labels assumptions', () => {
  const request = interpret("Did a solar storm influence Earth's magnetic environment?", {
    now: new Date('2024-05-12T00:00:00Z'),
  });
  assert.equal(request.domain, 'space-weather');
  assert.equal(request.language, 'en');
  assert.equal(request.timeRange.origin, 'default');
  assert.equal(request.timeRange.assumed, true);
  assert.ok(request.notes.length > 0);
  assert.ok(request.variables.some((variable) => variable.id === 'kp'));
  assert.ok(request.methods.includes('correlation'));
  assert.ok(request.methods.includes('cross-correlation'));
  assert.equal(request.requiredDatasets.includes('noaa-swpc-kp'), true);
});

test('interpreter reads named events, months and explicit years', () => {
  const quebec = interpret('Was there a geomagnetic storm during the March 1989 Quebec event?', {
    now: new Date('2024-05-12T00:00:00Z'),
  });
  assert.equal(quebec.timeRange.origin, 'named-event');
  assert.equal(quebec.timeRange.start.slice(0, 10), '1989-03-12');

  const month = interpret('Solar wind and Kp during March 2024', {
    now: new Date('2024-05-12T00:00:00Z'),
  });
  assert.equal(month.timeRange.origin, 'explicit-month');
  assert.equal(month.timeRange.start.slice(0, 7), '2024-03');

  const year = interpret('Rainfall and temperature in Colombo in 2021', {
    now: new Date('2024-05-12T00:00:00Z'),
  });
  assert.equal(year.timeRange.origin, 'explicit-year');
  assert.equal(year.timeRange.start.slice(0, 4), '2021');
});

test('parseTimeRange and parseRegion are independently callable', () => {
  const range = parseTimeRange('2024-05-10 to 2024-05-12', 'space-weather', 'en', new Date('2024-06-01T00:00:00Z'));
  assert.equal(range.range.start.slice(0, 10), '2024-05-10');
  assert.equal(range.range.end.slice(0, 10), '2024-05-12');
  const sriLanka = parseRegion('ශ්‍රී ලංකාවේ වර්ෂාපතනය');
  assert.equal(sriLanka.source, 'gazetteer');
  assert.equal(parseRegion('global average').source, 'global');
});

test('Sinhala and Tamil questions select the same domain and keep their language', () => {
  const sinhala = interpret('1989 දී සූර්ය කුණාටුවක් පෘථිවි චුම්බක ක්ෂේත්‍රයට බලපෑවාද?', {
    now: new Date('2024-05-12T00:00:00Z'),
  });
  assert.equal(sinhala.language, 'si');
  assert.equal(sinhala.domain, 'space-weather');
  const tamil = interpret('1989 இல் சூரிய புயல் பூமியின் காந்தப்புலத்தை பாதித்ததா?', {
    now: new Date('2024-05-12T00:00:00Z'),
  });
  assert.equal(tamil.language, 'ta');
  assert.equal(tamil.domain, 'space-weather');
  assert.ok(tamil.objective.length > 0);
});

test('follow-up questions inherit context without losing the chosen language', () => {
  const first = interpret('Did a solar storm affect Earth in May 2024?', {
    now: new Date('2024-05-20T00:00:00Z'),
  });
  const followUp = interpret('What about the solar wind speed then?', {
    now: new Date('2024-05-20T00:00:00Z'),
    context: first,
    preferredLanguage: 'si',
  });
  assert.equal(followUp.followUp, true);
  assert.equal(followUp.domain, first.domain);
  assert.equal(followUp.timeRange.start, first.timeRange.start);
  assert.equal(followUp.language, 'si');
});

test('variables are detected per domain and never invented', () => {
  assert.deepEqual(detectVariables('rainfall and temperature', 'earth-environment').sort(), [
    'precipitation',
    'temperature',
  ]);
  assert.deepEqual(detectVariables('solar wind speed and Kp', 'space-weather').sort(), [
    'kp',
    'solar_wind_speed',
  ]);
});

test('an unsupported question is refused rather than mapped onto NASA data', () => {
  const request = interpret('What is the best pizza in Negombo?', { now: new Date('2024-05-12T00:00:00Z') });
  assert.equal(request.domain, 'unsupported');
  assert.equal(request.requiredDatasets.length, 0);
  assert.equal(generateHypotheses(request).length, 0);
});

/* ------------------------------------------------------------- hypotheses */

test('hypothesis generation is falsifiable, includes a null, and links data', () => {
  const request = interpret('Did a solar storm affect Earth in May 2024?', {
    now: new Date('2024-05-20T00:00:00Z'),
  });
  const hypotheses = generateHypotheses(request);
  assert.ok(hypotheses.length >= 3);
  assert.ok(hypotheses.some((hypothesis) => hypothesis.isNull));
  for (const hypothesis of hypotheses) {
    assert.ok(hypothesis.id.startsWith('H'));
    assert.ok(hypothesis.statement.length > 20);
    assert.ok(hypothesis.falsificationCriteria.length > 0);
    assert.ok(hypothesis.alternativeExplanations.length > 0);
    assert.ok(hypothesis.limitations.length > 0);
    assert.equal(hypothesis.status, 'proposed');
  }
  const ids = new Set(hypotheses.map((hypothesis) => hypothesis.id));
  assert.equal(ids.size, hypotheses.length);
  // Deterministic: the same request produces the same ids.
  const again = generateHypotheses(request);
  assert.deepEqual(again.map((h) => h.id), hypotheses.map((h) => h.id));
});

test('user decisions edit, accept and reject hypotheses', () => {
  const request = interpret('Did a solar storm affect Earth in May 2024?', {
    now: new Date('2024-05-20T00:00:00Z'),
  });
  const hypotheses = generateHypotheses(request);
  const id = hypotheses[0].id;
  const accepted = decideHypothesis(hypotheses, id, 'accepted');
  assert.equal(accepted.find((h) => h.id === id).status, 'accepted');
  const edited = decideHypothesis(hypotheses, id, 'accepted', 'Kp follows Bz by 3 h.');
  const editedHypothesis = edited.find((h) => h.id === id);
  assert.equal(editedHypothesis.status, 'edited');
  assert.equal(activeStatement(editedHypothesis), 'Kp follows Bz by 3 h.');
  const rejected = decideHypothesis(hypotheses, id, 'rejected');
  assert.equal(rejected.find((h) => h.id === id).status, 'rejected');
});

/* ---------------------------------------------------------------- planner */

test('planner reports out-of-coverage instead of substituting a period', () => {
  const request = interpret('Geomagnetic storm during the March 1989 Quebec event', {
    now: new Date('2024-05-20T00:00:00Z'),
  });
  const hypotheses = generateHypotheses(request);
  const plan = buildPlan(request, { now: new Date('2024-05-20T00:00:00Z'), nasaKeyMode: 'demo' }, hypotheses.length);
  const kp = plan.datasets.find((dataset) => dataset.datasetId === 'noaa-swpc-kp');
  assert.equal(kp.coverage, 'out-of-coverage');
  assert.equal(plan.executable, false);
  assert.ok(plan.blockingReason);
  assert.ok(plan.missingInformation.length >= 0);
});

test('planner accepts a recent window and documents units and limits', () => {
  const now = new Date('2024-05-20T00:00:00Z');
  const request = interpret('Solar storm and Kp in the last 7 days', { now });
  const hypotheses = generateHypotheses(request);
  const plan = buildPlan(request, { now, nasaKeyMode: 'demo' }, hypotheses.length);
  const kp = plan.datasets.find((dataset) => dataset.datasetId === 'noaa-swpc-kp');
  assert.equal(kp.coverage, 'in-range');
  assert.ok(kp.units.includes('Kp'));
  assert.equal(plan.executable, true);
  assert.ok(plan.verification.length >= 3);
  assert.ok(plan.limitations.length > 0);
});

test('coverageVerdict distinguishes rolling, archive and future windows', () => {
  const now = new Date('2024-05-20T00:00:00Z');
  const kp = DATASETS.find((dataset) => dataset.id === 'noaa-swpc-kp');
  const out = coverageVerdict(
    kp,
    {
      start: '1989-03-12T00:00:00.000Z',
      end: '1989-03-15T23:59:59.000Z',
      resolution: 'hour',
      origin: 'named-event',
      label: '1989',
      assumed: false,
    },
    now,
    'en',
  );
  assert.equal(out.coverage, 'out-of-coverage');
  const power = DATASETS.find((dataset) => dataset.id === 'nasa-power');
  const inRange = coverageVerdict(
    power,
    {
      start: '2015-01-01T00:00:00.000Z',
      end: '2020-01-01T00:00:00.000Z',
      resolution: 'month',
      origin: 'explicit-year',
      label: '2015',
      assumed: false,
    },
    now,
    'en',
  );
  assert.equal(inRange.coverage, 'in-range');
});

/* ------------------------------------------------------------ normalisation */

test('normaliser parses the SWPC Kp table, UTC timestamps and fill values', () => {
  const series = normaliseKp(adapter(fixture('noaa-kp.json')))[0];
  assert.equal(series.variableId, 'kp');
  assert.equal(series.unit, 'Kp');
  assert.equal(series.observations.length, 200);
  assert.equal(series.observations.filter((observation) => observation.missing).length, 2);
  assert.match(series.observations[0].time, /^2024-05-01T00:00:00\.000Z$/);
  assert.equal(series.provenance.recordCount, 200);
  assert.equal(series.provenance.payloadHash.length, 8);
  assert.equal(series.provenance.processingHistory.includes('timestamps normalised to UTC'), true);
});

test('normaliser splits magnetometer and plasma tables with published units', () => {
  const mag = normaliseSolarWind(
    adapter(fixture('solar-wind-mag.json'), 'https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json'),
  );
  assert.deepEqual(mag.map((entry) => entry.variableId).sort(), ['bt', 'bz_gsm']);
  assert.equal(mag[0].unit, 'nT');
  const plasma = normaliseSolarWind(
    adapter(fixture('solar-wind-plasma.json'), 'https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json'),
  );
  assert.deepEqual(plasma.map((entry) => entry.variableId).sort(), ['proton_density', 'solar_wind_speed']);
  assert.equal(plasma.find((entry) => entry.variableId === 'solar_wind_speed').unit, 'km/s');
  assert.equal(plasma.find((entry) => entry.variableId === 'proton_density').observations[20].missing, true);
});

test('normaliser keeps DONKI events and CME model speeds separate from measurements', () => {
  const { series, events } = normaliseDonki(
    adapter(fixture('donki-notifications.json')),
    adapter(fixture('donki-cme.json')),
    'en',
  );
  assert.equal(events.length, 5);
  assert.equal(series[0].variableId, 'cme_speed');
  assert.equal(series[0].observations.length, 2);
  assert.ok(series[0].provenance.processingHistory.some((step) => /model fits/.test(step)));
});

test('normaliser parses POWER monthly re-analysis with its published units', () => {
  const temperature = normalisePower(adapter(fixture('power.json')), 'temperature');
  assert.equal(temperature.unit, '°C');
  assert.equal(temperature.observations.length, 72);
  assert.match(temperature.observations[0].time, /^2019-01-01T00:00:00\.000Z$/);
  const precipitation = normalisePower(adapter(fixture('power.json')), 'precipitation');
  assert.equal(precipitation.unit, 'mm/day');
  assert.equal(precipitation.observations.filter((observation) => observation.missing).length, 6);
});

test('normaliser parses NeoWs, TLE, APOD and Mars payloads without inventing values', () => {
  const neo = normaliseNeoWs(adapter(fixture('neows.json')));
  assert.equal(neo.length, 2);
  assert.equal(neo[0].observations.length, 3);
  assert.equal(neo[0].unit, 'au');

  const tle = normaliseTle(adapter(fixture('tle.json')))[0];
  assert.equal(tle.variableId, 'orbital_altitude');
  assert.ok(tle.observations[0].value > 350 && tle.observations[0].value < 500, `altitude ${tle.observations[0].value}`);
  assert.match(tle.observations[0].quality, /Kepler/);

  const apod = normaliseApod(adapter(fixture('apod.json')))[0];
  assert.equal(apod.observations[0].value, 1);
  const mars = normaliseMarsPhotos(adapter(fixture('mars-photos.json')), '2024-05-10')[0];
  assert.equal(mars.observations[0].value, 2);
});

test('value parsing maps every documented fill marker to missing', () => {
  assert.deepEqual(parseValue(null), { value: null, missing: true, raw: null });
  assert.deepEqual(parseValue(''), { value: null, missing: true, raw: null });
  assert.deepEqual(parseValue('null'), { value: null, missing: true, raw: 'null' });
  assert.equal(parseValue(-9999).missing, true);
  assert.equal(parseValue('1.25').value, 1.25);
  assert.equal(parseUtcTimestamp('2024-05-10 12:00:00.000'), '2024-05-10T12:00:00.000Z');
  assert.equal(parseUtcTimestamp('2024-05-10T12:00:00Z'), '2024-05-10T12:00:00.000Z');
  assert.equal(parseUtcTimestamp('not a date'), null);
});

/* ------------------------------------------------------------ orchestration */

function syntheticSeries({ variableId, unit, datasetId, values, startMs, stepMs }) {
  const observations = values.map((value, index) => ({
    time: new Date(startMs + index * stepMs).toISOString(),
    value: typeof value === 'number' && Number.isFinite(value) ? value : null,
    unit,
    missing: !(typeof value === 'number' && Number.isFinite(value)),
    raw: value === null ? null : String(value),
  }));
  const times = observations.map((observation) => observation.time);
  const missing = missingReport(
    times,
    observations.map((observation) => observation.value),
  );
  return {
    id: `${datasetId}:${variableId}`,
    datasetId,
    variableId,
    label: variableId,
    unit,
    cadence: '3 h',
    observations,
    missing: {
      count: missing.missing,
      fraction: missing.fraction,
      expected: missing.expected,
      method: missing.method,
    },
    provenance: {
      organisation: datasetId.startsWith('noaa') ? 'NOAA' : 'NASA',
      datasetId,
      datasetTitle: datasetId,
      sourceUrl: 'https://example.invalid/source',
      documentationUrl: 'https://example.invalid/docs',
      retrievedAt: '2024-05-12T00:00:00.000Z',
      observationStart: times[0],
      observationEnd: times[times.length - 1],
      recordCount: observations.length,
      payloadHash: 'deadbeef',
      processingHistory: ['fixture'],
      attribution: 'synthetic test fixture',
    },
    status: 'live',
  };
}

function syntheticDatasets({ sign = 1, withData = true } = {}) {
  if (!withData) {
    return [
      {
        datasetId: 'noaa-swpc-kp',
        status: 'unavailable',
        series: [],
        detail: 'The source did not answer within the request timeout.',
        errorCode: 'SOURCE_TIMEOUT',
        documentationUrl: 'https://www.swpc.noaa.gov/products/planetary-k-index',
      },
      {
        datasetId: 'noaa-swpc-solar-wind',
        status: 'out-of-coverage',
        series: [],
        detail: 'The requested period is outside the published coverage.',
        errorCode: 'OUT_OF_COVERAGE',
        documentationUrl: 'https://www.swpc.noaa.gov/products/real-time-solar-wind',
      },
    ];
  }
  const start = Date.parse('2024-05-01T00:00:00Z');
  const step = 3 * 3_600_000;
  const base = Array.from({ length: 120 }, (_, i) => 2.5 + 1.5 * Math.sin(i / 6));
  const kp = syntheticSeries({ variableId: 'kp', unit: 'Kp', datasetId: 'noaa-swpc-kp', values: base, startMs: start, stepMs: step });
  const driverValues = base.map((_, i) => sign * (base[(i + 1) % base.length] - 2.5) + 400);
  const speed = syntheticSeries({
    variableId: 'solar_wind_speed',
    unit: 'km/s',
    datasetId: 'noaa-swpc-solar-wind',
    values: driverValues,
    startMs: start,
    stepMs: step,
  });
  return [
    { datasetId: 'noaa-swpc-kp', status: 'live', series: [kp], documentationUrl: 'https://www.swpc.noaa.gov/products/planetary-k-index' },
    { datasetId: 'noaa-swpc-solar-wind', status: 'live', series: [speed], documentationUrl: 'https://www.swpc.noaa.gov/products/real-time-solar-wind' },
  ];
}

function investigateSynthetic({ sign = 1, withData = true, question } = {}) {
  const now = new Date('2024-05-12T00:00:00Z');
  const request = interpret(question ?? 'Solar storm and Kp in the last 7 days', { now });
  const hypotheses = generateHypotheses(request);
  const plan = buildPlan(request, { now, nasaKeyMode: 'demo' }, hypotheses.length);
  const datasets = syntheticDatasets({ sign, withData });
  const investigation = assembleInvestigation({
    request,
    hypotheses,
    plan,
    datasets,
    createdAt: now.toISOString(),
    investigationId: 'INV-TEST-1',
  });
  return { request, hypotheses, plan, datasets, investigation };
}

test('orchestrator runs deterministic analyses on retrieved observations only', () => {
  const { investigation } = investigateSynthetic();
  const correlation = investigation.analyses.find((analysis) => analysis.method === 'correlation');
  assert.ok(correlation, 'expected a correlation analysis');
  assert.ok(correlation.results.n > 50);
  assert.ok(correlation.results.r > 0);
  const cross = investigation.analyses.find((analysis) => analysis.method === 'cross-correlation');
  assert.equal(cross.results.bestLagHours, 3);
  assert.ok(Array.isArray(cross.series));
  const missing = investigation.analyses.filter((analysis) => analysis.method === 'missing-data');
  assert.ok(missing.length >= 2);
  // Threshold table exists and is internally consistent.
  const threshold = investigation.analyses.find((analysis) => analysis.method === 'threshold-exceedance');
  assert.equal(threshold.results.cellA + threshold.results.cellB + threshold.results.cellC + threshold.results.cellD, threshold.results.n);
});

test('evidence is classified by sign and conclusion never claims proof', () => {
  const supportive = investigateSynthetic({ sign: 1 }).investigation;
  assert.ok(supportive.evidence.some((item) => item.classification === 'supporting'));
  assert.equal(supportive.conclusion.verdict, 'weakly-supported');
  assert.ok(/not proof|not a discovery|weakly/i.test(supportive.conclusion.summary));
  assert.ok(supportive.conclusion.causalCaveat.length > 30);
  assert.notEqual(supportive.conclusion.verdict, 'proven');

  const contradictory = investigateSynthetic({ sign: -1 }).investigation;
  assert.ok(contradictory.evidence.some((item) => item.classification === 'contradicting'));
  assert.equal(contradictory.conclusion.verdict, 'not-supported');
  // Contradicting evidence is never hidden.
  assert.ok(contradictory.conclusion.contradictingCount > 0);
});

test('missing data produces insufficient evidence, a data gap and no fabricated statistics', () => {
  const { investigation } = investigateSynthetic({ withData: false });
  assert.equal(investigation.conclusion.verdict, 'insufficient-evidence');
  assert.equal(investigation.conclusion.supportingCount, 0);
  assert.equal(investigation.counterEvidence.dataGapDetected, true);
  assert.ok(investigation.counterEvidence.findings.some((finding) => finding.kind === 'data-gap'));
  assert.ok(investigation.sources.every((source) => source.recordCount === 0));
  const correlation = investigation.analyses.find((analysis) => analysis.method === 'correlation');
  assert.equal(correlation, undefined);
  assert.ok(investigation.limitations.length > 0);
});

test('counter-evidence lists alternatives, gaps and falsification criteria', () => {
  const { investigation } = investigateSynthetic();
  const kinds = new Set(investigation.counterEvidence.findings.map((finding) => finding.kind));
  assert.ok(kinds.has('alternative-explanation'));
  assert.ok(kinds.has('assumption'));
  assert.ok(kinds.has('falsification'));
  assert.ok(kinds.has('missing-variable'));
});

/* ---------------------------------------------------------------- passport */

test('Evidence Passport is reproducible, complete and never leaks a key', () => {
  const { investigation } = investigateSynthetic();
  const passport = buildPassport(investigation, '2024-05-12T01:00:00.000Z');
  assert.equal(passport.investigationId, 'INV-TEST-1');
  assert.equal(passport.hypothesis.nullHypothesisConsidered, true);
  assert.ok(Array.isArray(passport.evidence.contradicting));
  assert.ok(Array.isArray(passport.evidence.supporting));
  assert.ok(passport.analysis.thresholds.alpha === 0.05);
  assert.ok(passport.reproducibility.request);
  assert.equal(passport.reproducibility.deterministic, true);
  assert.ok(passport.dataSources.every((source) => !/api_key=/i.test(source.sourceUrl ?? '')));
  assert.ok(/not a peer-reviewed|not an official/i.test(passport.disclaimer));

  const json = passportToJson(passport);
  assert.doesNotThrow(() => JSON.parse(json));
  assert.equal(/api_key=/i.test(json), false);
  assert.ok(json.includes('"contradicting"'));

  const markdown = passportToMarkdown(passport);
  assert.ok(markdown.includes('Contradicting evidence'));
  assert.ok(markdown.includes('Reproducibility'));

  const html = passportToHtml(passport);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('NOVA Evidence Passport'));
  assert.ok(html.includes('Supporting evidence'));
  assert.ok(html.includes('Contradicting evidence'));
  // Escaping check: a script tag introduced by a user hypothesis cannot run.
  const injected = buildPassport({
    ...investigation,
    hypotheses: investigation.hypotheses.map((hypothesis, index) =>
      index === 0 ? { ...hypothesis, userStatement: '<script>alert(1)</script>' } : hypothesis,
    ),
    selectedHypothesisId: investigation.hypotheses[0].id,
  });
  const injectedHtml = passportToHtml(injected);
  assert.equal(injectedHtml.includes('<script>alert(1)</script>'), false);
  assert.ok(injectedHtml.includes('&lt;script&gt;'));
});

/* ------------------------------------------------------- localisation parity */

test('every engine string exists in all three languages with the same placeholders', () => {
  for (const [key, entry] of Object.entries(FORGE_STRINGS)) {
    for (const language of ['en', 'si', 'ta']) {
      assert.equal(typeof entry[language], 'string', `${key} missing ${language}`);
      assert.ok(entry[language].trim().length > 0, `${key} empty in ${language}`);
    }
    const placeholders = (value) => (value.match(/\{(\w+)\}/g) || []).sort().join(',');
    assert.equal(placeholders(entry.si), placeholders(entry.en), `${key} placeholders differ (si)`);
    assert.equal(placeholders(entry.ta), placeholders(entry.en), `${key} placeholders differ (ta)`);
  }
  assert.equal(forgeText('si', 'var_kp'), 'ග්‍රහලෝක Kp දර්ශකය (Kp)');
  assert.equal(forgeText('ta', 'method_correlation').length > 0, true);
  assert.equal(forgeText('en', 'missing_key_should_be_visible'), 'missing_key_should_be_visible');
});

test('every variable and dataset in the registry is fully documented', () => {
  for (const dataset of DATASETS) {
    assert.ok(dataset.documentationUrl.startsWith('https://'), dataset.id);
    assert.ok(dataset.endpoint.startsWith('https://'), dataset.id);
    assert.ok(dataset.limitations.length > 0, dataset.id);
    assert.ok(dataset.domains.length > 0, dataset.id);
    assert.ok(dataset.description.length > 30, dataset.id);
  }
  for (const variable of VARIABLES) {
    assert.ok(variable.unit.length > 0, variable.id);
    assert.ok(variable.notes.length > 20, variable.id);
  }
});

/* ------------------------------------------------------------------ memory */

test('comparison refuses to imply comparability of different periods', () => {
  const a = investigateSynthetic().investigation;
  const b = investigateSynthetic().investigation;
  const stored = (investigation, id) => ({
    id,
    question: investigation.question,
    language: investigation.language,
    domain: investigation.request.domain,
    createdAt: investigation.createdAt,
    verdict: investigation.conclusion.verdict,
    hypothesis: 'h',
    datasetIds: investigation.datasets.map((dataset) => dataset.datasetId),
    investigation,
  });
  const same = compareInvestigations(stored(a, 'A'), stored(b, 'B'));
  assert.equal(same.directlyComparable, true);
  const shifted = { ...b, request: { ...b.request, timeRange: { ...b.request.timeRange, start: '2020-01-01T00:00:00.000Z' } } };
  const different = compareInvestigations(stored(a, 'A'), stored(shifted, 'C'));
  assert.equal(different.directlyComparable, false);
  assert.ok(/not directly comparable/i.test(different.note));
});

test('correlation exposes exactly the aligned pairs used by the statistic', () => {
  const { investigation } = investigateSynthetic();
  const correlation = investigation.analyses.find((analysis) => analysis.method === 'correlation');
  assert.ok(correlation, 'correlation analysis present');
  assert.ok(Array.isArray(correlation.pairs), 'paired observations recorded');
  assert.equal(correlation.pairs.length, correlation.sampleSize, 'scatter sample equals test sample');
  for (const pair of correlation.pairs) {
    assert.equal(Number.isFinite(pair.x) && Number.isFinite(pair.y), true, 'pairs are finite observations');
  }
  // The scatter view and the reported coefficient cannot disagree about the sample.
  const recomputed = correlationTest(
    correlation.pairs.map((pair) => pair.x),
    correlation.pairs.map((pair) => pair.y),
  );
  // Stored results are rounded to 6 decimals for display; the sample is identical.
  assert.equal(Math.abs(recomputed.r - correlation.results.r) < 1e-6, true);
  assert.equal(recomputed.n, correlation.results.n);
});
