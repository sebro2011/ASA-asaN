/**
 * NOVA HYPOTHESIS FORGE — deterministic scientific computing tests.
 *
 * Every assertion here is against a value that can be derived by hand or from a
 * published closed form, not against whatever the code happens to output. Where
 * a method is stochastic (Monte Carlo) the test pins the seed so the result is
 * reproducible, and where a method is a screening convention the test pins the
 * fact that the output is *not* a discovery.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  convert,
  convertSeries,
  findUnit,
  propagateUncertainty,
  propagateUncertaintyMonteCarlo,
  conversionMetadata,
} from '../src/lib/forge/science/units.ts';
import {
  describe,
  percentile,
  correlate,
  linearRegression,
  tTestOneSample,
  tTestWelch,
  detectOutliers,
  jackknifeSensitivity,
  compareTrendModels,
  tQuantile975,
  tTwoSidedP,
  incompleteBeta,
} from '../src/lib/forge/science/stats.ts';
import {
  normalNormalUpdate,
  priorSensitivity,
  betaBinomialUpdate,
  bayesFactor,
} from '../src/lib/forge/science/bayes.ts';
import {
  projectile,
  twoBodyOrbit,
  dampedOscillator,
  newtonCooling,
  SIMULATION_MODELS,
} from '../src/lib/forge/science/simulation.ts';
import { scanSeries, mannKendall, verificationGate } from '../src/lib/forge/science/discovery.ts';
import { SCIENCE_ENGINE_VERSION, ScienceInputError } from '../src/lib/forge/science/contracts.ts';

const close = (actual, expected, tolerance = 1e-6, message = '') =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${message || 'value'} expected ${expected}, received ${actual}`,
  );

/* --------------------------------- contracts -------------------------------- */

test('engine version is exported and pinned in every record', () => {
  const result = describe([1, 2, 3], 'K');
  assert.equal(result.reproducibility.engineVersion, SCIENCE_ENGINE_VERSION);
  assert.equal(typeof result.reproducibility.computedAt, 'string');
  assert.ok(!Number.isNaN(Date.parse(result.reproducibility.computedAt)));
});

test('every computation carries a formula, assumptions and a missing-value policy', () => {
  const results = [
    describe([1, 2, 3, 4], 'K'),
    correlate([1, 2, 3, 4], [2, 4, 6, 9], { x: 's', y: 'K' }),
    tTestOneSample([1, 2, 3, 4], { mu: 0, unit: 'K' }),
    detectOutliers([1, 2, 3, 4, 5, 100], 'K'),
  ];
  for (const result of results) {
    assert.ok(result.reproducibility.formula.length > 10, `${result.id} has no formula`);
    assert.ok(result.assumptions.length > 0, `${result.id} has no assumptions`);
    assert.ok(result.limitations.length > 0, `${result.id} has no limitations`);
    assert.ok(result.reproducibility.missingValuePolicy.length > 0, `${result.id} has no missing-value policy`);
    assert.ok(['observed', 'computed', 'statistical', 'model-prediction', 'suggestion'].includes(result.claim));
  }
});

test('missing values are dropped, counted and never imputed', () => {
  const result = describe([1, null, 3, undefined, 5], 'K');
  assert.equal(result.sampleSize, 3);
  assert.equal(result.value.mean, 3);
  close(result.value.sd, 2, 1e-9);
  assert.match(result.reproducibility.missingValuePolicy, /Listwise deletion: 2 missing/);
});

test('a non-numeric input is rejected rather than coerced', () => {
  assert.throws(() => describe(['x'], 'K'), (error) => error instanceof ScienceInputError || error.code === 'INVALID_NUMBER' || error.code === 'EMPTY_DATASET');
});

/* ----------------------------------- units --------------------------------- */

test('unit conversion is exact for SI prefixes and astronomical scales', () => {
  close(convert(1, 'km', 'm'), 1000, 1e-12);
  close(convert(1, 'au', 'km'), 1.495978707e8, 1e-12);
  close(convert(1, 'pc', 'ly'), 3.261563777, 1e-8);
  close(convert(1, 'day', 's'), 86400, 1e-12);
});

test('temperature conversion honours the offset', () => {
  close(convert(0, 'degC', 'K'), 273.15, 1e-12);
  close(convert(100, '°C', 'K'), 373.15, 1e-12);
  close(convert(300, 'K', 'degC'), 26.85, 1e-12);
});

test('incompatible dimensions throw instead of returning a number', () => {
  assert.throws(() => convert(1, 'm', 's'), (error) => error.code === 'UNIT_MISMATCH');
  assert.throws(() => convert(1, 'K', 'kg'), (error) => error.code === 'UNIT_MISMATCH');
  assert.throws(() => convert(1, 'furlong', 'm'), (error) => error.code === 'UNKNOWN_UNIT');
});

