/**
 * Space news + astronomy papers.
 *
 * Four news providers (only the free one needs no key) and arXiv astro-ph are
 * aggregated into one honest feed:
 *
 *   provider     key                     what it adds
 *   spaceflight  —                       free, spaceflight/space-science news
 *   gnews        GNEWS_API_KEY           broad news search
 *   newsapi      NEWSAPI_KEY             broad news search
 *   guardian     GUARDIAN_API_KEY        Guardian science desk
 *   arxiv        —                       new astro-ph preprints (papers route)
 *
 * Rules this module keeps:
 *   - a provider without a key is reported as `unconfigured`, never called and
 *     never faked;
 *   - a provider that fails is reported as `error` while the others still
 *     return, and if every attempted provider fails the route answers 502;
 *   - no API key ever appears in a response body, only whether one is set;
 *   - every string is trimmed, HTML-stripped and length-capped before it leaves
 *     the server, so an upstream article cannot inject markup into the UI.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';

export type NewsTopic = 'all' | 'missions' | 'universe' | 'earth';
export type NewsSourceId = 'spaceflight' | 'gnews' | 'newsapi' | 'guardian';

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  imageUrl: string | null;
  sourceId: NewsSourceId;
  sourceLabel: string;
  publishedAt: string | null;
  kind: 'news';
}

export interface PaperItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  authors: string[];
  publishedAt: string | null;
  categories: string[];
  kind: 'paper';
}

export type SourceState = 'ok' | 'unconfigured' | 'error';

export interface NewsSourceReport {
  id: string;
  label: string;
  kind: 'news' | 'papers';
  envVar: string | null;
  docs: string;
  configured: boolean;
  state: SourceState;
  count: number;
}

interface NewsSource {
  id: NewsSourceId;
  label: string;
  envVar: string | null;
  docs: string;
  fetch: (topic: NewsTopic, query: string, limit: number) => Promise<NewsItem[]>;
}

export const NEWS_API_VERSION = 1;

const TOPICS: Record<NewsTopic, string> = {
  all: 'astronomy telescope space science',
  missions: 'NASA mission spacecraft launch',
  universe: 'astrophysics black hole exoplanet galaxy',
  earth: 'Earth observation climate satellite NASA',
};

const MAX_LIMIT = 30;
const DEFAULT_LIMIT = 12;
const UPSTREAM_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 10 * 60_000;
const PAPERS_TTL_MS = 30 * 60_000;
const MAX_CACHE_ENTRIES = 60;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;

export const ARXIV_DOCS = 'https://info.arxiv.org/help/api/index.html';

function key(name: string): string {
  return (process.env[name] || '').trim();
}

function capped(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#8217': '’', '#8216': '‘',
  '#8220': '“', '#8221': '”', '#8211': '–', '#8212': '—', '#8230': '…',
};

export function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&([a-zA-Z#0-9]+);/g, (match, name: string) => ENTITIES[name] ?? match)
    .replace(/\s+/g, ' ')
    .trim();
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function isoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function articleId(sourceId: NewsSourceId, url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i += 1) hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
  return `${sourceId}-${hash.toString(36)}`;
}

async function getText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { Accept: '*/*', ...headers }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const text = await getText(url, headers);
  return JSON.parse(text);
}

/* ------------------------------------------------------------- providers */

async function fetchSpaceflight(topic: NewsTopic, query: string, limit: number): Promise<NewsItem[]> {
  const search = new URLSearchParams({ limit: String(limit), ordering: '-published_at' });
  const term = query || TOPICS[topic];
  if (term) search.set('search', term);
  const data = await getJson(`https://api.spaceflightnewsapi.net/v4/articles/?${search.toString()}`);
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.flatMap((entry: any): NewsItem[] => {
    const url = httpUrl(entry?.url);
    const title = capped(stripHtml(entry?.title ?? ''), 300);
    if (!url || !title) return [];
    return [{
      id: articleId('spaceflight', url),
      title,
      summary: capped(stripHtml(entry?.summary ?? ''), 600),
      url,
      imageUrl: httpUrl(entry?.image_url),
      sourceId: 'spaceflight',
      sourceLabel: capped(stripHtml(entry?.news_site ?? ''), 80) || 'Spaceflight News',
      publishedAt: isoDate(entry?.published_at),
      kind: 'news',
    }];
  });
}

