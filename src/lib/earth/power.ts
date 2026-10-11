/**
 * NASA POWER monthly archive client (keyless, public).
 *
 * Service: https://power.larc.nasa.gov/api/temporal/monthly/point
 * Only parameter codes that POWER's public parameter dictionary lists are
 * requested. The client degrades gracefully: if the service rejects the full
 * parameter set it retries the conservative core set, and any parameter that
 * comes back without usable values is reported to the user as unavailable
 * instead of being silently dropped.
 *
 * POWER values are satellite/re-analysis grid estimates for the ~0.5° x 0.625°
 * grid cell containing the request point — not weather-station measurements.
 */

import { cacheGet, cacheSet, TTL } from './cache';
import type { PowerDataset, PowerMonthlyRow, PowerParameterMeta, PowerSeriesStats, Provenance, Sourced } from './types';

export const POWER_MONTHLY_POINT_URL = 'https://power.larc.nasa.gov/api/temporal/monthly/point';

/** Values at or below this are POWER's fill/no-data sentinel. */
export const POWER_FILL_VALUE_THRESHOLD = -900;

/** Conservative parameter set requested first. */
export const POWER_PARAMETERS: PowerParameterMeta[] = [
  {
    code: 'T2M',
    label: 'Air temperature at 2 m',
    unit: '°C',
    kind: 'temperature',
    core: true,
    notes: 'Monthly mean of the 2 m air temperature estimate for the POWER grid cell.'
  },
  {
    code: 'PRECTOTCORR',
    label: 'Precipitation',
    unit: 'mm/day',
    kind: 'precipitation',
    core: true,
    notes: 'Bias-corrected total precipitation rate. Multiply by the days in the month for a monthly total in mm.'
  },
  {
    code: 'RH2M',
    label: 'Relative humidity at 2 m',
    unit: '%',
    kind: 'humidity',
    core: false,
    notes: 'Monthly mean relative humidity estimate.'
  },
  {
    code: 'WS2M',
    label: 'Wind speed at 2 m',
    unit: 'm/s',
    kind: 'wind',
    core: false,
    notes: 'Monthly mean wind speed at 2 m above the surface.'
  },
  {
    code: 'ALLSKY_SFC_SW_DWN',
    label: 'All-sky surface shortwave irradiance',
    unit: 'kWh/m²/day',
    kind: 'radiation',
    core: false,
    notes: 'Solar energy reaching the surface including cloud effects.'
  },
  {
    code: 'T2M_MAX',
    label: 'Maximum air temperature at 2 m',
    unit: '°C',
    kind: 'temperature',
    core: false,
    notes: 'Monthly mean of the daily maximum 2 m air temperature.'
  },
  {
    code: 'T2M_MIN',
    label: 'Minimum air temperature at 2 m',
    unit: '°C',
    kind: 'temperature',
    core: false,
    notes: 'Monthly mean of the daily minimum 2 m air temperature.'
  }
];

export const CORE_PARAMETER_CODES = POWER_PARAMETERS.filter((p) => p.core).map((p) => p.code);

export function parameterMeta(code: string): PowerParameterMeta | undefined {
  return POWER_PARAMETERS.find((p) => p.code === code);
}

/** Default span: the last 20 complete years (the POWER monthly archive starts in 1981). */
export const EARLIEST_POWER_YEAR = 1981;

export function clampYear(year: number): number {
  const current = new Date().getFullYear();
  if (year < EARLIEST_POWER_YEAR) return EARLIEST_POWER_YEAR;
  if (year > current) return current;
  return year;
}

export function buildPowerUrl(
  latitude: number,
  longitude: number,
  parameters: string[],
  startYear: number,
  endYear: number
): string {
  const params = new URLSearchParams({
    parameters: parameters.join(','),
    community: 'RE',
    longitude: longitude.toFixed(4),
    latitude: latitude.toFixed(4),
    start: String(clampYear(startYear)),
    end: String(clampYear(endYear)),
    format: 'JSON'
  });
  return `${POWER_MONTHLY_POINT_URL}?${params.toString()}`;
}

/** Raised when POWER refuses the request; `parametersRejected` flags a 400 on the parameter list. */
export class PowerRequestError extends Error {
  status: number;
  parametersRejected: boolean;
  constructor(message: string, status: number, parametersRejected: boolean) {
    super(message);
    this.name = 'PowerRequestError';
    this.status = status;
    this.parametersRejected = parametersRejected;
  }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Parse one POWER parameter object ({ 'YYYYMM': value }) into an ordered map. */
export function parseParameter(raw: unknown): Map<string, number> {
  const byMonth = new Map<string, number>();
  if (!raw || typeof raw !== 'object') return byMonth;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const match = /^(\d{4})(0[1-9]|1[0-2])$/.exec(key);
    if (!match) continue; // month '13' is POWER's annual aggregate and is recomputed here
    const num = Number(value);
    if (!Number.isFinite(num) || num <= POWER_FILL_VALUE_THRESHOLD) continue;
    byMonth.set(key, num);
  }
  return byMonth;
}