test('conversion metadata reports the factor actually applied', () => {
  const meta = conversionMetadata('km', 'm');
  assert.equal(meta.factor, 1000);
  assert.equal(meta.dimension, 'length');
});

test('series conversion preserves nulls and uses rad/deg correctly', () => {
  assert.deepEqual(convertSeries([1, null, 3], 'km', 'm'), [1000, null, 3000]);
  close(convert(180, 'deg', 'rad'), Math.PI, 1e-12);
  assert.equal(findUnit('KM')?.symbol, 'km');
});

/* --------------------------- uncertainty propagation ------------------------ */

test('first-order propagation adds variances in quadrature', () => {
  const result = propagateUncertainty([
    { name: 'a', derivative: 1, sigma: 2 },
    { name: 'b', derivative: 2, sigma: 3 },
  ]);
  close(result.value, Math.sqrt(4 + 36), 1e-12);
  assert.ok(result.limitations.some((line) => /correlated/i.test(line)));
});

test('Monte Carlo propagation is deterministic for a fixed seed', () => {
  const model = (inputs) => inputs.a + inputs.b;
  const options = {
    model,
    inputs: [
      { name: 'a', mean: 5, sigma: 1 },
      { name: 'b', mean: 0, sigma: 2 },
    ],
    draws: 20000,
    seed: 7,
  };
  const first = propagateUncertaintyMonteCarlo(options);
  const second = propagateUncertaintyMonteCarlo(options);
  assert.equal(first.value, second.value);
  close(first.value, 5, 0.05);
  close(first.uncertainty, Math.sqrt(1 + 4), 0.05);
  assert.equal(first.reproducibility.seed, 7);
  assert.ok(first.interval[0] < first.value && first.value < first.interval[1]);
});

/* -------------------------------- descriptives ------------------------------ */

test('descriptive statistics match hand calculations', () => {
  const result = describe([2, 4, 4, 4, 5, 5, 7, 9], 'K');
  assert.equal(result.value.mean, 5);
  assert.equal(result.value.median, 4.5);
  close(result.value.variance, 32 / 7, 1e-12);
  close(result.value.sd, Math.sqrt(32 / 7), 1e-12);
  assert.equal(result.value.min, 2);
  assert.equal(result.value.max, 9);
  assert.equal(result.sampleSize, 8);
});

test('percentiles use linear interpolation (R type 7)', () => {
  assert.equal(percentile([1, 2, 3, 4], 0.25), 1.75);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentile([1, 2, 3, 4], 0.75), 3.25);
  assert.throws(() => percentile([], 0.5));
});

test('the mean interval widens as the sample shrinks', () => {
  const wide = describe([1, 5], 'K');
  const narrow = describe([1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11], 'K');
  assert.ok(wide.interval[1] - wide.interval[0] > narrow.interval[1] - narrow.interval[0]);
});

/* -------------------------------- correlation ------------------------------- */

test('Pearson correlation is exact for perfect and anti-correlated data', () => {
  const perfect = correlate([1, 2, 3, 4], [2, 4, 6, 8], { x: 's', y: 'K' });
  close(perfect.value.r, 1, 1e-12);
  close(perfect.value.rSquared, 1, 1e-12);
  close(perfect.value.slope, 2, 1e-12);
  const inverse = correlate([1, 2, 3, 4], [8, 6, 4, 2], { x: 's', y: 'K' });
  close(inverse.value.r, -1, 1e-12);
});

test('correlation refuses to pretend with too few pairs', () => {
  const result = correlate([1, 2], [2, 4], { x: 's', y: 'K' });
  assert.equal(result.skipped, true);
  assert.ok(result.skipReason.includes('at least 3'));
  assert.ok(result.value.r !== result.value.r); // NaN, not a fabricated 0
});

test('correlation always states that it is not causation', () => {
  const result = correlate([1, 2, 3, 4, 5], [2, 1, 4, 3, 6], { x: 's', y: 'K' });
  assert.ok(result.assumptions.some((line) => /not evidence of causation/i.test(line)));
  assert.ok(result.limitations.some((line) => /autocorrelated/i.test(line)));
});

test('pairwise deletion keeps aligned pairs only', () => {
  const result = correlate([1, 2, null, 4, 5], [2, null, 6, 8, 10], { x: 's', y: 'K' });
  // Pairs (1,2), (4,8) and (5,10) survive; the two incomplete pairs are excluded.
  assert.equal(result.sampleSize, 3);
  assert.equal(result.skipped, false);
  assert.match(result.reproducibility.missingValuePolicy, /2 incomplete pair/);
});

