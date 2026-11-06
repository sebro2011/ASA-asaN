/**
 * NOVA Search surface (Phase 3C).
 *
 * Ranked full-text search over the signed-in user's own data, backed by
 * `public.nova_search` (`tsvector` + GIN). The route is wrapped in
 * `RequireAuth`: the database would refuse the call anyway, but a signed-out
 * visitor should see why instead of an empty list.
 *
 * Honesty notes:
 *  - results are the database's ranking, not re-sorted here;
 *  - a transport or permission failure shows a retry, never "no results";
 *  - document hits have no live module yet (Phase 4B) and say so instead of
 *    linking into a placeholder.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, FileText, Loader2, MessageSquare, Search, TriangleAlert, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Link, navigate } from '../../app/router';
import {
  MIN_QUERY_LENGTH,
  SearchError,
  filterByScope,
  hitCounts,
  hitHref,
  searchWorkspace,
  snippetSegments,
  type SearchHit,
  type SearchKind,
  type SearchScope,
} from './searchClient';

const DEBOUNCE_MS = 220;

const SCOPES: Array<{ id: SearchScope; labelKey: string }> = [
  { id: 'all', labelKey: 'wsSearchScopeAll' },
  { id: 'message', labelKey: 'wsSearchScopeMessages' },
  { id: 'document', labelKey: 'wsSearchScopeDocuments' },
  { id: 'conversation', labelKey: 'wsSearchScopeConversations' },
];

/** Literal keys, so the shell parity test sees all three languages. */
function kindLabel(kind: SearchKind, t: (key: string) => string): string {
  switch (kind) {
    case 'message':
      return t('wsSearchKindMessage');
    case 'document':
      return t('wsSearchKindDocument');
    default:
      return t('wsSearchKindConversation');
  }
}

function KindIcon({ kind }: { kind: SearchKind }) {
  if (kind === 'document') return <FileText size={13} strokeWidth={1.8} aria-hidden="true" />;
  if (kind === 'conversation') return <Search size={13} strokeWidth={1.8} aria-hidden="true" />;
  return <MessageSquare size={13} strokeWidth={1.8} aria-hidden="true" />;
}

function readQueryFromUrl(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('q') ?? '';
}

