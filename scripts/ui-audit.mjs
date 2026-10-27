/**
 * Full-destination UI audit harness (dev-only, not wired into npm scripts).
 *
 * Mounts the real app in jsdom, then visits every destination in every
 * supported language through the real header menus, capturing console
 * errors/warnings (React key warnings, undefined renders, effect failures)
 * and window errors. WebGL returns null so poster/fallback paths exercise too.
 *
 * Run: node --import tsx scripts/ui-audit.mjs
 */

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html lang="en"><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000/',
  pretendToBeVisual: true,
  resources: 'usable'
});

const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
try {
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
} catch {}
for (const k of ['HTMLElement', 'Element', 'Node', 'NodeList', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'TouchEvent']) {
  globalThis[k] = window[k];
}
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
Object.defineProperty(globalThis, 'screen', { value: window.screen, configurable: true });
globalThis.localStorage = window.localStorage;
globalThis.self = window;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

window.Element.prototype.getBoundingClientRect = function () {
  const width = this.tagName === 'CANVAS' ? 640 : 1024;
  const height = this.tagName === 'CANVAS' ? 360 : 320;
  return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) };
};
for (const p of ['clientWidth', 'offsetWidth']) {
  Object.defineProperty(window.HTMLElement.prototype, p, { configurable: true, get: () => 1024 });
}
for (const p of ['clientHeight', 'offsetHeight']) {
  Object.defineProperty(window.HTMLElement.prototype, p, { configurable: true, get: () => 320 });
}
class ResizeObserverStub {
  constructor(cb) { this.cb = cb; }
  observe(t) { this.cb([{ target: t, contentRect: { width: 1024, height: 320 } }]); }
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub;
window.ResizeObserver = ResizeObserverStub;
globalThis.IntersectionObserver = class { constructor() {} observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver = globalThis.IntersectionObserver;
window.matchMedia = (query) => ({
  matches: false, media: query, onchange: null,
  addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; }
});
window.scrollTo = () => {};
window.HTMLCanvasElement.prototype.getContext = () => null;
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
window.HTMLMediaElement.prototype.pause = () => {};

const seen = new Set();
const consoleIssues = [];
let currentScreen = 'boot';
function record(kind, args) {
  const text = args.map((v) => (v && (v.message || v.stack || String(v))) || '').join(' ');
  if (/not implemented/i.test(text)) return;
  if (/THREE_CJS_DEPRECATED|Multiple instances of Three\.js|require\("three"\)|trace-deprecation/i.test(text)) return;
  const key = text.slice(0, 240);
  if (!seen.has(key)) {
    seen.add(key);
    consoleIssues.push({ kind, screen: currentScreen, text: text.slice(0, 600) });
  }
}
console.error = (...a) => record('error', a);
console.warn = (...a) => record('warn', a);
const pageErrors = [];
window.addEventListener('error', (e) => pageErrors.push(e.message || 'window error'));
window.addEventListener('unhandledrejection', (e) => pageErrors.push('unhandledrejection: ' + (e.reason?.message || e.reason)));

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const i18n = (await import('../src/i18n.ts')).default;
const { I18nextProvider } = await import('react-i18next');
const { TrilingualProvider } = await import('../src/context/TrilingualProvider.jsx');
const App = (await import('../src/App.tsx')).default;
const { NAV_ENTRIES, NAV_GROUPS } = await import('../src/ui/navigation.ts');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const container = window.document.getElementById('root');
const root = createRoot(container);
root.render(
  React.createElement(I18nextProvider, { i18n },
    React.createElement(TrilingualProvider, null, React.createElement(App)))
);
await sleep(1500);

const click = (el) => el?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const TABS = ['home', ...NAV_ENTRIES.map((e) => e.id)];
const LANGS = ['en', 'si', 'ta'];

const results = {};
for (const lang of LANGS) {
  await i18n.changeLanguage(lang);
  await sleep(250);
  results[lang] = {};
  for (const tab of TABS) {
    currentScreen = `${lang}/${tab}`;
    const before = consoleIssues.length;
    let navFound = false;
    if (tab === 'home') {
      const homeBtn = [...container.querySelectorAll('nav[aria-label="Primary"] button')].find(
        (b) => (b.textContent || '').trim() === 'Home'
      );
      if (homeBtn) { click(homeBtn); navFound = true; }
    } else {
      const entry = NAV_ENTRIES.find((e) => e.id === tab);
      const group = NAV_GROUPS.find((g) => g.id === entry.group);
      const groupBtn = [...container.querySelectorAll('nav[aria-label="Primary"] button[aria-haspopup="menu"]')]
        .find((b) => (b.textContent || '').includes(group.labels[lang] || group.labels.en));
      if (groupBtn) {
        click(groupBtn);
        await sleep(120);
        const item = [...container.querySelectorAll('nav[aria-label="Primary"] button[role="menuitem"]')]
          .find((b) => (b.textContent || '').includes(entry.labels[lang] || entry.labels.en));
        if (item) { click(item); navFound = true; }
      }
    }
    await sleep(850);
    const text = container.textContent || '';
    const html = container.innerHTML;
    results[lang][tab] = {
      navFound,
      newIssues: consoleIssues.length - before,
      hasUndefined: /undefined|NaN/.test(text),
      empty: html.length < 6000
    };
  }
}

// Exercise the mobile "More" sheet from the tab bar
const moreBtn = [...container.querySelectorAll('nav[aria-label="Primary mobile"] button')].find((b) =>
  /more|තව|மேலும்/i.test(b.textContent || '')
);
if (moreBtn) {
  click(moreBtn);
  await sleep(400);
}
const sheetOpen = Boolean(container.querySelector('[role="dialog"][aria-modal="true"]'));
// Close it again
const closeBtn = [...container.querySelectorAll('[role="dialog"] button')].find((b) => /close/i.test(b.getAttribute('aria-label') || ''));
if (closeBtn) click(closeBtn);
await sleep(200);

console.log('\n=== TAB/LANG MATRIX ===');
for (const lang of LANGS) {
  for (const tab of TABS) {
    const r = results[lang][tab];
    const flags = [];
    if (!r.navFound) flags.push('NAV_NOT_FOUND');
    if (r.newIssues) flags.push(`+${r.newIssues} issue(s)`);
    if (r.hasUndefined) flags.push('UNDEFINED/NaN IN TEXT');
    if (r.empty) flags.push('NEAR-EMPTY RENDER');
    console.log(`${lang} ${tab.padEnd(11)} ${flags.length ? '✘ ' + flags.join(', ') : 'ok'}`);
  }
}
console.log('\nMobile More sheet opens:', sheetOpen);
console.log('\n=== UNIQUE CONSOLE ISSUES (' + consoleIssues.length + ') ===');
consoleIssues.forEach((i) => console.log(`\n[${i.kind}] ${i.text}`));
console.log('\n=== WINDOW ERRORS (' + pageErrors.length + ') ===');
[...new Set(pageErrors)].slice(0, 20).forEach((e) => console.log(' ·', e.slice(0, 300)));
process.exit(0);
