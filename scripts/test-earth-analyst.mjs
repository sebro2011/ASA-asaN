/**
 * AI Earth Science Analyst — failover, local intelligence and error-handling tests.
 *
 * Every external service is mocked: no test contacts Google, OpenRouter, Arena or
 * NASA. Two layers are covered:
 *
 *   1. the orchestrator in isolation (classification, retries, backoff, circuit
 *      breaker, dedupe, deadline), with fake provider adapters;
 *   2. the real `POST /api/earth/analyst` route on a live HTTP server with an
 *      injected orchestrator, so the JSON contract the browser depends on —
 *      including "never leak the upstream error text" — is asserted, not assumed.
 *
 * Run with:  npm run test:earth-analyst
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { earthRouter, __setAnalystOrchestratorForTests } = await import('../server/earthIntelligence.ts');
const { createOrchestrator, ProviderError, classifyStatus } = await import('../server/earth/providerOrchestrator.ts');
const { extractJson, normaliseAnswer } = await import('../server/earth/providers.ts');
const { analyseSeries, analyseBundle, buildLocalAnalystAnswer, ANOMALY_BASELINE_YEARS } = await import(
  '../server/earth/localAnalysis.ts'
);

/* ------------------------------- fixtures -------------------------------- */

const MONTHS = (from, to) => {
  const out = [];
  let [year, month] = from.split('-').map(Number);
  const [endYear, endMonth] = to.split('-').map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
};

/** 36 months of T2M at a known constant 28.0 °C except Jan 2019 = 30.0. */
function temperatureSeries() {
  const dates = MONTHS('2019-01', '2021-12');
  const values = dates.map(() => 28);
  values[0] = 30; // 2019 mean = (30 + 11·28)/12
  return { code: 'T2M', unit: '°C', dates, values };
}

function precipitationSeries() {
  const dates = MONTHS('2019-01', '2021-12');
  // First 18 months at 10 mm/day, last 18 at 12 mm/day → a clean +20 % period change.
  return { code: 'PRECTOTCORR', unit: 'mm/day', dates, values: dates.map((_, index) => (index < 18 ? 10 : 12)) };
}

function contextWith(series, extra = {}) {
  const dates = series[0]?.dates || [];
  return {
    area: { label: 'Colombo, Sri Lanka', latitude: 6.9271, longitude: 79.8612 },
    dates: ['2024-06-01'],
    layers: [
      {
        id: 'VIIRS_SNPP_Thermal_Anomalies_375m_Day',
        title: 'Thermal anomalies',
        category: 'fire',
        coverage: '20 Nov 2023 – 05 Nov 2026',
        serviceUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/VIIRS_SNPP_Thermal_Anomalies_375m_Day/default/all/all.xml'
      }
    ],
    power: {
      place: 'Colombo, Sri Lanka',
      latitude: 6.927,
      longitude: 79.861,
      months: dates.length,
      from: dates[0],
      to: dates[dates.length - 1],
      available: series.map((entry) => entry.code),
      unavailable: ['RH2M'],
      sourceUrl: 'https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M',
      retrievedAt: '2026-11-08T09:00:00.000Z',
      series,
      ...extra
    },
    dataGaps: []
  };
}

const ANSWER_JSON = JSON.stringify({
  sections: [
    { kind: 'verified', title: 'Verified observations', bullets: ['T2M mean 28.0 °C for the retrieved window.'] },
    { kind: 'derived', title: 'Calculated results', bullets: ['The mean of the 36 monthly values is 28.0 °C.'] }
  ],
  sources: [
    { label: 'POWER', url: 'https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M' },
    { label: 'Invented', url: 'https://example.com/not-in-context' }
  ]
});

/** Minimal fake adapter with scripted outcomes. */
function fakeProvider(id, script, options = {}) {
  const calls = [];
  return {
    id,
    label: options.label || id,
    model: options.model || `${id}-model`,
    configured: options.configured !== false,
    calls,
    isConfigured() {
      return this.configured;
    },
    async generate(args) {
      calls.push(args);
      const next = Array.isArray(script) ? script[Math.min(calls.length - 1, script.length - 1)] : script;
      if (typeof next === 'function') return next(args);
      if (next instanceof Error) throw next;
      return next;
    }
  };
}

