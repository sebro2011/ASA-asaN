/**
 * NOVA HYPOTHESIS FORGE — deterministic numerical analysis.
 *
 * This module contains *only* arithmetic. There is no model call, no random
 * number, no default and no fallback value: an undefined result is `null`, and
 * every caller must render `null` as "not computed".
 *
 * Tests (scripts/test-forge-engine.mjs) check these functions against known
 * reference values:
 *   - Pearson r for a textbook five-point data set (0.7745966692…);
 *   - Student-t two-tailed p at t = 2.048, df = 28 → 0.05;
 *   - cross-correlation recovering a known two-sample shift exactly;
 *   - a 2×2 table whose odds ratio and chi-square can be verified by hand.
 *
 * Nothing here interprets a result. Interpretation lives in evidence.ts and is
 * rule-based and auditable.
 */

import type { Observation } from './types';

/* ------------------------------------------------------------------ basics */

export function finiteValues(values: Array<number | null | undefined>): number[] {
  return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/** Sample standard deviation (n − 1). Returns null for n < 2. */
export function sampleStdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const average = mean(values);
  if (average === null) return null;
  let sumSquares = 0;
  for (const value of values) sumSquares += (value - average) ** 2;
  return Math.sqrt(sumSquares / (values.length - 1));
}

/** Linear-interpolated quantile (same convention as NumPy's default). */
export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  if (q <= 0) return Math.min(...values);
  if (q >= 1) return Math.max(...values);
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function median(values: number[]): number | null {
  return quantile(values, 0.5);
}

export interface DescriptiveStats {
  n: number;
  mean: number | null;
  median: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
  q1: number | null;
  q3: number | null;
}

export function describe(values: number[]): DescriptiveStats {
  const clean = finiteValues(values);
  if (clean.length === 0) {
    return { n: 0, mean: null, median: null, sd: null, min: null, max: null, q1: null, q3: null };
  }
  return {
    n: clean.length,
    mean: mean(clean),
    median: median(clean),
    sd: sampleStdDev(clean),
    min: Math.min(...clean),
    max: Math.max(...clean),
    q1: quantile(clean, 0.25),
    q3: quantile(clean, 0.75),
  };
}

/* ----------------------------------------------------- distributions (exact) */

/** Lanczos log-gamma, g = 7, n = 9. Accurate to ~1e-13 for real z > 0. */
export function logGamma(z: number): number {
  if (z < 0.5) {
    // Reflection: Γ(z)Γ(1−z) = π / sin(πz)
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - logGamma(1 - z);
  }
  const coefficients = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  const zz = z - 1;
  let x = coefficients[0];
  for (let i = 1; i < 9; i += 1) x += coefficients[i] / (zz + i);
  const t = zz + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const MAX_ITERATIONS = 300;
  const EPSILON = 3e-14;
  const TINY = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITERATIONS; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPSILON) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b). */
export function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return Number.NaN;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front =
    Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(a, b, x)) / a;
  }
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/**
 * Two-tailed p-value for Student's t.
 *   P(|T| > t) = I_{df/(df+t²)}(df/2, 1/2)
 * Verified against t = 2.048, df = 28 → 0.05 (see tests).
 */
export function studentTTwoTailedP(t: number, df: number): number | null {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return null;
  if (t === 0) return 1;
  const x = df / (df + t * t);
  const p = regularizedIncompleteBeta(df / 2, 0.5, x);
  if (!Number.isFinite(p)) return null;
  return Math.min(1, Math.max(0, p));
}

/* -------------------------------------------------------------- correlation */

export interface CorrelationResult {
  r: number | null;
  n: number;
  t: number | null;
  df: number | null;
  p: number | null;
}

