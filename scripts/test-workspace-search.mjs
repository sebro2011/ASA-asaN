/**
 * Search surface — behaviour tests (Phase 3C).
 *
 * The database side (tsvector ranking, RLS, the substring fallback) is proven
 * in scripts/test-workspace-sql.mjs against real PostgreSQL. These tests cover
 * what the browser does with the answer: the RPC contract, debouncing, the
 * highlight parser, scope chips, error handling and keyboard navigation.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-workspace-search.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

const ROWS = [
  {
    kind: 'message',
    id: 'msg-1',
    conversation_id: 'conv-1',
    title: 'Radiation budget',
    snippet: 'Shielding <mark>radiation</mark> for the crew',
    rank: 0.9,
    created_at: '2026-02-01T10:00:00.000Z',
  },
  {
    kind: 'document',
    id: 'doc-1',
    conversation_id: null,
    title: '<img src=x onerror=alert(1)>',
    snippet: 'notes about <mark>radiation</mark>',
    rank: 0.5,
    created_at: '2026-02-02T10:00:00.000Z',
  },
  {
    kind: 'conversation',
    id: 'conv-1',
    conversation_id: 'conv-1',
    title: 'Radiation budget',
    snippet: '',
    rank: 0.3,
    created_at: '2026-01-30T10:00:00.000Z',
  },
];

function createFakeClient({ signedIn = true, responses = [{ data: ROWS, error: null }] } = {}) {
  const calls = [];
  let index = 0;

  const client = {
    auth: {
      getSession: async () => ({
        data: {
          session: signedIn
            ? { user: { id: 'user-1', email: 'ada@example.com', email_confirmed_at: '2026-01-01T00:00:00.000Z' } }
            : null,
        },
        error: null,
      }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async () => ({ data: { session: null }, error: null }),
      signUp: async () => ({ data: { user: null, session: null }, error: null }),
      signOut: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({ error: null }),
      updateUser: async () => ({ error: null }),
      resend: async () => ({ error: null }),
    },
    from: () => ({
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: null, error: null }),
        };
        return chain;
      },
      insert: async () => ({ error: null }),
      update: () => {
        const chain = {
          eq: () => chain,
          select: () => chain,
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return chain;
      },
    }),
    rpc: async (name, args) => {
      calls.push({ name, args });
      const response = responses[Math.min(index, responses.length - 1)];
      index += 1;
      if (typeof response === 'function') return response(args);
      return response;
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
  };

  return { client, calls };
}

function installDom(search = '') {
  const dom = new JSDOM(`<!doctype html><html lang="en"><body><div id="root"></div></body></html>`, {
    url: `http://localhost/search${search}`,
    pretendToBeVisual: false,
  });
  const { window } = dom;
  window.scrollTo = () => {};
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  window.Element.prototype.scrollIntoView = () => {};

  for (const [key, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
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
  })) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ providers: { auto: true, local: true } }),
  });

  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

async function mountSearch({ client }) {
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const { default: i18n } = await import('../src/i18n.ts');
  const { ThemeProvider } = await import('../src/app/theme.tsx');
  const { RouterProvider } = await import('../src/app/router.tsx');
  const { AuthProvider } = await import('../src/auth/AuthProvider.tsx');
  const { default: SearchSurface } = await import('../src/workspace/search/SearchSurface.tsx');

  await i18n.changeLanguage('en');
  window.localStorage.clear();

  const root = createRoot(document.getElementById('root'));
  const render = () =>
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
            React.createElement(AuthProvider, { createClient: async () => client }, React.createElement(SearchSurface)),
          ),
        ),
      ),
    );

  await act(async () => {
    render();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
  });

  return {
    act,
    i18n,
    text: () => document.body.textContent || '',
    settle: async (ms = 320) => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, ms));
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

function setInputValue(act, input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  return act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

function searchInput() {
  return document.querySelector('input[type="search"]');
}

test('the surface waits for two characters before calling the database', async () => {
  const dom = installDom();
  try {
    const { client, calls } = createFakeClient();
    const app = await mountSearch({ client });

    assert.match(app.text(), /Type at least two characters to search/);
    await setInputValue(app.act, searchInput(), 'r');
    await app.settle();
    assert.equal(calls.length, 0, 'a single character is not sent');
    assert.match(app.text(), /Type at least two characters to search/);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('typing debounces into one RPC call and renders the database order', async () => {
  const dom = installDom();
  try {
    const { client, calls } = createFakeClient();
    const app = await mountSearch({ client });

    const input = searchInput();
    await setInputValue(app.act, input, 'rad');
    await setInputValue(app.act, input, 'radia');
    await setInputValue(app.act, input, 'radiation');
    await app.settle();

    assert.equal(calls.length, 1, 'one call for a burst of typing');
    assert.deepEqual(calls[0], { name: 'nova_search', args: { query: 'radiation', match_limit: 30 } });

    const items = [...document.querySelectorAll('ul[aria-label="Search results"] li')];
    assert.equal(items.length, 3);
    assert.match(items[0].textContent, /Message/);
    assert.match(items[1].textContent, /Document/);
    assert.match(items[2].textContent, /Conversation/);

    // ts_headline markers become real <mark> elements, not literal text.
    assert.equal(document.querySelectorAll('mark').length, 2);
    assert.match(document.querySelector('mark').textContent, /radiation/);

    // A title that looks like HTML stays text — no injection, no element.
    assert.equal(document.querySelector('img'), null);
    assert.match(app.text(), /<img src=x onerror=alert\(1\)>/);

    assert.match(app.text(), /3 match\(es\)/);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('scope chips filter the list without another query', async () => {
  const dom = installDom();
  try {
    const { client, calls } = createFakeClient();
    const app = await mountSearch({ client });

    await setInputValue(app.act, searchInput(), 'radiation');
    await app.settle();
    assert.equal(calls.length, 1);

    const chip = [...document.querySelectorAll('button')].find((node) =>
      (node.textContent || '').startsWith('Observation Logs'),
    );
    assert.ok(chip, 'documents chip rendered with a count');
    assert.match(chip.textContent, /Observation Logs 1/);

    await app.act(async () => {
      chip.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });

    const items = [...document.querySelectorAll('ul[aria-label="Search results"] li')];
    assert.equal(items.length, 1);
    assert.match(items[0].textContent, /Document/);
    assert.equal(chip.getAttribute('aria-pressed'), 'true');
    assert.equal(calls.length, 1, 'filtering is local');
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('a failed query shows an error with a retry that recovers', async () => {
  const dom = installDom();
  try {
    const { client, calls } = createFakeClient({
      responses: [{ data: null, error: { message: 'permission denied for function nova_search' } }, { data: ROWS, error: null }],
    });
    const app = await mountSearch({ client });

    await setInputValue(app.act, searchInput(), 'radiation');
    await app.settle();

    const alert = document.querySelector('[role="alert"]');
    assert.ok(alert, 'failures surface as an alert, not as "no results"');
    assert.match(alert.textContent, /permission denied/);
    assert.doesNotMatch(app.text(), /No matches for/);

    const retry = [...document.querySelectorAll('button')].find((node) => node.textContent === 'Try again');
    await app.act(async () => {
      retry.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await app.settle();

    assert.equal(calls.length, 2);
    assert.equal(document.querySelector('[role="alert"]'), null);
    assert.equal(document.querySelectorAll('ul[aria-label="Search results"] li').length, 3);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('document hits stay local-only, chat hits navigate to the thread', async () => {
  const dom = installDom();
  try {
    const { client } = createFakeClient();
    const app = await mountSearch({ client });

    await setInputValue(app.act, searchInput(), 'radiation');
    await app.settle();

    const items = [...document.querySelectorAll('ul[aria-label="Search results"] li')];
    assert.equal(items[0].querySelector('a').getAttribute('href'), '/chat/conv-1');
    assert.equal(items[1].querySelector('a'), null, 'no dead link: logs live on the device, not in search');
    assert.match(items[1].textContent, /Observation logs are saved on this device/);

    // Keyboard: ArrowDown moves to the document row, ArrowUp back, Enter opens.
    const input = searchInput();
    await app.act(async () => {
      input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    await app.act(async () => {
      input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });
    await app.act(async () => {
      input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    assert.equal(window.location.pathname, '/chat/conv-1');
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('the query lives in the URL and survives a reload', async () => {
  const dom = installDom('?q=radiation');
  try {
    const { client, calls } = createFakeClient();
    const app = await mountSearch({ client });

    assert.equal(searchInput().value, 'radiation');
    await app.settle();
    assert.equal(calls[0].args.query, 'radiation', 'a deep link runs immediately');

    await setInputValue(app.act, searchInput(), '');
    await app.settle(60);
    assert.equal(window.location.search, '', 'clearing removes the parameter');
    await app.unmount();
  } finally {
    dom.window.close();
  }
});
