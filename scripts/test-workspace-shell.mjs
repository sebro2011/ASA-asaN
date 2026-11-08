/**
 * NOVA workspace shell — pure contracts (Phase 3A).
 *
 * Routing table, copy parity, translation-key resolution and WCAG contrast for
 * both themes. Rendering tests live in scripts/test-workspace-dom.mjs so the
 * jsdom-heavy work gets its own process.
 *
 * Run: node --import tsx --test scripts/test-workspace-shell.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalisePath, parseRoute, routeHref } from '../src/app/router.tsx';
import { ACCOUNT_NAV, EXPLORE_NAV, ROUTE_LABEL_KEYS, WORKSPACE_NAV } from '../src/app/navConfig.ts';
import { workspaceCopy } from '../src/i18n/workspaceCopy.ts';
import { resources } from '../src/i18n.ts';

test('normalisePath produces one canonical pathname', () => {
  assert.equal(normalisePath('/'), '/');
  assert.equal(normalisePath(''), '/');
  assert.equal(normalisePath('chat'), '/chat');
  assert.equal(normalisePath('/chat/'), '/chat');
  assert.equal(normalisePath('//chat//'), '/chat');
  assert.equal(normalisePath('/chat?x=1#top'), '/chat');
});

test('parseRoute maps every workspace destination', () => {
  const cases = [
    ['/', 'home'],
    ['/chat', 'chat'],
    ['/projects', 'projects'],
    ['/documents', 'documents'],
    ['/writing', 'writing'],
    ['/research', 'research'],
    ['/code', 'code'],
    ['/knowledge', 'knowledge'],
    ['/tasks', 'tasks'],
    ['/settings', 'settings'],
    ['/search', 'search'],
    ['/profile', 'profile'],
  ];
  for (const [path, name] of cases) assert.equal(parseRoute(path).name, name, path);
});

test('parseRoute keeps detail ids and rejects extra segments', () => {
  assert.deepEqual(parseRoute('/chat/abc-123'), { name: 'chat', id: 'abc-123', path: '/chat/abc-123' });
  assert.equal(parseRoute('/chat/a/b').name, 'notFound');
  assert.equal(parseRoute('/nowhere').name, 'notFound');
  assert.equal(parseRoute('/knowledge/extra').name, 'notFound');
});

test('explore routes preserve all destinations and the legacy cosmovision URL', () => {
  assert.deepEqual(parseRoute('/explore'), { name: 'explore', tab: 'home', path: '/explore' });
  assert.deepEqual(parseRoute('/cosmovision'), {
    name: 'explore',
    tab: 'space-shorts',
    path: '/cosmovision',
  });
  // A space-shorts deep link canonicalises to the legacy shareable URL.
  assert.equal(parseRoute('/explore/space-shorts').path, '/cosmovision');
  assert.equal(parseRoute('/explore/earth').tab, 'earth');
  assert.equal(parseRoute('/explore/unknown-tab').name, 'notFound');
});

test('routeHref round-trips through parseRoute', () => {
  assert.equal(routeHref('home'), '/');
  assert.equal(routeHref('workspace'), '/workspace');
  assert.equal(parseRoute('/workspace').name, 'workspace');
  assert.equal(routeHref('chat'), '/chat');
  assert.equal(routeHref('chat', { id: 'x y' }), '/chat/x%20y');
  assert.equal(routeHref('explore'), '/explore');
  assert.equal(routeHref('explore', { tab: 'home' }), '/explore');
  assert.equal(routeHref('explore', { tab: 'space-shorts' }), '/cosmovision');
  assert.equal(routeHref('explore', { tab: 'earth' }), '/explore/earth');
  assert.equal(parseRoute(routeHref('explore', { tab: 'earth' })).tab, 'earth');
});

test('every workspace nav href resolves to its own route', () => {
  for (const item of [...WORKSPACE_NAV, EXPLORE_NAV, ...ACCOUNT_NAV]) {
    const parsed = parseRoute(item.href);
    assert.equal(parsed.name, item.route, `${item.id} → ${item.href}`);
  }
});

/* --------------------------------------------------------------- copy parity */

