/**
 * Home dashboard — behaviour tests.
 *
 * The dashboard is the first thing a reader sees, so the checks here are about
 * honesty as much as rendering: the orb has one accessible label per state, the
 * composer really hands a prompt to the chat surface, the quick actions point at
 * routes that exist, and the new copy exists in all three languages.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-workspace-home.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

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

/** Only what Home touches: auth session, the profile row and `/api/nova/config`. */
function stubFetch() {
  const calls = [];
  globalThis.fetch = async (url) => {
    const target = String(url);
    calls.push(target);
    if (target.includes('/api/workspace/config')) {
      return json({
        enabled: true,
        url: 'https://project.supabase.co',
        publishableKey: 'sb_publishable_test_key_123456',
      });
    }
    if (target.includes('/api/nova/config')) {
      return json({
        providers: { auto: true, local: true, gemini: true, openrouter: false, arena: false },
        deployment: { environment: 'test', commit: 'abc', branch: 'main' },
      });
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

function createFakeClient() {
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
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { ...PROFILE }, error: null }),
          single: async () => ({ data: { ...PROFILE }, error: null }),
          then: (onFulfilled) => Promise.resolve({ data: [{ ...PROFILE }], error: null }).then(onFulfilled),
        }),
      }),
      insert: () => ({ select: () => ({ single: async () => ({ data: { ...PROFILE }, error: null }) }) }),
    }),
    rpc: async () => ({ error: null }),
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
  };
  return client;
}

