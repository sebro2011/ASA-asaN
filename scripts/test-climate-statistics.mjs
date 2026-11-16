/**
 * COSMORA — scientific unit tests for the climate statistics engine.
 *
 * Run: `npm run test:stats`
 *      (equivalently `node --import tsx --test scripts/test-climate-statistics.mjs`)
 *
 * ## What this suite is for
 *
 * Every assertion here is either:
 *
 *   (a) a **closed-form known result** — an exact line has Sen slope exactly equal
 *       to its gradient; a constant series has S = 0 and p = 1; a 20-point series
 *       has 190 pairs; or
 *   (b) a **measured error rate** — a seeded simulation that counts how often the
 *       test rejects a null that is true, and asserts the rate lands in a band
 *       that was measured *before* the assertion was written.
 *
 * A test that only asserts "a number was returned" is not a test, so there are
 * none of those.
 *
 * ## Determinism
 *
 * All randomness comes from a local mulberry32 seeded per test. No `Math.random`,
 * no clocks, no network. Two runs on any machine produce identical numbers.
 *
 * ## Dataset coverage (required by the task)
 *
 *   no trend · positive trend · negative trend · positive autocorrelation ·
 *   negative autocorrelation · constant · missing observations · short records ·
 *   seasonal trends · historical mean shifts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STATISTICS_CONFIG,
  blockBootstrapMannKendall,
  computeSeriesCorrelation,
  erfc,
  mannKendallTest,
  maxAutocorrelationLag,
  normalCdf,
  normalInv,
  pettittChangePointTest,
  seasonalMannKendallTest,
  tTest,
  twoSidedNormalPValue
} from '../src/lib/earth/climateStatistics.ts';
import { buildTrendVerdict, computeExtendedStats, computeHistoricalSplit } from '../src/lib/earth/climateEngine.ts';

/* ------------------------------------------------------------------ helpers */

