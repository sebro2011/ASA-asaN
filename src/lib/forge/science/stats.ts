/**
 * Deterministic statistics.
 *
 * Everything here returns a `ComputationResult` with its formula, assumptions and
 * limitations attached. Methods that require assumptions are *gated*: when the
 * data cannot support them the function returns `skipped: true` with the reason,
 * instead of a number that looks authoritative.
 *
 * No function in this file accepts text, so a model cannot influence a result.
 */

import {
  ScienceInputError,
  assertFinite,
  buildReproducibility,
  cleanValues,
  hashValues,
  type ComputationResult,
  type ClaimLevel,
} from './contracts';

/* ----------------------------- distributions ----------------------------- */

/** Two-sided 0.975 quantile of the standard normal. */
const Z_975 = 1.959963984540054;

/** Student-t 0.975 quantiles for small samples (df 1…30), then normal. */
const T_975: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262,
  10: 2.228, 11: 2.201, 12: 2.179, 13: 2.16, 14: 2.145, 15: 2.131, 16: 2.12, 17: 2.11, 18: 2.101,
  19: 2.093, 20: 2.086, 21: 2.08, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.06, 26: 2.056, 27: 2.052,
  28: 2.048, 29: 2.045, 30: 2.042,
};

export function tQuantile975(df: number): number {
  if (!Number.isFinite(df) || df < 1) return Z_975;
  const rounded = Math.floor(df);
  return T_975[rounded] ?? Z_975;
}

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sampleVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((total, value) => total + (value - m) ** 2, 0) / (values.length - 1);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Linear-interpolation percentile (the "R type 7" definition). */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) throw new ScienceInputError('EMPTY_DATASET', 'percentile() needs at least one value.');
  if (p < 0 || p > 1) throw new ScienceInputError('INVALID_PARAMETER', 'p must be within [0, 1].');
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/* ----------------------------- descriptives ------------------------------ */

export interface DescriptiveStats {
  mean: number;
  median: number;
  sd: number;
  variance: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  iqr: number;
  skewness: number;
  n: number;
}

export function describe(values: Array<number | null>, unit: string, label = 'series'): ComputationResult<DescriptiveStats> {
  const { values: clean, dropped, policy } = cleanValues(values, label);
  const n = clean.length;
  const m = mean(clean);
  const variance = sampleVariance(clean);
  const sd = Math.sqrt(variance);
  const q1 = percentile(clean, 0.25);
  const q3 = percentile(clean, 0.75);
  const skewness =
    n > 2 && sd > 0 ? (clean.reduce((total, value) => total + ((value - m) / sd) ** 3, 0) * n) / ((n - 1) * (n - 2)) : 0;

  const assumptions = [
    n < 2 ? 'A single observation: no dispersion statistic can be computed.' : 'The values are a sample of a larger population; they are not a census.',
    'Standard deviation uses the sample (n−1) denominator.',
  ];
  return {
    id: `descriptive:${label}`,
    kind: 'descriptive',
    claim: 'computed',
    value: {
      mean: m,
      median: median(clean),
      sd,
      variance,
      min: Math.min(...clean),
      max: Math.max(...clean),
      q1,
      q3,
      iqr: q3 - q1,
      skewness,
      n,
    },
    unit,
    uncertainty: n > 1 ? sd / Math.sqrt(n) : null,
    interval:
      n > 1
        ? [m - tQuantile975(n - 1) * (sd / Math.sqrt(n)), m + tQuantile975(n - 1) * (sd / Math.sqrt(n))]
        : null,
    sampleSize: n,
    assumptions,
    limitations: [
      'Descriptive statistics say nothing about causes or about values outside the sampled window.',
      n < 30 ? `Small sample (n=${n}): the interval above is wide and sensitive to single points.` : 'The interval assumes approximate normality of the sample mean.',
    ],
    skipped: n === 0,
    reproducibility: buildReproducibility(
      'Descriptive statistics',
      'x̄ = Σx/n · s² = Σ(x−x̄)²/(n−1) · quartiles by linear interpolation (R type 7)',
      [{ name: label, unit, count: n, hash: hashValues(values) }],
      { n, dropped },
      assumptions,
      policy,
      n,
      null,
    ),
  };
}

