/**
 * i18n coverage audit (dev-only): every t('...') key used in src must exist
 * in the en/si/ta resource bundles. Missing keys render as raw dotted keys in
 * the UI — a visible glitch.
 *
 * Run: node --import tsx scripts/i18n-audit.mjs
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import i18n from '../src/i18n.ts';

const files = execSync('grep -rl "" src --include=*.tsx --include=*.jsx --include=*.ts', { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter((f) => !f.startsWith('src/i18n'));

// Match t('key') / t("key") with single-segment keys (this app's convention).
// The app has two translation systems: i18next (useTranslation) and the
// TrilingualProvider (useTrilingual), each with its own dictionary — attribute
// each call site to the system its file actually consumes.
const langs = ['en', 'si', 'ta'];
const keyRe = /\bt\(\s*['"]([a-zA-Z][a-zA-Z0-9_]+)['"]/g;
const i18nKeys = new Map(); // key -> [files]
const providerKeys = new Map();
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const usesProvider = /useTrilingual/.test(src);
  const bucket = usesProvider && !/useTranslation/.test(src) ? providerKeys : i18nKeys;
  let m;
  while ((m = keyRe.exec(src))) {
    const key = m[1];
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push(file);
  }
}

// Provider dictionary coverage (src/context/TrilingualProvider.jsx)
const { TRILINGUAL_DICTIONARY } = await import('../src/context/TrilingualProvider.jsx');
const providerMissing = [];
for (const [key, refs] of providerKeys) {
  for (const lang of langs) {
    if (!TRILINGUAL_DICTIONARY[lang]?.[key]) {
      providerMissing.push({ key, lang, refs: [...new Set(refs)].slice(0, 3) });
    }
  }
}
const used = i18nKeys;

const missing = [];
for (const [key, refs] of used) {
  for (const lang of langs) {
    const bundle = i18n.getResourceBundle(lang, 'translation') || {};
    if (!(key in bundle) || bundle[key] === undefined || bundle[key] === null) {
      missing.push({ key, lang, refs: [...new Set(refs)].slice(0, 3) });
    }
  }
}

console.log(`i18next t() keys used: ${i18nKeys.size}; provider t() keys used: ${providerKeys.size}`);
console.log(`Bundle sizes: ${langs.map((l) => `${l}=${Object.keys(i18n.getResourceBundle(l, 'translation') || {}).length}`).join(', ')}`);
if (providerMissing.length) {
  console.log(`\n✘ ${providerMissing.length} missing provider dictionary key/language pair(s):`);
  for (const { key, lang, refs } of providerMissing) {
    console.log(`  [${lang}] ${key}  (used in ${refs.join(', ')})`);
  }
} else {
  console.log('✔ Every provider t() key exists in all three provider dictionaries.');
}
if (!missing.length) {
  console.log('✔ Every used key exists in all three languages.');
} else {
  console.log(`\n✘ ${missing.length} missing key/language pair(s):`);
  for (const { key, lang, refs } of missing) {
    console.log(`  [${lang}] ${key}  (used in ${refs.join(', ')})`);
  }
}

// Also flag untranslated (English text leaking into si/ta bundles)
const en = i18n.getResourceBundle('en', 'translation') || {};
const si = i18n.getResourceBundle('si', 'translation') || {};
const ta = i18n.getResourceBundle('ta', 'translation') || {};
const leakSi = [], leakTa = [];
for (const [key, val] of Object.entries(en)) {
  if (typeof val !== 'string') continue;
  const ascii = /^[\x00-\x7F\s.,!?:;()%/0-9&'’\-\u2192·•→…]+$/;
  if (si[key] === val && /[a-zA-Z]{4}/.test(val) && ascii.test(val)) leakSi.push(key);
  if (ta[key] === val && /[a-zA-Z]{4}/.test(val) && ascii.test(val)) leakTa.push(key);
}
console.log(`\nEnglish-identical values (possibly untranslated): si=${leakSi.length}, ta=${leakTa.length}`);
if (leakSi.length) console.log('  si:', leakSi.slice(0, 25).join(', '));
if (leakTa.length) console.log('  ta:', leakTa.slice(0, 25).join(', '));
