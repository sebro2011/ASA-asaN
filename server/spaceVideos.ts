import { Router } from 'express';
import { getCuratedPage, matchesQuery } from './spaceVideoCatalog';
import type { SpaceVideo, SpaceVideoCategory, SpaceVideoFailure, SpaceVideoMode, SpaceVideoResponse } from '../src/features/space-shorts/types';

/** Official channel IDs: NASA https://www.nasa.gov/social-media/ and JPL's
 * official social directory https://www.jpl.nasa.gov/social/. Matching a name
 * alone is never enough to confer an agency badge. */
const OFFICIAL_CHANNELS = new Set([
  'UCLA_DiR1FfKNvjuUpBHmylQ', // NASA / @NASA
  'UCAY-SMFNfynqz1bdoaV8BeQ', // NASA Goddard / @NASAGoddard
  'UCryGec9PdUCLjpJW2mgCuLw', // NASA JPL / @NASAJPL
  'UCmheCYT4HlbFi943lpH009Q'  // NASA Johnson / @ReelNASA
]);
const CATEGORIES: Record<SpaceVideoCategory, string> = {
  all: 'space astronomy',
  missions: 'space missions NASA',
  'solar-system': 'solar system planets',
  universe: 'universe astronomy',
  earth: 'Earth from space'
};
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PAGE_TOKEN = /^[A-Za-z0-9_-]{1,200}$/;
const CACHE_MS = 10 * 60_000;
const MAX_CACHE = 120;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const GLOBAL_MISS_LIMIT = 30;

interface CacheEntry { expires: number; data: SpaceVideoResponse }
class UpstreamFailure extends Error {
  constructor(public code: SpaceVideoFailure) { super(code); }
}

function durationSeconds(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match || !match.slice(1).some(Boolean)) return undefined;
  const seconds = Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0);
  return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : undefined;
}

// YouTube titles sometimes contain HTML entities; decode a small, safe set
// before rendering as React text. Never interpret the result as HTML.
function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code: string) => {
    const lower = code.toLowerCase();
    if (Object.hasOwn(named, lower)) return named[lower];
    if (lower.startsWith('#')) {
      const point = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
      if (Number.isInteger(point) && point >= 32 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)) return String.fromCodePoint(point);
    }
    return entity;
  });
}

async function youtubeJson(endpoint: 'search' | 'videos', params: URLSearchParams, key: string): Promise<any> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  url.search = params.toString();
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(7000), headers: { 'x-goog-api-key': key } });
  } catch {
    throw new UpstreamFailure('network');
  }
  let data: any;
  try { data = await response.json(); } catch { throw new UpstreamFailure('upstream'); }
  if (!response.ok) {
    const reasons = (data?.error?.errors || []).map((entry: any) => entry?.reason);
    if (response.status === 429 || reasons.some((reason: string) => /quota|rateLimit|dailyLimit/i.test(reason))) throw new UpstreamFailure('quota');
    if (response.status === 401 || response.status === 403 || reasons.some((reason: string) => /keyInvalid|accessNotConfigured/i.test(reason))) throw new UpstreamFailure('configuration');
    throw new UpstreamFailure('upstream');
  }
  return data;
}

async function searchYouTube(mode: SpaceVideoMode, category: SpaceVideoCategory, query: string, token: string, key: string): Promise<SpaceVideoResponse> {
  const search = new URLSearchParams({
    part: 'snippet', type: 'video', maxResults: '18', order: 'relevance',
    q: `${query} ${CATEGORIES[category]}`.trim(), videoEmbeddable: 'true',
    videoSyndicated: 'true', safeSearch: 'moderate',
    videoDuration: mode === 'shorts' ? 'short' : 'any'
  });
  if (token) search.set('pageToken', token);
  const results = await youtubeJson('search', search, key);
  if (!Array.isArray(results?.items)) throw new UpstreamFailure('upstream');
  const ids: string[] = [...new Set<string>(results.items.map((entry: any) => entry?.id?.videoId).filter((id: unknown): id is string => typeof id === 'string' && VIDEO_ID.test(id)))];
  const nextPageToken = typeof results.nextPageToken === 'string' && PAGE_TOKEN.test(results.nextPageToken) ? results.nextPageToken : null;
  if (!ids.length) return { items: [], nextPageToken, source: 'youtube' };

  const details = await youtubeJson('videos', new URLSearchParams({ part: 'snippet,contentDetails,status', id: ids.join(',') }), key);
  if (!Array.isArray(details?.items)) throw new UpstreamFailure('upstream');
  const byId = new Map<string, any>(details.items.map((entry: any) => [entry?.id, entry]));
  const items = ids.flatMap((id): SpaceVideo[] => {
    const entry = byId.get(id);
    const snippet = entry?.snippet;
    const status = entry?.status;
    if (!snippet || status?.embeddable !== true || status?.privacyStatus !== 'public' || status?.uploadStatus !== 'processed'
      || snippet.liveBroadcastContent === 'live' || snippet.liveBroadcastContent === 'upcoming') return [];
    if (typeof snippet.title !== 'string' || !snippet.title.trim() || typeof snippet.channelTitle !== 'string') return [];
    const duration = durationSeconds(entry?.contentDetails?.duration);
    // Defend against inconsistent upstream metadata in the short-video feed.
    if (mode === 'shorts' && duration !== undefined && duration >= 4 * 60) return [];
    const video: SpaceVideo = {
      id,
      title: decodeEntities(snippet.title).slice(0, 300),
      description: typeof snippet.description === 'string' ? decodeEntities(snippet.description).slice(0, 1000) : '',
      channelTitle: decodeEntities(snippet.channelTitle).slice(0, 150),
      channelId: typeof snippet.channelId === 'string' ? snippet.channelId : undefined,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      publishedAt: typeof snippet.publishedAt === 'string' && !Number.isNaN(Date.parse(snippet.publishedAt)) ? snippet.publishedAt : undefined,
      durationSeconds: duration,
      officialAgency: OFFICIAL_CHANNELS.has(snippet.channelId)
    };
    return matchesQuery(video, query) ? [video] : [];
  });
  // Relevance order is preserved within each group; verified NASA channels first.
  items.sort((a, b) => Number(b.officialAgency) - Number(a.officialAgency));
  return { items, nextPageToken, source: 'youtube' };
}

