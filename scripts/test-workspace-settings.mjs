/**
 * Settings surface — behaviour tests (Phase 3C).
 *
 * Proves the controls actually change behaviour and persist where they claim to:
 * device preferences to localStorage, the chat provider default to `profiles`.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-workspace-settings.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

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

function createFakeClient({ signedIn = true, profile = {} } = {}) {
  const state = {
    session: signedIn
      ? { user: { id: 'user-1', email: 'ada@example.com', email_confirmed_at: '2026-01-01T00:00:00.000Z' } }
      : null,
    profile: { ...PROFILE, ...profile },
    profileUpdates: [],
  };

  const client = {
    auth: {
      getSession: async () => ({ data: { session: state.session }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async () => ({ data: { session: state.session }, error: null }),
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
          maybeSingle: async () => ({ data: { ...state.profile }, error: null }),
          single: async () => ({ data: { ...state.profile }, error: null }),
        };
        return chain;
      },
      insert: async () => ({ error: null }),
      update: (patch) => {
        state.profileUpdates.push(patch);
        state.profile = { ...state.profile, ...patch };
        const chain = {
          eq: () => chain,
          select: () => chain,
          maybeSingle: async () => ({ data: { ...state.profile }, error: null }),
        };
        return chain;
      },
    }),
    rpc: async () => ({ error: null }),
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
  };

  return { client, state };
}

function installDom({ diagnostics } = {}) {
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
    HTMLSelectElement: window.HTMLSelectElement,
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

  globalThis.__diagCalls = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    let body;
    if (target.includes('/api/nova/diagnostics')) {
      globalThis.__diagCalls += 1;
      body = diagnostics ?? {
        checkedAt: '2026-11-06T10:00:00.000Z',
        deployment: 'production',
        probed: true,
        throttled: false,
        providers: {
          openrouter: {
            provider: 'OpenRouter',
            configured: true,
            endpoint: 'openrouter.ai',
            model: 'openrouter/free',
            status: 'ok',
            code: 'OK',
            httpStatus: 200,
            ms: 240,
          },
          gemini: {
            provider: 'Google Gemini',
            configured: true,
            endpoint: 'generativelanguage.googleapis.com',
            model: 'gemini-2.5-flash',
            status: 'error',
            code: 'PROVIDER_AUTH_ERROR',
            httpStatus: 401,
            keyValid: false,
            ms: 180,
            reason: 'API key not valid. Please pass a valid API key.',
          },
          arena: {
            provider: 'Arena AI',
            configured: true,
            endpoint: 'api.arena.ai',
            model: 'arena_smart.aria',
            status: 'error',
            code: 'PROVIDER_MODEL_NOT_FOUND',
            httpStatus: 404,
            ms: 95,
          },
          local: {
            provider: 'NOVA Local Space Engine',
            configured: true,
            endpoint: 'in-process',
            model: 'nasa-local-engine',
            status: 'ok',
            code: 'OK',
          },
        },
      };
    } else if (target.includes('/api/workspace/config')) {
      body = { enabled: true, url: 'https://project.supabase.co', publishableKey: 'sb_publishable_test_key_123456' };
    } else {
      body = { providers: { auto: true, local: true, gemini: false, openrouter: false, arena: false } };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => body,
    };
  };

  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

async function mountSettings({ client }) {
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const { default: i18n } = await import('../src/i18n.ts');
  const { ThemeProvider } = await import('../src/app/theme.tsx');
  const { RouterProvider } = await import('../src/app/router.tsx');
  const { AuthProvider } = await import('../src/auth/AuthProvider.tsx');
  const { default: SettingsSurface } = await import('../src/workspace/settings/SettingsSurface.tsx');

  await i18n.changeLanguage('en');
  window.localStorage.clear();

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
              React.createElement(SettingsSurface),
            ),
          ),
        ),
      ),
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
  });

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

async function click(act, node) {
  await act(async () => {
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
}

function buttonByText(text) {
  return [...document.querySelectorAll('button')].find((node) => (node.textContent || '').includes(text));
}

test('the theme control changes the palette and persists the choice', async () => {
  const dom = installDom();
  try {
    const { client } = createFakeClient();
    const app = await mountSettings({ client });

    const light = buttonByText('Light');
    assert.ok(light, 'light option rendered');
    await click(app.act, light);

    assert.equal(window.localStorage.getItem('nova_theme'), 'light');
    assert.equal(document.documentElement.getAttribute('data-nova-theme'), 'light');
    assert.equal(light.getAttribute('aria-checked'), 'true');
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('contrast and motion switches flip their document attributes', async () => {
  const dom = installDom();
  try {
    const { client } = createFakeClient();
    const app = await mountSettings({ client });

    const contrast = document.querySelector('[role="switch"][aria-label="Higher contrast"]');
    const motion = document.querySelector('[role="switch"][aria-label="Reduce motion"]');
    assert.ok(contrast && motion, 'both switches render');

    await click(app.act, contrast);
    assert.equal(window.localStorage.getItem('nova_contrast'), 'high');
    assert.equal(document.documentElement.getAttribute('data-nova-contrast'), 'high');

    await click(app.act, motion);
    assert.equal(window.localStorage.getItem('nova_motion'), 'reduced');
    assert.equal(document.documentElement.getAttribute('data-nova-motion'), 'reduced');
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('language switches the whole surface and is persisted', async () => {
  const dom = installDom();
  try {
    const { client } = createFakeClient();
    const app = await mountSettings({ client });

    await click(app.act, buttonByText('සිංහල'));
    await app.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    assert.equal(window.localStorage.getItem('i18nextLng'), 'si');
    assert.match(app.text(), /සැකසුම්/);

    await click(app.act, buttonByText('தமிழ்'));
    await app.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    assert.match(app.text(), /அமைப்புகள்/);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('signed out: the provider select is absent and the reason is stated', async () => {
  const dom = installDom();
  try {
    const { client } = createFakeClient({ signedIn: false });
    const app = await mountSettings({ client });

    assert.equal(document.querySelector('select'), null, 'no dead control when signed out');
    assert.match(app.text(), /Sign in to save a provider default/);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('signed in: choosing a provider writes it to the profile', async () => {
  const dom = installDom();
  try {
    const { client, state } = createFakeClient();
    const app = await mountSettings({ client });

    const select = document.querySelector('select');
    assert.ok(select, 'provider select rendered');
    await app.act(async () => {
      select.value = 'local';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    await app.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    const update = state.profileUpdates.at(-1);
    assert.equal(update.preferred_provider, 'local');
    assert.equal(state.profile.preferred_provider, 'local');
    assert.match(app.text(), /Saved to your account/);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('the AI status card names each provider and its failure reason', async () => {
  const dom = installDom();
  try {
    const { client } = createFakeClient();
    const app = await mountSettings({ client });
    await app.settle ? await app.settle() : await app.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });

    const text = app.text();
    assert.match(text, /AI providers/);
    assert.match(text, /OpenRouter/);
    assert.match(text, /Working/);
    assert.match(text, /Google Gemini/);
    assert.match(text, /PROVIDER_AUTH_ERROR \(HTTP 401\)/);
    assert.match(text, /API key rejected by the provider/);
    assert.match(text, /Arena AI/);
    assert.match(text, /PROVIDER_MODEL_NOT_FOUND/);
    assert.match(text, /NOVA Local Space Engine/);

    const reason = document.querySelector('[data-testid="ai-status-reason-gemini"]');
    assert.ok(reason, 'the redacted upstream reason is shown');
    assert.match(reason.textContent, /API key not valid/);
    assert.equal(globalThis.__diagCalls, 1, 'checked once on mount');
  } finally {
    dom.window.close();
  }
});

test('Re-check asks the server again', async () => {
  const dom = installDom();
  try {
    const { client } = createFakeClient();
    const app = await mountSettings({ client });
    await app.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    assert.equal(globalThis.__diagCalls, 1);

    const recheck = [...document.querySelectorAll('button')].find((node) =>
      (node.textContent || '').includes('Re-check'),
    );
    assert.ok(recheck, 're-check button rendered');
    await click(app.act, recheck);
    await app.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    assert.equal(globalThis.__diagCalls, 2);
  } finally {
    dom.window.close();
  }
});

test('only providers this deployment can call are offered', async () => {
  const dom = installDom();
  try {
    const { client } = createFakeClient();
    const app = await mountSettings({ client });
    await app.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    const select = document.querySelector('select');
    const values = [...select.querySelectorAll('option')].map((option) => option.value);
    assert.deepEqual(values, ['auto', 'local'], 'unconfigured online providers are not offered');
    assert.doesNotMatch(app.text(), /Your saved default/);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('a saved default that is no longer configured is called out', async () => {
  const dom = installDom();
  try {
    const { client } = createFakeClient({ profile: { preferred_provider: 'gemini' } });
    const app = await mountSettings({ client });
    await app.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    assert.match(app.text(), /Your saved default \(Gemini\) is not configured on this server/);
    const values = [...document.querySelectorAll('select option')].map((option) => option.value);
    assert.equal(values.includes('gemini'), false);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('an invalid model id is shown as a configuration problem, not an outage', async () => {
  const dom = installDom({ diagnostics: {
    checkedAt: '2026-11-08T17:20:00.000Z',
    deployment: 'production · ec749df',
    probed: true,
    throttled: false,
    providers: {
      openrouter: {
        provider: 'OpenRouter',
        configured: true,
        endpoint: 'openrouter.ai',
        model: 'openrouter/free',
        status: 'ok',
        code: 'OK',
        httpStatus: 200,
        ms: 165,
      },
      gemini: {
        provider: 'Google Gemini',
        configured: true,
        endpoint: 'generativelanguage.googleapis.com',
        model: 'gemini-3.8-flash',
        status: 'error',
        code: 'PROVIDER_MODEL_NOT_FOUND',
        httpStatus: 404,
        ms: 96,
        modelInvalid: true,
        hint: 'NOVA_GEMINI_MODEL="gemini-3.8-flash" is not a Gemini model id.',
        fallbackModel: { model: 'gemini-flash-latest', ok: true, httpStatus: 200, code: 'OK', ms: 410 },
        modelsTried: ['gemini-3.8-flash', 'gemini-flash-latest'],
        availableModels: ['gemini-3.8-flash', 'gemini-2.5-flash'],
      },
      arena: { provider: 'Arena AI', configured: false, endpoint: 'api.arena.ai', model: 'arena_smart.aria', status: 'not-configured', code: 'PROVIDER_NOT_CONFIGURED' },
      local: { provider: 'NOVA Local Space Engine', configured: true, endpoint: 'in-process', model: 'nasa-local-engine', status: 'ok', code: 'OK' },
    },
  } });
  try {
    const { client } = createFakeClient();
    const app = await mountSettings({ client });
    await app.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });

    const line = document.querySelector('[data-testid="ai-status-model-gemini"]');
    assert.ok(line, 'the model problem has its own line');
    assert.match(line.textContent, /model request was not found or rejected/);
    assert.match(line.textContent, /alternative model probe returned a successful status/);
    const models = document.querySelector('[data-testid="ai-status-models-gemini"]');
    assert.ok(models, 'the models this key may use are listed');
    assert.match(models.textContent, /Models listed by the provider: gemini-3\.8-flash, gemini-2\.5-flash/);
    // It must not be dressed up as a key problem: no key verdict was reported.
    assert.equal(document.querySelector('[data-testid="ai-status-key-gemini"]'), null);
  } finally {
    dom.window.close();
  }
});