test('Fisher interval brackets the estimate', () => {
  const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const result = correlate(data, data.map((value) => value + (value % 2 === 0 ? 1 : -1)), { x: 'a', y: 'b' });
  assert.ok(result.interval[0] < result.value.r && result.value.r < result.interval[1]);
});

/* -------------------------------- regression -------------------------------- */

test('OLS recovers an exact line and its uncertainty is zero', () => {
  const result = linearRegression([1, 2, 3, 4, 5], [3, 5, 7, 9, 11], { x: 's', y: 'K' });
  close(result.value.slope, 2, 1e-12);
  close(result.value.intercept, 1, 1e-12);
  close(result.value.rSquared, 1, 1e-12);
  close(result.value.slopeStdError, 0, 1e-9);
});

test('OLS slope interval contains the true slope on noisy data', () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const y = x.map((value) => 2 * value + 1 + (value % 3 === 0 ? 0.5 : -0.2));
  const result = linearRegression(x, y, { x: 's', y: 'K' });
  assert.ok(result.value.slopeInterval[0] < 2 && 2 < result.value.slopeInterval[1]);
  assert.ok(result.limitations.some((line) => /extrapolat/i.test(line)));
});

/* ------------------------------ hypothesis tests ---------------------------- */

test('one-sample t-test matches the hand-computed statistic', () => {
  const result = tTestOneSample([1, 2, 3, 4, 5], { mu: 0, unit: 'K' });
  close(result.value.statistic, 3 / (Math.sqrt(2.5) / Math.sqrt(5)), 1e-9);
  assert.equal(result.value.df, 4);
  close(result.value.pValue, 0.013236, 1e-4);
  close(result.value.effectSize, 3 / Math.sqrt(2.5), 1e-9);
});

test('a t-test on a null sample is not significant, and says what a p-value means', () => {
  const result = tTestOneSample([0.1, -0.2, 0.05, -0.1, 0.15], { mu: 0, unit: 'K' });
  assert.ok(result.value.pValue > 0.05);
  assert.ok(result.limitations.some((line) => /not the probability that H₀ is true/i.test(line)));
});

test('t-test refuses tiny samples instead of reporting a p-value', () => {
  const result = tTestOneSample([1, 2], { mu: 0, unit: 'K' });
  assert.equal(result.skipped, true);
  assert.ok(result.value.pValue !== result.value.pValue);
});

test('Welch t-test handles unequal variances and group sizes', () => {
  const result = tTestWelch([1, 2, 3], [4, 5, 6], 'K');
  close(result.value.meanDifference, -3, 1e-12);
  close(result.value.statistic, -3 / Math.sqrt(2 / 3), 1e-9);
  // With equal variances the Welch df reduces to n₁+n₂−2 = 4.
  close(result.value.df, 4, 1e-9);
});

test('incomplete beta and t tails agree with known values', () => {
  close(incompleteBeta(1, 1, 0.5), 0.5, 1e-10);
  close(incompleteBeta(2, 2, 0.5), 0.5, 1e-10);
  close(tTwoSidedP(2.776445, 4), 0.05, 1e-5);
  assert.equal(tQuantile975(4), 2.776);
  assert.equal(tQuantile975(1000), 1.959963984540054);
});

/* --------------------------------- outliers -------------------------------- */

test('robust outlier detection finds a gross outlier and ignores normal spread', () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100];
  const result = detectOutliers(values, 'K');
  assert.equal(result.value.indices.length, 1);
  assert.equal(result.value.indices[0], 10);
  assert.ok(result.limitations.some((line) => /Never delete/i.test(line)));
});

test('a degenerate MAD is reported rather than silently flagging nothing', () => {
  const result = detectOutliers([10, 10, 10, 10, 10, 10, 100], 'K');
  assert.equal(result.value.scale, 0);
  assert.ok(result.limitations.some((line) => /MAD = 0/.test(line)), 'the zero-scale caveat must be stated');
});

/* -------------------------------- sensitivity ------------------------------ */

test('jackknife identifies the single most influential point', () => {
  const result = jackknifeSensitivity([1, 2, 3, 4, 100], 'K');
  assert.equal(result.value.mostInfluential.index, 4);
  close(result.value.mostInfluential.leaveOneOutMean, 2.5, 1e-12);
  assert.ok(result.limitations.some((line) => /influence, not correctness/i.test(line)));
});

/* ----------------------------- model comparison ---------------------------- */