test('workspace copy exists in all three languages with identical keys', () => {
  const en = Object.keys(workspaceCopy.en).sort();
  for (const lang of ['si', 'ta']) {
    const keys = Object.keys(workspaceCopy[lang]).sort();
    const missing = en.filter((key) => !keys.includes(key));
    assert.deepEqual(missing, [], `${lang} is missing workspace keys`);
    assert.deepEqual(keys, en, `${lang} key set differs from en`);
  }
  for (const [key, value] of Object.entries(workspaceCopy.en)) {
    assert.ok(value.trim().length > 0, `${key} is empty`);
  }
});

test('every workspace destination has a shell title, so the header never says "not found"', () => {
  const items = [...WORKSPACE_NAV, ...(Array.isArray(EXPLORE_NAV) ? EXPLORE_NAV : [EXPLORE_NAV]), ...ACCOUNT_NAV];
  const missing = [];
  for (const item of items) {
    // Legacy aliases (e.g. /workspace → home) redirect before the shell renders,
    // so they do not need a header title of their own.
    if (parseRoute(item.href).name !== item.route) continue;
    const key = ROUTE_LABEL_KEYS[item.route];
    if (!key) {
      missing.push(`${item.id} (${item.route}) has no ROUTE_LABEL_KEYS entry`);
      continue;
    }
    for (const lang of ['en', 'si', 'ta']) {
      if (!resources[lang].translation[key]) missing.push(`${item.id}: ${lang} missing ${key}`);
    }
  }
  assert.deepEqual(missing, [], `shell titles must resolve:\n${missing.join('\n')}`);
});

test('every nav item has a label in every language', () => {
  for (const item of [...WORKSPACE_NAV, EXPLORE_NAV, ...ACCOUNT_NAV]) {
    for (const lang of ['en', 'si', 'ta']) {
      // Labels may live in the workspace namespace or the shared shell copy
      // (e.g. navHome) — assert against the merged resources the UI actually uses.
      const dict = resources[lang].translation;
      assert.ok(dict[item.labelKey], `${item.id} has no ${lang} label (${item.labelKey})`);
    }
    if (item.status === 'planned') {
      assert.ok(item.phase, `${item.id} is planned but has no phase`);
      assert.ok(item.descriptionKey, `${item.id} is planned but has no description`);
    }
  }
});

/* ------------------------------------------------------------- jsdom render */

