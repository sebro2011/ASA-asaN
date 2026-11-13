/**
 * A ratchet on `any`.
 *
 * Audit m12 counted 72 explicit `any`s (plus `tsconfig` without `strict`). The
 * strict flag is on, and the `any`s are gone: every one hid a shape that now has
 * a name. This test keeps them gone.
 *
 * Two things went wrong the first time this test was written, and both are fixed
 * here, because a ratchet that cannot fail is worse than no ratchet:
 *
 *   1. the pattern was `(^|[^A-Za-z0-9_$]):\s*any\b`, whose prefix class also
 *      excluded every character that can legitimately precede a type annotation
 *      (`data: any` has an identifier before the colon). It matched almost
 *      nothing, so the budget never bound;
 *   2. nothing tested the detector itself, so the first problem stayed invisible.
 *
 * `test('the detector actually detects any')` is the guard for the guard.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-any-budget.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** 72 at the audit → 52 after a first pass → 0 once every shape had a name. */
const BUDGET = 0;

/** Every written form of an explicit `any` this repository has used. */
const ANY_PATTERNS = [
  /:\s*any\b/, // x: any
  /\bas\s+any\b/, // x as any
  /<any>/, // Array<any>
  /any\[\]/, // any[]
  /,\s*any>/, // Map<string, any>, Record<string, any>, Promise<any>
];

function sourceFiles(dir = '.') {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (/^(node_modules|dist|\.git|\.arena)$/.test(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

/** A line with its trailing comment removed, so a comment cannot trip the count. */
function codeOf(line) {
  return line.replace(/\s+\/\/.*$/, '');
}

function anySitesInLine(line) {
  const code = codeOf(line);
  if (!code.trim() || /^\s*(\/\/|\*|\/\*)/.test(line)) return false;
  return ANY_PATTERNS.some((pattern) => pattern.test(code));
}

function anySites() {
  const sites = [];
  for (const file of sourceFiles()) {
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (anySitesInLine(line)) sites.push({ file, line: index + 1, text: line.trim().slice(0, 100) });
    });
  }
  return sites;
}

test('the detector actually detects any', () => {
  const mustMatch = [
    'const data: any = { };',
    'function f(item: any) { }',
    'let payload = body as any;',
    'const items: any[] = [];',
    'const list = [] as Array<any>;',
    'type Cache = Map<string, any>;',
    'type Row = Record<string, any>;',
    'function g(): Promise<any> { }',
    'const x: any = 1; // the only field',
  ];
  for (const line of mustMatch) {
    assert.ok(anySitesInLine(line), `detector missed: ${line}`);
  }

  const mustNotMatch = [
    '// x: any is what we removed',
    ' * @param item any value',
    'const company: string = "any";',
    'const everything: unknown = null;',
    'const always = true;',
    'return items.any(fn);',
  ];
  for (const line of mustNotMatch) {
    assert.ok(!anySitesInLine(line), `detector false-positive: ${line}`);
  }
});

test(`explicit any stays within budget (${BUDGET})`, () => {
  const sites = anySites();
  const byFile = new Map();
  for (const site of sites) byFile.set(site.file, (byFile.get(site.file) ?? 0) + 1);

  const summary = [...byFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([file, count]) => `  ${count.toString().padStart(2)} ${file}`)
    .join('\n');

  assert.ok(
    sites.length <= BUDGET,
    `${sites.length} explicit any (budget ${BUDGET}) — the count may only go down:\n${summary}`,
  );
});

test('strict mode is on, so the budget is not the only guard', () => {
  const tsconfig = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
  assert.equal(tsconfig.compilerOptions.strict, true, 'tsconfig must keep strict mode on');
});
