/**
 * Earth Intelligence Lab — NASA Space Explorer (SYS.13)
 *
 * Upgraded in place: the previous NASA POWER monthly explorer is preserved as the
 * "Trend Detective" workspace (same service, same datasets, richer controls), and
 * three new workspaces are added:
 *
 *   1. Imagery Command  — NASA GIBS satellite imagery on a Leaflet map with a
 *                         verified layer catalog, date controls, side-by-side and
 *                         swipe comparison, 2D/3D views and availability reporting.
 *   2. Trend Detective  — NASA POWER monthly archive time series with descriptive
 *                         statistics and explicit limitations.
 *   3. Sri Lanka Watch  — island-focused study areas and datasets.
 *   4. AI Earth Analyst — grounded Q&A over the retrieved bundle, with a
 *                         deterministic non-AI fallback.
 *
 * Scientific-integrity rules enforced throughout: every value carries provider,
 * dataset, observation date and retrieval timestamp; dates outside a layer's
 * reported observation domain are refused rather than silently substituted; no
 * measurement is ever invented or interpolated.
 *
 * The heavy map and 3D globe modules are dynamically imported (React.lazy).
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Calendar,
  ChevronDown,
  Globe2,
  Layers,
  Leaf,
  Loader2,
  MapPin,
  Radar,
  Search,
  Satellite,
  Sparkles,
  WifiOff,
  Wand2
} from 'lucide-react';

import {
  GIBS_LAYERS,
  GIBS_ATTRIBUTION,
  DEFAULT_LAYER_ID,
  DEFAULT_VIEW,
  getGibsLayer,
  layersByCategory
} from '../lib/earth/gibsCatalog';
import { fetchLayerDomain, probeLayer } from '../lib/earth/gibsClient';
import { checkAvailability, describeCoverage, latestReportedDate, toIsoDate, addDays } from '../lib/earth/domains';
import { buildAnalystContext, buildMarkdownReport, powerSeriesCsv } from '../lib/earth/context';
import { compareRenderedImagery } from '../lib/earth/imagediff';
import { searchPlaces } from '../lib/earth/geocode';
import { validateCoordinates } from '../lib/earth/geo';
import { fetchCapabilities } from '../lib/earth/capabilities';
import { useDevicePerformance } from '../hooks/useDevicePerformance';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { daysInMonth, meanOf, parseParameter } from '../lib/earth/power';

import { InfoNote, LoadingBlock, Panel, Pill, SectionHeading, StatusBadge, formatDateTime } from './earth/EarthPanel';
import TrendDetective from './earth/TrendDetective';
import SriLankaWatch from './earth/SriLankaWatch';
import AnalystPanel from './earth/AnalystPanel';
import ProvenancePanel from './earth/ProvenancePanel';

/* Heavy map + 3D modules: separate chunks, loaded on demand. */
const ImageryMap = React.lazy(() => import('./earth/ImageryMap'));
const Globe3D = React.lazy(() => import('./earth/Globe3D'));
// Standalone GIBS frame viewer with local canvas enhancement; isolated from
// the NASA POWER pipeline and code-split into its own chunk.
const AiEarthViewer = React.lazy(() => import('./earth/AiEarthViewer'));

/* ------------------------------------------------------------------ */
/* Backwards-compatible pure exports (preserved from the previous Lab) */
/* ------------------------------------------------------------------ */
export { daysInMonth, parseParameter, meanOf };

/**
 * Legacy adapter kept so any external importer of the old Lab keeps working.
 * The Trend Detective uses `buildSeriesStats` from `lib/earth/power` directly.
 */
