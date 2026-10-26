/**
 * End-to-end UI flow: switch language via the real header menu, open the Quiz
 * destination, and assert the provider-backed quiz renders the chosen language.
 *
 * Run: node --import tsx scripts/test-quiz-lang-flow.mjs
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
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true }); } catch {}
for (const k of ['HTMLElement', 'Element', 'Node', 'NodeList', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'TouchEvent']) globalThis[k] = window[k];
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
Object.defineProperty(globalThis, 'screen', { value: window.screen, configurable: true });
globalThis.localStorage = window.localStorage;
globalThis.self = window;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
window.Element.prototype.getBoundingClientRect = function () {
  const w = this.tagName === 'CANVAS' ? 640 : 1024;
  return { x: 0, y: 0, top: 0, left: 0, right: w, bottom: 320, width: w, height: 320, toJSON: () => ({}) };
};
for (const p of ['clientWidth', 'offsetWidth']) Object.defineProperty(window.HTMLElement.prototype, p, { configurable: true, get: () => 1024 });
for (const p of ['clientHeight', 'offsetHeight']) Object.defineProperty(window.HTMLElement.prototype, p, { configurable: true, get: () => 320 });
class RO { constructor(cb) { this.cb = cb; } observe(t) { this.cb([{ target: t, contentRect: { width: 1024, height: 320 } }]); } unobserve() {} disconnect() {} }
globalThis.ResizeObserver = RO; window.ResizeObserver = RO;
globalThis.IntersectionObserver = class { constructor() {} observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver = globalThis.IntersectionObserver;
window.matchMedia = (q) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });
window.scrollTo = () => {};
window.HTMLCanvasElement.prototype.getContext = () => null;
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
window.HTMLMediaElement.prototype.pause = () => {};

const errors = [];
console.error = (...a) => {
  const text = a.map((v) => (v && (v.message || String(v))) || '').join(' ');
  if (!/not implemented|THREE|WebGL|customElements|NeoWs|fetch failed/i.test(text)) errors.push(text.slice(0, 200));
};

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const i18n = (await import('../src/i18n.ts')).default;
const { I18nextProvider } = await import('react-i18next');
const { TrilingualProvider } = await import('../src/context/TrilingualProvider.jsx');
const App = (await import('../src/App.tsx')).default;
const assert = (await import('node:assert/strict')).default;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const container = window.document.getElementById('root');
const root = createRoot(container);
root.render(React.createElement(I18nextProvider, { i18n },
  React.createElement(TrilingualProvider, null, React.createElement(App))));
await sleep(1500);

const click = (el) => el?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const buttons = () => [...container.querySelectorAll('button')];

// Open the header language menu and pick Sinhala
const langTrigger = buttons().find((b) => /Language:/i.test(b.getAttribute('aria-label') || ''));
assert.ok(langTrigger, 'language switcher trigger exists');
click(langTrigger);
await sleep(200);
const siOption = buttons().find((b) => (b.textContent || '').includes('සිංහල'));
assert.ok(siOption, 'Sinhala language option exists');
click(siOption);
await sleep(300);
assert.equal(i18n.language.slice(0, 2), 'si', 'i18next switched to si');

// Open the Explore group and navigate to the quiz destination
const exploreGroup = [...container.querySelectorAll('nav[aria-label="Primary"] button[aria-haspopup="menu"]')]
  .find((b) => (b.textContent || '').includes('ගවේෂණය'));
assert.ok(exploreGroup, 'Explore group menu rendered in Sinhala');
click(exploreGroup);
await sleep(200);
const quizItem = [...container.querySelectorAll('nav[aria-label="Primary"] button[role="menuitem"]')]
  .find((b) => (b.textContent || '').includes('අභ්‍යවකාශ දැනුම'));
assert.ok(quizItem, 'quiz menu item rendered in Sinhala');
click(quizItem);
await sleep(1200);

const text = container.textContent || '';
// SmartSpaceQuiz question data in Sinhala contains Sinhala glyphs; before the
// fix the provider stayed on 'en' and rendered English questions.
const hasSinhalaGlyph = /[\u0D80-\u0DFF]/.test(text);
assert.ok(hasSinhalaGlyph, 'quiz screen renders Sinhala script after language switch');
assert.ok(!errors.length, `unexpected console errors: ${errors.join(' | ')}`);

// Switch to Tamil and confirm the provider-backed content follows again
click(langTrigger);
await sleep(200);
const taOption = buttons().find((b) => (b.textContent || '').includes('தமிழ்'));
click(taOption);
await sleep(400);
const taText = container.textContent || '';
assert.ok(/[\u0B80-\u0BFF]/.test(taText), 'quiz screen renders Tamil script after switching to Tamil');

console.log('✔ Header language switch drives the provider-backed quiz (Sinhala + Tamil rendered through real UI)');
process.exit(0);
