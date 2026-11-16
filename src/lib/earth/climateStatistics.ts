/**
 * COSMORA Validated Statistical Trend & Hydrological Time-Series Engine.
 *
 * Implements peer-reviewed, non-parametric climatological and hydrological
 * statistical methods recommended by WMO-No. 1203, USGS Techniques & Methods
 * (Helsel et al., 2020), NOAA NCEI, and KNMI Climate Explorer:
 *
 *   1. Mann–Kendall Monotonic Trend Test (Mann 1945; Kendall 1975) with exact
 *      tie-group variance adjustment and Hamed & Rao (1998) effective-sample-size
 *      correction for serial autocorrelation.
 *   2. Distribution-free 95% Confidence Interval on Theil–Sen Slope (Gilbert 1987).
 *   3. Seasonal Mann–Kendall Test & Seasonal Sen's Slope (Hirsch, Slack & Smith 1982)
 *      for monthly hydro-climatic records with strong monsoon/seasonal cycles.
 *   4. Pettitt Non-Parametric Change-Point Test (Pettitt 1979) for regime shifts.
 *   5. Standardized 12-Month Precipitation Index (SPI-12 via Thom 1958 Gamma MLE
 *      with zero-inflation handling) and Bretherton et al. (1999) effective-DOF
 *      cross-series correlation (Pearson r & Spearman rank rho).
 *
 * Scientific honesty rules enforced in code:
 *   - Hypothesis tests refuse to emit p-values when sample sizes fall below
 *     validity thresholds (n < 10 annual points for Mann–Kendall; n < 12 for Pettitt).
 *   - Windows shorter than the 30-year WMO climatological normal (10 <= n < 30)
 *     carry an explicit sub-climatological variability warning (ENSO / IOD).
 *   - Rejecting H0 (p < 0.05) establishes a statistically significant monotonic
 *     trend WITHIN THE OBSERVED WINDOW ONLY — never physical causal attribution.
 */

export type TrendDirection = 'increasing' | 'decreasing' | 'no-trend' | 'insufficient-data';

export interface MannKendallResult {
  testName: 'Mann–Kendall (Hamed–Rao autocorrelation-adjusted)';
  eligible: boolean;
  n: number;
  fromYear: number | null;
  toYear: number | null;
  wmoClimatologyLength: boolean;
  sStatistic: number | null;
  kendallTau: number | null;
  rawVariance: number | null;
  effectiveSampleRatio: number | null;
  adjustedVariance: number | null;
  lag1Autocorrelation: number | null;
  zClassical: number | null;
  pClassical: number | null;
  zAdjusted: number | null;
  pValue: number | null;
  alpha: number;
  significantAt05: boolean | null;
  significantAt01: boolean | null;
  direction: TrendDirection;
  senSlopePerDecade: number | null;
  senCi95PerDecade: [number, number] | null;
  interpretation: string;
  methodologyNote: string;
}

export interface SeasonalMannKendallResult {
  testName: 'Seasonal Mann–Kendall (Hirsch, Slack & Smith 1982)';
  eligible: boolean;
  monthsEvaluated: number;
  totalObservations: number;
  yearsSpan: number;
  sStatistic: number | null;
  variance: number | null;
  zScore: number | null;
  pValue: number | null;
  alpha: number;
  significantAt05: boolean | null;
  direction: TrendDirection;
  seasonalSenSlopePerDecade: number | null;
  interpretation: string;
}

export interface PettittChangePointResult {
  testName: 'Pettitt Non-Parametric Change-Point Test (1979)';
  eligible: boolean;
  n: number;
  changeYear: number | null;
  kStatistic: number | null;
  pValue: number | null;
  alpha: number;
  significantAt05: boolean | null;
  meanBefore: number | null;
  meanAfter: number | null;
  shiftMagnitude: number | null;
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
  overlappingPoints: number;
  effectiveDof: number | null;
  pearsonR: number | null;
  spearmanRho: number | null;
  pValueAdjusted: number | null;
  significantAt05: boolean | null;
  interpretation: string;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Complementary error function erfc(x) — Abramowitz & Stegun 7.1.26 (< 1.5e-7 error). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const ans = poly * Math.exp(-z * z);
  return x >= 0 ? ans : 2 - ans;
}

