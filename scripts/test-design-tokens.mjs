/**
 * Design-token contract — one definition of "glass", and nothing drifting from it.
 *
 * The audit behind the COSMORA work found 69 raw `backdrop-blur-*` utilities spread
 * over 27 files: the same kind of panel was 4 px of blur on one page and 40 px on
 * another, and a change to the surface language meant editing every one by hand.
 * A components layer now defines three tones (`glass`, `glass-strong`,
 * `glass-inset`) and `src/ui/Glass.tsx` is the way components ask for them.
 *
 * These assertions exist because the drift was invisible: every one of those 69
 * sites was valid Tailwind, so no build, type-check or test could object.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-design-tokens.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Comments quote the old utilities while explaining them; do not count them. */
function stripComments(source) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(tsx|jsx)$/.test(name)) out.push(path);
  }
  return out;
}

const COMPONENTS = walk('src').map((path) => ({ path, source: stripComments(readFileSync(path, 'utf8')) }));
const TOKENS = readFileSync('src/styles/tokens.css', 'utf8');
const GLASS = stripComments(readFileSync('src/ui/Glass.tsx', 'utf8'));

test('no component picks its own blur strength', () => {
  const offenders = COMPONENTS.filter(({ source }) => /backdrop-blur/.test(source)).map(({ path }) => path);
  assert.deepEqual(offenders, [], `these files still use a raw backdrop-blur utility:\n${offenders.join('\n')}`);
});

test('the three glass tones are defined once, with a real fallback', () => {
  for (const cls of ['.glass,', '.glass-strong {', '.glass-inset {']) {
    assert.ok(TOKENS.includes(cls), `tokens.css is missing ${cls}`);
  }
  // Backdrop filters need -webkit- on Safari, and a device without them must get an
  // opaque fill rather than translucent text over imagery.
  assert.match(TOKENS, /-webkit-backdrop-filter: blur\(var\(--glass-blur/, 'the -webkit- prefix is declared');
  assert.match(TOKENS, /@supports not \(\(backdrop-filter/, 'a no-backdrop-filter fallback exists');
  for (const token of ['--glass-blur:', '--glass-blur-strong:', '--glass-blur-inset:', '--glass-saturate:', '--glass-edge:']) {
    assert.ok(TOKENS.includes(token), `tokens.css is missing ${token}`);
  }
});

test('phones do not pay for blur passes', () => {
  // The mobile performance rule predates the primitive and only covered `.surface`.
  const mobile = TOKENS.slice(TOKENS.indexOf('@media (max-width: 768px)'));
  for (const cls of ['.glass,', '.glass-strong', '.glass-inset']) {
    assert.ok(mobile.includes(cls), `the mobile rule does not disable ${cls}`);
  }
  assert.match(mobile, /backdrop-filter: none/, 'the mobile rule still disables backdrop-filter');
});

test('motion is tokenised and reduced-motion is honoured', () => {
  for (const token of ['--duration-fast:', '--duration-base:', '--duration-slow:']) {
    assert.ok(TOKENS.includes(token), `tokens.css is missing ${token}`);
  }
  assert.match(TOKENS, /@media \(prefers-reduced-motion: reduce\)/, 'reduced-motion is not honoured');
});

test('the primitive is the map from tone to class, and it is actually used', () => {
  assert.match(GLASS, /panel: 'glass'/, 'panel maps to .glass');
  assert.match(GLASS, /strong: 'glass-strong'/, 'strong maps to .glass-strong');
  assert.match(GLASS, /inset: 'glass-inset'/, 'inset maps to .glass-inset');

  const adopters = COMPONENTS.filter(({ path, source }) => path !== 'src/ui/Glass.tsx' && /from '[^']*Glass'/.test(source));
  assert.ok(adopters.length >= 3, `expected the primitive in at least 3 components, found ${adopters.length}`);

  // The migration moved 69 utilities into tone classes; a low count means classes
  // were deleted rather than replaced, which would silently un-style surfaces.
  const usages = COMPONENTS.reduce(
    (total, { source }) => total + (source.match(/\bglass(-strong|-inset)?\b/g) || []).length,
    0
  );
  assert.ok(usages >= 60, `only ${usages} glass class usages remain; the migration should not reduce surface count`);
});
