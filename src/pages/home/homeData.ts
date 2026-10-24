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
}

export async function loadApod(signal: AbortSignal): Promise<Sourced<Apod>> {
  const payload = await getJson<{ success?: boolean; data?: Apod; isFallback?: boolean; cached?: boolean }>(
    '/api/apod',
    signal
  );
  const apod = payload?.data;
  if (!apod?.title || !apod?.url) throw new Error('APOD service returned an incomplete record');
  return {
    data: apod,
    state: payload.isFallback ? 'static' : payload.cached ? 'cached' : 'live',
    note: payload.isFallback
      ? 'The NASA APOD service did not respond, so a curated archival image is shown. It is not today’s official APOD.'
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
  const payload = await getJson<{ success?: boolean; data?: Record<string, unknown>; simulated?: boolean }>(
    '/api/iss',
    signal,
    15000
  );
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
    state: payload.simulated ? 'simulated' : 'live',
    note: payload.simulated
      ? 'The upstream tracking service did not answer; this trajectory is propagated locally and is not live spacecraft telemetry.'
      : undefined,
    retrievedAt: new Date().toISOString()
  };
}

/* ------------------------------------------------------------- Near Earth */

export interface NeoSummary {
  id: string;
  name: string;
  hazardous: boolean;
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
  window: { start: string; end: string };
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function loadNeo(signal: AbortSignal): Promise<Sourced<NeoOverview>> {
  const start = new Date();
  const end = new Date(start.getTime() + 6 * 86400000);
  const window = { start: isoDate(start), end: isoDate(end) };
  const payload = await getJson<{ success?: boolean; data?: Record<string, any>; isFallback?: boolean }>(
    `/api/asteroids/neows?start_date=${window.start}&end_date=${window.end}`,
    signal,
    15000
  );
  const feed = payload?.data;
  const grouped = feed?.near_earth_objects;
  if (!grouped || typeof grouped !== 'object') throw new Error('NeoWs returned no object feed');

  const objects: NeoSummary[] = [];
  Object.values(grouped as Record<string, any[]>).forEach((dayList) => {
    (dayList || []).forEach((item) => {
      const approach = item?.close_approach_data?.[0];
      objects.push({
        id: String(item?.id ?? item?.name),
        name: String(item?.name ?? 'Unnamed object'),
        hazardous: Boolean(item?.is_potentially_hazardous_asteroid),
        diameterMinM: Number.isFinite(Number(item?.estimated_diameter?.meters?.estimated_diameter_min))
          ? Number(item.estimated_diameter.meters.estimated_diameter_min)
          : null,
        diameterMaxM: Number.isFinite(Number(item?.estimated_diameter?.meters?.estimated_diameter_max))
          ? Number(item.estimated_diameter.meters.estimated_diameter_max)
          : null,
        missDistanceKm: Number.isFinite(Number(approach?.miss_distance?.kilometers))
          ? Number(approach.miss_distance.kilometers)
          : null,
        missDistanceLunar: Number.isFinite(Number(approach?.miss_distance?.lunar))
          ? Number(approach.miss_distance.lunar)
          : null,
        velocityKps: Number.isFinite(Number(approach?.relative_velocity?.kilometers_per_second))
          ? Number(approach.relative_velocity.kilometers_per_second)
          : null,
        approachDate: approach?.close_approach_date ? String(approach.close_approach_date) : null
      });
    });
  });

  const closest = objects
    .filter((object) => object.missDistanceKm !== null)
    .sort((a, b) => (a.missDistanceKm as number) - (b.missDistanceKm as number))[0] || null;

  return {
    data: {
      count: Number(feed?.element_count ?? objects.length),
      objects,
      closest,
      hazardousCount: objects.filter((object) => object.hazardous).length,
      window
    },
    state: payload.isFallback ? 'static' : 'live',
    note: payload.isFallback
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
