/**
 * NOVA HYPOTHESIS FORGE — NASA / NOAA data connectors (server only).
 *
 * Every connector:
 *  - calls an official endpoint documented in `src/lib/forge/vocab.ts`;
 *  - keeps the API key on the server and removes it from any URL that leaves
 *    this process (provenance, evidence, logs, error text);
 *  - has an explicit timeout, an in-memory cache and a per-source error code;
 *  - returns `unavailable` / `out-of-coverage` instead of substituting data.
 *
 * The connector layer performs no interpretation. It hands normalised series to
 * `orchestrator.ts`.
 */

import { buildPowerUrl } from '../../src/lib/earth/power.ts';
import { datasetById } from '../../src/lib/forge/vocab';
import type {
  DatasetResult,
  NormalizedSeries,
  ResearchPlan,
  ResearchRequest,
} from '../../src/lib/forge/types';
import {
  NormalisationError,
  normaliseApod,
  normaliseDonki,
  normaliseKp,
  normaliseMarsPhotos,
  normaliseNeoWs,
  normalisePower,
  normaliseSolarWind,
  normaliseTle,
  type AdapterInput,
} from '../../src/lib/forge/normalize';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ConnectorOptions {
  fetchImpl?: FetchLike;
  now?: () => Date;
  /** NASA API key. `null` means the caller decided not to call NASA. */
  nasaKey?: string | null;
  /** True when the key came from the environment rather than the shared DEMO_KEY. */
  nasaKeyIsShared?: boolean;
  timeoutMs?: number;
  cache?: Map<string, CacheEntry>;
}

export interface CacheEntry {
  expires: number;
  value: string;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_CACHE_ENTRIES = 200;

const TTL_MS: Record<string, number> = {
  'noaa-swpc-kp': 10 * 60_000,
  'noaa-swpc-solar-wind': 2 * 60_000,
  'nasa-donki': 30 * 60_000,
  'nasa-power': 6 * 60 * 60_000,
  'nasa-neows': 6 * 60 * 60_000,
  'nova-iss-tle': 30 * 60_000,
  'nasa-apod': 6 * 60 * 60_000,
  'nasa-mars-photos': 6 * 60 * 60_000,
};

export const DEFAULT_CACHE = new Map<string, CacheEntry>();

/** Remove credential-bearing query parameters before a URL is stored or shown. */
export function sanitiseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const name of ['api_key', 'apikey', 'key', 'apiKey']) parsed.searchParams.delete(name);
    return parsed.toString();
  } catch {
    return url.replace(/([?&])(api_key|apikey|key|apiKey)=[^&]*/gi, '$1').replace(/[?&]$/, '');
  }
}

function withNasaKey(url: string, key: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set('api_key', key);
  return parsed.toString();
}

interface FetchOutcome {
  ok: boolean;
  text: string;
  status: number;
  errorCode?: string;
  detail?: string;
  retrievedAt: string;
}

async function fetchText(
  url: string,
  options: ConnectorOptions,
  cacheKey: string,
  ttlMs: number,
): Promise<FetchOutcome> {
  const cache = options.cache ?? DEFAULT_CACHE;
  const nowMs = (options.now ?? (() => new Date()))().getTime();
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > nowMs) {
    return { ok: true, text: cached.value, status: 200, retrievedAt: new Date(nowMs).toISOString() };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const retrieveStart = nowMs;
  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        // NASA asks clients to identify themselves; no secret is included.
        'User-Agent': 'NOVA-Hypothesis-Forge/1.0 (NASA Space Explorer scientific investigation)',
      },
    });
    const text = await response.text();
    const retrievedAt = new Date().toISOString();
    if (!response.ok) {
      return {
        ok: false,
        text,
        status: response.status,
        errorCode: response.status === 429 ? 'SOURCE_RATE_LIMITED' : 'SOURCE_REJECTED',
        detail: `HTTP ${response.status}`,
        retrievedAt,
      };
    }
    if (cache.size > MAX_CACHE_ENTRIES) {
      for (const [key, entry] of cache) {
        if (entry.expires <= nowMs) cache.delete(key);
      }
    }
    cache.set(cacheKey, { expires: retrieveStart + ttlMs, value: text });
    return { ok: true, text, status: response.status, retrievedAt };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      text: '',
      status: 0,
      errorCode: aborted ? 'SOURCE_TIMEOUT' : 'SOURCE_NETWORK',
      detail: aborted ? 'request timed out' : 'network error',
      retrievedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new NormalisationError('Response was not valid JSON.');
  }
}