export function meanOf(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

/**
 * Least-squares slope of annual means. Returns null when fewer than two
 * complete years are available — a "trend" from a single year is meaningless.
 */
export function leastSquaresTrend(
  annual: Array<{ year: number; mean: number | null; complete: boolean }>
): { slopePerYear: number; fromYear: number; toYear: number; years: number } | null {
  const points = annual.filter((entry) => entry.complete && typeof entry.mean === 'number') as Array<{ year: number; mean: number; complete: boolean }>;
  if (points.length < 2) return null;
  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.year, 0);
  const sumY = points.reduce((sum, point) => sum + point.mean, 0);
  const sumXY = points.reduce((sum, point) => sum + point.year * point.mean, 0);
  const sumXX = points.reduce((sum, point) => sum + point.year * point.year, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denominator;
  return {
    slopePerYear: slope,
    fromYear: points[0].year,
    toYear: points[points.length - 1].year,
    years: n
  };
}

export interface ParsedPowerResponse {
  rows: PowerMonthlyRow[];
  available: string[];
  unavailable: string[];
  elevationMeters: number | null;
  serviceTitle?: string;
  serviceVersion?: string;
  cellCoordinates?: [number, number];
}

/** Convert a POWER JSON payload into rows plus availability information. */
export function parsePowerResponse(payload: unknown, requested: string[]): ParsedPowerResponse {
  const root = (payload || {}) as Record<string, any>;
  const parameterBlock: Record<string, unknown> = root?.properties?.parameter || {};
  const header = root?.header || {};

  const parsed = new Map<string, Map<string, number>>();
  for (const code of requested) {
    const months = parseParameter(parameterBlock[code]);
    if (months.size) parsed.set(code, months);
  }

  const available = requested.filter((code) => parsed.has(code));
  const unavailable = requested.filter((code) => !parsed.has(code));

  const months = new Set<string>();
  parsed.forEach((byMonth) => byMonth.forEach((_value, key) => months.add(key)));

  const rows: PowerMonthlyRow[] = [...months]
    .sort()
    .map((key) => {
      const year = Number(key.slice(0, 4));
      const month = Number(key.slice(4, 6));
      const values: Record<string, number | null> = {};
      for (const code of requested) {
        const raw = parsed.get(code)?.get(key);
        values[code] = typeof raw === 'number' ? Number(raw.toFixed(3)) : null;
      }
      return { date: `${key.slice(0, 4)}-${key.slice(4, 6)}`, year, month, values };
    });

  const coordinates = root?.geometry?.coordinates;
  const elevation =
    Array.isArray(coordinates) && coordinates.length > 2 && Number.isFinite(Number(coordinates[2]))
      ? Number(coordinates[2])
      : null;

  return {
    rows,
    available,
    unavailable,
    elevationMeters: elevation,
    serviceTitle: header?.title ? String(header.title) : undefined,
    serviceVersion: header?.version ? String(header.version) : undefined,
    cellCoordinates: Array.isArray(coordinates) && coordinates.length >= 2
      ? [Number(coordinates[0]), Number(coordinates[1])]
      : undefined
  };
}

/** Build per-parameter statistics (mean, extremes, annual aggregates, descriptive trend). */
export function buildSeriesStats(rows: PowerMonthlyRow[], code: string, unit: string): PowerSeriesStats {
  const valid = rows.filter((row) => typeof row.values[code] === 'number');
  const values = valid.map((row) => row.values[code] as number);

  const mean = meanOf(values);
  let min: PowerSeriesStats['min'] = null;
  let max: PowerSeriesStats['max'] = null;
  valid.forEach((row) => {
    const value = row.values[code] as number;
    if (!min || value < min.value) min = { value, date: row.date };
    if (!max || value > max.value) max = { value, date: row.date };
  });

  const byYear = new Map<number, { values: number[]; months: number; total: number }>();
  rows.forEach((row) => {
    if (!byYear.has(row.year)) byYear.set(row.year, { values: [], months: 0, total: 0 });
    const bucket = byYear.get(row.year)!;
    bucket.months += 1;
    const value = row.values[code];
    if (typeof value === 'number') {
      bucket.values.push(value);
      bucket.total += value;
    }
  });

  const annual = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, bucket]) => ({
      year,
      mean: meanOf(bucket.values),
      total: bucket.values.length === 12 ? Number(bucket.total.toFixed(1)) : null,
      complete: bucket.values.length === 12
    }));

  return {
    code,
    unit,
    count: values.length,
    mean: mean === null ? null : Number(mean.toFixed(3)),
    min,
    max,
    trend: leastSquaresTrend(annual),
    annual
  };
}