/** Pearson product-moment correlation with the two-sided t-test on r. */
export function correlationTest(x: number[], y: number[]): CorrelationResult {
  const pairs: Array<[number, number]> = [];
  const length = Math.min(x.length, y.length);
  for (let i = 0; i < length; i += 1) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) pairs.push([x[i], y[i]]);
  }
  const n = pairs.length;
  if (n < 3) return { r: null, n, t: null, df: null, p: null };
  const meanX = mean(pairs.map((pair) => pair[0])) as number;
  const meanY = mean(pairs.map((pair) => pair[1])) as number;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [xi, yi] of pairs) {
    sxy += (xi - meanX) * (yi - meanY);
    sxx += (xi - meanX) ** 2;
    syy += (yi - meanY) ** 2;
  }
  if (sxx === 0 || syy === 0) return { r: null, n, t: null, df: null, p: null };
  const r = sxy / Math.sqrt(sxx * syy);
  const clamped = Math.min(1, Math.max(-1, r));
  const df = n - 2;
  // A perfect ±1 correlation has an infinite t statistic and p = 0 exactly.
  if (Math.abs(clamped) >= 1) return { r: clamped, n, t: Number.POSITIVE_INFINITY, df, p: 0 };
  const t = clamped * Math.sqrt(df / (1 - clamped * clamped));
  return { r: clamped, n, t, df, p: studentTTwoTailedP(t, df) };
}

function rank(values: number[]): number[] {
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j += 1;
    // Average rank for ties (1-based).
    const average = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[order[k].index] = average;
    i = j + 1;
  }
  return ranks;
}

/** Spearman rank correlation, with the same t approximation as Pearson. */
export function spearman(x: number[], y: number[]): CorrelationResult {
  const pairs: Array<[number, number]> = [];
  const length = Math.min(x.length, y.length);
  for (let i = 0; i < length; i += 1) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) pairs.push([x[i], y[i]]);
  }
  if (pairs.length < 3) return { r: null, n: pairs.length, t: null, df: null, p: null };
  return correlationTest(
    rank(pairs.map((pair) => pair[0])),
    rank(pairs.map((pair) => pair[1])),
  );
}

export interface RegressionResult {
  slope: number | null;
  intercept: number | null;
  r2: number | null;
  n: number;
  slopeStandardError: number | null;
}

/** Ordinary least squares y = a + bx. */
export function linearRegression(x: number[], y: number[]): RegressionResult {
  const pairs: Array<[number, number]> = [];
  const length = Math.min(x.length, y.length);
  for (let i = 0; i < length; i += 1) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) pairs.push([x[i], y[i]]);
  }
  const n = pairs.length;
  if (n < 3) return { slope: null, intercept: null, r2: null, n, slopeStandardError: null };
  const meanX = mean(pairs.map((pair) => pair[0])) as number;
  const meanY = mean(pairs.map((pair) => pair[1])) as number;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [xi, yi] of pairs) {
    sxy += (xi - meanX) * (yi - meanY);
    sxx += (xi - meanX) ** 2;
    syy += (yi - meanY) ** 2;
  }
  if (sxx === 0) return { slope: null, intercept: null, r2: null, n, slopeStandardError: null };
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const r2 = syy === 0 ? null : (sxy * sxy) / (sxx * syy);
  let residualSum = 0;
  for (const [xi, yi] of pairs) {
    const fitted = intercept + slope * xi;
    residualSum += (yi - fitted) ** 2;
  }
  const df = n - 2;
  const slopeStandardError =
    df > 0 ? Math.sqrt(residualSum / df / sxx) : null;
  return { slope, intercept, r2, n, slopeStandardError };
}

/* --------------------------------------------------- lagged cross-correlation */

export interface CrossCorrelationCurveEntry {
  /** Lag in samples: positive means the driver leads the response. */
  lagSteps: number;
  r: number | null;
  n: number;
}

export interface CrossCorrelationResult {
  bestLagSteps: number | null;
  bestR: number | null;
  bestN: number;
  curve: CrossCorrelationCurveEntry[];
}

