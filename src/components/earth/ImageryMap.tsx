/**
 * Leaflet satellite imagery map for the COSMORA Earth Intelligence Lab.
 *
 * Lazy-loaded (`React.lazy`) so Leaflet lives in its own chunk.
 *
 * View modes:
 *  - `single`  : one map, primary observation date
 *  - `side`    : two synced maps, primary date | comparison date
 *  - `swipe`   : two synced maps stacked, comparison date revealed by a keyboard-operable divider
 *
 * Includes:
 *  - Cadence-aware date stepping (clamped against future dates)
 *  - Tile loading & error telemetry HUD
 *  - Active study-point target reticle + optional Click-to-Inspect coordinate picker
 *  - Calibrated scientific layer legend (continuous ramps & categorical swatches)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Loader2,
  Minus,
  Move,
  Palette,
  Plus,
  RotateCcw
} from 'lucide-react';
import { imagerySource } from '../../lib/earth/gibsClient';
import { getLayerLegend } from '../../lib/earth/gibsLegends';
import type { GibsLayerMeta } from '../../lib/earth/types';

export interface MapArea {
  label: string;
  latitude: number;
  longitude: number;
  bounds?: [number, number, number, number];
}

export interface ImageryMapProps {
  area: MapArea;
  layer: GibsLayerMeta;
  /** `null` when the requested date is known to be unavailable — no tiles are requested. */
  date: string | null;
  compareDate?: string | null;
  /** Set when the layer/date must not be rendered (outside the reported domain, offline…). */
  blocked?: { reason: string } | null;
  mode: 'single' | 'side' | 'swipe';
  opacity: number;
  reducedMotion: boolean;
  /** Service/format verified by a live probe, when available. */
  verifiedService?: 'wmts' | 'wms' | null;
  verifiedFormat?: 'jpg' | 'png' | null;
  tileTemplateOverride?: string | null;
  /** Optional interactive click-to-set-coordinates mode. */
  pickMode?: boolean;
  onMapPick?: (coords: { latitude: number; longitude: number }) => void;
  onViewChange?: (info: { bounds: [number, number, number, number]; center: [number, number]; zoom: number }) => void;
  /** Optional callback when the user navigates to a different date. */
  onDateChange?: (date: string) => void;
  labels: {
    zoomIn: string;
    zoomOut: string;
    reset: string;
    swipeHint: string;
    primary: string;
    comparison: string;
    attribution: string;
    legendTitle?: string;
  };
}

function nativeZoomOf(layer: GibsLayerMeta): number {
  const match = /Level(\d+)/.exec(layer.tileMatrixSet || '');
  if (match) return Number(match[1]);
  return 9;
}

function buildTileLayer(
  layer: GibsLayerMeta,
  date: string,
  opacity: number,
  service: 'wmts' | 'wms',
  format: 'jpg' | 'png',
  attribution: string,
  reducedMotion: boolean,
  override?: string | null
): L.TileLayer {
  const native = nativeZoomOf(layer);
  const common: L.TileLayerOptions = {
    opacity,
    attribution,
    maxZoom: native + 3,
    maxNativeZoom: native,
    minZoom: 1,
    crossOrigin: false,
    updateWhenZooming: !reducedMotion,
    keepBuffer: 1
  };

  if (service === 'wms') {
    const source = imagerySource(layer, date, { ok: true, service: 'wms', format: 'png', url: '' });
    return L.tileLayer.wms(source.url, {
      ...common,
      layers: layer.id,
      styles: '',
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      time: date,
      uppercase: true
    } as L.WMSOptions & { time: string });
  }

  const template = override || imagerySource(layer, date, { ok: true, service: 'wmts', format, url: '' }).url;
  return L.tileLayer(template, { ...common, tileSize: 256 });
}

