/**
 * Earth System Trend Detective — NASA POWER monthly archive workspace.
 *
 * The workspace describes what the retrieved series shows and, just as
 * importantly, what it cannot show: monthly POWER values are grid-cell
 * estimates, the statistics are descriptive only, and a short record cannot
 * separate a climate signal from interannual variability.
 *
 * Chart mounting goes through `ChartFrame` (src/ui/ChartFrame.tsx), which fixes
 * the verified blank-chart defect by removing the percentage-height chain, the
 * in-chart legend and the initial-zero-size mount.
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
import { Activity, Gauge, LineChart as LineChartIcon, MapPin, RefreshCw, Thermometer } from 'lucide-react';
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
import { describeSeries, seriesLimitations } from '../../lib/earth/analysis';
import { SRI_LANKA_PLACES, WORLD_PLACES, type GazetteerEntry } from '../../lib/earth/geocode';
import type { PowerDataset, Sourced } from '../../lib/earth/types';

export interface StudyArea {
  label: string;
  latitude: number;
  longitude: number;
  source: 'gazetteer' | 'search' | 'map-click' | 'preset' | 'custom';
}

interface TrendDetectiveProps {
  area: StudyArea;
  onAreaChange: (area: StudyArea) => void;
  onPowerResolved: (sourced: Sourced<PowerDataset> | null) => void;
  reducedMotion: boolean;
}

const RANGE_OPTIONS = [
  { value: '10y', label: '10y', years: 10 },
  { value: '20y', label: '20y', years: 20 },
  { value: '30y', label: '30y', years: 30 },
  { value: 'all', label: '1981→', years: 0 }
] as const;

const STUDY_PRESETS: GazetteerEntry[] = [
  SRI_LANKA_PLACES[0],
  ...SRI_LANKA_PLACES.slice(1, 7),
  ...WORLD_PLACES.slice(0, 5)
];

const AXIS = '#8294ad';
const GRID = 'rgba(148,178,214,0.14)';
const SERIES = '#5ed3f2';
const ANNUAL = '#6ee7b7';

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

function SourceTooltip({
  active,
  payload,
  label,
  unit,
  labelName
}: {
  active?: boolean;
  payload?: Array<{ value?: number | null; dataKey?: string }>;
  label?: string | number;
  unit: string;
  labelName: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((entry) => typeof entry.value === 'number');
  if (!rows.length) return null;
  return (
    <div className="rounded-[10px] border border-line bg-abyss/97 px-3 py-2 shadow-2xl backdrop-blur-md">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-atmo">{labelName}</p>
      <ul className="mt-1.5 space-y-0.5">
        {rows.map((entry, index) => (
          <li key={`${entry.dataKey}-${index}`} className="flex items-baseline justify-between gap-4 text-[11px]">
            <span className="text-ink-3">{entry.dataKey === 'annualMean' ? 'Annual mean' : 'Monthly value'}</span>
            <span className="font-mono text-ink">
              {formatNumber(entry.value as number, 2)} {unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TrendDetective({ area, onAreaChange, onPowerResolved, reducedMotion }: TrendDetectiveProps) {
  const { t } = useTranslation();
  const [rangeKey, setRangeKey] = useState<(typeof RANGE_OPTIONS)[number]['value']>('20y');
  const [sourced, setSourced] = useState<Sourced<PowerDataset> | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeParam, setActiveParam] = useState<string>('T2M');
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
        if (result.data && !result.data.available.includes(activeParam)) {
          setActiveParam(result.data.available[0] || 'T2M');
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
    [area.latitude, area.longitude, area.label, startYear, endYear, activeParam, onPowerResolved]
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
  const stats = dataset?.stats[activeParam] || null;
  const meta = parameterMeta(activeParam);

  const chartRows = useMemo(() => {
    if (!dataset) return [];
    return dataset.rows.map((row) => ({
      date: row.date,
      year: row.year,
      value: row.values[activeParam],
      annualMean: stats?.annual.find((entry) => entry.year === row.year)?.mean ?? null
    }));
  }, [dataset, activeParam, stats]);

  const plottable = chartRows.filter((row) => typeof row.value === 'number').length;
  const annualRows = useMemo(
    () => (stats?.annual || []).map((entry) => ({ year: entry.year, mean: entry.mean, complete: entry.complete })),
    [stats]
  );

  const availableParameters = dataset?.available || [];

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------- controls */}
      <Panel className="space-y-5">
        <PanelHeader
          eyebrow="Study area"
          title={t('earthStudyArea')}
          description={t('earthSriLankaMonsoon')}
          icon={MapPin}
          actions={<DataStateBadge state={sourced?.status === 'cached' ? 'cached' : sourced?.data ? 'live' : loading ? 'loading' : 'unavailable'} />}
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

          <div className="surface-inset p-3.5">
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

        <div className="flex flex-wrap items-center gap-3 border-t border-line/60 pt-4">
          <span className="eyebrow">{t('earthStatCoverage')}</span>
          <SegmentedControl
            label={t('earthStatCoverage')}
            value={rangeKey}
            onChange={(value) => setRangeKey(value)}
            items={RANGE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            size="sm"
          />
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
      </Panel>

      {/* ------------------------------------------------------------ states */}
      {loading && !dataset ? (
        <Panel>
          <LoadingState label={t('earthLoadingSeries')} detail="power.larc.nasa.gov · monthly/point" rows={3} />
        </Panel>
      ) : null}

      {!loading && !dataset ? (
        <Panel>
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
          {/* ------------------------------------------------ summary metrics */}
          <Panel tone="flush">
            <div className="grid grid-cols-2 divide-line/60 sm:grid-cols-4 sm:divide-x">
              <div className="border-b border-line/60 p-4 sm:border-b-0 sm:p-5">
                <Metric
                  label={t('earthStatMonths')}
                  value={dataset.rows.length}
                  note={dataset.rows.length ? `${dataset.rows[0].date} → ${dataset.rows[dataset.rows.length - 1].date}` : undefined}
                  size="sm"
                />
              </div>
              <div className="border-b border-line/60 p-4 sm:border-b-0 sm:p-5">
                <Metric
                  label={`${meta?.label || activeParam} · ${t('earthStatMean')}`}
                  value={formatNumber(stats?.mean, 2)}
                  unit={stats?.unit}
                  note={stats ? `${t('earthStatMaximum')}: ${formatNumber(stats.max?.value, 2)} ${stats.unit}` : undefined}
                  size="sm"
                />
              </div>
              <div className="p-4 sm:p-5">
                <Metric
                  label={t('earthStatSlope')}
                  value={stats?.trend ? formatNumber(stats.trend.slopePerYear, 3) : '—'}
                  unit={stats?.trend ? `${stats.unit}/yr` : undefined}
                  note={
                    stats?.trend
                      ? `${stats.trend.fromYear}–${stats.trend.toYear} · ${stats.trend.years} complete years`
                      : t('earthStatSlopeUnavailable')
                  }
                  size="sm"
                />
              </div>
              <div className="p-4 sm:p-5">
                <Metric
                  label={t('earthSeriesAvailable')}
                  value={availableParameters.length}
                  note={
                    dataset.unavailable.length
                      ? `${t('earthSeriesUnavailable')}: ${dataset.unavailable.join(', ')}`
                      : dataset.requestedParameters.length + ' requested'
                  }
                  size="sm"
                />
              </div>
            </div>
          </Panel>

          {/* ------------------------------------------------------- charts */}
          <Panel className="space-y-5">
            <PanelHeader
              eyebrow={dataset.gridNote.includes('POWER') ? 'POWER monthly point' : 'POWER monthly point'}
              title={t('earthMonthlyChart')}
              description={meta ? `${meta.label} (${meta.code}) · ${meta.unit} · ${meta.notes}` : undefined}
              icon={LineChartIcon}
              actions={<span className="chip">{dataset.placeLabel}</span>}
            />

            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('earthSeriesRequested')}>
              {availableParameters.map((code) => {
                const parameter = parameterMeta(code);
                const active = activeParam === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setActiveParam(code)}
                    aria-pressed={active}
                    className={cx(
                      'rounded-full border px-3 py-1.5 text-[11.5px] transition-colors',
                      active
                        ? 'border-atmo/60 bg-atmo/12 text-atmo'
                        : 'border-line bg-surface/50 text-ink-3 hover:border-line-strong hover:text-ink'
                    )}
                    title={parameter?.label}
                  >
                    {parameter?.label || code}
                    <span className="ml-1.5 font-mono text-[9.5px] opacity-60">{code}</span>
                  </button>
                );
              })}
            </div>

            <ChartFrame
              height={320}
              series={[
                { key: 'value', label: t('earthMonthlySeries'), color: SERIES },
                { key: 'annualMean', label: t('earthAnnualMean'), color: ANNUAL, dashed: true }
              ]}
              xLabel={`${t('earthTableYear')} · ${dataset.rows[0]?.date.slice(0, 4)}–${dataset.rows[dataset.rows.length - 1]?.date.slice(0, 4)}`}
              yLabel={`${meta?.unit || ''}`}
              empty={
                plottable ? undefined : (
                  <div className="px-6">
                    <p className="text-sm text-ink-2">{t('earthNoData')}</p>
                    <p className="mt-1 text-[11px] text-ink-4">POWER returned no finite monthly values for {activeParam}.</p>
                  </div>
                )
              }
              table={
                <table className="w-full text-left text-[10.5px]">
                  <caption className="sr-only">{`${dataset.placeLabel} monthly ${activeParam}`}</caption>
                  <thead className="sticky top-0 bg-abyss">
                    <tr className="text-ink-4">
                      <th scope="col" className="py-1 pr-2 font-normal">Month</th>
                      <th scope="col" className="py-1 pr-2 text-right font-normal">{meta?.unit || activeParam}</th>
                      <th scope="col" className="py-1 text-right font-normal">Annual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartRows.map((row) => (
                      <tr key={row.date} className="border-t border-line/40 text-ink-2">
                        <td className="py-0.5 pr-2">{row.date}</td>
                        <td className="py-0.5 pr-2 text-right tabular-nums">{typeof row.value === 'number' ? row.value.toFixed(2) : '—'}</td>
                        <td className="py-0.5 text-right tabular-nums">{typeof row.annualMean === 'number' ? row.annualMean.toFixed(2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            >
              <ComposedChart data={chartRows} margin={{ top: 8, right: 10, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="earthMonthlyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={SERIES} stopOpacity={0.01} />
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
                  stroke={AXIS}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  domain={['auto', 'auto']}
                  tickFormatter={(value: number) => value.toFixed(Math.abs(value) < 10 ? 1 : 0)}
                />
                <Tooltip
                  cursor={{ stroke: 'rgba(167,232,250,0.35)', strokeWidth: 1 }}
                  content={<SourceTooltip unit={meta?.unit || ''} labelName={t('earthMonthlySeries')} />}
                />
                {stats?.mean !== null && stats?.mean !== undefined ? (
                  <ReferenceLine
                    y={stats.mean}
                    stroke="rgba(167,232,250,0.45)"
                    strokeDasharray="5 5"
                    ifOverflow="extendDomain"
                  />
                ) : null}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={SERIES}
                  strokeWidth={1.6}
                  fill="url(#earthMonthlyFill)"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  activeDot={{ r: 3, fill: '#a7e8fa', stroke: '#04202b' }}
                />
                <Line
                  type="monotone"
                  dataKey="annualMean"
                  stroke={ANNUAL}
                  strokeWidth={1.8}
                  strokeDasharray="4 3"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ChartFrame>

            <ChartFrame
              height={220}
              series={[{ key: 'mean', label: t('earthAnnualChart'), color: '#4f8dff' }]}
              xLabel="Complete calendar years"
              yLabel={meta?.unit || ''}
              empty={
                annualRows.length ? undefined : (
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
                      <th scope="col" className="py-1 pr-2 text-right font-normal">Mean</th>
                      <th scope="col" className="py-1 text-right font-normal">Months</th>
                    </tr>
                  </thead>
                  <tbody>
                    {annualRows.map((row) => (
                      <tr key={row.year} className="border-t border-line/40 text-ink-2">
                        <td className="py-0.5 pr-2">{row.year}</td>
                        <td className="py-0.5 pr-2 text-right tabular-nums">{typeof row.mean === 'number' ? row.mean.toFixed(2) : '—'}</td>
                        <td className="py-0.5 text-right tabular-nums">{row.complete ? '12' : 'partial'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            >
              <BarChart data={annualRows} margin={{ top: 8, right: 10, left: 0, bottom: 4 }}>
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
                  stroke={AXIS}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  domain={['auto', 'auto']}
                  tickFormatter={(value: number) => value.toFixed(Math.abs(value) < 10 ? 1 : 0)}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(148,178,214,0.08)' }}
                  content={<SourceTooltip unit={meta?.unit || ''} labelName={t('earthAnnualChart')} />}
                />
                <Bar dataKey="mean" radius={[2, 2, 0, 0]} isAnimationActive={!reducedMotion}>
                  {annualRows.map((row) => (
                    <Cell key={row.year} fill={row.complete ? '#4f8dff' : 'rgba(79,141,255,0.35)'} />
                  ))}
                </Bar>
              </BarChart>
            </ChartFrame>

            <p className="rounded-[10px] border border-caution/20 bg-caution/[0.05] p-3 text-[11px] leading-relaxed text-caution">
              {t('earthTrendCaveat')}
            </p>
          </Panel>

          {/* --------------------------------------------------- provenance */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHeader eyebrow="Provenance" title={t('earthProvenanceTitle')} icon={Activity} />
              <dl className="mt-4">
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
                  <dd className="font-mono text-[10.5px] text-ink-2">{sourced?.provenance.observationDate || '—'}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2">
                  <dt className="text-[10.5px] uppercase tracking-[0.12em] text-ink-4">{t('earthResolutionLabel')}</dt>
                  <dd className="max-w-[60%] text-right text-[10.5px] leading-snug text-ink-2">{dataset.gridNote}</dd>
                </div>
                {dataset.elevationMeters !== null && dataset.elevationMeters !== undefined ? (
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

            <Panel>
              <PanelHeader eyebrow="Read this first" title={t('earthDatasetLimitations')} icon={Gauge} />
              <ul className="mt-4 space-y-2">
                {(stats ? seriesLimitations(stats) : [t('earthSeriesUnavailableNote')]).map((line) => (
                  <li key={line} className="flex gap-2 text-[11.5px] leading-relaxed text-ink-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-caution" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              {stats ? (
                <ul className="mt-4 space-y-1 border-t border-line/60 pt-3">
                  {describeSeries(stats).map((line) => (
                    <li key={line} className="font-mono text-[10.5px] leading-relaxed text-ink-3">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : null}
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