/** Each server process gets a bounded cache, in-flight deduplication and small
 * abuse guards. Serverless instances do not share these; use an external cache
 * and distributed limiter for high traffic. No API key enters the response. */
export function createSpaceVideosRouter() {
  const router = Router();
  const cache = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<SpaceVideoResponse>>();
  const rates = new Map<string, { count: number; reset: number }>();
  let misses = { count: 0, reset: Date.now() + RATE_WINDOW_MS };

  router.get('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    let rate = rates.get(ip);
    if (!rate || now >= rate.reset) rate = { count: 0, reset: now + RATE_WINDOW_MS };
    rate.count += 1;
    rates.set(ip, rate);
    if (rates.size > 1000) {
      for (const [address, value] of rates) if (value.reset <= now) rates.delete(address);
      while (rates.size > 1000) rates.delete(rates.keys().next().value!);
    }
    if (rate.count > RATE_LIMIT) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((rate.reset - now) / 1000))));
      return res.status(429).json({ error: 'rate-limit' });
    }

    const rawMode = req.query.mode ?? 'shorts';
    const rawCategory = req.query.category ?? 'all';
    const rawQuery = req.query.q ?? '';
    const rawToken = req.query.pageToken ?? '';
    if (typeof rawMode !== 'string' || !['shorts', 'videos'].includes(rawMode)
      || typeof rawCategory !== 'string' || !Object.hasOwn(CATEGORIES, rawCategory)
      || typeof rawQuery !== 'string' || rawQuery.length > 80 || /[\u0000-\u001f\u007f]/.test(rawQuery)
      || typeof rawToken !== 'string' || (rawToken && !PAGE_TOKEN.test(rawToken))) {
      return res.status(400).json({ error: 'invalid-request' });
    }
    const mode = rawMode as SpaceVideoMode;
    const category = rawCategory as SpaceVideoCategory;
    const query = rawQuery.trim();
    const token = rawToken;
    const curatedToken = /^c_(\d{1,4})$/.exec(token);
    const key = process.env.YOUTUBE_API_KEY?.trim();
    if (curatedToken || !key) {
      if (!key && token && !curatedToken) return res.status(503).json({ error: 'missing-key' });
      const offset = curatedToken ? Number(curatedToken[1]) : 0;
      return res.json({ ...getCuratedPage(mode, category, query, offset), source: 'curated', ...(!key ? { reason: 'missing-key' } : {}) });
    }

    const cacheKey = JSON.stringify([mode, category, query.toLocaleLowerCase(), token]);
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > now) return res.json({ ...cached.data, cached: true });
    if (cached) cache.delete(cacheKey);

    let pending = inflight.get(cacheKey);
    if (!pending) {
      if (now >= misses.reset) misses = { count: 0, reset: now + RATE_WINDOW_MS };
      if (++misses.count > GLOBAL_MISS_LIMIT) {
        if (token) return res.status(429).json({ error: 'rate-limit' });
        return res.json({ ...getCuratedPage(mode, category, query), source: 'curated', reason: 'rate-limit' });
      }
      pending = searchYouTube(mode, category, query, token, key);
      inflight.set(cacheKey, pending);
    }
    try {
      const data = await pending;
      cache.set(cacheKey, { expires: Date.now() + CACHE_MS, data });
      while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
      return res.json(data);
    } catch (error) {
      const reason: SpaceVideoFailure = error instanceof UpstreamFailure ? error.code : 'upstream';
      // Never replace a later live page with unrelated curated content.
      if (token) return res.status(503).json({ error: reason });
      return res.json({ ...getCuratedPage(mode, category, query), source: 'curated', reason });
    } finally {
      if (inflight.get(cacheKey) === pending) inflight.delete(cacheKey);
    }
  });
  return router;
}

export const spaceVideosRouter = createSpaceVideosRouter();
