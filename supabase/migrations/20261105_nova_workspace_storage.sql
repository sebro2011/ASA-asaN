-- =============================================================================
-- NOVA AI Workspace — Phase 3B storage
-- =============================================================================
-- Run AFTER 20261105_nova_workspace.sql. Idempotent.
--
-- One private bucket. Object keys are `{auth.uid()}/{file}` so a policy can
-- check the folder rather than relying on object metadata (which a client can
-- influence). No public access, no signed-URL shortcuts in policies.
--
-- Rollback: supabase/migrations/20261105_nova_workspace_rollback.sql removes
-- the policies; the bucket itself is emptied by the owner in the dashboard.
-- =============================================================================

-- Private bucket, 25 MB per object, text-ish knowledge formats only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge',
  'knowledge',
  false,
  26214400,
  array[
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects already has RLS enabled by Supabase; re-asserting it is a
-- no-op for the owner and protects against a project where it was disabled.
alter table storage.objects enable row level security;

-- Read: only objects inside the caller's folder.
drop policy if exists knowledge_objects_select_own on storage.objects;
create policy knowledge_objects_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'knowledge'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists knowledge_objects_insert_own on storage.objects;
create policy knowledge_objects_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'knowledge'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists knowledge_objects_update_own on storage.objects;
create policy knowledge_objects_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'knowledge'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'knowledge'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists knowledge_objects_delete_own on storage.objects;
create policy knowledge_objects_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'knowledge'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

notify pgrst, 'reload schema';
