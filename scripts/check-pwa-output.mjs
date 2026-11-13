/**
 * Post-build check of the production output.
 *
 * Two risks this guards, both discovered the hard way:
 *
 * 1. `package.json` overrides force `glob`/`minimatch` past the ranges
 *    workbox-build declares, to clear two moderate advisories. If a future bump
 *    makes workbox's file matching silently return nothing, the service worker
 *    would still build — with an **empty precache** — and the app would look fine
 *    online while being broken offline. The entry count is the signal.
 * 2. The CSP now says `script-src 'self'`. That is only true while every
 *    `<script>` in the built HTML has a `src`. A new inline script would break the
 *    app at runtime, in production only, with no error in the build log.
 *
 * Run after `vite build` (it is wired into `npm run build`):
 *   node scripts/check-pwa-output.mjs
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const problems = [];
const expected = (condition, message) => {
  if (!condition) problems.push(message);
};

const dist = 'dist';
if (!existsSync(dist)) {
  console.error('check:pwa — dist/ is missing; run `npm run build` first.');
  process.exit(1);
}

/* ------------------------------------------------------------- service worker */

const swPath = join(dist, 'sw.js');
expected(existsSync(swPath), 'dist/sw.js is missing — the PWA was not generated');

let precacheEntries = 0;
if (existsSync(swPath)) {
  const sw = readFileSync(swPath, 'utf8');
  expected(sw.length > 5_000, `dist/sw.js is only ${sw.length} bytes — workbox probably failed`);
  // workbox emits the manifest with unquoted keys: `{url:"assets/…",revision:null}`.
  precacheEntries = (sw.match(/(?:^|[{,])url:"/g) || []).length;
  // 165 at the time of writing. A low floor catches "precache became empty"
  // without pinning the exact build.
  expected(precacheEntries >= 100, `dist/sw.js precaches only ${precacheEntries} entries — the glob override may have broken workbox`);
  // The denylist itself is asserted from vite.config.ts by
  // scripts/test-security-performance.mjs; here we only care that a real
  // Workbox worker was produced.
  expected(sw.includes('precacheAndRoute'), 'dist/sw.js does not register a precache route');
}

/* -------------------------------------------------------------- registration */

const registerPath = join(dist, 'registerSW.js');
expected(existsSync(registerPath), 'dist/registerSW.js is missing — the PWA would never register');

/* ------------------------------------------------------------------- the HTML */

const htmlPath = join(dist, 'index.html');
let inlineScripts = 0;
if (existsSync(htmlPath)) {
  const html = readFileSync(htmlPath, 'utf8');
  const tags = [...html.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]);
  expected(tags.length >= 2, `only ${tags.length} script tags in the built HTML`);
  inlineScripts = tags.filter((tag) => !/\bsrc=/.test(tag)).length;
  expected(inlineScripts === 0, `${inlineScripts} inline <script> tag(s) — production CSP is 'self' only, so they will not run`);
  expected(/src="\/theme-boot\.js"/.test(html), 'dist/index.html does not load /theme-boot.js');
  expected(/<script[^>]*src="\/registerSW\.js"/.test(html), 'dist/index.html does not load /registerSW.js');
}

/* -------------------------------------------------------------- static assets */

for (const asset of ['theme-boot.js', 'manifest.json', 'sw.js']) {
  expected(existsSync(join(dist, asset)), `dist/${asset} is missing`);
}

const themeBoot = join(dist, 'theme-boot.js');
if (existsSync(themeBoot)) {
  const boot = readFileSync(themeBoot, 'utf8');
  expected(boot.includes('data-nova-theme'), 'theme-boot.js no longer resolves the palette');
}

/* ------------------------------------------------------------------- the report */

if (problems.length) {
  console.error('check:pwa — the production build is not shippable:\n');
  for (const problem of problems) console.error(`  • ${problem}`);
  process.exit(1);
}

const size = existsSync(swPath) ? (statSync(swPath).size / 1024).toFixed(1) : '?';
console.log(`check:pwa — ok: ${precacheEntries} precached entries, no inline scripts, service worker ${size} kB.`);
