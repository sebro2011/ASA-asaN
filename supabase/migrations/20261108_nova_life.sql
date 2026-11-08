-- =============================================================================
-- NOVA NEXUS / L.I.F.E. — cloud mirror of the local engine's records
-- =============================================================================
-- The engine itself runs on SQLite (server/life/schema.js). This migration is the
-- account-scoped mirror for deployments that want memory, tasks, skills and
-- evidence to follow the user across devices. Run it in the Supabase SQL editor
-- after the workspace migration. It is idempotent.
--
-- Security model (identical to the workspace migration):
--   * every table carries `user_id` and has RLS enabled;
--   * `anon` has no access, `authenticated` sees only its own rows;
--   * `user_id` defaults to auth.uid() so a client cannot choose an owner;
--   * no service-role key is used by the app for these tables.
--
-- Rollback: supabase/migrations/20261108_nova_life_rollback.sql (destructive).
-- =============================================================================

-- ---------------------------------------------------------------- memories

create table if not exists public.life_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null check (category in ('working','episodic','semantic','procedural','personal')),
  title text not null check (char_length(title) between 3 and 160),
  body text not null check (char_length(body) between 1 and 20000),
  language text not null default 'en' check (language in ('en','si','ta','und')),
  tags text[] not null default '{}',
  visibility text not null default 'private' check (visibility in ('private','task','shared')),
  confidence numeric(3,2) not null default 1.00 check (confidence between 0 and 1),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (user_id, category, title)
);
create index if not exists life_memories_user_idx on public.life_memories (user_id, category, updated_at desc);
create index if not exists life_memories_fts_idx on public.life_memories
  using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body, '')));

drop trigger if exists life_memories_updated_at on public.life_memories;
create trigger life_memories_updated_at
  before update on public.life_memories
  for each row execute function public.set_updated_at();

create table if not exists public.life_memory_versions (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.life_memories (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  version integer not null,
  title text not null,
  body text not null,
  changed_at timestamptz not null default now(),
  reason text
);
create index if not exists life_memory_versions_user_idx on public.life_memory_versions (user_id, memory_id, version desc);

create table if not exists public.life_memory_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_type text not null,
  from_id text not null,
  relation text not null check (relation in (
    'EXPERIENCE_CREATED_SKILL','TASK_USED_SKILL','MEMORY_SUPPORTS_TASK','EVIDENCE_VERIFIES_RESULT',
    'SKILL_DEPENDS_ON_SKILL','PROJECT_ASSOCIATED_WITH_MEMORY','TASK_PRODUCED_EXPERIENCE',
    'SKILL_PRODUCED_VERSION','RELATED_TO')),
  to_type text not null,
  to_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, from_type, from_id, relation, to_type, to_id)
);
create index if not exists life_links_from_idx on public.life_memory_links (user_id, from_type, from_id);

-- ------------------------------------------------------------------- tasks

create table if not exists public.life_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  objective text not null check (char_length(objective) between 3 and 2000),
  language text not null default 'en' check (language in ('en','si','ta')),
  status text not null default 'planned'
    check (status in ('planned','running','awaiting_approval','completed','failed','cancelled')),
  plan jsonb not null default '{}'::jsonb,
  allowed_tools text[] not null default '{}',
  limits jsonb not null default '{}'::jsonb,
  result jsonb,
  verification_id uuid,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists life_tasks_user_idx on public.life_tasks (user_id, status, created_at desc);

drop trigger if exists life_tasks_updated_at on public.life_tasks;
create trigger life_tasks_updated_at
  before update on public.life_tasks
  for each row execute function public.set_updated_at();

create table if not exists public.life_task_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.life_tasks (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  seq integer not null check (seq > 0),
  kind text not null check (kind in ('plan','retrieve','tool','generate','verify','finalize')),
  title text not null,
  status text not null check (status in ('pending','running','completed','failed','skipped','pending_approval')),
  tool text,
  output jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  unique (task_id, seq)
);

-- ------------------------------------------------------------ experiences

create table if not exists public.life_experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid references public.life_tasks (id) on delete set null,
  task_type text not null,
  objective text not null,
  execution_summary text not null,
  outcome text not null check (outcome in ('success','partial','failure')),
  lessons text[] not null default '{}',
  evidence_ids uuid[] not null default '{}',
  verified boolean not null default false,
  replayable boolean not null default false,
  created_at timestamptz not null default now(),
  -- A claim of success cannot be verified without evidence, in the database.
  constraint life_experience_verified_requires_evidence
    check (not verified or cardinality(evidence_ids) > 0)
);
create index if not exists life_experiences_user_idx on public.life_experiences (user_id, task_type, created_at desc);

-- ---------------------------------------------------------------- skills