/* ----------------------------- correlation ------------------------------- */

function ranks(values: number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = new Array<number>(values.length).fill(0);
  let position = 0;
  while (position < order.length) {
    let end = position;
    while (end + 1 < order.length && order[end + 1].value === order[position].value) end += 1;
    const averageRank = (position + end) / 2 + 1;
    for (let index = position; index <= end; index += 1) result[order[index].index] = averageRank;
    position = end + 1;
  }
  return result;
}

export function pearson(x: number[], y: number[]): number {
  const n = x.length;
  const mx = mean(x);
  const my = mean(y);
  let numerator = 0;
  let sx = 0;
  let sy = 0;
  for (let index = 0; index < n; index += 1) {
    const dx = x[index] - mx;
    const dy = y[index] - my;
    numerator += dx * dy;
    sx += dx * dx;
    sy += dy * dy;
  }
  if (sx === 0 || sy === 0) return Number.NaN;
  return numerator / Math.sqrt(sx * sy);
}

export interface CorrelationValue {
  r: number;
  rSquared: number;
  n: number;
  /** Fisher z 95 % interval on r; null when n < 4. */
  interval: [number, number] | null;
  spearman: number;
  slope: number;
}

export function correlate(
  x: Array<number | null>,
  y: Array<number | null>,
  units: { x: string; y: string },
  labels = { x: 'x', y: 'y' },
): ComputationResult<CorrelationValue> {
  if (x.length !== y.length) {
    throw new ScienceInputError('INVALID_PARAMETER', 'Correlation needs two series of equal length, aligned in time.');
  }
  // Pairwise deletion: a pair is used only when both members are present.
  const pairs: Array<[number, number]> = [];
  for (let index = 0; index < x.length; index += 1) {
    const a = x[index];
    const b = y[index];
    if (typeof a === 'number' && Number.isFinite(a) && typeof b === 'number' && Number.isFinite(b)) pairs.push([a, b]);
  }
  const n = pairs.length;
  const assumptions = [
    'Both variables are numeric and paired in time.',
    'Correlation measures linear association; a curved relationship can give r≈0.',
    'A correlation is not evidence of causation and does not establish the direction of any effect.',
  ];
  const base = {
    id: `correlation:${labels.x}~${labels.y}`,
    kind: 'correlation' as const,
    claim: 'statistical' as ClaimLevel,
    unit: 'dimensionless',
    sampleSize: n,
    assumptions,
    limitations: [
      'Autocorrelated time series inflate the apparent significance; the effective sample size is smaller than n.',
      'Pearson r assumes bivariate linearity; Spearman ρ is reported for monotonic relationships.',
      n < 10 ? `Very small sample (n=${n}): treat r as exploratory only.` : 'Extreme pairs can dominate r.',
    ],
    skipped: n < 3,
    skipReason: n < 3 ? `Only ${n} paired observation(s); at least 3 are required.` : undefined,
    reproducibility: buildReproducibility(
      'Pearson and Spearman correlation',
      'r = Σ(x−x̄)(y−ȳ) / √(Σ(x−x̄)²·Σ(y−ȳ)²) · Fisher z interval: tanh(arctanh(r) ± z·√(1/(n−3)))',
      [
        { name: labels.x, unit: units.x, count: n, hash: hashValues(x) },
        { name: labels.y, unit: units.y, count: n, hash: hashValues(y) },
      ],
      { pairs: n, droppedX: x.length - n, droppedY: y.length - n },
      assumptions,
      `Pairwise deletion: ${x.length - n} incomplete pair(s) excluded from both variables.`,
      n,
      null,
    ),
  };
  if (n < 3) {
    return {
      ...base,
      value: { r: Number.NaN, rSquared: Number.NaN, n, interval: null, spearman: Number.NaN, slope: Number.NaN },
      uncertainty: null,
      interval: null,
    };
  }
  const xs = pairs.map((pair) => pair[0]);
  const ys = pairs.map((pair) => pair[1]);
  const r = pearson(xs, ys);
  const spearman = pearson(ranks(xs), ranks(ys));
  let interval: [number, number] | null = null;
  if (n >= 4 && Number.isFinite(r) && Math.abs(r) < 1) {
    const z = Math.atanh(r);
    const se = 1 / Math.sqrt(n - 3);
    interval = [Math.tanh(z - Z_975 * se), Math.tanh(z + Z_975 * se)];
  }
  const slope = varianceSlope(xs, ys);
  return {
    ...base,
    value: {
      r,
      rSquared: r * r,
      n,
      interval,
      spearman,
      slope,
    },
    uncertainty: interval ? Math.abs(interval[1] - interval[0]) / (2 * Z_975) : null,
    interval,
  };
}