async function fetchGNews(topic: NewsTopic, query: string, limit: number): Promise<NewsItem[]> {
  const token = key('GNEWS_API_KEY');
  if (!token) return [];
  const search = new URLSearchParams({
    q: query || TOPICS[topic],
    lang: 'en',
    max: String(limit),
    apikey: token,
  });
  const data = await getJson(`https://gnews.io/api/v4/search?${search.toString()}`);
  const articles = Array.isArray(data?.articles) ? data.articles : [];
  return articles.flatMap((entry: any): NewsItem[] => {
    const url = httpUrl(entry?.url);
    const title = capped(stripHtml(entry?.title ?? ''), 300);
    if (!url || !title) return [];
    return [{
      id: articleId('gnews', url),
      title,
      summary: capped(stripHtml(entry?.description ?? ''), 600),
      url,
      imageUrl: httpUrl(entry?.image),
      sourceId: 'gnews',
      sourceLabel: capped(stripHtml(entry?.source?.name ?? ''), 80) || 'GNews',
      publishedAt: isoDate(entry?.publishedAt),
      kind: 'news',
    }];
  });
}

async function fetchNewsApi(topic: NewsTopic, query: string, limit: number): Promise<NewsItem[]> {
  const token = key('NEWSAPI_KEY');
  if (!token) return [];
  const search = new URLSearchParams({
    q: query || TOPICS[topic],
    language: 'en',
    sortBy: 'publishedAt',
    pageSize: String(limit),
  });
  // The key travels in a header so it cannot end up in an upstream URL log.
  const data = await getJson(`https://newsapi.org/v2/everything?${search.toString()}`, {
    'X-Api-Key': token,
  });
  const articles = Array.isArray(data?.articles) ? data.articles : [];
  return articles.flatMap((entry: any): NewsItem[] => {
    const url = httpUrl(entry?.url);
    const title = capped(stripHtml(entry?.title ?? ''), 300);
    if (!url || !title) return [];
    return [{
      id: articleId('newsapi', url),
      title,
      summary: capped(stripHtml(entry?.description ?? ''), 600),
      url,
      imageUrl: httpUrl(entry?.urlToImage),
      sourceId: 'newsapi',
      sourceLabel: capped(stripHtml(entry?.source?.name ?? ''), 80) || 'NewsAPI',
      publishedAt: isoDate(entry?.publishedAt),
      kind: 'news',
    }];
  });
}

async function fetchGuardian(topic: NewsTopic, query: string, limit: number): Promise<NewsItem[]> {
  const token = key('GUARDIAN_API_KEY');
  if (!token) return [];
  const search = new URLSearchParams({
    q: query || TOPICS[topic],
    section: 'science',
    'show-fields': 'trailText,thumbnail',
    'page-size': String(limit),
    'order-by': 'newest',
    'api-key': token,
  });
  const data = await getJson(`https://content.guardianapis.com/search?${search.toString()}`);
  const results = Array.isArray(data?.response?.results) ? data.response.results : [];
  return results.flatMap((entry: any): NewsItem[] => {
    const url = httpUrl(entry?.webUrl);
    const title = capped(stripHtml(entry?.webTitle ?? ''), 300);
    if (!url || !title) return [];
    return [{
      id: articleId('guardian', url),
      title,
      summary: capped(stripHtml(entry?.fields?.trailText ?? ''), 600),
      url,
      imageUrl: httpUrl(entry?.fields?.thumbnail),
      sourceId: 'guardian',
      sourceLabel: capped(stripHtml(entry?.sectionName ?? ''), 80) || 'The Guardian',
      publishedAt: isoDate(entry?.webPublicationDate),
      kind: 'news',
    }];
  });
}

const NEWS_SOURCES: NewsSource[] = [
  {
    id: 'spaceflight',
    label: 'Spaceflight News',
    envVar: null,
    docs: 'https://api.spaceflightnewsapi.net/v4/docs/',
    fetch: fetchSpaceflight,
  },
  {
    id: 'gnews',
    label: 'GNews',
    envVar: 'GNEWS_API_KEY',
    docs: 'https://gnews.io/docs/v4',
    fetch: fetchGNews,
  },
  {
    id: 'newsapi',
    label: 'NewsAPI',
    envVar: 'NEWSAPI_KEY',
    docs: 'https://newsapi.org/docs/endpoints/everything',
    fetch: fetchNewsApi,
  },
  {
    id: 'guardian',
    label: 'The Guardian',
    envVar: 'GUARDIAN_API_KEY',
    docs: 'https://open-platform.theguardian.com/documentation/',
    fetch: fetchGuardian,
  },
];

