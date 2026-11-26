-- =============================================================================
-- NOVA AI Workspace — private knowledge indexing and retrieval
-- =============================================================================
-- Extracted text remains on the existing owner-scoped knowledge_files row.
-- This migration materializes bounded overlapping chunks, enables owner-scoped
-- full-text retrieval, and adds indexed files to the existing workspace search.
-- It does not expose storage paths or file bytes.
--
-- The client may only write its own knowledge_files metadata (existing RLS).
-- A pinned SECURITY DEFINER trigger creates chunks from that row; authenticated
-- clients receive read-only access to their own chunks through RLS.
-- =============================================================================

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  knowledge_file_id uuid not null references public.knowledge_files (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (char_length(content) between 1 and 1600),
  search_vector tsvector generated always as (to_tsvector('simple', left(content, 1600))) stored,
  created_at timestamptz not null default now(),
  unique (knowledge_file_id, chunk_index)
);

create index if not exists knowledge_chunks_user_file_idx
  on public.knowledge_chunks (user_id, knowledge_file_id, chunk_index);
create index if not exists knowledge_chunks_search_vector_idx
  on public.knowledge_chunks using gin (search_vector);

alter table public.knowledge_chunks enable row level security;
revoke all on public.knowledge_chunks from public, anon, authenticated;
grant select on public.knowledge_chunks to authenticated;

drop policy if exists knowledge_chunks_select_own on public.knowledge_chunks;
create policy knowledge_chunks_select_own on public.knowledge_chunks
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.knowledge_files f
       where f.id = knowledge_chunks.knowledge_file_id
         and f.user_id = (select auth.uid())
    )
  );

create or replace function public.index_knowledge_file_chunks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  source_text text := left(coalesce(new.extracted_text, ''), 200000);
  source_length integer := char_length(source_text);
  chunk_size constant integer := 1600;
  overlap_size constant integer := 200;
  start_at integer := 1;
  part integer := 0;
begin
  delete from public.knowledge_chunks where knowledge_file_id = new.id;
  if source_length = 0 or new.index_status <> 'ready' then
    return new;
  end if;

  while start_at <= source_length loop
    insert into public.knowledge_chunks (knowledge_file_id, user_id, chunk_index, content)
    values (
      new.id,
      new.user_id,
      part,
      substring(source_text from start_at for least(chunk_size, source_length - start_at + 1))
    );
    exit when start_at + chunk_size - 1 >= source_length;
    start_at := start_at + chunk_size - overlap_size;
    part := part + 1;
  end loop;
  return new;
end;
$$;

revoke all on function public.index_knowledge_file_chunks() from public, anon, authenticated;

drop trigger if exists knowledge_files_index_chunks on public.knowledge_files;
create trigger knowledge_files_index_chunks
  after insert or update of extracted_text, index_status on public.knowledge_files
  for each row execute function public.index_knowledge_file_chunks();

-- Backfill existing extracted text through the same bounded trigger path.
update public.knowledge_files
   set extracted_text = extracted_text
 where extracted_text is not null and index_status = 'ready';

