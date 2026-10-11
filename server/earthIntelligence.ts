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
import { GoogleGenAI, Type } from '@google/genai';
import { buildDomain, describeCoverage, type DescribeDomainsError } from '../src/lib/earth/domains.js';
import { describeDomainsUrl, getGibsLayer, GIBS_WMTS_BASE, wmtsTileUrl } from '../src/lib/earth/gibsCatalog.js';
import { CORE_PARAMETER_CODES, POWER_MONTHLY_POINT_URL } from '../src/lib/earth/power.js';

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
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
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
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) return null;
  return num;
}

/* ------------------------------------------------------------------ */
/* health / capabilities                                               */
/* ------------------------------------------------------------------ */

earthRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'earth-intelligence',
    timestamp: new Date().toISOString(),
    capabilities: {
      powerProxy: true,
      gibsDomains: true,
      gibsProbe: true,
      firmsHotspots: Boolean(process.env.FIRMS_MAP_KEY),
      aiAnalyst: Boolean(process.env.GEMINI_API_KEY)
    },
    notes: {
      firmsHotspots: process.env.FIRMS_MAP_KEY
        ? 'NASA FIRMS area API proxy enabled.'
        : 'No FIRMS_MAP_KEY configured — hotspot counts are not offered (the app never estimates them).',
      aiAnalyst: process.env.GEMINI_API_KEY
        ? 'Gemini interpretation enabled; answers are grounded in the retrieved data bundle only.'
        : 'No GEMINI_API_KEY configured — the Lab uses its deterministic local analysis engine.'
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
  if (start > end) {
    return res.status(400).json({ ok: false, code: 'invalid-range', message: 'start year must not be after end year.' });
  }

  const parameters = requested.length ? requested.slice(0, 12) : CORE_PARAMETER_CODES;
  const cacheKey = `power:${latitude.toFixed(3)}:${longitude.toFixed(3)}:${start}:${end}:${[...parameters].sort().join(',')}`;
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

const aiClient = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { headers: { 'User-Agent': 'nasa-space-explorer-earth-lab' } } })
  : null;

const ANALYST_MODEL = 'gemini-3.8-flash';

const ANALYST_SYSTEM_INSTRUCTION = `You are the Earth Science Analyst inside the NASA Space Explorer Earth Intelligence Lab.

Absolute rules:
1. You may ONLY use the numbers, dataset names, dates, coverage strings and URLs present in the JSON context supplied by the client. Never add measurements, hotspot counts, alerts, place names or sources from memory.
2. If a value needed to answer is absent from the context, say it is not available in the retrieved data and name what would be required.
3. Separate your answer into:
   - verified: statements that restate retrieved values or documented dataset metadata;
   - derived: arithmetic or comparisons you performed on those retrieved values (show the calculation style, e.g. "mean of the 12 monthly values");
   - interpretation: scientific reading, always hedged and clearly labelled as interpretation;
   - limitations: dataset limitations, uncertainty, and what the data cannot establish;
   - gaps: missing data.
4. Never claim that two images prove a trend. Never claim statistical significance or attribution.
5. Cite the source URLs exactly as they appear in the context, and only those.
6. Be concise: at most 5 bullets per section, each under 45 words.
7. Write in the requested language (English, Sinhala or Tamil) using correct scientific terminology.`;

function analystResponseSchema() {
  const section = {
    type: Type.OBJECT,
    properties: {
      kind: { type: Type.STRING, description: 'verified | derived | interpretation | limitations | gaps' },
      title: { type: Type.STRING },
      bullets: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ['kind', 'title', 'bullets']
  };
  return {
    type: Type.OBJECT,
    properties: {
      sections: { type: Type.ARRAY, items: section },
      sources: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING },
            url: { type: Type.STRING },
            detail: { type: Type.STRING }
          },
          required: ['label', 'url']
        }
      }
    },
    required: ['sections']
  };
}

earthRouter.post('/analyst', rateLimit('analyst', 20, 5 * 60_000), async (req, res) => {
  const { question, context, lang = 'en' } = req.body || {};
  if (!question || typeof question !== 'string' || question.length > 800) {
    return res.status(400).json({ ok: false, code: 'invalid-question', message: 'A question of up to 800 characters is required.' });
  }
  if (!context || typeof context !== 'object') {
    return res.status(400).json({ ok: false, code: 'missing-context', message: 'A retrieved-data context bundle is required.' });
  }

  const languageName = ({ en: 'English', si: 'Sinhala (සිංහල)', ta: 'Tamil (தமிழ்)' } as Record<string, string>)[String(lang)] || 'English';

  if (!aiClient) {
    return res.status(200).json({
      ok: false,
      code: 'ai-not-configured',
      status: 'not-configured',
      message: 'No GEMINI_API_KEY is configured on the server, so no model-generated interpretation is available. Use the local deterministic analysis instead.',
      provider: 'local'
    });
  }

  try {
    const response = await aiClient.models.generateContent({
      model: ANALYST_MODEL,
      contents: `Question from the user (answer in ${languageName}):\n\n${question}\n\nRetrieved data context (JSON, the only allowed source of facts):\n${JSON.stringify(
        context
      )}`,
      config: {
        systemInstruction: ANALYST_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: analystResponseSchema(),
        temperature: 0.2
      }
    });

    const text = response.text || '';
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(502).json({
        ok: false,
        code: 'ai-unparsable',
        status: 'error',
        message: 'The model response could not be parsed as structured JSON. The local deterministic analysis is available instead.'
      });
    }

    const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];
    if (!sections.length) {
      return res.status(502).json({
        ok: false,
        code: 'ai-empty',
        status: 'error',
        message: 'The model returned no answer sections. The local deterministic analysis is available instead.'
      });
    }

    // Guardrail: only URLs that exist in the supplied context survive.
    const allowedUrls = new Set<string>();
    JSON.stringify(context).replace(/"(https?:\/\/[^"]+)"/g, (match, url) => {
      allowedUrls.add(url);
      return match;
    });
    const rawSources = Array.isArray(parsed?.sources) ? parsed.sources : [];
    const sources = rawSources
      .filter((source: any) => source && typeof source.url === 'string')
      .map((source: any) => ({
        label: String(source.label || source.url),
        url: String(source.url),
        detail: source.detail ? String(source.detail) : undefined,
        verifiedInContext: allowedUrls.has(String(source.url))
      }));

    return res.json({
      ok: true,
      provider: 'ai',
      model: ANALYST_MODEL,
      generatedAt: new Date().toISOString(),
      groundedInRetrievedData: true,
      groundingMode: 'retrieved-context-only',
      sections: sections.map((section: any) => ({
        kind: ['verified', 'derived', 'interpretation', 'limitations', 'gaps'].includes(section.kind) ? section.kind : 'interpretation',
        title: String(section.title || 'Interpretation'),
        bullets: Array.isArray(section.bullets) ? section.bullets.map((bullet: unknown) => String(bullet)).slice(0, 6) : []
      })),
      sources,
      droppedSources: sources.filter((source: any) => source.verifiedInContext === false).length
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      code: 'ai-error',
      status: 'error',
      message: `The AI analyst call failed (${(error as Error)?.message || 'unknown error'}). The local deterministic analysis is available instead.`
    });
  }
});