export function isConfigured(envVar: string | null): boolean {
  return envVar === null || Boolean(key(envVar));
}

/** Public inventory: booleans and env-var names only, never a key value. */
export function newsSourceInventory() {
  return [
    ...NEWS_SOURCES.map((source) => ({
      id: source.id,
      label: source.label,
      kind: 'news' as const,
      envVar: source.envVar,
      docs: source.docs,
      configured: isConfigured(source.envVar),
    })),
    {
      id: 'arxiv',
      label: 'arXiv astro-ph',
      kind: 'papers' as const,
      envVar: null,
      docs: ARXIV_DOCS,
      configured: true,
    },
  ];
}

/* ----------------------------------------------------------------- arXiv */

export function parseArxivFeed(xml: string): PaperItem[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  return entries.flatMap((entry): PaperItem[] => {
    const rawId = capped(entry.match(/<id>([\s\S]*?)<\/id>/)?.[1] ?? '', 200);
    const title = capped(stripHtml(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''), 300);
    if (!rawId || !title) return [];
    const url = httpUrl(rawId.replace(/^http:/, 'https:'));
    if (!url) return [];
    const summary = capped(stripHtml(entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? ''), 700);
    const authors = [...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)]
      .map((match) => capped(stripHtml(match[1]), 120))
      .filter(Boolean)
      .slice(0, 6);
    const categories = [...entry.matchAll(/<category term="([^"]{1,40})"/g)].map((match) => match[1]).slice(0, 4);
    return [{
      id: `arxiv-${url.split('/abs/')[1] || url}`.slice(0, 120),
      title,
      summary,
      url,
      authors,
      publishedAt: isoDate(entry.match(/<published>([\s\S]*?)<\/published>/)?.[1]),
      categories,
      kind: 'paper',
    }];
  });
}

/** arXiv asks for a descriptive User-Agent; without one it throttles bursts. */
export const ARXIV_HEADERS = { 'User-Agent': 'NOVA-workspace/1.0 (astronomy reader)' };

async function fetchArxiv(query: string, limit: number): Promise<PaperItem[]> {
  const search = new URLSearchParams({
    search_query: query ? `all:${query}` : 'cat:astro-ph.*',
    sortBy: 'submittedDate',
    sortOrder: 'descending',
    max_results: String(limit),
  });
  const xml = await getText(`https://export.arxiv.org/api/query?${search.toString()}`, ARXIV_HEADERS);
  return parseArxivFeed(xml);
}

/* -------------------------------------------------------------- router */

interface CacheEntry {
  expires: number;
  body: unknown;
}

const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(name: string, max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const bucketKey = `${name}:${ip}`;
    const now = Date.now();
    const bucket = buckets.get(bucketKey);
    if (!bucket || now > bucket.resetAt) {
      buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        ok: false,
        code: 'rate-limited',
        message: `Too many news requests. Try again in ${retryAfter} s.`,
        retryAfter,
      });
    }
    return next();
  };
}

export function parseTopic(value: unknown): NewsTopic | null {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!raw) return 'all';
  return Object.prototype.hasOwnProperty.call(TOPICS, raw) ? (raw as NewsTopic) : null;
}

export function parseLimit(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return DEFAULT_LIMIT;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > MAX_LIMIT) return null;
  return num;
}

export function parseQuery(value: unknown): string | null {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const query = value.trim();
  if (query.length > 120) return null;
  return query;
}

export function sortAndDedupe(items: NewsItem[], limit: number): NewsItem[] {
  const seen = new Set<string>();
  const unique: NewsItem[] = [];
  for (const item of items) {
    const dedupeKey = item.url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    unique.push(item);
  }
  unique.sort((a, b) => {
    const left = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const right = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return right - left;
  });
  return unique.slice(0, limit);
}

