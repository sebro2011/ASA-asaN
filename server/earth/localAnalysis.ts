/**
 * Deterministic Earth Intelligence — the analysis that never needs a model.
 *
 * Every number here is computed from values that were actually retrieved from
 * NASA POWER and passed in the request bundle. Nothing is interpolated, filled
 * or guessed: a month with no value counts as missing, and a statistic is only
 * reported when the values behind it exist.
 *
 * The output deliberately separates what is *observed*, what this code *computed*
 * and what is *interpretation*, because those are different kinds of claim and a
 * reader has no other way to tell them apart in prose.
 *
 * Baseline policy (explicit, and repeated in the output):
 *   The anomaly baseline is the earliest 5 complete calendar years inside the
 *   retrieved window — NOT the WMO 1991–2020 normal. A short window cannot
 *   support a climate normal, so the label says exactly what was used.
 */

export type AnalystSectionKind = 'verified' | 'derived' | 'interpretation' | 'limitations' | 'gaps';

export interface AnalystSection {
  kind: AnalystSectionKind;
  title: string;
  bullets: string[];
}

export interface LocalSource {
  label: string;
  url: string;
  retrievedAt?: string;
  detail?: string;
}

export interface MonthlySeries {
  code: string;
  unit?: string;
  dates: string[];
  values: Array<number | null>;
}

export interface SeriesAnalysis {
  code: string;
  unit: string;
  /** Months carrying a usable value. */
  count: number;
  /** Months present in the window with no usable value. */
  missing: number;
  missingMonths: string[];
  firstMonth: string | null;
  lastMonth: string | null;
  mean: number | null;
  min: { value: number; month: string } | null;
  max: { value: number; month: string } | null;
  annual: Array<{ year: number; mean: number | null; complete: boolean }>;
  anomaly: {
    baselineLabel: string;
    baselineYears: number[];
    baselineValue: number | null;
    points: Array<{ year: number; anomaly: number }>;
    latest: { year: number; anomaly: number };
  } | null;
  seasonal: Array<{ season: string; months: number[]; mean: number | null; count: number }>;
  /** Only for rate-style variables (precipitation): monthly totals in mm. */
  monthlyTotals: Array<{ month: string; total: number }> | null;
  /** Period-over-period comparison, first half vs second half of the window. */
  periodComparison: {
    firstLabel: string;
    secondLabel: string;
    firstMean: number | null;
    secondMean: number | null;
    absoluteChange: number | null;
    percentChange: number | null;
  } | null;
}

