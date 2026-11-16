/**
 * COSMORA Multi-Location Climate Comparison Workspace.
 *
 * Retrieves real NASA POWER monthly archives in parallel for 2 to 4 locations,
 * aligns complete calendar years and 12-month seasonal climatology, computes
 * side-by-side deltas against the primary location, and feeds the retrieved
 * comparison series into AI Earth Analyst 2.0 and research exports.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  Download,
  GitCompare,
  Plus,
  RefreshCw,
  Trash2
} from 'lucide-react';
import {
  Button,
  DataStateBadge,
  ErrorState,
  LoadingState,
  Panel,
  PanelHeader,
  SegmentedControl,
  cx
} from '../../ui/primitives';
import { ChartFrame } from '../../ui/ChartFrame';
import { fetchPowerDataset, parameterMeta, POWER_PARAMETERS } from '../../lib/earth/power';
import { compareLocations, multiLocationCsv } from '../../lib/earth/climateEngine';
import { downloadTextFile, type ComparisonPowerEntry } from '../../lib/earth/context';
import { SRI_LANKA_PLACES, WORLD_PLACES } from '../../lib/earth/geocode';
import type { PowerDataset, Sourced } from '../../lib/earth/types';
import type { StudyArea } from './TrendDetective';

interface CompareTarget {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

interface ChartTooltipEntry {
  value?: unknown;
  dataKey?: unknown;
  name?: unknown;
  color?: unknown;
}
interface ChartTooltipProps {
  active?: boolean;
  payload?: readonly ChartTooltipEntry[];
  label?: string | number;
}

export interface LocationComparisonProps {
  primaryArea: StudyArea;
  onComparisonsResolved?: (entries: ComparisonPowerEntry[]) => void;
  reducedMotion: boolean;
}

const LOCATION_COLORS = ['#5ed3f2', '#f0c274', '#a3e635', '#c084fc'];
const AXIS = '#8294ad';
const GRID = 'rgba(148,178,214,0.14)';

const RANGE_OPTIONS = [
  { value: '10y', label: '10y', years: 10 },
  { value: '20y', label: '20y', years: 20 },
  { value: '30y', label: '30y', years: 30 }
] as const;

const PRESET_GROUPS: Array<{ id: string; labelKey: string; targets: CompareTarget[] }> = [
  {
    id: 'island-zones',
    labelKey: 'earthComparePresetIslandZones',
    targets: [
      { id: 'colombo', label: 'Colombo', latitude: 6.9271, longitude: 79.8612 },
      { id: 'nuwara-eliya', label: 'Nuwara Eliya', latitude: 6.9497, longitude: 80.7891 },
      { id: 'jaffna', label: 'Jaffna', latitude: 9.6615, longitude: 80.0255 }
    ]
  },
  {
    id: 'monsoon-coasts',
    labelKey: 'earthComparePresetMonsoonCoast',
    targets: [
      { id: 'colombo', label: 'Colombo (West)', latitude: 6.9271, longitude: 79.8612 },
      { id: 'trincomalee', label: 'Trincomalee (East)', latitude: 8.5874, longitude: 81.2152 },
      { id: 'hambantota', label: 'Hambantota (Arid South)', latitude: 6.1246, longitude: 81.1185 }
    ]
  },
  {
    id: 'tropical-world',
    labelKey: 'earthComparePresetTropicalWorld',
    targets: [
      { id: 'sri-lanka', label: 'Sri Lanka', latitude: 7.8731, longitude: 80.7718 },
      { id: 'amazon', label: 'Amazon Basin', latitude: -3.4653, longitude: -62.2159 },
      { id: 'kalimantan', label: 'Central Kalimantan', latitude: -1.6815, longitude: 113.3824 }
    ]
  }
];

const ALL_ADDABLE_PLACES = [...SRI_LANKA_PLACES, ...WORLD_PLACES];

function fmt(val: number | null | undefined, digits = 2): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return val.toFixed(digits);
}

function fmtSigned(val: number | null | undefined, digits = 2): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return `${val >= 0 ? '+' : ''}${val.toFixed(digits)}`;
}

export default function LocationComparison({
  primaryArea,
  onComparisonsResolved,
  reducedMotion
}: LocationComparisonProps) {
  const { t } = useTranslation();
  const [secondaryTargets, setSecondaryTargets] = useState<CompareTarget[]>([
    { id: 'nuwara-eliya', label: 'Nuwara Eliya', latitude: 6.9497, longitude: 80.7891 },
    { id: 'trincomalee', label: 'Trincomalee', latitude: 8.5874, longitude: 81.2152 }
  ]);
  const [paramCode, setParamCode] = useState<string>('T2M');
  const [rangeKey, setRangeKey] = useState<(typeof RANGE_OPTIONS)[number]['value']>('20y');
  const [selectedAddPlace, setSelectedAddPlace] = useState<string>(ALL_ADDABLE_PLACES[4]?.name || 'Jaffna');
  const [customName, setCustomName] = useState('');
  const [customLat, setCustomLat] = useState('');
  const [customLon, setCustomLon] = useState('');
  const [inputErr, setInputErr] = useState<string | null>(null);

  const [results, setResults] = useState<Record<string, Sourced<PowerDataset>>>({});
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const allTargets = useMemo<CompareTarget[]>(() => {
    const primary: CompareTarget = {
      id: 'primary',
      label: primaryArea.label,
      latitude: primaryArea.latitude,
      longitude: primaryArea.longitude
    };
    // Deduplicate secondary targets that collide with primary coordinates
    const distinctSecondary = secondaryTargets.filter(
      (item) =>
        Math.abs(item.latitude - primary.latitude) > 0.02 || Math.abs(item.longitude - primary.longitude) > 0.02
    );
    const list = [primary, ...distinctSecondary].slice(0, 4);
    if (list.length === 1) {
      list.push({ id: 'colombo-fallback', label: 'Colombo', latitude: 6.9271, longitude: 79.8612 });
    }
    return list;
  }, [primaryArea.label, primaryArea.latitude, primaryArea.longitude, secondaryTargets]);

  const { startYear, endYear } = useMemo(() => {
    const opt = RANGE_OPTIONS.find((r) => r.value === rangeKey) || RANGE_OPTIONS[1];
    const now = new Date().getFullYear();
    return { startYear: now - opt.years + 1, endYear: now };
  }, [rangeKey]);

  const loadAll = useCallback(
    async (force = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setFetchErr(null);

      try {
        const fetched = await Promise.all(
          allTargets.map(async (target) => {
            const sourced = await fetchPowerDataset({
              latitude: target.latitude,
              longitude: target.longitude,
              startYear,
              endYear,
              placeLabel: target.label,
              parameters: POWER_PARAMETERS.map((p) => p.code),
              signal: controller.signal,
              force
            });
            return { id: target.id, target, sourced };
          })
        );
        if (controller.signal.aborted) return;

        const nextMap: Record<string, Sourced<PowerDataset>> = {};
        for (const entry of fetched) {
          nextMap[entry.id] = entry.sourced;
        }
        setResults(nextMap);

        const secondaryEntries: ComparisonPowerEntry[] = fetched
          .slice(1)
          .filter((entry) => Boolean(entry.sourced.data))
          .map((entry) => ({
            label: entry.target.label,
            power: entry.sourced.data as PowerDataset,
            sourceUrl: entry.sourced.provenance.sourceUrl,
            retrievedAt: entry.sourced.provenance.retrievedAt
          }));
        onComparisonsResolved?.(secondaryEntries);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setFetchErr((err as Error)?.message || 'Failed to retrieve multi-location NASA POWER archives.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [allTargets, startYear, endYear, onComparisonsResolved]
  );

  useEffect(() => {
    loadAll();
    return () => abortRef.current?.abort();
  }, [loadAll]);

  const resolvedInputs = useMemo(
    () =>
      allTargets
        .map((target) => {
          const data = results[target.id]?.data;
          if (!data) return null;
          return { id: target.id, label: target.label, dataset: data };
        })
        .filter((item): item is { id: string; label: string; dataset: PowerDataset } => Boolean(item)),
    [allTargets, results]
  );

  const comparison = useMemo(
    () => (resolvedInputs.length >= 2 ? compareLocations(resolvedInputs, paramCode) : null),
    [resolvedInputs, paramCode]
  );

  const unit = parameterMeta(paramCode)?.unit || '';

  const applyPreset = (targets: CompareTarget[]) => {
    setSecondaryTargets(targets.slice(0, 3));
  };

  const addGazetteerTarget = () => {
    if (allTargets.length >= 4) return;
    const found = ALL_ADDABLE_PLACES.find((p) => p.name === selectedAddPlace);
    if (!found) return;
    setSecondaryTargets((prev) => [
      ...prev.slice(0, 2),
      {
        id: `${found.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
        label: found.name,
        latitude: found.latitude,
        longitude: found.longitude
      }
    ]);
  };

  const addCustomTarget = () => {
    if (allTargets.length >= 4) return;
    const lat = Number(customLat);
    const lon = Number(customLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setInputErr('Enter valid coordinates: latitude −90…90, longitude −180…180.');
      return;
    }
    setInputErr(null);
    const label = customName.trim() || `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
    setSecondaryTargets((prev) => [
      ...prev.slice(0, 2),
      { id: `custom-${Date.now()}`, label, latitude: lat, longitude: lon }
    ]);
    setCustomName('');
    setCustomLat('');
    setCustomLon('');
  };

  return (
    <div className="space-y-4" data-reduced-motion={reducedMotion ? 'true' : 'false'}>
      <Panel className="earth-glass-panel space-y-5">
        <PanelHeader
          eyebrow="Parallel NASA POWER Retrieval"
          title={t('earthCompareWorkspaceTitle')}
          description={t('earthCompareWorkspaceSubtitle')}
          icon={GitCompare}
          actions={
            <div className="flex items-center gap-2">
              <DataStateBadge state={loading ? 'loading' : comparison ? 'live' : 'unavailable'} />
              <Button variant="ghost" size="sm" onClick={() => loadAll(true)} disabled={loading} icon={RefreshCw}>
                {t('earthRefreshData')}
              </Button>
            </div>
          }
        />

        {/* Scientific Comparison Presets */}
        <div className="space-y-2">
          <p className="eyebrow">{t('earthComparePresetsLabel')}</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_GROUPS.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => applyPreset(group.targets)}
                className="rounded-full border border-line bg-surface/60 px-3 py-1.5 text-[11.5px] text-ink-2 transition hover:border-atmo/55 hover:text-ink"
              >
                {t(group.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Active Locations Chips + Add Location Controls */}
        <div className="grid gap-4 border-t border-line/60 pt-4 lg:grid-cols-[1.35fr_1fr]">
          <div className="space-y-2.5">
            <p className="eyebrow">Active Study Locations ({allTargets.length}/4)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {allTargets.map((target, idx) => (
                <div key={target.id} className="earth-glass-inset flex items-center justify-between gap-2 p-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: LOCATION_COLORS[idx % LOCATION_COLORS.length] }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-ink">
                        {target.label} {idx === 0 ? <span className="font-mono text-[10px] text-atmo">(Primary)</span> : null}
                      </p>
                      <p className="font-mono text-[10px] text-ink-4">
                        {target.latitude.toFixed(3)}°, {target.longitude.toFixed(3)}°
                      </p>
                    </div>
                  </div>
                  {idx > 0 && secondaryTargets.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setSecondaryTargets((prev) => prev.filter((p) => p.id !== target.id))}
                      aria-label={`${t('earthCompareRemove')}: ${target.label}`}
                      className="rounded-[7px] p-1 text-ink-4 transition hover:bg-critical/10 hover:text-critical"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="earth-glass-inset space-y-2.5 p-3.5">
            <p className="eyebrow">{t('earthCompareAddPlace')}</p>
            <div className="flex gap-2">
              <label htmlFor="earth-compare-place-select" className="sr-only">
                {t('earthCompareAddPlace')}
              </label>
              <select
                id="earth-compare-place-select"
                value={selectedAddPlace}
                onChange={(e) => setSelectedAddPlace(e.target.value)}
                disabled={allTargets.length >= 4}
                className="h-8 min-w-0 flex-1 rounded-[7px] border border-line bg-void/75 px-2 text-xs text-ink"
              >
                {ALL_ADDABLE_PLACES.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.region})
                  </option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={addGazetteerTarget} disabled={allTargets.length >= 4} icon={Plus}>
                Add
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <input
                type="text"
                placeholder="Label"
                aria-label="Custom location label"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="h-8 rounded-[7px] border border-line bg-void/70 px-2 text-[11px] text-ink placeholder:text-ink-4"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Lat"
                aria-label="Custom latitude"
                value={customLat}
                onChange={(e) => setCustomLat(e.target.value)}
                className="h-8 rounded-[7px] border border-line bg-void/70 px-2 font-mono text-[11px] text-ink placeholder:text-ink-4"
              />
              <div className="flex gap-1">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Lon"
                  aria-label="Custom longitude"
                  value={customLon}
                  onChange={(e) => setCustomLon(e.target.value)}
                  className="h-8 min-w-0 flex-1 rounded-[7px] border border-line bg-void/70 px-2 font-mono text-[11px] text-ink placeholder:text-ink-4"
                />
                <button
                  type="button"
                  onClick={addCustomTarget}
                  disabled={allTargets.length >= 4}
                  aria-label="Add custom coordinates"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border border-line bg-surface text-ink-2 hover:border-atmo/50 hover:text-ink disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {inputErr ? <p className="text-[10.5px] text-caution">{inputErr}</p> : null}
          </div>
        </div>

        {/* Variable & Window Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-4">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('earthParameterSelection')}>
            {POWER_PARAMETERS.slice(0, 6).map((param) => (
              <button
                key={param.code}
                type="button"
                aria-pressed={paramCode === param.code}
                onClick={() => setParamCode(param.code)}
                className={cx(
                  'rounded-full border px-3 py-1.5 text-[11.5px] transition',
                  paramCode === param.code
                    ? 'border-atmo/60 bg-atmo/12 text-atmo-soft'
                    : 'border-line bg-surface/50 text-ink-3 hover:text-ink'
                )}
              >
                {param.label} <span className="font-mono text-[10px] opacity-65">{param.code}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <SegmentedControl
              label={t('earthStatCoverage')}
              value={rangeKey}
              onChange={(v) => setRangeKey(v)}
              items={RANGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              size="sm"
            />
            {comparison ? (
              <Button
                variant="secondary"
                size="sm"
                icon={Download}
                onClick={() =>
                  downloadTextFile(
                    `cosmora-location-comparison-${paramCode}-${startYear}-${endYear}.csv`,
                    multiLocationCsv(resolvedInputs, paramCode),
                    'text/csv'
                  )
                }
              >
                {t('earthCompareExportCsv')}
              </Button>
            ) : null}
          </div>
        </div>
      </Panel>

      {loading && !comparison ? (
        <Panel className="earth-glass-panel">
          <LoadingState label={t('earthLoadingSeries')} detail="Retrieving parallel NASA POWER point archives…" rows={3} />
        </Panel>
      ) : null}

      {!loading && fetchErr && !comparison ? (
        <Panel className="earth-glass-panel">
          <ErrorState title={t('earthSeriesError')} message={fetchErr} onRetry={() => loadAll(true)} />
        </Panel>
      ) : null}

      {comparison ? (
        <>
          {/* Delta KPI Cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {comparison.summaries.map((loc, idx) => (
              <div key={loc.id} className="earth-kpi-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: LOCATION_COLORS[idx % LOCATION_COLORS.length] }}
                      aria-hidden="true"
                    />
                    {loc.label}
                  </span>
                  {loc.elevationMeters !== null ? (
                    <span className="font-mono text-[10px] text-ink-4">{Math.round(loc.elevationMeters)} m</span>
                  ) : null}
                </div>
                <p className="mt-1 font-mono text-xl font-semibold text-ink">
                  {fmt(loc.mean, 2)} <span className="text-xs font-normal text-ink-4">{unit}</span>
                </p>
                <p className="font-mono text-[11px] text-ink-3">
                  {idx === 0
                    ? 'Primary reference'
                    : `Δ vs ${comparison.summaries[0].label}: ${fmtSigned(loc.deltaFromPrimary, 2)} ${unit}`}
                </p>
                {loc.meanAnnualTotalMm !== null ? (
                  <p className="font-mono text-[10.5px] text-signal">
                    {fmt(loc.meanAnnualTotalMm, 0)} mm/yr
                    {idx > 0 && loc.deltaAnnualTotalMmFromPrimary !== null
                      ? ` (${fmtSigned(loc.deltaAnnualTotalMmFromPrimary, 0)} mm)`
                      : ''}
                  </p>
                ) : (
                  <p className="font-mono text-[10.5px] text-ink-4">
                    Slope: {loc.slopePerDecade !== null ? `${fmtSigned(loc.slopePerDecade, 3)}/dec` : '—'}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Synchronized Multi-Location Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel className="earth-glass-panel space-y-3">
              <ChartFrame
                height={290}
                eyebrow={`Inter-Annual Trajectory · ${comparison.code}`}
                title={t('earthCompareAnnualOverlay')}
                series={comparison.summaries.map((loc, idx) => ({
                  key: loc.id,
                  label: loc.label,
                  color: LOCATION_COLORS[idx % LOCATION_COLORS.length]
                }))}
                xLabel="Calendar year"
                yLabel={unit}
                table={
                  <table className="w-full text-left text-[10.5px]">
                    <thead className="sticky top-0 bg-abyss">
                      <tr className="text-ink-4">
                        <th scope="col" className="py-1 pr-2 font-normal">Year</th>
                        {comparison.summaries.map((loc) => (
                          <th key={loc.id} scope="col" className="py-1 pr-2 text-right font-normal">{loc.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.annualRows.map((row) => (
                        <tr key={String(row.year)} className="border-t border-line/40 text-ink-2">
                          <td className="py-0.5 pr-2">{String(row.year)}</td>
                          {comparison.summaries.map((loc) => (
                            <td key={loc.id} className="py-0.5 pr-2 text-right tabular-nums">
                              {typeof row[loc.id] === 'number' ? (row[loc.id] as number).toFixed(2) : '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                }
              >
                <ComposedChart data={comparison.annualRows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="year" stroke={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
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
                      return (
                        <div className="rounded-[10px] border border-line bg-abyss/95 px-3 py-2 text-[11px] shadow-2xl">
                          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-atmo">{label}</p>
                          <ul className="mt-1 space-y-0.5">
                            {payload.map((entry, idx) => {
                              if (typeof entry.value !== 'number') return null;
                              const loc = comparison.summaries.find((l) => l.id === entry.dataKey);
                              return (
                                <li key={String(entry.dataKey || idx)} className="flex justify-between gap-4">
                                  <span className="text-ink-3">{loc?.label || String(entry.dataKey)}</span>
                                  <span className="font-mono text-ink">{entry.value.toFixed(2)} {unit}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    }}
                  />
                  {comparison.summaries.map((loc, idx) => (
                    <Line
                      key={loc.id}
                      yAxisId={0}
                      type="monotone"
                      dataKey={loc.id}
                      stroke={LOCATION_COLORS[idx % LOCATION_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </ComposedChart>
              </ChartFrame>
            </Panel>

            <Panel className="earth-glass-panel space-y-3">
              <ChartFrame
                height={290}
                eyebrow={`Seasonal Cycle · ${comparison.code}`}
                title={t('earthCompareSeasonalOverlay')}
                series={comparison.summaries.map((loc, idx) => ({
                  key: loc.id,
                  label: loc.label,
                  color: LOCATION_COLORS[idx % LOCATION_COLORS.length]
                }))}
                xLabel="Calendar month"
                yLabel={unit}
              >
                <ComposedChart data={comparison.climatologyRows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
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
                      return (
                        <div className="rounded-[10px] border border-line bg-abyss/95 px-3 py-2 text-[11px] shadow-2xl">
                          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-atmo">{label}</p>
                          <ul className="mt-1 space-y-0.5">
                            {payload.map((entry, idx) => {
                              if (typeof entry.value !== 'number') return null;
                              const loc = comparison.summaries.find((l) => l.id === entry.dataKey);
                              return (
                                <li key={String(entry.dataKey || idx)} className="flex justify-between gap-4">
                                  <span className="text-ink-3">{loc?.label || String(entry.dataKey)}</span>
                                  <span className="font-mono text-ink">{entry.value.toFixed(2)} {unit}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    }}
                  />
                  {comparison.summaries.map((loc, idx) => (
                    <Line
                      key={loc.id}
                      yAxisId={0}
                      type="monotone"
                      dataKey={loc.id}
                      stroke={LOCATION_COLORS[idx % LOCATION_COLORS.length]}
                      strokeWidth={2.2}
                      dot={{ r: 3 }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </ComposedChart>
              </ChartFrame>
            </Panel>
          </div>

          {/* Comparative Statistical & Quality Matrix */}
          <Panel className="earth-glass-panel space-y-3">
            <PanelHeader eyebrow="Cross-Site Evidence" title={t('earthCompareMatrixTitle')} icon={GitCompare} />
            <div className="overflow-x-auto rounded-[12px] border border-line/70">
              <table className="earth-data-table text-left">
                <thead>
                  <tr>
                    <th scope="col">Location</th>
                    <th scope="col" className="text-right">WGS84</th>
                    <th scope="col" className="text-right">Elevation</th>
                    <th scope="col" className="text-right">Mean ({unit})</th>
                    <th scope="col" className="text-right">Δ vs Primary</th>
                    <th scope="col" className="text-right">Min → Max</th>
                    <th scope="col" className="text-right">OLS / Decade</th>
                    <th scope="col" className="text-right">Completeness</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.summaries.map((loc, idx) => (
                    <tr key={loc.id}>
                      <td className="font-medium text-ink">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: LOCATION_COLORS[idx % LOCATION_COLORS.length] }}
                            aria-hidden="true"
                          />
                          {loc.label}
                        </span>
                      </td>
                      <td className="text-right font-mono text-ink-3">
                        {loc.latitude.toFixed(2)}°, {loc.longitude.toFixed(2)}°
                      </td>
                      <td className="text-right font-mono">{loc.elevationMeters !== null ? `${Math.round(loc.elevationMeters)} m` : '—'}</td>
                      <td className="text-right font-mono text-ink">{fmt(loc.mean, 2)}</td>
                      <td className="text-right font-mono text-atmo-soft">
                        {idx === 0 ? '—' : `${fmtSigned(loc.deltaFromPrimary, 2)} ${unit}`}
                      </td>
                      <td className="text-right font-mono">
                        {fmt(loc.min?.value, 1)} → {fmt(loc.max?.value, 1)}
                      </td>
                      <td className="text-right font-mono">
                        {loc.slopePerDecade !== null ? `${fmtSigned(loc.slopePerDecade, 3)}` : '—'}
                      </td>
                      <td className="text-right font-mono text-signal">{loc.completenessPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] leading-relaxed text-ink-4">
              Each series represents a ~0.5° × 0.625° NASA POWER reanalysis grid cell. Mountainous terrain (such as Nuwara Eliya) reflects grid-cell mean elevation rather than an individual ridge or valley station.
            </p>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