export function createSpaceNewsRouter() {
  const router = Router();
  const cache = new Map<string, CacheEntry>();

  const readCache = (cacheKey: string, now: number): unknown | null => {
    const entry = cache.get(cacheKey);
    if (!entry) return null;
    if (entry.expires <= now) {
      cache.delete(cacheKey);
      return null;
    }
    return entry.body;
  };

  const writeCache = (cacheKey: string, body: unknown, ttl: number, now: number) => {
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(cacheKey, { expires: now + ttl, body });
  };

  router.get('/sources', (_req, res) => {
    res.json({ ok: true, version: NEWS_API_VERSION, sources: newsSourceInventory() });
  });

  router.get('/', rateLimit('news', RATE_MAX, RATE_WINDOW_MS), async (req, res) => {
    const topic = parseTopic(req.query.topic);
    if (!topic) {
      return res.status(400).json({
        ok: false,
        code: 'invalid-topic',
        message: 'topic must be one of: all, missions, universe, earth.',
      });
    }
    const limit = parseLimit(req.query.limit);
    if (limit === null) {
      return res.status(400).json({
        ok: false,
        code: 'invalid-limit',
        message: `limit must be an integer between 1 and ${MAX_LIMIT}.`,
      });
    }
    const query = parseQuery(req.query.q);
    if (query === null) {
      return res.status(400).json({ ok: false, code: 'invalid-query', message: 'q must be at most 120 characters.' });
    }

    const now = Date.now();
    const cacheKey = `news:${topic}:${limit}:${query}`;
    const cached = readCache(cacheKey, now);
    if (cached) return res.json({ ...(cached as object), cached: true });

    const attempts = NEWS_SOURCES.map(async (source) => {
      if (!isConfigured(source.envVar)) {
        return { source, state: 'unconfigured' as SourceState, items: [] as NewsItem[] };
      }
      try {
        const items = await source.fetch(topic, query, limit);
        return { source, state: 'ok' as SourceState, items };
      } catch {
        return { source, state: 'error' as SourceState, items: [] as NewsItem[] };
      }
    });
    const results = await Promise.all(attempts);

    const items = sortAndDedupe(results.flatMap((result) => result.items), limit);
    const sources: NewsSourceReport[] = results.map((result) => ({
      id: result.source.id,
      label: result.source.label,
      kind: 'news',
      envVar: result.source.envVar,
      docs: result.source.docs,
      configured: isConfigured(result.source.envVar),
      state: result.state,
      count: result.items.length,
    }));

    const attempted = sources.filter((source) => source.configured);
    if (items.length === 0 && attempted.length > 0 && attempted.every((source) => source.state === 'error')) {
      return res.status(502).json({
        ok: false,
        code: 'upstream',
        message: 'Every configured news provider failed. Nothing is shown rather than something invented.',
        sources,
      });
    }

    const body = {
      ok: true,
      version: NEWS_API_VERSION,
      topic,
      items,
      sources,
      generatedAt: new Date(now).toISOString(),
    };
    writeCache(cacheKey, body, CACHE_TTL_MS, now);
    return res.json(body);
  });

  router.get('/papers', rateLimit('papers', RATE_MAX, RATE_WINDOW_MS), async (req, res) => {
    const limit = parseLimit(req.query.limit);
    if (limit === null) {
      return res.status(400).json({
        ok: false,
        code: 'invalid-limit',
        message: `limit must be an integer between 1 and ${MAX_LIMIT}.`,
      });
    }
    const query = parseQuery(req.query.q);
    if (query === null) {
      return res.status(400).json({ ok: false, code: 'invalid-query', message: 'q must be at most 120 characters.' });
    }

    const now = Date.now();
    const cacheKey = `papers:${limit}:${query}`;
    const cached = readCache(cacheKey, now);
    if (cached) return res.json({ ...(cached as object), cached: true });

    try {
      const items = (await fetchArxiv(query, limit)).slice(0, limit);
      const body = {
        ok: true,
        version: NEWS_API_VERSION,
        source: 'arxiv',
        docs: ARXIV_DOCS,
        items,
        generatedAt: new Date(now).toISOString(),
      };
      writeCache(cacheKey, body, PAPERS_TTL_MS, now);
      return res.json(body);
    } catch {
      return res.status(502).json({
        ok: false,
        code: 'upstream',
        message: 'arXiv did not answer. No papers are shown rather than something invented.',
      });
    }
  });

  return router;
}

export const spaceNewsRouter = createSpaceNewsRouter();
