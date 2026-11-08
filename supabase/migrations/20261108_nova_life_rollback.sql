-- =============================================================================
-- NOVA NEXUS / L.I.F.E. — rollback for 20261108_nova_life.sql
-- =============================================================================
-- DESTRUCTIVE. Drops the cloud mirror of the engine's records. The local SQLite
-- database (server/life) is not touched by this file.
--
--   supabase db execute --file supabase/migrations/20261108_nova_life_rollback.sql
-- =============================================================================

drop table if exists public.life_benchmark_results cascade;
drop table if exists public.life_audit_events cascade;
drop table if exists public.life_approvals cascade;
drop table if exists public.life_verifications cascade;
drop table if exists public.life_evidence cascade;
drop table if exists public.life_task_steps cascade;
drop table if exists public.life_experiences cascade;
drop table if exists public.life_tasks cascade;
drop table if exists public.life_skill_versions cascade;
drop table if exists public.life_skills cascade;
drop table if exists public.life_memory_links cascade;
drop table if exists public.life_memory_versions cascade;
drop table if exists public.life_memories cascade;
