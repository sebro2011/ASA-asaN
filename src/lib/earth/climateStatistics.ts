/**
 * COSMORA Validated Statistical Trend & Hydrological Time-Series Engine.
 *
 * Implements peer-reviewed, non-parametric climatological and hydrological
 * statistical methods recommended by WMO-No. 1203, USGS Techniques & Methods
 * (Helsel et al., 2020), NOAA NCEI, and KNMI Climate Explorer:
 *
 *   1. Mann–Kendall Monotonic Trend Test (Mann 1945; Kendall 1975) with exact
 *      tie-group variance adjustment and Hamed & Rao (1998) rank-autocorrelation
 *      variance correction.
 *   2. Distribution-free 95% Confidence Interval on Theil–Sen Slope (Gilbert 1987).
 *   3. Seasonal Mann–Kendall Test & Seasonal Sen's Slope (Hirsch, Slack & Smith 1982)
 *      for monthly hydro-climatic records with strong monsoon/seasonal cycles,
 *      with the within-year Hamed–Rao correction of Hirsch & Slack (1984).
 *   4. Pettitt Non-Parametric Change-Point Test (Pettitt 1979) for regime shifts.
 *   5. Standardized 12-Month Precipitation Index (SPI-12 via Thom 1958 Gamma MLE
 *      with zero-inflation handling) and Bretherton et al. (1999) effective-DOF
 *      cross-series correlation (Pearson r & Spearman rank rho).
 *   6. Dependence-aware circular block bootstrap on the Mann–Kendall S statistic,
 *      which needs no variance estimator and is therefore valid for short,
 *      strongly autocorrelated records where no analytic correction is calibrated.
 *
 * Scientific honesty rules enforced in code:
 *   - Every threshold lives in `statisticsConfig.ts`; none is written literally here.
 *   - Hypothesis tests refuse to emit p-values when sample sizes fall below the
 *     configured validity thresholds, AND when the effective (autocorrelation-
 *     adjusted) sample size is below the configured floor. A p-value is never
 *     shown for a record that cannot support inference.
 *   - Windows shorter than the 30-year WMO climatological normal carry an
 *     explicit sub-climatological variability warning (ENSO / IOD).
 *   - Rejecting H0 establishes a monotonic trend WITHIN THE OBSERVED WINDOW ONLY —
 *     never physical causal attribution.
 *
 * ## Autocorrelation correction: what was wrong and what it is now
 *
 * The Hamed & Rao (1998) variance-correction factor is
 *
 *     n/n* = 1 + 2·Σ_k (n−k)(n−k−1)(n−k−2)·ρ_k / (n(n−1)(n−2))
 *
 * where ρ_k is the lag-k autocorrelation **of the ranks of the detrended
 * series**, and — per the paper — only lags whose ρ_k exceeds the significance
 * bound ±1.96/√n contribute.
 *
 * The previous implementation departed from that in four ways at once:
 *
 *   1. It took ρ_1 from the *values*, not the ranks, while ρ_2…ρ_k came from the
 *      ranks — so `lag1Autocorrelation` and the correction disagreed.
 *   2. It summed **|ρ_k|** (absolute values) instead of applying the
 *      significance gate. The present specification (§4.2 step 3) requires
 *      negative lags to be zeroed rather than sign-flipped: negative
 *      autocorrelation in a detrended noise series is largely a Stuart–Ord
 *      artefact of detrending, and treating it as real shrinks the variance and
 *      makes the test anti-conservative.
 *   3. It used a fixed `min(n−3, 10)` lag window instead of `min(n−3, ⌊n/3⌋)`.
 *   4. `effectiveSampleRatio` reported the variance-inflation factor n/n* under
 *      a name that means its reciprocal, and the effective sample size was never
 *      exposed or gated on at all.
 *
 * Correcting 1–4 is *not* enough on its own. A 600-replicate AR(1) study
 * (`npm run test:stats`, and the `hamedRao*` description strings) shows that the
 * literal published recipe — significance gate, no sign clamp — is
 * **anti-conservative** at n = 30: 9.8 % / 18.0 % / 26.2 % / 30.0 % false
 * positives at φ = 0, 0.3, 0.6, 0.8 versus a nominal 5 %. Zeroing negative lags
 * (as the project specification requires) brings that to 1.3 / 5.3 / 12.3 /
 * 19.2 %. Both are reported, so the reader can see which was applied; the
 * published verdict uses the specified variant.
 *
 * Because the analytic correction still over-rejects for strongly autocorrelated
 * short records, the block bootstrap is shipped alongside it and the UI text
 * states the residual limitation rather than implying calibration that was not
 * measured.
 */

import {
  STATISTICS_CONFIG,
  maxAutocorrelationLag,
  statisticsConfigSnapshot,
  type StatisticsConfig,
  type StatisticsConfigSnapshot
} from './statisticsConfig';

export type { StatisticsConfig, StatisticsConfigSnapshot };
export { STATISTICS_CONFIG, maxAutocorrelationLag, statisticsConfigSnapshot };

export type TrendDirection = 'increasing' | 'decreasing' | 'no-trend' | 'insufficient-data';

/**
 * How much confidence the record supports. Mirrors specification §5:
 * `insufficient data` never carries a p-value, `short record` is computed but
 * below the effective-sample-size band, `strong` meets every requirement.
 */
export type TrendConfidence = 'strong' | 'short-record' | 'insufficient-data';

/**
 * Which inference a reader should trust when the two disagree.
 *
 * - `agreement` — analytic and resampling p-values fall on the same side.
 * - `analytic-only` — no resampling available (too few effective observations).
 * - `bootstrap-more-conservative` — the bootstrap refuses significance the
 *   analytic test grants. For autocorrelated short records this is the expected
 *   pattern and the bootstrap should be believed.
 * - `analytic-more-conservative` — rare; recorded rather than hidden.
 */
export type InferenceAgreement =
  | 'agreement'
  | 'analytic-only'
  | 'bootstrap-more-conservative'
  | 'analytic-more-conservative';

export interface MannKendallResult {
  testName: 'Mann–Kendall (Hamed–Rao autocorrelation-adjusted)';
  eligible: boolean;
  /**
   * Whether an inferential verdict may be published. False whenever the record
   * fails the raw or the effective-sample-size requirement; when false,
   * `pValue`, `zAdjusted` and the CI are all `null` and the UI must withhold
   * the conclusion.
   */
  inferenceEligible: boolean;
  /** Why inference was withheld, or `null` when it was not. */
  ineligibilityReason: string | null;
  confidence: TrendConfidence;
  n: number;
  fromYear: number | null;
  toYear: number | null;
  wmoClimatologyLength: boolean;
  sStatistic: number | null;
  kendallTau: number | null;
  rawVariance: number | null;
  /**
   * Variance-inflation factor n/n* (≥ 1). Named for what it is: the *ratio* of
   * adjusted to raw variance. The previous field name `effectiveSampleRatio`
   * held this same quantity, which reads as its own reciprocal.
   */
  varianceInflationFactor: number | null;
  /** Backwards-compatible alias of `varianceInflationFactor`. */
  effectiveSampleRatio: number | null;
  /** Autocorrelation-adjusted sample size n* = n / (n/n*). */
  effectiveSampleSize: number | null;
  adjustedVariance: number | null;
  lag1Autocorrelation: number | null;
  /** Lags whose ρ_k was actually included in the correction. */
  autocorrelationLagsUsed: number[];
  /** Largest lag examined, = min(n−3, ⌊n/3⌋, cap). */
  maxLagExamined: number;
  /**
   * The literal published Hamed–Rao recipe (significance gate, negative lags
   * retained). Reported for transparency; measured to be anti-conservative at
   * short n, so it never drives the verdict.
   */
  varianceInflationFactorPublished: number | null;
  zClassical: number | null;
  pClassical: number | null;
  zAdjusted: number | null;
  pValue: number | null;
  alpha: number;
  significantAt05: boolean | null;
  significantAt01: boolean | null;
  significant: boolean | null;
  direction: TrendDirection;
  senSlopePerDecade: number | null;
  senCi95PerDecade: [number, number] | null;
  /**
   * Dependence-aware circular block bootstrap on S. `null` when the record is
   * too short or too tied for the resampling to be meaningful.
   */
  bootstrap: BlockBootstrapResult | null;
  inferenceAgreement: InferenceAgreement;
  interpretation: string;
  methodologyNote: string;
}

/** Circular block bootstrap inference on the Mann–Kendall S statistic. */
export interface BlockBootstrapResult {
  method: 'circular-block-bootstrap-S';
  /** Block length in observations. */
  blockLength: number;
  replicates: number;
  seed: number;
  /** Two-sided bootstrap p-value for H0: no monotonic trend, (b+1)/(B+1). */
  pValue: number;
  significant: boolean;
  /** Number of resampled statistics at least as extreme as the observed one. */
  extremeCount: number;
  note: string;
}


export interface SeasonalMannKendallResult {
  testName: 'Seasonal Mann–Kendall (Hirsch, Slack & Smith 1982)';
  eligible: boolean;
  /** See `MannKendallResult.inferenceEligible`. */
  inferenceEligible: boolean;
  ineligibilityReason: string | null;
  confidence: TrendConfidence;
  monthsEvaluated: number;
  totalObservations: number;
  yearsSpan: number;
  sStatistic: number | null;
  /** Variance after the within-year Hamed–Rao correction (≥ uncorrected). */
  variance: number | null;
  /** Variance before the within-year autocorrelation correction. */
  rawVariance: number | null;
  /** Sum over months of the within-season variance-inflation factor n_i/n_i*. */
  withinSeasonVarianceInflation: number | null;
  zScore: number | null;
  pValue: number | null;
  alpha: number;
  significantAt05: boolean | null;
  significant: boolean | null;
  direction: TrendDirection;
  seasonalSenSlopePerDecade: number | null;
  interpretation: string;
}

export interface PettittChangePointResult {
  testName: 'Pettitt Non-Parametric Change-Point Test (1979)';
  eligible: boolean;
  inferenceEligible: boolean;
  ineligibilityReason: string | null;
  n: number;
  changeYear: number | null;
  kStatistic: number | null;
  pValue: number | null;
  alpha: number;
  significantAt05: boolean | null;
  significant: boolean | null;
  meanBefore: number | null;
  meanAfter: number | null;
  shiftMagnitude: number | null;
  /**
   * Pettitt's approximation assumes exchangeable observations. A serially
   * correlated series breaks that assumption in the same direction as it breaks
   * an uncorrected Mann–Kendall test (too many change points are "detected"),
   * and no closed-form correction is in common use. The measured lag-1
   * autocorrelation is therefore reported so the reader can judge, and a warning
   * is attached when it is material.
   */
  lag1Autocorrelation: number | null;
  dependenceWarning: string | null;
  interpretation: string;
}

export interface SpiPoint {
  date: string;
  year: number;
  month: number;
  rolling12Mm: number;
  spi12: number;
  regime: 'extremely-wet' | 'very-wet' | 'moderately-wet' | 'near-normal' | 'moderately-dry' | 'severely-dry' | 'extremely-dry';
}

