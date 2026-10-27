/**
 * AI-Enhanced Earth Viewer — standalone NASA GIBS imagery workstation.
 *
 * Isolated from the NASA POWER climate pipeline by design: this component only
 * touches GIBS imagery, its own canvas enhancement pipeline and its own state
 * machine. POWER request/parsing/caching/chart code is never imported here.
 *
 * Data flow
 *  1. A single WMS GetMap frame is requested for a verified catalog layer
 *     (`lib/earth/gibsCatalog`) over a chosen bounding box and date.
 *  2. The frame is drawn to a canvas and the original ImageData is retained in
 *     a ref — enhancement always works on a copy, so recovery is lossless.
 *  3. `enhanceFrame` runs conservative, cancellable browser pixel adjustments.
 *  4. AI super-resolution sits behind `aiUpscale.ts`; when no model is bundled
 *     the UI labels the result honestly as browser-enhanced, never "AI".
 *
 * All text comes from i18next keys (EN/SI/TA); no hard-coded user-facing copy.
 */

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  Layers,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  WifiOff,
  AlertTriangle,
  RotateCcw,
  Info
} from 'lucide-react';
import {
  DEFAULT_LAYER_ID,
  GIBS_ATTRIBUTION,
  GIBS_LAYERS,
  getGibsLayer,
  layersByCategory
} from '../../lib/earth/gibsCatalog';
import { fetchLayerDomain } from '../../lib/earth/gibsClient';
import { latestReportedDate, toIsoDate, addDays } from '../../lib/earth/domains';
import type { GibsDomain, GibsLayerMeta } from '../../lib/earth/types';
import {
  DEFAULT_SETTINGS,
  ENHANCEMENT_LIMITS,
  EnhancementAbortedError,
  clampSettings,
  describeSettings,
  enhanceFrame,
  isAbortError,
  type EnhancementSettings,
  type PixelFrame
} from '../../lib/earth/enhance';
import { getAiUpscaleBackend } from '../../lib/earth/aiUpscale';
import {
  buildFrameRequest,
  initialViewerState,
  validateObservationDate,
  viewerReducer,
  VIEWER_AREAS
} from '../../lib/earth/viewerState';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { DefinitionRow, InfoNote, Panel, Pill } from './EarthPanel';
import type { SupportedLanguage } from '../../i18n/translations';

const FRAME_SIZE = 768; // longest-edge budget; clamped again inside buildFrameRequest.

const CATEGORY_KEYS: Record<string, string> = {
  'true-color': 'earthCategoryTrueColor',
  vegetation: 'earthCategoryVegetation',
  land: 'earthCategoryLand',
  ocean: 'earthCategoryOcean',
  atmosphere: 'earthCategoryAtmosphere',
  fire: 'earthCategoryFire',
  night: 'earthCategoryNight'
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function loadGIBSImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous'; // required for canvas readback; GIBS sends CORS headers
    image.referrerPolicy = 'no-referrer';
    const onAbort = () => {
      image.src = '';
      reject(new DOMException('Image load aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    image.onload = () => {
      signal.removeEventListener('abort', onAbort);
      resolve(image);
    };
    image.onerror = () => {
      signal.removeEventListener('abort', onAbort);
      reject(new Error('GIBS returned no renderable image for this request.'));
    };
    image.src = url;
  });
}

export interface AiEarthViewerProps {
  lang: SupportedLanguage;
}

