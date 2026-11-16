/**
 * COSMORA Climate Intelligence Engine.
 *
 * Pure, deterministic, scientifically transparent calculations over retrieved
 * NASA POWER monthly series. Every function obeys strict epistemic rules:
 *
 *   1. Missing months (`null`, `undefined`, `NaN`, or POWER fill sentinels)
 *      are NEVER interpolated, zero-filled, or carried forward.
 *   2. Annual trends, anomalies, and epoch comparisons use complete 12-month
 *      calendar years only so seasonal sampling bias cannot fabricate a shift.
 *   3. Descriptive slopes (OLS linear regression + non-parametric Theil–Sen
 *      median slope) are presented with explicit record-length caveats and
 *      never conflated with formal climate attribution or station homogenization.
 *   4. Rate-per-day precipitation (`PRECTOTCORR`, `mm/day`) is converted to
 *      monthly/annual `mm` totals using exact calendar `daysInMonth(year, month)`.
 */

import { daysInMonth, meanOf, parameterMeta } from './power';
import type { PowerDataset, PowerMonthlyRow } from './types';
import {
  computeHydrologicalIndices,
  mannKendallTest,
  oneSampleMeanCI95,
  pettittChangePointTest,
  seasonalMannKendallTest,
  tTest,
  twoSampleMeanDiffCI95,
  type HydrologicalIndexSummary,
  type MannKendallResult,
  type PettittChangePointResult,
  type SeasonalMannKendallResult,
  type TTestResult
} from './climateStatistics';

export {
  computeHydrologicalIndices,
  mannKendallTest,
  pettittChangePointTest,
  seasonalMannKendallTest,
  tTest,
  type HydrologicalIndexSummary,
  type MannKendallResult,
  type PettittChangePointResult,
  type SeasonalMannKendallResult,
  type TTestResult
};

export type DataQualityGrade = 'high' | 'moderate' | 'limited';

export interface MissingGapSpan {
  start: string;
  end: string;
  months: number;
}

export interface DataQualityReport {
  code: string;
  expectedMonths: number;
  retrievedMonths: number;
  missingMonths: number;
  completenessRatio: number;
  completenessPct: number;
  completeYears: number;
  partialYears: number;
  missingDates: string[];
  gapSpans: MissingGapSpan[];
  grade: DataQualityGrade;
  summary: string;
}

export interface OlsTrendStats {
  slopePerYear: number;
  slopePerDecade: number;
  intercept: number;
  rSquared: number;
  seSlopePerYear: number;
  /** Descriptive 95% t-interval on the decade slope when n >= 3 complete years. */
  ci95PerDecade: [number, number] | null;
  fromYear: number;
  toYear: number;
  years: number;
  fittedByYear: Record<number, number>;
}

export interface SenSlopeStats {
  slopePerYear: number;
  slopePerDecade: number;
  pairs: number;
  fromYear: number;
  toYear: number;
  years: number;
}

export interface ExtendedSeriesStats {
  code: string;
  label: string;
  unit: string;
  isRatePerDay: boolean;
  count: number;
  mean: number | null;
  median: number | null;
  stdDev: number | null;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  min: { value: number; date: string } | null;
  max: { value: number; date: string } | null;
  /** Complete-year annual totals in mm when unit is mm/day. */
  meanAnnualTotalMm: number | null;
  minAnnualTotalMm: { value: number; year: number } | null;
  maxAnnualTotalMm: { value: number; year: number } | null;
  olsTrend: OlsTrendStats | null;
  senSlope: SenSlopeStats | null;
  mannKendall: MannKendallResult;
  seasonalMannKendall: SeasonalMannKendallResult;
  pettittChangePoint: PettittChangePointResult;
  quality: DataQualityReport;
  caveat: string;
}

export type BaselineMode = 'earliest-5' | 'earliest-10' | 'wmo-1991-2020' | 'window-mean';

export interface AnnualAnomalyPoint {
  year: number;
  mean: number;
  anomaly: number;
  percentAnomaly: number | null;
  zAnomaly: number | null;
  totalMm: number | null;
  totalAnomalyMm: number | null;
  inBaseline: boolean;
}

export interface AnomalySeriesResult {
  code: string;
  unit: string;
  mode: BaselineMode;
  available: boolean;
  unavailableReason?: string;
  baselineLabel: string;
  baselineYears: number[];
  baselineMean: number | null;
  baselineStdDev: number | null;
  baselineMeanTotalMm: number | null;
  points: AnnualAnomalyPoint[];
  highest: AnnualAnomalyPoint | null;
  lowest: AnnualAnomalyPoint | null;
  latest: AnnualAnomalyPoint | null;
}

export interface MonthlyClimatologyPoint {
  month: number;
  monthLabel: string;
  count: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  stdDev: number | null;
  meanTotalMm: number | null;
}

export interface SeasonalRegimePoint {
  id: string;
  label: string;
  monthsLabel: string;
  months: number[];
  scheme: 'meteorological' | 'monsoon';
  count: number;
  mean: number | null;
  meanSeasonTotalMm: number | null;
  shareOfAnnualPct: number | null;
}

