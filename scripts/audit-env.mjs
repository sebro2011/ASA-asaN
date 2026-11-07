#!/usr/bin/env node
/**
 * Environment and secret audit.
 *
 * Answers three questions without ever printing a value:
 *   1. which environment variables does the server actually read, and is each one
 *      documented in `.env.example`?
 *   2. does any server-only secret leak into browser code (`src/**`) or into a
 *      `VITE_*` name that Vite would inline into the bundle?
 *   3. does the built bundle contain a credential — either a recognisable key
 *      pattern or the literal value of a variable set in this environment?
 *
 *   npm run audit:env            # static audit
 *   npm run audit:env -- --dist  # also scan dist/ after a build
 *
 * Exit code 1 means a real leak or a browser-visible secret. Missing optional
 * variables are reported, not failed.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIST = process.argv.includes('--dist');

const SERVER_SOURCES = ['server.ts', 'vite.config.ts'];
for (const dir of ['server', 'api']) {
  const path = join(ROOT, dir);
  if (!existsSync(path)) continue;
  for (const entry of readdirSync(path)) {
    if (!/\.(ts|js|mjs)$/.test(entry)) continue;
    if (dir === 'api' && entry === 'index.js') continue; // generated bundle
    SERVER_SOURCES.push(`${dir}/${entry}`);
  }
}

/** Browser code — anything here ships to the client and must never see a secret. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(entry)) continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const read = (path) => readFileSync(path, 'utf8');

/** Comments are documentation, not code: a key mentioned in prose is not a leak. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/* ------------------------------------------------------------ 1. the vars */

const envPatterns = [
  /process\.env\.([A-Z0-9_]+)/g,
  /getProcessEnv\(\)\.([A-Z0-9_]+)/g,
  /\benv\.([A-Z][A-Z0-9_]{2,})\b/g,
  /envValue\(env,\s*'([A-Z0-9_]+)'\)/g,
];

/** name → { files:Set, pages:Set } */
const usage = new Map();
for (const file of SERVER_SOURCES) {
  if (!existsSync(join(ROOT, file))) continue;
  const source = read(join(ROOT, file));
  for (const pattern of envPatterns) {
    for (const match of source.matchAll(pattern)) {
      const name = match[1];
      if (!usage.has(name)) usage.set(name, new Set());
      usage.get(name).add(file);
    }
  }
}

// A name counts as documented when it is a real assignment or a commented one
// (platform-provided variables are documented but never set by hand).
const documented = new Set(
  [...read(join(ROOT, '.env.example')).matchAll(/^#?\s*([A-Z][A-Z0-9_]{2,})\s*=/gm)].map(
    (match) => match[1],
  ),
);

const SECRET = /(API_KEY|_KEY|SECRET|TOKEN|PASSWORD|SERVICE_ROLE)/;
const PUBLIC_OK = /(PUBLISHABLE|ANON_KEY)/;
const BROWSER_EXPOSED = /^VITE_/;

function classify(name) {
  if (BROWSER_EXPOSED.test(name)) return 'BROWSER';
  if (PUBLIC_OK.test(name)) return 'public';
  if (SECRET.test(name)) return 'secret';
  return 'internal';
}

/* ------------------------------------------------- 2. browser-code scanning */

const clientFiles = walk(join(ROOT, 'src'));
const clientLeaks = new Set();
for (const file of clientFiles) {
  const source = stripComments(read(file));
  for (const name of usage.keys()) {
    if (classify(name) !== 'secret') continue;
    if (source.includes(name)) {
      clientLeaks.add(`${relative(ROOT, file)} references ${name}`);
    }
  }
  if (/import\.meta\.env\./.test(source)) {
    clientLeaks.add(`${relative(ROOT, file)} reads import.meta.env (Vite inlines these)`);
  }
  for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
    clientLeaks.add(`${relative(ROOT, file)} reads process.env.${match[1]} at runtime`);
  }
}

