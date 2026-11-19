/**
 * Deterministic Earth Intelligence 2.0 — the analysis that never needs a model.
 *
 * Every number here is computed from values that were actually retrieved from
 * NASA POWER and passed in the request bundle. Nothing is interpolated, filled
 * or guessed: a month with no value counts as missing, and a statistic is only
 * reported when the values behind it exist.
 *
 * Baseline policy (explicit, and repeated in the output):
 *   The anomaly baseline is the earliest 5 complete calendar years inside the
 *   retrieved window — NOT the WMO 1991–2020 normal. A short window cannot
 *   support a climate normal, so the label says exactly what was used.
 *
 * Multilingual support:
 *   Supports English (`en`), Sinhala (`si`), and Tamil (`ta`) deterministic
 *   responses while keeping dataset identifiers, ISO dates, and SI units exact.
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

export interface UnusualMonthSummary {
  month: string;
  value: number;
  climatologyMean: number;
  zScore: number;
  direction: 'high' | 'low';
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
  stdDev: number | null;
  min: { value: number; month: string } | null;
  max: { value: number; month: string } | null;
  annual: Array<{ year: number; mean: number | null; complete: boolean }>;
  olsSlopePerDecade: number | null;
  senSlopePerDecade: number | null;
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
  /** Deseasonalized monthly extremes (|z| >= 2.0 vs same calendar month). */
  unusualMonths: UnusualMonthSummary[];
}

export interface ComparisonLocationContext {
  label?: string;
  latitude?: number;
  longitude?: number;
  months?: number;
  from?: string;
  to?: string;
  sourceUrl?: string;
  retrievedAt?: string;
  series?: MonthlySeries[];
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
  comparisonLocations?: ComparisonLocationContext[];
  dataGaps?: string[];
}

const SEASONS: Array<{ season: string; months: number[] }> = [
  { season: 'DJF (Dec–Feb)', months: [12, 1, 2] },
  { season: 'MAM (Mar–May)', months: [3, 4, 5] },
  { season: 'JJA (Jun–Aug)', months: [6, 7, 8] },
  { season: 'SON (Sep–Nov)', months: [9, 10, 11] }
];

export const ANOMALY_BASELINE_YEARS = 5;

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sampleSd(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = mean(values);
  if (avg === null) return null;
  const sq = values.reduce((acc, v) => acc + (v - avg) * (v - avg), 0);
  return Math.sqrt(sq / (values.length - 1));
}

