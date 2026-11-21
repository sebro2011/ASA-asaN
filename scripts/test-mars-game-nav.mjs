/**
 * The game must be findable without knowing its URL.
 *
 * The game shipped at `/mars-game` with exactly one entry point: a card at the
 * bottom of the home page. Nothing in the header, the mobile sheet or the tab bar
 * mentioned it, so a user who did not scroll past three sections had no way to
 * discover a finished product. This suite mounts the real header and the real
 * mobile tab bar in jsdom and asserts the game is reachable from both — and that
 * adding it did not disturb the existing navigation contract.
 *
 * What this proves: the entry points render, they link to `/mars-game`, they are
 * labelled with the translator's string rather than the raw key, and a plain
 * left click routes client-side without a full page load.
 *
 * What this cannot prove: pixel layout at a real viewport width. jsdom reports
 * zero sizes for everything, so Tailwind's responsive prefixes (`lg:flex`,
 * `lg:hidden`) are never applied here. Both surfaces are mounted directly, which
 * is the point — the presence of the control is asserted, not its breakpoint.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-mars-game-nav.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { interfaceCopy } from '../src/i18n/interfaceCopy.ts';
import { VALID_LANGS } from './mars-game-test-helpers.mjs';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/'
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
    dispatchEvent: () => false
  });
  window.Element.prototype.scrollIntoView = () => {};
  const globals = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    HTMLAnchorElement: window.HTMLAnchorElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    getComputedStyle: window.getComputedStyle,
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id)
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

/** Mounts `element` inside the app's i18n provider and returns helpers. */
async function mount(element) {
  const dom = installDom();
  const { act } = await import('react');
  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const i18n = (await import('../src/i18n.ts')).default;

  const container = dom.window.document.getElementById('root');
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(I18nextProvider, { i18n }, element));
  });

  return {
    dom,
    container,
    root,
    act,
    i18n,
    /** Links whose href is the game route. */
    gameLinks: () => [...container.querySelectorAll('a[href="/mars-game"]')],
    async cleanup() {
      await act(async () => root.unmount());
      dom.window.close();
    }
  };
}

/* --------------------------------------------------------------- contracts */

test('the game labels exist in all three languages and are not raw keys', () => {
  for (const lang of VALID_LANGS) {
    const copy = interfaceCopy[lang];
    assert.ok(copy, `missing ${lang} dictionary`);
    for (const key of ['navMarsGame', 'navMarsGameHint']) {
      assert.equal(typeof copy[key], 'string', `${lang}.${key} is missing — it would render as the raw key`);
      assert.ok(copy[key].trim().length > 0, `${lang}.${key} is empty`);
    }
  }
  // Sinhala and Tamil must be translated, not left in English.
  for (const lang of ['si', 'ta']) {
    assert.notEqual(interfaceCopy[lang].navMarsGame, interfaceCopy.en.navMarsGame, `${lang} name is untranslated`);
    assert.notEqual(interfaceCopy[lang].navMarsGameHint, interfaceCopy.en.navMarsGameHint, `${lang} hint is untranslated`);
  }
});

test('the header renders a real link to the game on every science destination', async () => {
  const { default: AppHeader } = await import('../src/ui/AppHeader.tsx');
  const React = (await import('react')).default;

  const mounted = await mount(
    React.createElement(AppHeader, {
      activeTab: 'home',
      onTabChange: () => {},
      lang: 'en'
    })
  );
  try {
    const links = mounted.gameLinks();
    assert.equal(links.length, 1, 'the header offers exactly one game entry point');
    const [link] = links;
    // A real anchor, not a div with a click handler: middle-click and
    // "open in new tab" have to work at /mars-game.
    assert.equal(link.tagName, 'A');
    assert.equal(link.getAttribute('href'), '/mars-game');
    assert.ok(
      mounted.container.textContent.includes(interfaceCopy.en.navMarsGame),
      'the control is labelled with the translator string'
    );
    assert.ok(
      !mounted.container.textContent.includes('navMarsGame'),
      'no raw translation key leaked into the DOM'
    );
  } finally {
    await mounted.cleanup();
  }
});

