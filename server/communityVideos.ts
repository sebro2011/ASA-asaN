import { Router } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { youtubeIdFromUrl } from '../src/features/space-shorts/youtubeUrl';
import type { SpaceVideo, SpaceVideoCategory } from '../src/features/space-shorts/types';
import { verifyCommunityYouTube } from './spaceVideos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES = ['missions', 'solar-system', 'universe', 'earth'];
const PUBLIC_COLUMNS = 'id,video_id,title,description,category,channel_title,channel_id,official_agency,published_at,duration_seconds,created_at';
const PAGE_SIZE = 12;

type VerifiedVideo = NonNullable<Awaited<ReturnType<typeof verifyCommunityYouTube>>>;
type Submission = { videoId: string; title: string; description: string; category: string; userId: string; metadata: VerifiedVideo };
export type CommunityStore = {
  verifyUser: (token: string) => Promise<string | null>;
  isModerator: (userId: string) => Promise<boolean>;
  consume: (userId: string, action: 'submit' | 'report' | 'moderate') => Promise<boolean>;
  listApproved: (category: string, query: string, offset: number) => Promise<{ items: SpaceVideo[]; hasMore: boolean }>;
  exists: (videoId: string) => Promise<boolean>;
  insert: (submission: Submission) => Promise<'created' | 'duplicate'>;
  listOwn: (userId: string) => Promise<Array<{ id: string; title: string; status: string; createdAt: string }>>;
  report: (videoId: string, userId: string, reason: string) => Promise<'created' | 'duplicate' | 'not-found'>;
  listModeration: () => Promise<{ pending: Array<{ id: string; videoId: string; title: string; description: string; category: string; channelTitle: string; createdAt: string }>; approved: Array<{ id: string; videoId: string; title: string; channelTitle: string }>; reports: Array<{ id: string; videoId: string; title: string; reason: string; createdAt: string }> }>;
  moderate: (id: string, userId: string, action: string) => Promise<boolean>;
  dismissReport: (id: string, userId: string) => Promise<boolean>;
};
export type CommunityRuntime = { url: string; publicKey: string; store: CommunityStore };

function checked<T>(result: { data: T; error: any }): T {
  if (result.error) throw new Error('community-unavailable');
  return result.data;
}

function toVideo(row: any): SpaceVideo {
  return {
    id: row.video_id, communityId: row.id, title: row.title, description: row.description,
    channelTitle: row.channel_title, channelId: row.channel_id || undefined,
    officialAgency: row.official_agency === true,
    thumbnailUrl: `https://i.ytimg.com/vi/${row.video_id}/hqdefault.jpg`,
    publishedAt: row.published_at || undefined, durationSeconds: row.duration_seconds ?? undefined,
    categories: [row.category as SpaceVideoCategory]
  };
}

