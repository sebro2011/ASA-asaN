/**
 * Astronomy modules — the record store and the rendered surfaces.
 *
 * The point of these checks is that the modules are real: a record typed into
 * the form is the record that is stored, the number Orbit Lab prints comes from
 * the formula it prints beside it, and a refused file is refused with a reason.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-workspace-modules.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

let dom;
let window;

function installDom() {
  dom = new JSDOM('<!doctype html><html lang="en"><body><div id="root"></div></body></html>', {
    url: 'http://localhost/workspace',
    pretendToBeVisual: false,
  });
  window = dom.window;
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
    Blob: window.Blob,
    File: window.File,
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
  window.localStorage.clear();
  window.sessionStorage.clear();
  return dom;
}

async function settle(act, ms = 40) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function mount(Component) {
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const { default: i18n } = await import('../src/i18n.ts');
  document.getElementById('root').innerHTML = '';
  const root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(Component)));
  });
  await settle(act, 80);
  return {
    act,
    text: () => document.getElementById('root').textContent || '',
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

async function typeInto(act, element, value) {
  await act(async () => {
    const prototype =
      element.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : element.tagName === 'SELECT'
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
    setter.call(element, value);
    element.dispatchEvent(new window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

async function submit(act, form) {
  await act(async () => {
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  });
  await settle(act, 60);
}

async function click(act, element) {
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await settle(act, 60);
}

const button = (label) =>
  [...document.querySelectorAll('button')].find((node) => (node.textContent || '').trim() === label);

/* ---------------------------------------------------------------- the store */

test('store: a saved record is the record that reads back', async () => {
  installDom();
  const { readRecords, saveRecord, recordsFor, deleteRecord, clearModule } = await import(
    '../src/workspace/modules/records.ts'
  );

  const first = saveRecord('missions', { name: 'Artemis III', status: 'planned' });
  assert.equal(first.saved, true);
  const all = readRecords();
  assert.equal(all.length, 1);
  assert.equal(all[0].data.name, 'Artemis III');
  assert.equal(all[0].module, 'missions');
  assert.equal(all[0].id, first.record.id);

  const stored = recordsFor('missions');
  assert.equal(stored.length, 1);
  assert.equal(stored[0].data.status, 'planned');

  // Updating keeps the id and the creation timestamp.
  await new Promise((resolve) => setTimeout(resolve, 5));
  const updated = saveRecord('missions', { name: 'Artemis III', status: 'active' }, { id: first.record.id });
  assert.equal(updated.record.id, first.record.id);
  assert.equal(updated.record.createdAt, first.record.createdAt);
  assert.notEqual(updated.record.updatedAt, first.record.updatedAt);
  assert.equal(readRecords().length, 1);
  assert.equal(recordsFor('missions')[0].data.status, 'active');

  // Modules do not see each other's records.
  saveRecord('logs', { target: 'M42' });
  assert.equal(recordsFor('missions').length, 1);
  assert.equal(recordsFor('logs').length, 1);

  assert.equal(deleteRecord(first.record.id), true);
  assert.equal(recordsFor('missions').length, 0);
  assert.equal(deleteRecord('missing-id'), true, 'deleting an unknown id is not an error');

  assert.equal(clearModule('logs'), true);
  assert.equal(readRecords().length, 0);
});

test('store: corrupt or hostile payloads are ignored, not trusted', async () => {
  installDom();
  const { readRecords, RECORDS_STORAGE_KEY, saveRecord, recordsFor } = await import(
    '../src/workspace/modules/records.ts'
  );

  window.localStorage.setItem(RECORDS_STORAGE_KEY, 'not json at all');
  assert.deepEqual(readRecords(), []);

  window.localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify({ version: 99, records: [{ id: 'x' }] }));
  assert.deepEqual(readRecords(), [], 'an unknown store version is discarded');

  const good = saveRecord('plan', { title: 'Orion night', date: '2026-01-03' }).record;
  const payload = JSON.parse(window.localStorage.getItem(RECORDS_STORAGE_KEY));
  payload.records.push({ id: 'bad', module: 'nope', createdAt: 'x', updatedAt: 'y', data: {} });
  payload.records.push({ ...good, id: 'bad-2', module: 'plan', createdAt: 'x' });
  payload.records.push({ ...good, id: 'bad-3', data: { title: 42 } });
  window.localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(payload));
  const survivors = recordsFor('plan');
  assert.equal(survivors.length, 1);
  assert.equal(survivors[0].id, good.id);
});

