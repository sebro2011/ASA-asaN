import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Area,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Brush,
  ReferenceLine
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  CloudRain,
  Leaf,
  MapPin,
  RefreshCw,
  Sun,
  Thermometer
} from 'lucide-react';

// ====================================================
// Earth Intelligence Lab — NASA POWER Monthly Climate
// Historical monthly temperature (T2M) & precipitation
// (PRECTOTCORR) explorer. Keyless public NASA API.
// ====================================================

const POWER_MONTHLY_POINT_URL =
  'https://power.larc.nasa.gov/api/temporal/monthly/point';

/** First year requested from the NASA POWER monthly archive */
const START_YEAR = 2015;

/** NASA POWER encodes missing grid values as -999 (or similarly large negatives) */
const POWER_FILL_VALUE_THRESHOLD = -900;

const PARAMS = {
  temp: 'T2M',
  rain: 'PRECTOTCORR'
};

/** Selectable observation locations (lat/lon of the metro area) */
const LOCATIONS = [
  {
    key: 'sriLanka',
    labelKey: 'earthLocationSriLanka',
    lat: 6.9271,
    lon: 79.8612
  },
  {
    key: 'london',
    labelKey: 'earthLocationLondon',
    lat: 51.5072,
    lon: -0.1276
  },
  {
    key: 'newYork',
    labelKey: 'earthLocationNewYork',
    lat: 40.7128,
    lon: -74.006
  }
];

/** Time-range filters (applied locally over the fetched archive) */
const RANGE_OPTIONS = [
  { key: 'all', labelKey: 'earthRangeAll', years: null },
  { key: '10y', labelKey: 'earthRange10', years: 10 },
  { key: '5y', labelKey: 'earthRange5', years: 5 }
];

const LOCALES = {
  en: 'en-US',
  si: 'si-LK',
  ta: 'ta-LK'
};

const getLocale = (lang) => LOCALES[lang] || 'en-US';

/** Safe number formatter with fixed decimals */
function formatNumber(value, digits = 1, lang = 'en') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat(getLocale(lang), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(value);
  } catch {
    return value.toFixed(digits);
  }
}

/** Localized short month + year label for a 'YYYY-MM' key */
function formatMonthLabel(dateKey, lang = 'en') {
  const [year, month] = String(dateKey).split('-').map(Number);
  if (!year || !month) return dateKey;
  try {
    return new Intl.DateTimeFormat(getLocale(lang), {
      month: 'short',
      year: 'numeric'
    }).format(new Date(year, month - 1, 1));
  } catch {
    return dateKey;
  }
}

/** Days in a calendar month (for rainfall totals) */
export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/** Build the NASA POWER monthly point request URL */
function buildPowerUrl(lat, lon) {
  const params = new URLSearchParams({
    parameters: `${PARAMS.temp},${PARAMS.rain}`,
    community: 'RE',
    longitude: String(lon),
    latitude: String(lat),
    start: String(START_YEAR),
    end: String(new Date().getFullYear()),
    format: 'JSON'
  });
  return `${POWER_MONTHLY_POINT_URL}?${params.toString()}`;
}

/**
 * Parse one NASA POWER monthly parameter object ({ 'YYYYMM': value, ... })
 * into a Map<year, Map<month, value>>. Month keys '01'-'12' only — the
 * NASA POWER monthly API reports month '13' as the annual aggregate.
 */
export function parseParameter(raw) {
  const byYear = new Map();
  if (!raw || typeof raw !== 'object') return byYear;

  for (const [key, value] of Object.entries(raw)) {
    const match = /^(\d{4})(0[1-9]|1[0-2])$/.exec(key);
    if (!match) continue;

    const num = Number(value);
    if (!Number.isFinite(num) || num <= POWER_FILL_VALUE_THRESHOLD) continue;

    const year = Number(match[1]);
    const month = Number(match[2]);

    if (!byYear.has(year)) byYear.set(year, new Map());
    byYear.get(year).set(month, num);
  }
  return byYear;
}

/**
 * Fetch + normalize the monthly archive for one location.
 * Returns rows: [{ date, year, month, temp, rain, yearTempMean, yearRainMean }]
 * Missing measurements are kept as null so charts can gap them out.
 */