export interface HistoricalSplitComparison {
  code: string;
  unit: string;
  earlyLabel: string;
  recentLabel: string;
  earlyYears: number;
  recentYears: number;
  earlyMean: number;
  recentMean: number;
  delta: number;
  percentDelta: number | null;
  earlyStdDev: number | null;
  recentStdDev: number | null;
  earlyAnnualTotalMm: number | null;
  recentAnnualTotalMm: number | null;
  deltaAnnualTotalMm: number | null;
  tTest: TTestResult | null;
}

export interface UnusualObservation {
  date: string;
  year: number;
  month: number;
  monthLabel: string;
  code: string;
  unit: string;
  value: number;
  climatologyMean: number;
  climatologyStdDev: number;
  departure: number;
  zScore: number;
  direction: 'high' | 'low';
  monthlyTotalMm: number | null;
}

export interface LocationComparisonSummary {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  elevationMeters: number | null;
  completenessPct: number;
  completeYears: number;
  mean: number | null;
  median: number | null;
  stdDev: number | null;
  min: { value: number; date: string } | null;
  max: { value: number; date: string } | null;
  meanAnnualTotalMm: number | null;
  slopePerDecade: number | null;
  senSlopePerDecade: number | null;
  deltaFromPrimary: number | null;
  deltaAnnualTotalMmFromPrimary: number | null;
  // 95% uncertainty interval around this location's own annual mean.
  meanCI95: [number, number] | null;
  // 95% uncertainty interval around the difference of annual means versus the primary location.
  deltaFromPrimaryCI95: [number, number] | null;
}

export interface MultiLocationComparison {
  code: string;
  label: string;
  unit: string;
  isRatePerDay: boolean;
  overlappingYears: number[];
  summaries: LocationComparisonSummary[];
  annualRows: Array<Record<string, number | string | null>>;
  climatologyRows: Array<Record<string, number | string | null>>;
}

export const MONTH_SHORT_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
] as const;

const METEOROLOGICAL_SEASONS = [
  { id: 'DJF', label: 'DJF · Boreal Winter', monthsLabel: 'Dec–Feb', months: [12, 1, 2] },
  { id: 'MAM', label: 'MAM · Boreal Spring', monthsLabel: 'Mar–May', months: [3, 4, 5] },
  { id: 'JJA', label: 'JJA · Boreal Summer', monthsLabel: 'Jun–Aug', months: [6, 7, 8] },
  { id: 'SON', label: 'SON · Boreal Autumn', monthsLabel: 'Sep–Nov', months: [9, 10, 11] }
] as const;

const MONSOON_SEASONS = [
  { id: 'FIM', label: 'First Inter-Monsoon', monthsLabel: 'Mar–Apr', months: [3, 4] },
  { id: 'SWM', label: 'South-West Monsoon', monthsLabel: 'May–Sep', months: [5, 6, 7, 8, 9] },
  { id: 'SIM', label: 'Second Inter-Monsoon', monthsLabel: 'Oct–Nov', months: [10, 11] },
  { id: 'NEM', label: 'North-East Monsoon', monthsLabel: 'Dec–Feb', months: [12, 1, 2] }
] as const;

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isMmPerDay(code: string, unit: string): boolean {
  return code === 'PRECTOTCORR' || /mm\s*\/\s*day/i.test(unit);
}

/** Sample standard deviation (Bessel's correction, n - 1). Returns null when n < 2. */
export function sampleStdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = meanOf(values);
  if (avg === null) return null;
  const sumSq = values.reduce((acc, v) => acc + (v - avg) * (v - avg), 0);
  return Math.sqrt(sumSq / (values.length - 1));
}

/** Linear-interpolated quantile (type 7, R/NumPy standard) over finite values. */
export function quantile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const idx = Math.min(sorted.length - 1, Math.max(0, p * (sorted.length - 1)));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const weight = idx - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

/** Two-sided critical t_{0.975, df} approximation accurate to <0.005 for df >= 1. */
function criticalT95(df: number): number {
  const table: Record<number, number> = {
    1: 12.706,
    2: 4.303,
    3: 3.182,
    4: 2.776,
    5: 2.571,
    6: 2.447,
    7: 2.365,
    8: 2.306,
    9: 2.262,
    10: 2.228,
    12: 2.179,
    15: 2.131,
    20: 2.086,
    25: 2.06,
    30: 2.042,
    40: 2.021,
    60: 2.0
  };
  if (table[df]) return table[df];
  if (df > 60) return 1.96 + 2.4 / df;
  const keys = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (df > keys[i] && df < keys[i + 1]) {
      const ratio = (df - keys[i]) / (keys[i + 1] - keys[i]);
      return table[keys[i]] + ratio * (table[keys[i + 1]] - table[keys[i]]);
    }
  }
  return 1.96;
}

/** Enumerate expected YYYY-MM strings from the earliest to latest calendar year in view. */
function buildExpectedMonths(dataset: PowerDataset): string[] {
  if (!dataset.rows.length) return [];
  const firstYear = Math.min(dataset.startYear, dataset.rows[0].year);
  const lastRow = dataset.rows[dataset.rows.length - 1];
  // Do not count future months in the current calendar year that have not occurred yet.
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const endYear = Math.max(dataset.endYear, lastRow.year);

  const expected: string[] = [];
  for (let y = firstYear; y <= endYear; y += 1) {
    const maxMonth = y === currentYear ? Math.max(lastRow.year === y ? lastRow.month : 0, Math.min(12, currentMonth - 1)) : 12;
    const cap = y > currentYear ? 0 : maxMonth;
    for (let m = 1; m <= cap; m += 1) {
      expected.push(`${y}-${String(m).padStart(2, '0')}`);
    }
  }
  return expected;
}

