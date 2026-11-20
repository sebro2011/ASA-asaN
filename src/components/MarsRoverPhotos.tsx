import React, { useEffect, useState } from 'react';
import type { SupportedLanguage } from '../i18n/translations';

interface Photo { id: number; sol: number; earthDate: string; rover: string; camera: string; imageUrl: string }
interface PhotoResponse { ok: boolean; photos: Photo[]; retrievedAt: string; cached: boolean; hasMore: boolean; omitted: number }
interface FeedImage { id: string; sol: number; rover: string; camera: string; takenUtc: string; receivedUtc: string; caption: string; credit: string; title: string; imageUrl: string; pageUrl: string }
interface FeedResponse { ok: boolean; images: FeedImage[]; latestSol: number | null; retrievedAt: string; cached: boolean; hasMore: boolean; omitted: number }
type Rover = 'curiosity' | 'opportunity' | 'spirit';
type FeedRover = 'perseverance' | 'curiosity';
type Query = { rover: Rover; sol: number; page: number };
type Mode = 'latest' | 'sol';

const COPY = {
  en: { title: 'Mars Rover Photos', intro: 'Explore actual images returned by NASA’s Mars Rover Photos API. Sol is a Martian day since the rover landed; Earth date is the image date reported by NASA.', rover: 'Rover', sol: 'Martian sol', search: 'Load photos', retry: 'Retry', loading: 'Loading NASA photos…', unavailable: 'NASA photos are unavailable. Check your connection or try again later.', rate: 'NASA is rate limiting requests. Please wait and try again.', empty: 'No usable photos were returned for this rover, sol and page.', invalid: 'Enter a whole sol between 0 and 10000.', omitted: 'Some records were omitted because their metadata or image URL was invalid:', fetched: 'Retrieved', cached: 'Cached result', fresh: 'Retrieved from NASA', prev: 'Previous page', next: 'Next page', page: 'Page', imageError: 'Image could not be loaded.', open: 'Open NASA image', source: 'Source: NASA Mars Rover Photos API', note: 'Perseverance is not offered by this API selector. Opportunity and Spirit are historical missions; not every sol has images.',
    modeLatest: 'Latest images', modeSol: 'Browse by sol', refresh: 'Refresh', feedIntro: 'The newest images NASA has published, freshest first. NASA downlinks in batches, so an image can reach Earth hours or days after it was taken — both dates are shown below.', feedLoading: 'Loading the newest NASA images…', feedEmpty: 'NASA has not published images for this rover yet.', latestSol: 'Latest sol', taken: 'Taken', received: 'Received', viewOnNasa: 'View on NASA', feedSource: 'Source: NASA Mars raw images feed' },
  si: { title: 'අඟහරු රෝවර් ඡායාරූප', intro: 'NASA Mars Rover Photos API මඟින් ලබා දෙන සැබෑ ඡායාරූප බලන්න. Sol යනු රෝවරය ගොඩබැසීමෙන් පසු අඟහරු දිනයයි; පෘථිවි දිනය NASA වාර්තා කළ දිනයයි.', rover: 'රෝවරය', sol: 'අඟහරු sol දිනය', search: 'ඡායාරූප ලබාගන්න', retry: 'නැවත උත්සාහ කරන්න', loading: 'NASA ඡායාරූප ලබාගනිමින්…', unavailable: 'NASA ඡායාරූප ලබාගත නොහැක. සම්බන්ධතාව පරීක්ෂා කර පසුව නැවත උත්සාහ කරන්න.', rate: 'NASA ඉල්ලීම් සීමා කර ඇත. මඳ වේලාවකින් නැවත උත්සාහ කරන්න.', empty: 'මෙම රෝවරය, sol දිනය සහ පිටුව සඳහා භාවිත කළ හැකි ඡායාරූප හමු නොවීය.', invalid: '0 සිට 10000 දක්වා පූර්ණ sol අංකයක් ඇතුළත් කරන්න.', omitted: 'වලංගු නොවන විස්තර හෝ රූප ලිපින නිසා මඟහැරුණු වාර්තා:', fetched: 'ලබාගත් වේලාව', cached: 'කැෂේ ප්‍රතිඵලය', fresh: 'NASA වෙතින් ලබාගත් දත්ත', prev: 'පෙර පිටුව', next: 'ඊළඟ පිටුව', page: 'පිටුව', imageError: 'ඡායාරූපය පූරණය කළ නොහැක.', open: 'NASA රූපය විවෘත කරන්න', source: 'මූලාශ්‍රය: NASA Mars Rover Photos API', note: 'මෙම API තේරීමේ Perseverance නැත. Opportunity සහ Spirit ඓතිහාසික මෙහෙයුම්ය; සෑම sol දිනයකම ඡායාරූප නොතිබිය හැක.',
    modeLatest: 'නවතම ඡායාරූප', modeSol: 'Sol අනුව බලන්න', refresh: 'නැවුම් කරන්න', feedIntro: 'NASA ප්‍රකාශයට පත් කළ නවතම ඡායාරූප, අලුත්ම මුලින්. NASA කණ්ඩායම් වශයෙන් දත්ත එවන නිසා ඡායාරූපයක් ගත් පැය හෝ දින කිහිපයකින් එය පෘථිවියට ලැබිය හැක — දින දෙකම පහත දැක්වේ.', feedLoading: 'නවතම NASA ඡායාරූප ලබාගනිමින්…', feedEmpty: 'මෙම රෝවරය සඳහා NASA තවම ඡායාරූප ප්‍රකාශ කර නැත.', latestSol: 'නවතම sol', taken: 'ගත් දිනය', received: 'ලැබුණු දිනය', viewOnNasa: 'NASA හි බලන්න', feedSource: 'මූලාශ්‍රය: NASA Mars raw images feed' },
  ta: { title: 'செவ்வாய் ரோவர் படங்கள்', intro: 'NASA Mars Rover Photos API வழங்கும் உண்மையான படங்களைப் பார்க்கவும். Sol என்பது ரோவர் தரையிறங்கிய பின் செவ்வாய் நாள்; பூமித் தேதி NASA வழங்கிய படத் தேதியாகும்.', rover: 'ரோவர்', sol: 'செவ்வாய் sol நாள்', search: 'படங்களைப் பெறுக', retry: 'மீண்டும் முயலுங்கள்', loading: 'NASA படங்கள் ஏற்றப்படுகின்றன…', unavailable: 'NASA படங்கள் கிடைக்கவில்லை. இணைப்பைச் சரிபார்த்து பின்னர் மீண்டும் முயலுங்கள்.', rate: 'NASA கோரிக்கைகளைக் கட்டுப்படுத்துகிறது. காத்திருந்து மீண்டும் முயலுங்கள்.', empty: 'இந்த ரோவர், sol மற்றும் பக்கத்திற்கு பயன்படுத்தக்கூடிய படங்கள் கிடைக்கவில்லை.', invalid: '0 முதல் 10000 வரையிலான முழு sol எண்ணை உள்ளிடவும்.', omitted: 'தவறான விவரங்கள் அல்லது பட முகவரியால் நீக்கப்பட்ட பதிவுகள்:', fetched: 'பெறப்பட்ட நேரம்', cached: 'தற்காலிக சேமிப்பு', fresh: 'NASA விலிருந்து பெறப்பட்டது', prev: 'முந்தைய பக்கம்', next: 'அடுத்த பக்கம்', page: 'பக்கம்', imageError: 'படத்தை ஏற்ற முடியவில்லை.', open: 'NASA படத்தைத் திறக்கவும்', source: 'மூலம்: NASA Mars Rover Photos API', note: 'இந்த API தேர்வில் Perseverance இல்லை. Opportunity மற்றும் Spirit வரலாற்றுப் பணிகள்; ஒவ்வொரு sol நாளிலும் படங்கள் இருக்காது.',
    modeLatest: 'சமீபத்திய படங்கள்', modeSol: 'Sol வாரியாகப் பார்க்க', refresh: 'புதுப்பி', feedIntro: 'NASA வெளியிட்ட சமீபத்திய படங்கள், புதியது முதலில். NASA தொகுதிகளாக அனுப்புவதால், படம் எடுக்கப்பட்ட சில மணி அல்லது நாட்களுக்குப் பிறகு பூமிக்கு வரலாம் — இரண்டு தேதிகளும் கீழே உள்ளன.', feedLoading: 'சமீபத்திய NASA படங்கள் ஏற்றப்படுகின்றன…', feedEmpty: 'இந்த ரோவருக்கு NASA இன்னும் படங்களை வெளியிடவில்லை.', latestSol: 'சமீபத்திய sol', taken: 'எடுக்கப்பட்டது', received: 'பெறப்பட்டது', viewOnNasa: 'NASA இல் பார்க்க', feedSource: 'மூலம்: NASA Mars raw images feed' }
};