/** Standard normal cumulative distribution Phi(z). */
export function normalCdf(z: number): number {
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

function lagAutocorrelation(values: number[], lag: number): number {
  const n = values.length;
  if (n <= lag + 2) return 0;
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
  return num / denom;
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

function continuityZ(s: number, variance: number): number {
  if (variance <= 0) return 0;
  if (s > 0) return (s - 1) / Math.sqrt(variance);
  if (s < 0) return (s + 1) / Math.sqrt(variance);
  return 0;
}

/**
 * Validated Mann–Kendall monotonic trend test with Hamed & Rao (1998) serial
 * correlation variance correction and Gilbert (1987) exact non-parametric 95%
 * confidence interval on the Theil–Sen slope.
 */
export function mannKendallTest(
  series: Array<{ year: number; value: number }>,
  unit = '',
  alpha = 0.05
): MannKendallResult {
  const clean = series
    .filter((pt) => Number.isFinite(pt.year) && Number.isFinite(pt.value))
    .sort((a, b) => a.year - b.year);
  const n = clean.length;

  if (n < 10) {
    return {
      testName: 'Mann–Kendall (Hamed–Rao autocorrelation-adjusted)',
      eligible: false,
      n,
      fromYear: n ? clean[0].year : null,
      toYear: n ? clean[n - 1].year : null,
      wmoClimatologyLength: false,
      sStatistic: null,
      kendallTau: null,
      rawVariance: null,
      effectiveSampleRatio: null,
      adjustedVariance: null,
      lag1Autocorrelation: null,
      zClassical: null,
      pClassical: null,
      zAdjusted: null,
      pValue: null,
      alpha,
      significantAt05: null,
      significantAt01: null,
      direction: 'insufficient-data',
      senSlopePerDecade: null,
      senCi95PerDecade: null,
      interpretation: `Insufficient sample size (n = ${n} complete years; minimum n = 10 required) — Mann–Kendall p-value withheld to prevent unreliable inference.`,
      methodologyNote: 'Mann–Kendall hypothesis testing requires at least 10 complete annual observations; WMO climatological trend normals recommend >= 30 years.'
    };
  }

  let s = 0;
  const slopesPerYear: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const diff = clean[j].value - clean[i].value;
      if (Math.abs(diff) > 1e-9) {
        s += diff > 0 ? 1 : -1;
      }
      const dt = clean[j].year - clean[i].year;
      if (dt > 0) slopesPerYear.push(diff / dt);
    }
  }
  slopesPerYear.sort((a, b) => a - b);
  const senPerYear = medianSorted(slopesPerYear) ?? 0;
  const senPerDecade = round(senPerYear * 10, 3);

  const values = clean.map((p) => p.value);
  const ties = tieGroupCounts(values);
  const tieSum = ties.reduce((acc, t) => acc + t * (t - 1) * (2 * t + 5), 0);
  const rawVar = Math.max(0, (n * (n - 1) * (2 * n + 5) - tieSum) / 18);

  const pairs = (n * (n - 1)) / 2;
  const tiedPairs = ties.reduce((acc, t) => acc + (t * (t - 1)) / 2, 0);
  const denomTau = Math.sqrt(pairs * Math.max(1, pairs - tiedPairs));
  const tau = round(s / denomTau, 4);

  // Detrend series using Theil–Sen slope before estimating serial dependence (Hamed & Rao 1998)
  const t0 = clean[0].year;
  const detrended = clean.map((p) => p.value - senPerYear * (p.year - t0));
  const detrendedRanks = averageRanks(detrended);
  const r1 = round(lagAutocorrelation(detrended, 1), 3);

  const sigBound = 1.96 / Math.sqrt(n);
  const maxLag = Math.min(n - 3, 10);
  let sumAuto = 0;
  for (let k = 1; k <= maxLag; k += 1) {
    const rk = lagAutocorrelation(detrendedRanks, k);
    if (Math.abs(rk) > sigBound) {
      sumAuto += (n - k) * (n - k - 1) * (n - k - 2) * rk;
    }
  }
  const rawRatio = 1 + (2 / (n * (n - 1) * (n - 2))) * sumAuto;
  const effectiveRatio = round(Math.max(1, rawRatio), 3);
  const adjustedVar = rawVar * effectiveRatio;

  const zClassical = round(continuityZ(s, rawVar), 3);
  const pClassical = round(twoSidedNormalPValue(zClassical), 5);
  const zAdjusted = round(continuityZ(s, adjustedVar), 3);
  const pAdjusted = round(twoSidedNormalPValue(zAdjusted), 5);

  // Gilbert (1987) distribution-free 95% confidence interval on Sen's slope
  let senCi95PerDecade: [number, number] | null = null;
  if (slopesPerYear.length >= 3 && adjustedVar > 0) {
    const zCrit = 1.959964;
    const cAlpha = zCrit * Math.sqrt(adjustedVar);
    const totalPairs = slopesPerYear.length;
    const m1 = Math.max(0, Math.floor((totalPairs - cAlpha) / 2));
    const m2 = Math.min(totalPairs - 1, Math.ceil((totalPairs + cAlpha) / 2));
    senCi95PerDecade = [round(slopesPerYear[m1] * 10, 3), round(slopesPerYear[m2] * 10, 3)];
  }

  const sig05 = pAdjusted < alpha;
  const sig01 = pAdjusted < 0.01;
  const direction: TrendDirection = !sig05
    ? 'no-trend'
    : s > 0
      ? 'increasing'
      : 'decreasing';

  const wmoQualified = n >= 30;
  const spanText = `${clean[0].year}–${clean[n - 1].year} (n = ${n} complete years)`;
  const unitLabel = unit ? ` ${unit}/decade` : '/decade';
  const ciText = senCi95PerDecade
    ? ` [95% CI: ${senCi95PerDecade[0] >= 0 ? '+' : ''}${senCi95PerDecade[0]} to ${senCi95PerDecade[1] >= 0 ? '+' : ''}${senCi95PerDecade[1]}${unitLabel}]`
    : '';
  const wmoWarning = wmoQualified
    ? 'Window meets the >=30-year WMO climatological normal length.'
    : 'Sub-climatological window (<30 years): multi-year oscillations (ENSO / Indian Ocean Dipole) can influence monotonic statistics.';

  const interpretation = sig05
    ? `Statistically significant monotonic ${direction} trend detected over ${spanText} (Mann–Kendall tau = ${tau}, Z* = ${zAdjusted}, p = ${pAdjusted} < 0.05; Sen's slope ${senPerDecade >= 0 ? '+' : ''}${senPerDecade}${unitLabel}${ciText}). ${wmoWarning} Establishes monotonic direction in this dataset only — not causal attribution.`
    : `No statistically significant monotonic trend detected at alpha = 0.05 over ${spanText} (Mann–Kendall tau = ${tau}, Z* = ${zAdjusted}, p = ${pAdjusted}; Sen's slope ${senPerDecade >= 0 ? '+' : ''}${senPerDecade}${unitLabel}${ciText}). ${wmoWarning}`;

  return {
    testName: 'Mann–Kendall (Hamed–Rao autocorrelation-adjusted)',
    eligible: true,
    n,
    fromYear: clean[0].year,
    toYear: clean[n - 1].year,
    wmoClimatologyLength: wmoQualified,
    sStatistic: s,
    kendallTau: tau,
    rawVariance: round(rawVar, 2),
    effectiveSampleRatio: effectiveRatio,
    adjustedVariance: round(adjustedVar, 2),
    lag1Autocorrelation: r1,
    zClassical,
    pClassical,
    zAdjusted,
    pValue: pAdjusted,
    alpha,
    significantAt05: sig05,
    significantAt01: sig01,
    direction,
    senSlopePerDecade: senPerDecade,
    senCi95PerDecade,
    interpretation,
    methodologyNote:
      'Non-parametric Mann–Kendall test with tie-group adjustment, Hamed & Rao (1998) rank-autocorrelation variance inflation factor, and Gilbert (1987) distribution-free 95% confidence bounds.'
  };
}

