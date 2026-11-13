/**
 * Security headers and proxy trust — two policies that were previously untestable
 * because they were string literals and a missing line inside `server.ts`.
 *
 * Audit m10: production shipped `script-src 'self' 'unsafe-inline'`, which is very
 * nearly `'unsafe-scripts'`. The comment claimed it was "React inline handlers
 * only" — but React attaches listeners through the DOM and never uses inline
 * event attributes, so the exception protected nothing except the two inline
 * `<script>` blocks, both of which are now external files.
 *
 * Audit M3: `app.set('trust proxy')` was never called, so `req.ip` was the
 * platform proxy's address and every per-IP rate limit was one shared bucket.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-security-headers.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCsp, securityHeaders } from '../server/securityHeaders.ts';
import { parseTrustProxy } from '../server/trustProxy.ts';

const scriptSrc = (csp) => (csp.match(/script-src[^;]*/) || [''])[0];

/* ----------------------------------------------------------------------- CSP */

test('production allows no inline script', () => {
  const csp = buildCsp({ isSecure: true });
  const directive = scriptSrc(csp);
  assert.match(directive, /'self'/, 'same-origin bundles must still load');
  assert.doesNotMatch(directive, /unsafe-inline/, "script-src must not carry 'unsafe-inline' in production");
  assert.doesNotMatch(directive, /unsafe-eval/, "production must not allow eval");
  assert.doesNotMatch(csp, /unsafe-eval/, 'nowhere at all');
});

test('development still allows what Vite needs', () => {
  const directive = scriptSrc(buildCsp({ isSecure: false }));
  assert.match(directive, /unsafe-inline/, 'Vite injects its HMR client inline');
  assert.match(directive, /unsafe-eval/, 'the React refresh preamble needs eval');
});

test('inline styles stay allowed, and that is the only unsafe-inline left', () => {
  const csp = buildCsp({ isSecure: true });
  assert.match(csp, /style-src 'self' 'unsafe-inline'/, 'components set style attributes directly');
  const inlineUses = csp.match(/unsafe-inline/g) || [];
  assert.equal(inlineUses.length, 1, 'exactly one directive may use it — style-src');
});

test('the framing, base and form directives stay restrictive', () => {
  const csp = buildCsp({ isSecure: true });
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /form-action 'self'/);
  assert.match(csp, /frame-src 'self' https:\/\/www\.youtube\.com https:\/\/www\.youtube-nocookie\.com https:\/\/player\.vimeo\.com/);
  assert.doesNotMatch(csp, /frame-src[^;]*https:\s*(;|$)/, 'never a wildcard https: for frames');
});

test('HSTS is production-only', () => {
  assert.ok(securityHeaders({ isSecure: true })['Strict-Transport-Security']);
  assert.equal(securityHeaders({ isSecure: false })['Strict-Transport-Security'], undefined);
  for (const options of [{ isSecure: true }, { isSecure: false }]) {
    const headers = securityHeaders(options);
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['X-Frame-Options'], 'SAMEORIGIN');
    assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  }
});

test('index.html ships no inline script', () => {
  // Strip HTML comments first: they mention `<script>` and `<body>` while
  // explaining this very rule, and would otherwise satisfy or break the checks.
  const html = readFileSync('index.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1].trim())
    .filter((body) => body.length > 0);
  assert.deepEqual(inline, [], 'an inline script would force unsafe-inline back into the CSP');

  // The theme boot must survive the move, and must run before <body>.
  assert.match(html, /<script src="\/theme-boot\.js"><\/script>/, 'theme-boot must be a same-origin script');
  const bodyTag = /<body[\s>]/.exec(html);
  assert.ok(bodyTag, 'index.html must have a body');
  assert.ok(html.indexOf('/theme-boot.js') < bodyTag.index, 'it must be in <head> to prevent a palette flash');

  const boot = readFileSync('public/theme-boot.js', 'utf8');
  assert.match(boot, /data-nova-theme/, 'the boot script still resolves the palette');
  assert.match(boot, /localStorage\.getItem\('nova_theme'\)/);
});

test('the PWA registers from a file, not an inline injection', () => {
  const config = readFileSync('vite.config.ts', 'utf8');
  assert.match(config, /injectRegister:\s*'script'/, "vite-plugin-pwa must write /registerSW.js instead of inlining it");
});

test('server.ts takes its headers from the tested module', () => {
  const source = readFileSync('server.ts', 'utf8');
  assert.match(source, /securityHeaders\(\{ isSecure \}\)/, 'one source of truth for the header set');
  assert.doesNotMatch(source, /"script-src 'self' 'unsafe-inline'"/, 'the old permissive prod CSP is back');
});

/* -------------------------------------------------------------- trust proxy */

test('proxy trust defaults to one hop and refuses a blanket "true"', () => {
  assert.deepEqual(parseTrustProxy(undefined), { value: 1, source: 'default' });
  assert.deepEqual(parseTrustProxy('  '), { value: 1, source: 'default' });

  const blanket = parseTrustProxy('true');
  assert.equal(blanket.value, 1, 'trusting every hop makes req.ip attacker-controlled');
  assert.ok(blanket.warning, 'and says so');

  assert.equal(parseTrustProxy('0').value, false, 'a directly exposed deployment trusts nothing');
  assert.equal(parseTrustProxy('false').value, false);
  assert.equal(parseTrustProxy('2').value, 2);
  assert.deepEqual(parseTrustProxy('loopback, 10.0.0.0/8').value, ['loopback', '10.0.0.0/8']);
  assert.ok(parseTrustProxy('banana').warning, 'garbage is reported, not silently trusted');
  assert.equal(parseTrustProxy('banana').value, 1);
});

test('the app actually sets it', async () => {
  const { app } = await import('../server.ts');
  assert.notEqual(app.get('trust proxy'), undefined, "Express' default is undefined: no proxy support at all");
});

test('a real response carries the header the policy builds', async () => {
  const { app } = await import('../server.ts');
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const header = response.headers.get('content-security-policy');
    assert.ok(header, 'every response must carry a CSP');
    const expected = buildCsp({ isSecure: process.env.NODE_ENV === 'production' });
    assert.equal(header, expected, 'the header is built by the tested function, not a second copy');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
