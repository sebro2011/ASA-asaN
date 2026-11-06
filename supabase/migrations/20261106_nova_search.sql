-- =============================================================================
-- NOVA AI Workspace — Phase 3C full-text search
-- =============================================================================
-- Additive and idempotent: adds generated `search_vector` columns, GIN indexes
-- and one read-only ranking function. No existing column, table, policy or row
-- is modified, and `supabase/cosmovision.sql` is untouched.
--
-- Design notes
--   * `to_tsvector('simple', …)` is used on purpose. NOVA is trilingual
--     (English / Sinhala / Tamil); the language-specific configs only exist for
--     a handful of languages and would stem Sinhala text wrongly. `simple`
--     tokenises and lowercases without inventing stems, so a ranking query can
--     never drop a legitimate match because of the wrong stemmer.
--   * The columns are `generated always … stored`, so the index can never drift
--     from the row: inserts and updates maintain it with no trigger and no
--     application code to forget.
--   * GIN indexes make `@@` a index scan rather than a sequential scan.
--   * `nova_search` is `security invoker`, so RLS decides what a caller can see.
--     It is not granted to `anon` at all.
--   * Documents may hold up to 400 000 characters, and a tsvector is capped at
--     1 MB, so indexing is bounded to the first 200 000 characters of long
--     bodies (titles are always fully indexed).
--
-- Rollback: see the tail of this file (commented out, run manually).
-- =============================================================================

-- ------------------------------------------------------------------- indexes

alter table public.messages
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('simple', left(content, 200000))) stored;

create index if not exists messages_search_vector_idx
  on public.messages using gin (search_vector);

alter table public.documents
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple', left(title, 200)), 'A') ||
    setweight(to_tsvector('simple', left(content, 200000)), 'B')
  ) stored;

create index if not exists documents_search_vector_idx
  on public.documents using gin (search_vector);

alter table public.conversations
  add column if not exists search_vector tsvector
  generated always as (setweight(to_tsvector('simple', left(title, 160)), 'A')) stored;

create index if not exists conversations_search_vector_idx
  on public.conversations using gin (search_vector);

-- ------------------------------------------------------------------- search
-- Ranked search across the three things a person actually looks for: their own
-- messages, their documents, and a conversation by title.
--
-- `websearch_to_tsquery` accepts what people type (`novA moon landing`, quoted
-- phrases, `-excluded`) and never raises on odd input, unlike `to_tsquery`.
-- If the ranked pass finds nothing, one substring pass runs so that a partial
-- word ("stream" matching "streaming") still returns something.

create or replace function public.nova_search(query text, match_limit integer default 20)
returns table (
  kind text,
  id uuid,
  conversation_id uuid,
  title text,
  snippet text,
  rank real,
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  raw text := trim(coalesce(query, ''));
  lim integer := least(greatest(coalesce(match_limit, 20), 1), 50);
  tsq tsquery;
  needle text;
begin
  if char_length(raw) < 2 then
    return;
  end if;

  tsq := websearch_to_tsquery('simple', raw);
  -- Escape wildcards so a literal '%' or '_' does not turn into a pattern.
  needle := '%' || replace(replace(replace(raw, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
    with hits as (
      select
        'message'::text as kind,
        m.id,
        m.conversation_id,
        c.title,
        ts_headline(
          'simple',
          left(m.content, 6000),
          tsq,
          'StartSel=<mark>, StopSel=</mark>, MaxWords=28, MinWords=8, MaxFragments=1, FragmentDelimiter= … '
        ) as snippet,
        ts_rank(m.search_vector, tsq) as rank,
        m.created_at
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where tsq is not null
        and m.search_vector @@ tsq
        and not m.is_error
        and c.deleted_at is null

      union all

      select
        'document'::text,
        d.id,
        null::uuid,
        d.title,
        ts_headline(
          'simple',
          left(d.content, 6000),
          tsq,
          'StartSel=<mark>, StopSel=</mark>, MaxWords=28, MinWords=8, MaxFragments=1, FragmentDelimiter= … '
        ),
        ts_rank(d.search_vector, tsq),
        d.created_at
      from public.documents d
      where tsq is not null
        and d.search_vector @@ tsq
        and d.deleted_at is null

      union all

      select
        'conversation'::text,
        c.id,
        c.id,
        c.title,
        ''::text,
        ts_rank(c.search_vector, tsq),
        c.created_at
      from public.conversations c
      where tsq is not null
        and c.search_vector @@ tsq
        and c.deleted_at is null
    )
    select h.kind, h.id, h.conversation_id, h.title, h.snippet, h.rank, h.created_at
      from hits h
     order by h.rank desc, h.created_at desc
     limit lim;

  if found then
    return;
  end if;

  -- Substring fallback: only when the ranked pass produced nothing, and only
  -- over the same RLS-visible rows. Ranked last by construction (rank 0).
  return query
    select
      'message'::text as kind,
      m.id,
      m.conversation_id,
      c.title,
      left(m.content, 240) as snippet,
      0::real as rank,
      m.created_at
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.content ilike needle escape '\'
      and not m.is_error
      and c.deleted_at is null

    union all

    select
      'document'::text,
      d.id,
      null::uuid,
      d.title,
      left(d.content, 240),
      0::real,
      d.created_at
    from public.documents d
    where (d.title ilike needle escape '\' or d.content ilike needle escape '\')
      and d.deleted_at is null

    union all

    select
      'conversation'::text,
      c.id,
      c.id,
      c.title,
      ''::text,
      0::real,
      c.created_at
    from public.conversations c
    where c.title ilike needle escape '\'
      and c.deleted_at is null

    order by 7 desc
    limit lim;
end;
$$;

revoke all on function public.nova_search(text, integer) from public, anon;
grant execute on function public.nova_search(text, integer) to authenticated;

-- ----------------------------------------------------------------- rollback
-- Run manually if this migration must be undone (nothing above is destructive,
-- so this only removes the new index, columns and function):
--
--   drop function if exists public.nova_search(text, integer);
--   drop index if exists public.messages_search_vector_idx;
--   drop index if exists public.documents_search_vector_idx;
--   drop index if exists public.conversations_search_vector_idx;
--   alter table public.messages drop column if exists search_vector;
--   alter table public.documents drop column if exists search_vector;
--   alter table public.conversations drop column if exists search_vector;
