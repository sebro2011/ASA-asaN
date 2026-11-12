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