function makeOrchestrator(providers, overrides = {}) {
  const logs = [];
  const sleeps = [];
  const orchestrator = createOrchestrator({
    providers,
    maxAttempts: 3,
    baseDelayMs: 10,
    maxDelayMs: 40,
    timeoutMs: 200,
    deadlineMs: 2_000,
    parseAnswer: (text, context) => normaliseAnswer(extractJson(text), context, 6),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    log: (event) => logs.push(event),
    ...overrides
  });
  return { orchestrator, sleeps, logs };
}

/* --------------------------- 1. classification --------------------------- */

test('an unconfigured provider is reported as skipped and never contacted', async () => {
  const gemini = fakeProvider('gemini', ANSWER_JSON, { configured: false });
  const openrouter = fakeProvider('openrouter', ANSWER_JSON);
  const { orchestrator } = makeOrchestrator([gemini, openrouter]);

  const run = await orchestrator.run({ question: 'Explain', context: contextWith([temperatureSeries()]), lang: 'en' });
  assert.equal(run.metadata.provider, 'openrouter');
  assert.equal(gemini.calls.length, 0);
  assert.equal(run.metadata.providerChain[0].outcome, 'skipped');
  assert.equal(run.metadata.providerChain[0].code, 'NOT_CONFIGURED');
  assert.equal(run.metadata.providerChain[1].outcome, 'ok');
});

test('HTTP statuses are classified as retryable or permanent', () => {
  for (const status of [429, 500, 502, 503, 504, 408]) {
    assert.equal(classifyStatus(status).retryable, true, `${status} must be retryable`);
  }
  for (const status of [400, 401, 402, 403, 404, 422]) {
    assert.equal(classifyStatus(status).retryable, false, `${status} must not be retryable`);
  }
  assert.equal(classifyStatus(503).code, 'PROVIDER_UNAVAILABLE');
  assert.equal(classifyStatus(429).code, 'RATE_LIMITED');
  assert.equal(classifyStatus(401).code, 'AUTH_ERROR');
});

/* --------------------- 2. Gemini answers, no fallback -------------------- */

test('Gemini success returns mode "remote" with provider, model and no fallback', async () => {
  const gemini = fakeProvider('gemini', ANSWER_JSON);
  const openrouter = fakeProvider('openrouter', ANSWER_JSON, { configured: false });
  const { orchestrator } = makeOrchestrator([gemini, openrouter]);

  const run = await orchestrator.run({ question: 'Explain T2M', context: contextWith([temperatureSeries()]), lang: 'en' });
  assert.equal(run.ok, true);
  assert.equal(run.metadata.mode, 'remote');
  assert.equal(run.metadata.provider, 'gemini');
  assert.equal(run.metadata.model, 'gemini-model');
  assert.equal(run.metadata.attempts, 1);
  assert.equal(run.metadata.retries, 0);
  assert.equal(run.metadata.fallback, false);
  assert.equal(run.metadata.noticeCode, undefined);
  assert.equal(run.answer.sections.length, 2);
  // Only URLs present in the context survive; the invented one is dropped.
  assert.equal(run.answer.sources.filter((source) => source.verifiedInContext).length, 1);
  assert.equal(run.answer.droppedSources, 1);
  // Providers after the successful one are not contacted, so the chain stops there.
  assert.equal(run.metadata.providerChain.length, 1);
  assert.equal(run.metadata.providerChain[0].outcome, 'ok');
});

/* ------------------------- 3. transient 503 retry ------------------------ */

test('a 503 is retried with backoff and the retry can succeed', async () => {
  const gemini = fakeProvider('gemini', [
    new ProviderError('Gemini responded 503', { status: 503 }),
    ANSWER_JSON
  ]);
  const { orchestrator, sleeps } = makeOrchestrator([gemini]);

  const run = await orchestrator.run({ question: 'Explain', context: contextWith([temperatureSeries()]), lang: 'en' });
  assert.equal(run.ok, true);
  assert.equal(run.metadata.provider, 'gemini');
  assert.equal(run.metadata.attempts, 2);
  assert.equal(run.metadata.retries, 1);
  // Backoff must actually have been awaited, once, with a positive delay.
  assert.equal(sleeps.length, 1);
  assert.ok(sleeps[0] > 0, 'backoff delay must be positive');
});

