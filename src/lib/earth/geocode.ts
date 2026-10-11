/**
 * Place search for the Earth Intelligence Lab.
 *
 * Two providers, both clearly attributed in the UI:
 *  1. a built-in curated gazetteer (offline, instant, coordinates from published
 *     place locations — used for Sri Lankan locations first);
 *  2. OpenStreetMap Nominatim, queried only on explicit submit, as the
 *     general-purpose fallback.
 *
 * Results never carry invented coordinates: anything returned by Nominatim is
 * passed through with its own `display_name` and returned attribution.
 */

import { cacheGet, cacheSet, TTL } from './cache';

export interface PlaceResult {
  label: string;
  latitude: number;
  longitude: number;
  /** Where the coordinates came from. */
  source: 'gazetteer' | 'nominatim';
  /** Country / region text for disambiguation. */
  region?: string;
  /** Ready-made bounding box `[south, west, north, east]` when the provider supplies one. */
  bounds?: [number, number, number, number];
  attribution: string;
}

export interface GazetteerEntry {
  name: string;
  latitude: number;
  longitude: number;
  region: string;
  /** Study-area bounding box in degrees `[south, west, north, east]`. */
  bounds?: [number, number, number, number];
  tags?: string[];
}

/** Curated Sri Lankan study areas (island, districts, forests, coasts). */
export const SRI_LANKA_PLACES: GazetteerEntry[] = [
  { name: 'Sri Lanka (island-wide)', latitude: 7.8731, longitude: 80.7718, region: 'Sri Lanka', bounds: [5.9, 79.5, 9.9, 81.9], tags: ['country'] },
  { name: 'Colombo', latitude: 6.9271, longitude: 79.8612, region: 'Western Province', bounds: [6.75, 79.75, 7.1, 80.05], tags: ['capital', 'coast', 'urban'] },
  { name: 'Kandy', latitude: 7.2906, longitude: 80.6337, region: 'Central Province', bounds: [7.15, 80.5, 7.45, 80.8], tags: ['highland'] },
  { name: 'Jaffna', latitude: 9.6615, longitude: 80.0255, region: 'Northern Province', bounds: [9.5, 79.8, 9.9, 80.4], tags: ['coast', 'dry zone'] },
  { name: 'Galle', latitude: 6.0535, longitude: 80.221, region: 'Southern Province', bounds: [5.9, 80.05, 6.25, 80.4], tags: ['coast'] },
  { name: 'Batticaloa', latitude: 7.7102, longitude: 81.6924, region: 'Eastern Province', bounds: [7.5, 81.5, 7.95, 81.9], tags: ['coast', 'lagoon'] },
  { name: 'Trincomalee', latitude: 8.5874, longitude: 81.2152, region: 'Eastern Province', bounds: [8.4, 81.0, 8.8, 81.45], tags: ['coast', 'harbour'] },
  { name: 'Anuradhapura', latitude: 8.3114, longitude: 80.4037, region: 'North Central Province', bounds: [8.1, 80.2, 8.55, 80.65], tags: ['dry zone'] },
  { name: 'Hambantota', latitude: 6.1246, longitude: 81.1185, region: 'Southern Province', bounds: [6.0, 80.95, 6.35, 81.35], tags: ['dry zone', 'coast'] },
  { name: 'Nuwara Eliya', latitude: 6.9497, longitude: 80.7891, region: 'Central Province', bounds: [6.85, 80.65, 7.05, 80.9], tags: ['highland', 'tea'] },
  { name: 'Ratnapura', latitude: 6.6828, longitude: 80.3992, region: 'Sabaragamuwa', bounds: [6.5, 80.2, 6.85, 80.6], tags: ['wet zone'] },
  { name: 'Sinharaja Forest Reserve', latitude: 6.4154, longitude: 80.4497, region: 'Sabaragamuwa / Southern', bounds: [6.3, 80.35, 6.55, 80.6], tags: ['rainforest', 'protected'] },
  { name: 'Horton Plains', latitude: 6.8094, longitude: 80.7994, region: 'Central Province', bounds: [6.75, 80.75, 6.87, 80.87], tags: ['montane', 'protected'] },
  { name: 'Yala National Park', latitude: 6.3728, longitude: 81.5067, region: 'Southern / Uva', bounds: [6.2, 81.35, 6.55, 81.7], tags: ['protected', 'dry zone'] },
  { name: 'Wilpattu National Park', latitude: 8.4491, longitude: 80.0436, region: 'North Western', bounds: [8.2, 79.85, 8.65, 80.25], tags: ['protected'] },
  { name: 'Udawalawe National Park', latitude: 6.4744, longitude: 80.8886, region: 'Sabaragamuwa / Uva', bounds: [6.35, 80.75, 6.6, 81.0], tags: ['protected'] },
  { name: 'Adam’s Peak (Sri Pada)', latitude: 6.8096, longitude: 80.4993, region: 'Central Province', bounds: [6.75, 80.45, 6.86, 80.55], tags: ['highland'] },
  { name: 'Pidurutalagala', latitude: 7.0008, longitude: 80.7719, region: 'Central Province', bounds: [6.95, 80.72, 7.05, 80.82], tags: ['summit'] },
  { name: 'Point Pedro', latitude: 9.8167, longitude: 80.2333, region: 'Northern Province', bounds: [9.75, 80.15, 9.87, 80.3], tags: ['coast'] },
  { name: 'Dondra Head', latitude: 5.9217, longitude: 80.5894, region: 'Southern Province', bounds: [5.87, 80.53, 5.97, 80.65], tags: ['coast', 'southernmost'] },
  { name: 'Kalpitiya', latitude: 8.2306, longitude: 79.7656, region: 'North Western', bounds: [8.1, 79.65, 8.35, 79.9], tags: ['lagoon', 'coast'] },
  { name: 'Mannar', latitude: 8.9811, longitude: 79.9044, region: 'Northern Province', bounds: [8.8, 79.7, 9.15, 80.15], tags: ['coast', 'shallow sea'] },
  { name: 'Negombo Lagoon', latitude: 7.2059, longitude: 79.8367, region: 'Western Province', bounds: [7.1, 79.75, 7.3, 79.95], tags: ['lagoon'] },
  { name: 'Polonnaruwa', latitude: 7.9403, longitude: 81.0188, region: 'North Central Province', bounds: [7.8, 80.9, 8.1, 81.15], tags: ['dry zone', 'reservoir'] },
  { name: 'Arugam Bay', latitude: 6.8404, longitude: 81.8369, region: 'Eastern Province', bounds: [6.75, 81.75, 6.95, 81.95], tags: ['coast'] }
];

