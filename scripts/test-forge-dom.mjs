/**
 * NOVA HYPOTHESIS FORGE — rendering test in jsdom.
 *
 * This is not a copy test: the payloads fed to the mounted React surface are
 * produced by the *real* investigation engine (`interpretQuestion` →
 * `investigate`) against the synthetic fixtures in scripts/fixtures/forge/. Only
 * the network boundary is replaced, so the assertions below prove that the
 * surface renders real evidence, real statistics and real provenance.
 *
 * Covered:
 *  - the investigation workspace, example question and interpretation panel;
 *  - hypothesis explorer with falsification criteria;
 *  - running an investigation and landing on the analysis section;
 *  - evidence, counter-evidence, passport and history sections;
 *  - the passport/history artefacts written to device storage;
 *  - Sinhala and Tamil rendering of the workspace chrome.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-forge-dom.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: 'http://localhost/chat',
    pretendToBeVisual: false,
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
  window.Element.prototype.scrollIntoView = () => {};
  // jsdom has no layout: give charts a deterministic box so Recharts can paint.
  window.Element.prototype.getBoundingClientRect = () => ({
    width: 720,
    height: 300,
    top: 0,
    left: 0,
    right: 720,
    bottom: 300,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  class ResizeObserverStub {
    constructor(callback) {
      this.callback = callback;
    }
    observe(target) {
      const entry = {
        target,
        contentRect: { width: 720, height: 300, top: 0, left: 0, right: 720, bottom: 300, x: 0, y: 0 },
        borderBoxSize: [{ inlineSize: 720, blockSize: 300 }],
        contentBoxSize: [{ inlineSize: 720, blockSize: 300 }],
      };
      this.callback([entry], this);
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
    ResizeObserver: ResizeObserverStub,
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

const fixture = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/forge/${name}`, import.meta.url), 'utf8'));

const FIXTURE_BY_URL = [
  [/products\/noaa-planetary-k-index\.json/, 'noaa-kp.json'],
  [/solar-wind\/mag-1-day\.json/, 'solar-wind-mag.json'],
  [/solar-wind\/plasma-1-day\.json/, 'solar-wind-plasma.json'],
  [/DONKI\/notifications/, 'donki-notifications.json'],
  [/DONKI\/CME/, 'donki-cme.json'],
  [/power\.larc\.nasa\.gov/, 'power.json'],
  [/neo\/rest\/v1\/feed/, 'neows.json'],
  [/satellites\/25544\/tles/, 'tle.json'],
  [/planetary\/apod/, 'apod.json'],
  [/mars-photos/, 'mars-photos.json'],
];

function fixtureFetch(url) {
  const match = FIXTURE_BY_URL.find(([pattern]) => pattern.test(String(url)));
  if (!match) return Promise.resolve(new Response('{"error":"unknown fixture"}', { status: 404 }));
  return Promise.resolve(
    new Response(JSON.stringify(fixture(match[1])), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

const NOW = () => new Date('2024-05-12T00:00:00Z');
const QUESTION = 'Did a solar storm influence the geomagnetic environment in May 2024?';

const payloads = await (async () => {
  const { interpretQuestion, investigate, cataloguePayload } = await import('../server/forge/investigate.ts');
  const dependencies = { fetchImpl: fixtureFetch, now: NOW, nasaKey: 'DEMO_KEY', cache: new Map() };
  const interpretation = interpretQuestion({ question: QUESTION, language: 'en', now: NOW(), nasaKey: 'DEMO_KEY' });
  const investigation = await investigate({ question: QUESTION, language: 'en', dependencies });
  return { interpretation, investigation, catalogue: cataloguePayload('DEMO_KEY') };
})();

test('the forge surface is wired into the NOVA chat as a second mode', () => {
  const source = fs.readFileSync(new URL('../src/workspace/chat/ChatSurface.tsx', import.meta.url), 'utf8');
  assert.match(source, /import ForgeSurface from '\.\.\/\.\.\/features\/hypothesis-forge\/ForgeSurface'/);
  assert.match(source, /mode === 'forge'/);
  assert.match(source, /setMode\('chat'\)/);
  assert.match(source, /hfModeInvestigate/);
  // The chat engine itself must be left untouched.
  assert.match(source, /sendChat/);
});

test('investigation workspace, hypotheses and analysis render real results', async () => {
  installDom();
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const i18n = (await import('../src/i18n.ts')).default;
  const ForgeSurface = (await import('../src/features/hypothesis-forge/ForgeSurface.tsx')).default;

  await i18n.changeLanguage('en');
  window.localStorage.clear();

  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    const body = init?.body ? JSON.parse(init.body) : null;
    if (String(url).includes('/api/forge/catalogue')) {
      return new Response(JSON.stringify({ ok: true, ...payloads.catalogue }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (String(url).includes('/api/forge/interpret')) {
      return new Response(JSON.stringify({ ok: true, ...payloads.interpretation }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (String(url).includes('/api/forge/investigate')) {
      assert.equal(body.question, QUESTION, 'the surface sent the interpreted question');
      return new Response(JSON.stringify({ ok: true, investigation: payloads.investigation }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const container = document.getElementById('root');
  const root = createRoot(container);
  const text = () => container.textContent ?? '';
  const flush = async (ms = 0) =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  const waitFor = async (predicate, label, timeout = 6000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (predicate()) return;
      await flush(25);
    }
    throw new Error(`timed out waiting for ${label}\n---\n${text().slice(0, 2000)}`);
  };
  const buttonByText = (label) =>
    [...container.querySelectorAll('button')].find((button) => (button.textContent ?? '').trim() === label);

  await act(async () => {
    root.render(
      React.createElement(I18nextProvider, { i18n }, React.createElement(ForgeSurface)),
    );
  });

  // Let the catalogue request settle inside act().
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  // The workspace explains itself and cannot claim proof.
  assert.match(text(), /NOVA Hypothesis Forge/);
  assert.match(text(), /plan the investigation, retrieve real NASA and NOAA observations/i);
  assert.match(text(), /not by a language model/i);

  // Choosing the built-in example asks for an interpretation.
  const example = buttonByText(i18n.t('hfExample1'));
  assert.ok(example, 'example question button rendered');
  await act(async () => {
    example.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await waitFor(() => text().includes(payloads.interpretation.hypotheses[0].statement), 'hypotheses');

  assert.ok(calls.some((url) => url === '/api/forge/interpret'));
  assert.match(text(), /Falsification criteria/i);
  assert.ok(text().includes(payloads.interpretation.hypotheses[0].falsificationCriteria[0]));

  // Run the investigation from the hypothesis explorer.
  const investigate = buttonByText(i18n.t('hfInvestigateThis'));
  assert.ok(investigate, 'investigate button rendered');
  await act(async () => {
    investigate.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  const correlation = payloads.investigation.analyses.find((analysis) => analysis.method === 'correlation');
  await waitFor(() => text().includes(correlation.methodLabel), 'analysis section');

  // Deterministic numbers from the engine are shown, not invented text.
  assert.ok(text().includes(String(correlation.sampleSize)), 'sample size rendered');
  assert.equal(payloads.investigation.version, 'forge/1');
  assert.ok(container.querySelector('.forge-graph svg'), 'hypothesis relationship graph rendered');
  assert.ok(container.querySelector('figure'), 'chart frame rendered');
  await flush(50);
  assert.ok(container.querySelectorAll('.recharts-surface').length >= 3, 'recharts surfaces mounted (time series, scatter, lag)');

  // Evidence laboratory.
  const evidenceTab = [...container.querySelectorAll('[role="tab"]')].find(
    (tab) => (tab.textContent ?? '').includes(i18n.t('hfTabEvidence')),
  );
  await act(async () => {
    evidenceTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  const linked = payloads.investigation.evidence.find((item) => item.hypothesisIds.length > 0);
  assert.ok(linked, 'fixture investigation produced hypothesis-linked evidence');
  await waitFor(() => text().includes(linked.rule), 'evidence rule');

  // Counter-evidence centre.
  const counterTab = [...container.querySelectorAll('[role="tab"]')].find(
    (tab) => (tab.textContent ?? '').includes(i18n.t('hfTabCounter')),
  );
  await act(async () => {
    counterTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await waitFor(() => text().includes(payloads.investigation.counterEvidence.findings[0].title), 'counter-evidence');

  // Evidence Passport.
  const passportTab = [...container.querySelectorAll('[role="tab"]')].find(
    (tab) => (tab.textContent ?? '').includes(i18n.t('hfTabPassport')),
  );
  await act(async () => {
    passportTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await waitFor(() => text().includes(payloads.investigation.id), 'passport');
  assert.match(text(), /not a peer-reviewed publication/i);

  // Research history persisted on this device only.
  const historyTab = [...container.querySelectorAll('[role="tab"]')].find(
    (tab) => (tab.textContent ?? '').includes(i18n.t('hfTabHistory')),
  );
  await act(async () => {
    historyTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await waitFor(() => text().includes(QUESTION), 'history entry');
  const stored = JSON.parse(window.localStorage.getItem('nova_forge_memory_v1') ?? 'null');
  assert.equal(stored.version, 1);
  assert.equal(stored.investigations[0].id, payloads.investigation.id);
  assert.match(text(), /device/i);

  await act(async () => root.unmount());
  container.innerHTML = '';
});

test('the workspace chrome renders in Sinhala and Tamil', async () => {
  installDom();
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const i18n = (await import('../src/i18n.ts')).default;
  const ForgeSurface = (await import('../src/features/hypothesis-forge/ForgeSurface.tsx')).default;
  const { hypothesisForgeCopy } = await import('../src/i18n/hypothesisForge.ts');

  globalThis.fetch = async (url) => {
    if (String(url).includes('/api/forge/catalogue')) {
      return new Response(JSON.stringify({ ok: true, ...payloads.catalogue }), { status: 200 });
    }
    throw new Error('the language smoke test should not request data');
  };

  for (const language of ['si', 'ta']) {
    await i18n.changeLanguage(language);
    const container = document.getElementById('root');
    container.innerHTML = '';
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(ForgeSurface)));
    });
    const text = container.textContent ?? '';
    assert.ok(text.includes(hypothesisForgeCopy[language].hfTabWorkspace), `${language} workspace tab`);
    assert.ok(text.includes(hypothesisForgeCopy[language].hfTabPassport), `${language} passport tab`);
    assert.ok(text.includes(hypothesisForgeCopy[language].hfHonesty), `${language} honesty note`);
    assert.ok(!text.includes(hypothesisForgeCopy.en.hfHonesty), `${language} did not fall back to English`);
    await act(async () => root.unmount());
  }

  await i18n.changeLanguage('en');
});