test('persistent 503 exhausts retries, then an alternative provider answers and the identity is honest', async () => {
  const gemini = fakeProvider('gemini', new ProviderError('Gemini responded 503', { status: 503 }));
  const openrouter = fakeProvider('openrouter', ANSWER_JSON);
  const { orchestrator, sleeps } = makeOrchestrator([gemini, openrouter]);

  const run = await orchestrator.run({ question: 'Explain', context: contextWith([temperatureSeries()]), lang: 'en' });
  assert.equal(run.ok, true);
  assert.equal(run.metadata.provider, 'openrouter', 'the answering provider must not be reported as Gemini');
  assert.equal(run.metadata.fallback, true);
  assert.equal(run.metadata.fallbackReason, 'PROVIDER_UNAVAILABLE');
  assert.equal(run.metadata.noticeCode, 'primary-unavailable');
  assert.equal(gemini.calls.length, 3, 'three attempts on the primary');
  assert.equal(sleeps.length, 2, 'two backoff waits between three attempts');
  assert.equal(openrouter.calls.length, 1);
  const chain = run.metadata.providerChain;
  assert.equal(chain[0].provider, 'gemini');
  assert.equal(chain[0].outcome, 'error');
  assert.equal(chain[0].status, 503);
  assert.equal(chain[1].outcome, 'ok');
});

/* ---------------------------- 4. 429 handling ---------------------------- */

test('a 429 is transient: retried, honours Retry-After and then falls back', async () => {
  const gemini = fakeProvider('gemini', new ProviderError('Gemini responded 429', { status: 429, retryAfterMs: 500 }));
  const arena = fakeProvider('arena', ANSWER_JSON);
  const { orchestrator, sleeps } = makeOrchestrator([gemini, arena], { maxAttempts: 2 });

  const run = await orchestrator.run({ question: 'Explain', context: contextWith([temperatureSeries()]), lang: 'en' });
  assert.equal(run.metadata.provider, 'arena');
  assert.equal(run.metadata.fallbackReason, 'RATE_LIMITED');
  assert.equal(gemini.calls.length, 2);
  // Retry-After (500 ms) is larger than the jittered backoff, so it wins.
  assert.equal(sleeps[0], 500);
});

/* ------------------------------ 5. timeouts ------------------------------ */

test('a timeout is retryable and does not block the chain forever', async () => {
  const gemini = fakeProvider('gemini', async (args) => {
    // Never resolves; the orchestrator's per-attempt timeout must break out.
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    return args ? ANSWER_JSON : ANSWER_JSON;
  });
  const openrouter = fakeProvider('openrouter', ANSWER_JSON);
  const { orchestrator } = makeOrchestrator([gemini, openrouter], { timeoutMs: 30, maxAttempts: 2 });

  const started = Date.now();
  const run = await orchestrator.run({ question: 'Explain', context: contextWith([temperatureSeries()]), lang: 'en' });
  const elapsed = Date.now() - started;
  assert.equal(run.metadata.provider, 'openrouter');
  assert.equal(run.metadata.providerChain[0].code, 'TIMEOUT');
  assert.ok(elapsed < 4_000, `the timeout must cut the hung attempt short (took ${elapsed} ms)`);
});

/* --------------------- 6. permanent errors are not retried --------------- */

test('a permanent error (401) is not retried and moves straight to the next provider', async () => {
  const gemini = fakeProvider('gemini', new ProviderError('Gemini responded 401', { status: 401 }));
  const openrouter = fakeProvider('openrouter', ANSWER_JSON);
  const { orchestrator, sleeps } = makeOrchestrator([gemini, openrouter]);

  const run = await orchestrator.run({ question: 'Explain', context: contextWith([temperatureSeries()]), lang: 'en' });
  assert.equal(gemini.calls.length, 1, 'auth failures must not be retried');
  assert.equal(sleeps.length, 0);
  assert.equal(run.metadata.provider, 'openrouter');
  assert.equal(run.metadata.providerChain[0].code, 'AUTH_ERROR');
});