test('store: an over-long value is capped, and a blocked store reports failure', async () => {
  installDom();
  const { saveRecord, recordsFor, RECORDS_STORAGE_KEY, writeRecords } = await import(
    '../src/workspace/modules/records.ts'
  );

  saveRecord('journal', { title: 'Long entry', body: 'a'.repeat(50_000) });
  const stored = recordsFor('journal')[0];
  assert.equal(stored.data.body.length, 20_000);

  // jsdom exposes Storage through a proxy, so the failure has to be installed
  // on the prototype: this is the browser's real quota / private-mode failure.
  const storagePrototype = Object.getPrototypeOf(window.localStorage);
  const originalSetItem = storagePrototype.setItem;
  storagePrototype.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  try {
    assert.equal(writeRecords([]), false);
    const failed = saveRecord('journal', { title: 'Blocked' });
    assert.equal(failed.saved, false, 'a write that throws is reported, not hidden');
  } finally {
    storagePrototype.setItem = originalSetItem;
  }
  assert.ok(window.localStorage.getItem(RECORDS_STORAGE_KEY));
});

/* -------------------------------------------------------------- the surfaces */

test('missions: an empty module says so, and a submitted record appears', async () => {
  installDom();
  const { MissionsSurface } = await import('../src/workspace/modules/surfaces.tsx');
  const { readRecords } = await import('../src/workspace/modules/records.ts');
  const app = await mount(MissionsSurface);

  assert.match(app.text(), /No records yet\./);
  assert.doesNotMatch(app.text(), /Not available yet/);

  await click(app.act, button('New record'));
  const form = document.querySelector('form');
  assert.ok(form, 'the new-record form opens');

  // Saving an empty required field is refused with the field's own name.
  await submit(app.act, form);
  assert.match(app.text(), /Mission name is required\./);
  assert.equal(readRecords().length, 0);

  const fieldFor = (label) => {
    const node = [...document.querySelectorAll('label')].find((entry) => (entry.textContent || '').startsWith(label));
    assert.ok(node, `field "${label}" exists`);
    return document.getElementById(node.getAttribute('for'));
  };
  await typeInto(app.act, fieldFor('Mission name'), 'Artemis III');
  await typeInto(app.act, fieldFor('Agency'), 'NASA');
  await submit(app.act, form);

  assert.match(app.text(), /Artemis III/);
  assert.match(app.text(), /NASA/);
  const records = readRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0].data.name, 'Artemis III');
  assert.equal(records[0].data.agency, 'NASA');
  assert.equal(records[0].module, 'missions');

  // Deleting asks first and then really removes the record.
  await click(app.act, document.querySelector('button[aria-label="Delete"]'));
  assert.match(app.text(), /Delete this record\?/);
  await click(app.act, button('Delete'));
  assert.equal(readRecords().length, 0);
  assert.match(app.text(), /No records yet\./);

  await app.unmount();
});

test('orbit lab: the printed period matches the printed formula', async () => {
  installDom();
  const { default: OrbitLabSurface } = await import('../src/workspace/modules/OrbitLabSurface.tsx');
  const { orbitalPeriodDays, formatPeriod, CENTRAL_BODIES } = await import('../src/workspace/modules/astronomy.ts');
  const app = await mount(OrbitLabSurface);

  assert.match(app.text(), /Semi-major axis \(km\)/);
  await submit(app.act, document.querySelector('form'));
  const leo = formatPeriod(orbitalPeriodDays(7000, CENTRAL_BODIES.earth.mu));
  assert.match(app.text(), new RegExp(`${leo.value} ${leo.unit}`));
  assert.match(app.text(), /T = 2π √\(a³\/μ\)/);
  assert.match(app.text(), /km\/s/);

  // Geostationary radius: one sidereal day, from the same function the UI calls.
  const expected = orbitalPeriodDays(42164, CENTRAL_BODIES.earth.mu);
  await typeInto(app.act, document.querySelector('#nova-orbit-value'), '42164');
  await submit(app.act, document.querySelector('form'));
  const geo = formatPeriod(expected);
  assert.match(app.text(), new RegExp(`${geo.value} ${geo.unit}`));
  assert.doesNotMatch(app.text(), /NaN|Infinity/);

  // Switching to altitude adds the body radius before the maths runs.
  const altitudeRadio = [...document.querySelectorAll('input[type="radio"]')][1];
  await click(app.act, altitudeRadio);
  assert.match(app.text(), /Altitude \(km\)/);
  await typeInto(app.act, document.querySelector('#nova-orbit-value'), '0');
  await submit(app.act, document.querySelector('form'));
  const seaLevel = orbitalPeriodDays(CENTRAL_BODIES.earth.radius, CENTRAL_BODIES.earth.mu);
  const surface = formatPeriod(seaLevel);
  assert.match(app.text(), new RegExp(`${surface.value} ${surface.unit}`));

  // Invalid input is refused rather than producing a number.
  await typeInto(app.act, document.querySelector('#nova-orbit-value'), '-4');
  await submit(app.act, document.querySelector('form'));
  assert.match(app.text(), /Enter a positive number/);
  assert.doesNotMatch(app.text(), /NaN/);

  await app.unmount();
});

