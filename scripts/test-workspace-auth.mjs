/**
 * Workspace authentication — UI behaviour tests (Phase 3B).
 *
 * A fake Supabase client is injected through `<AuthProvider createClient>`, so
 * these tests exercise the real provider, panel, guard and copy without a
 * network or a project. Scenarios: no cloud configured, wrong password, correct
 * sign-in, sign-up that needs email confirmation, resend, the route guard, and
 * Sinhala/Tamil rendering.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-workspace-auth.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

/* ------------------------------------------------------------------- fixtures */

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

function createFakeClient(options = {}) {
  const state = {
    session: options.session ?? null,
    listeners: [],
    profile: { ...PROFILE },
    profileUpdates: [],
    calls: { signIn: 0, signUp: 0, signOut: 0, resend: 0, reset: 0 },
    signInError: options.signInError ?? null,
    signUpNeedsConfirmation: options.signUpNeedsConfirmation ?? true,
    signUpError: options.signUpError ?? null,
  };

  const emit = (event, session) => {
    for (const listener of state.listeners) listener(event, session);
  };

  const profileChain = () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: state.profile, error: null }),
      single: async () => ({ data: state.profile, error: null }),
    };
    return chain;
  };

  const client = {
    auth: {
      getSession: async () => ({ data: { session: state.session }, error: null }),
      onAuthStateChange: (callback) => {
        state.listeners.push(callback);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithPassword: async ({ email }) => {
        state.calls.signIn += 1;
        if (state.signInError) return { data: null, error: { message: state.signInError } };
        state.session = {
          user: { id: 'user-1', email, email_confirmed_at: '2026-01-01T00:00:00.000Z' },
        };
        emit('SIGNED_IN', state.session);
        return { data: { session: state.session }, error: null };
      },
      signUp: async ({ email }) => {
        state.calls.signUp += 1;
        if (state.signUpError) return { data: null, error: { message: state.signUpError } };
        if (state.signUpNeedsConfirmation) {
          return { data: { user: { id: 'user-1', email }, session: null }, error: null };
        }
        state.session = { user: { id: 'user-1', email, email_confirmed_at: null } };
        emit('SIGNED_IN', state.session);
        return { data: { user: { id: 'user-1', email }, session: state.session }, error: null };
      },
      signOut: async () => {
        state.calls.signOut += 1;
        state.session = null;
        emit('SIGNED_OUT', null);
        return { error: null };
      },
      resetPasswordForEmail: async () => {
        state.calls.reset += 1;
        return { error: null };
      },
      updateUser: async () => ({ error: null }),
      resend: async () => {
        state.calls.resend += 1;
        return { error: null };
      },
    },
    from(table) {
      assert.equal(table, 'profiles', 'auth flows only touch profiles');
      return {
        select: () => profileChain(),
        insert: async () => ({ error: null }),
        update: (patch) => {
          state.profileUpdates.push(patch);
          state.profile = { ...state.profile, ...patch };
          const chain = {
            eq: () => chain,
            select: () => chain,
            maybeSingle: async () => ({ data: state.profile, error: null }),
          };
          return chain;
        },
      };
    },
    rpc: async () => ({ error: null }),
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
  };

  return { client, state };
}

/* ----------------------------------------------------------------- jsdom setup */

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

  // The provider asks the server for config; answer "not configured" so the
  // unconfigured path is exercised deterministically.
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ enabled: false, reason: 'not-configured' }),
  });

  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

