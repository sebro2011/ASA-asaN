/**
 * Repository hygiene: one lockfile, one identity.
 *
 * Audit m7 — `bun.lock` and `package-lock.json` both existed. Two lockfiles mean
 * two dependency graphs that drift silently: a fix installed with bun is absent
 * from the npm graph CI actually installs from, and the next `bun install`
 * reverts it. npm is the one CI, the scripts and the docs use, so bun.lock was
 * removed and npm regenerates it if anyone runs bun again.
 *
 * Audit m8 — the package called itself `react-example`, which is both untrue and
 * the reason half a dozen tooling messages referenced a name no one recognised.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-hygiene.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

test('there is exactly one lockfile, and it is npm’s', () => {
  const lockfiles = readdirSync('.').filter((name) => /^(bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(name));
  assert.deepEqual(lockfiles, ['package-lock.json'], `found ${lockfiles.join(', ')} — two dependency graphs drift apart silently`);
});

test('package.json and package-lock.json agree on name and version', () => {
  // npm tolerates a mismatch here, which is exactly why it goes unnoticed.
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  assert.equal(lock.name, pkg.name, 'lockfile name must match package.json');
  assert.equal(lock.version, pkg.version, 'lockfile version must match package.json');
  assert.equal(lock.packages[''].name, pkg.name, 'the root package entry must match too');
  assert.equal(lock.packages[''].version, pkg.version);
});

test('the package is not called react-example', () => {
  assert.notEqual(pkg.name, 'react-example', 'boilerplate identity from the template');
  assert.match(pkg.name, /^[a-z0-9][a-z0-9._-]*$/, 'npm package names are lowercase, url-safe');
  assert.ok(pkg.private, 'this app is not published; keep it private');
});

test('the reported app version is the one in package.json, and no surface hardcodes another', () => {
  // The welcome screen shows APP_VERSION; a literal version anywhere else would
  // be a second source of truth.
  const versionModule = readFileSync('src/lib/version.ts', 'utf8');
  assert.match(versionModule, /pkg\.version/, 'version.ts must read package.json');

  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!/node_modules|dist|\.git/.test(entry.name)) walk(path);
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        const source = readFileSync(path, 'utf8')
          // A version inside a doc comment is documentation, not a second source
          // of truth; strip comments before looking for rendered literals.
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .split('\n')
          .filter((line) => !/^\s*\/\//.test(line))
          .join('\n');
        if (/`v?\d+\.\d+\.\d+`|>v?\d+\.\d+\.\d+</.test(source)) offenders.push(path);
      }
    }
  };
  walk('src');
  assert.deepEqual(offenders, [], `hardcoded versions:\n${offenders.join('\n')}`);
});

test('CI installs from the lockfile it shares with the docs', () => {
  const workflow = readFileSync('.github/workflows/verify.yml', 'utf8');
  assert.match(workflow, /npm ci/, 'CI must use the committed npm lockfile');
  assert.doesNotMatch(workflow, /\bbun (install|i)\b/, 'CI must not use the removed bun workflow');
  assert.ok(existsSync('package-lock.json'));
});
