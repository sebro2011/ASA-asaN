/**
 * NASA GIBS imagery client.
 *
 * Responsibilities
 *  - read each layer's published observation-date domain (`DescribeDomains`);
 *  - verify that a layer + tile matrix set + format actually render (live probe);
 *  - expose URL builders for Leaflet tile layers and for static WMS/GetMap images.
 *
 * Transport strategy (no API keys involved):
 *  1. `/api/earth/gibs/domains` on the app server (validated + cached server-side);
 *  2. direct browser request to GIBS (works when the service sends CORS headers);
 *  3. local cache;
 *  4. otherwise `null` — the UI then reports the availability as *unverified*
 *     rather than guessing.
 */

import { cacheGet, cacheSet, TTL } from './cache';
import { buildDomain, classifyDescribeDomainsError, describeCoverage, type DescribeDomainsError } from './domains';
import { describeDomainsUrl, wmsGetMapUrl, wmsLeafletTemplate, wmtsLeafletTemplate, wmtsTileUrl } from './gibsCatalog';

export { wmsGetMapUrl };
import type { GibsDomain, GibsLayerMeta } from './types';

export interface DomainResult {
  domain: GibsDomain | null;
  /** Where the answer came from; shown in the provenance panel. */
  transport: 'server' | 'direct' | 'cache' | 'error';
  error?: string;
}

const SERVER_BASE = '/api/earth';

function isAbort(error: unknown): boolean {
  return (error as Error)?.name === 'AbortError';
}

async function fetchJsonWithTimeout(url: string, signal: AbortSignal | undefined, timeoutMs = 12000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Read (and cache) the observation-date domain for a GIBS layer. */
export async function fetchLayerDomain(
  layer: GibsLayerMeta,
  options: { signal?: AbortSignal; force?: boolean } = {}
): Promise<DomainResult> {
  const cacheKey = `gibs:domain:${layer.id}:${layer.tileMatrixSet || 'default'}`;

  if (!options.force) {
    const cached = cacheGet<GibsDomain>(cacheKey);
    if (cached) {
      return { domain: { ...cached.value, fromCache: true }, transport: 'cache' };
    }
  }

  // 1) Server proxy (authoritative parsing + server-side cache).
  try {
    const payload = await fetchJsonWithTimeout(
      `${SERVER_BASE}/gibs/domains?layer=${encodeURIComponent(layer.id)}&tileMatrixSet=${encodeURIComponent(layer.tileMatrixSet || '')}`,
      options.signal
    );
    if (payload?.ok && Array.isArray(payload.ranges) && payload.ranges.length) {
      const domain: GibsDomain = {
        layerId: layer.id,
        tileMatrixSet: layer.tileMatrixSet,
        ranges: payload.ranges,
        minDate: payload.minDate || payload.ranges[0].start,
        maxDate: payload.maxDate || payload.ranges[payload.ranges.length - 1].end,
        retrievedAt: payload.retrievedAt || new Date().toISOString(),
        fromCache: Boolean(payload.fromCache),
        sourceUrl: payload.sourceUrl || describeDomainsUrl(layer)
      };
      cacheSet(cacheKey, domain, TTL.domain);
      return { domain, transport: 'server' };
    }
    if (payload && payload.ok === false && payload.message) {
      return { domain: null, transport: 'error', error: String(payload.message) };
    }
  } catch (error) {
    if (isAbort(error)) throw error;
    // Fall through to the direct request (expected when the app is hosted statically).
  }

  // 2) Direct request to GIBS.
  const url = describeDomainsUrl(layer);
  try {
    const response = await fetch(url, { signal: options.signal, headers: { Accept: 'application/xml,text/xml,*/*' } });
    const text = await response.text();
    if (!response.ok && !/exceptionreport/i.test(text)) {
      return { domain: null, transport: 'error', error: `GIBS DescribeDomains failed (HTTP ${response.status}).` };
    }
    const domain = buildDomain({ layerId: layer.id, tileMatrixSet: layer.tileMatrixSet, xml: text, sourceUrl: url });
    cacheSet(cacheKey, domain, TTL.domain);
    return { domain, transport: 'direct' };
  } catch (error) {
    if (isAbort(error)) throw error;
    const typed = error as DescribeDomainsError;
    if (typed?.code) {
      const messages: Record<string, string> = {
        'invalid-layer': 'GIBS does not recognise this layer identifier.',
        'invalid-tilematrixset': 'The tile matrix set is not available for this layer.',
        unparseable: 'GIBS returned a response without an observation-date domain.',
        'service-error': 'GIBS returned an OGC service exception.'
      };
      return { domain: null, transport: 'error', error: messages[typed.code] || typed.message };
    }
    return {
      domain: null,
      transport: 'error',
      error:
        'Observation-date domain could not be retrieved (network or CORS restriction). Live tile probes are used instead.'
    };
  }
}

export interface ProbeResult {
  ok: boolean;
  /** Service that successfully answered. */
  service: 'wmts' | 'wms';
  /** Format extension that worked for WMTS layers. */
  format: 'jpg' | 'png';
  url: string;
  error?: string;
}

function loadImage(url: string, timeoutMs = 9000): Promise<'loaded' | 'failed' | 'timeout'> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve('failed');
      return;
    }
    const image = new Image();
    let settled = false;
    const finish = (result: 'loaded' | 'failed' | 'timeout') => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(result);
    };
    const timer = window.setTimeout(() => finish('timeout'), timeoutMs);
    image.onload = () => finish('loaded');
    image.onerror = () => finish('failed');
    image.referrerPolicy = 'no-referrer';
    image.src = url;
  });
}

