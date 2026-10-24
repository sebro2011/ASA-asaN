/**
 * Chart-render regression test for the Earth Intelligence Lab.
 *
 * Reported defect: the Lab displays retrieved values (tiles, tables, summaries)
 * but the Recharts surface renders empty. This test mounts the real
 * `TrendDetective` component against a NASA POWER-shaped payload and asserts
 * that a chart with measurable geometry is actually produced — not merely that
 * the data arrived.
 *
 * Run: node --import tsx scripts/chart-smoke.mjs
 */

import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000/',
  pretendToBeVisual: true
});
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
try {
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
} catch {}
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.NodeList = window.NodeList;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.MouseEvent = window.MouseEvent;
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
Object.defineProperty(globalThis, 'screen', { value: window.screen, configurable: true });
globalThis.localStorage = window.localStorage;
globalThis.self = window;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

/* A 1600×900-ish desktop viewport, so this reproduces the reported layout. */
const VIEWPORT = { width: 1440, height: 900 };
window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  const cls = this.getAttribute?.('class') || '';
  // Recharts measures the legend wrapper to reserve plot space; a real legend is
  // ~20px tall. (Returning the full viewport here collapses the plot area and is
  // how the original blank-chart defect was reproduced.)
  if (cls.includes('recharts-legend-wrapper') || cls.includes('recharts-default-legend')) {
    return { x: 0, y: 280, top: 280, left: 0, right: 900, bottom: 300, width: 900, height: 20, toJSON: () => ({}) };
  }
  if (this.classList?.contains('recharts-responsive-container')) {
    return { x: 0, y: 0, top: 0, left: 0, right: 1100, bottom: 320, width: 1100, height: 320, toJSON: () => ({}) };
  }
  const width = VIEWPORT.width;
  const height = VIEWPORT.height;
  return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) };
};

class ResizeObserverStub {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target) {
    this.callback([{ target, contentRect: { width: 1100, height: 320 } }]);
  }
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub;
window.ResizeObserver = ResizeObserverStub;

/* --------------------------- NASA POWER fixture --------------------------- */
const START = 2005;
const END = 2024;
function powerPayload() {
  const t2m = {};
  const precip = {};
  for (let year = START; year <= END; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const key = `${year}${String(month).padStart(2, '0')}`;
      // Deterministic seasonal signal + a small warming drift.
      const seasonal = 27.6 + 1.6 * Math.sin(((month - 4) / 12) * 2 * Math.PI);
      t2m[key] = Number((seasonal + (year - START) * 0.02).toFixed(2));
      precip[key] = Number((4.2 + 3.4 * Math.sin(((month - 10) / 12) * 2 * Math.PI)).toFixed(2));
    }
    t2m[`${year}13`] = Number((27.6 + (year - START) * 0.02).toFixed(2));
    precip[`${year}13`] = 4.2;
  }
  return {
    header: { title: 'NASA POWER Monthly', version: '2.1' },
    geometry: { coordinates: [79.8612, 6.9271, 12.4] },
    properties: { parameter: { T2M: t2m, PRECTOTCORR: precip } }
  };
}

globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.includes('/api/earth/power')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        payload: powerPayload(),
        usedParameters: ['T2M', 'PRECTOTCORR'],
        sourceUrl: 'https://power.larc.nasa.gov/api/temporal/monthly/point?test=1',
        retrievedAt: new Date().toISOString(),
        fromCache: false
      })
    };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};
window.fetch = globalThis.fetch;

/* ------------------------------- mount ----------------------------------- */
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
await import('../src/i18n.ts');
const { I18nextProvider } = await import('react-i18next');
const i18n = (await import('../src/i18n.ts')).default;
const TrendDetective = (await import('../src/components/earth/TrendDetective.tsx')).default;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const container = window.document.getElementById('root');
const root = createRoot(container);

root.render(
  React.createElement(
    I18nextProvider,
    { i18n },
    React.createElement(TrendDetective, {
      area: { label: 'Colombo', latitude: 6.9271, longitude: 79.8612, source: 'preset' },
      onAreaChange: () => {},
      onPowerResolved: () => {},
      reducedMotion: true
    })
  )
);

await sleep(2500);

/* ------------------------------- assertions ------------------------------- */
const text = container.textContent || '';
const charts = [...container.querySelectorAll('.recharts-responsive-container')];
const surfaces = [...container.querySelectorAll('svg.recharts-surface')];
const paths = [...container.querySelectorAll('svg.recharts-surface path')];
const bars = [...container.querySelectorAll('svg.recharts-surface .recharts-bar-rectangle')];
const axes = [...container.querySelectorAll('svg.recharts-surface .recharts-cartesian-axis')];
const lineCurves = [...container.querySelectorAll('svg.recharts-surface .recharts-line-curve')];
const areaCurves = [...container.querySelectorAll('svg.recharts-surface .recharts-area-curve')];

const hasGeometry = paths.some((path) => {
  const d = path.getAttribute('d') || '';
  return d.length > 20 && !/NaN|Infinity/.test(d);
});

const results = {
  'dataset rendered (values reached the UI)': /2005-01|2005|months/i.test(text),
  'responsive containers mounted': charts.length > 0,
  'chart surfaces mounted': surfaces.length > 0,
  'chart path geometry is finite and non-empty': hasGeometry,
  'axis ticks rendered': axes.length >= 2,
  'observed series rendered (area/line)': areaCurves.length >= 1 || lineCurves.length >= 1,
  'annual mean overlay rendered': lineCurves.length >= 1,
  'in-chart legend removed (custom legend used)': container.querySelectorAll('.recharts-legend-wrapper').length === 0,
  'series values are finite': hasGeometry && !/NaN/.test(container.innerHTML),
  'annual bar series rendered': bars.length >= 5
};

let failed = 0;
for (const [name, ok] of Object.entries(results)) {
  console.log(`${ok ? '✔' : '✘'} ${name}`);
  if (!ok) failed += 1;
}

if (failed) {
  console.log('\nDiagnostics');
  console.log('  responsive containers:', charts.length, '| surfaces:', surfaces.length, '| paths:', paths.length);
  console.log('  first container outerHTML:', charts[0]?.outerHTML?.slice(0, 400));
  console.log('  rendered text sample:', text.slice(0, 600).replace(/\s+/g, ' '));
  const classes = new Set();
  surfaces.forEach((surface) => {
    surface.querySelectorAll('*').forEach((node) => {
      (node.getAttribute('class') || '').split(/\s+/).filter(Boolean).forEach((cls) => {
        if (cls.startsWith('recharts')) classes.add(cls);
      });
    });
  });
  console.log('  recharts classes:', [...classes].sort().join(' '));
  console.log('  line layers:', container.querySelectorAll('.recharts-line').length, '| area layers:', container.querySelectorAll('.recharts-area').length);
  console.log('  first line html:', container.querySelector('.recharts-line')?.outerHTML?.slice(0, 500));
}

assert.equal(failed, 0, `${failed} chart check(s) failed`);
console.log('\nChart render passed with a validated POWER-shaped payload.');
process.exit(0);
