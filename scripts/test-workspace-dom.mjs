/**
 * NOVA workspace shell — rendering in jsdom (Phase 3A).
 *
 * Mounts the real app (workspace shell, command palette, drawer, theme switch,
 * planned-module surfaces, 404) and the preserved Explore suite. Kept in its own
 * file so these heavier renders run in a separate test process.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-workspace-dom.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

function installDom(acceptQuery = () => false) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    // The workspace lives at /workspace since the recovery: `/` is NASA again.
    url: 'http://localhost/workspace',
    // No jsdom render loop: the app schedules its own frames through the stub
    // below, and an always-on rAF loop would keep the test process alive.
    pretendToBeVisual: false,
  });
  const { window } = dom;
  window.scrollTo = () => {};
  window.matchMedia = (query) => ({
    matches: acceptQuery(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  window.Element.prototype.scrollIntoView = () => {};

  const globals = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
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
    cancelAnimationFrame: (id) => clearTimeout(id),
    matchMedia: window.matchMedia,
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

test('workspace shell renders, searches, switches theme and explains planned modules', async () => {
  const dom = installDom();
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const React = (await import('react')).default;
  const { I18nextProvider } = await import('react-i18next');
  const i18n = (await import('../src/i18n.ts')).default;
  const { ThemeProvider } = await import('../src/app/theme.tsx');
  const { RouterProvider, navigate } = await import('../src/app/router.tsx');
  const App = (await import('../src/App.tsx')).default;
  const { AuthProvider } = await import('../src/auth/AuthProvider.tsx');

  const container = document.getElementById('root');
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        I18nextProvider,
        { i18n },
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(
            RouterProvider,
            null,
            // No cloud in the shell tests: the workspace must render its
            // "unconfigured" state, which is exactly what a bare deployment is.
            React.createElement(
              AuthProvider,
              { createClient: async () => null },
              React.createElement(App),
            ),
          ),
        ),
      ),
    );
  });

  // 1. Shell structure: one nav landmark, all thirteen destinations linked.
  const sidebar = document.querySelector('aside[aria-label="Workspace navigation"]');
  assert.ok(sidebar, 'sidebar renders');
  const hrefs = new Set([...sidebar.querySelectorAll('a')].map((a) => a.getAttribute('href')));
  for (const href of ['/', '/chat', '/projects', '/documents', '/writing', '/research', '/code',
    '/knowledge', '/tasks', '/explore', '/settings', '/profile']) {
    assert.ok(hrefs.has(href), `sidebar links ${href}`);
  }

  // 2. Home is the live surface; planned modules are labelled, never faked.
  assert.match(container.textContent, /Good (morning|afternoon|evening)/);
  assert.ok(container.textContent.includes('Explore NASA science'));
  const { WORKSPACE_NAV } = await import('../src/app/navConfig.ts');
  const plannedItems = WORKSPACE_NAV.filter((item) => item.status === 'planned');
  const plannedFlags = [...container.querySelectorAll('.nova-nav-item__flag')].filter((node) =>
    /Soon/.test(node.textContent || ''),
  );
  // Derived from the nav model, so shipping a module tightens this instead of
  // silently changing a magic number: the roadmap is empty because every
  // destination now has a real surface, and nothing carries a "Soon" flag.
  assert.equal(plannedItems.length, 0, 'no module is still a placeholder');
  assert.equal(
    plannedFlags.length,
    plannedItems.length,
    `every planned module is flagged (model ${plannedItems.length}, rendered ${plannedFlags.length})`,
  );

  // 3. The provider inventory lives on Settings now; Home keeps the reasoning
  //    ladder and its honesty note about online models.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  assert.match(container.textContent, /Reasoning ladder/);
  assert.match(container.textContent, /served by an online model/);
  assert.equal(container.textContent.includes('AI providers'), false, 'the provider card is off the dashboard');

  // 4. Command palette: opens on ⌘K, filters, closes on Escape.
  await act(async () => {
    document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
  });
  const palette = document.querySelector('[role="dialog"][aria-label="Search or jump to"]');
  assert.ok(palette, 'palette opens with ⌘K');

  const input = palette.querySelector('input[role="combobox"]');
  assert.ok(input, 'palette has a combobox input');

  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'earth');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  const options = [...palette.querySelectorAll('[role="option"]')];
  assert.ok(options.length > 0, 'palette filters to a match');
  assert.ok(options.some((option) => /Earth/i.test(option.textContent || '')));

  await act(async () => {
    document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  assert.equal(document.querySelector('[role="dialog"][aria-label="Search or jump to"]'), null, 'Escape closes');

  // 5. Theme switching writes the palette attribute and the stored preference.
  const lightButton = [...document.querySelectorAll('[role="radio"]')].find((node) =>
    /Light/.test(node.textContent || ''),
  );
  assert.ok(lightButton, 'light theme control exists');
  await act(async () => {
    lightButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  assert.equal(document.documentElement.getAttribute('data-nova-theme'), 'light');
  assert.equal(window.localStorage.getItem('nova_theme'), 'light');

  // 6. Every module is a real surface now: /tasks is the Observing Plan, and an
  //    empty plan says it is empty instead of pretending to have data.
  await act(async () => {
    navigate('/tasks');
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
  });
  assert.match(container.textContent, /Observing Plan/);
  assert.match(container.textContent, /No records yet\./);
  assert.doesNotMatch(container.textContent, /Not available yet/);
  assert.doesNotMatch(container.textContent, /Good (morning|afternoon|evening)/);

  // 6b. Orbit Lab is reachable and computes from the formula it prints.
  await act(async () => {
    navigate('/code');
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
  });
  assert.match(container.textContent, /Orbit Lab/);
  assert.match(container.textContent, /Semi-major axis \(km\)/);

  // 7. Unknown paths land on the honest 404, still inside the shell.
  await act(async () => {
    navigate('/does-not-exist');
  });
  assert.match(container.textContent, /This page does not exist/);

  // 8. The sidebar scrolls, so a keyboard user must be able to reach it
  // (WCAG 2.1.1) — and it must say what it is while focused.
  const sidebarScroll = sidebar.querySelector('.nova-sidebar__scroll');
  assert.ok(sidebarScroll, 'sidebar scroll container exists');
  assert.equal(sidebarScroll.getAttribute('tabindex'), '0', 'sidebar scroll container is focusable');
  assert.equal(sidebarScroll.getAttribute('role'), 'region');
  assert.equal(sidebarScroll.getAttribute('aria-label'), 'Workspace navigation');

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});

/* ------------------------------------------------------- i18n key resolution */