/* --------------------------- 7. everything down -------------------------- */

test('when every remote provider fails the run returns local mode with the full chain', async () => {
  const gemini = fakeProvider('gemini', new ProviderError('Gemini responded 503', { status: 503 }));
  const openrouter = fakeProvider('openrouter', new ProviderError('OpenRouter responded 502', { status: 502 }));
  const arena = fakeProvider('arena', new ProviderError('Arena responded 500', { status: 500 }));
  const { orchestrator } = makeOrchestrator([gemini, openrouter, arena], { maxAttempts: 2 });

  const run = await orchestrator.run({ question: 'Explain', context: contextWith([temperatureSeries()]), lang: 'en' });
  assert.equal(run.ok, false);
  assert.equal(run.metadata.mode, 'local');
  assert.equal(run.metadata.provider, 'local');
  assert.equal(run.metadata.noticeCode, 'all-providers-unavailable');
  assert.equal(run.metadata.providerChain.length, 3);
  assert.ok(run.metadata.providerChain.every((entry) => entry.outcome === 'error'));
  assert.equal(run.metadata.attempts, 6);
});

test('with no provider configured at all nothing is contacted', async () => {
  const gemini = fakeProvider('gemini', ANSWER_JSON, { configured: false });
  const { orchestrator } = makeOrchestrator([gemini]);
  const run = await orchestrator.run({ question: 'Explain', context: {}, lang: 'en' });
  assert.equal(run.ok, false);
  assert.equal(run.metadata.mode, 'local');
  assert.equal(gemini.calls.length, 0);
  assert.equal(run.metadata.providerChain[0].code, 'NOT_CONFIGURED');
});

/* ------------------------ 8. malformed model JSON ------------------------ */

test('a malformed model reply is rejected as a provider failure, never returned to the client', async () => {
  const gemini = fakeProvider('gemini', 'Sure! Here is a friendly paragraph with no JSON at all.');
  const openrouter = fakeProvider('openrouter', ANSWER_JSON);
  const { orchestrator } = makeOrchestrator([gemini, openrouter]);

  const run = await orchestrator.run({ question: 'Explain', context: contextWith([temperatureSeries()]), lang: 'en' });
  assert.equal(run.metadata.provider, 'openrouter');
  assert.equal(run.metadata.providerChain[0].code, 'UNPARSABLE_RESPONSE');
});

test('JSON with no sections, or sections without bullets, is treated as empty', async () => {
  assert.throws(() => normaliseAnswer({ sections: [] }, {}));
  assert.throws(() => normaliseAnswer({ sections: [{ kind: 'verified', title: 'x', bullets: [] }] }, {}));
  const fenced = extractJson('```json\n{"sections":[{"kind":"verified","title":"t","bullets":["b"]}]}\n```');
  assert.equal(fenced.sections[0].bullets[0], 'b');
});

/* ------------------------- 9. circuit breaker ---------------------------- */

test('a repeatedly failing provider is skipped for a cooldown instead of being retried forever', async () => {
  const gemini = fakeProvider('gemini', new ProviderError('Gemini responded 503', { status: 503 }));
  const openrouter = fakeProvider('openrouter', ANSWER_JSON);
  const { orchestrator } = makeOrchestrator([gemini, openrouter], { maxAttempts: 1, circuitFailureThreshold: 2, circuitCooldownMs: 60_000 });

  await orchestrator.run({ question: 'q1', context: {}, lang: 'en' });
  await orchestrator.run({ question: 'q2', context: {}, lang: 'en' });
  const callsBefore = gemini.calls.length;
  const third = await orchestrator.run({ question: 'q3', context: {}, lang: 'en' });

  assert.equal(gemini.calls.length, callsBefore, 'the tripped circuit must stop further calls');
  assert.equal(third.metadata.providerChain[0].code, 'CIRCUIT_OPEN');
  assert.equal(third.metadata.provider, 'openrouter');
});

/* --------------------------- 10. deduplication --------------------------- */

