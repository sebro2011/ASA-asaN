/**
 * The entry screen.
 *
 * Two jobs: get the player in with one click, and be honest about what they are
 * about to play. The honesty block is deliberately part of the first screen, not
 * buried in settings — a simulation that presents its numbers as telemetry is a
 * different, worse product.
 *
 * A live NASA image sits behind the title, served through `/api/mars/latest` (the
 * endpoint shipped in PR #75). It is the one thing on this page that is not
 * simulated, so it is labelled as such. If the feed fails, the panel says so and the
 * screen still works — no placeholder photograph pretending to be Mars.
 */
import { useEffect, useState } from 'react';
import { GAME_COPY } from './copy';
import type { SupportedLanguage } from '../../i18n/translations';
import { Button } from '../../ui/primitives';
import { Glass } from '../../ui/Glass';
import { ArrowLeft, Maximize2 } from 'lucide-react';

interface FeedImage {
  id: string;
  imageUrl: string;
  camera: string;
  sol: number;
  takenUtc: string;
  rover: string;
}

export interface MainMenuProps {
  lang: SupportedLanguage;
  hasSave: boolean;
  onStart: () => void;
  onContinue: () => void;
  onExit: () => void;
  /** Optional: fullscreen is a nicety, not a requirement. */
  onRequestFullscreen?: () => void;
  /** True once the world is built and the canvas can be handed over. */
  starting: boolean;
  startError: string | null;
}

export function MainMenu({ lang, hasSave, onStart, onContinue, onExit, onRequestFullscreen, starting, startError }: MainMenuProps) {
  const copy = GAME_COPY[lang] ?? GAME_COPY.en;
  const [image, setImage] = useState<FeedImage | null>(null);
  const [feedState, setFeedState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch('/api/mars/latest?rover=perseverance&num=1', { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((payload) => {
        if (!active) return;
        const first: FeedImage | undefined = Array.isArray(payload?.images) ? payload.images[0] : undefined;
        if (first?.imageUrl) {
          setImage(first);
          setFeedState('ready');
        } else {
          setFeedState('error');
        }
      })
      .catch(() => {
        if (active) setFeedState('error');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const playable = !starting;

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-void px-4 py-10">
      {/* The one real asset on this screen, and it is labelled. */}
      <div className="absolute inset-0" aria-hidden="true">
        {image ? (
          <img
            src={image.imageUrl}
            alt=""
            className="h-full w-full object-cover opacity-25"
            loading="eager"
            decoding="async"
            onError={() => {
              setImage(null);
              setFeedState('error');
            }}
          />
        ) : null}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(60,32,18,0.55),rgba(3,6,14,0.94)_65%)]" />
        {/* A dusk gradient at the bottom grounds the panel without a photo. */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,rgba(3,6,14,0)_0%,rgba(3,6,14,0.9)_100%)]" />
      </div>

      <div className="relative z-10 w-full max-w-2xl">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="mt-3 text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink sm:text-[52px]">
          {copy.title}
        </h1>
        <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-ink-2 sm:text-[14.5px]">{copy.subtitle}</p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" onClick={hasSave ? onContinue : onStart} disabled={!playable}>
            {starting ? copy.loading : hasSave ? copy.continueGame : copy.enter}
          </Button>
          {hasSave && (
            <Button variant="secondary" size="lg" onClick={onStart} disabled={!playable}>
              {copy.newGame}
            </Button>
          )}
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-[10px] border border-transparent px-3 py-2 text-[12.5px] text-ink-3 transition-colors hover:border-line hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
            {copy.returnToSite}
          </a>
          {onRequestFullscreen && (
            <button
              type="button"
              onClick={onRequestFullscreen}
              className="inline-flex items-center gap-2 rounded-[10px] border border-transparent px-3 py-2 text-[12.5px] text-ink-3 transition-colors hover:border-line hover:text-ink"
            >
              <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
              {copy.fullscreen}
            </button>
          )}
        </div>

        {startError && (
          <p role="alert" className="mt-3 text-[12px] text-caution">
            {startError}
          </p>
        )}

        {/* Attribution for the photograph, only when there is one. */}
        {image && (
          <p className="mt-4 max-w-xl font-mono text-[10px] leading-relaxed text-ink-4">
            {copy.liveBadge} · {image.rover} · {image.camera} · sol {image.sol} · {image.takenUtc.slice(0, 10)} · NASA/JPL-Caltech
            {feedState === 'ready' ? '' : ''}
          </p>
        )}

        <Glass className="mt-8 p-4 sm:p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">{copy.discoverTitle}</p>
          <ul className="mt-2.5 space-y-1.5 text-[12px] leading-relaxed text-ink-2">
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-atmo" />
              {copy.discover1}
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-caution" />
              {copy.discover2}
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-signal" />
              {copy.discover3}
            </li>
          </ul>
          <button
            type="button"
            onClick={onExit}
            className="mt-4 text-[11.5px] text-atmo underline underline-offset-4 hover:text-atmo-soft"
          >
            {copy.webglBack}
          </button>
        </Glass>
      </div>
    </div>
  );
}