create or replace function public.nova_retrieve_knowledge(query text, match_limit integer default 5)
returns table (
  knowledge_file_id uuid,
  chunk_id uuid,
  title text,
  content text,
  rank real,
  chunk_index integer,
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  raw text := trim(coalesce(query, ''));
  lim integer := least(greatest(coalesce(match_limit, 5), 1), 8);
  tsq tsquery;
  needle text;
begin
  if char_length(raw) < 2 then
    return;
  end if;

  tsq := websearch_to_tsquery('simple', raw);
  needle := '%' || replace(replace(replace(raw, E'\', E'\\'), '%', E'\%'), '_', E'\_') || '%';

  return query
    with ranked as (
      select
        c.knowledge_file_id,
        c.id as chunk_id,
        f.name as title,
        c.content,
        ts_rank(c.search_vector, tsq) as rank,
        c.chunk_index,
        f.created_at,
        row_number() over (
          partition by c.knowledge_file_id
          order by ts_rank(c.search_vector, tsq) desc, c.chunk_index
        ) as file_position
      from public.knowledge_chunks c
      join public.knowledge_files f on f.id = c.knowledge_file_id
      where tsq is not null and c.search_vector @@ tsq
    )
    select r.knowledge_file_id, r.chunk_id, r.title, r.content, r.rank, r.chunk_index, r.created_at
      from ranked r
     where r.file_position = 1
     order by r.rank desc, r.created_at desc
     limit lim;

  if found then
    return;
  end if;

  return query
    select distinct on (c.knowledge_file_id)
      c.knowledge_file_id,
      c.id,
      f.name,
      c.content,
      0::real,
      c.chunk_index,
      f.created_at
    from public.knowledge_chunks c
    join public.knowledge_files f on f.id = c.knowledge_file_id
    where c.content ilike needle escape E'\' or f.name ilike needle escape E'\'
    order by c.knowledge_file_id, c.chunk_index
    limit lim;
end;
$$;

revoke all on function public.nova_retrieve_knowledge(text, integer) from public, anon;
grant execute on function public.nova_retrieve_knowledge(text, integer) to authenticated;

-- Extend global workspace search with private, owner-scoped knowledge files.
-- Each file appears once, at the rank of its best matching chunk.
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
  needle := '%' || replace(replace(replace(raw, E'\', E'\\'), '%', E'\%'), '_', E'\_') || '%';

  return query
    with knowledge_ranked as (
      select
        f.id,
        f.name,
        ts_headline(
          'simple', c.content, tsq,
          'StartSel=<mark>, StopSel=</mark>, MaxWords=28, MinWords=8, MaxFragments=1, FragmentDelimiter= … '
        ) as snippet,
        ts_rank(c.search_vector, tsq) as rank,
        f.created_at,
        row_number() over (partition by f.id order by ts_rank(c.search_vector, tsq) desc, c.chunk_index) as file_position
      from public.knowledge_chunks c
      join public.knowledge_files f on f.id = c.knowledge_file_id
      where tsq is not null and c.search_vector @@ tsq
    ),
    hits as (
      select
        'message'::text as kind,
        m.id,
        m.conversation_id,
        c.title,
        ts_headline('simple', left(m.content, 6000), tsq,
          'StartSel=<mark>, StopSel=</mark>, MaxWords=28, MinWords=8, MaxFragments=1, FragmentDelimiter= … ') as snippet,
        ts_rank(m.search_vector, tsq) as rank,
        m.created_at
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where tsq is not null and m.search_vector @@ tsq and not m.is_error and c.deleted_at is null

      union all

      select
        'document'::text,
        d.id,
        null::uuid,
        d.title,
        ts_headline('simple', left(d.content, 6000), tsq,
          'StartSel=<mark>, StopSel=</mark>, MaxWords=28, MinWords=8, MaxFragments=1, FragmentDelimiter= … '),
        ts_rank(d.search_vector, tsq),
        d.created_at
      from public.documents d
      where tsq is not null and d.search_vector @@ tsq and d.deleted_at is null

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
      where tsq is not null and c.search_vector @@ tsq and c.deleted_at is null

      union all

      select
        'knowledge'::text,
        k.id,
        null::uuid,
        k.name,
        k.snippet,
        k.rank,
        k.created_at
      from knowledge_ranked k
      where k.file_position = 1
    )
    select h.kind, h.id, h.conversation_id, h.title, h.snippet, h.rank, h.created_at
      from hits h
     order by h.rank desc, h.created_at desc
     limit lim;

  if found then
    return;
  end if;

  return query
    with knowledge_fallback as (
      select distinct on (f.id)
        f.id,
        f.name,
        left(c.content, 240) as snippet,
        f.created_at
      from public.knowledge_files f
      join public.knowledge_chunks c on c.knowledge_file_id = f.id
      where f.name ilike needle escape E'\' or c.content ilike needle escape E'\'
      order by f.id, c.chunk_index
    ),
    fallback_hits as (
      select 'message'::text as kind, m.id, m.conversation_id, c.title,
             left(m.content, 240) as snippet, 0::real as rank, m.created_at
        from public.messages m
        join public.conversations c on c.id = m.conversation_id
       where m.content ilike needle escape E'\' and not m.is_error and c.deleted_at is null
      union all
      select 'document'::text, d.id, null::uuid, d.title, left(d.content, 240), 0::real, d.created_at
        from public.documents d
       where (d.title ilike needle escape E'\' or d.content ilike needle escape E'\') and d.deleted_at is null
      union all
      select 'conversation'::text, c.id, c.id, c.title, ''::text, 0::real, c.created_at
        from public.conversations c
       where c.title ilike needle escape E'\' and c.deleted_at is null
      union all
      select 'knowledge'::text, k.id, null::uuid, k.name, k.snippet, 0::real, k.created_at
        from knowledge_fallback k
    )
    select h.kind, h.id, h.conversation_id, h.title, h.snippet, h.rank, h.created_at
      from fallback_hits h
     order by h.created_at desc
     limit lim;
end;
$$;

revoke all on function public.nova_search(text, integer) from public, anon;
grant execute on function public.nova_search(text, integer) to authenticated;

-- Manual rollback:
--   drop function if exists public.nova_retrieve_knowledge(text, integer);
--   drop trigger if exists knowledge_files_index_chunks on public.knowledge_files;
--   drop function if exists public.index_knowledge_file_chunks();
--   drop table if exists public.knowledge_chunks;
-- The nova_search definition can be restored by re-running 20261106_nova_search.sql.