/** Audit missing months, consecutive data gaps, and complete-year coverage. */
export function assessDataQuality(dataset: PowerDataset, code: string): DataQualityReport {
  const byDate = new Map<string, number>();
  const yearCounts = new Map<number, number>();

  for (const row of dataset.rows) {
    const val = row.values[code];
    if (!yearCounts.has(row.year)) yearCounts.set(row.year, 0);
    if (isFiniteNumber(val)) {
      byDate.set(row.date, val);
      yearCounts.set(row.year, (yearCounts.get(row.year) || 0) + 1);
    }
  }

  const expectedList = buildExpectedMonths(dataset);
  const missingDates: string[] = [];
  const gapSpans: MissingGapSpan[] = [];
  let activeGap: MissingGapSpan | null = null;

  for (const ym of expectedList) {
    if (!byDate.has(ym)) {
      missingDates.push(ym);
      if (!activeGap) {
        activeGap = { start: ym, end: ym, months: 1 };
      } else {
        activeGap.end = ym;
        activeGap.months += 1;
      }
    } else if (activeGap) {
      gapSpans.push(activeGap);
      activeGap = null;
    }
  }
  if (activeGap) gapSpans.push(activeGap);

  let completeYears = 0;
  let partialYears = 0;
  for (const [, count] of yearCounts) {
    if (count === 12) completeYears += 1;
    else if (count > 0) partialYears += 1;
  }

  const expectedMonths = Math.max(expectedList.length, byDate.size);
  const retrievedMonths = byDate.size;
  const missingMonths = Math.max(0, expectedMonths - retrievedMonths);
  const completenessRatio = expectedMonths > 0 ? retrievedMonths / expectedMonths : 0;
  const completenessPct = round(completenessRatio * 100, 1);

  let grade: DataQualityGrade = 'limited';
  if (completenessRatio >= 0.95 && completeYears >= 10) grade = 'high';
  else if (completenessRatio >= 0.8 && completeYears >= 3) grade = 'moderate';

  const summary =
    retrievedMonths === 0
      ? `No usable ${code} observations were returned for this window.`
      : `${retrievedMonths}/${expectedMonths} monthly records (${completenessPct}%), ${completeYears} complete calendar year(s)` +
        (partialYears ? `, ${partialYears} partial year(s) excluded from annual trends` : '') +
        (missingMonths ? `, ${missingMonths} missing month(s)` : ', zero missing months') +
        '.';

  return {
    code,
    expectedMonths,
    retrievedMonths,
    missingMonths,
    completenessRatio: round(completenessRatio, 4),
    completenessPct,
    completeYears,
    partialYears,
    missingDates,
    gapSpans,
    grade,
    summary
  };
}

interface CompleteYearRecord {
  year: number;
  mean: number;
  totalMm: number | null;
}

function extractCompleteYears(rows: PowerMonthlyRow[], code: string, ratePerDay: boolean): CompleteYearRecord[] {
  const buckets = new Map<number, { values: number[]; daySum: number; valueDaySum: number }>();
  for (const row of rows) {
    const v = row.values[code];
    if (!isFiniteNumber(v)) continue;
    if (!buckets.has(row.year)) buckets.set(row.year, { values: [], daySum: 0, valueDaySum: 0 });
    const bucket = buckets.get(row.year)!;
    const days = daysInMonth(row.year, row.month);
    bucket.values.push(v);
    bucket.daySum += days;
    bucket.valueDaySum += v * days;
  }

  const out: CompleteYearRecord[] = [];
  for (const [year, bucket] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    if (bucket.values.length === 12) {
      // Day-weighted annual mean: each month's value weighted by its exact
      // calendar length (28–31 days), so leap-year February is weighted fairly
      // and short months do not inflate the annual average.
      const m = bucket.daySum > 0 ? bucket.valueDaySum / bucket.daySum : null;
      if (m !== null) {
        out.push({
          year,
          mean: round(m, 4),
          totalMm: ratePerDay ? round(bucket.valueDaySum, 1) : null
        });
      }
    }
  }
  return out;
}