export interface EarthAnalystContext {
  area?: { label?: string; latitude?: number; longitude?: number };
  dates?: string[];
  layers?: Array<Record<string, unknown>>;
  power?: {
    place?: string;
    latitude?: number;
    longitude?: number;
    months?: number;
    from?: string;
    to?: string;
    available?: string[];
    unavailable?: string[];
    sourceUrl?: string;
    retrievedAt?: string;
    stats?: Array<Record<string, unknown>>;
    series?: MonthlySeries[];
  } | null;
  dataGaps?: string[];
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SEASONS: Array<{ season: string; months: number[] }> = [
  { season: 'DJF (Dec–Feb)', months: [12, 1, 2] },
  { season: 'MAM (Mar–May)', months: [3, 4, 5] },
  { season: 'JJA (Jun–Aug)', months: [6, 7, 8] },
  { season: 'SON (Sep–Nov)', months: [9, 10, 11] },
];

export const ANOMALY_BASELINE_YEARS = 5;

/** Rounds for display without changing the stored value's ordering. */
function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function isUsable(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > -900;
}

function daysInMonth(month: string): number {
  const [year, mon] = month.split('-').map(Number);
  if (!year || !mon) return 30;
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

/** True for rate-per-day variables that a monthly total makes sense for. */
function isRatePerDay(unit?: string): boolean {
  return Boolean(unit && /\/\s*day/i.test(unit));
}

/**
 * Analyses one monthly series. Pure: same input, same output, no clock, no I/O.
 */
export function analyseSeries(series: MonthlySeries): SeriesAnalysis {
  const unit = series.unit || '';
  const dates = Array.isArray(series.dates) ? series.dates : [];
  const values = Array.isArray(series.values) ? series.values : [];

  const usable: Array<{ month: string; value: number }> = [];
  const missingMonths: string[] = [];
  dates.forEach((month, index) => {
    const value = values[index];
    if (isUsable(value)) usable.push({ month, value });
    else missingMonths.push(month);
  });

  const numbers = usable.map((entry) => entry.value);
  const overallMean = mean(numbers);

  let min: { value: number; month: string } | null = null;
  let max: { value: number; month: string } | null = null;
  for (const entry of usable) {
    if (!min || entry.value < min.value) min = entry;
    if (!max || entry.value > max.value) max = entry;
  }

  // Annual aggregates, complete calendar years only.
  const byYear = new Map<number, Array<{ month: string; value: number }>>();
  for (const entry of usable) {
    const year = Number(entry.month.slice(0, 4));
    if (!Number.isFinite(year)) continue;
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(entry);
  }
  const annual = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, entries]) => ({
      year,
      mean: entries.length === 12 ? round(mean(entries.map((entry) => entry.value))!, 3) : null,
      complete: entries.length === 12,
    }));

  const complete = annual.filter((entry) => entry.complete && entry.mean !== null) as Array<{ year: number; mean: number; complete: boolean }>;

  /**
   * An anomaly is a *difference from a reference period*, so the reference has to
   * leave at least one complete year to compare against — otherwise every anomaly
   * is trivially zero. The baseline is therefore the earliest N complete years,
   * N = min(5, complete years − 1), and the label always states which years were
   * used and that this is not a WMO normal.
   */
  const baselineCount = Math.min(ANOMALY_BASELINE_YEARS, Math.max(0, complete.length - 1));
  const baselineYears = complete.slice(0, baselineCount).map((entry) => entry.year);
  const baselineValue = baselineCount
    ? round(mean(complete.slice(0, baselineCount).map((entry) => entry.mean))!, 3)
    : null;
  const comparison = baselineValue !== null ? complete.slice(baselineCount) : [];
  const spanText =
    baselineYears.length === 1 ? `${baselineYears[0]}` : `${baselineYears[0]}–${baselineYears[baselineYears.length - 1]}`;
  const anomaly = baselineValue !== null && comparison.length
    ? {
        baselineLabel: `mean of the ${baselineCount === 1 ? 'single' : `first ${baselineCount}`} complete year${baselineCount === 1 ? '' : 's'} in the retrieved window (${spanText}); this is not the WMO 1991–2020 normal`,
        baselineYears,
        baselineValue,
        points: comparison.map((entry) => ({ year: entry.year, anomaly: round(entry.mean - baselineValue, 3) })),
        latest: { year: comparison[comparison.length - 1].year, anomaly: round(comparison[comparison.length - 1].mean - baselineValue, 3) },
      }
    : null;

  // Seasonal means from monthly values (month of year is all we need).
  const seasonal = SEASONS.map(({ season, months }) => {
    const entries = usable.filter((entry) => months.includes(Number(entry.month.slice(5, 7))));
    return {
      season,
      months,
      mean: entries.length ? round(mean(entries.map((entry) => entry.value))!, 3) : null,
      count: entries.length,
    };
  });

  const monthlyTotals = isRatePerDay(unit)
    ? usable.map((entry) => ({ month: entry.month, total: round(entry.value * daysInMonth(entry.month), 2) }))
    : null;

  // First half vs second half of the retrieved window (date-range comparison).
  let periodComparison: SeriesAnalysis['periodComparison'] = null;
  if (usable.length >= 4) {
    const midpoint = Math.ceil(usable.length / 2);
    const first = usable.slice(0, midpoint);
    const second = usable.slice(midpoint);
    const firstMean = mean(first.map((entry) => entry.value));
    const secondMean = mean(second.map((entry) => entry.value));
    if (firstMean !== null && secondMean !== null) {
      periodComparison = {
        firstLabel: `${first[0].month} → ${first[first.length - 1].month}`,
        secondLabel: `${second[0].month} → ${second[second.length - 1].month}`,
        firstMean: round(firstMean, 3),
        secondMean: round(secondMean, 3),
        absoluteChange: round(secondMean - firstMean, 3),
        // A percentage change from a near-zero baseline is meaningless, so it is
        // withheld rather than printed as an enormous number.
        percentChange: Math.abs(firstMean) < 1e-6 ? null : round(((secondMean - firstMean) / Math.abs(firstMean)) * 100, 2),
      };
    }
  }

  return {
    code: series.code,
    unit,
    count: usable.length,
    missing: missingMonths.length,
    missingMonths,
    firstMonth: usable[0]?.month ?? null,
    lastMonth: usable[usable.length - 1]?.month ?? null,
    mean: overallMean === null ? null : round(overallMean, 3),
    min: min ? { value: round(min.value, 3), month: min.month } : null,
    max: max ? { value: round(max.value, 3), month: max.month } : null,
    annual,
    anomaly,
    seasonal,
    monthlyTotals,
    periodComparison,
  };
}

