/**
 * Verifies TrilingualProvider stays in sync with i18next.
 *
 * Regression guard for the glitch where switching language via the header
 * (i18next) never updated useTrilingual() consumers (quiz, asteroid gauge),
 * leaving Sinhala/Tamil users on English content.
 *
 * Run: node --import tsx scripts/test-lang-sync.mjs
 */
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

const dom = new JSDOM('<!doctype html><html lang="en"><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000/',
  pretendToBeVisual: true
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true }); } catch {}
for (const k of ['HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent']) globalThis[k] = window[k];
Object.defineProperty(globalThis, 'screen', { value: window.screen, configurable: true });
globalThis.localStorage = window.localStorage;
globalThis.self = window;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
window.matchMedia = (q) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const i18n = (await import('../src/i18n.ts')).default;
const { I18nextProvider } = await import('react-i18next');
const { TrilingualProvider, useTrilingual } = await import('../src/context/TrilingualProvider.jsx');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function Probe() {
  const { lang, setLang, t } = useTrilingual();
  return React.createElement(
    'div',
    null,
    React.createElement('span', { 'data-testid': 'lang' }, lang),
    React.createElement('span', { 'data-testid': 't' }, t('rotate')),
    React.createElement('button', { type: 'button', onClick: () => setLang('ta') }, 'set-ta')
  );
}

const container = window.document.getElementById('root');
const root = createRoot(container);
root.render(
  React.createElement(I18nextProvider, { i18n },
    React.createElement(TrilingualProvider, null, React.createElement(Probe)))
);
await sleep(200);

const langEl = () => container.querySelector('[data-testid="lang"]');
const tEl = () => container.querySelector('[data-testid="t"]');

// 1. Defaults to English
assert.equal(langEl().textContent, 'en', 'initial provider language should be en');
assert.equal(tEl().textContent, 'Rotate 360°', 'English dictionary value');

// 2. i18next change (the header path) propagates into useTrilingual consumers
await i18n.changeLanguage('si');
await sleep(200);
assert.equal(langEl().textContent, 'si', 'i18next si switch must sync provider');
assert.equal(tEl().textContent, 'අංශක 360 කැරකෙන්න', 'Sinhala dictionary value after sync');

await i18n.changeLanguage('ta');
await sleep(200);
assert.equal(langEl().textContent, 'ta', 'i18next ta switch must sync provider');
assert.equal(tEl().textContent, '360° சுழற்று', 'Tamil dictionary value after sync');

// 3. Provider setLang propagates back to i18next (legacy/voice paths)
container.querySelector('button').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(200);
assert.equal(langEl().textContent, 'ta', 'setLang keeps provider on ta');
assert.equal(i18n.language.slice(0, 2), 'ta', 'setLang must also switch i18next');

// 4. Unknown languages are ignored, no raw-key crash
await i18n.changeLanguage('fr');
await sleep(200);
assert.equal(langEl().textContent, 'ta', 'unsupported language leaves provider unchanged');

// 5. t() never returns an empty string for known keys
assert.ok(tEl().textContent.length > 0, 't() returns content');

console.log('✔ TrilingualProvider <-> i18next language sync verified (en/si/ta, two-way, guard rails)');
process.exit(0);
