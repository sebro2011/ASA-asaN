/**
 * Space News — real astronomy/spaceflight headlines + arXiv papers.
 *
 * Data comes from `/api/news` and `/api/news/papers`, which aggregate
 * Spaceflight News (no key), GNews, NewsAPI and The Guardian server-side. The
 * browser only ever learns *which* providers are configured.
 *
 * Honesty contract, same as the rest of the workspace:
 *   - nothing is cached in the client, so a reload always asks the server;
 *   - an unconfigured provider is shown as "no key" with the env var to set;
 *   - a failed provider is shown as "unreachable", and its stories are absent;
 *   - if the whole feed fails the panel says so and offers a retry;
 *   - every story links to its publisher, and "Ask NOVA" quotes only the title
 *     and summary that the server received.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  ExternalLink,
  Loader2,
  MessageSquare,
  Newspaper,
  RefreshCw,
} from 'lucide-react';
import { navigate } from '../../app/router';
import { queuePrompt, queueThinking } from '../chat/pendingPrompt';

export type NewsTopic = 'all' | 'missions' | 'universe' | 'earth';

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  imageUrl: string | null;
  sourceId: string;
  sourceLabel: string;
  publishedAt: string | null;
}

export interface PaperItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  authors: string[];
  publishedAt: string | null;
  categories: string[];
}

interface SourceReport {
  id: string;
  label: string;
  envVar: string | null;
  docs: string;
  configured: boolean;
  state: 'ok' | 'unconfigured' | 'error';
  count: number;
}

interface NewsPayload {
  ok: boolean;
  items: NewsItem[];
  sources: SourceReport[];
  generatedAt?: string;
  cached?: boolean;
}

interface PapersPayload {
  ok: boolean;
  items: PaperItem[];
  cached?: boolean;
}

const TOPICS: { id: NewsTopic; labelKey: string }[] = [
  { id: 'all', labelKey: 'wsNewsTopicAll' },
  { id: 'missions', labelKey: 'wsNewsTopicMissions' },
  { id: 'universe', labelKey: 'wsNewsTopicUniverse' },
  { id: 'earth', labelKey: 'wsNewsTopicEarth' },
];

export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}

export function formatDate(value: string | null, language: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString(language, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function askNova(prompt: string) {
  if (!queuePrompt(prompt)) return;
  queueThinking('thinking');
  navigate('/chat');
}

function SourceChip({ source }: { source: SourceReport }) {
  const { t } = useTranslation();
  const hint = source.configured
    ? source.state === 'error'
      ? t('wsNewsStateError')
      : t('wsNewsSourceCount', { count: source.count })
    : source.envVar
      ? t('wsNewsAddKey', { env: source.envVar })
      : t('wsNewsNoKey');

  return (
    <span
      className={`nova-news-source ${source.configured ? '' : 'nova-news-source--off'} ${
        source.state === 'error' ? 'nova-news-source--error' : ''
      }`}
      title={hint}
    >
      <span className="nova-dot" aria-hidden="true" />
      {source.label}
      <span className="nova-news-source__state">
        {source.configured
          ? source.state === 'error'
            ? t('wsNewsStateError')
            : t('wsNewsStateOk')
          : t('wsNewsNoKey')}
      </span>
    </span>
  );
}

export default function NewsSurface() {
  const { t, i18n } = useTranslation();
  const language = i18n.language || 'en';
  const [topic, setTopic] = useState<NewsTopic>('all');
  const [news, setNews] = useState<{
    status: 'loading' | 'ready' | 'error';
    items: NewsItem[];
    sources: SourceReport[];
    generatedAt?: string;
    cached?: boolean;
  }>({ status: 'loading', items: [], sources: [] });
  const [papers, setPapers] = useState<{ status: 'loading' | 'ready' | 'error'; items: PaperItem[] }>({
    status: 'loading',
    items: [],
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setNews({ status: 'loading', items: [], sources: [] });
    void (async () => {
      try {
        const response = await fetch(`/api/news?topic=${topic}&limit=18`, {
          headers: { Accept: 'application/json' },
        });
        const payload = (await response.json()) as NewsPayload;
        if (!alive) return;
        if (!response.ok || payload.ok !== true) {
          setNews({
            status: 'error',
            items: [],
            sources: Array.isArray(payload?.sources) ? payload.sources : [],
          });
          return;
        }
        setNews({
          status: 'ready',
          items: Array.isArray(payload.items) ? payload.items : [],
          sources: Array.isArray(payload.sources) ? payload.sources : [],
          generatedAt: payload.generatedAt,
          cached: payload.cached === true,
        });
      } catch {
        if (alive) setNews({ status: 'error', items: [], sources: [] });
      }
    })();
    return () => {
      alive = false;
    };
  }, [topic, attempt]);

  useEffect(() => {
    let alive = true;
    setPapers({ status: 'loading', items: [] });
    void (async () => {
      try {
        const response = await fetch('/api/news/papers?limit=6', { headers: { Accept: 'application/json' } });
        const payload = (await response.json()) as PapersPayload;
        if (!alive) return;
        if (!response.ok || payload.ok !== true) {
          setPapers({ status: 'error', items: [] });
          return;
        }
        setPapers({ status: 'ready', items: Array.isArray(payload.items) ? payload.items : [] });
      } catch {
        if (alive) setPapers({ status: 'error', items: [] });
      }
    })();
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const updated = news.generatedAt
    ? t('wsNewsUpdated', {
        time: new Date(news.generatedAt).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }),
      })
    : '';

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ws-text-3">{t('wsWorkspace')}</p>
          <h1 className="mt-1.5 flex items-center gap-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ws-text">
            <Newspaper size={22} strokeWidth={1.9} aria-hidden="true" className="text-ws-accent-ink" />
            {t('wsNewsTitle')}
          </h1>
          <p className="mt-2 max-w-[46rem] text-[13px] leading-relaxed text-ws-text-2">{t('wsNewsSubtitle')}</p>
        </div>
        <button type="button" className="nova-btn nova-btn--secondary" onClick={retry} disabled={news.status === 'loading'}>
          <RefreshCw size={13} strokeWidth={2} aria-hidden="true" />
          {t('wsNewsRefresh')}
        </button>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {TOPICS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`nova-chip ${topic === entry.id ? 'nova-chip--active' : ''}`}
            aria-pressed={topic === entry.id}
            onClick={() => setTopic(entry.id)}
          >
            {t(entry.labelKey)}
          </button>
        ))}
        {updated ? <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.1em] text-ws-text-3">{updated}</span> : null}
        {news.cached ? <span className="nova-chip nova-chip--muted">{t('wsNewsCached')}</span> : null}
      </div>

      <section aria-labelledby="nova-news-sources" className="nova-card mt-4 p-4">
        <h2 id="nova-news-sources" className="text-[12.5px] font-medium text-ws-text">
          {t('wsNewsSourcesTitle')}
        </h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ws-text-3">{t('wsNewsSourcesBody')}</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {news.sources.length > 0 ? (
            news.sources.map((source) => <SourceChip key={source.id} source={source} />)
          ) : (
            <span className="nova-news-source nova-news-source--off">{t('wsNewsNoKey')}</span>
          )}
        </div>
      </section>

      {news.status === 'loading' ? (
        <p className="nova-card mt-4 flex items-center gap-2 p-5 text-[12.5px] text-ws-text-3" role="status">
          <Loader2 size={13} strokeWidth={2} className="nova-spin" aria-hidden="true" />
          {t('wsNewsLoading')}
        </p>
      ) : null}

      {news.status === 'error' ? (
        <div className="nova-card mt-4 p-5" role="alert">
          <p className="flex items-center gap-2 text-[13px] font-medium text-ws-text">
            <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" className="text-ws-accent-ink" />
            {t('wsNewsError')}
          </p>
          {news.sources.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {news.sources.map((source) => (
                <SourceChip key={source.id} source={source} />
              ))}
            </div>
          ) : null}
          <button type="button" className="nova-btn nova-btn--secondary mt-3" onClick={retry}>
            <RefreshCw size={12} strokeWidth={2} aria-hidden="true" />
            {t('wsNewsRetry')}
          </button>
        </div>
      ) : null}

      {news.status === 'ready' && news.items.length === 0 ? (
        <div className="nova-card mt-4 p-5">
          <p className="text-[13px] font-medium text-ws-text">{t('wsNewsEmpty')}</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ws-text-3">{t('wsNewsEmptyBody')}</p>
        </div>
      ) : null}

      {news.status === 'ready' && news.items.length > 0 ? (
        <ul className="nova-news-grid mt-4 list-none p-0">
          {news.items.map((item) => {
            const prompt = fillTemplate(t('wsNewsAskPrompt'), {
              source: item.sourceLabel || item.sourceId,
              date: formatDate(item.publishedAt, language) || '—',
              title: item.title,
              summary: item.summary || '—',
            });
            return (
              <li key={item.id} className="nova-news-card">
                {item.imageUrl ? (
                  <img
                    className="nova-news-card__image"
                    src={item.imageUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                ) : null}
                <div className="nova-news-card__body">
                  <p className="nova-news-card__meta">
                    <span>{item.sourceLabel || item.sourceId}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={item.publishedAt ?? undefined}>{formatDate(item.publishedAt, language)}</time>
                  </p>
                  <a className="nova-news-card__title" href={item.url} target="_blank" rel="noopener noreferrer">
                    {item.title}
                  </a>
                  {item.summary ? <p className="nova-news-card__summary">{item.summary}</p> : null}
                  <div className="nova-news-card__actions">
                    <button type="button" className="nova-btn nova-btn--secondary" onClick={() => askNova(prompt)}>
                      <MessageSquare size={12} strokeWidth={2} aria-hidden="true" />
                      {t('wsNewsAsk')}
                    </button>
                    <a className="nova-news-card__link" href={item.url} target="_blank" rel="noopener noreferrer">
                      {t('wsNewsOpen')}
                      <ExternalLink size={11} strokeWidth={2} aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <section aria-labelledby="nova-papers-heading" className="nova-card mt-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2
              id="nova-papers-heading"
              className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-ws-text"
            >
              <BookOpen size={16} strokeWidth={1.9} aria-hidden="true" className="text-ws-accent-ink" />
              {t('wsNewsPapersTitle')}
            </h2>
            <p className="mt-1 max-w-[42rem] text-[11.5px] leading-relaxed text-ws-text-3">
              {t('wsNewsPapersSubtitle')}
            </p>
          </div>
        </div>

        {papers.status === 'loading' ? (
          <p className="mt-3 flex items-center gap-2 text-[12px] text-ws-text-3" role="status">
            <Loader2 size={12} strokeWidth={2} className="nova-spin" aria-hidden="true" />
            {t('wsNewsLoading')}
          </p>
        ) : null}

        {papers.status === 'error' ? (
          <p className="mt-3 flex items-center gap-2 text-[12px] text-ws-text-2" role="alert">
            <AlertTriangle size={12} strokeWidth={2} aria-hidden="true" />
            {t('wsNewsPapersError')}
          </p>
        ) : null}

        {papers.status === 'ready' && papers.items.length === 0 ? (
          <p className="mt-3 text-[12px] text-ws-text-3">{t('wsNewsPapersEmpty')}</p>
        ) : null}

        {papers.status === 'ready' && papers.items.length > 0 ? (
          <ul className="mt-3 flex list-none flex-col gap-3 p-0">
            {papers.items.map((paper) => {
              const prompt = fillTemplate(t('wsNewsPaperPrompt'), {
                title: paper.title,
                authors: paper.authors.join(', ') || '—',
                summary: paper.summary || '—',
              });
              return (
                <li key={paper.id} className="nova-paper">
                  <a className="nova-paper__title" href={paper.url} target="_blank" rel="noopener noreferrer">
                    {paper.title}
                    <ArrowUpRight size={12} strokeWidth={2} aria-hidden="true" />
                  </a>
                  <p className="nova-paper__meta">
                    {paper.authors.length > 0 ? t('wsNewsPaperAuthors', { count: paper.authors.length }) : ''}
                    {paper.categories.length > 0 ? ` · ${paper.categories.join(' · ')}` : ''}
                    {paper.publishedAt ? ` · ${formatDate(paper.publishedAt, language)}` : ''}
                  </p>
                  {paper.summary ? <p className="nova-paper__summary">{paper.summary}</p> : null}
                  <button type="button" className="nova-btn nova-btn--secondary mt-2" onClick={() => askNova(prompt)}>
                    <MessageSquare size={12} strokeWidth={2} aria-hidden="true" />
                    {t('wsNewsPaperAsk')}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <p className="mt-4 text-[11px] leading-relaxed text-ws-text-3">{t('wsNewsOfflineNote')}</p>
    </div>
  );
}