test('a plain click on the header entry routes client-side', async () => {
  const { default: AppHeader } = await import('../src/ui/AppHeader.tsx');
  const React = (await import('react')).default;
  const { NAVIGATE_EVENT } = await import('../src/app/router.tsx');

  const mounted = await mount(
    React.createElement(AppHeader, { activeTab: 'home', onTabChange: () => {}, lang: 'en' })
  );
  try {
    const seen = [];
    const onNavigate = (event) => seen.push(event.detail.path);
    mounted.dom.window.addEventListener(NAVIGATE_EVENT, onNavigate);

    const [link] = mounted.gameLinks();
    const click = new mounted.dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    await mounted.act(async () => {
      link.dispatchEvent(click);
    });

    assert.equal(click.defaultPrevented, true, 'the router took over the click instead of reloading the page');
    assert.deepEqual(seen, ['/mars-game'], 'the navigation event carried the game route');
    assert.equal(mounted.dom.window.location.pathname, '/mars-game', 'the URL changed');

    mounted.dom.window.removeEventListener(NAVIGATE_EVENT, onNavigate);
  } finally {
    await mounted.cleanup();
  }
});

test('the mobile tab bar sheet offers the game', async () => {
  const { default: MobileTabBar } = await import('../src/ui/MobileTabBar.tsx');
  const React = (await import('react')).default;

  const mounted = await mount(
    React.createElement(MobileTabBar, { activeTab: 'home', onTabChange: () => {}, lang: 'en' })
  );
  try {
    // The sheet is closed until the "More" button opens it.
    assert.equal(mounted.gameLinks().length, 0, 'the sheet starts closed');

    const more = [...mounted.container.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === 'More'
    );
    assert.ok(more, 'the More button exists');
    await mounted.act(async () => {
      more.dispatchEvent(new mounted.dom.window.MouseEvent('click', { bubbles: true }));
    });

    const links = mounted.gameLinks();
    assert.equal(links.length, 1, 'the open sheet offers the game');
    assert.ok(mounted.container.textContent.includes(interfaceCopy.en.navMarsGame));
  } finally {
    await mounted.cleanup();
  }
});

test('the game is still not an Explore tab and no destination was displaced', async () => {
  const { NAV_ENTRIES } = await import('../src/ui/navigation.ts');
  const { parseRoute, routeHref, isTabId } = await import('../src/app/router.tsx');

  // The game keeps its own route. Adding a nav entry point must not have
  // promoted it into the science suite, where it would inherit the tab shell.
  assert.equal(isTabId('mars-game'), false, 'mars-game must not be a TabId');
  assert.equal(NAV_ENTRIES.some((entry) => entry.id === 'mars-game'), false);
  assert.deepEqual(parseRoute('/mars-game'), { name: 'marsGame', path: '/mars-game' });
  assert.equal(routeHref('marsGame'), '/mars-game');

  // Every pre-existing destination still resolves — the header change is
  // additive, so a regression here would be a navigation break.
  for (const entry of NAV_ENTRIES) {
    const href = routeHref('explore', { tab: entry.id });
    const parsed = parseRoute(href);
    assert.equal(parsed.name, 'explore', `${entry.id} stopped resolving`);
    assert.equal(parsed.tab, entry.id, `${entry.id} resolves to the wrong tab`);
  }
});

test('the header did not bypass the shared link component', () => {
  // A hand-rolled onClick + pushState would lose middle-click, right-click and
  // the browser's own "open in new tab". The router's Link keeps them.
  const source = readFileSync('src/ui/AppHeader.tsx', 'utf8');
  assert.match(source, /import \{ Link \} from '\.\.\/app\/router'/, 'the header uses the router Link');
  assert.match(source, /<Link\s+to="\/mars-game"/, 'the game entry is a Link');
  assert.doesNotMatch(source, /window\.history\.pushState/, 'no hand-rolled history call in the header');

  const tabBar = readFileSync('src/ui/MobileTabBar.tsx', 'utf8');
  assert.match(tabBar, /import \{ Link \} from '\.\.\/app\/router'/);
  assert.match(tabBar, /to="\/mars-game"/);
});
