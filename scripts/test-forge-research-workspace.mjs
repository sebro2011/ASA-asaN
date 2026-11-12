/**
 * NOVA FORGE — Research Workspace (user-facing workflows), rendered in jsdom.
 *
 * These tests drive the real components against real `localStorage`: clicks,
 * typing, debounced autosave, lifecycle refusals, version restore, resizing,
 * full-screen mode and the contextual assistant. Only the assistant's HTTP call
 * is stubbed — everything else is the production code path.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import { join, dirname as pathDirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = pathDirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

function installDom() {
  const dom = new JSDOM('<!doctype html><html lang="en"><head></head><body><div id="root"></div></body></html>', {
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
    width: 900,
    height: 400,
    top: 0,
    left: 0,
    right: 900,
    bottom: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const globals = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    HTMLSelectElement: window.HTMLSelectElement,
    HTMLInputElement: window.HTMLInputElement,
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
 * Every tree mounted by these tests is torn down before the next one is built.
 * `installDom` swaps the globals, and a still-mounted tree keeps its debounce
 * timers alive — those timers write through `globalThis.localStorage`, i.e. into
 * the *next* test's window. Unmounting first keeps the tests isolated.
 */
let mountedRoots = [];

async function teardown() {
  if (mountedRoots.length === 0) return;
  const { act } = await import('react');
  for (const root of mountedRoots) {
    try {
      await act(async () => {
        root.unmount();
      });
    } catch {
      /* the old window is already gone */
    }
  }
  mountedRoots = [];
}

