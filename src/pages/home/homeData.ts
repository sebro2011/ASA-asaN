/**
 * Home page data access.
 *
 * Every loader here returns an explicit provenance state so the interface can
 * say what it is showing. Nothing is invented: if a service is unreachable the
 * loader either throws (→ error state) or returns sample data with
 * `state: 'static'` and the UI labels it as such.
 */

export type Provenance = 'live' | 'cached' | 'static' | 'simulated' | 'derived' | 'unavailable';

export interface Sourced<T> {
  data: T;
  state: Provenance;
  note?: string;
  retrievedAt: string;
}

/**
 * The browser must wait longer than the server's own worst case, or it aborts a
 * request the server was still going to answer. NeoWs is the case that matters:
 * `/api/asteroids/neows` may spend 12 s on NeoWs and then 8 s on the JPL fallback
 * before it replies, so a 15 s client budget marked the tile UNAVAILABLE while the
 * server was still working — and the JPL data it eventually produced was thrown
 * away. The server's cap is 20 s; this budget leaves room for a cold start and a
 * slow response body, and stays under the function's 30 s limit.
 */
export const NEOWS_CLIENT_BUDGET_MS = 26_000;

async function getJson<T>(url: string, signal: AbortSignal, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

/* ----------------------------------------------------------------- APOD */

export interface Apod {
  date: string;
  title: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: 'image' | 'video' | 'other' | string;
  copyright?: string;
  thumbnail_url?: string;
  service_version?: string;
  source?: string;
  source_url?: string;
}

export async function loadApod(signal: AbortSignal): Promise<Sourced<Apod>> {
  const payload = await getJson<{
    success?: boolean;
    data?: Apod;
    isFallback?: boolean;
    cached?: boolean;
    fallbackReason?: 'network' | 'rate-limited' | 'upstream' | 'shape' | 'degraded';
    keySource?: 'DEMO_KEY' | 'configured';
  }>('/api/apod', signal, 18000);
  const apod = payload?.data;
  if (!apod?.title || !apod?.url) throw new Error('APOD service returned an incomplete record');
  return {
    data: apod,
    state: payload.isFallback ? 'static' : payload.cached ? 'cached' : 'live',
    note: payload.isFallback
      ? payload.fallbackReason === 'degraded'
        ? 'NASA answered with its own site logo instead of the day\u2019s image, so a curated archival image is shown. It is not today\u2019s official APOD.'
        : payload.fallbackReason === 'rate-limited'
        ? payload.keySource === 'DEMO_KEY'
          ? 'The shared NASA DEMO_KEY is rate-limited, so a curated archival image is shown. It is not today’s official APOD; setting NASA_API_KEY restores the live feed.'
          : 'The NASA API rejected the request (rate limit or quota), so a curated archival image is shown. It is not today’s official APOD.'
        : 'The NASA APOD service did not respond, so a curated archival image is shown. It is not today’s official APOD.'
      : undefined,
    retrievedAt: new Date().toISOString()
  };
}

/* -------------------------------------------------------------------- ISS */

export interface IssPosition {
  latitude: number;
  longitude: number;
  altitude: number | null;
  velocity: number | null;
  visibility?: string;
  timestamp: number | null;
}

export async function loadIss(signal: AbortSignal): Promise<Sourced<IssPosition>> {
  const payload = await getJson<{
    success?: boolean;
    data?: Record<string, unknown>;
    simulated?: boolean;
    /** The server answered with its last genuine fix because the upstream failed. */
    isFallback?: boolean;
    note?: string;
  }>('/api/iss', signal, 15000);
  const raw = payload?.data;
  if (!raw || Number.isNaN(Number(raw.latitude)) || Number.isNaN(Number(raw.longitude))) {
    throw new Error('Orbital element set unavailable');
  }
  const toNumber = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    data: {
      latitude: Number(raw.latitude),
      longitude: Number(raw.longitude),
      altitude: toNumber(raw.altitude),
      velocity: toNumber(raw.velocity),
      visibility: typeof raw.visibility === 'string' ? raw.visibility : undefined,
      timestamp: toNumber(raw.timestamp)
    },
    // A last-known fix is cached data, not a live position: saying "live" here
    // would date-stamp old telemetry as current.
    state: payload.simulated ? 'simulated' : payload.isFallback ? 'cached' : 'live',
    note: payload.simulated
      ? 'The upstream tracking service did not answer; this trajectory is propagated locally and is not live spacecraft telemetry.'
      : payload.isFallback
        ? payload.note || 'The upstream tracking service did not answer; this is the last known ISS fix, not a current position.'
        : undefined,
    retrievedAt: new Date().toISOString()
  };
}

