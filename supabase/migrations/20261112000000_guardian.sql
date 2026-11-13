-- COSMORA API Guardian — persistent, fleet-shared state.
--
-- Why SQL and not "read, modify, write over PostgREST": every operation that has
-- to be correct across serverless instances (counter increments, circuit state,
-- leases) lives in a single statement here. A read-modify-write across two HTTP
-- round trips lets two instances both observe "no lease" and both take it, which
-- is exactly the bug a distributed monitor must not have.
--
-- Access model: the guardian tables are closed to `anon` and `authenticated`
-- (RLS on, no policies). Only the service-role key used by the server can read
-- them, and the key never reaches the browser.
--
-- Apply with: `supabase db push` (or `psql -f` against the project database).

begin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.guardian_kv (
  key        text primary key,
  value      jsonb not null,
  version    bigint not null default 1,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.guardian_leases (
  key        text primary key,
  owner      text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.guardian_counters (
  key      text primary key,
  count    bigint not null default 0,
  reset_at timestamptz not null
);

-- Append-only. Immutability is enforced below with a trigger, not by convention.
create table if not exists public.guardian_audit (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  actor    text not null,
  action   text not null,
  target   text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  detail   jsonb
);

create table if not exists public.guardian_samples (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  provider_id text not null,
  status      text not null,
  code        text not null,
  latency_ms  integer,
  http_status integer,
  reason      text,
  run_id      text
);

create table if not exists public.guardian_runs (
  id          text primary key,
  started_at  timestamptz not null,
  finished_at timestamptz,
  trigger     text not null,
  instance_id text not null,
  summary     jsonb,
  error       text
);

create index if not exists guardian_samples_at_idx on public.guardian_samples (at desc);
create index if not exists guardian_samples_provider_idx on public.guardian_samples (provider_id, at desc);
create index if not exists guardian_audit_at_idx on public.guardian_audit (at desc);
create index if not exists guardian_runs_started_idx on public.guardian_runs (started_at desc);
create index if not exists guardian_kv_expires_idx on public.guardian_kv (expires_at);

-- ---------------------------------------------------------------------------
-- Audit immutability
-- ---------------------------------------------------------------------------

create or replace function public.guardian_audit_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'guardian_audit is append-only (attempted %)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists guardian_audit_no_update on public.guardian_audit;
create trigger guardian_audit_no_update
  before update or delete on public.guardian_audit
  for each row execute function public.guardian_audit_immutable();

-- ---------------------------------------------------------------------------
-- Key/value with optimistic concurrency
-- ---------------------------------------------------------------------------

create or replace function public.guardian_kv_get(p_key text, p_now timestamptz default now())
returns table (value jsonb, version bigint, expires_at timestamptz)
language sql
stable
as $$
  select k.value, k.version, k.expires_at
  from public.guardian_kv k
  where k.key = p_key
    and (k.expires_at is null or k.expires_at > p_now);
$$;

create or replace function public.guardian_kv_set(p_key text, p_value jsonb, p_ttl_ms bigint default null)
returns table (version bigint, expires_at timestamptz)
language plpgsql
as $$
declare
  v_now       timestamptz := now();
  v_expires   timestamptz := case
                               when p_ttl_ms is null then null
                               else v_now + make_interval(secs => p_ttl_ms / 1000.0)
                             end;
  v_version   bigint;
  v_expires_at timestamptz;
begin
  insert into public.guardian_kv as kv (key, value, version, expires_at, updated_at)
  values (p_key, p_value, 1, v_expires, v_now)
  on conflict (key) do update
    set value      = excluded.value,
        version    = kv.version + 1,
        expires_at = excluded.expires_at,
        updated_at = v_now
  returning kv.version, kv.expires_at into v_version, v_expires_at;

  version := v_version;
  expires_at := v_expires_at;
  return next;
end;
$$;

create or replace function public.guardian_kv_cas(
  p_key text,
  p_expected_version bigint,
  p_value jsonb,
  p_ttl_ms bigint default null
)
returns table (ok boolean, version bigint, expires_at timestamptz)
language plpgsql
as $$
declare
  v_now      timestamptz := now();
  v_expires  timestamptz := case
                              when p_ttl_ms is null then null
                              else v_now + make_interval(secs => p_ttl_ms / 1000.0)
                            end;
  v_version  bigint;
  v_exp      timestamptz;
begin
  if p_expected_version is null then
    -- create-only: fails if a live record already exists
    insert into public.guardian_kv as kv (key, value, version, expires_at, updated_at)
    values (p_key, p_value, 1, v_expires, v_now)
    on conflict (key) do nothing
    returning kv.version, kv.expires_at into v_version, v_exp;
    if v_version is null then
      ok := false; version := null; expires_at := null; return next; return;
    end if;
    ok := true; version := v_version; expires_at := v_exp; return next; return;
  end if;

  update public.guardian_kv as kv
     set value = p_value,
         version = kv.version + 1,
         expires_at = v_expires,
         updated_at = v_now
   where kv.key = p_key
     and kv.version = p_expected_version
     and (kv.expires_at is null or kv.expires_at > v_now)
  returning kv.version, kv.expires_at into v_version, v_exp;

  if v_version is null then
    ok := false; version := null; expires_at := null; return next; return;
  end if;
  ok := true; version := v_version; expires_at := v_exp; return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixed-window counter (fleet rate limiting)
-- ---------------------------------------------------------------------------

create or replace function public.guardian_counter(p_key text, p_window_ms bigint, p_amount bigint default 1)
returns table (count bigint, reset_at timestamptz)
language plpgsql
as $$
declare
  v_now   timestamptz := now();
  v_count bigint;
  v_reset timestamptz;
begin
  insert into public.guardian_counters as c (key, count, reset_at)
  values (p_key, p_amount, v_now + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update
    set count = case when c.reset_at <= v_now then p_amount else c.count + p_amount end,
        reset_at = case
                     when c.reset_at <= v_now
                       then v_now + make_interval(secs => p_window_ms / 1000.0)
                     else c.reset_at
                   end
  returning c.count, c.reset_at into v_count, v_reset;

  count := v_count;
  reset_at := v_reset;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lease (single holder across the fleet)
-- ---------------------------------------------------------------------------

create or replace function public.guardian_lease(p_key text, p_owner text, p_ttl_ms bigint, p_mode text)
returns boolean
language plpgsql
as $$
declare
  v_now      timestamptz := now();
  v_expires  timestamptz := v_now + make_interval(secs => greatest(p_ttl_ms, 1) / 1000.0);
  v_ok       boolean;
begin
  if p_mode = 'release' then
    delete from public.guardian_leases where key = p_key and owner = p_owner;
    return true;
  end if;

  if p_mode = 'renew' then
    update public.guardian_leases
       set expires_at = v_expires, updated_at = v_now
     where key = p_key and owner = p_owner and expires_at > v_now;
    return found;
  end if;

  -- acquire: free, expired, or already ours
  insert into public.guardian_leases as l (key, owner, expires_at, updated_at)
  values (p_key, p_owner, v_expires, v_now)
  on conflict (key) do update
    set owner = excluded.owner, expires_at = excluded.expires_at, updated_at = v_now
    where l.owner = p_owner or l.expires_at <= v_now
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Housekeeping + health
-- ---------------------------------------------------------------------------

create or replace function public.guardian_prune(p_now timestamptz default now())
returns integer
language plpgsql
as $$
declare
  v_removed integer := 0;
  v_rows    integer;
begin
  delete from public.guardian_kv where expires_at is not null and expires_at <= p_now;
  get diagnostics v_rows = row_count; v_removed := v_removed + v_rows;

  delete from public.guardian_leases where expires_at <= p_now;
  get diagnostics v_rows = row_count; v_removed := v_removed + v_rows;

  delete from public.guardian_counters where reset_at <= p_now - interval '1 hour';
  get diagnostics v_rows = row_count; v_removed := v_removed + v_rows;

  -- Retention: 90 days of samples, 30 days of runs. Audit is never pruned.
  delete from public.guardian_samples where at < p_now - interval '90 days';
  delete from public.guardian_runs where started_at < p_now - interval '30 days';

  return v_removed;
end;
$$;

create or replace function public.guardian_health()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'ok', true,
    'kv', (select count(*) from public.guardian_kv),
    'leases', (select count(*) from public.guardian_leases),
    'sampledAt', now()
  );
$$;

-- ---------------------------------------------------------------------------
-- Lockdown
-- ---------------------------------------------------------------------------

alter table public.guardian_kv        enable row level security;
alter table public.guardian_leases    enable row level security;
alter table public.guardian_counters  enable row level security;
alter table public.guardian_audit     enable row level security;
alter table public.guardian_samples   enable row level security;
alter table public.guardian_runs      enable row level security;

-- No policies are created on purpose: RLS with zero policies denies every
-- non-service-role request. The service role bypasses RLS and is the only
-- credential the server uses for these tables.

revoke all on public.guardian_kv       from anon, authenticated;
revoke all on public.guardian_leases   from anon, authenticated;
revoke all on public.guardian_counters from anon, authenticated;
revoke all on public.guardian_audit    from anon, authenticated;
revoke all on public.guardian_samples  from anon, authenticated;
revoke all on public.guardian_runs     from anon, authenticated;

-- Audit is append-only even for the service role (enforced by the trigger above),
-- and the API layer only ever inserts or selects it.

commit;