test('Explore still mounts its science destinations behind the workspace', async () => {
  const dom = installDom();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).includes('/api/apod')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          date: new URL(String(input), 'http://localhost').searchParams.get('date') || new Date().toISOString().slice(0, 10),
          title: 'Carina Nebula Test Frame',
          explanation: 'A canned APOD payload used by the shell test.',
          url: 'https://example.invalid/apod.jpg',
          media_type: 'image',
        }),
      };
    }
    return { ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) };
  };

  const { act } = await import('react');
  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const i18n = (await import('../src/i18n.ts')).default;
  const { ThemeProvider } = await import('../src/app/theme.tsx');
  const { RouterProvider } = await import('../src/app/router.tsx');
  const ExploreApp = (await import('../src/explore/ExploreApp.tsx')).default;

  let exited = false;
  let selected = null;
  const root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(
      React.createElement(
        I18nextProvider,
        { i18n },
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(
            RouterProvider,
            null,
            React.createElement(ExploreApp, {
              tab: 'apod',
              onSelectTab: (tab) => {
                selected = tab;
              },
              onExitToWorkspace: () => {
                exited = true;
              },
            }),
          ),
        ),
      ),
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });

  try {
  const text = document.body.textContent || '';
  assert.match(text, /Astronomy Picture of the Day/, 'APOD destination rendered');
  assert.match(text, /Carina Nebula Test Frame/, 'live API data still flows into Explore');

  // The only addition to Explore is a way back: the workspace chip and the
  // mobile row both call onExitToWorkspace.
  const exit = [...document.querySelectorAll('button')].find((node) =>
    /NOVA Workspace/.test(node.textContent || ''),
  );
  assert.ok(exit, 'workspace return control exists');
  await act(async () => {
    exit.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  assert.equal(exited, true, 'returning hands control back to the workspace router');

  // Tab switching is now owned by the router: the brand control asks the shell
  // to go home rather than rewriting history inside Explore.
  const brand = [...document.querySelectorAll('button')].find((node) =>
    /home/i.test(node.getAttribute('aria-label') || ''),
  );
  assert.ok(brand, 'brand control exists');
  await act(async () => {
    brand.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  assert.equal(selected, 'home', 'science navigation is delegated to the router');
  } finally {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
    globalThis.fetch = realFetch;
  }
});

/* ------------------------------------------------------------ colour contrast */

async function renderShell(acceptQuery) {
  const dom = installDom(acceptQuery);
  const { act } = await import('react');
  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const i18n = (await import('../src/i18n.ts')).default;
  const { ThemeProvider } = await import('../src/app/theme.tsx');
  const { RouterProvider } = await import('../src/app/router.tsx');
  const App = (await import('../src/App.tsx')).default;
  const { AuthProvider } = await import('../src/auth/AuthProvider.tsx');

  const root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(
      React.createElement(
        I18nextProvider,
        { i18n },
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(
            RouterProvider,
            null,
            // No cloud in the shell tests: the workspace must render its
            // "unconfigured" state, which is exactly what a bare deployment is.
            React.createElement(
              AuthProvider,
              { createClient: async () => null },
              React.createElement(App),
            ),
          ),
        ),
      ),
    );
  });

  const cleanup = async () => {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
  };
  return { act, dom, cleanup };
}

