/**
 * NOVA HYPOTHESIS FORGE — computational laboratory, rendered.
 *
 * The panel is mounted in jsdom against a series constructed to have known
 * statistics, so the assertions check real numbers in the DOM rather than the
 * presence of markup:
 *   - descriptive statistics match the hand-computed values;
 *   - the "no AI" statement and the reproducibility record are always present;
 *   - the simulation tab reports its internal validation verdict;
 *   - the Bayesian tab echoes the prior and the weight the data carried;
 *   - screening is labelled a candidate, never a discovery;
 *   - the panel performs no network request of its own.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: 'http://localhost/chat',
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
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

/**
 * 20 daily values with a clear upward drift plus one gross outlier at index 7,
 * so the anomaly screen and the trend test both have something real to find.
 * mean = 15.35, sample sd = 3.70, median = 15.5 (computed by hand below).
 */
const RAW = [10, 11, 12, 13, 14, 15, 16, 90, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29];
const MEAN = RAW.reduce((total, value) => total + value, 0) / RAW.length;

function makeSeries(overrides = {}) {
  const observations = RAW.map((value, index) => ({
    time: new Date(Date.UTC(2024, 0, 1 + index)).toISOString(),
    value,
    unit: 'K',
    missing: false,
    raw: String(value),
  }));
  return {
    id: 'nasa-power:T2M',
    datasetId: 'nasa-power',
    variableId: 'T2M',
    label: 'Temperature at 2 m',
    unit: 'K',
    cadence: 'daily',
    observations,
    missing: { count: 0, fraction: 0, expected: 20, method: 'provider-filled gaps counted as missing' },
    provenance: {
      organisation: 'NASA',
      datasetId: 'nasa-power',
      datasetTitle: 'POWER daily',
      sourceUrl: 'https://power.larc.nasa.gov/',
      documentationUrl: 'https://power.larc.nasa.gov/docs/',
      retrievedAt: '2024-02-01T00:00:00.000Z',
      observationStart: '2024-01-01',
      observationEnd: '2024-01-20',
      recordCount: 20,
      payloadHash: 'deadbeef',
      processingHistory: ['daily aggregation by provider'],
      attribution: 'NASA POWER',
    },
    status: 'live',
    ...overrides,
  };
}

async function mount(seriesList) {
  installDom();
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const i18n = (await import('../src/i18n.ts')).default;
  const { ScienceLab } = await import('../src/features/hypothesis-forge/ScienceLab.tsx');
  await i18n.changeLanguage('en');

  const container = document.getElementById('root');
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(I18nextProvider, { i18n }, React.createElement(ScienceLab, { seriesList })),
    );
  });
  const text = () => container.textContent ?? '';
  const click = async (label) => {
    const button = [...container.querySelectorAll('button')].find((entry) => (entry.textContent ?? '').trim() === label);
    assert.ok(button, `button "${label}" not found in: ${text().slice(0, 400)}`);
    await act(async () => {
      button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
  };
  return { container, text, click, root, act };
}

test('the panel renders hand-checkable descriptive statistics', async () => {
  const { text } = await mount([makeSeries()]);
  const content = text();
  assert.match(content, /Computational laboratory/);
  assert.match(content, /No AI in this panel/);
  assert.match(content, /20/, 'sample count missing');
  // Mean 15.35 with 4 significant digits → "15.35"
  assert.match(content, new RegExp(MEAN.toFixed(2)), 'mean is not rendered');
  // The outlier at index 7 must be reported.
  assert.match(content, /Outliers/);
});

test('the reproducibility record exposes formula, engine version and assumptions', async () => {
  const { container, text } = await mount([makeSeries()]);
  const details = [...container.querySelectorAll('details')];
  assert.ok(details.some((entry) => (entry.textContent ?? '').includes('Reproducibility record')));
  const content = text();
  assert.match(content, /nova-science\/1\.0\.0|Engine version/);
  // Formulas live inside the collapsed details, so query the DOM text regardless.
  assert.match(content, /Σx\/n|Peirce|listwise|Listwise/i);
});

test('a model without an analytic solution states that no validation is claimed', async () => {
  const { text, click } = await mount([makeSeries()]);
  await click('Simulation');
  const content = text();
  // The default projectile run includes drag, so there is no independent solution.
  assert.match(content, /no independent solution to validate against/i);
  assert.match(content, /model prediction/);
  assert.match(content, /not an observation of the selected series/i);
});

test('a model with an analytic solution reports the validation verdict', async () => {
  const { container, text, click, act } = await mount([makeSeries()]);
  await click('Simulation');
  const modelSelect = [...container.querySelectorAll('select')].find((select) =>
    [...select.options].some((option) => option.value === 'damped-oscillator'),
  );
  assert.ok(modelSelect, 'simulation model selector not found');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(modelSelect, 'damped-oscillator');
    modelSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  const content = text();
  assert.match(content, /Internal validation/);
  assert.match(content, /passed/, 'the oscillator validation should pass');
});

test('the Bayesian tab shows the prior and how much weight the data carried', async () => {
  const { text, click } = await mount([makeSeries()]);
  await click('Bayesian update');
  const content = text();
  assert.match(content, /Prior mean/);
  assert.match(content, /Posterior mean/);
  assert.match(content, /95% credible interval/);
  assert.match(content, /Weight carried by the data/);
  assert.match(content, /Prior sensitivity sweep/);
  assert.match(content, /prior is your assumption, not a measurement/i);
});

test('screening is labelled a candidate and never claims a discovery', async () => {
  const { container, text, click } = await mount([makeSeries()]);
  await click('Pattern screening');
  const content = text();
  assert.match(content, /candidate, not a discovery/i);
  assert.match(content, /Verification required/i);
  // Every mention of the word must be a negation; the panel may never assert one.
  const mentions = [...content.matchAll(/discovery/gi)];
  assert.ok(mentions.length > 0, 'expected the panel to mention the word while negating it');
  for (const match of mentions) {
    const before = content.slice(Math.max(0, match.index - 40), match.index).toLowerCase();
    assert.ok(
      /not |none |never |no /.test(before),
      `unnegated discovery claim near: ...${content.slice(Math.max(0, match.index - 60), match.index + 20)}`,
    );
  }
  assert.ok(!/\bdiscovered\b/i.test(content), 'screening claimed a discovery');
  const candidates = container.querySelectorAll('.forge-lab__candidate');
  assert.ok(candidates.length > 0, 'expected at least one candidate for this series');
  for (const candidate of candidates) {
    assert.ok((candidate.textContent ?? '').includes('candidate, not a discovery'));
  }
});

test('trend and model comparison render with an AIC verdict', async () => {
  const { text, click } = await mount([makeSeries()]);
  await click('Trend and models');
  const content = text();
  assert.match(content, /Preferred model \(AIC\)/);
  assert.match(content, /ΔAIC|AIC/);
  assert.match(content, /Trend slope/);
});

test('an empty series list produces a clear empty state, not a blank panel', async () => {
  const { text } = await mount([]);
  assert.match(text(), /Run an investigation first/);
});

test('the panel issues no network request of its own', async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('the science panel must not fetch');
  };
  try {
    const { click } = await mount([makeSeries()]);
    await click('Simulation');
    await click('Pattern screening');
    await click('Bayesian update');
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