/** Ordinary Least Squares linear regression over complete calendar years. */
export function computeOlsTrend(completeYears: Array<{ year: number; mean: number }>): OlsTrendStats | null {
  if (completeYears.length < 2) return null;
  const n = completeYears.length;
  const xMean = completeYears.reduce((sum, p) => sum + p.year, 0) / n;
  const yMean = completeYears.reduce((sum, p) => sum + p.mean, 0) / n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of completeYears) {
    const dx = p.year - xMean;
    const dy = p.mean - yMean;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  const intercept = yMean - slope * xMean;
  const rSquared = syy > 0 ? Math.min(1, Math.max(0, (sxy * sxy) / (sxx * syy))) : 0;

  let sse = 0;
  const fittedByYear: Record<number, number> = {};
  for (const p of completeYears) {
    const fitted = intercept + slope * p.year;
    fittedByYear[p.year] = round(fitted, 3);
    const resid = p.mean - fitted;
    sse += resid * resid;
  }

  const seSlope = n > 2 ? Math.sqrt(Math.max(0, sse / (n - 2)) / sxx) : 0;
  const ci95PerDecade: [number, number] | null =
    n >= 3
      ? [
          round((slope - criticalT95(n - 2) * seSlope) * 10, 3),
          round((slope + criticalT95(n - 2) * seSlope) * 10, 3)
        ]
      : null;

  return {
    slopePerYear: round(slope, 5),
    slopePerDecade: round(slope * 10, 3),
    intercept: round(intercept, 4),
    rSquared: round(rSquared, 3),
    seSlopePerYear: round(seSlope, 5),
    ci95PerDecade,
    fromYear: completeYears[0].year,
    toYear: completeYears[n - 1].year,
    years: n,
    fittedByYear
  };
}

/** Non-parametric Theil–Sen median pairwise slope estimator (robust to outlier years). */
export function computeSenSlope(completeYears: Array<{ year: number; mean: number }>): SenSlopeStats | null {
  if (completeYears.length < 2) return null;
  const slopes: number[] = [];
  for (let i = 0; i < completeYears.length; i += 1) {
    for (let j = i + 1; j < completeYears.length; j += 1) {
      const dy = completeYears[j].mean - completeYears[i].mean;
      const dx = completeYears[j].year - completeYears[i].year;
      if (dx !== 0) slopes.push(dy / dx);
    }
  }
  const med = quantile(slopes, 0.5);
  if (med === null) return null;
  return {
    slopePerYear: round(med, 5),
    slopePerDecade: round(med * 10, 3),
    pairs: slopes.length,
    fromYear: completeYears[0].year,
    toYear: completeYears[completeYears.length - 1].year,
    years: completeYears.length
  };
}

/** Comprehensive statistical & data-quality intelligence for a single retrieved parameter. */
export function computeExtendedStats(dataset: PowerDataset, code: string): ExtendedSeriesStats {
  const meta = parameterMeta(code);
  const unit = dataset.stats[code]?.unit || meta?.unit || '';
  const label = meta?.label || code;
  const ratePerDay = isMmPerDay(code, unit);

  const validRows = dataset.rows.filter((r) => isFiniteNumber(r.values[code]));
  const values = validRows.map((r) => r.values[code] as number);
  const mean = meanOf(values);
  const median = quantile(values, 0.5);
  const stdDev = sampleStdDev(values);
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  const iqr = q1 !== null && q3 !== null ? round(q3 - q1, 3) : null;

  let min: ExtendedSeriesStats['min'] = null;
  let max: ExtendedSeriesStats['max'] = null;
  for (const row of validRows) {
    const val = row.values[code] as number;
    if (!min || val < min.value) min = { value: round(val, 3), date: row.date };
    if (!max || val > max.value) max = { value: round(val, 3), date: row.date };
  }

  const completeYears = extractCompleteYears(dataset.rows, code, ratePerDay);
  const annualTotals = completeYears.filter((y) => y.totalMm !== null) as Array<{ year: number; mean: number; totalMm: number }>;
  const meanAnnualTotalMm = annualTotals.length ? round(meanOf(annualTotals.map((y) => y.totalMm))!, 1) : null;
  let minAnnualTotalMm: ExtendedSeriesStats['minAnnualTotalMm'] = null;
  let maxAnnualTotalMm: ExtendedSeriesStats['maxAnnualTotalMm'] = null;
  for (const y of annualTotals) {
    if (!minAnnualTotalMm || y.totalMm < minAnnualTotalMm.value) minAnnualTotalMm = { value: y.totalMm, year: y.year };
    if (!maxAnnualTotalMm || y.totalMm > maxAnnualTotalMm.value) maxAnnualTotalMm = { value: y.totalMm, year: y.year };
  }

  const olsTrend = computeOlsTrend(completeYears);
  const senSlope = computeSenSlope(completeYears);
  const annualSeries = completeYears.map((y) => ({ year: y.year, value: y.mean }));
  const mannKendall = mannKendallTest(annualSeries, unit);
  const seasonalMannKendall = seasonalMannKendallTest(
    dataset.rows.map((r) => ({ year: r.year, month: r.month, value: r.values[code] })),
    unit
  );
  const pettittChangePoint = pettittChangePointTest(annualSeries, unit);
  const quality = assessDataQuality(dataset, code);

  const caveat =
    completeYears.length < 2
      ? 'Fewer than 2 complete calendar years are available; trend slopes are withheld to prevent seasonal sampling bias.'
      : completeYears.length < 15
        ? `Descriptive slope over ${completeYears.length} complete years (${completeYears[0].year}–${completeYears[completeYears.length - 1].year}). Records shorter than ~30 years strongly reflect interannual variability (ENSO, IOD, monsoon fluctuations) and do not establish long-term climate attribution.`
        : `Descriptive linear (OLS) and non-parametric (Theil–Sen) slopes over ${completeYears.length} complete years (${completeYears[0].year}–${completeYears[completeYears.length - 1].year}) from ~0.5°×0.625° gridded satellite/reanalysis estimates. No station homogenization or causal attribution is claimed.`;

  return {
    code,
    label,
    unit,
    isRatePerDay: ratePerDay,
    count: values.length,
    mean: mean !== null ? round(mean, 3) : null,
    median: median !== null ? round(median, 3) : null,
    stdDev: stdDev !== null ? round(stdDev, 3) : null,
    q1: q1 !== null ? round(q1, 3) : null,
    q3: q3 !== null ? round(q3, 3) : null,
    iqr,
    min,
    max,
    meanAnnualTotalMm,
    minAnnualTotalMm,
    maxAnnualTotalMm,
    olsTrend,
    senSlope,
    mannKendall,
    seasonalMannKendall,
    pettittChangePoint,
    quality,
    caveat
  };
}

