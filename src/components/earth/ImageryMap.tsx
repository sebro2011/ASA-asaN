/**
 * Leaflet imagery map for the Earth Intelligence Lab.
 *
 * This module is intentionally lazy-loaded by the Lab (React.lazy), so Leaflet
 * and the map logic live in their own chunk and never block the rest of the site.
 *
 * View modes
 *  - `single`  : one map, one observation date
 *  - `side`    : two synced maps, primary date | comparison date
 *  - `swipe`   : two synced maps stacked, comparison date revealed by a divider
 *
 * Every tile URL is built from the verified GIBS catalog entry, so the
 * projection, matrix set and format are explicit and auditable.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Minus, Move, Plus, RotateCcw } from 'lucide-react';
import { imagerySource } from '../../lib/earth/gibsClient';
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
  onViewChange?: (info: { bounds: [number, number, number, number]; center: [number, number]; zoom: number }) => void;
  labels: {
    zoomIn: string;
    zoomOut: string;
    reset: string;
    swipeHint: string;
    primary: string;
    comparison: string;
    attribution: string;
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
): L.Layer {
  const native = nativeZoomOf(layer);
  const common: L.TileLayerOptions = {
    opacity,
    attribution,
    maxZoom: native + 3,
    maxNativeZoom: native,
    minZoom: 1,
    crossOrigin: false,
    // Reduced motion: skip Leaflet's zoom/fade animations entirely.
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
  onViewChange,
  labels
}: ImageryMapProps) {
  const primaryRef = useRef<HTMLDivElement | null>(null);
  const secondaryRef = useRef<HTMLDivElement | null>(null);
  const mapPrimary = useRef<L.Map | null>(null);
  const mapSecondary = useRef<L.Map | null>(null);
  const syncing = useRef(false);
  const [divider, setDivider] = useState(50);
  const [tileErrors, setTileErrors] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const service: 'wmts' | 'wms' = verifiedService || layer.service;
  const format: 'jpg' | 'png' = verifiedFormat || layer.format;

  const attribution = useMemo(() => `${labels.attribution} · ${layer.id}`, [labels.attribution, layer.id]);

  const reportView = useCallback(
    (map: L.Map) => {
      if (!onViewChange) return;
      const bounds = map.getBounds();
      const center = map.getCenter();
      onViewChange({
        bounds: [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()],
        center: [center.lat, center.lng],
        zoom: map.getZoom()
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
        zoom: area.bounds ? 6 : 6
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
      reportView(map);
    }

    if (secondaryRef.current && !mapSecondary.current) {
      const map = L.map(secondaryRef.current, {
        ...options,
        center: [area.latitude, area.longitude],
        zoom: 6,
        // The overlay map in swipe mode must never steal pointer events.
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
      mapPrimary.current?.remove();
      mapSecondary.current?.remove();
      mapPrimary.current = null;
      mapSecondary.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, mode]);

  /* ------------------------- tile layers per mode/date ---------------------- */
  useEffect(() => {
    const errors = { count: 0 };
    const apply = (map: L.Map | null, when?: string | null) => {
      if (!map) return;
      if (blocked) return;
      map.eachLayer((existing) => {
        if (existing instanceof L.TileLayer) map.removeLayer(existing);
      });
      if (!when) return;
      const tileLayer = buildTileLayer(layer, when, opacity, service, format, attribution, reducedMotion, tileTemplateOverride);
      tileLayer.on('tileerror', () => {
        errors.count += 1;
        setTileErrors(errors.count);
      });
      tileLayer.addTo(map);
    };

    apply(mapPrimary.current, date);
    apply(mapSecondary.current, mode === 'single' ? null : compareDate || date);
    setTileErrors(0);
    return () => {
      /* layers are removed on the next run / unmount */
    };
  }, [layer, date, compareDate, mode, opacity, service, format, attribution, reducedMotion, tileTemplateOverride, blocked]);

  /* --------------------------- area / bounds changes ----------------------- */
  useEffect(() => {
    const maps = [mapPrimary.current, mapSecondary.current].filter(Boolean) as L.Map[];
    if (!maps.length) return;
    const bounds = area.bounds;
    if (bounds && bounds.length === 4) {
      const [south, west, north, east] = bounds;
      maps.forEach((map) => {
        try {
          map.fitBounds(
            L.latLngBounds([south, west], [north, east]),
            { animate: !reducedMotion, padding: [8, 8] }
          );
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
    const step = 0.5;
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

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="relative h-[320px] w-full overflow-hidden rounded-[10px] border border-line sm:h-[420px] lg:h-[520px]">
        {/* Secondary (comparison) map sits underneath in swipe mode. */}
        <div
          ref={secondaryRef}
          className={`absolute inset-0 z-0 ${mode === 'single' ? 'hidden' : 'block'} ${
            mode === 'side' ? 'left-1/2 w-1/2 border-l border-atmo/35' : ''
          }`}
          aria-hidden={mode === 'single'}
          style={mode === 'swipe' ? { clipPath: `inset(0 0 0 ${divider}%)` } : undefined}
        />

        {/* Primary map (observation date in view). */}
        <div
          ref={primaryRef}
          role="application"
          tabIndex={0}
          aria-label={`${labels.primary}. ${layer.title}, ${date}`}
          onKeyDown={onMapKeyDown}
          className={`absolute inset-0 z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-atmo ${
            mode === 'swipe' ? 'pointer-events-none' : ''
          } ${mode === 'side' ? 'w-1/2' : ''}`}
          style={mode === 'swipe' ? { clipPath: `inset(0 ${100 - divider}% 0 0)` } : undefined}
        />

        {mode === 'side' ? (
          <div className="pointer-events-none absolute top-2 left-2 z-20 rounded-full border border-atmo/35 bg-abyss/70 px-2 py-0.5 font-mono text-[10px] text-atmo-soft">
            {labels.primary} · {date}
          </div>
        ) : null}
        {mode === 'side' && compareDate ? (
          <div className="pointer-events-none absolute top-2 right-2 z-20 rounded-full border border-caution/35 bg-abyss/70 px-2 py-0.5 font-mono text-[10px] text-caution">
            {labels.comparison} · {compareDate}
          </div>
        ) : null}

        {/* Swipe divider — a keyboard-operable slider. */}
        {mode === 'swipe' ? (
          <div
            className="absolute inset-y-0 z-30 w-px -translate-x-1/2 bg-cyan-400/80 shadow-[0_0_12px_rgba(34,211,238,0.6)]"
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
              className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-atmo/60 bg-abyss/70/90 text-atmo-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            >
              <Move className="h-4 w-4" />
            </div>
          </div>
        ) : null}

      {blocked ? (
        <div
          role="status"
          className="absolute inset-x-3 bottom-6 z-40 rounded-[10px] border border-caution/35 bg-abyss/70/95 p-3 text-xs leading-relaxed text-caution sm:inset-x-8"
        >
          {blocked.reason}
        </div>
      ) : null}

        {/* Accessible map controls (Leaflet's default controls stay disabled). */}
        <div className="absolute right-2 bottom-8 z-20 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => zoom(1)}
            aria-label={labels.zoomIn}
            className="rounded-md border border-line bg-abyss/70/85 p-1.5 text-ink-2 hover:border-cyan-500/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-atmo"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => zoom(-1)}
            aria-label={labels.zoomOut}
            className="rounded-md border border-line bg-abyss/70/85 p-1.5 text-ink-2 hover:border-cyan-500/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-atmo"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={reset}
            aria-label={labels.reset}
            className="rounded-md border border-line bg-abyss/70/85 p-1.5 text-ink-2 hover:border-cyan-500/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-atmo"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
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
