-- =============================================================================
-- NOVA AI Workspace — Phase 3B schema
-- =============================================================================
-- Run once in the Supabase SQL editor (or `supabase db push`) as the project
-- owner, AFTER the project has Auth enabled. Safe to re-run: every statement is
-- idempotent. `supabase/cosmovision.sql` is not touched by this migration.
--
-- Rollback: supabase/migrations/20261105_nova_workspace_rollback.sql
--           (destructive — drops these tables and their policies; run manually).
--
-- Security model
--   * Every workspace table carries `user_id` and has RLS enabled.
--   * `anon` has no access at all; `authenticated` only sees its own rows.
--   * The browser uses the publishable key + the user's JWT, so RLS — not
--     application code — is the enforcement layer. The service-role key is not
--     used by anything in this migration.
-- =============================================================================

-- ------------------------------------------------------------------ utilities

-- Shared `updated_at` maintenance. One function, every table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

-- ------------------------------------------------------------------- profiles
-- 1:1 with auth.users. Created by a trigger so a signed-in user always has a
-- profile row, without the client needing write access to auth.users.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(trim(display_name)) between 1 and 80),
  locale text not null default 'en' check (locale in ('en', 'si', 'ta')),
  theme text not null default 'system' check (theme in ('dark', 'light', 'system')),
  reduce_motion boolean not null default false,
  high_contrast boolean not null default false,
  sidebar_collapsed boolean not null default false,
  font_scale numeric(3, 2) not null default 1.00 check (font_scale between 0.85 and 1.60),
  preferred_provider text not null default 'auto'
    check (preferred_provider in ('auto', 'arena', 'openrouter', 'gemini', 'local')),
  default_surface text not null default 'home'
    check (default_surface in ('home', 'chat', 'projects', 'documents', 'research', 'writing', 'code', 'knowledge', 'tasks')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Profile bootstrap. `security definer` with a pinned search_path so the insert
-- cannot be redirected by a caller-controlled path. Failures must never block
-- sign-up, hence the exception block.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
exception
  when others then
    return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------- projects

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  instructions text not null default '' check (char_length(instructions) <= 4000),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_idx on public.projects (user_id, updated_at desc, id);
create index if not exists projects_user_archived_idx on public.projects (user_id, archived);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------- conversations

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  title text not null default 'New conversation'
    check (char_length(trim(title)) between 1 and 160),
  archived boolean not null default false,
  pinned boolean not null default false,
  last_message_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keyset pagination for the conversation list, exactly as the blueprint planned.
create index if not exists conversations_user_last_message_idx
  on public.conversations (user_id, last_message_at desc, id)
  where deleted_at is null;
create index if not exists conversations_user_project_idx
  on public.conversations (user_id, project_id)
  where deleted_at is null;
create index if not exists conversations_project_id_idx on public.conversations (project_id);

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------- messages

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  -- Duplicated on purpose: RLS can then check ownership without a join.
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(content) between 1 and 32000),
  provider text check (provider is null or char_length(provider) <= 40),
  model text check (model is null or char_length(model) <= 80),
  is_error boolean not null default false,
  seq bigint generated always as identity,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, seq)
);

create index if not exists messages_conversation_seq_idx on public.messages (conversation_id, seq);
create index if not exists messages_user_created_idx on public.messages (user_id, created_at desc);
create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at);

drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

-- Keep the parent conversation's sort key honest when a message arrives.
create or replace function public.touch_conversation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.conversations
     set last_message_at = greatest(last_message_at, new.created_at)
   where id = new.conversation_id
     and user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

create table if not exists public.message_revisions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 32000),
  created_at timestamptz not null default now()
);

create index if not exists message_revisions_message_idx
  on public.message_revisions (message_id, created_at desc);
create index if not exists message_revisions_user_idx on public.message_revisions (user_id);

-- ------------------------------------------------------------------ documents

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  kind text not null default 'document'
    check (kind in ('document', 'writing', 'research', 'code', 'note')),
  title text not null check (char_length(trim(title)) between 1 and 200),
  content text not null default '' check (char_length(content) <= 400000),
  language text check (language is null or char_length(language) <= 16),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  pinned boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_user_updated_idx
  on public.documents (user_id, updated_at desc, id)
  where deleted_at is null;
create index if not exists documents_user_kind_idx
  on public.documents (user_id, kind)
  where deleted_at is null;
create index if not exists documents_project_id_idx on public.documents (project_id);
create index if not exists documents_user_title_idx on public.documents (user_id, lower(title));

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

create table if not exists public.document_revisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null default '' check (char_length(content) <= 400000),
  created_at timestamptz not null default now()
);

create index if not exists document_revisions_document_idx
  on public.document_revisions (document_id, created_at desc);
create index if not exists document_revisions_user_idx on public.document_revisions (user_id);