async function fetchPowerMonthly(lat, lon, signal) {
  const response = await fetch(buildPowerUrl(lat, lon), { signal });

  if (!response.ok) {
    throw new Error(`NASA POWER request failed (${response.status})`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('NASA POWER returned an unreadable response');
  }

  const parameters = payload?.properties?.parameter;
  const tempByYear = parseParameter(parameters?.[PARAMS.temp]);
  const rainByYear = parseParameter(parameters?.[PARAMS.rain]);

  if (!tempByYear.size && !rainByYear.size) {
    throw new Error('No valid monthly observations in response');
  }

  const rows = [];
  const years = new Set([...tempByYear.keys(), ...rainByYear.keys()]);

  for (const year of [...years].sort((a, b) => a - b)) {
    const tempMonths = tempByYear.get(year) || new Map();
    const rainMonths = rainByYear.get(year) || new Map();

    const monthSet = new Set([...tempMonths.keys(), ...rainMonths.keys()]);
    const yearTemps = [...tempMonths.values()];
    const yearRains = [...rainMonths.values()];

    const yearTempMean = yearTemps.length
      ? yearTemps.reduce((sum, v) => sum + v, 0) / yearTemps.length
      : null;
    const yearRainMean = yearRains.length
      ? yearRains.reduce((sum, v) => sum + v, 0) / yearRains.length
      : null;

    for (const month of [...monthSet].sort((a, b) => a - b)) {
      const temp = tempMonths.has(month) ? tempMonths.get(month) : null;
      const rain = rainMonths.has(month) ? rainMonths.get(month) : null;
      rows.push({
        date: `${year}-${String(month).padStart(2, '0')}`,
        year,
        month,
        temp: temp === null ? null : Number(temp.toFixed(2)),
        rain: rain === null ? null : Number(rain.toFixed(2)),
        yearTempMean: yearTempMean === null ? null : Number(yearTempMean.toFixed(2)),
        yearRainMean: yearRainMean === null ? null : Number(yearRainMean.toFixed(2))
      });
    }
  }

  if (!rows.length) {
    throw new Error('No valid monthly observations found');
  }

  return rows;
}

/** Mean of the finite values inside a list of {key: value} accessors */
export function meanOf(values) {
  const valid = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v));
  if (!valid.length) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

/** Pick the record that maximises / minimises `accessor` (null-safe) */
function extremeRow(rows, accessor, pickMax) {
  let best = null;
  let bestValue = null;
  for (const row of rows) {
    const value = accessor(row);
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    if (
      bestValue === null ||
      (pickMax ? value > bestValue : value < bestValue)
    ) {
      best = row;
      bestValue = value;
    }
  }
  return best;
}

/**
 * Aggregate the monthly rows into per-year statistics and
 * whole-period historical summary figures.
 */
export function buildSummaries(rows) {
  const byYear = new Map();

  for (const row of rows) {
    if (!byYear.has(row.year)) {
      byYear.set(row.year, {
        year: row.year,
        months: 0,
        tempMonths: 0,
        rainMonths: 0,
        temps: [],
        rains: [],
        totalRainMm: 0
      });
    }
    const bucket = byYear.get(row.year);
    bucket.months += 1;
    if (row.temp !== null) {
      bucket.tempMonths += 1;
      bucket.temps.push(row.temp);
    }
    if (row.rain !== null) {
      bucket.rainMonths += 1;
      bucket.rains.push(row.rain);
      // Convert the mm/day rate to a monthly total in mm
      bucket.totalRainMm += row.rain * daysInMonth(row.year, row.month);
    }
  }

  const yearly = [...byYear.values()]
    .sort((a, b) => a.year - b.year)
    .map((bucket) => ({
      year: bucket.year,
      months: bucket.months,
      tempMonths: bucket.tempMonths,
      rainMonths: bucket.rainMonths,
      avgTemp: meanOf(bucket.temps),
      avgRain: meanOf(bucket.rains),
      totalRainMm: bucket.rainMonths ? Number(bucket.totalRainMm.toFixed(1)) : null,
      complete: bucket.tempMonths >= 12 && bucket.rainMonths >= 12
    }));

  const tempRows = rows.filter((row) => row.temp !== null);
  const rainRows = rows.filter((row) => row.rain !== null);

  const warmestMonth = extremeRow(tempRows, (row) => row.temp, true);
  const coolestMonth = extremeRow(tempRows, (row) => row.temp, false);
  const wettestMonth = extremeRow(rainRows, (row) => row.rain, true);

  const yearsWithTemp = yearly.filter((entry) => entry.avgTemp !== null);
  const yearsWithRain = yearly.filter((entry) => entry.avgRain !== null);

  const warmestYear = extremeRow(yearsWithTemp, (entry) => entry.avgTemp, true);
  const coolestYear = extremeRow(yearsWithTemp, (entry) => entry.avgTemp, false);
  const wettestYear = extremeRow(yearsWithRain, (entry) => entry.avgRain, true);
  const driestYear = extremeRow(yearsWithRain, (entry) => entry.avgRain, false);

  // Annual rainfall totals — only years with all 12 valid rain months,
  // so partial years don't skew the mean low
  const completeYears = yearly.filter(
    (entry) => entry.rainMonths >= 12 && entry.totalRainMm !== null
  );
  const meanAnnualRainMm = meanOf(completeYears.map((entry) => entry.totalRainMm));

  return {
    yearly,
    avgTemp: meanOf(tempRows.map((row) => row.temp)),
    avgRain: meanOf(rainRows.map((row) => row.rain)),
    meanAnnualRainMm,
    warmestMonth,
    coolestMonth,
    wettestMonth,
    warmestYear,
    coolestYear,
    wettestYear,
    driestYear,
    tempCount: tempRows.length,
    rainCount: rainRows.length
  };
}