function varianceSlope(x: number[], y: number[]): number {
  const mx = mean(x);
  const my = mean(y);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < x.length; index += 1) {
    numerator += (x[index] - mx) * (y[index] - my);
    denominator += (x[index] - mx) ** 2;
  }
  return denominator === 0 ? Number.NaN : numerator / denominator;
}

/* ------------------------------ regression ------------------------------- */

export interface LinearFit {
  slope: number;
  intercept: number;
  rSquared: number;
  slopeStdError: number;
  slopeInterval: [number, number] | null;
  n: number;
  residualSd: number;
}

/** Ordinary least squares y = a + b·x, with the standard error of b. */
export function linearRegression(
  x: Array<number | null>,
  y: Array<number | null>,
  units: { x: string; y: string },
  labels = { x: 'x', y: 'y' },
): ComputationResult<LinearFit> {
  const correlation = correlate(x, y, units, labels);
  const n = correlation.sampleSize;
  const base = { ...correlation, id: `regression:${labels.y}~${labels.x}` };
  if (correlation.skipped || n < 3) {
    return {
      ...base,
      value: { slope: Number.NaN, intercept: Number.NaN, rSquared: Number.NaN, slopeStdError: Number.NaN, slopeInterval: null, n, residualSd: Number.NaN },
    };
  }
  const pairs: Array<[number, number]> = [];
  for (let index = 0; index < x.length; index += 1) {
    const a = x[index];
    const b = y[index];
    if (typeof a === 'number' && Number.isFinite(a) && typeof b === 'number' && Number.isFinite(b)) pairs.push([a, b]);
  }
  const xs = pairs.map((pair) => pair[0]);
  const ys = pairs.map((pair) => pair[1]);
  const slope = varianceSlope(xs, ys);
  const intercept = mean(ys) - slope * mean(xs);
  const fitted = xs.map((value) => intercept + slope * value);
  const residuals = ys.map((value, index) => value - fitted[index]);
  const sse = residuals.reduce((total, residual) => total + residual * residual, 0);
  const sst = ys.reduce((total, value) => total + (value - mean(ys)) ** 2, 0);
  const rSquared = sst === 0 ? Number.NaN : 1 - sse / sst;
  const residualSd = n > 2 ? Math.sqrt(sse / (n - 2)) : Number.NaN;
  const sxx = xs.reduce((total, value) => total + (value - mean(xs)) ** 2, 0);
  const slopeStdError = sxx > 0 ? residualSd / Math.sqrt(sxx) : Number.NaN;
  const t = tQuantile975(n - 2);
  const slopeInterval =
    Number.isFinite(slopeStdError) ? ([slope - t * slopeStdError, slope + t * slopeStdError] as [number, number]) : null;

  return {
    ...base,
    claim: 'statistical',
    value: { slope, intercept, rSquared, slopeStdError, slopeInterval, n, residualSd },
    uncertainty: Number.isFinite(slopeStdError) ? slopeStdError : null,
    interval: slopeInterval,
    limitations: [
      ...correlation.limitations,
      'The interval assumes independent, homoscedastic, approximately normal residuals — none of which is proven here.',
      'Fitting a trend does not establish a mechanism, and extrapolating outside the observed x range is unsupported.',
      n < 8 ? `n=${n}: the slope interval is wide and driven by individual points.` : 'A changing relationship over time is not detected by a single straight line.',
    ],
    assumptions: [
      ...correlation.assumptions,
      'A straight line is an adequate description of the relationship over the observed range.',
    ],
    reproducibility: buildReproducibility(
      'Ordinary least squares regression',
      'b = Σ(x−x̄)(y−ȳ)/Σ(x−x̄)² · a = ȳ − b·x̄ · SE(b) = s/√Sxx · CI = b ± t₀.₉₇₅,ₙ₋₂·SE(b)',
      [
        { name: labels.x, unit: units.x, count: n, hash: hashValues(x) },
        { name: labels.y, unit: units.y, count: n, hash: hashValues(y) },
      ],
      { n },
      correlation.assumptions,
      correlation.reproducibility.missingValuePolicy,
      n,
      null,
    ),
  };
}