export default function ImageryMap({
  area,
  layer,
  date,
  compareDate,
  blocked,
  mode,
  opacity,
  reducedMotion,
  verifiedService,
  verifiedFormat,
  tileTemplateOverride,
  pickMode = false,
  onMapPick,
  onDateChange,
  onViewChange,
  labels
}: ImageryMapProps) {
  const primaryRef = useRef<HTMLDivElement | null>(null);
  const secondaryRef = useRef<HTMLDivElement | null>(null);
  const mapPrimary = useRef<L.Map | null>(null);
  const mapSecondary = useRef<L.Map | null>(null);
  const markerPrimary = useRef<L.CircleMarker | null>(null);
  const syncing = useRef(false);
  const [divider, setDivider] = useState(50);
  const [tileErrors, setTileErrors] = useState(0);
  const [tilesPending, setTilesPending] = useState(0);
  const [centerReadout, setCenterReadout] = useState<{ lat: number; lng: number; zoom: number }>({
    lat: area.latitude,
    lng: area.longitude,
    zoom: 6
  });
  const containerRef = useRef<HTMLDivElement | null>(null);

  const legend = useMemo(() => getLayerLegend(layer), [layer]);
  const stepDays = legend.stepDays || 1;
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [navDate, setNavDate] = useState(date || '');
  const pickRef = useRef({ pickMode, onMapPick });
  pickRef.current = { pickMode, onMapPick };

  useEffect(() => {
    if (date && date !== navDate) setNavDate(date);
  }, [date, navDate]);

  const goToDay = useCallback(
    (offsetDays: number) => {
      if (!navDate) return;
      const ms = Date.parse(`${navDate}T00:00:00Z`) + offsetDays * 86_400_000;
      const candidate = new Date(ms).toISOString().slice(0, 10);
      const clamped = candidate > todayIso ? todayIso : candidate;
      setNavDate(clamped);
      onDateChange?.(clamped);
    },
    [navDate, onDateChange, todayIso]
  );

  const service: 'wmts' | 'wms' = verifiedService || layer.service;
  const format: 'jpg' | 'png' = verifiedFormat || layer.format;
  const attribution = useMemo(() => `${labels.attribution} · ${layer.id}`, [labels.attribution, layer.id]);

  const reportView = useCallback(
    (map: L.Map) => {
      const bounds = map.getBounds();
      const center = map.getCenter();
      const zoom = map.getZoom();
      setCenterReadout({ lat: center.lat, lng: center.lng, zoom });
      onViewChange?.({
        bounds: [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()],
        center: [center.lat, center.lng],
        zoom
      });
    },
    [onViewChange]
  );

  /* ------------------------------ map creation ----------------------------- */
  useEffect(() => {
    const options: L.MapOptions = {
      zoomControl: false,
      attributionControl: true,
      zoomAnimation: !reducedMotion,
      fadeAnimation: !reducedMotion,
      markerZoomAnimation: !reducedMotion,
      preferCanvas: true,
      worldCopyJump: true
    };

    if (primaryRef.current && !mapPrimary.current) {
      const map = L.map(primaryRef.current, {
        ...options,
        center: [area.latitude, area.longitude],
        zoom: 6
      });
      map.attributionControl.setPrefix(false);
      mapPrimary.current = map;
      map.on('moveend zoomend', () => {
        reportView(map);
        if (mapSecondary.current && !syncing.current) {
          syncing.current = true;
          mapSecondary.current.setView(map.getCenter(), map.getZoom(), { animate: false });
          syncing.current = false;
        }
      });
      map.on('click', (event: L.LeafletMouseEvent) => {
        if (pickRef.current.pickMode && pickRef.current.onMapPick) {
          const lat = Math.max(-90, Math.min(90, Number(event.latlng.lat.toFixed(4))));
          const lon = ((((event.latlng.lng + 180) % 360) + 360) % 360) - 180;
          pickRef.current.onMapPick({ latitude: lat, longitude: Number(lon.toFixed(4)) });
        }
      });
      reportView(map);
    }

    if (secondaryRef.current && !mapSecondary.current) {
      const map = L.map(secondaryRef.current, {
        ...options,
        center: [area.latitude, area.longitude],
        zoom: 6,
        dragging: mode !== 'swipe',
        scrollWheelZoom: mode !== 'swipe',
        touchZoom: mode !== 'swipe',
        doubleClickZoom: mode !== 'swipe',
        keyboard: false
      });
      map.attributionControl.setPrefix(false);
      mapSecondary.current = map;
      map.on('moveend zoomend', () => {
        if (mapPrimary.current && !syncing.current) {
          syncing.current = true;
          mapPrimary.current.setView(map.getCenter(), map.getZoom(), { animate: false });
          syncing.current = false;
        }
      });
    }

    return () => {
      markerPrimary.current = null;
      mapPrimary.current?.remove();
      mapSecondary.current?.remove();
      mapPrimary.current = null;
      mapSecondary.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, mode]);

  /* ---------------------- study target reticle marker ---------------------- */
  useEffect(() => {
    const map = mapPrimary.current;
    if (!map) return;
    if (!markerPrimary.current) {
      markerPrimary.current = L.circleMarker([area.latitude, area.longitude], {
        radius: 6,
        color: '#5ed3f2',
        weight: 2,
        fillColor: '#050b16',
        fillOpacity: 0.65,
        interactive: false
      }).addTo(map);
    } else {
      markerPrimary.current.setLatLng([area.latitude, area.longitude]);
    }
  }, [area.latitude, area.longitude, mode]);

  /* ------------------------- tile layers per mode/date ---------------------- */
  useEffect(() => {
    const errors = { count: 0 };
    let inFlight = 0;

    const apply = (map: L.Map | null, when?: string | null, trackLoading = false) => {
      if (!map) return;
      map.eachLayer((existing) => {
        if (existing instanceof L.TileLayer) map.removeLayer(existing);
      });
      if (blocked || !when) return;
      const tileLayer = buildTileLayer(layer, when, opacity, service, format, attribution, reducedMotion, tileTemplateOverride);
      if (trackLoading) {
        tileLayer.on('tileloadstart', () => {
          inFlight += 1;
          setTilesPending(inFlight);
        });
        tileLayer.on('tileload', () => {
          inFlight = Math.max(0, inFlight - 1);
          setTilesPending(inFlight);
        });
        tileLayer.on('load', () => {
          inFlight = 0;
          setTilesPending(0);
        });
      }
      tileLayer.on('tileerror', () => {
        errors.count += 1;
        setTileErrors(errors.count);
        if (trackLoading) {
          inFlight = Math.max(0, inFlight - 1);
          setTilesPending(inFlight);
        }
      });
      tileLayer.addTo(map);
    };

    setTileErrors(0);
    setTilesPending(0);
    apply(mapPrimary.current, navDate || undefined, true);
    apply(mapSecondary.current, mode === 'single' ? null : compareDate || navDate || undefined, false);
  }, [layer, navDate, compareDate, mode, opacity, service, format, attribution, reducedMotion, tileTemplateOverride, blocked]);

  /* --------------------------- area / bounds changes ----------------------- */
  useEffect(() => {
    const maps = [mapPrimary.current, mapSecondary.current].filter(Boolean) as L.Map[];
    if (!maps.length) return;
    const bounds = area.bounds;
    if (bounds && bounds.length === 4) {
      const [south, west, north, east] = bounds;
      maps.forEach((map) => {
        try {
          map.fitBounds(L.latLngBounds([south, west], [north, east]), { animate: !reducedMotion, padding: [10, 10] });
        } catch {
          map.setView([area.latitude, area.longitude], 6, { animate: false });
        }
      });
    } else {
      maps.forEach((map) => map.setView([area.latitude, area.longitude], 7, { animate: !reducedMotion }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area.latitude, area.longitude, area.bounds?.[0], area.bounds?.[1], area.bounds?.[2], area.bounds?.[3], reducedMotion]);

  /* --------------------------- divider interaction ------------------------- */
  const dragging = useRef(false);

  const setDividerFromClientX = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const ratio = ((clientX - rect.left) / rect.width) * 100;
    setDivider(Math.min(100, Math.max(0, ratio)));
  }, []);

  useEffect(() => {
    if (mode !== 'swipe') return undefined;
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      setDividerFromClientX(event.clientX);
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [mode, setDividerFromClientX]);

  const zoom = (direction: 1 | -1) => {
    const map = mapPrimary.current;
    if (!map) return;
    if (direction === 1) map.zoomIn(1, { animate: !reducedMotion });
    else map.zoomOut(1, { animate: !reducedMotion });
  };

  const reset = () => {
    const map = mapPrimary.current;
    if (!map) return;
    const bounds = area.bounds;
    if (bounds) {
      map.fitBounds(L.latLngBounds([bounds[0], bounds[1]], [bounds[2], bounds[3]]), { animate: !reducedMotion });
    } else {
      map.setView([area.latitude, area.longitude], 7, { animate: !reducedMotion });
    }
  };

  const onMapKeyDown = (event: React.KeyboardEvent) => {
    const map = mapPrimary.current;
    if (!map) return;
    switch (event.key) {
      case 'ArrowUp':
        map.panBy([0, -60], { animate: !reducedMotion });
        break;
      case 'ArrowDown':
        map.panBy([0, 60], { animate: !reducedMotion });
        break;
      case 'ArrowLeft':
        map.panBy([-60, 0], { animate: !reducedMotion });
        break;
      case 'ArrowRight':
        map.panBy([60, 0], { animate: !reducedMotion });
        break;
      case '+':
      case '=':
        zoom(1);
        break;
      case '-':
        zoom(-1);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const canStepForward = Boolean(navDate && navDate < todayIso);

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className={`relative h-[340px] w-full overflow-hidden rounded-[14px] border border-line bg-void sm:h-[440px] lg:h-[540px] ${
          pickMode ? 'cursor-crosshair ring-1 ring-atmo/50' : ''
        }`}
      >
        {/* Secondary (comparison) map */}
        <div
          ref={secondaryRef}
          className={`absolute inset-0 z-0 ${mode === 'single' ? 'hidden' : 'block'} ${
            mode === 'side' ? 'left-1/2 w-1/2 border-l border-atmo/35' : ''
          }`}
          aria-hidden={mode === 'single'}
          style={mode === 'swipe' ? { clipPath: `inset(0 0 0 ${divider}%)` } : undefined}
        />

        {/* Primary map */}
        <div
          ref={primaryRef}
          role="application"
          tabIndex={0}
          aria-label={`${labels.primary}. ${layer.title}, ${date || 'unavailable'}`}
          onKeyDown={onMapKeyDown}
          className={`absolute inset-0 z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-atmo ${
            mode === 'swipe' ? 'pointer-events-none' : ''
          } ${mode === 'side' ? 'w-1/2' : ''}`}
          style={mode === 'swipe' ? { clipPath: `inset(0 ${100 - divider}% 0 0)` } : undefined}
        />

        {/* Top date & cadence navigation HUD */}
        <div className="absolute top-2.5 left-1/2 z-20 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 px-2">
          <button
            type="button"
            onClick={() => goToDay(-stepDays)}
            disabled={!navDate}
            aria-label={`Previous ${stepDays} day(s)`}
            className="earth-map-hud-btn p-1.5 disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="earth-map-hud-pill flex items-center gap-1.5 px-3 py-1 font-mono text-[10.5px] text-ink">
            {tilesPending > 0 ? <Loader2 className="h-3 w-3 animate-spin text-atmo" aria-hidden="true" /> : null}
            <span>{mode === 'swipe' ? `${navDate || date} ↔ ${compareDate || date}` : navDate || date}</span>
            {stepDays > 1 ? <span className="text-ink-4">· {stepDays}d</span> : null}
          </span>
          <button
            type="button"
            onClick={() => goToDay(stepDays)}
            disabled={!navDate || !canStepForward}
            aria-label={`Next ${stepDays} day(s)`}
            className="earth-map-hud-btn p-1.5 disabled:opacity-40"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          {mode === 'side' && compareDate ? (
            <span className="earth-map-hud-pill border-caution/40 px-2.5 py-1 font-mono text-[10.5px] text-caution">
              {labels.comparison} · {compareDate}
            </span>
          ) : null}
        </div>

        {/* Epoch shortcuts for multi-epoch annual layers such as Black Marble */}
        {legend.epochs && legend.epochs.length > 0 ? (
          <div className="absolute top-12 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5">
            {legend.epochs.map((epoch) => (
              <button
                key={epoch}
                type="button"
                onClick={() => {
                  setNavDate(epoch);
                  onDateChange?.(epoch);
                }}
                className={`earth-map-hud-pill px-2.5 py-0.5 font-mono text-[10px] transition ${
                  navDate === epoch ? 'border-atmo/60 text-atmo-soft' : 'text-ink-3 hover:text-ink'
                }`}
              >
                Epoch {epoch.slice(0, 4)}
              </button>
            ))}
          </div>
        ) : null}

        {/* Swipe divider */}
        {mode === 'swipe' ? (
          <div
            className="absolute inset-y-0 z-30 w-px -translate-x-1/2 bg-cyan-400/85 shadow-[0_0_14px_rgba(94,211,242,0.7)]"
            style={{ left: `${divider}%` }}
          >
            <div
              role="slider"
              tabIndex={0}
              aria-label={labels.swipeHint}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(divider)}
              onPointerDown={() => {
                dragging.current = true;
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') setDivider((value) => Math.max(0, value - 4));
                else if (event.key === 'ArrowRight') setDivider((value) => Math.min(100, value + 4));
                else if (event.key === 'Home') setDivider(0);
                else if (event.key === 'End') setDivider(100);
                else return;
                event.preventDefault();
              }}
              className="earth-map-hud-pill absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center border-atmo/60 text-atmo-soft"
            >
              <Move className="h-4 w-4" />
            </div>
          </div>
        ) : null}

        {/* Blocked / outside-domain banner */}
        {blocked ? (
          <div
            role="status"
            className="earth-glass-inset absolute inset-x-3 bottom-10 z-40 border-caution/40 bg-abyss/95 p-3 text-xs leading-relaxed text-caution sm:inset-x-8"
          >
            {blocked.reason}
          </div>
        ) : null}

        {/* Bottom-left telemetry coordinate readout */}
        <div className="earth-map-hud-pill absolute left-2.5 bottom-7 z-20 flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] text-ink-2">
          <Crosshair className="h-3 w-3 text-atmo" aria-hidden="true" />
          <span>
            {centerReadout.lat.toFixed(3)}°, {centerReadout.lng.toFixed(3)}° · z{centerReadout.zoom}
          </span>
        </div>

        {/* Accessible zoom & reset controls */}
        <div className="absolute right-2.5 bottom-7 z-20 flex flex-col gap-1.5">
          <button type="button" onClick={() => zoom(1)} aria-label={labels.zoomIn} className="earth-map-hud-btn p-1.5">
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => zoom(-1)} aria-label={labels.zoomOut} className="earth-map-hud-btn p-1.5">
            <Minus className="h-4 w-4" />
          </button>
          <button type="button" onClick={reset} aria-label={labels.reset} className="earth-map-hud-btn p-1.5">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Calibrated scientific layer legend */}
      <div className="earth-glass-inset p-3.5" aria-label={labels.legendTitle || 'Layer legend'}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink">
            <Palette className="h-3.5 w-3.5 text-atmo" aria-hidden="true" />
            <span>{legend.title}</span>
          </p>
          <span className="font-mono text-[10px] text-ink-3">{legend.unitLabel}</span>
        </div>

        {legend.kind === 'continuous' && legend.gradient ? (
          <div className="mt-2.5 space-y-1.5">
            <div className="earth-legend-ramp" style={{ background: legend.gradient }} aria-hidden="true" />
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-ink-3">
              {legend.stops.map((stop) => (
                <span key={stop.label}>{stop.label}</span>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            {legend.stops.map((stop) => (
              <span key={stop.label} className="inline-flex items-center gap-1.5 text-[11px] text-ink-2">
                <span
                  className="h-2.5 w-2.5 rounded-full border border-white/25"
                  style={{ backgroundColor: stop.color }}
                  aria-hidden="true"
                />
                {stop.label}
              </span>
            ))}
          </div>
        )}

        <p className="mt-2 text-[10.5px] leading-relaxed text-ink-4">{legend.note}</p>
      </div>

      {mode === 'swipe' ? <p className="text-[11px] text-ink-4">{labels.swipeHint}</p> : null}
      {tileErrors > 4 ? (
        <p className="text-[11px] text-caution">
          {tileErrors} tile requests failed for this layer/date. GIBS may have no imagery for the requested day in this
          area, or the layer may not be renderable in this projection.
        </p>
      ) : null}
    </div>
  );
}
