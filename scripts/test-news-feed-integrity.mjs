import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fetchNasaNews, clearNasaApiCache } from '../lib/nasaApi.js';

const originalFetch = globalThis.fetch;
test('news client reads current items schema and caches real provider data', async () => {
  clearNasaApiCache();
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ ok: true, items: [{ id: '1', title: 'Real headline', url: 'https://example.org/article', sourceLabel: 'Provider', publishedAt: '2025-01-01' }] }), { status: 200 }); };
    assert.equal((await fetchNasaNews())[0].sourceLabel, 'Provider');
    assert.equal((await fetchNasaNews())[0].title, 'Real headline');
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; clearNasaApiCache(); }
});

test('news feed rejects labelled samples and keeps originals on translation failure', async () => {
  const source = await readFile(new URL('../src/components/NasaNewsFeed.jsx', import.meta.url), 'utf8');
  assert.match(source, /!item\._isSample/);
  assert.doesNotMatch(source, /getMockApodFallback|getMockNewsFallback|generateLocalNewsTranslation|getCachedApod|getCachedNews/);
  assert.match(source, /item\.sourceLabel/);
  assert.match(source, /item\.publishedAt/);
  assert.match(source, /translated \? \(/);
  try {
    globalThis.fetch = async () => new Response('', { status: 503 });
    const fallback = await fetchNasaNews();
    assert.ok(fallback.length && fallback.every(item => item._isSample));
  } finally { globalThis.fetch = originalFetch; clearNasaApiCache(); }
});

test('structured news status distinguishes empty, partial, malformed and unavailable responses', async () => {
  const { fetchSpaceNewsStatus } = await import('../lib/nasaApi.js');
  try {
    clearNasaApiCache();
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ ok: true, items: [], sources: [{ state: 'ok' }, { state: 'error' }], generatedAt: '2026-01-01' }), { status: 200 }); };
    const empty = await fetchSpaceNewsStatus();
    assert.equal(empty.ok, true); assert.deepEqual(empty.items, []); assert.equal(empty.partial, true);
    assert.equal((await fetchSpaceNewsStatus()).cached, true); assert.equal(calls, 1);
    await fetchSpaceNewsStatus({ refresh: true }); assert.equal(calls, 2);
    globalThis.fetch = async () => new Response('{}', { status: 200 });
    assert.equal((await fetchSpaceNewsStatus({ refresh: true })).code, 'invalid-response');
    globalThis.fetch = async () => new Response('', { status: 429 });
    assert.equal((await fetchSpaceNewsStatus({ refresh: true })).code, 'rate-limited');
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal((await fetchSpaceNewsStatus({ refresh: true })).ok, false);
  } finally { globalThis.fetch = originalFetch; clearNasaApiCache(); }
});

test('news feed renders outage, retry, empty and provider data', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  clearNasaApiCache();
  let mode = 'error';
  globalThis.fetch = async url => {
    if (String(url).startsWith('/api/apod')) return new Response('', { status: 503 });
    if (mode === 'error') return new Response('', { status: 503 });
    const items = mode === 'empty' ? [] : [{ id: '42', title: 'Example headline', summary: 'Example summary', url: 'https://example.org/article', sourceLabel: 'Test provider', publishedAt: '2026-01-01T00:00:00Z' }];
    return new Response(JSON.stringify({ ok: true, items, sources: [{ state: 'ok' }] }), { status: 200 });
  };
  let root;
  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { I18nextProvider } = await import('react-i18next');
    const i18n = (await import('../src/i18n.ts')).default;
    await i18n.changeLanguage('en');
    const Feed = (await import('../src/components/NasaNewsFeed.jsx')).default;
    root = createRoot(document.getElementById('root'));
    await act(async () => { root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(Feed))); await new Promise(r => setTimeout(r, 25)); });
    assert.match(document.querySelector('[role=alert]').textContent, /news service is currently unavailable/i);
    assert.match(document.body.textContent, /NASA APOD is currently unavailable/);
    mode = 'empty';
    await act(async () => { document.querySelector('[role=alert] button').click(); await new Promise(r => setTimeout(r, 25)); });
    assert.match(document.body.textContent, /No news returned by the available providers/);
    mode = 'success';
    await act(async () => { document.querySelector('button[title="Refresh Feed"]').click(); await new Promise(r => setTimeout(r, 25)); });
    assert.match(document.body.textContent, /Example headline/);
    assert.match(document.body.textContent, /Test provider/);
    await act(async () => root.unmount()); root = null;
  } finally { globalThis.fetch = originalFetch; clearNasaApiCache(); dom.window.close(); }
});