/**
 * Verify that a layer renders in this projection. GIBS may substitute the
 * nearest available day for a missing date, so a successful probe proves
 * *service + projection + format*, not the observation date — date checks are
 * done against the reported domain (see domains.ts).
 */
export async function probeLayer(layer: GibsLayerMeta, date: string, options: { force?: boolean } = {}): Promise<ProbeResult> {
  const cacheKey = `gibs:probe:${layer.id}:${layer.tileMatrixSet || 'wms'}`;
  if (!options.force) {
    const cached = cacheGet<ProbeResult>(cacheKey);
    if (cached) return cached.value;
  }

  const attempts: Array<{ service: 'wmts' | 'wms'; format: 'jpg' | 'png'; url: string }> = [];

  if (layer.service === 'wmts' && layer.tileMatrixSet) {
    // Low zoom tile in the equatorial band: cheap and representative of the global grid.
    attempts.push({
      service: 'wmts',
      format: layer.format,
      url: wmtsTileUrl(layer, date, layer.tileMatrixSet, layer.format, 1, 1, 1)
    });
    const alternate: 'jpg' | 'png' = layer.format === 'png' ? 'jpg' : 'png';
    attempts.push({
      service: 'wmts',
      format: alternate,
      url: wmtsTileUrl(layer, date, layer.tileMatrixSet, alternate, 1, 1, 1)
    });
  }

  attempts.push({
    service: 'wms',
    format: 'png',
    url: wmsGetMapUrl({ layer, time: date, bbox3857: [-20037508, -20037508, 20037508, 20037508], width: 128, height: 128 })
  });

  let lastError = 'No GIBS service answered for this layer.';
  for (const attempt of attempts) {
    const outcome = await loadImage(attempt.url);
    if (outcome === 'loaded') {
      const result: ProbeResult = { ok: true, service: attempt.service, format: attempt.format, url: attempt.url };
      cacheSet(cacheKey, result, TTL.probe);
      return result;
    }
    lastError = outcome === 'timeout' ? 'GIBS did not respond within 9 s.' : 'GIBS returned no renderable image.';
  }

  const failure: ProbeResult = { ok: false, service: layer.service, format: layer.format, url: attempts[0]?.url || '', error: lastError };
  cacheSet(cacheKey, failure, TTL.probe);
  return failure;
}

export interface ImagerySource {
  type: 'wmts' | 'wms';
  /** Leaflet tile template (`{z}/{y}/{x}` placeholders for WMTS, WMS base for `L.tileLayer.wms`). */
  url: string;
  format: 'jpg' | 'png';
  tileMatrixSet?: string;
  /** Attribution line to display with the imagery. */
  attribution: string;
}

/**
 * Resolve the imagery source for a layer/date.
 * `probe` may be supplied by the caller after `probeLayer` so the map reuses the
 * verified service/format instead of probing again.
 */
export function imagerySource(
  layer: GibsLayerMeta,
  date: string,
  probe?: ProbeResult | null
): ImagerySource {
  const service = probe?.ok ? probe.service : layer.service;
  const format = probe?.ok ? probe.format : layer.format;
  const attribution = `NASA GIBS · ${layer.id} · ${date}`;

  if (service === 'wms' || !layer.tileMatrixSet) {
    return { type: 'wms', url: wmsLeafletTemplate(layer, date), format: 'png', attribution };
  }
  return {
    type: 'wmts',
    url: wmtsLeafletTemplate(layer, date, layer.tileMatrixSet, format),
    format,
    tileMatrixSet: layer.tileMatrixSet,
    attribution
  };
}

/** EPSG:3857 bounds helper (`[[south, west], [north, east]]` → metres). */
export function bbox3857FromLatLngBounds(south: number, west: number, north: number, east: number): [number, number, number, number] {
  const R = 6378137;
  const x = (lon: number) => (lon * Math.PI * R) / 180;
  const y = (lat: number) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return [x(west), y(south), x(east), y(north)];
}

export { describeCoverage };
export { classifyDescribeDomainsError };