export function buildSummaries(rows) {
  const byYear = new Map();
  for (const row of rows || []) {
    if (!byYear.has(row.year)) byYear.set(row.year, { year: row.year, temps: [], rains: [] });
    const bucket = byYear.get(row.year);
    if (row.temp !== null && row.temp !== undefined) bucket.temps.push(row.temp);
    if (row.rain !== null && row.rain !== undefined) bucket.rains.push(row.rain);
  }
  const yearly = [...byYear.values()]
    .sort((a, b) => a.year - b.year)
    .map((bucket) => ({
      year: bucket.year,
      avgTemp: meanOf(bucket.temps),
      avgRain: meanOf(bucket.rains),
      tempMonths: bucket.temps.length,
      rainMonths: bucket.rains.length,
      complete: bucket.temps.length >= 12 && bucket.rains.length >= 12
    }));
  const allTemps = (rows || []).map((row) => row.temp).filter((value) => value !== null && value !== undefined);
  const allRains = (rows || []).map((row) => row.rain).filter((value) => value !== null && value !== undefined);
  return {
    yearly,
    avgTemp: meanOf(allTemps),
    avgRain: meanOf(allRains),
    tempCount: allTemps.length,
    rainCount: allRains.length
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const MODES = [
  { key: 'overview', labelKey: 'earthModeOverview', icon: Satellite },
  { key: 'trends', labelKey: 'earthModeTrends', icon: Activity },
  { key: 'srilanka', labelKey: 'earthModeSriLanka', icon: Leaf },
  { key: 'analyst', labelKey: 'earthModeAnalyst', icon: Sparkles },
  { key: 'ai-viewer', labelKey: 'earthModeAiViewer', icon: Wand2 }
];

const CATEGORY_LABELS = {
  all: 'earthCategoryAll',
  'true-color': 'earthCategoryTrueColor',
  vegetation: 'earthCategoryVegetation',
  land: 'earthCategoryLand',
  ocean: 'earthCategoryOcean',
  atmosphere: 'earthCategoryAtmosphere',
  fire: 'earthCategoryFire',
  night: 'earthCategoryNight'
};

const AREA_PRESETS = [
  { label: 'Sri Lanka (island-wide)', latitude: DEFAULT_VIEW.center[0], longitude: DEFAULT_VIEW.center[1], bounds: [5.9, 79.5, 9.9, 81.9] },
  { label: 'Sri Lanka (Colombo)', latitude: 6.9271, longitude: 79.8612, bounds: [6.75, 79.75, 7.1, 80.05] },
  { label: 'Amazon Basin', latitude: -3.119, longitude: -60.0217, bounds: [-5.5, -64.0, -1.0, -57.0] },
  { label: 'Bay of Bengal', latitude: 15.0, longitude: 88.0, bounds: [5.0, 80.0, 22.0, 95.0] },
  { label: 'California', latitude: 36.7783, longitude: -119.4179, bounds: [32.5, -124.5, 42.0, -114.0] }
];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    onChange();
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

/* ------------------------------------------------------------------ */
/* Workspace                                                          */
/* ------------------------------------------------------------------ */

export default function EarthIntelligenceLab({ lang = 'en' }) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const isOnline = useOnlineStatus();
  const { isOptimizedModeActive, reason: hardwareReason } = useDevicePerformance();

  const [mode, setMode] = useState('overview');
  const [layerId, setLayerId] = useState(DEFAULT_LAYER_ID);
  const [category, setCategory] = useState('all');
  const [date, setDate] = useState(() => addDays(toIsoDate(new Date()), -1));
  const [compareDate, setCompareDate] = useState(null);
  const [viewMode, setViewMode] = useState('single');
  const [opacity, setOpacity] = useState(1);
  const [useGlobe, setUseGlobe] = useState(false);
  const [area, setArea] = useState({
    label: 'Sri Lanka (island-wide)',
    latitude: DEFAULT_VIEW.center[0],
    longitude: DEFAULT_VIEW.center[1],
    bounds: [5.9, 79.5, 9.9, 81.9],
    source: 'preset'
  });
  const [domainState, setDomainState] = useState({ layerId: null, domain: null, transport: null, error: null, loading: false });
  const [probeState, setProbeState] = useState({ key: null, ok: null, service: null, format: null, error: null });
  const [powerSourced, setPowerSourced] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [difference, setDifference] = useState(null);
  const [differenceError, setDifferenceError] = useState(null);
  const [differenceBusy, setDifferenceBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchNotice, setSearchNotice] = useState(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [viewInfo, setViewInfo] = useState(null);
  const [globeFallback, setGlobeFallback] = useState(null);
  const abortRef = useRef(null);

  const layer = useMemo(() => getGibsLayer(layerId) || getGibsLayer(DEFAULT_LAYER_ID), [layerId]);
  const grouped = useMemo(() => layersByCategory(), []);
  const visibleLayers = useMemo(() => (category === 'all' ? GIBS_LAYERS : grouped[category] || []), [category, grouped]);

  /* ------------------------------ capabilities ---------------------------- */
  useEffect(() => {
    const controller = new AbortController();
    fetchCapabilities(controller.signal)
      .then((result) => setCapabilities(result))
      .catch(() => setCapabilities(null));
    return () => controller.abort();
  }, []);

  /* --------------------------- layer domain + probe ----------------------- */
  const loadLayerState = useCallback(
    async (targetLayer, { force = false } = {}) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setDomainState({ layerId: targetLayer.id, domain: null, transport: null, error: null, loading: true });

      try {
        const result = await fetchLayerDomain(targetLayer, { signal: controller.signal, force });
        if (controller.signal.aborted) return;
        setDomainState({
          layerId: targetLayer.id,
          domain: result.domain,
          transport: result.transport,
          error: result.error || null,
          loading: false
        });

        const probeKey = `${targetLayer.id}:${date}`;
        const probe = await probeLayer(targetLayer, date, { force });
        if (controller.signal.aborted) return;
        setProbeState({ key: probeKey, ok: probe.ok, service: probe.service, format: probe.format, error: probe.error || null });
      } catch (error) {
        if (error?.name === 'AbortError') return;
        setDomainState({ layerId: targetLayer.id, domain: null, transport: 'error', error: error?.message || 'Layer metadata failed', loading: false });
        setProbeState({ key: `${targetLayer.id}:${date}`, ok: null, service: null, format: null, error: error?.message || null });
      }
    },
    [date]
  );

  useEffect(() => {
    loadLayerState(layer);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer.id]);

  /* ------------------------- move to latest available --------------------- */
  const latestAvailable = useMemo(() => latestReportedDate(domainState.domain), [domainState.domain]);
  const availability = useMemo(
    () => (domainState.domain ? checkAvailability(domainState.domain, layer.id, date) : null),
    [domainState.domain, layer.id, date]
  );
  const compareAvailability = useMemo(
    () => (domainState.domain && compareDate ? checkAvailability(domainState.domain, layer.id, compareDate) : null),
    [domainState.domain, layer.id, compareDate]
  );

  // First load (or a new layer): snap to the most recent reported day instead of "yesterday".
  useEffect(() => {
    if (!latestAvailable) return;
    if (domainState.layerId !== layer.id) return;
    setDate((current) => (current > latestAvailable ? latestAvailable : current));
  }, [latestAvailable, domainState.layerId, layer.id]);

  const blockedReason =
    availability && availability.verdict === 'outside-domain'
      ? availability.detail
      : !isOnline
        ? t('earthOffline')
        : null;
  const blocked = Boolean(blockedReason);

  /* --------------------------- rendered comparison ------------------------ */
  const computeDifference = useCallback(async () => {
    if (!compareDate || !area.bounds) return;
    setDifferenceBusy(true);
    setDifferenceError(null);
    try {
      const outcome = await compareRenderedImagery(layer, date, compareDate, area.bounds, 256);
      if (outcome.ok) setDifference(outcome.result);
      else {
        setDifference(null);
        setDifferenceError(outcome.reason === 'cors' ? t('earthPixelCompareCors') : outcome.detail);
      }
    } finally {
      setDifferenceBusy(false);
    }
  }, [area.bounds, compareDate, date, layer, t]);

  useEffect(() => {
    setDifference(null);
    setDifferenceError(null);
  }, [layer.id, date, compareDate]);

  /* -------------------------------- search -------------------------------- */
  const runSearch = useCallback(
    async (query) => {
      const trimmed = (query || '').trim();
      if (!trimmed) return;
      setSearchBusy(true);
      setSearchNotice(null);
      try {
        const outcome = await searchPlaces(trimmed);
        setSearchResults(outcome.results);
        setSearchNotice(outcome.notice || null);
        if (!outcome.results.length) setSearchNotice(t('earthSearchNoResults'));
      } catch (error) {
        if (error?.name === 'AbortError') return;
        setSearchNotice(t('earthSearchLocalOnly'));
      } finally {
        setSearchBusy(false);
      }
    },
    [t]
  );

  const applyPlace = useCallback((place) => {
    setArea({
      label: place.label,
      latitude: place.latitude,
      longitude: place.longitude,
      bounds: place.bounds,
      source: place.source
    });
    setSearchResults([]);
    setSearchNotice(null);
  }, []);

  /* --------------------------- analyst + report --------------------------- */
  const context = useMemo(
    () =>
      buildAnalystContext({
        area,
        primaryDate: date,
        compareDate,
        layers: [{ layer, domain: domainState.domain, availability, probeOk: probeState.ok }],
        power: powerSourced?.data || null,
        powerProvenanceUrl: powerSourced?.provenance?.sourceUrl,
        powerRetrievedAt: powerSourced?.provenance?.retrievedAt,
        probeNotes: probeState.ok === false ? [`${layer.id} did not return a renderable image during the live probe.`] : [],
        renderedDifference: difference
          ? {
              meanAbsoluteDifference: difference.meanAbsoluteDifference,
              changedFraction: difference.changedFraction,
              transparentFraction: difference.transparentFraction,
              method: difference.method,
              computedAt: difference.computedAt
            }
          : null
      }),
    [area, date, compareDate, layer, domainState.domain, availability, probeState.ok, powerSourced, difference]
  );

  const provenanceEntries = useMemo(() => {
    const entries = [
      {
        key: `layer-${layer.id}`,
        title: layer.title,
        status: blocked ? 'unavailable' : domainState.transport === 'error' ? 'unavailable' : domainState.domain?.fromCache || domainState.transport === 'cache' ? 'cached' : 'live',
        dataset: `${layer.id} (${layer.service.toUpperCase()}${layer.tileMatrixSet ? ` · ${layer.tileMatrixSet}` : ''})`,
        provider: 'NASA EOSDIS Global Imagery Browse Services (GIBS)',
        sourceUrl: domainState.domain?.sourceUrl || `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/${layer.id}/default/all/all.xml`,
        observation: date,
        retrievedAt: domainState.domain?.retrievedAt || new Date().toISOString(),
        coverage: describeCoverage(domainState.domain) || 'not retrieved',
        units: layer.unit,
        resolution: layer.resolution,
        transport: domainState.transport
          ? t(
              domainState.transport === 'server'
                ? 'earthProvenanceTransportServer'
                : domainState.transport === 'direct'
                  ? 'earthProvenanceTransportDirect'
                  : domainState.transport === 'cache'
                    ? 'earthProvenanceTransportCache'
                    : 'earthProvenanceTransportError'
            )
          : undefined,
        note: blockedReason || probeState.error || undefined,
        limitations: [layer.limitations, ...(availability ? [availability.detail] : [])]
      }
    ];

    if (powerSourced?.data) {
      const data = powerSourced.data;
      entries.push({
        key: 'power',
        title: `${data.placeLabel} — NASA POWER monthly archive`,
        status: powerSourced.status,
        dataset: `POWER monthly: ${data.available.join(', ') || 'no parameters returned'}`,
        provider: powerSourced.provenance.provider,
        sourceUrl: powerSourced.provenance.sourceUrl,
        observation: powerSourced.provenance.observationDate,
        retrievedAt: powerSourced.provenance.retrievedAt,
        coverage: `${data.startYear}–${data.endYear} · ${data.rows.length} monthly records`,
        units: data.available.map((code) => `${code} (${data.stats[code]?.unit || '—'})`).join(', '),
        resolution: powerSourced.provenance.resolution,
        note: data.unavailable.length ? `${t('earthSeriesUnavailable')}: ${data.unavailable.join(', ')}` : undefined,
        limitations: powerSourced.provenance.note ? [powerSourced.provenance.note] : undefined
      });
    }

    if (difference) {
      entries.push({
        key: 'difference',
        title: t('earthPixelCompare'),
        status: 'derived',
        dataset: 'Rendered-pixel comparison (client-side, from GIBS WMS imagery)',
        provider: 'Derived by NASA Space Explorer',
        sourceUrl: difference.urlA,
        observation: `${date} vs ${compareDate}`,
        retrievedAt: difference.computedAt,
        coverage: `${(difference.changedFraction * 100).toFixed(2)}% of rendered pixels changed by >12/255`,
        resolution: '256 × 256 WMS rendering of the current bounding box',
        limitations: [t('earthPixelCompareNote')]
      });
    }

    return entries;
  }, [layer, date, compareDate, domainState, blocked, blockedReason, probeState, availability, powerSourced, difference, t]);

  const report = useMemo(() => {
    if (!provenanceEntries.length) return null;
    const generatedAt = new Date().toISOString();
    const markdown = buildMarkdownReport({
      area,
      primaryDate: date,
      compareDate,
      layers: [{ layer, domain: domainState.domain, availability, probeOk: probeState.ok }],
      power: powerSourced?.data || null,
      powerProvenanceUrl: powerSourced?.provenance?.sourceUrl,
      powerRetrievedAt: powerSourced?.provenance?.retrievedAt,
      renderedDifference: difference
        ? {
            meanAbsoluteDifference: difference.meanAbsoluteDifference,
            changedFraction: difference.changedFraction,
            transparentFraction: difference.transparentFraction,
            method: difference.method,
            computedAt: difference.computedAt
          }
        : null,
      context,
      generatedAt
    });
    const filenameBase = `earth-intelligence-${area.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${date}`;
    return {
      markdown,
      json: JSON.stringify(
        {
          generatedAt,
          area,
          dates: [date, compareDate].filter(Boolean),
          layer: {
            id: layer.id,
            title: layer.title,
            service: layer.service,
            tileMatrixSet: layer.tileMatrixSet || null,
            units: layer.unit,
            resolution: layer.resolution,
            limitations: layer.limitations
          },
          availability,
          domain: domainState.domain,
          probe: probeState,
          power: {
            provenance: powerSourced?.provenance || null,
            available: powerSourced?.data?.available || [],
            unavailable: powerSourced?.data?.unavailable || [],
            statistics: powerSourced?.data
              ? powerSourced.data.available.map((code) => ({ code, ...powerSourced.data.stats[code] }))
              : []
          },
          renderedDifference: difference,
          dataGaps: context.dataGaps
        },
        null,
        2
      ),
      csv: powerSourced?.data ? powerSeriesCsv(powerSourced.data) : null,
      filenameBase
    };
  }, [provenanceEntries.length, area, date, compareDate, layer, domainState.domain, availability, probeState, powerSourced, difference, context]);

  /* -------------------------- derived status lines ------------------------ */
  const probeLabel = useMemo(() => {
    if (probeState.ok === true) return t('earthLayerProbeOk');
    if (probeState.ok === false) return t('earthLayerProbeFailed');
    return t('earthVerifyingLayer');
  }, [probeState.ok, t]);

  const coordinatesValid = validateCoordinates(area.latitude, area.longitude);

  return (
    <div className="space-y-4 text-ink sm:space-y-5">
      {/* ================= Lab briefing ================= */}
      <section className="surface surface-highlight overflow-hidden">
        <div className="relative grid gap-5 p-5 sm:p-6 lg:grid-cols-[1.7fr_1fr]">
          <div className="pointer-events-none absolute inset-0 grid-field opacity-40" aria-hidden="true" />
          <div className="relative min-w-0">
            <p className="eyebrow flex items-center gap-2">
              <Radar className="h-3.5 w-3.5 text-atmo" strokeWidth={1.8} />
              {t('earthLabBadge')}
            </p>
            <h3 className="mt-2.5 text-[19px] font-semibold leading-snug tracking-[-0.02em] text-ink sm:text-[22px]">
              {t('earthLabBriefTitle')}
            </h3>
            <p className="prose-measure mt-2.5 max-w-2xl text-[12px] leading-relaxed text-ink-2 sm:text-[12.5px]">
              {t('earthLabIntro')}
            </p>
          </div>
          <div className="relative flex flex-wrap content-start items-center gap-1.5 lg:justify-end">
            {capabilities ? (
              <Pill tone={capabilities.serverReachable ? 'emerald' : 'slate'}>
                {capabilities.serverReachable ? 'validated proxy' : 'direct NASA services'}
              </Pill>
            ) : null}
            {capabilities?.aiAnalyst ? <Pill tone="violet">AI analyst</Pill> : null}
            {capabilities && !capabilities.firmsHotspots ? <Pill tone="slate">FIRMS · no key</Pill> : null}
            {!isOnline ? (
              <Pill tone="amber">
                <WifiOff className="h-3 w-3" /> offline
              </Pill>
            ) : null}
          </div>
        </div>
        <div className="relative flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line/70 px-5 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-4 sm:px-6">
          <span>NASA POWER · monthly archive</span>
          <span className="h-2.5 w-px bg-line-strong" aria-hidden="true" />
          <span>NASA GIBS · EOSDIS imagery</span>
          <span className="h-3 w-px bg-line-strong" aria-hidden="true" />
          <span>Estimates, not station measurements</span>
        </div>
      </section>

      {isOptimizedModeActive && useGlobe ? (
        <InfoNote tone="amber">{t('earthGlobeFallback')} ({hardwareReason})</InfoNote>
      ) : null}

      {/* ============================ Workspaces ============================ */}
      <div className="no-scrollbar -mx-4 flex gap-6 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" role="tablist" aria-label={t('earthModesLabel')}>
        {MODES.map((item) => {
          const Icon = item.icon;
          const active = mode === item.key;
          return (
            <button
              key={item.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setMode(item.key)}
              className={`relative flex shrink-0 items-center gap-2 pb-3 pt-1 text-[12.5px] font-medium transition-colors ${
                active ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${active ? 'text-atmo' : ''}`} />
              {t(item.labelKey)}
              <span className={`absolute inset-x-0 -bottom-px h-px ${active ? 'bg-atmo' : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>

      {/* ============================ Search bar ============================ */}
      <Panel className="space-y-3">
        <SectionHeading icon={Search} title={t('earthSearchLabel')} subtitle={t('earthSearchPlaceholder')} />
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            runSearch(searchQuery);
          }}
        >
          <label htmlFor="earth-place-search" className="sr-only">
            {t('earthSearchLabel')}
          </label>
          <input
            id="earth-place-search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t('earthSearchPlaceholder')}
            className="min-w-[180px] flex-1 rounded-[8px] border border-line bg-surface/60 px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atmo"
          />
          <button
            type="submit"
            disabled={searchBusy}
            className="flex items-center gap-2 rounded-[8px] border border-atmo/35 bg-atmo/[0.08] px-3 py-2 text-sm text-atmo-soft transition hover:bg-cyan-500/20 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atmo"
          >
            {searchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {searchBusy ? t('earthSearching') : t('earthSearchAction')}
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {AREA_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setArea({ ...preset, source: 'preset' })}
              className="rounded-full border border-line bg-surface/60 px-2.5 py-1 text-[11px] text-ink-2 transition hover:border-atmo/45 hover:text-ink"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {searchNotice ? <InfoNote tone="amber">{searchNotice}</InfoNote> : null}

        {searchResults.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {searchResults.map((place) => (
              <li key={`${place.label}-${place.latitude}-${place.longitude}`}>
                <button
                  type="button"
                  onClick={() => applyPlace(place)}
                  className="w-full rounded-[10px] border border-line bg-abyss/70 p-3 text-left transition hover:border-atmo/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atmo"
                >
                  <p className="text-sm text-white">{place.label}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-ink-4">
                    {place.latitude.toFixed(3)}°, {place.longitude.toFixed(3)}°
                  </p>
                  <p className="mt-1 text-[10px] text-ink-4">{place.attribution}</p>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      {/* ============================ Overview mode ============================ */}
      {mode === 'overview' ? (
        <div className="space-y-4">
          <Panel className="space-y-4">
            <SectionHeading
              icon={Layers}
              title={t('earthLayerLabel')}
              subtitle={`${visibleLayers.length} validated datasets · ${GIBS_ATTRIBUTION}`}
              badge={
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={domainState.loading ? 'cached' : blocked ? 'unavailable' : probeState.ok === false ? 'unavailable' : 'live'} />
                  <button
                    type="button"
                    onClick={() => {
                      const next = !useGlobe;
                      if (next && isOptimizedModeActive) {
                        setGlobeFallback('low-end');
                        return;
                      }
                      setUseGlobe(next);
                      setGlobeFallback(null);
                    }}
                    className="flex items-center gap-2 rounded-[8px] border border-line bg-surface/60 px-2.5 py-1.5 text-[11px] text-ink-2 transition hover:border-atmo/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atmo"
                    aria-pressed={useGlobe}
                  >
                    <Globe2 className="h-3.5 w-3.5" />
                    {useGlobe ? t('earthMapToggle') : t('earthGlobeToggle')}
                  </button>
                </div>
              }
            />

            <div className="flex flex-wrap gap-1.5">
              {Object.entries(CATEGORY_LABELS).map(([key, labelKey]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  aria-pressed={category === key}
                  className={`rounded-[8px] border px-2.5 py-1 text-[11px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atmo ${
                    category === key
                      ? 'border-signal/60 bg-signal/10 text-signal'
                      : 'border-line bg-surface/60 text-ink-2 hover:border-lime-500/50 hover:text-ink'
                  }`}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="sr-only">{t('earthLayerLabel')}</span>
              <div className="relative">
                <select
                  value={layerId}
                  onChange={(event) => setLayerId(event.target.value)}
                  className="w-full appearance-none rounded-[8px] border border-line bg-surface/60 px-3 py-2 pr-9 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atmo"
                >
                  {visibleLayers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} — {item.id}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-ink-3" />
              </div>
            </label>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1 text-[11px] text-ink-3">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-cyan-400" />
                  {t('earthObservationDate')}
                </span>
                <input
                  type="date"
                  value={date}
                  max={toIsoDate(new Date())}
                  onChange={(event) => setDate(event.target.value)}
                  className="rounded-[8px] border border-line bg-surface/60 px-2.5 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atmo"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-ink-3">
                <span>{t('earthComparisonDate')}</span>
                <input
                  type="date"
                  value={compareDate || ''}
                  max={toIsoDate(new Date())}
                  onChange={(event) => {
                    const next = event.target.value || null;
                    setCompareDate(next);
                    if (next && viewMode === 'single') setViewMode('side');
                  }}
                  className="rounded-[8px] border border-line bg-surface/60 px-2.5 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atmo"
                />
              </label>
              <div className="flex flex-col gap-1 text-[11px] text-ink-3">
                <span>{t('earthViewMode')}</span>
                <div className="flex gap-1">
                  {[
                    { key: 'single', label: t('earthViewSingle') },
                    { key: 'side', label: t('earthViewSideBySide') },
                    { key: 'swipe', label: t('earthSwipeHint') && t('earthViewSwipe') }
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setViewMode(option.key)}
                      aria-pressed={viewMode === option.key}
                      disabled={option.key !== 'single' && !compareDate}
                      className={`flex-1 rounded-[8px] border px-2 py-2 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atmo ${
                        viewMode === option.key
                          ? 'border-atmo/60 bg-atmo/10 text-atmo-soft'
                          : 'border-line bg-surface/60 text-ink-2 hover:border-atmo/45'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex flex-col gap-1 text-[11px] text-ink-3">
                <span>
                  {t('earthLayerOpacity')} · {Math.round(opacity * 100)}%
                </span>
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={opacity}
                  onChange={(event) => setOpacity(Number(event.target.value))}
                  className="mt-2 accent-atmo"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-3">
              <Pill tone="cyan">
                <MapPin className="h-3 w-3" /> {area.label}
              </Pill>
              <span className="font-mono">
                {coordinatesValid ? `${area.latitude.toFixed(4)}°, ${area.longitude.toFixed(4)}°` : 'invalid coordinates'}
              </span>
              {latestAvailable ? (
                <button
                  type="button"
                  onClick={() => setDate(latestAvailable)}
                  className="rounded-full border border-line bg-surface/60 px-2.5 py-1 text-[11px] text-ink-2 transition hover:border-atmo/45 hover:text-ink"
                >
                  {t('earthLatestAvailable')}: {latestAvailable}
                </button>
              ) : null}
              <span className={`rounded-full border px-2.5 py-1 ${probeState.ok === false ? 'border-caution/35 text-caution' : 'border-line text-ink-2'}`}>
                {probeLabel}
              </span>
            </div>

            {availability ? (
              <InfoNote tone={availability.verdict === 'available' ? 'cyan' : 'amber'}>
                <div className="flex flex-wrap items-center gap-2">
                  <span>{availability.detail}</span>
                  {availability.verdict === 'outside-domain' && availability.nearestDate ? (
                    <button
                      type="button"
                      onClick={() => setDate(availability.nearestDate)}
                      className="rounded-full border border-caution/45 bg-caution/[0.08] px-2.5 py-0.5 text-[11px] text-caution transition hover:bg-amber-500/20"
                    >
                      {t('earthJumpToNearest', { date: availability.nearestDate })}
                    </button>
                  ) : null}
                </div>
              </InfoNote>
            ) : domainState.loading ? (
              <InfoNote>{t('earthVerifyingLayer')}</InfoNote>
            ) : (
              <InfoNote tone="amber">{t('earthDateUnverified')}</InfoNote>
            )}
          </Panel>

          <Panel className="space-y-3">
            <Suspense fallback={<LoadingBlock label={t('earthVerifyingLayer')} detail="leaflet · GIBS WMTS" />}>
              {useGlobe ? (
                <Globe3D
                  layer={layer}
                  date={date}
                  reducedMotion={reducedMotion}
                  center={{ latitude: area.latitude, longitude: area.longitude }}
                  quality={isOptimizedModeActive ? 'low' : 'high'}
                  onFallback={(reason) => {
                    setGlobeFallback(reason);
                    setUseGlobe(false);
                  }}
                />
              ) : (
                <ImageryMap
                  area={area}
                  layer={layer}
                  date={blocked ? null : date}
                  compareDate={compareDate}
                  mode={viewMode}
                  opacity={opacity}
                  reducedMotion={reducedMotion}
                  verifiedService={probeState.ok ? probeState.service : null}
                  verifiedFormat={probeState.ok ? probeState.format : null}
                  blocked={blocked ? { reason: blockedReason } : null}
                  onDateChange={(next) => setDate(next)}
                  onViewChange={setViewInfo}
                  labels={{
                    zoomIn: 'Zoom in',
                    zoomOut: 'Zoom out',
                    reset: t('earthResetView'),
                    swipeHint: t('earthSwipeHint'),
                    primary: t('earthObservationDate'),
                    comparison: t('earthComparisonDate'),
                    attribution: t('earthImageryAttribution')
                  }}
                />
              )}
            </Suspense>

            {globeFallback === 'texture' ? <InfoNote tone="amber">{t('earthGlobeFallback')}</InfoNote> : null}

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-4">
              <span className="font-mono text-atmo/80">{layer.id}</span>
              <span>
                {t('earthProvenanceCoverage')}: {describeCoverage(domainState.domain) || '—'}
              </span>
              {viewInfo ? (
                <span className="font-mono">
                  z{viewInfo.zoom} · {viewInfo.center[0].toFixed(2)}°, {viewInfo.center[1].toFixed(2)}°
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-ink-4">{GIBS_ATTRIBUTION}</p>
            <p className="text-[11px] text-ink-4">{t('earthMapKeyboardHint')}</p>
          </Panel>

          {compareDate && area.bounds ? (
            <Panel className="space-y-3">
              <SectionHeading
                icon={Activity}
                title={t('earthPixelCompare')}
                subtitle={t('earthPixelCompareNote')}
                badge={difference ? <StatusBadge status="derived" /> : undefined}
              />
              <button
                type="button"
                onClick={computeDifference}
                disabled={differenceBusy}
                className="flex items-center gap-2 rounded-[8px] border border-derived/35 bg-derived/[0.08] px-3 py-2 text-xs text-derived transition hover:bg-violet-500/20 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-derived"
              >
                {differenceBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                {t('earthPixelCompare')} · {date} ↔ {compareDate}
              </button>
              {difference ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[10px] border border-violet-500/30 bg-derived/[0.05] p-3">
                    <p className="text-[11px] text-ink-3">{t('earthPixelCompareMean')}</p>
                    <p className="text-lg font-bold text-white">{difference.meanAbsoluteDifference}</p>
                  </div>
                  <div className="rounded-[10px] border border-violet-500/30 bg-derived/[0.05] p-3">
                    <p className="text-[11px] text-ink-3">{t('earthPixelCompareChanged')}</p>
                    <p className="text-lg font-bold text-white">{(difference.changedFraction * 100).toFixed(2)}%</p>
                  </div>
                  <div className="rounded-[10px] border border-violet-500/30 bg-derived/[0.05] p-3">
                    <p className="text-[11px] text-ink-3">{t('earthPixelCompareTransparent')}</p>
                    <p className="text-lg font-bold text-white">{(difference.transparentFraction * 100).toFixed(2)}%</p>
                  </div>
                </div>
              ) : null}
              {differenceError ? (
                <InfoNote tone="amber">{t('earthPixelCompareUnavailable', { reason: differenceError })}</InfoNote>
              ) : null}
              {compareAvailability && compareAvailability.verdict !== 'available' ? (
                <InfoNote tone="amber">
                  {compareAvailability.detail}
                  {compareAvailability.nearestDate ? (
                    <button
                      type="button"
                      onClick={() => setCompareDate(compareAvailability.nearestDate)}
                      className="ml-2 rounded-full border border-caution/45 bg-caution/[0.08] px-2.5 py-0.5 text-[11px] text-caution"
                    >
                      {t('earthJumpToNearest', { date: compareAvailability.nearestDate })}
                    </button>
                  ) : null}
                </InfoNote>
              ) : null}
            </Panel>
          ) : null}

          <Panel>
            <SectionHeading icon={Layers} title={t('earthDatasetDescription')} subtitle={layer.summary} />
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="space-y-1.5 text-xs text-ink-2">
                <p>
                  <span className="text-ink-4">{t('earthPlatformLabel')}: </span>
                  {layer.platform} · {layer.instrument}
                </p>
                <p>
                  <span className="text-ink-4">{t('earthParameterLabel')}: </span>
                  {layer.parameter}
                </p>
                <p>
                  <span className="text-ink-4">{t('earthProvenanceUnits')}: </span>
                  {layer.unit}
                </p>
                <p>
                  <span className="text-ink-4">{t('earthResolutionLabel')}: </span>
                  {layer.resolution}
                </p>
                <p>
                  <span className="text-ink-4">{t('earthPeriodLabel')}: </span>
                  {layer.period}
                </p>
                <p>
                  <span className="text-ink-4">{t('earthVerificationLabel')}: </span>
                  {layer.verification === 'describe-domains' ? t('earthVerificationDescribeDomains') : t('earthVerificationCatalog')} ·{' '}
                  {t('earthVerifiedOn', { date: layer.verifiedOn })}
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-ink-4">{t('earthDatasetAppropriateFor')}</p>
                  <ul className="mt-1 space-y-1 text-xs text-ink-2">
                    {layer.appropriateFor.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-[10px] border border-amber-500/25 bg-caution/[0.04] p-3">
                  <p className="text-[11px] uppercase tracking-wide text-caution/80">{t('earthDatasetLimitations')}</p>
                  <p className="mt-1 text-xs leading-relaxed text-caution">{layer.limitations}</p>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      ) : null}

      {/* ============================ Trend Detective ============================ */}
      {mode === 'trends' ? (
        <TrendDetective
          area={{ ...area, source: area.source === 'preset' ? 'preset' : 'gazetteer' }}
          onAreaChange={(next) => setArea({ ...next, source: 'custom' })}
          onPowerResolved={(sourced) => setPowerSourced(sourced)}
          reducedMotion={reducedMotion}
        />
      ) : null}

      {/* ============================ Sri Lanka Watch ============================ */}
      {mode === 'srilanka' ? (
        <div className="space-y-4">
          <SriLankaWatch
            area={area}
            layer={layer}
            date={date}
            compareDate={compareDate}
            onSelectArea={(next) => {
              setArea(next);
              setMode('overview');
            }}
            onSelectLayer={(id) => {
              setLayerId(id);
              setMode('overview');
            }}
            onSetDate={(next, which) => {
              if (which === 'compare') {
                setCompareDate(next);
                setViewMode('side');
              } else setDate(next);
            }}
          />
          <Panel>
            <SectionHeading icon={Satellite} title={t('earthStatisticalSummary')} subtitle={t('earthTrendCaveat')} />
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setMode('trends')}
                className="rounded-[8px] border border-atmo/35 bg-atmo/[0.08] px-3 py-2 text-xs text-atmo-soft transition hover:bg-cyan-500/20"
              >
                {t('earthModeTrends')} →
              </button>
            </div>
          </Panel>
        </div>
      ) : null}

      {/* ============================ AI Analyst ============================ */}
      {mode === 'analyst' ? <AnalystPanel context={context} lang={lang} aiCapable={Boolean(capabilities?.aiAnalyst)} /> : null}

      {/* ==================== AI-Enhanced Earth Viewer ===================== */}
      {mode === 'ai-viewer' ? (
        <Suspense fallback={<LoadingBlock label={t('earthAiStatusLoading')} detail="GIBS · WMS GetMap · canvas" />}>
          <AiEarthViewer lang={lang} />
        </Suspense>
      ) : null}

      {/* ============================ Provenance ============================ */}
      <ProvenancePanel entries={provenanceEntries} report={report} />

      {!isOnline ? <InfoNote tone="amber">{t('earthOffline')}</InfoNote> : null}
      {reducedMotion ? <p className="text-[11px] text-ink-4">{t('earthReducedMotion')}</p> : null}
    </div>
  );
}
