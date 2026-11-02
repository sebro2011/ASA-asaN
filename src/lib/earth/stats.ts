/**
 * Earth Intelligence Lab — statistical inference for climate time series.
 *
 * All functions are pure (no network, no DOM) and operate only on values
 * that were actually retrieved. Every result carries enough metadata for the
 * UI to state the method, the confidence level, and the limitations.
 *
 * Implemented methods:
 *  - Mann-Kendall trend test (non-parametric, monotonic trend) with tie correction
 *  - Sen's slope estimator (median of pairwise slopes)
 *  - Confidence interval for Sen's slope (Hirsch et al. 1982)
 *  - Hamed-Rao (1998) autocorrelation correction for the Mann-Kendall variance
 *  - Two-tailed p-value via normal approximation (Abramowitz & Stegun 7.1.26)
 *  - Missing-data handling and reporting
 *  - Data quality validation (fill values, plausible ranges)
 *  - Multiple-comparison correction (Bonferroni, Benjamini-Hochberg FDR)
 *  - PRECTOTCORR precipitation: mm/day rate -> monthly total via days-per-month
 *
 * References:
 *  - Mann, H. B. (1945). Nonparametric tests against trend. Econometrica.
 *  - Kendall, M. G. (1938). A new measure of rank correlation. Biometrika.
 *  - Sen, P. K. (1968). Estimates of the regression coefficient based on Kendall's tau. JASA.
 *  - Hirsch, R. M., Slack, J. R., & Smith, R. A. (1982). Techniques of trend
 *    analysis for monthly water quality data. Water Resources Research.
 *  - Hamed, K. H., & Rao, A. R. (1998). A modified Mann-Kendall trend test
 *    for autocorrelated data. Journal of Hydrology.
 *  - Abramowitz & Stegun (1972). Handbook of Mathematical Functions, 7.1.26.
 */

/** Significance level used throughout unless overridden. */
export const DEFAULT_ALPHA = 0.05;

/** POWER fill / no-data sentinel (values at or below this are treated as missing). */
export const FILL_VALUE_THRESHOLD = -900;

/** Plausible range checks per POWER parameter kind. Values outside are flagged. */
export const PLAUSIBLE_RANGE: Record<string, { min: number; max: number }> = {
  T2M: { min: -60, max: 60 },
  T2M_MAX: { min: -60, max: 60 },
  T2M_MIN: { min: -60, max: 60 },
  PRECTOTCORR: { min: 0, max: 1000 },
  RH2M: { min: 0, max: 100 },
  WS2M: { min: 0, max: 50 },
  ALLSKY_SFC_SW_DWN: { min: 0, max: 15 }
} as const;

/* ------------------------------------------------------------------ */
/* Standard normal distribution (Abramowitz & Stegun 7.1.26)          */
/* ------------------------------------------------------------------ */

const NORMAL_P = 0.2316419;
const NORMAL_B = [
  0.319381530,
  -0.356563782,
  1.781477937,
  -1.821255978,
  1.330274429
];

/** Standard normal PDF at x. */
export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Standard normal CDF at x. Accuracy ~7 decimal places for |x| >= 0. */
export function normalCdf(x: number): number {
  if (x < 0) return 1 - normalCdf(-x);
  const t = 1 / (1 + NORMAL_P * x);
  const poly = ((((NORMAL_B[4] * t + NORMAL_B[3]) * t + NORMAL_B[2]) * t + NORMAL_B[1]) * t + NORMAL_B[0]) * t;
  return 1 - normalPdf(x) * poly;
}

/** Two-tailed p-value from a standard normal statistic Z. */
export function normalTwoTailedP(z: number): number {
  return 2 * (1 - normalCdf(Math.abs(z)));
}

/** Inverse standard normal CDF (quantile) via bisection. Monotone, stable. */
export function normalQuantile(p: number): number {
  if (p <= 0 || p >= 1) return p < 0.5 ? -Infinity : Infinity;
  let lo = -12;
  let hi = 12;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}

/* ------------------------------------------------------------------ */
/* Missing-data handling                                              */
/* ------------------------------------------------------------------ */

/**
 * Split a numeric array into valid and missing indices.
 * A value is missing when it is null/undefined, non-finite, or at/below
 * the POWER fill-value sentinel.
 */
