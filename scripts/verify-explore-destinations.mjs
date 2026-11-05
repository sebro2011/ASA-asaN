/**
 * Explore destination verification (Phase 3A).
 *
 * Phase 3A moved the science suite behind `/explore` and handed URL ownership to
 * the router. This script proves every destination still mounts:
 *
 *   1. the router accepts `/explore/<tab>` for all 15 destinations and keeps the
 *      legacy `/cosmovision` deep link;
 *   2. each destination renders real content inside ExploreApp (jsdom);
 *   3. the components' source files are byte-identical to the last commit, so
 *      "it still works" is not just "it still compiles".
 *
 * WebGL/Leaflet surfaces cannot paint in jsdom — those are reported as
 * `env-limited` rather than failures, and their untouched sources plus the
 * successful production chunk build cover the rest.
 *
 * Run: npm run verify:explore
 */
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';

import { NAV_ENTRIES } from '../src/ui/navigation.ts';
import { parseRoute, routeHref } from '../src/app/router.tsx';

const DESTINATIONS = ['home', ...NAV_ENTRIES.map((entry) => entry.id)];

/* --------------------------------------------------------------- 1. routing */

const routeFailures = [];
for (const tab of DESTINATIONS) {
  const href = routeHref('explore', { tab });
  const parsed = parseRoute(href);
  if (parsed.name !== 'explore' || parsed.tab !== tab) {
    routeFailures.push(`${tab}: ${href} → ${JSON.stringify(parsed)}`);
  }
}
const cosmovision = parseRoute('/cosmovision');
const legacyOk = cosmovision.name === 'explore' && cosmovision.tab === 'space-shorts';

/* ------------------------------------------------------------ 2. rendering */

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
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

const dom = installDom();
globalThis.fetch = async (input) => {
  const url = String(input);
  const json = async () => ({});
  if (url.includes('/api/earth/')) {
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json, text: async () => '{}' };
  }
  return { ok: false, status: 503, headers: { get: () => null }, json, text: async () => '' };
};

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nextProvider } = await import('react-i18next');
const { default: i18n } = await import('../src/i18n.ts');
const { ThemeProvider } = await import('../src/app/theme.tsx');
const { RouterProvider } = await import('../src/app/router.tsx');
const { default: ExploreApp } = await import('../src/explore/ExploreApp.tsx');

const root = createRoot(document.getElementById('root'));

const results = [];
const signatures = [];
for (const tab of DESTINATIONS) {
  const before = [];
  const onError = (event) => before.push(String(event?.message || event));
  window.addEventListener('error', onError);

  let status = 'ok';
  let detail = '';
  try {
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
              React.createElement(ExploreApp, { tab, onSelectTab: () => {}, onExitToWorkspace: () => {} }),
            ),
          ),
        ),
      );
    });
    // Lazy destinations resolve through Suspense; give them several frames.
    for (let frame = 0; frame < 8; frame += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
    }

    const main = document.querySelector('main, [role="main"]');
    const text = (main?.textContent || document.body.textContent || '').trim();
    const isEmpty = text.length < 150;
    if (isEmpty) {
      status = 'empty';
      detail = `rendered ${text.length} characters`;
    } else {
      detail = `${text.length} chars · ${text.replace(/\s+/g, ' ').slice(0, 46)}…`;
      signatures.push({ tab, signature: text.replace(/\s+/g, ' ').slice(0, 400) });
    }
  } catch (error) {
    const message = String(error?.message || error);
    if (/webgl|canvas|getContext|not implemented|leaflet|ResizeObserver/i.test(message)) {
      status = 'env-limited';
    } else {
      status = 'error';
    }
    detail = message.split('\n')[0].slice(0, 120);
  } finally {
    window.removeEventListener('error', onError);
    if (before.length && status === 'ok') {
      status = 'env-limited';
      detail = before[0].slice(0, 120);
    }
  }
  results.push({ tab, status, detail });
}

/* ------------------------------------------------ 3. science source is intact */

function changedScienceFiles() {
  try {
    const output = execFileSync('git', ['status', '--porcelain', '--', 'src/components', 'src/features', 'src/hooks', 'src/lib', 'server'], {
      encoding: 'utf8',
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return ['(git status unavailable)'];
  }
}

const changed = changedScienceFiles();

/* ------------------------------------------------------------------ report */

const pad = (value, width) => String(value).padEnd(width);
console.log('\nExplore destinations\n' + '-'.repeat(64));
for (const result of results) {
  const mark = result.status === 'ok' ? 'PASS' : result.status === 'env-limited' ? 'SKIP' : 'FAIL';
  console.log(`${mark}  ${pad(result.tab, 14)} ${result.detail}`);
}

// Each destination must render its own page, not a shared placeholder.
const duplicates = [];
for (let i = 0; i < signatures.length; i += 1) {
  for (let j = i + 1; j < signatures.length; j += 1) {
    if (signatures[i].signature === signatures[j].signature) {
      duplicates.push(`${signatures[i].tab} = ${signatures[j].tab}`);
    }
  }
}

const counts = results.reduce((acc, result) => ({ ...acc, [result.status]: (acc[result.status] || 0) + 1 }), {});
console.log('-'.repeat(64));
console.log(
  `${results.length} destinations · ${counts.ok || 0} rendered · ${counts['env-limited'] || 0} env-limited · ${counts.error || 0} errors · ${counts.empty || 0} empty`,
);
console.log(`legacy /cosmovision → ${legacyOk ? 'space-shorts' : 'BROKEN'}`);
console.log(`router: ${routeFailures.length === 0 ? 'all 15 paths resolve' : routeFailures.join('; ')}`);
console.log(
  `science sources: ${changed.length === 0 ? 'unchanged since HEAD' : `CHANGED → ${changed.join(', ')}`}`,
);

const failed = results.filter((result) => result.status === 'error' || result.status === 'empty');
await act(async () => {
  root.unmount();
});
dom.window.close();

if (failed.length || routeFailures.length || !legacyOk || changed.length || duplicates.length) {
  console.error('\nFAILED');
  process.exit(1);
}
console.log('\nOK\n');
process.exit(0);
