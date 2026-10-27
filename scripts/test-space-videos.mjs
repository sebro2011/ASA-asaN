/** CosmoVision server contract tests; no API key or internet required. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import express from 'express';
import { createSpaceVideosRouter } from '../server/spaceVideos.ts';
import { matchesQuery } from '../server/spaceVideoCatalog.ts';
import { isAstronomyRelated } from '../server/astronomyRelevance.ts';

const realFetch = globalThis.fetch;
const originalKey = process.env.YOUTUBE_API_KEY;

async function withServer({ key, upstream, trustProxy = false }, run) {
  if (key === undefined) delete process.env.YOUTUBE_API_KEY;
  else process.env.YOUTUBE_API_KEY = key;
  globalThis.fetch = upstream || (() => { throw new Error('unexpected upstream request'); });
  const app = express();
  if (trustProxy) app.set('trust proxy', true);
  app.use('/api/space-videos', createSpaceVideosRouter());
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/space-videos`;
  try {
    await run((path = '', init) => realFetch(base + path, init));
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
        { id: { videoId: 'LONGvideo12' } }, { id: { videoId: 'CATcat12345' } },
        { id: { videoId: 'abcdefghijk' } }
      ]
    });
    if (parsed.pathname.endsWith('/videos')) return json({ items: [
      video('abcdefghijk', snippet('Mars by a NASA fan', 'NASA fan channel', 'UC-not-official')),
      video('TseGuyuVWKM', snippet('NASA Mars &amp; exploration', 'NASA Goddard', 'UCAY-SMFNfynqz1bdoaV8BeQ')),
      video('ABCDEFGHIJK', snippet('Mars restricted', 'NASA', 'UCLA_DiR1FfKNvjuUpBHmylQ'), { status: { embeddable: false, privacyStatus: 'public', uploadStatus: 'processed' } }),
      video('XYZxyz12345', snippet('The distant universe', 'Science channel', 'UC-other', 'A lecture about galaxies')),
      video('LIVElive123', { ...snippet('Mars live', 'Science channel', 'UC-other'), liveBroadcastContent: 'live' }),
      video('LONGvideo12', snippet('Mars lecture', 'Science channel', 'UC-other'), { contentDetails: { duration: 'PT1H2M3S' } }),
      video('CATcat12345', snippet('New cat species #mars #astronomy', 'Unrelated', 'UC-other', 'A cat video #mars #astronomy #space'))
    ] });
    return json({ error: 'unexpected endpoint' }, 500);
  };
}

test('without a key, show source-linked short astronomy videos from multiple channels', async () => {
  await withServer({}, async (get) => {
    const response = await get('?mode=shorts');
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(body.source, 'curated');
    assert.equal(body.reason, 'missing-key');
    assert.equal(body.items.length, 5);
    assert.equal(body.nextPageToken, null);
    assert.deepEqual(body.items.slice(0, 3).map((item) => item.channelTitle), ['Dr. Becky', 'NASA Goddard', 'Astrum']);
    assert.equal(body.items.find((item) => item.id === '1ifqd3n6ZFY').channelId, 'UCYNbYGl89UUowy8oXkipC-Q');
    assert.equal(body.items.find((item) => item.id === 'Is7z49LToNg').channelId, 'UC-9b7aDP6ZN0coj9-xFnrtw');
    for (const item of body.items) {
      assert.match(item.id, /^[A-Za-z0-9_-]{11}$/);
      assert.equal(item.officialAgency, item.channelTitle === 'NASA Goddard');
      if (item.channelTitle === 'Dr. Becky' || item.channelTitle === 'Astrum') {
        assert.equal(item.portraitVerified, undefined, 'Shorts status does not itself prove portrait orientation');
      }
      if (item.id === 'TseGuyuVWKM') {
        assert.equal(item.channelTitle, '');
        assert.equal(item.channelId, undefined);
      }
      assert.match(item.sourceUrl, /^https:\/\/(svs\.gsfc\.nasa\.gov|www\.thesciencechannel\.org)\//);
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
    assert.equal(second.items.length, 6);
    const allVideos = [...first.items, ...second.items];
    assert.ok(allVideos.some((item) => item.title.includes('LISA Pathfinder')));
    assert.ok(allVideos.every((item) => item.sourceUrl));
    assert.deepEqual(new Set(first.items.map((item) => item.channelTitle)), new Set(['CrashCourse', 'NASA Goddard', 'PBS Space Time', 'European Space Agency, ESA']));
    assert.ok(first.items.some((item) => item.id === '0rHUDWjR5gg'));
    assert.ok(first.items.some((item) => item.id === '1Ou1MckZHTA'));
    assert.ok(!allVideos.some((item) => item.id === 'f-2F3QD_UyA'), 'remove the general Earth-observation video');
    assert.equal(new Set(allVideos.map((item) => item.id)).size, allVideos.length);
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
      '?pageToken=../../x', '?pageToken=y.A', '?mode=shorts&mode=videos', '?q[]=mars'
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
    assert.ok(body.nextPageToken?.startsWith('y.'), 'live token must be wrapped separately from curated offsets');
    assert.deepEqual(body.items.map((item) => item.id), ['abcdefghijk', 'TseGuyuVWKM'], 'preserve relevance order, not NASA-first order');
    assert.equal(body.items[0].officialAgency, false, 'a channel name is not proof of an official account');
    assert.equal(body.items[1].officialAgency, true);
    assert.equal(body.items[1].title, 'NASA Mars & exploration');
    assert.ok(!body.items.some((item) => item.id === 'CATcat12345'), 'hashtags alone cannot make an unrelated video astronomical');
    assert.equal(body.items[0].durationSeconds, 63);
    assert.equal(body.items[0].publishedAt, '2025-03-01T12:00:00Z');
    assert.equal(body.items[0].portraitVerified, undefined, 'short-duration search does not prove portrait or Shorts');
    assert.ok(!JSON.stringify(body).includes('server-secret-test'));
    assert.equal(calls.length, 2);
    assert.equal(calls[0].hostname, 'www.googleapis.com');
    assert.equal(calls[0].searchParams.get('key'), null, 'key is not included in URLs');
    assert.equal(calls[0].testHeaders['x-goog-api-key'], 'server-secret-test');
    assert.equal(calls[1].testHeaders['x-goog-api-key'], 'server-secret-test');
    assert.equal(calls[0].searchParams.get('q'), 'mars astronomy');
    assert.equal(calls[0].searchParams.get('maxResults'), '30');
    assert.equal(calls[0].searchParams.get('videoDuration'), 'short');
    assert.equal(calls[0].searchParams.get('videoEmbeddable'), 'true');
    assert.equal(calls[1].searchParams.get('id'), 'abcdefghijk,TseGuyuVWKM,ABCDEFGHIJK,XYZxyz12345,LIVElive123,LONGvideo12,CATcat12345');
    const cached = await (await get('?mode=shorts&category=all&q=MARS')).json();
    assert.equal(cached.cached, true);
    assert.equal(calls.length, 2, 'repeat search does not use YouTube quota');
    const gallery = await (await get('?mode=videos&category=missions&q=mars')).json();
    assert.ok(gallery.items.some((item) => item.id === 'LONGvideo12' && item.durationSeconds === 3723));
    assert.ok(!gallery.items.some((item) => item.id === 'LIVElive123'));
    assert.equal(calls[2].searchParams.get('videoDuration'), 'any');
    assert.equal(calls[2].searchParams.get('q'), 'mars astronomy mission');
    assert.ok(!calls[2].searchParams.get('q').includes('NASA'), 'missions are not limited to one agency');
  });
});

test('live metadata rejects unavailable videos without asserting official Shorts status', async () => {
  const id = (n) => `v${String(n).padStart(10, '0')}`;
  const publicStatus = { embeddable: true, privacyStatus: 'public', uploadStatus: 'processed' };
  const named = (n, extra = {}) => video(id(n), snippet(`Mars &amp; stars ${n}`, 'Astronomy creator', 'UC-other'), extra);
  const fixtures = [
    named(0),
    named(1, { contentDetails: { duration: 'PT3M59S' } }),
    named(2, { contentDetails: { duration: 'PT4M' } }),
    named(3, { contentDetails: { duration: 'unknown' } }),
    named(4, { status: { ...publicStatus, embeddable: false } }),
    named(5, { status: { ...publicStatus, privacyStatus: 'private' } }),
    named(6, { status: { ...publicStatus, privacyStatus: 'unlisted' } }),
    named(7, { status: { ...publicStatus, uploadStatus: 'uploaded' } }),
    video(id(8), { ...snippet('Mars live', 'Astronomy creator', 'UC-other'), liveBroadcastContent: 'live' }),
    video(id(9), { ...snippet('Mars upcoming', 'Astronomy creator', 'UC-other'), liveBroadcastContent: 'upcoming' }),
    // id(10) was removed between search and details.
    video(id(11), snippet(' ', 'Astronomy creator', 'UC-other')),
    video(id(12), snippet('Mars', null, 'UC-other'))
  ];
  const calls = [];
  const upstream = (url) => {
    const parsed = new URL(url);
    calls.push(parsed);
    if (parsed.pathname.endsWith('/search')) return json({
      items: Array.from({ length: 13 }, (_, n) => ({ id: { videoId: id(n) } }))
    });
    return json({ items: fixtures.reverse() }); // details order must not replace search order
  };
  await withServer({ key: 'unit-test-only', upstream }, async (get) => {
    const body = await (await get('?mode=shorts')).json();
    assert.equal(body.source, 'youtube');
    assert.deepEqual(body.items.map((entry) => entry.id), [id(0), id(1), id(3)]);
    assert.equal(body.items[0].title, 'Mars & stars 0');
    assert.equal(body.items[1].durationSeconds, 239);
    assert.equal(body.items[2].durationSeconds, undefined);
    for (const entry of body.items) {
      assert.equal(entry.portraitVerified, undefined);
      assert.ok(!('isShort' in entry) && !('isShorts' in entry), 'duration is not an official Shorts classification');
    }
    const search = calls[0].searchParams;
    assert.equal(search.get('type'), 'video');
    assert.equal(search.get('order'), 'relevance');
    assert.equal(search.get('videoSyndicated'), 'true');
    assert.equal(search.get('safeSearch'), 'moderate');
    assert.equal(search.has('channelId'), false);
    assert.equal(calls[1].searchParams.get('part'), 'snippet,contentDetails,status');
  });
});

test('astronomy metadata filter admits real subjects and rejects common keyword stuffing', () => {
  const cases = [
    ['A tour of the solar system', '', true],
    ['How black holes grow', '', true],
    ['What is galactic archaeology?', '', true],
    ['New worlds around distant stars', '', true],
    ['NASA telescope discovery', 'Astronomers observed distant galaxies.', true],
    ['ග්‍රහලෝක සහ තාරකා', '', true],
    ['பிரபஞ்சத்தில் கோள்கள்', '', true],
    ['New cat species #Shorts #Space #Astronomy #Universe', 'Cats #astronomy #space', false],
    ['This creature lives inside you #astronomy', 'Biology #mars #space #galaxy', false],
    ['NASA Earth weather forecast', 'Weather update #astronomy #mars', false],
    ['Samsung Galaxy S24 phone review', 'A new phone from Samsung', false],
    ['Minecraft black hole gameplay', 'A game about space', false],
    ['Your horoscope and zodiac signs', 'Astronomy #universe', false],
    ['How to install solar panels', 'A home energy guide', false],
    ['A generic title', 'A channel description about galaxies', false]
  ];
  for (const [title, description, expected] of cases) {
    assert.equal(isAstronomyRelated({ title, description }), expected, title);
  }
});

test('an entirely filtered live page keeps its next token and never becomes a fake fallback', async () => {
  const calls = [];
  const upstream = (url) => {
    const parsed = new URL(url);
    calls.push(parsed);
    if (parsed.pathname.endsWith('/search')) {
      return json(parsed.searchParams.has('pageToken')
        ? { items: [{ id: { videoId: 'GALAXYabc12' } }] }
        : { nextPageToken: 'NEXT_PAGE1', items: [{ id: { videoId: 'CATcat12345' } }] });
    }
    return json({ items: parsed.searchParams.get('id') === 'CATcat12345'
      ? [video('CATcat12345', snippet('Cat video #astronomy', 'Pets', 'UC-pets', 'A cat #space #astronomy'))]
      : [video('GALAXYabc12', snippet('Our galaxy and its stars', 'Another astronomy channel', 'UC-other', 'A look at the Milky Way'))] });
  };
  await withServer({ key: 'server-secret-test', upstream }, async (get) => {
    const first = await (await get('?mode=videos')).json();
    assert.equal(first.source, 'youtube');
    assert.deepEqual(first.items, []);
    assert.ok(first.nextPageToken?.startsWith('y.'));
    const second = await (await get(`?mode=videos&pageToken=${encodeURIComponent(first.nextPageToken)}`)).json();
    assert.equal(second.source, 'youtube');
    assert.equal(second.items[0].id, 'GALAXYabc12');
    assert.equal(second.nextPageToken, null);
    assert.equal(calls[2].searchParams.get('pageToken'), 'NEXT_PAGE1');
  });
});

test('opaque YouTube tokens round-trip without colliding with starter offsets', async () => {
  for (const opaque of ['c_9', 'next/token+=']) {
    const received = [];
    const upstream = (url) => {
      const parsed = new URL(url);
      received.push(parsed);
      if (parsed.pathname.endsWith('/search')) {
        return parsed.searchParams.has('pageToken')
          ? json({ items: [{ id: { videoId: 'GALAXYabc12' } }] })
          : json({ nextPageToken: opaque, items: [] });
      }
      return json({ items: [video('GALAXYabc12', snippet('Our galaxy and its stars', 'Astronomy channel', 'UC-other'))] });
    };
    await withServer({ key: 'unit-test-only', upstream }, async (get) => {
      const first = await (await get('?mode=videos')).json();
      assert.equal(first.source, 'youtube');
      assert.ok(first.nextPageToken && !first.nextPageToken.startsWith('c_'));
      const second = await (await get(`?mode=videos&pageToken=${encodeURIComponent(first.nextPageToken)}`)).json();
      assert.equal(second.source, 'youtube');
      assert.equal(second.items[0].id, 'GALAXYabc12');
      assert.equal(received[1].searchParams.get('pageToken'), opaque);
    });
  }
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

test('details lookup failure does not return partial or mixed-source results', async () => {
  const upstream = (url) => new URL(url).pathname.endsWith('/search')
    ? json({ items: [{ id: { videoId: 'GALAXYabc12' } }] })
    : json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403);
  await withServer({ key: 'unit-test-only', upstream }, async (get) => {
    const first = await (await get('?mode=videos')).json();
    assert.equal(first.source, 'curated');
    assert.equal(first.reason, 'quota');
    assert.ok(!first.items.some((item) => item.id === 'GALAXYabc12'));
    const later = await get('?mode=videos&pageToken=NEXT_PAGE1');
    assert.equal(later.status, 503);
    assert.deepEqual(await later.json(), { error: 'quota' });
  });
});

test('stalled upstream requests time out and preserve safe first- and later-page behavior', async () => {
  // Keep the real AbortSignal implementation but shorten this router's seven
  // second deadline so the automated test does not need a real network or key.
  const originalTimeout = AbortSignal.timeout;
  const deadlines = [];
  let aborted = 0;
  AbortSignal.timeout = (delay) => {
    deadlines.push(delay);
    return originalTimeout(delay === 7000 ? 25 : delay);
  };
  const upstream = (_url, { signal }) => new Promise((_resolve, reject) => {
    const fail = () => {
      aborted++;
      reject(new Error('mock timeout containing unit-test-only'));
    };
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail, { once: true });
  });
  try {
    await withServer({ key: 'unit-test-only', upstream }, async (get) => {
      const [firstResponse, laterResponse] = await Promise.all([
        get('?mode=videos'), get('?mode=videos&pageToken=NEXT_PAGE1')
      ]);
      const first = await firstResponse.json();
      const later = await laterResponse.json();
      assert.equal(firstResponse.status, 200);
      assert.equal(first.source, 'curated');
      assert.equal(first.reason, 'network');
      assert.equal(laterResponse.status, 503);
      assert.deepEqual(later, { error: 'network' });
      assert.equal(JSON.stringify([first, later]).includes('unit-test-only'), false);
    });
    assert.equal(deadlines.filter((delay) => delay === 7000).length, 2);
    assert.equal(aborted, 2);
  } finally {
    AbortSignal.timeout = originalTimeout;
  }
});

test('non-JSON 429 responses are identified as quota failures', async () => {
  const upstream = () => new Response('rate limited', { status: 429, headers: { 'content-type': 'text/plain' } });
  await withServer({ key: 'unit-test-only', upstream }, async (get) => {
    const first = await (await get('?mode=videos')).json();
    assert.equal(first.source, 'curated');
    assert.equal(first.reason, 'quota');
    const next = await get('?mode=videos&pageToken=NEXT_PAGE1');
    assert.equal(next.status, 503);
    assert.equal((await next.json()).error, 'quota');
  });
});

test('server-side credentials never reach responses, URLs or logs on failures', async () => {
  // This is a generated test sentinel, not a real credential. Never log it.
  const { randomUUID } = await import('node:crypto');
  const secret = `test-only-${randomUUID()}`;
  const logged = [];
  const originals = { log: console.log, warn: console.warn, error: console.error };
  for (const name of Object.keys(originals)) console[name] = (...args) => logged.push(args.map(String).join(' '));
  try {
    for (const variant of ['network', 'upstream']) {
      let requestUrl = '';
      const upstream = (url) => {
        requestUrl = String(url);
        if (variant === 'network') throw new Error(`Mock request failed: ${secret}`);
        return json({ error: { message: secret, errors: [{ reason: 'quotaExceeded' }] } }, 403);
      };
      await withServer({ key: secret, upstream }, async (get) => {
        const response = await get(`?mode=videos&q=${variant}`);
        const body = await response.text();
        assert.equal(body.includes(secret), false, 'credential must not appear in the API response');
        assert.equal(requestUrl.includes(secret), false, 'credential must not appear in an upstream URL');
      });
    }
  } finally {
    for (const name of Object.keys(originals)) console[name] = originals[name];
  }
  assert.equal(logged.some((line) => line.includes(secret)), false, 'credential must not appear in server logs');
});

test('process-wide uncached search guard falls back or rejects later pages', async () => {
  let calls = 0;
  const upstream = (url) => {
    calls++;
    return new URL(url).pathname.endsWith('/search') ? json({ items: [] }) : json({ items: [] });
  };
  await withServer({ key: 'unit-test-only', upstream, trustProxy: true }, async (get) => {
    for (let n = 1; n <= 30; n++) {
      const response = await get(`?mode=videos&q=query${n}`, { headers: { 'x-forwarded-for': `192.0.2.${n}` } });
      assert.equal((await response.json()).source, 'youtube');
    }
    const limited = await get('?mode=videos&q=next', { headers: { 'x-forwarded-for': '192.0.2.31' } });
    const fallback = await limited.json();
    assert.equal(fallback.source, 'curated');
    assert.equal(fallback.reason, 'rate-limit');
    const next = await get('?mode=videos&q=next&pageToken=NEXT_PAGE1', { headers: { 'x-forwarded-for': '192.0.2.32' } });
    assert.equal(next.status, 429);
    assert.ok(Number(next.headers.get('retry-after')) > 0);
    assert.equal((await next.json()).error, 'rate-limit');
    assert.equal(calls, 30);
  });
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
  const { NAV_ENTRIES } = await import('../src/ui/navigation.ts');
  const destination = NAV_ENTRIES.find((entry) => entry.id === 'space-shorts');
  assert.equal(spaceShortsCopy.en.ssShorts, 'Short videos');
  assert.match(spaceShortsCopy.en.ssShortsDisclaimer, /does not confirm.+Shorts status/);
  assert.match(spaceShortsCopy.en.ssStarterShortsDisclaimer, /official Shorts status may vary/);
  for (const lang of ['en', 'si', 'ta']) {
    assert.equal(spaceShortsCopy[lang].ssTitle, 'CosmoVision');
    assert.equal(destination.labels[lang], 'CosmoVision');
    assert.deepEqual(Object.keys(spaceShortsCopy[lang]).sort(), expected, `${lang} key coverage`);
    for (const key of expected) {
      assert.ok(typeof spaceShortsCopy[lang][key] === 'string' && spaceShortsCopy[lang][key].trim(), `${lang}.${key}`);
      assert.notEqual(spaceShortsCopy[lang][key], key, `${lang}.${key} should not expose a raw key`);
    }
  }
});


test('legacy service worker does not intercept CosmoVision API responses', async () => {
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