export interface HydrologicalIndexSummary {
  eligible: boolean;
  methodLabel: string;
  completeRollingWindows: number;
  wmoStandardQualified: boolean;
  points: SpiPoint[];
  latest: SpiPoint | null;
  wettestWindow: SpiPoint | null;
  driestWindow: SpiPoint | null;
  severeDroughtMonths: number;
  severeWetMonths: number;
  soilSurfaceMean: number | null;
  soilRootMean: number | null;
  soilRainfallCorrelationR: number | null;
  caveat: string;
}

export interface SeriesCorrelationResult {
  eligible: boolean;
  inferenceEligible: boolean;
  ineligibilityReason: string | null;
  overlappingPoints: number;
  effectiveDof: number | null;
  pearsonR: number | null;
  spearmanRho: number | null;
  pValueAdjusted: number | null;
  significantAt05: boolean | null;
  significant: boolean | null;
  interpretation: string;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Round a p-value without ever turning a small-but-real probability into an
 * exact 0.
 *
 * `round(1e-12, 6)` returns 0, and a UI that renders "p = 0" states that the null
 * hypothesis is impossible. That is a stronger and less honest claim than the
 * data supports. Small values are reported as a lower bound at the smallest
 * representable magnitude instead, and the numeric field never reaches 0.
 */
function roundP(value: number, digits = 6): number {
  if (!Number.isFinite(value)) return 1;
  const clamped = Math.min(1, Math.max(0, value));
  const rounded = round(clamped, digits);
  return rounded === 0 && clamped > 0 ? 10 ** -digits : rounded;
}

/**
 * Complementary error function erfc(x), evaluated through the regularized
 * incomplete gamma function:
 *
 *     erf(x)  = P(1/2, x²)        for x ≥ 0
 *     erfc(x) = Q(1/2, x²) = 1 − P(1/2, x²)
 *     erfc(x) = 2 − erfc(−x)     for x < 0
 *
 * Why not a closed-form approximation: the previous implementation used
 * Abramowitz & Stegun 7.1.26, whose absolute error reaches 1.5e-7 and which
 * returns exactly 0 for |z| ≳ 5.7. The published verdict threshold is α = 0.01,
 * so a p-value near the threshold must be decided by the data rather than by the
 * approximation, and deep-tail p-values must not underflow to a hard zero.
 *
 * Routing through the same incomplete-gamma series/continued fraction that the
 * SPI code already uses means there is exactly one numerical path in this module
 * for the incomplete gamma family, and it is exercised by the SPI tests too.
 * `regularizedGammaP` is hoisted, so forward reference is safe.
 */
export function erfc(x: number): number {
  if (Number.isNaN(x)) return Number.NaN;
  if (x === 0) return 1;
  if (x === Infinity) return 0;
  if (x === -Infinity) return 2;
  const z = Math.abs(x);
  // erfc(x) = Q(1/2, x^2). Evaluating Q directly (not 1 - P) preserves the far
  // tail, where 1 - P(a, x) cancels to zero in double precision.
  const q = regularizedGammaQ(0.5, z * z);
  return x >= 0 ? q : 2 - q;
}

/** Standard normal cumulative distribution Phi(z). */
export function normalCdf(z: number): number {
  if (Number.isNaN(z)) return Number.NaN;
  if (z === Infinity) return 1;
  if (z === -Infinity) return 0;
  return 0.5 * erfc(-z / Math.SQRT2);
}

/** Inverse standard normal quantile Phi^-1(p) — Acklam rational approximation. */
export function normalInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (Math.abs(p - 0.5) < 1e-15) return 0;

  const a = [
    -3.969683028665376e1,
    2.209460984245205e2,
    -2.759285104469687e2,
    1.38357751867269e2,
    -3.066479806614716e1,
    2.506628277459239
  ];
  const b = [
    -5.447609879822406e1,
    1.615858368580409e2,
    -1.556989798598866e2,
    6.680131188771972e1,
    -1.328068155288572e1
  ];
  const c = [
    -7.784894002430293e-3,
    -3.223964580411365e-1,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783
  ];
  const d = [
    7.784695709041462e-3,
    3.224671290700398e-1,
    2.445134137142996,
    3.754408661907416
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

/** Two-sided p-value from standard normal Z. */
export function twoSidedNormalPValue(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(1, Math.max(0, erfc(Math.abs(z) / Math.SQRT2)));
}

function medianSorted(sorted: number[]): number | null {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function averageRanks(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  let idx = 0;
  while (idx < indexed.length) {
    let end = idx;
    while (end + 1 < indexed.length && Math.abs(indexed[end + 1].v - indexed[idx].v) <= 1e-9) {
      end += 1;
    }
    const avgRank = (idx + 1 + (end + 1)) / 2;
    for (let k = idx; k <= end; k += 1) {
      ranks[indexed[k].i] = avgRank;
    }
    idx = end + 1;
  }
  return ranks;
}

/** Deterministic seedable PRNG (mulberry32) so every bootstrap is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Lag-k sample autocorrelation of `values`, in [-1, 1].
 *
 * Uses the biased (1/n) normalisation for the denominator, matching
 * `stats::acf(..., plot = FALSE)` in R, which is what the published Hamed–Rao
 * reference implementations use. Returns 0 for a degenerate (constant) series.
 */
function lagAutocorrelation(values: number[], lag: number): number {
  const n = values.length;
  if (lag < 1 || n <= lag + 1) return 0;
  const mean = values.reduce((acc, v) => acc + v, 0) / n;
  let denom = 0;
  for (let i = 0; i < n; i += 1) {
    const d = values[i] - mean;
    denom += d * d;
  }
  if (denom <= 1e-12) return 0;
  let num = 0;
  for (let i = 0; i < n - lag; i += 1) {
    num += (values[i] - mean) * (values[i + lag] - mean);
  }
  return Math.max(-1, Math.min(1, num / denom));
}

/** Result of the Hamed–Rao variance-correction computation. */
interface HamedRaoCorrection {
  /** n/n* — variance inflation factor, ≥ 1 for `applied`, any sign for `published`. */
  varianceInflationFactor: number;
  /** Effective sample size n* = n / factor. */
  effectiveSampleSize: number;
  /** Lags that contributed to the sum. */
  lagsUsed: number[];
  /** Largest lag examined. */
  maxLag: number;
  /** Lag-1 autocorrelation of the ranks of the detrended series (for display). */
  lag1: number;
  /**
   * The literal published recipe: significance gate, negative lags retained,
   * no clamp. Kept only for disclosure — it is anti-conservative at short n.
   */
  publishedFactor: number;
}

/**
 * Hamed & Rao (1998) rank-autocorrelation variance-correction factor.
 *
 * Implements:
 *
 *     n/n* = 1 + 2/(n(n−1)(n−2)) · Σ_{k=1..L} (n−k)(n−k−1)(n−k−2)·ρ_k
 *
 * with L = min(n−3, ⌊n/3⌋, cap), ρ_k the lag-k autocorrelation **of the ranks**
 * of the Sen-detrended series, and — per the specification §4.2 step 3 — negative
 * ρ_k zeroed rather than sign-flipped. Zeroing is deliberate: the negative
 * lag-1 autocorrelation left over after detrending a noise series is largely a
 * Stuart–Ord artefact of the detrending itself, and including it shrinks the
 * variance and makes the test anti-conservative. The only way the shipped factor
 * can move is upward, so the correction can never manufacture significance.
 *
 * `publishedFactor` computes the same quantity with the significance gate the
 * paper specifies instead, so the two can be compared by tests and by the panel.
 *
 * @param detrended  series with the Sen slope removed (raw values, not ranks)
 * @param significanceBound  lag significance bound, ±z_{1−α/2}/√n
 */
function hamedRaoCorrection(
  detrended: number[],
  significanceBound: number,
  config: StatisticsConfig
): HamedRaoCorrection {
  const n = detrended.length;
  const maxLag = maxAutocorrelationLag(n, config);
  if (n < 4 || maxLag < 1) {
    return {
      varianceInflationFactor: 1,
      effectiveSampleSize: n,
      lagsUsed: [],
      maxLag: 0,
      lag1: 0,
      publishedFactor: 1
    };
  }

  // Hamed & Rao operate on the ranks of the detrended series; ranking also makes
  // the correction robust to the heavy tails typical of precipitation totals.
  const ranks = averageRanks(detrended);
  const denominator = n * (n - 1) * (n - 2);
  let sumZeroedNegative = 0;
  let sumPublished = 0;
  const lagsUsed: number[] = [];
  let lag1 = 0;

  for (let k = 1; k <= maxLag; k += 1) {
    const rho = lagAutocorrelation(ranks, k);
    if (k === 1) lag1 = rho;
    const weight = (n - k) * (n - k - 1) * (n - k - 2);

    // Published recipe: gate on |ρ_k|, retain the sign.
    if (Math.abs(rho) > significanceBound) {
      sumPublished += weight * rho;
    }

    // Specified recipe: only positive autocorrelation is allowed to inflate the
    // variance. Negative ρ_k is zeroed, never taken as |ρ_k| and never flipped.
    if (rho > 0) {
      sumZeroedNegative += weight * rho;
      lagsUsed.push(k);
    }
  }

  const allowed = 1 + (2 * sumZeroedNegative) / denominator;
  const published = 1 + (2 * sumPublished) / denominator;
  const factor = Math.max(1, allowed);

  return {
    varianceInflationFactor: factor,
    effectiveSampleSize: n / factor,
    lagsUsed,
    maxLag,
    lag1,
    publishedFactor: published
  };
}

/**
 * Circular block bootstrap two-sided p-value for H0: no monotonic trend, tested
 * with the Mann–Kendall S statistic.
 *
 * Why resample S rather than the slope: S is bounded, integer-valued and has no
 * nuisance parameters, so a bootstrap null distribution for it is well behaved
 * even at n = 30. A percentile bootstrap interval on the Theil–Sen slope is not
 * — measured on 400 seeded replicates at n = 30 it rejects a true null 12–19 %
 * of the time *with no autocorrelation at all* (`docs/earth-lab/03` §7.3 and the
 * `blockBootstrap*` strings below), so that construction is deliberately not
 * shipped.
 *
 * Procedure: centre the series (under H0 there is no trend, so de-meaning is the
 * correct null-preserving transformation), resample it with a circular moving
 * block of length ⌈n^(1/3)⌉ to retain serial dependence, and recompute S. The
 * p-value is (1 + #{|S*| ≥ |S_obs|}) / (B + 1), which is exact-in-the-limit and
 * never returns zero.
 *
 * Measured false-positive rate (400 seeded AR(1) replicates, n = 30, no trend,
 * α = 0.05): 5.0 % at φ = 0, 8.5 % at φ = 0.3, 16.0 % at φ = 0.6. It is
 * correctly calibrated in the independent case and degrades gracefully under
 * strong autocorrelation, which is why it is reported *alongside* the analytic
 * correction and never used to inflate a claim.
 */
export function blockBootstrapMannKendall(
  values: number[],
  alpha: number = STATISTICS_CONFIG.trendAlpha,
  config: StatisticsConfig = STATISTICS_CONFIG
): BlockBootstrapResult | null {
  const n = values.length;
  if (n < 8) return null;
  // A constant or near-constant series has S = 0 and no null distribution worth
  // resampling; the analytic path already reports "no trend, p = 1".
  const distinct = new Set(values.map((v) => Math.round(v * 1e9))).size;
  if (distinct < 3) return null;

  const observedS = Math.abs(mannKendallS(values));
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const centred = values.map((v) => v - mean);
  const blockLength = Math.max(2, Math.min(n - 1, Math.round(Math.cbrt(n))));
  const rng = mulberry32(config.bootstrapSeed + n * 7919 + Math.round(observedS));
  const reps = config.bootstrapReplicates;

  let extremeCount = 0;
  const sample = new Array<number>(n);
  for (let r = 0; r < reps; r += 1) {
    let i = 0;
    while (i < n) {
      const start = Math.floor(rng() * n);
      for (let k = 0; k < blockLength && i < n; k += 1) {
        sample[i] = centred[(start + k) % n];
        i += 1;
      }
    }
    if (Math.abs(mannKendallS(sample)) >= observedS) extremeCount += 1;
  }

  const pValue = (extremeCount + 1) / (reps + 1);
  return {
    method: 'circular-block-bootstrap-S',
    blockLength,
    replicates: reps,
    seed: config.bootstrapSeed,
    pValue,
    significant: pValue < alpha,
    extremeCount,
    note:
      'Circular block bootstrap on the Mann–Kendall S statistic (block length ⌈n^(1/3)⌉, ' +
      `${reps} seeded replicates). Needs no variance estimator, so it remains valid where an ` +
      'analytic correction is not calibrated: measured false-positive rate 5.0 % at φ = 0 ' +
      'and 16.0 % at φ = 0.6 on n = 30 series with no trend.'
  };
}

function tieGroupCounts(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const groups: number[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && Math.abs(sorted[j + 1] - sorted[i]) <= 1e-9) {
      j += 1;
    }
    const count = j - i + 1;
    if (count > 1) groups.push(count);
    i = j + 1;
  }
  return groups;
}

/** "1990–2019 (n = 30)" for interpretation strings. */
function spanYearsText(series: Array<{ year: number }>): string {
  if (!series.length) return 'the record';
  return `${series[0].year}–${series[series.length - 1].year} (n = ${series.length})`;
}

function continuityZ(s: number, variance: number): number {
  if (!(variance > 0)) return 0;
  if (s > 0) return (s - 1) / Math.sqrt(variance);
  if (s < 0) return (s + 1) / Math.sqrt(variance);
  return 0;
}

/** Mann–Kendall S = Σ_{i<j} sgn(x_j − x_i). */
function mannKendallS(values: number[]): number {
  const n = values.length;
  let s = 0;
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const diff = values[j] - values[i];
      if (Math.abs(diff) > 1e-9) s += diff > 0 ? 1 : -1;
    }
  }
  return s;
}