test('identical concurrent requests share one provider execution', async () => {
  let resolveProvider;
  const gate = new Promise((resolve) => {
    resolveProvider = resolve;
  });
  const gemini = fakeProvider('gemini', async () => {
    await gate;
    return ANSWER_JSON;
  });
  const { orchestrator } = makeOrchestrator([gemini]);
  const args = { question: 'same', context: contextWith([temperatureSeries()]), lang: 'en', dedupeKey: 'same-key' };

  const first = orchestrator.run(args);
  const second = orchestrator.run(args);
  resolveProvider();
  const [a, b] = await Promise.all([first, second]);

  assert.equal(gemini.calls.length, 1, 'one provider call for two identical requests');
  assert.equal(a.metadata.deduped, false);
  assert.equal(b.metadata.deduped, true);
  assert.deepEqual(a.answer.sections, b.answer.sections);
});

/* ------------------- 11. deterministic local analysis -------------------- */

test('the local engine computes mean, min, max from the retrieved months only', () => {
  const analysis = analyseSeries(temperatureSeries());
  assert.equal(analysis.count, 36);
  assert.equal(analysis.missing, 0);
  assert.equal(analysis.firstMonth, '2019-01');
  assert.equal(analysis.lastMonth, '2021-12');
  assert.equal(analysis.max.value, 30);
  assert.equal(analysis.max.month, '2019-01');
  assert.equal(analysis.min.value, 28);
  // 28 + (30-28)/36 = 28.0556 → rounded to 3 dp
  assert.equal(analysis.mean, 28.056);
});

test('the anomaly baseline is explicit, named, and always leaves a year to compare against', () => {
  const analysis = analyseSeries(temperatureSeries());
  assert.ok(analysis.anomaly);
  assert.equal(ANOMALY_BASELINE_YEARS, 5);
  // Three complete years → the baseline takes the first two, the third is compared
  // against them. A baseline that swallowed the whole window would make every
  // anomaly trivially zero.
  assert.deepEqual(analysis.anomaly.baselineYears, [2019, 2020]);
  assert.match(analysis.anomaly.baselineLabel, /not the WMO 1991–2020 normal/);
  assert.match(analysis.anomaly.baselineLabel, /2019–2020/);
  const baseline = (28 + 2 / 12 + 28) / 2;
  assert.ok(Math.abs(analysis.anomaly.baselineValue - Number(baseline.toFixed(3))) < 0.002);
  assert.equal(analysis.anomaly.points.length, 1, 'only the year after the baseline is an anomaly point');
  assert.equal(analysis.anomaly.points[0].year, 2021);
  assert.ok(Math.abs(analysis.anomaly.points[0].anomaly + Number((2 / 12 / 2).toFixed(3))) < 0.002);
  assert.equal(analysis.anomaly.latest.year, 2021);
});

test('a window with a single complete year reports no anomaly and says why', () => {
  const dates = MONTHS('2022-01', '2022-12');
  const analysis = analyseSeries({ code: 'T2M', unit: '°C', dates, values: dates.map(() => 27) });
  assert.equal(analysis.anomaly, null);
  const answer = buildLocalAnalystAnswer('Warming?', contextWith([{ code: 'T2M', unit: '°C', dates, values: dates.map(() => 27) }]));
  const gaps = answer.sections.find((section) => section.kind === 'gaps').bullets.join(' ');
  assert.match(gaps, /anomaly against a reference period cannot be formed/);
});

test('precipitation reports a percentage change and monthly totals in mm', () => {
  const analysis = analyseSeries(precipitationSeries());
  assert.ok(analysis.monthlyTotals.length > 0);
  // January has 31 days → 10 mm/day is a 310 mm monthly total.
  assert.equal(analysis.monthlyTotals[0].month, '2019-01');
  assert.equal(analysis.monthlyTotals[0].total, 310);
  // First half mean 10, second half mean 12 (18 months each) → +20 %.
  assert.equal(analysis.periodComparison.firstMean, 10);
  assert.equal(analysis.periodComparison.secondMean, 12);
  assert.equal(analysis.periodComparison.absoluteChange, 2);
  assert.equal(analysis.periodComparison.percentChange, 20);
});