export interface FetchPowerArgs {
  latitude: number;
  longitude: number;
  startYear: number;
  endYear: number;
  placeLabel: string;
  /** Subset of POWER_PARAMETERS codes; defaults to all configured parameters. */
  parameters?: string[];
  signal?: AbortSignal;
  /** Skip cache (used by the explicit Refresh control). */
  force?: boolean;
}

const GRID_NOTE =
  'POWER returns the grid cell containing the request point (≈0.5° x 0.625°). Values are satellite/re-analysis estimates, not station measurements.';

function buildDataset(args: {
  latitude: number;
  longitude: number;
  placeLabel: string;
  startYear: number;
  endYear: number;
  requested: string[];
  usedParameters: string[];
  parsed: ParsedPowerResponse;
  sourceUrl: string;
  retrievedAt: string;
  fromCache: boolean;
}): Sourced<PowerDataset> {
  const stats: Record<string, PowerSeriesStats> = {};
  for (const code of args.parsed.available) {
    stats[code] = buildSeriesStats(args.parsed.rows, code, parameterMeta(code)?.unit || '');
  }

  const dataset: PowerDataset = {
    latitude: args.latitude,
    longitude: args.longitude,
    placeLabel: args.placeLabel,
    rows: args.parsed.rows,
    available: args.parsed.available,
    unavailable: args.parsed.unavailable,
    requestedParameters: args.usedParameters,
    startYear: args.startYear,
    endYear: args.endYear,
    elevationMeters: args.parsed.elevationMeters,
    gridNote: GRID_NOTE,
    serviceTitle: args.parsed.serviceTitle,
    serviceVersion: args.parsed.serviceVersion,
    stats
  };

  return {
    data: dataset,
    status: args.fromCache ? 'cached' : 'live',
    provenance: {
      dataset: 'NASA POWER monthly climate & land-surface archive',
      provider: 'NASA Prediction Of Worldwide Energy Resources (POWER)',
      datasetId: `POWER monthly point ${args.usedParameters.join('+')}`,
      sourceUrl: args.sourceUrl,
      retrievedAt: args.retrievedAt,
      observationDate: dataset.rows.length ? `${dataset.rows[0].date} → ${dataset.rows[dataset.rows.length - 1].date}` : undefined,
      coverage: `${args.startYear}–${args.endYear}`,
      resolution: '≈0.5° × 0.625° grid cell',
      fromCache: args.fromCache,
      note: GRID_NOTE
    }
  };
}

/**
 * Server-proxied POWER request (`/api/earth/power`). Returns null when the app is
 * hosted statically or the endpoint is unavailable, so the caller can fall back
 * to the direct public service call.
 */
