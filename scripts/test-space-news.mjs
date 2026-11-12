/**
 * Space news + astronomy papers server contract tests.
 *
 * No real network and no real key is used: `fetch` is stubbed and the three
 * optional keys are set to obvious fakes so the tests can prove a key is used
 * (and never echoed).
 *
 * Run: node --import tsx --test scripts/test-space-news.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createSpaceNewsRouter, parseArxivFeed, stripHtml } from '../server/spaceNews.ts';

const realFetch = globalThis.fetch;
const KEYS = ['GNEWS_API_KEY', 'NEWSAPI_KEY', 'GUARDIAN_API_KEY'];
const original = Object.fromEntries(KEYS.map((name) => [name, process.env[name]]));

const FAKE = {
  GNEWS_API_KEY: 'gnews-secret-TEST-123',
  NEWSAPI_KEY: 'newsapi-secret-TEST-456',
  GUARDIAN_API_KEY: 'guardian-secret-TEST-789',
};

async function withServer({ keys = {}, upstream, trustProxy }, run) {
  for (const name of KEYS) {
    const value = keys[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return upstream(String(url), options);
  };
  const app = express();
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);
  app.use('/api/news', createSpaceNewsRouter());
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/news`;
  try {
    await run((path = '', init) => realFetch(base + path, init), calls);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = realFetch;
    for (const name of KEYS) {
      const value = original[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

const spaceflightBody = {
  results: [
    {
      title: 'Webb spots a <b>watery</b> world &amp; more',
      url: 'https://spaceflight.example/webb-water',
      image_url: 'https://spaceflight.example/webb.jpg',
      news_site: 'Spaceflight Now',
      summary: '<p>JWST found <script>alert(1)</script>water vapour.</p>',
      published_at: '2026-11-06T10:00:00Z',
    },
    {
      title: 'Duplicate of the same story',
      url: 'https://spaceflight.example/webb-water/',
      summary: 'same link, different trailing slash',
      published_at: '2026-11-05T10:00:00Z',
    },
    {
      title: 'Artemis III hardware test',
      url: 'https://spaceflight.example/artemis-hardware',
      news_site: 'NASA',
      summary: 'Crew capsule pressure test.',
      published_at: '2026-11-07T08:30:00Z',
    },
    { title: 'No URL, dropped', summary: 'should not survive normalisation' },
  ],
};

const gnewsBody = {
  articles: [
    {
      title: 'Astronomers map the Milky Way’s far side',
      url: 'https://gnews.example/milky-way',
      description: 'A survey of 200 million stars.',
      image: 'https://gnews.example/milky.jpg',
      publishedAt: '2026-11-08T06:00:00Z',
      source: { name: 'Astronomy Daily' },
    },
  ],
};

const newsApiBody = {
  status: 'ok',
  articles: [
    {
      title: 'Exoplanet atmosphere seen in detail',
      url: 'https://newsapi.example/exoplanet',
      description: 'Transmission spectroscopy.',
      urlToImage: null,
      publishedAt: '2026-11-04T09:00:00Z',
      source: { name: 'Science Wire' },
    },
  ],
};

const guardianBody = {
  response: {
    results: [
      {
        webTitle: 'Black hole jet measured',
        webUrl: 'https://guardian.example/black-hole-jet',
        webPublicationDate: '2026-11-03T12:00:00Z',
        sectionName: 'Science',
        fields: { trailText: 'Radio telescopes pin down the jet.', thumbnail: 'https://guardian.example/bh.jpg' },
      },
    ],
  },
};

const arxivXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2611.00001v1</id>
    <title>Probing reionization with 21cm tomography</title>
    <summary>We present a new limit on the epoch of reionization.</summary>
    <published>2026-11-07T18:00:00Z</published>
    <author><name>A. Astronomer</name></author>
    <author><name>B. Cosmologist</name></author>
    <category term="astro-ph.CO"/>
    <link href="http://arxiv.org/abs/2611.00001v1" rel="alternate"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2611.00002v1</id>
    <title>Machine tags</title>
    <summary>lots of &lt;script&gt; removed</summary>
    <published>2026-11-06T18:00:00Z</published>
    <author><name>C. Observer</name></author>
    <category term="astro-ph.IM"/>
  </entry>
</math></feed>`;

test('the source inventory reports keys as booleans and never the value', async () => {
  await withServer({ keys: {}, upstream: () => json({}) }, async (get) => {
    const unset = await (await get('/sources')).json();
    assert.equal(unset.ok, true);
    const byId = Object.fromEntries(unset.sources.map((source) => [source.id, source]));
    assert.equal(byId.spaceflight.configured, true, 'Spaceflight News needs no key');
    assert.equal(byId.arxiv.configured, true, 'arXiv needs no key');
    assert.equal(byId.gnews.configured, false);
    assert.equal(byId.newsapi.configured, false);
    assert.equal(byId.guardian.configured, false);
    assert.equal(byId.gnews.envVar, 'GNEWS_API_KEY');
    assert.ok(byId.gnews.docs.startsWith('https://'));
    assert.equal(byId.gnews.kind, 'news');
    assert.equal(byId.arxiv.kind, 'papers');
  });

  await withServer({ keys: FAKE, upstream: () => json({}) }, async (get) => {
    const response = await get('/sources');
    const body = await response.text();
    const configured = Object.fromEntries(JSON.parse(body).sources.map((source) => [source.id, source.configured]));
    assert.equal(configured.gnews, true);
    assert.equal(configured.newsapi, true);
    assert.equal(configured.guardian, true);
    for (const secret of Object.values(FAKE)) {
      assert.equal(body.includes(secret), false, 'a key value must never reach the client');
    }
  });
});

test('unconfigured providers are skipped, configured ones are merged, deduped and sorted', async () => {
  await withServer({
    keys: { GNEWS_API_KEY: FAKE.GNEWS_API_KEY },
    upstream: (url) => {
      if (url.startsWith('https://api.spaceflightnewsapi.net')) return json(spaceflightBody);
      if (url.startsWith('https://gnews.io')) return json(gnewsBody);
      return json({}, 500);
    },
  }, async (get, calls) => {
    const response = await get('/?topic=all&limit=10');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.topic, 'all');

    const sources = Object.fromEntries(body.sources.map((source) => [source.id, source]));
    assert.equal(sources.spaceflight.state, 'ok');
    assert.equal(sources.gnews.state, 'ok');
    assert.equal(sources.newsapi.state, 'unconfigured');
    assert.equal(sources.guardian.state, 'unconfigured');

    // Trailing slash dedupe: the second Spaceflight story is dropped.
    assert.equal(body.items.filter((item) => item.url.startsWith('https://spaceflight.example/webb-water')).length, 1);
    // Sorted newest first across providers.
    const dates = body.items.map((item) => Date.parse(item.publishedAt));
    assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
    assert.equal(body.items[0].title, 'Astronomers map the Milky Way’s far side');
    assert.equal(body.items[0].sourceId, 'gnews');
    assert.equal(body.items[0].sourceLabel, 'Astronomy Daily');

    // Markup never survives normalisation.
    const webb = body.items.find((item) => item.url.includes('webb-water'));
    assert.equal(webb.title, 'Webb spots a watery world & more');
    assert.match(webb.summary, /water vapour/);
    assert.equal(/<[a-z]/i.test(webb.summary), false);

    // Unconfigured providers are never called, and no key appears anywhere.
    assert.equal(calls.some((call) => call.url.startsWith('https://newsapi.org')), false);
    assert.equal(calls.some((call) => call.url.startsWith('https://content.guardianapis.com')), false);
    const raw = JSON.stringify(body);
    assert.equal(raw.includes(FAKE.GNEWS_API_KEY), false, 'the GNews key stays server-side');
  });
});

test('NewsAPI sends its key as a header, not in the URL', async () => {
  await withServer({
    keys: { NEWSAPI_KEY: FAKE.NEWSAPI_KEY },
    upstream: (url) => {
      if (url.startsWith('https://api.spaceflightnewsapi.net')) return json({ results: [] });
      if (url.startsWith('https://newsapi.org')) return json(newsApiBody);
      return json({}, 500);
    },
  }, async (get, calls) => {
    const body = await (await get('/?limit=5')).json();
    const item = body.items.find((entry) => entry.sourceId === 'newsapi');
    assert.ok(item, 'the NewsAPI story is merged in');
    const call = calls.find((entry) => entry.url.startsWith('https://newsapi.org'));
    assert.equal(call.options.headers['X-Api-Key'], FAKE.NEWSAPI_KEY);
    assert.equal(call.url.includes(FAKE.NEWSAPI_KEY), false, 'the key is not in the URL');
    assert.equal(JSON.stringify(body).includes(FAKE.NEWSAPI_KEY), false);
  });
});

test('one failing provider does not hide the others; all failing answers 502', async () => {
  await withServer({
    keys: { GUARDIAN_API_KEY: FAKE.GUARDIAN_API_KEY },
    upstream: (url) => {
      if (url.startsWith('https://content.guardianapis.com')) return json(guardianBody);
      throw new Error('upstream down');
    },
  }, async (get) => {
    const response = await get('/?limit=5');
    assert.equal(response.status, 200);
    const body = await response.json();
    const sources = Object.fromEntries(body.sources.map((source) => [source.id, source]));
    assert.equal(sources.spaceflight.state, 'error');
    assert.equal(sources.guardian.state, 'ok');
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].url, 'https://guardian.example/black-hole-jet');
  });

  await withServer({ keys: {}, upstream: () => { throw new Error('down'); } }, async (get) => {
    const response = await get('/');
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, 'upstream');
    assert.equal(body.items, undefined, 'no invented items on failure');
  });
});

test('the news route validates topic, limit and query', async () => {
  await withServer({ keys: {}, upstream: () => json({ results: [] }) }, async (get) => {
    assert.equal((await get('/?topic=weather')).status, 400);
    assert.equal((await get('/?limit=0')).status, 400);
    assert.equal((await get('/?limit=31')).status, 400);
    assert.equal((await get('/?limit=1.5')).status, 400);
    assert.equal((await get(`/?q=${'x'.repeat(121)}`)).status, 400);
    assert.equal((await get('/?topic=missions&limit=3')).status, 200);
  });
});

test('identical requests are served from the server cache', async () => {
  await withServer({ keys: {}, upstream: () => json(spaceflightBody) }, async (get, calls) => {
    const first = await (await get('/?limit=5')).json();
    const second = await (await get('/?limit=5')).json();
    assert.equal(calls.length, 1, 'the second read never reaches upstream');
    assert.equal(second.cached, true);
    assert.deepEqual(second.items, first.items);
  });
});

test('arXiv papers are parsed from Atom, capped and validated', async () => {
  const parsed = parseArxivFeed(arxivXml);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].title, 'Probing reionization with 21cm tomography');
  assert.equal(parsed[0].url, 'https://arxiv.org/abs/2611.00001v1');
  assert.deepEqual(parsed[0].authors, ['A. Astronomer', 'B. Cosmologist']);
  assert.deepEqual(parsed[0].categories, ['astro-ph.CO']);
  // Entities are decoded and tags removed.
  assert.match(parsed[1].summary, /lots of <script> removed/);

  await withServer({
    keys: {},
    upstream: (url) => {
      if (url.startsWith('https://export.arxiv.org')) return new Response(arxivXml, { status: 200 });
      throw new Error('unexpected');
    },
  }, async (get, calls) => {
    const body = await (await get('/papers?limit=1')).json();
    assert.equal(body.ok, true);
    assert.equal(body.items.length, 1);
    assert.equal(body.source, 'arxiv');
    assert.ok(calls[0].url.includes('search_query=cat%3Aastro-ph.*') || calls[0].url.includes('search_query=cat:astro-ph'), 'defaults to astro-ph');
    assert.ok(calls[0].url.includes('sortBy=submittedDate'));

    const searched = await (await get('/papers?q=exoplanet&limit=2')).json();
    assert.equal(searched.cached, undefined);
    assert.ok(calls.some((call) => call.url.includes('all%3Aexoplanet') || call.url.includes('all:exoplanet')));

    assert.equal((await get('/papers?limit=999')).status, 400);
  });

  await withServer({ keys: {}, upstream: () => new Response('nope', { status: 500 }) }, async (get) => {
    const response = await get('/papers');
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, 'upstream');
  });
});

test('the news routes are rate limited per client', async () => {
  await withServer({ keys: {}, upstream: () => json({ results: [] }) }, async (get) => {
    let lastStatus = 200;
    for (let i = 0; i < 31; i += 1) {
      lastStatus = (await get(`/?topic=all&limit=2&q=${i}`)).status;
    }
    assert.equal(lastStatus, 429);
  });
});

test('spoofed forwarding headers cannot bypass news or papers limits with default proxy trust', async () => {
  await withServer({ keys: {}, upstream: () => json({ results: [] }) }, async (get) => {
    for (const route of ['/', '/papers']) {
      for (let i = 0; i < 30; i++) {
        const response = await get(`${route}?limit=0`, { headers: { 'x-forwarded-for': `203.0.113.${i + 1}` } });
        assert.equal(response.status, 400);
      }
      const blocked = await get(`${route}?limit=0`, { headers: { 'x-forwarded-for': '198.51.100.250' } });
      assert.equal(blocked.status, 429);
      assert.equal((await blocked.json()).code, 'rate-limited');
      assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    }
  });
});

test('configured trusted proxy walks the chain from the trusted peer, not the attacker-controlled leftmost value', async () => {
  await withServer({ keys: {}, trustProxy: 'loopback', upstream: () => json({ results: [] }) }, async (get) => {
    for (let i = 0; i < 30; i++) {
      const response = await get('/?limit=0', { headers: { 'x-forwarded-for': `203.0.113.${i + 1}, 198.51.100.7` } });
      assert.equal(response.status, 400);
    }
    assert.equal((await get('/?limit=0', { headers: { 'x-forwarded-for': '203.0.113.200, 198.51.100.7' } })).status, 429);
    assert.equal((await get('/?limit=0', { headers: { 'x-forwarded-for': '203.0.113.200, 198.51.100.8' } })).status, 400);
  });
});

test('news window resets at its boundary', async () => {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    await withServer({ keys: {}, upstream: () => json({ results: [] }) }, async (get) => {
      for (let i = 0; i < 30; i++) assert.equal((await get('/?limit=0')).status, 400);
      assert.equal((await get('/?limit=0')).status, 429);
      now += 60_000;
      assert.equal((await get('/?limit=0')).status, 400);
    });
  } finally { Date.now = realNow; }
});

test('stripHtml decodes the entities the feeds actually use', () => {
  assert.equal(stripHtml('<p>A &amp; B&nbsp;&#8217;s</p>'), 'A & B ’s');
  assert.equal(stripHtml('<script>x</script>safe'), 'safe');
});