/**
 * Compute annual temperature or rainfall anomalies against an explicit, named
 * reference baseline. Never claims WMO 1991–2020 unless 1991–2020 years are
 * actually present in the retrieved window.
 */
export function computeAnomalies(
  dataset: PowerDataset,
  code: string,
  mode: BaselineMode = 'earliest-5'
): AnomalySeriesResult {
  const meta = parameterMeta(code);
  const unit = dataset.stats[code]?.unit || meta?.unit || '';
  const ratePerDay = isMmPerDay(code, unit);
  const completeYears = extractCompleteYears(dataset.rows, code, ratePerDay);

  if (completeYears.length < 2) {
    return {
      code,
      unit,
      mode,
      available: false,
      unavailableReason: 'At least 2 complete 12-month calendar years are required to compute annual anomalies.',
      baselineLabel: 'Unavailable (< 2 complete years)',
      baselineYears: [],
      baselineMean: null,
      baselineStdDev: null,
      baselineMeanTotalMm: null,
      points: [],
      highest: null,
      lowest: null,
      latest: null
    };
  }

  let baselineSubset: CompleteYearRecord[] = [];
  let baselineLabel = '';

  if (mode === 'wmo-1991-2020') {
    baselineSubset = completeYears.filter((y) => y.year >= 1991 && y.year <= 2020);
    if (baselineSubset.length < 5) {
      return {
        code,
        unit,
        mode,
        available: false,
        unavailableReason: `Only ${baselineSubset.length} complete year(s) from 1991–2020 exist in the selected ${dataset.startYear}–${dataset.endYear} window. Expand the coverage range to 30y or 1981→, or choose a retrieved-window baseline.`,
        baselineLabel: 'WMO 1991–2020 unavailable in current window',
        baselineYears: baselineSubset.map((y) => y.year),
        baselineMean: null,
        baselineStdDev: null,
        baselineMeanTotalMm: null,
        points: [],
        highest: null,
        lowest: null,
        latest: null
      };
    }
    const span = `${baselineSubset[0].year}–${baselineSubset[baselineSubset.length - 1].year}`;
    baselineLabel =
      baselineSubset.length === 30
        ? 'WMO 1991–2020 standard reference period (30 complete years)'
        : `1991–2020 overlap in retrieved window (${baselineSubset.length} complete years, ${span})`;
  } else if (mode === 'earliest-10') {
    const n = Math.min(10, Math.max(1, completeYears.length - 1));
    baselineSubset = completeYears.slice(0, n);
    const span = n === 1 ? `${baselineSubset[0].year}` : `${baselineSubset[0].year}–${baselineSubset[n - 1].year}`;
    baselineLabel = `Earliest ${n} complete year${n === 1 ? '' : 's'} in window (${span}; not WMO 1991–2020)`;
  } else if (mode === 'window-mean') {
    baselineSubset = completeYears;
    const span = `${completeYears[0].year}–${completeYears[completeYears.length - 1].year}`;
    baselineLabel = `Full retrieved-window mean (${completeYears.length} complete years, ${span})`;
  } else {
    const n = Math.min(5, Math.max(1, completeYears.length - 1));
    baselineSubset = completeYears.slice(0, n);
    const span = n === 1 ? `${baselineSubset[0].year}` : `${baselineSubset[0].year}–${baselineSubset[n - 1].year}`;
    baselineLabel = `Earliest ${n} complete year${n === 1 ? '' : 's'} in window (${span}; not WMO 1991–2020)`;
  }

  const baselineMeanRaw = meanOf(baselineSubset.map((y) => y.mean))!;
  const baselineMean = round(baselineMeanRaw, 3);
  const baselineSdRaw = sampleStdDev(baselineSubset.map((y) => y.mean));
  const baselineStdDev = baselineSdRaw !== null ? round(baselineSdRaw, 3) : null;
  const baselineTotals = baselineSubset.filter((y) => y.totalMm !== null).map((y) => y.totalMm as number);
  const baselineMeanTotalMm = baselineTotals.length ? round(meanOf(baselineTotals)!, 1) : null;
  const baselineYearSet = new Set(baselineSubset.map((y) => y.year));

  const points: AnnualAnomalyPoint[] = completeYears.map((y) => {
    const anomaly = round(y.mean - baselineMeanRaw, 3);
    const percentAnomaly =
      Math.abs(baselineMeanRaw) >= 0.05 && (ratePerDay || baselineMeanRaw > 0)
        ? round(((y.mean - baselineMeanRaw) / Math.abs(baselineMeanRaw)) * 100, 1)
        : null;
    const zAnomaly =
      baselineSdRaw !== null && baselineSdRaw > 1e-6 ? round((y.mean - baselineMeanRaw) / baselineSdRaw, 2) : null;
    const totalAnomalyMm =
      y.totalMm !== null && baselineMeanTotalMm !== null ? round(y.totalMm - baselineMeanTotalMm, 1) : null;

    return {
      year: y.year,
      mean: round(y.mean, 3),
      anomaly,
      percentAnomaly,
      zAnomaly,
      totalMm: y.totalMm,
      totalAnomalyMm,
      inBaseline: baselineYearSet.has(y.year)
    };
  });

  let highest: AnnualAnomalyPoint | null = null;
  let lowest: AnnualAnomalyPoint | null = null;
  for (const pt of points) {
    if (!highest || pt.anomaly > highest.anomaly) highest = pt;
    if (!lowest || pt.anomaly < lowest.anomaly) lowest = pt;
  }

  return {
    code,
    unit,
    mode,
    available: true,
    baselineLabel,
    baselineYears: baselineSubset.map((y) => y.year),
    baselineMean,
    baselineStdDev,
    baselineMeanTotalMm,
    points,
    highest,
    lowest,
    latest: points[points.length - 1] || null
  };
}