/** A small set of world study areas so the Lab is useful outside Sri Lanka. */
export const WORLD_PLACES: GazetteerEntry[] = [
  { name: 'London', latitude: 51.5072, longitude: -0.1276, region: 'United Kingdom', bounds: [51.28, -0.51, 51.7, 0.33] },
  { name: 'New York City', latitude: 40.7128, longitude: -74.006, region: 'United States', bounds: [40.49, -74.26, 40.92, -73.7] },
  { name: 'Amazon Basin (Manaus)', latitude: -3.119, longitude: -60.0217, region: 'Brazil', bounds: [-5.5, -64.0, -1.0, -57.0], tags: ['forest'] },
  { name: 'Sahel (Niamey)', latitude: 13.5117, longitude: 2.1251, region: 'Niger', bounds: [12.5, 0.5, 15.0, 4.0], tags: ['dryland'] },
  { name: 'Bay of Bengal', latitude: 15.0, longitude: 88.0, region: 'Indian Ocean', bounds: [5.0, 80.0, 22.0, 95.0], tags: ['ocean'] },
  { name: 'Maldives (Malé)', latitude: 4.1755, longitude: 73.5093, region: 'Maldives', bounds: [3.0, 72.5, 5.5, 74.5], tags: ['atoll', 'ocean'] },
  { name: 'Chennai', latitude: 13.0827, longitude: 80.2707, region: 'India', bounds: [12.85, 80.05, 13.3, 80.4] },
  { name: 'Nairobi', latitude: -1.2921, longitude: 36.8219, region: 'Kenya', bounds: [-1.5, 36.6, -1.05, 37.05] },
  { name: 'Cape Town', latitude: -33.9249, longitude: 18.4241, region: 'South Africa', bounds: [-34.36, 18.3, -33.5, 19.0] },
  { name: 'Central Kalimantan (Palangkaraya)', latitude: -2.208, longitude: 113.916, region: 'Indonesia', bounds: [-4.0, 111.0, 0.0, 117.0], tags: ['peatland', 'fire'] },
  { name: 'Sydney', latitude: -33.8688, longitude: 151.2093, region: 'Australia', bounds: [-34.2, 150.5, -33.4, 151.7] },
  { name: 'Los Angeles', latitude: 34.0522, longitude: -118.2437, region: 'United States', bounds: [33.6, -119.0, 34.5, -117.5], tags: ['fire'] }
];

