/**
 * NOVA HYPOTHESIS FORGE — scroll architecture, section navigation and overlay
 * scroll-lock regression tests.
 *
 * Two layers, because they fail in different ways:
 *
 *  1. CSS invariants — the scroll-ownership model is a set of rules, and a rule
 *     can be checked exactly. These assertions read the real stylesheets and
 *     fail if the viewport lock, the nested scroll container, a fixed `minmax()`
 *     track or the wrong mobile breakpoint ever comes back.
 *  2. Rendered behaviour in jsdom — tab selection, ARIA wiring, keyboard
 *     navigation of the tab strip, scroll restoration on section change, and the
 *     reference-counted body scroll lock that stacked overlays depend on.
 *
 * No browser binary is available in this environment (Playwright cannot be
 * installed: the Chromium download hosts are unreachable), so nothing here
 * claims a pixel-level layout measurement. The CSS assertions are executed, not
 * described.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-forge-scroll.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
/** Comments must go: they mention the very declarations the assertions forbid. */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Returns the body of the last rule whose selector list contains `selector`. */
function ruleBodies(css, selector) {
  const bodies = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = pattern.exec(css))) {
    const selectors = match[1]
      .split(',')
      .map((entry) => entry.trim().replace(/\s+/g, ' '))
      .filter(Boolean);
    if (selectors.includes(selector)) bodies.push(match[2]);
  }
  return bodies;
}

const forgeCss = stripComments(read('src/styles/hypothesis-forge.css'));
const workspaceCss = stripComments(read('src/styles/workspace.css'));
const tokensCss = stripComments(read('src/styles/nova-tokens.css'));
const globalsCss = stripComments(read('src/globals.css'));
const indexCss = stripComments(read('src/index.css'));

/* --------------------------- 1. scroll ownership -------------------------- */