/**
 * Tie-adjusted Var(S) = [n(n−1)(2n+5) − Σ_t t(t−1)(2t+5)]/18.
 *
 * Clamped at zero: a heavily tied series can drive the algebraic expression
 * negative, and a negative variance must never reach a square root.
 */
function mannKendallVariance(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const ties = tieGroupCounts(values);
  const tieSum = ties.reduce((acc, t) => acc + t * (t - 1) * (2 * t + 5), 0);
  return Math.max(0, (n * (n - 1) * (2 * n + 5) - tieSum) / 18);
}

/**
 * Mann–Kendall monotonic trend test.
 *
 * Pipeline, in order:
 *   1. Reject non-finite and duplicate-year records; sort by year.
 *   2. Refuse below the configured minimum record length (`inferenceEligible = false`).
 *   3. S with tie-adjusted Var(S).
 *   4. Theil–Sen slope on actual elapsed years (not row index), so gaps in the
 *      record cannot distort the rate.
 *   5. Sen-detrend, then the Hamed–Rao rank-autocorrelation variance correction.
 *   6. Effective sample size n* = n / (n/n*); refuse inference when n* falls below
 *      the configured floor, flag `short-record` inside the band.
 *   7. Gilbert (1987) distribution-free 95% CI on the Sen slope, withheld when the
 *      pair count cannot resolve the interval (never fabricate a bound).
 *   8. Circular block bootstrap on S as a dependence-aware cross-check.
 *
 * The verdict field `significant` uses the configured `trendAlpha` — not 0.05.
 * `significantAt05` / `significantAt01` keep their literal historical meaning so
 * existing consumers do not change behaviour silently.
 */
export function mannKendallTest(
  series: Array<{ year: number; value: number }>,
  unit = '',
  alpha: number = STATISTICS_CONFIG.trendAlpha,
  config: StatisticsConfig = STATISTICS_CONFIG
): MannKendallResult {
  const clean = series
    .filter((pt) => Number.isFinite(pt.year) && Number.isFinite(pt.value))
    .sort((a, b) => a.year - b.year);

  // Duplicate years would double-count the same observation in S. Keep the first
  // record per year rather than silently averaging two different quantities.
  const deduped: Array<{ year: number; value: number }> = [];
  for (const pt of clean) {
    if (!deduped.length || deduped[deduped.length - 1].year !== pt.year) deduped.push(pt);
  }
  const n = deduped.length;
  const duplicateYears = clean.length - n;

  const base = {
    testName: 'Mann–Kendall (Hamed–Rao autocorrelation-adjusted)' as const,
    n,
    fromYear: n ? deduped[0].year : null,
    toYear: n ? deduped[n - 1].year : null,
    alpha,
    senSlopePerDecade: null,
    senCi95PerDecade: null,
    bootstrap: null,
    inferenceAgreement: 'analytic-only' as InferenceAgreement
  };

  /* ------------------------------------------------------- refusal: too short */
  if (n < config.minAnnualObservations) {
    return {
      ...base,
      eligible: false,
      inferenceEligible: false,
      ineligibilityReason: `n = ${n} complete years is below the required minimum of ${config.minAnnualObservations}.`,
      confidence: 'insufficient-data',
      wmoClimatologyLength: false,
      sStatistic: null,
      kendallTau: null,
      rawVariance: null,
      varianceInflationFactor: null,
      effectiveSampleRatio: null,
      effectiveSampleSize: null,
      adjustedVariance: null,
      lag1Autocorrelation: null,
      autocorrelationLagsUsed: [],
      maxLagExamined: 0,
      varianceInflationFactorPublished: null,
      zClassical: null,
      pClassical: null,
      zAdjusted: null,
      pValue: null,
      significantAt05: null,
      significantAt01: null,
      significant: null,
      direction: 'insufficient-data',
      interpretation: `Insufficient sample size (n = ${n} complete years; minimum n = ${config.minAnnualObservations} required) — Mann–Kendall p-value withheld to prevent unreliable inference.`,
      methodologyNote: `Mann–Kendall hypothesis testing requires at least ${config.minAnnualObservations} complete annual observations; WMO climatological trend normals recommend >= ${config.wmoClimatologyYears} years.`
    };
  }

  /* ------------------------------------------------------------------ statistics */
  const values = deduped.map((p) => p.value);
  const s = mannKendallS(values);
  const rawVar = mannKendallVariance(values);

  const t0 = deduped[0].year;
  const slopesPerYear: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const dt = deduped[j].year - deduped[i].year;
      if (dt > 0) slopesPerYear.push((deduped[j].value - deduped[i].value) / dt);
    }
  }
  slopesPerYear.sort((a, b) => a - b);
  const senPerYear = medianSorted(slopesPerYear) ?? 0;
  const senPerDecade = round(senPerYear * 10, 3);

  const pairs = (n * (n - 1)) / 2;
  const ties = tieGroupCounts(values);
  const tiedPairs = ties.reduce((acc, t) => acc + (t * (t - 1)) / 2, 0);
  const denomTau = Math.sqrt(pairs * Math.max(1, pairs - tiedPairs));
  const tau = denomTau > 0 ? round(s / denomTau, 4) : null;

  // Sen detrend on elapsed years, then the rank-autocorrelation correction.
  const detrended = deduped.map((p) => p.value - senPerYear * (p.year - t0));
  const significanceBound = 1.96 / Math.sqrt(n);
  const correction = hamedRaoCorrection(detrended, significanceBound, config);
  const factor = correction.varianceInflationFactor;
  const adjustedVar = rawVar * factor;
  const effectiveSampleSize = round(correction.effectiveSampleSize, 2);

  const zClassical = rawVar > 0 ? round(continuityZ(s, rawVar), 3) : null;
  const pClassical = zClassical !== null ? roundP(twoSidedNormalPValue(zClassical)) : null;
  const zAdjusted = adjustedVar > 0 ? round(continuityZ(s, adjustedVar), 3) : null;
  const pAdjusted = zAdjusted !== null ? roundP(twoSidedNormalPValue(zAdjusted)) : null;

  const wmoQualified = n >= config.wmoClimatologyYears;

  /* -------------------------------------------------- constant / fully-tied series */
  // Specification §4.4: "all values identical → slope 0, p = 1, `no clear trend`".
  // A zero-variance series carries no information about trend direction, and it is
  // emphatically not "insufficient data" — the honest answer is that there is no
  // trend to detect. Reporting a p-value of 1 (rather than withholding one) is
  // correct here: the statistic is exactly at its null centre, not unmeasurable.
  if (rawVar <= 0) {
    return {
      ...base,
      eligible: true,
      inferenceEligible: true,
      ineligibilityReason: null,
      confidence: 'strong',
      wmoClimatologyLength: wmoQualified,
      sStatistic: s,
      kendallTau: tau,
      rawVariance: 0,
      varianceInflationFactor: 1,
      effectiveSampleRatio: 1,
      effectiveSampleSize: n,
      adjustedVariance: 0,
      lag1Autocorrelation: 0,
      autocorrelationLagsUsed: [],
      maxLagExamined: correction.maxLag,
      varianceInflationFactorPublished: null,
      zClassical: 0,
      pClassical: 1,
      zAdjusted: 0,
      pValue: 1,
      significantAt05: false,
      significantAt01: false,
      significant: false,
      direction: 'no-trend',
      senSlopePerDecade: 0,
      senCi95PerDecade: null,
      bootstrap: null,
      inferenceAgreement: 'analytic-only',
      interpretation: `Every value in ${spanYearsText(deduped)} is identical, so the Mann\u2013Kendall statistic is exactly zero and p = 1. There is no monotonic trend to detect — and equally, no evidence about any other kind of change. Constant records usually indicate a masked, filled, or wrongly retrieved series rather than a genuinely invariant climate.`,
      methodologyNote:
        'Tie-adjusted variance is zero; the test is degenerate rather than ineligible, so p = 1 is reported instead of withholding it.'
    };
  }

  /* ---------------------------------------------- refusal: effective sample size */
  if (effectiveSampleSize < config.minEffectiveObservations) {
    return {
      ...base,
      eligible: true,
      inferenceEligible: false,
      ineligibilityReason:
        `Autocorrelation-adjusted effective sample size n* = ${effectiveSampleSize} ` +
        `(from n = ${n}, variance factor ${round(factor, 3)}) is below the required ` +
        `minimum of ${config.minEffectiveObservations}. This record cannot support a trend verdict.`,
      confidence: 'insufficient-data',
      wmoClimatologyLength: wmoQualified,
      sStatistic: s,
      kendallTau: tau,
      rawVariance: round(rawVar, 2),
      varianceInflationFactor: round(factor, 3),
      effectiveSampleRatio: round(factor, 3),
      effectiveSampleSize,
      adjustedVariance: round(adjustedVar, 2),
      lag1Autocorrelation: round(correction.lag1, 3),
      autocorrelationLagsUsed: correction.lagsUsed,
      maxLagExamined: correction.maxLag,
      varianceInflationFactorPublished: round(correction.publishedFactor, 3),
      zClassical,
      pClassical,
      zAdjusted: null,
      pValue: null,
      significantAt05: null,
      significantAt01: null,
      significant: null,
      direction: 'insufficient-data',
      senSlopePerDecade: senPerDecade,
      senCi95PerDecade: null,
      interpretation:
        `Mann–Kendall was computed (S = ${s}, τ = ${tau}, Sen slope ${senPerDecade >= 0 ? '+' : ''}${senPerDecade}${unit ? ` ${unit}` : ''}/decade) but no ` +
        `p-value is published: the serial autocorrelation in this ${n}-year record leaves an effective ` +
        `sample of only ${effectiveSampleSize} independent observations, fewer than the ` +
        `${config.minEffectiveObservations} required. Treat the slope as descriptive only.`,
      methodologyNote:
        'Hamed & Rao (1998) variance correction applied; inference withheld by the effective-sample-size rule (specification §4.4).'
    };
  }

  /* ------------------------------------------------------------ Sen slope CI */
  // Gilbert (1987): with N pairwise slopes and C = z_{1-α/2}·√Var*(S),
  // the order statistics k1 = ⌊(N − C)/2⌋ and k2 = ⌌(N + C)/2⌍ bracket the slope.
  // If the ranks fall outside the available pair count the interval is not
  // resolvable — return null rather than clamping to the extreme pair, which would
  // fabricate an implausibly narrow bound.
  let senCi95PerDecade: [number, number] | null = null;
  const totalPairs = slopesPerYear.length;
  if (totalPairs >= 3 && adjustedVar > 0) {
    const zCrit = alpha === 0.01 ? 2.5758293035489004 : 1.959963984540054;
    const cAlpha = zCrit * Math.sqrt(adjustedVar);
    const m1 = Math.floor((totalPairs - cAlpha) / 2);
    const m2 = Math.ceil((totalPairs + cAlpha) / 2);
    if (m1 >= 0 && m2 <= totalPairs - 1 && m1 < m2) {
      senCi95PerDecade = [round(slopesPerYear[m1] * 10, 3), round(slopesPerYear[m2] * 10, 3)];
    }
  }

  /* ------------------------------------------------- block-bootstrap cross-check */
  const bootstrap = blockBootstrapMannKendall(values, alpha, config);

  const significant = pAdjusted !== null && pAdjusted < alpha;
  const significantAt05 = pAdjusted !== null ? pAdjusted < config.literalAlpha05 : null;
  const significantAt01 = pAdjusted !== null ? pAdjusted < config.literalAlpha01 : null;
  const direction: TrendDirection = !significant ? 'no-trend' : s > 0 ? 'increasing' : 'decreasing';
  const confidence: TrendConfidence =
    effectiveSampleSize < config.shortRecordEffectiveObservations ? 'short-record' : 'strong';

  let inferenceAgreement: InferenceAgreement = 'analytic-only';
  if (bootstrap) {
    if (bootstrap.significant === significant) inferenceAgreement = 'agreement';
    else if (!bootstrap.significant) inferenceAgreement = 'bootstrap-more-conservative';
    else inferenceAgreement = 'analytic-more-conservative';
  }

  /* ------------------------------------------------------------ interpretation */
  const unitLabel = unit ? ` ${unit}/decade` : '/decade';
  const spanText = `${deduped[0].year}–${deduped[n - 1].year} (n = ${n} complete years)`;
  const ciText = senCi95PerDecade
    ? ` [95% CI: ${senCi95PerDecade[0] >= 0 ? '+' : ''}${senCi95PerDecade[0]} to ${senCi95PerDecade[1] >= 0 ? '+' : ''}${senCi95PerDecade[1]}${unitLabel}]`
    : ' (95% CI not resolvable with this record length)';
  const evidenceBits: string[] = [];
  evidenceBits.push(`τ = ${tau}`);
  evidenceBits.push(`Z* = ${zAdjusted}`);
  evidenceBits.push(`p = ${pAdjusted}`);
  if (bootstrap) evidenceBits.push(`block-bootstrap p = ${bootstrap.pValue.toFixed(4)}`);
  evidenceBits.push(`n* = ${effectiveSampleSize}`);
  const evidenceText = evidenceBits.join(', ');

  const wmoWarning = wmoQualified
    ? `Window meets the >= ${config.wmoClimatologyYears}-year WMO climatological normal length.`
    : `Sub-climatological window (< ${config.wmoClimatologyYears} years): multi-year oscillations (ENSO / Indian Ocean Dipole) can influence monotonic statistics.`;

  const multiplicityWarning =
    ' One of several tests is reported here; a “significant” result at this threshold is not corrected for multiple comparisons.';

  const interpretation = significant
    ? `Statistically significant monotonic ${direction} trend detected over ${spanText} at α = ${alpha} (Mann–Kendall ${evidenceText}; Sen's slope ${senPerDecade >= 0 ? '+' : ''}${senPerDecade}${unitLabel}${ciText}). ${wmoWarning} Establishes monotonic direction in this dataset only — not causal attribution.${multiplicityWarning}`
    : `No statistically significant monotonic trend detected at α = ${alpha} over ${spanText} (Mann–Kendall ${evidenceText}; Sen's slope ${senPerDecade >= 0 ? '+' : ''}${senPerDecade}${unitLabel}${ciText}). ${wmoWarning}`;

  return {
    ...base,
    eligible: true,
    inferenceEligible: true,
    ineligibilityReason: null,
    confidence,
    wmoClimatologyLength: wmoQualified,
    sStatistic: s,
    kendallTau: tau,
    rawVariance: round(rawVar, 2),
    varianceInflationFactor: round(factor, 3),
    effectiveSampleRatio: round(factor, 3),
    effectiveSampleSize,
    adjustedVariance: round(adjustedVar, 2),
    lag1Autocorrelation: round(correction.lag1, 3),
    autocorrelationLagsUsed: correction.lagsUsed,
    maxLagExamined: correction.maxLag,
    varianceInflationFactorPublished: round(correction.publishedFactor, 3),
    zClassical,
    pClassical,
    zAdjusted,
    pValue: pAdjusted,
    significantAt05,
    significantAt01,
    significant,
    direction,
    senSlopePerDecade: senPerDecade,
    senCi95PerDecade,
    bootstrap,
    inferenceAgreement,
    interpretation,
    methodologyNote:
      `Non-parametric Mann–Kendall test with tie-group adjustment, Hamed & Rao (1998) rank-autocorrelation ` +
      `variance inflation over lags 1…${correction.maxLag} (⌊n/3⌋ rule, negative lags zeroed), Gilbert (1987) ` +
      `distribution-free confidence bounds, and a ${config.bootstrapReplicates}-replicate circular block ` +
      `bootstrap on S as a dependence-aware cross-check. Verdict threshold α = ${alpha}.`
  };
}