/* ------------------------------------------------------------- Near Earth */

export interface NeoSummary {
  id: string;
  name: string;
  /** `null` when the source does not publish hazard flags (see `hazardKnown`). */
  hazardous: boolean | null;
  diameterMinM: number | null;
  diameterMaxM: number | null;
  missDistanceKm: number | null;
  missDistanceLunar: number | null;
  velocityKps: number | null;
  approachDate: string | null;
}

export interface NeoOverview {
  count: number;
  objects: NeoSummary[];
  closest: NeoSummary | null;
  hazardousCount: number;
  /** False when the source has no PHA flags, so the count is unknown, not zero. */
  hazardKnown: boolean;
  window: { start: string; end: string };
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The NeoWs feed as this module reads it: the fields are `unknown` because the
 * values are coerced with `Number(...)` / `String(...)` and every coercion is
 * guarded — a missing field becomes `null`, never a made-up number.
 */
interface NeoWsObject {
  id?: unknown;
  name?: unknown;
  is_potentially_hazardous_asteroid?: unknown;
  estimated_diameter?: { meters?: { estimated_diameter_min?: unknown; estimated_diameter_max?: unknown } };
  close_approach_data?: Array<{
    miss_distance?: { kilometers?: unknown; lunar?: unknown };
    relative_velocity?: { kilometers_per_second?: unknown };
    close_approach_date?: unknown;
  }>;
}
interface NeoWsFeed {
  element_count?: unknown;
  near_earth_objects?: Record<string, unknown>;
  /** Set by the server when the feed came from the JPL fallback. */
  source?: unknown;
  hazardFlags?: unknown;
  maxDistanceAu?: unknown;
}

export async function loadNeo(signal: AbortSignal): Promise<Sourced<NeoOverview>> {
  const start = new Date();
  const end = new Date(start.getTime() + 6 * 86400000);
  const window = { start: isoDate(start), end: isoDate(end) };
  const payload = await getJson<{
    success?: boolean;
    data?: NeoWsFeed;
    isFallback?: boolean;
    fallbackSource?: string;
  }>(
    `/api/asteroids/neows?start_date=${window.start}&end_date=${window.end}`,
    signal,
    NEOWS_CLIENT_BUDGET_MS
  );
  const feed = payload?.data;
  const grouped = feed?.near_earth_objects;
  if (!grouped || typeof grouped !== 'object') throw new Error('NeoWs returned no object feed');

  const objects: NeoSummary[] = [];
  Object.values(grouped).forEach((dayList) => {
    (Array.isArray(dayList) ? (dayList as NeoWsObject[]) : []).forEach((item) => {
      const approach = item?.close_approach_data?.[0];
      objects.push({
        id: String(item?.id ?? item?.name),
        name: String(item?.name ?? 'Unnamed object'),
        // `null` stays `null`: an absent flag is unknown, and `Boolean(undefined)`
        // would quietly turn "unknown" into "not hazardous".
        hazardous: typeof item?.is_potentially_hazardous_asteroid === 'boolean'
          ? item.is_potentially_hazardous_asteroid
          : null,
        // `Number(undefined)` is NaN, so each `Number.isFinite` guard already
        // implies the path exists; the optional chain only states that.
        diameterMinM: Number.isFinite(Number(item?.estimated_diameter?.meters?.estimated_diameter_min))
          ? Number(item?.estimated_diameter?.meters?.estimated_diameter_min)
          : null,
        diameterMaxM: Number.isFinite(Number(item?.estimated_diameter?.meters?.estimated_diameter_max))
          ? Number(item?.estimated_diameter?.meters?.estimated_diameter_max)
          : null,
        missDistanceKm: Number.isFinite(Number(approach?.miss_distance?.kilometers))
          ? Number(approach?.miss_distance?.kilometers)
          : null,
        missDistanceLunar: Number.isFinite(Number(approach?.miss_distance?.lunar))
          ? Number(approach?.miss_distance?.lunar)
          : null,
        velocityKps: Number.isFinite(Number(approach?.relative_velocity?.kilometers_per_second))
          ? Number(approach?.relative_velocity?.kilometers_per_second)
          : null,
        approachDate: approach?.close_approach_date ? String(approach.close_approach_date) : null
      });
    });
  });

  const closest = objects
    .filter((object) => object.missDistanceKm !== null)
    .sort((a, b) => (a.missDistanceKm as number) - (b.missDistanceKm as number))[0] || null;

  // A source without PHA flags (JPL CAD) has an *unknown* hazardous count, which is
  // not the same as zero and must not be rendered as one.
  const hazardKnown = objects.some((object) => object.hazardous !== null);
  const derived = payload.isFallback === true && payload.fallbackSource === 'jpl-cad';

  return {
    data: {
      count: Number(feed?.element_count ?? objects.length),
      objects,
      closest,
      hazardousCount: objects.filter((object) => object.hazardous === true).length,
      hazardKnown,
      window
    },
    state: derived ? 'derived' : payload.isFallback ? 'static' : 'live',
    note: derived
      ? `NASA NeoWs did not answer, so these close approaches come from JPL's Close Approach Data (within ${String(feed?.maxDistanceAu ?? 0.2)} AU of Earth). Distances are converted from AU and velocities are JPL's own; hazard flags and diameters are not published by that source, so they are shown as unknown.`
      : payload.isFallback
        ? 'The live NeoWs feed did not answer. Reference objects from the NASA catalogue are listed; their approach values are withheld because they are not current observations.'
        : undefined,
    retrievedAt: new Date().toISOString()
  };
}

/* ------------------------------------------------------------------- Earth */

export interface EarthPreviewPoint {
  year: number;
  mean: number | null;
  complete: boolean;
}

export interface EarthPreview {
  placeLabel: string;
  latitude: number;
  longitude: number;
  parameter: string;
  unit: string;
  points: EarthPreviewPoint[];
  mean: number | null;
  slopePerYear: number | null;
  years: { start: number; end: number };
  sourceUrl: string;
  retrievedAt: string;
  state: Provenance;
  note?: string;
}

/**
 * A deliberately small slice of the Earth Lab's real pipeline: NASA POWER
 * monthly T2M for one location, reduced to annual means. The Lab itself owns
 * the full query surface — this preview exists so the home page can show one
 * truthfully-labelled observation.
 */
export async function loadEarthPreview(signal: AbortSignal): Promise<Sourced<EarthPreview>> {
  const { fetchPowerDataset } = await import('../../lib/earth/power');
  const endYear = new Date().getFullYear();
  const startYear = endYear - 14;
  const sourced = await fetchPowerDataset({
    latitude: 6.9271,
    longitude: 79.8612,
    startYear,
    endYear,
    placeLabel: 'Colombo, Sri Lanka',
    parameters: ['T2M'],
    signal
  });
  if (!sourced.data) throw new Error(sourced.error || 'NASA POWER did not return a usable series');
  const stats = sourced.data.stats['T2M'];
  const points = (stats?.annual || []).map((entry) => ({
    year: entry.year,
    mean: entry.mean,
    complete: entry.complete
  }));
  return {
    data: {
      placeLabel: sourced.data.placeLabel,
      latitude: sourced.data.latitude,
      longitude: sourced.data.longitude,
      parameter: 'T2M',
      unit: stats?.unit || '°C',
      points,
      mean: stats?.mean ?? null,
      slopePerYear: stats?.trend?.slopePerYear ?? null,
      years: { start: startYear, end: endYear },
      sourceUrl: sourced.provenance.sourceUrl,
      retrievedAt: sourced.provenance.retrievedAt,
      state: sourced.status === 'cached' ? 'cached' : 'live',
      note: sourced.provenance.note
    },
    state: sourced.status === 'cached' ? 'cached' : 'live',
    note: sourced.provenance.note,
    retrievedAt: sourced.provenance.retrievedAt
  };
}