/**
 * Lagged cross-correlation on a *paired* array.
 *
 * `driver[i]` and `response[i]` must already refer to the same UTC instants.
 * A positive lag means the driver value at index i is compared with the
 * response at index i + lag — i.e. the driver leads. No interpolation is
 * performed; the lag step equals the paired sampling interval, which the caller
 * reports as a limitation.
 */
export function crossCorrelation(
  driver: number[],
  response: number[],
  maxLagSteps: number,
): CrossCorrelationResult {
  const limit = Math.max(0, Math.floor(maxLagSteps));
  const curve: CrossCorrelationCurveEntry[] = [];
  for (let lag = -limit; lag <= limit; lag += 1) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < driver.length; i += 1) {
      const j = i + lag;
      if (j < 0 || j >= response.length) continue;
      if (Number.isFinite(driver[i]) && Number.isFinite(response[j])) {
        xs.push(driver[i]);
        ys.push(response[j]);
      }
    }
    const test = correlationTest(xs, ys);
    curve.push({ lagSteps: lag, r: test.r, n: test.n });
  }
  let best: CrossCorrelationCurveEntry | null = null;
  for (const entry of curve) {
    if (entry.r === null) continue;
    if (!best || Math.abs(entry.r) > Math.abs(best.r as number)) best = entry;
  }
  return {
    bestLagSteps: best ? best.lagSteps : null,
    bestR: best ? best.r : null,
    bestN: best ? best.n : 0,
    curve,
  };
}

/* ------------------------------------------------ grouping / anomalies / gaps */

export interface AnomalyResult {
  count: number;
  threshold: number | null;
  indices: number[];
  mean: number | null;
  sd: number | null;
}

/** z-score anomaly flagging with the sample standard deviation. */
export function detectAnomalies(values: number[], z: number = 3): AnomalyResult {
  const clean = finiteValues(values);
  const average = mean(clean);
  const sd = sampleStdDev(clean);
  if (average === null || sd === null || sd === 0) {
    return { count: 0, threshold: null, indices: [], mean: average, sd };
  }
  const indices: number[] = [];
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    if (Math.abs((value - average) / sd) >= z) indices.push(index);
  });
  return { count: indices.length, threshold: z, indices, mean: average, sd };
}

export interface GroupComparison {
  beforeMean: number | null;
  afterMean: number | null;
  changePercent: number | null;
  beforeN: number;
  afterN: number;
  welchT: number | null;
  welchDf: number | null;
  p: number | null;
}

/** Welch's unequal-variance t-test between two independent numeric groups. */
export function compareGroups(baseline: number[], event: number[]): GroupComparison {
  const a = finiteValues(baseline);
  const b = finiteValues(event);
  const meanA = mean(a);
  const meanB = mean(b);
  const sdA = sampleStdDev(a);
  const sdB = sampleStdDev(b);
  let welchT: number | null = null;
  let welchDf: number | null = null;
  let p: number | null = null;
  if (meanA !== null && meanB !== null && sdA !== null && sdB !== null) {
    const varianceA = (sdA * sdA) / a.length;
    const varianceB = (sdB * sdB) / b.length;
    const denominator = Math.sqrt(varianceA + varianceB);
    if (denominator > 0) {
      welchT = (meanB - meanA) / denominator;
      welchDf =
        (varianceA + varianceB) ** 2 /
        ((varianceA ** 2) / (a.length - 1) + (varianceB ** 2) / (b.length - 1));
      p = studentTTwoTailedP(welchT, welchDf);
    }
  }
  return {
    beforeMean: meanA,
    afterMean: meanB,
    changePercent:
      meanA !== null && meanB !== null && meanA !== 0
        ? ((meanB - meanA) / Math.abs(meanA)) * 100
        : null,
    beforeN: a.length,
    afterN: b.length,
    welchT,
    welchDf,
    p,
  };
}

