-- CosmoVision community feature. Run once in the Supabase SQL editor as the
-- project owner. No anonymous/authenticated PostgREST access is granted: the
-- Express service verifies the user's Auth token and moderator role first.
-- Back up the project before applying migrations to an existing database.

create table if not exists public.cosmovision_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.cosmovision_videos (
  id uuid primary key default gen_random_uuid(),
  video_id text not null unique check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null check (char_length(trim(title)) between 3 and 160),
  description text not null check (char_length(trim(description)) between 10 and 2000),
  category text not null check (category in ('missions', 'solar-system', 'universe', 'earth')),
  channel_title text not null check (char_length(channel_title) <= 150),
  channel_id text,
  official_agency boolean not null default false,
  published_at timestamptz,
  duration_seconds integer check (duration_seconds >= 0),
  search_text text generated always as (lower(title || ' ' || description || ' ' || channel_title)) stored,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create index if not exists cosmovision_videos_public_idx on public.cosmovision_videos (status, created_at desc, id desc);
create index if not exists cosmovision_videos_submitter_idx on public.cosmovision_videos (submitter_id, created_at desc);

create table if not exists public.cosmovision_reports (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.cosmovision_videos(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  unique (video_id, reporter_id)
);
create index if not exists cosmovision_reports_open_idx on public.cosmovision_reports (status, created_at desc);

-- A database-backed per-account limiter remains effective across serverless
-- instances. The public API also uses a best-effort per-instance IP limiter.
create table if not exists public.cosmovision_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('submit', 'report', 'moderate')),
  window_start timestamptz not null,
  request_count integer not null check (request_count between 1 and 1000),
  primary key (user_id, action)
);

alter table public.cosmovision_moderators enable row level security;
alter table public.cosmovision_videos enable row level security;
alter table public.cosmovision_reports enable row level security;
alter table public.cosmovision_rate_limits enable row level security;
revoke all on public.cosmovision_moderators, public.cosmovision_videos, public.cosmovision_reports, public.cosmovision_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.cosmovision_moderators, public.cosmovision_videos, public.cosmovision_reports, public.cosmovision_rate_limits to service_role;

create or replace function public.cosmovision_consume_limit(p_user uuid, p_action text)
returns boolean language plpgsql security invoker set search_path = public as $$
declare n integer; maximum integer;
begin
  maximum := case p_action when 'submit' then 5 when 'report' then 20 when 'moderate' then 100 else 0 end;
  if maximum = 0 then return false; end if;
  insert into public.cosmovision_rate_limits as limits (user_id, action, window_start, request_count)
  values (p_user, p_action, now(), 1)
  on conflict (user_id, action) do update set
    window_start = case when limits.window_start <= now() - interval '1 hour' then now() else limits.window_start end,
    request_count = case when limits.window_start <= now() - interval '1 hour' then 1 else least(limits.request_count + 1, 1000) end
  returning request_count into n;
  return n <= maximum;
end;
$$;
revoke all on function public.cosmovision_consume_limit(uuid, text) from public, anon, authenticated;
grant execute on function public.cosmovision_consume_limit(uuid, text) to service_role;

-- Authorisation is checked again here and state transitions/reports are updated
-- in one transaction. An application client cannot invoke this function.
create or replace function public.cosmovision_moderate(p_video uuid, p_actor uuid, p_action text)
returns boolean language plpgsql security invoker set search_path = public as $$
declare changed integer;
begin
  if not exists (select 1 from public.cosmovision_moderators where user_id = p_actor) then return false; end if;
  if p_action = 'approve' then
    update public.cosmovision_videos set status = 'approved', reviewed_at = now(), reviewed_by = p_actor
      where id = p_video and status = 'pending';
  elsif p_action = 'reject' then
    update public.cosmovision_videos set status = 'rejected', reviewed_at = now(), reviewed_by = p_actor
      where id = p_video and status = 'pending';
  elsif p_action = 'takedown' then
    update public.cosmovision_videos set status = 'rejected', reviewed_at = now(), reviewed_by = p_actor
      where id = p_video and status = 'approved';
  else return false;
  end if;
  get diagnostics changed = row_count;
  if changed = 0 then return false; end if;
  if p_action = 'takedown' then
    update public.cosmovision_reports set status = 'resolved' where video_id = p_video and status = 'open';
  end if;
  return true;
end;
$$;
revoke all on function public.cosmovision_moderate(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cosmovision_moderate(uuid, uuid, text) to service_role;

create or replace function public.cosmovision_dismiss_report(p_report uuid, p_actor uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
declare changed integer;
begin
  if not exists (select 1 from public.cosmovision_moderators where user_id = p_actor) then return false; end if;
  update public.cosmovision_reports set status = 'resolved' where id = p_report and status = 'open';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.cosmovision_dismiss_report(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cosmovision_dismiss_report(uuid, uuid) to service_role;

-- To grant a trusted moderator, add their existing Supabase Auth user UUID in
-- the SQL editor, never a password or an email address in source control:
-- insert into public.cosmovision_moderators (user_id) values ('<auth-user-uuid>');
