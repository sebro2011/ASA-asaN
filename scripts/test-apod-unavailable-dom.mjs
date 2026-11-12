import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { clearNasaApiCache } from '../lib/nasaApi.js';

const originalFetch = globalThis.fetch;
test('APOD unavailable state links to requested NASA record and retries without fabricated data', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'localStorage', 'sessionStorage', 'getComputedStyle']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = id => clearTimeout(id);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let calls = 0;
  clearNasaApiCache();
  globalThis.fetch = async () => { calls++; return new Response('', { status: 503 }); };
  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { I18nextProvider } = await import('react-i18next');
    const i18n = (await import('../src/i18n.ts')).default;
    await i18n.changeLanguage('en');
    const { ApodViewer } = await import('../src/components/ApodViewer.tsx');
    const root = createRoot(document.getElementById('root'));
    await act(async () => { root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(ApodViewer, { lang: 'en', initialDate: '2024-01-01', onOpenExportModal() {} }))); await new Promise(r => setTimeout(r, 50)); });
    const alert = document.querySelector('[role=alert]');
    assert.ok(alert);
    assert.equal(alert.querySelector('a').getAttribute('href'), 'https://apod.nasa.gov/apod/ap240101.html');
    assert.match(alert.textContent, /No substitute image/);
    await act(async () => { alert.querySelector('button').click(); await new Promise(r => setTimeout(r, 30)); });
    assert.equal(calls, 2);
    await act(async () => root.unmount());
  } finally { globalThis.fetch = originalFetch; clearNasaApiCache(); dom.window.close(); }
});