const desktop = (query) => /min-width:\s*(768|1024)px/.test(query);
const tablet = (query) => /min-width:\s*768px/.test(query);
const phone = () => false;

const drawerTrigger = () => document.querySelector('button[aria-label="Open navigation"]');
const bottomBar = () => document.querySelector('nav[aria-label="Primary navigation"]');
const sidebar = () => document.querySelector('aside[aria-label="Workspace navigation"]');
const drawer = () => document.querySelector('[role="dialog"][aria-label="Navigation menu"]');

test('responsive shell: desktop, tablet and phone expose different affordances', async () => {
  // Desktop (≥1024px): full sidebar, no drawer trigger; the bottom bar stays in
  // the DOM but is CSS-hidden (`lg:hidden`) for instant paint when resizing.
  {
    const { cleanup } = await renderShell(desktop);
    let snapshot;
    try {
      snapshot = {
        sidebar: Boolean(sidebar()),
        trigger: Boolean(drawerTrigger()),
        bottomBar: Boolean(bottomBar()),
        bottomBarHiddenOnDesktop: (bottomBar()?.className || '').includes('lg:hidden'),
        drawer: Boolean(drawer()),
      };
    } finally {
      await cleanup();
    }
    assert.equal(snapshot.sidebar, true, 'desktop renders the sidebar');
    assert.equal(snapshot.trigger, false, 'desktop has no drawer trigger');
    assert.equal(snapshot.bottomBarHiddenOnDesktop, true, 'bottom bar is hidden at ≥1024px');
    assert.equal(snapshot.drawer, false, 'drawer is not mounted until opened');
  }

  // Tablet (768–1023px): icon rail + bottom bar, with the drawer as the only way
  // to read destination labels.
  {
    const { act, cleanup } = await renderShell(tablet);
    let snapshot;
    try {
      const trigger = drawerTrigger();
      let opened = null;
      if (trigger) {
        await act(async () => {
          trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        });
        const panel = drawer();
        opened = panel
          ? {
              modal: panel.getAttribute('aria-modal'),
              hrefs: [...panel.querySelectorAll('a')].map((a) => a.getAttribute('href')),
              scrollKeyboard: panel.querySelector('.nova-scroll')?.getAttribute('tabindex') ?? null,
              text: panel.textContent || '',
            }
          : null;
        await act(async () => {
          document.body.dispatchEvent(
            new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
          );
        });
      }
      snapshot = {
        sidebar: Boolean(sidebar()),
        trigger: Boolean(trigger),
        bottomBar: Boolean(bottomBar()),
        opened,
        closedByEscape: !drawer(),
      };
    } finally {
      await cleanup();
    }

    assert.equal(snapshot.sidebar, true, 'tablet keeps the rail');
    assert.equal(snapshot.trigger, true, 'tablet keeps a drawer trigger');
    assert.equal(snapshot.bottomBar, true, 'tablet shows the bottom bar');
    assert.ok(snapshot.opened, 'drawer opens on tablet');
    assert.equal(snapshot.opened.modal, 'true', 'drawer is a modal dialog');
    for (const href of ['/chat', '/projects', '/documents', '/explore', '/settings']) {
      assert.ok(snapshot.opened.hrefs.includes(href), `drawer links ${href}`);
    }
    assert.match(snapshot.opened.text, /Research Journal/, 'drawer labels destinations');
    assert.equal(snapshot.opened.scrollKeyboard, '0', 'drawer scroll container is keyboard reachable');
    assert.equal(snapshot.closedByEscape, true, 'Escape closes the drawer');
  }

  // Phone: drawer trigger + bottom bar, sidebar kept in the DOM for desktop
  // resize but hidden by CSS.
  {
    const { cleanup } = await renderShell(phone);
    let snapshot;
    try {
      snapshot = {
        sidebarInDom: Boolean(sidebar()),
        // The sidebar is hidden below 768px by CSS, not by conditionally
        // rendering, so a resize back to desktop is instant.
        sidebarClass: sidebar()?.className || '',
        trigger: Boolean(drawerTrigger()),
        bottomBar: Boolean(bottomBar()),
      };
    } finally {
      await cleanup();
    }
    assert.equal(snapshot.trigger, true, 'phone has a drawer trigger');
    assert.equal(snapshot.bottomBar, true, 'phone shows the bottom bar');
    assert.equal(snapshot.sidebarInDom, true, 'sidebar stays mounted on phones');
    assert.match(snapshot.sidebarClass, /nova-sidebar/, 'visibility is CSS-driven');
  }
});

