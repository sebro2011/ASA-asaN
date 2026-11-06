/**
 * Workspace search client (Phase 3C).
 *
 * One call, one contract: `public.nova_search(query, match_limit)` — a
 * `security invoker` function, so RLS decides what comes back. Nothing is
 * filtered in the browser that the database has not already filtered.
 *
 * The snippet arrives with `<mark>` markers produced by `ts_headline`, not
 * HTML from user content, so it is parsed into segments and rendered as React
 * text. No `dangerouslySetInnerHTML` anywhere in this module's consumers.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type SearchKind = 'message' | 'document' | 'conversation';
export type SearchScope = 'all' | SearchKind;

/** `nova_search` refuses shorter input; the UI says so instead of guessing. */
export const MIN_QUERY_LENGTH = 2;
export const DEFAULT_LIMIT = 30;

export interface SnippetSegment {
  text: string;
  hit: boolean;
}

export interface SearchHit {
  kind: SearchKind;
  id: string;
  conversationId: string | null;
  title: string;
  /** Raw `ts_headline` output, markers included — use `snippetSegments`. */
  snippet: string;
  rank: number;
  createdAt: string;
}

export type SearchErrorCode = 'SEARCH_FAILED' | 'SEARCH_UNAVAILABLE';

export class SearchError extends Error {
  code: SearchErrorCode;

  constructor(code: SearchErrorCode, message: string) {
    super(message);
    this.name = 'SearchError';
    this.code = code;
  }
}

const MARK_OPEN = '<mark>';
const MARK_CLOSE = '</mark>';

/** Split a `ts_headline` snippet into plain and highlighted runs. */
export function snippetSegments(raw: string): SnippetSegment[] {
  if (!raw) return [];
  const segments: SnippetSegment[] = [];
  let index = 0;

  while (index < raw.length) {
    const open = raw.indexOf(MARK_OPEN, index);
    if (open === -1) {
      segments.push({ text: raw.slice(index), hit: false });
      break;
    }
    if (open > index) segments.push({ text: raw.slice(index, open), hit: false });

    const close = raw.indexOf(MARK_CLOSE, open + MARK_OPEN.length);
    const end = close === -1 ? raw.length : close;
    segments.push({ text: raw.slice(open + MARK_OPEN.length, end), hit: true });
    index = close === -1 ? raw.length : close + MARK_CLOSE.length;
  }

  return segments.filter((segment) => segment.text.length > 0);
}

function normaliseKind(value: unknown): SearchKind | null {
  return value === 'message' || value === 'document' || value === 'conversation' ? value : null;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Normalise one returned row; unknown kinds are dropped rather than guessed. */
export function normaliseHit(row: Record<string, unknown>): SearchHit | null {
  const kind = normaliseKind(row.kind);
  if (!kind) return null;
  const id = asText(row.id);
  if (!id) return null;

  return {
    kind,
    id,
    conversationId: asText(row.conversation_id) || null,
    title: asText(row.title),
    snippet: asText(row.snippet),
    rank: typeof row.rank === 'number' ? row.rank : Number(row.rank ?? 0) || 0,
    createdAt: asText(row.created_at),
  };
}

/**
 * Where a hit should take the reader, or `null` when it has no live surface.
 *
 * A message opens the conversation it belongs to. The router normalises query
 * strings away, so a `?message=` anchor would be dropped; the thread is the
 * honest destination until the chat surface can scroll to a message id.
 */
export function hitHref(hit: SearchHit): string | null {
  if (hit.kind === 'conversation') return `/chat/${encodeURIComponent(hit.id)}`;
  if (hit.kind === 'message' && hit.conversationId) return `/chat/${encodeURIComponent(hit.conversationId)}`;
  // Documents land in Phase 4B; a link into a placeholder would be a dead end.
  return null;
}

export interface SearchOptions {
  limit?: number;
  scope?: SearchScope;
  signal?: AbortSignal;
}

/**
 * Run a workspace search.
 *
 * Throws `SearchError` for transport/permission problems so the surface can
 * show a retry instead of an empty "no results" that would be a lie.
 */
export async function searchWorkspace(
  client: SupabaseClient | null,
  query: string,
  options: SearchOptions = {},
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];
  if (!client) throw new SearchError('SEARCH_UNAVAILABLE', 'Search needs a signed-in account.');

  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), 50);

  let response: { data: unknown; error: unknown };
  try {
    response = await client.rpc('nova_search', { query: trimmed, match_limit: limit });
  } catch (caught) {
    throw new SearchError('SEARCH_FAILED', caught instanceof Error ? caught.message : 'Search failed.');
  }

  if (options.signal?.aborted) return [];

  const { data, error } = response;
  if (error) {
    const message =
      typeof error === 'object' && error && 'message' in error
        ? String((error as { message: unknown }).message)
        : 'Search failed.';
    throw new SearchError('SEARCH_FAILED', message);
  }

  const rows = Array.isArray(data) ? data : [];
  const hits = rows
    .map((row) => (row && typeof row === 'object' ? normaliseHit(row as Record<string, unknown>) : null))
    .filter((hit): hit is SearchHit => hit !== null);

  return options.scope && options.scope !== 'all'
    ? hits.filter((hit) => hit.kind === options.scope)
    : hits;
}

/** Counts per kind, used for the scope chips. */
export function hitCounts(hits: SearchHit[]): Record<SearchScope, number> {
  return {
    all: hits.length,
    message: hits.filter((hit) => hit.kind === 'message').length,
    document: hits.filter((hit) => hit.kind === 'document').length,
    conversation: hits.filter((hit) => hit.kind === 'conversation').length,
  };
}

/** The subset a scope chip shows, preserving rank order. */
export function filterByScope(hits: SearchHit[], scope: SearchScope): SearchHit[] {
  return scope === 'all' ? hits : hits.filter((hit) => hit.kind === scope);
}