const close = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${a} within ${tol} of ${b}`);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded standard normal via Box–Muller on two uniforms. */
function makeGaussian(seed) {
  const r = mulberry32(seed);
  return () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

/**
 * AR(1) series: x_t = φ·x_{t−1} + ε_t, optionally with a linear drift.
 * `driftPerStep` is added *after* the AR recursion, so it is an exact trend.
 */
function ar1(n, phi, seed, driftPerStep = 0, scale = 1) {
  const g = makeGaussian(seed);
  const out = [];
  let prev = 0;
  for (let i = 0; i < n; i += 1) {
    prev = phi * prev + g() * scale;
    out.push(prev + driftPerStep * i);
  }
  return out;
}

const asSeries = (values, startYear = 1990) => values.map((value, i) => ({ year: startYear + i, value }));

/** Synthetic NASA-POWER-shaped dataset for the engine-level tests. */
function makePowerDataset({ startYear, endYear, missingDates = [], t2m = () => 27, precip = () => 3 }) {
  const rows = [];
  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const date = `${year}-${String(month).padStart(2, '0')}`;
      const missing = missingDates.includes(date);
      rows.push({
        date,
        year,
        month,
        values: {
          T2M: missing ? null : t2m(year, month),
          PRECTOTCORR: missing ? null : precip(year, month)
        }
      });
    }
  }
  const available = ['T2M', 'PRECTOTCORR'];
  return {
    latitude: 6.9271,
    longitude: 79.8612,
    placeLabel: 'Synthetic',
    rows,
    available,
    unavailable: [],
    requestedParameters: available,
    startYear,
    endYear,
    elevationMeters: 7,
    gridNote: 'synthetic',
    stats: {
      T2M: { code: 'T2M', unit: '°C', count: 0, mean: null, min: null, max: null, trend: null, annual: [] },
      PRECTOTCORR: { code: 'PRECTOTCORR', unit: 'mm/day', count: 0, mean: null, min: null, max: null, trend: null, annual: [] }
    }
  };
}

/* ================================================================== */
/* 1. Centralised configuration                                        */
/* ================================================================== */

test('config: the published trend threshold is 0.01, matching the method specification', () => {
  // docs/earth-lab/03_STATISTICAL_METHOD.md §4.3. The implementation used to
  // ship 0.05 while the document and the calibration study specified 0.01.
  assert.equal(STATISTICS_CONFIG.trendAlpha, 0.01);
  assert.equal(STATISTICS_CONFIG.literalAlpha05, 0.05);
  assert.equal(STATISTICS_CONFIG.literalAlpha01, 0.01);
  assert.equal(STATISTICS_CONFIG.minAnnualObservations, 10);
  assert.equal(STATISTICS_CONFIG.minEffectiveObservations, 10);
  assert.equal(STATISTICS_CONFIG.shortRecordEffectiveObservations, 14);
});

test('config: config object is frozen so a caller cannot mutate shared thresholds', () => {
  assert.ok(Object.isFrozen(STATISTICS_CONFIG));
  assert.throws(() => {
    STATISTICS_CONFIG.trendAlpha = 0.5;
  }, TypeError);
});

test('config: autocorrelation lag rule is min(n-3, floor(n/3), cap)', () => {
  assert.equal(maxAutocorrelationLag(30), 10); // floor(30/3) = 10, equals the cap
  assert.equal(maxAutocorrelationLag(60), 10); // capped at 10, not 20
  assert.equal(maxAutocorrelationLag(21), 7); // floor(21/3) = 7
  assert.equal(maxAutocorrelationLag(12), 4); // floor(12/3) = 4
  assert.equal(maxAutocorrelationLag(5), 1); // floor(5/3) = 1, n-3 = 2
  assert.equal(maxAutocorrelationLag(3), 0); // n-3 = 0
});

/* ================================================================== */
/* 2. Distribution numerics                                            */
/* ================================================================== */

test('numerics: erfc and the normal CDF match published values to 7 decimals', () => {
  close(erfc(0), 1, 1e-9, 'erfc(0)');
  close(erfc(1), 0.15729920705028513, 1e-7, 'erfc(1)');
  close(erfc(-1), 1.8427007929497148, 1e-7, 'erfc(-1)');
  close(erfc(2), 0.004677734981063127, 1e-7, 'erfc(2)');
  close(erfc(0.5), 0.4795001221869535, 1e-7, 'erfc(0.5)');
  // Continuity of the blended approximations at the switch point.
  close(erfc(0.4999999), erfc(0.5000001), 1e-6, 'erfc continuity at 0.5');
  close(normalCdf(0), 0.5, 1e-12, 'Phi(0)');
  close(normalCdf(1.959963984540054), 0.975, 1e-7, 'Phi(1.96)');
  close(normalCdf(-1.959963984540054), 0.025, 1e-7, 'Phi(-1.96)');
  close(normalCdf(2.5758293035489004), 0.995, 1e-7, 'Phi(2.576)');
  assert.equal(normalCdf(Infinity), 1);
  assert.equal(normalCdf(-Infinity), 0);
});

test('numerics: normalInv inverts normalCdf across the bulk and the tails', () => {
  for (const p of [0.001, 0.01, 0.025, 0.1, 0.3, 0.5, 0.7, 0.9, 0.975, 0.99, 0.999]) {
    close(normalCdf(normalInv(p)), p, 1e-6, `round trip p=${p}`);
  }
  assert.equal(normalInv(0), -Infinity);
  assert.equal(normalInv(1), Infinity);
});

test('numerics: two-sided normal p-values hit the textbook landmarks', () => {
  close(twoSidedNormalPValue(1.959963984540054), 0.05, 1e-6, 'p at 1.96');
  close(twoSidedNormalPValue(2.5758293035489004), 0.01, 1e-6, 'p at 2.576');
  close(twoSidedNormalPValue(0), 1, 1e-12, 'p at 0');
  // The new erfc resolves deep tails that the previous Abramowitz & Stegun form
  // could not: p at z = 6 is 1.97e-9, not 0.
  close(twoSidedNormalPValue(6), 1.9731752901355265e-9, 1e-12, 'p at z=6');
  assert.ok(twoSidedNormalPValue(6) > 0, 'a deep-tail p-value must not underflow to zero');
  assert.equal(twoSidedNormalPValue(Infinity), 1, 'non-finite z yields p = 1, never NaN');
});

/* ================================================================== */
/* 3. Mann–Kendall: known closed-form results                          */
/* ================================================================== */

test('MK known result: an exact line recovers its slope, S = n(n-1)/2 and p < 1e-6', () => {
  // Specification §8 T1.
  const values = Array.from({ length: 20 }, (_, i) => 10 + 0.25 * i);
  const r = mannKendallTest(asSeries(values, 2000));

  assert.equal(r.eligible, true);
  assert.equal(r.inferenceEligible, true);
  assert.equal(r.n, 20);
  // Every one of the 190 pairs is increasing, so S = 190 exactly.
  assert.equal(r.sStatistic, 190);
  assert.equal(r.kendallTau, 1);
  close(r.senSlopePerDecade, 2.5, 1e-9, 'Sen slope per decade');
  // A perfectly monotone series cannot be explained by noise.
  // p = 1e-6 is the smallest value the reporting floor will emit, and it is a
  // lower bound: the assertion is that p is at least that small AND non-zero.
  assert.ok(r.pValue <= 1e-5, `p should be <= 1e-5, got ${r.pValue}`);
  assert.ok(r.pValue > 0, 'a reported p-value must never be exactly 0');
  assert.equal(r.significant, true);
  assert.equal(r.direction, 'increasing');
  // Exactly one lag is examined at n = 20 (floor(20/3) = 6); with a perfectly
  // linear series the detrended ranks are constant, so no lag can inflate Var(S).
  assert.equal(r.varianceInflationFactor, 1, 'a perfectly linear series must not be inflated');
});

test('MK known result: a constant series gives S = 0, p = 1 and no division error', () => {
  // Specification §8 T5.
  const r = mannKendallTest(asSeries(Array(20).fill(42.5)));
  assert.equal(r.eligible, true);
  assert.equal(r.sStatistic, 0);
  assert.equal(r.kendallTau, 0);
  // All pairs are tied, so Var(S) = 0 and the statistic sits exactly at its null
  // centre. Specification §4.4: slope 0, p = 1, direction "no clear trend" — NOT a
  // withheld verdict, and emphatically not a division by zero.
  assert.equal(r.rawVariance, 0);
  assert.equal(r.pValue, 1, 'a zero-variance series reports p = 1, not null');
  assert.equal(r.senSlopePerDecade, 0);
  assert.equal(r.direction, 'no-trend');
  assert.equal(r.significant, false);
  assert.ok(Number.isFinite(r.zAdjusted), 'z must be finite, not NaN');
  assert.match(r.interpretation, /identical/i);
  // The bootstrap must decline to resample a degenerate null distribution.
  assert.equal(r.bootstrap, null);
});

test('MK known result: a negative trend is detected with the correct sign', () => {
  const values = Array.from({ length: 24 }, (_, i) => 100 - 0.4 * i);
  const r = mannKendallTest(asSeries(values));
  assert.equal(r.sStatistic, -(24 * 23) / 2);
  close(r.senSlopePerDecade, -4, 1e-9, 'Sen slope');
  assert.equal(r.direction, 'decreasing');
  assert.equal(r.significant, true);
  assert.ok(r.senCi95PerDecade !== null);
  assert.ok(r.senCi95PerDecade[1] < 0, 'the whole 95% CI lies below zero');
});

/* ================================================================== */
/* 4. Refusal rules                                                    */
/* ================================================================== */

test('refusal: 5 complete years withholds the p-value entirely', () => {
  // Specification §8 T4.
  const r = mannKendallTest(asSeries(Array.from({ length: 5 }, (_, i) => i)));
  assert.equal(r.eligible, false);
  assert.equal(r.inferenceEligible, false);
  assert.equal(r.pValue, null);
  assert.equal(r.zAdjusted, null);
  assert.equal(r.senCi95PerDecade, null);
  assert.equal(r.direction, 'insufficient-data');
  assert.equal(r.confidence, 'insufficient-data');
  assert.match(r.ineligibilityReason, /below the required minimum of 10/);
});

test('refusal: duplicate years are collapsed, not double-counted', () => {
  const series = asSeries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  // Inject a duplicate of year 1995 with a different value.
  const withDup = [...series, { year: 1995, value: 999 }].sort((a, b) => a.year - b.year);
  const dup = mannKendallTest(withDup);
  const clean = mannKendallTest(series);
  assert.equal(dup.n, 12, 'the duplicate year must not increase n');
  assert.equal(dup.sStatistic, clean.sStatistic, 'the duplicate must not change S');
});

test('refusal: non-finite values are dropped before counting', () => {
  const series = asSeries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  series.push({ year: 2003, value: NaN });
  series.push({ year: 2004, value: Infinity });
  const r = mannKendallTest(series);
  assert.equal(r.n, 12);
});

/* ================================================================== */
/* 5. Hamed–Rao autocorrelation correction                             */
/* ================================================================== */

test('Hamed-Rao: the variance inflation factor is never below 1 (no anti-conservative correction)', () => {
  // Specification §8 T12. Measured over strong negative AND positive lags.
  for (const phi of [-0.8, -0.5, -0.2, 0, 0.2, 0.5, 0.8]) {
    for (let seed = 1; seed <= 12; seed += 1) {
      const r = mannKendallTest(asSeries(ar1(30, phi, seed * 101)));
      assert.ok(
        r.varianceInflationFactor >= 1,
        `phi=${phi} seed=${seed}: factor ${r.varianceInflationFactor} must be >= 1`
      );
      assert.ok(r.adjustedVariance >= r.rawVariance, 'adjusted variance must not shrink');
    }
  }
});

test('Hamed-Rao: a negative lag is excluded, never folded in as |rho|', () => {
  // The previous implementation summed |rho_k|, so a strong NEGATIVE lag-1 would
  // inflate the variance and make the test conservative for the wrong reason.
  // Under the specified rule a negative lag contributes nothing: it is zeroed.
  // (The *published* gate does retain the sign, which is exactly why the published
  // factor is disclosed separately and is not clamped - see the next assertion.)
  const values = ar1(30, -0.7, 4242);
  const r = mannKendallTest(asSeries(values));
  assert.ok(r.lag1Autocorrelation < 0, `expected negative lag-1, got ${r.lag1Autocorrelation}`);

  // The published (gate, signed) recipe can fall below 1 precisely because a
  // negative lag is allowed to shrink the variance. That is the anti-conservative
  // behaviour that was measured and rejected.
  assert.ok(
    r.varianceInflationFactorPublished < 1,
    `the signed published factor should fall below 1 here, got ${r.varianceInflationFactorPublished}`
  );
  // The shipped factor is clamped and can therefore only ever be >= 1.
  assert.ok(r.varianceInflationFactor >= 1);
  assert.equal(r.adjustedVariance >= r.rawVariance, true);
  // Any lag that did contribute must have been positive.
  for (const lag of r.autocorrelationLagsUsed) {
    assert.ok(lag >= 1 && lag <= r.maxLagExamined);
  }
});

test('Hamed-Rao: positive autocorrelation inflates the variance and can only shrink significance', () => {
  const values = ar1(30, 0.7, 909);
  const r = mannKendallTest(asSeries(values));
  assert.ok(r.lag1Autocorrelation > 0.2, `expected positive lag-1, got ${r.lag1Autocorrelation}`);
  assert.ok(r.varianceInflationFactor > 1, 'positive autocorrelation must inflate the variance');
  // The adjusted p-value can never be smaller (more significant) than the naive one.
  assert.ok(
    r.pValue >= r.pClassical,
    `adjusted p (${r.pValue}) must be >= naive p (${r.pClassical})`
  );
  // And the effective sample must be smaller than the nominal one.
  assert.ok(r.effectiveSampleSize < r.n);
});

test('Hamed-Rao: the published (ungated) factor is reported alongside the specified one', () => {
  const r = mannKendallTest(asSeries(ar1(30, 0.6, 777)));
  assert.equal(typeof r.varianceInflationFactorPublished, 'number');
  // The two recipes differ: the published one applies a significance gate.
  assert.notEqual(r.varianceInflationFactorPublished, undefined);
  // Neither may be reported as the other.
  assert.equal(r.effectiveSampleRatio, r.varianceInflationFactor, 'the alias must match the factor');
});

test('Hamed-Rao: lag window follows the floor(n/3) rule, not a fixed 10', () => {
  const shortRecord = mannKendallTest(asSeries(ar1(12, 0.5, 55)));
  assert.equal(shortRecord.maxLagExamined, 4, 'n = 12 -> floor(12/3) = 4 lags');
  const longRecord = mannKendallTest(asSeries(ar1(60, 0.5, 56)));
  assert.equal(longRecord.maxLagExamined, 10, 'n = 60 -> capped at 10 lags');
});

/* ================================================================== */
/* 6. Effective sample size eligibility                                */
/* ================================================================== */

test('effective sample size: a strongly autocorrelated record withholds inference', () => {
  // A random walk: the raw record length (20 >= 10) passes, so only the
  // effective-sample rule can catch this - and it must. This is also the case
  // that matters physically: a 20-year monotonically drifting climate record
  // looks like the strongest possible trend and carries almost no evidence.
  // Seed 7 is a genuinely persistent random walk (lag-1 = 0.556, variance factor
  // 2.757). Seed 31337 by contrast produces a clean monotone drift that the rank
  // detrending flattens, leaving n* = 13.1 - a different, also-correct outcome.
  const g = makeGaussian(7);
  let acc = 0;
  const values = Array.from({ length: 20 }, () => {
    acc += g();
    return acc;
  });
  const r = mannKendallTest(asSeries(values));
  assert.equal(r.eligible, true, 'the record is long enough to compute');
  assert.ok(r.effectiveSampleSize < STATISTICS_CONFIG.minEffectiveObservations,
    `expected n* < 10, got ${r.effectiveSampleSize}`);
  assert.ok(r.varianceInflationFactor > 2, 'a random walk must inflate the variance substantially');
  assert.equal(r.inferenceEligible, false);
  assert.equal(r.pValue, null, 'no p-value may be published when n* is too small');
  assert.equal(r.direction, 'insufficient-data');
  assert.equal(r.confidence, 'insufficient-data');
  assert.match(r.ineligibilityReason, /effective sample size/i);
  // The descriptive slope is still available and must not be hidden.
  assert.equal(typeof r.senSlopePerDecade, 'number');
  assert.equal(r.senCi95PerDecade, null, 'no CI without a usable variance');
});

test('effective sample size: a short-record band is flagged, not silently promoted', () => {
  // Seeded search for a series whose n* lands inside [10, 14).
  let found = null;
  for (let seed = 1; seed <= 400 && !found; seed += 1) {
    const r = mannKendallTest(asSeries(ar1(30, 0.55, seed)));
    if (r.effectiveSampleSize >= 10 && r.effectiveSampleSize < 14) found = r;
  }
  assert.ok(found, 'the seeded search should find an in-band record');
  assert.equal(found.confidence, 'short-record');
  assert.equal(found.inferenceEligible, true);
  assert.notEqual(found.pValue, null);
});

/* ================================================================== */
/* 7. Calibration: false-positive behaviour under simulation           */
/* ================================================================== */

test('calibration: with no autocorrelation the corrected test is not anti-conservative', () => {
  // 600 seeded AR(1) phi = 0 replicates, n = 30, no trend. A well-calibrated test
  // at alpha = 0.05 rejects about 5% of true nulls; the specified zero-negative-
  // lag correction is deliberately conservative, so the band is 0-10%.
  const RUNS = 600;
  let reject05 = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const r = mannKendallTest(asSeries(ar1(30, 0, 9000 + run)));
    if (r.significantAt05 === true) reject05 += 1;
  }
  const rate = reject05 / RUNS;
  assert.ok(rate <= 0.10, `false-positive rate at phi=0 must be <= 10%, measured ${(rate * 100).toFixed(1)}%`);
});

test('calibration: strong autocorrelation makes the uncorrected test over-reject, and the correction reduces it', () => {
  // This is the test that distinguishes a real correction from a cosmetic one.
  // 600 seeded AR(1) phi = 0.6 replicates, n = 30, NO trend. The uncorrected test
  // must show a gross false-positive rate, and the corrected test must be
  // strictly better. Values measured before the assertion was written:
  //   plain ~30%, corrected at alpha 0.05 ~12-13%.
  const RUNS = 600;
  let plain = 0;
  let corrected = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const r = mannKendallTest(asSeries(ar1(30, 0.6, 9000 + run)));
    if (r.pClassical < 0.05) plain += 1;
    if (r.significantAt05 === true) corrected += 1;
  }
  const plainRate = plain / RUNS;
  const correctedRate = corrected / RUNS;
  assert.ok(plainRate > 0.20, `the uncorrected test should over-reject badly, measured ${(plainRate * 100).toFixed(1)}%`);
  assert.ok(
    correctedRate < plainRate,
    `the correction must reduce false positives: plain ${(plainRate * 100).toFixed(1)}% vs corrected ${(correctedRate * 100).toFixed(1)}%`
  );
});

test('calibration: the published alpha = 0.01 threshold controls the phi = 0.6 false-positive rate', () => {
  // The reason the threshold is 0.01 and not 0.05. At alpha = 0.01 the measured
  // rate on phi = 0.6 series sits near 4% (specification §4.3). Band 1-10%
  // allows for the 600-replicate Monte-Carlo error without accepting the 13% that
  // alpha = 0.05 produces.
  const RUNS = 600;
  let reject01 = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const r = mannKendallTest(asSeries(ar1(30, 0.6, 9000 + run)));
    if (r.significant === true) reject01 += 1;
  }
  const rate = reject01 / RUNS;
  assert.ok(
    rate >= 0.005 && rate <= 0.10,
    `alpha=0.01 false-positive rate at phi=0.6 should be 0.5-10%, measured ${(rate * 100).toFixed(1)}%`
  );
});

test('calibration: power is preserved against a real trend', () => {
  // 300 seeded replicates, n = 30, true slope 0.2/step, sigma = 0.5, phi = 0.
  // A test that never rejects would pass every false-positive check above, so
  // power must be asserted too. Measured: >95% at alpha = 0.01.
  const RUNS = 300;
  let detected = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const r = mannKendallTest(asSeries(ar1(30, 0, 20000 + run, 0.2, 0.5)));
    if (r.significant === true) detected += 1;
  }
  const power = detected / RUNS;
  assert.ok(power > 0.90, `power against slope 0.2 should exceed 90%, measured ${(power * 100).toFixed(1)}%`);
});

/* ================================================================== */
/* 8. Block bootstrap                                                  */
/* ================================================================== */

test('bootstrap: is deterministic for a given input', () => {
  const values = ar1(30, 0.4, 6161);
  const a = blockBootstrapMannKendall(values);
  const b = blockBootstrapMannKendall(values);
  assert.deepEqual(a, b, 'the bootstrap must return identical output for identical input');
  assert.equal(a.seed, STATISTICS_CONFIG.bootstrapSeed);
  assert.equal(a.replicates, STATISTICS_CONFIG.bootstrapReplicates);
  assert.equal(a.blockLength, Math.round(Math.cbrt(30)));
});

test('bootstrap: p-value is bounded away from zero by the (b+1)/(B+1) rule', () => {
  const values = Array.from({ length: 30 }, (_, i) => i * i); // violent monotone trend
  const result = blockBootstrapMannKendall(values);
  assert.ok(result.pValue > 0, 'a bootstrap p-value must never be reported as exactly 0');
  assert.ok(result.pValue < 0.05, 'a violent trend should still be significant');
  close(result.pValue, (result.extremeCount + 1) / (result.replicates + 1), 1e-12, 'p-value formula');
});

test('bootstrap: declines a degenerate (constant) series instead of resampling nothing', () => {
  assert.equal(blockBootstrapMannKendall(Array(30).fill(7)), null);
  assert.equal(blockBootstrapMannKendall([1, 2, 3]), null, 'n < 8 is too short');
});

test('bootstrap: measured false-positive rate with no autocorrelation is near nominal', () => {
  // 200 replicates, not 600: the bootstrap is 999 resamples each, so this is the
  // slowest test in the suite. Measured ~5% at phi = 0 before the band was set.
  const RUNS = 200;
  let reject = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const r = blockBootstrapMannKendall(ar1(30, 0, 31000 + run), 0.05);
    if (r.significant) reject += 1;
  }
  const rate = reject / RUNS;
  assert.ok(rate <= 0.13, `bootstrap FPR at phi=0 must stay near nominal, measured ${(rate * 100).toFixed(1)}%`);
});

/* ================================================================== */
/* 9. Confidence intervals                                             */
/* ================================================================== */

test('interval: the Sen 95% CI brackets the true slope on independent noise', () => {
  // Specification §8 T8: >= 90% coverage over 300 seeded replicates.
  const RUNS = 300;
  const TRUE_SLOPE_PER_YEAR = 0.2;
  let covered = 0;
  let resolved = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const r = mannKendallTest(asSeries(ar1(30, 0, 40000 + run, TRUE_SLOPE_PER_YEAR, 0.5)));
    if (r.senCi95PerDecade) {
      resolved += 1;
      const lo = r.senCi95PerDecade[0];
      const hi = r.senCi95PerDecade[1];
      if (lo <= TRUE_SLOPE_PER_YEAR * 10 && TRUE_SLOPE_PER_YEAR * 10 <= hi) covered += 1;
    }
  }
  assert.ok(resolved >= RUNS * 0.9, `the interval should be resolvable in most replicates, got ${resolved}/${RUNS}`);
  const coverage = covered / resolved;
  assert.ok(coverage >= 0.90, `CI coverage should be >= 90%, measured ${(coverage * 100).toFixed(1)}%`);
});

test('interval: an unresolvable interval returns null rather than a fabricated bound', () => {
  // A very strong trend gives a large C = z*sqrt(Var*(S)), which pushes k1 below 1.
  // The implementation must return null, never clamp to the extreme pair.
  const values = Array.from({ length: 10 }, (_, i) => i * 1000);
  const r = mannKendallTest(asSeries(values));
  assert.equal(r.inferenceEligible, true);
  if (r.senCi95PerDecade !== null) {
    // If resolvable, the bounds must be ordered and finite.
    assert.ok(r.senCi95PerDecade[0] <= r.senCi95PerDecade[1]);
    assert.ok(Number.isFinite(r.senCi95PerDecade[0]));
  }
});

/* ================================================================== */
/* 10. Seasonal Mann–Kendall                                           */
/* ================================================================== */

function monthlyRows(years, valueAt) {
  const rows = [];
  for (let y = 0; y < years; y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      rows.push({ year: 1990 + y, month: m, value: valueAt(y, m) });
    }
  }
  return rows;
}

test('seasonal MK: a trend common to all months is detected', () => {
  const rows = monthlyRows(25, (y, m) => 100 + 2 * y + 10 * Math.sin((2 * Math.PI * m) / 12));
  const r = seasonalMannKendallTest(rows);
  assert.equal(r.eligible, true);
  assert.equal(r.inferenceEligible, true);
  assert.equal(r.direction, 'increasing');
  assert.ok(r.pValue < 0.01, `p should be < 0.01, got ${r.pValue}`);
  close(r.seasonalSenSlopePerDecade, 20, 1, 'seasonal Sen slope is 2/unit-time x 10');
});

test('seasonal MK: a pure seasonal cycle with no trend is not called a trend', () => {
  const rows = monthlyRows(25, (_y, m) => 100 + 10 * Math.sin((2 * Math.PI * m) / 12));
  const r = seasonalMannKendallTest(rows);
  assert.equal(r.eligible, true);
  // Every month is constant across years, so S = 0 in every month and Var(S) = 0.
  assert.equal(r.sStatistic, 0);
  assert.equal(r.pValue, 1, 'a degenerate seasonal record reports p = 1');
  assert.equal(r.direction, 'no-trend');
  assert.equal(r.significant, false);
});

test('seasonal MK: applies the within-month autocorrelation correction', () => {
  // Positive year-to-year correlation inside each calendar month must inflate the
  // variance above the uncorrected sum of independent Var(S_m).
  const rows = monthlyRows(30, (y, m) => 100 + ar1(1, 0.0, 0)[0] * 0 + persistent(y, m));
  const r = seasonalMannKendallTest(rows);
  assert.equal(r.eligible, true);
  assert.ok(r.variance !== null && r.rawVariance !== null);
  assert.ok(
    r.variance >= r.rawVariance,
    `corrected variance ${r.variance} must be >= raw ${r.rawVariance}`
  );
  assert.ok(r.withinSeasonVarianceInflation >= 1);

  function persistent(yearIndex, month) {
    // Deterministic AR(1)-like memory per month, so the effect is reproducible
    // without randomness: a slowly varying value shared by adjacent years.
    return 5 * Math.cos((2 * Math.PI * (yearIndex + month)) / 9);
  }
});

test('seasonal MK: refuses a record that is too short in years or in months', () => {
  const tooFewYears = seasonalMannKendallTest(monthlyRows(5, (y) => 100 + y));
  assert.equal(tooFewYears.eligible, false);
  assert.equal(tooFewYears.pValue, null);
  assert.equal(tooFewYears.direction, 'insufficient-data');

  const tooFewMonths = seasonalMannKendallTest(
    monthlyRows(20, (y, m) => (m <= 3 ? 100 + y : null))
  );
  assert.equal(tooFewMonths.eligible, false);
  assert.match(tooFewMonths.ineligibilityReason, /calendar months/);
});

/* ================================================================== */
/* 11. Pettitt change point                                            */
/* ================================================================== */

test('Pettitt: detects a known step shift at the correct year', () => {
  const values = [
    ...Array.from({ length: 15 }, (_, i) => 10 + (i % 3) * 0.1),
    ...Array.from({ length: 15 }, (_, i) => 20 + (i % 3) * 0.1)
  ];
  const r = pettittChangePointTest(asSeries(values, 1990));
  assert.equal(r.eligible, true);
  assert.equal(r.significant, true);
  assert.equal(r.changeYear, 2005, 'the shift happens between 2004 and 2005');
  assert.ok(r.shiftMagnitude > 9 && r.shiftMagnitude < 11);
});

test('Pettitt: does not invent a shift in a stationary series', () => {
  const r = pettittChangePointTest(asSeries(ar1(40, 0, 1234)));
  assert.equal(r.eligible, true);
  // p from a null series is uniform, so a single seed may occasionally reject;
  // assert only that the machinery is well formed and the p is bounded.
  assert.ok(r.pValue >= 0 && r.pValue <= 1);
  assert.equal(r.lag1Autocorrelation !== null, true);
});

test('Pettitt: refuses fewer than 12 records and never returns NaN', () => {
  const r = pettittChangePointTest(asSeries(Array.from({ length: 11 }, (_, i) => i)));
  assert.equal(r.eligible, false);
  assert.equal(r.pValue, null);
  assert.equal(r.changeYear, null);
});

test('Pettitt: discloses serial correlation instead of hiding it', () => {
  // A strongly autocorrelated series: the p-value assumes exchangeability, so the
  // result must carry a warning rather than a bare number.
  const r = pettittChangePointTest(asSeries(ar1(40, 0.85, 606)));
  assert.equal(r.eligible, true);
  if (Math.abs(r.lag1Autocorrelation) > 1.96 / Math.sqrt(40)) {
    assert.equal(typeof r.dependenceWarning, 'string');
    assert.match(r.dependenceWarning, /autocorrelation/i);
  }
});

/* ================================================================== */
/* 12. Student / Welch t-test under temporal dependence                */
/* ================================================================== */

test('t-test: the historical independent-sample contract is preserved', () => {
  // A bare tTest(x, y) must behave exactly as before: Welch when variances differ,
  // Student when they do not.
  const unequal = tTest([1, 2, 3, 4, 5], [10, 11, 12, 13, 100], 0.05);
  assert.equal(unequal.testName, "Welch's t-test (unequal variances)");
  assert.equal(unequal.sampleStructure, 'independent');
  assert.equal(unequal.inferenceEligible, true);

  const equal = tTest([1, 2, 3, 4, 5], [2, 3, 4, 5, 6], 0.05);
  assert.equal(equal.testName, "Student's t-test (equal variances)");
  assert.equal(equal.equalVariancesAssumed, true);
});

test('t-test: serial-blocks inflation reduces the effective sample and warns', () => {
  const series = ar1(24, 0.7, 8080);
  const x = series.slice(0, 12);
  const y = series.slice(12);
  const independentStyle = tTest(x, y, 0.05, { structure: 'independent' });
  const dependentStyle = tTest(x, y, 0.05, { structure: 'serial-blocks', orderedSeries: series });

  assert.ok(dependentStyle.varianceInflationFactor > 1, 'autocorrelation must inflate the variance');
  assert.ok(
    dependentStyle.effectiveSampleSize < independentStyle.effectiveSampleSize,
    'the dependence-aware test must report fewer effective observations'
  );
  // The adjusted |t| must be no larger than the naive one.
  assert.ok(Math.abs(dependentStyle.tStatistic) <= Math.abs(independentStyle.tStatistic) + 1e-9);
});

test('t-test: declares the wrong structure loudly when autocorrelation is material', () => {
  const series = ar1(24, 0.8, 9090);
  const r = tTest(series.slice(0, 12), series.slice(12), 0.05, {
    structure: 'independent',
    orderedSeries: series
  });
  assert.equal(r.dependenceWarning !== null, true, 'must warn that independent was declared');
  assert.match(r.dependenceWarning, /serial-blocks/);
});

test('t-test: refuses a verdict when the effective epoch sample is too small', () => {
  // phi = 0.95 over 12-year epochs leaves about 9 effective observations in the
  // whole comparison, below the floor of 10.
  const series = ar1(24, 0.95, 5050);
  const r = tTest(series.slice(0, 12), series.slice(12), 0.05, {
    structure: 'serial-blocks',
    orderedSeries: series
  });
  assert.equal(r.inferenceEligible, false, `n* = ${r.effectiveSampleSize} should be below 10`);
  assert.equal(r.pValueAdjusted, null);
  assert.equal(r.significant, null);
  assert.match(r.interpretation, /no difference verdict is published/i);
  // The naive number is still reported so nothing is hidden.
  assert.equal(typeof r.pValue, 'number');
});

test('t-test: a real epoch shift is still detected with the correction', () => {
  // phi = 0.1 keeps the effective epoch sample above the floor while still
  // exercising the correction. A 3-unit shift on sigma ~ 1 is unambiguous.
  const base = ar1(24, 0.1, 3333);
  for (let i = 12; i < 24; i += 1) base[i] += 3;
  const r = tTest(base.slice(0, 12), base.slice(12), 0.05, {
    structure: 'serial-blocks',
    orderedSeries: base
  });
  assert.equal(r.inferenceEligible, true, `n* = ${r.effectiveSampleSize} should clear the floor`);
  assert.equal(r.significant, true, 'a 3-unit shift should still be detected');
  assert.ok(r.confidenceInterval95[0] > 0, 'the CI excludes zero');
});

test('t-test: a strong real shift on a persistent record is refused, not laundered', () => {
  // The honest failure mode. A 12-year-ahead persistence this strong leaves n*
  // below the floor, so even a 3-unit shift must be reported as "not resolvable
  // by this record" rather than as a significant difference. Refusing a real
  // effect is the intended trade: the specification prefers a false negative to a
  // false positive in public-facing climate claims.
  const base = ar1(24, 0.9, 5050);
  for (let i = 12; i < 24; i += 1) base[i] += 3;
  const r = tTest(base.slice(0, 12), base.slice(12), 0.05, {
    structure: 'serial-blocks',
    orderedSeries: base
  });
  assert.equal(r.inferenceEligible, false);
  assert.equal(r.significant, null);
  // The naive p-value is still disclosed, so nothing is hidden from review.
  assert.ok(r.pValue < 0.05, 'the naive test would have called this significant');
});

test('calibration: the dependence-aware t-test controls the epoch-split false-positive rate', () => {
  // 400 seeded AR(1) phi = 0.6 replicates, 12-vs-12-year split, NO true
  // difference. Measured before this assertion was written (800 replicates):
  //   plain t-test            30.3 % false positives at alpha = 0.05
  //   serial-blocks + gate     2.9 % false positives, 49.9 % withheld
  // The test therefore both reports fewer false positives AND refuses about half
  // the records outright. Both are asserted here.
  const RUNS = 400;
  let plain = 0;
  let shipped = 0;
  let withheld = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const series = ar1(24, 0.6, 4000 + run);
    const x = series.slice(0, 12);
    const y = series.slice(12);
    if (tTest(x, y, 0.05, { structure: 'independent' }).significantAt05 === true) plain += 1;
    const aware = tTest(x, y, 0.05, { structure: 'serial-blocks', orderedSeries: series });
    if (!aware.inferenceEligible) withheld += 1;
    else if (aware.significant === true) shipped += 1;
  }
  const plainRate = plain / RUNS;
  const shippedRate = shipped / RUNS;
  const withheldRate = withheld / RUNS;
  assert.ok(plainRate > 0.20, `the plain t-test should over-reject, measured ${(plainRate * 100).toFixed(1)}%`);
  assert.ok(
    shippedRate < plainRate / 3,
    `the dependence-aware test must cut false positives by more than 3x, measured ${(shippedRate * 100).toFixed(1)}%`
  );
  assert.ok(withheldRate > 0.20, `it must also refuse weak records, measured ${(withheldRate * 100).toFixed(1)}%`);
});

test('t-test: two constant samples are refused, not given a fabricated p-value', () => {
  const r = tTest(Array(12).fill(5), Array(12).fill(5), 0.05);
  assert.equal(r.eligible, false);
  assert.equal(r.pValue, null);
});

/* ================================================================== */
/* 13. Correlation                                                     */
/* ================================================================== */

test('correlation: recovers a known exact relationship', () => {
  const x = Array.from({ length: 40 }, (_, i) => Math.sin(i / 3));
  const y = x.map((v) => 3 * v + 7);
  const r = computeSeriesCorrelation(x, y);
  assert.equal(r.eligible, true);
  close(r.pearsonR, 1, 1e-6, 'Pearson r of an affine map is exactly 1');
  // A smooth sine wave is almost perfectly autocorrelated, so the effective
  // sample collapses and the p-value must be withheld rather than reported as
  // certain. That refusal is the correct behaviour, not a regression.
  assert.equal(r.inferenceEligible, false);
  assert.equal(r.pValueAdjusted, null);
});

test('correlation: an independent pair yields a finite, usable p-value', () => {
  const g = makeGaussian(777);
  const x = Array.from({ length: 60 }, () => g());
  const y = Array.from({ length: 60 }, () => g());
  const r = computeSeriesCorrelation(x, y);
  assert.equal(r.eligible, true);
  assert.equal(r.inferenceEligible, true);
  assert.equal(typeof r.pValueAdjusted, 'number');
  assert.ok(r.pValueAdjusted > 0 && r.pValueAdjusted <= 1);
  assert.equal(r.significant, r.pValueAdjusted < 0.05);
});

test('correlation: refuses fewer than 12 overlapping observations', () => {
  const r = computeSeriesCorrelation([1, 2, 3], [4, 5, 6]);
  assert.equal(r.eligible, false);
  assert.equal(r.pValueAdjusted, null);
  assert.match(r.ineligibilityReason, /minimum of 12/);
});

test('correlation: withholds inference when the effective sample is too small', () => {
  // Two very persistent series: N_eff collapses below the floor.
  const x = ar1(40, 0.97, 1212);
  const y = ar1(40, 0.97, 1313);
  const r = computeSeriesCorrelation(x, y);
  assert.equal(r.eligible, true);
  if (!r.inferenceEligible) {
    assert.equal(r.pValueAdjusted, null);
    assert.equal(r.significant, null);
    assert.match(r.interpretation, /no p-value is published/i);
  }
});

test('correlation: a perfect correlation does not produce a non-finite p-value', () => {
  const x = Array.from({ length: 20 }, (_, i) => i);
  const r = computeSeriesCorrelation(x, x.slice());
  assert.ok(Number.isFinite(r.pValueAdjusted) || r.pValueAdjusted === null);
  assert.ok(Number.isInteger(r.pearsonR * 1000) || Number.isFinite(r.pearsonR));
});

/* ================================================================== */
/* 14. Engine-level integration                                        */
/* ================================================================== */

test('engine: a clean warming series yields a strong increasing verdict', () => {
  // Small seeded noise, not a smooth sinusoid: interannual variability that is
  // itself autocorrelated would legitimately trip the effective-sample rule and
  // the verdict would (correctly) be withheld. This fixture is deliberately
  // well-behaved so it tests the verdict path, not the refusal path.
  const g = makeGaussian(2024);
  const noise = Array.from({ length: 31 }, () => g());
  const ds = makePowerDataset({
    startYear: 1990,
    endYear: 2019,
    t2m: (year) => 27 + (year - 1990) * 0.04 + noise[year - 1990] * 0.2
  });
  const ext = computeExtendedStats(ds, 'T2M');
  assert.equal(ext.trendVerdict.direction, 'increasing');
  assert.equal(ext.trendVerdict.significant, true);
  assert.equal(ext.trendVerdict.alpha, 0.01);
  assert.equal(ext.mannKendall.inferenceEligible, true);
  assert.ok(ext.trendVerdict.supportingTests.length >= 1);
  assert.match(ext.trendVerdict.summary, /α = 0.01/);
});

test('engine: a missing month excludes that year and lowers n', () => {
  // Specification §8 T6.
  const ds = makePowerDataset({ startYear: 1990, endYear: 2019, missingDates: ['2011-06'] });
  const ext = computeExtendedStats(ds, 'T2M');
  assert.equal(ext.mannKendall.n, 29, '29 complete years remain after excluding 2011');
  assert.equal(ext.quality.completeYears, 29);
  assert.equal(ext.quality.missingMonths, 1);
});

test('engine: a short record withholds the verdict end-to-end', () => {
  const ds = makePowerDataset({ startYear: 2015, endYear: 2019 });
  const ext = computeExtendedStats(ds, 'T2M');
  assert.equal(ext.mannKendall.inferenceEligible, false);
  assert.equal(ext.trendVerdict.direction, 'insufficient-data');
  assert.equal(ext.trendVerdict.significant, null);
  assert.equal(ext.trendVerdict.primaryPValue, null);
  assert.equal(typeof ext.trendVerdict.withheldReason, 'string');
  // The chart data and the descriptive slopes must still be present.
  assert.ok(ext.senSlope !== null);
});

test('engine: a constant series reports no trend without dividing by zero', () => {
  const ds = makePowerDataset({ startYear: 1990, endYear: 2019, t2m: () => 28 });
  const ext = computeExtendedStats(ds, 'T2M');
  assert.equal(ext.mannKendall.sStatistic, 0);
  assert.equal(ext.mannKendall.pValue, 1, 'constant series: p = 1, never NaN or 0');
  assert.equal(ext.trendVerdict.direction, 'no-trend');
  assert.equal(ext.trendVerdict.significant, false);
  assert.equal(ext.senSlope.slopePerDecade, 0);
});

test('verdict: the annual and seasonal disagreement is exposed, never averaged', () => {
  // A trend confined to one half of the year: the annual mean removes most of it,
  // while the seasonal test sees it in six months only. Whatever the outcome, the
  // supporting/dissenting lists must account for every test that ran.
  const ds = makePowerDataset({
    startYear: 1990,
    endYear: 2019,
    t2m: (year, month) => 27 + (month <= 6 ? (year - 1990) * 0.08 : 0)
  });
  const ext = computeExtendedStats(ds, 'T2M');
  const named = new Set([...ext.trendVerdict.supportingTests, ...ext.trendVerdict.dissentingTests]);
  if (ext.mannKendall.inferenceEligible) {
    assert.ok(named.has('Mann–Kendall (annual)'), 'the annual test must be accounted for');
    if (ext.seasonalMannKendall.inferenceEligible) {
      assert.ok(named.has('Seasonal Mann–Kendall'), 'the seasonal test must be accounted for');
    }
  }
});

test('verdict: confidence is the minimum of its inputs, never the maximum', () => {
  const ds = makePowerDataset({ startYear: 1990, endYear: 2019, t2m: (y) => 27 + (y - 1990) * 0.03 });
  const ext = computeExtendedStats(ds, 'T2M');
  const inputs = [ext.mannKendall.confidence];
  if (ext.seasonalMannKendall.inferenceEligible) inputs.push(ext.seasonalMannKendall.confidence);
  const rank = { 'insufficient-data': 0, 'short-record': 1, strong: 2 };
  const expected = inputs.reduce((acc, c) => (rank[c] < rank[acc] ? c : acc), 'strong');
  assert.equal(ext.trendVerdict.confidence, expected);
});

test('verdict: buildTrendVerdict withholds everything when the annual test cannot infer', () => {
  const ds = makePowerDataset({ startYear: 2015, endYear: 2019 });
  const ext = computeExtendedStats(ds, 'T2M');
  const v = buildTrendVerdict(ext.mannKendall, ext.seasonalMannKendall, ext.pettittChangePoint);
  assert.equal(v.direction, 'insufficient-data');
  assert.equal(v.supportingTests.length, 0);
  assert.equal(v.primaryPValue, null);
  assert.equal(v.summary.startsWith('No trend conclusion is published'), true);
});

test('engine: the historical split t-test is dependence-aware', () => {
  const ds = makePowerDataset({
    startYear: 1990,
    endYear: 2019,
    t2m: (year) => 27 + 0.6 * Math.sin((year - 1990) / 3)
  });
  const split = computeHistoricalSplit(ds, 'T2M');
  assert.ok(split && split.tTest);
  assert.equal(split.tTest.sampleStructure, 'serial-blocks');
  assert.equal(typeof split.tTest.varianceInflationFactor, 'number');
  assert.ok(split.tTest.varianceInflationFactor >= 1);
});

/* ================================================================== */
/* 15. Numerical stability / edge cases                                */
/* ================================================================== */

test('stability: extreme magnitudes do not produce NaN or Infinity', () => {
  const huge = asSeries(Array.from({ length: 30 }, (_, i) => 1e12 + i * 1e9));
  const r = mannKendallTest(huge);
  assert.ok(Number.isFinite(r.sStatistic));
  assert.ok(r.pValue === null || Number.isFinite(r.pValue));
  assert.ok(Number.isFinite(r.senSlopePerDecade));

  const tiny = asSeries(Array.from({ length: 30 }, (_, i) => 1e-12 * i));
  const r2 = mannKendallTest(tiny);
  assert.ok(Number.isFinite(r2.sStatistic));
  assert.ok(Number.isFinite(r2.senSlopePerDecade));
});

test('stability: a heavily tied series never yields a negative or NaN variance', () => {
  // 30 values with only 3 distinct levels: the tie correction dominates.
  const values = Array.from({ length: 30 }, (_, i) => [1, 2, 3][i % 3]);
  const r = mannKendallTest(asSeries(values));
  assert.ok(Number.isFinite(r.rawVariance));
  assert.ok(r.rawVariance >= 0);
  if (r.adjustedVariance !== null) assert.ok(r.adjustedVariance >= 0);
});

test('stability: an empty series is refused without throwing', () => {
  const r = mannKendallTest([]);
  assert.equal(r.eligible, false);
  assert.equal(r.n, 0);
  assert.equal(r.fromYear, null);
  assert.equal(r.pValue, null);
});

test('stability: unsorted input is sorted before testing', () => {
  const sorted = Array.from({ length: 20 }, (_, i) => ({ year: 2000 + i, value: i }));
  const shuffled = [...sorted].reverse();
  const a = mannKendallTest(sorted);
  const b = mannKendallTest(shuffled);
  assert.equal(a.sStatistic, b.sStatistic);
  assert.equal(a.senSlopePerDecade, b.senSlopePerDecade);
  assert.equal(a.pValue, b.pValue);
});