test('AIC prefers the exponential model on exponential data', () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const y = x.map((value) => 2 * Math.exp(0.35 * value));
  const result = compareTrendModels(x, y, { x: 's', y: 'count' });
  assert.equal(result.value.preferred, 'exponential');
  // ΔAIC = AIC(linear) − AIC(exponential) > 0 favours the exponential.
  assert.ok(result.value.deltaAic > 0);
});

test('AIC prefers the linear model on linear data and admits ties', () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const linear = compareTrendModels(x, x.map((value) => 3 * value + 2), { x: 's', y: 'K' });
  assert.equal(linear.value.preferred, 'linear');
  assert.ok(linear.limitations.some((line) => /not a mechanism|does not test either model/i.test(line)));
});

/* ---------------------------------- Bayes ---------------------------------- */

test('normal–normal update matches the conjugate closed form', () => {
  const result = normalNormalUpdate([1, 1.1, 0.9], { priorMean: 0, priorSd: 10, knownSd: 1, unit: 'K' });
  const priorPrecision = 1 / 100;
  const dataPrecision = 3 / 1;
  const expected = (priorPrecision * 0 + dataPrecision * 1) / (priorPrecision + dataPrecision);
  close(result.value.posteriorMean, expected, 1e-9);
  close(result.value.posteriorSd, Math.sqrt(1 / (priorPrecision + dataPrecision)), 1e-9);
  assert.ok(result.assumptions.some((line) => /Prior: μ ~ Normal/.test(line)));
});

test('the prior is visible and its influence is reported', () => {
  const result = normalNormalUpdate([1, 1.1, 0.9], { priorMean: 50, priorSd: 0.01, knownSd: 1, unit: 'K' });
  // A razor-sharp prior at 50 dominates three points at ~1 — and the record must say so.
  assert.ok(result.value.posteriorMean > 40);
  assert.ok(result.value.weightOnData < 0.5);
  assert.ok(result.limitations.some((line) => /change the prior/i.test(line)));
});

test('prior sensitivity shows how far the answer moves', () => {
  const result = priorSensitivity([1, 1.2, 0.8], {
    priorMeans: [0, 10],
    priorSds: [0.1, 10],
    unit: 'K',
  });
  assert.equal(result.value.length, 4);
  assert.ok(result.limitations.some((line) => /moves by/.test(line)));
});

test('Beta–Binomial posterior is the exact conjugate posterior', () => {
  const result = betaBinomialUpdate({ successes: 7, trials: 10 });
  assert.equal(result.value.posteriorAlpha, 8);
  assert.equal(result.value.posteriorBeta, 4);
  close(result.value.posteriorMean, 8 / 12, 1e-12);
  assert.ok(result.value.credibleInterval[0] > 0.3 && result.value.credibleInterval[1] < 0.95);
  assert.throws(() => betaBinomialUpdate({ successes: 11, trials: 10 }));
});

test('Bayes factor is relative and says so', () => {
  const result = bayesFactor({
    observedMean: 0.6,
    n: 25,
    knownSd: 1,
    modelA: { mean: 1 },
    modelB: { mean: 0 },
  });
  close(result.value.log10BayesFactor, 1.0857, 1e-3);
  assert.match(result.value.interpretation, /Moderate/);
  assert.ok(result.limitations.some((line) => /relative/i.test(line)));
});

/* -------------------------------- simulations ------------------------------ */

test('projectile in vacuum reproduces the analytic range', () => {
  const result = projectile({ speed: 20, angleDeg: 45, dragK: 0, dt: 0.001 });
  const expected = (20 * 20 * Math.sin(Math.PI / 2)) / 9.80665;
  close(result.value.diagnostics.range_m, expected, 2e-3);
  assert.equal(result.value.validation.passed, true);
  assert.equal(result.claim, 'model-prediction');
});

test('drag shortens the trajectory and the run says it is a model', () => {
  const vacuum = projectile({ speed: 20, angleDeg: 45, dragK: 0 });
  const drag = projectile({ speed: 20, angleDeg: 45, dragK: 0.01 });
  assert.ok(drag.value.diagnostics.range_m < vacuum.value.diagnostics.range_m);
  assert.equal(drag.value.validation, null);
  assert.ok(drag.limitations.some((line) => /not a measurement/i.test(line)));
});

test('two-body orbit closes on itself and conserves energy', () => {
  const mu = 6.6743e-11 * 5.9722e24;
  const radius = 7e6;
  const speed = Math.sqrt(mu / radius);
  const result = twoBodyOrbit({ centralMass: 5.9722e24, radius, tangentialSpeed: speed, steps: 20000 });
  close(result.value.diagnostics.period_s, 2 * Math.PI * Math.sqrt(radius ** 3 / mu), 1e-6);
  assert.equal(result.value.validation.passed, true);
  assert.ok(result.value.diagnostics.energyDriftRelative < 1e-6);
  assert.ok(result.value.diagnostics.eccentricity < 1e-3);
});