/** Compute 12-month seasonal cycle (Jan–Dec climatology) strictly from retrieved months. */
export function computeMonthlyClimatology(dataset: PowerDataset, code: string): MonthlyClimatologyPoint[] {
  const meta = parameterMeta(code);
  const unit = dataset.stats[code]?.unit || meta?.unit || '';
  const ratePerDay = isMmPerDay(code, unit);

  return MONTH_SHORT_LABELS.map((monthLabel, index) => {
    const month = index + 1;
    const matching = dataset.rows.filter((r) => r.month === month && isFiniteNumber(r.values[code]));
    const vals = matching.map((r) => r.values[code] as number);
    const avg = meanOf(vals);
    const sd = sampleStdDev(vals);
    const totals = ratePerDay ? matching.map((r) => (r.values[code] as number) * daysInMonth(r.year, r.month)) : [];
    const meanTotal = totals.length ? meanOf(totals) : null;

    return {
      month,
      monthLabel,
      count: vals.length,
      mean: avg !== null ? round(avg, 2) : null,
      min: vals.length ? round(Math.min(...vals), 2) : null,
      max: vals.length ? round(Math.max(...vals), 2) : null,
      stdDev: sd !== null ? round(sd, 2) : null,
      meanTotalMm: meanTotal !== null ? round(meanTotal, 1) : null
    };
  });
}

/** Compute meteorological (DJF/MAM/JJA/SON) and South Asian Monsoon seasonal summaries. */
export function computeSeasonalBreakdown(dataset: PowerDataset, code: string): SeasonalRegimePoint[] {
  const meta = parameterMeta(code);
  const unit = dataset.stats[code]?.unit || meta?.unit || '';
  const ratePerDay = isMmPerDay(code, unit);
  const clim = computeMonthlyClimatology(dataset, code);
  const annualClimTotalMm = ratePerDay
    ? clim.reduce((acc, c) => acc + (c.meanTotalMm || 0), 0)
    : 0;

  const build = (
    defs: readonly { id: string; label: string; monthsLabel: string; months: readonly number[] }[],
    scheme: 'meteorological' | 'monsoon'
  ): SeasonalRegimePoint[] =>
    defs.map((def) => {
      const rows = dataset.rows.filter((r) => def.months.includes(r.month) && isFiniteNumber(r.values[code]));
      const vals = rows.map((r) => r.values[code] as number);
      const avg = meanOf(vals);
      const seasonTotalMm = ratePerDay
        ? def.months.reduce((acc, m) => acc + (clim[m - 1]?.meanTotalMm || 0), 0)
        : null;
      const share =
        ratePerDay && seasonTotalMm !== null && annualClimTotalMm > 0
          ? round((seasonTotalMm / annualClimTotalMm) * 100, 1)
          : null;

      return {
        id: def.id,
        label: def.label,
        monthsLabel: def.monthsLabel,
        months: [...def.months],
        scheme,
        count: vals.length,
        mean: avg !== null ? round(avg, 2) : null,
        meanSeasonTotalMm: seasonTotalMm !== null ? round(seasonTotalMm, 1) : null,
        shareOfAnnualPct: share
      };
    });

  return [...build(METEOROLOGICAL_SEASONS, 'meteorological'), ...build(MONSOON_SEASONS, 'monsoon')];
}

