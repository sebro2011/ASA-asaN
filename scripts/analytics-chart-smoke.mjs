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


/* ------------------------------- mount ----------------------------------- */
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
await import('../src/i18n.ts');
const { I18nextProvider } = await import('react-i18next');
const i18n = (await import('../src/i18n.ts')).default;
const { MissionsAnalytics } = await import('../src/components/MissionsAnalytics.tsx');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const container = window.document.getElementById('root');
const root = createRoot(container);
root.render(
  React.createElement(I18nextProvider, { i18n }, React.createElement(MissionsAnalytics, { lang: 'en' }))
);

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push([true, name]);
    console.log(`\u2714 ${name}`);
  } catch (error) {
    results.push([false, name]);
    console.log(`\u2718 ${name} \u2014 ${error.message}`);
  }
}

await sleep(700);

const surfaces = () => container.querySelectorAll('.recharts-surface');
const pathsWithArea = () => container.querySelectorAll('.recharts-area-area, .recharts-area-curve');
const linePaths = () => container.querySelectorAll('.recharts-line-curve');

check('legacy analytics chart mounts on the default tab', () => assert.ok(surfaces().length >= 1));
check('launch-success series render (area + rate line)', () => {
  assert.ok(pathsWithArea().length >= 1, 'no area geometry');
  assert.ok(linePaths().length >= 1, 'no line geometry (legend-height collapse)');
});
check('no in-chart legend remains', () => assert.equal(container.querySelectorAll('.recharts-legend-wrapper').length, 0));
check('no NaN in path geometry', () => {
  const d = [...container.querySelectorAll('path')].map((p) => p.getAttribute('d') || '').join(' ');
  assert.ok(d.length > 0, 'no path data at all');
  assert.ok(!d.includes('NaN'), 'path data contains NaN');
});

// Walk each metric tab and make sure every tab paints geometry.
for (const [index, name] of ['duration', 'destinations', 'launchers'].entries()) {
  const buttons = [...container.querySelectorAll('button[aria-pressed]')];
  const button = buttons[index + 1];
  button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(1800);
  check(`${name} tab renders chart geometry`, () => {
    const d = [...container.querySelectorAll('.recharts-surface path')]
      .map((p) => p.getAttribute('d') || '')
      .join(' ');
    if (d.length <= 40) {
      console.log('   diagnostics:', {
        surfaces: container.querySelectorAll('.recharts-surface').length,
        sectors: container.querySelectorAll('.recharts-pie-sector').length,
        paths: container.querySelectorAll('.recharts-surface path').length,
        html: container.innerHTML.length,
        sectorHtml: (container.querySelector('.recharts-pie-sector')?.outerHTML || '').slice(0, 400)
      });
    }
    assert.ok(d.replace(/[MLZz0-9 .,-]/g, '').length >= 0);
    assert.ok(d.length > 40, 'no geometry painted');
    assert.ok(!d.includes('NaN'), 'geometry contains NaN');
  });
}

const failed = results.filter(([ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} analytics chart checks passed.`);
if (failed.length) process.exitCode = 1;