function unavailable(
  datasetId: string,
  detail: string,
  errorCode: string,
): DatasetResult {
  return {
    datasetId,
    status: 'unavailable',
    series: [],
    detail,
    errorCode,
    documentationUrl: datasetById(datasetId)?.documentationUrl ?? '',
  };
}

function adapterInput(outcome: FetchOutcome, url: string): AdapterInput {
  return {
    payload: parseJson(outcome.text),
    payloadText: outcome.text,
    retrievedAt: outcome.retrievedAt,
    sourceUrl: sanitiseUrl(url),
  };
}

function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(startIso: string, endIso: string): number {
  return Math.max(0, (Date.parse(endIso) - Date.parse(startIso)) / 86_400_000);
}

/* --------------------------------------------------------------- connectors */

async function kpConnector(options: ConnectorOptions): Promise<DatasetResult> {
  const dataset = datasetById('noaa-swpc-kp')!;
  const outcome = await fetchText(dataset.endpoint, options, 'kp-3h', TTL_MS['noaa-swpc-kp']);
  if (!outcome.ok) return unavailable('noaa-swpc-kp', outcome.detail ?? 'source unavailable', outcome.errorCode ?? 'SOURCE_UNAVAILABLE');
  try {
    const series = normaliseKp(adapterInput(outcome, dataset.endpoint));
    return { datasetId: dataset.id, status: 'live', series, documentationUrl: dataset.documentationUrl };
  } catch (error) {
    return unavailable(
      'noaa-swpc-kp',
      error instanceof Error ? error.message : 'payload could not be parsed',
      'SOURCE_INVALID_PAYLOAD',
    );
  }
}

async function solarWindConnector(options: ConnectorOptions): Promise<DatasetResult> {
  const dataset = datasetById('noaa-swpc-solar-wind')!;
  const magUrl = 'https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json';
  const plasmaUrl = 'https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json';
  const [mag, plasma] = await Promise.all([
    fetchText(magUrl, options, 'sw-mag-1d', TTL_MS['noaa-swpc-solar-wind']),
    fetchText(plasmaUrl, options, 'sw-plasma-1d', TTL_MS['noaa-swpc-solar-wind']),
  ]);
  if (!mag.ok && !plasma.ok) {
    return unavailable(
      'noaa-swpc-solar-wind',
      mag.detail ?? plasma.detail ?? 'source unavailable',
      mag.errorCode ?? plasma.errorCode ?? 'SOURCE_UNAVAILABLE',
    );
  }
  const series: NormalizedSeries[] = [];
  if (mag.ok) {
    try {
      series.push(
        ...normaliseSolarWind(adapterInput(mag, magUrl)).filter((entry) =>
          ['bz_gsm', 'bt'].includes(entry.variableId),
        ),
      );
    } catch {
      /* plasma may still succeed */
    }
  }
  if (plasma.ok) {
    try {
      series.push(
        ...normaliseSolarWind(adapterInput(plasma, plasmaUrl)).filter((entry) =>
          ['solar_wind_speed', 'proton_density'].includes(entry.variableId),
        ),
      );
    } catch {
      /* magnetometer series may still be usable */
    }
  }
  if (series.length === 0) {
    return unavailable('noaa-swpc-solar-wind', 'no solar-wind columns could be parsed', 'SOURCE_INVALID_PAYLOAD');
  }
  return {
    datasetId: dataset.id,
    status: mag.ok && plasma.ok ? 'live' : 'partial',
    series,
    detail: mag.ok && plasma.ok ? undefined : 'one of the two SWPC solar-wind tables was unavailable',
    errorCode: mag.ok && plasma.ok ? undefined : 'SOURCE_PARTIAL',
    documentationUrl: dataset.documentationUrl,
  };
}

