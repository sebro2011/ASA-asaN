/** NASA Mars Rover Photos proxy. No sample images are substituted for failures. */
import express, { type Request, type Response } from 'express';

const ROVERS = new Set(['curiosity', 'opportunity', 'spirit']);
const TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 80;
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

export function createMarsPhotosRouter({ fetchImpl = globalThis.fetch, getKey = () => process.env.NASA_API_KEY || process.env.NEXT_PUBLIC_NASA_API_KEY || 'DEMO_KEY' } = {}) {
  const router = express.Router();
  const cache = new Map<string, { retrievedAt: string; expiresAt: number; photos: MarsPhoto[]; hasMore: boolean; omitted: number }>();
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
