/**
 * Earth Intelligence Lab — focused server endpoints.
 *
 * These endpoints exist to add reliability and to keep optional keys server
 * side. Nothing here replaces an existing api route (`/api/apod`,
 * `/api/missions/grounded-search`, …) — the router is mounted under
 * `/api/earth` only, and the client falls back to direct public service calls
 * when it is not reachable (static hosting).
 *
 * Endpoints
 *   GET  /api/earth/health                 capability report (no secrets)
 *   GET  /api/earth/power                  NASA POWER monthly proxy + validation
 *   GET  /api/earth/gibs/domains           GIBS DescribeDomains (observation-date domain)
 *   GET  /api/earth/gibs/probe             server-side tile probe (avoids CORS)
 *   GET  /api/earth/firms/hotspots         NASA FIRMS area API — only if FIRMS_MAP_KEY is set
 *   POST /api/earth/analyst                Gemini interpretation over retrieved data (+ local fallback)
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { buildDomain, describeCoverage, type DescribeDomainsError } from '../src/lib/earth/domains.ts';
import { describeDomainsUrl, getGibsLayer, GIBS_WMTS_BASE, wmtsTileUrl } from '../src/lib/earth/gibsCatalog.ts';
import { CORE_PARAMETER_CODES, POWER_MONTHLY_POINT_URL } from '../src/lib/earth/power.ts';
import { analyseBundle, buildLocalAnalystAnswer } from './earth/localAnalysis.ts';
import { createOrchestrator } from './earth/providerOrchestrator.ts';
import { createConfiguredProviders, extractJson, normaliseAnswer } from './earth/providers.ts';

export const earthRouter = express.Router();

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  expires: number;
  payload: unknown;
}

const cache = new Map<string, CacheEntry>();

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.payload as T;
}

function cacheSet(key: string, payload: unknown, ttlMs: number): void {
  if (cache.size > 400) {
    const now = Date.now();
    for (const [k, entry] of cache) {
      if (now > entry.expires) cache.delete(k);
    }
  }
  cache.set(key, { expires: Date.now() + ttlMs, payload });
}

/** fetch with an explicit timeout so a slow provider cannot hold a request open. */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(name: string, max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Express only trusts forwarded addresses when the operator explicitly
    // configures trusted proxies; never accept a caller-supplied header here.
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    // Buckets are per endpoint, so a burst of tile probes cannot throttle the
    // analyst (or any other capability) for the same client.
    const key = `${name}:${ip}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        ok: false,
        code: 'rate-limited',
        message: `Too many Earth Intelligence requests. Try again in ${retryAfter} s.`,
        retryAfter
      });
    }
    return next();
  };
}

function numberParam(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) return null;
  return num;
}

/* ------------------------------------------------------------------ */
/* health / capabilities                                               */
/* ------------------------------------------------------------------ */

earthRouter.get('/health', (_req, res) => {
  res.json({
    analystProviders: activeAnalystOrchestrator().health(),
    ok: true,
    service: 'earth-intelligence',
    timestamp: new Date().toISOString(),
    capabilities: {
      powerProxy: true,
      gibsDomains: true,
      gibsProbe: true,
      firmsHotspots: Boolean(process.env.FIRMS_MAP_KEY),
      // This reports configuration, not a successful provider health probe.
      aiAnalyst: Boolean(process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.ARENA_API_KEY),
      aiAnalystProviders: [
        process.env.GEMINI_API_KEY ? 'gemini' : null,
        process.env.OPENROUTER_API_KEY ? 'openrouter' : null,
        process.env.ARENA_API_KEY ? 'arena' : null
      ].filter(Boolean),
      localAnalyst: true
    },
    notes: {
      firmsHotspots: process.env.FIRMS_MAP_KEY
        ? 'NASA FIRMS area API proxy enabled.'
        : 'No FIRMS_MAP_KEY configured — hotspot counts are not offered (the app never estimates them).',
      aiAnalyst: process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.ARENA_API_KEY
        ? 'Remote analyst provider configured, but availability is not guaranteed; responses are grounded in the retrieved data bundle.'
        : 'No remote analyst provider configured — the Lab uses its deterministic local analysis engine.',
      aiAnalystFailover: [
        process.env.OPENROUTER_API_KEY ? 'OpenRouter' : null,
        process.env.ARENA_API_KEY ? 'Arena AI' : null
      ].filter(Boolean).length
        ? 'Gemini failures retry with backoff, then fall over to a configured alternative provider, then to the local engine.'
        : 'Gemini failures retry with backoff, then fall back to the local deterministic engine (no alternative AI key configured).'
    }
  });
});

/* ------------------------------------------------------------------ */
/* NASA POWER proxy                                                    */
/* ------------------------------------------------------------------ */

earthRouter.get('/power', rateLimit('power', 60, 60_000), async (req, res) => {
  const latitude = numberParam(req.query.latitude, -90, 90);
  const longitude = numberParam(req.query.longitude, -180, 180);
  const start = numberParam(req.query.start, 1981, 2100);
  const end = numberParam(req.query.end, 1981, 2100);
  const requested = String(req.query.parameters || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[A-Z0-9_]{2,24}$/.test(value));

  if (latitude === null || longitude === null || start === null || end === null) {
    return res.status(400).json({ ok: false, code: 'invalid-arguments', message: 'latitude, longitude, start and end are required and must be numeric.' });
  }
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return res.status(400).json({ ok: false, code: 'invalid-arguments', message: 'start and end must be whole years.' });
  }
  if (start > end) {
    return res.status(400).json({ ok: false, code: 'invalid-range', message: 'start year must not be after end year.' });
  }

  const parameters = requested.length ? requested.slice(0, 12) : CORE_PARAMETER_CODES;
  // Use the same precision as buildUrl: distinct upstream coordinates must not
  // share a cached result (including its provenance and geometry).
  const cacheKey = `power:${latitude.toFixed(4)}:${longitude.toFixed(4)}:${start}:${end}:${[...parameters].sort().join(',')}`;
  const cached = cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) {
    return res.json({ ...cached, fromCache: true });
  }

  const buildUrl = (codes: string[]) => {
    const params = new URLSearchParams({
      parameters: codes.join(','),
      community: 'RE',
      longitude: longitude.toFixed(4),
      latitude: latitude.toFixed(4),
      start: String(start),
      end: String(end),
      format: 'JSON'
    });
    return `${POWER_MONTHLY_POINT_URL}?${params.toString()}`;
  };

  const attempt = async (codes: string[]): Promise<{ ok: boolean; status: number; body: string; url: string }> => {
    const url = buildUrl(codes);
    const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 25000);
    return { ok: response.ok, status: response.status, body: await response.text(), url };
  };

  try {
    let codes = parameters;
    let result = await attempt(codes);
    let degraded = false;

    if (!result.ok && result.status === 400 && codes.length > CORE_PARAMETER_CODES.length) {
      // Progressive degradation instead of failing the whole request.
      codes = CORE_PARAMETER_CODES;
      result = await attempt(codes);
      degraded = true;
    }

    if (!result.ok) {
      return res.status(502).json({
        ok: false,
        code: 'power-error',
        message: `NASA POWER responded with HTTP ${result.status}.`,
        sourceUrl: result.url
      });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(result.body);
    } catch {
      return res.status(502).json({ ok: false, code: 'power-unreadable', message: 'NASA POWER returned a non-JSON body.', sourceUrl: result.url });
    }

    const parameterBlock = (payload as any)?.properties?.parameter;
    if (!parameterBlock || typeof parameterBlock !== 'object' || Array.isArray(parameterBlock)) {
      return res.status(502).json({ ok: false, code: 'power-invalid-response', message: 'NASA POWER returned an unexpected data structure.', sourceUrl: result.url });
    }

    const envelope = {
      ok: true,
      provider: 'NASA POWER',
      sourceUrl: result.url,
      retrievedAt: new Date().toISOString(),
      requestedParameters: parameters,
      usedParameters: codes,
      degraded,
      fromCache: false,
      payload
    };
    cacheSet(cacheKey, envelope, 12 * 60 * 60 * 1000);
    return res.json(envelope);
  } catch (error) {
    return res.status(504).json({
      ok: false,
      code: 'power-timeout',
      message: `NASA POWER request failed or timed out: ${(error as Error)?.message || 'unknown error'}`,
      sourceUrl: buildUrl(parameters)
    });
  }
});

/* ------------------------------------------------------------------ */
/* GIBS observation-date domain                                        */
/* ------------------------------------------------------------------ */

earthRouter.get('/gibs/domains', rateLimit('gibs-domains', 120, 60_000), async (req, res) => {
  const layerId = String(req.query.layer || '').trim();
  if (!layerId || !/^[A-Za-z0-9_.\-]{3,80}$/.test(layerId)) {
    return res.status(400).json({ ok: false, code: 'invalid-layer', message: 'A valid GIBS layer identifier is required.' });
  }

  const known = getGibsLayer(layerId);
  const tileMatrixSet = String(req.query.tileMatrixSet || known?.tileMatrixSet || 'GoogleMapsCompatible_Level9');
  const url = known ? describeDomainsUrl(known) : `${GIBS_WMTS_BASE}/1.0.0/${layerId}/default/${tileMatrixSet}/all/all.xml`;
  const cacheKey = `domains:${layerId}:${tileMatrixSet}`;
  const cached = cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return res.json({ ...cached, fromCache: true });

  try {
    const response = await fetchWithTimeout(url, { headers: { Accept: 'application/xml,text/xml,*/*' } }, 20000);
    const text = await response.text();
    if (!response.ok && !/exceptionreport/i.test(text)) {
      return res.status(502).json({
        ok: false,
        code: 'gibs-error',
        message: `GIBS DescribeDomains responded with HTTP ${response.status}.`,
        sourceUrl: url
      });
    }

    try {
      const domain = buildDomain({ layerId, tileMatrixSet, xml: text, sourceUrl: url });
      const envelope = {
        ok: true,
        layerId,
        tileMatrixSet,
        ranges: domain.ranges,
        minDate: domain.minDate,
        maxDate: domain.maxDate,
        coverage: describeCoverage(domain),
        sourceUrl: url,
        retrievedAt: domain.retrievedAt,
        fromCache: false
      };
      cacheSet(cacheKey, envelope, 6 * 60 * 60 * 1000);
      return res.json(envelope);
    } catch (error) {
      const typed = error as DescribeDomainsError;
      return res.status(422).json({
        ok: false,
        code: typed.code || 'unparseable',
        message: typed.message || 'GIBS returned a response without an observation-date domain.',
        sourceUrl: url
      });
    }
  } catch (error) {
    return res.status(504).json({
      ok: false,
      code: 'gibs-timeout',
      message: `GIBS request failed or timed out: ${(error as Error)?.message || 'unknown error'}`,
      sourceUrl: url
    });
  }
});

/* ------------------------------------------------------------------ */
/* GIBS tile probe (server side — no CORS involvement)                 */
/* ------------------------------------------------------------------ */

earthRouter.get('/gibs/probe', rateLimit('gibs-probe', 240, 60_000), async (req, res) => {
  const layerId = String(req.query.layer || '').trim();
  const date = String(req.query.date || '').trim();
  if (!layerId || !/^[A-Za-z0-9_.\-]{3,80}$/.test(layerId)) {
    return res.status(400).json({ ok: false, code: 'invalid-layer', message: 'A valid GIBS layer identifier is required.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ ok: false, code: 'invalid-date', message: 'date must use the YYYY-MM-DD format.' });
  }

  const known = getGibsLayer(layerId);
  const tileMatrixSet = String(req.query.tileMatrixSet || known?.tileMatrixSet || 'GoogleMapsCompatible_Level9');
  const format = String(req.query.format || known?.format || 'jpg') === 'png' ? 'png' : 'jpg';
  const url = known
    ? wmtsTileUrl(known, date, tileMatrixSet, format, 1, 1, 1)
    : `${GIBS_WMTS_BASE}/${layerId}/default/${date}/${tileMatrixSet}/1/1/1.${format}`;

  const cacheKey = `probe:${layerId}:${tileMatrixSet}:${format}:${date}`;
  const cached = cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return res.json({ ...cached, fromCache: true });

  try {
    const response = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'image/*' } }, 15000);
    const contentType = response.headers.get('content-type') || '';
    const isImage = /^image\//i.test(contentType);
    const envelope = {
      ok: response.ok && isImage,
      layerId,
      date,
      tileMatrixSet,
      format,
      status: response.status,
      contentType,
      bytes: Number(response.headers.get('content-length') || 0) || null,
      sourceUrl: url,
      retrievedAt: new Date().toISOString(),
      fromCache: false,
      note:
        response.ok && isImage
          ? 'GIBS served an image for this layer/date combination. GIBS may substitute the nearest available day when the exact date is missing, so the observation-date domain is still checked separately.'
          : `GIBS did not serve an image (HTTP ${response.status}).`
    };
    cacheSet(cacheKey, envelope, 30 * 60 * 1000);
    return res.json(envelope);
  } catch (error) {
    return res.status(504).json({
      ok: false,
      code: 'gibs-timeout',
      message: `GIBS tile probe failed or timed out: ${(error as Error)?.message || 'unknown error'}`,
      sourceUrl: url
    });
  }
});

/* ------------------------------------------------------------------ */
/* NASA FIRMS hotspots — only when an operator supplies a MAP_KEY       */
/* ------------------------------------------------------------------ */

const FIRMS_SOURCES = new Set([
  'VIIRS_SNPP_NRT',
  'VIIRS_NOAA20_NRT',
  'VIIRS_NOAA21_NRT',
  'MODIS_NRT',
  'MODIS_SP',
  'VIIRS_SNPP_SP'
]);

earthRouter.get('/firms/hotspots', rateLimit('firms', 30, 60_000), async (req, res) => {
  const docsUrl = 'https://firms.modaps.eosdis.nasa.gov/api/area/';
  const mapKey = process.env.FIRMS_MAP_KEY;
  if (!mapKey) {
    return res.json({
      ok: false,
      code: 'not-configured',
      status: 'not-configured',
      message:
        'NASA FIRMS hotspot counts require a free MAP_KEY, which is not configured on this deployment. The Lab never estimates hotspot counts, so this capability is reported as unavailable.',
      docsUrl,
      sourceUrl: docsUrl
    });
  }

  const source = String(req.query.source || 'VIIRS_SNPP_NRT');
  if (!FIRMS_SOURCES.has(source)) {
    return res.status(400).json({ ok: false, code: 'invalid-source', message: `source must be one of ${[...FIRMS_SOURCES].join(', ')}` });
  }

  const west = numberParam(req.query.west, -180, 180);
  const east = numberParam(req.query.east, -180, 180);
  const south = numberParam(req.query.south, -90, 90);
  const north = numberParam(req.query.north, -90, 90);
  if (west === null || east === null || south === null || north === null || east <= west || north <= south) {
    return res.status(400).json({ ok: false, code: 'invalid-bbox', message: 'west/east/south/north must form a valid bounding box.' });
  }
  const dayRange = Math.min(5, Math.max(1, Math.round(numberParam(req.query.dayRange, 1, 5) || 1)));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? String(req.query.date) : undefined;

  const bbox = `${west},${south},${east},${north}`;
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/${source}/${bbox}/${dayRange}${date ? `/${date}` : ''}`;
  const cacheKey = `firms:${source}:${bbox}:${dayRange}:${date || 'latest'}`;
  const cached = cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return res.json({ ...cached, fromCache: true });

  try {
    const response = await fetchWithTimeout(url, { headers: { Accept: 'text/csv,text/plain,*/*' } }, 25000);
    const text = await response.text();
    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        code: 'firms-error',
        message: `NASA FIRMS responded with HTTP ${response.status}.`,
        sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/api/area/'
      });
    }
    if (/Invalid MAP_KEY|Not Authorized/i.test(text)) {
      return res.status(401).json({ ok: false, code: 'firms-key-rejected', message: 'NASA FIRMS rejected the configured MAP_KEY.', docsUrl });
    }

    const lines = text.trim().split(/\r?\n/);
    const header = (lines.shift() || '').split(',');
    const index = (name: string) => header.findIndex((column) => column.trim().toLowerCase() === name);

    const latIdx = index('latitude');
    const lonIdx = index('longitude');
    const dateIdx = index('acq_date');
    const timeIdx = index('acq_time');
    const confIdx = index('confidence');
    const frpIdx = index('frp');
    const dayNightIdx = index('daynight');
    const instrumentIdx = index('instrument');
    const satelliteIdx = index('satellite');

    if (latIdx < 0 || lonIdx < 0) {
      return res.status(502).json({ ok: false, code: 'firms-unexpected-format', message: 'NASA FIRMS CSV did not contain latitude/longitude columns.', docsUrl });
    }

    const detections = lines
      .map((line) => line.split(','))
      .filter((cells) => cells.length > Math.max(latIdx, lonIdx))
      .map((cells) => ({
        latitude: Number(cells[latIdx]),
        longitude: Number(cells[lonIdx]),
        date: dateIdx >= 0 ? cells[dateIdx] : undefined,
        time: timeIdx >= 0 ? cells[timeIdx] : undefined,
        confidence: confIdx >= 0 ? cells[confIdx] : undefined,
        frp: frpIdx >= 0 && cells[frpIdx] !== '' ? Number(cells[frpIdx]) : null,
        dayNight: dayNightIdx >= 0 ? cells[dayNightIdx] : undefined,
        instrument: instrumentIdx >= 0 ? cells[instrumentIdx] : undefined,
        satellite: satelliteIdx >= 0 ? cells[satelliteIdx] : undefined
      }))
      .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));

    const byDay: Record<string, number> = {};
    let frpSum = 0;
    let frpCount = 0;
    const confidenceCounts: Record<string, number> = {};
    detections.forEach((item) => {
      if (item.date) byDay[item.date] = (byDay[item.date] || 0) + 1;
      if (typeof item.frp === 'number' && Number.isFinite(item.frp)) {
        frpSum += item.frp;
        frpCount += 1;
      }
      const key = (item.confidence || 'unknown').toString().toLowerCase();
      confidenceCounts[key] = (confidenceCounts[key] || 0) + 1;
    });

    const maxFeatures = 3000;
    const envelope = {
      ok: true,
      provider: 'NASA FIRMS (Fire Information for Resource Management System)',
      source,
      bbox: { west, south, east, north },
      dayRange,
      requestedDate: date || null,
      retrievedAt: new Date().toISOString(),
      fromCache: false,
      sourceUrl: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/[MAP_KEY]/${source}/${bbox}/${dayRange}${date ? `/${date}` : ''}`,
      attribution: 'NASA FIRMS — Fire Information for Resource Management System',
      detectionCount: detections.length,
      byDay,
      meanFrp: frpCount ? Number((frpSum / frpCount).toFixed(1)) : null,
      frpUnit: 'MW',
      confidenceCounts,
      truncated: detections.length > maxFeatures,
      detections: detections.slice(0, maxFeatures),
      limitations: [
        'Each row is an individual thermal-anomaly detection with a confidence class, not a burned area, fire size or severity.',
        'Gas flares, industrial heat sources and some hot land surfaces produce persistent detections.',
        'Cloud cover and satellite overpass timing mean a fire can be missed entirely.'
      ]
    };
    cacheSet(cacheKey, envelope, 15 * 60 * 1000);
    return res.json(envelope);
  } catch (error) {
    return res.status(504).json({
      ok: false,
      code: 'firms-timeout',
      message: `NASA FIRMS request failed or timed out: ${(error as Error)?.message || 'unknown error'}`,
      docsUrl
    });
  }
});

/* ------------------------------------------------------------------ */
/* AI Earth science analyst                                            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* AI Earth science analyst                                            */
/*                                                                     */
/* Chain: Gemini (primary) → OpenRouter → Arena AI → Local engine.     */
/* Gemini is unchanged in model, prompt and schema — it is simply no   */
/* longer the only thing standing between a user and an answer.        */
/* ------------------------------------------------------------------ */

interface AnalystRedaction {
  (text: string): string;
}

/** Strips anything key-shaped out of a string we are about to return or log. */
const redact: AnalystRedaction = (text: string) =>
  String(text || '')
    .replace(/([?&](?:api_?key|key|token|access_token)=)[^&\s"']+/gi, '$1[redacted]')
    .replace(/\b(AIza|sk-|or-|arena-)[A-Za-z0-9_\-]{8,}/g, '[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._\-]{8,}/gi, 'Bearer [redacted]')
    .slice(0, 240);

/** Structured, key-free server log line. */
function logAnalystEvent(event: Record<string, unknown>) {
  try {
    console.log(JSON.stringify({ ts: new Date().toISOString(), scope: 'earth.analyst', ...event }));
  } catch {
    /* logging must never break a request */
  }
}

const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
  arena: 'Arena AI',
  local: 'Local Earth Intelligence',
};

/** Context sent to a model: retrieved evidence + the arithmetic already done. */
function buildProviderContext(context: any, analysis: ReturnType<typeof analyseBundle>) {
  return {
    location: {
      label: context?.power?.place || context?.area?.label || null,
      latitude: context?.power?.latitude ?? context?.area?.latitude ?? null,
      longitude: context?.power?.longitude ?? context?.area?.longitude ?? null,
    },
    observationDates: Array.isArray(context?.dates) ? context.dates : [],
    dateRange: context?.power ? { from: context.power.from ?? null, to: context.power.to ?? null } : null,
    datasets: [
      context?.power
        ? {
            id: 'NASA_POWER_MONTHLY_POINT',
            title: 'NASA POWER monthly point archive',
            sourceUrl: context.power.sourceUrl ?? null,
            units: Object.fromEntries(analysis.series.map((entry) => [entry.code, entry.unit || 'unit not reported'])),
            availableParameters: context.power.available ?? [],
            unavailableParameters: context.power.unavailable ?? [],
            monthlySeries: analysis.series.map((entry) => ({
              code: entry.code,
              unit: entry.unit,
              firstMonth: entry.firstMonth,
              lastMonth: entry.lastMonth,
              values: entry.count,
            })),
          }
        : null,
    ].filter(Boolean),
    layers: Array.isArray(context?.layers) ? context.layers : [],
    missingData: {
      reportedByClient: Array.isArray(context?.dataGaps) ? context.dataGaps : [],
      byParameter: analysis.series
        .filter((entry) => entry.missing > 0)
        .map((entry) => ({ code: entry.code, missingMonths: entry.missing, examples: entry.missingMonths.slice(0, 6) })),
    },
    localAnalysis: {
      note: 'Arithmetic already computed from the retrieved POWER values by the deterministic engine. Restate these; do not recompute differently.',
      series: analysis.series.map((entry) => ({
        code: entry.code,
        unit: entry.unit,
        usableValues: entry.count,
        mean: entry.mean,
        min: entry.min,
        max: entry.max,
        anomalyBaseline: entry.anomaly
          ? { label: entry.anomaly.baselineLabel, value: entry.anomaly.baselineValue, latest: entry.anomaly.latest }
          : null,
        periodComparison: entry.periodComparison,
        seasonal: entry.seasonal,
      })),
      coverage: analysis.coverage,
    },
    raw: context,
  };
}

const analystOrchestrator = createOrchestrator({
  providers: createConfiguredProviders(),
  parseAnswer: (text, context) => normaliseAnswer(extractJson(text), context, 6),
  log: (event) => logAnalystEvent(event as Record<string, unknown>),
});

/**
 * Test seam: lets the failover suite inject an orchestrator whose providers are
 * stubs, so the HTTP contract is exercised end to end without calling Google.
 */
let analystOrchestratorOverride: typeof analystOrchestrator | null = null;

export function __setAnalystOrchestratorForTests(instance: typeof analystOrchestrator | null) {
  analystOrchestratorOverride = instance;
}

function activeAnalystOrchestrator() {
  return analystOrchestratorOverride || analystOrchestrator;
}

function analystLanguageName(lang: string): string {
  return ({ en: 'English', si: 'Sinhala (සිංහල)', ta: 'Tamil (தமிழ்)' } as Record<string, string>)[lang] || 'English';
}

earthRouter.post('/analyst', rateLimit('analyst', 20, 5 * 60_000), async (req, res) => {
  const startedAt = Date.now();
  const { question, context, lang = 'en' } = req.body || {};
  if (!question || typeof question !== 'string' || question.length > 800) {
    return res.status(400).json({ ok: false, code: 'invalid-question', message: 'A question of up to 800 characters is required.' });
  }
  if (!context || typeof context !== 'object') {
    return res.status(400).json({ ok: false, code: 'missing-context', message: 'A retrieved-data context bundle is required.' });
  }

  const languageName = analystLanguageName(String(lang));
  const requestId = `an-${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // Deterministic pass first: it grounds the model AND is the answer of last resort.
  const analysis = analyseBundle(context as any);
  const local = buildLocalAnalystAnswer(String(question), context as any, { analysis });
  const providerContext = buildProviderContext(context, analysis);

  // Cancellation: if the browser goes away, stop paying for tokens.
  const controller = new AbortController();
  let clientGone = false;
  // `req` 'close' fires as soon as the request body has been read, so the
  // cancellation signal has to come from the response side.
  res.on('close', () => {
    if (!res.writableEnded) {
      clientGone = true;
      controller.abort();
    }
  });

  const dedupeKey = JSON.stringify([String(question), String(lang), providerContext.location, providerContext.dateRange, analysis.series.map((entry) => [entry.code, entry.count, entry.lastMonth])]);

  logAnalystEvent({
    event: 'earth.analyst.request',
    requestId,
    lang: String(lang),
    questionLength: question.length,
    series: analysis.series.length,
    usableValues: analysis.coverage?.analysed ?? 0,
    missingCells: analysis.coverage?.missingCells ?? 0,
  });

  let run: Awaited<ReturnType<typeof analystOrchestrator.run>>;
  try {
    run = await activeAnalystOrchestrator().run({
      question: String(question),
      context: providerContext,
      lang: String(lang),
      signal: controller.signal,
      dedupeKey,
    });
  } catch (error) {
    // The orchestrator itself never throws, but a bug here must still not leak.
    logAnalystEvent({ event: 'earth.analyst.orchestrator_error', requestId, message: redact((error as Error)?.message || 'unknown') });
    run = {
      ok: false,
      answer: null,
      unparsable: undefined,
      metadata: {
        mode: 'local',
        provider: 'local',
        providerLabel: PROVIDER_LABELS.local,
        attempts: 0,
        retries: 0,
        fallback: true,
        fallbackReason: 'ORCHESTRATOR_ERROR',
        providerChain: [],
        generatedAt: new Date().toISOString(),
        deduped: false,
        durationMs: Date.now() - startedAt,
        noticeCode: 'all-providers-unavailable',
      },
    };
  }

  const { metadata } = run;
  const chain = metadata.providerChain.map((entry) => ({
    provider: entry.provider,
    providerLabel: PROVIDER_LABELS[entry.provider] || entry.provider,
    model: entry.model,
    outcome: entry.outcome,
    code: entry.code,
    status: entry.status,
    attempts: entry.attempts,
    ms: entry.ms,
    // Upstream messages are logged server-side only; the client gets the
    // classification code, never the provider's own error text.
    reason: entry.code ? `${PROVIDER_LABELS[entry.provider] || entry.provider}: ${entry.code}` : undefined,
  }));

  const base = {
    ok: true,
    mode: metadata.mode,
    provider: metadata.provider,
    providerLabel: metadata.providerLabel,
    model: metadata.model,
    generatedAt: metadata.generatedAt,
    attempts: metadata.attempts,
    retries: metadata.retries,
    fallback: metadata.fallback,
    fallbackReason: metadata.fallbackReason,
    providerChain: chain,
    deduped: metadata.deduped,
    durationMs: Date.now() - startedAt,
    groundedInRetrievedData: true,
    groundingMode: 'retrieved-context-only',
    sufficientData: local.sufficientData,
    localEvidence: local.evidenceSummary.slice(0, 5),
  };

  if (clientGone) {
    logAnalystEvent({ event: 'earth.analyst.client_closed', requestId, ms: Date.now() - startedAt });
    return undefined;
  }

  if (run.ok && run.answer) {
    const answer = run.answer as ReturnType<typeof normaliseAnswer>;
    logAnalystEvent({
      event: 'earth.analyst.answer',
      requestId,
      mode: 'remote',
      provider: metadata.provider,
      attempts: metadata.attempts,
      retries: metadata.retries,
      fallback: metadata.fallback,
      ms: Date.now() - startedAt,
    });
    return res.json({
      ...base,
      noticeCode: metadata.noticeCode ?? (metadata.fallback ? 'primary-unavailable' : undefined),
      sections: answer.sections,
      sources: answer.sources,
      droppedSources: answer.droppedSources,
    });
  }

  // Local mode: a real answer, computed from the same retrieved values.
  const noticeCode = local.sufficientData ? (metadata.noticeCode || 'local-mode') : 'no-observations';
  logAnalystEvent({
    event: 'earth.analyst.answer',
    requestId,
    mode: 'local',
    noticeCode,
    attempts: metadata.attempts,
    reason: metadata.fallbackReason,
    ms: Date.now() - startedAt,
  });

  return res.json({
    ...base,
    mode: 'local',
    provider: 'local',
    providerLabel: PROVIDER_LABELS.local,
    model: undefined,
    noticeCode,
    sections: local.sections,
    sources: local.sources,
    droppedSources: 0,
    groundingMode: 'deterministic-local-analysis',
  });
});