test('a hyperbolic initial state is rejected rather than integrated', () => {
  assert.throws(
    () => twoBodyOrbit({ centralMass: 5.9722e24, radius: 7e6, tangentialSpeed: 20000 }),
    (error) => error.code === 'INVALID_PARAMETER',
  );
});

test('the oscillator matches its analytic solution in every damping regime', () => {
  for (const dampingRatio of [0, 0.2, 1, 2]) {
    const result = dampedOscillator({ omega0: 2, dampingRatio, amplitude: 1, duration: 10, dt: 0.002 });
    assert.equal(result.value.validation.passed, true, `ζ=${dampingRatio} failed validation`);
    assert.ok(result.value.validation.relativeError < 0.01);
  }
});

test('Newton cooling converges to the environment and matches the closed form', () => {
  const result = newtonCooling({
    initialTemperature: 373,
    environmentTemperature: 293,
    tau: 600,
    duration: 3000,
  });
  assert.equal(result.value.validation.passed, true);
  close(result.value.diagnostics.finalTemperature, result.value.diagnostics.analyticFinal, 1e-9);
  assert.ok(result.value.diagnostics.approachedEnvironmentWithin);
});

test('every advertised simulation model is implemented', () => {
  assert.deepEqual(
    SIMULATION_MODELS.map((model) => model.id),
    ['projectile', 'two-body', 'damped-oscillator', 'newton-cooling'],
  );
});

/* --------------------------------- discovery ------------------------------- */

test('Mann–Kendall detects a strict monotonic ramp', () => {
  const values = Array.from({ length: 10 }, (_, index) => index + 1);
  const result = mannKendall(values);
  assert.equal(result.s, 45);
  close(result.tau, 1, 1e-12);
  assert.ok(result.pValue < 0.001);
});

test('discovery screening returns candidates, never verified discoveries', () => {
  const values = Array.from({ length: 40 }, (_, index) => index * 0.5 + (index % 3 === 0 ? 0.2 : 0));
  const result = scanSeries({ values, unit: 'K', label: 'test series' });
  assert.ok(result.value.candidates.length > 0);
  for (const candidate of result.value.candidates) {
    assert.equal(candidate.verified, false);
    assert.notEqual(candidate.claim, 'verified');
    assert.ok(candidate.verificationRequired.length > 20, `${candidate.id} lacks a verification requirement`);
  }
  assert.match(result.value.summary, /none is a discovery|valid outcome|No candidate/i);
});

test('a flat series produces no candidates and says that is a valid outcome', () => {
  const result = scanSeries({ values: Array.from({ length: 20 }, () => 5), unit: 'K', label: 'flat' });
  assert.equal(result.value.candidates.length, 0);
  assert.match(result.value.summary, /valid outcome/);
  assert.ok(result.value.notRun.length > 0);
});

test('screening refuses short series and lists what it did not run', () => {
  const result = scanSeries({ values: [1, 2, 3], unit: 'K', label: 'short' });
  assert.equal(result.value.candidates.length, 0);
  const methods = result.value.notRun.map((entry) => entry.method).join(' ');
  assert.match(methods, /Mann–Kendall/);
  assert.match(methods, /Periodicity/);
});

test('the verification gate cannot be passed without an independent record', () => {
  const candidate = scanSeries({
    values: Array.from({ length: 30 }, (_, index) => index),
    unit: 'K',
    label: 'ramp',
  }).value.candidates[0];
  const unverified = verificationGate(candidate, null);
  assert.equal(unverified.verified, false);
  const incomplete = verificationGate(candidate, {
    reproducedBy: '',
    method: 'Mann–Kendall',
    independentDataset: 'other station',
    agrees: true,
  });
  assert.equal(incomplete.verified, false);
  assert.match(incomplete.reason, /not admissible/);
  const failed = verificationGate(candidate, {
    reproducedBy: 'Dr Example',
    method: 'Mann–Kendall',
    independentDataset: 'station B',
    agrees: false,
  });
  assert.equal(failed.verified, false);
  const passed = verificationGate(candidate, {
    reproducedBy: 'Dr Example',
    method: 'Mann–Kendall',
    independentDataset: 'station B',
    agrees: true,
  });
  assert.equal(passed.verified, true);
  assert.match(passed.reason, /not yet a scientific discovery/);
});