function medianOf(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function isUsable(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > -900;
}

function daysInMonth(month: string): number {
  const [year, mon] = month.split('-').map(Number);
  if (!year || !mon) return 30;
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

function isRatePerDay(unit?: string): boolean {
  return Boolean(unit && /\/\s*day/i.test(unit));
}

/**
 * The dataset label for a verified bullet.
 *
 * A POWER request URL carries every parameter, the community code and the
 * window: ~220 characters with no spaces in it. Putting that in a bullet made the
 * answer unreadable and, in the UI, pushed unbreakable text out of its column.
 * The bullet names the host; the full query is recorded in the evidence block,
 * where it can be read and copied (`sources[].url`).
 */
function datasetHost(url: string | undefined | null): string {
  if (!url) return 'not reported';
  try {
    return new URL(url).host || 'not reported';
  } catch {
    return 'not reported';
  }
}

function computeOlsDecadeSlope(complete: Array<{ year: number; mean: number }>): number | null {
  if (complete.length < 2) return null;
  const n = complete.length;
  const xm = complete.reduce((s, p) => s + p.year, 0) / n;
  const ym = complete.reduce((s, p) => s + p.mean, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of complete) {
    sxx += (p.year - xm) * (p.year - xm);
    sxy += (p.year - xm) * (p.mean - ym);
  }
  return sxx === 0 ? null : round((sxy / sxx) * 10, 3);
}

function computeSenDecadeSlope(complete: Array<{ year: number; mean: number }>): number | null {
  if (complete.length < 2) return null;
  const slopes: number[] = [];
  for (let i = 0; i < complete.length; i += 1) {
    for (let j = i + 1; j < complete.length; j += 1) {
      const dx = complete[j].year - complete[i].year;
      if (dx !== 0) slopes.push((complete[j].mean - complete[i].mean) / dx);
    }
  }
  const med = medianOf(slopes);
  return med === null ? null : round(med * 10, 3);
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
  const overallSd = sampleSd(numbers);

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
      complete: entries.length === 12
    }));

  const complete = annual.filter((entry) => entry.complete && entry.mean !== null) as Array<{
    year: number;
    mean: number;
    complete: boolean;
  }>;

  const olsSlopePerDecade = computeOlsDecadeSlope(complete);
  const senSlopePerDecade = computeSenDecadeSlope(complete);

  const baselineCount = Math.min(ANOMALY_BASELINE_YEARS, Math.max(0, complete.length - 1));
  const baselineYears = complete.slice(0, baselineCount).map((entry) => entry.year);
  const baselineValue = baselineCount
    ? round(mean(complete.slice(0, baselineCount).map((entry) => entry.mean))!, 3)
    : null;
  const comparison = baselineValue !== null ? complete.slice(baselineCount) : [];
  const spanText =
    baselineYears.length === 1 ? `${baselineYears[0]}` : `${baselineYears[0]}–${baselineYears[baselineYears.length - 1]}`;
  const anomaly =
    baselineValue !== null && comparison.length
      ? {
          baselineLabel: `mean of the ${baselineCount === 1 ? 'single' : `first ${baselineCount}`} complete year${
            baselineCount === 1 ? '' : 's'
          } in the retrieved window (${spanText}); this is not the WMO 1991–2020 normal`,
          baselineYears,
          baselineValue,
          points: comparison.map((entry) => ({ year: entry.year, anomaly: round(entry.mean - baselineValue, 3) })),
          latest: {
            year: comparison[comparison.length - 1].year,
            anomaly: round(comparison[comparison.length - 1].mean - baselineValue, 3)
          }
        }
      : null;

  const seasonal = SEASONS.map(({ season, months }) => {
    const entries = usable.filter((entry) => months.includes(Number(entry.month.slice(5, 7))));
    return {
      season,
      months,
      mean: entries.length ? round(mean(entries.map((entry) => entry.value))!, 3) : null,
      count: entries.length
    };
  });

  const monthlyTotals = isRatePerDay(unit)
    ? usable.map((entry) => ({ month: entry.month, total: round(entry.value * daysInMonth(entry.month), 2) }))
    : null;

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
        percentChange: Math.abs(firstMean) < 1e-6 ? null : round(((secondMean - firstMean) / Math.abs(firstMean)) * 100, 2)
      };
    }
  }

  // Deseasonalized monthly extremes (|z| >= 2.0 within same calendar month when >= 5 years exist).
  const byCalMonth = new Map<number, number[]>();
  for (const entry of usable) {
    const calMonth = Number(entry.month.slice(5, 7));
    if (!byCalMonth.has(calMonth)) byCalMonth.set(calMonth, []);
    byCalMonth.get(calMonth)!.push(entry.value);
  }
  const unusualMonths: UnusualMonthSummary[] = [];
  for (const entry of usable) {
    const calMonth = Number(entry.month.slice(5, 7));
    const peers = byCalMonth.get(calMonth) || [];
    if (peers.length < 5) continue;
    const cm = mean(peers);
    const csd = sampleSd(peers);
    if (cm === null || csd === null || csd <= 1e-6) continue;
    const z = (entry.value - cm) / csd;
    if (Math.abs(z) >= 2.0) {
      unusualMonths.push({
        month: entry.month,
        value: round(entry.value, 3),
        climatologyMean: round(cm, 3),
        zScore: round(z, 2),
        direction: z > 0 ? 'high' : 'low'
      });
    }
  }
  unusualMonths.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));

  return {
    code: series.code,
    unit,
    count: usable.length,
    missing: missingMonths.length,
    missingMonths,
    firstMonth: usable[0]?.month ?? null,
    lastMonth: usable[usable.length - 1]?.month ?? null,
    mean: overallMean === null ? null : round(overallMean, 3),
    stdDev: overallSd === null ? null : round(overallSd, 3),
    min: min ? { value: round(min.value, 3), month: min.month } : null,
    max: max ? { value: round(max.value, 3), month: max.month } : null,
    annual,
    olsSlopePerDecade,
    senSlopePerDecade,
    anomaly,
    seasonal,
    monthlyTotals,
    periodComparison,
    unusualMonths: unusualMonths.slice(0, 6)
  };
}

export interface LocalAnalysis {
  series: SeriesAnalysis[];
  comparisons: Array<{
    label: string;
    latitude?: number;
    longitude?: number;
    sourceUrl?: string;
    retrievedAt?: string;
    series: SeriesAnalysis[];
  }>;
  coverage: { requested: number; analysed: number; missingCells: number } | null;
  notes: string[];
}

/** Analyses every series in the bundle (plus any multi-location comparisons). Never throws on odd input. */
export function analyseBundle(context: EarthAnalystContext): LocalAnalysis {
  const raw = Array.isArray(context.power?.series) ? context.power!.series! : [];
  const series = raw
    .filter((entry) => entry && typeof entry.code === 'string')
    .map((entry) => analyseSeries({ code: entry.code, unit: entry.unit, dates: entry.dates || [], values: entry.values || [] }));

  const comparisons = (Array.isArray(context.comparisonLocations) ? context.comparisonLocations : [])
    .filter((loc) => loc && Array.isArray(loc.series) && loc.series.length > 0)
    .slice(0, 4)
    .map((loc) => ({
      label: String(loc.label || 'Comparison location'),
      latitude: loc.latitude,
      longitude: loc.longitude,
      sourceUrl: loc.sourceUrl,
      retrievedAt: loc.retrievedAt,
      series: loc
        .series!.filter((s) => s && typeof s.code === 'string')
        .map((s) => analyseSeries({ code: s.code, unit: s.unit, dates: s.dates || [], values: s.values || [] }))
    }));

  const analysed = series.reduce((total, entry) => total + entry.count, 0);
  const missingCells = series.reduce((total, entry) => total + entry.missing, 0);
  const notes: string[] = [];
  if (!raw.length) notes.push('The request carried no monthly series, so no statistic could be computed.');
  if (missingCells > 0) notes.push(`${missingCells} month/parameter cells had no usable value and were excluded from every statistic.`);

  return {
    series,
    comparisons,
    coverage: raw.length ? { requested: analysed + missingCells, analysed, missingCells } : null,
    notes
  };
}