export interface MissingDataReport {
  total: number;
  valid: number;
  missing: number;
  missingIndices: number[];
  validValues: number[];
  validIndices: number[];
}

export function missingDataReport(
  values: Array<number | null | undefined>,
  options: { fillThreshold?: number } = {}
): MissingDataReport {
  const threshold = options.fillThreshold ?? FILL_VALUE_THRESHOLD;
  const missingIndices: number[] = [];
  const validIndices: number[] = [];
  const validValues: number[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const isMissing =
      value === null || value === undefined || !Number.isFinite(value) || value <= threshold;
    if (isMissing) missingIndices.push(index);
    else {
      validIndices.push(index);
      validValues.push(value as number);
    }
  }

  return {
    total: values.length,
    valid: validValues.length,
    missing: missingIndices.length,
    missingIndices,
    validValues,
    validIndices
  };
}

export function completenessFraction(report: MissingDataReport): number {
  return report.total === 0 ? 0 : report.valid / report.total;
}

/* ------------------------------------------------------------------ */
/* Data quality validation                                            */
/* ------------------------------------------------------------------ */

/**
 * Flag implausible values for a given POWER parameter code.
 * Returns indices (into the valid-values array) that fall outside
 * the documented plausible range, plus a human-readable note.
 */
export interface QualityFlags {
  plausible: number[];
  implausible: number[];
  implausibleValues: number[];
  note: string;
}

export function validateParameterQuality(
  code: string,
  values: number[]
): QualityFlags {
  const range = PLAUSIBLE_RANGE[code];
  const plausible: number[] = [];
  const implausible: number[] = [];
  const implausibleValues: number[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (range && (value < range.min || value > range.max)) {
      implausible.push(index);
      implausibleValues.push(value);
    } else {
      plausible.push(index);
    }
  }

  const note = implausible.length === 0
    ? `All ${values.length} values fall within the plausible range for ${code}.`
    : `${implausible.length} of ${values.length} ${code} values fall outside the plausible range ` +
      `(${range?.min ?? '—'} to ${range?.max ?? '—'}); treat trend results for this parameter with caution.`;

  return { plausible, implausible, implausibleValues, note };
}

/* ------------------------------------------------------------------ */
/* Mann-Kendall trend test                                            */
/* ------------------------------------------------------------------ */

/** sign(x): 1 if x > 0, 0 if x == 0, -1 if x < 0. */
function signOf(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

/**
 * Mann-Kendall S statistic: sum over all i<j of sign(x_j - x_i).
 * Positive S indicates an increasing monotonic trend; negative S decreasing.
 */
export function mannKendallS(values: number[]): number {
  let s = 0;
  for (let i = 0; i < values.length - 1; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      s += signOf(values[j] - values[i]);
    }
  }
  return s;
}

/** Tie-corrected variance of the Mann-Kendall S statistic (no ties → n(n-1)(2n+5)/18). */
export function mannKendallVariance(values: number[]): number {
  const n = values.length;
  const base = (n * (n - 1) * (2 * n + 5)) / 18;

  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);

  let tieCorrection = 0;
  for (const count of counts.values()) {
    if (count > 1) tieCorrection += count * (count - 1) * (2 * count + 5);
  }

  return (base * 18 - tieCorrection) / 18;
}

/**
 * Standardized Mann-Kendall Z statistic with continuity correction.
 * Returns null when variance is zero (all values identical).
 */
export function mannKendallZ(s: number, variance: number): number | null {
  if (variance <= 0) return null;
  const stdDev = Math.sqrt(variance);
  if (s > 0) return (s - 1) / stdDev;
  if (s < 0) return (s + 1) / stdDev;
  return 0;
}

/**
 * Full Mann-Kendall result for one series.
 *
 * `values` must be the valid (non-missing) observations in chronological order.
 * `alpha` is the significance level (default 0.05).
 */
export interface MannKendallResult {
  n: number;
  s: number;
  variance: number;
  z: number | null;
  pValue: number;
  tau: number;
  trend: 'increasing' | 'decreasing' | 'no-trend';
  significant: boolean;
  alpha: number;
  lag1Autocorrelation: number;
  hamedRao: HamedRaoResult;
  missing: MissingDataReport;
  quality: QualityFlags | null;
}

