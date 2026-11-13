/**
 * COSMORA API Guardian dashboard — rendered in jsdom.
 *
 * The point of these tests is honesty, not layout: an unprobed provider must not
 * look healthy, an instance-local store must say so, an action must be refused
 * without a token, and a failed read must be shown as a failure.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-guardian-ui.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

function installDom() {
  const dom = new JSDOM('<!doctype html><html lang="en"><body><div id="root"></div></body></html>', {
    url: 'http://localhost/guardian',
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
    dispatchEvent: () => false,
  });
  const globals = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    HTMLSelectElement: window.HTMLSelectElement,
    HTMLInputElement: window.HTMLInputElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    getComputedStyle: window.getComputedStyle,
    requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    matchMedia: window.matchMedia,
    fetch: undefined,
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

const statusPayload = (overrides = {}) => ({
  ok: true,
  instanceId: 'i-1',
  store: {
    kind: 'memory',
    capabilities: { distributed: false, persistent: false, atomicCounters: false, atomicCas: false, atomicLease: false },
    reason: 'SUPABASE_URL is not set — instance-local state only.',
    missing: ['SUPABASE_URL'],
    health: { ok: true },
    describe: { kind: 'memory', keys: 2 },
  },
  providers: [
    {
      id: 'nasa:apod',
      label: 'NASA APOD',
      kind: 'nasa',
      endpoint: 'api.nasa.gov/planetary/apod',
      docsUrl: null,
      requiresEnv: ['NASA_API_KEY'],
      cost: 'metered',
    },
    {
      id: 'earth:power',
      label: 'NASA POWER',
      kind: 'earth',
      endpoint: 'power.larc.nasa.gov',
      docsUrl: null,
      requiresEnv: [],
      cost: 'free',
    },
  ],
  breakers: {
    'nasa:apod': null,
    'earth:power': { state: 'open', failures: 3, degradations: 0, cooldownUntil: 5_000, lastCode: 'UPSTREAM_5XX', lastSuccessAt: null, lastFailureAt: 1_000 },
  },
  lastRun: {
    id: 'run-1',
    startedAt: 1_700_000_000_000,
    finishedAt: 1_700_000_001_000,
    trigger: 'schedule',
    summary: { ok: 1, down: 1, degraded: 0, skipped: 0, incident: true },
  },
  analytics: {
    windowMs: 86_400_000,
    samples: 2,
    runs: 1,
    incidents: 1,
    providers: [
      { providerId: 'nasa:apod', availability: null, p95LatencyMs: null, lastStatus: null, lastSeenAt: null },
      { providerId: 'earth:power', availability: 0, p95LatencyMs: 900, lastStatus: 'down', lastSeenAt: 1_700_000_000_000 },
    ],
  },
  generatedAt: 1_700_000_002_000,
  ...overrides,
});

async function mountSurface({ status = statusPayload(), admin = null, failStatus = false } = {}) {
  installDom();
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url);
    calls.push({ path, headers: init.headers ?? {} });
    const hasToken = Boolean(init.headers && init.headers.Authorization);
    if (path.includes('/api/guardian/status')) {
      if (failStatus) {
        return new Response(JSON.stringify({ ok: false, code: 'GUARDIAN_UNAVAILABLE', error: 'The Guardian could not assemble its status.' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(status), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (path.includes('/api/guardian/config')) {
      if (!hasToken) {
        return new Response(JSON.stringify({ ok: false, code: 'GUARDIAN_LOCKED', error: 'locked' }), { status: 403 });
      }
      return new Response(
        JSON.stringify({
          ok: true,
          env: { set: ['NASA_API_KEY'], missing: ['GEMINI_API_KEY'], total: 2 },
          store: { kind: 'memory', capabilities: { distributed: false }, reason: 'instance-local', missing: [] },
          schedule: { endpoint: '/api/guardian/cron', requiresSecret: 'CRON_SECRET', configured: false, recommended: 'every 10 minutes' },
          adminConfigured: true,
          recoveryActions: [
            { id: 'probe-now', label: 'Probe one provider now', description: 'runs a probe', needsProvider: true, destructive: false },
            { id: 'prune-state', label: 'Prune expired state', description: 'prunes', needsProvider: false, destructive: false },
          ],
          humanOnlyOperations: ['Rotating or replacing a provider API key.'],
          deployment: { environment: 'test', commit: 'abc1234', region: 'iad1' },
          ...admin,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (path.includes('/api/guardian/audit')) {
      if (!hasToken) return new Response(JSON.stringify({ ok: false, code: 'GUARDIAN_LOCKED', error: 'locked' }), { status: 403 });
      return new Response(
        JSON.stringify({
          ok: true,
          entries: [
            { id: 'a1', at: 1_700_000_000_000, actor: 'cron', action: 'sweep-incident', target: 'nasa:apod', severity: 'critical' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ ok: false, code: 'NOT_FOUND' }), { status: 404 });
  };

  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const i18n = (await import('../src/i18n.ts')).default;
  await i18n.changeLanguage('en');
  const { GuardianSurface } = await import('../src/workspace/guardian/GuardianSurface.tsx');

  const container = document.getElementById('root');
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(GuardianSurface)));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

  const flush = async () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
  const text = () => container.textContent ?? '';
  const buttonByText = (label) => [...container.querySelectorAll('button')].find((node) => (node.textContent ?? '').includes(label));
  const typeToken = async (value) => {
    const input = container.querySelector('.gd-token__field input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await flush();
  };

  return { container, text, buttonByText, typeToken, flush, calls, root };
}

test('the dashboard states the health it actually observed, including an incident', async () => {
  const ui = await mountSurface();
  assert.match(ui.text(), /COSMORA API Guardian/);
  assert.match(ui.text(), /Incident/);
  assert.match(ui.text(), /nasa:apod/);
  assert.match(ui.text(), /earth:power/);
  // An open circuit is visible, with the code that opened it.
  assert.match(ui.text(), /open/i);
  assert.match(ui.text(), /UPSTREAM_5XX/);
});

test('an unprobed provider never renders as healthy', async () => {
  const ui = await mountSurface();
  const rows = [...ui.container.querySelectorAll('.gd-table tbody tr')];
  assert.equal(rows.length, 2);
  const apod = rows[0].textContent ?? '';
  assert.match(apod, /no data/i, 'a provider with no sample says "no data"');
  assert.doesNotMatch(apod, /gd-chip--ok/, 'and carries no green chip');
  const power = rows[1].textContent ?? '';
  assert.match(power, /down/i);
  assert.match(power, /0%/);
  assert.match(power, /900 ms/);
});

test('the store card says instance-local instead of implying a fleet', async () => {
  const ui = await mountSurface();
  assert.match(ui.text(), /instance-local only/);
  assert.match(ui.text(), /memory/);
  assert.match(ui.text(), /SUPABASE_URL is not set/, 'the reason is printed, not hidden');
});

test('administrative actions are refused until a token is supplied', async () => {
  const ui = await mountSurface();
  const probe = ui.buttonByText('Probe now');
  assert.ok(probe);
  assert.equal(probe.disabled, true, 'probe is disabled without a token');
  assert.match(ui.text(), /Enter an administrator token/, 'the audit panel explains why it is empty');

  await ui.typeToken('admin-token');
  const enabled = ui.buttonByText('Probe now');
  assert.equal(enabled.disabled, false, 'a token unlocks the action');
  assert.match(ui.text(), /sweep-incident/, 'the audit log becomes readable');
  assert.match(ui.text(), /Rotating or replacing a provider API key/, 'the human-only boundary is shown');
  // The token is sent as a bearer header, never in a URL.
  const authed = ui.calls.filter((call) => call.headers && call.headers.Authorization);
  assert.ok(authed.length >= 2);
  for (const call of ui.calls) assert.doesNotMatch(call.path, /admin-token/);
});

test('a guardian outage is shown as an error, with the code the API returned', async () => {
  const ui = await mountSurface({ failStatus: true });
  assert.match(ui.text(), /The guardian could not be read/);
  assert.match(ui.text(), /GUARDIAN_UNAVAILABLE/);
  assert.doesNotMatch(ui.text(), /Nominal/);
});

test('the metered providers are labelled as metered', async () => {
  const ui = await mountSurface();
  const apodRow = [...ui.container.querySelectorAll('.gd-table tbody tr')][0].textContent ?? '';
  assert.match(apodRow, /metered/i);
  const powerRow = [...ui.container.querySelectorAll('.gd-table tbody tr')][1].textContent ?? '';
  assert.doesNotMatch(powerRow, /metered/i);
});
