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
  React.createElement(
    I18nextProvider,
    { i18n },
    React.createElement(TrilingualProvider, null, React.createElement(App))
  )
);

await sleep(1600);

const html = container.innerHTML;
const text = container.textContent || '';

const checks = {
  'shell mounted': html.length > 5000,
  'hero headline rendered': /Explore Beyond the/.test(text),
  'hero description rendered': /Discover our changing planet/.test(text),
  'primary navigation present': Boolean(container.querySelector('nav[aria-label="Primary"]')),
  'mobile tab bar present': Boolean(container.querySelector('nav[aria-label="Primary mobile"]')),
  'skip link present': Boolean(container.querySelector('.skip-link')),
  'signal strip rendered': /Data links|api\.nasa\.gov\/planetary\/apod/.test(text),
  'mission overview rendered': /What the instruments are reporting right now/.test(text),
  'earth preview rendered': /Fifteen years of surface temperature/.test(text),
  'directory rendered': /Instruments, archives and simulators/.test(text),
  'footer attribution rendered': /Not affiliated with or endorsed by/.test(text),
  'no fabricated "live" claim on failed APOD': !/NASA API\s*Live/i.test(text)
};

/* --- navigation ----------------------------------------------------------- */
const findButton = (needle) =>
  [...container.querySelectorAll('button')].find((button) => (button.textContent || '').includes(needle));

const earthNav = [...container.querySelectorAll('nav[aria-label="Primary"] button')].find((button) =>
  (button.textContent || '').includes('Earth')
);
if (earthNav) {
  earthNav.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(900);
}
const afterNav = container.textContent || '';
checks['navigation reached the Earth destination'] = /Earth Intelligence Lab/.test(afterNav);

const homeBack = findButton('Home');
if (homeBack) {
  homeBack.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(600);
}
checks['navigation returned home'] = /Explore Beyond the/.test(container.textContent || '');

let failed = 0;
for (const [name, ok] of Object.entries(checks)) {
  console.log(`${ok ? '✔' : '✘'} ${name}`);
  if (!ok) failed += 1;
}

const meaningfulErrors = errors.filter(
  (entry) => !/Warning: An update to .* inside a test was not wrapped in act/.test(entry)
);
if (meaningfulErrors.length) {
  console.log('\nConsole errors captured:');
  meaningfulErrors.slice(0, 12).forEach((entry) => console.log('  ·', entry.slice(0, 400)));
}
if (pageErrors.length) {
  console.log('\nWindow errors captured:');
  pageErrors.slice(0, 8).forEach((entry) => console.log('  ·', entry));
}

assert.equal(failed, 0, `${failed} smoke check(s) failed`);
console.log('\nClient smoke render passed.');
process.exit(0);