export interface HamedRaoResult {
  uncorrectedPValue: number;
  lag1Autocorrelation: number;
  correctionFactor: number;
  adjustedVariance: number;
  adjustedZ: number | null;
  adjustedPValue: number;
  adjustedSignificant: boolean;
  note: string;
}

/**
 * Lag-1 autocorrelation (Pearson) of a series. Returns 0 when fewer than
 * two points or zero variance.
 */
export function lag1Autocorrelation(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n - 1; i += 1) {
    const a = values[i] - mean;
    const b = values[i + 1] - mean;
    numerator += a * b;
    denominator += a * a;
  }
  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Hamed-Rao (1998) variance correction for autocorrelated data.
 *
 * For an AR(1)-like process with lag-1 autocorrelation r1, the effective
 * number of independent observations is reduced. We adjust the Mann-Kendall
 * variance by the factor:
 *
 *   correction = 1 + 2 * sum_{k=1}^{n-1} ((n - k) / n) * r1^k
 *
 * truncated at lag 1 for stability (r1^k decays quickly for |r1| < 1).
 * Positive autocorrelation inflates the variance, making the test more
 * conservative.
 */
export function hamedRaoCorrection(
  values: number[],
  s: number,
  variance: number,
  z: number | null,
  alpha: number
): HamedRaoResult {
  const r1 = lag1Autocorrelation(values);

  let correctionFactor = 1;
  if (Math.abs(r1) > 1e-6) {
    let sum = 0;
    let power = r1;
    for (let lag = 1; lag < values.length && Math.abs(power) > 1e-6; lag += 1) {
      sum += ((values.length - lag) / values.length) * power;
      power *= r1;
    }
    correctionFactor = 1 + 2 * sum;
    if (!Number.isFinite(correctionFactor) || correctionFactor < 0.01) correctionFactor = 1;
  }

  const adjustedVariance = variance * correctionFactor;
  const adjustedZ = z === null ? null : z / Math.sqrt(correctionFactor);
  const adjustedPValue = adjustedZ === null ? 1 : normalTwoTailedP(adjustedZ);

  const note =
    Math.abs(r1) < 0.05
      ? 'Negligible lag-1 autocorrelation; Hamed-Rao correction does not change the result.'
      : r1 > 0
        ? `Positive lag-1 autocorrelation (r1 = ${r1.toFixed(3)}) inflates the Mann-Kendall variance; the corrected test is more conservative.`
        : `Negative lag-1 autocorrelation (r1 = ${r1.toFixed(3)}); the corrected test is less conservative.`;

  return {
    uncorrectedPValue: normalTwoTailedP(z === null ? 0 : z),
    lag1Autocorrelation: r1,
    correctionFactor,
    adjustedVariance,
    adjustedZ,
    adjustedPValue,
    adjustedSignificant: adjustedZ !== null && adjustedPValue < alpha,
    note
  };
}

/**
 * Mann-Kendall trend test on a chronological series of valid values.
 *
 * @param values - valid observations in chronological order (missing already removed)
 * @param missing - missing-data report for the original series
 * @param alpha - significance level (default 0.05)
 * @param parameterCode - optional POWER code for plausibility flagging
 */
export function mannKendallTest(
  values: number[],
  missing: MissingDataReport,
  options: { alpha?: number; parameterCode?: string } = {}
): MannKendallResult {
  const alpha = options.alpha ?? DEFAULT_ALPHA;
  const n = values.length;
  const s = mannKendallS(values);
  const variance = mannKendallVariance(values);
  const z = mannKendallZ(s, variance);
  const pValue = z === null ? 1 : normalTwoTailedP(z);
  const tau = n >= 2 ? (2 * s) / (n * (n - 1)) : 0;

  const trend:
    | 'increasing'
    | 'decreasing'
    | 'no-trend' = z === null
    ? 'no-trend'
    : pValue < alpha
      ? s > 0
        ? 'increasing'
        : 'decreasing'
      : 'no-trend';

  const quality = options.parameterCode
    ? validateParameterQuality(options.parameterCode, values)
    : null;

  const hamedRao = hamedRaoCorrection(values, s, variance, z, alpha);

  return {
    n,
    s,
    variance,
    z,
    pValue,
    tau,
    trend,
    significant: z !== null && pValue < alpha,
    alpha,
    lag1Autocorrelation: hamedRao.lag1Autocorrelation,
    hamedRao,
    missing,
    quality
  };
}