const GAZETTEER: GazetteerEntry[] = [...SRI_LANKA_PLACES, ...WORLD_PLACES];

function toResult(entry: GazetteerEntry): PlaceResult {
  return {
    label: entry.name,
    latitude: entry.latitude,
    longitude: entry.longitude,
    region: entry.region,
    bounds: entry.bounds,
    source: 'gazetteer',
    attribution: 'Built-in gazetteer (coordinates from published place locations)'
  };
}

export function searchGazetteer(query: string, limit = 6): PlaceResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const scored = GAZETTEER.map((entry) => {
    const name = entry.name.toLowerCase();
    const haystack = `${name} ${entry.region.toLowerCase()} ${(entry.tags || []).join(' ')}`;
    let score = 0;
    if (name === needle) score += 100;
    if (name.startsWith(needle)) score += 60;
    if (name.includes(needle)) score += 40;
    if (haystack.includes(needle)) score += 15;
    if (entry.region.toLowerCase().includes('sri lanka')) score += 5; // Sri Lanka first
    return { entry, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((item) => toResult(item.entry));
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_ATTRIBUTION = 'Search results © OpenStreetMap contributors (Nominatim)';

interface NominatimItem {
  display_name?: string;
  lat?: string;
  lon?: string;
  boundingbox?: [string, string, string, string];
}

/** Nominatim search — called on submit only, cached for a week. */
export async function searchNominatim(query: string, signal?: AbortSignal, limit = 6): Promise<PlaceResult[]> {
  const key = `geocode:${query.trim().toLowerCase()}`;
  const cached = cacheGet<PlaceResult[]>(key);
  if (cached) return cached.value;

  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: String(limit),
    addressdetails: '0',
    'accept-language': 'en'
  });

  const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    signal,
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Place search failed (HTTP ${response.status}).`);
  const items = (await response.json()) as NominatimItem[];
  const results: PlaceResult[] = items
    .filter((item) => item.lat && item.lon)
    .map((item) => ({
      label: (item.display_name || '').split(',').slice(0, 3).join(',') || 'Unnamed place',
      latitude: Number(item.lat),
      longitude: Number(item.lon),
      source: 'nominatim' as const,
      bounds: item.boundingbox
        ? ([Number(item.boundingbox[0]), Number(item.boundingbox[2]), Number(item.boundingbox[1]), Number(item.boundingbox[3])] as [
            number,
            number,
            number,
            number
          ])
        : undefined,
      attribution: NOMINATIM_ATTRIBUTION
    }))
    .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));

  if (results.length) cacheSet(key, results, TTL.geocode);
  return results;
}

export interface SearchPlacesOutcome {
  results: PlaceResult[];
  /** `nominatim` when the online provider answered, `gazetteer` when it did not. */
  provider: 'gazetteer' | 'nominatim' | 'gazetteer+nominatim';
  notice?: string;
}

/**
 * Search gazetteer and (optionally) Nominatim, merging results with local hits first.
 * Network failures degrade to the gazetteer with an explicit notice.
 */
export async function searchPlaces(
  query: string,
  options: { signal?: AbortSignal; includeOnline?: boolean } = {}
): Promise<SearchPlacesOutcome> {
  const local = searchGazetteer(query);
  if (options.includeOnline === false) {
    return { results: local, provider: 'gazetteer' };
  }
  try {
    const remote = await searchNominatim(query, options.signal);
    const seen = new Set(local.map((item) => `${item.latitude.toFixed(3)}:${item.longitude.toFixed(3)}`));
    const merged = [...local];
    remote.forEach((item) => {
      const key = `${item.latitude.toFixed(3)}:${item.longitude.toFixed(3)}`;
      if (!seen.has(key)) {
        merged.push(item);
        seen.add(key);
      }
    });
    return {
      results: merged.slice(0, 8),
      provider: remote.length ? 'gazetteer+nominatim' : 'gazetteer',
      notice: remote.length ? undefined : `No online place matches for "${query}". Showing built-in gazetteer entries.`
    };
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    return {
      results: local,
      provider: 'gazetteer',
      notice: `Online place search unavailable (${(error as Error)?.message || 'network error'}). Showing built-in gazetteer entries only.`
    };
  }
}
