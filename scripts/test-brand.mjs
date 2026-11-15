/**
 * Brand contract — COSMORA is the platform, NASA is the source.
 *
 * A rename is not cosmetic in this project: the interface is an *independent*
 * product that reads NASA data, and the distinction has to survive every edit.
 * Two failures matter:
 *
 * 1. The old product name creeping back into a surface a reader sees (header,
 *    install prompt, manifest, document title) — which happened before, because
 *    the name lived in nine separate places including three language dictionaries.
 * 2. The product quietly implying it *is* NASA. Every place that names the brand
 *    must keep crediting NASA as the data source and disclaiming endorsement.
 *
 * Historical documents (audits, phase reports) are deliberately not checked: they
 * record what the product was called when they were written, and rewriting them
 * would falsify the record.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-brand.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

/** Files a reader can actually see or install. */
const SURFACES = [
  'index.html',
  'public/manifest.json',
  'src/ui/AppHeader.tsx',
  'src/ui/AppFooter.tsx',
  'src/components/PWAInstallButton.tsx',
  'src/i18n/en/base.ts',
  'src/i18n/si/base.ts',
  'src/i18n/ta/base.ts'
];

test('the product is COSMORA on every installable and visible surface', () => {
  for (const file of SURFACES) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /NASA Space Explorer/,
      `${file} still shows the retired product name`
    );
  }

  const html = read('index.html');
  assert.match(html, /<title>COSMORA — /, 'the document title leads with the product name');

  const manifest = JSON.parse(read('public/manifest.json'));
  assert.equal(manifest.name, 'COSMORA');
  assert.equal(manifest.short_name, 'COSMORA', 'an install prompt has room for the brand, not a fragment');
});

test('the brand stays three languages deep, not just English', () => {
  for (const lang of ['en', 'si', 'ta']) {
    const source = read(`src/i18n/${lang}/base.ts`);
    assert.match(source, /appName: 'COSMORA'/, `${lang} appName must be the brand`);
  }
});

test('crediting NASA is part of the brand, not a footnote', () => {
  // The platform reads NASA data and says so wherever it introduces itself, and
  // it is not an official NASA product.
  const html = read('index.html');
  assert.match(html, /COSMORA — NASA imagery/, 'the description credits NASA as the source');

  const footer = read('src/ui/AppFooter.tsx');
  assert.match(footer, /Not affiliated with or\s+endorsed by the National Aeronautics and Space Administration|not affiliated/i);

  const manifest = JSON.parse(read('public/manifest.json'));
  assert.match(manifest.description, /NASA imagery/, 'the manifest credits NASA too');
});

test('the assistant keeps its own name', () => {
  // COSMORA is the platform; NOVA is the assistant inside it. One brand eating
  // the other would make "ask NOVA" meaningless.
  const copy = read('src/i18n/en/interfaceCopy.ts');
  assert.match(copy, /navAskNova/, 'the assistant is still addressable by name');
  const content = read('server/earth/providers.ts');
  assert.match(content, /COSMORA Earth Intelligence Lab/, 'the analyst introduces itself with the platform name');
});
