-- =============================================================================
-- NOVA AI Workspace — Phase 3B rollback
-- =============================================================================
-- DESTRUCTIVE. Deletes every row in the workspace tables. Run manually, only
-- after exporting what you need. Never run this as part of a deploy.
--
-- It does not touch:
--   * auth.users (Supabase managed; accounts survive)
--   * supabase/cosmovision.sql objects
--   * the `knowledge` bucket's bytes — empty the bucket in the dashboard first
-- =============================================================================

-- storage policies ------------------------------------------------------------
drop policy if exists knowledge_objects_select_own on storage.objects;
drop policy if exists knowledge_objects_insert_own on storage.objects;
drop policy if exists knowledge_objects_update_own on storage.objects;
drop policy if exists knowledge_objects_delete_own on storage.objects;

-- functions -------------------------------------------------------------------
drop function if exists public.delete_my_workspace_data();
drop function if exists public.enforce_workspace_quota();
drop function if exists public.prune_document_revisions();
drop function if exists public.touch_conversation();
drop function if exists public.handle_new_user();
drop function if exists public.set_updated_at();

-- trigger on the Supabase-managed auth schema --------------------------------
drop trigger if exists on_auth_user_created on auth.users;

-- tables (child → parent order) ----------------------------------------------
drop table if exists public.message_revisions;
drop table if exists public.messages;
drop table if exists public.conversations;
drop table if exists public.document_revisions;
drop table if exists public.documents;
drop table if exists public.knowledge_files;
drop table if exists public.tasks;
drop table if exists public.projects;
drop table if exists public.profiles;

notify pgrst, 'reload schema';
