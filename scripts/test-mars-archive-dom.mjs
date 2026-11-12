import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const realFetch = globalThis.fetch;
test('Mars archive is separately labelled and supports search, paging, failure and retry', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let mode = 'success';
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (mode === 'fail') return new Response('', { status: 503 });
    const params = new URL(String(url), 'http://localhost').searchParams;
    const articles = mode === 'empty' ? [] : [{ nasaId: 'PIA1', title: 'Rover mock-up on Earth', description: 'A model, not a Mars photograph.', date: '2011-11-28', category: 'JPL', thumbnail: 'https://images-assets.nasa.gov/image/PIA1/p.jpg', detailsUrl: 'https://images.nasa.gov/details/PIA1' }, { nasaId: 'PIA2', title: 'Untrusted preview', thumbnail: 'https://evil.test/a.jpg', detailsUrl: 'javascript:alert(1)' }, null];
    return new Response(JSON.stringify({ success: true, articles, hasMore: params.get('page') === '1', fetchedAt: '2026-01-01T00:00:00Z', total: 20, cached: false }), { status: 200 });
  };
  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const MarsArchiveExplorer = (await import('../src/components/MarsArchiveExplorer.tsx')).default;
    const root = createRoot(document.getElementById('root'));
    const wait = () => new Promise(r => setTimeout(r, 25));
    await act(async () => { root.render(React.createElement(MarsArchiveExplorer, { lang: 'en' })); await wait(); });
    assert.match(document.body.textContent, /not necessarily images taken on Mars/);
    assert.match(document.body.textContent, /Rover mock-up on Earth/);
    assert.match(document.body.textContent, /NASA record date: 2011-11-28/);
    assert.equal(document.querySelectorAll('article img').length, 1);
    assert.equal(document.querySelectorAll('article a').length, 1);
    assert.match(calls[0], /q=Mars\+rover\+curiosity/);
    const next = [...document.querySelectorAll('button')].find(b => b.textContent === 'Next');
    await act(async () => { next.click(); await wait(); });
    assert.match(calls.at(-1), /page=2/); assert.ok(next.disabled);
    const select = document.querySelector('select');
    await act(async () => { select.value = 'perseverance'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    mode = 'empty';
    await act(async () => { document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); await wait(); });
    assert.match(calls.at(-1), /perseverance/); assert.match(calls.at(-1), /page=1/);
    assert.match(document.body.textContent, /No records found/);
    mode = 'fail';
    await act(async () => { document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); await wait(); });
    assert.match(document.querySelector('[role=alert]').textContent, /unavailable/);
    mode = 'success';
    await act(async () => { document.querySelector('[role=alert] button').click(); await wait(); });
    assert.match(document.body.textContent, /Rover mock-up on Earth/);
    await act(async () => root.unmount());
  } finally { globalThis.fetch = realFetch; dom.window.close(); }
});
