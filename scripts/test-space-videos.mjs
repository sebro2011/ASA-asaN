/** Space Shorts server contract tests; no API key or internet required. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import express from 'express';
import { createSpaceVideosRouter } from '../server/spaceVideos.ts';
import { matchesQuery } from '../server/spaceVideoCatalog.ts';

const realFetch = globalThis.fetch;
const originalKey = process.env.YOUTUBE_API_KEY;

async function withServer({ key, upstream }, run) {
  if (key === undefined) delete process.env.YOUTUBE_API_KEY;
  else process.env.YOUTUBE_API_KEY = key;
  globalThis.fetch = upstream || (() => { throw new Error('unexpected upstream request'); });
  const app = express();
  app.use('/api/space-videos', createSpaceVideosRouter());
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/space-videos`;
  try {
    await run((path = '') => realFetch(base + path));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = realFetch;
    if (originalKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = originalKey;
  }
}

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const snippet = (title, channelTitle, channelId, description = 'Mars science and space exploration') => ({
  title, description, channelTitle, channelId, publishedAt: '2025-03-01T12:00:00Z'
});
const video = (id, itemSnippet, extra = {}) => ({
  id, snippet: itemSnippet, contentDetails: { duration: 'PT1M3S' },
  status: { embeddable: true, privacyStatus: 'public', uploadStatus: 'processed' }, ...extra
});

function successfulUpstream(calls, delay = 0) {
  return async (url, options) => {
    const parsed = new URL(url);
    parsed.testHeaders = options.headers;
    calls.push(parsed);
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (parsed.pathname.endsWith('/search')) return json({
      nextPageToken: 'NEXT_PAGE1', items: [
        { id: { videoId: 'abcdefghijk' } }, { id: { videoId: 'TseGuyuVWKM' } },
        { id: { videoId: 'ABCDEFGHIJK' } }, { id: { videoId: 'invalid' } },
        { id: { videoId: 'XYZxyz12345' } }, { id: { videoId: 'LIVElive123' } },
        { id: { videoId: 'LONGvideo12' } }, { id: { videoId: 'abcdefghijk' } }
      ]
    });
    if (parsed.pathname.endsWith('/videos')) return json({ items: [
      video('abcdefghijk', snippet('Mars by a NASA fan', 'NASA fan channel', 'UC-not-official')),
      video('TseGuyuVWKM', snippet('NASA Mars &amp; exploration', 'NASA Goddard', 'UCAY-SMFNfynqz1bdoaV8BeQ')),
      video('ABCDEFGHIJK', snippet('Mars restricted', 'NASA', 'UCLA_DiR1FfKNvjuUpBHmylQ'), { status: { embeddable: false, privacyStatus: 'public', uploadStatus: 'processed' } }),
      video('XYZxyz12345', snippet('The distant universe', 'Science channel', 'UC-other', 'A lecture about galaxies')),
      video('LIVElive123', { ...snippet('Mars live', 'Science channel', 'UC-other'), liveBroadcastContent: 'live' }),
      video('LONGvideo12', snippet('Mars lecture', 'Science channel', 'UC-other'), { contentDetails: { duration: 'PT1H2M3S' } })
    ] });
    return json({ error: 'unexpected endpoint' }, 500);
  };
}

test('without a key, serve a labelled, source-linked portrait starter collection', async () => {
  await withServer({}, async (get) => {
    const response = await get('?mode=shorts');
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(body.source, 'curated');
    assert.equal(body.reason, 'missing-key');
    assert.equal(body.items.length, 3);
    assert.equal(body.nextPageToken, null);
    for (const item of body.items) {
      assert.match(item.id, /^[A-Za-z0-9_-]{11}$/);
      assert.equal(item.portraitVerified, true);
      assert.equal(item.officialAgency, item.id !== 'TseGuyuVWKM');
      if (item.id === 'TseGuyuVWKM') {
        assert.equal(item.channelTitle, '');
        assert.equal(item.channelId, undefined);
      }
      assert.match(item.sourceUrl, /^https:\/\/svs\.gsfc\.nasa\.gov\//);
      assert.equal(item.thumbnailUrl, `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`);
      assert.ok(!('modes' in item));
    }
  });
});

test('curated mode really filters, searches, and paginates source-verified entries', async () => {
  await withServer({}, async (get) => {
    const first = await (await get('?mode=videos')).json();
    assert.equal(first.items.length, 9);
    assert.equal(first.nextPageToken, 'c_9');
    const second = await (await get('?mode=videos&pageToken=c_9')).json();
    assert.equal(second.nextPageToken, null);
    assert.ok(second.items.some((item) => item.title.includes('LISA Pathfinder')));
    assert.ok(second.items.every((item) => item.sourceUrl));
    assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, first.items.length + second.items.length);
    const earth = await (await get('?mode=videos&category=earth')).json();
    assert.ok(earth.items.length > 0);
    assert.ok(earth.items.every((item) => /earth/i.test(`${item.title} ${item.description}`)));
    const moon = await (await get('?mode=videos&q=MoOn')).json();
    assert.ok(moon.items.length > 0);
    assert.ok(moon.items.every((item) => matchesQuery(item, 'moon')));
    const none = await (await get('?mode=shorts&q=not-a-real-cosmic-object')).json();
    assert.deepEqual(none.items, []);
    assert.equal(none.source, 'curated');
    assert.equal((await get('?mode=videos&pageToken=NEXT_PAGE1')).status, 503);
  });
});

test('reject malformed modes, categories, input and tokens', async () => {
  await withServer({}, async (get) => {
    for (const path of [
      '?mode=uploads', '?category=__proto__', '?q=' + 'x'.repeat(81), '?q=%00bad',
      '?pageToken=../../x', '?mode=shorts&mode=videos', '?q[]=mars'
    ]) assert.equal((await get(path)).status, 400, path);
  });
});

test('YouTube integration validates videos, uses verified IDs, honors queries, and caches', async () => {
  const calls = [];
  await withServer({ key: 'server-secret-test', upstream: successfulUpstream(calls) }, async (get) => {
    const response = await get('?mode=shorts&category=all&q=mars');
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.source, 'youtube');
    assert.equal(body.nextPageToken, 'NEXT_PAGE1');
    assert.deepEqual(body.items.map((item) => item.id), ['TseGuyuVWKM', 'abcdefghijk']);
    assert.equal(body.items[0].officialAgency, true);
    assert.equal(body.items[0].title, 'NASA Mars & exploration');
    assert.equal(body.items[1].officialAgency, false, 'a channel name is not proof of an official account');
    assert.equal(body.items[0].durationSeconds, 63);
    assert.equal(body.items[0].publishedAt, '2025-03-01T12:00:00Z');
    assert.equal(body.items[0].portraitVerified, undefined, 'short-duration search does not prove portrait or Shorts');
    assert.ok(!JSON.stringify(body).includes('server-secret-test'));
    assert.equal(calls.length, 2);
    assert.equal(calls[0].hostname, 'www.googleapis.com');
    assert.equal(calls[0].searchParams.get('key'), null, 'key is not included in URLs');
    assert.equal(calls[0].testHeaders['x-goog-api-key'], 'server-secret-test');
    assert.equal(calls[1].testHeaders['x-goog-api-key'], 'server-secret-test');
    assert.equal(calls[0].searchParams.get('q'), 'mars space astronomy');
    assert.equal(calls[0].searchParams.get('videoDuration'), 'short');
    assert.equal(calls[0].searchParams.get('videoEmbeddable'), 'true');
    assert.equal(calls[1].searchParams.get('id'), 'abcdefghijk,TseGuyuVWKM,ABCDEFGHIJK,XYZxyz12345,LIVElive123,LONGvideo12');
    const cached = await (await get('?mode=shorts&category=all&q=MARS')).json();
    assert.equal(cached.cached, true);
    assert.equal(calls.length, 2, 'repeat search does not use YouTube quota');
    const gallery = await (await get('?mode=videos&category=missions&q=mars')).json();
    assert.ok(gallery.items.some((item) => item.id === 'LONGvideo12' && item.durationSeconds === 3723));
    assert.ok(!gallery.items.some((item) => item.id === 'LIVElive123'));
    assert.equal(calls[2].searchParams.get('videoDuration'), 'any');
    assert.equal(calls[2].searchParams.get('q'), 'mars space missions NASA');
  });
});

test('concurrent identical searches share a single upstream request', async () => {
  const calls = [];
  await withServer({ key: 'server-secret-test', upstream: successfulUpstream(calls, 25) }, async (get) => {
    const responses = await Promise.all(Array.from({ length: 5 }, () => get('?mode=videos&q=mars')));
    const bodies = await Promise.all(responses.map((response) => response.json()));
    assert.ok(bodies.every((body) => body.source === 'youtube'));
    assert.equal(calls.length, 2, 'one search and one details request for all five callers');
  });
});

test('quota, configuration, network and bad upstream responses fall back honestly', async () => {
  const cases = [
    { expected: 'quota', upstream: () => json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403) },
    { expected: 'configuration', upstream: () => json({ error: { errors: [{ reason: 'keyInvalid' }] } }, 403) },
    { expected: 'network', upstream: () => { throw new Error('request failed with server-secret-test'); } },
    { expected: 'upstream', upstream: () => new Response('broken JSON', { status: 502 }) }
  ];
  for (const entry of cases) {
    await withServer({ key: 'server-secret-test', upstream: entry.upstream }, async (get) => {
      const first = await (await get('?mode=videos')).json();
      assert.equal(first.source, 'curated');
      assert.equal(first.reason, entry.expected);
      assert.ok(first.items.length);
      assert.ok(!JSON.stringify(first).includes('server-secret-test'));
      const nextResponse = await get('?mode=videos&pageToken=NEXT_PAGE1');
      assert.equal(nextResponse.status, 503);
      assert.deepEqual(await nextResponse.json(), { error: entry.expected });
    });
  }
});

test('rate limiting returns a retry hint without revealing secrets', async () => {
  await withServer({}, async (get) => {
    for (let i = 0; i < 30; i++) assert.equal((await get()).status, 200);
    const response = await get();
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get('retry-after')) > 0);
    assert.deepEqual(await response.json(), { error: 'rate-limit' });
  });
});

test('new interface copy is complete and nonempty in all three languages', async () => {
  const { spaceShortsCopy } = await import('../src/i18n/spaceShorts.ts');
  const expected = Object.keys(spaceShortsCopy.en).sort();
  assert.ok(expected.length > 50);
  for (const lang of ['en', 'si', 'ta']) {
    assert.deepEqual(Object.keys(spaceShortsCopy[lang]).sort(), expected, `${lang} key coverage`);
    for (const key of expected) {
      assert.ok(typeof spaceShortsCopy[lang][key] === 'string' && spaceShortsCopy[lang][key].trim(), `${lang}.${key}`);
      assert.notEqual(spaceShortsCopy[lang][key], key, `${lang}.${key} should not expose a raw key`);
    }
  }
});


test('legacy service worker does not intercept Space Shorts API responses', async () => {
  const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  const listeners = {};
  runInNewContext(worker, {
    URL,
    self: { location: { origin: 'https://example.test' }, addEventListener: (type, callback) => { listeners[type] = callback; } }
  });
  let intercepted = false;
  listeners.fetch({
    request: { url: 'https://example.test/api/space-videos?mode=shorts', method: 'GET', destination: '' },
    respondWith: () => { intercepted = true; }
  });
  assert.equal(intercepted, false, 'network responses must not be replaced with stale shell cache entries');
});