/** Compact stat card used across the summary grid */
function StatCard({ icon: Icon, accentClass, label, value, unit, note }) {
  return (
    <div
      className={`rounded-xl border border-slate-800 bg-slate-950/80 p-4 flex flex-col gap-1.5 ${accentClass}`}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 opacity-90" />
        <p className="text-xs text-slate-400 leading-tight">{label}</p>
      </div>
      <p className="text-xl sm:text-2xl font-bold text-white break-words">
        {value}
        {unit ? (
          <span className="ml-1.5 text-xs sm:text-sm font-medium text-slate-400">
            {unit}
          </span>
        ) : null}
      </p>
      {note ? <p className="text-[11px] text-slate-500 leading-snug">{note}</p> : null}
    </div>
  );
}

export default function EarthIntelligenceLab({ lang = 'en' }) {
  const { t, i18n } = useTranslation();
  const activeLang = (lang || i18n.language || 'en').slice(0, 2);

  const [locationKey, setLocationKey] = useState('sriLanka');
  const [rangeKey, setRangeKey] = useState('all');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hiddenSeries, setHiddenSeries] = useState({});
  const abortRef = useRef(null);
  const tRef = useRef(t);
  tRef.current = t;

  const location = useMemo(
    () => LOCATIONS.find((item) => item.key === locationKey) || LOCATIONS[0],
    [locationKey]
  );

  const loadData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError('');

    try {
      const data = await fetchPowerMonthly(
        location.lat,
        location.lon,
        controller.signal
      );
      setRows(data);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(tRef.current('earthError'));
      setRows([]);
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, [location]);

  useEffect(() => {
    loadData();
    return () => abortRef.current?.abort();
  }, [loadData]);

  /** Rows restricted to the selected time range */
  const visibleRows = useMemo(() => {
    const range = RANGE_OPTIONS.find((item) => item.key === rangeKey);
    if (!range?.years) return rows;
    const endYear = rows.length ? rows[rows.length - 1].year : new Date().getFullYear();
    const minYear = endYear - range.years + 1;
    return rows.filter((row) => row.year >= minYear);
  }, [rows, rangeKey]);

  const summary = useMemo(() => buildSummaries(visibleRows), [visibleRows]);

  const unitTemp = '°C';
  const unitRain = 'mm/day';
  const unitRainTotal = 'mm';

  const latest = visibleRows.length ? visibleRows[visibleRows.length - 1] : null;
  const isEmpty = !loading && !error && (!visibleRows.length || (!summary.tempCount && !summary.rainCount));

  const periodLabel = visibleRows.length
    ? t('earthSummaryPeriodValue', {
        start: visibleRows[0].year,
        end: visibleRows[visibleRows.length - 1].year,
        months: visibleRows.length
      })
    : '—';

  const toggleSeries = (dataKey) => {
    setHiddenSeries((prev) => ({ ...prev, [dataKey]: !prev[dataKey] }));
  };

  const tooltipLabelFormatter = (label) => formatMonthLabel(label, activeLang);

  const tempTooltipFormatter = (value, name) => {
    if (value === null || value === undefined) return [t('earthNoDataShort'), name];
    return [`${formatNumber(value, 1, activeLang)} ${unitTemp}`, name];
  };

  const rainTooltipFormatter = (value, name) => {
    if (value === null || value === undefined) return [t('earthNoDataShort'), name];
    return [`${formatNumber(value, 1, activeLang)} ${unitRain}`, name];
  };

  return (
    <section className="space-y-4 sm:space-y-6 text-slate-100" aria-busy={loading}>
      {/* ===== Intro / source briefing card ===== */}
      <div className="rounded-2xl border border-lime-500/30 bg-gradient-to-br from-lime-950/50 via-slate-950 to-emerald-950/30 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-lime-400/30 bg-lime-400/10 p-3">
            <Leaf className="h-6 w-6 text-lime-300" />
          </div>
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-lime-500/30 bg-lime-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wide text-lime-300">
              <Activity className="h-3 w-3" />
              {t('earthSourceBadge')}
            </span>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              {t('earthIntro')}
            </p>
          </div>
        </div>
      </div>

      {/* ===== Location + range selectors ===== */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <span className="mb-2.5 flex items-center gap-2 text-sm text-slate-300">
            <MapPin className="h-4 w-4 text-cyan-400" />
            {t('earthLocationLabel')}
          </span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label={t('earthLocationLabel')}>
            {LOCATIONS.map((item) => {
              const isActive = item.key === locationKey;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setLocationKey(item.key)}
                  aria-pressed={isActive}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-all cursor-pointer active:scale-[0.98] ${
                    isActive
                      ? 'border-lime-400/80 bg-lime-500/15 text-lime-200 shadow-[0_0_15px_rgba(132,204,22,0.2)]'
                      : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500/50 hover:text-white'
                  }`}
                >
                  {t(item.labelKey)}
                  <span className="mt-0.5 block text-[10px] font-mono text-slate-500">
                    {formatNumber(item.lat, 2, activeLang)}°, {formatNumber(item.lon, 2, activeLang)}°
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <span className="mb-2.5 flex items-center gap-2 text-sm text-slate-300">
            <Activity className="h-4 w-4 text-emerald-400" />
            {t('earthTimeRange')}
          </span>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('earthTimeRange')}>
            {RANGE_OPTIONS.map((item) => {
              const isActive = item.key === rangeKey;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setRangeKey(item.key)}
                  aria-pressed={isActive}
                  className={`rounded-lg border px-3 py-2 text-sm transition-all cursor-pointer active:scale-[0.98] ${
                    isActive
                      ? 'border-cyan-400/80 bg-cyan-500/15 text-cyan-200'
                      : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500/50 hover:text-white'
                  }`}
                >
                  {t(item.labelKey)}
                </button>
              );
            })}
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="ml-auto flex items-center gap-2 rounded-lg border border-cyan-500/30 px-3 py-2 text-sm text-cyan-300 hover:bg-cyan-950/50 disabled:opacity-50 transition-all cursor-pointer active:scale-[0.98]"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {t('earthRefresh')}
            </button>
          </div>
          <p className="mt-3 text-[11px] font-mono text-slate-500">
            {t('earthCoordinates')}:{' '}
            {formatNumber(location.lat, 4, activeLang)}°,{' '}
            {formatNumber(location.lon, 4, activeLang)}°
          </p>
        </div>
      </div>

      {/* ===== Loading state ===== */}
      {loading && (
        <div
          className="rounded-2xl border border-slate-800 bg-slate-950/80 p-10"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-4">
            <div className="relative h-12 w-12">
              <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
              <Leaf className="absolute inset-0 m-auto h-5 w-5 text-lime-300" />
            </div>
            <p className="text-sm text-slate-300">{t('earthLoading')}</p>
            <p className="font-mono text-[10px] text-slate-600">
              POWER / MONTHLY / {PARAMS.temp} + {PARAMS.rain}
            </p>
          </div>
        </div>
      )}

      {/* ===== Error state ===== */}
      {!loading && error && (
        <div
          className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-6"
          role="alert"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-300" />
            <p className="text-sm text-amber-200">{error}</p>
            <button
              type="button"
              onClick={loadData}
              className="flex items-center gap-2 rounded-lg border border-amber-400/50 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/20 transition-all cursor-pointer active:scale-[0.98]"
            >
              <RefreshCw className="h-4 w-4" />
              {t('earthRetry')}
            </button>
          </div>
        </div>
      )}

      {/* ===== Empty state ===== */}
      {isEmpty && (
        <div
          className="rounded-2xl border border-slate-800 bg-slate-950/80 p-10 text-center"
          role="status"
        >
          <CloudRain className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 text-sm text-slate-400">{t('earthNoData')}</p>
        </div>
      )}

      {/* ===== Historical summary cards ===== */}
      {!loading && !error && !isEmpty && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Activity}
              accentClass="border-cyan-500/20"
              label={t('earthSummaryPeriod')}
              value={periodLabel}
              note={
                latest
                  ? `${t('earthSummaryLatest')}: ${formatMonthLabel(latest.date, activeLang)}`
                  : null
              }
            />
            <StatCard
              icon={Thermometer}
              accentClass="border-rose-500/20"
              label={t('earthSummaryAvgTemp')}
              value={formatNumber(summary.avgTemp, 1, activeLang)}
              unit={unitTemp}
              note={
                summary.warmestMonth
                  ? `${t('earthSummaryMaxTemp')}: ${formatNumber(summary.warmestMonth.temp, 1, activeLang)} ${unitTemp} (${formatMonthLabel(summary.warmestMonth.date, activeLang)})`
                  : null
              }
            />
            <StatCard
              icon={CloudRain}
              accentClass="border-sky-500/20"
              label={t('earthSummaryAvgRain')}
              value={formatNumber(summary.avgRain, 1, activeLang)}
              unit={unitRain}
              note={
                summary.wettestMonth
                  ? `${t('earthSummaryMaxRain')}: ${formatNumber(summary.wettestMonth.rain, 1, activeLang)} ${unitRain} (${formatMonthLabel(summary.wettestMonth.date, activeLang)})`
                  : null
              }
            />
            <StatCard
              icon={Sun}
              accentClass="border-amber-500/20"
              label={t('earthSummaryTotalRain')}
              value={formatNumber(summary.meanAnnualRainMm, 0, activeLang)}
              unit={unitRainTotal}
              note={
                summary.warmestYear
                  ? `${t('earthWarmestYear')}: ${summary.warmestYear.year} · ${t('earthWettestYear')}: ${summary.wettestYear ? summary.wettestYear.year : '—'}`
                  : null
              }
            />
          </div>

          {/* ===== Interactive temperature chart ===== */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 font-semibold text-white">
                  <Thermometer className="h-4 w-4 text-rose-400" />
                  {t('earthTemperatureChart')}
                  <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-[10px] text-rose-300">
                    {unitTemp}
                  </span>
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {t('earthTemperatureChartSub')}
                </p>
              </div>
            </div>

            <div className="h-64 w-full sm:h-80" data-no-swipe>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleRows} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    stroke="#64748b"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => formatMonthLabel(value, activeLang)}
                    minTickGap={28}
                  />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fontSize: 11 }}
                    width={52}
                    unit=""
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#020817',
                      border: '1px solid #334155',
                      borderRadius: 12
                    }}
                    labelStyle={{ color: '#67e8f9' }}
                    labelFormatter={tooltipLabelFormatter}
                    formatter={tempTooltipFormatter}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    onClick={(payload) => {
                      if (payload?.dataKey) toggleSeries(payload.dataKey);
                    }}
                  />
                  <ReferenceLine
                    y={summary.avgTemp ?? undefined}
                    stroke="#f43f5e"
                    strokeDasharray="6 4"
                    label={{
                      value: t('earthAnnualMean'),
                      fill: '#fda4af',
                      fontSize: 10,
                      position: 'insideTopRight'
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="temp"
                    name={t('earthMonthlySeries')}
                    stroke="#22d3ee"
                    strokeWidth={2}
                    fill="url(#tempGradient)"
                    connectNulls={false}
                    dot={false}
                    activeDot={{ r: 4 }}
                    hide={!!hiddenSeries.temp}
                  />
                  <Line
                    type="monotone"
                    dataKey="yearTempMean"
                    name={t('earthAnnualMean')}
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls={false}
                    hide={!!hiddenSeries.yearTempMean}
                  />
                  <Brush
                    dataKey="date"
                    height={22}
                    stroke="#22d3ee"
                    fill="#0f172a"
                    travellerWidth={8}
                    tickFormatter={(value) => formatMonthLabel(value, activeLang)}
                  />
                  <defs>
                    <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ===== Interactive rainfall chart ===== */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 font-semibold text-white">
                  <CloudRain className="h-4 w-4 text-sky-400" />
                  {t('earthRainfallChart')}
                  <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] text-sky-300">
                    {unitRain}
                  </span>
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {t('earthRainfallChartSub')}
                </p>
              </div>
            </div>

            <div className="h-64 w-full sm:h-80" data-no-swipe>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleRows} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    stroke="#64748b"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => formatMonthLabel(value, activeLang)}
                    minTickGap={28}
                  />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fontSize: 11 }}
                    width={52}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#020817',
                      border: '1px solid #334155',
                      borderRadius: 12
                    }}
                    labelStyle={{ color: '#7dd3fc' }}
                    labelFormatter={tooltipLabelFormatter}
                    formatter={rainTooltipFormatter}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    onClick={(payload) => {
                      if (payload?.dataKey) toggleSeries(payload.dataKey);
                    }}
                  />
                  <ReferenceLine
                    y={summary.avgRain ?? undefined}
                    stroke="#38bdf8"
                    strokeDasharray="6 4"
                    label={{
                      value: t('earthAnnualMean'),
                      fill: '#7dd3fc',
                      fontSize: 10,
                      position: 'insideTopRight'
                    }}
                  />
                  <Bar
                    dataKey="rain"
                    name={t('earthMonthlySeries')}
                    fill="#0ea5e9"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={14}
                    hide={!!hiddenSeries.rain}
                  />
                  <Line
                    type="monotone"
                    dataKey="yearRainMean"
                    name={t('earthAnnualMean')}
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls={false}
                    hide={!!hiddenSeries.yearRainMean}
                  />
                  <Brush
                    dataKey="date"
                    height={22}
                    stroke="#0ea5e9"
                    fill="#0f172a"
                    travellerWidth={8}
                    tickFormatter={(value) => formatMonthLabel(value, activeLang)}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ===== Yearly averages table ===== */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 sm:p-6">
            <h3 className="flex items-center gap-2 font-semibold text-white">
              <Activity className="h-4 w-4 text-emerald-400" />
              {t('earthYearlyTableHeading')}
            </h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-400">
                    <th className="px-3 py-2 font-medium">{t('earthTableYear')}</th>
                    <th className="px-3 py-2 font-medium">{t('earthTableAvgTemp')}</th>
                    <th className="px-3 py-2 font-medium">{t('earthTableAvgRain')}</th>
                    <th className="px-3 py-2 font-medium">{t('earthTableTotalRain')}</th>
                    <th className="px-3 py-2 font-medium">{t('earthTableMonths')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {summary.yearly.map((entry) => (
                    <tr key={entry.year} className="text-slate-300">
                      <td className="px-3 py-2 font-mono text-xs text-cyan-300">
                        {entry.year}
                      </td>
                      <td className="px-3 py-2">
                        {formatNumber(entry.avgTemp, 1, activeLang)} {unitTemp}
                      </td>
                      <td className="px-3 py-2">
                        {formatNumber(entry.avgRain, 1, activeLang)} {unitRain}
                      </td>
                      <td className="px-3 py-2">
                        {formatNumber(entry.totalRainMm, 0, activeLang)} {unitRainTotal}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {entry.months}
                        {!entry.complete ? ' *' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ===== Units & source disclaimer ===== */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 sm:p-5 space-y-2">
            <p className="text-xs leading-5 text-slate-400">
              <span className="font-semibold text-slate-300">{t('earthUnitsNote')}</span>
            </p>
            <p className="text-xs leading-5 text-slate-500">{t('earthDisclaimer')}</p>
          </div>
        </>
      )}
    </section>
  );
}