async function fetchPowerViaServer(args: FetchPowerArgs, requested: string[]): Promise<Sourced<PowerDataset> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  const onAbort = () => controller.abort();
  args.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const params = new URLSearchParams({
      latitude: String(args.latitude),
      longitude: String(args.longitude),
      start: String(args.startYear),
      end: String(args.endYear),
      parameters: requested.join(',')
    });
    const response = await fetch(`/api/earth/power?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload?.ok || !payload.payload) return null;

    const used: string[] = Array.isArray(payload.usedParameters) ? payload.usedParameters : requested;
    const parsed = parsePowerResponse(payload.payload, used);
    if (!parsed.rows.length) return null;

    return buildDataset({
      latitude: args.latitude,
      longitude: args.longitude,
      placeLabel: args.placeLabel,
      startYear: clampYear(args.startYear),
      endYear: clampYear(args.endYear),
      requested,
      usedParameters: used,
      parsed,
      sourceUrl: String(payload.sourceUrl || 'https://power.larc.nasa.gov/api/temporal/monthly/point'),
      retrievedAt: String(payload.retrievedAt || new Date().toISOString()),
      fromCache: Boolean(payload.fromCache)
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    args.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Preferred entry point for the UI: server proxy first (validated + cached
 * server-side), then the direct public POWER service, then the local cache.
 */
export async function fetchPowerDataset(args: FetchPowerArgs): Promise<Sourced<PowerDataset>> {
  const requested = args.parameters?.length ? args.parameters : POWER_PARAMETERS.map((p) => p.code);
  const cacheKey = `power:${args.latitude.toFixed(3)}:${args.longitude.toFixed(3)}:${clampYear(args.startYear)}:${clampYear(
    args.endYear
  )}:${[...requested].sort().join(',')}`;

  if (!args.force) {
    const cached = cacheGet<Sourced<PowerDataset>>(cacheKey);
    if (cached) {
      return {
        ...cached.value,
        status: 'cached',
        provenance: { ...cached.value.provenance, fromCache: true, retrievedAt: cached.storedAt }
      };
    }
  }

  const viaServer = await fetchPowerViaServer(args, requested);
  if (viaServer) {
    cacheSet(cacheKey, viaServer, TTL.power);
    return viaServer;
  }

  const direct = await fetchPowerMonthly(args);
  if (direct.data) cacheSet(cacheKey, direct, TTL.power);
  return direct;
}

/**
 * Fetch the monthly archive directly from POWER. Tries the full parameter set
 * and falls back to the core set when POWER rejects the parameter list.
 */
export async function fetchPowerMonthly(args: FetchPowerArgs): Promise<Sourced<PowerDataset>> {
  const requested = args.parameters?.length ? args.parameters : POWER_PARAMETERS.map((p) => p.code);
  const startYear = clampYear(args.startYear);
  const endYear = clampYear(args.endYear);
  const cacheKey = `power:${args.latitude.toFixed(3)}:${args.longitude.toFixed(3)}:${startYear}:${endYear}:${[...requested].sort().join(',')}`;

  const provenanceBase: Omit<Provenance, 'retrievedAt' | 'sourceUrl'> = {
    dataset: 'NASA POWER monthly climate & land-surface archive',
    provider: 'NASA Prediction Of Worldwide Energy Resources (POWER)',
    datasetId: `POWER monthly point ${requested.join('+')}`,
    coverage: `${startYear}–${endYear}`,
    resolution: '≈0.5° × 0.625° grid cell',
    note: GRID_NOTE
  };

  if (!args.force) {
    const cached = cacheGet<Sourced<PowerDataset>>(cacheKey);
    if (cached) {
      return {
        ...cached.value,
        status: 'cached',
        provenance: {
          ...cached.value.provenance,
          fromCache: true,
          retrievedAt: cached.storedAt,
          note: `${GRID_NOTE} Served from local cache (original retrieval ${cached.storedAt}).`
        }
      };
    }
  }

  const attempt = async (codes: string[]): Promise<ParsedPowerResponse> => {
    const url = buildPowerUrl(args.latitude, args.longitude, codes, startYear, endYear);
    const response = await fetch(url, { signal: args.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new PowerRequestError(
        `POWER request failed (HTTP ${response.status})${body ? `: ${body.slice(0, 120)}` : ''}`,
        response.status,
        response.status === 400 || /parameter/i.test(body)
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new PowerRequestError('POWER returned an unreadable JSON response.', response.status, false);
    }
    const parsed = parsePowerResponse(payload, codes);
    if (!parsed.rows.length) {
      throw new PowerRequestError('POWER returned no usable monthly values for this location.', response.status, false);
    }
    return parsed;
  };

  try {
    let parsed: ParsedPowerResponse;
    let usedParameters = requested;
    try {
      parsed = await attempt(requested);
    } catch (error) {
      const isParameterRejection = error instanceof PowerRequestError && error.parametersRejected;
      if (!isParameterRejection || requested.length <= CORE_PARAMETER_CODES.length) throw error;
      // Progressive degradation: ask for the smallest verified set instead of failing.
      usedParameters = CORE_PARAMETER_CODES;
      parsed = await attempt(usedParameters);
    }

    const result = buildDataset({
      latitude: args.latitude,
      longitude: args.longitude,
      placeLabel: args.placeLabel,
      startYear,
      endYear,
      requested,
      usedParameters,
      parsed,
      sourceUrl: buildPowerUrl(args.latitude, args.longitude, usedParameters, startYear, endYear),
      retrievedAt: new Date().toISOString(),
      fromCache: false
    });
    cacheSet(cacheKey, result, TTL.power);
    return result;
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    return {
      data: null,
      status: 'unavailable',
      error: (error as Error)?.message || 'POWER request failed.',
      provenance: {
        ...provenanceBase,
        sourceUrl: buildPowerUrl(args.latitude, args.longitude, requested, startYear, endYear),
        retrievedAt: new Date().toISOString()
      }
    };
  }
}
