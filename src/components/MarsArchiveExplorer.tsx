import React, { useEffect, useState } from 'react';
import type { SupportedLanguage } from '../i18n/translations';

type Rover = 'curiosity' | 'perseverance' | 'opportunity' | 'spirit';
type Item = { nasaId: string; title: string; description: string; date: string; category: string; thumbnail: string; detailsUrl: string };
type Result = { articles: Item[]; hasMore: boolean; fetchedAt: string; cached: boolean; total: number };
const COPY = {
  en: { title: 'Explore Mars in NASA Images', intro: 'Search the NASA Image and Video Library by rover name. Results can include mission photos, artwork, models and Earth-based testing—not necessarily images taken on Mars. The record date may be a publication date, not the capture date. This is separate from the sol-based rover API above.', rover: 'Search by rover', search: 'Search NASA Images', loading: 'Searching NASA Images…', error: 'NASA Images is unavailable or returned an unexpected response.', retry: 'Retry', empty: 'No records found for this search.', date: 'NASA record date', dateMissing: 'Record date unavailable', center: 'NASA center', retrieved: 'Retrieved', cached: 'Cached', page: 'Page', previous: 'Previous', next: 'Next', open: 'Open NASA record', source: 'Source: NASA Image and Video Library', missingImage: 'Preview unavailable', total: 'NASA search results' },
  si: { title: 'NASA Images තුළ අඟහරු ගවේෂණය', intro: 'රෝවරයේ නමින් NASA Image and Video Library සොයන්න. ප්‍රතිඵලවල මෙහෙයුම් ඡායාරූප, චිත්‍ර, ආකෘති සහ පෘථිවියේ පරීක්ෂණ ඇතුළත් විය හැක; ඒ සියල්ල අඟහරු මත ගත් රූප නොවේ. වාර්තා දිනය රූපය ගත් දිනය වෙනුවට ප්‍රකාශිත දිනය විය හැක. මෙය ඉහත sol API එකෙන් වෙනස් සෙවුමකි.', rover: 'රෝවරය තෝරන්න', search: 'NASA Images සොයන්න', loading: 'NASA Images සොයමින්…', error: 'NASA Images ලබාගත නොහැක හෝ ප්‍රතිචාරය හඳුනාගත නොහැක.', retry: 'නැවත උත්සාහ කරන්න', empty: 'මෙම සෙවුමට වාර්තා හමු නොවීය.', date: 'NASA වාර්තා දිනය', dateMissing: 'වාර්තා දිනය නැත', center: 'NASA මධ්‍යස්ථානය', retrieved: 'ලබාගත් වේලාව', cached: 'කැෂේ ප්‍රතිඵලය', page: 'පිටුව', previous: 'පෙර', next: 'ඊළඟ', open: 'NASA වාර්තාව විවෘත කරන්න', source: 'මූලාශ්‍රය: NASA Image and Video Library', missingImage: 'පෙරදසුන නැත', total: 'NASA සෙවුම් ප්‍රතිඵල' },
  ta: { title: 'NASA Images இல் செவ்வாயை ஆராயுங்கள்', intro: 'ரோவர் பெயரால் NASA Image and Video Library இல் தேடுங்கள். முடிவுகளில் பணி படங்கள், ஓவியங்கள், மாதிரிகள் மற்றும் பூமியில் சோதனைப் படங்கள் இருக்கலாம்; அனைத்தும் செவ்வாயில் எடுக்கப்பட்டவை அல்ல. பதிவு தேதி படமெடுத்த தேதி அல்லாமல் வெளியீட்டுத் தேதியாக இருக்கலாம். இது மேலுள்ள sol API இலிருந்து தனியான தேடல்.', rover: 'ரோவரைத் தேர்ந்தெடுங்கள்', search: 'NASA Images தேடு', loading: 'NASA Images தேடப்படுகிறது…', error: 'NASA Images கிடைக்கவில்லை அல்லது பதில் எதிர்பார்த்த வடிவில் இல்லை.', retry: 'மீண்டும் முயற்சி', empty: 'இந்தத் தேடலுக்குப் பதிவுகள் இல்லை.', date: 'NASA பதிவு தேதி', dateMissing: 'பதிவு தேதி இல்லை', center: 'NASA மையம்', retrieved: 'பெற்ற நேரம்', cached: 'சேமித்த முடிவு', page: 'பக்கம்', previous: 'முந்தைய', next: 'அடுத்த', open: 'NASA பதிவைத் திற', source: 'மூலம்: NASA Image and Video Library', missingImage: 'முன்னோட்டம் இல்லை', total: 'NASA தேடல் முடிவுகள்' },
};

function safeNasaUrl(value: unknown, host: string): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host && !url.username && !url.password ? url.toString() : '';
  } catch { return ''; }
}

function Preview({ url, title, missing }: { url: string; title: string; missing: string }) {
  const [failed, setFailed] = useState(false);
  return url && !failed ? <img src={url} alt={title} loading="lazy" decoding="async" className="h-full w-full object-contain" onError={() => setFailed(true)} /> : <p className="p-4 text-sm text-ink-2">{missing}</p>;
}

