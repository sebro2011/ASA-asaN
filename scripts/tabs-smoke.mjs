/**
 * Client-side smoke render of the redesigned application shell.
 *
 * This is a real mount: React 19 + react-dom/client inside jsdom, with the same
 * providers the browser uses. Effects run, so state machines, lazy imports and
 * error paths execute. Network requests are expected to fail in a sandbox; the
 * point is to prove that (a) mounting does not throw, (b) the document keeps
 * rendering after a failed request, and (c) the primary navigation works.
 *
 * Run: node --import tsx scripts/browser-smoke.mjs
 * (jsdom is a dev-only, non-saved dependency: `npm i --no-save jsdom`)
 */

import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

const dom = new JSDOM('<!doctype html><html lang="en"><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000/',
  pretendToBeVisual: true,
  resources: 'usable'
});

const { window } = dom;

/* --- browser surface the app touches -------------------------------------- */
globalThis.window = window;
globalThis.document = window.document;
try {
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
} catch {
  /* Node 22 exposes a getter-only navigator; the DOM copy is still usable via window */
}
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.NodeList = window.NodeList;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.MouseEvent = window.MouseEvent;
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.TouchEvent = window.TouchEvent || window.Event;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
Object.defineProperty(globalThis, 'screen', { value: window.screen, configurable: true });
globalThis.localStorage = window.localStorage;
globalThis.self = window;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

/* jsdom has no layout engine: give elements a deterministic box so that any
   measurement-based component (charts, maps) receives a positive size instead
   of silently collapsing — replicating a real viewport. */
window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  const width = this.tagName === 'CANVAS' ? 640 : 1024;
  const height = this.tagName === 'CANVAS' ? 360 : 320;
  return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) };
};
Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1024 });
Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 320 });
Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 1024 });
Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 320 });

class ResizeObserverStub {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target) {
    this.callback([{ target, contentRect: { width: 1024, height: 320 } }]);
  }
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub;
window.ResizeObserver = ResizeObserverStub;

globalThis.IntersectionObserver = class {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.IntersectionObserver = globalThis.IntersectionObserver;

window.matchMedia =
  window.matchMedia ||
  ((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  }));

window.scrollTo = () => {};
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  // No WebGL in jsdom: return null so the app must use its poster fallback.
  return null;
};

const errors = [];
const originalError = console.error;
console.error = (...args) => {
  const text = args.map((value) => (value && (value.message || value.stack || String(value))) || '').join(' ');
  if (/not implemented/i.test(text)) return; // jsdom navigation noise
  errors.push(text);
  originalError(...args);
};
const pageErrors = [];
window.addEventListener('error', (event) => pageErrors.push(event.message || 'window error'));


/* --- mount ---------------------------------------------------------------- */
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const i18n = (await import('../src/i18n.ts')).default;
const { I18nextProvider } = await import('react-i18next');
const { TrilingualProvider } = await import('../src/context/TrilingualProvider.jsx');
const App = (await import('../src/App.tsx')).default;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const container = window.document.getElementById('root');
const root = createRoot(container);
root.render(
  React.createElement(I18nextProvider, { i18n }, React.createElement(TrilingualProvider, null, React.createElement(App)))
);

await sleep(1500);

/** Click a footer destination button by visible label. */
function navigate(label) {
  const button = [...container.querySelectorAll('footer button')].find(
    (candidate) => (candidate.textContent || '').trim() === label
  );
  if (!button) return false;
  button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return true;
}

const destinations = [
  ['Astronomy Picture of the Day', 'apod'],
  ['3D Space Lab', '3d'],
  ['Landmark Missions', 'missions'],
  ['NASA News', 'news'],
  ['Space Trivia', 'quiz'],
  ['Earth Intelligence Lab', 'earth'],
  ['EPIC Earth', 'epic'],
  ['Orbital Tracking', 'iss'],
  ['Near-Earth Objects', 'asteroids'],
  ['Exoplanet Lab', 'exoplanets'],
  ['Launch Simulator', 'launch'],
  ['NOVA Assistant', 'assistant'],
  ['Saved Research', 'saved']
];

const results = [];
for (const [label, id] of destinations) {
  const clicked = navigate(label);
  await sleep(1400);
  const text = container.textContent || '';
  const mounted = Boolean(container.querySelector('#page-top'));
  const rendered = text.length > 400;
  if (process.env.DUMP && ['launch','exoplanets','saved','epic'].includes(id)) {
    console.log(`\n--- ${id} ---\n${text.replace(/\s+/g, ' ').slice(0, 700)}\n`);
  }
  results.push([mounted && rendered && clicked, `${label} (${id})`, text.length]);
  console.log(`${mounted && rendered && clicked ? '\u2714' : '\u2718'} ${label} — ${text.length} chars, page shell ${mounted ? 'ok' : 'missing'}`);
}

const failed = results.filter(([ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} destinations mounted.`);

const meaningfulErrors = errors.filter((entry) => !/not wrapped in act|not implemented/i.test(entry));
if (meaningfulErrors.length) {
  console.log('\nConsole errors during navigation:');
  [...new Set(meaningfulErrors)].slice(0, 20).forEach((entry) => console.log('  ·', entry.slice(0, 300)));
}
process.exit(failed.length ? 1 : 0);