export interface LocalAnalysis {
  series: SeriesAnalysis[];
  /** Months requested but absent from the series, per code. */
  coverage: { requested: number; analysed: number; missingCells: number } | null;
  notes: string[];
}

/** Analyses every series in the bundle. Never throws on odd input. */
export function analyseBundle(context: EarthAnalystContext): LocalAnalysis {
  const raw = Array.isArray(context.power?.series) ? context.power!.series! : [];
  const series = raw
    .filter((entry) => entry && typeof entry.code === 'string')
    .map((entry) => analyseSeries({ code: entry.code, unit: entry.unit, dates: entry.dates || [], values: entry.values || [] }));

  const analysed = series.reduce((total, entry) => total + entry.count, 0);
  const missingCells = series.reduce((total, entry) => total + entry.missing, 0);
  const notes: string[] = [];
  if (!raw.length) notes.push('The request carried no monthly series, so no statistic could be computed.');
  if (missingCells > 0) notes.push(`${missingCells} month/parameter cells had no usable value and were excluded from every statistic.`);

  return {
    series,
    coverage: raw.length ? { requested: analysed + missingCells, analysed, missingCells } : null,
    notes,
  };
}

const LABELS: Record<string, string> = {
  T2M: 'Air temperature at 2 m',
  PRECTOTCORR: 'Precipitation',
  RH2M: 'Relative humidity at 2 m',
  WS2M: 'Wind speed at 2 m',
  ALLSKY_SFC_SW_DWN: 'All-sky surface shortwave irradiance',
  T2M_MAX: 'Maximum air temperature at 2 m',
  T2M_MIN: 'Minimum air temperature at 2 m',
};

export function seriesLabel(code: string): string {
  return LABELS[code] || code;
}

function fmt(value: number | null | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'not available';
}

/**
 * The deterministic answer. Same section vocabulary as the model path, so the UI
 * can render either without a special case.
 */