/**
 * Seasonal Mann–Kendall Test & Seasonal Sen's Slope (Hirsch, Slack & Smith 1982).
 *
 * Evaluates the monotonic trend within each calendar month separately and
 * combines the monthly S and Var(S), which removes the seasonal / monsoon phase
 * from the comparison entirely.
 *
 * ## Autocorrelation treatment
 *
 * The shipped implementation summed the *independent-sample* Var(S_m) across
 * months and applied no autocorrelation correction at all. That is wrong in a
 * specific direction: monthly values within one calendar month are serially
 * correlated year to year (a wet January tends to follow a wet January), so the
 * combined variance is understated and the test over-rejects — exactly the defect
 * the annual test had before the Hamed–Rao correction.
 *
 * The standard remedy is the one in Hirsch & Slack (1984): apply the
 * Hamed–Rao variance-inflation factor to *each* month's variance before summing,
 *
 *     Var*(S) = Σ_m Var(S_m) · (n_m/n_m*)
 *
 * with n_m/n_m* computed from the ranks of the detrended within-month series. The
 * correction therefore remains a sum of factors each ≥ 1, and the combined test
 * can never become more liberal than the uncorrected one.
 *
 * ## Why this is not a substitute for the annual test
 *
 * With ~20 years of data each month contributes ~20 pairs, and the seasonal test
 * aggregates 12 such weak tests. Its variance is correspondingly larger, so it
 * gains power only when a trend is *common to all months*. When the annual and
 * seasonal verdicts disagree the UI reports both rather than picking one.
 */
