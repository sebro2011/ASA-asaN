-- Community foundation: separate from the private workspace and CosmoVision.
-- Apply manually to the existing Supabase project after security review.
-- Public content is pre-moderated; never grants browser users elevated roles.
begin;

create table public.community_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.community_suspensions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  until_at timestamptz not null,
  reason text not null check (char_length(reason) between 1 and 1000)
);
create table public.community_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  item_id uuid not null,
  context_id uuid,
  item_kind text not null,
  decision text not null,
  created_at timestamptz not null default now()
);
-- Content-free activity notifications are private to the recipient. There is
-- no browser insert privilege and no report details or private profile data.
create table public.community_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  event text not null check (event in ('post_approved','post_rejected','comment_approved','comment_rejected','profile_approved','profile_rejected','group_approved','group_rejected','report_resolved')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index community_notifications_inbox on public.community_notifications(recipient_id, created_at desc);
create table public.community_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null default now(),
  count integer not null default 0,
  primary key (user_id, action)
);
-- Community profiles never reuse private workspace profile fields. Display
-- names are also pre-moderated and are the only public profile field.
create table public.community_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 40),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  updated_at timestamptz not null default now()
);
-- Public, pre-moderated science communities. Membership lists remain private.
create table public.community_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 3 and 80),
  description text not null check (char_length(btrim(description)) between 5 and 500),
  category text not null check (category in ('astronomy','nasa_missions','mars','black_holes','photography','astrophysics','technology')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create table public.community_group_members (
  group_id uuid not null references public.community_groups(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (group_id,user_id)
);
create index community_groups_discovery on public.community_groups(created_at desc) where status = 'approved';
create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id uuid references public.community_groups(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index community_posts_feed_idx on public.community_posts (created_at desc, id desc) where status = 'approved';
create index community_posts_author_idx on public.community_posts (author_id, created_at desc);
create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create index community_comments_post_idx on public.community_comments(post_id, created_at);
create table public.community_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(post_id, user_id)
);
create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  reported_body text not null default '',
  status text not null default 'open' check (status in ('open','dismissed','removed','stale')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index community_reports_one_open on public.community_reports(reporter_id, post_id) where status = 'open';

alter table public.community_moderators enable row level security;
alter table public.community_suspensions enable row level security;
alter table public.community_rate_limits enable row level security;
alter table public.community_audit_log enable row level security;
alter table public.community_notifications enable row level security;
alter table public.community_profiles enable row level security;
alter table public.community_groups enable row level security;
alter table public.community_group_members enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_likes enable row level security;
alter table public.community_reports enable row level security;
revoke all on public.community_moderators, public.community_suspensions, public.community_rate_limits,
  public.community_profiles, public.community_groups, public.community_group_members, public.community_posts, public.community_comments, public.community_likes, public.community_reports, public.community_audit_log, public.community_notifications from public, anon, authenticated;

grant select, delete on public.community_notifications to authenticated;
grant update (read_at) on public.community_notifications to authenticated;
grant select on public.community_posts, public.community_comments, public.community_profiles, public.community_groups to anon, authenticated;
grant select, delete on public.community_group_members to authenticated;
grant insert (group_id) on public.community_group_members to authenticated;
grant insert (name, description, category) on public.community_groups to authenticated;
grant delete on public.community_groups to authenticated;
grant insert (display_name) on public.community_profiles to authenticated;
grant update (display_name) on public.community_profiles to authenticated;
grant delete on public.community_profiles to authenticated;
grant insert (body, group_id) on public.community_posts to authenticated;
grant update (body) on public.community_posts to authenticated;
grant delete on public.community_posts to authenticated;
grant insert (post_id, body) on public.community_comments to authenticated;
grant delete on public.community_comments to authenticated;
grant select, delete on public.community_likes to authenticated;
grant insert (post_id) on public.community_likes to authenticated;
grant insert (post_id, reason) on public.community_reports to authenticated;

create function public.community_can_write() returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $$ select auth.uid() is not null and not exists (
  select 1 from public.community_suspensions s where s.user_id = auth.uid() and s.until_at > now()
) $$;
revoke all on function public.community_can_write() from public;
grant execute on function public.community_can_write() to authenticated;

-- Atomic, database-enforced quotas cannot be bypassed through direct PostgREST.
create function public.community_limit_insert() returns trigger
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare actor uuid := auth.uid(); n integer; cap integer;
begin
  if actor is null or not public.community_can_write() then raise exception 'community write unavailable' using errcode = '42501'; end if;
  cap := case tg_table_name when 'community_posts' then 5 when 'community_comments' then 20 when 'community_reports' then 10 when 'community_profiles' then 5 when 'community_groups' then 3 when 'community_group_members' then 30 else 60 end;
  insert into public.community_rate_limits(user_id, action, window_start, count)
    values (actor, tg_table_name, now(), 1)
  on conflict(user_id, action) do update set
    count = case when community_rate_limits.window_start < now() - interval '1 hour' then 1 else community_rate_limits.count + 1 end,
    window_start = case when community_rate_limits.window_start < now() - interval '1 hour' then now() else community_rate_limits.window_start end
  returning count into n;
  if n > cap then raise exception 'community rate limit exceeded' using errcode = 'P0001'; end if;
  return new;
end $$;
revoke all on function public.community_limit_insert() from public, anon, authenticated;
create trigger community_groups_limit before insert on public.community_groups for each row execute function public.community_limit_insert();
create trigger community_members_limit before insert on public.community_group_members for each row execute function public.community_limit_insert();
create trigger community_profiles_limit before insert on public.community_profiles for each row execute function public.community_limit_insert();
create trigger community_profiles_update_limit before update of display_name on public.community_profiles for each row execute function public.community_limit_insert();
create trigger community_posts_update_limit before update of body on public.community_posts for each row execute function public.community_limit_insert();
create trigger community_posts_limit before insert on public.community_posts for each row execute function public.community_limit_insert();
create trigger community_comments_limit before insert on public.community_comments for each row execute function public.community_limit_insert();
create trigger community_likes_limit before insert on public.community_likes for each row execute function public.community_limit_insert();
create trigger community_reports_limit before insert on public.community_reports for each row execute function public.community_limit_insert();

-- Edits must return to the review queue, so approved text cannot be replaced by
-- unreviewed material. Status and author are not browser-writable columns.
create function public.community_post_edited() returns trigger
language plpgsql set search_path = pg_catalog, public
as $$ begin new.status := 'pending'; new.updated_at := now(); return new; end $$;
revoke all on function public.community_post_edited() from public, anon, authenticated;
create trigger community_post_edited before update of body on public.community_posts for each row execute function public.community_post_edited();

create function public.community_profile_edited() returns trigger
language plpgsql set search_path = pg_catalog, public
as $$ begin new.status := 'pending'; new.updated_at := now(); return new; end $$;
revoke all on function public.community_profile_edited() from public, anon, authenticated;
create trigger community_profile_edited before update of display_name on public.community_profiles for each row execute function public.community_profile_edited();

-- Capture exactly what was reported, so later edits cannot be removed on the
-- basis of a stale report. The caller cannot write this snapshot directly.
create function public.community_report_snapshot() returns trigger
language plpgsql security definer set search_path = pg_catalog, public
as $$ begin
  select p.body into new.reported_body from public.community_posts p where p.id = new.post_id and p.status = 'approved' for share;
  if new.reported_body is null then raise exception 'post unavailable' using errcode = '42501'; end if;
  return new;
end $$;
revoke all on function public.community_report_snapshot() from public, anon, authenticated;
create trigger community_report_snapshot before insert on public.community_reports for each row execute function public.community_report_snapshot();

-- The owner membership is provisioned atomically; browsers cannot set roles.
create function public.community_group_owner_member() returns trigger
language plpgsql security definer set search_path = pg_catalog, public
as $$ begin insert into public.community_group_members(group_id,user_id,role) values(new.id,new.owner_id,'owner'); return new; end $$;
revoke all on function public.community_group_owner_member() from public, anon, authenticated;
create trigger community_group_owner_member after insert on public.community_groups for each row execute function public.community_group_owner_member();
-- Only the recipient may read, mark or dismiss an inbox item.
create policy community_notifications_read on public.community_notifications for select to authenticated using (recipient_id = auth.uid());
create policy community_notifications_update on public.community_notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy community_notifications_delete on public.community_notifications for delete to authenticated using (recipient_id = auth.uid());

create policy community_groups_read on public.community_groups for select to anon, authenticated using (status = 'approved' or owner_id = auth.uid());
create policy community_groups_insert on public.community_groups for insert to authenticated with check (owner_id = auth.uid() and status = 'pending' and public.community_can_write());
create policy community_groups_delete on public.community_groups for delete to authenticated using (owner_id = auth.uid());
create policy community_members_read on public.community_group_members for select to authenticated using (user_id = auth.uid());
create policy community_members_join on public.community_group_members for insert to authenticated with check (user_id = auth.uid() and role = 'member' and public.community_can_write() and exists (select 1 from public.community_groups g where g.id = group_id and g.status = 'approved'));
create policy community_members_leave on public.community_group_members for delete to authenticated using (user_id = auth.uid() and role in ('member','admin'));

create policy community_profiles_read on public.community_profiles for select to anon, authenticated using (status = 'approved' or user_id = auth.uid());
create policy community_profiles_insert on public.community_profiles for insert to authenticated with check (user_id = auth.uid() and status = 'pending' and public.community_can_write());
create policy community_profiles_update on public.community_profiles for update to authenticated using (user_id = auth.uid() and public.community_can_write()) with check (user_id = auth.uid() and status = 'pending' and public.community_can_write());
create policy community_profiles_delete on public.community_profiles for delete to authenticated using (user_id = auth.uid());

create policy community_posts_read on public.community_posts for select to anon, authenticated
  using ((status = 'approved' and (group_id is null or exists (select 1 from public.community_groups g where g.id = group_id and g.status = 'approved'))) or author_id = auth.uid());
create policy community_posts_insert on public.community_posts for insert to authenticated
  with check (author_id = auth.uid() and public.community_can_write() and status = 'pending' and (group_id is null or (exists (select 1 from public.community_groups g where g.id = group_id and g.status = 'approved') and exists (select 1 from public.community_group_members m where m.group_id = community_posts.group_id and m.user_id = auth.uid()))));
create policy community_posts_update on public.community_posts for update to authenticated
  using (author_id = auth.uid() and public.community_can_write())
  with check (author_id = auth.uid() and public.community_can_write() and status = 'pending' and (group_id is null or (exists (select 1 from public.community_groups g where g.id = group_id and g.status = 'approved') and exists (select 1 from public.community_group_members m where m.group_id = community_posts.group_id and m.user_id = auth.uid()))));
create policy community_posts_delete on public.community_posts for delete to authenticated using (author_id = auth.uid());
create policy community_comments_read on public.community_comments for select to anon, authenticated
  using ((status = 'approved' or author_id = auth.uid()) and exists (select 1 from public.community_posts p where p.id = post_id and (p.status = 'approved' or p.author_id = auth.uid())));
create policy community_comments_insert on public.community_comments for insert to authenticated
  with check (author_id = auth.uid() and public.community_can_write() and status = 'pending' and exists (select 1 from public.community_posts p where p.id = post_id and p.status = 'approved'));
create policy community_comments_delete on public.community_comments for delete to authenticated using (author_id = auth.uid());
create policy community_likes_read on public.community_likes for select to authenticated using (user_id = auth.uid());
create policy community_likes_insert on public.community_likes for insert to authenticated
  with check (user_id = auth.uid() and public.community_can_write() and exists (select 1 from public.community_posts p where p.id = post_id and p.status = 'approved'));
create policy community_likes_delete on public.community_likes for delete to authenticated using (user_id = auth.uid());
create policy community_reports_insert on public.community_reports for insert to authenticated
  with check (reporter_id = auth.uid() and public.community_can_write() and exists (select 1 from public.community_posts p where p.id = post_id and p.status = 'approved'));

-- Member administration never grants table-wide privileges to the browser.
-- Lock the group and acting membership to serialize role changes with removal.
create function public.community_group_roster(target_group uuid) returns table(user_id uuid, role text, display_name text)
language plpgsql security definer set search_path = pg_catalog, public
as $$ begin
  if not public.community_can_write() or not exists (
    select 1 from public.community_group_members m join public.community_groups g on g.id=m.group_id
    where m.group_id=target_group and m.user_id=auth.uid() and m.role in ('owner','admin') and g.status='approved'
  ) then raise exception 'not authorized' using errcode = '42501'; end if;
  return query select m.user_id, m.role, p.display_name from public.community_group_members m
    left join public.community_profiles p on p.user_id=m.user_id and p.status='approved'
    where m.group_id=target_group order by m.created_at limit 100;
end $$;
create function public.community_group_manage(target_group uuid, target_user uuid, action text) returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $$ declare actor_role text; target_role text; changed integer; begin
  if not public.community_can_write() then raise exception 'not authorized' using errcode = '42501'; end if;
  perform 1 from public.community_groups where id=target_group and status='approved' for update;
  if not found then raise exception 'not authorized' using errcode = '42501'; end if;
  select role into actor_role from public.community_group_members where group_id=target_group and user_id=auth.uid() for update;
  if actor_role is null or actor_role not in ('owner','admin') or target_user=auth.uid() then raise exception 'not authorized' using errcode = '42501'; end if;
  select role into target_role from public.community_group_members where group_id=target_group and user_id=target_user for update;
  if target_role is null then return false; end if;
  if action = 'promote' and actor_role = 'owner' and target_role = 'member' then
    update public.community_group_members set role='admin' where group_id=target_group and user_id=target_user;
  elsif action = 'demote' and actor_role = 'owner' and target_role = 'admin' then
    update public.community_group_members set role='member' where group_id=target_group and user_id=target_user;
  elsif action = 'remove' and (target_role = 'member' or (actor_role = 'owner' and target_role = 'admin')) then
    delete from public.community_group_members where group_id=target_group and user_id=target_user;
  else raise exception 'not authorized' using errcode = '42501'; end if;
  get diagnostics changed = row_count;
  if changed = 1 then insert into public.community_audit_log(actor_id,item_id,context_id,item_kind,decision) values(auth.uid(),target_user,target_group,'group_member',action); end if;
  return changed = 1;
end $$;
revoke all on function public.community_group_roster(uuid), public.community_group_manage(uuid,uuid,text) from public, anon;
grant execute on function public.community_group_roster(uuid), public.community_group_manage(uuid,uuid,text) to authenticated;

-- Decisions create notifications in the same transaction as moderation. Names
-- and submitted text are intentionally not copied into the inbox.
create function public.community_notify_decision() returns trigger
language plpgsql security definer set search_path = pg_catalog, public
as $$ declare recipient uuid; kind text; begin
  if new.status = old.status or new.status not in ('approved','rejected') then return new; end if;
  if tg_table_name = 'community_posts' then recipient := new.author_id; kind := 'post';
  elsif tg_table_name = 'community_comments' then recipient := new.author_id; kind := 'comment';
  elsif tg_table_name = 'community_profiles' then recipient := new.user_id; kind := 'profile';
  elsif tg_table_name = 'community_groups' then recipient := new.owner_id; kind := 'group';
  else raise exception 'invalid notification source'; end if;
  insert into public.community_notifications(recipient_id,event) values(recipient,kind || '_' || new.status);
  return new;
end $$;
revoke all on function public.community_notify_decision() from public, anon, authenticated;
create trigger community_notify_post after update of status on public.community_posts for each row execute function public.community_notify_decision();
create trigger community_notify_comment after update of status on public.community_comments for each row execute function public.community_notify_decision();
create trigger community_notify_profile after update of status on public.community_profiles for each row execute function public.community_notify_decision();
create trigger community_notify_group after update of status on public.community_groups for each row execute function public.community_notify_decision();

-- Moderator queue and decisions execute only after checking membership inside
-- the database. No one can self-assign moderator through the public API.
create function public.community_review_queue() returns table(id uuid, kind text, body text, created_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public
as $$ begin
  if not exists(select 1 from public.community_moderators where user_id = auth.uid()) then raise exception 'not authorized' using errcode = '42501'; end if;
  return query select p.id, 'post'::text, p.body, p.created_at from public.community_posts p where p.status = 'pending'
    union all select c.id, 'comment'::text, c.body, c.created_at from public.community_comments c where c.status = 'pending'
    union all select pr.user_id, 'profile'::text, pr.display_name, pr.updated_at from public.community_profiles pr where pr.status = 'pending'
    union all select g.id, 'group'::text, g.name || E'\n' || g.description, g.created_at from public.community_groups g where g.status = 'pending'
    order by created_at asc limit 100;
end $$;
create function public.community_review(item_id uuid, item_kind text, decision text, expected_body text) returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $$ declare changed integer; begin
  if not exists(select 1 from public.community_moderators where user_id = auth.uid()) then raise exception 'not authorized' using errcode = '42501'; end if;
  if decision not in ('approved','rejected') then raise exception 'invalid decision'; end if;
  if item_kind = 'post' then update public.community_posts set status = decision where id = item_id and status = 'pending' and body = expected_body;
  elsif item_kind = 'comment' then update public.community_comments set status = decision where id = item_id and status = 'pending' and body = expected_body;
  elsif item_kind = 'profile' then update public.community_profiles set status = decision where user_id = item_id and status = 'pending' and display_name = expected_body;
  elsif item_kind = 'group' then update public.community_groups set status = decision where id = item_id and status = 'pending' and name || E'\n' || description = expected_body;
  else raise exception 'invalid item'; end if;
  get diagnostics changed = row_count;
  if changed = 1 then insert into public.community_audit_log(actor_id,item_id,item_kind,decision) values(auth.uid(),item_id,item_kind,decision); end if;
  return changed = 1;
end $$;
-- Reports are private: only an explicitly provisioned moderator may inspect
-- or resolve them. A removal affects the reported version only.
create function public.community_report_queue() returns table(id uuid, post_id uuid, reason text, reported_body text, created_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public
as $$ begin
  if not exists(select 1 from public.community_moderators where user_id = auth.uid()) then raise exception 'not authorized' using errcode = '42501'; end if;
  return query select r.id, r.post_id, r.reason, r.reported_body, r.created_at from public.community_reports r where r.status = 'open' order by r.created_at limit 100;
end $$;
create function public.community_resolve_report(report_id uuid, decision text) returns text
language plpgsql security definer set search_path = pg_catalog, public
as $$ declare r public.community_reports%rowtype; outcome text; changed integer; begin
  if not exists(select 1 from public.community_moderators where user_id = auth.uid()) then raise exception 'not authorized' using errcode = '42501'; end if;
  if decision not in ('dismissed','removed') then raise exception 'invalid decision'; end if;
  select * into r from public.community_reports where id = report_id and status = 'open' for update;
  if not found then return 'missing'; end if;
  outcome := decision;
  if decision = 'removed' then
    update public.community_posts set status = 'rejected' where id = r.post_id and status = 'approved' and body = r.reported_body;
    get diagnostics changed = row_count;
    if changed = 0 then outcome := 'stale'; end if;
  end if;
  update public.community_reports set status = outcome, resolved_at = now() where id = r.id;
  insert into public.community_notifications(recipient_id,event) values(r.reporter_id,'report_resolved');
  insert into public.community_audit_log(actor_id,item_id,item_kind,decision) values(auth.uid(),r.id,'report',outcome);
  return outcome;
end $$;
revoke all on function public.community_report_queue(), public.community_resolve_report(uuid,text) from public, anon;
grant execute on function public.community_report_queue(), public.community_resolve_report(uuid,text) to authenticated;
revoke all on function public.community_review_queue(), public.community_review(uuid,text,text,text) from public, anon;
grant execute on function public.community_review_queue(), public.community_review(uuid,text,text,text) to authenticated;
commit;
