/**
 * Earth System Trend Detective — NASA POWER monthly archive workspace.
 *
 * The workspace describes what the retrieved series shows and, just as
 * importantly, what it cannot show: monthly POWER values are grid-cell
 * estimates, the statistics are descriptive only, and short records cannot
 * separate a climate signal from interannual variability.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';
import { Activity, Gauge, LineChart, MapPin, RefreshCw, Search, Thermometer } from 'lucide-react';
import { ErrorBlock, InfoNote, LoadingBlock, Panel, Pill, SectionHeading, StatTile, StatusBadge, formatDateTime, formatNumber } from './EarthPanel';
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
  { key: '10y', years: 10 },
  { key: '20y', years: 20 },
  { key: '30y', years: 30 },
  { key: 'all', years: 0 }
] as const;

const STUDY_PRESETS: GazetteerEntry[] = [SRI_LANKA_PLACES[0], ...SRI_LANKA_PLACES.slice(1, 7), ...WORLD_PLACES.slice(0, 5)];

export default function TrendDetective({ area, onAreaChange, onPowerResolved, reducedMotion }: TrendDetectiveProps) {
  const { t } = useTranslation();
  const [rangeKey, setRangeKey] = useState<(typeof RANGE_OPTIONS)[number]['key']>('20y');
  const [sourced, setSourced] = useState<Sourced<PowerDataset> | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeParam, setActiveParam] = useState<string>('T2M');
  const [customLat, setCustomLat] = useState(String(area.latitude));
  const [customLon, setCustomLon] = useState(String(area.longitude));
  const abortRef = useRef<AbortController | null>(null);

  const { startYear, endYear } = useMemo(() => {
    const option = RANGE_OPTIONS.find((item) => item.key === rangeKey) || RANGE_OPTIONS[1];
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

  const dataset = sourced?.data || null;
  const stats = dataset?.stats[activeParam] || null;
  const meta = parameterMeta(activeParam);

  const chartRows = useMemo(() => {
    if (!dataset) return [];
    return dataset.rows.map((row) => ({
      date: row.date,
      value: row.values[activeParam],
      annualMean: stats?.annual.find((entry) => entry.year === row.year)?.mean ?? null
    }));
  }, [dataset, activeParam, stats]);

  const annualRows = useMemo(() => stats?.annual.map((entry) => ({ year: entry.year, mean: entry.mean, complete: entry.complete })) || [], [stats]);

  return (
    <div className="space-y-4">
      <Panel className="space-y-4">
        <SectionHeading
          icon={MapPin}
          title={t('earthStudyArea')}
          subtitle={t('earthSriLankaMonsoon')}
          badge={<StatusBadge status={sourced?.status || 'unavailable'} note={sourced?.provenance?.note} />}
        />

        <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{t('earthSriLankaPlaces')} · {t('earthStudyArea')}</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('earthStudyArea')}>
              {STUDY_PRESETS.map((preset) => {
                const active = Math.abs(preset.latitude - area.latitude) < 0.01 && Math.abs(preset.longitude - area.longitude) < 0.01;
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
                    className={`rounded-lg border px-2.5 py-1.5 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
                      active
                        ? 'border-lime-400/70 bg-lime-500/15 text-lime-200'
                        : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-cyan-500/50 hover:text-white'
                    }`}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{t('earthCustomCoordinates')}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                {t('earthLatitude')}
                <input
                  type="number"
                  step="0.01"
                  min={-90}
                  max={90}
                  value={customLat}
                  onChange={(event) => setCustomLat(event.target.value)}
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-400"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                {t('earthLongitude')}
                <input
                  type="number"
                  step="0.01"
                  min={-180}
                  max={180}
                  value={customLon}
                  onChange={(event) => setCustomLon(event.target.value)}
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-400"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => {
                const latitude = Number(customLat);
                const longitude = Number(customLon);
                if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
                if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;
                onAreaChange({
                  label: `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`,
                  latitude,
                  longitude,
                  source: 'custom'
                });
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200 transition hover:bg-cyan-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            >
              <Search className="h-3.5 w-3.5" />
              {t('earthApplyCoordinates')}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">{t('earthStatCoverage')}</span>
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setRangeKey(option.key)}
              aria-pressed={rangeKey === option.key}
              className={`rounded-lg border px-2.5 py-1 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
                rangeKey === option.key
                  ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-200'
                  : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-cyan-500/50 hover:text-white'
              }`}
            >
              {option.years ? `${option.years}y` : '1981→'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading}
            className="ml-auto flex items-center gap-2 rounded-lg border border-cyan-500/30 px-3 py-1.5 text-xs text-cyan-300 transition hover:bg-cyan-950/50 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('earthRefreshData')}
          </button>
        </div>
      </Panel>

      {loading && !dataset ? <LoadingBlock label={t('earthLoadingSeries')} detail="power.larc.nasa.gov · /api/temporal/monthly/point" /> : null}

      {!loading && !dataset ? (
        <ErrorBlock
          message={sourced?.error || t('earthSeriesError')}
          onRetry={() => load(true)}
          retryLabel={t('earthRefreshData')}
        />
      ) : null}

      {dataset ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              icon={Activity}
              tone="cyan"
              label={t('earthStatMonths')}
              value={dataset.rows.length}
              note={dataset.rows.length ? `${dataset.rows[0].date} → ${dataset.rows[dataset.rows.length - 1].date}` : undefined}
            />
            <StatTile
              icon={Thermometer}
              tone="rose"
              label={`${meta?.label || activeParam} · ${t('earthStatMean')}`}
              value={stats?.mean ?? '—'}
              unit={stats?.unit}
              note={stats ? `${t('earthStatMaximum')}: ${formatNumber(stats.max?.value, 2)} ${stats.unit}` : undefined}
            />
            <StatTile
              icon={Gauge}
              tone="violet"
              label={t('earthStatSlope')}
              value={stats?.trend ? formatNumber(stats.trend.slopePerYear, 3) : '—'}
              unit={stats?.trend ? `${stats.unit}/yr` : undefined}
              note={
                stats?.trend
                  ? t('earthStatSlopeValue', {
                      value: formatNumber(stats.trend.slopePerYear, 3),
                      unit: stats.unit,
                      years: stats.trend.years
                    })
                  : t('earthStatSlopeUnavailable')
              }
            />
            <StatTile
              icon={LineChart}
              tone="lime"
              label={t('earthSeriesAvailable')}
              value={dataset.available.length}
              note={dataset.unavailable.length ? `${t('earthSeriesUnavailable')}: ${dataset.unavailable.join(', ')}` : undefined}
            />
          </div>

          <Panel className="space-y-4">
            <SectionHeading
              icon={LineChart}
              title={t('earthMonthlyChart')}
              subtitle={
                meta
                  ? `${meta.label} (${meta.code}) · ${meta.unit} · ${meta.notes}`
                  : undefined
              }
              badge={<Pill tone="cyan">{dataset.placeLabel}</Pill>}
            />

            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('earthSeriesRequested')}>
              {dataset.available.map((code) => {
                const parameter = parameterMeta(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setActiveParam(code)}
                    aria-pressed={activeParam === code}
                    className={`rounded-lg border px-2.5 py-1 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
                      activeParam === code
                        ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-100'
                        : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-cyan-500/50 hover:text-white'
                    }`}
                    title={parameter?.label}
                  >
                    {parameter?.label || code} <span className="font-mono text-[10px] opacity-70">{code}</span>
                  </button>
                );
              })}
            </div>

            <div className="h-64 w-full sm:h-80" data-no-swipe>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartRows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} minTickGap={32} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} width={56} unit="" />
                  <Tooltip
                    contentStyle={{ background: '#020817', border: '1px solid #334155', borderRadius: 12 }}
                    labelStyle={{ color: '#67e8f9' }}
                    formatter={(value: any, name: any) => [
                      value === null || value === undefined ? t('earthNoDataShort') : `${formatNumber(Number(value), 2)} ${stats?.unit || ''}`,
                      name
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={stats?.mean ?? undefined} stroke="#22d3ee" strokeDasharray="6 4" label={{ value: t('earthStatMean'), fill: '#67e8f9', fontSize: 10 }} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={meta?.label || activeParam}
                    stroke="#38bdf8"
                    strokeWidth={1.6}
                    dot={false}
                    isAnimationActive={!reducedMotion}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="annualMean"
                    name={t('earthAnnualChart')}
                    stroke="#a3e635"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="4 3"
                    isAnimationActive={!reducedMotion}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="h-56 w-full" data-no-swipe>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={annualRows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="year" stroke="#64748b" tick={{ fontSize: 10 }} minTickGap={20} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} width={56} />
                  <Tooltip
                    contentStyle={{ background: '#020817', border: '1px solid #334155', borderRadius: 12 }}
                    labelStyle={{ color: '#67e8f9' }}
                    formatter={(value: any) => [
                      value === null || value === undefined ? t('earthNoDataShort') : `${formatNumber(Number(value), 2)} ${stats?.unit || ''}`,
                      t('earthAnnualChart')
                    ]}
                  />
                  <Bar dataKey="mean" name={t('earthAnnualChart')} fill="#0ea5e9" isAnimationActive={!reducedMotion} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <InfoNote tone="amber">{t('earthTrendCaveat')}</InfoNote>

            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">{t('earthSeriesRequested')}</p>
                <ul className="space-y-1 text-xs text-slate-300">
                  {dataset.requestedParameters.map((code) => (
                    <li key={code} className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${dataset.available.includes(code) ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      <span className="font-mono text-[11px]">{code}</span>
                      <span className="text-slate-400">{parameterMeta(code)?.label || ''}</span>
                    </li>
                  ))}
                </ul>
                {dataset.unavailable.length ? (
                  <p className="mt-2 text-[11px] text-amber-200">{t('earthSeriesUnavailableNote')}</p>
                ) : null}
              </div>

              <div className="space-y-1.5 text-[11px] text-slate-400">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">{t('earthProvenanceTitle')}</p>
                <p className="break-all">
                  <span className="text-slate-500">{t('earthProvenanceSourceUrl')}: </span>
                  <a href={sourced?.provenance.sourceUrl} target="_blank" rel="noreferrer" className="text-cyan-300 underline decoration-dotted">
                    {sourced?.provenance.sourceUrl}
                  </a>
                </p>
                <p>
                  <span className="text-slate-500">{t('earthProvenanceRetrieved')}: </span>
                  {formatDateTime(sourced?.provenance.retrievedAt)}
                </p>
                <p>
                  <span className="text-slate-500">{t('earthProvenanceObservation')}: </span>
                  {sourced?.provenance.observationDate || '—'}
                </p>
                <p>
                  <span className="text-slate-500">{t('earthResolutionLabel')}: </span>
                  {dataset.gridNote}
                </p>
                {dataset.elevationMeters !== null && dataset.elevationMeters !== undefined ? (
                  <p>
                    <span className="text-slate-500">POWER grid elevation: </span>
                    {formatNumber(dataset.elevationMeters, 0)} m
                  </p>
                ) : null}
                <ul className="list-inside list-disc space-y-0.5">
                  {stats ? describeSeries(stats).map((line) => <li key={line}>{line}</li>) : null}
                </ul>
              </div>
            </div>
          </Panel>

          <Panel>
            <SectionHeading icon={Thermometer} title={t('earthDatasetLimitations')} subtitle={t('earthDatasetDescription')} />
            <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-slate-300">
              {(stats ? seriesLimitations(stats) : [t('earthSeriesUnavailableNote')]).map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
