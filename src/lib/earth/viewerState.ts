/**
 * Pure state machine and input validation for the AI-Enhanced Earth Viewer.
 *
 * Keeping this free of React/DOM makes every transition testable under
 * Node's built-in test runner and guarantees the component and the tests
 * share the exact same rules. Imagery fetching and canvas work live elsewhere
 * (`gibsClient`, `enhance.ts`); this module only decides *what state is valid*.
 */

import { checkAvailability, isIsoDate, latestReportedDate } from './domains';
import { bbox3857FromLatLngBounds, wmsGetMapUrl } from './gibsClient';
import {
  clampFrameDimensions,
  clampSettings,
  DEFAULT_SETTINGS,
  type EnhancementSettings
} from './enhance';
import type { AvailabilityVerdict, GibsDomain, GibsLayerMeta } from './types';

export type ViewerStatus =
  | 'idle'
  | 'loading'
  | 'ready' // original frame displayed
  | 'enhancing'
  | 'enhanced'
  | 'unavailable' // date outside the layer's reported domain
  | 'offline'
  | 'error';

export type ProcessingLabel = 'original' | 'browser' | 'ai';

export interface ViewerState {
  status: ViewerStatus;
  /** Incremented on every (re)fetch so effects can detect new requests. */
  requestId: number;
  errorMessage?: string;
  /** 0..1 only while enhancing; null otherwise. */
  progress: number | null;
  processing: ProcessingLabel;
  availability: AvailabilityVerdict | null;
  lastLoadedAt: string | null;
}

export type ViewerAction =
  | { type: 'fetch_start' }
  | { type: 'fetch_success'; loadedAt: string; availability: AvailabilityVerdict | null }
  | { type: 'fetch_error'; message: string }
  | { type: 'mark_offline' }
  | { type: 'mark_unavailable'; availability: AvailabilityVerdict }
  | { type: 'enhance_start' }
  | { type: 'enhance_progress'; fraction: number }
  | { type: 'enhance_success' }
  | { type: 'enhance_error'; message: string }
  | { type: 'reset_original' }
  | { type: 'retry' };

export const initialViewerState: ViewerState = {
  status: 'idle',
  requestId: 0,
  progress: null,
  processing: 'original',
  availability: null,
  lastLoadedAt: null
};

export function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (action.type) {
    case 'fetch_start':
      return {
        ...state,
        status: 'loading',
        requestId: state.requestId + 1,
        errorMessage: undefined,
        progress: null,
        processing: 'original'
      };
    case 'fetch_success':
      return {
        ...state,
        status: 'ready',
        errorMessage: undefined,
        progress: null,
        processing: 'original',
        availability: action.availability,
        lastLoadedAt: action.loadedAt
      };
    case 'fetch_error':
      return { ...state, status: 'error', errorMessage: action.message, progress: null };
    case 'mark_offline':
      return { ...state, status: 'offline', progress: null };
    case 'mark_unavailable':
      return {
        ...state,
        status: 'unavailable',
        availability: action.availability,
        progress: null
      };
    case 'enhance_start':
      // Enhancement only makes sense once a frame is on screen.
      if (state.status !== 'ready' && state.status !== 'enhanced') return state;
      return { ...state, status: 'enhancing', progress: 0, errorMessage: undefined };
    case 'enhance_progress':
      if (state.status !== 'enhancing') return state;
      return { ...state, progress: Math.min(1, Math.max(0, action.fraction)) };
    case 'enhance_success':
      if (state.status !== 'enhancing') return state;
      return { ...state, status: 'enhanced', progress: null, processing: 'browser' };
    case 'enhance_error':
      return {
        ...state,
        status: 'ready', // original frame remains visible; enhancement is optional
        errorMessage: action.message,
        progress: null,
        processing: 'original'
      };
    case 'reset_original':
      return { ...state, status: 'ready', progress: null, processing: 'original' };
    case 'retry':
      return {
        ...initialViewerState,
        requestId: state.requestId + 1,
        status: 'loading'
      };
    default:
      return state;
  }
}

/* ------------------------------------------------------------------ */
/* Date validation                                                     */
/* ------------------------------------------------------------------ */

export type DateValidation =
  | { ok: true; date: string }
  | { ok: false; reason: 'invalid' | 'future' | 'outside-domain'; nearestDate: string | null; detail: string };

/**
 * Validate a user-selected observation date against the layer's published
 * domain when known. A missing domain yields `ok` and leaves final
 * availability to the live image request (the service substitutes nearby days).
 */
export function validateObservationDate(
  value: string,
  domain: GibsDomain | null,
  todayIso: string
): DateValidation {
  if (!isIsoDate(value)) {
    return {
      ok: false,
      reason: 'invalid',
      nearestDate: latestReportedDate(domain),
      detail: 'Enter a real calendar date in YYYY-MM-DD format.'
    };
  }
  if (value > todayIso) {
    return {
      ok: false,
      reason: 'future',
      nearestDate: latestReportedDate(domain) || todayIso,
      detail: 'Satellite imagery cannot be selected for a future date.'
    };
  }
  if (domain) {
    const verdict = checkAvailability(domain, domain.layerId, value);
    if (verdict.verdict === 'outside-domain') {
      return {
        ok: false,
        reason: 'outside-domain',
        nearestDate: verdict.nearestDate,
        detail: verdict.detail
      };
    }
  }
  return { ok: true, date: value };
}

/* ------------------------------------------------------------------ */
/* Frame request planning                                              */
/* ------------------------------------------------------------------ */

export interface ViewerArea {
  id: string;
  label: string;
  /** [south, west, north, east] in degrees. */
  bounds: [number, number, number, number];
}

export const VIEWER_AREAS: ViewerArea[] = [
  { id: 'sri-lanka', label: 'Sri Lanka (island-wide)', bounds: [5.9, 79.5, 9.9, 81.9] },
  { id: 'colombo', label: 'Colombo, Sri Lanka', bounds: [6.75, 79.75, 7.1, 80.05] },
  { id: 'bay-of-bengal', label: 'Bay of Bengal', bounds: [5.0, 80.0, 22.0, 95.0] },
  { id: 'amazon', label: 'Amazon Basin', bounds: [-5.5, -64.0, -1.0, -57.0] },
  { id: 'california', label: 'California, USA', bounds: [32.5, -124.5, 42.0, -114.0] }
];

export interface FrameRequest {
  url: string;
  width: number;
  height: number;
  bbox3857: [number, number, number, number];
  layerId: string;
  date: string;
}

/**
 * Build a single-frame WMS GetMap request for canvas processing. WMS works for
 * every catalog layer (including WMTS-only entries) and returns one image for
 * the bounding box instead of tile stitching. Sizes are capped for memory.
 */
export function buildFrameRequest(
  layer: GibsLayerMeta,
  date: string,
  area: ViewerArea,
  requestedSize: number
): FrameRequest {
  const dims = clampFrameDimensions(requestedSize, requestedSize);
  const [south, west, north, east] = area.bounds;
  const bbox3857 = bbox3857FromLatLngBounds(south, west, north, east);
  const url = wmsGetMapUrl({
    layer,
    time: date,
    bbox3857,
    width: dims.width,
    height: dims.height,
    // JPEG layers are requested as opaque PNG so alpha stays predictable for
    // canvas readback; GIBS renders the same visual either way.
    transparent: true
  });
  return { url, width: dims.width, height: dims.height, bbox3857, layerId: layer.id, date };
}

export function safeSettings(input: Partial<EnhancementSettings>): EnhancementSettings {
  return clampSettings(input);
}

export { DEFAULT_SETTINGS };
