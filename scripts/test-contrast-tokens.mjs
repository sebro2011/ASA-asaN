/**
 * Contrast, computed from the tokens instead of estimated by eye.
 *
 * The audit listed "a11y contrast not verified" as an open item. There is no
 * browser in this environment, but contrast does not need one: the palettes are
 * hex values in CSS, and WCAG's ratio is arithmetic. This test reads the real
 * token files (so it fails when they drift) and enforces:
 *
 *   - every ink/text token ≥ 4.5:1 on every surface of its palette (AA, normal text)
 *   - every accent used as text ≥ 4.5:1 on every surface
 *   - white on the primary-button fill ≥ 4.5:1 in both workspace themes
 *   - the numbers written in nova-tokens.css still match their own tokens
 *
 * `--color-azure-deep` is a *fill*, not text: it is checked the other way round
 * (white on it), and the scan fails if any component starts using it as a text
 * colour.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-contrast-tokens.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* ------------------------------------------------------------------ WCAG math */

function hexToRgb(hex) {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/* ------------------------------------------------------------- token reading */

/** Reads `--color-*: #hex;` declarations inside the block that starts at `selector`. */
function readBlock(source, selector, { from = 0 } = {}) {
  const start = source.indexOf(selector, from);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const block = source.slice(open, end);
  const tokens = {};
  for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    if (/^#[0-9a-fA-F]{3,8}$/.test(value.trim())) tokens[name] = value.trim();
  }
  return tokens;
}

const scienceCss = readFileSync('src/styles/tokens.css', 'utf8');
const wsCss = readFileSync('src/styles/nova-tokens.css', 'utf8');

const science = readBlock(scienceCss, '@theme');
const wsDark = readBlock(wsCss, '@theme');
const wsLight = { ...wsDark, ...readBlock(wsCss, ":root[data-nova-theme='light']") };

const SCIENCE_SURFACES = ['--color-void', '--color-abyss', '--color-surface', '--color-surface-2', '--color-surface-3'];
const SCIENCE_INK = ['--color-ink', '--color-ink-2', '--color-ink-3', '--color-ink-4'];
// Accents that are printed as text somewhere in the app (colour utilities such
// as `text-cyan-400`, status labels, provenance chips).
const SCIENCE_ACCENT_TEXT = [
  '--color-atmo', '--color-atmo-soft', '--color-azure',
  '--color-signal', '--color-caution', '--color-critical', '--color-derived',
  '--color-cyan-300', '--color-cyan-500', '--color-emerald-300',
  '--color-rose-300', '--color-amber-300', '--color-purple-300',
];
const WS_SURFACES = ['--color-ws-bg', '--color-ws-surface', '--color-ws-elev', '--color-ws-elev-2'];
const WS_INK = ['--color-ws-text', '--color-ws-text-2', '--color-ws-text-3'];
const WS_STATUS = ['--color-ws-accent-ink', '--color-ws-danger', '--color-ws-success', '--color-ws-warn'];

const AA_NORMAL = 4.5;

function checkPairs(group, palette, foregrounds, backgrounds, minimum, problems) {
  for (const fg of foregrounds) {
    for (const bg of backgrounds) {
      const fgValue = palette[fg];
      const bgValue = palette[bg];
      assert.ok(fgValue, `${group}: ${fg} must exist`);
      assert.ok(bgValue, `${group}: ${bg} must exist`);
      const ratio = contrastRatio(fgValue, bgValue);
      if (ratio < minimum) problems.push(`${group}: ${fg} (${fgValue}) on ${bg} (${bgValue}) = ${ratio.toFixed(2)} < ${minimum}`);
    }
  }
}

/* ------------------------------------------------------------------ assertions */

test('science palette: every ink passes AA on every surface', () => {
  const problems = [];
  checkPairs('science ink', science, SCIENCE_INK, SCIENCE_SURFACES, AA_NORMAL, problems);
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('science palette: every accent used as text passes AA on every surface', () => {
  const problems = [];
  checkPairs('science accent', science, SCIENCE_ACCENT_TEXT, SCIENCE_SURFACES, AA_NORMAL, problems);
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('azure-deep is a fill, not text — and white on it passes AA', () => {
  // It began life as `--color-blue-600`. As *text* it measures 3.53:1 on the
  // darkest surface, so it may only be a background. The scan below enforces that.
  const ratio = contrastRatio('#ffffff', science['--color-azure-deep']);
  assert.ok(ratio >= AA_NORMAL, `white on azure-deep = ${ratio.toFixed(2)}`);

  const offenders = [];
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    if (/text-(blue-600|azure-deep)\b/.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `azure-deep used as a text colour in:\n${offenders.join('\n')}`);
});

test('workspace dark theme passes AA for text and status colours', () => {
  const problems = [];
  checkPairs('ws dark', wsDark, [...WS_INK, ...WS_STATUS], WS_SURFACES, AA_NORMAL, problems);
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('workspace light theme passes AA for text and status colours', () => {
  const problems = [];
  checkPairs('ws light', wsLight, [...WS_INK, ...WS_STATUS], WS_SURFACES, AA_NORMAL, problems);
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('primary button labels are readable in both themes', () => {
  for (const [name, palette] of [['dark', wsDark], ['light', wsLight]]) {
    const ratio = contrastRatio('#ffffff', palette['--color-ws-accent-solid']);
    assert.ok(ratio >= AA_NORMAL, `${name}: white on accent-solid = ${ratio.toFixed(2)}`);
  }
});

test('the contrast numbers written in nova-tokens.css still match the tokens', () => {
  // The file claims "computed not estimated". This makes that claim falsifiable:
  // if a token changes and the comment does not, the build fails.
  const header = wsCss.slice(0, wsCss.indexOf('@theme'));
  const linePattern = /(dark|light)\s+([\w-]+)\s+(#[0-9A-Fa-f]{6})(?:\s+on\s+([^\n→]+?))?\s*→\s*([\d.]+(?:\s*\/\s*[\d.]+)*)/g;
  const palette = { dark: wsDark, light: wsLight };
  // The comment lists the surfaces once ("on #08090D / #10121A / #171A24") and
  // later lines reuse them; carry the last list forward per theme.
  const lastSurfaces = {};

  let checked = 0;
  const problems = [];
  for (const match of header.matchAll(linePattern)) {
    const [, theme, tokenName, documentedColor, explicitSurfaces, documentedRatios] = match;
    if (explicitSurfaces) lastSurfaces[theme] = explicitSurfaces.match(/#[0-9A-Fa-f]{6}/g) || [];
    const backgrounds = lastSurfaces[theme] || [];
    const ratios = documentedRatios.split('/').map((value) => Number(value.trim()));
    if (!backgrounds.length || backgrounds.length !== ratios.length) continue;

    // The comment prints the colour it measured; it must be the token's colour.
    const tokenKey = Object.keys(palette[theme]).find(
      (key) => key === `--color-ws-${tokenName}` || key.endsWith(`-${tokenName}`),
    );
    if (tokenKey && palette[theme][tokenKey].toLowerCase() !== documentedColor.toLowerCase()) {
      problems.push(`${theme} ${tokenName}: comment says ${documentedColor}, token is ${palette[theme][tokenKey]}`);
    }

    for (let i = 0; i < backgrounds.length; i += 1) {
      const actual = contrastRatio(documentedColor, backgrounds[i]);
      checked += 1;
      if (Math.abs(actual - ratios[i]) > 0.05) {
        problems.push(`${theme} ${tokenName} on ${backgrounds[i]}: documented ${ratios[i]}, computed ${actual.toFixed(2)}`);
      }
    }
  }

  assert.ok(checked >= 10, `expected to verify the documented pairs, only parsed ${checked}`);
  assert.deepEqual(problems, [], problems.join('\n'));
});

/* --------------------------------------------------------------------- helper */

function sourceFiles(dir = 'src') {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(tsx|jsx|ts|css)$/.test(entry)) out.push(path);
  }
  return out;
}