const LABELS: Record<string, string> = {
  T2M: 'Air temperature at 2 m',
  PRECTOTCORR: 'Precipitation',
  RH2M: 'Relative humidity at 2 m',
  WS2M: 'Wind speed at 2 m',
  ALLSKY_SFC_SW_DWN: 'All-sky surface shortwave irradiance',
  T2M_MAX: 'Maximum air temperature at 2 m',
  T2M_MIN: 'Minimum air temperature at 2 m'
};

export function seriesLabel(code: string): string {
  return LABELS[code] || code;
}

function fmt(value: number | null | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'not available';
}

function localizeSectionTitles(lang: 'en' | 'si' | 'ta'): Record<AnalystSectionKind, string> {
  if (lang === 'si') {
    return {
      verified: 'තහවුරු කළ නිරීක්ෂණ',
      derived: 'ලබාගත් දත්තවලින් ගණනය කළ ප්‍රතිඵල',
      interpretation: 'විද්‍යාත්මක විග්‍රහය',
      limitations: 'සීමාවන් සහ අවිනිශ්චිතතාව',
      gaps: 'නොමැති දත්ත'
    };
  }
  if (lang === 'ta') {
    return {
      verified: 'உறுதிப்படுத்தப்பட்ட கண்காணிப்புகள்',
      derived: 'கணக்கிடப்பட்ட முடிவுகள்',
      interpretation: 'அறிவியல் விளக்கம்',
      limitations: 'வரம்புகள் மற்றும் நிச்சயமற்ற தன்மை',
      gaps: 'கிடைக்காத தரவு'
    };
  }
  return {
    verified: 'Verified observations',
    derived: 'Calculated results',
    interpretation: 'Scientific interpretation',
    limitations: 'Limitations and uncertainty',
    gaps: 'Missing data'
  };
}

/**
 * The deterministic answer. Same section vocabulary as the model path, so the UI
 * can render either without a special case. Supports `en`, `si`, and `ta`.
 */
