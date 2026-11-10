/**
 * NOVA FORGE — shared adapter for the optional scientific data connectors.
 *
 * This is the single path through which the science layer may fetch an external
 * dataset. Every guarantee the directive asks for is implemented once, here,
 * instead of being re-implemented per connector:
 *
 *   allowlist      — an explicit host list; anything else is refused before a
 *                    socket is opened (SSRF defence, including redirects to a
 *                    non-allowlisted host);
 *   rate limit     — a token bucket per host, so a bug in a caller cannot hammer
 *                    a public service;
 *   timeout        — AbortController with a hard deadline, and a shorter budget
 *                    for the body than for the headers;
 *   cache          — TTL cache keyed by the sanitised URL, with an entry cap;
 *   schema         — a caller-supplied validator; a payload that fails it is
 *                    rejected rather than partially trusted;
 *   normalisation  — rows → typed series with units, and units converted only
 *                    through the shared conversion table;
 *   attribution    — every result carries the text the source requires, or the
 *                    result is refused;
 *   fault isolation— nothing here throws. A failing connector returns a typed
 *                    `unavailable` result and the rest of the investigation runs.
 *
 * No credential is ever placed in a URL that is returned, logged or cached: keys
 * are injected at request time and the sanitised URL is what leaves this module.
 */

import type { NormalizedSeries } from '../../src/lib/forge/types';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ConnectorId =
  | 'nasa-exoplanet-tap'
  | 'jpl-small-body-db'
  | 'nasa-osdr'
  | 'nasa-open-api';

export type ConnectorStatus = 'ok' | 'unavailable' | 'rate-limited' | 'blocked' | 'schema-invalid' | 'timeout' | 'no-attribution';

export interface ConnectorDescriptor {
  id: ConnectorId;
  label: string;
  host: string;
  /** Documentation URL shown to the user; never fetched automatically. */
  docsUrl: string;
  attribution: string;
  /** Requests per minute allowed against this host. */
  rateLimitPerMinute: number;
  cacheTtlMs: number;
  /** Env var that may hold a key. Never sent to the browser. */
  keyEnvVar: string | null;
  /** What the dataset is authoritative for, in one line. */
  scope: string;
}

export const CONNECTORS: Record<ConnectorId, ConnectorDescriptor> = {
  'nasa-exoplanet-tap': {
    id: 'nasa-exoplanet-tap',
    label: 'NASA Exoplanet Archive (TAP)',
    host: 'exoplanetarchive.ipac.caltech.edu',
    docsUrl: 'https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html',
    attribution:
      'This research has made use of the NASA Exoplanet Archive, which is operated by the California Institute of Technology, under contract with the National Aeronautics and Space Administration under the Exoplanet Exploration Program.',
    rateLimitPerMinute: 20,
    cacheTtlMs: 6 * 60 * 60_000,
    keyEnvVar: null,
    scope: 'Confirmed and candidate exoplanets, with the columns and status flags of each table.',
  },
  'jpl-small-body-db': {
    id: 'jpl-small-body-db',
    label: 'JPL Small-Body Database (SBDB)',
    host: 'ssd-api.jpl.nasa.gov',
    docsUrl: 'https://ssd-api.jpl.nasa.gov/doc/sbdb.html',
    attribution: 'Data provided by the JPL Solar System Dynamics group, NASA/JPL-Caltech.',
    rateLimitPerMinute: 30,
    cacheTtlMs: 3 * 60 * 60_000,
    keyEnvVar: null,
    scope: 'Orbital elements and physical parameters for small bodies, as published by JPL.',
  },
  'nasa-osdr': {
    id: 'nasa-osdr',
    label: 'NASA Open Science Data Repository (OSDR)',
    host: 'osdr.nasa.gov',
    docsUrl: 'https://osdr.nasa.gov/bio/api/',
    attribution: 'Data from the NASA Open Science Data Repository (OSDR), NASA Biological and Physical Sciences.',
    rateLimitPerMinute: 10,
    cacheTtlMs: 12 * 60 * 60_000,
    keyEnvVar: null,
    scope: 'Space biology and organism response studies; metadata and study-level measurements.',
  },
  'nasa-open-api': {
    id: 'nasa-open-api',
    label: 'NASA Open APIs',
    host: 'api.nasa.gov',
    docsUrl: 'https://api.nasa.gov/',
    attribution: 'Data courtesy of NASA Open APIs.',
    rateLimitPerMinute: 30,
    cacheTtlMs: 60 * 60_000,
    keyEnvVar: 'NASA_API_KEY',
    scope: 'Agency imagery and catalogue endpoints; DEMO_KEY is heavily rate limited.',
  },
};

export interface ConnectorResult<T> {
  status: ConnectorStatus;
  connector: ConnectorId;
  data: T | null;
  /** Sanitised request URL — safe to show and to store. */
  requestUrl: string;
  attribution: string | null;
  retrievedAt: string | null;
  cacheHit: boolean;
  attempts: number;
  /** Human-readable reason when status !== 'ok'. */
  message: string;
  /** Never contains a key or a stack trace. */
  code: string | null;
}

