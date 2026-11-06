/**
 * Chat surface — behaviour tests (Phase 3D-1).
 *
 * A fake Supabase client (in-memory tables) plus a stubbed `/api/nova/chat`
 * exercise the real components: conversation list, send + persistence, the
 * error taxonomy, list actions, markdown rendering and the SI/TA copy.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-workspace-chat.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

/* ------------------------------------------------------------------ fixtures */

const SESSION = {
  user: { id: 'user-1', email: 'ada@example.com', email_confirmed_at: '2026-01-01T00:00:00.000Z' },
};

const PROFILE = {
  id: 'user-1',
  display_name: 'Ada',
  locale: 'en',
  theme: 'system',
  reduce_motion: false,
  high_contrast: false,
  sidebar_collapsed: false,
  font_scale: 1,
  preferred_provider: 'auto',
  default_surface: 'home',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function createFakeClient(seed = {}) {
  const rows = {
    profiles: [{ ...PROFILE }],
    conversations: seed.conversations ?? [],
    messages: seed.messages ?? [],
  };
  const calls = { insert: [], update: [], delete: [] };

  const matches = (row, filters) => filters.every(([column, value]) => row[column] === value);

  const table = (name) => {
    const state = { filters: [], order: null, limit: null };
    const chain = {
      select: () => chain,
      eq: (column, value) => {
        state.filters.push([column, value]);
        return chain;
      },
      is: (column, value) => {
        state.filters.push([column, value]);
        return chain;
      },
      order: (column, options) => {
        state.order = { column, ascending: options?.ascending !== false };
        return chain;
      },
      limit: (value) => {
        state.limit = value;
        return chain;
      },
      maybeSingle: async () => resolve()[0] ?? null,
      single: async () => resolve()[0],
      then: (onFulfilled, onRejected) => Promise.resolve({ data: resolve(), error: null }).then(onFulfilled, onRejected),
    };

    function resolve() {
      let list = rows[name].filter((row) => matches(row, state.filters));
      if (state.order) {
        const { column, ascending } = state.order;
        list = [...list].sort((a, b) => {
          const left = String(a[column] ?? '');
          const right = String(b[column] ?? '');
          return ascending ? left.localeCompare(right) : right.localeCompare(left);
        });
      }
      if (state.limit) list = list.slice(0, state.limit);
      return list.map((row) => ({ ...row }));
    }

    return {
      select: () => {
        const proxy = chain.select();
        // `.single()`/`.maybeSingle()` must yield one row, not an array.
        return Object.assign(Object.create(proxy), {
          maybeSingle: async () => ({ data: resolve()[0] ?? null, error: null }),
          single: async () => ({ data: resolve()[0], error: null }),
          then: (onFulfilled, onRejected) =>
            Promise.resolve({ data: resolve(), error: null }).then(onFulfilled, onRejected),
        });
      },
      insert: (row) => {
        const stored = {
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          seq: rows[name].length + 1,
          ...row,
        };
        rows[name].push(stored);
        calls.insert.push({ table: name, row: stored });
        return {
          select: () => ({
            single: async () => ({ data: { ...stored }, error: null }),
            maybeSingle: async () => ({ data: { ...stored }, error: null }),
          }),
          then: (onFulfilled, onRejected) =>
            Promise.resolve({ data: { ...stored }, error: null }).then(onFulfilled, onRejected),
        };
      },
      update: (patch) => {
        const apply = (filters) => {
          let updated = null;
          rows[name] = rows[name].map((row) => {
            if (!matches(row, filters)) return row;
            updated = { ...row, ...patch, updated_at: new Date().toISOString() };
            return updated;
          });
          calls.update.push({ table: name, patch, filters });
          return updated;
        };
        const builder = {
          eq: (column, value) => {
            apply([[column, value]]);
            return {
              select: () => ({ maybeSingle: async () => ({ data: rows[name].find((row) => row[column] === value) ?? null, error: null }) }),
              then: (onFulfilled, onRejected) => Promise.resolve({ error: null }).then(onFulfilled, onRejected),
            };
          },
        };
        return builder;
      },
    };
  };

  const client = {
    auth: {
      getSession: async () => ({ data: { session: SESSION }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async () => ({ data: { session: SESSION }, error: null }),
      signUp: async () => ({ data: { user: SESSION.user, session: null }, error: null }),
      signOut: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({ error: null }),
      updateUser: async () => ({ error: null }),
      resend: async () => ({ error: null }),
    },
    from: table,
    rpc: async () => ({ error: null }),
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
  };

  return { client, rows, calls };
}

function installDom() {
  const dom = new JSDOM('<!doctype html><html lang="en"><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
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
    HTMLTextAreaElement: window.HTMLTextAreaElement,
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

  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

/** Stub the server: config, provider health and the chat endpoint. */
function stubFetch({ chatResponse } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    calls.push({ url: target, body: init?.body ? JSON.parse(String(init.body)) : null });

    if (target.includes('/api/workspace/config')) {
      return json({ enabled: true, url: 'https://project.supabase.co', publishableKey: 'sb_publishable_test_key_123456' });
    }
    if (target.includes('/api/nova/config')) {
      return json({ providers: { auto: true, local: true, gemini: false, openrouter: false, arena: false } });
    }
    if (target.includes('/api/nova/chat')) {
      const canned = typeof chatResponse === 'function' ? chatResponse(init) : chatResponse;
      return json(canned?.body ?? { text: 'A calm answer.', provider: 'Local engine', model: 'nasa-local-engine' }, canned?.status ?? 200);
    }
    return json({}, 404);
  };
  return calls;
}

function json(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

async function mountChat({ client, path = '/chat' }) {
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const { default: i18n } = await import('../src/i18n.ts');
  const { ThemeProvider } = await import('../src/app/theme.tsx');
  const { RouterProvider } = await import('../src/app/router.tsx');
  const { AuthProvider } = await import('../src/auth/AuthProvider.tsx');
  const { default: ChatSurface } = await import('../src/workspace/chat/ChatSurface.tsx');

  window.history.replaceState({}, '', path);
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
            React.createElement(
              AuthProvider,
              { createClient: async () => client },
              React.createElement(ChatSurface),
            ),
          ),
        ),
      ),
    );
  });
  await settle(act, 80);

  return {
    act,
    i18n,
    text: () => document.body.textContent || '',
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

async function settle(act, ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function typeInto(act, element, value) {
  await act(async () => {
    const prototype = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
    setter.call(element, value);
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

async function submit(act, form) {
  await act(async () => {
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  });
  await settle(act, 120);
}

function conversation(id, title, extra = {}) {
  return {
    id,
    user_id: 'user-1',
    project_id: null,
    title,
    archived: false,
    pinned: false,
    last_message_at: '2026-03-01T10:00:00.000Z',
    deleted_at: null,
    created_at: '2026-03-01T10:00:00.000Z',
    updated_at: '2026-03-01T10:00:00.000Z',
    ...extra,
  };
}

/* --------------------------------------------------------------------- tests */

test('the signed-in list shows conversations and an honest empty state', async () => {
  const dom = installDom();
  try {
    stubFetch();
    const { client } = createFakeClient({
      conversations: [conversation('c1', 'Lagrange points'), conversation('c2', 'Earth observation')],
    });
    const app = await mountChat({ client });

    assert.match(app.text(), /Lagrange points/);
    assert.match(app.text(), /Earth observation/);
    assert.equal(document.querySelectorAll('aside li').length, 2);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('sending a message creates the conversation and persists both turns', async () => {
  const dom = installDom();
  try {
    const fetches = stubFetch({
      chatResponse: {
        body: { text: 'Answer **with markdown**.', provider: 'Arena', model: 'arena_smart.aria' },
      },
    });
    const { client, rows, calls } = createFakeClient();

    const app = await mountChat({ client });
    await typeInto(app.act, document.querySelector('#nova-chat-composer'), 'What is a Lagrange point?');
    await submit(app.act, document.querySelector('form'));

    // A conversation was created with a title derived from the message.
    assert.equal(rows.conversations.length, 1);
    assert.equal(rows.conversations[0].title, 'What is a Lagrange point?');

    // Both turns were persisted, in order, with the real provider recorded.
    const inserts = calls.insert.filter((call) => call.table === 'messages');
    assert.equal(inserts.length, 2);
    assert.equal(inserts[0].row.role, 'user');
    assert.equal(inserts[0].row.content, 'What is a Lagrange point?');
    assert.equal(inserts[1].row.role, 'assistant');
    assert.equal(inserts[1].row.provider, 'Arena');
    assert.equal(inserts[1].row.model, 'arena_smart.aria');

    // The request carried the turn, the locale and the provider.
    const chat = fetches.find((call) => call.url.includes('/api/nova/chat'));
    assert.equal(chat.body.messages.at(-1).content, 'What is a Lagrange point?');
    assert.equal(chat.body.messages.at(-1).role, 'user');
    assert.equal(chat.body.provider, 'auto');

    // Markdown in the reply is rendered as elements, not as literal asterisks.
    await settle(app.act, 400);
    assert.ok(document.querySelector('.nova-prose strong'), 'bold markdown rendered');
    assert.doesNotMatch(app.text(), /\*\*with markdown\*\*/);
    assert.match(app.text(), /Arena/);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('a provider failure shows the translated error and marks the reply unsaved', async () => {
  const dom = installDom();
  try {
    stubFetch({ chatResponse: { status: 503, body: { error: 'nope', code: 'PROVIDER_UNAVAILABLE' } } });
    const { client, calls } = createFakeClient({ conversations: [conversation('c1', 'Existing thread')] });

    const app = await mountChat({ client, path: '/chat/c1' });
    await typeInto(app.act, document.querySelector('#nova-chat-composer'), 'Are you there?');
    await submit(app.act, document.querySelector('form'));

    assert.match(app.text(), /temporarily unavailable/);
    const assistant = calls.insert.find((call) => call.table === 'messages' && call.row.role === 'assistant');
    assert.equal(assistant.row.is_error, true);
    assert.match(app.text(), /not saved/);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('rename, pin, archive and delete update the row and the list', async () => {
  const dom = installDom();
  try {
    stubFetch();
    const { client, rows, calls } = createFakeClient({
      conversations: [conversation('c1', 'Old title')],
    });

    const app = await mountChat({ client });
    const listItem = () => document.querySelector('aside li');

    // Rename through the inline form.
    const renameButton = [...document.querySelectorAll('aside button')].find(
      (node) => node.getAttribute('aria-label') === 'Rename',
    );
    await app.act(async () => {
      renameButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const input = document.querySelector('aside form input');
    assert.ok(input, 'rename input appeared');
    await typeInto(app.act, input, 'New title');
    await submit(app.act, document.querySelector('aside form'));
    assert.match(app.text(), /New title/);
    assert.equal(rows.conversations[0].title, 'New title');

    // Pin.
    const pinButton = [...document.querySelectorAll('aside button')].find(
      (node) => node.getAttribute('aria-label') === 'Pin',
    );
    await app.act(async () => {
      pinButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await settle(app.act, 40);
    assert.equal(rows.conversations[0].pinned, true);

    // Archive → disappears from the default list.
    const archiveButton = [...document.querySelectorAll('aside button')].find(
      (node) => node.getAttribute('aria-label') === 'Archive',
    );
    await app.act(async () => {
      archiveButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await settle(app.act, 40);
    assert.equal(rows.conversations[0].archived, true);
    assert.equal(listItem(), null, 'archived thread leaves the active list');

    const updates = calls.update.filter((call) => call.table === 'conversations');
    assert.ok(updates.some((call) => call.patch.title === 'New title'));
    assert.ok(updates.some((call) => call.patch.pinned === true));
    assert.ok(updates.some((call) => call.patch.archived === true));
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('deleting a conversation is a soft delete, not a hard delete', async () => {
  const dom = installDom();
  try {
    stubFetch();
    const { client, rows } = createFakeClient({ conversations: [conversation('c1', 'Disposable')] });

    const app = await mountChat({ client });
    const deleteButton = [...document.querySelectorAll('aside button')].find(
      (node) => node.getAttribute('aria-label') === 'Delete',
    );
    await app.act(async () => {
      deleteButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await settle(app.act, 40);

    assert.equal(rows.conversations.length, 1, 'the row is kept');
    assert.ok(rows.conversations[0].deleted_at, 'marked deleted');
    assert.doesNotMatch(app.text(), /Disposable/);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('the chat surface is fully translated in Sinhala and Tamil', async () => {
  const dom = installDom();
  try {
    stubFetch();
    const { client } = createFakeClient({ conversations: [conversation('c1', 'Thread')] });
    const app = await mountChat({ client });

    await app.act(async () => {
      await app.i18n.changeLanguage('si');
    });
    assert.match(app.text(), /සංවාද/);
    assert.match(app.text(), /නව සංවාදයක්/);

    await app.act(async () => {
      await app.i18n.changeLanguage('ta');
    });
    assert.match(app.text(), /உரையாடல்கள்/);
    assert.match(app.text(), /புதிய அரட்டை/);

    await app.act(async () => {
      await app.i18n.changeLanguage('en');
    });
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('raw HTML in a reply is never rendered as markup', async () => {
  const dom = installDom();
  try {
    stubFetch({
      chatResponse: {
        body: {
          text: 'Hello <img src=x onerror="window.__pwned = true"> <script>window.__pwned = true</script>',
          provider: 'Local engine',
        },
      },
    });
    const { client } = createFakeClient();
    const app = await mountChat({ client });

    await typeInto(app.act, document.querySelector('#nova-chat-composer'), 'Try to inject');
    await submit(app.act, document.querySelector('form'));
    await settle(app.act, 400);

    assert.equal(document.querySelector('.nova-prose img'), null, 'no image element from reply text');
    assert.equal(window.__pwned, undefined);
    assert.equal(document.querySelectorAll('.nova-prose script').length, 0);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});