/**
 * Seasonal Mann–Kendall Test & Seasonal Sen's Slope (Hirsch, Slack & Smith 1982).
 * Evaluates monotonic trend within each calendar month separately and combines
 * monthly S and Var(S), eliminating seasonal/monsoon phase confounding.
 */
export function seasonalMannKendallTest(
  monthlyRows: Array<{ year: number; month: number; value: number | null | undefined }>,
  unit = '',
  alpha = 0.05
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
  let totalVar = 0;
  let monthsEvaluated = 0;
  let totalObs = 0;
  const seasonalSlopesPerYear: number[] = [];

  for (let m = 1; m <= 12; m += 1) {
    const list = byMonth.get(m)!.sort((a, b) => a.year - b.year);
    const n = list.length;
    if (n < 5) continue;
    monthsEvaluated += 1;
    totalObs += n;

    let sm = 0;
    for (let i = 0; i < n - 1; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const diff = list[j].value - list[i].value;
        if (Math.abs(diff) > 1e-9) sm += diff > 0 ? 1 : -1;
        const dt = list[j].year - list[i].year;
        if (dt > 0) seasonalSlopesPerYear.push(diff / dt);
      }
    }
    const ties = tieGroupCounts(list.map((p) => p.value));
    const tieSum = ties.reduce((acc, t) => acc + t * (t - 1) * (2 * t + 5), 0);
    const varM = Math.max(0, (n * (n - 1) * (2 * n + 5) - tieSum) / 18);
    totalS += sm;
    totalVar += varM;
  }

  const yearsSpan = yearsSeen.size;
  if (monthsEvaluated < 6 || yearsSpan < 8 || totalVar <= 0) {
    return {
      testName: 'Seasonal Mann–Kendall (Hirsch, Slack & Smith 1982)',
      eligible: false,
      monthsEvaluated,
      totalObservations: totalObs,
      yearsSpan,
      sStatistic: null,
      variance: null,
      zScore: null,
      pValue: null,
      alpha,
      significantAt05: null,
      direction: 'insufficient-data',
      seasonalSenSlopePerDecade: null,
      interpretation: `Seasonal Mann–Kendall requires >= 8 years across >= 6 calendar months (found ${yearsSpan} years, ${monthsEvaluated} months).`
    };
  }

  seasonalSlopesPerYear.sort((a, b) => a - b);
  const seasonalSenDecade = round((medianSorted(seasonalSlopesPerYear) ?? 0) * 10, 3);
  const z = round(continuityZ(totalS, totalVar), 3);
  const p = round(twoSidedNormalPValue(z), 5);
  const sig05 = p < alpha;
  const direction: TrendDirection = !sig05 ? 'no-trend' : totalS > 0 ? 'increasing' : 'decreasing';
  const unitLabel = unit ? ` ${unit}/decade` : '/decade';

  return {
    testName: 'Seasonal Mann–Kendall (Hirsch, Slack & Smith 1982)',
    eligible: true,
    monthsEvaluated,
    totalObservations: totalObs,
    yearsSpan,
    sStatistic: totalS,
    variance: round(totalVar, 2),
    zScore: z,
    pValue: p,
    alpha,
    significantAt05: sig05,
    direction,
    seasonalSenSlopePerDecade: seasonalSenDecade,
    interpretation: sig05
      ? `Seasonal Mann–Kendall detects a ${direction} monotonic trend controlling for monthly seasonality (Z = ${z}, p = ${p} < 0.05; Seasonal Sen's slope ${seasonalSenDecade >= 0 ? '+' : ''}${seasonalSenDecade}${unitLabel} across ${totalObs} monthly observations).`
      : `Seasonal Mann–Kendall finds no statistically significant monotonic trend at alpha = 0.05 after controlling for monthly seasonality (Z = ${z}, p = ${p}; Seasonal Sen's slope ${seasonalSenDecade >= 0 ? '+' : ''}${seasonalSenDecade}${unitLabel}).`
  };
}

