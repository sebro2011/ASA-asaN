'use client';

/**
 * ApodViewer — the NASA Astronomy Picture of the Day screen.
 *
 * Scientific-integrity rules implemented here:
 *  - A record is only shown as "today's APOD" when it actually came from the
 *    NASA endpoint. Offline/reference content is badged and explained.
 *  - Translation is requested from the server; when that fails the English
 *    original stays on screen and the failure is stated. No locally invented
 *    translation is substituted.
 *  - Image credit, capture date and the canonical apod.nasa.gov record are
 *    always reachable from the image itself.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Heart,
  Maximize2,
  RotateCw,
  Shuffle,
  X
} from 'lucide-react';
import { SupportedLanguage, translations } from '../i18n/translations';
import { useFavorites } from '../utils/favorites';
import { fetchApod, translateSpaceContent } from '@/lib/nasaApi';
import { CustomApodDatePicker } from './CustomApodDatePicker';
import APODStoryteller from './APODStoryteller.jsx';
import { Button, DataStateBadge, ErrorState, IconButton, LoadingState, Panel, SourceNote } from '../ui/primitives';

interface ApodData {
  date: string;
  title: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: string;
  copyright?: string;
  _isSample?: boolean;
  _fromCache?: boolean;
  _source?: string;
}

interface ApodViewerProps {
  lang: SupportedLanguage;
  onOpenExportModal: () => void;
  initialDate?: string;
}

const PRESET_DATES = [
  { key: 'presetWebbDeepField', date: '2022-07-13' },
  { key: 'presetPillars', date: '2022-10-21' },
  { key: 'presetArtemisOrion', date: '2022-12-08' },
  { key: 'presetMarsPanorama', date: '2023-03-15' }
] as const;

const isoDay = (date: Date) => date.toISOString().split('T')[0];

function offsetDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date);
}

export const ApodViewer: React.FC<ApodViewerProps> = React.memo(({ lang, onOpenExportModal, initialDate }) => {
  const { t } = useTranslation();
  const legacy = translations[lang];
  const { isApodSaved, toggleSaveApod } = useFavorites();

  const today = isoDay(new Date());
  const [selectedDate, setSelectedDate] = useState(initialDate || today);
  const [apod, setApod] = useState<ApodData | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [translation, setTranslation] = useState<{ title: string; explanation: string } | null>(null);
  const [translationPhase, setTranslationPhase] = useState<'idle' | 'pending' | 'ready' | 'failed'>('idle');
  const [copied, setCopied] = useState(false);
  const [hdOpen, setHdOpen] = useState(false);
  const [fullResolution, setFullResolution] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (initialDate) setSelectedDate(initialDate);
  }, [initialDate]);

  const load = useCallback(
    async (date: string) => {
      setPhase('loading');
      setTranslation(null);
      setTranslationPhase('idle');
      const record = (await fetchApod(date)) as ApodData;
      if (!record || !record.title) {
        setApod(null);
        setPhase('error');
        return;
      }
      setApod(record);
      setPhase('ready');
    },
    []
  );

  useEffect(() => {
    load(selectedDate);
  }, [selectedDate, load]);

  /* Dynamic translation is server-side; failures stay visible, never faked. */
  useEffect(() => {
    if (!apod || lang === 'en' || apod._isSample) return;
    let cancelled = false;
    setTranslationPhase('pending');
    translateSpaceContent(apod.title, apod.explanation, lang)
      .then((result) => {
        if (cancelled) return;
        if (result?.title && result?.explanation) {
          setTranslation(result as { title: string; explanation: string });
          setTranslationPhase('ready');
        } else {
          setTranslationPhase('failed');
        }
      })
      .catch(() => {
        if (!cancelled) setTranslationPhase('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [apod, lang]);

  /* Lightbox: Escape closes, focus moves to the close control. */
  useEffect(() => {
    if (!hdOpen) return undefined;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHdOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hdOpen]);

  const copyRecord = async () => {
    if (!apod) return;
    const text = `${translation?.title || apod.title}\n\n${translation?.explanation || apod.explanation}\n\nNASA APOD · ${apod.date}\nhttps://apod.nasa.gov/apod/ap${apod.date.replace(/-/g, '').slice(2)}.html`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const randomDay = () => {
    const start = new Date('1995-06-16T00:00:00Z').getTime();
    const end = new Date(`${today}T00:00:00Z`).getTime();
    const candidate = new Date(start + Math.random() * (end - start));
    setSelectedDate(isoDay(candidate));
  };

  const displayTitle = translation?.title || apod?.title || '';
  const displayExplanation = translation?.explanation || apod?.explanation || '';
  const saved = apod ? isApodSaved(apod.date) : false;
  const mediaSrc = fullResolution && apod?.hdurl ? apod.hdurl : apod?.url || '';
  const archiveUrl = apod
    ? `https://apod.nasa.gov/apod/ap${apod.date.replace(/-/g, '').slice(2)}.html`
    : 'https://apod.nasa.gov/apod/astropix.html';

  return (
    <div className="space-y-5">
      {/* Controls --------------------------------------------------------- */}
      <Panel className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <IconButton
              label={t('apodPrevious')}
              icon={ArrowLeft}
              onClick={() => setSelectedDate((current) => offsetDate(current, -1))}
            />
            <CustomApodDatePicker selectedDate={selectedDate} onSelectDate={setSelectedDate} lang={lang} />
            <IconButton
              label={t('apodNext')}
              icon={ArrowRight}
              onClick={() => setSelectedDate((current) => offsetDate(current, 1))}
            />
            <Button variant="ghost" size="sm" onClick={() => setSelectedDate(today)}>
              {legacy.today}
            </Button>
            <Button variant="ghost" size="sm" icon={Shuffle} onClick={randomDay}>
              {legacy.randomDate}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-[8px] border border-line bg-void/40 p-0.5" role="group" aria-label={t('apodResolution')}>
              {[
                { label: t('apodStandard'), value: false, disabled: false },
                { label: t('apodHigh'), value: true, disabled: !apod?.hdurl }
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  disabled={option.disabled}
                  aria-pressed={fullResolution === option.value}
                  onClick={() => setFullResolution(option.value)}
                  className={`rounded-[6px] px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    fullResolution === option.value
                      ? 'bg-surface-2 text-ink'
                      : 'text-ink-3 hover:text-ink'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <IconButton label={t('apodRetry')} icon={RotateCw} onClick={() => load(selectedDate)} />
            <Button variant="ghost" size="sm" icon={ExternalLink} onClick={onOpenExportModal}>
              {legacy.navExportHtml}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line/60 pt-3">
          <span className="eyebrow mr-1">{t('apodArchiveJumps')}</span>
          {PRESET_DATES.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => setSelectedDate(preset.date)}
              aria-pressed={selectedDate === preset.date}
              className={`rounded-full border px-3 py-1 text-[11.5px] transition-colors ${
                selectedDate === preset.date
                  ? 'border-atmo/50 bg-atmo/10 text-atmo'
                  : 'border-line text-ink-3 hover:border-line-strong hover:text-ink'
              }`}
            >
              {legacy[preset.key]}
            </button>
          ))}
        </div>
      </Panel>

      {/* Integrity notices ------------------------------------------------ */}
      {phase === 'ready' && apod?._isSample && (
        <div className="surface border-caution/30 bg-caution/[0.06] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <DataStateBadge state="static" label={t('apodSampleBadge')} />
            <span className="text-[12.5px] font-medium text-caution">{t('apodErrorTitle')}</span>
          </div>
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-ink-2">{t('apodSampleBody')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon={RotateCw} onClick={() => load(selectedDate)}>
              {t('apodRetry')}
            </Button>
            <a
              href={archiveUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[11.5px] text-ink-3 transition-colors hover:text-ink"
            >
              {t('apodOpenSource')} ↗
            </a>
          </div>
        </div>
      )}

      {phase === 'ready' && apod?._fromCache && !apod._isSample && (
        <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-line bg-surface/40 px-4 py-2.5 text-[11.5px] text-ink-3">
          <DataStateBadge state="cached" label={t('apodCachedBadge')} />
          {t('apodCachedBody')}
        </div>
      )}

      {phase === 'error' && (
        <ErrorState
          title={t('apodErrorTitle')}
          message={t('apodErrorBody')}
          onRetry={() => load(selectedDate)}
          retryLabel={t('apodRetry')}
        />
      )}

      {phase === 'loading' && (
        <Panel className="p-0">
          <LoadingState label={t('apodLoading')} />
        </Panel>
      )}

      {/* Record ----------------------------------------------------------- */}
      {phase === 'ready' && apod && (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Panel className="overflow-hidden p-0">
              <div className="relative flex min-h-[280px] items-center justify-center bg-void">
                {apod.media_type === 'video' ? (
                  <div className="aspect-video w-full">
                    <iframe
                      src={apod.url}
                      title={apod.title}
                      allowFullScreen
                      className="h-full w-full border-0"
                    />
                  </div>
                ) : (
                  <img
                    src={mediaSrc}
                    alt={apod.title}
                    loading="lazy"
                    className="max-h-[620px] w-full object-contain"
                  />
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-[linear-gradient(0deg,rgba(3,6,14,0.92),rgba(3,6,14,0))] p-4 pt-12">
                  <p className="max-w-[70%] text-[11px] leading-snug text-ink-2">
                    <span className="font-mono uppercase tracking-[0.12em] text-ink-4">{t('apodCreditLabel')} </span>
                    {apod.copyright || 'NASA'}
                  </p>
                  {apod.media_type !== 'video' && (
                    <button
                      type="button"
                      onClick={() => setHdOpen(true)}
                      className="pointer-events-auto inline-flex items-center gap-1.5 rounded-[8px] border border-line-strong/80 bg-void/70 px-2.5 py-1.5 text-[11px] text-ink transition-colors hover:border-atmo/50"
                    >
                      <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                      {legacy.viewOriginalHd}
                    </button>
                  )}
                </div>
              </div>
            </Panel>

            <div className="flex flex-col gap-4">
              <Panel className="flex-1 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-ink-3">{t('apodDateLabel')}</span>
                  <span className="font-mono text-[11px] text-ink">{apod.date}</span>
                  <span className="h-3 w-px bg-line-strong" aria-hidden="true" />
                  <DataStateBadge
                    state={apod._isSample ? 'static' : apod._fromCache ? 'cached' : 'live'}
                    label={apod._isSample ? t('apodSampleBadge') : apod._fromCache ? t('apodCachedBadge') : undefined}
                  />
                </div>

                <h2 className="mt-3 text-[24px] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[28px]">
                  {displayTitle}
                </h2>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {lang === 'en' && (
                    <span className="rounded-full border border-line px-2.5 py-1 text-[10.5px] text-ink-3">
                      {legacy.originalEnglish}
                    </span>
                  )}
                  {lang !== 'en' && translationPhase === 'pending' && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-caution/40 px-2.5 py-1 text-[10.5px] text-caution">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-caution" />
                      {legacy.translatingWithGemini}
                    </span>
                  )}
                  {lang !== 'en' && translationPhase === 'ready' && (
                    <span className="rounded-full border border-signal/40 px-2.5 py-1 text-[10.5px] text-signal">
                      {legacy.translatedByAi}
                    </span>
                  )}
                  {lang !== 'en' && translationPhase === 'failed' && (
                    <span className="rounded-full border border-caution/40 px-2.5 py-1 text-[10.5px] text-caution">
                      {lang === 'si'
                        ? 'පරිවර්තනය ලබා ගත නොහැක — ඉංග්‍රීසි මූලාශ්‍රය පෙන්වයි'
                        : 'மொழிபெயர்ப்பு கிடைக்கவில்லை — ஆங்கில மூலம் காட்டப்படுகிறது'}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/60 pt-4">
                  <Button
                    variant={saved ? 'primary' : 'secondary'}
                    size="sm"
                    icon={Heart}
                    onClick={() => toggleSaveApod(apod as never)}
                  >
                    {saved ? legacy.savedInFavorites : legacy.saveToFavorites}
                  </Button>
                  <Button variant="ghost" size="sm" icon={copied ? Check : Copy} onClick={copyRecord}>
                    {copied ? legacy.copiedText : legacy.copyText}
                  </Button>
                  <a
                    href={archiveUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-line px-2.5 text-[11.5px] text-ink-3 transition-colors hover:border-line-strong hover:text-ink"
                  >
                    {t('apodOpenSource')}
                    <ExternalLink className="h-3 w-3" strokeWidth={1.8} />
                  </a>
                </div>
              </Panel>

              {!apod._isSample && (
                <Panel className="p-5">
                  <p className="eyebrow">{t('apodReadNasa').split('.')[0]}</p>
                  <p className="mt-2 text-[12px] leading-relaxed text-ink-2">{t('apodReadNasa')}</p>
                  <SourceNote className="mt-3">
                    {apod._fromCache
                      ? 'Source: api.nasa.gov/planetary/apod (cached copy)'
                      : `Source: api.nasa.gov/planetary/apod · retrieved ${new Date().toLocaleTimeString()}`}
                  </SourceNote>
                </Panel>
              )}
            </div>
          </div>

          <Panel className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-[15px] font-semibold text-ink">
                {lang === 'si' ? 'විද්‍යාත්මක විස්තරය' : lang === 'ta' ? 'அறிவியல் விளக்கம்' : 'Scientific caption'}
              </h3>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
                NASA / APOD
              </span>
            </div>
            <div className="prose-measure mt-3 whitespace-pre-line text-[14px] leading-[1.75] text-ink-2">
              {displayExplanation}
            </div>
          </Panel>

          {!apod._isSample && (
            <APODStoryteller
              title={displayTitle}
              explanation={displayExplanation}
              lang={lang === 'si' ? 'si-LK' : lang === 'ta' ? 'ta-IN' : 'en-US'}
            />
          )}
        </>
      )}

      {/* Full-resolution lightbox ------------------------------------------- */}
      {hdOpen && apod && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={apod.title}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-void/95 p-4 backdrop-blur-sm"
          onClick={() => setHdOpen(false)}
        >
          <div className="relative max-h-[92vh] w-full max-w-[95vw]" onClick={(event) => event.stopPropagation()}>
            <img
              src={apod.hdurl || apod.url}
              alt={apod.title}
              className="mx-auto max-h-[88vh] max-w-full rounded-[10px] object-contain shadow-2xl"
            />
            <button
              ref={closeRef}
              type="button"
              onClick={() => setHdOpen(false)}
              className="absolute right-0 top-0 inline-flex items-center gap-1.5 rounded-[8px] border border-line-strong bg-void/85 px-3 py-1.5 text-[11.5px] text-ink transition-colors hover:border-atmo/50"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.8} />
              {legacy.close}
            </button>
            <p className="mt-2 text-center text-[11px] text-ink-3">
              {apod.copyright || 'NASA'} · {apod.date}
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

ApodViewer.displayName = 'ApodViewer';