async function mountHome({ client } = {}) {
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const { default: i18n } = await import('../src/i18n.ts');
  const { ThemeProvider } = await import('../src/app/theme.tsx');
  const { RouterProvider } = await import('../src/app/router.tsx');
  const { AuthProvider } = await import('../src/auth/AuthProvider.tsx');
  const { default: HomeSurface } = await import('../src/workspace/home/HomeSurface.tsx');

  window.history.replaceState({}, '', '/');
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
              { createClient: async () => (client === undefined ? createFakeClient() : client) },
              React.createElement(HomeSurface),
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

/* --------------------------------------------------------------------- tests */

test('the hero renders one labelled orb with four colour fields', async () => {
  const dom = installDom();
  try {
    stubFetch();
    const app = await mountHome();

    const orbs = document.querySelectorAll('.nova-orb');
    assert.equal(orbs.length, 1, 'exactly one orb');
    const orb = orbs[0];
    assert.equal(orb.getAttribute('role'), 'img');
    assert.equal(orb.getAttribute('data-state'), 'idle');
    assert.equal(orb.getAttribute('aria-label'), 'Nova is ready');
    assert.equal(orb.querySelectorAll('.nova-orb__blob').length, 4);
    assert.ok(orb.querySelector('.nova-orb__glass'), 'the glass shell is present');
    // Decorative layers must never reach the accessibility tree as content.
    for (const layer of orb.querySelectorAll('span')) {
      assert.equal(layer.getAttribute('aria-hidden'), 'true');
    }
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('the orb label follows its state in every language', async () => {
  const dom = installDom();
  try {
    const { orbStateLabelKey } = await import('../src/workspace/home/NovaOrb.tsx');
    const { default: i18n } = await import('../src/i18n.ts');
    const states = ['idle', 'thinking', 'listening', 'generating'].map(orbStateLabelKey);
    assert.equal(new Set(states).size, 4, 'each state has its own label');

    for (const key of states) {
      const en = i18n.getFixedT('en')(key);
      const si = i18n.getFixedT('si')(key);
      const ta = i18n.getFixedT('ta')(key);
      for (const value of [en, si, ta]) {
        assert.ok(value && value !== key, `${key} is translated`);
      }
      assert.notEqual(en, si);
      assert.notEqual(en, ta);
    }
  } finally {
    dom.window.close();
  }
});

test('the greeting, subtitle and composer are on the page', async () => {
  const dom = installDom();
  try {
    stubFetch();
    const app = await mountHome();
    assert.match(app.text(), /Good (morning|afternoon|evening)/);
    assert.match(app.text(), /AI workspace for thinking, writing and organising/);
    const composer = document.querySelector('#nova-home-prompt');
    assert.ok(composer, 'a composer input exists');
    assert.match(composer.getAttribute('placeholder'), /Ask Nova anything/);
    assert.equal(document.querySelectorAll('.nova-chip-glass').length, 4, 'four prompt suggestions');
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('the thinking picker lists all five levels in order and remembers the choice', async () => {
  const dom = installDom();
  try {
    stubFetch();
    const app = await mountHome();

    const trigger = [...document.querySelectorAll('button')].find((button) =>
      (button.getAttribute('aria-label') || '').startsWith('Thinking level'),
    );
    assert.ok(trigger, 'the composer carries a thinking picker');
    assert.match(trigger.textContent || '', /Auto/);

    await app.act(async () => {
      trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });

    const options = [...document.querySelectorAll('[role="option"]')];
    assert.equal(options.length, 5, 'all five rungs are offered');
    assert.deepEqual(
      options.map((option) =>
        (option.querySelector('.nova-thinking__option-label')?.textContent || '')
          .replace(/[·●]/g, '')
          .trim(),
      ),
      ['Auto', 'Flash', 'Flash thinking', 'Thinking', 'Deep thinking'],
      'the ladder is ordered auto → deep',
    );
    assert.equal(options[0].getAttribute('aria-selected'), 'true', 'auto is the default');

    await app.act(async () => {
      options[4].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await settle(app.act, 40);

    assert.equal(window.localStorage.getItem('nova_thinking_level_v1'), 'deep-thinking');
    assert.match(trigger.textContent || '', /Deep thinking/);
    assert.equal(document.querySelectorAll('[role="option"]').length, 0, 'the list closes after choosing');
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('a starter chosen on Home carries its thinking level into the chat queue', async () => {
  const dom = installDom();
  try {
    stubFetch();
    window.sessionStorage.clear();
    const app = await mountHome();

    const card = [...document.querySelectorAll('.nova-science-card')].find((node) =>
      /Mission briefing/.test(node.textContent || ''),
    );
    assert.ok(card, 'the astronomy studio offers a mission briefing starter');
    await app.act(async () => {
      card.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await settle(app.act, 40);

    assert.equal(window.location.pathname, '/chat');
    assert.match(window.sessionStorage.getItem('nova_pending_prompt') || '', /Artemis/);
    assert.equal(window.sessionStorage.getItem('nova_pending_thinking'), 'thinking');
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('sending from Home queues the prompt and opens the chat', async () => {
  const dom = installDom();
  try {
    stubFetch();
    window.sessionStorage.clear();
    const app = await mountHome();

    const input = document.querySelector('#nova-home-prompt');
    await app.act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, '  Plan my week  ');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await app.act(async () => {
      input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await settle(app.act, 60);

    assert.equal(window.sessionStorage.getItem('nova_pending_prompt'), 'Plan my week');
    assert.equal(window.location.pathname, '/chat');
    // The orb acknowledges the hand-off rather than staying idle.
    assert.equal(document.querySelector('.nova-orb').getAttribute('data-state'), 'thinking');
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('a signed-out visitor is not blocked from the AI surface', async () => {
  const dom = installDom();
  try {
    stubFetch();
    window.sessionStorage.clear();
    window.localStorage.clear();
    const app = await mountHome({ client: null });

    const input = document.querySelector('#nova-home-prompt');
    await app.act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, 'Explain the Moon phases');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await app.act(async () => {
      input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await settle(app.act, 60);

    // No sign-in detour: the guest lands in the chat workspace with the prompt.
    assert.equal(window.location.pathname, '/chat');
    assert.equal(window.sessionStorage.getItem('nova_pending_prompt'), 'Explain the Moon phases');
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('an empty composer never queues anything', async () => {
  const dom = installDom();
  try {
    stubFetch();
    window.sessionStorage.clear();
    const app = await mountHome();
    const form = document.querySelector('form');
    await app.act(async () => {
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });
    await settle(app.act, 40);
    assert.equal(window.sessionStorage.getItem('nova_pending_prompt'), null);
    assert.equal(window.location.pathname, '/');
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('quick actions and the roadmap only point at routes that exist', async () => {
  const dom = installDom();
  try {
    stubFetch();
    const app = await mountHome();
    const hrefs = [...document.querySelectorAll('a[href]')].map((link) => link.getAttribute('href'));
    for (const expected of ['/chat', '/explore', '/settings', '/profile']) {
      assert.ok(hrefs.includes(expected), `a quick action points at ${expected}`);
    }
    assert.equal(document.querySelectorAll('.nova-quick-card').length, 4);
    // No placeholder features: the dashboard must not advertise upload or voice.
    assert.doesNotMatch(app.text(), /attach|microphone/i);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('a pending prompt is delivered exactly once', async () => {
  const dom = installDom();
  try {
    window.sessionStorage.clear();
    const { queuePrompt, takePrompt } = await import('../src/workspace/chat/pendingPrompt.ts');
    assert.equal(takePrompt(), null);
    assert.equal(queuePrompt('   '), false, 'blank prompts are refused');
    assert.equal(queuePrompt('  Summarise this  '), true);
    assert.equal(takePrompt(), 'Summarise this');
    assert.equal(takePrompt(), null, 'a reload cannot replay the prompt');
  } finally {
    dom.window.close();
  }
});
