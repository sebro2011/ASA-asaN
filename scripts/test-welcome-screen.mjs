/**
 * Welcome screen & version management — unit + SSR tests.
 *
 * Run with:  npm run test:welcome
 * (equivalently: node --import tsx --test scripts/test-welcome-screen.mjs)
 *
 * Covers the feature brief's required cases:
 *  - first-visit vs returning-user decision rules
 *  - skip/begin preference persistence and opt-in repeat behaviour
 *  - corrupt/blocked storage and SSR (no storage) safety
 *  - one canonical version source and honest non-stable labelling
 *  - trilingual rendering, dialog semantics and responsive-ready markup
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

import i18n from '../src/i18n.ts';
import pkg from '../package.json';
import {
  APP_VERSION,
  APP_VERSION_LABEL,
  RELEASE_CHANNEL,
  formatVersionLabel,
  isStableRelease
} from '../src/lib/version.ts';
import {
  WELCOME_STORAGE_KEY,
  initialShowOnStartup,
  persistWelcomePreference,
  readWelcomePreference,
  shouldShowWelcome
} from '../src/lib/welcome.ts';

/** Minimal in-memory Storage shim — no browser globals needed. */
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => void map.set(key, String(value)),
    _map: map
  };
}

/* ------------------------------------------------------------------ */
/* Version management — one source, honest release status              */
/* ------------------------------------------------------------------ */

test('version has a single source: the UI constant equals package.json', () => {
  assert.equal(APP_VERSION, pkg.version);
  assert.equal(pkg.version, '0.1.0');
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
});

test('version label is formatted consistently and never claims stability', () => {
  assert.equal(formatVersionLabel('0.1.0', 'preview'), 'v0.1.0 · preview');
  assert.equal(APP_VERSION_LABEL, formatVersionLabel());
  assert.equal(RELEASE_CHANNEL, 'preview');
  assert.equal(isStableRelease(), false);
  assert.doesNotMatch(APP_VERSION_LABEL, /stable/i);
});

/* ------------------------------------------------------------------ */
/* Welcome preference — first visit / returning / opt-in rules         */
/* ------------------------------------------------------------------ */

test('first visit with empty storage shows the welcome screen', () => {
  const storage = memoryStorage();
  assert.equal(readWelcomePreference(storage), null);
  assert.equal(shouldShowWelcome(storage), true);
  assert.equal(initialShowOnStartup(storage), false, 'repeat welcome is opt-in by default');
});

test('skip/begin with opt-out persisted means returning users are not interrupted', () => {
  const storage = memoryStorage();
  const record = persistWelcomePreference(false, storage);
  assert.equal(record.showOnStartup, false);
  assert.ok(typeof record.dismissedAt === 'string' && record.dismissedAt.length > 0);

  // Exactly one namespaced record was written.
  assert.deepEqual([...storage._map.keys()], [WELCOME_STORAGE_KEY]);
  assert.equal(shouldShowWelcome(storage), false);
  assert.equal(readWelcomePreference(storage)?.showOnStartup, false);
});

test('explicit opt-in makes the welcome screen appear on every startup', () => {
  const storage = memoryStorage();
  persistWelcomePreference(true, storage);
  assert.equal(shouldShowWelcome(storage), true);
  assert.equal(initialShowOnStartup(storage), true, 'checkbox reflects the stored opt-in');

  // A later dismissal without opt-in restores the non-interrupting default.
  persistWelcomePreference(false, storage);
  assert.equal(shouldShowWelcome(storage), false);
});

test('corrupt JSON and malformed records degrade to first-visit semantics without throwing', () => {
  const corrupt = memoryStorage({ [WELCOME_STORAGE_KEY]: '{not-json' });
  assert.equal(shouldShowWelcome(corrupt), true);
  assert.equal(readWelcomePreference(corrupt), null);

  const malformed = memoryStorage({ [WELCOME_STORAGE_KEY]: JSON.stringify({ dismissedAt: 'x' }) });
  assert.equal(shouldShowWelcome(malformed), true);
});

test('SSR and blocked storage never throw and behave as a session first visit', () => {
  assert.equal(shouldShowWelcome(null), true);
  assert.equal(readWelcomePreference(null), null);
  const record = persistWelcomePreference(true, null);
  assert.equal(record.showOnStartup, true);
});

/* ------------------------------------------------------------------ */
/* Trilingual SSR rendering and accessibility                          */
/* ------------------------------------------------------------------ */

const { WelcomeScreen } = await import('../src/components/WelcomeScreen.tsx');
const { default: AppFooter } = await import('../src/ui/AppFooter.tsx');

for (const lang of ['en', 'si', 'ta']) {
  await i18n.changeLanguage(lang);

  test(`welcome screen renders in ${lang} with dialog semantics and real labels`, () => {
    let dismissed = 0;
    const html = renderToString(
      React.createElement(WelcomeScreen, { lang, onDismiss: () => (dismissed += 1) })
    );
    const flat = html.replace(/<!-- -->/g, '');

    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /aria-labelledby="welcome-title"/);
    assert.match(html, /aria-describedby="welcome-body"/);

    // All required controls exist with translated, non-empty copy.
    for (const key of ['welcomeEyebrow', 'welcomeTitle', 'welcomeBody', 'welcomeBegin', 'welcomeSkip', 'welcomeShowOnStartup']) {
      const value = i18n.t(key);
      assert.ok(value && value !== key, `${lang}: key ${key} resolves`);
      assert.ok(flat.includes(value), `${lang}: renders ${key}`);
    }

    // One primary action, one visible skip, the preference checkbox, version.
    assert.match(html, /id="welcome-begin"/);
    assert.match(html, /type="checkbox"/);
    assert.ok(flat.includes(APP_VERSION_LABEL));
    assert.doesNotMatch(flat, /stable/i);
    assert.doesNotMatch(flat, /undefined|NaN/);
    assert.equal(dismissed, 0, 'rendering must not dismiss the overlay');
  });
}

test('footer shows the same canonical version and a replay control', async () => {
  await i18n.changeLanguage('en');
  let replays = 0;
  const html = renderToString(
    React.createElement(AppFooter, {
      lang: 'en',
      onTabChange: () => {},
      onOpenExport: () => {},
      onReplayWelcome: () => (replays += 1)
    })
  );
  assert.ok(html.includes(APP_VERSION_LABEL));
  assert.ok(html.includes(i18n.t('welcomeReplay')));
  assert.doesNotMatch(html, /undefined|NaN/);
});