-- Keep the newest 20 revisions per document; older ones are pruned on insert.
create or replace function public.prune_document_revisions()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from public.document_revisions
   where document_id = new.document_id
     and user_id = new.user_id
     and id not in (
       select id from public.document_revisions
        where document_id = new.document_id
        order by created_at desc, id desc
        limit 20
     );
  return null;
end;
$$;

drop trigger if exists document_revisions_prune on public.document_revisions;
create trigger document_revisions_prune
  after insert on public.document_revisions
  for each row execute function public.prune_document_revisions();

-- ------------------------------------------------------------- knowledge files
-- Metadata only. The bytes live in the private `knowledge` storage bucket
-- (see 20261105_nova_workspace_storage.sql).

create table if not exists public.knowledge_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 200),
  mime text not null default 'application/octet-stream' check (char_length(mime) <= 120),
  size_bytes bigint not null default 0 check (size_bytes between 0 and 26214400),
  storage_path text not null check (char_length(storage_path) between 1 and 400),
  extracted_text text check (extracted_text is null or char_length(extracted_text) <= 200000),
  index_status text not null default 'metadata_only'
    check (index_status in ('ready', 'metadata_only')),
  created_at timestamptz not null default now(),
  unique (user_id, storage_path)
);

create index if not exists knowledge_files_user_idx on public.knowledge_files (user_id, created_at desc);
create index if not exists knowledge_files_project_idx on public.knowledge_files (project_id);

-- ---------------------------------------------------------------------- tasks

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 200),
  notes text not null default '' check (char_length(notes) <= 4000),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'archived')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date date,
  position numeric(12, 3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_status_idx on public.tasks (user_id, status, due_date);
create index if not exists tasks_user_position_idx on public.tasks (user_id, position);
create index if not exists tasks_project_id_idx on public.tasks (project_id);

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------- quotas
-- Server-side caps so a runaway client cannot exhaust the project's storage or
-- PostgREST row limits. Errors are raised with a stable SQLSTATE (54000) and a
-- machine-readable message the UI maps to copy.

create or replace function public.enforce_workspace_quota()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  row_cap integer;
  current_count bigint;
  byte_cap constant bigint := 104857600; -- 100 MB of knowledge files per user
  used_bytes bigint;
begin
  row_cap := case tg_table_name
    when 'conversations' then 500
    when 'documents' then 1000
    when 'tasks' then 5000
    else null
  end;

  if row_cap is not null then
    execute format('select count(*) from public.%I where user_id = $1', tg_table_name)
      into current_count
      using new.user_id;
    if current_count >= row_cap then
      raise exception 'quota-exceeded: % is limited to % rows per user', tg_table_name, row_cap
        using errcode = '54000';
    end if;
  end if;

  if tg_table_name = 'knowledge_files' then
    select coalesce(sum(size_bytes), 0) into used_bytes
      from public.knowledge_files
     where user_id = new.user_id;
    if used_bytes + new.size_bytes > byte_cap then
      raise exception 'quota-exceeded: knowledge storage is limited to 100 MB per user'
        using errcode = '54000';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists conversations_enforce_quota on public.conversations;
create trigger conversations_enforce_quota
  before insert on public.conversations
  for each row execute function public.enforce_workspace_quota();

drop trigger if exists documents_enforce_quota on public.documents;
create trigger documents_enforce_quota
  before insert on public.documents
  for each row execute function public.enforce_workspace_quota();

drop trigger if exists tasks_enforce_quota on public.tasks;
create trigger tasks_enforce_quota
  before insert on public.tasks
  for each row execute function public.enforce_workspace_quota();

drop trigger if exists knowledge_files_enforce_quota on public.knowledge_files;
create trigger knowledge_files_enforce_quota
  before insert on public.knowledge_files
  for each row execute function public.enforce_workspace_quota();

-- =============================================================== row level security
-- Pattern per table: select/insert/update/delete limited to the owning user.
-- `anon` is revoked entirely; every policy targets `authenticated` only.

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_revisions enable row level security;
alter table public.documents enable row level security;
alter table public.document_revisions enable row level security;
alter table public.knowledge_files enable row level security;
alter table public.tasks enable row level security;

revoke all on public.profiles, public.projects, public.conversations, public.messages,
  public.message_revisions, public.documents, public.document_revisions,
  public.knowledge_files, public.tasks
  from public, anon;

grant select, insert, update, delete on public.profiles, public.projects,
  public.conversations, public.messages, public.message_revisions, public.documents,
  public.document_revisions, public.knowledge_files, public.tasks
  to authenticated;

-- Re-grant sequence usage for the identity column; without this an insert that
-- omits `seq` fails for `authenticated`.
grant usage, select on all sequences in schema public to authenticated;

-- ---- profiles (keyed on id, not user_id)

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No delete policy: a profile disappears only with the auth user.

-- ---- simple ownership tables

drop policy if exists projects_select_own on public.projects;
create policy projects_select_own on public.projects
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own on public.projects
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists projects_update_own on public.projects;
create policy projects_update_own on public.projects
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists projects_delete_own on public.projects;
create policy projects_delete_own on public.projects
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---- conversations (a project, when present, must be the caller's)

drop policy if exists conversations_select_own on public.conversations;
create policy conversations_select_own on public.conversations
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists conversations_insert_own on public.conversations;
create policy conversations_insert_own on public.conversations
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
         where p.id = conversations.project_id
           and p.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists conversations_update_own on public.conversations;
create policy conversations_update_own on public.conversations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
         where p.id = conversations.project_id
           and p.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists conversations_delete_own on public.conversations;
create policy conversations_delete_own on public.conversations
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---- messages (ownership AND parent conversation ownership)

drop policy if exists messages_select_own on public.messages;
create policy messages_select_own on public.messages
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own on public.messages
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.conversations c
       where c.id = messages.conversation_id
         and c.user_id = (select auth.uid())
    )
  );

drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.conversations c
       where c.id = messages.conversation_id
         and c.user_id = (select auth.uid())
    )
  );

drop policy if exists messages_delete_own on public.messages;
create policy messages_delete_own on public.messages
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---- message revisions (message must be the caller's)

drop policy if exists message_revisions_select_own on public.message_revisions;
create policy message_revisions_select_own on public.message_revisions
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists message_revisions_insert_own on public.message_revisions;
create policy message_revisions_insert_own on public.message_revisions
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.messages m
       where m.id = message_revisions.message_id
         and m.user_id = (select auth.uid())
    )
  );

drop policy if exists message_revisions_delete_own on public.message_revisions;
create policy message_revisions_delete_own on public.message_revisions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---- documents

drop policy if exists documents_select_own on public.documents;
create policy documents_select_own on public.documents
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists documents_insert_own on public.documents;
create policy documents_insert_own on public.documents
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
         where p.id = documents.project_id
           and p.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists documents_update_own on public.documents;
create policy documents_update_own on public.documents
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
         where p.id = documents.project_id
           and p.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists documents_delete_own on public.documents;
create policy documents_delete_own on public.documents
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---- document revisions

drop policy if exists document_revisions_select_own on public.document_revisions;
create policy document_revisions_select_own on public.document_revisions
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists document_revisions_insert_own on public.document_revisions;
create policy document_revisions_insert_own on public.document_revisions
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.documents d
       where d.id = document_revisions.document_id
         and d.user_id = (select auth.uid())
    )
  );

drop policy if exists document_revisions_delete_own on public.document_revisions;
create policy document_revisions_delete_own on public.document_revisions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---- knowledge files (metadata row must point inside the caller's folder)

drop policy if exists knowledge_files_select_own on public.knowledge_files;
create policy knowledge_files_select_own on public.knowledge_files
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists knowledge_files_insert_own on public.knowledge_files;
create policy knowledge_files_insert_own on public.knowledge_files
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and storage_path like (select auth.uid())::text || '/%'
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
         where p.id = knowledge_files.project_id
           and p.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists knowledge_files_update_own on public.knowledge_files;
create policy knowledge_files_update_own on public.knowledge_files
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and storage_path like (select auth.uid())::text || '/%'
  );

drop policy if exists knowledge_files_delete_own on public.knowledge_files;
create policy knowledge_files_delete_own on public.knowledge_files
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---- tasks

drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own on public.tasks
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own on public.tasks
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
         where p.id = tasks.project_id
           and p.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists tasks_update_own on public.tasks;
create policy tasks_update_own on public.tasks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
         where p.id = tasks.project_id
           and p.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists tasks_delete_own on public.tasks;
create policy tasks_delete_own on public.tasks
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ------------------------------------------------------- workspace data deletion
-- Deletes the caller's workspace rows and keeps the account + profile. Needs
-- `security definer` because one statement touches several tables; the scope is
-- pinned to auth.uid(), never to a caller-supplied id.

create or replace function public.delete_my_workspace_data()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  delete from public.message_revisions where user_id = uid;
  delete from public.messages where user_id = uid;
  delete from public.conversations where user_id = uid;
  delete from public.document_revisions where user_id = uid;
  delete from public.documents where user_id = uid;
  delete from public.knowledge_files where user_id = uid;
  delete from public.tasks where user_id = uid;
  delete from public.projects where user_id = uid;
end;
$$;

revoke all on function public.delete_my_workspace_data() from public, anon;
grant execute on function public.delete_my_workspace_data() to authenticated;

-- ------------------------------------------------------------------- postgrest
-- Ask PostgREST to reload its schema cache so the new tables are immediately
-- queryable after running this migration.
notify pgrst, 'reload schema';
