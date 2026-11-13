/**
 * Icon-only buttons need a name, and translations need the right script.
 *
 * Audit m4 said "3 aria-labels across 331 buttons" and was careful to add that
 * this is *not* a claim that 328 are broken — most buttons carry visible text.
 * It was right to be careful: a text scan over JSX with long class strings,
 * braces and ternaries is easy to get wrong. The scan below is deliberately
 * conservative — it flags a button only when its entire subtree contains no
 * literal text and no `{…}` expression at all — and it found 12 real cases, all
 * icon-only close/dismiss or month-navigation controls. They now have labels.
 *
 * The second half exists because of a near miss: a Tamil label was written with
 * Sinhala characters. It type-checked, it rendered, and it was wrong. Script
 * mismatches are now a build failure.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-a11y-icon-buttons.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { A11Y_LABELS, a11yLabel } from '../src/lib/a11yLabels.ts';

const SINHALA = /[\u0D80-\u0DFF]/;
const TAMIL = /[\u0B80-\u0BFF]/;

/* ------------------------------------------------------- icon-only controls */

function sourceFiles(dir = 'src') {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(tsx|jsx)$/.test(entry)) out.push(path);
  }
  return out;
}

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
    else if (ch === '>' && depth === 0) return { tag: source.slice(start, i + 1), end: i + 1 };
  }
  return { tag: source.slice(start), end: source.length };
}

/** Children up to the matching `</button>`, so nested elements do not truncate it. */
function childrenOf(source, from) {
  let depth = 0;
  let i = from;
  while (i < source.length) {
    if (source.startsWith('<button', i)) {
      depth += 1;
      i += 7;
      continue;
    }
    if (source.startsWith('</button>', i)) {
      if (depth === 0) return source.slice(from, i);
      depth -= 1;
      i += 9;
      continue;
    }
    i += 1;
  }
  return source.slice(from, Math.min(source.length, from + 400));
}

function namelessIconButtons() {
  const found = [];
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<(button|motion\.button)\b/g)) {
      const { tag, end } = readTag(source, match.index);
      if (/aria-label=|aria-labelledby=|title=/.test(tag)) continue;

      const children = childrenOf(source, end);
      if (/^\s*\/>/.test(children)) {
        found.push(`${file}:${source.slice(0, match.index).split('\n').length} (self-closing)`);
        continue;
      }

      // Strip element tags and `{…}` expressions; whatever survives is literal
      // text. A surviving expression means the text is dynamic — not our call.
      const stripped = children
        .replace(/\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, ' \u0000 ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const hasLiteralText = /[A-Za-z\u0D80-\u0DFF\u0B80-\u0BFF]{2,}/.test(stripped.replace(/\u0000/g, ''));
      if (hasLiteralText || stripped.includes('\u0000')) continue;

      found.push(`${file}:${source.slice(0, match.index).split('\n').length}`);
    }
  }
  return found;
}

test('no button is icon-only without an accessible name', () => {
  const found = namelessIconButtons();
  assert.deepEqual(found, [], `icon-only buttons with no name (add aria-label):\n${found.join('\n')}`);
});

test('the scanner can still see the pattern it forbids', () => {
  // Guard against the guard: the same rules applied to a fixture.
  const fixture = '<button type="button" onClick={x}><X size={14} /></button>';
  const { tag, end } = readTag(fixture, 0);
  assert.doesNotMatch(tag, /aria-label/);
  const children = childrenOf(fixture, end);
  const stripped = children.replace(/\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, ' \u0000 ').replace(/<[^>]+>/g, ' ').trim();
  assert.ok(!/[A-Za-z]{2,}/.test(stripped), 'an icon-only button must look nameless to the rules above');
});

test('the label helper falls back to English and covers all three languages', () => {
  assert.equal(a11yLabel('close', 'si'), A11Y_LABELS.close.si);
  assert.equal(a11yLabel('close', 'ta'), A11Y_LABELS.close.ta);
  assert.equal(a11yLabel('close', 'en'), 'Close');
  assert.equal(a11yLabel('close', undefined), 'Close', 'an unknown locale must not produce an empty name');
  assert.equal(a11yLabel('close', 'fr'), 'Close');

  for (const [key, entry] of Object.entries(A11Y_LABELS)) {
    for (const lang of ['en', 'si', 'ta']) {
      assert.ok(entry[lang] && entry[lang].trim().length > 0, `${key}.${lang} is empty`);
    }
  }
});

test('each label is written in the script of its language', () => {
  // This is the check that would have caught the Tamil label written in Sinhala
  // characters: it type-checked, it rendered, and it was wrong.
  for (const [key, entry] of Object.entries(A11Y_LABELS)) {
    assert.doesNotMatch(entry.si, TAMIL, `${key}.si uses Tamil characters`);
    assert.doesNotMatch(entry.ta, SINHALA, `${key}.ta uses Sinhala characters`);
    assert.match(entry.si, SINHALA, `${key}.si should be in Sinhala script`);
    assert.match(entry.ta, TAMIL, `${key}.ta should be in Tamil script`);
    assert.match(entry.en, /^[\x20-\x7E]+$/, `${key}.en should be plain ASCII`);
  }
});

test('the same script check holds across the translation dictionaries', () => {
  // Four values legitimately name the other language in its own script.
  const allowed = new Set(['appSubtitle', 'langSi', 'langTa']);
  const problems = [];

  for (const lang of ['si', 'ta']) {
    for (const file of readdirSync(`src/i18n/${lang}`)) {
      if (!file.endsWith('.ts')) continue;
      const source = readFileSync(`src/i18n/${lang}/${file}`, 'utf8');
      for (const line of source.split('\n')) {
        const match = /^\s*(\w+):\s*'([^']*)'/.exec(line);
        if (!match) continue;
        const [, key, value] = match;
        if (allowed.has(key)) continue;
        const wrong = lang === 'ta' ? SINHALA.test(value) : TAMIL.test(value);
        if (wrong) problems.push(`${lang}/${file}:${key} → ${value.slice(0, 60)}`);
      }
    }
  }

  assert.deepEqual(problems, [], `values written in the wrong script:\n${problems.join('\n')}`);
});
