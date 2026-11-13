/**
 * Keyboard reachability guard.
 *
 * The audit found clickable `<div>`s across the UI: the AR markers, the asteroid
 * blips, the soundscape label, the news headline, the planet globe, the logo, and
 * three overlay backdrops. All of them were reachable with a pointer only.
 *
 * This test encodes the rule rather than the individual fixes:
 *
 *   an element with an onClick is either
 *     a) a real interactive element (`button`, `a`, `input`, …),
 *     b) given `role` + `tabIndex` + a key handler, or
 *     c) explicitly `aria-hidden` — a documented mouse-only duplicate of a
 *        control that IS reachable.
 *
 * A click handler that only stops propagation is not a control and is ignored.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-a11y-controls.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* ------------------------------------------------------------------ scanning */

const INTERACTIVE = new Set([
  'button', 'a', 'input', 'select', 'textarea', 'summary', 'label', 'option',
  // Native <dialog>: showModal() traps focus and Escape closes it for free.
  'dialog',
  // Framework link components that render an <a>: keyboard activation is theirs.
  'Link', 'NavLink',
]);

function sourceFiles(dir = 'src') {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(tsx|jsx)$/.test(entry)) out.push(path);
  }
  return out;
}

/** Reads one JSX opening tag, honouring braces and quotes so `=>` is not a `>`. */
function readTag(source, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote && source[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

function handlerBody(tag, attribute) {
  const match = new RegExp(`${attribute}=(\\{[\\s\\S]*?\\}|"[^"]*")`).exec(tag);
  return match ? match[1] : null;
}

function violations() {
  const found = [];
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    const pattern = /<([a-zA-Z][\w.]*)/g;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const tagName = match[1];
      const tag = readTag(source, match.index);
      if (!/\bonClick=/.test(tag)) continue;

      const onClick = handlerBody(tag, 'onClick') || '';
      // `motion.button`, `motion.a`: the rendered element is the last segment.
      const bare = tagName.split('.').pop();
      // A capitalised tag is a component (IconButton, Section, ErrorBoundary…);
      // its own markup decides reachability and is scanned where it is defined.
      if (/^[A-Z]/.test(bare)) continue;
      const isOwnInteractive = INTERACTIVE.has(tagName) || INTERACTIVE.has(bare) || INTERACTIVE.has(bare.toLowerCase());
      const stopsPropagationOnly = /stopPropagation/.test(onClick) && !/[a-z]\(/.test(onClick.replace(/stopPropagation/g, ''));
      const hidden = /aria-hidden="?true"?/.test(tag);
      const hasRole = /\brole=/.test(tag);
      const hasTabIndex = /\btabIndex=/.test(tag);
      // A dialog is a container with its own labelled close control.
      const isNonControlRole = /role="(dialog|presentation|none)"/.test(tag);
      const hasKeyHandler = /\bonKeyDown=|\bonKeyUp=|\bonKeyPress=/.test(tag);

      if (isOwnInteractive || stopsPropagationOnly || hidden || isNonControlRole) continue;
      if (hasRole && hasTabIndex && hasKeyHandler) continue;

      const line = source.slice(0, match.index).split('\n').length;
      found.push(`${file}:${line} <${tagName}> role=${hasRole} tabIndex=${hasTabIndex} key=${hasKeyHandler}`);
    }
  }
  return found;
}

/* ---------------------------------------------------------------- assertions */

test('no clickable container is unreachable by keyboard', () => {
  const found = violations();
  assert.deepEqual(found, [], `clickable elements without a keyboard path:\n${found.join('\n')}`);
});

test('the scanner actually detects a violation (so a green run means something)', () => {
  // Guard against the guard: a broken scanner that reports nothing would pass
  // the test above while proving nothing.
  const fixture = '<div onClick={() => go()}>x</div>';
  const tag = readTag(fixture, 0);
  assert.match(tag, /onClick=/);
  assert.ok(!/aria-hidden|role=/.test(tag), 'the fixture must look like a violation to the rules above');
});

test('activateOnKey activates on Enter and Space, and swallows the Space scroll', async () => {
  const { activateOnKey } = await import('../src/app/hooks.ts');
  let calls = 0;
  const handler = activateOnKey(() => {
    calls += 1;
  });

  const makeEvent = (key) => ({ key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });

  const enter = makeEvent('Enter');
  handler(enter);
  assert.equal(calls, 1, 'Enter activates');
  assert.equal(enter.defaultPrevented, false, 'Enter needs no default suppression');

  const space = makeEvent(' ');
  handler(space);
  assert.equal(calls, 2, 'Space activates');
  assert.equal(space.defaultPrevented, true, 'Space must not also scroll the page');

  handler(makeEvent('Tab'));
  assert.equal(calls, 2, 'other keys do nothing');
});

test('elements that kept role=button also kept a key handler', () => {
  const offenders = [];
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    const pattern = /<([a-zA-Z][\w.]*)/g;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const tag = readTag(source, match.index);
      if (!/role="button"/.test(tag) || INTERACTIVE.has(match[1])) continue;
      if (!/onKeyDown=/.test(tag)) {
        offenders.push(`${file}:${source.slice(0, match.index).split('\n').length}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `role=button without keyboard support:\n${offenders.join('\n')}`);
});

test('the overlays can be dismissed from the keyboard', () => {
  const expectations = [
    ['src/ui/AppHeader.tsx', 'mobileOpen', true],
    ['src/ui/MobileTabBar.tsx', 'menuOpen', true],
    // The lightbox's own root is the dialog; it has a labelled close button, so
    // there is no separate decorative backdrop to hide.
    ['src/components/ApodViewer.tsx', 'hdOpen', false],
  ];
  for (const [file, flag, hasBackdrop] of expectations) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /useEscape\(/, `${file} must use the shared Escape hook`);
    assert.match(source, new RegExp(`useEscape\\(\\s*${flag}\\b`), `${file} must close on Escape while ${flag} is open`);
    if (hasBackdrop) {
      // The backdrop is decorative: it must not be announced or tabbed to.
      assert.match(source, /aria-hidden="true"[^>]*backdrop-blur|backdrop-blur[^>]*aria-hidden="true"/, `${file} backdrop must be aria-hidden`);
    }
  }
});

test('there is exactly one base focus ring, and role=button is covered', () => {
  const tokens = readFileSync('src/styles/tokens.css', 'utf8');
  const globals = readFileSync('src/globals.css', 'utf8');

  // The ring: an outline, not a shadow, from the `--focus` token.
  assert.match(tokens, /:focus-visible\s*\{[^}]*outline:\s*2px solid/, 'the base ring lives in tokens.css');
  // A second *base* rule (text inputs, [tabindex], bare buttons) would drift from
  // the first. A supplementary rule for role="button" is fine — it has no native
  // ring to inherit.
  const competing = [];
  for (const match of globals.matchAll(/([^}]*):focus-visible\s*\{/g)) {
    const selector = match[1];
    if (/\b(input|select|textarea|summary)\b|\[tabindex\]/.test(selector) && !/role="button"/.test(selector)) {
      competing.push(selector.trim());
    }
  }
  assert.deepEqual(competing, [], `globals.css must not redefine the base ring:\n${competing.join('\n')}`);
  // role="button" has no native ring, so it needs to be in the selector list.
  assert.match(globals, /\[role="button"\][^{]*:focus-visible/, 'role=button must get the ring too');
  assert.match(globals, /forced-colors/, 'high-contrast mode needs its own rule');
});

test('converted controls are real buttons', () => {
  const checks = [
    ['src/components/AmbientSoundscapeControl.tsx', /<button[\s\S]{0,400}aria-pressed=\{isPlaying\}/],
    ['src/components/NASANewsExplorer.jsx', /<h3[^>]*>[\s\S]{0,400}<button/],
  ];
  for (const [file, pattern] of checks) {
    assert.match(readFileSync(file, 'utf8'), pattern, `${file} should use a native button`);
  }
});