async function mountWorkspace(options = {}) {
  await teardown();
  const dom = installDom();
  const { window } = dom;
  // Each jsdom window brings its own storage, so a "previous session" has to be
  // handed over explicitly. Without a seed every test starts from empty.
  window.localStorage.clear();
  for (const [key, value] of Object.entries(options.storage ?? {})) {
    if (typeof value === 'string') window.localStorage.setItem(key, value);
  }
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { I18nextProvider } = await import('react-i18next');
  const i18n = (await import('../src/i18n.ts')).default;
  const { ResearchWorkspace } = await import('../src/features/hypothesis-forge/research/ResearchWorkspace.tsx');
  await i18n.changeLanguage('en');

  const container = document.getElementById('root');
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(ResearchWorkspace)));
  });

  const flush = async (ms = 0) =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });

  const text = () => container.textContent ?? '';
  const byText = (selector, label) =>
    [...container.querySelectorAll(selector)].find((node) => (node.textContent ?? '').trim() === label);
  const byTextContains = (selector, label) =>
    [...container.querySelectorAll(selector)].find((node) => (node.textContent ?? '').includes(label));

  const click = async (node) => {
    assert.ok(node, 'expected a clickable node');
    await act(async () => {
      node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
  };

  const typeInto = async (node, value) => {
    assert.ok(node, 'expected an input');
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set;
    await act(async () => {
      setter.call(node, value);
      node.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  };

  const selectValue = async (node, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    await act(async () => {
      setter.call(node, value);
      node.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
  };

  const createProject = async (name) => {
    await click(byText('button', 'New project'));
    await typeInto(container.querySelector('.fr-nav__create input'), name);
    await click(byText('button', 'Create'));
    await flush(50);
  };

  return { container, window, act, flush, text, byText, byTextContains, click, typeInto, selectValue, createProject, root };
}

const storedProjects = (window) => {
  const raw = window.localStorage.getItem('nova_forge_projects_v1');
  return raw ? JSON.parse(raw).projects : [];
};
const storedProject = (window, title) => {
  const found = storedProjects(window).find((project) => project.title === title);
  assert.ok(found, `expected a stored project titled ${title}`);
  return found;
};

/* --------------------------------- shell --------------------------------- */

test('an empty workspace explains itself and can create a persisted project', async () => {
  const ui = await mountWorkspace();
  assert.match(ui.text(), /Research workspace/);
  assert.match(ui.text(), /No research project yet/);

  await ui.createProject('Solar wind coupling');
  assert.match(ui.text(), /Solar wind coupling/);
  const stored = storedProjects(ui.window);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].title, 'Solar wind coupling');
  assert.equal(stored[0].schemaVersion, 2);
  assert.match(ui.text(), /Saved/);
});

test('typing autosaves to the store and to the draft envelope', async () => {
  const ui = await mountWorkspace();
  await ui.createProject('Autosave project');
  const titleInput = ui.container.querySelector('.fr-panel .fr-field input');
  await ui.typeInto(titleInput, 'Renamed while typing');
  // The debounce is 250 ms: the store is untouched, but the draft already holds
  // the edit, so a crash right now would still lose nothing.
  assert.equal(storedProjects(ui.window)[0].title, 'Autosave project');
  const draft = JSON.parse(ui.window.localStorage.getItem('nova_forge_project_draft_v1'));
  assert.equal(draft.project.title, 'Renamed while typing');

  await ui.flush(400);
  assert.equal(storedProjects(ui.window)[0].title, 'Renamed while typing');
  // Once the write landed the draft is redundant and is cleared, so the next
  // session is not asked to recover something already saved.
  assert.equal(ui.window.localStorage.getItem('nova_forge_project_draft_v1'), null);
});

/* ------------------------------- hypotheses ------------------------------- */

const fillHypothesis = async (ui) => {
  const statement = ui.container.querySelector('.fr-panel .fr-field textarea');
  await ui.typeInto(statement, 'Higher solar wind speed is followed by higher Kp within 6 hours.');
  await ui.flush(320);
};

test('a hypothesis is created as a draft and its lifecycle is gated on content', async () => {
  const ui = await mountWorkspace();
  await ui.createProject('Lifecycle project');
  await ui.click(ui.byText('button', 'Hypotheses'));
  await ui.click(ui.byText('button', 'New hypothesis'));

  assert.match(ui.text(), /Draft/);
  // No lifecycle button may be offered that the model would refuse from a draft.
  const offered = [...ui.container.querySelectorAll('button')]
    .map((node) => (node.textContent ?? '').trim())
    .filter((label) => label.startsWith('Move to'));
  assert.deepEqual(offered.sort(), ['Move to archived', 'Move to needs-evidence', 'Move to testable'].sort());

  // Asking for a state the draft cannot reach must not silently succeed: the
  // lifecycle list itself contains no such button, which is the gate.
  assert.ok(!offered.includes('Move to supported'));

  await fillHypothesis(ui);
  await ui.click(ui.byText('button', 'Move to testable'));
  // Still a draft: statement is set, but methodology, predictions and
  // falsification conditions are empty, so the transition is refused with a reason.
  assert.match(ui.text(), /Blocked/);
  assert.match(ui.text(), /Cannot move to testable: methodology, falsification conditions, predictions must be filled in first/);
});

test('two hypotheses can exist and be compared field by field', async () => {
  const ui = await mountWorkspace();
  await ui.createProject('Compare project');
  await ui.click(ui.byText('button', 'Hypotheses'));
  await ui.click(ui.byText('button', 'New hypothesis'));
  await fillHypothesis(ui);
  await ui.click(ui.byText('button', 'New hypothesis'));
  await ui.click(ui.byText('button', 'Compare hypotheses'));
  await ui.flush(400); // the second hypothesis is inside the autosave debounce
  assert.match(ui.text(), /Field/);
  const rows = ui.container.querySelectorAll('.fr-table--compare tbody tr');
  assert.equal(rows.length, 13, 'all thirteen fields must be compared');
  const stored = storedProjects(ui.window);
  assert.equal(stored[0].hypotheses.length, 2);
});

/* --------------------------------- evidence ------------------------------- */

test('evidence with a malformed DOI is kept but rejected by validation', async () => {
  const ui = await mountWorkspace();
  await ui.createProject('Evidence project');
  await ui.click(ui.byText('button', 'Evidence'));
  const doiInput = ui.container.querySelector('input[placeholder="10.1029/..."]');
  const titleInput = ui.container.querySelector('.fr-panel .fr-field input');
  await ui.typeInto(titleInput, 'A paper I remember');
  await ui.typeInto(doiInput, '10.9999');
  await ui.click(ui.byText('button', 'Add'));
  assert.match(ui.text(), /rejected/);
  assert.match(ui.text(), /not a syntactically valid DOI/);
  assert.match(ui.text(), /A paper I remember/);
});

/* --------------------------------- versions ------------------------------- */

test('a version can be committed and restored without recalculation', async () => {
  const ui = await mountWorkspace();
  await ui.createProject('Versioned project');
  await ui.click(ui.byText('button', 'Versions'));
  await ui.typeInto(ui.container.querySelector('.fr-block input'), 'Initial');
  await ui.click(ui.byText('button', 'Save a version'));
  await ui.flush(50);

  // Change the project after the snapshot.
  await ui.click(ui.byText('button', 'Overview'));
  const titleInput = ui.container.querySelector('.fr-panel .fr-field input');
  await ui.typeInto(titleInput, 'Renamed after the snapshot');
  await ui.flush(350);

  await ui.click(ui.byText('button', 'Versions'));
  await ui.click(ui.byText('button', 'Restore this version'));
  await ui.flush(50);
  assert.match(ui.text(), /nothing was recalculated/i);
  assert.doesNotMatch(ui.text(), /Unknown version id/);
  const stored = storedProject(ui.window, 'Versioned project');
  // The history itself is preserved across the restore.
  assert.equal(stored.versions.length, 1);
  assert.equal(stored.hypotheses.length, 0);
});

test('a draft written just before a crash is offered, and a tampered one is refused', async () => {
  const ui = await mountWorkspace();
  const titleInput = () => ui.container.querySelector('.fr-panel .fr-field input');

  await ui.createProject('Recovery project');
  await ui.flush(400);
  // An edit that never reaches the store (the tab closes inside the 250 ms
  // debounce) leaves a draft behind; unmounting here cancels the timer.
  await ui.typeInto(titleInput(), 'Recovered draft title');
  await ui.flush(40);
  const session = {
    projects: ui.window.localStorage.getItem('nova_forge_projects_v1'),
    draft: ui.window.localStorage.getItem('nova_forge_project_draft_v1'),
  };
  assert.ok(session.draft, 'an unsaved edit must leave a draft behind');
  assert.equal(storedProjects(ui.window)[0].title, 'Recovery project', 'the store still holds the saved title');
  await ui.root.unmount();
  mountedRoots = [];

  // 1. A tampered draft no longer matches the stored snapshot's updatedAt, so it
  //    is refused instead of being half-applied.
  const tampered = JSON.parse(session.draft);
  tampered.project.title = 'Injected without consent';
  // The hash still describes the original content, so `readDraft` must refuse it.
  assert.notEqual(
    (await import('../src/lib/forge/research/project.ts')).projectHash(tampered.project),
    tampered.contentHash,
  );
  const refused = await mountWorkspace({
    storage: {
      nova_forge_projects_v1: session.projects,
      nova_forge_project_draft_v1: JSON.stringify(tampered),
    },
  });
  assert.doesNotMatch(refused.text(), /Injected without consent/);
  assert.match(refused.text(), /Recovery project/);
  assert.equal(storedProjects(refused.window)[0].title, 'Recovery project');
  await refused.root.unmount();
  mountedRoots = [];

  // 2. The genuine draft is offered, and stays unapplied until the user asks.
  const offered = await mountWorkspace({
    storage: {
      nova_forge_projects_v1: session.projects,
      nova_forge_project_draft_v1: session.draft,
    },
  });
  assert.match(offered.text(), /Recovered draft title/);
  assert.equal(storedProjects(offered.window)[0].title, 'Recovery project', 'nothing is applied before the click');
  await offered.click(offered.byText('button', 'Open the draft'));
  await offered.flush(50);
  assert.equal(storedProjects(offered.window)[0].title, 'Recovered draft title');
  assert.equal(offered.window.localStorage.getItem('nova_forge_project_draft_v1'), null);
});

/* ------------------------------ layout controls --------------------------- */

test('the separator is keyboard operable and clamps the panel width', async () => {
  const ui = await mountWorkspace();
  await ui.createProject('Layout project');
  const resizer = ui.container.querySelector('.fr-resizer');
  assert.ok(resizer, 'separator must exist');
  assert.equal(resizer.getAttribute('aria-orientation'), 'vertical');
  const start = Number(resizer.getAttribute('aria-valuenow'));
  resizer.focus();
  await ui.act(async () => {
    resizer.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  assert.equal(Number(resizer.getAttribute('aria-valuenow')), start + 16);
  await ui.act(async () => {
    resizer.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  });
  assert.equal(resizer.getAttribute('aria-valuenow'), resizer.getAttribute('aria-valuemax'));
  // The remembered width is persisted for the next session.
  assert.equal(ui.window.localStorage.getItem('nova_forge_research_nav_width'), resizer.getAttribute('aria-valuemax'));
});

test('full screen toggles an overlay, locks the body and exits on Escape', async () => {
  const ui = await mountWorkspace();
  await ui.createProject('Fullscreen project');
  const shell = ui.container.querySelector('.fr-workspace');
  assert.equal(shell.getAttribute('data-fullscreen'), 'false');
  await ui.click(ui.container.querySelector('button[aria-label="Full screen"]'));
  assert.equal(shell.getAttribute('data-fullscreen'), 'true');
  assert.match(ui.window.document.body.style.overflow, /hidden/);
  await ui.act(async () => {
    ui.window.document.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  assert.equal(shell.getAttribute('data-fullscreen'), 'false');
  assert.doesNotMatch(ui.window.document.body.style.overflow || '', /hidden/);
});

test('the workspace tab strip follows the roving ARIA contract', async () => {
  const ui = await mountWorkspace();
  await ui.createProject('Tabs project');
  const tabs = () => [...ui.container.querySelectorAll('[role="tab"]')];
  assert.equal(tabs().length, 6);
  assert.equal(tabs().filter((tab) => tab.getAttribute('aria-selected') === 'true').length, 1);
  tabs()[0].focus();
  await ui.act(async () => {
    tabs()[0].dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  assert.equal(ui.window.document.activeElement.id, 'fr-tab-hypotheses');
  await ui.act(async () => {
    ui.window.document.activeElement.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  });
  assert.equal(ui.window.document.activeElement.id, 'fr-tab-assistant');
});

/* -------------------------------- assistant ------------------------------- */

test('the assistant sends only the bounded context and renders a local brief honestly', async () => {
  const ui = await mountWorkspace();
  await ui.createProject('Assistant project');
  await ui.click(ui.byText('button', 'Research assistant'));

  const bodies = [];
  globalThis.fetch = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(
      JSON.stringify({
        ok: true,
        mode: 'local',
        noticeCode: 'local-mode',
        providerLabel: 'Local deterministic brief',
        brief: {
          mode: 'local',
          summary: 'Deterministic summary of the recorded project.',
          sections: [{ title: 'What is missing', lines: ['No dataset snapshot is pinned.'] }],
          citations: [],
          caveat: 'This is a deterministic summary of the fields you entered, not a model response.',
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const textarea = ui.container.querySelector('.fr-panel textarea');
  await ui.typeInto(textarea, 'What is missing from this project?');
  await ui.click(ui.byText('button', 'Ask about this project'));
  await ui.flush(50);

  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].context.version, 'research-context/1');
  assert.equal(bodies[0].context.projectId, bodies[0].context.projectId.trim());
  // The raw project blob is never sent: no versions, no storage keys.
  assert.ok(!JSON.stringify(bodies[0]).includes('nova_forge_projects'));
  assert.ok(!('versions' in bodies[0].context));

  assert.match(ui.text(), /Local deterministic summary/);
  assert.match(ui.text(), /not a model response/);
});

test('an assistant failure is shown and the question is not answered locally', async () => {
  const ui = await mountWorkspace();
  await ui.createProject('Assistant failure project');
  await ui.click(ui.byText('button', 'Research assistant'));
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: false, code: 'INVALID_CONTEXT', error: 'The project context was rejected.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  await ui.typeInto(ui.container.querySelector('.fr-panel textarea'), 'What is missing?');
  await ui.click(ui.byText('button', 'Ask about this project'));
  await ui.flush(50);
  assert.match(ui.text(), /The project context was rejected/);
  assert.ok(!ui.text().includes('deterministic summary of your records'), 'a failure must not be dressed up as an answer');
});

/* ------------------------------ static contracts -------------------------- */

test('the research stylesheet keeps the scroll and responsive contracts', () => {
  const css = readFileSync(join(root, 'src/styles/forge-research.css'), 'utf8');
  const stripComments = (value) => value.replace(/\/\*[\s\S]*?\*\//g, '');
  const body = stripComments(css);

  // Horizontal scrolling only inside the table wrapper.
  assert.match(body, /\.fr-tablewrap\s*\{[^}]*overflow-x:\s*auto/);
  // The only vertical scroll container is the full-screen overlay.
  const vertical = [...body.matchAll(/([^{}]+)\{([^}]*overflow-y:\s*auto[^}]*)\}/g)].map((match) => match[1].trim());
  assert.deepEqual(vertical, ['.fr-workspace--full']);
  // Tablet breakpoint, small-phone breakpoint and touch targets exist.
  assert.match(body, /@media \(max-width: 1023px\)/);
  assert.match(body, /@media \(max-width: 640px\)/);
  assert.match(body, /@media \(pointer: coarse\)/);
  assert.match(body, /\.fr-workspace__body\s*\{[^}]*grid-template-columns:\s*var\(--fr-nav-width\)/);
});

test('the research copy is complete in all three languages and claims nothing', async () => {
  const { forgeResearchCopy, FORGE_RESEARCH_KEYS } = await import('../src/i18n/forgeResearch.ts');
  const baseline = [...FORGE_RESEARCH_KEYS].sort();
  for (const language of ['en', 'si', 'ta']) {
    assert.deepEqual(Object.keys(forgeResearchCopy[language]).sort(), baseline, `${language} key mismatch`);
    for (const key of baseline) {
      const value = forgeResearchCopy[language][key];
      assert.equal(typeof value, 'string', `${language}.${key}`);
      assert.ok(value.trim().length > 0, `${language}.${key} is empty`);
      assert.ok(!/\bproven\b|\bdiscovery\b|guarantee/i.test(value), `${language}.${key} overclaims`);
      assert.ok(!/<[a-z/][^>]*>/i.test(value), `${language}.${key} contains markup`);
    }
  }
  // Prose keys must not fall back to English.
  for (const key of ['frSubtitle', 'frNoProjectsBody', 'frStorageUnavailable', 'frAssistantHint', 'frAnalysisHint']) {
    assert.notEqual(forgeResearchCopy.si[key], forgeResearchCopy.en[key], `si.${key} fell back to English`);
    assert.notEqual(forgeResearchCopy.ta[key], forgeResearchCopy.en[key], `ta.${key} fell back to English`);
  }
});

test('the workspace is mounted as a Forge section without touching the others', () => {
  const surface = readFileSync(join(root, 'src/features/hypothesis-forge/ForgeSurface.tsx'), 'utf8');
  assert.match(surface, /import \{ ResearchWorkspace \} from '\.\/research\/ResearchWorkspace'/);
  assert.match(surface, /section === 'research'/);
  for (const section of ['workspace', 'hypotheses', 'data', 'evidence', 'analysis', 'counter', 'passport', 'history']) {
    assert.ok(surface.includes(`'${section}'`), `section ${section} disappeared`);
  }
  // No fabricated data and no direct provider key anywhere in the new surface.
  const files = ['ResearchWorkspace', 'HypothesisPanel', 'EvidencePanel', 'VersionsPanel', 'AnalysisPanel', 'AssistantPanel'];
  for (const file of files) {
    const source = readFileSync(join(root, `src/features/hypothesis-forge/research/${file}.tsx`), 'utf8');
    assert.ok(!/Math\.random|mockData|faker/.test(source), `${file} contains fabricated data`);
    assert.ok(!/api_key=|GEMINI_API_KEY|OPENROUTER_API_KEY/.test(source), `${file} touches a provider key`);
  }
  assert.ok(fs.existsSync(join(root, 'src/styles/forge-research.css')));
});
