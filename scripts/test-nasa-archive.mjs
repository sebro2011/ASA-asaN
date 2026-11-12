/**
 * NASA Images archive — integrity contract.
 *
 * Regression target: `/api/nasa-archive` used to serve thirteen hardcoded records
 * with synthesised NASA IDs (`ARTEMIS-ORION-CREW-2025`, …) and Unsplash stock
 * photos, which the client printed as verified NASA IDs and deep-linked to
 * images.nasa.gov. These tests pin the replacement:
 *
 *   - every field comes from an upstream record (no local data at all)
 *   - rows without a real `nasa_id` or preview link are dropped, never patched
 *   - the upstream host is allowlisted and https-only
 *   - an outage is a typed failure (503), never an empty "success"
 *   - a repeat query is served from cache without a second upstream call
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-nasa-archive.mjs
 */
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';

const {
  searchNasaImages,
  normaliseNasaImageItem,
  normaliseNasaImageCollection,
  nasaImagesUrl,
  clearNasaImageCache,
  NASA_IMAGES_HOST,
} = await import('../server/nasaImageLibrary.ts');

const collection = (items, totalHits = items.length) => ({
  collection: { items, metadata: { total_hits: totalHits } },
});

const item = (overrides = {}) => ({
  data: [
    {
      nasa_id: 'PIA12345',
      title: 'Artemis II Orion crew module',
      description: 'The Orion crew module for Artemis II during testing.',
      date_created: '2024-06-11T00:00:00Z',
      center: 'JSC',
      ...overrides,
    },
  ],
  links: [{ href: 'https://images-assets.nasa.gov/image/PIA12345/PIA12345~thumb.jpg' }],
});

/* ------------------------------- adapter -------------------------------- */

test('normalisation keeps only fields that exist upstream and builds real links', () => {
  const record = normaliseNasaImageItem(item());
  assert.ok(record);
  assert.equal(record.nasaId, 'PIA12345');
  assert.equal(record.id, 'PIA12345');
  assert.equal(record.date, '2024-06-11');
  assert.equal(record.year, 2024);
  assert.equal(record.category, 'JSC');
  assert.equal(record.source, 'NASA Images (images.nasa.gov)');
  assert.equal(record.detailsUrl, 'https://images.nasa.gov/details/PIA12345');
  assert.equal(record.assetUrl, 'https://images-api.nasa.gov/asset/PIA12345');

  // No invented values when the upstream is silent.
  const sparse = normaliseNasaImageItem({
    data: [{ nasa_id: 'PIA1', title: 'Untitled record' }],
    links: [],
  });
  assert.ok(sparse);
  assert.equal(sparse.date, '');
  assert.equal(sparse.year, null);
  assert.equal(sparse.category, '');
  assert.equal(sparse.thumbnail, '');
  assert.equal(sparse.hdUrl, null);
});

test('rows without a real identifier or title are dropped, not patched', () => {
  assert.equal(normaliseNasaImageItem({ data: [{ title: 'No id' }], links: [] }), null);
  assert.equal(normaliseNasaImageItem({ data: [{ nasa_id: 'PIA1' }], links: [] }), null);
  assert.equal(normaliseNasaImageItem({ data: [], links: [] }), null);
  assert.equal(normaliseNasaImageItem(null), null);

  const collectionResult = normaliseNasaImageCollection(
    collection([item(), { data: [{ title: 'broken' }], links: [] }], 7),
  );
  assert.equal(collectionResult.items.length, 1, 'malformed rows are skipped');
  assert.equal(collectionResult.total, 7, 'the upstream hit count is preserved');
  assert.equal(normaliseNasaImageCollection({}), null);
  assert.equal(normaliseNasaImageCollection(null), null);
});

test('the upstream URL is https, allowlisted, and argument-checked', () => {
  clearNasaImageCache();
  const built = nasaImagesUrl({ q: 'artemis', year: 2024, page: 2, limit: 12 });
  assert.equal(built.ok, true);
  const url = new URL(built.url);
  assert.equal(url.hostname, NASA_IMAGES_HOST);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.searchParams.get('q'), 'artemis');
  assert.equal(url.searchParams.get('media_type'), 'image');
  assert.equal(url.searchParams.get('year_start'), '2024');
  assert.equal(url.searchParams.get('year_end'), '2024');
  assert.equal(url.searchParams.get('page_size'), '12');

  for (const bad of [
    { q: '' },
    { q: 'x'.repeat(121) },
    { q: 'ok', page: 0 },
    { q: 'ok', page: 101 },
    { q: 'ok', limit: 0 },
    { q: 'ok', limit: 25 },
    { q: 'ok', year: 1900 },
    { q: 'ok', year: 2200 },
  ]) {
    const result = nasaImagesUrl(bad);
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.equal(result.status, 400);
    assert.equal(result.code, 'INVALID_QUERY');
  }
});

