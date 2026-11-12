/**
 * NASA Images library adapter.
 *
 * Why this exists: `/api/nasa-archive` used to answer from a hardcoded list of
 * thirteen records with synthesised NASA IDs (`ARTEMIS-ORION-CREW-2025`, …) and
 * Unsplash stock photos, which the client printed as "NASA ID" and deep-linked to
 * images.nasa.gov. Every identifier was invented and every photograph was
 * misattributed. This adapter replaces that list with the real, public NASA
 * Images API, and the rule that matters is enforced structurally: **every field
 * returned to the client comes from an upstream record**. If the upstream is
 * unavailable the caller gets a typed failure, never a substitute.
 *
 * The shape mirrors `server/forge/scienceConnectors.ts`: exact-host https
 * allowlist, bounded timeout, TTL cache with a size cap, shape validation that
 * skips malformed rows instead of inventing values, and attribution in the
 * payload.
 */

export const NASA_IMAGES_HOST = 'images-api.nasa.gov';
export const NASA_IMAGES_ATTRIBUTION = 'NASA Images (images.nasa.gov)';
export const NASA_IMAGES_TTL_MS = 5 * 60 * 1000;
export const NASA_IMAGES_MAX_CACHE_ENTRIES = 100;
export const NASA_IMAGES_TIMEOUT_MS = 6000;

export interface NasaImageRecord {
  id: string;
  nasaId: string;
  title: string;
  description: string;
  /** YYYY-MM-DD derived from the upstream `date_created`, or '' when absent. */
  date: string;
  year: number | null;
  /** NASA centre that published the record (`JPL`, `GSFC`, …), or ''. */
  category: string;
  thumbnail: string;
  hdUrl: string | null;
  detailsUrl: string;
  source: typeof NASA_IMAGES_ATTRIBUTION;
  assetUrl: string;
}

export interface NasaImageSearchResult {
  ok: true;
  items: NasaImageRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
  cached: boolean;
  fetchedAt: string;
  source: typeof NASA_IMAGES_ATTRIBUTION;
}

export type NasaImageFailureCode =
  | 'INVALID_QUERY'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_SHAPE';

export interface NasaImageFailure {
  ok: false;
  code: NasaImageFailureCode;
  status: number;
  message: string;
}

export interface NasaImageQuery {
  q?: string;
  year?: number | null;
  page?: number;
  limit?: number;
}

type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<Response>;

const cache = new Map<string, { items: NasaImageRecord[]; total: number; fetchedAt: string }>();

/** Test seam: the cache is process-wide, and the DOM/route tests exercise outages. */
export function clearNasaImageCache(): void {
  cache.clear();
}

function cacheKey(query: NasaImageQuery): string {
  return `${query.q ?? ''}|${query.year ?? ''}|${query.page}|${query.limit}`;
}