/* ---------------------------- hypothesis tests ---------------------------- */

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIterations = 200;
  const eps = 3e-12;
  const fpMin = 1e-300;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpMin) d = fpMin;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIterations; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < eps) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a,b) — the Student-t tail depends on it. */
export function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // B(a,b)·x^a·(1−x)^b, i.e. exp(lnΓ(a+b) − lnΓ(a) − lnΓ(b) + a·ln x + b·ln(1−x)).
  const front = Math.exp(
    Math.log(x) * a + Math.log(1 - x) * b + logGamma(a + b) - logGamma(a) - logGamma(b),
  );
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

function logGamma(value: number): number {
  const coefficients = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2,
    -0.5395239384953e-5,
  ];
  let y = value;
  const x = value;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const coefficient of coefficients) {
    y += 1;
    ser += coefficient / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Two-sided p-value of Student's t statistic. */
export function tTwoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return Number.NaN;
  const x = df / (df + t * t);
  return incompleteBeta(df / 2, 0.5, x);
}

export interface TestValue {
  statistic: number;
  df: number;
  pValue: number;
  meanDifference: number;
  interval: [number, number] | null;
  effectSize: number;
}

/**
 * One-sample or paired t-test. Refuses small samples rather than reporting a
 * p-value the data cannot support.
 */