export interface TwoByTwoTable {
  a: number;
  b: number;
  c: number;
  d: number;
  oddsRatio: number | null;
  phi: number | null;
  chiSquare: number | null;
  p: number | null;
  n: number;
}

/** Erfc via Abramowitz & Stegun 7.1.26 (max abs error 1.5e-7). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const value = poly * Math.exp(-z * z);
  return x >= 0 ? value : 2 - value;
}

/**
 * 2×2 contingency test (rows: driver above/below threshold; columns: response
 * above/below threshold), chi-square with Yates' continuity correction, 1 df.
 * p = erfc(sqrt(χ²/2)).
 */
export function twoByTwoTable(a: number, b: number, c: number, d: number): TwoByTwoTable {
  const n = a + b + c + d;
  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  const col2 = b + d;
  if (n === 0 || row1 === 0 || row2 === 0 || col1 === 0 || col2 === 0) {
    return { a, b, c, d, oddsRatio: null, phi: null, chiSquare: null, p: null, n };
  }
  const expected = [row1 * col1, row1 * col2, row2 * col1, row2 * col2].map((value) => value / n);
  const observed = [a, b, c, d];
  let chiSquare = 0;
  for (let i = 0; i < 4; i += 1) {
    const correction = Math.max(0, Math.abs(observed[i] - expected[i]) - 0.5);
    chiSquare += (correction * correction) / expected[i];
  }
  const phi = (a * d - b * c) / Math.sqrt(row1 * row2 * col1 * col2);
  const oddsRatio = b * c === 0 ? null : (a * d) / (b * c);
  const p = erfc(Math.sqrt(chiSquare / 2));
  return { a, b, c, d, oddsRatio, phi, chiSquare, p, n };
}

export interface MissingReport {
  expected: number | null;
  present: number;
  missing: number;
  fraction: number;
  coveragePercent: number | null;
  cadenceMs: number | null;
  largestGapMs: number | null;
  method: string;
}

/**
 * Missing / coverage statistics. `expected` is only reported when a regular
 * cadence can be inferred from the timestamps themselves (median spacing);
 * otherwise it stays null rather than being guessed.
 */
export function missingReport(times: string[], values: Array<number | null>, nowMs?: number): MissingReport {
  const parsed = times
    .map((time) => Date.parse(time))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const present = values.filter((value) => typeof value === 'number' && Number.isFinite(value)).length;
  const missing = Math.max(0, values.length - present);
  const fraction = values.length === 0 ? 1 : missing / values.length;
  if (parsed.length < 2) {
    return {
      expected: null,
      present,
      missing,
      fraction,
      coveragePercent: null,
      cadenceMs: null,
      largestGapMs: null,
      method: 'fewer than two timestamps — cadence cannot be inferred',
    };
  }
  const gaps: number[] = [];
  for (let i = 1; i < parsed.length; i += 1) gaps.push(parsed[i] - parsed[i - 1]);
  const cadence = median(gaps);
  if (!cadence || cadence <= 0) {
    return {
      expected: null,
      present,
      missing,
      fraction,
      coveragePercent: null,
      cadenceMs: null,
      largestGapMs: Math.max(...gaps),
      method: 'no stable cadence — coverage not estimated',
    };
  }
  const span = parsed[parsed.length - 1] - parsed[0];
  const expected = Math.max(1, Math.round(span / cadence) + 1);
  const coveragePercent = Math.min(100, (parsed.length / expected) * 100);
  return {
    expected,
    present,
    missing,
    fraction,
    coveragePercent,
    cadenceMs: cadence,
    largestGapMs: Math.max(...gaps),
    method: 'median sampling interval over the returned timestamps',
  };
}

/* ------------------------------------------------------------ series pairing */

export interface PairedSeries {
  /** Shared UTC instants (ISO). */
  times: string[];
  driver: Array<number | null>;
  response: Array<number | null>;
  pairedCount: number;
  driverMissing: number;
  responseMissing: number;
  toleranceMs: number;
  medianStepMs: number | null;
  driverCadence: string;
  responseCadence: string;
}

