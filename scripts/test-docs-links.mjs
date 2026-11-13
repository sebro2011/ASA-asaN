/**
 * Internal documentation links must resolve.
 *
 * Audit T6 counted 56 documents with no index and no link discipline: the two
 * root-level reports had already drifted away from the tree they described. A
 * broken link is the cheapest possible warning that a doc is stale, so it is
 * checked rather than trusted.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-docs-links.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

function markdownFiles(dir = 'docs') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(path));
    else if (entry.name.endsWith('.md')) out.push(path);
  }
  return out;
}

function brokenLinks(file) {
  const source = readFileSync(file, 'utf8');
  const broken = [];
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = target.split('#')[0];
    if (!path) continue;
    const resolved = normalize(join(dirname(file), path));
    if (!existsSync(resolved)) broken.push(`${file} → ${target}`);
  }
  return broken;
}

test('every internal link in the docs and the README resolves', () => {
  const files = ['README.md', ...markdownFiles()];
  const broken = files.flatMap(brokenLinks);
  assert.deepEqual(broken, [], `broken internal links:\n${broken.join('\n')}`);
});

test('there is a documentation index, and it points at the documents that matter', () => {
  const index = readFileSync('docs/README.md', 'utf8');
  for (const required of [
    'audits/MASTER_AUDIT_REPORT.md',
    'KNOWN_LIMITATIONS.md',
    'TEST_RESULTS.md',
    'API_STATUS_REPORT.md',
    'DEVELOPMENT_CHANGELOG.md',
  ]) {
    assert.match(index, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `docs/README.md must link ${required}`);
  }
  // And the root README must lead a reader to it.
  const rootReadme = readFileSync('README.md', 'utf8');
  assert.match(rootReadme, /docs\/README\.md/, 'the root README must point at the documentation index');
});

test('the index does not grow files that were never written', () => {
  // A link check passes if the target exists; this catches the opposite mistake,
  // a document in docs/ that nothing links to (invisible to a reader).
  const index = readFileSync('docs/README.md', 'utf8');
  const unlinked = markdownFiles()
    .filter((file) => file !== 'docs/README.md' && !file.startsWith('docs/nova/'))
    .filter((file) => !index.includes(file.replace('docs/', '')));
  assert.deepEqual(unlinked, [], `documents nobody links to:\n${unlinked.join('\n')}`);
});