test('seasonal means are computed per meteorological season', () => {
  const analysis = analyseSeries(temperatureSeries());
  const jja = analysis.seasonal.find((season) => season.season.startsWith('JJA'));
  assert.ok(jja);
  assert.equal(jja.count, 9, 'three Junes, Julys and Augusts');
  assert.equal(jja.mean, 28);
});

/* ---------------------- 12. missing POWER values ------------------------- */

test('missing months are detected, excluded from statistics and named as gaps', () => {
  const series = temperatureSeries();
  series.values[10] = null; // 2019-11 missing
  series.values[11] = -999; // 2019-12 POWER fill value
  const analysis = analyseSeries(series);

  assert.equal(analysis.missing, 2);
  assert.deepEqual(analysis.missingMonths, ['2019-11', '2019-12']);
  assert.equal(analysis.count, 34);
  // 2019 is no longer a complete year, so it drops out of the annual aggregate.
  const y2019 = analysis.annual.find((entry) => entry.year === 2019);
  assert.equal(y2019.complete, false);
  assert.equal(y2019.mean, null);

  const answer = buildLocalAnalystAnswer('What do the values show?', contextWith([series]));
  const gapBullets = answer.sections.find((section) => section.kind === 'gaps').bullets.join(' ');
  assert.match(gapBullets, /2019-11/);
  assert.match(gapBullets, /excluded from every statistic/i);
  // Nothing may claim a value for a missing month.
  assert.equal(/2019-12: ?\d/.test(answer.sections.map((section) => section.bullets.join(' ')).join(' ')), false);
});

/* ------------------------ 13. invalid units ------------------------------ */

test('an unknown unit degrades to "unit not reported" and never fabricates a conversion', () => {
  const series = { code: 'MYSTERY', unit: '', dates: MONTHS('2020-01', '2020-12'), values: new Array(12).fill(5) };
  const analysis = analyseSeries(series);
  assert.equal(analysis.unit, '');
  assert.equal(analysis.monthlyTotals, null, 'no mm conversion for an unknown unit');

  const answer = buildLocalAnalystAnswer('What is this?', contextWith([series]));
  const derived = answer.sections.find((section) => section.kind === 'derived').bullets.join(' ');
  assert.match(derived, /unit not reported/);
});

/* ------------------------ 14. empty dataset ------------------------------ */

test('an empty bundle says so instead of inventing an answer', () => {
  const emptyContext = { area: { label: 'Nowhere' }, dates: [], layers: [], power: null, dataGaps: [] };
  const analysis = analyseBundle(emptyContext);
  assert.equal(analysis.series.length, 0);
  assert.equal(analysis.coverage, null);

  const answer = buildLocalAnalystAnswer('What is happening here?', emptyContext);
  assert.equal(answer.sufficientData, false);
  const gaps = answer.sections.find((section) => section.kind === 'gaps').bullets.join(' ');
  assert.match(gaps, /No NASA POWER archive/i);
  // No number may appear in the verified section for an empty bundle.
  const verified = answer.sections.find((section) => section.kind === 'verified').bullets.join(' ');
  assert.equal(/°C|mm\/day/.test(verified), false);
});

test('a series that POWER returned as all-missing is reported, not smoothed over', () => {
  const series = { code: 'WS2M', unit: 'm/s', dates: MONTHS('2020-01', '2020-06'), values: [null, null, null, null, null, null] };
  const answer = buildLocalAnalystAnswer('Wind?', contextWith([series]));
  assert.equal(answer.sufficientData, false);
  const gaps = answer.sections.find((section) => section.kind === 'gaps').bullets.join(' ');
  assert.match(gaps, /WS2M/);
  assert.match(gaps, /no usable monthly values/i);
});

/* --------------------- 15. route contract (injected) --------------------- */

let server;
let baseUrl;

function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/earth', earthRouter);
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
}

