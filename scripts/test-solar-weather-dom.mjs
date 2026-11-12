/**
 * Solar weather panel — the UI half of the integrity fix.
 *
 * The panel must never present a reference value as an observation, and must say
 * when a reading is the last measured one rather than the current one.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-solar-weather-dom.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

function installDom() {
  const dom = new JSDOM('<!doctype html><html lang="en"><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
  });
  const { window } = dom;
  window.scrollTo = () => {};
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  const globals = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    localStorage: window.localStorage,
    getComputedStyle: window.getComputedStyle,
    requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    matchMedia: window.matchMedia,
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

async function renderPanel(payloadFactory) {
  installDom();
  globalThis.fetch = async () => payloadFactory();
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const nasaApi = await import('../lib/nasaApi.js');
  nasaApi.clearNasaApiCache();
  const { SolarWeather } = await import('../src/components/SolarWeather.jsx');

  const container = document.getElementById('root');
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(SolarWeather));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  const text = () => container.textContent ?? '';
  const feed = () => container.querySelector('[data-feed]')?.getAttribute('data-feed');
  return { container, text, feed, root, act };
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('a stale observation is labelled as the last measured one, with its time', async () => {
  const ui = await renderPanel(() =>
    json({
      success: true,
      stale: true,
      code: 'CACHED',
      source: 'NOAA SWPC',
      fetchedAt: '2026-11-12T12:05:00.000Z',
      data: {
        kpIndex: 5.33,
        stormKey: 'G1',
        stormStatus: 'minor',
        observedAt: '2026-11-12T12:00:00.000Z',
        solarWindSpeedKmS: 587.4,
      },
    }),
  );
  assert.equal(ui.feed(), 'stale');
  assert.match(ui.text(), /last measured observation/i);
  assert.match(ui.text(), /5\.3/);
  assert.match(ui.text(), /587 km\/s/);
  assert.ok(!ui.text().includes('NOAA SWPC · measured'), 'a stale reading must not claim the live label');
});

test('an outage shows reference values, says so, and reports no solar wind', async () => {
  const ui = await renderPanel(() =>
    json(
      {
        success: false,
        code: 'UPSTREAM_UNAVAILABLE',
        error: 'NOAA SWPC did not answer and no earlier observation is held by this server.',
      },
      503,
    ),
  );
  assert.equal(ui.feed(), 'sample');
  assert.match(ui.text(), /Reference values — not a live observation/);
  assert.match(ui.text(), /Bundled reference value \(not measured\)/);
  assert.doesNotMatch(ui.text(), /NOAA SWPC · measured/);
  // The reference Kp is shown, but labelled as a reference value, not a feed.
  assert.match(ui.text(), /reference value/i);
});

test('a live observation is the only state that claims a measured feed', async () => {
  const ui = await renderPanel(() =>
    json({
      success: true,
      stale: false,
      source: 'NOAA SWPC',
      fetchedAt: '2026-11-12T12:05:00.000Z',
      data: {
        kpIndex: 1.67,
        stormKey: 'G0',
        stormStatus: 'quiet',
        observedAt: '2026-11-12T12:00:00.000Z',
        solarWindSpeedKmS: null,
      },
    }),
  );
  assert.equal(ui.feed(), 'live');
  // A live Kp without a plasma answer must say so rather than borrow a number.
  assert.match(ui.text(), /not reported/);
  assert.match(ui.text(), /NOAA SWPC · measured/);
  assert.match(ui.text(), /observed 12:00 UTC/);
});