export default function MarsArchiveExplorer({ lang = 'en' }: { lang?: SupportedLanguage }) {
  const t = COPY[lang] || COPY.en;
  const [selected, setSelected] = useState<Rover>('curiosity');
  const [query, setQuery] = useState<{ rover: Rover; page: number }>({ rover: 'curiosity', page: 1 });
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 10000);
    setState('loading'); setResult(null);
    const params = new URLSearchParams({ q: `Mars rover ${query.rover}`, page: String(query.page), limit: '9' });
    fetch(`/api/nasa-archive?${params}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(async response => {
        if (!response.ok) throw new Error('unavailable');
        const body = await response.json();
        if (body?.success !== true || !Array.isArray(body.articles) || typeof body.hasMore !== 'boolean' || typeof body.fetchedAt !== 'string' || !Number.isFinite(body.total)) throw new Error('shape');
        const articles = body.articles.filter((item: any) => item && typeof item.nasaId === 'string' && item.nasaId && typeof item.title === 'string')
          .map((item: any) => ({ nasaId: item.nasaId, title: item.title, description: typeof item.description === 'string' ? item.description : '', date: typeof item.date === 'string' ? item.date : '', category: typeof item.category === 'string' ? item.category : '', thumbnail: typeof item.thumbnail === 'string' ? item.thumbnail : '', detailsUrl: typeof item.detailsUrl === 'string' ? item.detailsUrl : '' }));
        return { ...body, articles } as Result;
      })
      .then(body => { if (active) { setResult(body); setState('ready'); } })
      .catch(() => { if (active) setState('error'); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query, retry]);

  return <section aria-labelledby="mars-archive-title" className="surface space-y-4 p-4 sm:p-6">
    <div><p className="eyebrow">NASA · IMAGE LIBRARY</p><h2 id="mars-archive-title" className="mt-1 text-xl font-semibold text-ink">{t.title}</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">{t.intro}</p></div>
    <form onSubmit={event => { event.preventDefault(); if (selected === query.rover && query.page === 1) setRetry(n => n + 1); else setQuery({ rover: selected, page: 1 }); }} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-ink-2">{t.rover}<select value={selected} onChange={e => setSelected(e.target.value as Rover)} className="rounded-lg border border-line bg-surface px-3 py-2 text-ink"><option value="curiosity">Curiosity</option><option value="perseverance">Perseverance</option><option value="opportunity">Opportunity</option><option value="spirit">Spirit</option></select></label>
      <button type="submit" className="rounded-lg border border-atmo/40 bg-atmo/10 px-4 py-2 text-sm font-medium text-ink hover:bg-atmo/20">{t.search}</button>
    </form>
    {state === 'loading' && <p role="status" className="text-sm text-ink-2">{t.loading}</p>}
    {state === 'error' && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-caution"><span>{t.error}</span><button type="button" onClick={() => setRetry(n => n + 1)} className="rounded-lg border border-line px-3 py-1 text-ink">{t.retry}</button></div>}
    {state === 'ready' && result && <>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3"><span>{t.source}</span><span>{t.retrieved}: {result.fetchedAt} (UTC){result.cached ? ` · ${t.cached}` : ''}</span><span>{t.total}: {result.total}</span><span>{query.rover} · {t.page} {query.page}</span></div>
      {!result.articles.length ? <p role="status" className="text-sm text-ink-2">{t.empty}</p> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{result.articles.map(item => {
        const image = safeNasaUrl(item.thumbnail, 'images-assets.nasa.gov');
        const detail = safeNasaUrl(item.detailsUrl, 'images.nasa.gov');
        return <article key={item.nasaId} className="overflow-hidden rounded-2xl border border-line bg-surface/60">
          <div className="flex aspect-[4/3] items-center justify-center bg-abyss/50"><Preview key={image} url={image} title={item.title} missing={t.missingImage} /></div>
          <div className="space-y-2 p-4 text-xs text-ink-2"><h3 className="font-semibold text-ink">{item.title}</h3><p className="line-clamp-4">{item.description}</p><p>{item.date ? `${t.date}: ${item.date}` : t.dateMissing}{item.category ? ` · ${t.center}: ${item.category}` : ''}</p><p>NASA ID: {item.nasaId}</p>{detail && <a href={detail} target="_blank" rel="noreferrer noopener" className="inline-block text-atmo underline underline-offset-4">{t.open} ↗</a>}</div>
        </article>;
      })}</div>}
      <div className="flex flex-wrap gap-2"><button type="button" disabled={query.page <= 1} onClick={() => setQuery(q => ({ ...q, page: q.page - 1 }))} className="rounded-lg border border-line px-3 py-2 text-sm text-ink disabled:opacity-40">{t.previous}</button><button type="button" disabled={!result.hasMore || query.page >= 100} onClick={() => setQuery(q => ({ ...q, page: q.page + 1 }))} className="rounded-lg border border-line px-3 py-2 text-sm text-ink disabled:opacity-40">{t.next}</button></div>
    </>}
  </section>;
}
