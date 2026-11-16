/**
 * COSMORA Climate Intelligence & Trend Detective — NASA POWER workspace.
 *
 * Preserves 100% of the NASA POWER monthly archive integration, location
 * controls, dual-axis temperature/precipitation charts, and `ChartFrame`
 * mounting while adding:
 *   1. Repaired complete-year `annualMean` overlay & `annual-${code}` bar chart
 *   2. OLS linear regression + Theil–Sen non-parametric decade slopes
 *   3. Temperature (°C) & Rainfall (mm/day, %, annual mm) Anomaly Engine with
 *      explicit selectable reference baselines
 *   4. 12-month Seasonal Climatology, South Asian Monsoon & Meteorological
 *      regimes, and Historical Epoch Split comparison
 *   5. Historical Data Explorer, Deseasonalized Unusual Observations (|z| >= 2σ),
 *      Data Quality & Missing-Data Audit, and direct CSV export
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  Download,
  Gauge,
  LineChart as LineChartIcon,
  MapPin,
  RefreshCw,
  Table2
} from 'lucide-react';
import {
  Button,
  DataStateBadge,
  ErrorState,
  LoadingState,
  Metric,
  Panel,
  PanelHeader,
  SegmentedControl,
  SourceNote,
  cx
} from '../../ui/primitives';
import { ChartFrame } from '../../ui/ChartFrame';
import { parameterMeta, POWER_PARAMETERS, fetchPowerDataset } from '../../lib/earth/power';
import {
  computeAnomalies,
  computeDatasetHydrology,
  computeExtendedStats,
  computeHistoricalSplit,
  computeMonthlyClimatology,
  computeSeasonalBreakdown,
  detectUnusualObservations,
  type BaselineMode
} from '../../lib/earth/climateEngine';
import { downloadTextFile, powerSeriesCsv } from '../../lib/earth/context';
import { describeSeries, seriesLimitations } from '../../lib/earth/analysis';
import { SRI_LANKA_PLACES, WORLD_PLACES, type GazetteerEntry } from '../../lib/earth/geocode';
import type { PowerDataset, Sourced } from '../../lib/earth/types';

export interface StudyArea {
  label: string;
  latitude: number;
  longitude: number;
  source: 'gazetteer' | 'search' | 'map-click' | 'preset' | 'custom' | 'nominatim';
}

interface ChartTooltipEntry {
  value?: unknown;
  dataKey?: unknown;
  name?: unknown;
  color?: unknown;
  payload?: Record<string, unknown>;
}
interface ChartTooltipProps {
  active?: boolean;
  payload?: readonly ChartTooltipEntry[];
  label?: string | number;
}
type DrawableTooltipRow = ChartTooltipEntry & { value: number; dataKey: string };

interface TrendDetectiveProps {
  area: StudyArea;
  onAreaChange: (area: StudyArea) => void;
  onPowerResolved: (sourced: Sourced<PowerDataset> | null) => void;
  reducedMotion: boolean;
}

type SubView = 'series' | 'anomalies' | 'seasonality' | 'statistics' | 'explorer';

const RANGE_OPTIONS = [
  { value: '10y', label: '10y', years: 10 },
  { value: '20y', label: '20y', years: 20 },
  { value: '30y', label: '30y', years: 30 },
  { value: 'all', label: '1981→', years: 0 }
] as const;

const BASELINE_OPTIONS: Array<{ value: BaselineMode; labelKey: string }> = [
  { value: 'earliest-5', labelKey: 'earthBaselineEarliest5' },
  { value: 'earliest-10', labelKey: 'earthBaselineEarliest10' },
  { value: 'wmo-1991-2020', labelKey: 'earthBaselineWmo' },
  { value: 'window-mean', labelKey: 'earthBaselineWindow' }
];

const STUDY_PRESETS: GazetteerEntry[] = [
  SRI_LANKA_PLACES[0],
  ...SRI_LANKA_PLACES.slice(1, 7),
  ...WORLD_PLACES.slice(0, 5)
];

const AXIS = '#8294ad';
const GRID = 'rgba(148,178,214,0.14)';
const TEMP_COLOR = '#5ed3f2';
const PRECIP_COLOR = '#a3e635';
const ANNUAL_COLOR = '#6ee7b7';
const TREND_COLOR = '#f0c274';

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

function formatSigned(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function unitFamily(code: string): 'temperature' | 'precipitation' | 'other' {
  const meta = parameterMeta(code);
  if (!meta) return 'other';
  if (meta.kind === 'temperature') return 'temperature';
  if (meta.kind === 'precipitation') return 'precipitation';
  return 'other';
}

function SourceTooltip({
  active,
  payload,
  label,
  unit,
  labelName
}: {
  active?: boolean;
  payload?: readonly ChartTooltipEntry[];
  label?: string | number;
  unit: string;
  labelName: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter(
    (entry): entry is DrawableTooltipRow => typeof entry.value === 'number' && typeof entry.dataKey === 'string'
  );
  if (!rows.length) return null;
  return (
    <div className="rounded-[10px] border border-line bg-abyss/95 px-3 py-2 shadow-2xl backdrop-blur-md">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-atmo">
        {labelName} · {label}
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {rows.map((entry, index) => {
          const rowLabel =
            entry.dataKey === 'annualMean'
              ? 'Annual mean (12m)'
              : entry.dataKey === 'olsFitted'
                ? 'OLS trend fit'
                : entry.dataKey.startsWith('annual-')
                  ? parameterMeta(entry.dataKey.replace('annual-', ''))?.label || entry.dataKey
                  : parameterMeta(entry.dataKey)?.label || entry.dataKey;
          return (
            <li key={`${entry.dataKey}-${index}`} className="flex items-baseline justify-between gap-4 text-[11px]">
              <span className="text-ink-3">{rowLabel}</span>
              <span className="font-mono text-ink">
                {formatNumber(entry.value, 2)} {unit}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function TrendDetective({ area, onAreaChange, onPowerResolved, reducedMotion }: TrendDetectiveProps) {
  const { t } = useTranslation();
  const [rangeKey, setRangeKey] = useState<(typeof RANGE_OPTIONS)[number]['value']>('20y');
  const [subView, setSubView] = useState<SubView>('series');
  const [baselineMode, setBaselineMode] = useState<BaselineMode>('earliest-5');
  const [showTrendOverlay, setShowTrendOverlay] = useState(true);
  const [yearFilter, setYearFilter] = useState('');
  const [sourced, setSourced] = useState<Sourced<PowerDataset> | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeParams, setActiveParams] = useState<string[]>(['T2M']);
  const [compareMode, setCompareMode] = useState(false);
  const [customLat, setCustomLat] = useState(String(area.latitude));
  const [customLon, setCustomLon] = useState(String(area.longitude));
  const [coordinateError, setCoordinateError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { startYear, endYear } = useMemo(() => {
    const option = RANGE_OPTIONS.find((item) => item.value === rangeKey) || RANGE_OPTIONS[1];
    const now = new Date().getFullYear();
    if (!option.years) return { startYear: 1981, endYear: now };
    return { startYear: now - option.years + 1, endYear: now };
  }, [rangeKey]);

  const load = useCallback(
    async (force = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const result = await fetchPowerDataset({
          latitude: area.latitude,
          longitude: area.longitude,
          startYear,
          endYear,
          placeLabel: area.label,
          parameters: POWER_PARAMETERS.map((parameter) => parameter.code),
          signal: controller.signal,
          force
        });
        if (controller.signal.aborted) return;
        setSourced(result);
        onPowerResolved(result);
        if (result.data) {
          const available = result.data.available;
          const surviving = activeParams.filter((code) => available.includes(code));
          setActiveParams(surviving.length ? surviving : [available[0] || 'T2M']);
        }
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        setSourced({
          data: null,
          status: 'unavailable',
          error: (error as Error)?.message || 'POWER request failed.',
          provenance: {
            dataset: 'NASA POWER monthly climate & land-surface archive',
            provider: 'NASA POWER',
            datasetId: 'POWER monthly point',
            sourceUrl: 'https://power.larc.nasa.gov/api/temporal/monthly/point',
            retrievedAt: new Date().toISOString()
          }
        });
        onPowerResolved(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [area.latitude, area.longitude, area.label, startYear, endYear, activeParams, onPowerResolved]
  );

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area.latitude, area.longitude, startYear, endYear]);

  useEffect(() => {
    setCustomLat(String(area.latitude));
    setCustomLon(String(area.longitude));
  }, [area.latitude, area.longitude]);

  const dataset = sourced?.data || null;
  const primaryCode = activeParams[0] || 'T2M';
  const primaryUnit = parameterMeta(primaryCode)?.unit || '';
  const availableParameters = dataset?.available || [];

  const extendedByParam = useMemo(() => {
    if (!dataset) return {};
    const out: Record<string, ReturnType<typeof computeExtendedStats>> = {};
    for (const code of activeParams) {
      if (dataset.available.includes(code)) {
        out[code] = computeExtendedStats(dataset, code);
      }
    }
    return out;
  }, [dataset, activeParams]);

  const primaryExtended = extendedByParam[primaryCode] || null;

  // Populate monthly rows AND complete-year annualMean + OLS fitted line for the primary active parameter!
  const chartRows = useMemo(() => {
    if (!dataset) return [];
    const primaryAnnualMap = new Map<number, number>();
    const stats = dataset.stats[primaryCode];
    if (stats) {
      for (const yr of stats.annual) {
        if (yr.complete && typeof yr.mean === 'number') {
          primaryAnnualMap.set(yr.year, Number(yr.mean.toFixed(3)));
        }
      }
    }
    const fittedByYear = primaryExtended?.olsTrend?.fittedByYear || {};

    return dataset.rows.map((row) => {
      const entry: Record<string, string | number | null> = {
        date: row.date,
        year: row.year,
        month: row.month,
        annualMean: primaryAnnualMap.get(row.year) ?? null,
        olsFitted: typeof fittedByYear[row.year] === 'number' ? fittedByYear[row.year] : null
      };
      for (const code of activeParams) {
        entry[code] = typeof row.values[code] === 'number' ? row.values[code] : null;
      }
      return entry;
    });
  }, [dataset, activeParams, primaryCode, primaryExtended]);

  const plottable = chartRows.filter((row) => activeParams.some((code) => typeof row[code] === 'number')).length;

  // Build unified annual bar rows keyed by `annual-${code}` so `<Bar dataKey={`annual-${code}`}>` renders real bars!
  const annualChartRows = useMemo(() => {
    if (!dataset || !activeParams.length) return [];
    const yearsSet = new Set<number>();
    for (const code of activeParams) {
      for (const yr of dataset.stats[code]?.annual || []) {
        yearsSet.add(yr.year);
      }
    }
    return [...yearsSet]
      .sort((a, b) => a - b)
      .map((year) => {
        const primaryAnnual = dataset.stats[primaryCode]?.annual.find((e) => e.year === year);
        const row: Record<string, number | boolean | null> = {
          year,
          complete: Boolean(primaryAnnual?.complete)
        };
        for (const code of activeParams) {
          const found = dataset.stats[code]?.annual.find((e) => e.year === year);
          row[`annual-${code}`] = found?.complete && typeof found.mean === 'number' ? Number(found.mean.toFixed(3)) : null;
        }
        return row;
      });
  }, [dataset, activeParams, primaryCode]);

  const hasCompleteAnnualBars = useMemo(
    () => annualChartRows.some((r) => activeParams.some((code) => typeof r[`annual-${code}`] === 'number')),
    [annualChartRows, activeParams]
  );

  // Anomaly analysis for primary parameter (+ precipitation anomaly when available!)
  const primaryAnomalies = useMemo(
    () => (dataset ? computeAnomalies(dataset, primaryCode, baselineMode) : null),
    [dataset, primaryCode, baselineMode]
  );

  const secondaryAnomalyCode = useMemo(() => {
    if (!dataset) return null;
    if (primaryCode !== 'PRECTOTCORR' && dataset.available.includes('PRECTOTCORR')) return 'PRECTOTCORR';
    if (primaryCode !== 'T2M' && dataset.available.includes('T2M')) return 'T2M';
    return null;
  }, [dataset, primaryCode]);

  const secondaryAnomalies = useMemo(
    () => (dataset && secondaryAnomalyCode ? computeAnomalies(dataset, secondaryAnomalyCode, baselineMode) : null),
    [dataset, secondaryAnomalyCode, baselineMode]
  );

  // Seasonality, Monsoon regimes, and Historical Epoch Split
  const climatology = useMemo(
    () => (dataset ? computeMonthlyClimatology(dataset, primaryCode) : []),
    [dataset, primaryCode]
  );
  const seasonalRegimes = useMemo(
    () => (dataset ? computeSeasonalBreakdown(dataset, primaryCode) : []),
    [dataset, primaryCode]
  );
  const historicalSplit = useMemo(
    () => (dataset ? computeHistoricalSplit(dataset, primaryCode) : null),
    [dataset, primaryCode]
  );
  const unusualMonths = useMemo(
    () => (dataset ? detectUnusualObservations(dataset, primaryCode, 2.0) : []),
    [dataset, primaryCode]
  );
  const hydrology = useMemo(
    () => (dataset ? computeDatasetHydrology(dataset) : null),
    [dataset]
  );

  const filteredExplorerRows = useMemo(() => {
    if (!dataset) return [];
    const q = yearFilter.trim();
    const rows = q ? dataset.rows.filter((r) => r.date.includes(q)) : dataset.rows;
    return [...rows].reverse();
  }, [dataset, yearFilter]);

  const isDualAxis = useMemo(() => {
    const families = new Set(activeParams.map((code) => unitFamily(code)));
    return families.has('temperature') && families.has('precipitation');
  }, [activeParams]);

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------- controls */}
      <Panel className="earth-glass-panel space-y-5">
        <PanelHeader
          eyebrow="NASA POWER · Gridded Climate Intelligence"
          title={t('earthStudyArea')}
          description={t('earthSriLankaMonsoon')}
          icon={MapPin}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {primaryExtended ? (
                <span
                  className={cx(
                    'chip',
                    primaryExtended.quality.grade === 'high'
                      ? 'border-signal/40 text-signal'
                      : primaryExtended.quality.grade === 'moderate'
                        ? 'border-atmo/40 text-atmo-soft'
                        : 'border-caution/40 text-caution'
                  )}
                >
                  {primaryExtended.quality.completenessPct}% · {primaryExtended.quality.completeYears}y complete
                </span>
              ) : null}
              <DataStateBadge
                state={
                  sourced?.status === 'cached'
                    ? 'cached'
                    : sourced?.data
                      ? 'live'
                      : loading
                        ? 'loading'
                        : 'unavailable'
                }
              />
            </div>
          }
        />

        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-3">
            <p className="eyebrow">{t('earthSriLankaPlaces')}</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('earthSriLankaPlaces')}>
              {STUDY_PRESETS.map((preset) => {
                const active =
                  Math.abs(preset.latitude - area.latitude) < 0.01 && Math.abs(preset.longitude - area.longitude) < 0.01;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() =>
                      onAreaChange({
                        label: preset.name,
                        latitude: preset.latitude,
                        longitude: preset.longitude,
                        source: 'preset'
                      })
                    }
                    aria-pressed={active}
                    className={cx(
                      'rounded-full border px-3 py-1.5 text-[11.5px] transition-colors',
                      active
                        ? 'border-atmo/60 bg-atmo/12 text-atmo'
                        : 'border-line bg-surface/50 text-ink-3 hover:border-line-strong hover:text-ink'
                    )}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="earth-glass-inset p-3.5">
            <p className="eyebrow">{t('earthCustomCoordinates')}</p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[10.5px] text-ink-4">
                {t('earthLatitude')}
                <input
                  type="number"
                  step="0.01"
                  min={-90}
                  max={90}
                  value={customLat}
                  onChange={(event) => setCustomLat(event.target.value)}
                  className="h-8 rounded-[7px] border border-line bg-void/70 px-2 font-mono text-[11.5px] text-ink"
                />
              </label>
              <label className="flex flex-col gap-1 text-[10.5px] text-ink-4">
                {t('earthLongitude')}
                <input
                  type="number"
                  step="0.01"
                  min={-180}
                  max={180}
                  value={customLon}
                  onChange={(event) => setCustomLon(event.target.value)}
                  className="h-8 rounded-[7px] border border-line bg-void/70 px-2 font-mono text-[11.5px] text-ink"
                />
              </label>
            </div>
            {coordinateError ? <p className="mt-2 text-[10.5px] text-caution">{coordinateError}</p> : null}
            <Button
              variant="secondary"
              size="sm"
              className="mt-2.5 w-full"
              onClick={() => {
                const latitude = Number(customLat);
                const longitude = Number(customLon);
                if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                  setCoordinateError('Coordinates must be numbers.');
                  return;
                }
                if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
                  setCoordinateError('Latitude −90…90, longitude −180…180.');
                  return;
                }
                setCoordinateError(null);
                onAreaChange({
                  label: `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`,
                  latitude,
                  longitude,
                  source: 'custom'
                });
              }}
            >
              {t('earthApplyCoordinates')}
            </Button>
          </div>
        </div>

        {/* ------------------------------------------------ parameter selection */}
        <div className="space-y-3 border-t border-line/60 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="eyebrow">{t('earthSeriesRequested')}</span>
            <label className="flex cursor-pointer items-center gap-2 rounded-[8px] border border-line bg-surface/60 px-2.5 py-1 text-[11px] text-ink-2 transition hover:border-atmo/45">
              <input
                type="checkbox"
                checked={compareMode}
                onChange={(event) => {
                  const next = event.target.checked;
                  setCompareMode(next);
                  if (next && activeParams.length === 1 && availableParameters.includes('PRECTOTCORR') && primaryCode !== 'PRECTOTCORR') {
                    setActiveParams([primaryCode, 'PRECTOTCORR']);
                  } else if (!next && activeParams.length > 1) {
                    setActiveParams([activeParams[0]]);
                  }
                }}
                className="h-3.5 w-3.5 rounded border border-line bg-surface/60 accent-atmo"
              />
              {compareMode ? t('earthCompareMode') : t('earthSingleMode')}
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-[8px] border border-line bg-surface/60 px-2.5 py-1 text-[11px] text-ink-2 transition hover:border-atmo/45">
              <input
                type="checkbox"
                checked={showTrendOverlay}
                onChange={(event) => setShowTrendOverlay(event.target.checked)}
                className="h-3.5 w-3.5 rounded border border-line bg-surface/60 accent-atmo"
              />
              {t('earthShowTrendLine')}
            </label>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => load(true)}
              disabled={loading}
              icon={RefreshCw}
            >
              {t('earthRefreshData')}
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('earthParameterSelection')}>
            {POWER_PARAMETERS.map((parameter) => {
              const available = availableParameters.includes(parameter.code);
              const selected = activeParams.includes(parameter.code);
              return (
                <button
                  key={parameter.code}
                  type="button"
                  onClick={() => {
                    if (!available) return;
                    if (selected) {
                      if (activeParams.length > 1) {
                        const remaining = activeParams.filter((code) => code !== parameter.code);
                        setActiveParams(remaining);
                        if (remaining.length === 1) setCompareMode(false);
                      }
                    } else if (!compareMode) {
                      setActiveParams([parameter.code]);
                    } else if (activeParams.length < 4) {
                      setActiveParams([...activeParams, parameter.code]);
                    }
                  }}
                  aria-pressed={selected}
                  className={cx(
                    'rounded-full border px-3 py-1.5 text-[11.5px] transition-colors',
                    selected
                      ? 'border-atmo/60 bg-atmo/12 text-atmo'
                      : available
                        ? 'border-line bg-surface/50 text-ink-3 hover:border-line-strong hover:text-ink'
                        : 'cursor-not-allowed border-caution/30 bg-caution/[0.04] text-caution opacity-60'
                  )}
                  title={
                    available
                      ? `${parameter.label} (${parameter.code}) · ${parameter.unit}`
                      : `${t('earthSeriesUnavailableNote')}`
                  }
                >
                  {parameter.label}
                  <span className="ml-1.5 font-mono text-[9.5px] opacity-60">{parameter.code}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ----------------------------------- range + analysis sub-mode bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="eyebrow">{t('earthStatCoverage')}</span>
            <SegmentedControl
              label={t('earthStatCoverage')}
              value={rangeKey}
              onChange={(value) => setRangeKey(value)}
              items={RANGE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              size="sm"
            />
          </div>

          <div className="earth-subtab-bar" role="group" aria-label="Climate analysis views">
            {[
              { id: 'series' as const, label: t('earthSubtabSeries'), icon: LineChartIcon },
              { id: 'anomalies' as const, label: t('earthSubtabAnomalies'), icon: BarChart3 },
              { id: 'seasonality' as const, label: t('earthSubtabSeasonality'), icon: CalendarRange },
              { id: 'statistics' as const, label: t('earthSubtabStatistics', 'Hypothesis & Hydrology'), icon: CheckCircle2 },
              { id: 'explorer' as const, label: t('earthSubtabExplorer'), icon: Table2 }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={subView === item.id}
                  onClick={() => setSubView(item.id)}
                  className="earth-subtab-btn"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      {/* ------------------------------------------------------------ states */}
      {loading && !dataset ? (
        <Panel className="earth-glass-panel">
          <LoadingState label={t('earthLoadingSeries')} detail="power.larc.nasa.gov · monthly/point" rows={3} />
        </Panel>
      ) : null}

      {!loading && !dataset ? (
        <Panel className="earth-glass-panel">
          <ErrorState
            title={t('earthSeriesError')}
            message={sourced?.error || 'NASA POWER did not return a usable series for this point and window.'}
            onRetry={() => load(true)}
            retryLabel={t('earthRefreshData')}
          />
        </Panel>
      ) : null}

      {dataset ? (
        <>
          {/* ------------------------------------------------ summary KPI strip */}
          <div className="earth-kpi-strip">
            <div className="earth-kpi-card">
              <Metric
                label={`${primaryExtended?.label || primaryCode} · ${t('earthStatMean')}`}
                value={formatNumber(primaryExtended?.mean, 2)}
                unit={primaryUnit}
                note={`${t('earthStatMedian')}: ${formatNumber(primaryExtended?.median, 2)} · s=${formatNumber(primaryExtended?.stdDev, 2)}`}
                size="sm"
              />
            </div>
            <div className="earth-kpi-card">
              <Metric
                label={`${t('earthStatMinimum')} / ${t('earthStatMaximum')}`}
                value={
                  primaryExtended?.min && primaryExtended?.max
                    ? `${formatNumber(primaryExtended.min.value, 1)} → ${formatNumber(primaryExtended.max.value, 1)}`
                    : '—'
                }
                unit={primaryUnit}
                note={
                  primaryExtended?.min && primaryExtended?.max
                    ? `${primaryExtended.min.date} · ${primaryExtended.max.date}`
                    : t('earthNoData')
                }
                size="sm"
              />
            </div>
            <div className="earth-kpi-card">
              <Metric
                label={t('earthStatDecadeOls')}
                value={primaryExtended?.olsTrend ? formatSigned(primaryExtended.olsTrend.slopePerDecade, 3) : '—'}
                unit={primaryExtended?.olsTrend ? `${primaryUnit}/dec` : undefined}
                note={
                  primaryExtended?.olsTrend
                    ? `R²=${primaryExtended.olsTrend.rSquared.toFixed(2)} · ${primaryExtended.olsTrend.fromYear}–${primaryExtended.olsTrend.toYear}`
                    : t('earthStatSlopeUnavailable')
                }
                size="sm"
              />
            </div>
            <div className="earth-kpi-card">
              <Metric
                label={t('earthStatDecadeSen')}
                value={primaryExtended?.senSlope ? formatSigned(primaryExtended.senSlope.slopePerDecade, 3) : '—'}
                unit={primaryExtended?.senSlope ? `${primaryUnit}/dec` : undefined}
                note={
                  primaryExtended?.senSlope
                    ? `Non-parametric (${primaryExtended.senSlope.years} complete yrs)`
                    : t('earthStatSlopeUnavailable')
                }
                size="sm"
              />
            </div>
            <div className="earth-kpi-card">
              {primaryExtended?.meanAnnualTotalMm !== null && primaryExtended?.meanAnnualTotalMm !== undefined ? (
                <Metric
                  label={t('earthStatAnnualRainTotal')}
                  value={formatNumber(primaryExtended.meanAnnualTotalMm, 0)}
                  unit="mm/yr"
                  note={
                    primaryExtended.minAnnualTotalMm && primaryExtended.maxAnnualTotalMm
                      ? `${primaryExtended.minAnnualTotalMm.year}: ${formatNumber(primaryExtended.minAnnualTotalMm.value, 0)} · ${primaryExtended.maxAnnualTotalMm.year}: ${formatNumber(primaryExtended.maxAnnualTotalMm.value, 0)} mm`
                      : 'Complete 12-month years'
                  }
                  size="sm"
                />
              ) : (
                <Metric
                  label={t('earthSeriesAvailable')}
                  value={`${availableParameters.length}/${dataset.requestedParameters.length}`}
                  note={
                    dataset.unavailable.length
                      ? `${t('earthSeriesUnavailable')}: ${dataset.unavailable.join(', ')}`
                      : `${dataset.rows.length} monthly records`
                  }
                  size="sm"
                />
              )}
            </div>
          </div>

          {/* Validated Non-Parametric Mann–Kendall Hypothesis Verdict Strip */}
          {primaryExtended ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line/70 bg-abyss/60 px-4 py-2.5 text-[11.5px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip border-cyan-400/40 bg-cyan-500/10 text-cyan-200">
                  Official NASA Source · POWER MERRA-2
                </span>
                {primaryExtended.mannKendall.eligible ? (
                  <span
                    className={cx(
                      'chip',
                      primaryExtended.mannKendall.significantAt05
                        ? 'border-signal/50 bg-signal/10 text-signal'
                        : 'border-line text-ink-2'
                    )}
                  >
                    {primaryExtended.mannKendall.significantAt05
                      ? `Mann–Kendall p = ${primaryExtended.mannKendall.pValue} (< 0.05 · ${primaryExtended.mannKendall.direction})`
                      : `Mann–Kendall p = ${primaryExtended.mannKendall.pValue} (no monotonic trend at α = 0.05)`}
                  </span>
                ) : (
                  <span className="chip border-caution/40 text-caution">
                    Mann–Kendall withheld (n = {primaryExtended.mannKendall.n} &lt; 10 yrs)
                  </span>
                )}
                {primaryExtended.mannKendall.senCi95PerDecade ? (
                  <span className="font-mono text-[11px] text-ink-3">
                    Sen&apos;s 95% CI: [{formatSigned(primaryExtended.mannKendall.senCi95PerDecade[0], 3)},{' '}
                    {formatSigned(primaryExtended.mannKendall.senCi95PerDecade[1], 3)}] {primaryUnit}/dec
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setSubView('statistics')}
                className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-atmo underline decoration-dotted underline-offset-4 hover:text-ink"
              >
                {t('earthInspectStatsBtn', 'Inspect Mann–Kendall, Pettitt & SPI-12 →')}
              </button>
            </div>
          ) : null}

          {/* ================================================================
              SUB-VIEW 1: TRENDS & MONTHLY / ANNUAL SERIES
             ================================================================ */}
          {subView === 'series' ? (
            <Panel className="earth-glass-panel space-y-5">
              <PanelHeader
                eyebrow="POWER monthly point"
                title={compareMode && activeParams.length > 1 ? t('earthMultiParamChart') : t('earthMonthlyChart')}
                description={activeParams
                  .map((code) => {
                    const meta = parameterMeta(code);
                    return meta ? `${meta.label} (${meta.code}) · ${meta.unit}` : code;
                  })
                  .join(' · ')}
                icon={LineChartIcon}
                actions={<span className="chip">{dataset.placeLabel}</span>}
              />

              {isDualAxis ? (
                <>
                  <ChartFrame
                    height={340}
                    series={[
                      { key: activeParams[0], label: parameterMeta(activeParams[0])?.label || activeParams[0], color: TEMP_COLOR },
                      { key: activeParams[1], label: parameterMeta(activeParams[1])?.label || activeParams[1], color: PRECIP_COLOR },
                      { key: 'annualMean', label: t('earthAnnualMean'), color: ANNUAL_COLOR, dashed: true }
                    ]}
                    xLabel={`${t('earthTableYear')} · ${dataset.rows[0]?.date.slice(0, 4)}–${dataset.rows[dataset.rows.length - 1]?.date.slice(0, 4)}`}
                    yLabel={`${parameterMeta(activeParams[0])?.unit || ''} / ${parameterMeta(activeParams[1])?.unit || ''}`}
                    empty={
                      plottable ? undefined : (
                        <div className="px-6">
                          <p className="text-sm text-ink-2">{t('earthNoData')}</p>
                        </div>
                      )
                    }
                    table={
                      <table className="w-full text-left text-[10.5px]">
                        <caption className="sr-only">{`${dataset.placeLabel} monthly ${activeParams.join(', ')}`}</caption>
                        <thead className="sticky top-0 bg-abyss">
                          <tr className="text-ink-4">
                            <th scope="col" className="py-1 pr-2 font-normal">Month</th>
                            {activeParams.map((code) => (
                              <th key={code} scope="col" className="py-1 pr-2 text-right font-normal">
                                {code} ({parameterMeta(code)?.unit || code})
                              </th>
                            ))}
                            <th scope="col" className="py-1 text-right font-normal">Annual ({primaryCode})</th>
                          </tr>
                        </thead>
                        <tbody>
                          {chartRows.map((row) => (
                            <tr key={String(row.date)} className="border-t border-line/40 text-ink-2">
                              <td className="py-0.5 pr-2">{row.date}</td>
                              {activeParams.map((code) => (
                                <td key={code} className="py-0.5 pr-2 text-right tabular-nums">
                                  {typeof row[code] === 'number' ? (row[code] as number).toFixed(2) : '—'}
                                </td>
                              ))}
                              <td className="py-0.5 text-right tabular-nums">
                                {typeof row.annualMean === 'number' ? row.annualMean.toFixed(2) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    }
                  >
                    <ComposedChart data={chartRows} margin={{ top: 8, right: 60, left: 0, bottom: 4 }}>
                      <defs>
                        <linearGradient id="earthMonthlyFillTemp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={TEMP_COLOR} stopOpacity={0.22} />
                          <stop offset="100%" stopColor={TEMP_COLOR} stopOpacity={0.01} />
                        </linearGradient>
                        <linearGradient id="earthMonthlyFillPrecip" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={PRECIP_COLOR} stopOpacity={0.55} />
                          <stop offset="100%" stopColor={PRECIP_COLOR} stopOpacity={0.12} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke={AXIS}
                        tickLine={false}
                        axisLine={{ stroke: GRID }}
                        minTickGap={40}
                        tickFormatter={(value: string) => (value.endsWith('-01') ? value.slice(0, 4) : '')}
                      />
                      <YAxis
                        yAxisId={0}
                        dataKey={activeParams[0]}
                        stroke={AXIS}
                        tickLine={false}
                        axisLine={false}
                        width={52}
                        domain={['auto', 'auto']}
                        tickFormatter={(value: number) => value.toFixed(Math.abs(value) < 10 ? 1 : 0)}
                        orientation="left"
                      />
                      <YAxis
                        yAxisId={1}
                        dataKey={activeParams[1]}
                        stroke={AXIS}
                        tickLine={false}
                        axisLine={false}
                        width={52}
                        domain={['auto', 'auto']}
                        tickFormatter={(value: number) => value.toFixed(Math.abs(value) < 10 ? 1 : 0)}
                        orientation="right"
                      />
                      <Tooltip
                        cursor={{ stroke: 'rgba(167,232,250,0.35)', strokeWidth: 1 }}
                        content={({ active, payload, label }: ChartTooltipProps) => {
                          if (!active || !payload?.length) return null;
                          const rows = payload.filter(
                            (entry): entry is DrawableTooltipRow =>
                              typeof entry.value === 'number' && typeof entry.dataKey === 'string'
                          );
                          if (!rows.length) return null;
                          return (
                            <div className="rounded-[10px] border border-line bg-abyss/95 px-3 py-2 shadow-2xl backdrop-blur-md">
                              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-atmo">{label}</p>
                              <ul className="mt-1.5 space-y-0.5">
                                {rows.map((entry) => (
                                  <li key={`${entry.dataKey}-${entry.value}`} className="flex items-baseline justify-between gap-4 text-[11px]">
                                    <span className="text-ink-3">
                                      {entry.dataKey === 'annualMean'
                                        ? t('earthAnnualMean')
                                        : entry.dataKey === 'olsFitted'
                                          ? t('earthShowTrendLine')
                                          : parameterMeta(entry.dataKey)?.label || entry.dataKey}
                                    </span>
                                    <span className="font-mono text-ink">
                                      {formatNumber(entry.value, 2)} {parameterMeta(entry.dataKey)?.unit || primaryUnit}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        }}
                      />
                      {activeParams.map((code, idx) => {
                        const isTemp = unitFamily(code) === 'temperature';
                        const yAxisId = idx === 0 ? 0 : 1;
                        return isTemp ? (
                          <Area
                            key={code}
                            yAxisId={yAxisId}
                            type="monotone"
                            dataKey={code}
                            stroke={TEMP_COLOR}
                            strokeWidth={1.6}
                            fill="url(#earthMonthlyFillTemp)"
                            dot={false}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                        ) : (
                          <Bar
                            key={code}
                            yAxisId={yAxisId}
                            dataKey={code}
                            fill="url(#earthMonthlyFillPrecip)"
                            stroke={PRECIP_COLOR}
                            strokeWidth={0.6}
                            isAnimationActive={false}
                          />
                        );
                      })}
                      <Line
                        type="monotone"
                        dataKey="annualMean"
                        stroke={ANNUAL_COLOR}
                        strokeWidth={1.8}
                        strokeDasharray="4 3"
                        dot={false}
                        connectNulls
                        isAnimationActive={false}
                        yAxisId={0}
                      />
                      {showTrendOverlay ? (
                        <Line
                          type="monotone"
                          dataKey="olsFitted"
                          stroke={TREND_COLOR}
                          strokeWidth={1.5}
                          strokeDasharray="6 4"
                          dot={false}
                          connectNulls
                          isAnimationActive={false}
                          yAxisId={0}
                        />
                      ) : null}
                    </ComposedChart>
                  </ChartFrame>

                  <p className="rounded-[10px] border border-caution/20 bg-caution/[0.05] p-3 text-[11px] leading-relaxed text-caution">
                    {t('earthDualAxisNote')}
                  </p>
                </>
              ) : (
                <ChartFrame
                  height={330}
                  series={[
                    { key: primaryCode, label: parameterMeta(primaryCode)?.label || primaryCode, color: TEMP_COLOR },
                    { key: 'annualMean', label: t('earthAnnualMean'), color: ANNUAL_COLOR, dashed: true },
                    ...(showTrendOverlay && primaryExtended?.olsTrend
                      ? [{ key: 'olsFitted', label: t('earthShowTrendLine'), color: TREND_COLOR, dashed: true }]
                      : [])
                  ]}
                  xLabel={`${t('earthTableYear')} · ${dataset.rows[0]?.date.slice(0, 4)}–${dataset.rows[dataset.rows.length - 1]?.date.slice(0, 4)}`}
                  yLabel={primaryUnit}
                  empty={
                    plottable ? undefined : (
                      <div className="px-6">
                        <p className="text-sm text-ink-2">{t('earthNoData')}</p>
                      </div>
                    )
                  }
                  table={
                    <table className="w-full text-left text-[10.5px]">
                      <caption className="sr-only">{`${dataset.placeLabel} monthly ${primaryCode}`}</caption>
                      <thead className="sticky top-0 bg-abyss">
                        <tr className="text-ink-4">
                          <th scope="col" className="py-1 pr-2 font-normal">Month</th>
                          <th scope="col" className="py-1 pr-2 text-right font-normal">{primaryUnit || primaryCode}</th>
                          <th scope="col" className="py-1 text-right font-normal">Annual (12m)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chartRows.map((row) => (
                          <tr key={String(row.date)} className="border-t border-line/40 text-ink-2">
                            <td className="py-0.5 pr-2">{row.date}</td>
                            <td className="py-0.5 pr-2 text-right tabular-nums">
                              {typeof row[primaryCode] === 'number' ? (row[primaryCode] as number).toFixed(2) : '—'}
                            </td>
                            <td className="py-0.5 text-right tabular-nums">
                              {typeof row.annualMean === 'number' ? row.annualMean.toFixed(2) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  }
                >
                  <ComposedChart data={chartRows} margin={{ top: 8, right: 10, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="earthMonthlyFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={TEMP_COLOR} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={TEMP_COLOR} stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke={AXIS}
                      tickLine={false}
                      axisLine={{ stroke: GRID }}
                      minTickGap={40}
                      tickFormatter={(value: string) => (value.endsWith('-01') ? value.slice(0, 4) : '')}
                    />
                    <YAxis
                      yAxisId={0}
                      stroke={AXIS}
                      tickLine={false}
                      axisLine={false}
                      width={52}
                      domain={['auto', 'auto']}
                      tickFormatter={(value: number) => value.toFixed(Math.abs(value) < 10 ? 1 : 0)}
                    />
                    <Tooltip
                      cursor={{ stroke: 'rgba(167,232,250,0.35)', strokeWidth: 1 }}
                      content={<SourceTooltip unit={primaryUnit} labelName={t('earthMonthlySeries')} />}
                    />
                    {primaryExtended?.mean != null ? (
                      <ReferenceLine
                        yAxisId={0}
                        y={primaryExtended.mean}
                        stroke="rgba(167,232,250,0.35)"
                        strokeDasharray="5 5"
                        ifOverflow="extendDomain"
                      />
                    ) : null}
                    <Area
                      yAxisId={0}
                      type="monotone"
                      dataKey={primaryCode}
                      stroke={TEMP_COLOR}
                      strokeWidth={1.6}
                      fill="url(#earthMonthlyFill)"
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                      activeDot={{ r: 3, fill: '#a7e8fa', stroke: '#04202b' }}
                    />
                    <Line
                      yAxisId={0}
                      type="monotone"
                      dataKey="annualMean"
                      stroke={ANNUAL_COLOR}
                      strokeWidth={1.9}
                      strokeDasharray="4 3"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    {showTrendOverlay ? (
                      <Line
                        yAxisId={0}
                        type="monotone"
                        dataKey="olsFitted"
                        stroke={TREND_COLOR}
                        strokeWidth={1.6}
                        strokeDasharray="6 4"
                        dot={false}
                        connectNulls
                        isAnimationActive={false}
                      />
                    ) : null}
                  </ComposedChart>
                </ChartFrame>
              )}

              {/* Repaired Annual Means BarChart (`annual-${code}` properly populated!) */}
              <ChartFrame
                height={220}
                eyebrow="Annual aggregation"
                title={t('earthAnnualChart')}
                series={activeParams.map((code, idx) => ({
                  key: `annual-${code}`,
                  label: parameterMeta(code)?.label || code,
                  color: idx === 0 ? '#4f8dff' : PRECIP_COLOR
                }))}
                xLabel="Complete 12-month calendar years"
                yLabel={primaryUnit}
                empty={
                  hasCompleteAnnualBars ? undefined : (
                    <div className="px-6">
                      <p className="text-sm text-ink-2">{t('earthStatSlopeUnavailable')}</p>
                      <p className="mt-1 text-[11px] text-ink-4">
                        Annual means require twelve monthly values; this window has fewer.
                      </p>
                    </div>
                  )
                }
                table={
                  <table className="w-full text-left text-[10.5px]">
                    <thead className="sticky top-0 bg-abyss">
                      <tr className="text-ink-4">
                        <th scope="col" className="py-1 pr-2 font-normal">Year</th>
                        {activeParams.map((code) => (
                          <th key={code} scope="col" className="py-1 pr-2 text-right font-normal">
                            {code} ({parameterMeta(code)?.unit || code})
                          </th>
                        ))}
                        <th scope="col" className="py-1 text-right font-normal">Completeness</th>
                      </tr>
                    </thead>
                    <tbody>
                      {annualChartRows.map((entry) => (
                        <tr key={String(entry.year)} className="border-t border-line/40 text-ink-2">
                          <td className="py-0.5 pr-2">{String(entry.year)}</td>
                          {activeParams.map((code) => {
                            const val = entry[`annual-${code}`];
                            return (
                              <td key={code} className="py-0.5 pr-2 text-right tabular-nums">
                                {typeof val === 'number' ? val.toFixed(2) : '—'}
                              </td>
                            );
                          })}
                          <td className="py-0.5 text-right tabular-nums">{entry.complete ? '12/12' : 'partial'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                }
              >
                <BarChart data={annualChartRows} margin={{ top: 8, right: 10, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
                  <XAxis
                    dataKey="year"
                    stroke={AXIS}
                    tickLine={false}
                    axisLine={{ stroke: GRID }}
                    minTickGap={16}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    yAxisId={0}
                    stroke={AXIS}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    domain={['auto', 'auto']}
                    tickFormatter={(value: number) => value.toFixed(Math.abs(value) < 10 ? 1 : 0)}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(148,178,214,0.08)' }}
                    content={<SourceTooltip unit={primaryUnit} labelName={t('earthAnnualChart')} />}
                  />
                  {activeParams.slice(0, isDualAxis ? 1 : activeParams.length).map((code, idx) => (
                    <Bar
                      key={code}
                      yAxisId={0}
                      dataKey={`annual-${code}`}
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={!reducedMotion}
                    >
                      {annualChartRows.map((row) => (
                        <Cell key={`${String(row.year)}-${code}`} fill={idx === 0 ? '#4f8dff' : PRECIP_COLOR} />
                      ))}
                    </Bar>
                  ))}
                </BarChart>
              </ChartFrame>

              <p className="rounded-[10px] border border-caution/20 bg-caution/[0.05] p-3 text-[11px] leading-relaxed text-caution">
                {primaryExtended?.caveat || t('earthTrendCaveat')}
              </p>
            </Panel>
          ) : null}

          {/* ================================================================
              SUB-VIEW 2: TEMPERATURE & RAINFALL ANOMALY ENGINE
             ================================================================ */}
          {subView === 'anomalies' ? (
            <Panel className="earth-glass-panel space-y-5">
              <PanelHeader
                eyebrow="Climate Anomaly Intelligence"
                title={t('earthAnomalyChartTitle')}
                description={primaryAnomalies?.baselineLabel || ''}
                icon={BarChart3}
                actions={
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('earthBaselineLabel')}>
                    {BASELINE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={baselineMode === opt.value}
                        onClick={() => setBaselineMode(opt.value)}
                        className={cx(
                          'rounded-full border px-2.5 py-1 text-[11px] transition',
                          baselineMode === opt.value
                            ? 'border-atmo/60 bg-atmo/12 text-atmo-soft'
                            : 'border-line bg-surface/50 text-ink-3 hover:text-ink'
                        )}
                      >
                        {t(opt.labelKey)}
                      </button>
                    ))}
                  </div>
                }
              />

              {[primaryAnomalies, secondaryAnomalies]
                .filter((item): item is NonNullable<typeof primaryAnomalies> => Boolean(item))
                .map((anom) => {
                  const isTemp = unitFamily(anom.code) === 'temperature';
                  const posColor = isTemp ? '#fb7185' : '#34d399';
                  const negColor = isTemp ? '#38bdf8' : '#f59e0b';
                  const meta = parameterMeta(anom.code);

                  if (!anom.available) {
                    return (
                      <div key={anom.code} className="earth-glass-inset p-4 text-xs text-caution">
                        <p className="font-semibold text-ink">{meta?.label || anom.code}</p>
                        <p className="mt-1">{anom.unavailableReason}</p>
                      </div>
                    );
                  }

                  return (
                    <div key={anom.code} className="earth-glass-inset space-y-4 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="eyebrow">{anom.code} · {anom.unit}</p>
                          <h4 className="mt-1 text-sm font-semibold text-ink">
                            {meta?.label || anom.code} — Baseline {formatNumber(anom.baselineMean, 2)} {anom.unit}
                            {anom.baselineMeanTotalMm !== null ? ` (${formatNumber(anom.baselineMeanTotalMm, 0)} mm/yr)` : ''}
                          </h4>
                          <p className="mt-0.5 text-[11px] text-ink-3">{anom.baselineLabel}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {anom.latest ? (
                            <span className="chip border-atmo/35 text-atmo-soft">
                              {anom.latest.year}: {formatSigned(anom.latest.anomaly, 2)} {anom.unit}
                              {anom.latest.percentAnomaly !== null ? ` (${formatSigned(anom.latest.percentAnomaly, 1)}%)` : ''}
                            </span>
                          ) : null}
                          {anom.highest ? (
                            <span className="chip">
                              Max {anom.highest.year}: {formatSigned(anom.highest.anomaly, 2)} {anom.unit}
                            </span>
                          ) : null}
                          {anom.lowest ? (
                            <span className="chip">
                              Min {anom.lowest.year}: {formatSigned(anom.lowest.anomaly, 2)} {anom.unit}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <ChartFrame
                        height={240}
                        series={[
                          { key: `${anom.code}-pos`, label: t('earthAnomalyWarmWet'), color: posColor },
                          { key: `${anom.code}-neg`, label: t('earthAnomalyCoolDry'), color: negColor }
                        ]}
                        xLabel={`${anom.points[0]?.year}–${anom.points[anom.points.length - 1]?.year} (complete years)`}
                        yLabel={`Anomaly (${anom.unit})`}
                        table={
                          <table className="w-full text-left text-[10.5px]">
                            <thead className="sticky top-0 bg-abyss">
                              <tr className="text-ink-4">
                                <th scope="col" className="py-1 pr-2 font-normal">Year</th>
                                <th scope="col" className="py-1 pr-2 text-right font-normal">Mean</th>
                                <th scope="col" className="py-1 pr-2 text-right font-normal">Anomaly ({anom.unit})</th>
                                <th scope="col" className="py-1 text-right font-normal">% / mm</th>
                              </tr>
                            </thead>
                            <tbody>
                              {anom.points.map((pt) => (
                                <tr key={pt.year} className="border-t border-line/40 text-ink-2">
                                  <td className="py-0.5 pr-2">{pt.year}</td>
                                  <td className="py-0.5 pr-2 text-right tabular-nums">{pt.mean.toFixed(2)}</td>
                                  <td className="py-0.5 pr-2 text-right tabular-nums">{formatSigned(pt.anomaly, 2)}</td>
                                  <td className="py-0.5 text-right tabular-nums">
                                    {pt.totalAnomalyMm !== null
                                      ? `${formatSigned(pt.totalAnomalyMm, 0)} mm`
                                      : pt.percentAnomaly !== null
                                        ? `${formatSigned(pt.percentAnomaly, 1)}%`
                                        : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        }
                      >
                        <BarChart data={anom.points} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                          <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
                          <XAxis dataKey="year" stroke={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
                          <YAxis
                            yAxisId={0}
                            stroke={AXIS}
                            tickLine={false}
                            axisLine={false}
                            width={52}
                            domain={['auto', 'auto']}
                            tickFormatter={(v: number) => formatSigned(v, Math.abs(v) < 2 ? 2 : 1)}
                          />
                          <ReferenceLine yAxisId={0} y={0} stroke="rgba(238,243,251,0.4)" strokeWidth={1} />
                          <Tooltip
                            cursor={{ fill: 'rgba(148,178,214,0.08)' }}
                            content={({ active, payload }: ChartTooltipProps) => {
                              if (!active || !payload?.length) return null;
                              const raw = payload[0]?.payload as
                                | {
                                    year?: number;
                                    mean?: number;
                                    anomaly?: number;
                                    percentAnomaly?: number | null;
                                    zAnomaly?: number | null;
                                    totalAnomalyMm?: number | null;
                                  }
                                | undefined;
                              if (!raw || typeof raw.anomaly !== 'number') return null;
                              return (
                                <div className="rounded-[10px] border border-line bg-abyss/95 px-3 py-2 text-[11px] shadow-2xl backdrop-blur-md">
                                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-atmo">
                                    {raw.year} · {anom.code}
                                  </p>
                                  <p className="mt-1 font-mono text-ink">
                                    Anomaly: {formatSigned(raw.anomaly, 3)} {anom.unit}
                                    {typeof raw.zAnomaly === 'number' ? ` (${formatSigned(raw.zAnomaly, 2)}σ)` : ''}
                                  </p>
                                  {typeof raw.percentAnomaly === 'number' ? (
                                    <p className="font-mono text-ink-3">Relative: {formatSigned(raw.percentAnomaly, 1)}%</p>
                                  ) : null}
                                  {typeof raw.totalAnomalyMm === 'number' ? (
                                    <p className="font-mono text-ink-3">Annual total diff: {formatSigned(raw.totalAnomalyMm, 0)} mm</p>
                                  ) : null}
                                  <p className="mt-0.5 text-[10px] text-ink-4">Year mean: {formatNumber(raw.mean, 2)} {anom.unit}</p>
                                </div>
                              );
                            }}
                          />
                          <Bar yAxisId={0} dataKey="anomaly" radius={[2, 2, 2, 2]} isAnimationActive={!reducedMotion}>
                            {anom.points.map((pt) => (
                              <Cell key={pt.year} fill={pt.anomaly >= 0 ? posColor : negColor} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ChartFrame>
                    </div>
                  );
                })}

              <p className="text-[11px] text-ink-4">{t('earthAnomalyRainPctNote')}</p>
            </Panel>
          ) : null}

          {/* ================================================================
              SUB-VIEW 3: SEASONALITY, MONSOON REGIMES & EPOCH SPLIT
             ================================================================ */}
          {subView === 'seasonality' ? (
            <div className="space-y-4">
              <Panel className="earth-glass-panel space-y-4">
                <PanelHeader
                  eyebrow="Annual Cycle"
                  title={t('earthClimatologyTitle')}
                  description={`${parameterMeta(primaryCode)?.label || primaryCode} (${primaryCode}) · ${dataset.startYear}–${dataset.endYear}`}
                  icon={CalendarRange}
                />

                <ChartFrame
                  height={260}
                  series={[
                    { key: 'mean', label: `${primaryCode} monthly mean (${primaryUnit})`, color: TEMP_COLOR },
                    { key: 'max', label: 'Observed month max', color: '#f0c274', dashed: true },
                    { key: 'min', label: 'Observed month min', color: '#94a3b8', dashed: true }
                  ]}
                  xLabel="Calendar month (Jan–Dec)"
                  yLabel={primaryUnit}
                >
                  <ComposedChart data={climatology} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
                    <XAxis dataKey="monthLabel" stroke={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                    <YAxis
                      yAxisId={0}
                      stroke={AXIS}
                      tickLine={false}
                      axisLine={false}
                      width={52}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      cursor={{ stroke: 'rgba(167,232,250,0.3)', strokeWidth: 1 }}
                      content={({ active, payload, label }: ChartTooltipProps) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0]?.payload as
                          | {
                              mean?: number | null;
                              min?: number | null;
                              max?: number | null;
                              stdDev?: number | null;
                              meanTotalMm?: number | null;
                              count?: number;
                            }
                          | undefined;
                        if (!row) return null;
                        return (
                          <div className="rounded-[10px] border border-line bg-abyss/95 px-3 py-2 text-[11px] shadow-2xl">
                            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-atmo">
                              {label} ({row.count ?? 0} yrs)
                            </p>
                            <p className="mt-1 font-mono text-ink">
                              Mean: {formatNumber(row.mean, 2)} {primaryUnit} (s={formatNumber(row.stdDev, 2)})
                            </p>
                            <p className="font-mono text-ink-3">
                              Range: {formatNumber(row.min, 2)} → {formatNumber(row.max, 2)} {primaryUnit}
                            </p>
                            {typeof row.meanTotalMm === 'number' ? (
                              <p className="font-mono text-signal">Mean month total: {formatNumber(row.meanTotalMm, 1)} mm</p>
                            ) : null}
                          </div>
                        );
                      }}
                    />
                    <Line
                      yAxisId={0}
                      type="monotone"
                      dataKey="max"
                      stroke="#f0c274"
                      strokeWidth={1.2}
                      strokeDasharray="4 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId={0}
                      type="monotone"
                      dataKey="mean"
                      stroke={TEMP_COLOR}
                      strokeWidth={2.2}
                      dot={{ r: 3, fill: TEMP_COLOR }}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId={0}
                      type="monotone"
                      dataKey="min"
                      stroke="#94a3b8"
                      strokeWidth={1.2}
                      strokeDasharray="4 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ChartFrame>
              </Panel>

              <div className="grid gap-4 lg:grid-cols-2">
                <Panel className="earth-glass-panel space-y-3">
                  <PanelHeader eyebrow="Seasonal Regimes" title={t('earthMonsoonRegimesTitle')} icon={Activity} />
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {seasonalRegimes
                      .filter((s) => s.scheme === 'monsoon')
                      .map((s) => (
                        <div key={s.id} className="earth-glass-inset p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] uppercase tracking-wider text-atmo">{s.monthsLabel}</span>
                            {s.shareOfAnnualPct !== null ? (
                              <span className="chip border-signal/30 text-signal">{s.shareOfAnnualPct}% of yr</span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs font-semibold text-ink">{s.label}</p>
                          <p className="mt-1 font-mono text-base font-semibold text-ink">
                            {formatNumber(s.mean, 2)} <span className="text-[10.5px] font-normal text-ink-4">{primaryUnit}</span>
                          </p>
                          {s.meanSeasonTotalMm !== null ? (
                            <p className="mt-0.5 font-mono text-[10.5px] text-ink-3">
                              ≈ {formatNumber(s.meanSeasonTotalMm, 0)} mm/season ({s.count} obs)
                            </p>
                          ) : (
                            <p className="mt-0.5 font-mono text-[10.5px] text-ink-4">{s.count} monthly obs</p>
                          )}
                        </div>
                      ))}
                  </div>
                </Panel>

                <Panel className="earth-glass-panel space-y-3">
                  <PanelHeader eyebrow="Epoch Contrast" title={t('earthEpochSplitTitle')} icon={CalendarRange} />
                  {historicalSplit ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="earth-glass-inset p-3">
                          <p className="text-[10.5px] text-ink-4">{t('earthEpochEarly')}</p>
                          <p className="font-mono text-[10.5px] text-ink-3">{historicalSplit.earlyLabel}</p>
                          <p className="mt-1.5 font-mono text-base font-semibold text-ink">
                            {formatNumber(historicalSplit.earlyMean, 2)} {historicalSplit.unit}
                          </p>
                          {historicalSplit.earlyAnnualTotalMm !== null ? (
                            <p className="font-mono text-[10px] text-ink-4">{formatNumber(historicalSplit.earlyAnnualTotalMm, 0)} mm/yr</p>
                          ) : null}
                        </div>
                        <div className="earth-glass-inset p-3">
                          <p className="text-[10.5px] text-ink-4">{t('earthEpochRecent')}</p>
                          <p className="font-mono text-[10.5px] text-ink-3">{historicalSplit.recentLabel}</p>
                          <p className="mt-1.5 font-mono text-base font-semibold text-ink">
                            {formatNumber(historicalSplit.recentMean, 2)} {historicalSplit.unit}
                          </p>
                          {historicalSplit.recentAnnualTotalMm !== null ? (
                            <p className="font-mono text-[10px] text-ink-4">{formatNumber(historicalSplit.recentAnnualTotalMm, 0)} mm/yr</p>
                          ) : null}
                        </div>
                        <div className="earth-glass-inset border-atmo/30 p-3">
                          <p className="text-[10.5px] text-ink-4">{t('earthEpochDelta')}</p>
                          <p className="font-mono text-[10.5px] text-atmo-soft">
                            {historicalSplit.earlyYears}y vs {historicalSplit.recentYears}y
                          </p>
                          <p className="mt-1.5 font-mono text-base font-semibold text-ink">
                            {formatSigned(historicalSplit.delta, 2)} {historicalSplit.unit}
                          </p>
                          {historicalSplit.deltaAnnualTotalMm !== null ? (
                            <p className="font-mono text-[10px] text-ink-3">
                              {formatSigned(historicalSplit.deltaAnnualTotalMm, 0)} mm/yr ({formatSigned(historicalSplit.percentDelta, 1)}%)
                            </p>
                          ) : historicalSplit.percentDelta !== null ? (
                            <p className="font-mono text-[10px] text-ink-3">{formatSigned(historicalSplit.percentDelta, 1)}%</p>
                          ) : null}
                        </div>
                      </div>
                      {historicalSplit.tTest ? (
                        <div className="rounded-[10px] border border-line/70 bg-abyss/50 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-atmo">
                              Two-sample t-test · {historicalSplit.tTest.testName}
                            </span>
                            <span
                              className={cx(
                                'chip',
                                historicalSplit.tTest!.significantAt05
                                  ? 'border-signal/50 bg-signal/10 text-signal'
                                  : 'border-line text-ink-3'
                              )}
                            >
                              {historicalSplit.tTest!.significantAt05
                                ? `p = ${historicalSplit.tTest!.pValue} (< 0.05 · significant)`
                                : `p = ${historicalSplit.tTest!.pValue} (>= 0.05 · not significant)`}
                            </span>
                          </div>
                          <dl className="grid grid-cols-2 gap-2 border-y border-line/50 pt-2 font-mono text-[10.5px]">
                            <div>
                              <dt className="text-[9px] uppercase text-ink-4">t statistic</dt>
                              <dd className="text-ink">{historicalSplit.tTest!.tStatistic}</dd>
                            </div>
                            <div>
                              <dt className="text-[9px] uppercase text-ink-4">Degrees of freedom</dt>
                              <dd className="text-ink">{historicalSplit.tTest!.degreesOfFreedom}</dd>
                            </div>
                            <div className="col-span-2">
                              <dt className="text-[9px] uppercase text-ink-4">95% CI on mean difference</dt>
                              <dd className="text-ink">
                                {historicalSplit.tTest!.confidenceInterval95 ? (
                                  `[${historicalSplit.tTest!.confidenceInterval95[0] >= 0 ? '+' : ''}${historicalSplit.tTest!.confidenceInterval95[0]}, ${historicalSplit.tTest!.confidenceInterval95[1] >= 0 ? '+' : ''}${historicalSplit.tTest!.confidenceInterval95[1]}] {historicalSplit.unit}`
                                ) : '—'}
                              </dd>
                            </div>
                            <div className="col-span-2">
                              <dt className="text-[9px] uppercase text-ink-4">Assumption check</dt>
                              <dd className="text-ink">
                                {historicalSplit.tTest!.equalVariancesAssumed
                                  ? 'Equal variances not rejected (Student pooled)'
                                  : 'Equal variances rejected (Welch unequal-variance)'}
                              </dd>
                            </div>
                          </dl>
                          <p className="text-[11px] leading-relaxed text-ink-2">
                            {historicalSplit.tTest!.interpretation}
                          </p>
                        </div>
                      ) : null}
                      <p className="text-[11px] leading-relaxed text-ink-4">
                        Descriptive difference between the earlier and later halves of complete calendar years in the retrieved record. Significance is assessed by the two-sample t-test above; without a significant result, the direction of the raw mean difference is not presented as evidence of a real shift.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-ink-3">
                      At least 4 complete calendar years are required for a historical two-epoch split. Select the 10y, 20y, or 30y range.
                    </p>
                  )}
                </Panel>
              </div>
            </div>
          ) : null}

          {/* ================================================================
              SUB-VIEW 4: HISTORICAL DATA EXPLORER, UNUSUAL OBS & QUALITY AUDIT
             ================================================================ */}
          {subView === 'explorer' ? (
            <div className="space-y-4">
              {primaryExtended ? (
                <Panel className="earth-glass-panel space-y-3">
                  <PanelHeader
                    eyebrow="Data Integrity"
                    title={t('earthQualityTitle')}
                    description={primaryExtended.quality.summary}
                    icon={primaryExtended.quality.grade === 'high' ? CheckCircle2 : AlertTriangle}
                    actions={
                      <span
                        className={cx(
                          'chip',
                          primaryExtended.quality.grade === 'high'
                            ? 'border-signal/40 text-signal'
                            : primaryExtended.quality.grade === 'moderate'
                              ? 'border-atmo/40 text-atmo-soft'
                              : 'border-caution/40 text-caution'
                        )}
                      >
                        {primaryExtended.quality.grade === 'high'
                          ? t('earthQualityGradeHigh')
                          : primaryExtended.quality.grade === 'moderate'
                            ? t('earthQualityGradeModerate')
                            : t('earthQualityGradeLimited')}
                      </span>
                    }
                  />
                  {primaryExtended.quality.gapSpans.length > 0 ? (
                    <div className="earth-glass-inset p-3 text-xs text-caution">
                      <p className="font-medium">Detected missing-month spans (never interpolated):</p>
                      <p className="mt-1 font-mono text-[11px]">
                        {primaryExtended.quality.gapSpans
                          .map((g) => (g.start === g.end ? g.start : `${g.start} → ${g.end} (${g.months}m)`))
                          .join(' · ')}
                      </p>
                    </div>
                  ) : null}
                </Panel>
              ) : null}

              <Panel className="earth-glass-panel space-y-3">
                <PanelHeader
                  eyebrow="Deseasonalized Extremes"
                  title={t('earthUnusualTitle')}
                  description={`${parameterMeta(primaryCode)?.label || primaryCode} (${primaryCode})`}
                  icon={Activity}
                />
                {unusualMonths.length === 0 ? (
                  <p className="text-xs text-ink-3">{t('earthUnusualNone')}</p>
                ) : (
                  <div className="max-h-60 overflow-auto rounded-[12px] border border-line/70">
                    <table className="earth-data-table text-left">
                      <thead>
                        <tr>
                          <th scope="col">Month</th>
                          <th scope="col" className="text-right">Observed ({primaryUnit})</th>
                          <th scope="col" className="text-right">Month Mean</th>
                          <th scope="col" className="text-right">Departure</th>
                          <th scope="col" className="text-right">z-score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unusualMonths.slice(0, 16).map((u) => (
                          <tr key={u.date}>
                            <td className="font-mono text-ink">{u.date} ({u.monthLabel})</td>
                            <td className="text-right font-mono text-ink">
                              {u.value.toFixed(2)}
                              {u.monthlyTotalMm !== null ? ` (${u.monthlyTotalMm.toFixed(0)} mm)` : ''}
                            </td>
                            <td className="text-right font-mono">{u.climatologyMean.toFixed(2)}</td>
                            <td className="text-right font-mono">{formatSigned(u.departure, 2)}</td>
                            <td className={cx('text-right font-mono font-semibold', u.direction === 'high' ? 'text-caution' : 'text-atmo-soft')}>
                              {formatSigned(u.zScore, 2)}σ
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <Panel className="earth-glass-panel space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="eyebrow">Retrieved Monthly Table</p>
                    <h4 className="text-sm font-semibold text-ink">
                      {dataset.placeLabel} · {filteredExplorerRows.length} monthly rows
                    </h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="earth-explorer-year-filter" className="sr-only">
                      {t('earthExplorerFilterYear')}
                    </label>
                    <input
                      id="earth-explorer-year-filter"
                      type="search"
                      value={yearFilter}
                      onChange={(e) => setYearFilter(e.target.value)}
                      placeholder={t('earthExplorerFilterYear')}
                      className="h-8 rounded-[8px] border border-line bg-void/70 px-2.5 font-mono text-xs text-ink placeholder:text-ink-4"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Download}
                      onClick={() =>
                        downloadTextFile(
                          `cosmora-power-${dataset.placeLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${dataset.startYear}-${dataset.endYear}.csv`,
                          powerSeriesCsv(dataset),
                          'text/csv'
                        )
                      }
                    >
                      {t('earthDownloadSeriesCsv')}
                    </Button>
                  </div>
                </div>

                <div className="max-h-80 overflow-auto rounded-[12px] border border-line/70">
                  <table className="earth-data-table text-left">
                    <thead>
                      <tr>
                        <th scope="col">YYYY-MM</th>
                        {dataset.available.map((code) => (
                          <th key={code} scope="col" className="text-right">
                            {code} ({parameterMeta(code)?.unit || ''})
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExplorerRows.slice(0, 240).map((row) => (
                        <tr key={row.date}>
                          <td className="font-mono text-ink">{row.date}</td>
                          {dataset.available.map((code) => (
                            <td key={code} className="text-right font-mono">
                              {typeof row.values[code] === 'number' ? (row.values[code] as number).toFixed(2) : '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          ) : null}

          {/* ================================================================
              SUB-VIEW 5: VALIDATED HYPOTHESIS TESTS & HYDROLOGICAL SPI-12
             ================================================================ */}
          {subView === 'statistics' && primaryExtended ? (
            <div className="space-y-5">
              <Panel className="earth-glass-panel space-y-4">
                <PanelHeader
                  eyebrow="Peer-Reviewed Non-Parametric Trend Testing"
                  title={`${parameterMeta(primaryCode)?.label || primaryCode} (${primaryCode}) · Statistical Hypothesis Suite`}
                  description="WMO / USGS-recommended non-parametric tests over complete 12-month calendar years and monthly seasonal series — never claiming causal attribution."
                  icon={CheckCircle2}
                  actions={
                    <span className="chip border-cyan-400/40 bg-cyan-500/10 text-cyan-200">
                      α = 0.05 (two-sided)
                    </span>
                  }
                />

                <div className="grid gap-4 lg:grid-cols-3">
                  {/* 1. Hamed-Rao Mann-Kendall */}
                  <div className="rounded-[12px] border border-line/70 bg-abyss/55 p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-atmo">
                        Mann–Kendall (Hamed &amp; Rao 1998)
                      </span>
                      <span
                        className={cx(
                          'chip',
                          !primaryExtended.mannKendall.eligible
                            ? 'border-caution/40 text-caution'
                            : primaryExtended.mannKendall.significantAt05
                              ? 'border-signal/50 bg-signal/10 text-signal'
                              : 'border-line text-ink-3'
                        )}
                      >
                        {!primaryExtended.mannKendall.eligible
                          ? 'Insufficient n'
                          : primaryExtended.mannKendall.significantAt05
                            ? `Significant (${primaryExtended.mannKendall.direction})`
                            : 'Not significant'}
                      </span>
                    </div>
                    {primaryExtended.mannKendall.eligible ? (
                      <dl className="grid grid-cols-2 gap-2 border-y border-line/50 py-2 font-mono text-[11px]">
                        <div>
                          <dt className="text-[9.5px] uppercase text-ink-4">Complete years (n)</dt>
                          <dd className="text-ink">{primaryExtended.mannKendall.n}</dd>
                        </div>
                        <div>
                          <dt className="text-[9.5px] uppercase text-ink-4">Kendall&apos;s τ_b</dt>
                          <dd className="text-ink">{primaryExtended.mannKendall.kendallTau}</dd>
                        </div>
                        <div>
                          <dt className="text-[9.5px] uppercase text-ink-4">Adjusted Z* / p*</dt>
                          <dd className="text-ink">
                            {primaryExtended.mannKendall.zAdjusted} / p={primaryExtended.mannKendall.pValue}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[9.5px] uppercase text-ink-4">Lag-1 r₁ / VIF</dt>
                          <dd className="text-ink">
                            {primaryExtended.mannKendall.lag1Autocorrelation} / ×{primaryExtended.mannKendall.effectiveSampleRatio}
                          </dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-[9.5px] uppercase text-ink-4">Gilbert (1987) Sen&apos;s 95% CI</dt>
                          <dd className="text-ink">
                            {primaryExtended.mannKendall.senCi95PerDecade
                              ? `[${formatSigned(primaryExtended.mannKendall.senCi95PerDecade[0], 3)}, ${formatSigned(primaryExtended.mannKendall.senCi95PerDecade[1], 3)}] ${primaryUnit}/dec`
                              : '—'}
                          </dd>
                        </div>
                      </dl>
                    ) : null}
                    <p className="text-[11.5px] leading-relaxed text-ink-2">
                      {primaryExtended.mannKendall.interpretation}
                    </p>
                  </div>

                  {/* 2. Seasonal Mann-Kendall */}
                  <div className="rounded-[12px] border border-line/70 bg-abyss/55 p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-atmo">
                        Seasonal Mann–Kendall (1982)
                      </span>
                      <span
                        className={cx(
                          'chip',
                          !primaryExtended.seasonalMannKendall.eligible
                            ? 'border-caution/40 text-caution'
                            : primaryExtended.seasonalMannKendall.significantAt05
                              ? 'border-signal/50 bg-signal/10 text-signal'
                              : 'border-line text-ink-3'
                        )}
                      >
                        {!primaryExtended.seasonalMannKendall.eligible
                          ? 'Insufficient span'
                          : primaryExtended.seasonalMannKendall.significantAt05
                            ? `Significant (${primaryExtended.seasonalMannKendall.direction})`
                            : 'Not significant'}
                      </span>
                    </div>
                    {primaryExtended.seasonalMannKendall.eligible ? (
                      <dl className="grid grid-cols-2 gap-2 border-y border-line/50 py-2 font-mono text-[11px]">
                        <div>
                          <dt className="text-[9.5px] uppercase text-ink-4">Monthly obs</dt>
                          <dd className="text-ink">
                            {primaryExtended.seasonalMannKendall.totalObservations} ({primaryExtended.seasonalMannKendall.monthsEvaluated} mos)
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[9.5px] uppercase text-ink-4">S_SMK / Z</dt>
                          <dd className="text-ink">
                            {primaryExtended.seasonalMannKendall.sStatistic} / {primaryExtended.seasonalMannKendall.zScore}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[9.5px] uppercase text-ink-4">Two-sided p</dt>
                          <dd className="text-ink">{primaryExtended.seasonalMannKendall.pValue}</dd>
                        </div>
                        <div>
                          <dt className="text-[9.5px] uppercase text-ink-4">Seasonal Sen&apos;s</dt>
                          <dd className="text-ink">
                            {primaryExtended.seasonalMannKendall.seasonalSenSlopePerDecade !== null
                              ? `${formatSigned(primaryExtended.seasonalMannKendall.seasonalSenSlopePerDecade, 3)} ${primaryUnit}/dec`
                              : '—'}
                          </dd>
                        </div>
                      </dl>
                    ) : null}
                    <p className="text-[11.5px] leading-relaxed text-ink-2">
                      {primaryExtended.seasonalMannKendall.interpretation}
                    </p>
                  </div>

                  {/* 3. Pettitt Regime Change-Point */}
                  <div className="rounded-[12px] border border-line/70 bg-abyss/55 p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-atmo">
                        Pettitt Change-Point (1979)
                      </span>
                      <span
                        className={cx(
                          'chip',
                          !primaryExtended.pettittChangePoint.eligible
                            ? 'border-caution/40 text-caution'
                            : primaryExtended.pettittChangePoint.significantAt05
                              ? 'border-amber-400/50 bg-amber-500/10 text-amber-200'
                              : 'border-line text-ink-3'
                        )}
                      >
                        {!primaryExtended.pettittChangePoint.eligible
                          ? 'Requires n ≥ 12'
                          : primaryExtended.pettittChangePoint.significantAt05
                            ? `Shift ~${primaryExtended.pettittChangePoint.changeYear}`
                            : 'No step shift'}
                      </span>
                    </div>
                    {primaryExtended.pettittChangePoint.eligible ? (
                      <dl className="grid grid-cols-2 gap-2 border-y border-line/50 py-2 font-mono text-[11px]">
                        <div>
                          <dt className="text-[9.5px] uppercase text-ink-4">Candidate year</dt>
                          <dd className="text-ink">{primaryExtended.pettittChangePoint.changeYear}</dd>
                        </div>
                        <div>
                          <dt className="text-[9.5px] uppercase text-ink-4">K_T / approx p</dt>
                          <dd className="text-ink">
                            {primaryExtended.pettittChangePoint.kStatistic} / p={primaryExtended.pettittChangePoint.pValue}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[9.5px] uppercase text-ink-4">Before / After</dt>
                          <dd className="text-ink">
                            {primaryExtended.pettittChangePoint.meanBefore} → {primaryExtended.pettittChangePoint.meanAfter} {primaryUnit}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[9.5px] uppercase text-ink-4">Step Δ</dt>
                          <dd className="text-ink">
                            {primaryExtended.pettittChangePoint.shiftMagnitude !== null
                              ? `${formatSigned(primaryExtended.pettittChangePoint.shiftMagnitude, 3)} ${primaryUnit}`
                              : '—'}
                          </dd>
                        </div>
                      </dl>
                    ) : null}
                    <p className="text-[11.5px] leading-relaxed text-ink-2">
                      {primaryExtended.pettittChangePoint.interpretation}
                    </p>
                  </div>
                </div>
              </Panel>

              {/* Hydrological SPI-12 & MERRA-2 Soil Moisture Coupling */}
              {hydrology ? (
                <Panel className="earth-glass-panel space-y-4">
                  <PanelHeader
                    eyebrow="NASA Hydrological Balance · Precipitation & MERRA-2 Soil Wetness"
                    title={hydrology.methodLabel}
                    description={hydrology.caveat}
                    icon={Activity}
                    actions={
                      <span className="chip border-cyan-400/40 bg-cyan-500/10 text-cyan-200">
                        {hydrology.wmoStandardQualified ? 'WMO ≥30y Calibrated' : 'Short-Window Fit'}
                      </span>
                    }
                  />

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="earth-kpi-card">
                      <Metric
                        label="Latest SPI-12"
                        value={hydrology.latest ? formatSigned(hydrology.latest.spi12, 2) : '—'}
                        unit="σ"
                        note={hydrology.latest ? `${hydrology.latest.date} · ${hydrology.latest.regime}` : 'Unavailable'}
                        size="sm"
                      />
                    </div>
                    <div className="earth-kpi-card">
                      <Metric
                        label="Severe Drought / Wet Mos"
                        value={`${hydrology.severeDroughtMonths} / ${hydrology.severeWetMonths}`}
                        note="Months with SPI-12 ≤ −1.5 or ≥ +1.5"
                        size="sm"
                      />
                    </div>
                    <div className="earth-kpi-card">
                      <Metric
                        label="Surface Soil Wetness (GWETTOP)"
                        value={hydrology.soilSurfaceMean !== null ? formatNumber(hydrology.soilSurfaceMean, 3) : '—'}
                        unit={hydrology.soilSurfaceMean !== null ? '0–1' : undefined}
                        note="MERRA-2 0–5 cm saturation"
                        size="sm"
                      />
                    </div>
                    <div className="earth-kpi-card">
                      <Metric
                        label="Root-Zone Soil Wetness (GWETROOT)"
                        value={hydrology.soilRootMean !== null ? formatNumber(hydrology.soilRootMean, 3) : '—'}
                        unit={hydrology.soilRootMean !== null ? '0–1' : undefined}
                        note={
                          hydrology.soilRainfallCorrelationR !== null
                            ? `Rain–soil Pearson r = ${hydrology.soilRainfallCorrelationR}`
                            : 'MERRA-2 0–100 cm saturation'
                        }
                        size="sm"
                      />
                    </div>
                  </div>

                  {hydrology.eligible && hydrology.points.length > 0 ? (
                    <ChartFrame
                      height={260}
                      series={[{ key: 'spi12', label: 'SPI-12 Standardized Precipitation Index', color: PRECIP_COLOR }]}
                      xLabel="Ending month (12-month rolling total)"
                      yLabel="SPI-12 (standard deviations)"
                    >
                      <BarChart data={hydrology.points} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="date" stroke={AXIS} tick={{ fontSize: 10 }} minTickGap={28} />
                          <YAxis yAxisId={0} stroke={AXIS} tick={{ fontSize: 10 }} domain={[-3, 3]} width={42} />
                          <ReferenceLine yAxisId={0} y={0} stroke="rgba(226,232,240,0.45)" />
                          <ReferenceLine yAxisId={0} y={1.5} stroke="#38bdf8" strokeDasharray="4 4" />
                          <ReferenceLine yAxisId={0} y={-1.5} stroke="#fb923c" strokeDasharray="4 4" />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const pt = payload[0]?.payload as (typeof hydrology.points)[number] | undefined;
                              if (!pt) return null;
                              return (
                                <div className="rounded-[10px] border border-line bg-abyss/95 px-3 py-2 text-[11px] shadow-2xl">
                                  <p className="font-mono text-atmo">{label}</p>
                                  <p className="mt-1 font-mono text-ink">SPI-12: {formatSigned(pt.spi12, 2)} ({pt.regime})</p>
                                  <p className="font-mono text-ink-3">12-month rain: {formatNumber(pt.rolling12Mm, 0)} mm</p>
                                </div>
                              );
                            }}
                          />
                          <Bar yAxisId={0} dataKey="spi12" isAnimationActive={!reducedMotion}>
                            {hydrology.points.map((entry) => (
                              <Cell
                                key={entry.date}
                                fill={entry.spi12 >= 0 ? '#38bdf8' : '#fb923c'}
                                fillOpacity={Math.min(0.95, 0.35 + Math.abs(entry.spi12) * 0.25)}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ChartFrame>
                  ) : null}
                </Panel>
              ) : null}
            </div>
          ) : null}

          {/* --------------------------------------------------- provenance & limitations */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel className="earth-glass-panel">
              <PanelHeader
                eyebrow="NASA Official Source Provenance"
                title={t('earthProvenanceTitle')}
                icon={Activity}
                actions={
                  <span className="chip border-cyan-400/40 bg-cyan-500/10 text-cyan-200">
                    NASA LaRC / GMAO
                  </span>
                }
              />
              <dl className="mt-4">
                <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2">
                  <dt className="text-[10.5px] uppercase tracking-[0.12em] text-ink-4">Agency &amp; Coverage</dt>
                  <dd className="font-mono text-[10.5px] text-ink-2">
                    NASA POWER · {dataset.startYear}–{dataset.endYear} ({availableParameters.map((c) => `${c} [${parameterMeta(c)?.unit || ''}]`).join(', ')})
                  </dd>
                </div>
                <div className="flex flex-col gap-1 border-b border-line/60 py-2">
                  <dt className="text-[10.5px] uppercase tracking-[0.12em] text-ink-4">{t('earthProvenanceSourceUrl')}</dt>
                  <dd className="break-all font-mono text-[10.5px] text-ink-2">
                    <a
                      href={sourced?.provenance.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-atmo underline decoration-dotted underline-offset-2"
                    >
                      {sourced?.provenance.sourceUrl}
                    </a>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2">
                  <dt className="text-[10.5px] uppercase tracking-[0.12em] text-ink-4">{t('earthProvenanceRetrieved')}</dt>
                  <dd className="font-mono text-[10.5px] text-ink-2">{sourced?.provenance.retrievedAt?.slice(0, 16).replace('T', ' ')}Z</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2">
                  <dt className="text-[10.5px] uppercase tracking-[0.12em] text-ink-4">{t('earthProvenanceObservation')}</dt>
                  <dd className="font-mono text-[10.5px] text-ink-2">{dataset?.gridNote}</dd>
                </div>
                {dataset?.elevationMeters !== null && dataset?.elevationMeters !== undefined ? (
                  <div className="flex items-baseline justify-between gap-4 py-2">
                    <dt className="text-[10.5px] uppercase tracking-[0.12em] text-ink-4">Grid elevation</dt>
                    <dd className="font-mono text-[10.5px] text-ink-2">{formatNumber(dataset.elevationMeters, 0)} m</dd>
                  </div>
                ) : null}
              </dl>
              <SourceNote className="mt-3">
                {dataset.serviceTitle ? `${dataset.serviceTitle}${dataset.serviceVersion ? ` · v${dataset.serviceVersion}` : ''}` : 'NASA POWER'}
              </SourceNote>
            </Panel>

            <Panel className="earth-glass-panel">
              <PanelHeader eyebrow="Methodology & Uncertainty" title={t('earthDatasetLimitations')} icon={Gauge} />
              {(() => {
                const activeStats = activeParams
                  .map((code) => dataset.stats[code])
                  .filter((s): s is NonNullable<typeof s> => Boolean(s));
                const limitationLines = activeStats.length
                  ? [...new Set(activeStats.flatMap((s) => seriesLimitations(s)))]
                  : [t('earthSeriesUnavailableNote')];
                const seriesLines = activeStats.flatMap((s) => describeSeries(s));
                return (
                  <>
                    <ul className="mt-4 space-y-2">
                      {limitationLines.slice(0, 5).map((line) => (
                        <li key={line} className="flex gap-2 text-[11.5px] leading-relaxed text-ink-2">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-caution" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                    {seriesLines.length ? (
                      <ul className="mt-4 space-y-1 border-t border-line/60 pt-3">
                        {seriesLines.map((line) => (
                          <li key={line} className="font-mono text-[10.5px] leading-relaxed text-ink-3">
                            {line}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                );
              })()}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {dataset.requestedParameters.map((code) => {
                  const available = dataset.available.includes(code);
                  return (
                    <span
                      key={code}
                      className={cx(
                        'chip',
                        available ? 'border-signal/30 text-signal' : 'border-caution/30 text-caution'
                      )}
                      title={parameterMeta(code)?.label}
                    >
                      {code}
                    </span>
                  );
                })}
              </div>
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}