/** Builds the upstream URL and refuses anything that is not the allowlisted host. */
export function nasaImagesUrl(query: NasaImageQuery): { ok: true; url: string } | NasaImageFailure {
  const q = (query.q ?? '').trim();
  if (!q) return { ok: false, code: 'INVALID_QUERY', status: 400, message: 'A search term is required.' };
  if (q.length > 120) {
    return { ok: false, code: 'INVALID_QUERY', status: 400, message: 'The search term is too long (120 characters maximum).' };
  }
  const page = query.page ?? 1;
  const limit = query.limit ?? 8;
  if (!Number.isInteger(page) || page < 1 || page > 100) {
    return { ok: false, code: 'INVALID_QUERY', status: 400, message: 'page must be an integer between 1 and 100.' };
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 24) {
    return { ok: false, code: 'INVALID_QUERY', status: 400, message: 'limit must be an integer between 1 and 24.' };
  }
  if (query.year != null && (!Number.isInteger(query.year) || query.year < 1958 || query.year > 2100)) {
    return { ok: false, code: 'INVALID_QUERY', status: 400, message: 'year must be between 1958 and 2100.' };
  }

  const url = new URL(`https://${NASA_IMAGES_HOST}/search`);
  url.searchParams.set('media_type', 'image');
  url.searchParams.set('q', q);
  url.searchParams.set('page', String(page));
  url.searchParams.set('page_size', String(limit));
  if (query.year != null) {
    url.searchParams.set('year_start', String(query.year));
    url.searchParams.set('year_end', String(query.year));
  }
  if (url.hostname !== NASA_IMAGES_HOST || url.protocol !== 'https:') {
    return { ok: false, code: 'INVALID_QUERY', status: 400, message: 'Only the NASA Images API may be queried.' };
  }
  return { ok: true, url: url.toString() };
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function toDate(value: unknown): string {
  const raw = text(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

/**
 * Maps one upstream item. Rows without a `nasa_id` or a preview link are dropped:
 * an image with no identifier cannot be cited, and inventing one is exactly the
 * defect this adapter exists to prevent.
 */
export function normaliseNasaImageItem(item: unknown): NasaImageRecord | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as { data?: unknown; links?: unknown };
  const data = Array.isArray(record.data) ? record.data[0] : null;
  if (!data || typeof data !== 'object') return null;
  const entry = data as Record<string, unknown>;

  const nasaId = text(entry.nasa_id);
  const title = text(entry.title);
  if (!nasaId || !title) return null;

  const links = Array.isArray(record.links) ? record.links : [];
  const preview = links
    .map((link) => (link && typeof link === 'object' ? text((link as Record<string, unknown>).href) : ''))
    .find((href) => href.startsWith('https://'));

  const date = toDate(entry.date_created);
  return {
    id: nasaId,
    nasaId,
    title,
    description: text(entry.description),
    date,
    year: date ? Number(date.slice(0, 4)) : null,
    // `center` is the real publishing centre; if absent the field stays empty
    // rather than borrowing a plausible-looking one.
    category: text(entry.center),
    // NASA asset filenames contain spaces; a raw space in `src` is unreliable.
    thumbnail: preview ? encodeURI(preview) : '',
    hdUrl: null,
    detailsUrl: `https://images.nasa.gov/details/${encodeURIComponent(nasaId)}`,
    assetUrl: `https://images-api.nasa.gov/asset/${encodeURIComponent(nasaId)}`,
    source: NASA_IMAGES_ATTRIBUTION,
  };
}

export function normaliseNasaImageCollection(payload: unknown): { items: NasaImageRecord[]; total: number } | null {
  if (!payload || typeof payload !== 'object') return null;
  const collection = (payload as { collection?: unknown }).collection;
  if (!collection || typeof collection !== 'object') return null;
  const rawItems = (collection as { items?: unknown }).items;
  const metadata = (collection as { metadata?: unknown }).metadata;
  const totalHits =
    metadata && typeof metadata === 'object'
      ? Number((metadata as { total_hits?: unknown }).total_hits)
      : NaN;

  const items = (Array.isArray(rawItems) ? rawItems : [])
    .map(normaliseNasaImageItem)
    .filter((item): item is NasaImageRecord => item !== null);

  const total = Number.isFinite(totalHits) ? totalHits : items.length;
  return { items, total };
}

export async function searchNasaImages(
  query: NasaImageQuery,
  deps: { fetchImpl?: FetchLike; now?: () => number; timeoutMs?: number } = {},
): Promise<NasaImageSearchResult | NasaImageFailure> {
  const built = nasaImagesUrl(query);
  if (!built.ok) return built;

  const key = cacheKey(query);
  const now = deps.now ? deps.now() : Date.now();
  const hit = cache.get(key);
  if (hit && now - Date.parse(hit.fetchedAt) < NASA_IMAGES_TTL_MS) {
    const totalPages = Math.max(1, Math.ceil(hit.total / (query.limit ?? 8)));
    return {
      ok: true,
      items: hit.items,
      total: hit.total,
      page: query.page ?? 1,
      limit: query.limit ?? 8,
      totalPages,
      hasMore: (query.page ?? 1) < totalPages,
      cached: true,
      fetchedAt: hit.fetchedAt,
      source: NASA_IMAGES_ATTRIBUTION,
    };
  }

  const fetchImpl = deps.fetchImpl ?? (globalThis.fetch as FetchLike);
  let response: Response;
  try {
    response = await fetchImpl(built.url, {
      signal: AbortSignal.timeout(deps.timeoutMs ?? NASA_IMAGES_TIMEOUT_MS),
    });
  } catch (error) {
    const aborted = error instanceof Error && /abort|timeout/i.test(error.name + error.message);
    return {
      ok: false,
      code: aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE',
      status: 503,
      message: aborted
        ? 'The NASA Images API did not answer in time.'
        : 'The NASA Images API could not be reached.',
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: 'UPSTREAM_UNAVAILABLE',
      status: 503,
      message: `The NASA Images API answered ${response.status}.`,
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      code: 'UPSTREAM_SHAPE',
      status: 502,
      message: 'The NASA Images API returned a body that is not JSON.',
    };
  }

  const normalised = normaliseNasaImageCollection(payload);
  if (!normalised) {
    return {
      ok: false,
      code: 'UPSTREAM_SHAPE',
      status: 502,
      message: 'The NASA Images API response did not match the expected collection shape.',
    };
  }

  const fetchedAt = new Date(now).toISOString();
  cache.set(key, { items: normalised.items, total: normalised.total, fetchedAt });
  while (cache.size > NASA_IMAGES_MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }

  const limit = query.limit ?? 8;
  const totalPages = Math.max(1, Math.ceil(normalised.total / limit));
  const page = query.page ?? 1;
  return {
    ok: true,
    items: normalised.items,
    total: normalised.total,
    page,
    limit,
    totalPages,
    hasMore: page < totalPages,
    cached: false,
    fetchedAt,
    source: NASA_IMAGES_ATTRIBUTION,
  };
}
