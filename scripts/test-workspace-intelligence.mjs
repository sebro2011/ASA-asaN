/**
 * NOVA Intelligence surface — rendering against the real API contract.
 *
 * `fetch` is stubbed with payloads shaped exactly like the engine's responses, so
 * the test fails if the surface starts showing values the API does not return or
 * if an error code is swallowed.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-workspace-intelligence.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

function installDom() {
  const dom = new JSDOM('<!doctype html><html lang="en"><body><div id="root"></div></body></html>', {
    url: 'http://localhost/intelligence',
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
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

const STATUS = {
  name: 'NOVA NEXUS',
  architecture: 'NOVA L.I.F.E. — Local Intelligence, Feedback & Evolution',
  version: 1,
  schemaVersion: 1,
  storage: { engine: 'sqlite', fts: true, path: 'local file', ephemeral: true },
  mode: { localOnly: true, executionEnabled: false },
  hardware: { id: 'balanced', label: 'Balanced', contextTokens: 8192, maxConcurrentModels: 1, notes: [] },
  providers: { total: 5, localConfigured: 1, cloudConfigured: 0 },
  counts: { memories: 3, tasks: 2, skills: 1, activeSkills: 1, experiences: 2, verifications: 2, auditEvents: 4 },
  permissions: [],
  graph: { edges: 2, byRelation: {} },
  tools: [],
};

const MEMORY = {
  counts: { total: 1, byCategory: { semantic: 1 } },
  categories: ['working', 'episodic', 'semantic', 'procedural', 'personal'],
  retention: { working: 7, episodic: 180 },
  memories: [
    {
      id: 'mem-1',
      category: 'semantic',
      title: 'Moon phase geometry',
      body: 'The phase follows the Sun-Earth-Moon angle.',
      language: 'en',
      tags: [],
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: null,
    },
  ],
};

const SKILLS = {
  states: ['draft', 'sandbox_testing', 'verification', 'user_approval', 'active'],
  skills: [
    {
      id: 'skill-1',
      name: 'File inventory',
      description: 'List the project files.',
      status: 'verification',
      currentVersion: 1,
      versionCount: 1,
      permissions: ['tools.read'],
    },
  ],
};

const HEALTH = {
  localOnly: true,
  localAvailable: false,
  checkedAt: '2026-01-01T00:00:00.000Z',
  providers: [
    { id: 'ollama', label: 'Ollama', kind: 'local', status: 'error', ok: false, latencyMs: 3, models: [], detail: 'ECONNREFUSED' },
    { id: 'gemini', label: 'Google Gemini', kind: 'cloud', status: 'blocked', ok: false, latencyMs: null, models: [], detail: 'LOCAL_ONLY' },
  ],
};

const BENCH = {
  runId: 'bench-1',
  measuredAt: '2026-01-01T00:00:00.000Z',
  total: 7,
  passed: 7,
  byLanguage: { en: { total: 2, passed: 2, latencyMs: 1.2 }, si: { total: 2, passed: 2, latencyMs: 0.8 } },
  results: [
    { caseId: 'lang-en', name: 'English detected', language: 'en', passed: true, latencyMs: 0.4, detail: 'detected en' },
  ],
};

function stubFetch({ failStatus = false, calls = [] } = {}) {
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: { get: () => 'application/json' } });

    if (url.endsWith('/status')) {
      return failStatus ? json({ error: 'Engine offline', code: 'LIFE_ENGINE_OFFLINE' }, 503) : json(STATUS);
    }
    if (url.includes('/memory/search')) return json({ query: 'phase', strategy: 'fts', results: [] });
    if (url.includes('/memory')) return json(MEMORY);
    if (url.endsWith('/tasks') && (init.method || 'GET') === 'GET') return json({ tasks: [] });
    if (url.endsWith('/skills')) return json(SKILLS);
    if (url.endsWith('/experiences')) return json({ experiences: [] });
    if (url.endsWith('/verifications')) return json({ verifications: [] });
    if (url.includes('/providers/health')) return json(HEALTH);
    if (url.endsWith('/config')) return json({ localOnly: true, executionEnabled: false, providers: [], hardware: {} });
    if (url.endsWith('/security/grants')) return json([{ id: 'tools.execute', granted: true }]);
    if (url.endsWith('/security')) {
      return json({
        permissions: [
          { id: 'memory.read', level: 'read', label: 'Read memories', granted: true, requiresApproval: false },
          { id: 'tools.execute', level: 'execute', label: 'Run allowlisted test commands', granted: false, requiresApproval: true },
        ],
        audit: [{ id: 'a1', kind: 'memory.created', severity: 'info', subject: 'mem-1', detail: {}, created_at: '2026-01-01T00:00:00.000Z' }],
        tools: [{ id: 'tests.run', level: 'execute', granted: false, enabled: false }],
        executionEnabled: false,
      });
    }
    if (url.endsWith('/benchmarks')) return json({ dataset: [{ id: 'lang-en', suite: 'language', name: 'English', language: 'en' }], history: [] });
    if (url.endsWith('/benchmarks/run')) return json(BENCH);
    return json({}, 404);
  };
}

async function mount() {
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const { default: i18n } = await import('../src/i18n.ts');
  const { default: IntelligenceSurface } = await import('../src/workspace/intelligence/IntelligenceSurface.tsx');
  document.getElementById('root').innerHTML = '';
  const root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(IntelligenceSurface)));
  });
  const settle = async (ms = 60) =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  await settle(120);
  return {
    act,
    settle,
    text: () => document.getElementById('root').textContent || '',
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

const clickTab = async (app, label) => {
  const tab = [...document.querySelectorAll('[role="tab"]')].find((node) => (node.textContent || '').trim() === label);
  assert.ok(tab, `tab ${label} exists`);
  await app.act(async () => {
    tab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await app.settle(100);
};

test('the overview shows the mode, hardware and counts the API returned', async () => {
  installDom();
  stubFetch();
  const app = await mount();
  try {
    assert.match(app.text(), /NOVA Intelligence/);
    assert.match(app.text(), /LOCAL_ONLY/);
    assert.match(app.text(), /Balanced/);
    assert.match(app.text(), /sqlite/);
    // Counts come from status.counts, not from a hard-coded number.
    assert.match(app.text(), /Memories\s*3/);
    assert.match(app.text(), /Active skills\s*1\/1/);
    // A temp-directory database on a read-only deployment must be labelled.
    assert.match(app.text(), /Temporary storage/);
    assert.equal(document.querySelectorAll('[role="tab"]').length, 8);
  } finally {
    await app.unmount();
  }
});

test('memory and skills panels render real records and honest empty states', async () => {
  installDom();
  stubFetch();
  const app = await mount();
  try {
    await clickTab(app, 'Memory');
    assert.match(app.text(), /Moon phase geometry/);
    assert.match(app.text(), /Semantic/);

    await clickTab(app, 'Skills');
    assert.match(app.text(), /File inventory/);
    assert.match(app.text(), /Current v1/);
    assert.match(app.text(), /Request approval/);

    await clickTab(app, 'Experiences');
    assert.match(app.text(), /No experience recorded yet\./);

    await clickTab(app, 'Verification');
    assert.match(app.text(), /No verification record yet\./);
  } finally {
    await app.unmount();
  }
});

test('models and security panels expose real provider and permission state', async () => {
  installDom();
  const calls = [];
  stubFetch({ calls });
  const app = await mount();
  try {
    await clickTab(app, 'Models & runtime');
    const healthCall = calls.find((call) => call.url.includes('/providers/health'));
    assert.ok(healthCall, 'health was requested');
    assert.match(app.text(), /Ollama/);
    assert.match(app.text(), /blocked/);
    assert.match(app.text(), /Local model available: no/);

    await clickTab(app, 'Security');
    assert.match(app.text(), /tools\.execute/);
    assert.match(app.text(), /needs approval/);
    assert.match(app.text(), /memory\.created/);
    assert.match(app.text(), /disabled/);

    const grantButton = [...document.querySelectorAll('button')].find((node) => (node.textContent || '').trim() === 'Grant');
    assert.ok(grantButton, 'a grant control exists');
    await app.act(async () => {
      grantButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await app.settle(80);
    const grant = calls.find((call) => call.url.endsWith('/security/grants'));
    assert.ok(grant);
    assert.deepEqual(grant.body, { capability: 'tools.execute', granted: true });
  } finally {
    await app.unmount();
  }
});

test('benchmarks run against the API and display measured results', async () => {
  installDom();
  const calls = [];
  stubFetch({ calls });
  const app = await mount();
  try {
    await clickTab(app, 'Benchmarks');
    assert.match(app.text(), /1 reproducible case/);
    const runButton = [...document.querySelectorAll('button')].find((node) => /Run benchmarks/.test(node.textContent || ''));
    assert.ok(runButton);
    await app.act(async () => {
      runButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await app.settle(120);
    assert.ok(calls.some((call) => call.url.endsWith('/benchmarks/run') && call.method === 'POST'));
    assert.match(app.text(), /7 \/ 7 cases passed/);
    assert.match(app.text(), /English detected/);
  } finally {
    await app.unmount();
  }
});

test('a failing engine shows its code, never a fabricated value', async () => {
  installDom();
  stubFetch({ failStatus: true });
  const app = await mount();
  try {
    assert.match(app.text(), /The engine did not answer this request\./);
    assert.match(app.text(), /LIFE_ENGINE_OFFLINE/);
    assert.doesNotMatch(app.text(), /Memories/);
  } finally {
    await app.unmount();
  }
});
