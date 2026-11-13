/**
 * A ratchet on `any`.
 *
 * Audit m12 counted 72 explicit `any`s (plus `tsconfig` without `strict`). The
 * strict flag is on now; the `any`s are a separate, slower job, because each one
 * hides a shape that has to be described before it can be typed. Deleting them
 * all in one commit would be a large, unreviewable change to code that works.
 *
 * So the number is a budget: it may go down, never up. The list is printed so the
 * next person can pick a file rather than a number.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-any-budget.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** 72 at the audit → 52 after the first pass. Lower this when you remove more. */
const BUDGET = 52;

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

function anySites() {
  const sites = [];
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    source.split('\n').forEach((line, index) => {
      // `: any` as a type annotation; ignores the word inside strings/comments.
      if (/(^|[^A-Za-z0-9_$]):\s*any\b/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)) {
        sites.push({ file, line: index + 1, text: line.trim().slice(0, 100) });
      }
    });
  }
  return sites;
}

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