async function donkiConnector(
  request: ResearchRequest,
  options: ConnectorOptions,
): Promise<DatasetResult> {
  const dataset = datasetById('nasa-donki')!;
  const key = options.nasaKey;
  if (!key) {
    return unavailable(
      'nasa-donki',
      'No NASA API key is configured on the server; the DONKI request was not sent.',
      'KEY_NOT_CONFIGURED',
    );
  }
  const now = (options.now ?? (() => new Date()))();
  const earliest = Date.parse('2008-01-01T00:00:00Z');
  const start = Math.max(Date.parse(request.timeRange.start), earliest);
  const end = Math.min(Date.parse(request.timeRange.end), now.getTime());
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < earliest || start > end) {
    return {
      datasetId: dataset.id,
      status: 'out-of-coverage',
      series: [],
      detail: 'DONKI events begin around 2008; the requested period is outside that archive.',
      errorCode: 'OUT_OF_COVERAGE',
      documentationUrl: dataset.documentationUrl,
    };
  }
  const startDate = dayString(new Date(start));
  const endDate = dayString(new Date(end));
  const notificationsUrl = `https://api.nasa.gov/DONKI/notifications?startDate=${startDate}&endDate=${endDate}&type=all`;
  const cmeUrl = `https://api.nasa.gov/DONKI/CME?startDate=${startDate}&endDate=${endDate}`;
  const [notifications, cme] = await Promise.all([
    fetchText(withNasaKey(notificationsUrl, key), options, `donki-n-${startDate}-${endDate}`, TTL_MS['nasa-donki']),
    fetchText(withNasaKey(cmeUrl, key), options, `donki-cme-${startDate}-${endDate}`, TTL_MS['nasa-donki']),
  ]);
  if (!notifications.ok && !cme.ok) {
    return unavailable(
      'nasa-donki',
      notifications.detail ?? cme.detail ?? 'DONKI unavailable',
      notifications.errorCode ?? cme.errorCode ?? 'SOURCE_UNAVAILABLE',
    );
  }
  try {
    const notificationInput = notifications.ok
      ? adapterInput(notifications, notificationsUrl)
      : { payload: [], payloadText: '', retrievedAt: notifications.retrievedAt, sourceUrl: sanitiseUrl(notificationsUrl) };
    const cmeInput = cme.ok ? adapterInput(cme, cmeUrl) : null;
    const { series, events } = normaliseDonki(notificationInput, cmeInput, request.language);
    if (series.length > 0) series[0].rawRecords = { notifications: notificationInput.payload, cme: cmeInput?.payload ?? [], events: events.length };
    return {
      datasetId: dataset.id,
      status: notifications.ok && cme.ok ? 'live' : 'partial',
      series,
      detail: notifications.ok && cme.ok ? undefined : 'one DONKI sub-request was unavailable',
      errorCode: notifications.ok && cme.ok ? undefined : 'SOURCE_PARTIAL',
      documentationUrl: dataset.documentationUrl,
    };
  } catch (error) {
    return unavailable(
      'nasa-donki',
      error instanceof Error ? error.message : 'DONKI payload could not be parsed',
      'SOURCE_INVALID_PAYLOAD',
    );
  }
}

async function powerConnector(
  request: ResearchRequest,
  options: ConnectorOptions,
): Promise<DatasetResult> {
  const dataset = datasetById('nasa-power')!;
  const { latitude, longitude } = request.region;
  if (latitude === null || longitude === null) {
    return unavailable(
      'nasa-power',
      'POWER needs a study area. No coordinates were named in the question, and NOVA will not choose one on your behalf.',
      'NO_REGION_COORDINATES',
    );
  }
  const startYear = new Date(request.timeRange.start).getUTCFullYear();
  const endYear = new Date(request.timeRange.end).getUTCFullYear();
  const url = buildPowerUrl(latitude, longitude, ['T2M', 'PRECTOTCORR'], startYear, endYear);
  const outcome = await fetchText(url, options, `power-${latitude}-${longitude}-${startYear}-${endYear}`, TTL_MS['nasa-power']);
  if (!outcome.ok) {
    return unavailable('nasa-power', outcome.detail ?? 'POWER unavailable', outcome.errorCode ?? 'SOURCE_UNAVAILABLE');
  }
  const series: NormalizedSeries[] = [];
  const errors: string[] = [];
  for (const variable of ['temperature', 'precipitation'] as const) {
    try {
      series.push(normalisePower(adapterInput(outcome, url), variable));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'parse failure');
    }
  }
  if (series.length === 0) {
    return unavailable('nasa-power', errors[0] ?? 'POWER payload could not be parsed', 'SOURCE_INVALID_PAYLOAD');
  }
  return {
    datasetId: dataset.id,
    status: series.length === 2 ? 'live' : 'partial',
    series,
    detail: errors.length ? `one parameter could not be parsed: ${errors[0]}` : undefined,
    documentationUrl: dataset.documentationUrl,
  };
}