/* ------------------------------------------------------- 3. bundle scanning */

const KEY_PATTERNS = [
  ['Google API key', /AIza[0-9A-Za-z_-]{30,}/g],
  ['OpenAI-style key', /\bsk-[A-Za-z0-9]{20,}/g],
  ['OpenRouter key', /\bsk-or-v1-[A-Za-z0-9]{16,}/g],
  ['Arena key', /\barena-sk-[A-Za-z0-9]{8,}/g],
  ['Groq key', /\bgsk_[A-Za-z0-9]{20,}/g],
  ['Supabase secret', /\bsb_secret_[A-Za-z0-9_-]{10,}/g],
  ['service_role JWT claim', /"role"\s*:\s*"service_role"/g],
];

const bundleFindings = [];
if (SCAN_DIST) {
  const assets = join(ROOT, 'dist', 'assets');
  const files = existsSync(assets) ? readdirSync(assets).filter((f) => f.endsWith('.js')) : [];
  if (files.length === 0) {
    console.error('no dist/assets/*.js found — run `npm run build` first');
    process.exit(2);
  }
  // Values of variables that exist in this process: the strongest possible check.
  const setValues = [...usage.keys()]
    .map((name) => ({ name, value: (process.env[name] || '').trim() }))
    .filter((entry) => entry.value.length >= 12);

  for (const file of files) {
    const source = read(join(assets, file));
    for (const [label, pattern] of KEY_PATTERNS) {
      if (pattern.test(source)) bundleFindings.push(`${file}: ${label} pattern found`);
      pattern.lastIndex = 0;
    }
    for (const { name, value } of setValues) {
      if (source.includes(value)) bundleFindings.push(`${file}: contains the value of ${name}`);
    }
  }
}

/* ------------------------------------------------------------------ report */

const rows = [...usage.keys()]
  .sort()
  .map((name) => ({
    name,
    scope: classify(name),
    used: [...usage.get(name)].join(', '),
    documented: documented.has(name),
    present: Boolean((process.env[name] || '').trim()),
  }));

const pad = (value, width) => String(value).padEnd(width);
console.log('\nEnvironment audit — variable names only, no values\n' + '='.repeat(78));
console.log(`${pad('VARIABLE', 32)}${pad('SCOPE', 10)}${pad('DOCS', 6)}${pad('HERE', 6)}USED IN`);
for (const row of rows) {
  console.log(
    `${pad(row.name, 32)}${pad(row.scope, 10)}${pad(row.documented ? 'yes' : 'NO', 6)}${pad(
      row.present ? 'set' : '—',
      6,
    )}${row.used}`,
  );
}

const undocumented = rows.filter((row) => !row.documented);
const missingSecrets = rows.filter((row) => row.scope === 'secret' && !row.present);

console.log(`\n${rows.length} variables · ${rows.filter((r) => r.present).length} set here · ${undocumented.length} undocumented`);

if (missingSecrets.length) {
  console.log('\nNot set in this environment (optional unless the feature is used):');
  for (const row of missingSecrets) console.log(`  ${row.name}`);
}

if (undocumented.length) {
  console.log('\nUndocumented (add to .env.example so operators know they exist):');
  for (const row of undocumented) console.log(`  ${row.name}`);
}

const problems = [];
for (const leak of clientLeaks) problems.push(`browser code: ${leak}`);
for (const finding of bundleFindings) problems.push(`bundle: ${finding}`);
const browserScoped = rows.filter((row) => row.scope === 'BROWSER');
for (const row of browserScoped) problems.push(`VITE_ variable used: ${row.name}`);

if (problems.length) {
  console.log('\nFAILURES');
  for (const problem of problems) console.log(`  ✗ ${problem}`);
  process.exit(1);
}

console.log(`\n✓ no secret is reachable from browser code${SCAN_DIST ? ' or from the built bundle' : ''}`);
