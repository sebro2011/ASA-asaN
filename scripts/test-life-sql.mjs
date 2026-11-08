/**
 * NOVA L.I.F.E. — Supabase migration, RLS and database-level honesty checks.
 *
 * Runs the real SQL in embedded PostgreSQL (PGlite) with Supabase shims, so the
 * assertions are about what the database enforces, not what the app remembers to
 * filter. The workspace migration runs first, exactly as it would in a project.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-life-sql.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const workspaceSql = await readFile(new URL('../supabase/migrations/20261105_nova_workspace.sql', import.meta.url), 'utf8');
const lifeSql = await readFile(new URL('../supabase/migrations/20261108_nova_life.sql', import.meta.url), 'utf8');
const rollbackSql = await readFile(new URL('../supabase/migrations/20261108_nova_life_rollback.sql', import.meta.url), 'utf8');

const LIFE_TABLES = [
  'life_approvals',
  'life_audit_events',
  'life_benchmark_results',
  'life_evidence',
  'life_experiences',
  'life_memories',
  'life_memory_links',
  'life_memory_versions',
  'life_skill_versions',
  'life_skills',
  'life_task_steps',
  'life_tasks',
  'life_verifications',
];

const shimSql = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;

  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create or replace function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`;

async function freshDatabase() {
  const db = new PGlite();
  await db.exec(shimSql);
  await db.exec(workspaceSql);
  await db.exec(lifeSql);
  await db.query('insert into auth.users (id, email) values ($1, $3), ($2, $4)', [
    ALICE,
    BOB,
    'alice@example.test',
    'bob@example.test',
  ]);
  return db;
}

async function asUser(db, uid) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.exec('set role authenticated');
}

async function asOwner(db) {
  await db.exec('reset role');
}

test('the migration is idempotent and RLS is on for every life table', async () => {
  const db = await freshDatabase();
  try {
    await db.exec(lifeSql);
    const tables = await db.query(
      `select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename like 'life\\_%' order by tablename`,
    );
    assert.deepEqual(
      tables.rows.map((row) => row.tablename),
      LIFE_TABLES,
    );
    for (const row of tables.rows) assert.equal(row.rowsecurity, true, `${row.tablename} has RLS`);

    const policies = await db.query(
      `select tablename, count(*)::int as count from pg_policies where schemaname = 'public' and tablename like 'life\\_%' group by tablename`,
    );
    assert.equal(policies.rows.length, LIFE_TABLES.length);
    for (const row of policies.rows) assert.equal(row.count, 4, `${row.tablename} has select/insert/update/delete policies`);

    // anon must hold no privilege at all on these tables.
    const anon = await db.query(
      `select count(*)::int as count from information_schema.role_table_grants
        where grantee = 'anon' and table_schema = 'public' and table_name like 'life\\_%'`,
    );
    assert.equal(anon.rows[0].count, 0, 'anon has no grants');
  } finally {
    await db.close();
  }
});

test('a user sees only their own memories, and cannot forge an owner', async () => {
  const db = await freshDatabase();
  try {
    await asUser(db, ALICE);
    await db.query(
      `insert into public.life_memories (category, title, body) values ('semantic', 'Alice note', 'Only Alice should read this.')`,
    );
    const own = await db.query('select user_id, title from public.life_memories');
    assert.equal(own.rows.length, 1);
    assert.equal(own.rows[0].user_id, ALICE, 'user_id defaults to auth.uid()');

    await asUser(db, BOB);
    const seen = await db.query('select * from public.life_memories');
    assert.equal(seen.rows.length, 0, 'Bob sees nothing of Alice');

    await assert.rejects(
      () =>
        db.query(
          `insert into public.life_memories (user_id, category, title, body) values ($1, 'semantic', 'Forged', 'Trying to write as Alice.')`,
          [ALICE],
        ),
      /row-level security|violates/i,
    );

    await asOwner(db);
    const total = await db.query('select count(*)::int as count from public.life_memories');
    assert.equal(total.rows[0].count, 1, 'the forged insert stored nothing');
  } finally {
    await db.close();
  }
});

test('the database refuses self-certified verification and unevidenced experience', async () => {
  const db = await freshDatabase();
  try {
    await asUser(db, ALICE);
    await assert.rejects(
      () =>
        db.query(
          `insert into public.life_verifications (status, checks) values ('verified', '[]'::jsonb)`,
        ),
      /life_verified_needs_checks|check constraint/i,
    );
    const partial = await db.query(
      `insert into public.life_verifications (status, checks) values ('partially_verified', '[]'::jsonb) returning id`,
    );
    assert.equal(partial.rows.length, 1);

    await assert.rejects(
      () =>
        db.query(
          `insert into public.life_experiences (task_type, objective, execution_summary, outcome, verified, replayable)
           values ('general', 'obj', 'summary', 'success', true, true)`,
        ),
      /life_experience_verified_requires_evidence|check constraint/i,
    );

    const unverified = await db.query(
      `insert into public.life_experiences (task_type, objective, execution_summary, outcome, verified, replayable)
       values ('general', 'obj', 'summary', 'failure', false, false) returning id`,
    );
    assert.equal(unverified.rows.length, 1);

    // A verified experience with evidence is allowed.
    const evidenced = await db.query(
      `insert into public.life_experiences (task_type, objective, execution_summary, outcome, verified, replayable, evidence_ids)
       values ('general', 'obj', 'summary', 'success', true, true, array[gen_random_uuid()]) returning id`,
    );
    assert.equal(evidenced.rows.length, 1);
  } finally {
    await db.close();
  }
});

test('skills and tasks are owner-scoped and enum-constrained', async () => {
  const db = await freshDatabase();
  try {
    await asUser(db, ALICE);
    await db.query(
      `insert into public.life_skills (name, description, status) values ('Project review', 'Review a small project and list its files.', 'draft')`,
    );
    await db.query(
      `insert into public.life_tasks (objective, language, status) values ('Review the project structure', 'si', 'planned')`,
    );
    await assert.rejects(
      () => db.query(`insert into public.life_tasks (objective, status) values ('Bad status task', 'exploded')`),
      /check constraint|violates/i,
    );
    await assert.rejects(
      () => db.query(`insert into public.life_tasks (objective, language) values ('Good task', 'fr')`),
      /check constraint|violates/i,
    );

    await asUser(db, BOB);
    assert.equal((await db.query('select * from public.life_tasks')).rows.length, 0);
    assert.equal((await db.query('select * from public.life_skills')).rows.length, 0);
  } finally {
    await db.close();
  }
});

test('the rollback removes every life table and leaves the workspace intact', async () => {
  const db = await freshDatabase();
  try {
    await db.exec(rollbackSql);
    const remaining = await db.query(
      `select tablename from pg_tables where schemaname = 'public' and tablename like 'life\\_%'`,
    );
    assert.equal(remaining.rows.length, 0);
    const profiles = await db.query('select count(*)::int as count from public.profiles');
    assert.equal(profiles.rows[0].count, 2, 'workspace tables are untouched');
  } finally {
    await db.close();
  }
});