export function tTestOneSample(
  values: Array<number | null>,
  options: { mu?: number; unit: string; label?: string; pairedWith?: Array<number | null> } = { mu: 0, unit: '' },
): ComputationResult<TestValue> {
  const label = options.label ?? 'sample';
  const { values: clean, dropped, policy } = cleanValues(values, label);
  const mu = assertFinite(options.mu ?? 0, 'mu');
  const n = clean.length;
  const baseAssumptions = [
    'Observations are independent (a paired test uses the differences instead).',
    'The sample mean is approximately normally distributed (central limit theorem, or the data themselves).',
    `H₀: the population mean equals ${mu} ${options.unit}.`,
  ];
  const skipped = n < 3;
  const base = {
    id: `t-test:${label}`,
    kind: 'hypothesis-test' as const,
    claim: 'statistical' as ClaimLevel,
    unit: options.unit,
    sampleSize: n,
    assumptions: baseAssumptions,
    limitations: [
      'A p-value is the probability of the data under H₀; it is not the probability that H₀ is true.',
      'Statistical significance is not practical significance.',
      'With many comparisons, some p-values below 0.05 are expected by chance.',
      n < 8 ? `n=${n}: the t approximation is fragile at this size.` : 'Outliers can dominate both mean and standard deviation.',
    ],
    skipped,
    skipReason: skipped ? `Only ${n} value(s); at least 3 are required for a t-test.` : undefined,
    reproducibility: buildReproducibility(
      options.pairedWith ? 'Paired t-test' : 'One-sample t-test',
      't = (x̄ − μ₀) / (s/√n), df = n − 1',
      [{ name: label, unit: options.unit, count: n, hash: hashValues(values) }],
      { mu, n },
      baseAssumptions,
      policy,
      n,
      null,
    ),
  };

  if (skipped) {
    return { ...base, value: { statistic: Number.NaN, df: n - 1, pValue: Number.NaN, meanDifference: Number.NaN, interval: null, effectSize: Number.NaN }, uncertainty: null, interval: null };
  }

  let sample = clean;
  if (options.pairedWith) {
    const paired: number[] = [];
    for (let index = 0; index < Math.min(clean.length, options.pairedWith.length); index += 1) {
      const other = options.pairedWith[index];
      if (other !== null && Number.isFinite(other)) paired.push(clean[index] - (other as number));
    }
    sample = paired;
    if (sample.length < 3) {
      return {
        ...base,
        skipped: true,
        skipReason: `Only ${sample.length} complete pair(s) remain after pairing.`,
        value: { statistic: Number.NaN, df: sample.length - 1, pValue: Number.NaN, meanDifference: Number.NaN, interval: null, effectSize: Number.NaN },
        uncertainty: null,
        interval: null,
      };
    }
  }

  const nUsed = sample.length;
  const m = mean(sample);
  const sd = Math.sqrt(sampleVariance(sample));
  const se = sd / Math.sqrt(nUsed);
  const df = nUsed - 1;
  const statistic = se === 0 ? (m === mu ? 0 : Number.POSITIVE_INFINITY) : (m - mu) / se;
  const pValue = tTwoSidedP(statistic, df);
  const t = tQuantile975(df);
  const interval: [number, number] = [m - t * se, m + t * se];
  const effectSize = sd === 0 ? 0 : (m - mu) / sd;

  return {
    ...base,
    sampleSize: nUsed,
    value: { statistic, df, pValue, meanDifference: m - mu, interval, effectSize },
    uncertainty: se,
    interval,
    limitations: [
      ...base.limitations,
      dropped > 0 ? `${dropped} missing value(s) excluded; if they are not missing at random the estimate is biased.` : '',
    ].filter(Boolean),
  };
}

/** Welch's two-sample t-test (does not assume equal variances). */
export function tTestWelch(
  a: Array<number | null>,
  b: Array<number | null>,
  unit: string,
  labels = { a: 'a', b: 'b' },
): ComputationResult<TestValue> {
  const { values: first } = cleanValues(a, labels.a);
  const { values: second } = cleanValues(b, labels.b);
  const n1 = first.length;
  const n2 = second.length;
  const skipped = n1 < 3 || n2 < 3;
  const assumptions = [
    'The two samples are independent of each other.',
    'Each sample is approximately normally distributed, or both are large.',
    'Variances are not assumed equal (Welch correction).',
    'H₀: the two population means are equal.',
  ];
  const base = {
    id: `welch:${labels.a}~${labels.b}`,
    kind: 'hypothesis-test' as const,
    claim: 'statistical' as ClaimLevel,
    unit,
    sampleSize: n1 + n2,
    assumptions,
    limitations: [
      'A p-value describes the data under H₀, not the probability that a difference is real.',
      'Independence fails when the same station/instrument produced both samples.',
      n1 < 8 || n2 < 8 ? 'One sample is small; the normal approximation is fragile.' : 'Outliers can dominate the means.',
    ],
    skipped,
    skipReason: skipped ? `Both groups need at least 3 values (got ${n1} and ${n2}).` : undefined,
    reproducibility: buildReproducibility(
      'Welch two-sample t-test',
      't = (x̄₁−x̄₂)/√(s₁²/n₁ + s₂²/n₂) · df = (s₁²/n₁+s₂²/n₂)² / ((s₁²/n₁)²/(n₁−1) + (s₂²/n₂)²/(n₂−1))',
      [
        { name: labels.a, unit, count: n1, hash: hashValues(a) },
        { name: labels.b, unit, count: n2, hash: hashValues(b) },
      ],
      { n1, n2 },
      assumptions,
      'Listwise deletion within each group; no values imputed.',
      n1 + n2,
      null,
    ),
  };
  if (skipped) {
    return { ...base, value: { statistic: Number.NaN, df: Number.NaN, pValue: Number.NaN, meanDifference: Number.NaN, interval: null, effectSize: Number.NaN }, uncertainty: null, interval: null };
  }
  const m1 = mean(first);
  const m2 = mean(second);
  const v1 = sampleVariance(first);
  const v2 = sampleVariance(second);
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  const df = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
  const statistic = se === 0 ? 0 : (m1 - m2) / se;
  const t = tQuantile975(df);
  const diff = m1 - m2;
  const pooledSd = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  return {
    ...base,
    value: {
      statistic,
      df,
      pValue: tTwoSidedP(statistic, df),
      meanDifference: diff,
      interval: [diff - t * se, diff + t * se],
      effectSize: pooledSd === 0 ? 0 : diff / pooledSd,
    },
    uncertainty: se,
    interval: [diff - t * se, diff + t * se],
  };
}

