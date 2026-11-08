/**
 * NOVA NEXUS / L.I.F.E. — local database schema.
 *
 * SQLite is the local-first store: one file, real transactions, foreign keys,
 * and FTS5 keyword search. The engine also ships a Supabase migration
 * (`supabase/migrations/20261108_nova_life.sql`) for accounts that want the same
 * records in the cloud; this file is what runs on the machine.
 *
 * Migrations are append-only and versioned. Never edit a shipped migration —
 * add another entry and bump `LATEST_SCHEMA_VERSION`.
 */

export const LATEST_SCHEMA_VERSION = 1;

/** Base tables every version needs. Written idempotently. */
const V1 = `
-- ---------------------------------------------------------------- meta
create table if not exists life_meta (
  key text primary key,
  value text not null
);

-- ------------------------------------------------------------- memories
-- Five categories, one table: they share storage, lifecycle and permissions.
create table if not exists memories (
  id text primary key,
  user_id text not null,
  category text not null check (category in ('working','episodic','semantic','procedural','personal')),
  title text not null,
  body text not null,
  language text not null default 'en' check (language in ('en','si','ta','und')),
  tags text not null default '[]',
  source text not null default 'manual',
  -- permissions are stored, not implied: 'private' memories never leave the device.
  visibility text not null default 'private' check (visibility in ('private','task','shared')),
  confidence real not null default 1.0 check (confidence between 0 and 1),
  pinned integer not null default 0 check (pinned in (0,1)),
  version integer not null default 1,
  -- optional embedding (JSON array of numbers); null when no embedding adapter ran
  embedding text,
  created_at text not null,
  updated_at text not null,
  expires_at text
);
create index if not exists memories_user_category_idx on memories (user_id, category, updated_at desc);
create index if not exists memories_user_expiry_idx on memories (user_id, expires_at);
create unique index if not exists memories_dedupe_idx on memories (user_id, category, lower(title));

-- Every edit keeps the previous body, so a correction is auditable and
-- reversible instead of destructive.
create table if not exists memory_versions (
  id text primary key,
  memory_id text not null references memories (id) on delete cascade,
  version integer not null,
  title text not null,
  body text not null,
  tags text not null default '[]',
  changed_at text not null,
  changed_by text not null default 'local',
  reason text
);
create index if not exists memory_versions_memory_idx on memory_versions (memory_id, version desc);

-- Knowledge-graph links between memories and other entities.
create table if not exists memory_links (
  id text primary key,
  user_id text not null,
  from_type text not null,
  from_id text not null,
  relation text not null,
  to_type text not null,
  to_id text not null,
  weight real not null default 1.0,
  created_at text not null
);
create index if not exists memory_links_from_idx on memory_links (user_id, from_type, from_id);
create index if not exists memory_links_to_idx on memory_links (user_id, to_type, to_id);

-- ---------------------------------------------------------------- tasks
create table if not exists tasks (
  id text primary key,
  user_id text not null,
  objective text not null,
  language text not null default 'en',
  status text not null check (status in ('planned','running','awaiting_approval','completed','failed','cancelled')),
  plan text not null default '[]',
  allowed_tools text not null default '[]',
  limits text not null default '{}',
  result text,
  verification_id text,
  error text,
  created_at text not null,
  updated_at text not null
);
create index if not exists tasks_user_status_idx on tasks (user_id, status, created_at desc);

create table if not exists task_steps (
  id text primary key,
  task_id text not null references tasks (id) on delete cascade,
  seq integer not null,
  kind text not null check (kind in ('plan','retrieve','tool','generate','verify','finalize')),
  title text not null,
  status text not null check (status in ('pending','running','completed','failed','skipped')),
  tool text,
  input text,
  output text,
  error text,
  started_at text,
  finished_at text,
  unique (task_id, seq)
);

-- ---------------------------------------------------------- experiences
create table if not exists experiences (
  id text primary key,
  user_id text not null,
  task_id text,
  task_type text not null,
  objective text not null,
  execution_summary text not null,
  outcome text not null check (outcome in ('success','partial','failure')),
  lessons text not null default '[]',
  evidence_ids text not null default '[]',
  verified integer not null default 0 check (verified in (0,1)),
  replayable integer not null default 0 check (replayable in (0,1)),
  score real not null default 0,
  tags text not null default '[]',
  created_at text not null
);
create index if not exists experiences_user_type_idx on experiences (user_id, task_type, created_at desc);

create table if not exists experience_evaluations (
  id text primary key,
  experience_id text not null references experiences (id) on delete cascade,
  check_name text not null,
  passed integer not null check (passed in (0,1)),
  detail text,
  evaluated_at text not null
);

-- --------------------------------------------------------------- skills
create table if not exists skills (
  id text primary key,
  user_id text not null,
  name text not null,
  description text not null,
  status text not null check (status in
    ('discovered','draft','sandbox_testing','verification','user_approval','active','deprecated','rejected')),
  current_version integer not null default 0,
  permissions text not null default '[]',
  dependencies text not null default '[]',
  input_schema text not null default '{}',
  output_schema text not null default '{}',
  created_at text not null,
  updated_at text not null,
  unique (user_id, name)
);

create table if not exists skill_versions (
  id text primary key,
  skill_id text not null references skills (id) on delete cascade,
  version integer not null,
  instructions text not null,
  steps text not null default '[]',
  test_cases text not null default '[]',
  verification text,
  approved_by text,
  approved_at text,
  created_at text not null,
  unique (skill_id, version)
);

create table if not exists skill_runs (
  id text primary key,
  skill_id text not null references skills (id) on delete cascade,
  version integer not null,
  task_id text,
  status text not null check (status in ('passed','failed','error')),
  details text not null default '{}',
  started_at text not null,
  finished_at text
);

-- --------------------------------------------- verification & evidence
create table if not exists verification_records (
  id text primary key,
  task_id text not null,
  user_id text not null,
  status text not null check (status in ('verified','partially_verified','unverified','failed')),
  checks_performed text not null default '[]',
  evidence_ids text not null default '[]',
  errors text not null default '[]',
  notes text,
  verified_at text not null
);
create index if not exists verification_task_idx on verification_records (task_id);

create table if not exists evidence_records (
  id text primary key,
  task_id text,
  user_id text not null,
  kind text not null check (kind in ('test','file','command','source','model','memory','manual','simulation')),
  label text not null,
  detail text not null default '',
  digest text,
  created_at text not null
);
create index if not exists evidence_task_idx on evidence_records (task_id);

create table if not exists user_approvals (
  id text primary key,
  user_id text not null,
  subject_type text not null check (subject_type in ('skill','task','simulation','memory')),
  subject_id text not null,
  decision text not null check (decision in ('approved','rejected','revoked')),
  note text,
  created_at text not null
);
create index if not exists approvals_subject_idx on user_approvals (subject_type, subject_id, created_at desc);

-- ------------------------------------------------ registry & audit
create table if not exists provider_registry (
  id text primary key,
  kind text not null check (kind in ('local','cloud')),
  base_url text,
  model text,
  capabilities text not null default '{}',
  last_health text not null default '{}',
  updated_at text not null
);

create table if not exists tool_permissions (
  id text primary key,
  user_id text not null,
  tool text not null,
  granted integer not null default 0 check (granted in (0,1)),
  level text not null check (level in ('read','write','execute','network','transmit')),
  updated_at text not null,
  unique (user_id, tool)
);

create table if not exists audit_events (
  id text primary key,
  user_id text not null,
  kind text not null,
  severity text not null check (severity in ('info','warning','critical')),
  subject text,
  detail text not null default '{}',
  created_at text not null
);
create index if not exists audit_user_time_idx on audit_events (user_id, created_at desc);

-- ---------------------------------------------------------- benchmarks
create table if not exists benchmark_cases (
  id text primary key,
  suite text not null,
  name text not null,
  language text not null default 'en',
  input text not null,
  expectation text not null default '{}'
);

create table if not exists benchmark_results (
  id text primary key,
  run_id text not null,
  case_id text not null references benchmark_cases (id) on delete cascade,
  passed integer not null check (passed in (0,1)),
  metrics text not null default '{}',
  measured_at text not null
);
create index if not exists benchmark_run_idx on benchmark_results (run_id);
`;

/** FTS5 is optional: a build without it falls back to LIKE scans. */
export const FTS_SQL = `
create virtual table if not exists memories_fts using fts5(
  title, body, tags, content='memories', content_rowid='rowid', tokenize='unicode61'
);
create trigger if not exists memories_fts_ai after insert on memories begin
  insert into memories_fts (rowid, title, body, tags) values (new.rowid, new.title, new.body, new.tags);
end;
create trigger if not exists memories_fts_ad after delete on memories begin
  insert into memories_fts (memories_fts, rowid, title, body, tags) values ('delete', old.rowid, old.title, old.body, old.tags);
end;
create trigger if not exists memories_fts_au after update on memories begin
  insert into memories_fts (memories_fts, rowid, title, body, tags) values ('delete', old.rowid, old.title, old.body, old.tags);
  insert into memories_fts (rowid, title, body, tags) values (new.rowid, new.title, new.body, new.tags);
end;
`;

export const MIGRATIONS = [{ version: 1, sql: V1 }];