/* ------------------------------------------------------------------ */
/* Sen's slope estimator                                              */
/* ------------------------------------------------------------------ */

/**
 * Sen's slope: the median of all pairwise slopes (x_j - x_i) / (j - i).
 * Returns null when fewer than 2 valid observations.
 *
 * `values` must be valid observations in chronological order.
 * `indices` are their positions in the original series (used as x-coordinates;
 * if omitted, 0, 1, 2, … is used).
 */
export interface SensSlopeResult {
  slope: number | null;
  nPairs: number;
  nObservations: number;
  slopes: number[];
}

export function sensSlope(
  values: number[],
  options: { indices?: number[] } = {}
): SensSlopeResult {
  const n = values.length;
  if (n < 2) return { slope: null, nPairs: 0, nObservations: n, slopes: [] };

  const indices = options.indices || values.map((_, i) => i);
  const slopes: number[] = [];

  for (let i = 0; i < n - 1; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const dx = indices[j] - indices[i];
      if (dx === 0) continue;
      slopes.push((values[j] - values[i]) / dx);
    }
  }

  slopes.sort((a, b) => a - b);
  const mid = Math.floor(slopes.length / 2);
  const median = slopes.length % 2 === 1
    ? slopes[mid]
    : (slopes[mid - 1] + slopes[mid]) / 2;

  return { slope: median, nPairs: slopes.length, nObservations: n, slopes };
}

/**
 * Confidence interval for Sen's slope (Hirsch et al. 1982).
 *
 * @param slopes - sorted pairwise slopes (from sensSlope)
 * @param n - number of observations
 * @param alpha - significance level (default 0.05)
 */
export interface SensSlopeCi {
  lower: number;
  upper: number;
  alpha: number;
  nPairs: number;
  ranks: { lower: number; upper: number };
  zAlpha: number;
}

export function sensSlopeConfidenceInterval(
  slopes: number[],
  n: number,
  options: { alpha?: number } = {}
): SensSlopeCi | null {
  const alpha = options.alpha ?? DEFAULT_ALPHA;
  const nPairs = slopes.length;
  if (nPairs === 0) return null;

  const varianceS = (n * (n - 1) * (2 * n + 5)) / 18;
  const zAlpha = normalQuantile(1 - alpha / 2);
  const c = zAlpha * Math.sqrt(varianceS);

  const m1 = Math.floor((nPairs - c) / 2) + 1;
  const m2 = Math.ceil((nPairs + c) / 2);

  const lowerRank = Math.max(1, Math.min(m1, nPairs));
  const upperRank = Math.max(1, Math.min(m2, nPairs));

  return {
    lower: slopes[lowerRank - 1],
    upper: slopes[upperRank - 1],
    alpha,
    nPairs,
    ranks: { lower: lowerRank, upper: upperRank },
    zAlpha
  };
}

/* ------------------------------------------------------------------ */
/* Combined trend + slope result                                      */
/* ------------------------------------------------------------------ */

export interface TrendAnalysisResult extends MannKendallResult {
  senSlope: SensSlopeResult;
  senSlopeCi: SensSlopeCi | null;
  senSlopePerYear: number | null;
  senSlopeCiPerYear: { lower: number; upper: number } | null;
  observationsPerYear: number;
}

/**
 * Complete trend analysis: Mann-Kendall test + Sen's slope + CI +
 * Hamed-Rao autocorrelation correction.
 *
 * `values` must be valid observations in chronological order.
 * `missing` is the missing-data report for the original series.
 * `observationsPerYear` is 12 for monthly data, 1 for annual.
 */
export function analyzeTrend(
  values: number[],
  missing: MissingDataReport,
  options: {
    alpha?: number;
    parameterCode?: string;
    observationsPerYear?: number;
    indices?: number[];
  } = {}
): TrendAnalysisResult {
  const alpha = options.alpha ?? DEFAULT_ALPHA;
  const observationsPerYear = options.observationsPerYear ?? 1;

  const mk = mannKendallTest(values, missing, { alpha, parameterCode: options.parameterCode });
  const sen = sensSlope(values, { indices: options.indices });
  const ci =
    sen.slope !== null
      ? sensSlopeConfidenceInterval(sen.slopes, values.length, { alpha })
      : null;

  const senSlopePerYear =
    sen.slope !== null ? sen.slope * observationsPerYear : null;
  const senSlopeCiPerYear =
    ci !== null
      ? { lower: ci.lower * observationsPerYear, upper: ci.upper * observationsPerYear }
      : null;

  return {
    ...mk,
    senSlope: sen,
    senSlopeCi: ci,
    senSlopePerYear,
    senSlopeCiPerYear,
    observationsPerYear
  };
}

