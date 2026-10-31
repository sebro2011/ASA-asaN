import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown, ArrowRight, ArrowUp, BadgeCheck, ChevronLeft, ChevronRight, Clapperboard,
  ExternalLink, Film, Globe2, Info, Play, Search, Users, X
} from 'lucide-react';
import YouTubePlayer from './YouTubePlayer';
import { CommunityActions, ReportButton, useCommunity } from './CommunityTools';
import type { SpaceVideo, SpaceVideoCategory, SpaceVideoResponse } from './types';
import './spaceShorts.css';

const CATEGORIES: Array<{ id: SpaceVideoCategory; key: string }> = [
  { id: 'all', key: 'ssAll' },
  { id: 'missions', key: 'ssMissions' },
  { id: 'solar-system', key: 'ssSolarSystem' },
  { id: 'universe', key: 'ssUniverse' },
  { id: 'earth', key: 'ssEarth' }
];
const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function formatDuration(seconds?: number) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = Math.floor(seconds % 60);
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}` : `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function publishedDate(date: string | undefined, language: string) {
  if (!date || Number.isNaN(Date.parse(date))) return null;
  try {
    const locale = language.startsWith('si') ? 'si-LK' : language.startsWith('ta') ? 'ta-LK' : 'en-US';
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(date));
  } catch { return null; }
}

type FeedTab = 'all' | 'shorts' | 'nasa' | 'community';
type FeedResponse = SpaceVideoResponse & { communityUnavailable?: boolean };
type AllCursor = { youtube: string | null; community: string | null; source: 'youtube' | 'curated' };