/* ------------------------------- outliers -------------------------------- */

export interface OutlierReport {
  indices: number[];
  values: number[];
  method: 'modified-z (MAD)';
  threshold: number;
  centre: number;
  scale: number;
}

/**
 * Robust outlier detection using the modified z-score (Iglewicz–Hoaglin):
 * |0.6745·(x − median)/MAD| > 3.5. Median and MAD make it resistant to the very
 * points it is trying to find.
 */
export function detectOutliers(values: Array<number | null>, unit: string, label = 'series'): ComputationResult<OutlierReport> {
  const { values: clean, dropped, policy } = cleanValues(values, label);
  const med = median(clean);
  const deviations = clean.map((value) => Math.abs(value - med));
  const mad = median(deviations);
  const scale = mad === 0 ? 0 : 1.4826 * mad; // consistent with σ for normal data
  const threshold = 3.5;
  const indices: number[] = [];
  const flagged: number[] = [];
  clean.forEach((value, index) => {
    const score = mad === 0 ? 0 : Math.abs(0.6745 * (value - med)) / mad;
    if (score > threshold) {
      indices.push(index);
      flagged.push(value);
    }
  });
  const assumptions = [
    'The bulk of the data is roughly symmetric; MAD is meaningless for heavily skewed samples.',
    'A flagged point is unusual relative to this sample, not necessarily erroneous.',
  ];
  return {
    id: `outliers:${label}`,
    kind: 'outlier',
    claim: 'computed',
    value: { indices, values: flagged, method: 'modified-z (MAD)', threshold, centre: med, scale },
    unit,
    uncertainty: null,
    interval: null,
    sampleSize: clean.length,
    assumptions,
    limitations: [
      'Never delete a flagged observation without a documented instrument or quality-control reason.',
      mad === 0
        ? 'More than half the values are identical (MAD = 0), so the score cannot separate points — nothing was flagged.'
        : 'With very small samples a single true extreme can mask others.',
    ],
    skipped: clean.length < 4,
    skipReason: clean.length < 4 ? 'At least 4 values are needed for a robust scale estimate.' : undefined,
    reproducibility: buildReproducibility(
      'Robust outlier detection (modified z-score)',
      'M = 0.6745·(x − median)/MAD; flag when |M| > 3.5',
      [{ name: label, unit, count: clean.length, hash: hashValues(values) }],
      { threshold, mad, count: flagged.length, dropped },
      assumptions,
      policy,
      clean.length,
      null,
    ),
  };
}

/* ------------------------------ sensitivity ------------------------------ */