async function mount(elementFactory) {
  const { act } = await import('react');
  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const { default: i18n } = await import('../src/i18n.ts');
  const { ThemeProvider } = await import('../src/app/theme.tsx');

  const root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(
      React.createElement(
        I18nextProvider,
        { i18n },
        React.createElement(ThemeProvider, null, elementFactory(React)),
      ),
    );
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

async function settle(act, ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function type(act, input, value) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

async function submit(act, form) {
  await act(async () => {
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  });
  await settle(act);
}

/* ----------------------------------------------------------------------- tests */

test('with no cloud configured the panel explains itself and offers no form', async () => {
  const dom = installDom();
  try {
    const { AuthProvider } = await import('../src/auth/AuthProvider.tsx');
    const { default: AuthPanel } = await import('../src/auth/AuthPanel.tsx');

    const app = await mount((React) =>
      React.createElement(
        AuthProvider,
        { createClient: async () => null },
        React.createElement(AuthPanel),
      ),
    );
    await settle(app.act, 60);

    const text = app.text();
    assert.match(text, /Cloud workspace is not configured/);
    assert.match(text, /Explore still works/);
    assert.equal(document.querySelector('input[type="email"]'), null, 'no fake form');
    assert.equal(document.querySelector('button[type="submit"]'), null);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('a probe that never reached the server can be retried', async () => {
  const dom = installDom();
  try {
    const { resetCloudConfigCache } = await import('../src/data/config.ts');
    resetCloudConfigCache();
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error('offline');
    };

    const { AuthProvider } = await import('../src/auth/AuthProvider.tsx');
    const { default: AuthPanel } = await import('../src/auth/AuthPanel.tsx');

    const app = await mount((React) =>
      React.createElement(AuthProvider, { createClient: async () => null }, React.createElement(AuthPanel)),
    );
    await settle(app.act, 60);

    assert.match(app.text(), /could not be reached/);
    const retry = [...document.querySelectorAll('button')].find((button) =>
      /Try again/.test(button.textContent || ''),
    );
    assert.ok(retry, 'an unreachable endpoint offers a retry');

    const before = calls;
    await app.act(async () => {
      retry.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await settle(app.act, 60);
    assert.ok(calls > before, 'the retry probes the endpoint again instead of reusing the cache');
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('missing credentials are not retryable and name the variables', async () => {
  const dom = installDom();
  try {
    const { resetCloudConfigCache } = await import('../src/data/config.ts');
    resetCloudConfigCache();
    const { AuthProvider } = await import('../src/auth/AuthProvider.tsx');
    const { default: AuthPanel } = await import('../src/auth/AuthPanel.tsx');

    const app = await mount((React) =>
      React.createElement(AuthProvider, { createClient: async () => null }, React.createElement(AuthPanel)),
    );
    await settle(app.act, 60);

    assert.match(app.text(), /SUPABASE_URL/);
    assert.match(app.text(), /SUPABASE_PUBLISHABLE_KEY/);
    const retry = [...document.querySelectorAll('button')].find((button) =>
      /Try again/.test(button.textContent || ''),
    );
    assert.equal(retry, undefined, 'configuration is an operator problem, not a retry loop');
    assert.match(app.text(), /Explore keeps working offline/);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('a first visit resolves to the premium light theme', async () => {
  const dom = installDom();
  try {
    const { useTheme } = await import('../src/app/theme.tsx');
    const app = await mount((React) => {
      const Probe = () => {
        const theme = useTheme();
        return React.createElement('p', { id: 'theme-probe' }, `${theme.preference}:${theme.theme}`);
      };
      return React.createElement(Probe);
    });
    await settle(app.act, 20);

    // jsdom reports no colour-scheme preference, so this only passes if light is
    // the product default rather than whatever the OS says.
    assert.equal(document.getElementById('theme-probe').textContent, 'light:light');
    assert.equal(document.documentElement.getAttribute('data-nova-theme'), 'light');
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('wrong credentials show a translated error and never a raw message', async () => {
  const dom = installDom();
  try {
    const { AuthProvider } = await import('../src/auth/AuthProvider.tsx');
    const { default: AuthPanel } = await import('../src/auth/AuthPanel.tsx');
    const { client, state } = createFakeClient({ signInError: 'Invalid login credentials' });

    const app = await mount((React) =>
      React.createElement(
        AuthProvider,
        { createClient: async () => client },
        React.createElement(AuthPanel),
      ),
    );
    await settle(app.act, 60);

    const email = document.querySelector('input[type="email"]');
    const password = document.querySelector('input[type="password"]');
    assert.ok(email && password, 'sign-in form rendered');
    await type(app.act, email, 'ada@example.com');
    await type(app.act, password, 'correct horse battery');

    await submit(app.act, document.querySelector('form'));

    assert.equal(state.calls.signIn, 1);
    const alert = document.querySelector('[role="alert"]');
    assert.ok(alert, 'error is announced');
    assert.match(alert.textContent, /Email or password is incorrect/);
    assert.doesNotMatch(app.text(), /Invalid login credentials/, 'raw provider text is never shown');
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('a successful sign-in resolves the session and loads the profile', async () => {
  const dom = installDom();
  try {
    const { AuthProvider, useAuth } = await import('../src/auth/AuthProvider.tsx');
    const { default: AuthPanel } = await import('../src/auth/AuthPanel.tsx');
    const { client, state } = createFakeClient();
    let authenticated = false;
    let snapshot = null;

    function Probe() {
      const auth = useAuth();
      snapshot = auth;
      return React.createElement('p', null, auth.status);
    }
    const React = (await import('react')).default;

    const app = await mount((R) =>
      R.createElement(
        AuthProvider,
        { createClient: async () => client },
        R.createElement(
          'div',
          null,
          R.createElement(Probe),
          R.createElement(AuthPanel, { onAuthenticated: () => { authenticated = true; } }),
        ),
      ),
    );
    await settle(app.act, 60);

    await type(app.act, document.querySelector('input[type="email"]'), 'ada@example.com');
    await type(app.act, document.querySelector('input[type="password"]'), 'correct horse battery');
    await submit(app.act, document.querySelector('form'));

    assert.equal(state.calls.signIn, 1);
    assert.equal(authenticated, true, 'onAuthenticated fired');
    assert.equal(snapshot.status, 'signed-in');
    assert.equal(snapshot.user.email, 'ada@example.com');
    assert.equal(snapshot.user.emailConfirmed, true);
    assert.equal(snapshot.profile.display_name, 'Ada');
    assert.equal(React.version.startsWith('19'), true);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('sign-up that needs email confirmation shows the inbox state and can resend', async () => {
  const dom = installDom();
  try {
    const { AuthProvider } = await import('../src/auth/AuthProvider.tsx');
    const { default: AuthPanel } = await import('../src/auth/AuthPanel.tsx');
    const { client, state } = createFakeClient({ signUpNeedsConfirmation: true });

    const app = await mount((React) =>
      React.createElement(
        AuthProvider,
        { createClient: async () => client },
        React.createElement(AuthPanel, { initialMode: 'sign-up' }),
      ),
    );
    await settle(app.act, 60);

    await type(app.act, document.querySelector('input[type="email"]'), 'new@example.com');
    const passwords = document.querySelectorAll('input[type="password"]');
    assert.equal(passwords.length, 2, 'password + confirmation');
    for (const field of passwords) await type(app.act, field, 'a long enough password');

    await submit(app.act, document.querySelector('form'));
    await settle(app.act, 40);

    assert.equal(state.calls.signUp, 1);
    assert.match(app.text(), /Check your inbox/);
    assert.match(app.text(), /new@example.com/, 'the address is echoed back');

    const resend = [...document.querySelectorAll('button')].find((node) =>
      /Resend confirmation email/.test(node.textContent || ''),
    );
    assert.ok(resend, 'resend action present');
    await app.act(async () => {
      resend.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await settle(app.act, 40);
    assert.equal(state.calls.resend, 1);
    assert.match(app.text(), /Confirmation email sent again/);
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('the guard shows the panel when signed out and the surface when signed in', async () => {
  const dom = installDom();
  try {
    const { AuthProvider } = await import('../src/auth/AuthProvider.tsx');
    const { default: RequireAuth } = await import('../src/auth/RequireAuth.tsx');
    const { client } = createFakeClient();

    const app = await mount((React) =>
      React.createElement(
        AuthProvider,
        { createClient: async () => client },
        React.createElement(
          RequireAuth,
          null,
          React.createElement('p', null, 'SECRET WORKSPACE CONTENT'),
        ),
      ),
    );
    await settle(app.act, 60);

    assert.doesNotMatch(app.text(), /SECRET WORKSPACE CONTENT/, 'content is not rendered');
    assert.ok(document.querySelector('input[type="email"]'), 'sign-in form is shown instead');

    await type(app.act, document.querySelector('input[type="email"]'), 'ada@example.com');
    await type(app.act, document.querySelector('input[type="password"]'), 'correct horse battery');
    await submit(app.act, document.querySelector('form'));
    await settle(app.act, 40);

    assert.match(app.text(), /SECRET WORKSPACE CONTENT/, 'content renders once signed in');
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('device preferences are mirrored to the profile on sign-in (device wins)', async () => {
  const dom = installDom();
  try {
    const { AuthProvider, useAuth } = await import('../src/auth/AuthProvider.tsx');
    const { client, state } = createFakeClient();
    window.localStorage.setItem('nova_theme', 'light');
    window.localStorage.setItem('i18nextLng', 'si');
    window.localStorage.setItem('nova_sidebar_collapsed', 'true');

    let snapshot = null;
    function Probe() {
      snapshot = useAuth();
      return null;
    }
    const React = (await import('react')).default;

    const app = await mount((R) =>
      R.createElement(
        AuthProvider,
        { createClient: async () => client },
        R.createElement(Probe),
      ),
    );
    await settle(app.act, 60);

    // Sign in by emitting the auth event the client would emit.
    await app.act(async () => {
      for (const listener of state.listeners) {
        listener('SIGNED_IN', {
          user: { id: 'user-1', email: 'ada@example.com', email_confirmed_at: '2026-01-01T00:00:00.000Z' },
        });
      }
    });
    await settle(app.act, 60);

    const mirror = state.profileUpdates.at(-1);
    assert.ok(mirror, 'a profile update was issued');
    assert.equal(mirror.theme, 'light');
    assert.equal(mirror.locale, 'si');
    assert.equal(mirror.sidebar_collapsed, true);
    assert.equal(snapshot.profile.theme, 'light');
    await app.unmount();
  } finally {
    dom.window.close();
  }
});

test('the panel is fully translated in Sinhala and Tamil', async () => {
  const dom = installDom();
  try {
    const { AuthProvider } = await import('../src/auth/AuthProvider.tsx');
    const { default: AuthPanel } = await import('../src/auth/AuthPanel.tsx');
    const { client } = createFakeClient();

    const app = await mount((React) =>
      React.createElement(
        AuthProvider,
        { createClient: async () => client },
        React.createElement(AuthPanel),
      ),
    );
    await settle(app.act, 60);

    await app.act(async () => {
      await app.i18n.changeLanguage('si');
    });
    assert.match(app.text(), /පුරනය වන්න/);
    assert.match(app.text(), /මුරපදය/);

    await app.act(async () => {
      await app.i18n.changeLanguage('ta');
    });
    assert.match(app.text(), /உள்நுழையவும்/);
    assert.match(app.text(), /கடவுச்சொல்/);
    assert.doesNotMatch(app.text(), /Sign in to NOVA/);

    await app.act(async () => {
      await app.i18n.changeLanguage('en');
    });
    await app.unmount();
  } finally {
    dom.window.close();
  }
});