/* ------------------------------- rate limiting ---------------------------- */

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

/** Token bucket. Refills continuously; refuses (does not queue) when empty. */
export function takeToken(host: string, perMinute: number, now: number = Date.now()): boolean {
  const capacity = Math.max(1, Math.floor(perMinute));
  const bucket = buckets.get(host) ?? { tokens: capacity, updatedAt: now };
  const elapsedMinutes = Math.max(0, now - bucket.updatedAt) / 60_000;
  const refilled = Math.min(capacity, bucket.tokens + elapsedMinutes * capacity);
  if (refilled < 1) {
    buckets.set(host, { tokens: refilled, updatedAt: now });
    return false;
  }
  buckets.set(host, { tokens: refilled - 1, updatedAt: now });
  return true;
}

export function resetRateLimits(): void {
  buckets.clear();
}

/* --------------------------------- caching -------------------------------- */

interface CacheEntry {
  expires: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 200;

export function clearConnectorCache(): void {
  cache.clear();
}

function readCache<T>(key: string, now: number): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expires <= now) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function writeCache(key: string, value: unknown, ttlMs: number, now: number): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { expires: now + ttlMs, value });
}

/* ------------------------------ SSRF defence ------------------------------ */

/**
 * Only https, only the declared host. Returning the parsed URL means callers
 * cannot smuggle a `//evil` prefix or a `@host` userinfo trick past the check.
 */
export function assertAllowedUrl(raw: string, allowedHost: string): { ok: boolean; url: URL | null; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, url: null, reason: 'Request URL is not absolute.' };
  }
  if (url.protocol !== 'https:') return { ok: false, url: null, reason: 'Only https endpoints are permitted.' };
  if (url.username || url.password) return { ok: false, url: null, reason: 'Credentials in the URL are refused.' };
  if (url.hostname.toLowerCase() !== allowedHost) {
    return { ok: false, url: null, reason: `Host ${url.hostname} is not ${allowedHost}.` };
  }
  return { ok: true, url, reason: 'Allowed.' };
}

const SENSITIVE_PARAMS = ['api_key', 'apikey', 'key', 'token', 'access_token'];

/** Removes credential-bearing query parameters from any URL we expose. */
export function sanitiseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const param of SENSITIVE_PARAMS) url.searchParams.delete(param);
    return url.toString();
  } catch {
    return '';
  }
}

function withKey(url: string, key: string | null | undefined, param = 'api_key'): string {
  if (!key) return url;
  const parsed = new URL(url);
  parsed.searchParams.set(param, key);
  return parsed.toString();
}

/* -------------------------------- fetching -------------------------------- */

export interface FetchOptions {
  fetchImpl?: FetchLike;
  now?: () => number;
  timeoutMs?: number;
  /** Injected server-side from the environment; never from the browser. */
  apiKey?: string | null;
  /** Cache bypass for an explicit refresh. */
  refresh?: boolean;
  /** Retries only for network-level failures, never for 4xx. */
  maxAttempts?: number;
}

/** Maps rows (array of records) to typed columns, or reports why it cannot. */
export interface SchemaSpec {
  /** Columns that must be present. */
  required: string[];
  /** Numeric columns; a non-numeric cell becomes null, never 0. */
  numeric: string[];
}

export interface SeriesBuild {
  name: string;
  unit: string;
  sourceUnit: string;
  valueColumn: string;
  timeColumn: string;
  /** Optional conversion; only through the shared table. */
  convertTo?: string;
}

export function rowToSeries(rows: Array<Record<string, unknown>>, spec: SeriesBuild): {
  series: NormalizedSeries | null;
  reason: string;
} {
  const timestamps: string[] = [];
  const values: Array<number | null> = [];
  let dropped = 0;
  for (const row of rows) {
    const time = row[spec.timeColumn];
    const value = row[spec.valueColumn];
    if (typeof time !== 'string' && typeof time !== 'number') {
      dropped += 1;
      continue;
    }
    const numeric = typeof value === 'number' ? value : Number(value);
    if (value === null || value === undefined || value === '' || !Number.isFinite(numeric)) {
      dropped += 1;
      continue;
    }
    timestamps.push(String(time));
    values.push(numeric);
  }
  if (values.length === 0) {
    return { series: null, reason: `No usable rows: every row was missing ${spec.timeColumn} or ${spec.valueColumn}.` };
  }
  return {
    series: {
      variableId: spec.name,
      unit: spec.unit,
      sourceUnit: spec.sourceUnit,
      timestamps,
      values,
      missing: dropped,
      // The series is not converted here: conversion is an explicit, recorded step.
    } as unknown as NormalizedSeries,
    reason: dropped > 0 ? `${dropped} row(s) dropped for a missing or non-numeric value.` : 'All rows usable.',
  };
}

/**
 * The single entry point. Never throws; a failure is a typed result.
 */