export function buildLocalAnalystAnswer(
  question: string,
  context: EarthAnalystContext,
  options: { generatedAt?: string; analysis?: LocalAnalysis; lang?: string } = {}
): {
  sections: AnalystSection[];
  sources: LocalSource[];
  analysis: LocalAnalysis;
  evidenceSummary: string[];
  sufficientData: boolean;
} {
  const lang: 'en' | 'si' | 'ta' = options.lang === 'si' ? 'si' : options.lang === 'ta' ? 'ta' : 'en';
  const titles = localizeSectionTitles(lang);
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
  const coordsText = typeof lat === 'number' && typeof lon === 'number' ? `${lat.toFixed(4)}°, ${lon.toFixed(4)}° (WGS84)` : '';
  const datesText = Array.isArray(context.dates) && context.dates.length ? context.dates.join(', ') : 'none selected';

  if (lang === 'si') {
    verified.push(
      `අධ්‍යයන ප්‍රදේශය: ${place}${coordsText ? ` (${coordsText})` : ''}. නිරීක්ෂණ දිනය(න්): ${datesText === 'none selected' ? 'තෝරා නැත' : datesText}.`
    );
    if (context.power) {
      verified.push(
        `NASA POWER මාසික ලේඛනාගාරය ${context.power.from || 'නොදන්නා'} සිට ${context.power.to || 'නොදන්නා'} දක්වා ලබාගෙන ඇත (මාසික වාර්තා ${context.power.months ?? 'නොදන්නා'}; මූලාශ්‍රය ${datasetHost(context.power.sourceUrl)}; සම්පූර්ණ විමසුම සාක්ෂි (Evidence) යටතේ).`
      );
    }
  } else if (lang === 'ta') {
    verified.push(
      `ஆய்வுப் பகுதி: ${place}${coordsText ? ` (${coordsText})` : ''}. கண்காணிப்பு தேதி(கள்): ${datesText === 'none selected' ? 'தேர்ந்தெடுக்கப்படவில்லை' : datesText}.`
    );
    if (context.power) {
      verified.push(
        `NASA POWER மாதாந்திர காப்பகம் ${context.power.from || 'அறியப்படாதது'} முதல் ${context.power.to || 'அறியப்படாதது'} வரை பெறப்பட்டது (${context.power.months ?? 'அறியப்படாத'} மாதாந்திர பதிவுகள்; மூலம் ${datasetHost(context.power.sourceUrl)}; முழு வினவல் சான்று (Evidence) பகுதியில்).`
      );
    }
  } else {
    verified.push(
      `Study area: ${place}${coordsText ? ` at ${coordsText}` : ''}. Observation date(s) in view: ${datesText}.`
    );
    if (context.power) {
      verified.push(
        `NASA POWER monthly archive retrieved through ${context.power.from || 'unknown'} → ${context.power.to || 'unknown'} ` +
          `(${context.power.months ?? 'unknown'} monthly records; source ${datasetHost(context.power.sourceUrl)}, ` +
          'full query under Evidence).'
      );
    }
  }

  if (Array.isArray(context.power?.unavailable) && context.power!.unavailable!.length) {
    const list = context.power!.unavailable!.join(', ');
    if (lang === 'si') {
      gaps.push(`POWER විසින් ${list} සඳහා භාවිත කළ හැකි අගයන් ලබා දුන්නේ නැත. ඒවා ඇස්තමේන්තු නොකර නොමැති ලෙස වාර්තා කර ඇත.`);
    } else if (lang === 'ta') {
      gaps.push(`POWER சேவை ${list} அளவுருக்களுக்கு பயன்படும் மதிப்புகளை வழங்கவில்லை. இவை மதிப்பிடப்படாமல் கிடைக்காததாக அறிவிக்கப்படுகின்றன.`);
    } else {
      gaps.push(
        `POWER returned no usable values for ${list}. These are reported as unavailable rather than estimated.`
      );
    }
  }

  for (const entry of analysis.series) {
    const name = `${seriesLabel(entry.code)} (${entry.code})`;
    const unit = entry.unit || 'unit not reported';
    if (!entry.count) {
      gaps.push(
        lang === 'si'
          ? `${name}: භාවිත කළ හැකි මාසික අගයන් ලබාගෙන නොමැති බැවින් සංඛ්‍යාන වාර්තා නොකෙරේ.`
          : lang === 'ta'
            ? `${name}: பயன்படும் மாதாந்திர மதிப்புகள் எதுவும் பெறப்படாததால் புள்ளிவிவரம் அறிவிக்கப்படவில்லை.`
            : `${name}: no usable monthly values were retrieved, so no statistic is reported.`
      );
      continue;
    }

    if (lang === 'si') {
      verified.push(
        `${name}: භාවිත කළ හැකි මාසික අගයන් ${entry.count} (${entry.firstMonth} → ${entry.lastMonth})` +
          (entry.missing ? `, අගයන් නොමැති මාස ${entry.missing}.` : '.')
      );
      derived.push(
        `${name}: සාමාන්‍යය ${fmt(entry.mean)} ${unit}; අවමය ${fmt(entry.min?.value)} ${unit}` +
          (entry.min ? ` (${entry.min.month})` : '') +
          `; උපරිමය ${fmt(entry.max?.value)} ${unit}` +
          (entry.max ? ` (${entry.max.month})` : '') +
          (entry.olsSlopePerDecade !== null
            ? `; වාර්ෂික OLS ප්‍රවණතාව දශකයකට ${entry.olsSlopePerDecade >= 0 ? '+' : ''}${fmt(entry.olsSlopePerDecade)} ${unit}/decade.`
            : '.')
      );
    } else if (lang === 'ta') {
      verified.push(
        `${name}: பயன்படும் மாதாந்திர மதிப்புகள் ${entry.count} (${entry.firstMonth} → ${entry.lastMonth})` +
          (entry.missing ? `, மதிப்பு இல்லாத மாதங்கள் ${entry.missing}.` : '.')
      );
      derived.push(
        `${name}: சராசரி ${fmt(entry.mean)} ${unit}; குறைந்தபட்சம் ${fmt(entry.min?.value)} ${unit}` +
          (entry.min ? ` (${entry.min.month})` : '') +
          `; அதிகபட்சம் ${fmt(entry.max?.value)} ${unit}` +
          (entry.max ? ` (${entry.max.month})` : '') +
          (entry.olsSlopePerDecade !== null
            ? `; ஆண்டு OLS போக்கு தசாப்தத்திற்கு ${entry.olsSlopePerDecade >= 0 ? '+' : ''}${fmt(entry.olsSlopePerDecade)} ${unit}/decade.`
            : '.')
      );
    } else {
      verified.push(
        `${name}: ${entry.count} usable monthly values, ${entry.firstMonth} → ${entry.lastMonth}` +
          (entry.missing ? `, ${entry.missing} month(s) without a value.` : '.')
      );
      derived.push(
        `${name}: mean ${fmt(entry.mean)} ${unit}; minimum ${fmt(entry.min?.value)} ${unit}` +
          (entry.min ? ` (${entry.min.month})` : '') +
          `; maximum ${fmt(entry.max?.value)} ${unit}` +
          (entry.max ? ` (${entry.max.month})` : '') +
          (entry.olsSlopePerDecade !== null
            ? `; linear annual-mean slope ${entry.olsSlopePerDecade >= 0 ? '+' : ''}${fmt(entry.olsSlopePerDecade, 3)} ${unit}/decade` +
              (entry.senSlopePerDecade !== null ? ` (Theil–Sen ${entry.senSlopePerDecade >= 0 ? '+' : ''}${fmt(entry.senSlopePerDecade, 3)} ${unit}/decade)` : '')
            : '') +
          ' — computed from the retrieved monthly values only.'
      );
    }

    if (entry.anomaly) {
      const sign = entry.anomaly.latest.anomaly >= 0 ? '+' : '';
      if (lang === 'si') {
        derived.push(
          `${name}: සමුද්දේශ පදනම් සාමාන්‍යය ${fmt(entry.anomaly.baselineValue)} ${unit} (${entry.anomaly.baselineYears.join('–')} පදනම; WMO 1991–2020 සම්මතය නොවේ). මෑතම සම්පූර්ණ වර්ෂය (${entry.anomaly.latest.year}) පදනමේ සිට ${sign}${fmt(entry.anomaly.latest.anomaly)} ${unit} වෙනසක් පෙන්වයි.`
        );
      } else if (lang === 'ta') {
        derived.push(
          `${name}: அடிப்படை சராசரி ${fmt(entry.anomaly.baselineValue)} ${unit} (${entry.anomaly.baselineYears.join('–')} அடிப்படை; WMO 1991–2020 சராசரி அல்ல). சமீபத்திய முழு ஆண்டு (${entry.anomaly.latest.year}) அடிப்படையிலிருந்து ${sign}${fmt(entry.anomaly.latest.anomaly)} ${unit} மாறுபாட்டைக் காட்டுகிறது.`
        );
      } else {
        derived.push(
          `${name}: reference baseline ${fmt(entry.anomaly.baselineValue)} ${unit} — the ${entry.anomaly.baselineLabel}. ` +
            `The most recent complete year (${entry.anomaly.latest.year}) sits ` +
            `${sign}${fmt(entry.anomaly.latest.anomaly)} ${unit} from it.`
        );
      }
      evidence.push(
        `${entry.code} anomalies vs ${entry.anomaly.baselineYears.join('/')} baseline (${unit}): ` +
          entry.anomaly.points.map((point) => `${point.year}:${point.anomaly >= 0 ? '+' : ''}${point.anomaly}`).join(', ')
      );
    } else if (entry.annual.filter((year) => year.complete).length < 2) {
      const cy = entry.annual.filter((year) => year.complete).length;
      gaps.push(
        lang === 'si'
          ? `${name}: සම්පූර්ණ වර්ෂ ${cy} ක් පමණක් ලබාගෙන ඇති බැවින් අසාමාන්‍යතා (anomaly) ගණනයට දිගු කාල පරාසයක් අවශ්‍ය වේ.`
          : lang === 'ta'
            ? `${name}: ${cy} முழு ஆண்டு(கள்) மட்டுமே பெறப்பட்டுள்ளதால் மாறுபாடு (anomaly) கணக்கிட நீண்ட காலவரம்பு தேவை.`
            : `${name}: ${cy} complete year(s) retrieved, so an anomaly against a reference period cannot be formed. A longer window is required.`
      );
    }

    if (entry.periodComparison) {
      const sign = entry.periodComparison.absoluteChange! >= 0 ? '+' : '';
      if (lang === 'si') {
        derived.push(
          `${name}: මුල් භාගය (${entry.periodComparison.firstLabel}) ${fmt(entry.periodComparison.firstMean)} ${unit} සහ දෙවන භාගය (${entry.periodComparison.secondLabel}) ${fmt(entry.periodComparison.secondMean)} ${unit} — වෙනස ${sign}${fmt(entry.periodComparison.absoluteChange)} ${unit}` +
            (entry.periodComparison.percentChange === null
              ? '.'
              : ` (${entry.periodComparison.percentChange >= 0 ? '+' : ''}${fmt(entry.periodComparison.percentChange)} %).`)
        );
      } else if (lang === 'ta') {
        derived.push(
          `${name}: முதல் பாதி (${entry.periodComparison.firstLabel}) ${fmt(entry.periodComparison.firstMean)} ${unit} எதிர் இரண்டாம் பாதி (${entry.periodComparison.secondLabel}) ${fmt(entry.periodComparison.secondMean)} ${unit} — வேறுபாடு ${sign}${fmt(entry.periodComparison.absoluteChange)} ${unit}` +
            (entry.periodComparison.percentChange === null
              ? '.'
              : ` (${entry.periodComparison.percentChange >= 0 ? '+' : ''}${fmt(entry.periodComparison.percentChange)} %).`)
        );
      } else {
        derived.push(
          `${name}: first half of the window (${entry.periodComparison.firstLabel}) mean ${fmt(entry.periodComparison.firstMean)} ${unit} versus second half (${entry.periodComparison.secondLabel}) ${fmt(entry.periodComparison.secondMean)} ${unit} — ` +
            `difference ${sign}${fmt(entry.periodComparison.absoluteChange)} ${unit}` +
            (entry.periodComparison.percentChange === null
              ? ' (percentage withheld: the first-half mean is effectively zero).'
              : `, ${entry.periodComparison.percentChange >= 0 ? '+' : ''}${fmt(entry.periodComparison.percentChange)} %.`)
        );
      }
    }

    if (entry.seasonal.some((season) => season.count)) {
      const seasonStr = entry.seasonal
        .filter((season) => season.mean !== null)
        .map((season) => `${season.season} ${fmt(season.mean)} ${unit}`)
        .join('; ');
      derived.push(
        lang === 'si'
          ? `${name} සමයානුකූල සාමාන්‍ය: ${seasonStr}.`
          : lang === 'ta'
            ? `${name} பருவகால சராசரிகள்: ${seasonStr}.`
            : `${name} seasonal means: ${seasonStr}.`
      );
    }

    if (entry.monthlyTotals) {
      const totals = entry.monthlyTotals;
      const wettest = totals.reduce(
        (best, entry2) => (best === null || entry2.total > best.total ? entry2 : best),
        null as null | { month: string; total: number }
      );
      const driest = totals.reduce(
        (best, entry2) => (best === null || entry2.total < best.total ? entry2 : best),
        null as null | { month: string; total: number }
      );
      if (wettest && driest) {
        derived.push(
          lang === 'si'
            ? `${name} මාසික මුළු වර්ෂාපතනය (දිනක අනුපාතය × මාසයේ දින ගණන): වැඩිම ${wettest.month} (${fmt(wettest.total)} mm), අඩුම ${driest.month} (${fmt(driest.total)} mm).`
            : lang === 'ta'
              ? `${name} மாதாந்திர மொத்த மழை (நாளொன்று வீதம் × மாத நாட்கள்): அதிகபட்சம் ${wettest.month} (${fmt(wettest.total)} mm), குறைந்தபட்சம் ${driest.month} (${fmt(driest.total)} mm).`
              : `${name} monthly totals (rate × days in month): wettest ${wettest.month} ${fmt(wettest.total)} mm, driest ${driest.month} ${fmt(driest.total)} mm.`
        );
      }
    }

    if (entry.unusualMonths.length) {
      const top = entry.unusualMonths.slice(0, 3);
      const formatted = top
        .map((u) => `${u.month} (${fmt(u.value)} ${unit}, ${u.zScore >= 0 ? '+' : ''}${u.zScore}σ vs calendar month)`)
        .join('; ');
      derived.push(
        lang === 'si'
          ? `${name} අසාමාන්‍ය මාසික නිරීක්ෂණ (|z| ≥ 2σ): ${formatted}.`
          : lang === 'ta'
            ? `${name} வழக்கத்திற்கு மாறான மாதாந்திர பதிவுகள் (|z| ≥ 2σ): ${formatted}.`
            : `${name} unusual monthly observations (|z| ≥ 2σ vs same calendar month): ${formatted}.`
      );
      evidence.push(`${entry.code} deseasonalized |z|>=2 months: ${formatted}`);
    }

    if (entry.missingMonths.length) {
      const sample = entry.missingMonths.slice(0, 6).join(', ');
      const rest = entry.missingMonths.length > 6 ? `, +${entry.missingMonths.length - 6}` : '';
      gaps.push(
        lang === 'si'
          ? `${name}: මාස ${entry.missingMonths.length} ක අගයන් නොමැත (${sample}${rest}). මෙම මාස සෑම ගණනයකින්ම බැහැර කර ඇත.`
          : lang === 'ta'
            ? `${name}: ${entry.missingMonths.length} மாதங்களுக்கு மதிப்பு இல்லை (${sample}${rest}). இவை அனைத்து கணக்கீடுகளிலிருந்தும் விலக்கப்பட்டுள்ளன.`
            : `${name}: no usable value for ${entry.missingMonths.length} month(s) — ${sample}` +
              `${entry.missingMonths.length > 6 ? `, and ${entry.missingMonths.length - 6} more` : ''}. These months are excluded from every statistic.`
      );
    }

    limitations.push(
      lang === 'si'
        ? `${name}: POWER අගයන් ≈0.5° × 0.625° ග්‍රිඩ් සෛලයක චන්ද්‍රිකා/ප්‍රති-විශ්ලේෂණ ඇස්තමේන්තු මිස සෘජු කාලගුණ මධ්‍යස්ථාන මිනුම් නොවේ; සංඛ්‍යානමය සුවිශේෂීතා පරීක්ෂණ හෝ හේතු නිගමනය සිදු කර නැත.`
        : lang === 'ta'
          ? `${name}: POWER மதிப்புகள் ≈0.5° × 0.625° கட்டச் செல்லின் செயற்கைக்கோள்/மறுஆய்வு மதிப்பீடுகள், நேரடி வானிலை நிலைய அளவீடுகள் அல்ல; முக்கியத்துவச் சோதனை அல்லது காரண உறுதிப்பாடு செய்யப்படவில்லை.`
          : `${name}: POWER values are satellite/re-analysis estimates for a ≈0.5° × 0.625° grid cell, not station measurements. ` +
            'This is a descriptive statistic of the retrieved series; no significance test, homogenisation or attribution has been applied.'
    );
  }

  // Multi-location comparison summaries when comparisonLocations are provided.
  if (analysis.comparisons.length > 0 && analysis.series.length > 0) {
    verified.push(
      lang === 'si'
        ? `සංසන්දනාත්මක ස්ථාන දත්ත ලබාගන්නා ලදී: ${analysis.comparisons.map((c) => c.label).join(', ')}.`
        : lang === 'ta'
          ? `ஒப்பீட்டு இடத் தரவு பெறப்பட்டது: ${analysis.comparisons.map((c) => c.label).join(', ')}.`
          : `Comparison location archive(s) retrieved: ${analysis.comparisons.map((c) => c.label).join(', ')}.`
    );
    for (const comp of analysis.comparisons) {
      for (const compSeries of comp.series) {
        const primarySeries = analysis.series.find((s) => s.code === compSeries.code);
        if (!primarySeries || primarySeries.mean === null || compSeries.mean === null) continue;
        const diff = round(compSeries.mean - primarySeries.mean, 2);
        const sign = diff >= 0 ? '+' : '';
        const unit = primarySeries.unit || compSeries.unit || '';
        if (lang === 'si') {
          derived.push(
            `ස්ථාන සංසන්දනය (${compSeries.code}): ${comp.label} සාමාන්‍යය ${fmt(compSeries.mean)} ${unit} vs ${place} ${fmt(primarySeries.mean)} ${unit} (වෙනස ${sign}${fmt(diff)} ${unit}).`
          );
        } else if (lang === 'ta') {
          derived.push(
            `இட ஒப்பீடு (${compSeries.code}): ${comp.label} சராசரி ${fmt(compSeries.mean)} ${unit} எதிர் ${place} ${fmt(primarySeries.mean)} ${unit} (வேறுபாடு ${sign}${fmt(diff)} ${unit}).`
          );
        } else {
          derived.push(
            `Location comparison (${compSeries.code}): ${comp.label} mean ${fmt(compSeries.mean)} ${unit} versus ${place} ${fmt(primarySeries.mean)} ${unit} (difference ${sign}${fmt(diff)} ${unit}).`
          );
        }
      }
    }
  }

  if (!analysis.series.length && !context.power) {
    gaps.push(
      lang === 'si'
        ? 'මෙම තේරීම සඳහා NASA POWER ලේඛනාගාර දත්ත ලබාගෙන නොමැති බැවින් දේශගුණික ශ්‍රේණි ප්‍රකාශ කළ නොහැක.'
        : lang === 'ta'
          ? 'இந்தத் தேர்வுக்கு NASA POWER காப்பகம் பெறப்படாததால் காலநிலைத் தொடர் கூற்றுகளை வழங்க முடியாது.'
          : 'No NASA POWER archive was retrieved for this selection, so no climate-series statement can be made.'
    );
  }

  const question2 = String(question || '');
  if (/trend|warming|increase|decrease|change|ප්‍රවණතා|උණුසුම්|වෙනස්|போக்கு|வெப்ப/i.test(question2)) {
    interpretation.push(
      lang === 'si'
        ? 'බෑවුමක් හෝ කාල පරිච්ඡේද දෙකක් අතර වෙනසක් විස්තර කරන්නේ ලබාගත් කාල පරාසය පමණි. දිගුකාලීන පදනමක් සහ සංඛ්‍යාන පරීක්ෂණ නොමැතිව එය තහවුරු කළ දේශගුණික ප්‍රවණතාවක් ලෙස ඉදිරිපත් නොකළ යුතුය.'
        : lang === 'ta'
          ? 'சாய்வு அல்லது இரு காலப்பகுதிகளின் வேறுபாடு பெறப்பட்ட காலவரம்பை மட்டுமே விவரிக்கிறது. நீண்ட கால அடிப்படை மற்றும் புள்ளிவிவர சோதனை இன்றி இதை உறுதிப்படுத்தப்பட்ட காலநிலைப் போக்காகக் கூறக்கூடாது.'
          : 'A slope or a difference between two periods describes the retrieved window only. Without a longer baseline, a significance test and a change-point analysis, it must not be presented as a verified climate trend.'
    );
  }
  if (/correlat|because|cause|due to|හේතු|සම්බන්ධ|காரண|தொடர்பு/i.test(question2)) {
    interpretation.push(
      lang === 'si'
        ? 'විචල්‍ය දෙකක් එකට විචලනය වීම එකක් අනෙකට හේතු වන බවට සාක්ෂියක් නොවේ; හේතු නිගමනයක් ප්‍රකාශ නොකෙරේ.'
        : lang === 'ta'
          ? 'இரு அளவுருக்கள் ஒன்றாக மாறுவது ஒன்று மற்றொன்றுக்குக் காரணம் என்பதற்கான சான்று அல்ல; காரண உரிமை கோரப்படவில்லை.'
          : 'The retrieved series can show that two quantities move together over this window; that is not evidence that one causes the other. No attribution is claimed.'
    );
  }
  if (/image|imagery|satellite picture|compare dates|රූප|චන්ද්‍රිකා|படம்|செயற்கைக்கோள்/i.test(question2)) {
    interpretation.push(
      lang === 'si'
        ? 'චන්ද්‍රිකා රූප දෙකක් ප්‍රවණතාවක් ඔප්පු නොකරයි: වලාකුළු, හිරු කෝණය, ඒරොසෝල් සහ සංවේදක වෙනස්කම් දින දෙකක් අතර දෘශ්‍ය වෙනසක් ඇති කළ හැක.'
        : lang === 'ta'
          ? 'இரு செயற்கைக்கோள் படங்கள் ஒரு போக்கை நிரூபிக்காது: மேகமூட்டம், சூரியக் கோணம், ஏரோசோல்கள் மற்றும் உணரி மாற்றங்கள் வேறுபாட்டை ஏற்படுத்தலாம்.'
          : 'Two images are not proof of a trend: cloud, sun angle, aerosols, sensor changes and processing can all produce a difference between dates.'
    );
  }
  if (!interpretation.length) {
    interpretation.push(
      lang === 'si'
        ? 'විග්‍රහය ඉහත දැක්වෙන ලබාගත් අගයන් මත පමණක් සීමා වේ; බාහිර අනුමාන එකතු කර නොමැත.'
        : lang === 'ta'
          ? 'விளக்கம் மேலே பட்டியலிடப்பட்ட பெறப்பட்ட மதிப்புகளுக்குள் மட்டுமே வரையறுக்கப்பட்டுள்ளது; வெளிப்புற ஊகங்கள் சேர்க்கப்படவில்லை.'
          : 'Interpretation is limited to reasoning over the values listed above. The Lab does not add external claims about this area.'
    );
  }

  limitations.push(
    lang === 'si'
      ? 'මෙම පිළිතුර භාෂා ආකෘතියක් නොමැතිව දේශීය පෘථිවි බුද්ධි එන්ජිම මගින් ලබාගත් දත්ත මත ගණිතමය වශයෙන් සෘජුවම ගණනය කරන ලදී.'
      : lang === 'ta'
        ? 'இந்தப் பதில் மொழி மாதிரி இன்றி உள்ளூர் புவி நுண்ணறிவு இயந்திரத்தால் பெறப்பட்ட தரவின் கணிதக் கணக்கீடுகள் மூலம் உருவாக்கப்பட்டது.'
        : 'This answer was produced by the deterministic Local Earth Intelligence engine without a language model: it restates retrieved values and computes arithmetic on them only.'
  );

  const sources: LocalSource[] = [];
  if (context.power?.sourceUrl) {
    sources.push({
      label: 'NASA POWER monthly point API',
      url: String(context.power.sourceUrl),
      retrievedAt: context.power.retrievedAt,
      detail: `Monthly archive for ${place}`
    });
  }
  for (const comp of analysis.comparisons) {
    if (comp.sourceUrl) {
      sources.push({
        label: `NASA POWER — ${comp.label}`,
        url: comp.sourceUrl,
        retrievedAt: comp.retrievedAt,
        detail: `Comparison series for ${comp.label}`
      });
    }
  }
  for (const layer of Array.isArray(context.layers) ? context.layers : []) {
    if (layer?.serviceUrl) {
      sources.push({
        label: String(layer.title || layer.id || 'Imagery layer'),
        url: String(layer.serviceUrl),
        detail: layer.coverage ? String(layer.coverage) : undefined
      });
    }
  }

  const rawSections: Array<{ kind: AnalystSectionKind; title: string; bullets: string[] }> = [
    { kind: 'verified', title: titles.verified, bullets: verified.slice(0, 9) },
    { kind: 'derived', title: titles.derived, bullets: derived.slice(0, 18) },
    { kind: 'interpretation', title: titles.interpretation, bullets: interpretation.slice(0, 5) },
    { kind: 'limitations', title: titles.limitations, bullets: limitations.slice(0, 6) },
    { kind: 'gaps', title: titles.gaps, bullets: gaps.slice(0, 8) }
  ];
  const sections: AnalystSection[] = rawSections.map((section) => ({
    ...section,
    bullets: section.bullets.filter(Boolean)
  }));

  const sufficientData = analysis.series.some((entry) => entry.count > 0);

  return { sections, sources, analysis, evidenceSummary: evidence, sufficientData };
}