function writeQueryToUrl(query: string): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const params = new URLSearchParams(window.location.search);
  if (query.trim()) params.set('q', query.trim());
  else params.delete('q');
  const search = params.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}`);
}

function Highlighted({ snippet }: { snippet: string }) {
  const segments = useMemo(() => snippetSegments(snippet), [snippet]);
  return (
    <>
      {segments.map((segment, index) =>
        segment.hit ? (
          <mark
            key={index}
            className="rounded-[2px] px-0.5"
            style={{
              background: 'color-mix(in srgb, var(--color-ws-accent) 26%, transparent)',
              color: 'inherit',
            }}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

export default function SearchSurface() {
  const { t } = useTranslation();
  const { client, user } = useAuth();
  const [query, setQuery] = useState<string>(readQueryFromUrl);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<SearchScope>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const requestRef = useRef(0);

  const trimmed = query.trim();
  const ready = trimmed.length >= MIN_QUERY_LENGTH && Boolean(user);

  const run = useCallback(
    async (next: string) => {
      const request = requestRef.current + 1;
      requestRef.current = request;
      setState('loading');
      setError(null);
      try {
        const found = await searchWorkspace(client, next);
        if (requestRef.current !== request) return;
        setHits(found);
        setActiveIndex(0);
        setState('ready');
      } catch (caught) {
        if (requestRef.current !== request) return;
        setHits([]);
        setError(caught instanceof SearchError ? caught.message : 'Search failed.');
        setState('error');
      }
    },
    [client],
  );

  useEffect(() => {
    writeQueryToUrl(query);
    if (!ready) {
      requestRef.current += 1;
      setHits([]);
      setState('idle');
      setError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      void run(trimmed);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, ready, run, trimmed]);

  const counts = useMemo(() => hitCounts(hits), [hits]);
  const visible = useMemo(() => filterByScope(hits, scope), [hits, scope]);

  useEffect(() => {
    if (activeIndex > visible.length - 1) setActiveIndex(0);
  }, [activeIndex, visible.length]);

  const open = (hit: SearchHit) => {
    const href = hitHref(hit);
    if (href) navigate(href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && visible.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % visible.length);
    } else if (event.key === 'ArrowUp' && visible.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + visible.length) % visible.length);
    } else if (event.key === 'Enter' && visible[activeIndex]) {
      event.preventDefault();
      open(visible[activeIndex]);
    } else if (event.key === 'Escape' && query) {
      event.preventDefault();
      setQuery('');
    }
  };

  const status =
    !user
      ? t('wsSearchNeedsAccount')
      : trimmed.length < MIN_QUERY_LENGTH
        ? t('wsSearchStart')
        : state === 'loading'
          ? t('wsSearchSearching')
          : state === 'error'
            ? t('wsSearchError')
            : state === 'ready'
              ? t('wsSearchMatchesFound', { count: hits.length })
              : '';

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header>
        <h1 className="text-[16px] font-semibold text-ws-text">{t('wsSearchPageTitle')}</h1>
        <p className="mt-1 max-w-prose text-[12px] leading-relaxed text-ws-text-3">{t('wsSearchPageIntro')}</p>
      </header>

      <div className="nova-card p-3">
        <div className="flex items-center gap-2">
          <Search size={15} strokeWidth={1.9} aria-hidden="true" className="shrink-0 text-ws-text-3" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label={t('wsSearchField')}
            aria-describedby="nova-search-status"
            placeholder={t('wsSearchField')}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ws-text outline-none placeholder:text-ws-text-3"
          />
          {state === 'loading' ? (
            <Loader2 size={14} strokeWidth={2} aria-hidden="true" className="shrink-0 animate-spin text-ws-text-3" />
          ) : null}
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('wsSearchClear')}
              className="shrink-0 rounded p-1 text-ws-text-3 transition-colors hover:text-ws-text"
            >
              <X size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <p id="nova-search-status" role="status" aria-live="polite" className="mt-1.5 text-[11.5px] text-ws-text-3">
          {status}
        </p>

        {hits.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t('wsSearchScopeLabel')}>
            {SCOPES.map((item) => {
              const active = scope === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setScope(item.id);
                    setActiveIndex(0);
                  }}
                  className="rounded-full border px-2.5 py-1 text-[11.5px] transition-colors"
                  style={{
                    borderColor: active
                      ? 'color-mix(in srgb, var(--color-ws-accent) 55%, transparent)'
                      : 'var(--color-ws-border)',
                    color: active ? 'var(--color-ws-accent-ink)' : 'var(--color-ws-text-2)',
                    background: active ? 'color-mix(in srgb, var(--color-ws-accent) 12%, transparent)' : 'transparent',
                  }}
                >
                  {t(item.labelKey)} {counts[item.id]}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {state === 'error' ? (
        <div className="nova-card flex items-start gap-2.5 p-3" role="alert">
          <TriangleAlert size={15} strokeWidth={1.9} aria-hidden="true" className="mt-0.5 shrink-0 text-ws-warn" />
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-ws-text">{t('wsSearchError')}</p>
            <p className="mt-0.5 break-words text-[11.5px] text-ws-text-3">{error}</p>
            <button
              type="button"
              onClick={() => void run(trimmed)}
              className="mt-2 rounded-md border px-2.5 py-1 text-[11.5px] text-ws-text transition-colors"
              style={{ borderColor: 'var(--color-ws-border)' }}
            >
              {t('wsSearchRetry')}
            </button>
          </div>
        </div>
      ) : null}

      {state === 'ready' && hits.length === 0 ? (
        <div className="nova-card p-4">
          <p className="text-[12.5px] font-medium text-ws-text">{t('wsSearchEmpty', { query: trimmed })}</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ws-text-3">{t('wsSearchEmptyBody')}</p>
        </div>
      ) : null}

      {visible.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label={t('wsSearchResultsLabel')}>
          {visible.map((hit, index) => {
            const href = hitHref(hit);
            const active = index === activeIndex;
            const body = (
              <>
                <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-ws-text-3">
                  <KindIcon kind={hit.kind} />
                  <span>{kindLabel(hit.kind, t)}</span>
                  {hit.title ? <span className="truncate normal-case tracking-normal">· {hit.title}</span> : null}
                </div>
                {hit.snippet ? (
                  <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-ws-text-2">
                    <Highlighted snippet={hit.snippet} />
                  </p>
                ) : (
                  <p className="mt-1 text-[12px] text-ws-text-2">{t('wsSearchOpenChat')}</p>
                )}
                {hit.kind === 'document' ? (
                  <p className="mt-1 text-[11px] text-ws-text-3">{t('wsSearchDocSoon')}</p>
                ) : null}
              </>
            );

            return (
              <li key={`${hit.kind}:${hit.id}`}>
                {href ? (
                  <Link
                    to={href}
                    onMouseEnter={() => setActiveIndex(index)}
                    className="nova-card flex items-start justify-between gap-3 p-3 transition-colors"
                    style={
                      active
                        ? { borderColor: 'color-mix(in srgb, var(--color-ws-accent) 45%, transparent)' }
                        : undefined
                    }
                  >
                    <div className="min-w-0">{body}</div>
                    <ArrowRight size={14} strokeWidth={1.9} aria-hidden="true" className="mt-1 shrink-0 text-ws-text-3" />
                  </Link>
                ) : (
                  <div className="nova-card p-3">
                    <div className="min-w-0">{body}</div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