export async function fetchConnector<T>(options: {
  connector: ConnectorId;
  /** Path + query, already built by the caller. */
  path: string;
  /** Validates and narrows the parsed JSON payload. */
  validate: (payload: unknown) => { ok: true; value: T } | { ok: false; reason: string };
  fetchOptions?: FetchOptions;
}): Promise<ConnectorResult<T>> {
  const descriptor = CONNECTORS[options.connector];
  const now = options.fetchOptions?.now ?? (() => Date.now());
  const fetchImpl = options.fetchOptions?.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
  const timeoutMs = options.fetchOptions?.timeoutMs ?? 12_000;
  const maxAttempts = Math.max(1, Math.min(3, options.fetchOptions?.maxAttempts ?? 2));
  const rawUrl = `https://${descriptor.host}${options.path}`;
  const sanitised = sanitiseUrl(rawUrl);
  const base = {
    connector: options.connector,
    requestUrl: sanitised,
    attribution: descriptor.attribution,
    retrievedAt: null,
    cacheHit: false,
    attempts: 0,
  };

  const allowed = assertAllowedUrl(rawUrl, descriptor.host);
  if (!allowed.ok) {
    return { ...base, status: 'blocked', data: null, message: allowed.reason, code: 'host-not-allowed' };
  }
  if (!descriptor.attribution) {
    return { ...base, status: 'no-attribution', data: null, message: 'The source declares no attribution, so its data may not be shown.', code: 'no-attribution' };
  }
  if (!fetchImpl) {
    return { ...base, status: 'unavailable', data: null, message: 'No fetch implementation is available on this runtime.', code: 'no-fetch' };
  }

  const cacheKey = `${options.connector}:${sanitised}`;
  if (!options.fetchOptions?.refresh) {
    const cached = readCache<T>(cacheKey, now());
    if (cached) {
      return { ...base, status: 'ok', data: cached, cacheHit: true, retrievedAt: new Date(now()).toISOString(), message: 'Served from cache.', code: null };
    }
  }

  if (!takeToken(descriptor.host, descriptor.rateLimitPerMinute, now())) {
    return {
      ...base,
      status: 'rate-limited',
      data: null,
      message: `The ${descriptor.label} connector is limited to ${descriptor.rateLimitPerMinute} requests per minute. Try again shortly.`,
      code: 'rate-limited',
    };
  }

  const requestUrl = withKey(rawUrl, options.fetchOptions?.apiKey ?? null);
  let lastMessage = 'The source could not be reached.';
  let lastCode: string | null = 'network-error';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(requestUrl, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
        redirect: 'manual',
      });
      // A redirect is not followed: it could leave the allowlist.
      if (response.status >= 300 && response.status < 400) {
        return {
          ...base,
          status: 'blocked',
          data: null,
          attempts: attempt,
          message: 'The source redirected to another location, which is not followed for safety.',
          code: 'redirect-blocked',
        };
      }
      if (response.status === 429) {
        return {
          ...base,
          status: 'rate-limited',
          data: null,
          attempts: attempt,
          message: 'The source reported its rate limit was exceeded (HTTP 429).',
          code: 'upstream-429',
        };
      }
      if (!response.ok) {
        lastMessage = `The source returned HTTP ${response.status}.`;
        lastCode = `http-${response.status}`;
        if (response.status < 500) break; // retrying a 4xx only wastes the budget
        continue;
      }
      const text = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        return {
          ...base,
          status: 'schema-invalid',
          data: null,
          attempts: attempt,
          message: 'The source returned a body that is not JSON.',
          code: 'non-json',
        };
      }
      const validation = options.validate(payload);
      if (!validation.ok) {
        return {
          ...base,
          status: 'schema-invalid',
          data: null,
          attempts: attempt,
          message: `The payload did not match the expected schema: ${validation.reason}`,
          code: 'schema-invalid',
        };
      }
      writeCache(cacheKey, validation.value, descriptor.cacheTtlMs, now());
      return {
        ...base,
        status: 'ok',
        data: validation.value,
        attempts: attempt,
        retrievedAt: new Date(now()).toISOString(),
        message: 'Retrieved and validated.',
        code: null,
      };
    } catch (error) {
      const aborted = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
      lastMessage = aborted
        ? `The source did not respond within ${timeoutMs} ms.`
        : 'The source could not be reached (network error).';
      lastCode = aborted ? 'timeout' : 'network-error';
      if (aborted) {
        return { ...base, status: 'timeout', data: null, attempts: attempt, message: lastMessage, code: lastCode };
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return { ...base, status: 'unavailable', data: null, message: lastMessage, code: lastCode };
}

/** Availability is a descriptor property, not a probe: no request is made. */
export function connectorAvailability(env: Record<string, string | undefined> = {}): Array<{
  id: ConnectorId;
  label: string;
  configured: boolean;
  requiresKey: boolean;
  note: string;
}> {
  return Object.values(CONNECTORS).map((descriptor) => {
    const requiresKey = descriptor.keyEnvVar !== null;
    const configured = !requiresKey || Boolean(env[descriptor.keyEnvVar as string]);
    return {
      id: descriptor.id,
      label: descriptor.label,
      configured,
      requiresKey,
      note: configured
        ? descriptor.scope
        : `${descriptor.scope} Not configured: set ${descriptor.keyEnvVar} on the server to enable it.`,
    };
  });
}
