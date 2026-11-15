/**
 * Brand contract — COSMORA is the platform, NASA is the source, NOVA is the assistant.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-brand.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const SURFACES = [
  'index.html',
  'metadata.json',
  'public/manifest.json',
  'src/ui/AppHeader.tsx',
  'src/ui/AppFooter.tsx',
  'src/components/WelcomeScreen.tsx',
  'src/components/PWAInstallButton.tsx',
  'src/context/TrilingualProvider.jsx',
  'src/i18n/translations.ts',
  'src/i18n/en/base.ts',
  'src/i18n/si/base.ts',
  'src/i18n/ta/base.ts',
  'src/i18n/en/interfaceCopy.ts',
  'src/i18n/si/interfaceCopy.ts',
  'src/i18n/ta/interfaceCopy.ts',
];

test('the product is COSMORA on every installable and visible surface', () => {
  for (const file of SURFACES) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /NASA Space Explorer|NASA අභ්‍යවකාශ ගවේෂක|නාසා විශ්ව ගවේෂකය|நாசா விண்வெளி ஆய்வு மையம்|NASA விண்வெளி ஆய்வி/,
      `${file} still shows a retired product name`
    );
  }

  const html = read('index.html');
  assert.match(html, /<title>COSMORA — /, 'the document title leads with COSMORA');
  assert.match(html, /content="COSMORA"\s*\/>/, 'apple/application title is COSMORA');

  const manifest = JSON.parse(read('public/manifest.json'));
  assert.equal(manifest.name, 'COSMORA');
  assert.equal(manifest.short_name, 'COSMORA');

  const metadata = JSON.parse(read('metadata.json'));
  assert.equal(metadata.name, 'COSMORA');

  assert.equal(existsSync('public/brand/space-explorer-lockup.png'), false, 'retired lockup PNG removed');
  assert.equal(existsSync('public/brand/space-explorer-lockup.webp'), false, 'retired lockup WebP removed');
  assert.equal(existsSync('public/brand/og-image.png'), true, 'COSMORA social preview exists');
});

test('the brand stays three languages deep across dictionaries and install copy', () => {
  for (const lang of ['en', 'si', 'ta']) {
    const base = read(`src/i18n/${lang}/base.ts`);
    assert.match(base, /appName:\s*'COSMORA'/, `${lang} base appName must be COSMORA`);
    const copy = read(`src/i18n/${lang}/interfaceCopy.ts`);
    assert.match(copy, /welcomeEyebrow:\s*'COSMORA'/, `${lang} welcomeEyebrow must be COSMORA`);
  }

  const pwa = read('src/components/PWAInstallButton.tsx');
  assert.equal((pwa.match(/COSMORA/g) || []).length >= 6, true, 'all 3 language install prompts name COSMORA');
});

test('crediting NASA as the data source and disclaiming endorsement remains intact', () => {
  const html = read('index.html');
  assert.match(html, /COSMORA — NASA imagery/, 'the meta description credits NASA as the source');

  const footer = read('src/ui/AppFooter.tsx');
  assert.match(footer, /Not affiliated with or\s+endorsed by the National Aeronautics and Space Administration/i);

  const manifest = JSON.parse(read('public/manifest.json'));
  assert.match(manifest.description, /NASA imagery/, 'the manifest credits NASA too');
});

test('NOVA remains the assistant name inside COSMORA', () => {
  const copy = read('src/i18n/en/interfaceCopy.ts');
  assert.match(copy, /navAskNova/, 'the assistant is still addressable as NOVA');
  const content = read('server/earth/providers.ts');
  assert.match(content, /COSMORA Earth Intelligence Lab/, 'the analyst introduces itself inside COSMORA');
});