/** Jackknife: how much each single observation moves the statistic. */
export function jackknifeSensitivity(
  values: Array<number | null>,
  unit: string,
  label = 'series',
): ComputationResult<{ range: [number, number]; mostInfluential: { index: number; leaveOneOutMean: number } | null }> {
  const { values: clean, dropped, policy } = cleanValues(values, label);
  const n = clean.length;
  if (n < 3) {
    return {
      id: `jackknife:${label}`,
      kind: 'sensitivity',
      claim: 'computed',
      value: { range: [Number.NaN, Number.NaN], mostInfluential: null },
      unit,
      uncertainty: null,
      interval: null,
      sampleSize: n,
      assumptions: ['Leave-one-out resampling of the observed values only.'],
      limitations: ['At least 3 values are required.'],
      skipped: true,
      skipReason: `Only ${n} value(s) available.`,
      reproducibility: buildReproducibility('Jackknife', 'x̄₍₋ᵢ₎ = (Σx − xᵢ)/(n−1)', [], {}, [], policy, n, null),
    };
  }
  const total = clean.reduce((sum, value) => sum + value, 0);
  const overall = total / n;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let worst = { index: 0, leaveOneOutMean: 0, distance: -1 };
  clean.forEach((value, index) => {
    const leaveOneOut = (total - value) / (n - 1);
    min = Math.min(min, leaveOneOut);
    max = Math.max(max, leaveOneOut);
    const distance = Math.abs(leaveOneOut - overall);
    if (distance > worst.distance) worst = { index, leaveOneOutMean: leaveOneOut, distance };
  });
  return {
    id: `jackknife:${label}`,
    kind: 'sensitivity',
    claim: 'computed',
    value: { range: [min, max], mostInfluential: { index: worst.index, leaveOneOutMean: worst.leaveOneOutMean } },
    unit,
    uncertainty: null,
    interval: null,
    sampleSize: n,
    assumptions: ['Each observation is removed once; the statistic is the mean.'],
    limitations: [
      'The jackknife shows influence, not correctness — an influential point can be the most informative one.',
      'It cannot detect the effect of a variable that was never retrieved.',
    ],
    skipped: false,
    reproducibility: buildReproducibility(
      'Leave-one-out jackknife',
      'x̄₍₋ᵢ₎ = (Σx − xᵢ)/(n−1); range over i',
      [{ name: label, unit, count: n, hash: hashValues(values) }],
      { n, dropped },
      ['The statistic of interest is the arithmetic mean.'],
      policy,
      n,
      null,
    ),
  };
}

/* --------------------------- model comparison ---------------------------- */

function aic(rss: number, k: number, n: number): number {
  if (rss <= 0 || n === 0) return Number.NaN;
  return n * Math.log(rss / n) + 2 * k;
}

export interface ModelComparison {
  linear: { aic: number; rSquared: number; parameters: number };
  exponential: { aic: number; rSquared: number; parameters: number } | null;
  /** AIC(linear) − AIC(exponential); positive values favour the exponential model. */
  deltaAic: number | null;
  preferred: 'linear' | 'exponential' | 'indistinguishable';
}

/**
 * Compares a linear trend with an exponential growth/decay model on the same
 * points. AIC is used because it penalises the extra curvature; a ΔAIC below 2
 * means the data cannot separate the two, and the result says so rather than
 * picking a winner.
 */