async function neoWsConnector(
  request: ResearchRequest,
  options: ConnectorOptions,
): Promise<DatasetResult> {
  const dataset = datasetById('nasa-neows')!;
  const key = options.nasaKey;
  if (!key) {
    return unavailable('nasa-neows', 'No NASA API key is configured on the server.', 'KEY_NOT_CONFIGURED');
  }
  const now = (options.now ?? (() => new Date()))();
  const requestedStart = Date.parse(request.timeRange.start);
  const requestedEnd = Math.min(Date.parse(request.timeRange.end), now.getTime());
  if (!Number.isFinite(requestedStart) || requestedEnd < requestedStart) {
    return unavailable('nasa-neows', 'The requested period is not a valid date range.', 'INVALID_RANGE');
  }
  const windowDays = Math.min(7, Math.max(1, Math.ceil(daysBetween(request.timeRange.start, new Date(requestedEnd).toISOString()))));
  const windowStart = new Date(requestedEnd - windowDays * 86_400_000);
  const startDate = dayString(windowStart);
  const endDate = dayString(new Date(requestedEnd));
  const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${startDate}&end_date=${endDate}`;
  const outcome = await fetchText(withNasaKey(url, key), options, `neows-${startDate}-${endDate}`, TTL_MS['nasa-neows']);
  if (!outcome.ok) {
    return unavailable('nasa-neows', outcome.detail ?? 'NeoWs unavailable', outcome.errorCode ?? 'SOURCE_UNAVAILABLE');
  }
  try {
    const series = normaliseNeoWs(adapterInput(outcome, url));
    const truncated = daysBetween(request.timeRange.start, request.timeRange.end) > 7;
    return {
      datasetId: dataset.id,
      status: truncated ? 'partial' : 'live',
      series,
      detail: truncated
        ? `NeoWs accepts a 7-day window; only ${startDate} → ${endDate} of the requested period was queried.`
        : undefined,
      errorCode: truncated ? 'WINDOW_TRUNCATED' : undefined,
      documentationUrl: dataset.documentationUrl,
    };
  } catch (error) {
    return unavailable(
      'nasa-neows',
      error instanceof Error ? error.message : 'NeoWs payload could not be parsed',
      'SOURCE_INVALID_PAYLOAD',
    );
  }
}

async function tleConnector(options: ConnectorOptions): Promise<DatasetResult> {
  const dataset = datasetById('nova-iss-tle')!;
  const outcome = await fetchText(dataset.endpoint, options, 'iss-tle', TTL_MS['nova-iss-tle']);
  if (!outcome.ok) return unavailable('nova-iss-tle', outcome.detail ?? 'TLE feed unavailable', outcome.errorCode ?? 'SOURCE_UNAVAILABLE');
  try {
    return {
      datasetId: dataset.id,
      status: 'live',
      series: normaliseTle(adapterInput(outcome, dataset.endpoint)),
      documentationUrl: dataset.documentationUrl,
    };
  } catch (error) {
    return unavailable(
      'nova-iss-tle',
      error instanceof Error ? error.message : 'TLE payload could not be parsed',
      'SOURCE_INVALID_PAYLOAD',
    );
  }
}

async function apodConnector(
  request: ResearchRequest,
  options: ConnectorOptions,
): Promise<DatasetResult> {
  const dataset = datasetById('nasa-apod')!;
  const key = options.nasaKey;
  if (!key) return unavailable('nasa-apod', 'No NASA API key is configured on the server.', 'KEY_NOT_CONFIGURED');
  const date = request.timeRange.end.slice(0, 10);
  if (date < '1995-06-16') {
    return {
      datasetId: dataset.id,
      status: 'out-of-coverage',
      series: [],
      detail: 'APOD begins 1995-06-16.',
      errorCode: 'OUT_OF_COVERAGE',
      documentationUrl: dataset.documentationUrl,
    };
  }
  const url = `https://api.nasa.gov/planetary/apod?date=${date}`;
  const outcome = await fetchText(withNasaKey(url, key), options, `apod-${date}`, TTL_MS['nasa-apod']);
  if (!outcome.ok) return unavailable('nasa-apod', outcome.detail ?? 'APOD unavailable', outcome.errorCode ?? 'SOURCE_UNAVAILABLE');
  try {
    return {
      datasetId: dataset.id,
      status: 'live',
      series: normaliseApod(adapterInput(outcome, url)),
      documentationUrl: dataset.documentationUrl,
    };
  } catch (error) {
    return unavailable(
      'nasa-apod',
      error instanceof Error ? error.message : 'APOD payload could not be parsed',
      'SOURCE_INVALID_PAYLOAD',
    );
  }
}