async function postAnalyst(body) {
  const response = await fetch(`${baseUrl}/api/earth/analyst`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

function installOrchestrator(providers, overrides = {}) {
  const { orchestrator } = makeOrchestrator(providers, overrides);
  __setAnalystOrchestratorForTests(orchestrator);
  return orchestrator;
}

test('route: Gemini 503 → alternative provider answers, and no upstream text leaks', async () => {
  await startServer();
  try {
    installOrchestrator([
      fakeProvider('gemini', new ProviderError('Internal error from generativelanguage.googleapis.com?key=AIzaSECRET1234567890', { status: 503 })),
      fakeProvider('openrouter', ANSWER_JSON, { label: 'OpenRouter', model: 'google/gemini-2.0-flash-001' })
    ]);

    const { status, body } = await postAnalyst({ question: 'What do the values show?', context: contextWith([temperatureSeries()]), lang: 'en' });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.mode, 'remote');
    assert.equal(body.provider, 'openrouter');
    assert.equal(body.providerLabel, 'OpenRouter');
    assert.equal(body.model, 'google/gemini-2.0-flash-001');
    assert.equal(body.fallback, true);
    assert.equal(body.retries, 2);
    assert.equal(body.noticeCode, 'primary-unavailable');
    assert.equal(body.groundedInRetrievedData, true);
    assert.ok(Array.isArray(body.providerChain) && body.providerChain.length === 2);

    const serialised = JSON.stringify(body);
    assert.equal(serialised.includes('AIzaSECRET'), false, 'raw key material must never reach the client');
    assert.equal(serialised.includes('generativelanguage.googleapis.com?key'), false, 'raw upstream URLs/keys must be redacted');
    assert.equal(serialised.includes('Internal error'), false, 'raw upstream error text must not be echoed');
  } finally {
    server.close();
  }
});

test('route: every provider down → local mode answer with real numbers and an honest notice', async () => {
  await startServer();
  try {
    installOrchestrator([
      fakeProvider('gemini', new ProviderError('Gemini responded 503', { status: 503 })),
      fakeProvider('openrouter', new ProviderError('OpenRouter responded 429', { status: 429 }))
    ], { maxAttempts: 1 });

    const { status, body } = await postAnalyst({ question: 'Is it warming?', context: contextWith([temperatureSeries(), precipitationSeries()]), lang: 'en' });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.mode, 'local');
    assert.equal(body.provider, 'local');
    assert.equal(body.providerLabel, 'Local Earth Intelligence');
    assert.equal(body.noticeCode, 'all-providers-unavailable');
    assert.equal(body.groundingMode, 'deterministic-local-analysis');
    assert.ok(body.sections.some((section) => section.kind === 'derived' && section.bullets.length));
    // The numbers come from the retrieved values, not from a model.
    const derived = body.sections.find((section) => section.kind === 'derived').bullets.join(' ');
    assert.match(derived, /28\.0/);
    assert.match(derived, /\+20\.00 %|\+20 %/);
    assert.ok(Array.isArray(body.sources) && body.sources.some((source) => source.url.includes('power.larc.nasa.gov')));
    assert.equal(JSON.stringify(body).includes('Gemini responded'), false, 'the provider\'s own message is not echoed');
  } finally {
    server.close();
  }
});

test('route: an unreadable model answer becomes a local answer, not a 502 with raw text', async () => {
  await startServer();
  try {
    installOrchestrator([fakeProvider('gemini', '<html>gateway error</html>')]);
    const { status, body } = await postAnalyst({ question: 'Values?', context: contextWith([temperatureSeries()]), lang: 'en' });
    assert.equal(status, 200);
    assert.equal(body.mode, 'local');
    assert.equal(JSON.stringify(body).includes('gateway error'), false);
  } finally {
    server.close();
  }
});

test('route: invalid input is still rejected with a stable code', async () => {
  await startServer();
  try {
    const empty = await postAnalyst({ question: '', context: {}, lang: 'en' });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.code, 'invalid-question');

    const long = await postAnalyst({ question: 'x'.repeat(801), context: {}, lang: 'en' });
    assert.equal(long.status, 400);

    const noContext = await postAnalyst({ question: 'Hello', lang: 'en' });
    assert.equal(noContext.status, 400);
    assert.equal(noContext.body.code, 'missing-context');
  } finally {
    server.close();
  }
});

/* --------------------------- 16. no provider key ------------------------ */

