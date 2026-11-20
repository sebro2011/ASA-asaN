import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { JSDOM } from 'jsdom';
import { createMarsPhotosRouter } from '../server/marsPhotos.ts';

const realFetch = globalThis.fetch;
const photo = (id = 1) => ({ id, sol: 1000, earth_date: '2015-05-30', rover: { name: 'Curiosity' }, camera: { full_name: 'Mast Camera' }, img_src: `http://mars.nasa.gov/image${id}.jpg?api_key=TEST_SECRET` });

async function withServer(fetchImpl, run) {
  const app = express();
  app.use('/api/mars', createMarsPhotosRouter({ fetchImpl, getKey: () => 'TEST_SECRET' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}/api/mars`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('Mars proxy validates inputs, normalizes trusted images, caches and preserves freshness', async () => {
  let calls = 0;
  await withServer(async url => {
    calls++;
    assert.match(String(url), /sol=1000/);
    return new Response(JSON.stringify({ photos: [photo(), { ...photo(2), img_src: 'https://nasa.gov.evil.test/secret.jpg' }, { ...photo(3), sol: 999 }] }), { status: 200 });
  }, async base => {
    for (const query of ['rover=other&sol=1000', 'rover=curiosity&sol=-1', 'rover=curiosity&sol=2.2', 'rover=curiosity&sol=1000&page=101', 'rover=curiosity&sol=1&sol=2']) {
      assert.equal((await realFetch(`${base}/photos?${query}`)).status, 400);
    }
    assert.equal(calls, 0);
    const first = await (await realFetch(`${base}/photos?rover=curiosity&sol=1000&page=1`)).json();
    assert.equal(first.ok, true);
    assert.equal(first.photos.length, 1);
    assert.equal(first.omitted, 2);
    assert.equal(first.photos[0].imageUrl, 'https://mars.nasa.gov/image1.jpg');
    assert.equal(JSON.stringify(first).includes('TEST_SECRET'), false);
    assert.equal(first.cached, false);
    const second = await (await realFetch(`${base}/photos?rover=curiosity&sol=1000&page=1`)).json();
    assert.equal(second.cached, true);
    assert.equal(second.retrievedAt, first.retrievedAt);
    assert.equal(calls, 1);
  });
});

test('Mars proxy distinguishes empty, pagination, malformed data and provider failure', async () => {
  let mode = 'empty';
  await withServer(async () => {
    if (mode === 'empty') return new Response(JSON.stringify({ photos: [] }), { status: 200 });
    if (mode === 'full') return new Response(JSON.stringify({ photos: Array.from({ length: 25 }, (_, i) => photo(i)) }), { status: 200 });
    if (mode === 'bad') return new Response(JSON.stringify({ error: 'oops' }), { status: 200 });
    if (mode === 'rate') return new Response('', { status: 429 });
    throw new DOMException('timeout', 'TimeoutError');
  }, async base => {
    const request = async page => realFetch(`${base}/photos?rover=curiosity&sol=1000&page=${page}`);
    const empty = await (await request(1)).json();
    assert.deepEqual(empty.photos, []); assert.equal(empty.hasMore, false);
    mode = 'full'; assert.equal((await (await request(2)).json()).hasMore, true);
    mode = 'bad'; assert.equal((await request(3)).status, 502);
    mode = 'rate'; assert.equal((await request(3)).status, 429);
    mode = 'timeout'; assert.equal((await request(3)).status, 504);
  });
});

test('the live feed serves newest-first NASA raw images and hardens every URL it hands out', async () => {
  let calls = [];
  const feedImage = (over = {}) => ({
    imageid: 'RLB_848385057EDR_S1260000RHAZ00303M_',
    sol: 5079,
    camera: { instrument: 'RHAZ_LEFT_B' },
    image_files: {
      medium: 'https://mars.nasa.gov/msl-raw-images/med.jpg',
      large: 'https://mars.nasa.gov/msl-raw-images/large.jpg',
      full_res: 'https://mars.nasa.gov/msl-raw-images/full.JPG'
    },
    caption: "NASA's Mars Curiosity rover acquired this image.\n\nAcquired on Nov. 19, 2026 (Sol 5079).",
    credit: 'NASA/JPL-Caltech',
    title: 'Mars Curiosity Sol 5079: Rear Hazcam',
    link: 'https://mars.nasa.gov/msl/multimedia/raw-images/RLB_848385057EDR',
    date_taken_utc: '2026-11-19T19:44:04.51393',
    date_received: '2026-11-20T00:33:04Z',
    ...over
  });

  await withServer(async url => {
    calls.push(String(url));
    return new Response(JSON.stringify({
      images: [
        feedImage(),
        // An off-NASA host would make the reader's browser call a third party.
        feedImage({ imageid: 'EVIL_0001', image_files: { medium: 'https://evil.test/a.jpg' } }),
        feedImage({ imageid: 'EVIL_0002', link: 'http://mars.nasa.gov/insecure' }),
        feedImage({ imageid: 'EVIL_0003', date_taken_utc: 'not-a-date' }),
        feedImage({ imageid: 'EVIL_0004', sol: 5079.5 })
      ],
      total_results: 607104
    }), { status: 200 });
  }, async base => {
    for (const query of ['rover=opportunity', 'rover=curiosity&num=0', 'rover=curiosity&num=99', 'rover=curiosity&page=51', 'rover=curiosity&num=1.5']) {
      assert.equal((await realFetch(`${base}/latest?${query}`)).status, 400, query);
    }
    assert.equal(calls.length, 0, 'invalid input never reaches NASA');

    const first = await (await realFetch(`${base}/latest?rover=curiosity&num=5&page=0`)).json();
    assert.equal(first.ok, true);
    assert.equal(first.images.length, 1, 'four malformed records are omitted, not repaired');
    assert.equal(first.omitted, 4);
    assert.equal(first.latestSol, 5079);
    assert.equal(first.cached, false);
    const image = first.images[0];
    assert.equal(image.imageUrl, 'https://mars.nasa.gov/msl-raw-images/med.jpg');
    assert.equal(image.pageUrl, 'https://mars.nasa.gov/msl/multimedia/raw-images/RLB_848385057EDR');
    assert.equal(image.takenUtc, '2026-11-19T19:44:04.513Z', 'timestamps are normalised to UTC');
    assert.equal(image.receivedUtc, '2026-11-20T00:33:04.000Z');
    assert.equal(/\s{2,}/.test(image.caption), false, 'the caption is collapsed to one line');
    assert.match(calls[0], /category=msl/);
    assert.match(calls[0], /order=sol\+desc/, 'newest first is the whole point');
    assert.equal(JSON.stringify(first).includes('api_key'), false);

    const second = await (await realFetch(`${base}/latest?rover=curiosity&num=5&page=0`)).json();
    assert.equal(second.cached, true, 'a repeat within the TTL does not spend another request');
    assert.equal(second.retrievedAt, first.retrievedAt);
    assert.equal(calls.length, 1);

    const perseverance = await (await realFetch(`${base}/latest?rover=perseverance&num=5`)).json();
    assert.equal(perseverance.ok, true);
    assert.match(calls[1], /category=mars2020/, 'Perseverance has its own feed');
  });
});

test('the live feed reports failures instead of an empty success', async () => {
  await withServer(async () => new Response('', { status: 429 }), async base => {
    const limited = await realFetch(`${base}/latest?rover=curiosity`);
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).code, 'MARS_FEED_RATE_LIMITED');
  });
  await withServer(async () => new Response('not json', { status: 200 }), async base => {
    const bad = await realFetch(`${base}/latest?rover=curiosity`);
    assert.equal(bad.status, 502);
    assert.equal((await bad.json()).code, 'MARS_FEED_INVALID_RESPONSE');
  });
  await withServer(async () => { throw Object.assign(new Error('slow'), { name: 'TimeoutError' }); }, async base => {
    const timedOut = await realFetch(`${base}/latest?rover=curiosity`);
    assert.equal(timedOut.status, 504);
    assert.equal((await timedOut.json()).code, 'MARS_FEED_TIMEOUT');
  });
  await withServer(async () => new Response(JSON.stringify({ images: [] }), { status: 200 }), async base => {
    const empty = await (await realFetch(`${base}/latest?rover=curiosity`)).json();
    assert.equal(empty.ok, true);
    assert.equal(empty.images.length, 0);
    assert.equal(empty.latestSol, null, 'an empty feed reports no sol rather than inventing one');
  });
});

test('Mars gallery renders stubbed data and an unavailable state in jsdom', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let response = { ok: true, photos: [{ id: 10, sol: 1000, earthDate: '2015-05-30', rover: 'Curiosity', camera: 'Mast Camera', imageUrl: 'https://mars.nasa.gov/a.jpg' }], retrievedAt: '2020-01-01T00:00:00.000Z', cached: false, hasMore: false, omitted: 0 };
  globalThis.fetch = async () => new Response(JSON.stringify(response), { status: 200 });
  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const MarsRoverPhotos = (await import('../src/components/MarsRoverPhotos.tsx')).default;
    const root = createRoot(document.getElementById('root'));
    await act(async () => { root.render(React.createElement(MarsRoverPhotos, { lang: 'si' })); await new Promise(r => setTimeout(r, 20)); });
    assert.match(document.body.textContent, /අඟහරු රෝවර් ඡායාරූප/);
    // The gallery now opens on the live feed, so the sol browser is one explicit
    // click away; this test covers the sol view exactly as it was.
    const solTab = [...document.querySelectorAll('button')].find(button => button.textContent === 'Sol අනුව බලන්න');
    assert.ok(solTab, 'the sol browser is reachable');
    await act(async () => { solTab.click(); await new Promise(r => setTimeout(r, 20)); });
    assert.match(document.body.textContent, /Mast Camera/);
    assert.match(document.body.textContent, /2020-01-01T00:00:00.000Z/);
    assert.equal(document.querySelector('img').getAttribute('src'), 'https://mars.nasa.gov/a.jpg');
    globalThis.fetch = async () => new Response('', { status: 503 });
    const form = document.querySelector('form');
    await act(async () => { form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 20)); });
    assert.match(document.querySelector('[role=alert]').textContent, /NASA/);
    assert.ok(document.querySelector('[role=alert] button'), 'failed requests offer retry');
    await act(async () => root.unmount());
  } finally { globalThis.fetch = realFetch; dom.window.close(); }
});


test('the live view renders newest-first images, both dates, and an honest failure state', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const calls = [];
  const payload = {
    ok: true,
    images: [{
      id: 'RLB_848385057EDR_S1260000RHAZ00303M_',
      sol: 5079,
      rover: 'Curiosity',
      camera: 'RHAZ_LEFT_B',
      takenUtc: '2026-11-19T19:44:04.513Z',
      receivedUtc: '2026-11-20T00:33:04.000Z',
      caption: 'Acquired on Nov. 19, 2026 (Sol 5079)',
      credit: 'NASA/JPL-Caltech',
      title: 'Mars Curiosity Sol 5079: Rear Hazcam',
      imageUrl: 'https://mars.nasa.gov/msl-raw-images/med.jpg',
      pageUrl: 'https://mars.nasa.gov/msl/multimedia/raw-images/RLB_848385057EDR'
    }],
    latestSol: 5079,
    retrievedAt: '2026-11-20T00:40:00.000Z',
    cached: false,
    hasMore: false,
    omitted: 0
  };
  globalThis.fetch = async url => { calls.push(String(url)); return new Response(JSON.stringify(payload), { status: 200 }); };
  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const MarsRoverPhotos = (await import('../src/components/MarsRoverPhotos.tsx')).default;
    const root = createRoot(document.getElementById('root'));
    await act(async () => { root.render(React.createElement(MarsRoverPhotos, { lang: 'en' })); await new Promise(r => setTimeout(r, 20)); });

    assert.match(calls[0], /\/api\/mars\/latest\?rover=perseverance/, 'the live feed is the default view');
    const text = document.body.textContent;
    assert.match(text, /Sol 5079/);
    assert.match(text, /Taken: 2026-11-19 19:44Z/, 'the acquisition time is shown');
    assert.match(text, /Received: 2026-11-20 00:33Z/, 'the downlink time is shown too, so "live" is not overstated');
    assert.match(text, /NASA\/JPL-Caltech/);
    assert.equal(document.querySelector('article img').getAttribute('src'), 'https://mars.nasa.gov/msl-raw-images/med.jpg');
    assert.equal(document.querySelector('article a').getAttribute('href'), 'https://mars.nasa.gov/msl/multimedia/raw-images/RLB_848385057EDR');

    globalThis.fetch = async () => new Response('', { status: 503 });
    const refresh = [...document.querySelectorAll('button')].find(button => button.textContent === 'Refresh');
    assert.ok(refresh, 'a live view needs a way to pull again without changing the rover');
    await act(async () => { refresh.click(); await new Promise(r => setTimeout(r, 20)); });
    const alert = document.querySelector('[role=alert]');
    assert.ok(alert, 'a failed live fetch is announced');
    assert.ok([...alert.querySelectorAll('button')].length > 0, 'and offers a retry');
    await act(async () => root.unmount());
  } finally { globalThis.fetch = realFetch; dom.window.close(); }
});
