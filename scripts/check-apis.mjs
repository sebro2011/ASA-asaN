#!/usr/bin/env node
/**
 * Replay the whole API inventory against a deployed origin.
 *
 *   npm run check:apis -- https://your-app.vercel.app
 *
 * Same table as the in-process test (`scripts/test-api-routes.mjs`), so this is
 * the version to run where there is network: it tells you which endpoints a real
 * deployment currently serves, which are degraded because they have no keys, and
 * which ones are actually broken.
 */
import { API_ROUTES, verdict } from './api-routes.mjs';

const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!base) {
  console.error('usage: npm run check:apis -- https://your-app.vercel.app');
  process.exit(2);
}

async function call(route) {
  const started = Date.now();
  try {
    const response = await fetch(base + route.path, {
      method: route.method,
      headers: { Accept: 'application/json', ...(route.body ? { 'Content-Type': 'application/json' } : {}) },
      body: route.body ? JSON.stringify(route.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    const nonJson = !contentType.includes('json');
    return {
      route,
      status: response.status,
      ms: Date.now() - started,
      nonJson,
      body,
      outcome: nonJson ? 'not JSON' : verdict(route, response.status, body),
    };
  } catch (error) {
    return {
      route,
      status: 0,
      ms: Date.now() - started,
      nonJson: false,
      body: null,
      outcome: error?.name === 'TimeoutError' ? 'timed out' : 'unreachable',
    };
  }
}

console.log(`\nAPI check — ${base}`);
console.log(`${'='.repeat(78)}`);

const results = [];
for (const route of API_ROUTES) {
  const result = await call(route);
  results.push(result);
  const mark = result.outcome === 'ok' ? 'ok  ' : 'FAIL';
  console.log(
    `${mark} ${String(result.status || '---').padEnd(4)} ${route.method.padEnd(4)} ${route.path}` +
      `${result.outcome === 'ok' ? '' : `  ← ${result.outcome}`}` +
      `  (${result.ms}ms)`,
  );
}

const failed = results.filter((result) => result.outcome !== 'ok');
const degraded = results.filter(
  (result) => result.outcome === 'ok' && [503, 502, 504].includes(result.status),
);

console.log(`${'='.repeat(78)}`);
console.log(`${results.length} routes · ${results.length - failed.length} ok · ${degraded.length} degraded · ${failed.length} failed`);

if (degraded.length) {
  console.log('\nDegraded (expected without credentials or with no upstream):');
  for (const result of degraded) console.log(`  ${result.status} ${result.route.path} — ${result.route.why}`);
}

if (failed.length) {
  console.log('\nFailed:');
  for (const result of failed) {
    console.log(`  ${result.status || '(no response)'} ${result.method} ${result.route.path} — ${result.outcome}`);
    console.log(`    ${result.route.why}`);
  }
  process.exit(1);
}

process.exit(0);