function nearestIndex(sortedTimes: number[], target: number): number {
  let low = 0;
  let high = sortedTimes.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sortedTimes[middle] < target) low = middle + 1;
    else high = middle;
  }
  if (low > 0 && Math.abs(sortedTimes[low - 1] - target) <= Math.abs(sortedTimes[low] - target)) {
    return low - 1;
  }
  return low;
}

/**
 * Pair two series on the response timestamps.
 *
 * Each response timestamp is matched to the nearest driver timestamp within a
 * stated tolerance (default ±90 min, which covers the 3-hour Kp cadence). A
 * response sample with no driver sample inside tolerance gets `null` — it is
 * never filled with a neighbouring value silently.
 */
export function alignSeries(
  driver: Observation[],
  response: Observation[],
  toleranceMs: number,
): PairedSeries {
  const driverPoints = driver
    .map((observation) => ({ ms: Date.parse(observation.time), value: observation.value }))
    .filter((point) => Number.isFinite(point.ms))
    .sort((a, b) => a.ms - b.ms);
  const responsePoints = response
    .map((observation) => ({ ms: Date.parse(observation.time), value: observation.value }))
    .filter((point) => Number.isFinite(point.ms))
    .sort((a, b) => a.ms - b.ms);
  const driverTimes = driverPoints.map((point) => point.ms);

  const times: string[] = [];
  const driverValues: Array<number | null> = [];
  const responseValues: Array<number | null> = [];
  let pairedCount = 0;
  let driverMissing = 0;
  let responseMissing = 0;

  for (const point of responsePoints) {
    times.push(new Date(point.ms).toISOString());
    responseValues.push(point.value);
    if (point.value === null) responseMissing += 1;
    if (driverTimes.length === 0) {
      driverValues.push(null);
      driverMissing += 1;
      continue;
    }
    const index = nearestIndex(driverTimes, point.ms);
    const candidate = driverPoints[index];
    if (!candidate || Math.abs(candidate.ms - point.ms) > toleranceMs) {
      driverValues.push(null);
      driverMissing += 1;
      continue;
    }
    driverValues.push(candidate.value);
    if (candidate.value === null) driverMissing += 1;
    else if (point.value !== null) pairedCount += 1;
  }

  const steps: number[] = [];
  for (let i = 1; i < responsePoints.length; i += 1) {
    const difference = responsePoints[i].ms - responsePoints[i - 1].ms;
    if (difference > 0) steps.push(difference);
  }

  return {
    times,
    driver: driverValues,
    response: responseValues,
    pairedCount,
    driverMissing,
    responseMissing,
    toleranceMs,
    medianStepMs: median(steps),
    driverCadence: cadenceLabel(driver),
    responseCadence: cadenceLabel(response),
  };
}

function cadenceLabel(observations: Observation[]): string {
  if (observations.length < 2) return 'unknown';
  const times = observations
    .map((observation) => Date.parse(observation.time))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i += 1) gaps.push(times[i] - times[i - 1]);
  const step = median(gaps);
  if (!step || step <= 0) return 'unknown';
  const minutes = step / 60_000;
  if (minutes < 90) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 36) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} days`;
}

/** Effect magnitude label used by evidence strength (never a p-value substitute). */
export function effectMagnitude(r: number | null): 'none' | 'weak' | 'moderate' | 'strong' {
  if (r === null || !Number.isFinite(r)) return 'none';
  const magnitude = Math.abs(r);
  if (magnitude >= 0.7) return 'strong';
  if (magnitude >= 0.5) return 'moderate';
  if (magnitude >= 0.3) return 'weak';
  return 'none';
}

/** Round for display without implying more precision than the input. */
export function round(value: number | null, digits = 4): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