create table if not exists public.life_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 120),
  description text not null check (char_length(description) between 10 and 1000),
  status text not null default 'draft'
    check (status in ('discovered','draft','sandbox_testing','verification','user_approval','active','deprecated','rejected')),
  current_version integer not null default 0 check (current_version >= 0),
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

drop trigger if exists life_skills_updated_at on public.life_skills;
create trigger life_skills_updated_at
  before update on public.life_skills
  for each row execute function public.set_updated_at();

create table if not exists public.life_skill_versions (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.life_skills (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  version integer not null check (version > 0),
  instructions text not null,
  steps jsonb not null default '[]'::jsonb,
  test_cases jsonb not null default '[]'::jsonb,
  verification jsonb,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (skill_id, version),
  -- Active means the version passed verification and a user approved it.
  constraint life_skill_version_approval_pair
    check ((verification is null and approved_at is null) or verification is not null)
);

-- ------------------------------------------------ verification & evidence

create table if not exists public.life_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid references public.life_tasks (id) on delete cascade,
  kind text not null check (kind in ('test','file','command','source','model','memory','manual','simulation')),
  label text not null,
  detail text not null default '',
  digest text,
  created_at timestamptz not null default now()
);
create index if not exists life_evidence_task_idx on public.life_evidence (user_id, task_id);

create table if not exists public.life_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid references public.life_tasks (id) on delete cascade,
  status text not null check (status in ('verified','partially_verified','unverified','failed')),
  checks jsonb not null default '[]'::jsonb,
  evidence_ids uuid[] not null default '{}',
  errors text[] not null default '{}',
  verified_at timestamptz not null default now(),
  -- "verified" with no checks is a lie the database refuses to store.
  constraint life_verified_needs_checks
    check (status <> 'verified' or jsonb_array_length(checks) > 0)
);
create index if not exists life_verifications_task_idx on public.life_verifications (user_id, task_id, verified_at desc);

create table if not exists public.life_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_type text not null check (subject_type in ('skill','task','simulation','memory')),
  subject_id text not null,
  decision text not null check (decision in ('approved','rejected','revoked')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists life_approvals_subject_idx on public.life_approvals (user_id, subject_type, subject_id, created_at desc);

create table if not exists public.life_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  severity text not null check (severity in ('info','warning','critical')),
  subject text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists life_audit_user_idx on public.life_audit_events (user_id, created_at desc);

create table if not exists public.life_benchmark_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  run_id text not null,
  suite text not null,
  case_id text not null,
  language text not null check (language in ('en','si','ta')),
  passed boolean not null,
  latency_ms numeric(10,2) not null default 0,
  measured_at timestamptz not null default now()
);
create index if not exists life_benchmark_user_idx on public.life_benchmark_results (user_id, measured_at desc);

-- --------------------------------------------------------------------- RLS

alter table public.life_memories enable row level security;
alter table public.life_memory_versions enable row level security;
alter table public.life_memory_links enable row level security;
alter table public.life_tasks enable row level security;
alter table public.life_task_steps enable row level security;
alter table public.life_experiences enable row level security;
alter table public.life_skills enable row level security;
alter table public.life_skill_versions enable row level security;
alter table public.life_evidence enable row level security;
alter table public.life_verifications enable row level security;
alter table public.life_approvals enable row level security;
alter table public.life_audit_events enable row level security;
alter table public.life_benchmark_results enable row level security;

-- `anon` gets nothing at all: no grant statements for anon exist in this file.
revoke all on public.life_memories, public.life_memory_versions, public.life_memory_links,
  public.life_tasks, public.life_task_steps, public.life_experiences, public.life_skills,
  public.life_skill_versions, public.life_evidence, public.life_verifications,
  public.life_approvals, public.life_audit_events, public.life_benchmark_results from anon;

grant select, insert, update, delete on public.life_memories, public.life_memory_versions,
  public.life_memory_links, public.life_tasks, public.life_task_steps, public.life_experiences,
  public.life_skills, public.life_skill_versions, public.life_evidence, public.life_verifications,
  public.life_approvals, public.life_audit_events, public.life_benchmark_results to authenticated;

-- One policy shape for every table: owner-only, and the owner cannot be forged
-- because `user_id` defaults to auth.uid() and the check re-asserts it.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'life_memories','life_memory_versions','life_memory_links','life_tasks','life_task_steps',
    'life_experiences','life_skills','life_skill_versions','life_evidence','life_verifications',
    'life_approvals','life_audit_events','life_benchmark_results'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete_own', table_name);

    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = auth.uid())',
      table_name || '_select_own', table_name);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())',
      table_name || '_insert_own', table_name);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      table_name || '_update_own', table_name);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())',
      table_name || '_delete_own', table_name);
  end loop;
end;
$$;