function supabaseStore(client: SupabaseClient): CommunityStore {
  return {
    async verifyUser(token) {
      const result = await client.auth.getUser(token); // validates with Supabase Auth, never trusts decoded JWT claims
      if (result.error) {
        // An Auth outage is not proof that a user's session is invalid.
        const status = result.error.status;
        if (!status || status === 429 || status >= 500) throw new Error('community-unavailable');
        return null;
      }
      if (!result.data.user || !UUID.test(result.data.user.id)) return null;
      return result.data.user.id;
    },
    async isModerator(userId) {
      const row = checked(await client.from('cosmovision_moderators').select('user_id').eq('user_id', userId).maybeSingle());
      return !!row;
    },
    async consume(userId, action) {
      return checked(await client.rpc('cosmovision_consume_limit', { p_user: userId, p_action: action })) === true;
    },
    async listApproved(category, query, offset) {
      let request = client.from('cosmovision_videos').select(PUBLIC_COLUMNS).eq('status', 'approved');
      if (category !== 'all') request = request.eq('category', category);
      // Escape wildcard characters so a title search behaves literally. The
      // SDK URL-encodes the filter; this is never interpolated into SQL.
      if (query) request = request.ilike('search_text', `%${query.replace(/[\\%_]/g, '\\$&')}%`);
      const rows = checked(await request.order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + PAGE_SIZE)) || [];
      return { items: rows.slice(0, PAGE_SIZE).map(toVideo), hasMore: rows.length > PAGE_SIZE };
    },
    async exists(videoId) {
      return !!checked(await client.from('cosmovision_videos').select('id').eq('video_id', videoId).maybeSingle());
    },
    async insert(submission) {
      const { metadata } = submission;
      const result = await client.from('cosmovision_videos').insert({
        video_id: submission.videoId, title: submission.title, description: submission.description,
        category: submission.category, submitter_id: submission.userId, status: 'pending',
        channel_title: metadata.channelTitle, channel_id: metadata.channelId || null,
        official_agency: metadata.officialAgency, published_at: metadata.publishedAt || null,
        duration_seconds: metadata.durationSeconds ?? null
      });
      if (result.error?.code === '23505') return 'duplicate';
      checked(result);
      return 'created';
    },
    async listOwn(userId) {
      const rows = checked(await client.from('cosmovision_videos').select('id,title,status,created_at').eq('submitter_id', userId).order('created_at', { ascending: false }).limit(100)) || [];
      return rows.map((row: any) => ({ id: row.id, title: row.title, status: row.status, createdAt: row.created_at }));
    },
    async report(videoId, userId, reason) {
      const video = checked(await client.from('cosmovision_videos').select('id').eq('id', videoId).eq('status', 'approved').maybeSingle());
      if (!video) return 'not-found';
      const result = await client.from('cosmovision_reports').insert({ video_id: videoId, reporter_id: userId, reason });
      if (result.error?.code === '23505') return 'duplicate';
      checked(result);
      return 'created';
    },
    async listModeration() {
      const [pendingResult, approvedResult, reportsResult] = await Promise.all([
        client.from('cosmovision_videos').select(PUBLIC_COLUMNS).eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
        client.from('cosmovision_videos').select('id,video_id,title,channel_title').eq('status', 'approved').order('created_at', { ascending: false }).limit(100),
        client.from('cosmovision_reports').select('id,reason,created_at,video:cosmovision_videos!inner(id,title,status)').eq('status', 'open').order('created_at', { ascending: true }).limit(100)
      ]);
      const pending = (checked(pendingResult) || []).map((row: any) => ({ id: row.id, videoId: row.video_id, title: row.title, description: row.description, category: row.category, channelTitle: row.channel_title, createdAt: row.created_at }));
      const approved = (checked(approvedResult) || []).map((row: any) => ({ id: row.id, videoId: row.video_id, title: row.title, channelTitle: row.channel_title }));
      const reports = (checked(reportsResult) || []).flatMap((row: any) => {
        const video = Array.isArray(row.video) ? row.video[0] : row.video;
        return video?.status === 'approved' ? [{ id: row.id, videoId: video.id, title: video.title, reason: row.reason, createdAt: row.created_at }] : [];
      });
      return { pending, approved, reports };
    },
    async moderate(id, userId, action) {
      return checked(await client.rpc('cosmovision_moderate', { p_video: id, p_actor: userId, p_action: action })) === true;
    },
    async dismissReport(id, userId) {
      return checked(await client.rpc('cosmovision_dismiss_report', { p_report: id, p_actor: userId })) === true;
    }
  };
}

// A Supabase publishable/anon key is intentionally public. Never return a
// service-role or secret key even if an operator accidentally puts it in the
// public-key variable. Legacy JWT anon keys are identified by their role.
function isPublishableKey(key: string): boolean {
  if (key.startsWith('sb_publishable_')) return true;
  try {
    const parts = key.split('.');
    if (parts.length !== 3) return false;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'anon';
  } catch { return false; }
}