/** Compare earlier vs recent complete calendar years in the retrieved record. */
export function computeHistoricalSplit(
  dataset: PowerDataset,
  code: string,
  splitYear?: number
): HistoricalSplitComparison | null {
  const meta = parameterMeta(code);
  const unit = dataset.stats[code]?.unit || meta?.unit || '';
  const ratePerDay = isMmPerDay(code, unit);
  const completeYears = extractCompleteYears(dataset.rows, code, ratePerDay);
  if (completeYears.length < 4) return null;

  let early: CompleteYearRecord[];
  let recent: CompleteYearRecord[];
  if (splitYear && Number.isFinite(splitYear)) {
    early = completeYears.filter((y) => y.year < splitYear);
    recent = completeYears.filter((y) => y.year >= splitYear);
    if (early.length < 2 || recent.length < 2) {
      const mid = Math.floor(completeYears.length / 2);
      early = completeYears.slice(0, mid);
      recent = completeYears.slice(mid);
    }
  } else {
    const mid = Math.floor(completeYears.length / 2);
    early = completeYears.slice(0, mid);
    recent = completeYears.slice(mid);
  }

  const earlyMean = meanOf(early.map((y) => y.mean))!;
  const recentMean = meanOf(recent.map((y) => y.mean))!;
  const delta = recentMean - earlyMean;
  const percentDelta =
    Math.abs(earlyMean) >= 0.05 && (ratePerDay || earlyMean > 0)
      ? round((delta / Math.abs(earlyMean)) * 100, 1)
      : null;

  const earlyTotals = early.filter((y) => y.totalMm !== null).map((y) => y.totalMm as number);
  const recentTotals = recent.filter((y) => y.totalMm !== null).map((y) => y.totalMm as number);
  const earlyTotalMean = earlyTotals.length ? meanOf(earlyTotals) : null;
  const recentTotalMean = recentTotals.length ? meanOf(recentTotals) : null;

  const earlyValues = early.map((y) => y.mean).filter((v): v is number => v !== null);
  const recentValues = recent.map((y) => y.mean).filter((v): v is number => v !== null);
  const splitTTest = tTest(earlyValues, recentValues, 0.05);

  return {
    code,
    unit,
    earlyLabel: `${early[0].year}–${early[early.length - 1].year}`,
    recentLabel: `${recent[0].year}–${recent[recent.length - 1].year}`,
    earlyYears: early.length,
    recentYears: recent.length,
    earlyMean: round(earlyMean, 3),
    recentMean: round(recentMean, 3),
    delta: round(delta, 3),
    percentDelta,
    earlyStdDev: sampleStdDev(early.map((y) => y.mean)) !== null ? round(sampleStdDev(early.map((y) => y.mean))!, 3) : null,
    recentStdDev: sampleStdDev(recent.map((y) => y.mean)) !== null ? round(sampleStdDev(recent.map((y) => y.mean))!, 3) : null,
    earlyAnnualTotalMm: earlyTotalMean !== null ? round(earlyTotalMean, 1) : null,
    recentAnnualTotalMm: recentTotalMean !== null ? round(recentTotalMean, 1) : null,
    deltaAnnualTotalMm:
      earlyTotalMean !== null && recentTotalMean !== null ? round(recentTotalMean - earlyTotalMean, 1) : null,
    tTest: splitTTest
  };
}

/**
 * Identify retrieved months that stand >= zThreshold standard deviations away
 * from their own calendar-month climatology (deseasonalized monthly z-score).
 * Requires >= 5 observations for that calendar month so tiny samples cannot
 * generate spurious extremes.
 */
export function detectUnusualObservations(
  dataset: PowerDataset,
  code: string,
  zThreshold = 2.0
): UnusualObservation[] {
  const meta = parameterMeta(code);
  const unit = dataset.stats[code]?.unit || meta?.unit || '';
  const ratePerDay = isMmPerDay(code, unit);
  const clim = computeMonthlyClimatology(dataset, code);

  const out: UnusualObservation[] = [];
  for (const row of dataset.rows) {
    const val = row.values[code];
    if (!isFiniteNumber(val)) continue;
    const c = clim[row.month - 1];
    if (!c || c.count < 5 || c.mean === null || c.stdDev === null || c.stdDev <= 1e-6) continue;
    const departure = val - c.mean;
    const z = departure / c.stdDev;
    if (Math.abs(z) >= zThreshold) {
      out.push({
        date: row.date,
        year: row.year,
        month: row.month,
        monthLabel: c.monthLabel,
        code,
        unit,
        value: round(val, 3),
        climatologyMean: c.mean,
        climatologyStdDev: c.stdDev,
        departure: round(departure, 3),
        zScore: round(z, 2),
        direction: z > 0 ? 'high' : 'low',
        monthlyTotalMm: ratePerDay ? round(val * daysInMonth(row.year, row.month), 1) : null
      });
    }
  }

  return out.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}

