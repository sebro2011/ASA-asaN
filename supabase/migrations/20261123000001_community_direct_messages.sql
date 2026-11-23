-- DRAFT ONLY: private, text-only two-person messaging; not production ready.
-- Requires community foundation migration. Default policy denies new requests.
begin;
create table public.community_dm_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  allow_requests boolean not null default false
);
create table public.community_blocks (
  blocker_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create table public.community_dm_threads (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  check(requester_id <> recipient_id)
);
create unique index community_dm_pair_unique on public.community_dm_threads(least(requester_id,recipient_id),greatest(requester_id,recipient_id));
create index community_dm_requester_idx on public.community_dm_threads(requester_id,created_at desc);
create index community_dm_recipient_idx on public.community_dm_threads(recipient_id,created_at desc);
create table public.community_dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.community_dm_threads(id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check(char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index community_dm_messages_history on public.community_dm_messages(thread_id,created_at desc,id desc);
create table public.community_dm_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.community_dm_messages(id) on delete cascade,
  reported_body text not null,
  reason text not null check(char_length(btrim(reason)) between 5 and 500),
  status text not null default 'open' check(status in ('open','dismissed','removed')),
  created_at timestamptz not null default now()
);
create unique index community_dm_reports_one_open on public.community_dm_reports(reporter_id,message_id) where status='open';

alter table public.community_dm_preferences enable row level security;
alter table public.community_blocks enable row level security;
alter table public.community_dm_threads enable row level security;
alter table public.community_dm_messages enable row level security;
alter table public.community_dm_reports enable row level security;
revoke all on public.community_dm_preferences,public.community_blocks,public.community_dm_threads,public.community_dm_messages,public.community_dm_reports from public,anon,authenticated;
grant select,delete on public.community_dm_preferences to authenticated;
grant insert(allow_requests),update(allow_requests) on public.community_dm_preferences to authenticated;
grant select,delete on public.community_blocks to authenticated;
grant insert(blocked_id) on public.community_blocks to authenticated;
grant select on public.community_dm_threads,public.community_dm_messages to authenticated;
grant insert(thread_id,body) on public.community_dm_messages to authenticated;

-- This returns only a boolean, not the identity or existence of a block.
create function public.community_dm_unblocked(a uuid,b uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public
as $$ select auth.uid() in (a,b) and not exists(select 1 from public.community_blocks x where (x.blocker_id=a and x.blocked_id=b) or (x.blocker_id=b and x.blocked_id=a)) $$;
revoke all on function public.community_dm_unblocked(uuid,uuid) from public,anon;
grant execute on function public.community_dm_unblocked(uuid,uuid) to authenticated;

create policy community_dm_preferences_select on public.community_dm_preferences for select to authenticated using(user_id=auth.uid());
create policy community_dm_preferences_insert on public.community_dm_preferences for insert to authenticated with check(user_id=auth.uid() and public.community_can_write());
create policy community_dm_preferences_update on public.community_dm_preferences for update to authenticated using(user_id=auth.uid() and public.community_can_write()) with check(user_id=auth.uid() and public.community_can_write());
create policy community_dm_preferences_delete on public.community_dm_preferences for delete to authenticated using(user_id=auth.uid());
create policy community_blocks_select on public.community_blocks for select to authenticated using(blocker_id=auth.uid());
-- Users can block even when suspended; blocking is a safety action.
create policy community_blocks_insert on public.community_blocks for insert to authenticated with check(blocker_id=auth.uid());
create policy community_blocks_delete on public.community_blocks for delete to authenticated using(blocker_id=auth.uid());
create policy community_dm_threads_read on public.community_dm_threads for select to authenticated
  using(auth.uid() in (requester_id,recipient_id) and public.community_dm_unblocked(requester_id,recipient_id));
create policy community_dm_messages_read on public.community_dm_messages for select to authenticated
  using(removed_at is null and exists(select 1 from public.community_dm_threads t where t.id=thread_id and t.status='accepted' and auth.uid() in (t.requester_id,t.recipient_id) and public.community_dm_unblocked(t.requester_id,t.recipient_id)));
create policy community_dm_messages_insert on public.community_dm_messages for insert to authenticated
  with check(sender_id=auth.uid() and public.community_can_write() and exists(select 1 from public.community_dm_threads t where t.id=thread_id and t.status='accepted' and auth.uid() in (t.requester_id,t.recipient_id) and public.community_dm_unblocked(t.requester_id,t.recipient_id)));
create trigger community_dm_messages_limit before insert on public.community_dm_messages for each row execute function public.community_limit_insert();

-- Atomic request creation; no text is delivered until recipient consents.
-- Targets must have explicitly opted in and have an approved public profile.
create function public.community_dm_request(target uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog,public
as $$ declare id uuid; n integer; begin
  if not public.community_can_write() or target is null or target=auth.uid() or not public.community_dm_unblocked(auth.uid(),target)
     or not exists(select 1 from public.community_dm_preferences p where p.user_id=target and p.allow_requests)
     or not exists(select 1 from public.community_profiles p where p.user_id=target and p.status='approved')
  then raise exception 'request unavailable' using errcode='42501'; end if;
  -- Serialize quotas across requests; failed transactions do not consume quota.
  insert into public.community_rate_limits(user_id,action,window_start,count) values(auth.uid(),'community_dm_request',now(),1)
  on conflict(user_id,action) do update set count=case when community_rate_limits.window_start < now()-interval '1 hour' then 1 else community_rate_limits.count+1 end,
    window_start=case when community_rate_limits.window_start < now()-interval '1 hour' then now() else community_rate_limits.window_start end returning count into n;
  if n>10 then raise exception 'community rate limit exceeded' using errcode='P0001'; end if;
  insert into public.community_dm_threads(requester_id,recipient_id) values(auth.uid(),target) returning community_dm_threads.id into id;
  return id;
end $$;
create function public.community_dm_answer(thread uuid, accept boolean) returns boolean
language plpgsql security definer set search_path=pg_catalog,public
as $$ declare changed integer; begin
  if not public.community_can_write() or accept is null then raise exception 'not authorized' using errcode='42501'; end if;
  update public.community_dm_threads t set status=case when accept then 'accepted' else 'rejected' end
    where t.id=thread and t.recipient_id=auth.uid() and t.status='pending' and public.community_dm_unblocked(t.requester_id,t.recipient_id);
  get diagnostics changed=row_count; return changed=1;
end $$;
-- Reporting is an explicit safety action; the recipient may report even if
-- suspended, but only a currently accessible message from the other party.
create function public.community_dm_report(message uuid, report_reason text) returns uuid
language plpgsql security definer set search_path=pg_catalog,public
as $$ declare snapshot text; id uuid; n integer; begin
  select m.body into snapshot from public.community_dm_messages m join public.community_dm_threads t on t.id=m.thread_id
    where m.id=message and m.removed_at is null and m.sender_id<>auth.uid() and t.status='accepted' and auth.uid() in(t.requester_id,t.recipient_id);
  if snapshot is null then raise exception 'not authorized' using errcode='42501'; end if;
  insert into public.community_rate_limits(user_id,action,window_start,count) values(auth.uid(),'community_dm_report',now(),1)
  on conflict(user_id,action) do update set count=case when community_rate_limits.window_start < now()-interval '1 hour' then 1 else community_rate_limits.count+1 end,
    window_start=case when community_rate_limits.window_start < now()-interval '1 hour' then now() else community_rate_limits.window_start end returning count into n;
  if n>10 then raise exception 'community rate limit exceeded' using errcode='P0001'; end if;
  insert into public.community_dm_reports(reporter_id,message_id,reported_body,reason) values(auth.uid(),message,snapshot,report_reason) returning community_dm_reports.id into id;
  return id;
end $$;
-- Only explicit moderators may see a reported message, and only after a
-- participant reports it. Decisions are recorded without storing text in audit.
create function public.community_dm_report_queue() returns table(id uuid,reason text,reported_body text,created_at timestamptz)
language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  if not exists(select 1 from public.community_moderators where user_id=auth.uid()) then raise exception 'not authorized' using errcode='42501'; end if;
  return query select r.id,r.reason,r.reported_body,r.created_at from public.community_dm_reports r where r.status='open' order by r.created_at limit 100;
end $$;
create function public.community_dm_resolve_report(report uuid, decision text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public
as $$ declare r public.community_dm_reports%rowtype; begin
  if not exists(select 1 from public.community_moderators where user_id=auth.uid()) then raise exception 'not authorized' using errcode='42501'; end if;
  if decision not in ('dismissed','removed') then raise exception 'invalid decision'; end if;
  select * into r from public.community_dm_reports where id=report and status='open' for update;
  if not found then return false; end if;
  if decision='removed' then update public.community_dm_messages set removed_at=now() where id=r.message_id and removed_at is null; end if;
  update public.community_dm_reports set status=decision where id=r.id;
  insert into public.community_audit_log(actor_id,item_id,item_kind,decision) values(auth.uid(),r.id,'dm_report',decision);
  return true;
end $$;
revoke all on function public.community_dm_report_queue(),public.community_dm_resolve_report(uuid,text) from public,anon;
grant execute on function public.community_dm_report_queue(),public.community_dm_resolve_report(uuid,text) to authenticated;
revoke all on function public.community_dm_request(uuid),public.community_dm_answer(uuid,boolean),public.community_dm_report(uuid,text) from public,anon;
grant execute on function public.community_dm_request(uuid),public.community_dm_answer(uuid,boolean),public.community_dm_report(uuid,text) to authenticated;
commit;