/**
 * Pettitt (1979) Non-Parametric Single Change-Point Test on annual series.
 */
export function pettittChangePointTest(
  series: Array<{ year: number; value: number }>,
  unit = '',
  alpha = 0.05
): PettittChangePointResult {
  const clean = series
    .filter((pt) => Number.isFinite(pt.year) && Number.isFinite(pt.value))
    .sort((a, b) => a.year - b.year);
  const n = clean.length;

  if (n < 12) {
    return {
      testName: 'Pettitt Non-Parametric Change-Point Test (1979)',
      eligible: false,
      n,
      changeYear: null,
      kStatistic: null,
      pValue: null,
      alpha,
      significantAt05: null,
      meanBefore: null,
      meanAfter: null,
      shiftMagnitude: null,
      interpretation: `Pettitt regime-shift test requires n >= 12 complete years (found n = ${n}).`
    };
  }

  let bestK = -1;
  let bestIdx = 0;
  for (let t = 0; t < n - 1; t += 1) {
    let ut = 0;
    for (let i = 0; i <= t; i += 1) {
      for (let j = t + 1; j < n; j += 1) {
        const diff = clean[i].value - clean[j].value;
        if (Math.abs(diff) > 1e-9) ut += diff > 0 ? 1 : -1;
      }
    }
    const absU = Math.abs(ut);
    if (absU > bestK) {
      bestK = absU;
      bestIdx = t;
    }
  }

  const pApprox = round(Math.min(1, 2 * Math.exp((-6 * bestK * bestK) / (n ** 3 + n ** 2))), 5);
  const sig05 = pApprox < alpha;
  const beforeSlice = clean.slice(0, bestIdx + 1).map((p) => p.value);
  const afterSlice = clean.slice(bestIdx + 1).map((p) => p.value);
  const meanBefore = round(beforeSlice.reduce((a, b) => a + b, 0) / beforeSlice.length, 3);
  const meanAfter = round(afterSlice.reduce((a, b) => a + b, 0) / afterSlice.length, 3);
  const shift = round(meanAfter - meanBefore, 3);
  const changeYear = clean[bestIdx + 1].year;
  const unitSuffix = unit ? ` ${unit}` : '';

  return {
    testName: 'Pettitt Non-Parametric Change-Point Test (1979)',
    eligible: true,
    n,
    changeYear,
    kStatistic: bestK,
    pValue: pApprox,
    alpha,
    significantAt05: sig05,
    meanBefore,
    meanAfter,
    shiftMagnitude: shift,
    interpretation: sig05
      ? `Statistically significant step shift detected around ${changeYear} (K_T = ${bestK}, p = ${pApprox} < 0.05): mean shifted from ${meanBefore}${unitSuffix} (${clean[0].year}–${clean[bestIdx].year}) to ${meanAfter}${unitSuffix} (${changeYear}–${clean[n - 1].year}, delta ${shift >= 0 ? '+' : ''}${shift}${unitSuffix}).`
      : `No statistically significant abrupt step change detected at alpha = 0.05 (largest candidate split ${changeYear}, K_T = ${bestK}, p = ${pApprox}).`
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
export function computeSeriesCorrelation(x: number[], y: number[], alpha = 0.05): SeriesCorrelationResult {
  const n = Math.min(x.length, y.length);
  if (n < 12) {
    return {
      eligible: false,
      overlappingPoints: n,
      effectiveDof: null,
      pearsonR: null,
      spearmanRho: null,
      pValueAdjusted: null,
      significantAt05: null,
      interpretation: `At least 12 overlapping observations are required for cross-series correlation (found ${n}).`
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
  const r1x = lagAutocorrelation(xs, 1);
  const r1y = lagAutocorrelation(ys, 1);
  const ratio = (1 - r1x * r1y) / Math.max(0.05, 1 + r1x * r1y);
  const nEff = Math.max(4, Math.min(n, n * ratio));
  const dof = round(nEff - 2, 1);

  // Fisher z / Student-t normal approximation using effective DOF
  const zFisher = 0.5 * Math.log((1 + Math.min(0.9999, Math.max(-0.9999, r))) / (1 - Math.min(0.9999, Math.max(-0.9999, r))));
  const zStat = Math.abs(zFisher) * Math.sqrt(Math.max(1, nEff - 3));
  const pVal = round(twoSidedNormalPValue(zStat), 5);
  const sig = pVal < alpha;

  return {
    eligible: true,
    overlappingPoints: n,
    effectiveDof: dof,
    pearsonR: r,
    spearmanRho: rho,
    pValueAdjusted: pVal,
    significantAt05: sig,
    interpretation: sig
      ? `Significant statistical association over ${n} overlapping observations (Pearson r = ${r}, Spearman rho = ${rho}, autocorrelation-adjusted N_eff = ${round(nEff, 1)}, p = ${pVal} < 0.05). Correlation does not establish causation.`
      : `No statistically significant linear association at alpha = 0.05 after accounting for serial autocorrelation (Pearson r = ${r}, Spearman rho = ${rho}, N_eff = ${round(nEff, 1)}, p = ${pVal}).`
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

/** Result of a two-sample t-test on independent samples. */
export interface TTestResult {
  testName: string; // "Student's t-test (equal variances)" | "Welch's t-test (unequal variances)"
  eligible: boolean; // n1 >= 2 && n2 >= 2 && finite variance
  n1: number;
  n2: number;
  mean1: number;
  mean2: number;
  meanDifference: number; // mean2 - mean1
  stdDev1: number | null;
  stdDev2: number | null;
  tStatistic: number | null;
  degreesOfFreedom: number | null;
  pValue: number | null;
  alpha: number;
  significantAt05: boolean | null;
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

function welchTTest(x: number[], y: number[], alpha = 0.05): TTestResult {
  const n1 = x.length;
  const n2 = y.length;
  if (n1 < 2 || n2 < 2) {
    return ineligibleTTest("Welch's t-test (unequal variances)", n1, n2, alpha);
  }
  const m1 = x.reduce((s, v) => s + v, 0) / n1;
  const m2 = y.reduce((s, v) => s + v, 0) / n2;
  const v1 = variance(x)!;
  const v2 = variance(y)!;
  const se1 = v1 / n1;
  const se2 = v2 / n2;
  const se = Math.sqrt(se1 + se2);
  const diff = m2 - m1;
  const tStat = se > 1e-12 ? diff / se : 0;
  // Welch–Satterthwaite degrees of freedom.
  const num = (se1 + se2) ** 2;
  const den = (se1 ** 2) / (n1 - 1) + (se2 ** 2) / (n2 - 1);
  const df = den > 0 ? num / den : n1 + n2 - 2;
  const pVal = twoSidedTPValue(tStat, df);
  const crit = tInv(1 - alpha / 2, df);
  const ciLow = diff - crit * se;
  const ciHigh = diff + crit * se;
  const sig = pVal < alpha;
  const equalVar = varianceEqualityPValue(v1, n1, v2, n2) >= alpha;
  return {
    testName: "Welch's t-test (unequal variances)",
    eligible: true,
    n1,
    n2,
    mean1: round(m1, 4),
    mean2: round(m2, 4),
    meanDifference: round(diff, 4),
    stdDev1: round(Math.sqrt(v1), 4),
    stdDev2: round(Math.sqrt(v2), 4),
    tStatistic: round(tStat, 4),
    degreesOfFreedom: round(df, 2),
    pValue: round(pVal, 5),
    alpha,
    significantAt05: sig,
    confidenceInterval95: [round(ciLow, 4), round(ciHigh, 4)],
    equalVariancesAssumed: false,
    assumptionsSatisfied: true,
    interpretation: tTestInterpretation(sig, diff, "Welch's t-test", tStat, df, pVal, alpha, ciLow, ciHigh)
  };
}

function studentTTest(x: number[], y: number[], alpha = 0.05): TTestResult {
  const n1 = x.length;
  const n2 = y.length;
  if (n1 < 2 || n2 < 2) {
    return ineligibleTTest("Student's t-test (equal variances)", n1, n2, alpha);
  }
  const m1 = x.reduce((s, v) => s + v, 0) / n1;
  const m2 = y.reduce((s, v) => s + v, 0) / n2;
  const v1 = variance(x)!;
  const v2 = variance(y)!;
  const pooled = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
  const se = Math.sqrt(pooled * (1 / n1 + 1 / n2));
  const diff = m2 - m1;
  const tStat = se > 1e-12 ? diff / se : 0;
  const df = n1 + n2 - 2;
  const pVal = twoSidedTPValue(tStat, df);
  const crit = tInv(1 - alpha / 2, df);
  const ciLow = diff - crit * se;
  const ciHigh = diff + crit * se;
  const sig = pVal < alpha;
  const equalVar = varianceEqualityPValue(v1, n1, v2, n2) >= alpha;
  return {
    testName: "Student's t-test (equal variances)",
    eligible: true,
    n1,
    n2,
    mean1: round(m1, 4),
    mean2: round(m2, 4),
    meanDifference: round(diff, 4),
    stdDev1: round(Math.sqrt(v1), 4),
    stdDev2: round(Math.sqrt(v2), 4),
    tStatistic: round(tStat, 4),
    degreesOfFreedom: round(df, 2),
    pValue: round(pVal, 5),
    alpha,
    significantAt05: sig,
    confidenceInterval95: [round(ciLow, 4), round(ciHigh, 4)],
    equalVariancesAssumed: true,
    assumptionsSatisfied: equalVar,
    interpretation: tTestInterpretation(sig, diff, "Student's t-test", tStat, df, pVal, alpha, ciLow, ciHigh)
  };
}

function ineligibleTTest(
  testName: string,
  n1: number,
  n2: number,
  alpha: number
): TTestResult {
  return {
    testName,
    eligible: false,
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
    alpha,
    significantAt05: null,
    confidenceInterval95: null,
    equalVariancesAssumed: false,
    assumptionsSatisfied: false,
    interpretation: `Insufficient sample size (n₁ = ${n1}, n₂ = ${n2}; minimum n = 2 per group) — t-test withheld to prevent unreliable inference.`
  };
}

function tTestInterpretation(
  sig: boolean,
  diff: number,
  testName: string,
  tStat: number,
  df: number,
  pVal: number,
  alpha: number,
  ciLow: number,
  ciHigh: number
): string {
  if (!sig) {
    return `No statistically significant difference between the two periods at alpha = ${alpha} (${testName}: t = ${tStat}, df = ${df}, p = ${pVal} >= ${alpha}; 95% CI on the difference [${ciLow >= 0 ? '+' : ''}${ciLow}, ${ciHigh >= 0 ? '+' : ''}${ciHigh}] includes zero). Direction of the raw mean difference alone is not evidence of a real shift.`;
  }
  const dir = diff > 0 ? 'higher' : 'lower';
  return `Statistically significant difference between the two periods at alpha = ${alpha} (${testName}: t = ${tStat}, df = ${df}, p = ${pVal} < ${alpha}); the recent period mean is ${dir} (mean difference ${diff >= 0 ? '+' : ''}${diff}, 95% CI [${ciLow >= 0 ? '+' : ''}${ciLow}, ${ciHigh >= 0 ? '+' : ''}${ciHigh}]). Establishes a difference within the observed data only — not causal attribution.`;
}

/**
 * Two-sample t-test on independent samples.
 *
 * Picks the appropriate test by checking the equal-variance assumption with an
 * F-test at `alpha`: when homoscedasticity is not rejected, reports Student's
 * pooled-variance t-test; otherwise reports Welch's unequal-variance t-test,
 * which remains valid under unequal variances and unequal sample sizes.
 * Never reports a causal claim — only whether the two observed samples differ.
 */
export function tTest(x: number[], y: number[], alpha = 0.05): TTestResult {
  const n1 = x.length;
  const n2 = y.length;
  if (n1 < 2 || n2 < 2) {
    return ineligibleTTest("t-test", n1, n2, alpha);
  }
  const v1 = variance(x);
  const v2 = variance(y);
  if (v1 === null || v2 === null || v1 <= 0 || v2 <= 0) {
    // Zero or undefined variance: Welch's still defined if one variance > 0;
    // if both are zero there is no difference to test.
    if (v1 === null || v2 === null || (v1 === 0 && v2 === 0)) {
      return ineligibleTTest("t-test", n1, n2, alpha);
    }
    return welchTTest(x, y, alpha);
  }
  const equalVar = varianceEqualityPValue(v1, n1, v2, n2) >= alpha;
  return equalVar ? studentTTest(x, y, alpha) : welchTTest(x, y, alpha);
}
