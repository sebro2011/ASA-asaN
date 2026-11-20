/**
 * Mars imagery proxy — two upstreams, both live, neither substituted.
 *
 *  1. `GET /photos` — NASA's sol-indexed Mars Rover Photos API (api.nasa.gov).
 *     Historical browse: pick a rover and a sol.
 *  2. `GET /latest` — NASA's raw-images feed (mars.nasa.gov/rss/api). Ordered
 *     `sol desc`, so the first record really is the newest image NASA has
 *     published. This is the only source that carries Perseverance, and it
 *     updates through the day: at the time of writing the newest Curiosity frame
 *     had been taken hours earlier.
 *
 * "Latest" is not "real time" and the response says so: NASA downlinks in
 * batches, so `takenUtc` and `receivedUtc` differ by hours to days. No sample
 * images are substituted for failures.
 */
import express, { type Request, type Response } from 'express';

const ROVERS = new Set(['curiosity', 'opportunity', 'spirit']);
const TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 80;
/** The raw-images feed is re-served as NASA publishes, so a short TTL is spent well. */
const FEED_TTL_MS = 5 * 60 * 1000;
const FEED_MAX_ENTRIES = 40;
/** rover -> raw-images feed category. Spirit and Opportunity no longer publish feeds. */
const FEED_CATEGORIES: Record<string, string> = { perseverance: 'mars2020', curiosity: 'msl' };
interface MarsPhoto {
  id: number;
  sol: number;
  earthDate: string;
  rover: string;
  camera: string;
  imageUrl: string;
}

function integerParam(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * A photo record as far as this module can trust it: every field is a string or
 * number *because the guard below checked it*, not because NASA promised it.
 */
interface MarsPhotoRecord {
  id: number;
  sol: number;
  earth_date: string;
  rover: { name: string };
  camera: { full_name: string };
  img_src: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asPhotoRecord(item: unknown): MarsPhotoRecord | null {
  if (!isRecord(item)) return null;
  const { id, sol, earth_date, rover, camera, img_src } = item;
  if (typeof id !== 'number' || typeof sol !== 'number' || typeof earth_date !== 'string') return null;
  if (!isRecord(rover) || typeof rover.name !== 'string') return null;
  if (!isRecord(camera) || typeof camera.full_name !== 'string') return null;
  if (typeof img_src !== 'string') return null;
  return { id, sol, earth_date, rover: { name: rover.name }, camera: { full_name: camera.full_name }, img_src };
}

function normalizePhoto(item: unknown, sol: number, rover: string): MarsPhoto | null {
  const photo = asPhotoRecord(item);
  if (!photo) return null;
  if (!Number.isSafeInteger(photo.id) || photo.id < 0 || photo.sol !== sol ||
      !validDate(photo.earth_date) ||
      photo.rover.name.toLowerCase() !== rover ||
      !photo.camera.full_name.trim()) return null;
  try {
    const url = new URL(photo.img_src);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password || (url.hostname !== 'nasa.gov' && !url.hostname.endsWith('.nasa.gov'))) return null;
    url.protocol = 'https:';
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase() === 'api_key') url.searchParams.delete(key);
    }
    return { id: photo.id, sol, earthDate: photo.earth_date, rover: photo.rover.name, camera: photo.camera.full_name, imageUrl: url.toString() };
  } catch {
    return null;
  }
}


/* ------------------------------ raw-images feed ----------------------------- */

interface MarsFeedImage {
  id: string;
  sol: number;
  rover: string;
  camera: string;
  takenUtc: string;
  receivedUtc: string;
  caption: string;
  credit: string;
  title: string;
  imageUrl: string;
  pageUrl: string;
}

const clamp = (value: string, max: number): string => value.replace(/\s+/g, ' ').trim().slice(0, max);

const friendlyRover = (rover: string): string => (rover === 'perseverance' ? 'Perseverance' : 'Curiosity');

/**
 * Only https images on a NASA host survive. The feed is a third party: its URLs
 * are data, not instructions, so they are rebuilt and re-checked like any other
 * untrusted input — an `img src` is an outbound request the user's browser makes.
 */
function safeNasaUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    if (url.hostname !== 'mars.nasa.gov' && !url.hostname.endsWith('.nasa.gov')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isoOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

/**
 * One feed record, reduced to fields this module has itself verified. Anything
 * that does not survive is counted as `omitted` rather than repaired or guessed.
 */
function normalizeFeedImage(item: unknown, rover: string): MarsFeedImage | null {
  if (!isRecord(item)) return null;
  const { imageid, sol, camera, image_files: files, caption, credit, title, link, date_taken_utc, date_received } = item;
  if (typeof imageid !== 'string' || !/^[A-Za-z0-9_-]{4,160}$/.test(imageid)) return null;
  if (typeof sol !== 'number' || !Number.isSafeInteger(sol) || sol < 0 || sol > 100_000) return null;
  if (!isRecord(camera) || typeof camera.instrument !== 'string' || !camera.instrument.trim()) return null;
  if (!isRecord(files)) return null;

  const imageUrl = safeNasaUrl(files.medium) ?? safeNasaUrl(files.large) ?? safeNasaUrl(files.full_res);
  if (!imageUrl) return null;
  const pageUrl = safeNasaUrl(link);
  if (!pageUrl) return null;

  const takenUtc = isoOrNull(date_taken_utc);
  const receivedUtc = isoOrNull(date_received);
  if (!takenUtc || !receivedUtc) return null;

  return {
    id: imageid,
    sol,
    rover: friendlyRover(rover),
    camera: clamp(camera.instrument, 80),
    takenUtc,
    receivedUtc,
    caption: typeof caption === 'string' ? clamp(caption, 400) : '',
    credit: typeof credit === 'string' ? clamp(credit, 120) : '',
    title: typeof title === 'string' ? clamp(title, 200) : '',
    imageUrl,
    pageUrl,
  };
}

export function createMarsPhotosRouter({ fetchImpl = globalThis.fetch, getKey = () => process.env.NASA_API_KEY || process.env.NEXT_PUBLIC_NASA_API_KEY || 'DEMO_KEY' } = {}) {
  const router = express.Router();
  const cache = new Map<string, { retrievedAt: string; expiresAt: number; photos: MarsPhoto[]; hasMore: boolean; omitted: number }>();
  const feedCache = new Map<string, { retrievedAt: string; expiresAt: number; images: MarsFeedImage[]; latestSol: number | null; hasMore: boolean; omitted: number }>();

  /**
   * Newest images NASA has published, ordered by sol. Unkeyed: mars.nasa.gov does
   * not require the api.nasa.gov key for this feed, so a missing key cannot break
   * the live view.
   */
  router.get('/latest', async (req: Request, res: Response) => {
    const rover = req.query.rover === undefined ? 'perseverance' : req.query.rover;
    const num = integerParam(req.query.num === undefined ? '12' : req.query.num, 1, 24);
    const page = integerParam(req.query.page === undefined ? '0' : req.query.page, 0, 50);
    if (typeof rover !== 'string' || !FEED_CATEGORIES[rover] || num === null || page === null) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_MARS_QUERY',
        message: 'Choose perseverance or curiosity, a page size from 1 to 24, and a page from 0 to 50.'
      });
    }

    const cacheKey = `${rover}:${page}:${num}`;
    const hit = feedCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return res.json({
        ok: true, rover, page, num, images: hit.images, latestSol: hit.latestSol, hasMore: hit.hasMore,
        omitted: hit.omitted, retrievedAt: hit.retrievedAt, cached: true, source: 'NASA Mars raw images feed'
      });
    }
    if (hit) feedCache.delete(cacheKey);

    const category = FEED_CATEGORIES[rover];
    const url = `https://mars.nasa.gov/rss/api/?feed=raw_images&category=${category}&feedtype=json&num=${num}&page=${page}&order=sol+desc`;
    try {
      const upstream = await fetchImpl(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
      if (!upstream.ok) {
        const limited = upstream.status === 429;
        return res.status(limited ? 429 : 502).json({
          ok: false,
          code: limited ? 'MARS_FEED_RATE_LIMITED' : 'MARS_FEED_UPSTREAM_ERROR',
          message: limited
            ? 'NASA is rate limiting the raw-images feed; retry shortly.'
            : "NASA's raw-images feed could not complete the request."
        });
      }
      // A 200 that is not JSON is a payload problem, not a transport one: say so
      // rather than reporting the feed as unreachable.
      let body: unknown;
      try {
        body = await upstream.json();
      } catch {
        return res.status(502).json({ ok: false, code: 'MARS_FEED_INVALID_RESPONSE', message: 'NASA returned a response that is not JSON.' });
      }
      const raw = isRecord(body) && Array.isArray(body.images) ? body.images : null;
      if (!raw || raw.length > 200) {
        return res.status(502).json({ ok: false, code: 'MARS_FEED_INVALID_RESPONSE', message: 'NASA returned an unexpected raw-images response.' });
      }
      const images = raw.map((item) => normalizeFeedImage(item, rover)).filter((item): item is MarsFeedImage => item !== null);
      const entry = {
        retrievedAt: new Date().toISOString(),
        expiresAt: Date.now() + FEED_TTL_MS,
        images,
        latestSol: images.length ? images[0].sol : null,
        hasMore: raw.length >= num,
        omitted: raw.length - images.length
      };
      if (feedCache.size >= FEED_MAX_ENTRIES) feedCache.delete(feedCache.keys().next().value!);
      feedCache.set(cacheKey, entry);
      return res.json({
        ok: true, rover, page, num, images, latestSol: entry.latestSol, hasMore: entry.hasMore,
        omitted: entry.omitted, retrievedAt: entry.retrievedAt, cached: false, source: 'NASA Mars raw images feed'
      });
    } catch (error) {
      const timedOut = (error as Error)?.name === 'TimeoutError' || (error as Error)?.name === 'AbortError';
      return res.status(timedOut ? 504 : 502).json({
        ok: false,
        code: timedOut ? 'MARS_FEED_TIMEOUT' : 'MARS_FEED_UPSTREAM_ERROR',
        message: timedOut ? "NASA's raw-images feed timed out." : "NASA's raw-images feed could not be reached."
      });
    }
  });
  router.get('/photos', async (req: Request, res: Response) => {
    const rover = req.query.rover;
    const sol = integerParam(req.query.sol, 0, 10000);
    const page = integerParam(req.query.page === undefined ? '1' : req.query.page, 1, 100);
    if (typeof rover !== 'string' || !ROVERS.has(rover) || sol === null || page === null) {
      return res.status(400).json({ ok: false, code: 'INVALID_MARS_QUERY', message: 'Choose curiosity, opportunity or spirit, a sol from 0 to 10000, and a page from 1 to 100.' });
    }
    const cacheKey = `${rover}:${sol}:${page}`;
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return res.json({ ok: true, rover, sol, page, photos: hit.photos, hasMore: hit.hasMore, omitted: hit.omitted, retrievedAt: hit.retrievedAt, cached: true, source: 'NASA Mars Rover Photos API' });
    if (hit) cache.delete(cacheKey);
    const params = new URLSearchParams({ sol: String(sol), page: String(page), api_key: getKey() });
    const url = `https://api.nasa.gov/mars-photos/api/v1/rovers/${rover}/photos?${params}`;
    try {
      const upstream = await fetchImpl(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
      if (!upstream.ok) {
        if (upstream.status === 429) return res.status(429).json({ ok: false, code: 'MARS_RATE_LIMITED', message: 'NASA Mars Rover Photos is rate limited; retry later.' });
        return res.status(502).json({ ok: false, code: 'MARS_UPSTREAM_ERROR', message: 'NASA Mars Rover Photos could not complete the request.' });
      }
      const body: unknown = await upstream.json();
      const raw = isRecord(body) && Array.isArray(body.photos) ? body.photos : null;
      if (!raw || raw.length > 1000) return res.status(502).json({ ok: false, code: 'MARS_INVALID_RESPONSE', message: 'NASA returned an unexpected photo response.' });
      const photos = raw.map(item => normalizePhoto(item, sol, rover)).filter((item): item is MarsPhoto => item !== null);
      // NASA's documented pagination uses pages of 25; this indicates that a
      // following page may exist, not that it definitely contains images.
      const entry = { retrievedAt: new Date().toISOString(), expiresAt: Date.now() + TTL_MS, photos, hasMore: raw.length >= 25 && page < 100, omitted: raw.length - photos.length };
      if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, entry);
      return res.json({ ok: true, rover, sol, page, photos, hasMore: entry.hasMore, omitted: entry.omitted, retrievedAt: entry.retrievedAt, cached: false, source: 'NASA Mars Rover Photos API' });
    } catch (error) {
      const timedOut = (error as Error)?.name === 'TimeoutError' || (error as Error)?.name === 'AbortError';
      return res.status(timedOut ? 504 : 502).json({ ok: false, code: timedOut ? 'MARS_TIMEOUT' : 'MARS_UPSTREAM_ERROR', message: timedOut ? 'NASA Mars Rover Photos timed out.' : 'NASA Mars Rover Photos could not be reached.' });
    }
  });
  return router;
}