test('the Forge shell does not inherit the chat shell viewport lock', () => {
  const bodies = ruleBodies(forgeCss, '.nova-chat-shell--forge');
  assert.ok(bodies.length > 0, 'the forge shell rule must exist');
  const merged = bodies.join('\n');
  assert.match(merged, /height:\s*auto/, 'height must be auto so the page grows with the content');
  // `min-height` may (and does) use calc; the *height* may not.
  assert.equal(/(^|[^-])height:\s*calc\(/.test(merged), false, 'the inherited 100dvh-calced height must not be re-applied');
  assert.match(merged, /min-height:\s*calc\(100dvh - var\(--spacing-ws-topbar\)\)/, 'a short section should still fill the viewport');
  // ...and on the breakpoint where the bottom bar is visible, the bar height is
  // subtracted exactly once (the shell's minimum, not also main's padding).
  assert.match(
    forgeCss,
    /@media \(max-width: 1023px\) \{\s*\.nova-chat-shell--forge \{\s*min-height: calc\(100dvh - var\(--spacing-ws-topbar\) - var\(--spacing-ws-mobilebar\)\)/,
    'the forge minimum height must reserve the mobile bar on tablets'
  );
});

test('the Forge content pane is not a nested scroll container', () => {
  const merged = ruleBodies(forgeCss, '.nova-chat-shell--forge .nova-chat-main').join('\n');
  assert.ok(merged.length > 0);
  assert.match(merged, /overflow:\s*visible/);
  assert.equal(/overflow-y:\s*(auto|scroll)/.test(merged), false, 'a vertical scroll container here also clips horizontally');
  assert.match(merged, /min-width:\s*0/);
});

test('exactly one vertical scroll owner for document content', () => {
  // The chat shell's own pane may scroll (that is chat); the Forge may not.
  const forgeScrolling = [...forgeCss.matchAll(/overflow-y:\s*(auto|scroll)/g)];
  assert.deepEqual(
    forgeScrolling.map((match) => match[0]),
    [],
    'no rule in the forge stylesheet may create a vertical scroll container'
  );
  assert.match(workspaceCss, /\.nova-chat-shell \{[^}]*height:\s*calc\(100dvh - var\(--spacing-ws-topbar\)\)/, 'chat keeps its viewport-locked pane');
});

test('nothing globally prevents the document from scrolling', () => {
  const all = [forgeCss, workspaceCss, tokensCss, globalsCss, indexCss].join('\n');
  assert.equal(/html\s*\{[^}]*overflow(-y)?:\s*hidden/.test(all), false, 'html must never be overflow-hidden');
  assert.equal(/body\s*\{[^}]*overflow(-y)?:\s*hidden/.test(all), false, 'body must never be overflow-hidden');
  assert.equal(/#root\s*\{[^}]*overflow(-y)?:\s*hidden/.test(all), false, '#root must never be overflow-hidden');
  assert.equal(/\.nova-app\s*\{[^}]*overflow(-y)?:\s*hidden/.test(all), false, '.nova-app must never be overflow-hidden');
  // `100vh` is the desktop-only unit that clips on mobile browsers; `dvh` is used.
  assert.equal(/100vh/.test(all), false, 'viewport heights must use dvh, not vh');
});

/* -------------------------- 2. mobile breakpoints ------------------------- */

test('the pane reserves the mobile bar height wherever the bar is still visible', () => {
  assert.match(
    tokensCss,
    /--spacing-ws-mobilebar:\s*4\.5rem/,
    'the mobile bar height must be a token so pane heights can subtract it'
  );
  const blocks = [...workspaceCss.matchAll(/@media \(max-width: (\d+)px\) \{\s*\.nova-chat-shell \{([\s\S]*?)\}\s*\}/g)];
  const reserves = blocks.filter(([, , body]) => /--spacing-ws-mobilebar/.test(body));
  assert.equal(reserves.length, 1, 'exactly one breakpoint block reserves the bar height');
  assert.equal(
    reserves[0][1],
    '1023',
    'the reservation must end where the bar hides (lg = 1024px), not at 768px'
  );
  // And the shell must use the same threshold for the bar (lg:hidden).
  const mobileBar = fs.readFileSync(new URL('../src/app/MobileBar.tsx', import.meta.url), 'utf8');
  assert.match(mobileBar, /lg:hidden/, 'the bar hides at lg, so content must reserve it until lg');
  const shell = fs.readFileSync(new URL('../src/app/AppShell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /useMediaQuery\('\(min-width: 1024px\)'\)/, 'the shell padding must use the same 1024px threshold');
  assert.match(shell, /var\(--spacing-ws-mobilebar/, 'the shell padding must use the shared token');
});

/* ------------------------ 3. horizontal containment ----------------------- */

test('grid tracks cannot be forced wider than the column', () => {
  const tracks = [...forgeCss.matchAll(/minmax\((\d+)px,\s*(?:1fr|auto)\)/g)].map((match) => match[0]);
  assert.deepEqual(tracks, [], 'every minmax() minimum must be clamped with min(<n>px, 100%)');
  assert.match(forgeCss, /minmax\(min\(320px, 100%\), 1fr\)/);
  assert.match(forgeCss, /minmax\(min\(150px, 100%\), 1fr\)/);
  assert.match(forgeCss, /minmax\(min\(170px, 100%\), 1fr\)/);
  assert.match(forgeCss, /minmax\(min\(120px, 100%\), 1fr\)/);
});

test('grid, panel and body children may shrink to zero width', () => {
  assert.match(
    forgeCss,
    /\.forge-grid > \*,\s*\.forge-body > \*,\s*\.forge-panel > \*\s*\{[^}]*min-width:\s*0/,
    'scrollable descendants must not impose their min-content width on the layout'
  );
  assert.match(ruleBodies(forgeCss, '.forge-panel').join('\n'), /min-width:\s*0/);
});

test('wide tables and code scroll inside themselves, never the page', () => {
  const wrap = ruleBodies(forgeCss, '.forge-tablewrap').join('\n');
  assert.match(wrap, /overflow-x:\s*auto/);
  assert.match(wrap, /max-width:\s*100%/);
  assert.match(ruleBodies(forgeCss, '.nova-chat-shell--forge .forge-tablewrap').join('\n'), /max-width:\s*100%/);
});

test('the tab strip wraps on tablet widths instead of hiding tabs', () => {
  const tablet = /@media \(max-width: 900px\) \{\s*\.forge-tabs \{([\s\S]*?)\}/.exec(forgeCss);
  assert.ok(tablet, 'a tablet breakpoint for the tab strip must exist');
  assert.match(tablet[1], /flex-wrap:\s*wrap/);
  assert.match(tablet[1], /overflow-x:\s*visible/);
});

/* -------------------------- 4. sticky chrome safety ---------------------- */

test('jump targets clear the sticky top bar', () => {
  assert.match(workspaceCss, /#nova-main,[\s\S]{0,80}scroll-margin-top:\s*calc\(var\(--spacing-ws-topbar\) \+ 0\.5rem\)/);
  assert.match(ruleBodies(forgeCss, '.forge-panel').join('\n'), /scroll-margin-top:\s*calc\(var\(--spacing-ws-topbar/);
});

/* ------------------------- 5. rendered forge behaviour -------------------- */

function installDom() {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: 'http://localhost/chat',
    pretendToBeVisual: false
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
  window.Element.prototype.getBoundingClientRect = () => ({
    width: 720,
    height: 300,
    top: 0,
    left: 0,
    right: 720,
    bottom: 300,
    x: 0,
    y: 0,
    toJSON: () => ({})
  });
  class ResizeObserverStub {
    constructor(callback) {
      this.callback = callback;
    }
    observe(target) {
      this.callback(
        [
          {
            target,
            contentRect: { width: 720, height: 300, top: 0, left: 0, right: 720, bottom: 300, x: 0, y: 0 },
            borderBoxSize: [{ inlineSize: 720, blockSize: 300 }],
            contentBoxSize: [{ inlineSize: 720, blockSize: 300 }]
          }
        ],
        this
      );
    }
    unobserve() {}
    disconnect() {}
  }
  const globals = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    getComputedStyle: window.getComputedStyle,
    requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    matchMedia: window.matchMedia,
    ResizeObserver: ResizeObserverStub
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

async function mountForge() {
  installDom();
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const i18n = (await import('../src/i18n.ts')).default;
  const ForgeSurface = (await import('../src/features/hypothesis-forge/ForgeSurface.tsx')).default;

  await i18n.changeLanguage('en');
  window.localStorage.clear();

  // The catalogue call is the only request the surface makes on mount.
  globalThis.fetch = async (url) => {
    if (String(url).includes('/api/forge/catalogue')) {
      return new Response(JSON.stringify({ ok: false, code: 'SOURCE_UNAVAILABLE' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
  };

  const container = document.getElementById('root');
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(ForgeSurface, { onExitToChat: () => {} })));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  const tabs = () => [...container.querySelectorAll('[role="tab"]')];
  const tabByText = (label) =>
    tabs().find((tab) => (tab.textContent ?? '').toLowerCase().startsWith(label.toLowerCase()));
  return { container, act, tabs, tabByText, root };
}

test('every tab is reachable, selects its own panel, and exposes correct ARIA', async () => {
  const { container, act, tabs, tabByText } = await mountForge();
  assert.equal(tabs().length, 8, 'all eight sections must be rendered as tabs');

  // Initial state: exactly one selected tab, and only it points at a panel.
  const selected = tabs().filter((tab) => tab.getAttribute('aria-selected') === 'true');
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, 'forge-tab-workspace');
  assert.equal(selected[0].getAttribute('aria-controls'), 'forge-panel-workspace');
  assert.ok(container.querySelector('#forge-panel-workspace'), 'the selected panel must exist');

  for (const tab of tabs()) {
    if (tab === selected[0]) continue;
    assert.equal(tab.getAttribute('aria-controls'), null, `${tab.id} must not advertise a panel that is not rendered`);
    assert.equal(tab.getAttribute('tabindex'), '-1', 'inactive tabs leave the tab sequence (roving tabindex)');
  }

  // Click each section and confirm the rendered panel follows the selection.
  const expected = {
    hypotheses: 'forge-panel-hypotheses',
    data: 'forge-panel-data',
    evidence: 'forge-panel-evidence',
    analysis: 'forge-panel-analysis',
    counter: 'forge-panel-counter',
    passport: 'forge-panel-passport',
    history: 'forge-panel-history'
  };
  for (const [section, panelId] of Object.entries(expected)) {
    const tab = tabs().find((entry) => entry.id === `forge-tab-${section}`);
    assert.ok(tab, `${section} tab must exist`);
    await act(async () => {
      tab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const nowSelected = tabs().filter((entry) => entry.getAttribute('aria-selected') === 'true');
    assert.equal(nowSelected.length, 1, 'exactly one section is selected at a time');
    assert.equal(nowSelected[0].id, `forge-tab-${section}`);
    assert.equal(nowSelected[0].getAttribute('aria-controls'), panelId);
    const panel = container.querySelector(`#${panelId}`);
    assert.ok(panel, `${panelId} must be in the DOM after selecting ${section}`);
    assert.equal(panel.getAttribute('aria-labelledby'), `forge-tab-${section}`);
    assert.equal(nowSelected[0].getAttribute('tabindex'), '0');
  }
});

test('the tab strip supports Arrow/Home/End keyboard navigation', async () => {
  const { act, tabs } = await mountForge();
  const first = tabs()[0];
  first.focus();

  const press = async (key) => {
    await act(async () => {
      document.activeElement?.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    });
  };

  await press('ArrowRight');
  assert.equal(document.activeElement.id, 'forge-tab-hypotheses', 'ArrowRight moves to the next tab');
  assert.equal(document.activeElement.getAttribute('aria-selected'), 'true');

  await press('End');
  assert.equal(document.activeElement.id, 'forge-tab-history', 'End jumps to the last tab');

  await press('ArrowRight');
  assert.equal(document.activeElement.id, 'forge-tab-workspace', 'ArrowRight wraps to the first tab');

  await press('ArrowLeft');
  assert.equal(document.activeElement.id, 'forge-tab-history', 'ArrowLeft wraps to the last tab');

  await press('Home');
  assert.equal(document.activeElement.id, 'forge-tab-workspace', 'Home returns to the first tab');
});

test('changing section restores the scroll position when the reading position is lost', async () => {
  const { act, tabs } = await mountForge();
  const calls = [];
  window.scrollTo = (options) => calls.push(options);

  // Reader is deep in a long section: the forge top is far above the viewport.
  Object.defineProperty(window, 'scrollY', { value: 1200, configurable: true, writable: true });
  await act(async () => {
    tabs()[3].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  assert.deepEqual(calls.at(-1), { top: 1136, behavior: 'auto' }, 'the view returns to the forge top, below the sticky bar');

  // Reader is already at the top: switching sections must not move the page.
  calls.length = 0;
  window.scrollY = 0;
  await act(async () => {
    tabs()[5].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  assert.deepEqual(calls, [], 'no scroll happens when the reader is already at the top');
});

/* ------------------------ 6. overlay scroll locking ----------------------- */

test('stacked overlays never leave the document permanently locked', async () => {
  installDom();
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { useBodyScrollLock } = await import('../src/app/hooks.ts');

  function Lock({ on }) {
    useBodyScrollLock(on);
    return null;
  }
  function Harness({ open }) {
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(Lock, { on: open[0] }),
      React.createElement(Lock, { on: open[1] })
    );
  }

  const container = document.getElementById('root');
  const root = createRoot(container);
  const render = async (open) => {
    await act(async () => {
      root.render(React.createElement(Harness, { open }));
    });
  };

  await render([false, false]);
  assert.equal(document.body.style.overflow, '', 'the body starts unlocked');

  await render([true, false]);
  assert.equal(document.body.style.overflow, 'hidden', 'the drawer locks the body');

  await render([true, true]);
  assert.equal(document.body.style.overflow, 'hidden', 'the palette on top keeps it locked');

  // Close the drawer first (the order that used to strand the lock), then the palette.
  await render([false, true]);
  assert.equal(document.body.style.overflow, 'hidden', 'the palette is still open, so the body stays locked');

  await render([false, false]);
  assert.equal(document.body.style.overflow, '', 'with every overlay closed the document scrolls again');
});

test('overlays restore the overflow value they found, not a stacked intermediate', async () => {
  installDom();
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { useBodyScrollLock, getBodyLockCount } = await import('../src/app/hooks.ts');

  document.body.style.overflow = 'clip'; // any pre-existing value must survive
  function Lock({ on }) {
    useBodyScrollLock(on);
    return null;
  }
  const container = document.getElementById('root');
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(Lock, { on: true }));
  });
  assert.equal(document.body.style.overflow, 'hidden');
  assert.equal(getBodyLockCount(), 1);

  await act(async () => {
    root.render(React.createElement(Lock, { on: false }));
  });
  assert.equal(getBodyLockCount(), 0);
  assert.equal(document.body.style.overflow, 'clip', 'the original value is restored');
});