test('route: with no provider configured the local engine answers without contacting anything', async () => {
  await startServer();
  try {
    __setAnalystOrchestratorForTests(null);
    // No real keys in the test process, so the real orchestrator has nothing configured.
    const { status, body } = await postAnalyst({ question: 'What do the values show?', context: contextWith([temperatureSeries()]), lang: 'en' });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.mode, 'local');
    assert.equal(body.provider, 'local');
    assert.equal(body.noticeCode, 'local-mode');
    assert.ok(body.sections.length >= 4);
  } finally {
    server.close();
  }
});

/* ---------------- 17. regression: POWER context & charts ----------------- */

test('the request bundle carries the retrieved monthly series, nulls preserved', async () => {
  const { buildAnalystContext, contextForRequest } = await import('../src/lib/earth/context.ts');
  const { buildSeriesStats } = await import('../src/lib/earth/power.ts');

  const rows = MONTHS('2022-01', '2022-12').map((date, index) => ({
    date,
    year: 2022,
    month: index + 1,
    values: { T2M: index === 5 ? null : 27 + index * 0.1, PRECTOTCORR: 5 }
  }));

  const stats = {
    T2M: buildSeriesStats(rows, 'T2M', '°C'),
    PRECTOTCORR: buildSeriesStats(rows, 'PRECTOTCORR', 'mm/day')
  };

  const bundle = buildAnalystContext({
    area: { label: 'Negombo, Sri Lanka', latitude: 7.2081, longitude: 79.8358, source: 'gazetteer' },
    primaryDate: '2022-06-01',
    layers: [],
    power: {
      latitude: 7.208,
      longitude: 79.836,
      placeLabel: 'Negombo, Sri Lanka',
      rows,
      available: ['T2M', 'PRECTOTCORR'],
      unavailable: [],
      requestedParameters: ['T2M', 'PRECTOTCORR'],
      startYear: 2022,
      endYear: 2022,
      gridNote: '≈0.5° × 0.625° grid cell',
      stats
    },
    powerProvenanceUrl: 'https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M'
  });

  assert.equal(bundle.power.series.length, 2);
  const t2m = bundle.power.series.find((entry) => entry.code === 'T2M');
  assert.equal(t2m.dates.length, 12);
  assert.equal(t2m.unit, '°C');
  assert.equal(t2m.values[5], null, 'a missing POWER cell stays null — never filled in');

  const payload = contextForRequest(bundle, 'What do the values show?');
  assert.equal(payload.context.power.series.length, 2);
  assert.equal(payload.context.power.available[0], 'T2M');
  // The chart statistics that existed before this work must still be present.
  assert.ok(payload.context.power.stats.some((entry) => entry.code === 'T2M' && typeof entry.mean === 'number'));

  // And the analyser can consume exactly that payload.
  const answer = buildLocalAnalystAnswer('What do the values show?', payload.context);
  assert.equal(answer.sufficientData, true);
  assert.ok(answer.sections.find((section) => section.kind === 'derived').bullets.length > 0);
});

/* --------------------- 18. provider health reporting -------------------- */

test('GET /health reports per-provider health without keys or quota spend', async () => {
  await startServer();
  try {
    const expr = express();
    expr.use(express.json());
    expr.use('/api/earth', earthRouter);
    const other = await new Promise((resolve) => {
      const srv = expr.listen(0, '127.0.0.1', () => resolve(srv));
    });
    const health = await (await fetch(`http://127.0.0.1:${other.address().port}/api/earth/health`)).json();
    other.close();

    assert.ok(Array.isArray(health.analystProviders));
    assert.deepEqual(
      health.analystProviders.map((entry) => entry.provider),
      ['gemini', 'openrouter', 'arena']
    );
    for (const provider of health.analystProviders) {
      assert.ok(['unconfigured', 'closed', 'open'].includes(provider.state));
      assert.equal(typeof provider.configured, 'boolean');
    }
    const serialised = JSON.stringify(health);
    assert.equal(/AIza|sk-|Bearer /.test(serialised), false, 'no key material in the health payload');
    assert.equal(health.capabilities.localAnalyst, true);
  } finally {
    server.close();
  }
});
