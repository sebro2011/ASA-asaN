/**
 * "Sky now" — three live astronomy feeds on the home dashboard.
 *
 * APOD, the next close approach from NASA NeoWs and the ISS ground track already
 * ship as server routes used elsewhere in NOVA; this card reads the same routes
 * instead of inventing a fourth data path. Every state is labelled: loading,
 * ready, "cached reference" when the server served its fallback, or a plain
 * unavailable message. No number is drawn that the server did not return.
 *
 * Each card hands a grounded prompt to `/chat`, so the AI explains real values.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, Orbit, RefreshCw, Satellite, Telescope } from 'lucide-react';

interface ApodFeed {
  title: string;
  date: string;
  kind: string;
  url: string;
}

interface NeoFeed {
  name: string;
  date: string;
  lunar: string;
  km: string;
  velocity: string;
}

interface IssFeed {
  lat: string;
  lon: string;
  alt: string;
}

type Parsed<T> = { data: T; fallback: boolean };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export function parseApod(payload: unknown): Parsed<ApodFeed> | null {
  const body = asRecord(payload);
  const data = asRecord(body?.data);
  if (!body || body.success !== true || !data) return null;
  const title = asString(data.title);
  if (!title) return null;
  return {
    data: {
      title,
      date: asString(data.date),
      kind: asString(data.media_type) || 'image',
      url: asString(data.url) || asString(data.hdurl),
    },
    fallback: body.isFallback === true,
  };
}

export function parseNeo(payload: unknown): Parsed<NeoFeed> | null {
  const body = asRecord(payload);
  const data = asRecord(body?.data);
  if (!body || body.success !== true || !data) return null;
  const groups = asRecord(data.near_earth_objects);
  if (!groups) return null;
  const rows: NeoFeed[] = [];
  for (const group of Object.values(groups)) {
    if (!Array.isArray(group)) continue;
    for (const entry of group) {
      const object = asRecord(entry);
      const approaches = object?.close_approach_data;
      const approach = asRecord(Array.isArray(approaches) ? approaches[0] : null);
      if (!object || !approach) continue;
      const miss = asRecord(approach.miss_distance);
      const velocity = asRecord(approach.relative_velocity);
      const name = asString(object.name);
      const lunar = asString(miss?.lunar);
      if (!name || !lunar) continue;
      rows.push({
        name,
        date: asString(approach.close_approach_date),
        lunar,
        km: asString(miss?.kilometers),
        velocity: asString(velocity?.kilometers_per_second),
      });
    }
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => Number(a.lunar) - Number(b.lunar));
  return { data: rows[0], fallback: body.isFallback === true };
}

export function parseIss(payload: unknown): Parsed<IssFeed> | null {
  const body = asRecord(payload);
  const data = asRecord(body?.data);
  if (!body || body.success !== true || !data) return null;
  const lat = asString(data.latitude ?? undefined);
  const lon = asString(data.longitude ?? undefined);
  if (!lat || !lon) return null;
  return {
    data: { lat, lon, alt: asString(data.altitude ?? undefined) },
    fallback: body.isFallback === true,
  };
}

type FeedState<T> =
  | { status: 'loading'; data: null; fallback: false }
  | { status: 'ready'; data: T; fallback: boolean }
  | { status: 'error'; data: null; fallback: false };

function useFeed<T>(url: string, parse: (payload: unknown) => Parsed<T> | null) {
  const [state, setState] = useState<FeedState<T>>({ status: 'loading', data: null, fallback: false });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading', data: null, fallback: false });
    void (async () => {
      try {
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed = parse(await response.json());
        if (!alive) return;
        setState(parsed ? { status: 'ready', data: parsed.data, fallback: parsed.fallback } : { status: 'error', data: null, fallback: false });
      } catch {
        if (alive) setState({ status: 'error', data: null, fallback: false });
      }
    })();
    return () => {
      alive = false;
    };
  }, [url, parse, attempt]);

  return { ...state, retry };
}

/** Fill `{{name}}` placeholders from a finished feed; unknown names stay as-is. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}

interface SkyCardProps {
  id: string;
  titleKey: string;
  icon: typeof Telescope;
  state: { status: 'loading' | 'ready' | 'error'; fallback: boolean };
  children: ReactNode;
  prompt: string | null;
  onAsk: (prompt: string) => void;
  onRetry: () => void;
}

function SkyCard({ id, titleKey, icon: Icon, state, children, prompt, onAsk, onRetry }: SkyCardProps) {
  const { t } = useTranslation();
  return (
    <article className="nova-sky-card" aria-labelledby={`nova-sky-${id}`}>
      <header className="nova-sky-card__head">
        <span className="nova-sky-card__icon" aria-hidden="true">
          <Icon size={14} strokeWidth={1.9} />
        </span>
        <h3 id={`nova-sky-${id}`} className="nova-sky-card__title">
          {t(titleKey)}
        </h3>
        {state.fallback && state.status === 'ready' ? (
          <span className="nova-sky-card__flag" title={t('wsSkyFallback')}>
            {t('wsSkyFallback')}
          </span>
        ) : null}
      </header>

      <div className="nova-sky-card__body" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' ? (
          <p className="nova-sky-card__status">
            <Loader2 size={12} strokeWidth={2} className="nova-spin" aria-hidden="true" />
            {t('wsChecking')}
          </p>
        ) : null}
        {state.status === 'error' ? (
          <p className="nova-sky-card__status nova-sky-card__status--error">
            <AlertTriangle size={12} strokeWidth={2} aria-hidden="true" />
            {t('wsSkyUnavailable')}
          </p>
        ) : null}
        {state.status === 'ready' ? children : null}
      </div>

      {state.status === 'error' ? (
        <button type="button" className="nova-btn nova-btn--secondary nova-sky-card__action" onClick={onRetry}>
          <RefreshCw size={12} strokeWidth={2} aria-hidden="true" />
          {t('wsSkyRetry')}
        </button>
      ) : (
        <button
          type="button"
          className="nova-btn nova-btn--secondary nova-sky-card__action"
          disabled={!prompt}
          onClick={() => (prompt ? onAsk(prompt) : undefined)}
        >
          {t('wsSkyAsk')}
        </button>
      )}
    </article>
  );
}

export default function SkyNow({ onAsk }: { onAsk: (prompt: string) => void }) {
  const { t } = useTranslation();
  const apod = useFeed('/api/apod', parseApod);
  const neo = useFeed('/api/asteroids/neows', parseNeo);
  const iss = useFeed('/api/iss', parseIss);

  const apodPrompt =
    apod.status === 'ready'
      ? fill(t('wsSkyApodPrompt'), { title: apod.data.title, date: apod.data.date })
      : null;
  const neoPrompt =
    neo.status === 'ready'
      ? fill(t('wsSkyNeoPrompt'), {
          name: neo.data.name,
          date: neo.data.date,
          lunar: neo.data.lunar,
          km: neo.data.km,
          velocity: neo.data.velocity,
        })
      : null;
  const issPrompt =
    iss.status === 'ready'
      ? fill(t('wsSkyIssPrompt'), { lat: iss.data.lat, lon: iss.data.lon, alt: iss.data.alt })
      : null;

  return (
    <section aria-labelledby="nova-sky-heading" className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 id="nova-sky-heading" className="nova-section-title">
            {t('wsSkyTitle')}
          </h2>
          <p className="mt-1 max-w-[42rem] text-[12px] leading-relaxed text-ws-text-3">{t('wsSkyBody')}</p>
        </div>
      </div>

      <div className="nova-sky-grid mt-3">
        <SkyCard
          id="apod"
          titleKey="wsSkyApod"
          icon={Telescope}
          state={apod}
          prompt={apodPrompt}
          onAsk={onAsk}
          onRetry={apod.retry}
        >
          {apod.status === 'ready' ? (
            <>
              {apod.data.kind === 'image' && apod.data.url ? (
                <img className="nova-sky-card__image" src={apod.data.url} alt={apod.data.title} loading="lazy" />
              ) : null}
              <p className="nova-sky-card__value">{apod.data.title}</p>
              <p className="nova-sky-card__meta">{fill(t('wsSkyApodMeta'), { date: apod.data.date })}</p>
            </>
          ) : null}
        </SkyCard>

        <SkyCard id="neo" titleKey="wsSkyNeo" icon={Orbit} state={neo} prompt={neoPrompt} onAsk={onAsk} onRetry={neo.retry}>
          {neo.status === 'ready' ? (
            <>
              <p className="nova-sky-card__value">{neo.data.name}</p>
              <p className="nova-sky-card__meta">
                {fill(t('wsSkyNeoMeta'), { lunar: neo.data.lunar, velocity: neo.data.velocity })}
              </p>
              <p className="nova-sky-card__meta">{neo.data.date}</p>
            </>
          ) : null}
        </SkyCard>

        <SkyCard id="iss" titleKey="wsSkyIss" icon={Satellite} state={iss} prompt={issPrompt} onAsk={onAsk} onRetry={iss.retry}>
          {iss.status === 'ready' ? (
            <>
              <p className="nova-sky-card__value">
                {fill(t('wsSkyIssMeta'), { lat: iss.data.lat, lon: iss.data.lon, alt: iss.data.alt })}
              </p>
              <p className="nova-sky-card__meta">{t('wsSkyIss')}</p>
            </>
          ) : null}
        </SkyCard>
      </div>
    </section>
  );
}