async function fetchSingle(tab: Exclude<FeedTab, 'all'> | 'youtube', category: SpaceVideoCategory, query: string, token: string, signal: AbortSignal): Promise<SpaceVideoResponse> {
  const community = tab === 'community';
  const params = new URLSearchParams({ category, q: query });
  if (!community) {
    params.set('mode', tab === 'shorts' ? 'shorts' : 'videos');
    if (tab === 'nasa') params.set('scope', 'nasa');
  }
  if (token) params.set('pageToken', token);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal.aborted) cancel();
  else signal.addEventListener('abort', cancel, { once: true });
  const timeout = window.setTimeout(cancel, 20_000);
  try {
    const endpoint = community ? '/api/community/videos' : '/api/space-videos';
    const response = await fetch(`${endpoint}?${params}`, { signal: controller.signal });
    let data: any;
    try { data = await response.json(); } catch { throw new Error('upstream'); }
    if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'upstream');
    if (!Array.isArray(data?.items) || !(community ? data.source === 'community' : ['youtube', 'curated'].includes(data.source))) throw new Error('upstream');
    // Only a validated ID can reach the player or thumbnail URL.
    const items: SpaceVideo[] = data.items.filter((video: any) => video && typeof video.id === 'string'
      && ID_PATTERN.test(video.id) && typeof video.title === 'string' && typeof video.channelTitle === 'string')
      .map((video: SpaceVideo) => ({
        ...video,
        description: typeof video.description === 'string' ? video.description : '',
        communityId: typeof video.communityId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(video.communityId) ? video.communityId : undefined,
        categories: Array.isArray(video.categories) ? video.categories.filter((value) => CATEGORIES.some((item) => item.id === value && value !== 'all')) : [],
        thumbnailUrl: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`
      }));
    return { ...data, items, nextPageToken: typeof data.nextPageToken === 'string' ? data.nextPageToken : null };
  } catch (failure) {
    if (controller.signal.aborted && !signal.aborted) throw new Error('network');
    throw failure;
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}

async function fetchPage(tab: FeedTab, category: SpaceVideoCategory, query: string, token: string, signal: AbortSignal): Promise<FeedResponse> {
  if (tab !== 'all') return fetchSingle(tab, category, query, token, signal);
  // Keep independent continuation tokens for the two real data sources. A
  // disabled community backend does not block YouTube discovery on page one.
  const cursor: AllCursor = token ? JSON.parse(token) : { youtube: '', community: '', source: 'youtube' };
  const youtubeRequest = cursor.youtube === null ? Promise.resolve(null) : fetchSingle('youtube', category, query, cursor.youtube, signal);
  const communityRequest = cursor.community === null ? Promise.resolve(null) : fetchSingle('community', category, query, cursor.community, signal);
  const [youtubeResult, communityResult] = await Promise.allSettled([youtubeRequest, communityRequest]);
  if (youtubeResult.status === 'rejected') throw youtubeResult.reason;
  if (communityResult.status === 'rejected' && (token || signal.aborted)) throw communityResult.reason;
  const youtube = youtubeResult.value;
  const community = communityResult.status === 'fulfilled' ? communityResult.value : null;
  const source = (youtube?.source || cursor.source) as 'youtube' | 'curated';
  const next: AllCursor = { youtube: youtube?.nextPageToken ?? null, community: community?.nextPageToken ?? null, source };
  const seen = new Set<string>();
  const items = [...(community?.items || []), ...(youtube?.items || [])].filter((video) => !seen.has(video.id) && !!seen.add(video.id));
  return { items, source, reason: youtube?.reason, cached: youtube?.cached,
    communityUnavailable: communityResult.status === 'rejected',
    nextPageToken: next.youtube || next.community ? JSON.stringify(next) : null };
}

function Thumbnail({ video, className = '' }: { video: SpaceVideo; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [video.id]);
  return (
    <span className={`ss-thumbnail ${className}`} aria-hidden="true">
      {failed ? <span className="ss-thumbnail-fallback"><Clapperboard size={24} /></span>
        : <img src={video.thumbnailUrl} alt="" loading="lazy" onError={() => setFailed(true)} />}
    </span>
  );
}

function Channel({ video }: { video: SpaceVideo }) {
  const { t } = useTranslation();
  const name = video.channelTitle.trim() || t('ssPublisherUnknown');
  return (
    <div className="ss-channel">
      <span className="ss-channel-avatar" aria-hidden="true">{video.channelTitle.trim().charAt(0).toLocaleUpperCase() || '?'}</span>
      <span className="min-w-0">
        <span className="ss-channel-name">{name}</span>
        {video.officialAgency && <span className="ss-verified"><BadgeCheck size={13} aria-hidden="true" /> {t('ssVerified')}</span>}
      </span>
    </div>
  );
}

function WatchLink({ video }: { video: SpaceVideo }) {
  const { t } = useTranslation();
  return (
    <a className="ss-text-link" href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer">
      {t('ssOpenYouTube')} <ExternalLink size={13} aria-hidden="true" />
    </a>
  );
}

const SOURCE_HOSTS = new Set([
  'svs.gsfc.nasa.gov', 'sci.esa.int', 'thecrashcourse.com', 'www.pbs.org', 'www.thesciencechannel.org'
]);

function SourceLink({ video }: { video: SpaceVideo }) {
  const { t } = useTranslation();
  // Only link citations from explicitly allowed HTTPS publishers, not URLs
  // supplied by a search query or a potentially malformed API response.
  let source: URL;
  try { source = new URL(video.sourceUrl || ''); } catch { return null; }
  if (source.protocol !== 'https:' || source.username || source.password || source.port || !SOURCE_HOSTS.has(source.hostname)) return null;
  return <a className="ss-source-link" href={source.href} target="_blank" rel="noopener noreferrer">{t('ssSource')} <ExternalLink size={12} aria-hidden="true" /></a>;
}

function StarterNotice({ reason }: { reason?: string }) {
  const { t } = useTranslation();
  let key = 'ssStarterConfig';
  if (reason === 'missing-key') key = 'ssStarterMissing';
  else if (reason === 'quota') key = 'ssStarterQuota';
  else if (reason === 'network') key = 'ssStarterNetwork';
  else if (reason === 'rate-limit') key = 'ssStarterRate';
  return <div className="ss-notice" role="status"><Info size={16} aria-hidden="true" /><span>{t(key)}</span></div>;
}

function ShortsFeed({ items, index, setIndex, playerOpen, setPlayerOpen }: { items: SpaceVideo[]; index: number; setIndex: (index: number) => void; playerOpen: boolean; setPlayerOpen: (open: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const video = items[index];
  if (!video) return null;
  const queue = items.map((item, itemIndex) => ({ item, itemIndex })).filter(({ itemIndex }) => itemIndex !== index).slice(0, 3);
  const choose = (next: number) => {
    if (next >= 0 && next < items.length) setIndex(next);
  };
  const date = publishedDate(video.publishedAt, i18n.language);
  const duration = formatDuration(video.durationSeconds);
  return (
    <div
      className="ss-short-panel"
      role="region"
      tabIndex={0}
      aria-label={t('ssFeed')}
      aria-describedby="ss-keyboard-help"
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); choose(index + 1); }
        if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); choose(index - 1); }
      }}
    >
      <div className="ss-panel-bar">
        <span><span className="ss-status-dot" /> {t('ssFeed')}</span>
        <span>{t('ssPagePosition', { current: String(index + 1).padStart(2, '0'), total: String(items.length).padStart(2, '0') })}</span>
      </div>
      <div className="ss-short-layout">
        <div className="ss-film-column">
          <div className={`ss-film-frame ${video.portraitVerified ? '' : 'is-format-unknown'}`}>
            {playerOpen ? <YouTubePlayer key={video.id} video={video} /> : (
              <button type="button" className="ss-poster" onClick={() => setPlayerOpen(true)} aria-label={t('ssPlay', { title: video.title })}>
                <Thumbnail video={video} className="ss-poster-image" />
                <span className="ss-poster-shade" />
                <span className="ss-poster-top"><span className="ss-status-dot" /> {t('ssNowPlaying')}</span>
                <span className="ss-big-play"><Play size={25} fill="currentColor" aria-hidden="true" /></span>
                <span className="ss-poster-bottom"><span>{t('ssPlayHint')}</span><ArrowRight size={15} aria-hidden="true" /></span>
              </button>
            )}
          </div>
          <div className="ss-short-controls">
            <button type="button" onClick={() => choose(index - 1)} disabled={index === 0} aria-label={t('ssPrevious')}><ArrowUp size={16} aria-hidden="true" /><span>{t('ssPrevious')}</span></button>
            <span className="ss-control-divider" />
            <button type="button" onClick={() => choose(index + 1)} disabled={index === items.length - 1} aria-label={t('ssNext')}><span>{t('ssNext')}</span><ArrowDown size={16} aria-hidden="true" /></button>
          </div>
        </div>
        <div className="ss-short-story">
          <div>
            <div className="ss-story-eyebrow"><span className="ss-status-dot" /> {t('ssNowPlaying')} <span className="ss-story-number">/ {String(index + 1).padStart(2, '0')}</span></div>
            <h3 className="ss-story-title" aria-live="polite">{video.title}</h3>
            <Channel video={video} />
            {video.description && <p className="ss-story-description">{video.description}</p>}
            {(date || duration) && <p className="ss-video-meta">{date && <time dateTime={video.publishedAt}>{date}</time>}{date && duration && <span> · </span>}{duration}</p>}
            <div className="ss-story-links"><WatchLink video={video} /><SourceLink video={video} /></div>
            <p className="ss-player-instructions">{t('ssPlayerHelp')}</p>
          </div>
          {queue.length > 0 && (
            <div className="ss-queue">
              <div className="ss-queue-header"><span>{t('ssUpNext')}</span><span>{String(queue.length).padStart(2, '0')}</span></div>
              {queue.map(({ item, itemIndex }) => (
                <button className="ss-queue-item" type="button" key={item.id} onClick={() => { choose(itemIndex); setPlayerOpen(true); }} aria-label={t('ssPlay', { title: item.title })}>
                  <Thumbnail video={item} />
                  <span className="ss-queue-copy"><span>{item.title}</span><small>{item.channelTitle || t('ssPublisherUnknown')}</small></span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
          <p id="ss-keyboard-help" className="ss-keyboard-hint">{t('ssKeyboardHelp')}</p>
        </div>
      </div>
    </div>
  );
}

function VideoCard({ video, onSelect }: { video: SpaceVideo; onSelect: () => void }) {
  const { t, i18n } = useTranslation();
  const duration = formatDuration(video.durationSeconds);
  const date = publishedDate(video.publishedAt, i18n.language);
  return (
    <article className="ss-video-card">
      <button className="ss-card-image" type="button" onClick={onSelect} aria-label={t('ssPlay', { title: video.title })}>
        <Thumbnail video={video} />
        <span className="ss-card-play"><Play size={17} fill="currentColor" aria-hidden="true" /></span>
        {duration && <span className="ss-duration">{duration}</span>}
      </button>
      <div className="ss-card-body">
        <div className="ss-card-overline"><span>{video.communityId ? t('sfCommunityBadge') : video.officialAgency ? t('ssVerified') : t('ssVideos')}</span><span><Film size={13} aria-hidden="true" /></span></div>
        {video.categories?.length ? <div className="ss-card-topics">{video.categories.map((category) => <span key={category}>{t(CATEGORIES.find((item) => item.id === category)?.key || 'ssAll')}</span>)}</div> : null}
        <h3><button type="button" onClick={onSelect}>{video.title}</button></h3>
        <p className="ss-card-description">{video.description}</p>
        <div className="ss-card-footer"><Channel video={video} />{date && <time dateTime={video.publishedAt}>{date}</time>}</div>
      </div>
    </article>
  );
}

export default function SpaceShortsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<FeedTab>(() => window.location.pathname === '/space-shorts' ? 'shorts' : 'all');
  const [category, setCategory] = useState<SpaceVideoCategory>('all');
  const [draft, setDraft] = useState(''); const [query, setQuery] = useState('');
  const [data, setData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true); const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(''); const [moreError, setMoreError] = useState('');
  const [retry, setRetry] = useState(0); const [index, setIndex] = useState(0);
  const [shortPlayerOpen, setShortPlayerOpen] = useState(false);
  const [selected, setSelected] = useState<SpaceVideo | null>(null);
  const [reportVideo, setReportVideo] = useState<SpaceVideo | null>(null);
  const request = useRef<AbortController | null>(null);
  const galleryPlayer = useRef<HTMLDivElement>(null);
  const shortPanel = useRef<HTMLDivElement>(null);
  const community = useCommunity();

  useEffect(() => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setLoadingMore(false); setError(''); setMoreError(''); setData(null);
    setIndex(0); setSelected(null); setShortPlayerOpen(false); setReportVideo(null);
    fetchPage(tab, category, query, '', controller.signal).then((result) => {
      if (!controller.signal.aborted) setData(result);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'upstream');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tab, category, query, retry]);

  const loadMore = async () => {
    if (!data?.nextPageToken || loadingMore) return;
    const controller = new AbortController(); request.current = controller;
    setLoadingMore(true); setMoreError('');
    try {
      const next = await fetchPage(tab, category, query, data.nextPageToken, controller.signal);
      if (controller.signal.aborted) return;
      if (next.source !== data.source) throw new Error('upstream');
      setData((current) => {
        if (!current) return current;
        const seen = new Set(current.items.map((item) => item.id));
        const unique = next.items.filter((item) => !seen.has(item.id) && !!seen.add(item.id));
        return { ...current, items: [...current.items, ...unique], nextPageToken: next.nextPageToken };
      });
    } catch (failure) {
      if (!controller.signal.aborted) setMoreError(failure instanceof Error ? failure.message : 'upstream');
    } finally { if (!controller.signal.aborted) setLoadingMore(false); }
  };
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!selected || !galleryPlayer.current) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    galleryPlayer.current.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  }, [selected]);

  const tabs: Array<{ id: FeedTab; key: string; Icon: typeof Film }> = [
    { id: 'all', key: 'sfAllVideos', Icon: Film }, { id: 'shorts', key: 'sfSpaceShorts', Icon: Clapperboard },
    { id: 'nasa', key: 'sfNasaVideos', Icon: Globe2 }, { id: 'community', key: 'sfCommunityVideos', Icon: Users }
  ];
  const chooseTab = (next: FeedTab) => { setSelected(null); setShortPlayerOpen(false); setTab(next); };
  const tabKeyDown = (event: React.KeyboardEvent, position: number) => {
    let next = position;
    if (event.key === 'ArrowRight') next = (position + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (position + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault(); chooseTab(tabs[next].id); document.getElementById(`ss-tab-${tabs[next].id}`)?.focus();
  };
  const submitSearch = (event: React.FormEvent) => { event.preventDefault(); setSelected(null); setQuery(draft.trim()); };
  const items = data?.items || [];
  const heading = tab === 'shorts' ? 'ssFeedCaption' : tab === 'nasa' ? 'sfNasaHeading' : tab === 'community' ? 'sfCommunityHeading' : 'ssBrowseCaption';
  const related = selected ? items.filter((item) => item.id !== selected.id).slice(0, 3) : [];
  const scrollToShort = () => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    shortPanel.current?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };
  return (
    <div className="space-shorts" data-no-swipe>
      <section className="ss-hero" aria-labelledby="ss-intro-heading">
        <div className="ss-hero-content">
          <p className="ss-hero-eyebrow"><span className="ss-status-dot" /> {t('ssIntroLabel')}</p>
          <h2 id="ss-intro-heading">{t('ssIntroTitle')}</h2>
          <p className="ss-hero-description">{t('ssIntroBody')}</p>
          <p className="ss-hero-foot"><span /> {t('ssIntroNote')}</p>
        </div>
        <span className="ss-image-credit">{t('ssArtCredit')}</span>
      </section>
      <CommunityActions community={community} reportVideo={reportVideo} clearReport={() => setReportVideo(null)} onUpdated={() => { if (tab === 'all' || tab === 'community') setRetry((value) => value + 1); }} />
      <div className="ss-discovery-controls">
        <div className="ss-toolbar">
          <div className="ss-mode-switch" role="tablist" aria-label={t('ssModeLabel')}>
            {tabs.map(({ id, key, Icon }, position) => <button key={id} id={`ss-tab-${id}`} type="button" role="tab" aria-controls="ss-results-panel" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} className={tab === id ? 'is-active' : ''} onClick={() => chooseTab(id)} onKeyDown={(event) => tabKeyDown(event, position)}><Icon size={17} aria-hidden="true" /><span>{t(key)}</span></button>)}
          </div>
          <form className="ss-search" role="search" onSubmit={submitSearch}>
            <Search size={17} aria-hidden="true" />
            <input aria-label={t('ssSearchLabel')} placeholder={t('ssSearchPlaceholder')} value={draft} maxLength={80} onChange={(event) => setDraft(event.target.value)} />
            {draft && <button className="ss-clear" type="button" aria-label={t('ssClear')} onClick={() => { setDraft(''); setQuery(''); }}><X size={15} aria-hidden="true" /></button>}
            <button className="ss-search-submit" type="submit">{t('ssSearch')}</button>
          </form>
        </div>
        <div className="ss-topics" role="group" aria-label={t('ssCategories')}>
          {CATEGORIES.map((item) => <button type="button" key={item.id} className={category === item.id ? 'is-active' : ''} aria-pressed={category === item.id} onClick={() => { setSelected(null); setCategory(item.id); }}>{t(item.key)}</button>)}
        </div>
      </div>
      <section id="ss-results-panel" role="tabpanel" className="ss-results" aria-labelledby={`ss-tab-${tab}`} aria-busy={loading || loadingMore}>
        <div className="ss-section-heading">
          <div><p className="ss-section-eyebrow">{tab === 'shorts' ? t('ssFeed') : t('ssBrowse')}</p><h2 id="ss-section-title">{t(heading)}</h2></div>
          {data && <div className="ss-source-badge"><span className="ss-status-dot" /> {t(data.source === 'curated' ? 'ssCuratedBadge' : data.source === 'community' ? 'sfCommunityBadge' : 'ssLiveBadge')}{data.cached && <span className="ss-cached">· {t('ssCached')}</span>}</div>}
        </div>
        {tab === 'nasa' && <p className="ss-section-note">{t('sfNasaHint')}</p>}
        {data?.source === 'curated' && <StarterNotice reason={data.reason} />}
        {data?.communityUnavailable && <div className="ss-notice" role="status"><Info size={16} aria-hidden="true" /> {community.configuration === 'disabled' ? t('sfCommunityUnavailable') : t('sfCommunityFeedUnavailable')}</div>}
        {loading && <div className="ss-skeleton-grid" role="status" aria-label={t('sfSkeleton')}><span className="sr-only">{t('ssLoading')}</span>{Array.from({ length: 6 }, (_, item) => <div className="ss-skeleton-card" key={item}><span /><i /><i /></div>)}</div>}
        {!loading && error && <div className="ss-empty" role="alert"><Info size={24} aria-hidden="true" /><p>{error === 'rate-limit' ? t('ssRateError') : tab === 'community' ? (community.configuration === 'disabled' ? t('sfCommunityUnavailable') : t('sfCommunityFeedUnavailable')) : t('ssError')}</p><button className="ss-secondary-action" type="button" onClick={() => setRetry((value) => value + 1)}>{t('ssRetry')}</button></div>}
        {!loading && !error && data && !items.length && <div className="ss-empty" role="status"><Search size={24} aria-hidden="true" /><h3>{t(tab === 'community' ? 'sfCommunityEmpty' : 'ssEmpty')}</h3><p>{t(tab === 'community' ? 'sfCommunityEmptyBody' : 'ssEmptyBody')}</p></div>}
        {!loading && !error && tab === 'shorts' && items.length > 0 && <div ref={shortPanel}><ShortsFeed items={items} index={index} setIndex={setIndex} playerOpen={shortPlayerOpen} setPlayerOpen={setShortPlayerOpen} /></div>}
        {!loading && !error && tab !== 'shorts' && selected && <div className="ss-gallery-player" ref={galleryPlayer}>
          <div className="ss-gallery-player-heading"><span><span className="ss-status-dot" /> {t('ssSelectedVideo')}</span><button type="button" onClick={() => setSelected(null)} aria-label={t('ssClosePlayer')}><X size={18} aria-hidden="true" /></button></div>
          <div className="ss-gallery-player-content">
            <div className={selected.portraitVerified ? 'ss-portrait-frame' : 'ss-landscape-frame'}><YouTubePlayer key={selected.id} video={selected} /></div>
            <div className="ss-gallery-player-copy"><h3>{selected.title}</h3><Channel video={selected} /><p>{selected.description}</p><div className="ss-story-links"><WatchLink video={selected} /><SourceLink video={selected} />{selected.communityId && <ReportButton onClick={() => setReportVideo(selected)} />}</div><p className="ss-player-instructions">{t(selected.communityId ? 'sfReviewNote' : 'ssPlayerHelp')}</p>
              {related.length > 0 && <div className="ss-related"><h4>{t('sfRelated')}</h4>{related.map((video) => <button key={video.id} type="button" onClick={() => setSelected(video)}><Thumbnail video={video} /><span>{video.title}<small>{video.channelTitle || t('ssPublisherUnknown')}</small></span><ChevronRight size={15} aria-hidden="true" /></button>)}</div>}
            </div>
          </div>
        </div>}
        {!loading && !error && items.length > 0 && <div className={`ss-video-grid ${tab === 'shorts' ? 'ss-shorts-grid' : ''}`}>{items.map((video, itemIndex) => <VideoCard key={video.id} video={video} onSelect={() => { if (tab === 'shorts') { setIndex(itemIndex); setShortPlayerOpen(true); scrollToShort(); } else setSelected(video); }} />)}</div>}
        {moreError && <p className="ss-more-error" role="alert">{moreError === 'rate-limit' ? t('ssRateError') : t('ssMoreError')}</p>}
        {!loading && !error && data && <div className="ss-results-footer"><span>{t('ssShowing', { count: items.length })}</span>{data.nextPageToken && <button type="button" className="ss-secondary-action" disabled={loadingMore} onClick={loadMore}>{loadingMore ? t('ssLoadingMore') : t('ssLoadMore')} <ChevronRight size={15} aria-hidden="true" /></button>}</div>}
        {data && <div className="ss-disclaimers">
          <p><Info size={14} aria-hidden="true" /> {tab === 'shorts' ? (data.source === 'youtube' ? t('ssShortsDisclaimer') : t('ssStarterShortsDisclaimer')) : t('ssMetadataOriginal')}</p>
          {tab === 'shorts' && <p>{t('ssMetadataOriginal')}</p>}{data.source === 'youtube' && <p>{t('ssRelevanceNote')}</p>}<p>{t('sfYouTubeOnly')}</p>
        </div>}
      </section>
    </div>
  );
}