/** Compare 2–4 retrieved NASA POWER locations on a shared parameter. */
export function compareLocations(
  entries: Array<{ id: string; label: string; dataset: PowerDataset }>,
  code: string
): MultiLocationComparison {
  const meta = parameterMeta(code);
  const unit = entries[0]?.dataset.stats[code]?.unit || meta?.unit || '';
  const label = meta?.label || code;
  const ratePerDay = isMmPerDay(code, unit);

  const perEntry = entries.map((entry) => {
    const ext = computeExtendedStats(entry.dataset, code);
    const completeYears = extractCompleteYears(entry.dataset.rows, code, ratePerDay);
    const clim = computeMonthlyClimatology(entry.dataset, code);
    return { entry, ext, completeYears, clim };
  });

  const primaryMean = perEntry[0]?.ext.mean ?? null;
  const primaryTotal = perEntry[0]?.ext.meanAnnualTotalMm ?? null;
  const primaryAnnualMeans = perEntry[0]?.completeYears.map((y) => y.mean) ?? [];

  const summaries: LocationComparisonSummary[] = perEntry.map(({ entry, ext, completeYears }) => {
    // Annual means are the unit of comparison: day-weighted complete-year means.
    const annualMeans = completeYears.map((y) => y.mean);
    const meanCI = oneSampleMeanCI95(annualMeans);
    const deltaCI = twoSampleMeanDiffCI95(primaryAnnualMeans, annualMeans);
    return {
      id: entry.id,
    label: entry.label,
    latitude: entry.dataset.latitude,
    longitude: entry.dataset.longitude,
    elevationMeters: entry.dataset.elevationMeters ?? null,
    completenessPct: ext.quality.completenessPct,
    completeYears: completeYears.length,
    mean: ext.mean,
    median: ext.median,
    stdDev: ext.stdDev,
    min: ext.min,
    max: ext.max,
    meanAnnualTotalMm: ext.meanAnnualTotalMm,
    slopePerDecade: ext.olsTrend ? ext.olsTrend.slopePerDecade : null,
    senSlopePerDecade: ext.senSlope ? ext.senSlope.slopePerDecade : null,
    deltaFromPrimary:
      ext.mean !== null && primaryMean !== null ? round(ext.mean - primaryMean, 3) : null,
    deltaAnnualTotalMmFromPrimary:
      ext.meanAnnualTotalMm !== null && primaryTotal !== null ? round(ext.meanAnnualTotalMm - primaryTotal, 1) : null,
    meanCI95: meanCI ? [round(meanCI.ciLow, 3), round(meanCI.ciHigh, 3)] : null,
    deltaFromPrimaryCI95: deltaCI ? [round(deltaCI.ciLow, 3), round(deltaCI.ciHigh, 3)] : null
    };
  });

  const allYearSets = perEntry.map(({ completeYears }) => new Set(completeYears.map((y) => y.year)));
  const unionYears = [...new Set(perEntry.flatMap(({ completeYears }) => completeYears.map((y) => y.year)))].sort(
    (a, b) => a - b
  );
  const overlappingYears = unionYears.filter((year) => allYearSets.every((set) => set.has(year)));

  const annualRows = unionYears.map((year) => {
    const row: Record<string, number | string | null> = { year };
    for (const { entry, completeYears } of perEntry) {
      const found = completeYears.find((y) => y.year === year);
      row[entry.id] = found ? round(found.mean, 3) : null;
      if (ratePerDay) {
        row[`${entry.id}_mm`] = found?.totalMm ?? null;
      }
    }
    return row;
  });

  const climatologyRows = MONTH_SHORT_LABELS.map((monthLabel, idx) => {
    const row: Record<string, number | string | null> = { month: idx + 1, monthLabel };
    for (const { entry, clim } of perEntry) {
      const c = clim[idx];
      row[entry.id] = c?.mean ?? null;
      if (ratePerDay) {
        row[`${entry.id}_mm`] = c?.meanTotalMm ?? null;
      }
    }
    return row;
  });

  return {
    code,
    label,
    unit,
    isRatePerDay: ratePerDay,
    overlappingYears,
    summaries,
    annualRows,
    climatologyRows
  };
}

/** Export multi-location annual & monthly comparison as RFC-4180 CSV. */
export function multiLocationCsv(
  entries: Array<{ id: string; label: string; dataset: PowerDataset }>,
  code: string
): string {
  const escape = (val: unknown): string => {
    const text = val === null || val === undefined ? '' : String(val);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const comp = compareLocations(entries, code);
  const headers = [
    'year',
    ...entries.map((e) => `${e.label} (${code} ${comp.unit})`),
    ...(comp.isRatePerDay ? entries.map((e) => `${e.label} (annual_total_mm)`) : [])
  ];
  const lines = [headers.map(escape).join(',')];
  for (const row of comp.annualRows) {
    const vals = [
      row.year,
      ...entries.map((e) => row[e.id] ?? ''),
      ...(comp.isRatePerDay ? entries.map((e) => row[`${e.id}_mm`] ?? '') : [])
    ];
    lines.push(vals.map(escape).join(','));
  }
  return lines.join('\n');
}

/** Derive SPI-12 hydrological drought/wetness indices and MERRA-2 soil moisture coupling for a POWER dataset. */
export function computeDatasetHydrology(dataset: PowerDataset): HydrologicalIndexSummary {
  return computeHydrologicalIndices(
    dataset.rows.map((r) => ({
      date: r.date,
      year: r.year,
      month: r.month,
      precipMmPerDay: isFiniteNumber(r.values.PRECTOTCORR) ? (r.values.PRECTOTCORR as number) : null,
      soilTop: isFiniteNumber(r.values.GWETTOP) ? (r.values.GWETTOP as number) : null,
      soilRoot: isFiniteNumber(r.values.GWETROOT) ? (r.values.GWETROOT as number) : null
    }))
  );
}

