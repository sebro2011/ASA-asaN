/**
 * NOVA HYPOTHESIS FORGE — interface copy and wiring tests.
 *
 * These tests do not render React (the project has no DOM test harness); they
 * verify the properties that actually break trilingual products:
 *   - key parity between English, Sinhala and Tamil;
 *   - no empty or placeholder-only strings;
 *   - identical interpolation placeholders per key;
 *   - no transliteration corruption (a Sinhala/Tamil glyph glued to Latin text);
 *   - every statically referenced `hf*` key exists;
 *   - the honesty wording cannot drift into a proof claim;
 *   - the copy is actually merged into the i18next resources;
 *   - the surface imports the mandatory chart frame and does not invent numbers.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const { hypothesisForgeCopy, HYPOTHESIS_FORGE_KEYS } = await import(
  join(root, 'src/i18n/hypothesisForge.ts')
);

const LANGUAGES = ['en', 'si', 'ta'];
const SOURCE = readFileSync(join(root, 'src/i18n/hypothesisForge.ts'), 'utf8');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

const surfaceFiles = walk(join(root, 'src/features/hypothesis-forge'));
const surfaceSource = surfaceFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

test('all three languages are present and non-trivial', () => {
  assert.deepEqual(Object.keys(hypothesisForgeCopy).sort(), [...LANGUAGES].sort());
  assert.ok(HYPOTHESIS_FORGE_KEYS.length >= 180, `expected ≥180 keys, found ${HYPOTHESIS_FORGE_KEYS.length}`);
  for (const language of LANGUAGES) {
    assert.ok(Object.keys(hypothesisForgeCopy[language]).length >= 180, `${language} is incomplete`);
  }
});

test('key sets are identical across languages', () => {
  const baseline = new Set(HYPOTHESIS_FORGE_KEYS);
  for (const language of LANGUAGES) {
    const keys = new Set(Object.keys(hypothesisForgeCopy[language]));
    const missing = [...baseline].filter((key) => !keys.has(key));
    const extra = [...keys].filter((key) => !baseline.has(key));
    assert.deepEqual(missing, [], `${language} is missing: ${missing.join(', ')}`);
    assert.deepEqual(extra, [], `${language} has unexpected keys: ${extra.join(', ')}`);
  }
});

test('every key is defined exactly once per language block', () => {
  const blocks = SOURCE.split(/\nconst (?:en|si|ta): Copy = \{/).slice(1);
  assert.equal(blocks.length, 3);
  for (const [index, block] of blocks.entries()) {
    const body = block.split('\n};')[0];
    const keys = [...body.matchAll(/^\s{2}(hf[A-Za-z0-9]+):/gm)].map((match) => match[1]);
    const duplicates = keys.filter((key, position) => keys.indexOf(key) !== position);
    assert.deepEqual(duplicates, [], `${LANGUAGES[index]} duplicates: ${duplicates.join(', ')}`);
  }
});

test('no empty values and no accidental English fallback for prose keys', () => {
  for (const language of LANGUAGES) {
    for (const key of HYPOTHESIS_FORGE_KEYS) {
      const value = hypothesisForgeCopy[language][key];
      assert.equal(typeof value, 'string', `${language}.${key} is not a string`);
      assert.ok(value.trim().length > 0, `${language}.${key} is empty`);
    }
  }
  const proseKeys = HYPOTHESIS_FORGE_KEYS.filter((key) => /Hint|Intro|Honesty|DecisionNote|Note$/.test(key));
  assert.ok(proseKeys.length >= 8, 'expected several explanatory keys');
  for (const key of proseKeys) {
    assert.notEqual(hypothesisForgeCopy.si[key], hypothesisForgeCopy.en[key], `si.${key} fell back to English`);
    assert.notEqual(hypothesisForgeCopy.ta[key], hypothesisForgeCopy.en[key], `ta.${key} fell back to English`);
  }
});

test('interpolation placeholders match across languages', () => {
  const placeholders = (value) => [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort();
  for (const key of HYPOTHESIS_FORGE_KEYS) {
    const en = placeholders(hypothesisForgeCopy.en[key]);
    for (const language of ['si', 'ta']) {
      assert.deepEqual(placeholders(hypothesisForgeCopy[language][key]), en, `${language}.${key} placeholder drift`);
    }
  }
});

test('no transliteration corruption in Sinhala or Tamil copy', () => {
  const corruption = /[\u0D80-\u0DFF\u0B80-\u0BFF][a-z]{2,}/;
  for (const language of ['si', 'ta']) {
    for (const key of HYPOTHESIS_FORGE_KEYS) {
      assert.ok(!corruption.test(hypothesisForgeCopy[language][key]), `${language}.${key}: ${hypothesisForgeCopy[language][key]}`);
    }
  }
});

test('honesty wording never claims proof or precedence', () => {
  const forbidden = [/world'?s first/i, /\bproven\b/i, /guarantee[sd]?/i, /ground[- ]breaking/i];
  for (const language of LANGUAGES) {
    for (const key of HYPOTHESIS_FORGE_KEYS) {
      const value = hypothesisForgeCopy[language][key];
      for (const pattern of forbidden) {
        assert.ok(!pattern.test(value), `${language}.${key} contains ${pattern}`);
      }
      // "not peer-reviewed" is the honest framing we require; a bare claim is not.
      if (/peer[- ]reviewed/i.test(value)) {
        assert.match(value, /not a peer[- ]reviewed|not peer[- ]reviewed|never peer[- ]reviewed/i, `${language}.${key} implies peer review`);
      }
    }
  }
});

test('copy contains no markup or template artefacts', () => {
  for (const language of LANGUAGES) {
    for (const key of HYPOTHESIS_FORGE_KEYS) {
      const value = hypothesisForgeCopy[language][key];
      assert.ok(!/<[a-z/][^>]*>/i.test(value), `${language}.${key} contains HTML`);
      assert.ok(!/\bundefined\b|\bnull\b|\bTODO\b/.test(value), `${language}.${key} contains a template artefact`);
    }
  }
});

test('every statically referenced interface key exists', () => {
  const referenced = new Set();
  for (const match of surfaceSource.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)) referenced.add(match[1]);
  // Keys held in lookup tables rather than inline calls.
  for (const match of surfaceSource.matchAll(/'(hf[A-Za-z0-9]+)'/g)) referenced.add(match[1]);
  const missing = [...referenced].filter((key) => key.startsWith('hf') && !HYPOTHESIS_FORGE_KEYS.includes(key));
  assert.deepEqual(missing, [], `unresolved keys: ${missing.join(', ')}`);
  assert.ok(referenced.size > 90, `expected many referenced keys, found ${referenced.size}`);
});

test('the copy is merged into the i18next resources', () => {
  const i18n = readFileSync(join(root, 'src/i18n.ts'), 'utf8');
  assert.match(i18n, /import \{ hypothesisForgeCopy \} from '\.\/i18n\/hypothesisForge'/);
  assert.match(i18n, /Object\.assign\(bucket, hypothesisForgeCopy\[lang\]\)/);
});

test('the surface is chart-frame compliant and serves all eight sections', () => {
  const charts = readFileSync(join(root, 'src/features/hypothesis-forge/ForgeCharts.tsx'), 'utf8');
  const surface = readFileSync(join(root, 'src/features/hypothesis-forge/ForgeSurface.tsx'), 'utf8');
  assert.match(charts, /from '\.\.\/\.\.\/ui\/ChartFrame'/);
  for (const chart of ['TimeSeriesChart', 'RelationshipScatter', 'LagChart', 'EvidenceChart', 'QualityChart', 'HypothesisGraph']) {
    assert.match(charts, new RegExp(`export function ${chart}`), `${chart} missing`);
    assert.match(surface, new RegExp(chart), `${chart} not mounted`);
  }
  for (const section of ['workspace', 'hypotheses', 'data', 'evidence', 'analysis', 'counter', 'passport', 'history']) {
    assert.ok(surface.includes(`'${section}'`), `section ${section} missing`);
  }
  assert.match(surface, /passportToJson|passportToMarkdown|passportToHtml/);
  assert.match(surface, /role="tablist"/);
});

test('the surface never fabricates observations or bypasses the API', () => {
  assert.ok(!/Math\.random|mockData|mock_data|faker|sampleSeries/.test(surfaceSource), 'surface contains fabricated data');
  assert.ok(!/https:\/\/api\.nasa\.gov|api_key=/i.test(surfaceSource), 'surface must not call NASA directly');
  assert.match(surfaceSource, /from '\.\.\/\.\.\/lib\/forge\/client'/);
});

test('all generated interface copy is explicitly labelled as generated', () => {
  assert.match(hypothesisForgeCopy.en.hfHonesty, /generated by explicit rules/i);
  assert.match(hypothesisForgeCopy.en.hfEngineNote, /No model-generated statistics/i);
  assert.match(hypothesisForgeCopy.en.hfDecisionNote, /never changes the measurements|not a finding|not evidence/i);
  assert.match(hypothesisForgeCopy.en.hfPassportDisclaimer, /not a peer-reviewed publication|not a peer-reviewed/i);
});