const AiEarthViewer: React.FC<AiEarthViewerProps> = ({ lang }) => {
  const { t } = useTranslation();
  const isOnline = useOnlineStatus();
  const reducedMotion = usePrefersReducedMotion();

  const [layerId, setLayerId] = useState<string>(DEFAULT_LAYER_ID);
  const [areaId, setAreaId] = useState<string>(VIEWER_AREAS[0].id);
  const [domain, setDomain] = useState<GibsDomain | null>(null);
  const [date, setDate] = useState<string>(() => addDays(toIsoDate(new Date()), -3));
  const [settings, setSettings] = useState<EnhancementSettings>(DEFAULT_SETTINGS);
  const [frameInfo, setFrameInfo] = useState<{ width: number; height: number; url: string } | null>(null);
  // Retry token: bumped by the Retry button so the load effect re-runs. Kept
  // separate from state.requestId, which the reducer bumps on every fetch.
  const [reloadToken, setReloadToken] = useState(0);

  const [state, dispatch] = useReducer(viewerReducer, initialViewerState);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalFrameRef = useRef<PixelFrame | null>(null);
  const imageAbortRef = useRef<AbortController | null>(null);
  const enhanceAbortRef = useRef<AbortController | null>(null);

  const layer: GibsLayerMeta = useMemo(() => getGibsLayer(layerId) || GIBS_LAYERS[0], [layerId]);
  const area = useMemo(() => VIEWER_AREAS.find((item) => item.id === areaId) || VIEWER_AREAS[0], [areaId]);
  const groupedLayers = useMemo(() => layersByCategory(), []);
  const aiBackend = useMemo(() => getAiUpscaleBackend(), []);

  /* ----- Layer domain (observation-date availability), cached by the client. */
  useEffect(() => {
    let cancelled = false;
    fetchLayerDomain(layer)
      .then((result) => {
        if (!cancelled) setDomain(result.domain);
      })
      .catch(() => {
        if (!cancelled) setDomain(null); // live image request remains the fallback authority
      });
    return () => {
      cancelled = true;
    };
  }, [layer]);

  /* Keep the selected date inside the reported domain when layers change. */
  useEffect(() => {
    if (!domain) return;
    const latest = latestReportedDate(domain);
    if (latest && (date > latest || !date)) setDate(latest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain?.layerId]);

  /* -------------------------------- Frame loading (cancellable, isolated). */
  useEffect(() => {
    const controller = new AbortController();
    imageAbortRef.current?.abort();
    imageAbortRef.current = controller;
    enhanceAbortRef.current?.abort();

    if (!isOnline) {
      dispatch({ type: 'mark_offline' });
      return () => controller.abort();
    }

    const today = toIsoDate(new Date());
    const validation = validateObservationDate(date, domain, today);
    if (!validation.ok) {
      dispatch({
        type: 'mark_unavailable',
        availability: {
          layerId: layer.id,
          requestedDate: date,
          verdict: validation.reason === 'outside-domain' ? 'outside-domain' : 'unknown',
          nearestDate: validation.nearestDate,
          matches: [],
          domain,
          detail: validation.detail
        }
      });
      return () => controller.abort();
    }

    const request = buildFrameRequest(layer, validation.date, area, FRAME_SIZE);
    dispatch({ type: 'fetch_start' });

    loadGIBSImage(request.url, controller.signal)
      .then((image) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', { willReadFrequently: true });
        if (!canvas || !ctx) {
          dispatch({ type: 'fetch_error', message: t('earthAiErrorCanvas') });
          return;
        }
        canvas.width = request.width;
        canvas.height = request.height;
        ctx.clearRect(0, 0, request.width, request.height);
        ctx.drawImage(image, 0, 0, request.width, request.height);

        let frame: PixelFrame;
        try {
          const imageData = ctx.getImageData(0, 0, request.width, request.height);
          frame = { width: request.width, height: request.height, data: imageData.data };
        } catch (error) {
          // Tainted canvas (CORS blocked) — fail honestly, never fake pixels.
          dispatch({
            type: 'fetch_error',
            message: (error as Error)?.name === 'SecurityError' ? t('earthAiErrorCors') : t('earthAiErrorGeneric')
          });
          return;
        }

        originalFrameRef.current = frame;
        setFrameInfo({ width: request.width, height: request.height, url: request.url });
        dispatch({
          type: 'fetch_success',
          loadedAt: new Date().toISOString(),
          availability: null
        });
      })
      .catch((error: Error) => {
        if (error.name === 'AbortError') return;
        dispatch({ type: 'fetch_error', message: error.message || t('earthAiErrorGeneric') });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId, areaId, date, isOnline, domain, reloadToken]);

  /* Cancel every in-flight job on unmount. */
  useEffect(() => {
    return () => {
      imageAbortRef.current?.abort();
      enhanceAbortRef.current?.abort();
    };
  }, []);

  const drawFrame = useCallback((frame: PixelFrame) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;
    canvas.width = frame.width;
    canvas.height = frame.height;
    // Pixel frames always own a plain ArrayBuffer (getImageData / allocations);
    // the cast satisfies TS 7's generic Uint8ClampedArray<ArrayBuffer> lib type.
    ctx.putImageData(
      new ImageData(frame.data as Uint8ClampedArray<ArrayBuffer>, frame.width, frame.height),
      0,
      0
    );
  }, []);

  /* --------------------------------------------- Browser enhancement stage. */
  const handleEnhance = useCallback(async () => {
    const source = originalFrameRef.current;
    if (!source) return;
    const controller = new AbortController();
    enhanceAbortRef.current?.abort();
    enhanceAbortRef.current = controller;
    dispatch({ type: 'enhance_start' });

    try {
      const output = await enhanceFrame(source, settings, {
        signal: controller.signal,
        onProgress: (progress) => dispatch({ type: 'enhance_progress', fraction: progress.fraction })
      });
      drawFrame(output);
      dispatch({ type: 'enhance_success' });
    } catch (error) {
      if (isAbortError(error) || (error as Error)?.name === 'AbortError' || error instanceof EnhancementAbortedError) {
        return; // superseded by a newer request — leave the current frame alone
      }
      dispatch({ type: 'enhance_error', message: (error as Error).message || t('earthAiErrorGeneric') });
    }
  }, [settings, drawFrame, t]);

  const handleReset = useCallback(() => {
    enhanceAbortRef.current?.abort();
    const original = originalFrameRef.current;
    if (original) drawFrame(original);
    dispatch({ type: 'reset_original' });
  }, [drawFrame]);

  const handleRetry = useCallback(() => {
    // Re-trigger the load effect for the current layer/area/date.
    setReloadToken((current) => current + 1);
    dispatch({ type: 'retry' });
  }, []);

  const jumpToNearest = useCallback(() => {
    const nearest = state.availability?.nearestDate || latestReportedDate(domain);
    if (nearest) setDate(nearest);
  }, [state.availability, domain]);

  const updateSetting = (key: keyof EnhancementSettings, value: number) => {
    setSettings((current) => clampSettings({ ...current, [key]: value }));
  };

  const isBusy = state.status === 'loading' || state.status === 'enhancing';
  const percent = state.progress !== null ? Math.round(state.progress * 100) : null;

  const sliderConfig: Array<{ key: keyof EnhancementSettings; labelKey: string; step: number }> = [
    { key: 'brightness', labelKey: 'earthAiSliderBrightness', step: 1 },
    { key: 'contrast', labelKey: 'earthAiSliderContrast', step: 0.01 },
    { key: 'saturation', labelKey: 'earthAiSliderSaturation', step: 0.01 },
    { key: 'sharpen', labelKey: 'earthAiSliderSharpen', step: 0.02 }
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <Panel className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-2">
              <Wand2 className="h-3.5 w-3.5 text-atmo" strokeWidth={1.8} />
              {t('earthAiEyebrow')}
            </p>
            <h3 className="mt-2 text-[18px] font-semibold tracking-[-0.02em] text-ink sm:text-[20px]">
              {t('earthAiHeading')}
            </h3>
            <p className="prose-measure mt-2 max-w-2xl text-[12px] leading-relaxed text-ink-2">
              {t('earthAiIntro')}
            </p>
          </div>
          <Pill tone={aiBackend.isAvailable() ? 'violet' : 'slate'}>
            <Sparkles className="h-3 w-3" />
            {aiBackend.isAvailable() ? t('earthAiPillAiReady') : t('earthAiPillBrowser')}
          </Pill>
        </div>

        {/* Control row */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-ink-3">
              <Layers className="h-3.5 w-3.5 text-atmo" strokeWidth={1.8} />
              {t('earthAiLayerLabel')}
            </span>
            <select
              value={layerId}
              onChange={(event) => setLayerId(event.target.value)}
              className="w-full rounded-[10px] border border-line bg-abyss/80 px-3 py-2 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]"
            >
              {Object.entries(groupedLayers).map(([category, layers]) => (
                <optgroup key={category} label={t(CATEGORY_KEYS[category] || 'earthCategoryAll')}>
                  {layers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-ink-3">
              <MapPin className="h-3.5 w-3.5 text-atmo" strokeWidth={1.8} />
              {t('earthAiAreaLabel')}
            </span>
            <select
              value={areaId}
              onChange={(event) => setAreaId(event.target.value)}
              className="w-full rounded-[10px] border border-line bg-abyss/80 px-3 py-2 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]"
            >
              {VIEWER_AREAS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-ink-3">
              <CalendarDays className="h-3.5 w-3.5 text-atmo" strokeWidth={1.8} />
              {t('earthAiDateLabel')}
            </span>
            <input
              type="date"
              value={date}
              min={domain?.minDate || '2000-01-01'}
              max={latestReportedDate(domain) || toIsoDate(new Date())}
              onChange={(event) => event.target.value && setDate(event.target.value)}
              className="w-full rounded-[10px] border border-line bg-abyss/80 px-3 py-2 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]"
            />
          </label>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] sm:gap-5">
        {/* Viewport — enhanced output only; original pixels stay in memory. */}
        <Panel className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
              {t('earthAiViewportLabel')}
            </span>
            <span
              aria-live="polite"
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                state.processing === 'browser'
                  ? 'border-violet-400/40 bg-violet-500/10 text-violet-200'
                  : 'border-line bg-surface/60 text-ink-3'
              }`}
            >
              {state.processing === 'browser' ? t('earthAiLabelBrowser') : t('earthAiLabelOriginal')}
            </span>
          </div>

          <div className="relative overflow-hidden rounded-[14px] border border-line bg-[#020617]">
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`${layer.title} — ${date}`}
              className="block aspect-square w-full object-contain"
            />

            {state.status === 'loading' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-void/70 p-6 text-center" role="status">
                <span
                  className={`h-9 w-9 rounded-full border-2 border-atmo/25 border-t-atmo ${reducedMotion ? '' : 'animate-spin'}`}
                />
                <p className="text-[12px] font-mono text-ink-2">{t('earthAiStatusLoading')}</p>
              </div>
            ) : null}

            {state.status === 'enhancing' ? (
              <div className="absolute inset-x-0 bottom-0 space-y-2 bg-void/85 p-4" role="status" aria-live="polite">
                <p className="text-[11.5px] font-mono text-cyan-200">
                  {t('earthAiStatusEnhancing')} {percent !== null ? `· ${percent}%` : ''}
                </p>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
                  role="progressbar"
                  aria-valuenow={percent ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-[width] duration-150"
                    style={{ width: `${percent ?? 0}%` }}
                  />
                </div>
              </div>
            ) : null}

            {state.status === 'error' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-void/85 p-6 text-center">
                <AlertTriangle className="h-8 w-8 text-critical" strokeWidth={1.7} />
                <p className="max-w-sm text-[12px] text-ink-2">{state.errorMessage || t('earthAiErrorGeneric')}</p>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-cyan-600 px-3.5 py-2 text-[12px] font-semibold text-white transition hover:bg-cyan-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t('earthAiRetry')}
                </button>
              </div>
            ) : null}

            {state.status === 'offline' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-void/85 p-6 text-center">
                <WifiOff className="h-8 w-8 text-caution" strokeWidth={1.7} />
                <p className="text-[12px] text-ink-2">{t('earthAiStatusOffline')}</p>
              </div>
            ) : null}

            {state.status === 'unavailable' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-void/85 p-6 text-center">
                <Info className="h-8 w-8 text-caution" strokeWidth={1.7} />
                <p className="max-w-sm text-[12px] text-ink-2">{t('earthAiStatusUnavailable')}</p>
                {state.availability?.nearestDate ? (
                  <button
                    type="button"
                    onClick={jumpToNearest}
                    className="inline-flex items-center gap-1.5 rounded-[10px] border border-caution/50 bg-caution/10 px-3.5 py-2 text-[12px] font-semibold text-caution transition hover:bg-caution/20 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]"
                  >
                    {t('earthAiJumpToNearest', { date: state.availability.nearestDate })}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Enhancement controls */}
          <div className="space-y-3 rounded-[12px] border border-line/70 bg-surface/40 p-4">
            <p className="flex items-center gap-2 text-[11.5px] font-semibold text-ink">
              <SlidersHorizontal className="h-3.5 w-3.5 text-atmo" strokeWidth={1.8} />
              {t('earthAiAdjustTitle')}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {sliderConfig.map(({ key, labelKey, step }) => {
                const limit = ENHANCEMENT_LIMITS[key];
                return (
                  <label key={key} className="block">
                    <span className="mb-1 flex items-center justify-between text-[11px] text-ink-3">
                      <span>{t(labelKey)}</span>
                      <span className="font-mono text-ink-4">
                        {key === 'brightness' || key === 'sharpen'
                          ? Math.round(settings[key] * (key === 'sharpen' ? 100 : 1))
                          : settings[key].toFixed(2)}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={limit.min}
                      max={limit.max}
                      step={step}
                      value={settings[key]}
                      onChange={(event) => updateSetting(key, Number(event.target.value))}
                      aria-label={t(labelKey)}
                      className="w-full"
                    />
                  </label>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleEnhance}
                disabled={isBusy || state.status === 'unavailable' || state.status === 'offline'}
                className="inline-flex items-center gap-2 rounded-[10px] bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-[12.5px] font-semibold text-white shadow-lg shadow-cyan-950/40 transition hover:from-cyan-500 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]"
              >
                <Wand2 className="h-3.5 w-3.5" />
                {t('earthAiEnhanceAction')}
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={isBusy || state.processing === 'original'}
                className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface/60 px-4 py-2 text-[12.5px] font-medium text-ink-2 transition hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('earthAiResetAction')}
              </button>
            </div>
          </div>
        </Panel>

        {/* Metadata / provenance / integrity panel */}
        <Panel className="h-fit space-y-3">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-4">
            {t('earthAiDetailsTitle')}
          </p>
          <dl className="space-y-2 text-[11.5px]">
            <DefinitionRow label={t('earthAiMetaLayer')}>
              <span className="font-mono text-atmo/90">{layer.id}</span>
            </DefinitionRow>
            <DefinitionRow label={t('earthAiMetaPlatform')}>
              {layer.platform} · {layer.instrument}
            </DefinitionRow>
            <DefinitionRow label={t('earthAiMetaDate')}>{date}</DefinitionRow>
            <DefinitionRow label={t('earthAiMetaResolution')}>{layer.resolution}</DefinitionRow>
            <DefinitionRow label={t('earthAiMetaDimensions')}>
              {frameInfo ? `${frameInfo.width} × ${frameInfo.height} px` : '—'}
            </DefinitionRow>
            <DefinitionRow label={t('earthAiMetaMethod')}>
              {state.processing === 'browser' ? t('earthAiLabelBrowser') : t('earthAiLabelOriginal')}
            </DefinitionRow>
            <DefinitionRow label={t('earthAiMetaAdjustments')}>{describeSettings(settings)}</DefinitionRow>
            <DefinitionRow label={t('earthAiMetaSourceUrl')}>
              <span className="break-all font-mono text-[10px] text-ink-4">{frameInfo?.url || '—'}</span>
            </DefinitionRow>
          </dl>

          <div className="space-y-2 border-t border-line/70 pt-3">
            <InfoNote tone="cyan">
              <span className="font-medium">{t('earthAiIntegrityTitle')}</span> {t('earthAiIntegrityBody')}
            </InfoNote>
            <InfoNote tone="slate">
              <span className="font-medium">{t('earthAiAiNoteTitle')}</span> {aiBackend.statusDetail}
            </InfoNote>
            <p className="text-[10.5px] leading-relaxed text-ink-4">{GIBS_ATTRIBUTION}</p>
          </div>
        </Panel>
      </div>
    </div>
  );
};

export default AiEarthViewer;