test('orbit lab: Ask NOVA hands over the computed numbers', async () => {
  installDom();
  const { default: OrbitLabSurface } = await import('../src/workspace/modules/OrbitLabSurface.tsx');
  const app = await mount(OrbitLabSurface);

  await submit(app.act, document.querySelector('form'));
  await click(app.act, button('Ask NOVA'));

  const queued = window.sessionStorage.getItem('nova_pending_prompt') || '';
  assert.match(queued, /Radius 7000 km|radius 7000 km/);
  assert.match(queued, /circular speed/);
  assert.equal(window.location.pathname, '/chat');
  await app.unmount();
});

test('observing plan: the Moon chip comes from the session date', async () => {
  installDom();
  const { saveRecord } = await import('../src/workspace/modules/records.ts');
  const { moonPhase } = await import('../src/workspace/modules/astronomy.ts');
  saveRecord('plan', {
    title: 'Orion night',
    date: '2026-01-03',
    site: 'Negombo',
    targets: 'M42 | 8in Dob\nM45 | binoculars',
    priority: 'high',
    status: 'planned',
  });

  const { ObservingPlanSurface } = await import('../src/workspace/modules/surfaces.tsx');
  const app = await mount(ObservingPlanSurface);

  const phase = moonPhase('2026-01-03');
  assert.ok(phase);
  assert.match(app.text(), /Orion night/);
  assert.match(app.text(), /Negombo/);
  assert.match(app.text(), /M42/);
  assert.match(app.text(), new RegExp(`${Math.round(phase.illumination * 100)}% illuminated`));
  assert.match(app.text(), /Skipped|Planned/);

  // The stored table rows are the rows the reader typed.
  const rows = [...document.querySelectorAll('.nova-record__table tr')].map((row) => row.textContent);
  assert.equal(rows.length, 2);
  assert.match(rows[0], /M42/);

  await app.unmount();
});

test('star library: pasted text is stored with the bytes it actually has', async () => {
  installDom();
  const { default: StarLibrarySurface } = await import('../src/workspace/modules/StarLibrarySurface.tsx');
  const { recordsFor } = await import('../src/workspace/modules/records.ts');
  const app = await mount(StarLibrarySurface);

  assert.match(app.text(), /No sources yet\./);
  await typeInto(app.act, document.querySelector('#nova-lib-name'), 'M31 notes');
  await typeInto(app.act, document.querySelector('#nova-lib-text'), 'Andromeda: bright core, dust lanes to the north.');
  await click(app.act, button('Add source'));

  const stored = recordsFor('library');
  assert.equal(stored.length, 1);
  assert.equal(stored[0].data.name, 'M31 notes');
  assert.equal(stored[0].data.text, 'Andromeda: bright core, dust lanes to the north.');
  assert.equal(stored[0].data.bytes, String('Andromeda: bright core, dust lanes to the north.'.length));
  assert.match(app.text(), /Andromeda: bright core/);

  // Search that matches nothing says so instead of showing everything.
  await typeInto(app.act, document.querySelector('#nova-lib-search'), 'zzzz');
  assert.match(app.text(), /No record matches that search\./);

  await app.unmount();
});

/* ------------------------------------------------------------ the wiring */

test('every module is live in the navigation model and routed', async () => {
  const { WORKSPACE_NAV, navItemForRoute } = await import('../src/app/navConfig.ts');
  const expected = ['projects', 'documents', 'writing', 'research', 'code', 'knowledge', 'tasks'];
  for (const route of expected) {
    const item = WORKSPACE_NAV.find((entry) => entry.route === route);
    assert.ok(item, `${route} is in the navigation`);
    assert.equal(item.status, 'live', `${route} is live`);
    assert.equal(item.phase, undefined, `${route} no longer carries a phase`);
    assert.equal(navItemForRoute(route)?.route, route);
  }
  assert.equal(WORKSPACE_NAV.filter((entry) => entry.status === 'planned').length, 0);
});

test('module copy exists in English, Sinhala and Tamil', async () => {
  const { workspaceCopy } = await import('../src/i18n/workspaceCopy.ts');
  const keys = Object.keys(workspaceCopy.en);
  for (const key of keys) {
    assert.ok(workspaceCopy.si[key]?.trim(), `${key} is missing Sinhala copy`);
    assert.ok(workspaceCopy.ta[key]?.trim(), `${key} is missing Tamil copy`);
  }
  for (const key of Object.keys(workspaceCopy.si)) assert.ok(key in workspaceCopy.en, `${key} only exists in Sinhala`);
  for (const key of Object.keys(workspaceCopy.ta)) assert.ok(key in workspaceCopy.en, `${key} only exists in Tamil`);

  // The module keys this work depends on must really be there.
  for (const key of [
    'wsModNew',
    'wsModEmpty',
    'wsModSave',
    'wsModAsk',
    'wsLibTextOnly',
    'wsOrbitFormula',
    'wsMoonNew',
    'wsMoonFull',
    'wsBodyEarth',
  ]) {
    for (const lang of ['en', 'si', 'ta']) assert.ok(workspaceCopy[lang][key], `${key} missing in ${lang}`);
  }
});
