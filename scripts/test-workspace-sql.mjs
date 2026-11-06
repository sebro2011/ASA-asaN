/**
 * NOVA workspace SQL — migration, RLS and quota tests (Phase 3B).
 *
 * These tests run the real migration in an embedded PostgreSQL (PGlite) with
 * shims for the two Supabase-managed schemas:
 *
 *   auth    → `auth.users` + `auth.uid()` reading `request.jwt.claim.sub`
 *   storage → `buckets`, `objects`, `foldername()`
 *
 * Everything asserted here is enforced by the database, i.e. by the same code
 * that will guard the real project — not by application-level filters.
 *
 * Run: node --import tsx --test scripts/test-workspace-sql.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const schemaSql = await readFile(
  new URL('../supabase/migrations/20261105_nova_workspace.sql', import.meta.url),
  'utf8',
);
const searchSql = await readFile(
  new URL('../supabase/migrations/20261106_nova_search.sql', import.meta.url),
  'utf8',
);
const storageSql = await readFile(
  new URL('../supabase/migrations/20261105_nova_workspace_storage.sql', import.meta.url),
  'utf8',
);

/** Supabase-managed objects that the migrations reference. */
const shimSql = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;

  create schema auth;
  create table auth.users (id uuid primary key, email text);
  -- Mirrors Supabase's helper: the JWT subject is a session setting.
  create or replace function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid,
    created_at timestamptz not null default now()
  );
  -- Supabase's foldername(): every path segment except the file name.
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable
    as $$
      select case
        when array_length(string_to_array(name, '/'), 1) > 1
        then (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
        else array[]::text[]
      end
    $$;

  alter table storage.objects enable row level security;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema storage to anon, authenticated;
  grant select on storage.buckets to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`;

async function freshDatabase() {
  const db = new PGlite();
  await db.exec(shimSql);
  await db.exec(schemaSql);
  await db.exec(searchSql);
  await db.exec(storageSql);
  // Two confirmed accounts. The trigger must create their profiles.
  await db.query('insert into auth.users (id, email) values ($1, $3), ($2, $4)', [
    ALICE,
    BOB,
    'alice@example.test',
    'bob@example.test',
  ]);
  return db;
}

/** Run as an end user: `authenticated` role + a JWT subject. */
async function asUser(db, uid) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.exec('set role authenticated');
}

/** Run as the owner (bypasses RLS), used only to seed other users' rows. */
async function asOwner(db) {
  await db.exec('reset role');
}

test('migrations are idempotent and bootstrap profiles from auth.users', async () => {
  const db = await freshDatabase();
  try {
    // Re-running every file must not throw or duplicate anything.
    await db.exec(schemaSql);
    await db.exec(searchSql);
    await db.exec(storageSql);

    const profiles = await db.query('select id, locale, theme from public.profiles order by id');
    assert.equal(profiles.rows.length, 2, 'one profile per account, created by trigger');
    assert.equal(profiles.rows[0].locale, 'en');
    assert.equal(profiles.rows[0].theme, 'system');

    const bucket = await db.query("select id, public from storage.buckets where id = 'knowledge'");
    assert.equal(bucket.rows.length, 1);
    assert.equal(bucket.rows[0].public, false, 'bucket is private');

    // Every workspace table must have RLS enabled.
    const tables = await db.query(`
      select tablename, rowsecurity from pg_tables
       where schemaname = 'public'
         and tablename in ('profiles','projects','conversations','messages','message_revisions',
                           'documents','document_revisions','knowledge_files','tasks')
       order by tablename`);
    assert.equal(tables.rows.length, 9);
    for (const row of tables.rows) assert.equal(row.rowsecurity, true, `${row.tablename} has RLS`);
  } finally {
    await db.close();
  }
});

test('anonymous callers reach nothing', async () => {
  const db = await freshDatabase();
  try {
    await db.exec('reset role; set role anon');
    for (const table of [
      'profiles',
      'projects',
      'conversations',
      'messages',
      'message_revisions',
      'documents',
      'document_revisions',
      'knowledge_files',
      'tasks',
    ]) {
      await assert.rejects(
        db.query(`select * from public.${table}`),
        /permission denied/i,
        `anon must not read ${table}`,
      );
      await assert.rejects(
        db.query(`insert into public.${table} default values`),
        /permission denied/i,
        `anon must not write ${table}`,
      );
    }
    await assert.rejects(
      db.query('select public.delete_my_workspace_data()'),
      /permission denied/i,
      'anon cannot call the delete RPC',
    );
  } finally {
    await db.close();
  }
});

test('users only ever see and change their own rows', async () => {
  const db = await freshDatabase();
  try {
    await asUser(db, ALICE);
    const aliceProject = await db.query(
      "insert into public.projects (user_id, name) values ($1, 'Alice project') returning id",
      [ALICE],
    );
    assert.equal((await db.query('select count(*)::int as n from public.projects')).rows[0].n, 1);

    // Forging another user's id is refused by the WITH CHECK clause.
    await assert.rejects(
      db.query("insert into public.projects (user_id, name) values ($1, 'Forged')", [BOB]),
      /row-level security/i,
    );

    // Bob's own view is empty, and his writes cannot reference Alice.
    await asUser(db, BOB);
    assert.equal(
      (await db.query('select count(*)::int as n from public.projects')).rows[0].n,
      0,
      'Bob sees none of Alice rows',
    );
    const bobProject = await db.query(
      "insert into public.projects (user_id, name) values ($1, 'Bob project') returning id",
      [BOB],
    );

    // UPDATE/DELETE scoped to someone else's row must affect zero rows.
    const stolenUpdate = await db.query("update public.projects set name = 'hijacked' where id = $1", [
      aliceProject.rows[0].id,
    ]);
    assert.equal(stolenUpdate.affectedRows, 0, 'cross-user update affects nothing');
    const stolenDelete = await db.query('delete from public.projects where id = $1', [
      aliceProject.rows[0].id,
    ]);
    assert.equal(stolenDelete.affectedRows, 0, 'cross-user delete affects nothing');

    // Profiles are keyed on id and equally isolated.
    assert.equal((await db.query('select count(*)::int as n from public.profiles')).rows[0].n, 1);
    const profileUpdate = await db.query(
      "update public.profiles set display_name = 'Not Alice' where id = $1",
      [ALICE],
    );
    assert.equal(profileUpdate.affectedRows, 0);
    await db.query("update public.profiles set display_name = 'Bob' where id = $1", [BOB]);
    assert.equal(
      (await db.query('select display_name from public.profiles')).rows[0].display_name,
      'Bob',
    );

    // Restore Alice and confirm both rows survived everything above.
    await asOwner(db);
    assert.equal((await db.query('select count(*)::int as n from public.projects')).rows[0].n, 2);
    assert.equal(
      (await db.query("select name from public.projects where id = $1", [aliceProject.rows[0].id]))
        .rows[0].name,
      'Alice project',
    );
    assert.ok(bobProject.rows[0].id);
  } finally {
    await db.close();
  }
});

test('a forged conversation id cannot inject into another user thread', async () => {
  const db = await freshDatabase();
  try {
    await asOwner(db);
    const aliceConversation = await db.query(
      "insert into public.conversations (user_id, title) values ($1, 'Alice thread') returning id",
      [ALICE],
    );

    // A conversation that points at someone else's project is refused too.
    const aliceProject = await db.query(
      "insert into public.projects (user_id, name) values ($1, 'Alice project') returning id",
      [ALICE],
    );

    await asUser(db, BOB);
    // Bob owns the message row he is inserting, but not the conversation.
    await assert.rejects(
      db.query(
        "insert into public.messages (conversation_id, user_id, role, content) values ($1, $2, 'user', 'hi')",
        [aliceConversation.rows[0].id, BOB],
      ),
      /row-level security/i,
      'parent conversation ownership is enforced',
    );

    await assert.rejects(
      db.query(
        "insert into public.conversations (user_id, project_id, title) values ($1, $2, 'Bob thread')",
        [BOB, aliceProject.rows[0].id],
      ),
      /row-level security/i,
      'project ownership is enforced on conversations',
    );

    // Alice can write to her own thread.
    await asUser(db, ALICE);
    await db.query(
      "insert into public.messages (conversation_id, user_id, role, content) values ($1, $2, 'assistant', 'hello')",
      [aliceConversation.rows[0].id, ALICE],
    );

    // Bob can write to his own.
    await asUser(db, BOB);
    const bobThread = await db.query(
      "insert into public.conversations (user_id, title) values ($1, 'Bob thread') returning id",
      [BOB],
    );
    await db.query(
      "insert into public.messages (conversation_id, user_id, role, content) values ($1, $2, 'user', 'own thread')",
      [bobThread.rows[0].id, BOB],
    );

    assert.equal(
      (await db.query('select count(*)::int as n from public.messages')).rows[0].n,
      1,
      'Bob sees only his own message',
    );
    await asUser(db, ALICE);
    assert.equal((await db.query('select count(*)::int as n from public.messages')).rows[0].n, 1);
  } finally {
    await db.close();
  }
});

test('timestamps, ordering and quotas are enforced by the database', async () => {
  const db = await freshDatabase();
  try {
    await asUser(db, ALICE);
    const project = await db.query(
      "insert into public.projects (user_id, name) values ($1, 'Timestamps') returning id, updated_at",
      [ALICE],
    );
    await db.query("update public.projects set name = 'Renamed' where id = $1", [project.rows[0].id]);
    const after = await db.query('select updated_at, name from public.projects where id = $1', [
      project.rows[0].id,
    ]);
    assert.equal(after.rows[0].name, 'Renamed');
    assert.ok(
      new Date(after.rows[0].updated_at) >= new Date(project.rows[0].updated_at),
      'updated_at moves on update',
    );

    // Message ordering key must be monotonic inside a conversation.
    const conversation = await db.query(
      "insert into public.conversations (user_id, title) values ($1, 'Ordering') returning id",
      [ALICE],
    );
    const ids = [];
    for (const content of ['one', 'two', 'three']) {
      const inserted = await db.query(
        "insert into public.messages (conversation_id, user_id, role, content) values ($1, $2, 'user', $3) returning seq",
        [conversation.rows[0].id, ALICE, content],
      );
      ids.push(Number(inserted.rows[0].seq));
    }
    assert.deepEqual(ids, [...ids].sort((a, b) => a - b), 'seq increases');
    assert.equal(new Set(ids).size, 3);

    const touched = await db.query('select last_message_at from public.conversations where id = $1', [
      conversation.rows[0].id,
    ]);
    assert.ok(touched.rows[0].last_message_at, 'conversation sort key maintained by trigger');

    // Quota: the 501st conversation for one user is rejected.
    await db.query(
      `insert into public.conversations (user_id, title)
       select $1, 'bulk ' || n from generate_series(1, 499) as n`,
      [ALICE],
    );
    await assert.rejects(
      db.query("insert into public.conversations (user_id, title) values ($1, 'overflow')", [ALICE]),
      /quota-exceeded/,
    );
    // A different user is unaffected by someone else's quota.
    await asUser(db, BOB);
    await db.query("insert into public.conversations (user_id, title) values ($1, 'Bob ok')", [BOB]);

    // Knowledge storage quota is cumulative.
    await asUser(db, ALICE);
    // Four 25 MB objects fill the 100 MB cap (the per-row cap is 25 MB).
    await db.query(
      `insert into public.knowledge_files (user_id, name, size_bytes, storage_path)
       select $1, 'chunk-' || n || '.bin', 26214400, $2 || '/chunk-' || n || '.bin'
         from generate_series(1, 4) as n`,
      [ALICE, ALICE],
    );
    await assert.rejects(
      db.query(
        `insert into public.knowledge_files (user_id, name, size_bytes, storage_path)
         values ($1, 'more.txt', 10, $2)`,
        [ALICE, `${ALICE}/more.txt`],
      ),
      /quota-exceeded/,
      '100 MB knowledge cap is cumulative',
    );
  } finally {
    await db.close();
  }
});

test('storage objects are confined to the owner folder', async () => {
  const db = await freshDatabase();
  try {
    await asUser(db, ALICE);
    await db.query(
      "insert into storage.objects (bucket_id, name, owner) values ('knowledge', $1, $2)",
      [`${ALICE}/notes.md`, ALICE],
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects (bucket_id, name, owner) values ('knowledge', $1, $2)",
        [`${BOB}/stolen.md`, ALICE],
      ),
      /row-level security/i,
      'cannot write into another user folder',
    );

    await asUser(db, BOB);
    assert.equal(
      (await db.query("select count(*)::int as n from storage.objects where bucket_id = 'knowledge'"))
        .rows[0].n,
      0,
      'Bob cannot list Alice objects',
    );
    await db.query(
      "insert into storage.objects (bucket_id, name, owner) values ('knowledge', $1, $2)",
      [`${BOB}/own.md`, BOB],
    );
    assert.equal(
      (await db.query("select count(*)::int as n from storage.objects where bucket_id = 'knowledge'"))
        .rows[0].n,
      1,
    );

    // Knowledge metadata rows must point inside the caller's folder.
    await assert.rejects(
      db.query(
        `insert into public.knowledge_files (user_id, name, size_bytes, storage_path)
         values ($1, 'planted.txt', 5, $2)`,
        [BOB, `${ALICE}/planted.txt`],
      ),
      /row-level security/i,
    );
  } finally {
    await db.close();
  }
});

test('delete_my_workspace_data removes only the caller rows and keeps the profile', async () => {
  const db = await freshDatabase();
  try {
    await asOwner(db);
    const aliceProject = await db.query(
      "insert into public.projects (user_id, name) values ($1, 'Alice project') returning id",
      [ALICE],
    );
    const aliceThread = await db.query(
      "insert into public.conversations (user_id, project_id, title) values ($1, $2, 'Alice thread') returning id",
      [ALICE, aliceProject.rows[0].id],
    );
    await db.query(
      "insert into public.messages (conversation_id, user_id, role, content) values ($1, $2, 'user', 'hello')",
      [aliceThread.rows[0].id, ALICE],
    );
    const bobThread = await db.query(
      "insert into public.conversations (user_id, title) values ($1, 'Bob thread') returning id",
      [BOB],
    );
    await db.query(
      "insert into public.messages (conversation_id, user_id, role, content) values ($1, $2, 'user', 'bob')",
      [bobThread.rows[0].id, BOB],
    );
    await db.query(
      "insert into public.documents (user_id, title, content) values ($1, 'Alice doc', 'text')",
      [ALICE],
    );

    await asUser(db, ALICE);
    await db.query('select public.delete_my_workspace_data()');

    const counts = await db.query(`select
        (select count(*)::int from public.projects) as projects,
        (select count(*)::int from public.conversations) as conversations,
        (select count(*)::int from public.messages) as messages,
        (select count(*)::int from public.documents) as documents,
        (select count(*)::int from public.profiles) as profiles`);
    assert.deepEqual(counts.rows[0], {
      projects: 0,
      conversations: 0,
      messages: 0,
      documents: 0,
      profiles: 1,
    });

    await asOwner(db);
    const remaining = await db.query(`select
        (select count(*)::int from public.conversations where user_id = $1) as bob_conversations,
        (select count(*)::int from public.messages where user_id = $1) as bob_messages,
        (select count(*)::int from public.profiles where id = $2) as alice_profile`, [BOB, ALICE]);
    assert.deepEqual(remaining.rows[0], {
      bob_conversations: 1,
      bob_messages: 1,
      alice_profile: 1,
    });
  } finally {
    await db.close();
  }
});

/** Seed one conversation with messages, as a given user. */
async function seedSearchData(db, uid, title, messages) {
  await asUser(db, uid);
  const thread = await db.query(
    'insert into public.conversations (user_id, title) values ($1, $2) returning id',
    [uid, title],
  );
  const id = thread.rows[0].id;
  for (const content of messages) {
    await db.query(
      "insert into public.messages (conversation_id, user_id, role, content) values ($1, $2, 'user', $3)",
      [id, uid, content],
    );
  }
  return id;
}

test('full-text search ranks matches and stays inside RLS', async () => {
  const db = await freshDatabase();
  try {
    const aliceThread = await seedSearchData(db, ALICE, 'Mars mission planning', [
      'The rover will land near Jezero crater.',
      'Radiation shielding for the journey to Mars matters.',
      'Radiation shielding twice, with much more about radiation shielding and its mass budget.',
    ]);
    await db.query(
      "insert into public.documents (user_id, title, content) values ($1, 'Radiation notes', 'Radiation shielding dosimetry limits for crew')",
      [ALICE],
    );
    const bobThread = await seedSearchData(db, BOB, 'Bob radiation secrets', [
      'Bob private radiation shielding text that Alice must never see.',
    ]);

    await asUser(db, ALICE);
    const hits = await db.query("select * from public.nova_search('radiation shielding')");
    assert.ok(hits.rows.length >= 2, 'ranked hits returned');
    assert.ok(
      hits.rows.every((row) => row.kind !== 'message' || row.conversation_id !== bobThread),
      'never returns another user via the function',
    );
    assert.ok(hits.rows.some((row) => row.kind === 'document'), 'the document is found too');
    assert.ok(
      hits.rows.filter((row) => row.kind === 'message').every((row) => row.title === 'Mars mission planning'),
    );
    assert.ok(
      hits.rows.filter((row) => row.kind === 'message').some((row) => row.snippet.includes('<mark>')),
      'message snippets carry highlight markers',
    );

    // Title weight A beats body weight B for the same term frequency.
    await db.query(
      "insert into public.documents (user_id, title, content) values ($1, 'Kuiper belt survey', 'notes'), ($1, 'Outer system notes', 'Kuiper belt survey')",
      [ALICE],
    );
    const weighted = await db.query("select title, rank from public.nova_search('kuiper belt') where kind = 'document' order by rank desc");
    assert.equal(weighted.rows[0].title, 'Kuiper belt survey', 'a title match outranks a body match');

    // Ranking is monotonic.
    const ranks = hits.rows.map((row) => Number(row.rank));
    for (let i = 1; i < ranks.length; i += 1) assert.ok(ranks[i - 1] >= ranks[i], 'rank is descending');

    // Conversation titles are searchable too.
    const titles = await db.query("select kind, title from public.nova_search('mars mission')");
    assert.ok(titles.rows.some((row) => row.kind === 'conversation' && row.title === 'Mars mission planning'));

    // Another user's rows are invisible to the same function call.
    await asUser(db, BOB);
    const bobHits = await db.query("select conversation_id from public.nova_search('radiation shielding')");
    assert.ok(bobHits.rows.length > 0);
    assert.ok(bobHits.rows.every((row) => row.conversation_id !== aliceThread));
  } finally {
    await db.close();
  }
});

test('search falls back to substrings, ignores noise, clamps the limit', async () => {
  const db = await freshDatabase();
  try {
    await seedSearchData(db, ALICE, 'Streaming study', ['Provider streaming analyse later']);

    await asUser(db, ALICE);
    // No tsquery match for "streamingx", but the substring pass finds nothing either.
    assert.equal((await db.query("select * from public.nova_search('zzzz')")).rows.length, 0);

    // A partial word still resolves through the fallback pass.
    const partial = await db.query("select kind, snippet from public.nova_search('streami')");
    assert.deepEqual(
      partial.rows.map((row) => row.kind).sort(),
      ['conversation', 'message'],
      'partial word matches both the message body and the conversation title',
    );

    // Two characters or fewer is refused before any scan happens.
    assert.equal((await db.query("select * from public.nova_search('a')")).rows.length, 0);
    assert.equal((await db.query("select * from public.nova_search('  ')")).rows.length, 0);
    assert.equal((await db.query('select * from public.nova_search(null)')).rows.length, 0);

    // Wildcards are treated literally, not as patterns.
    assert.equal((await db.query("select * from public.nova_search('%')")).rows.length, 0);

    // The limit is clamped, never trusted.
    for (let i = 0; i < 4; i += 1) {
      await seedSearchData(db, ALICE, `Lunar note ${i}`, [`Lunar regolith sample ${i}`]);
    }
    assert.equal((await db.query("select * from public.nova_search('lunar', 2)")).rows.length, 2);
    assert.ok((await db.query("select * from public.nova_search('lunar', 999)")).rows.length <= 50);
    assert.ok((await db.query("select * from public.nova_search('lunar', 0)")).rows.length >= 1);
  } finally {
    await db.close();
  }
});

test('the search function is closed to anonymous callers', async () => {
  const db = await freshDatabase();
  try {
    await db.exec('reset role; set role anon');
    await assert.rejects(
      db.query("select * from public.nova_search('anything')"),
      /permission denied/i,
      'anon cannot execute nova_search',
    );
  } finally {
    await db.close();
  }
});
