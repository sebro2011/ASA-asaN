/**
 * Server capability probe for the Earth Intelligence Lab.
 *
 * The Lab is designed to work in both deployment shapes:
 *  - with the Express server (`/api/earth/*` available: validated proxies,
 *    optional FIRMS key, optional Gemini analyst), and
 *  - as a static build (client talks to the public NASA services directly and
 *    reports the missing capabilities instead of pretending they exist).
 */

import { cacheGet, cacheSet, HOUR } from './cache';

export interface EarthCapabilities {
  /** True when `/api/earth/health` answered. */
  serverReachable: boolean;
  powerProxy: boolean;
  gibsDomains: boolean;
  gibsProbe: boolean;
  /** FIRMS hotspot counts are only offered when a MAP_KEY is configured. */
  firmsHotspots: boolean;
  aiAnalyst: boolean;
  notes?: Record<string, string>;
  checkedAt: string;
}

export const STATIC_CAPABILITIES: EarthCapabilities = {
  serverReachable: false,
  powerProxy: false,
  gibsDomains: false,
  gibsProbe: false,
  firmsHotspots: false,
  aiAnalyst: false,
  checkedAt: new Date().toISOString()
};

export async function fetchCapabilities(signal?: AbortSignal): Promise<EarthCapabilities> {
  const cached = cacheGet<EarthCapabilities>('capabilities');
  if (cached) return cached.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetch('/api/earth/health', { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const capabilities: EarthCapabilities = {
      serverReachable: true,
      powerProxy: Boolean(payload?.capabilities?.powerProxy),
      gibsDomains: Boolean(payload?.capabilities?.gibsDomains),
      gibsProbe: Boolean(payload?.capabilities?.gibsProbe),
      firmsHotspots: Boolean(payload?.capabilities?.firmsHotspots),
      aiAnalyst: Boolean(payload?.capabilities?.aiAnalyst),
      notes: payload?.notes,
      checkedAt: payload?.timestamp || new Date().toISOString()
    };
    cacheSet('capabilities', capabilities, HOUR);
    return capabilities;
  } catch {
    const fallback = { ...STATIC_CAPABILITIES, checkedAt: new Date().toISOString() };
    cacheSet('capabilities', fallback, 5 * 60 * 1000);
    return fallback;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export interface FirmsHotspots {
  ok: boolean;
  code?: string;
  message?: string;
  detectionCount?: number;
  byDay?: Record<string, number>;
  meanFrp?: number | null;
  confidenceCounts?: Record<string, number>;
  detections?: Array<{ latitude: number; longitude: number; date?: string; time?: string; confidence?: string; frp?: number | null }>;
  limitations?: string[];
  retrievedAt?: string;
  sourceUrl?: string;
  attribution?: string;
  docsUrl?: string;
  truncated?: boolean;
}

export async function fetchFirmsHotspots(
  params: { west: number; south: number; east: number; north: number; date?: string; dayRange?: number; source?: string },
  signal?: AbortSignal
): Promise<FirmsHotspots> {
  const query = new URLSearchParams({
    west: String(params.west),
    south: String(params.south),
    east: String(params.east),
    north: String(params.north),
    dayRange: String(params.dayRange || 1)
  });
  if (params.date) query.set('date', params.date);
  if (params.source) query.set('source', params.source);

  try {
    const response = await fetch(`/api/earth/firms/hotspots?${query.toString()}`, { signal, headers: { Accept: 'application/json' } });
    const payload = (await response.json()) as FirmsHotspots;
    return payload;
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    return {
      ok: false,
      code: 'network',
      message: `NASA FIRMS proxy is unreachable (${(error as Error)?.message || 'network error'}). Hotspot counts are not estimated here.`,
      docsUrl: 'https://firms.modaps.eosdis.nasa.gov/api/area/'
    };
  }
}