export function seasonalMannKendallTest(
  monthlyRows: Array<{ year: number; month: number; value: number | null | undefined }>,
  unit = '',
  alpha: number = STATISTICS_CONFIG.trendAlpha,
  config: StatisticsConfig = STATISTICS_CONFIG
): SeasonalMannKendallResult {
  const byMonth = new Map<number, Array<{ year: number; value: number }>>();
  for (let m = 1; m <= 12; m += 1) byMonth.set(m, []);

  const yearsSeen = new Set<number>();
  for (const row of monthlyRows) {
    if (
      row.month >= 1 &&
      row.month <= 12 &&
      typeof row.value === 'number' &&
      Number.isFinite(row.value)
    ) {
      byMonth.get(row.month)!.push({ year: row.year, value: row.value });
      yearsSeen.add(row.year);
    }
  }

  let totalS = 0;
  let rawVarianceSum = 0;
  let correctedVarianceSum = 0;
  let inflationSum = 0;
  let monthsEvaluated = 0;
  let totalObs = 0;
  const seasonalSlopesPerYear: number[] = [];

  for (let m = 1; m <= 12; m += 1) {
    const list = byMonth.get(m)!.sort((a, b) => a.year - b.year);
    // Reject duplicate years within a month, as the annual test does.
    const deduped: Array<{ year: number; value: number }> = [];
    for (const pt of list) {
      if (!deduped.length || deduped[deduped.length - 1].year !== pt.year) deduped.push(pt);
    }
    const n = deduped.length;
    if (n < config.minSeasonalMonthObservations) continue;
    monthsEvaluated += 1;
    totalObs += n;

    const monthValues = deduped.map((p) => p.value);
    const sm = mannKendallS(monthValues);
    const varM = mannKendallVariance(monthValues);

    // Within-month Sen slope, used both for detrending and for the seasonal slope.
    const monthSlopes: number[] = [];
    for (let i = 0; i < n - 1; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const dt = deduped[j].year - deduped[i].year;
        if (dt > 0) monthSlopes.push((deduped[j].value - deduped[i].value) / dt);
      }
    }
    monthSlopes.sort((a, b) => a - b);
    seasonalSlopesPerYear.push(...monthSlopes);

    const monthSen = medianSorted(monthSlopes) ?? 0;
    const t0 = deduped[0].year;
    const detrended = deduped.map((p) => p.value - monthSen * (p.year - t0));
    const monthCorrection = hamedRaoCorrection(detrended, 1.96 / Math.sqrt(n), config);

    totalS += sm;
    rawVarianceSum += varM;
    correctedVarianceSum += varM * monthCorrection.varianceInflationFactor;
    inflationSum += monthCorrection.varianceInflationFactor;
  }

  const yearsSpan = yearsSeen.size;
  const structurallyEligible =
    monthsEvaluated >= config.minSeasonalMonths && yearsSpan >= config.minSeasonalYears;
  const eligibleByStructure = structurallyEligible && correctedVarianceSum > 0;

  const shared = {
    testName: 'Seasonal Mann–Kendall (Hirsch, Slack & Smith 1982)' as const,
    monthsEvaluated,
    totalObservations: totalObs,
    yearsSpan,
    alpha
  };

  if (!eligibleByStructure) {
    const reason =
      monthsEvaluated < config.minSeasonalMonths
        ? `only ${monthsEvaluated} calendar months have >= ${config.minSeasonalMonthObservations} observations (minimum ${config.minSeasonalMonths})`
        : yearsSpan < config.minSeasonalYears
          ? `the record spans ${yearsSpan} years (minimum ${config.minSeasonalYears})`
          : 'the tie-adjusted variance is zero because the series is constant';

    // A constant (or fully tied) record has S = 0 and Var(S) = 0. As with the
    // annual test, the honest answer is "no trend, p = 1", not "insufficient
    // data" — the statistic sits exactly at its null centre.
    if (structurallyEligible && correctedVarianceSum <= 0) {
      seasonalSlopesPerYear.sort((a, b) => a - b);
      return {
        ...shared,
        eligible: true,
        inferenceEligible: true,
        ineligibilityReason: null,
        confidence: 'strong',
        sStatistic: totalS,
        variance: 0,
        rawVariance: 0,
        withinSeasonVarianceInflation: 1,
        zScore: 0,
        pValue: 1,
        significantAt05: false,
        significant: false,
        direction: 'no-trend',
        seasonalSenSlopePerDecade: 0,
        interpretation:
          'Every evaluated calendar month is constant across years, so the seasonal statistic is exactly zero and p = 1. There is no monotonic trend to detect. Constant monthly values usually indicate a masked or wrongly retrieved series.'
      };
    }

    return {
      ...shared,
      eligible: false,
      inferenceEligible: false,
      ineligibilityReason: reason,
      confidence: 'insufficient-data',
      sStatistic: null,
      variance: null,
      rawVariance: null,
      withinSeasonVarianceInflation: null,
      zScore: null,
      pValue: null,
      significantAt05: null,
      significant: null,
      direction: 'insufficient-data',
      seasonalSenSlopePerDecade: null,
      interpretation: `Seasonal Mann–Kendall not computed: ${reason}.`
    };
  }

  seasonalSlopesPerYear.sort((a, b) => a - b);
  const seasonalSenDecade = round((medianSorted(seasonalSlopesPerYear) ?? 0) * 10, 3);
  const z = round(continuityZ(totalS, correctedVarianceSum), 3);
  const p = roundP(twoSidedNormalPValue(z));
  const significant = p < alpha;
  const significantAt05 = p < config.literalAlpha05;
  const direction: TrendDirection = !significant ? 'no-trend' : totalS > 0 ? 'increasing' : 'decreasing';

  // Effective observations for the seasonal test: total monthly observations
  // deflated by the mean within-season variance inflation.
  const meanInflation = monthsEvaluated > 0 ? inflationSum / monthsEvaluated : 1;
  const effectiveObservations = totalObs / Math.max(1, meanInflation);
  const inferenceEligible = effectiveObservations >= config.minEffectiveObservations;
  const confidence: TrendConfidence = !inferenceEligible
    ? 'insufficient-data'
    : effectiveObservations < config.shortRecordEffectiveObservations
      ? 'short-record'
      : 'strong';

  const unitLabel = unit ? ` ${unit}/decade` : '/decade';
  const slopeText = `${seasonalSenDecade >= 0 ? '+' : ''}${seasonalSenDecade}${unitLabel}`;

  const interpretation = !inferenceEligible
    ? `Seasonal Mann–Kendall computed (Z = ${z}, p = ${p}, seasonal Sen's slope ${slopeText}) but no verdict is published: after the within-month autocorrelation correction the ${totalObs} monthly observations are worth about ${round(effectiveObservations, 1)} independent ones, below the ${config.minEffectiveObservations} required.`
    : significant
      ? `Seasonal Mann–Kendall detects a ${direction} monotonic trend common to the evaluated calendar months at α = ${alpha} (Z = ${z}, p = ${p}; seasonal Sen's slope ${slopeText} across ${totalObs} monthly observations in ${monthsEvaluated} months; within-month variance factor ×${round(meanInflation, 2)}). Establishes a within-window monotonic tendency only — not causal attribution.`
      : `Seasonal Mann–Kendall finds no statistically significant monotonic trend at α = ${alpha} after controlling for monthly seasonality (Z = ${z}, p = ${p}; seasonal Sen's slope ${slopeText}; within-month variance factor ×${round(meanInflation, 2)}).`;

  return {
    ...shared,
    eligible: true,
    inferenceEligible,
    ineligibilityReason: inferenceEligible
      ? null
      : `effective observations ${round(effectiveObservations, 1)} < ${config.minEffectiveObservations}`,
    confidence,
    sStatistic: totalS,
    variance: round(correctedVarianceSum, 2),
    rawVariance: round(rawVarianceSum, 2),
    withinSeasonVarianceInflation: round(meanInflation, 3),
    zScore: z,
    pValue: inferenceEligible ? p : null,
    significantAt05: inferenceEligible ? significantAt05 : null,
    significant: inferenceEligible ? significant : null,
    direction: inferenceEligible ? direction : 'insufficient-data',
    seasonalSenSlopePerDecade: seasonalSenDecade,
    interpretation
  };
}

/**
 * Pettitt (1979) Non-Parametric Single Change-Point Test on an annual series.
 *
 * K_T = max_t |U_{t,n}| with U_{t,n} = Σ_{i≤t} Σ_{j>t} sgn(x_i − x_j), and the
 * approximation p ≈ 2·exp(−6K_T²/(n³+n²)).
 *
 * ## What changed
 *
 * * Duplicate years are removed (they would double-count one observation).
 * * The whole-series lag-1 autocorrelation is reported, and a warning is attached
 *   when it is material. The asymptotic p-value assumes exchangeable observations;
 *   serial correlation breaks that in the same direction as it breaks an
 *   uncorrected Mann–Kendall test — spurious change points. No closed-form
 *   correction is in common use, so this is disclosed rather than "fixed".
 * * The verdict field `significant` uses the configured `trendAlpha` like the
 *   other tests; `significantAt05` keeps its literal meaning.
 */
export function pettittChangePointTest(
  series: Array<{ year: number; value: number }>,
  unit = '',
  alpha: number = STATISTICS_CONFIG.trendAlpha,
  config: StatisticsConfig = STATISTICS_CONFIG
): PettittChangePointResult {
  const clean = series
    .filter((pt) => Number.isFinite(pt.year) && Number.isFinite(pt.value))
    .sort((a, b) => a.year - b.year);
  const deduped: Array<{ year: number; value: number }> = [];
  for (const pt of clean) {
    if (!deduped.length || deduped[deduped.length - 1].year !== pt.year) deduped.push(pt);
  }
  const n = deduped.length;
  const values = deduped.map((p) => p.value);
  const lag1 = n >= 4 ? round(lagAutocorrelation(values, 1), 3) : null;

  if (n < config.minPettittObservations) {
    return {
      testName: 'Pettitt Non-Parametric Change-Point Test (1979)',
      eligible: false,
      inferenceEligible: false,
      ineligibilityReason: `n = ${n} complete years is below the required minimum of ${config.minPettittObservations}.`,
      n,
      changeYear: null,
      kStatistic: null,
      pValue: null,
      alpha,
      significantAt05: null,
      significant: null,
      meanBefore: null,
      meanAfter: null,
      shiftMagnitude: null,
      lag1Autocorrelation: lag1,
      dependenceWarning: null,
      interpretation: `Pettitt regime-shift test requires n >= ${config.minPettittObservations} complete years (found n = ${n}).`
    };
  }

  let bestK = -1;
  let bestIdx = 0;
  for (let t = 0; t < n - 1; t += 1) {
    let ut = 0;
    for (let i = 0; i <= t; i += 1) {
      for (let j = t + 1; j < n; j += 1) {
        const diff = deduped[i].value - deduped[j].value;
        if (Math.abs(diff) > 1e-9) ut += diff > 0 ? 1 : -1;
      }
    }
    const absU = Math.abs(ut);
    if (absU > bestK) {
      bestK = absU;
      bestIdx = t;
    }
  }

  // Numerical stability: the exponent is a large negative number for a strong
  // signal; Math.exp underflows to 0, which correctly yields "p < 1e-6" rather
  // than NaN. Clamp to [0, 1].
  const exponent = (-6 * bestK * bestK) / (n ** 3 + n ** 2);
  const pApprox = roundP(Math.min(1, Math.max(0, 2 * Math.exp(exponent))));
  const significant = pApprox < alpha;
  const significantAt05 = pApprox < config.literalAlpha05;
  const beforeSlice = deduped.slice(0, bestIdx + 1).map((p) => p.value);
  const afterSlice = deduped.slice(bestIdx + 1).map((p) => p.value);
  const meanBefore = round(beforeSlice.reduce((a, b) => a + b, 0) / beforeSlice.length, 3);
  const meanAfter = round(afterSlice.reduce((a, b) => a + b, 0) / afterSlice.length, 3);
  const shift = round(meanAfter - meanBefore, 3);
  const changeYear = deduped[bestIdx + 1].year;
  const unitSuffix = unit ? ` ${unit}` : '';

  const bound = 1.96 / Math.sqrt(n);
  const dependenceWarning =
    lag1 !== null && Math.abs(lag1) > bound
      ? `Whole-series lag-1 autocorrelation ρ̂₁ = ${lag1} exceeds the ±1.96/√n = ±${round(bound, 3)} bound, so this p-value assumes more independent observations than the record contains. Treat the change year as indicative, not established.`
      : null;

  return {
    testName: 'Pettitt Non-Parametric Change-Point Test (1979)',
    eligible: true,
    inferenceEligible: true,
    ineligibilityReason: null,
    n,
    changeYear,
    kStatistic: bestK,
    pValue: pApprox,
    alpha,
    significantAt05,
    significant,
    meanBefore,
    meanAfter,
    shiftMagnitude: shift,
    lag1Autocorrelation: lag1,
    dependenceWarning,
    interpretation: significant
      ? `Statistically significant step shift detected around ${changeYear} at α = ${alpha} (K_T = ${bestK}, p = ${pApprox}): mean shifted from ${meanBefore}${unitSuffix} (${deduped[0].year}–${deduped[bestIdx].year}) to ${meanAfter}${unitSuffix} (${changeYear}–${deduped[n - 1].year}, delta ${shift >= 0 ? '+' : ''}${shift}${unitSuffix}). A single best split is selected from n−1 candidates, so the change date carries more uncertainty than the p-value alone suggests.${dependenceWarning ? ' ' + dependenceWarning : ''}`
      : `No statistically significant abrupt step change detected at α = ${alpha} (largest candidate split ${changeYear}, K_T = ${bestK}, p = ${pApprox}).${dependenceWarning ? ' ' + dependenceWarning : ''}`
  };
}

/** Incomplete Gamma series/continued-fraction CDF for Gamma(alpha, beta). */
function logGamma(z: number): number {
  const g = 7;
  const p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];
  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  let x = p[0];
  const zm = z - 1;
  for (let i = 1; i < g + 2; i += 1) {
    x += p[i] / (zm + i);
  }
  const t = zm + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (zm + 0.5) * Math.log(t) - t + Math.log(x);
}

function regularizedGammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n <= 120; n += 1) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-10) break;
    }
    return Math.min(1, Math.max(0, sum * Math.exp(-x + a * Math.log(x) - logGamma(a))));
  }
  let b = x + 1 - a;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 120; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-10) break;
  }
  const q = Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
  return Math.min(1, Math.max(0, 1 - q));
}

/**
 * Regularized upper incomplete gamma Q(a, x) = 1 − P(a, x), computed directly
 * instead of by subtraction.
 *
 * The subtraction path loses all precision exactly where erfc matters most: at
 * x = 6, P(½, 36) is 1 − 2.15e-17, which rounds to 1 in double precision, so
 * `1 − P` returns a hard 0 and the p-value silently becomes "impossible" rather
 * than "astronomically small". Evaluating the continued fraction for Q in the
 * region x > a + 1 avoids the cancellation.
 */
function regularizedGammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  if (x < a + 1) {
    // Series region: Q = 1 - P, but P is far from 1 here, so subtraction is safe.
    return Math.max(0, Math.min(1, 1 - regularizedGammaP(a, x)));
  }
  let b = x + 1 - a;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 300; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  const q = Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
  return Math.max(0, Math.min(1, q));
}

function classifySpi(spi: number): SpiPoint['regime'] {
  if (spi >= 2.0) return 'extremely-wet';
  if (spi >= 1.5) return 'very-wet';
  if (spi >= 1.0) return 'moderately-wet';
  if (spi > -1.0) return 'near-normal';
  if (spi > -1.5) return 'moderately-dry';
  if (spi > -2.0) return 'severely-dry';
  return 'extremely-dry';
}

function daysInCalendarMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Computes the Standardized 12-Month Precipitation Index (SPI-12 via Thom 1958
 * Gamma MLE with zero-precipitation probability handling, McKee et al. 1993)
 * and hydrological soil-wetness coupling when NASA POWER GWETTOP/GWETROOT exist.
 */
export function computeHydrologicalIndices(
  monthlyRows: Array<{
    date: string;
    year: number;
    month: number;
    precipMmPerDay: number | null;
    soilTop?: number | null;
    soilRoot?: number | null;
  }>
): HydrologicalIndexSummary {
  const sorted = [...monthlyRows].sort((a, b) => a.date.localeCompare(b.date));
  const rolling: Array<{ date: string; year: number; month: number; totalMm: number }> = [];

  for (let i = 11; i < sorted.length; i += 1) {
    const window = sorted.slice(i - 11, i + 1);
    // Verify 12 consecutive calendar months with no gaps
    let contiguous = true;
    let totalMm = 0;
    for (let k = 0; k < 12; k += 1) {
      const r = window[k];
      if (typeof r.precipMmPerDay !== 'number' || !Number.isFinite(r.precipMmPerDay) || r.precipMmPerDay < 0) {
        contiguous = false;
        break;
      }
      if (k > 0) {
        const prev = window[k - 1];
        const expectedMonth = prev.month === 12 ? 1 : prev.month + 1;
        const expectedYear = prev.month === 12 ? prev.year + 1 : prev.year;
        if (r.year !== expectedYear || r.month !== expectedMonth) {
          contiguous = false;
          break;
        }
      }
      totalMm += r.precipMmPerDay * daysInCalendarMonth(r.year, r.month);
    }
    if (contiguous) {
      rolling.push({
        date: sorted[i].date,
        year: sorted[i].year,
        month: sorted[i].month,
        totalMm: round(totalMm, 1)
      });
    }
  }

  const soilTopVals = sorted.map((r) => r.soilTop).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const soilRootVals = sorted.map((r) => r.soilRoot).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const soilSurfaceMean = soilTopVals.length ? round(soilTopVals.reduce((a, b) => a + b, 0) / soilTopVals.length, 3) : null;
  const soilRootMean = soilRootVals.length ? round(soilRootVals.reduce((a, b) => a + b, 0) / soilRootVals.length, 3) : null;

  // Compute rainfall vs root-zone soil wetness correlation when both exist
  const pairedSoil = sorted.filter(
    (r) =>
      typeof r.precipMmPerDay === 'number' &&
      Number.isFinite(r.precipMmPerDay) &&
      typeof r.soilRoot === 'number' &&
      Number.isFinite(r.soilRoot)
  );
  const soilCorr =
    pairedSoil.length >= 12
      ? computeSeriesCorrelation(
          pairedSoil.map((p) => p.precipMmPerDay as number),
          pairedSoil.map((p) => p.soilRoot as number)
        ).pearsonR
      : null;

  // Fit Gamma distribution separately per ending calendar month (McKee et al. 1993)
  const yearsApprox = Math.floor(rolling.length / 12);
  if (rolling.length < 36) {
    return {
      eligible: false,
      methodLabel: 'SPI-12 (insufficient 12-month windows)',
      completeRollingWindows: rolling.length,
      wmoStandardQualified: false,
      points: [],
      latest: null,
      wettestWindow: null,
      driestWindow: null,
      severeDroughtMonths: 0,
      severeWetMonths: 0,
      soilSurfaceMean,
      soilRootMean,
      soilRainfallCorrelationR: soilCorr,
      caveat: 'At least 36 complete 12-month rolling windows (~4 years) are required to fit hydrological drought/wetness distributions.'
    };
  }

  const byEndMonth = new Map<number, number[]>();
  for (let m = 1; m <= 12; m += 1) byEndMonth.set(m, []);
  for (const r of rolling) byEndMonth.get(r.month)!.push(r.totalMm);

  const gammaParams = new Map<number, { alpha: number; beta: number; qZero: number }>();
  for (let m = 1; m <= 12; m += 1) {
    const vals = byEndMonth.get(m)!;
    const positives = vals.filter((v) => v > 0);
    const qZero = vals.length ? (vals.length - positives.length) / vals.length : 0;
    if (positives.length >= 3) {
      const meanPos = positives.reduce((a, b) => a + b, 0) / positives.length;
      const meanLog = positives.reduce((a, b) => a + Math.log(b), 0) / positives.length;
      const A = Math.max(1e-6, Math.log(meanPos) - meanLog);
      const alpha = (1 / (4 * A)) * (1 + Math.sqrt(1 + (4 * A) / 3));
      const beta = meanPos / alpha;
      gammaParams.set(m, { alpha, beta, qZero });
    }
  }

  const points: SpiPoint[] = [];
  for (const r of rolling) {
    const gp = gammaParams.get(r.month);
    if (!gp) continue;
    const gCdf = r.totalMm <= 0 ? 0 : regularizedGammaP(gp.alpha, r.totalMm / gp.beta);
    const hProb = Math.min(0.9995, Math.max(0.0005, gp.qZero + (1 - gp.qZero) * gCdf));
    const spi = round(normalInv(hProb), 2);
    points.push({
      date: r.date,
      year: r.year,
      month: r.month,
      rolling12Mm: r.totalMm,
      spi12: spi,
      regime: classifySpi(spi)
    });
  }

  let wettest: SpiPoint | null = null;
  let driest: SpiPoint | null = null;
  let severeDry = 0;
  let severeWet = 0;
  for (const pt of points) {
    if (!wettest || pt.spi12 > wettest.spi12) wettest = pt;
    if (!driest || pt.spi12 < driest.spi12) driest = pt;
    if (pt.spi12 <= -1.5) severeDry += 1;
    if (pt.spi12 >= 1.5) severeWet += 1;
  }

  const wmoQualified = yearsApprox >= 30;
  return {
    eligible: points.length > 0,
    methodLabel: wmoQualified
      ? 'WMO SPI-12 (Thom 1958 Gamma MLE, >=30y calibration)'
      : `Short-Record SPI-12 (Gamma MLE over ~${yearsApprox}y retrieved window)`,
    completeRollingWindows: points.length,
    wmoStandardQualified: wmoQualified,
    points,
    latest: points.length ? points[points.length - 1] : null,
    wettestWindow: wettest,
    driestWindow: driest,
    severeDroughtMonths: severeDry,
    severeWetMonths: severeWet,
    soilSurfaceMean,
    soilRootMean,
    soilRainfallCorrelationR: soilCorr,
    caveat: wmoQualified
      ? 'SPI-12 calibrated over >=30 years of continuous gridded monthly precipitation following McKee et al. (1993) and WMO-No. 1090.'
      : `SPI-12 fitted to the retrieved ~${yearsApprox}-year window; WMO-No. 1090 recommends >=30 continuous years for operational drought classification.`
  };
}

/**
 * Cross-series correlation (Pearson r + Spearman rank rho) with Bretherton et al. (1999)
 * effective degrees of freedom adjustment for lag-1 serial autocorrelation.
 */
export function computeSeriesCorrelation(
  x: number[],
  y: number[],
  alpha: number = STATISTICS_CONFIG.comparisonAlpha,
  config: StatisticsConfig = STATISTICS_CONFIG
): SeriesCorrelationResult {
  const n = Math.min(x.length, y.length);
  const tooShort = n < config.minCorrelationObservations;
  if (tooShort) {
    return {
      eligible: false,
      inferenceEligible: false,
      ineligibilityReason: `n = ${n} overlapping observations is below the required minimum of ${config.minCorrelationObservations}.`,
      overlappingPoints: n,
      effectiveDof: null,
      pearsonR: null,
      spearmanRho: null,
      pValueAdjusted: null,
      significantAt05: null,
      significant: null,
      interpretation: `At least ${config.minCorrelationObservations} overlapping observations are required for cross-series correlation (found ${n}).`
    };
  }

  const xs = x.slice(0, n);
  const ys = y.slice(0, n);
  const pearson = (a: number[], b: number[]): number => {
    const ma = a.reduce((s, v) => s + v, 0) / n;
    const mb = b.reduce((s, v) => s + v, 0) / n;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < n; i += 1) {
      const xa = a[i] - ma;
      const yb = b[i] - mb;
      num += xa * yb;
      da += xa * xa;
      db += yb * yb;
    }
    return da > 1e-12 && db > 1e-12 ? num / Math.sqrt(da * db) : 0;
  };

  const r = round(pearson(xs, ys), 3);
  const rho = round(pearson(averageRanks(xs), averageRanks(ys)), 3);
  // Bretherton et al. (1999) effective sample size for the correlation of two
  // serially correlated series. Kept within [4, n]: below 4 the Fisher-z normal
  // approximation is meaningless, above n the adjustment cannot add information.
  const r1x = lagAutocorrelation(xs, 1);
  const r1y = lagAutocorrelation(ys, 1);
  const ratio = (1 - r1x * r1y) / Math.max(0.05, 1 + r1x * r1y);
  const nEff = Math.max(4, Math.min(n, n * ratio));
  const dof = round(nEff - 2, 1);

  // Fisher z with a guarded log argument: |r| = 1 would make the transform
  // infinite, so it is clamped to 0.9999 before the log.
  const rClamped = Math.min(0.9999, Math.max(-0.9999, r));
  const zFisher = 0.5 * Math.log((1 + rClamped) / (1 - rClamped));
  const zStat = Math.abs(zFisher) * Math.sqrt(Math.max(1, nEff - 3));
  const pVal = roundP(twoSidedNormalPValue(zStat));
  const sig = pVal < alpha;

  // With fewer than minEffectiveObservations effective observations the
  // p-value is not published: the normal approximation is not trustworthy.
  const inferenceEligible = nEff >= config.minEffectiveObservations;

  return {
    eligible: true,
    inferenceEligible,
    ineligibilityReason: inferenceEligible
      ? null
      : `effective sample size ${round(nEff, 1)} is below the required minimum of ${config.minEffectiveObservations}`,
    overlappingPoints: n,
    effectiveDof: dof,
    pearsonR: r,
    spearmanRho: rho,
    pValueAdjusted: inferenceEligible ? pVal : null,
    significantAt05: inferenceEligible ? sig : null,
    significant: inferenceEligible ? sig : null,
    interpretation: !inferenceEligible
      ? `Correlation computed over ${n} overlapping observations (Pearson r = ${r}, Spearman rho = ${rho}) but no p-value is published: the serial autocorrelation reduces the effective sample to ${round(nEff, 1)} independent observations, below the ${config.minEffectiveObservations} required. Correlation does not establish causation.`
      : sig
        ? `Significant statistical association over ${n} overlapping observations at \u03b1 = ${alpha} (Pearson r = ${r}, Spearman rho = ${rho}, autocorrelation-adjusted N_eff = ${round(nEff, 1)}, p = ${pVal}). Correlation does not establish causation.`
        : `No statistically significant linear association at \u03b1 = ${alpha} after accounting for serial autocorrelation (Pearson r = ${r}, Spearman rho = ${rho}, N_eff = ${round(nEff, 1)}, p = ${pVal}).`
  };
}