/* ------------------------------------------------------------------ */
/* Multiple-comparison correction                                     */
/* ------------------------------------------------------------------ */

/**
 * Bonferroni correction: adjusted alpha = alpha / m.
 */
export interface BonferroniResult {
  m: number;
  alpha: number;
  adjustedAlpha: number;
  significant: boolean[];
  adjustedPValues: number[];
}

export function bonferroniCorrection(
  pValues: number[],
  options: { alpha?: number } = {}
): BonferroniResult {
  const alpha = options.alpha ?? DEFAULT_ALPHA;
  const m = pValues.length;
  const adjustedAlpha = alpha / m;
  const significant = pValues.map((p) => p < adjustedAlpha);
  const adjustedPValues = pValues.map((p) => Math.min(1, p * m));
  return { m, alpha, adjustedAlpha, significant, adjustedPValues };
}

/**
 * Benjamini-Hochberg FDR correction.
 */
export interface BHResult {
  m: number;
  alpha: number;
  significant: boolean[];
  adjustedPValues: number[];
  thresholdRank: number;
}

export function benjaminiHochbergCorrection(
  pValues: number[],
  options: { alpha?: number } = {}
): BHResult {
  const alpha = options.alpha ?? DEFAULT_ALPHA;
  const m = pValues.length;
  if (m === 0) return { m, alpha, significant: [], adjustedPValues: [], thresholdRank: 0 };

  const indexed = pValues.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);

  const adjusted = new Array<number>(m);
  let significant = new Array<boolean>(m).fill(false);
  let thresholdRank = 0;

  let minSoFar = 1;
  for (let rank = m; rank >= 1; rank -= 1) {
    const { p, i } = indexed[rank - 1];
    const adj = Math.min(1, (m * p) / rank);
    minSoFar = Math.min(minSoFar, adj);
    adjusted[i] = minSoFar;
    if (p <= (rank * alpha) / m) thresholdRank = rank;
  }

  for (let i = 0; i < m; i += 1) significant[i] = adjusted[i] < alpha;

  return { m, alpha, significant, adjustedPValues: adjusted, thresholdRank };
}

/* ------------------------------------------------------------------ */
/* Precipitation: mm/day rate -> monthly total                        */
/* ------------------------------------------------------------------ */

/**
 * Convert a PRECTOTCORR precipitation rate (mm/day) to a monthly total (mm)
 * by multiplying by the number of days in that calendar month.
 *
 * PRECTOTCORR is a *rate* (bias-corrected precipitation flux, mm/day).
 * A monthly total is NOT the sum of monthly rates — that is dimensionally
 * wrong. It is the mean daily rate for the month × days in the month.
 *
 * Returns null when the rate is missing.
 */
export function precipMonthlyTotal(
  rateMmPerDay: number | null,
  year: number,
  month: number
): number | null {
  if (rateMmPerDay === null || rateMmPerDay === undefined || !Number.isFinite(rateMmPerDay)) {
    return null;
  }
  const days = new Date(year, month, 0).getDate();
  return Number((rateMmPerDay * days).toFixed(3));
}

/**
 * Convert an array of monthly PRECTOTCORR rates (mm/day) to monthly totals (mm).
 * `rows` must be ordered chronologically; each row has `year`, `month`, and a
 * value under `code`. Missing rates map to null totals.
 */
export interface PrecipTotalRow {
  date: string;
  year: number;
  month: number;
  rateMmPerDay: number | null;
  totalMm: number | null;
}

export function precipMonthlyTotals(
  rows: Array<{ date: string; year: number; month: number; values: Record<string, number | null> }>,
  code: string
): PrecipTotalRow[] {
  return rows.map((row) => {
    const rate = row.values[code];
    const total = precipMonthlyTotal(rate, row.year, row.month);
    return { date: row.date, year: row.year, month: row.month, rateMmPerDay: rate, totalMm: total };
  });
}