test('every literal t() key in the workspace shell resolves in all three languages', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const roots = ['src/app', 'src/workspace', 'src/explore'];
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.tsx?$/.test(entry.name)) files.push(path);
    }
  }
  for (const root of roots) await walk(root);

  const literal = /(?<![A-Za-z0-9_$])t\(\s*'([A-Za-z0-9_.:-]+)'/g;
  const dynamic = /(?<![A-Za-z0-9_$])t\(\s*`/g;
  const missing = [];
  const dynamicCalls = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (file.startsWith('src/explore/')) continue; // untouched science suite
    if (dynamic.test(source)) dynamicCalls.push(file);
    for (const match of source.matchAll(literal)) {
      const key = match[1];
      for (const lang of ['en', 'si', 'ta']) {
        if (!resources[lang].translation[key]) missing.push(`${file}: ${lang} → ${key}`);
      }
    }
  }

  assert.deepEqual(missing, [], `unresolved translation keys:\n${missing.join('\n')}`);
  assert.deepEqual(dynamicCalls, [], 'dynamic t() keys need an explicit i18n key union');
});

/* --------------------------------------------------- preserved science suite */

function parsePalette(css, from, to) {
  const slice = css.slice(from, to === undefined ? undefined : to);
  const palette = {};
  for (const match of slice.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/g)) {
    palette[match[1]] = match[2];
  }
  return palette;
}

function luminance(hex) {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function blend(foreground, background, alpha) {
  const channel = (hex, offset) => parseInt(hex.slice(offset, offset + 2), 16);
  const mixed = [1, 3, 5].map((offset) =>
    Math.round(channel(foreground, offset) * alpha + channel(background, offset) * (1 - alpha)),
  );
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('both NOVA themes meet WCAG AA for every text token on every surface', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile('src/styles/nova-tokens.css', 'utf8');

  const lightStart = css.indexOf(":root[data-nova-theme='light']");
  assert.ok(lightStart > 0, 'light theme block exists');
  const dark = parsePalette(css, 0, lightStart);
  const light = parsePalette(css, lightStart);

  const surfaces = ['bg', 'surface', 'elev', 'elev-2'];
  const failures = [];
  for (const [theme, palette] of Object.entries({ dark, light })) {
    for (const surface of surfaces) {
      const background = palette[`ws-${surface}`];
      assert.ok(background, `${theme}: ws-${surface} defined`);
      const primary = contrast(palette['ws-text'], background);
      if (primary < 7) failures.push(`${theme} text on ${surface}: ${primary.toFixed(2)} (< 7)`);
      for (const token of ['ws-text-2', 'ws-text-3', 'ws-accent', 'ws-accent-ink']) {
        const value = contrast(palette[token], background);
        if (value < 4.5) failures.push(`${theme} ${token} on ${surface}: ${value.toFixed(2)} (< 4.5)`);
      }

      // Active-nav pill = accent at 16% over the surface; the label and accent
      // text must still pass inside that tint.
      const tint = blend(palette['ws-accent'], background, 0.16);
      for (const token of ['ws-text', 'ws-accent-ink']) {
        const value = contrast(palette[token], tint);
        if (value < 4.5) {
          failures.push(`${theme} ${token} on ${surface}+16% accent: ${value.toFixed(2)} (< 4.5)`);
        }
      }

      // Primary buttons paint a white label on accent-solid.
      const solid = contrast('#ffffff', palette['ws-accent-solid']);
      if (solid < 4.5) {
        failures.push(`${theme} white on accent-solid: ${solid.toFixed(2)} (< 4.5)`);
      }
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));

  // The science palette keeps its identity; its muted ink must still be legible.
  const scienceCss = await readFile('src/styles/tokens.css', 'utf8');
  const science = parsePalette(scienceCss, 0);
  for (const surface of ['void', 'surface', 'surface-2']) {
    const value = contrast(science['ink-4'], science[surface]);
    assert.ok(
      value >= 4.5,
      `science ink-4 on ${surface}: ${value.toFixed(2)} (< 4.5) — muted labels would fail AA`,
    );
  }
});

/* --------------------------------------------------------- responsive layout */

/* -------------------------------------------------------- responsive strategy */

test('the shell declares its responsive breakpoints in CSS, not in JS', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile('src/styles/workspace.css', 'utf8');

  const base = css.slice(css.indexOf('.nova-sidebar {'), css.indexOf('@media (min-width: 768px)'));
  assert.match(base, /display:\s*none/, 'sidebar is hidden on phones');

  const tabletBlock = css.slice(
    css.indexOf('@media (min-width: 768px)'),
    css.indexOf('@media (min-width: 1024px)'),
  );
  assert.match(tabletBlock, /\.nova-sidebar\s*\{[^}]*display:\s*flex/s, 'rail appears at 768px');
  assert.match(tabletBlock, /width:\s*var\(--spacing-ws-rail\)/, 'rail width at 768px');

  const desktopBlock = css.slice(css.indexOf('@media (min-width: 1024px)'));
  assert.match(
    desktopBlock,
    /\.nova-sidebar\s*\{[^}]*width:\s*var\(--spacing-ws-sidebar\)/s,
    'full width at 1024px',
  );
  assert.match(desktopBlock, /\[data-collapsed='true'\]/, 'collapsed rail override');

  // Nav labels and flags disappear in rail mode instead of overflowing.
  assert.match(css, /\.nova-sidebar\[data-collapsed='true'\][^{]*\{[^}]*display:\s*none/s);
});
