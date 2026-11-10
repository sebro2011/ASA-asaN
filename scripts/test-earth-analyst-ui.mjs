/**
 * AI Earth Science Analyst — rendered UI behaviour (jsdom).
 *
 * The panel is mounted for real and its fetch is stubbed, so these assertions are
 * about what a user would actually see:
 *
 *   - a locally computed answer is labelled Local Earth Intelligence and shows no
 *     model pill and no "AI" wording;
 *   - a fallback to an alternative provider names that provider, not Gemini;
 *   - the provider chain lists the failed attempt with its status code;
 *   - nothing renders a spinner after the request has settled.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-earth-analyst-ui.mjs
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

const MONTHS = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06'];

const context = {
  areaLabel: 'Negombo, Sri Lanka',
  latitude: 7.2081,
  longitude: 79.8358,
  dates: ['2026-06-01'],
  layers: [],
  domains: [],
  power: {
    placeLabel: 'Negombo, Sri Lanka',
    latitude: 7.208,
    longitude: 79.836,
    requestedParameters: ['T2M'],
    available: ['T2M'],
    unavailable: [],
    rows: MONTHS.length,
    firstMonth: MONTHS[0],
    lastMonth: MONTHS[MONTHS.length - 1],
    stats: [],
    sourceUrl: 'https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M',
    retrievedAt: '2026-11-08T09:00:00.000Z',
    series: [{ code: 'T2M', unit: '°C', dates: MONTHS, values: MONTHS.map(() => 27.5) }]
  },
  dataGaps: []
};

function installDom() {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: false
  });
  const { window } = dom;
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
    matchMedia: window.matchMedia
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

async function mountPanel(responseBody) {
  installDom();
  const { act } = await import('react');
  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const i18n = (await import('../src/i18n.ts')).default;
  const AnalystPanel = (await import('../src/components/earth/AnalystPanel.tsx')).default;

  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: options?.body });
    if (responseBody instanceof Error) throw responseBody;
    return {
      ok: responseBody.ok !== false,
      status: responseBody.status || 200,
      json: async () => responseBody.body
    };
  };

  const container = document.getElementById('root');
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(
        I18nextProvider,
        { i18n },
        React.createElement(AnalystPanel, { context, lang: 'en', aiCapable: true })
      )
    );
  });

  const type = (value) => {
    const textarea = container.querySelector('#earth-analyst-question');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(textarea, value);
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
  };

  await act(async () => {
    type('What do the retrieved values show?');
  });
  await act(async () => {
    container.querySelector('button[type="submit"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });

  return { container, calls, root };
}

test('a local answer is labelled as local, with no model pill and no AI wording', async () => {
  const { container, calls } = await mountPanel({
    body: {
      ok: true,
      mode: 'local',
      provider: 'local',
      providerLabel: 'Local Earth Intelligence',
      generatedAt: '2026-11-08T09:10:00.000Z',
      attempts: 3,
      retries: 2,
      fallback: true,
      fallbackReason: 'PROVIDER_UNAVAILABLE',
      providerChain: [
        { provider: 'gemini', providerLabel: 'Google Gemini', model: 'gemini-3.8-flash', outcome: 'error', code: 'PROVIDER_UNAVAILABLE', status: 503, attempts: 3, ms: 900 },
        { provider: 'openrouter', providerLabel: 'OpenRouter', outcome: 'skipped', code: 'NOT_CONFIGURED', attempts: 0, ms: 0 }
      ],
      groundedInRetrievedData: true,
      sufficientData: true,
      noticeCode: 'all-providers-unavailable',
      sections: [{ kind: 'derived', title: 'Calculated results', bullets: ['T2M mean 27.5 °C computed from 6 monthly values.'] }],
      sources: [{ label: 'NASA POWER', url: 'https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M' }]
    }
  });

  const text = container.textContent;
  assert.match(text, /Local Earth Intelligence/, 'the true provider must be named');
  assert.equal(/Model:/.test(text), false, 'a local answer must not display a model name');
  assert.match(text, /No AI service could be reached/, 'the all-providers-down notice is shown');
  assert.match(text, /27.5 °C/, 'the computed value is rendered');
  // Spinner must be gone once the request settled.
  assert.equal(container.querySelectorAll('.animate-spin').length, 0);
  // The request carried the retrieved series, not just aggregates.
  const payload = JSON.parse(calls[0].body);
  assert.equal(payload.context.power.series[0].code, 'T2M');
  assert.equal(payload.context.power.series[0].values.length, 6);
});

test('an alternative provider after a Gemini failure is named as the provider that answered', async () => {
  const { container } = await mountPanel({
    body: {
      ok: true,
      mode: 'remote',
      provider: 'openrouter',
      providerLabel: 'OpenRouter',
      model: 'google/gemini-2.0-flash-001',
      generatedAt: '2026-11-08T09:12:00.000Z',
      attempts: 4,
      retries: 2,
      fallback: true,
      fallbackReason: 'PROVIDER_UNAVAILABLE',
      providerChain: [
        { provider: 'gemini', providerLabel: 'Google Gemini', model: 'gemini-3.8-flash', outcome: 'error', code: 'PROVIDER_UNAVAILABLE', status: 503, attempts: 3, ms: 1200 },
        { provider: 'openrouter', providerLabel: 'OpenRouter', model: 'google/gemini-2.0-flash-001', outcome: 'ok', attempts: 1, ms: 800 }
      ],
      groundedInRetrievedData: true,
      noticeCode: 'primary-unavailable',
      sections: [{ kind: 'verified', title: 'Verified observations', bullets: ['The window is 2024-01 to 2024-06.'] }],
      sources: []
    }
  });

  const text = container.textContent;
  assert.match(text, /OpenRouter/, 'the answering provider must be shown');
  assert.match(text, /google\/gemini-2\.0-flash-001/, 'its model id is shown');
  assert.match(text, /primary AI service is temporarily unavailable/i, 'the fallback notice is shown');
  assert.match(text, /2 retry attempt/, 'the retry count is shown');
  assert.match(text, /503/, 'the failed attempt reports its status code');
  assert.equal(/Answered by Gemini/.test(text), false, 'a fallback answer is never presented as Gemini');
});

test('an unreachable API still produces a local answer computed in the browser', async () => {
  const { container } = await mountPanel(new Error('network down'));
  const text = container.textContent;
  assert.match(text, /Local Earth Intelligence is active/);
  assert.match(text, /Study area: Negombo, Sri Lanka/, 'the deterministic engine answered from the bundle');
  assert.equal(container.querySelectorAll('.animate-spin').length, 0, 'no spinner is left running after a failure');
});
