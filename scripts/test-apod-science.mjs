import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchScienceApod } from '../server/apodScience.ts';
import { apodCache } from '../server/nasaRoutes.ts';
import { fetchApod, clearNasaApiCache } from '../lib/nasaApi.js';
import express from 'express';
import { setupNasaRoutes } from '../server/nasaRoutes.ts';

const date = '2024-01-01';
const post = { id: 123, link: 'https://science.nasa.gov/image-article/apod-2024-january-1-galaxy/', title: { rendered: 'APOD: 2024 January 1 &#8211; Galaxy &amp; Stars' }, content: { rendered: '<p><strong>Explanation:</strong> A genuine astronomy explanation with <a href="https://nasa.gov">details</a>.</p><table><tr><th>Credit</th><td>Artist</td></tr></table>' }, featured_media: 456 };
const media = { id: 456, media_type: 'image', mime_type: 'image/jpeg', source_url: 'https://assets.science.nasa.gov/content/dam/science/cds/apod/apod/2024/january/galaxy.jpg' };
const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const stub = (posts = [post], image = media) => async url => String(url).includes('/media/') ? json(image) : json(posts);

test('NASA Science adapter matches exact title date, resolves media and exposes provenance', async () => {
  const result = await fetchScienceApod(date, stub());
  assert.equal(result.date, date);
  assert.equal(result.title, 'Galaxy & Stars');
  assert.equal(result.explanation, 'A genuine astronomy explanation with details .');
  assert.equal(result.source, 'NASA Science APOD archive');
  assert.equal(result.url, media.source_url);
  assert.equal(result.source_url, post.link);
  assert.equal(result.copyright, undefined);
});

test('adapter fails closed for mismatched dates, ambiguous records, video and untrusted media', async () => {
  assert.equal(await fetchScienceApod('2024-01-02', stub()), null);
  assert.equal(await fetchScienceApod(date, stub([post, post])), null);
  assert.equal(await fetchScienceApod(date, stub([{ ...post, content: { rendered: post.content.rendered + '<iframe src="https://youtube.com/embed/x"></iframe>' } }])), null);
  assert.equal(await fetchScienceApod(date, stub([post], { ...media, source_url: 'https://evil.test/apod/a.jpg' })), null);
  assert.equal(await fetchScienceApod(date, stub([post], { ...media, source_url: 'https://assets.science.nasa.gov/image/logo.png' })), null);
  assert.equal(await fetchScienceApod(date, stub([{ ...post, link: 'https://evil.test/image-article/apod-a' }])), null);
  assert.equal(await fetchScienceApod(date, stub([{ ...post, content: { rendered: '<p>not an explanation</p>' } }])), null);
  assert.equal(await fetchScienceApod(date, async () => { throw new Error('offline'); }), null);
});

test('APOD route recovers from degraded legacy API and caches truthful NASA Science source', async () => {
  const original = globalThis.fetch;
  const app = express(); setupNasaRoutes(app, {}); apodCache.clear();
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  let calls = 0;
  globalThis.fetch = async url => {
    calls++;
    if (String(url).includes('api.nasa.gov')) return json({ date, title: 'NASA Science', url: 'https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png' });
    return stub()(url);
  };
  try {
    const endpoint = `http://127.0.0.1:${server.address().port}/api/apod?date=${date}`;
    const first = await original(endpoint); const body = await first.json();
    assert.equal(first.status, 200); assert.equal(body.data.source, 'NASA Science APOD archive'); assert.equal(body.data.date, date);
    const second = await (await original(endpoint)).json(); assert.equal(second.cached, true); assert.equal(calls, 3);
    clearNasaApiCache(); globalThis.fetch = async () => json(body);
    const client = await fetchApod(date); assert.equal(client._source, 'NASA Science APOD archive'); assert.equal(client._isSample, false);
  } finally { globalThis.fetch = original; apodCache.clear(); clearNasaApiCache(); await new Promise(r => server.close(r)); }
});

test('APOD range refuses degraded NASA logo or records with mismatched dates', async () => {
  const original = globalThis.fetch; const app = express(); setupNasaRoutes(app, {});
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const url = `http://127.0.0.1:${server.address().port}/api/apod-range?start_date=2024-01-01&end_date=2024-01-01`;
  try {
    for (const data of [[{ date, title: 'NASA Science', url: 'https://science.nasa.gov/wp-content/themes/nasa-child/a.png' }], [{ date: '2024-01-02', title: 'Wrong date', url: 'https://apod.nasa.gov/image.jpg' }]]) {
      globalThis.fetch = async () => json(data);
      const response = await original(url); assert.equal(response.status, 503); assert.deepEqual((await response.json()).data, []);
    }
    globalThis.fetch = async () => json([{ date, title: 'Valid', url: 'https://apod.nasa.gov/image.jpg' }]);
    assert.equal((await original(url)).status, 200);
  } finally { globalThis.fetch = original; await new Promise(r => server.close(r)); }
});

test('observed NASA Science title and asset URL patterns match exact day without zero padding', async () => {
  const examples = [
    { date: '2024-01-01', title: 'APOD: 2024 January 1 – NGC 1232: A Grand Design Spiral Galaxy', link: 'https://science.nasa.gov/image-article/apod-2024-january-1-ngc-1232-a-grand-design-spiral-galaxy/', image: 'https://assets.science.nasa.gov/content/dam/science/cds/apod/apod/2024/january/ngc1232b_vlt_3969.jpg' },
    { date: '2026-11-12', title: 'APOD: 2026 November 12 – Moon, Venus and Spica Meet', link: 'https://science.nasa.gov/image-article/apod-2026-november-12-moon-venus-and-spica-meet/', image: 'https://assets.science.nasa.gov/dynamicimage/assets/science/cds/apod/apod/2026/november/conjunction-bubak.jpg' },
  ];
  for (const sample of examples) {
    const postFixture = { ...post, title: { rendered: sample.title }, link: sample.link };
    const mediaFixture = { ...media, source_url: sample.image };
    const result = await fetchScienceApod(sample.date, stub([postFixture], mediaFixture));
    assert.equal(result?.date, sample.date);
    assert.equal(result?.url, sample.image);
    assert.equal(result?.source_url, sample.link);
  }
});

test('single APOD route recovers when the legacy provider is unreachable', async () => {
  const original = globalThis.fetch;
  const app = express(); setupNasaRoutes(app, {}); apodCache.clear();
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  globalThis.fetch = async url => {
    if (String(url).includes('api.nasa.gov')) throw new TypeError('network unavailable');
    return stub()(url);
  };
  try {
    const response = await original(`http://127.0.0.1:${server.address().port}/api/apod?date=${date}`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.source, 'NASA Science APOD archive');
  } finally { globalThis.fetch = original; apodCache.clear(); await new Promise(r => server.close(r)); }
});