test('the shell renders in Sinhala and Tamil, not only English', async () => {
  const { act, cleanup } = await renderShell(desktop);
  const i18n = (await import('../src/i18n.ts')).default;
  const { workspaceCopy } = await import('../src/i18n/workspaceCopy.ts');
  let si = '';
  let ta = '';
  let direction = null;
  try {
    await act(async () => {
      await i18n.changeLanguage('si');
    });
    si = document.body.textContent || '';
    direction = document.documentElement.getAttribute('lang');
    await act(async () => {
      await i18n.changeLanguage('ta');
    });
    ta = document.body.textContent || '';
  } finally {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    await cleanup();
  }

  for (const key of ['wsMenuChat', 'wsMenuProjects', 'wsMenuDocuments', 'wsExplore', 'wsMenuTasks']) {
    assert.ok(si.includes(workspaceCopy.si[key]), `Sinhala shell shows ${key}`);
    assert.ok(ta.includes(workspaceCopy.ta[key]), `Tamil shell shows ${key}`);
  }
  // No English leakage into the navigation labels.
  assert.equal(si.includes('Research Journal'), false, 'Sinhala shell has no English nav label');
  assert.equal(ta.includes('Star Library'), false, 'Tamil shell has no English nav label');
  assert.ok(direction, '<html lang> is set for the active language');
});

test('the front door is the NASA Space Explorer, not the NOVA workspace', async () => {
  const dom = installDom();
  dom.window.history.replaceState({}, '', '/');
  const { act } = await import('react');
  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const i18n = (await import('../src/i18n.ts')).default;
  const { ThemeProvider } = await import('../src/app/theme.tsx');
  const { RouterProvider } = await import('../src/app/router.tsx');
  const App = (await import('../src/App.tsx')).default;
  const { AuthProvider } = await import('../src/auth/AuthProvider.tsx');

  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => {
      root.render(
        React.createElement(
          I18nextProvider,
          { i18n },
          React.createElement(
            ThemeProvider,
            null,
            React.createElement(
              RouterProvider,
              null,
              React.createElement(
                AuthProvider,
                { createClient: async () => null },
                React.createElement(App),
              ),
            ),
          ),
        ),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    const text = document.body.textContent || '';
    assert.match(text, /NASA Space Explorer/);
    // Workspace chrome must not be on the front door any more.
    assert.equal(document.querySelector('.nova-sidebar'), null);
    assert.equal(text.includes('New chat'), false);
    // The legacy in-Explore assistant tab is retired: the one AI surface is the
    // workspace chat, and the header's "Ask NOVA" button leads there.
    const buttons = [...document.querySelectorAll('button')].map((button) => button.textContent || '');
    assert.equal(buttons.some((label) => /NOVA Assistant/i.test(label)), false, 'no legacy assistant tab');
    assert.ok(
      buttons.some((label) => /Ask NOVA/i.test(label)),
      'the AI entry point is still reachable and now points at the chat workspace',
    );
  } finally {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
  }
});