function PhotoCard({ photo, copy }: { photo: Photo; copy: typeof COPY.en }) {
  const [failed, setFailed] = useState(false);
  return <article className="overflow-hidden rounded-2xl border border-line bg-surface/60">
    <div className="aspect-[4/3] bg-abyss/50 flex items-center justify-center">
      {failed ? <p className="p-4 text-sm text-ink-2">{copy.imageError}</p> : <img src={photo.imageUrl} alt={`${photo.rover} · ${photo.camera} · sol ${photo.sol}`} loading="lazy" decoding="async" className="h-full w-full object-contain" onError={() => setFailed(true)} />}
    </div>
    <div className="space-y-1 p-4 text-xs text-ink-2">
      <p className="font-semibold text-ink">{photo.rover} · {photo.camera}</p>
      <p>Sol {photo.sol} · {photo.earthDate} · ID {photo.id}</p>
      <a href={photo.imageUrl} target="_blank" rel="noreferrer noopener" className="inline-block text-atmo underline underline-offset-4">{copy.open} ↗</a>
    </div>
  </article>;
}

const shortDate = (iso: string): string => (iso.length >= 16 ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}Z` : iso);

function FeedCard({ image, copy }: { image: FeedImage; copy: typeof COPY.en }) {
  const [failed, setFailed] = useState(false);
  return <article className="overflow-hidden rounded-2xl border border-line bg-surface/60">
    <div className="aspect-[4/3] bg-abyss/50 flex items-center justify-center">
      {failed
        ? <p className="p-4 text-sm text-ink-2">{copy.imageError}</p>
        : <img src={image.imageUrl} alt={image.title || `${image.rover} · ${image.camera} · sol ${image.sol}`} loading="lazy" decoding="async" className="h-full w-full object-contain" onError={() => setFailed(true)} />}
    </div>
    <div className="space-y-1 p-4 text-xs text-ink-2">
      <p className="font-semibold text-ink">{image.rover} · {image.camera}</p>
      <p>Sol {image.sol}</p>
      <p>{copy.taken}: {shortDate(image.takenUtc)}</p>
      <p>{copy.received}: {shortDate(image.receivedUtc)}</p>
      {image.credit && <p className="text-ink-3">{image.credit}</p>}
      <a href={image.pageUrl} target="_blank" rel="noreferrer noopener" className="inline-block text-atmo underline underline-offset-4">{copy.viewOnNasa} ↗</a>
    </div>
  </article>;
}

export default function MarsRoverPhotos({ lang = 'en' }: { lang?: SupportedLanguage }) {
  const t = COPY[lang] || COPY.en;
  const [mode, setMode] = useState<Mode>('latest');

  // Live mode: the newest images NASA has published for a rover still operating.
  const [feedRover, setFeedRover] = useState<FeedRover>('perseverance');
  const [feedPage, setFeedPage] = useState(0);
  const [feedNonce, setFeedNonce] = useState(0);
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [feedStatus, setFeedStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [feedError, setFeedError] = useState<'rate' | 'unavailable' | null>(null);

  // Sol mode: NASA's sol-indexed photo API, unchanged.
  const [rover, setRover] = useState<Rover>('curiosity');
  const [sol, setSol] = useState('1000');
  const [query, setQuery] = useState<Query>({ rover: 'curiosity', sol: 1000, page: 1 });
  const [nonce, setNonce] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<'invalid' | 'rate' | 'unavailable' | null>(null);
  const [data, setData] = useState<PhotoResponse | null>(null);

  useEffect(() => {
    if (mode !== 'latest') return;
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 10000);
    setFeedStatus('loading'); setFeed(null); setFeedError(null);
    const params = new URLSearchParams({ rover: feedRover, num: '12', page: String(feedPage) });
    fetch(`/api/mars/latest?${params}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 429 ? 'rate' : 'unavailable');
        const payload = await response.json();
        if (!payload?.ok || !Array.isArray(payload.images) || typeof payload.retrievedAt !== 'string') throw new Error('unavailable');
        return payload as FeedResponse;
      })
      .then(payload => { if (active) { setFeed(payload); setFeedStatus('ready'); } })
      .catch(err => { if (active) { setFeedError(err?.message === 'rate' ? 'rate' : 'unavailable'); setFeedStatus('error'); } })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [mode, feedRover, feedPage, feedNonce]);

  useEffect(() => {
    if (mode !== 'sol') return;
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 10000);
    setStatus('loading'); setData(null); setError(null);
    const params = new URLSearchParams({ rover: query.rover, sol: String(query.sol), page: String(query.page) });
    fetch(`/api/mars/photos?${params}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 429 ? 'rate' : 'unavailable');
        const payload = await response.json();
        if (!payload?.ok || !Array.isArray(payload.photos) || typeof payload.retrievedAt !== 'string') throw new Error('unavailable');
        return payload as PhotoResponse;
      })
      .then(payload => { if (active) { setData(payload); setStatus('ready'); } })
      .catch(err => { if (active) { setError(err?.message === 'rate' ? 'rate' : 'unavailable'); setStatus('error'); } })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [mode, query, nonce]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(sol);
    if (!/^\d+$/.test(sol) || !Number.isSafeInteger(value) || value < 0 || value > 10000) { setError('invalid'); return; }
    setError(null);
    if (query.rover === rover && query.sol === value && query.page === 1) setNonce(n => n + 1);
    else setQuery({ rover, sol: value, page: 1 });
  };

  return <section aria-labelledby="mars-photos-title" className="surface space-y-4 p-4 sm:p-6">
    <div><p className="eyebrow">NASA · MARS</p><h2 id="mars-photos-title" className="mt-1 text-xl font-semibold text-ink">{t.title}</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">{t.intro}</p></div>

    <div role="group" aria-label="Photo source" className="flex flex-wrap gap-2">
      <button type="button" aria-pressed={mode === 'latest'} onClick={() => setMode('latest')} className={`rounded-lg border px-3 py-2 text-sm ${mode === 'latest' ? 'border-atmo/60 bg-atmo/15 text-ink' : 'border-line text-ink-2 hover:text-ink'}`}>{t.modeLatest}</button>
      <button type="button" aria-pressed={mode === 'sol'} onClick={() => setMode('sol')} className={`rounded-lg border px-3 py-2 text-sm ${mode === 'sol' ? 'border-atmo/60 bg-atmo/15 text-ink' : 'border-line text-ink-2 hover:text-ink'}`}>{t.modeSol}</button>
    </div>

    {mode === 'latest' ? <>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex max-w-xs flex-col gap-1 text-xs text-ink-2">{t.rover}
          <select value={feedRover} onChange={e => { setFeedRover(e.target.value as FeedRover); setFeedPage(0); }} className="rounded-lg border border-line bg-surface px-3 py-2 text-ink">
            <option value="perseverance">Perseverance</option>
            <option value="curiosity">Curiosity</option>
          </select>
        </label>
        <button type="button" onClick={() => setFeedNonce(n => n + 1)} className="rounded-lg border border-atmo/40 bg-atmo/10 px-4 py-2 text-sm font-medium text-ink hover:bg-atmo/20">{t.refresh}</button>
      </div>
      <p className="max-w-3xl text-xs leading-relaxed text-ink-2">{t.feedIntro}</p>
      {feedError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-caution"><span>{t[feedError]}</span><button type="button" onClick={() => setFeedNonce(n => n + 1)} className="rounded-lg border border-line px-3 py-1 text-ink">{t.retry}</button></div>}
      {feedStatus === 'loading' && <p role="status" className="text-sm text-ink-2">{t.feedLoading}</p>}
      {feedStatus === 'ready' && feed && <>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
          <span>{feed.cached ? t.cached : t.fresh}</span>
          <span>{t.fetched}: {feed.retrievedAt} (UTC)</span>
          {feed.latestSol !== null && <span>{t.latestSol}: {feed.latestSol}</span>}
          <span>{t.page} {feedPage + 1}</span>
        </div>
        {feed.omitted > 0 && <p role="status" className="text-xs text-caution">{t.omitted} {feed.omitted}</p>}
        {feed.images.length === 0
          ? <p role="status" className="text-sm text-ink-2">{t.feedEmpty}</p>
          : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{feed.images.map(image => <FeedCard key={`${feedRover}:${image.id}`} image={image} copy={t} />)}</div>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={feedPage <= 0} onClick={() => setFeedPage(p => Math.max(0, p - 1))} className="rounded-lg border border-line px-3 py-2 text-sm text-ink disabled:opacity-40">{t.prev}</button>
          <button type="button" disabled={!feed.hasMore} onClick={() => setFeedPage(p => p + 1)} className="rounded-lg border border-line px-3 py-2 text-sm text-ink disabled:opacity-40">{t.next}</button>
        </div>
      </>}
      <a href="https://mars.nasa.gov/multimedia/images/" target="_blank" rel="noreferrer noopener" className="inline-block text-xs text-atmo underline underline-offset-4">{t.feedSource} ↗</a>
    </> : <>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-2">{t.rover}<select value={rover} onChange={e => setRover(e.target.value as Rover)} className="rounded-lg border border-line bg-surface px-3 py-2 text-ink"><option value="curiosity">Curiosity</option><option value="opportunity">Opportunity</option><option value="spirit">Spirit</option></select></label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">{t.sol}<input type="number" min="0" max="10000" step="1" required value={sol} onChange={e => setSol(e.target.value)} className="w-32 rounded-lg border border-line bg-surface px-3 py-2 text-ink" /></label>
        <button type="submit" className="rounded-lg border border-atmo/40 bg-atmo/10 px-4 py-2 text-sm font-medium text-ink hover:bg-atmo/20">{t.search}</button>
      </form>
      <p className="text-xs leading-relaxed text-ink-3">{t.note}</p>
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-caution"><span>{t[error]}</span>{status === 'error' && <button type="button" onClick={() => setNonce(n => n + 1)} className="rounded-lg border border-line px-3 py-1 text-ink">{t.retry}</button>}</div>}
      {status === 'loading' && <p role="status" className="text-sm text-ink-2">{t.loading}</p>}
      {status === 'ready' && data && <>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3"><span>{data.cached ? t.cached : t.fresh}</span><span>{t.fetched}: {data.retrievedAt} (UTC)</span><span>{query.rover} · Sol {query.sol} · {t.page} {query.page}</span></div>
        {data.omitted > 0 && <p role="status" className="text-xs text-caution">{t.omitted} {data.omitted}</p>}
        {data.photos.length === 0 ? <p role="status" className="text-sm text-ink-2">{t.empty}</p> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.photos.map(photo => <PhotoCard key={`${query.rover}:${photo.id}`} photo={photo} copy={t} />)}</div>}
        <div className="flex flex-wrap gap-2"><button type="button" disabled={query.page <= 1} onClick={() => setQuery(q => ({ ...q, page: q.page - 1 }))} className="rounded-lg border border-line px-3 py-2 text-sm text-ink disabled:opacity-40">{t.prev}</button><button type="button" disabled={!data.hasMore} onClick={() => setQuery(q => ({ ...q, page: q.page + 1 }))} className="rounded-lg border border-line px-3 py-2 text-sm text-ink disabled:opacity-40">{t.next}</button></div>
      </>}
      <a href="https://api.nasa.gov/" target="_blank" rel="noreferrer noopener" className="inline-block text-xs text-atmo underline underline-offset-4">{t.source} ↗</a>
    </>}
  </section>;
}
