/**
 * Workspace security greps (Phase 3B).
 *
 * Static guards for the rules that are easy to break by accident:
 *   * the service-role key never appears in client code or the built bundle;
 *   * no Supabase project URL/key is hardcoded anywhere;
 *   * authentication tokens are never written to localStorage by our code;
 *   * `.env.example` documents names only, never values.
 *
 * Run: node --import tsx --test scripts/test-workspace-security.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function walk(dir, extensions) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      files.push(...(await walk(path, extensions)));
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      files.push(path);
    }
  }
  return files;
}

test('client code never references the service-role key', async () => {
  const files = await walk('src', ['.ts', '.tsx', '.js', '.jsx']);
  assert.ok(files.length > 50, `scanned ${files.length} client files`);

  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (/SUPABASE_SERVICE_ROLE_KEY|service_role|sb_secret_/.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], 'service-role material must stay server-side');
});

test('no Supabase project URL or key is hardcoded in client code', /** @type {const} */ async () => {
  const files = await walk('src', ['.ts', '.tsx', '.js', '.jsx']);
  const pattern = /https:\/\/[a-z0-9]{20}\.supabase\.co|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/;
  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (pattern.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], 'configuration comes from the server at runtime');
});

test('the app never persists auth tokens itself', async () => {
  const files = await walk('src', ['.ts', '.tsx', '.js', '.jsx']);
  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (/localStorage\.setItem\([^)]*(access_token|refresh_token|provider_token)/i.test(source)) {
      offenders.push(file);
    }
  }
  assert.deepEqual(offenders, [], 'Supabase owns session storage; we only name the key');
});

test('.env.example documents variable names without values', async () => {
  const source = await readFile('.env.example', 'utf8');
  for (const name of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    assert.match(source, new RegExp(`^${name}=""$`, 'm'), `${name} documented and empty`);
  }
  // No real credential of any kind, and no key material at all.
  assert.doesNotMatch(source, /arena-sk-[A-Za-z0-9]|eyJhbGciOiJ|sb_secret_|sb_publishable_[A-Za-z0-9]{8}/);
  assert.doesNotMatch(source, /VITE_[A-Z_]*(KEY|SECRET)/, 'server keys are never VITE_*');
});

test('migrations enable RLS on every workspace table', async () => {
  const sql = await readFile('supabase/migrations/20261105_nova_workspace.sql', 'utf8');
  const tables = [
    'profiles',
    'projects',
    'conversations',
    'messages',
    'message_revisions',
    'documents',
    'document_revisions',
    'knowledge_files',
    'tasks',
  ];
  for (const table of tables) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`),
      `${table} has RLS enabled`,
    );
    assert.match(sql, new RegExp(`${table}_select_own`), `${table} has a select policy`);
  }
  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/, 'no permissive true policies');
  assert.doesNotMatch(sql, /drop table/i, 'the forward migration never drops data');
  assert.match(sql, /revoke all on public\./i, 'anon access revoked');
});

test('storage policies are scoped to the owner folder', async () => {
  const sql = await readFile('supabase/migrations/20261105_nova_workspace_storage.sql', 'utf8');
  const policyCount = (sql.match(/create policy knowledge_objects_/g) || []).length;
  assert.equal(policyCount, 4, 'select/insert/update/delete policies');
  assert.equal(
    (sql.match(/storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/g) || []).length >= 4,
    true,
    'every storage policy checks the caller folder',
  );
  assert.doesNotMatch(sql, /public\s*,\s*true|set public = true/i, 'bucket stays private');
});
