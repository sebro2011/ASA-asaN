/** Community route contract tests. The database and YouTube are mocked here. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { createCommunityRouter } from '../server/communityVideos.ts';
import { verifyCommunityYouTube } from '../server/spaceVideos.ts';
import { youtubeIdFromUrl } from '../src/features/space-shorts/youtubeUrl.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const modId = '22222222-2222-4222-8222-222222222222';
const userToken = 'signed-in-user-token-for-testing';
const modToken = 'signed-in-moderator-token-for-testing';
const verified = { channelTitle: 'Verified source channel', channelId: 'UC-real-source', officialAgency: false, durationSeconds: 50 };

function fakeStore() {
  const videos = []; const reports = []; const limits = new Map();
  return {
    videos, reports, limits,
    async verifyUser(token) { return token === userToken ? userId : token === modToken ? modId : null; },
    async isModerator(id) { return id === modId; },
    async consume(id, action) { return limits.get(`${id}:${action}`) !== false; },
    async listApproved(category, query, offset) {
      const rows = videos.filter((v) => v.status === 'approved' && (category === 'all' || v.category === category) && `${v.title} ${v.description} ${v.metadata.channelTitle}`.toLowerCase().includes(query.toLowerCase()));
      return { items: rows.slice(offset, offset + 12).map((v) => ({ id: v.videoId, communityId: v.id, title: v.title, description: v.description, channelTitle: v.metadata.channelTitle, thumbnailUrl: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`, officialAgency: v.metadata.officialAgency, categories: [v.category] })), hasMore: rows.length > offset + 12 };
    },
    async exists(videoId) { return videos.some((v) => v.videoId === videoId); },
    async insert(input) { if (videos.some((v) => v.videoId === input.videoId)) return 'duplicate'; videos.push({ ...input, id: randomUUID(), status: 'pending' }); return 'created'; },
    async listOwn(user) { return videos.filter((v) => v.userId === user).map((v) => ({ id: v.id, title: v.title, status: v.status, createdAt: '2026-01-01' })); },
    async report(id, user, reason) {
      if (!videos.some((v) => v.id === id && v.status === 'approved')) return 'not-found';
      if (reports.some((r) => r.videoId === id && r.user === user)) return 'duplicate';
      reports.push({ id: randomUUID(), videoId: id, user, reason, status: 'open' }); return 'created';
    },
    async listModeration() {
      return { pending: videos.filter((v) => v.status === 'pending').map((v) => ({ id: v.id, title: v.title, videoId: v.videoId, description: v.description, category: v.category, channelTitle: v.metadata.channelTitle, createdAt: '2026-01-01' })), approved: videos.filter((v) => v.status === 'approved').map((v) => ({ id: v.id, title: v.title, videoId: v.videoId, channelTitle: v.metadata.channelTitle })), reports: reports.filter((r) => r.status === 'open').map((r) => ({ id: r.id, videoId: r.videoId, title: videos.find((v) => v.id === r.videoId).title, reason: r.reason, createdAt: '2026-01-01' })) };
    },
    async moderate(id, user, action) {
      if (user !== modId) return false;
      const v = videos.find((v) => v.id === id); if (!v) return false;
      if (action === 'approve' && v.status === 'pending') v.status = 'approved';
      else if (action === 'reject' && v.status === 'pending') v.status = 'rejected';
      else if (action === 'takedown' && v.status === 'approved') { v.status = 'rejected'; for (const r of reports) if (r.videoId === id) r.status = 'resolved'; }
      else return false;
      return true;
    },
    async dismissReport(id, user) { const r = reports.find((item) => item.id === id && item.status === 'open'); if (user !== modId || !r) return false; r.status = 'resolved'; return true; }
  };
}
async function withServer(options, run) {
  const app = express(); app.use(express.json()); app.use('/api/community', createCommunityRouter(options));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/community`;
  const request = (path, { token, body, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) => fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try { await run(request); } finally { await new Promise((resolve) => server.close(resolve)); }
}
const input = { url: 'https://www.youtube.com/watch?v=abcdefghijk', title: 'A journey to Mars', description: 'A real educational video about Mars.', category: 'missions' };

test('strict URL parser accepts only supported HTTPS YouTube video links', () => {
  for (const url of ['https://www.youtube.com/watch?v=abcdefghijk', 'https://youtube.com/shorts/abcdefghijk?feature=share', 'https://m.youtube.com/watch?v=abcdefghijk&t=3', 'https://youtu.be/abcdefghijk?t=1']) assert.equal(youtubeIdFromUrl(url), 'abcdefghijk', url);
  for (const url of ['http://youtube.com/watch?v=abcdefghijk', 'https://youtube.com.evil.test/watch?v=abcdefghijk', 'https://youtube.com@evil.test/watch?v=abcdefghijk', 'https://evil.test/?next=youtube.com/watch?v=abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk&v=ABCDEFGHIJK', 'https://youtu.be/abcdefghijk/extra', 'https://www.youtube.com/embed/abcdefghijk', 'https://www.youtube.com/watch?v=bad', 'https://youtube.com:444/watch?v=abcdefghijk', 'https://youtube.com\\@evil.test/watch?v=abcdefghijk', ' https://youtu.be/abcdefghijk', 'javascript:alert(1)', null]) assert.equal(youtubeIdFromUrl(url), null, String(url));
});

test('unconfigured community returns an honest unavailable state, never success', async () => {
  await withServer({ runtime: () => null }, async (request) => {
    const config = await request('/config'); assert.deepEqual(await config.json(), { enabled: false });
    assert.equal(config.headers.get('cache-control'), 'no-store');
    assert.equal((await request('/videos')).status, 503);
    assert.equal((await request('/submissions', { token: userToken, body: input })).status, 503);
    assert.equal((await request('/moderation', { token: modToken })).status, 503);
  });
});

test('auth, validation, YouTube verification, duplicate detection and pending-only persistence', async () => {
  const store = fakeStore(); let verifications = 0;
  const runtime = () => ({ url: 'https://example.supabase.co', publicKey: 'sb_publishable_test', store });
  await withServer({ runtime, verifyVideo: async (id) => { verifications++; assert.equal(id, 'abcdefghijk'); return verified; } }, async (request) => {
    const config = await (await request('/config')).json(); assert.deepEqual(config, { enabled: true, url: 'https://example.supabase.co', publicKey: 'sb_publishable_test' });
    assert.equal((await request('/submissions', { body: input })).status, 401);
    assert.equal((await request('/submissions', { token: 'forged-moderator-token-123456', body: input })).status, 401);
    for (const update of [{ url: 'https://youtube.com.evil.test/watch?v=abcdefghijk' }, { title: 'x' }, { description: 'tiny' }, { category: '__proto__' }, { title: 'bad\u0000title' }]) {
      assert.equal((await request('/submissions', { token: userToken, body: { ...input, ...update } })).status, 400);
    }
    assert.equal(verifications, 0);
    const response = await request('/submissions', { token: userToken, body: { ...input, status: 'approved', channelTitle: 'NASA', officialAgency: true, userId: modId } });
    assert.equal(response.status, 201); assert.deepEqual(await response.json(), { status: 'pending' });
    assert.equal(store.videos[0].status, 'pending'); assert.equal(store.videos[0].userId, userId); assert.equal(store.videos[0].metadata.channelTitle, 'Verified source channel');
    assert.equal((await (await request('/videos')).json()).items.length, 0, 'pending submissions are private');
    assert.equal((await (await request('/me', { token: userToken })).json()).submissions[0].status, 'pending');
    assert.equal((await request('/submissions', { token: userToken, body: input })).status, 409);
    assert.equal(verifications, 1, 'duplicate does not waste YouTube quota');
    for (const query of ['?category=__proto__', '?q=%00bad', '?q=' + 'x'.repeat(81), '?pageToken=../../bad', '?pageToken=p.10001']) assert.equal((await request('/videos' + query)).status, 400);
  });
});

test('verification failure and database failure cannot produce a success response', async () => {
  for (const verifyVideo of [async () => null, async () => { throw new Error('upstream outage'); }]) {
    const store = fakeStore();
    await withServer({ runtime: () => ({ url: 'https://example.supabase.co', publicKey: 'sb_publishable_test', store }), verifyVideo }, async (request) => {
      const response = await request('/submissions', { token: userToken, body: input });
      assert.ok([422, 503].includes(response.status)); assert.equal(store.videos.length, 0);
    });
  }
  const store = fakeStore(); store.insert = async () => { throw new Error('sensitive database details'); };
  await withServer({ runtime: () => ({ url: 'https://example.supabase.co', publicKey: 'sb_publishable_test', store }), verifyVideo: async () => verified }, async (request) => {
    const response = await request('/submissions', { token: userToken, body: input }); assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'community-unavailable' });
  });
});

test('moderator access is enforced server-side; reports, dismissal and takedown work', async () => {
  const store = fakeStore();
  await withServer({ runtime: () => ({ url: 'https://example.supabase.co', publicKey: 'sb_publishable_test', store }), verifyVideo: async () => verified }, async (request) => {
    await request('/submissions', { token: userToken, body: input }); const id = store.videos[0].id;
    assert.equal((await request('/moderation', { token: userToken, headers: { 'x-role': 'moderator' } })).status, 403);
    assert.equal((await request(`/moderation/${id}`, { token: userToken, body: { action: 'approve', role: 'moderator' } })).status, 403);
    assert.equal((await request(`/videos/${id}/report`, { token: userToken, body: { reason: 'Please review this' } })).status, 404, 'pending video is not reportable');
    assert.equal((await request(`/moderation/${id}`, { token: modToken, body: { action: 'approve' } })).status, 200);
    assert.equal((await request(`/moderation/${id}`, { token: modToken, body: { action: 'approve' } })).status, 409);
    const publicBody = await (await request('/videos?category=missions&q=mars')).json();
    assert.equal(publicBody.items.length, 1); assert.equal(publicBody.items[0].communityId, id);
    assert.ok(!JSON.stringify(publicBody).includes(userId));
    assert.equal((await request(`/videos/${id}/report`, { body: { reason: 'Please review this' } })).status, 401);
    assert.equal((await request(`/videos/${id}/report`, { token: userToken, body: { reason: 'Please review this' } })).status, 201);
    assert.equal((await request(`/videos/${id}/report`, { token: userToken, body: { reason: 'Please review this' } })).status, 409);
    let review = await (await request('/moderation', { token: modToken })).json(); assert.equal(review.reports.length, 1); assert.equal(review.approved.length, 1);
    const reportId = review.reports[0].id;
    assert.equal((await request(`/moderation/reports/${reportId}/dismiss`, { token: userToken, method: 'POST' })).status, 403);
    assert.equal((await request(`/moderation/reports/${reportId}/dismiss`, { token: modToken, method: 'POST' })).status, 200);
    review = await (await request('/moderation', { token: modToken })).json(); assert.equal(review.reports.length, 0);
    assert.equal((await request(`/moderation/${id}`, { token: modToken, body: { action: 'takedown' } })).status, 200);
    assert.equal((await (await request('/videos')).json()).items.length, 0);
    assert.equal((await (await request('/me', { token: userToken })).json()).submissions[0].status, 'rejected');
  });
});

test('account and IP limits reject excess requests', async () => {
  const store = fakeStore(); store.limits.set(`${userId}:submit`, false);
  await withServer({ runtime: () => ({ url: 'https://example.supabase.co', publicKey: 'sb_publishable_test', store }) }, async (request) => {
    assert.equal((await request('/submissions', { token: userToken, body: input })).status, 429);
    let response; for (let i = 0; i < 80; i++) response = await request('/config');
    assert.equal(response.status, 429); assert.ok(Number(response.headers.get('retry-after')) > 0);
  });
});

test('official YouTube verification sends its key only in a server header and rejects restricted videos', async () => {
  const oldKey = process.env.YOUTUBE_API_KEY; const oldFetch = globalThis.fetch; const calls = [];
  process.env.YOUTUBE_API_KEY = 'fake-server-verification-secret';
  try {
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), headers: init.headers });
      return new Response(JSON.stringify({ items: [{ id: 'abcdefghijk', snippet: { channelTitle: 'NASA', channelId: 'UCLA_DiR1FfKNvjuUpBHmylQ', liveBroadcastContent: 'none' }, contentDetails: { duration: 'PT55S' }, status: { embeddable: true, privacyStatus: 'public', uploadStatus: 'processed' } }] }), { status: 200 });
    };
    const result = await verifyCommunityYouTube('abcdefghijk'); assert.equal(result.officialAgency, true); assert.equal(result.durationSeconds, 55);
    assert.equal(calls[0].headers['x-goog-api-key'], 'fake-server-verification-secret'); assert.ok(!calls[0].url.includes('fake-server-verification-secret'));
    globalThis.fetch = async () => new Response(JSON.stringify({ items: [{ id: 'abcdefghijk', snippet: { channelTitle: 'Creator' }, status: { embeddable: false, privacyStatus: 'public', uploadStatus: 'processed' } }] }), { status: 200 });
    assert.equal(await verifyCommunityYouTube('abcdefghijk'), null);
    delete process.env.YOUTUBE_API_KEY; await assert.rejects(verifyCommunityYouTube('abcdefghijk'), /youtube-unavailable/);
  } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = oldKey; }
});

test('runtime config never exposes a secret or service-role key as the public key', async () => {
  const names = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const old = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const jwt = (role) => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  try {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-only-secret';
    delete process.env.SUPABASE_ANON_KEY;
    await withServer({}, async (request) => {
      for (const key of ['sb_secret_test', jwt('service_role'), 'test-server-only-secret']) {
        process.env.SUPABASE_PUBLISHABLE_KEY = key;
        assert.deepEqual(await (await request('/config')).json(), { enabled: false });
      }
      process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
      const response = await (await request('/config')).text();
      assert.ok(response.includes('sb_publishable_test'));
      assert.ok(!response.includes('test-server-only-secret'));
      process.env.SUPABASE_PUBLISHABLE_KEY = jwt('anon');
      assert.equal((await (await request('/config')).json()).enabled, true);
    });
  } finally { for (const name of names) old[name] === undefined ? delete process.env[name] : process.env[name] = old[name]; }
});

test('Supabase adapter sends verified identities and pending records to mocked Auth/PostgREST', async () => {
  const names = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'YOUTUBE_API_KEY'];
  const old = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch; const calls = []; const rows = [];
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-secret';
  process.env.YOUTUBE_API_KEY = 'fake-youtube-secret';
  delete process.env.SUPABASE_ANON_KEY;
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init); const url = new URL(req.url);
    if (url.hostname === '127.0.0.1') return originalFetch(input, init);
    const bodyText = req.method === 'POST' || req.method === 'PATCH' ? await req.clone().text() : '';
    calls.push({ path: url.pathname, search: url.search, auth: req.headers.get('authorization'), apikey: req.headers.get('apikey'), body: bodyText });
    const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (url.hostname === 'www.googleapis.com') return jsonResponse({ items: [{ id: 'abcdefghijk', snippet: { channelTitle: 'Real channel', channelId: 'UC-real', liveBroadcastContent: 'none' }, status: { embeddable: true, privacyStatus: 'public', uploadStatus: 'processed' }, contentDetails: { duration: 'PT30S' } }] });
    assert.equal(url.hostname, 'example.supabase.co');
    if (url.pathname === '/auth/v1/user') return req.headers.get('authorization') === `Bearer ${userToken}` ? jsonResponse({ id: userId, aud: 'authenticated', role: 'authenticated' }) : jsonResponse({ message: 'Invalid JWT' }, 401);
    if (url.pathname.endsWith('/rpc/cosmovision_consume_limit')) return jsonResponse(true);
    if (url.pathname.endsWith('/cosmovision_videos') && req.method === 'GET') {
      if (url.searchParams.has('video_id')) return jsonResponse(rows.filter((row) => row.video_id === 'abcdefghijk').map((row) => ({ id: row.id })));
      if (url.searchParams.get('status') === 'eq.approved') return jsonResponse(rows.filter((row) => row.status === 'approved'));
      if (url.searchParams.has('submitter_id')) return jsonResponse(rows.map((row) => ({ id: row.id, title: row.title, status: row.status, created_at: '2026-01-01T00:00:00Z' })));
      return jsonResponse([]);
    }
    if (url.pathname.endsWith('/cosmovision_videos') && req.method === 'POST') {
      rows.push({ ...JSON.parse(bodyText), id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', created_at: '2026-01-01T00:00:00Z' });
      return new Response(null, { status: 201 });
    }
    if (url.pathname.endsWith('/cosmovision_moderators')) return jsonResponse([]);
    throw new Error(`Unexpected mocked endpoint: ${url.pathname}`);
  };
  try {
    await withServer({}, async (request) => {
      const configText = await (await request('/config')).text(); assert.ok(!configText.includes('fake-service-role-secret'));
      const sent = await request('/submissions', { token: userToken, body: input }); assert.equal(sent.status, 201); assert.deepEqual(await sent.json(), { status: 'pending' });
      assert.equal(rows.length, 1); assert.equal(rows[0].status, 'pending'); assert.equal(rows[0].submitter_id, userId); assert.equal(rows[0].channel_title, 'Real channel');
      assert.equal((await request('/submissions', { token: userToken, body: input })).status, 409);
      const mine = await (await request('/me', { token: userToken })).json(); assert.equal(mine.moderator, false); assert.equal(mine.submissions[0].status, 'pending');
      assert.equal((await (await request('/videos')).json()).items.length, 0);
      assert.equal((await request('/moderation', { token: userToken })).status, 403);
    });
    assert.ok(calls.some((call) => call.path === '/auth/v1/user' && call.auth === `Bearer ${userToken}`));
    assert.ok(calls.filter((call) => call.path.startsWith('/rest/v1/')).every((call) => call.apikey === 'fake-service-role-secret'));
    assert.ok(calls.every((call) => !call.search.includes('fake-service-role-secret') && !call.search.includes('fake-youtube-secret')));
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) old[name] === undefined ? delete process.env[name] : process.env[name] = old[name];
  }
});