let cached: { identity: string; runtime: CommunityRuntime } | null = null;
function runtimeFromEnvironment(): CommunityRuntime | null {
  const url = process.env.SUPABASE_URL?.trim() || '';
  const publicKey = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash || !secret || !isPublishableKey(publicKey) || publicKey === secret) return null;
  // Identity is kept in process memory, never logged or returned.
  const identity = `${url}\n${publicKey}\n${secret}`;
  if (cached?.identity === identity) return cached.runtime;
  const client = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) }) }
  });
  const runtime = { url: parsed.origin, publicKey, store: supabaseStore(client) };
  cached = { identity, runtime };
  return runtime;
}

function validText(value: unknown, min: number, max: number, multiline = false): value is string {
  return typeof value === 'string' && value === value.trim() && value.length >= min && value.length <= max
    && !(multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u).test(value);
}

/** Optional injection lets tests exercise actual routes without an external project. */
export function createCommunityRouter(options: { runtime?: () => CommunityRuntime | null; verifyVideo?: typeof verifyCommunityYouTube } = {}) {
  const router = Router();
  const runtime = options.runtime || runtimeFromEnvironment;
  const verifyVideo = options.verifyVideo || verifyCommunityYouTube;
  const rates = new Map<string, { count: number; reset: number }>();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Vary', 'Authorization');
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    let bucket = rates.get(ip);
    if (!bucket || bucket.reset <= now) bucket = { count: 0, reset: now + 60_000 };
    rates.set(ip, bucket);
    if (++bucket.count > 80) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.reset - now) / 1000))));
      return res.status(429).json({ error: 'rate-limit' });
    }
    if (rates.size > 1000) {
      for (const [key, value] of rates) if (value.reset <= now) rates.delete(key);
      while (rates.size > 1000) rates.delete(rates.keys().next().value!);
    }
    next();
  });
  router.get('/config', (_req, res) => {
    const config = runtime();
    return res.json(config ? { enabled: true, url: config.url, publicKey: config.publicKey } : { enabled: false });
  });

  async function authenticate(req: any, res: any, store: CommunityStore): Promise<string | null> {
    const match = /^Bearer ([\x21-\x7e]{20,8192})$/.exec(req.get('Authorization') || '');
    const userId = match ? await store.verifyUser(match[1]) : null;
    if (!userId) { res.status(401).json({ error: 'authentication-required' }); return null; }
    return userId;
  }
  function getRuntime(res: any): CommunityRuntime | null {
    const config = runtime();
    if (!config) { res.status(503).json({ error: 'community-unavailable' }); return null; }
    return config;
  }
  function fail(res: any) { return res.status(503).json({ error: 'community-unavailable' }); }

  router.get('/videos', async (req, res) => {
    const category = req.query.category ?? 'all';
    const query = req.query.q ?? '';
    const token = req.query.pageToken ?? '';
    if (typeof category !== 'string' || (category !== 'all' && !CATEGORIES.includes(category)) || typeof query !== 'string' || query.length > 80 || /[\u0000-\u001f\u007f]/.test(query) || typeof token !== 'string' || (token && !/^p\.(?:0|[1-9]\d{0,4})$/.test(token))) return res.status(400).json({ error: 'invalid-request' });
    const offset = token ? Number(token.slice(2)) : 0;
    if (offset > 10000) return res.status(400).json({ error: 'invalid-request' });
    const config = getRuntime(res); if (!config) return;
    try {
      const page = await config.store.listApproved(category, query.trim(), offset);
      return res.json({ items: page.items, nextPageToken: page.hasMore && offset + PAGE_SIZE <= 10000 ? `p.${offset + PAGE_SIZE}` : null, source: 'community' });
    } catch { return fail(res); }
  });

  router.get('/me', async (req, res) => {
    const config = getRuntime(res); if (!config) return;
    try {
      const userId = await authenticate(req, res, config.store); if (!userId) return;
      const [moderator, submissions] = await Promise.all([config.store.isModerator(userId), config.store.listOwn(userId)]);
      return res.json({ moderator, submissions });
    } catch { return fail(res); }
  });

  router.post('/submissions', async (req, res) => {
    const config = getRuntime(res); if (!config) return;
    try {
      const userId = await authenticate(req, res, config.store); if (!userId) return;
      if (!await config.store.consume(userId, 'submit')) return res.status(429).json({ error: 'rate-limit' });
      const { url, title, description, category } = req.body || {};
      const videoId = youtubeIdFromUrl(url);
      if (!videoId || !validText(title, 3, 160) || !validText(description, 10, 2000, true) || typeof category !== 'string' || !CATEGORIES.includes(category)) return res.status(400).json({ error: 'invalid-submission' });
      if (await config.store.exists(videoId)) return res.status(409).json({ error: 'duplicate' });
      let metadata: VerifiedVideo | null;
      try { metadata = await verifyVideo(videoId); } catch { return res.status(503).json({ error: 'youtube-unavailable' }); }
      if (!metadata) return res.status(422).json({ error: 'video-unavailable' });
      const result = await config.store.insert({ videoId, title, description, category, userId, metadata });
      if (result === 'duplicate') return res.status(409).json({ error: 'duplicate' });
      return res.status(201).json({ status: 'pending' });
    } catch { return fail(res); }
  });

  router.post('/videos/:id/report', async (req, res) => {
    const config = getRuntime(res); if (!config) return;
    try {
      const userId = await authenticate(req, res, config.store); if (!userId) return;
      if (!await config.store.consume(userId, 'report')) return res.status(429).json({ error: 'rate-limit' });
      const reason = req.body?.reason;
      if (!UUID.test(req.params.id) || !validText(reason, 3, 500, true)) return res.status(400).json({ error: 'invalid-report' });
      const result = await config.store.report(req.params.id, userId, reason);
      if (result === 'not-found') return res.status(404).json({ error: 'not-found' });
      if (result === 'duplicate') return res.status(409).json({ error: 'duplicate-report' });
      return res.status(201).json({ status: 'received' });
    } catch { return fail(res); }
  });

  router.get('/moderation', async (req, res) => {
    const config = getRuntime(res); if (!config) return;
    try {
      const userId = await authenticate(req, res, config.store); if (!userId) return;
      if (!await config.store.isModerator(userId)) return res.status(403).json({ error: 'forbidden' });
      return res.json(await config.store.listModeration());
    } catch { return fail(res); }
  });
  router.post('/moderation/reports/:id/dismiss', async (req, res) => {
    const config = getRuntime(res); if (!config) return;
    try {
      const userId = await authenticate(req, res, config.store); if (!userId) return;
      if (!await config.store.isModerator(userId)) return res.status(403).json({ error: 'forbidden' });
      if (!await config.store.consume(userId, 'moderate')) return res.status(429).json({ error: 'rate-limit' });
      if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'invalid-request' });
      if (!await config.store.dismissReport(req.params.id, userId)) return res.status(409).json({ error: 'state-conflict' });
      return res.json({ status: 'resolved' });
    } catch { return fail(res); }
  });
  router.post('/moderation/:id', async (req, res) => {
    const config = getRuntime(res); if (!config) return;
    try {
      const userId = await authenticate(req, res, config.store); if (!userId) return;
      if (!await config.store.isModerator(userId)) return res.status(403).json({ error: 'forbidden' });
      if (!await config.store.consume(userId, 'moderate')) return res.status(429).json({ error: 'rate-limit' });
      const action = req.body?.action;
      if (!UUID.test(req.params.id) || !['approve', 'reject', 'takedown'].includes(action)) return res.status(400).json({ error: 'invalid-request' });
      if (!await config.store.moderate(req.params.id, userId, action)) return res.status(409).json({ error: 'state-conflict' });
      return res.json({ status: action === 'approve' ? 'approved' : 'rejected' });
    } catch { return fail(res); }
  });
  return router;
}

export const communityVideosRouter = createCommunityRouter();