async function marsPhotosConnector(
  request: ResearchRequest,
  options: ConnectorOptions,
): Promise<DatasetResult> {
  const dataset = datasetById('nasa-mars-photos')!;
  const key = options.nasaKey;
  if (!key) return unavailable('nasa-mars-photos', 'No NASA API key is configured on the server.', 'KEY_NOT_CONFIGURED');
  const date = request.timeRange.end.slice(0, 10);
  const url = `https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/photos?earth_date=${date}`;
  const outcome = await fetchText(withNasaKey(url, key), options, `mars-${date}`, TTL_MS['nasa-mars-photos']);
  if (!outcome.ok) {
    return unavailable('nasa-mars-photos', outcome.detail ?? 'Mars photo service unavailable', outcome.errorCode ?? 'SOURCE_UNAVAILABLE');
  }
  try {
    return {
      datasetId: dataset.id,
      status: 'live',
      series: normaliseMarsPhotos(adapterInput(outcome, url), date),
      documentationUrl: dataset.documentationUrl,
    };
  } catch (error) {
    return unavailable(
      'nasa-mars-photos',
      error instanceof Error ? error.message : 'Mars photo payload could not be parsed',
      'SOURCE_INVALID_PAYLOAD',
    );
  }
}

/* ------------------------------------------------------------- entry point */

/**
 * Retrieve every compatible dataset in the plan. Sources are independent: a
 * failure in one is recorded and the rest continue.
 */
export async function retrieveDatasets(
  request: ResearchRequest,
  plan: ResearchPlan,
  options: ConnectorOptions = {},
): Promise<DatasetResult[]> {
  const targets = plan.datasets.filter((dataset) => dataset.compatible);
  const tasks: Array<Promise<DatasetResult>> = [];

  for (const target of targets) {
    if (target.coverage === 'out-of-coverage') {
      const dataset = datasetById(target.datasetId);
      tasks.push(
        Promise.resolve({
          datasetId: target.datasetId,
          status: 'out-of-coverage' as const,
          series: [],
          detail: target.coverageDetail,
          errorCode: 'OUT_OF_COVERAGE',
          documentationUrl: dataset?.documentationUrl ?? target.documentationUrl,
        }),
      );
      continue;
    }
    switch (target.datasetId) {
      case 'noaa-swpc-kp':
        tasks.push(kpConnector(options));
        break;
      case 'noaa-swpc-solar-wind':
        tasks.push(solarWindConnector(options));
        break;
      case 'nasa-donki':
        tasks.push(donkiConnector(request, options));
        break;
      case 'nasa-power':
        tasks.push(powerConnector(request, options));
        break;
      case 'nasa-neows':
        tasks.push(neoWsConnector(request, options));
        break;
      case 'nova-iss-tle':
        tasks.push(tleConnector(options));
        break;
      case 'nasa-apod':
        tasks.push(apodConnector(request, options));
        break;
      case 'nasa-mars-photos':
        tasks.push(marsPhotosConnector(request, options));
        break;
      default:
        tasks.push(
          Promise.resolve(unavailable(target.datasetId, 'No connector implemented for this dataset.', 'NOT_IMPLEMENTED')),
        );
    }
  }

  const results = await Promise.all(tasks);

  // Datasets that were not compatible are reported, not silently omitted.
  for (const target of plan.datasets) {
    if (target.compatible) continue;
    results.push({
      datasetId: target.datasetId,
      status: 'not-requested',
      series: [],
      detail: target.reason,
      errorCode: 'NOT_COMPATIBLE',
      documentationUrl: target.documentationUrl,
    });
  }

  return results;
}