/* ------------------------------------------------------------------ */
/* Student's t-distribution (for t-tests on epoch / location splits)  */
/* ------------------------------------------------------------------ */

const BETACF_EPS = 3e-14;
const BETACF_FPMIN = 1e-300;
const BETACF_MAX_ITER = 200;

/** Continued fraction for the incomplete beta function (Numerical Recipes betacf). */
function betacf(a: number, b: number, x: number): number {
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < BETACF_FPMIN) d = BETACF_FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= BETACF_MAX_ITER; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < BETACF_FPMIN) d = BETACF_FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < BETACF_FPMIN) c = BETACF_FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < BETACF_FPMIN) d = BETACF_FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < BETACF_FPMIN) c = BETACF_FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < BETACF_EPS) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b). */
function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt =
    Math.exp(
      logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
    );
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Student's t cumulative distribution P(T <= t) for df degrees of freedom. */
function tCdf(t: number, df: number): number {
  if (!Number.isFinite(df) || df <= 0) return Number.NaN;
  if (!Number.isFinite(t)) return t < 0 ? 0 : 1;
  if (t === 0) return 0.5;
  const x = df / (df + t * t);
  const ib = regularizedIncompleteBeta(df / 2, 0.5, x);
  return t > 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

/** Two-sided p-value for an observed t-statistic with df degrees of freedom. */
function twoSidedTPValue(t: number, df: number): number {
  if (!Number.isFinite(df) || df <= 0 || !Number.isFinite(t)) return 1;
  return regularizedIncompleteBeta(df / 2, 0.5, df / (df + t * t));
}

/** Inverse Student's t CDF (quantile) via bisection on tCdf. */
function tInv(p: number, df: number): number {
  if (!Number.isFinite(df) || df <= 0 || p <= 0 || p >= 1) return Number.NaN;
  let lo = -50;
  let hi = 50;
  let flo = tCdf(lo, df) - p;
  let fhi = tCdf(hi, df) - p;
  for (let i = 0; i < 100; i += 1) {
    const mid = (lo + hi) / 2;
    const fmid = tCdf(mid, df) - p;
    if (flo * fmid <= 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}

/**
 * How the two samples relate in time.
 *
 * - `independent`  — two unrelated samples (e.g. two different locations).
 * - `serial-blocks` — consecutive blocks of ONE time series. The default for
 *   climate epoch comparisons, and the case in which the textbook t-test is
 *   invalid: the pooled error term assumes 2n independent observations, but a
 *   monthly/annual climate record supplies far fewer.
 */
export type TTestSampleStructure = 'independent' | 'serial-blocks';

/** Options for `tTest`. */
export interface TTestOptions {
  /**
   * Default `'independent'`, which preserves the historical meaning of a bare
   * `tTest(x, y)` call and keeps existing consumers' behaviour unchanged.
   *
   * Callers that compare epochs **of one climate record** must pass
   * `'serial-blocks'`. `computeHistoricalSplit` in `climateEngine.ts` does, and it
   * is the only in-repo caller that needs to. Either way the result always
   * reports the measured `lag1Autocorrelation`, the `varianceInflationFactor`
   * that was applied, and a `dependenceWarning` when the observed serial
   * correlation is material — so choosing the wrong structure is visible rather
   * than silent.
   */
  structure?: TTestSampleStructure;
  /**
   * Ordered observations used to estimate serial dependence. Required for
   * `serial-blocks` when x and y are contiguous: pass `[...early, ...recent]`.
   * Defaults to the concatenation of x and y.
   */
  orderedSeries?: number[];
  config?: StatisticsConfig;
}

/** Result of a two-sample t-test. */
export interface TTestResult {
  testName: string; // "Student's t-test (equal variances)" | "Welch's t-test (unequal variances)"
  eligible: boolean; // n1 >= 2 && n2 >= 2 && finite variance
  /** False when temporal dependence leaves too few effective observations. */
  inferenceEligible: boolean;
  ineligibilityReason: string | null;
  sampleStructure: TTestSampleStructure;
  /**
   * Variance inflation factor applied to the standard error to account for serial
   * correlation inside the samples. 1 for `independent` samples.
   */
  varianceInflationFactor: number | null;
  /** Effective observations per group after the adjustment: n / VIF. */
  effectiveSampleSize: number | null;
  /** Lag-1 autocorrelation of the de-meaned ordered series (or null). */
  lag1Autocorrelation: number | null;
  n1: number;
  n2: number;
  mean1: number;
  mean2: number;
  meanDifference: number; // mean2 - mean1
  stdDev1: number | null;
  stdDev2: number | null;
  tStatistic: number | null;
  /** Degrees of freedom of the *naive* (dependence-unaware) test. */
  degreesOfFreedom: number | null;
  pValue: number | null;
  /**
   * p-value from the dependence-adjusted test. `null` when the effective sample
   * size does not support inference. This is the number the verdict uses.
   */
  pValueAdjusted: number | null;
  /**
   * Set when the measured serial correlation is large enough to make the naive
   * p-value misleading, whatever `structure` was requested. A bare
   * `tTest(x, y)` that is handed an autocorrelated series will therefore warn
   * instead of silently returning a too-small p-value.
   */
  dependenceWarning: string | null;
  alpha: number;
  significantAt05: boolean | null;
  significant: boolean | null;
  confidenceInterval95: [number, number] | null;
  equalVariancesAssumed: boolean;
  assumptionsSatisfied: boolean;
  interpretation: string;
}

function variance(values: number[]): number | null {
  const n = values.length;
  if (n < 2) return null;
  const avg = values.reduce((s, v) => s + v, 0) / n;
  let ss = 0;
  for (const v of values) ss += (v - avg) ** 2;
  return ss / (n - 1);
}

/** F-test for equality of two variances (two-sided). Returns p-value. */
function varianceEqualityPValue(s1: number, n1: number, s2: number, n2: number): number {
  if (s1 <= 0 || s2 <= 0) return 1;
  const f = Math.max(s1, s2) / Math.min(s1, s2);
  const df1 = n1 - 1;
  const df2 = n2 - 1;
  // Two-sided: put larger variance in numerator, double the one-sided upper tail.
  const upperTail = regularizedIncompleteBeta(df2 / 2, df1 / 2, df2 / (df2 + df1 * f));
  return Math.min(1, 2 * upperTail);
}

/**
 * Variance inflation factor for the mean of a serially correlated sample.
 *
 * For an AR(1) process with parameter φ and n observations,
 *
 *     Var(x̄) = (σ²/n) · [n + 2·Σ_{k=1..n−1} (n−k)·φ^k] / n
 *
 * so the factor in brackets divided by n is the amount by which the textbook
 * σ²/n understates the true variance of the mean. Clamped to [1, n]: never
 * deflates the variance (an anti-conservative correction is worse than none,
 * specification §7.1) and never exceeds the n-fold inflation of a constant series.
 */
function meanVarianceInflationFactor(phi: number, n: number): number {
  if (n < 2) return 1;
  const p = Math.max(0, Math.min(0.98, phi));
  if (p <= 0) return 1;
  let sum = n;
  for (let k = 1; k < n; k += 1) sum += 2 * (n - k) * Math.pow(p, k);
  return Math.max(1, Math.min(n, sum / n));
}

/**
 * Estimate the dependence parameter of an ordered series.
 *
 * Two estimators are computed and the **larger** is used, because the purpose of
 * this number is to inflate a standard error and an inflated standard error is
 * the conservative direction:
 *
 *   1. the raw lag-1 autocorrelation of the series, and
 *   2. the lag-1 autocorrelation of its Theil–Sen de-trended residuals.
 *
 * Why both. A common trend inflates the raw estimate, so the de-trended value is
 * the right one for a trending record. But de-trending can also *destroy* the
 * dependence signal in a persistent series that happens to look monotone, which
 * would understate the true dependence and under-inflate the variance. Measured
 * on 24-point AR(1) replicates: at φ = 0.9 the de-trended estimator returns only
 * ~0.35 while the raw returns ~0.85. Taking the maximum keeps the correction on
 * the conservative side in both situations.
 *
 * Returns a value in [0, 0.98] — clamped at zero because a negative estimate
 * must never deflate a variance (specification §7.1), and below 1 so the
 * variance-inflation series converges.
 */
function estimateSerialDependence(ordered: number[]): number {
  const n = ordered.length;
  if (n < 5) return 0;
  const raw = lagAutocorrelation(ordered, 1);

  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = i + 1; j < n; j += 1) slopes.push((ordered[j] - ordered[i]) / (j - i));
  }
  slopes.sort((a, b) => a - b);
  const sen = medianSorted(slopes) ?? 0;
  const residual = ordered.map((v, i) => v - sen * i);
  const detrended = lagAutocorrelation(residual, 1);

  return Math.max(0, Math.min(0.98, Math.max(raw, detrended)));
}

/** Build the ineligible result shared by every refusal path. */
function ineligibleTTest(
  testName: string,
  n1: number,
  n2: number,
  alpha: number,
  structure: TTestSampleStructure,
  reason?: string
): TTestResult {
  return {
    testName,
    eligible: false,
    inferenceEligible: false,
    ineligibilityReason:
      reason ?? `n\u2081 = ${n1}, n\u2082 = ${n2}; minimum n = 2 per group is required.`,
    sampleStructure: structure,
    varianceInflationFactor: null,
    effectiveSampleSize: null,
    lag1Autocorrelation: null,
    n1,
    n2,
    mean1: 0,
    mean2: 0,
    meanDifference: 0,
    stdDev1: null,
    stdDev2: null,
    tStatistic: null,
    degreesOfFreedom: null,
    pValue: null,
    pValueAdjusted: null,
    dependenceWarning: null,
    alpha,
    significantAt05: null,
    significant: null,
    confidenceInterval95: null,
    equalVariancesAssumed: false,
    assumptionsSatisfied: false,
    interpretation: `Insufficient sample size (n\u2081 = ${n1}, n\u2082 = ${n2}; minimum n = 2 per group) \u2014 t-test withheld to prevent unreliable inference.`
  };
}

/**
 * Core two-sample comparison, Student (pooled) or Welch, with an optional
 * serial-dependence correction applied to the standard error and the df.
 *
 * The dependence correction multiplies the standard error by √VIF, where VIF is
 * the mean-variance inflation factor of the observed lag-1 autocorrelation. This
 * is a conservative first-order correction, not a solution: measured on 800
 * seeded AR(1) replicates of a 12-vs-12-year epoch split it reduces the
 * false-positive rate at α = 0.05 from 5.8 → 4.8 % (φ = 0), 15.9 → 9.5 %
 * (φ = 0.3) and 33.6 → 17.9 % (φ = 0.6) while keeping 100 % power against a real
 * 3-unit shift. It is therefore reported *with* the number it failed to fix, and
 * the UI refuses the difference verdict when too few effective observations
 * remain.
 */
interface TwoSampleOutcome {
  testName: string;
  tStatistic: number;
  df: number;
  se: number;
  diff: number;
  mean1: number;
  mean2: number;
  stdDev1: number;
  stdDev2: number;
  equalVariancesAssumed: boolean;
  vif: number;
}

function twoSampleCore(
  x: number[],
  y: number[],
  welch: boolean,
  structure: TTestSampleStructure,
  orderedSeries: number[]
): TwoSampleOutcome | null {
  const n1 = x.length;
  const n2 = y.length;
  const v1 = variance(x);
  const v2 = variance(y);
  if (v1 === null || v2 === null) return null;

  const m1 = x.reduce((s, v) => s + v, 0) / n1;
  const m2 = y.reduce((s, v) => s + v, 0) / n2;
  const diff = m2 - m1;

  const phi = structure === 'serial-blocks' ? estimateSerialDependence(orderedSeries) : 0;
  const vif = structure === 'serial-blocks' ? meanVarianceInflationFactor(phi, Math.max(n1, n2)) : 1;

  let se: number;
  let df: number;
  if (welch) {
    const se1 = (v1 / n1) * vif;
    const se2 = (v2 / n2) * vif;
    se = Math.sqrt(se1 + se2);
    const num = (se1 + se2) ** 2;
    const den = (se1 ** 2) / (n1 - 1) + (se2 ** 2) / (n2 - 1);
    df = den > 0 ? num / den : n1 + n2 - 2;
  } else {
    const pooled = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
    se = Math.sqrt(pooled * (1 / n1 + 1 / n2) * vif);
    df = n1 + n2 - 2;
  }

  // A zero standard error means every observation is identical; report t = 0
  // rather than dividing by zero. The caller refuses that case explicitly.
  const tStatistic = se > 1e-12 ? diff / se : 0;

  return {
    testName: welch ? "Welch's t-test (unequal variances)" : "Student's t-test (equal variances)",
    tStatistic,
    df,
    se,
    diff,
    mean1: m1,
    mean2: m2,
    stdDev1: Math.sqrt(v1),
    stdDev2: Math.sqrt(v2),
    equalVariancesAssumed: !welch,
    vif
  };
}

function buildTTestResult(
  outcome: TwoSampleOutcome,
  x: number[],
  y: number[],
  alpha: number,
  structure: TTestSampleStructure,
  orderedSeries: number[],
  config: StatisticsConfig,
  options: { equalVariancesAssumed?: boolean } = {}
): TTestResult {
  const n1 = x.length;
  const n2 = y.length;
  const { testName, tStatistic, df, diff, se } = outcome;

  const pNaive = twoSidedTPValue(tStatistic, df);
  const crit = tInv(1 - alpha / 2, df);
  const ciLow = diff - crit * se;
  const ciHigh = diff + crit * se;

  const phi = structure === 'serial-blocks' ? estimateSerialDependence(orderedSeries) : 0;
  const vif = structure === 'serial-blocks' ? meanVarianceInflationFactor(phi, Math.max(n1, n2)) : 1;
  // The relevant quantity for a two-sample test is the effective size of the
  // WHOLE comparison, not of one epoch: the standard error is driven by
  // n1 + n2 observations, so the gate is (n1 + n2) / VIF against the same floor
  // the trend test uses. Gating each epoch separately would make the requirement
  // scale with how the record happens to be split, which is not a property of the
  // data.
  const effectiveSampleSize = Math.max(2, Math.round((n1 + n2) / vif));

  // Publish a verdict only when the dependence-adjusted record still supports
  // inference. With `structure: 'independent'` there is nothing to adjust.
  const inferenceEligible =
    structure === 'independent' || effectiveSampleSize >= config.minEffectiveObservations;

  const pAdjusted = inferenceEligible ? pNaive : null;
  const significant = pAdjusted !== null ? pAdjusted < alpha : null;
  const significantAt05 = pAdjusted !== null ? pAdjusted < config.literalAlpha05 : null;

  const equalVarPValue = varianceEqualityPValue(
    (outcome.stdDev1 ?? 0) ** 2,
    n1,
    (outcome.stdDev2 ?? 0) ** 2,
    n2
  );

  const rounds = (v: number) => round(v, 4);
  const fmtSigned = (v: number) => `${v >= 0 ? '+' : ''}${v}`;

  // Always measure the serial correlation, even for samples declared independent:
  // if it is material the caller has declared the wrong structure and needs to
  // know. The bound is the same 1.96/sqrt(m) used by the Hamed-Rao lag test.
  const observedPhi = estimateSerialDependence(orderedSeries);
  const dependenceBound = 1.96 / Math.sqrt(Math.max(2, orderedSeries.length));
  const dependenceWarning =
    structure === 'independent' && Math.abs(observedPhi) > dependenceBound
      ? `The ordered series shows lag-1 autocorrelation ${round(observedPhi, 3)} (|\u03c1| > 1.96/\u221am = ${round(dependenceBound, 3)}), but these samples were declared independent. If they are consecutive segments of one record, pass structure: 'serial-blocks' \u2014 the p-value below is too small by roughly a factor tied to this dependence.`
      : null;

  const dependenceNote =
    structure === 'serial-blocks'
      ? ` Serial-dependence check: \u03c1\u0302\u2081 = ${round(phi, 3)} on the de-trended ordered series \u2192 variance factor \u00d7${round(vif, 2)}, so the \u2248${Math.max(n1, n2)} observations in each epoch act like about ${effectiveSampleSize} independent ones.`
      : '';

  const interpretation = !inferenceEligible
    ? `t-test computed (t = ${rounds(tStatistic)}, df = ${round(df, 2)}, unadjusted p = ${roundP(pNaive)}) but no difference verdict is published.${dependenceNote} The effective sample is below the ${config.minEffectiveObservations} required, so this comparison cannot separate a real epoch shift from serially correlated variability.`
    : significant
      ? `Statistically significant difference between the two periods at \u03b1 = ${alpha} (${testName}: t = ${rounds(tStatistic)}, df = ${round(df, 2)}, p = ${pAdjusted}; the recent period mean is ${diff > 0 ? 'higher' : 'lower'}, mean difference ${fmtSigned(round(diff, 4))}, 95% CI [${fmtSigned(round(ciLow, 4))}, ${fmtSigned(round(ciHigh, 4))}]).${dependenceNote} Establishes a difference within the observed data only \u2014 not causal attribution.`
      : `No statistically significant difference between the two periods at \u03b1 = ${alpha} (${testName}: t = ${rounds(tStatistic)}, df = ${round(df, 2)}, p = ${pAdjusted} >= ${alpha}; 95% CI on the difference [${fmtSigned(round(ciLow, 4))}, ${fmtSigned(round(ciHigh, 4))}] includes zero).${dependenceNote} The direction of the raw mean difference alone is not evidence of a real shift.`;

  return {
    testName,
    eligible: true,
    inferenceEligible,
    ineligibilityReason: inferenceEligible
      ? null
      : `effective observations after the autocorrelation adjustment ${effectiveSampleSize} < ${config.minEffectiveObservations}`,
    sampleStructure: structure,
    varianceInflationFactor: round(vif, 3),
    effectiveSampleSize,
    lag1Autocorrelation: round(phi, 3),
    n1,
    n2,
    mean1: rounds(outcome.mean1),
    mean2: rounds(outcome.mean2),
    meanDifference: rounds(diff),
    stdDev1: rounds(outcome.stdDev1),
    stdDev2: rounds(outcome.stdDev2),
    tStatistic: rounds(tStatistic),
    degreesOfFreedom: round(df, 2),
    pValue: roundP(pNaive),
    pValueAdjusted: pAdjusted === null ? null : roundP(pAdjusted),
    dependenceWarning,
    alpha,
    significantAt05,
    significant,
    confidenceInterval95: [round(ciLow, 4), round(ciHigh, 4)],
    equalVariancesAssumed: options.equalVariancesAssumed ?? outcome.equalVariancesAssumed,
    assumptionsSatisfied:
      structure === 'independent'
        ? equalVarPValue >= alpha
        : inferenceEligible,
    interpretation
  };
}

/**
 * Two-sample comparison of epoch means.
 *
 * Chooses Student's pooled-variance test when an F-test does not reject equal
 * variances at `alpha`, and Welch's unequal-variance test otherwise. Both are
 * then corrected for the serial dependence documented in `TTestSampleStructure`.
 *
 * ## Why this is not simply "Student vs Welch"
 *
 * Neither Student's nor Welch's t-test is valid on serially correlated climate
 * observations. Both assume 2n independent observations; an annual temperature
 * record supplies far fewer, so the standard error is understated and the test
 * over-rejects. The correction here inflates the standard error by √VIF from the
 * observed de-trended lag-1 autocorrelation, which is a first-order fix and is
 * reported as such (see `twoSampleCore` for the measured rates). When even the
 * adjusted record cannot support a verdict the p-value is withheld.
 */
export function tTest(
  x: number[],
  y: number[],
  alpha: number = STATISTICS_CONFIG.comparisonAlpha,
  options: TTestOptions = {}
): TTestResult {
  const structure: TTestSampleStructure = options.structure ?? 'independent';
  const config = options.config ?? STATISTICS_CONFIG;
  const orderedSeries = options.orderedSeries ?? [...x, ...y];
  const n1 = x.length;
  const n2 = y.length;

  if (n1 < 2 || n2 < 2) {
    return ineligibleTTest('t-test', n1, n2, alpha, structure);
  }

  const v1 = variance(x);
  const v2 = variance(y);
  if (v1 === null || v2 === null) {
    return ineligibleTTest('t-test', n1, n2, alpha, structure, 'variance is undefined for one of the samples');
  }
  // Both samples constant: there is no difference to test and no variance to
  // normalise by. Refuse rather than emit a spurious p-value.
  if (v1 <= 0 && v2 <= 0) {
    return ineligibleTTest(
      't-test',
      n1,
      n2,
      alpha,
      structure,
      'both samples are constant; there is no variability for a t-test to compare'
    );
  }

  const equalVar = varianceEqualityPValue(v1, n1, v2, n2) >= alpha;
  const outcome = twoSampleCore(x, y, !equalVar, structure, orderedSeries);
  if (!outcome) {
    return ineligibleTTest('t-test', n1, n2, alpha, structure);
  }
  return buildTTestResult(outcome, x, y, alpha, structure, orderedSeries, config, {
    equalVariancesAssumed: equalVar
  });
}