export function compareTrendModels(
  x: Array<number | null>,
  y: Array<number | null>,
  units: { x: string; y: string },
): ComputationResult<ModelComparison> {
  const regression = linearRegression(x, y, units);
  const n = regression.sampleSize;
  if (regression.skipped || n < 5) {
    return {
      id: 'model-comparison:trend',
      kind: 'model-comparison',
      claim: 'computed',
      value: { linear: { aic: Number.NaN, rSquared: Number.NaN, parameters: 2 }, exponential: null, deltaAic: null, preferred: 'indistinguishable' },
      unit: 'dimensionless',
      uncertainty: null,
      interval: null,
      sampleSize: n,
      assumptions: ['Model comparison needs at least 5 paired points.'],
      limitations: ['With fewer than 5 points, model comparison is not meaningful.'],
      skipped: true,
      skipReason: `Only ${n} paired point(s).`,
      reproducibility: regression.reproducibility,
    };
  }
  const pairs: Array<[number, number]> = [];
  for (let index = 0; index < x.length; index += 1) {
    const a = x[index];
    const b = y[index];
    if (typeof a === 'number' && Number.isFinite(a) && typeof b === 'number' && Number.isFinite(b)) pairs.push([a, b]);
  }
  const xs = pairs.map((pair) => pair[0]);
  const ys = pairs.map((pair) => pair[1]);
  const meanY = mean(ys);
  const sst = ys.reduce((total, value) => total + (value - meanY) ** 2, 0);

  const linearRss = (() => {
    const slope = varianceSlope(xs, ys);
    const intercept = meanY - slope * mean(xs);
    return ys.reduce((total, value, index) => total + (value - (intercept + slope * xs[index])) ** 2, 0);
  })();
  const linearAic = aic(linearRss, 2, n);

  // Exponential model y = A·e^{b·x} fitted by OLS on ln(y); only valid for y > 0.
  let exponential: ModelComparison['exponential'] = null;
  if (ys.every((value) => value > 0)) {
    const logY = ys.map((value) => Math.log(value));
    const b = varianceSlope(xs, logY);
    const a = mean(logY) - b * mean(xs);
    // Residuals are evaluated in the original space, so AIC compares like with like.
    const rss = ys.reduce((total, value, index) => total + (value - Math.exp(a + b * xs[index])) ** 2, 0);
    const excludedRss = rss <= 0 ? Number.EPSILON : rss;
    exponential = {
      aic: aic(excludedRss, 3, n),
      rSquared: sst === 0 ? Number.NaN : 1 - excludedRss / sst,
      parameters: 3,
    };
  }

  const deltaAic = exponential ? linearAic - exponential.aic : null;
  const preferred: ModelComparison['preferred'] =
    deltaAic === null ? 'linear' : Math.abs(deltaAic) < 2 ? 'indistinguishable' : deltaAic > 0 ? 'exponential' : 'linear';

  const assumptions = [
    'Both models are fitted to the same points; the comparison is only between these two families.',
    'AIC balances fit against parameter count; it does not test either model against the truth.',
    'The exponential fit requires strictly positive y and is fitted in log space.',
  ];
  return {
    id: 'model-comparison:trend',
    kind: 'model-comparison',
    claim: 'computed',
    value: {
      linear: { aic: linearAic, rSquared: regression.value.rSquared, parameters: 2 },
      exponential,
      deltaAic,
      preferred,
    },
    unit: 'dimensionless',
    uncertainty: null,
    interval: null,
    sampleSize: n,
    assumptions,
    limitations: [
      'Neither model is proven; a third family could fit better.',
      'AIC assumes the residuals of each model are independent and identically distributed — autocorrelated series violate this.',
      preferred === 'indistinguishable'
        ? 'ΔAIC < 2: the data cannot distinguish the two shapes — do not claim one over the other.'
        : 'The preferred model is a description of this window, not a mechanism.',
    ],
    skipped: false,
    reproducibility: buildReproducibility(
      'AIC model comparison (linear vs exponential)',
      'AIC = n·ln(RSS/n) + 2k · ΔAIC = AIC_linear − AIC_exponential',
      [{ name: 'paired points', unit: 'dimensionless', count: n, hash: hashValues(y) }],
      { n, models: 'linear,y=A·e^{bx}' },
      assumptions,
      'Listwise deletion of incomplete pairs; exponential fit skipped when any y ≤ 0.',
      n,
      null,
    ),
  };
}

export { mean as meanOf, median as medianOf };