test('a search returns normalised records, attribution and paging', async () => {
  clearNasaImageCache();
  const calls = [];
  const result = await searchNasaImages(
    { q: 'artemis', page: 1, limit: 2 },
    {
      fetchImpl: async (url) => {
        calls.push(url);
        return new Response(JSON.stringify(collection([item(), item({ nasa_id: 'PIA99999' })], 40)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
      now: () => Date.parse('2026-11-12T10:00:00.000Z'),
    },
  );
  assert.equal(calls.length, 1);
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);
  assert.equal(result.total, 40);
  assert.equal(result.totalPages, 20);
  assert.equal(result.hasMore, true);
  assert.equal(result.cached, false);
  assert.equal(result.fetchedAt, '2026-11-12T10:00:00.000Z');
  assert.equal(result.source, 'NASA Images (images.nasa.gov)');
});

test('a repeat query is served from cache, and the TTL expires it', async () => {
  clearNasaImageCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(JSON.stringify(collection([item()], 1)), { status: 200 });
  };
  let clock = Date.parse('2026-11-12T10:00:00.000Z');

  const first = await searchNasaImages({ q: 'jwst', page: 1, limit: 8 }, { fetchImpl, now: () => clock });
  assert.equal(first.ok, true);
  assert.equal(first.cached, false);

  clock += 60_000;
  const second = await searchNasaImages({ q: 'jwst', page: 1, limit: 8 }, { fetchImpl, now: () => clock });
  assert.equal(second.ok, true);
  assert.equal(second.cached, true);
  assert.equal(calls, 1, 'the cache spared the upstream call');

  clock += 5 * 60 * 1000 + 1;
  const third = await searchNasaImages({ q: 'jwst', page: 1, limit: 8 }, { fetchImpl, now: () => clock });
  assert.equal(third.ok, true);
  assert.equal(third.cached, false);
  assert.equal(calls, 2, 'the entry expired after the TTL');
});

test('upstream failures are typed and never substituted', async () => {
  clearNasaImageCache();
  const httpFailure = await searchNasaImages(
    { q: 'apollo' },
    { fetchImpl: async () => new Response('nope', { status: 502 }) },
  );
  assert.equal(httpFailure.ok, false);
  assert.equal(httpFailure.code, 'UPSTREAM_UNAVAILABLE');
  assert.equal(httpFailure.status, 503);
  assert.ok(!('items' in httpFailure), 'a failure carries no records');

  const networkFailure = await searchNasaImages(
    { q: 'apollo' },
    {
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
    },
  );
  assert.equal(networkFailure.ok, false);
  assert.equal(networkFailure.code, 'UPSTREAM_UNAVAILABLE');

  const timeoutFailure = await searchNasaImages(
    { q: 'apollo' },
    {
      fetchImpl: async () => {
        const error = new Error('This operation was aborted');
        error.name = 'AbortError';
        throw error;
      },
    },
  );
  assert.equal(timeoutFailure.ok, false);
  assert.equal(timeoutFailure.code, 'UPSTREAM_TIMEOUT');

  const shapeFailure = await searchNasaImages(
    { q: 'apollo' },
    { fetchImpl: async () => new Response(JSON.stringify({ nope: true }), { status: 200 }) },
  );
  assert.equal(shapeFailure.ok, false);
  assert.equal(shapeFailure.code, 'UPSTREAM_SHAPE');
});

/* --------------------------------- route -------------------------------- */

const realFetch = globalThis.fetch;
let upstreamMode = 'ok';
let upstreamCalls = 0;
let server;
let base;

globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes(NASA_IMAGES_HOST)) {
    upstreamCalls += 1;
    if (upstreamMode === 'down') return new Response('unavailable', { status: 503 });
    return new Response(JSON.stringify(collection([item()], 1)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return realFetch(input, init);
};

before(async () => {
  clearNasaImageCache();
  const { app } = await import('../server.ts');
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  globalThis.fetch = realFetch;
  if (server) server.close();
});

const callArchive = async (query) => {
  const response = await realFetch(`${base}/api/nasa-archive?${query}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  return { status: response.status, body: await response.json() };
};

test('the route requires a search term: it has no local catalogue to serve', async () => {
  const { status, body } = await callArchive('');
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.equal(body.code, 'INVALID_QUERY');
  assert.match(body.error, /live NASA Images search/i);
  assert.ok(!Array.isArray(body.articles) || body.articles.length === 0);
});

test('the route returns real upstream records with attribution', async () => {
  upstreamMode = 'ok';
  clearNasaImageCache();
  const { status, body } = await callArchive('q=artemis&limit=4');
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.articles.length, 1);
  assert.equal(body.articles[0].nasaId, 'PIA12345');
  assert.match(body.articles[0].detailsUrl, /^https:\/\/images\.nasa\.gov\/details\//);
  assert.equal(body.source, 'NASA Images (images.nasa.gov)');
  assert.ok(body.fetchedAt);
  assert.equal(body.cached, false);
});

test('the route serves a cached page without touching the upstream again', async () => {
  const before = upstreamCalls;
  const { body } = await callArchive('q=artemis&limit=4');
  assert.equal(body.cached, true);
  assert.equal(upstreamCalls, before);
});

test('an upstream outage is a 503, not an empty successful archive', async () => {
  upstreamMode = 'down';
  clearNasaImageCache();
  const { status, body } = await callArchive('q=apollo&limit=4');
  assert.equal(status, 503);
  assert.equal(body.success, false);
  assert.equal(body.code, 'UPSTREAM_UNAVAILABLE');
  assert.ok(!('articles' in body), 'no payload that could be mistaken for records');
});