export function buildLocalAnalystAnswer(
  question: string,
  context: EarthAnalystContext,
  options: { generatedAt?: string; analysis?: LocalAnalysis } = {}
): {
  sections: AnalystSection[];
  sources: LocalSource[];
  analysis: LocalAnalysis;
  evidenceSummary: string[];
  sufficientData: boolean;
} {
  const analysis = options.analysis || analyseBundle(context);
  const verified: string[] = [];
  const derived: string[] = [];
  const interpretation: string[] = [];
  const limitations: string[] = [];
  const gaps: string[] = [...(Array.isArray(context.dataGaps) ? context.dataGaps : [])];
  const evidence: string[] = [];

  const place = context.power?.place || context.area?.label || 'the selected point';
  const lat = context.power?.latitude ?? context.area?.latitude;
  const lon = context.power?.longitude ?? context.area?.longitude;

  verified.push(
    `Study area: ${place}${typeof lat === 'number' && typeof lon === 'number' ? ` at ${lat.toFixed(4)}°, ${lon.toFixed(4)}° (WGS84)` : ''}. ` +
      `Observation date(s) in view: ${Array.isArray(context.dates) && context.dates.length ? context.dates.join(', ') : 'none selected'}.`
  );

  if (context.power) {
    verified.push(
      `NASA POWER monthly archive retrieved through ${context.power.from || 'unknown'} → ${context.power.to || 'unknown'} ` +
        `(${context.power.months ?? 'unknown'} monthly records; dataset ${context.power.sourceUrl || 'not reported'}).`
    );
  }

  if (Array.isArray(context.power?.unavailable) && context.power!.unavailable!.length) {
    gaps.push(
      `POWER returned no usable values for ${context.power!.unavailable!.join(', ')}. These are reported as unavailable rather than estimated.`
    );
  }

  for (const entry of analysis.series) {
    const name = `${seriesLabel(entry.code)} (${entry.code})`;
    const unit = entry.unit || 'unit not reported';
    if (!entry.count) {
      gaps.push(`${name}: no usable monthly values were retrieved, so no statistic is reported.`);
      continue;
    }
    verified.push(
      `${name}: ${entry.count} usable monthly values, ${entry.firstMonth} → ${entry.lastMonth}` +
        (entry.missing ? `, ${entry.missing} month(s) without a value.` : '.')
    );
    derived.push(
      `${name}: mean ${fmt(entry.mean)} ${unit}; minimum ${fmt(entry.min?.value)} ${unit}` +
        (entry.min ? ` (${entry.min.month})` : '') +
        `; maximum ${fmt(entry.max?.value)} ${unit}` +
        (entry.max ? ` (${entry.max.month})` : '') +
        ' — computed from the retrieved monthly values only.'
    );

    if (entry.anomaly) {
      derived.push(
        `${name}: reference baseline ${fmt(entry.anomaly.baselineValue)} ${unit} — the ${entry.anomaly.baselineLabel}. ` +
          `The most recent complete year (${entry.anomaly.latest.year}) sits ` +
          `${entry.anomaly.latest.anomaly >= 0 ? '+' : ''}${fmt(entry.anomaly.latest.anomaly)} ${unit} from it.`
      );
      evidence.push(
        `${entry.code} anomalies vs ${entry.anomaly.baselineYears.join('/')} baseline (${unit}): ` +
          entry.anomaly.points.map((point) => `${point.year}:${point.anomaly >= 0 ? '+' : ''}${point.anomaly}`).join(', ')
      );
    } else if (entry.annual.filter((year) => year.complete).length < 2) {
      gaps.push(
        `${name}: ${entry.annual.filter((year) => year.complete).length} complete year(s) retrieved, so an anomaly against a reference period cannot be formed. A longer window is required.`
      );
    }

    if (entry.periodComparison) {
      derived.push(
        `${name}: first half of the window (${entry.periodComparison.firstLabel}) mean ${fmt(entry.periodComparison.firstMean)} ${unit} versus second half (${entry.periodComparison.secondLabel}) ${fmt(entry.periodComparison.secondMean)} ${unit} — ` +
          `difference ${entry.periodComparison.absoluteChange! >= 0 ? '+' : ''}${fmt(entry.periodComparison.absoluteChange)} ${unit}` +
          (entry.periodComparison.percentChange === null
            ? ' (percentage withheld: the first-half mean is effectively zero).'
            : `, ${entry.periodComparison.percentChange >= 0 ? '+' : ''}${fmt(entry.periodComparison.percentChange)} %.`)
      );
    }

    if (entry.seasonal.some((season) => season.count)) {
      derived.push(
        `${name} seasonal means: ` +
          entry.seasonal
            .filter((season) => season.mean !== null)
            .map((season) => `${season.season} ${fmt(season.mean)} ${unit}`)
            .join('; ') +
          '.'
      );
    }

    if (entry.monthlyTotals) {
      const totals = entry.monthlyTotals;
      const wettest = totals.reduce((best, entry2) => (best === null || entry2.total > best.total ? entry2 : best), null as null | { month: string; total: number });
      const driest = totals.reduce((best, entry2) => (best === null || entry2.total < best.total ? entry2 : best), null as null | { month: string; total: number });
      if (wettest && driest) {
        derived.push(
          `${name} monthly totals (rate × days in month): wettest ${wettest.month} ${fmt(wettest.total)} mm, driest ${driest.month} ${fmt(driest.total)} mm.`
        );
      }
    }

    if (entry.missingMonths.length) {
      gaps.push(
        `${name}: no usable value for ${entry.missingMonths.length} month(s) — ${entry.missingMonths.slice(0, 6).join(', ')}` +
          `${entry.missingMonths.length > 6 ? `, and ${entry.missingMonths.length - 6} more` : ''}. These months are excluded from every statistic.`
      );
    }

    limitations.push(
      `${name}: POWER values are satellite/re-analysis estimates for a ≈0.5° × 0.625° grid cell, not station measurements. ` +
        'This is a descriptive statistic of the retrieved series; no significance test, homogenisation or attribution has been applied.'
    );
  }

  if (!analysis.series.length && !context.power) {
    gaps.push('No NASA POWER archive was retrieved for this selection, so no climate-series statement can be made.');
  }

  const question2 = String(question || '');
  if (/trend|warming|increase|decrease|change/i.test(question2)) {
    interpretation.push(
      'A slope or a difference between two periods describes the retrieved window only. Without a longer baseline, a significance test and a change-point analysis, it must not be reported as a verified climate trend.'
    );
  }
  if (/correlat|because|cause|due to/i.test(question2)) {
    interpretation.push(
      'The retrieved series can show that two quantities move together over this window; that is not evidence that one causes the other. No attribution is claimed.'
    );
  }
  if (/image|imagery|satellite picture|compare dates/i.test(question2)) {
    interpretation.push(
      'Two images are not proof of a trend: cloud, sun angle, aerosols, sensor changes and processing can all produce a difference between dates.'
    );
  }
  if (!interpretation.length) {
    interpretation.push(
      'Interpretation is limited to reasoning over the values listed above. The Lab does not add external claims about this area.'
    );
  }

  limitations.push(
    'This answer was produced by the deterministic Local Earth Intelligence engine without a language model: it restates retrieved values and computes arithmetic on them only.'
  );

  const sources: LocalSource[] = [];
  if (context.power?.sourceUrl) {
    sources.push({
      label: 'NASA POWER monthly point API',
      url: String(context.power.sourceUrl),
      retrievedAt: context.power.retrievedAt,
      detail: `Monthly archive for ${place}`,
    });
  }
  for (const layer of Array.isArray(context.layers) ? context.layers : []) {
    if (layer?.serviceUrl) {
      sources.push({
        label: String(layer.title || layer.id || 'Imagery layer'),
        url: String(layer.serviceUrl),
        detail: layer.coverage ? String(layer.coverage) : undefined,
      });
    }
  }

  const rawSections: Array<{ kind: AnalystSectionKind; title: string; bullets: string[] }> = [
    { kind: 'verified', title: 'Verified observations', bullets: verified.slice(0, 6) },
    { kind: 'derived', title: 'Calculated results', bullets: derived.slice(0, 8) },
    { kind: 'interpretation', title: 'Scientific interpretation', bullets: interpretation.slice(0, 4) },
    { kind: 'limitations', title: 'Limitations and uncertainty', bullets: limitations.slice(0, 5) },
    { kind: 'gaps', title: 'Missing data', bullets: gaps.slice(0, 6) },
  ];
  const sections: AnalystSection[] = rawSections.map((section) => ({ ...section, bullets: section.bullets.filter(Boolean) }));

  const sufficientData = analysis.series.some((entry) => entry.count > 0);

  return { sections, sources, analysis, evidenceSummary: evidence, sufficientData };
}
