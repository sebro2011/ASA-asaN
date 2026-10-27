'use client';

/**
 * WelcomeScreen — first-visit welcome overlay.
 *
 * Design constraints (feature brief):
 *  - Premium but lightweight: the static PosterEarth texture, no video and
 *    no 3D; a single opacity/scale transition (global MotionConfig makes it
 *    instant under prefers-reduced-motion).
 *  - One primary action ("Begin Exploration") plus an always-visible Skip.
 *  - The "Show welcome screen on startup" preference is opt-in (default off)
 *    so returning users are never interrupted unless they asked for it.
 *  - Dialog semantics, labelled controls, Escape-to-skip and focus handoff
 *    keep the overlay keyboard and screen-reader accessible.
 *
 * All persistence lives in `lib/welcome`; this component only renders and
 * reports the user's choice through `onDismiss`.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PosterEarth } from './hero/PosterEarth';
import { Button } from '../ui/primitives';
import { APP_VERSION_LABEL } from '../lib/version';
import { initialShowOnStartup } from '../lib/welcome';
import type { SupportedLanguage } from '../i18n/translations';

export interface WelcomeScreenProps {
  /** Interface language, matching the prop convention of other destinations. */
  lang: SupportedLanguage;
  /** Called for both Begin and Skip with the current checkbox state. */
  onDismiss: (showOnStartup: boolean) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onDismiss }) => {
  const { t } = useTranslation();
  const [showOnStartup, setShowOnStartup] = useState<boolean>(() => initialShowOnStartup());

  useEffect(() => {
    // Autofocus the primary action so keyboard users land on the obvious next step.
    document.getElementById('welcome-begin')?.focus();
    // Lock background scroll while the modal overlay owns the viewport.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const dismiss = useCallback(() => onDismiss(showOnStartup), [onDismiss, showOnStartup]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onDismiss(showOnStartup);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onDismiss, showOnStartup]);

  return (
    <motion.div
      className="fixed inset-0 z-[80] overflow-y-auto bg-void"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      aria-describedby="welcome-body"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Subtle Earth artwork + legibility scrims (decorative, hidden from AT). */}
      <PosterEarth />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(3,6,14,0.86)_0%,rgba(3,6,14,0.72)_45%,rgba(3,6,14,0.95)_100%)]" aria-hidden="true" />

      <div className="relative mx-auto flex min-h-full max-w-2xl flex-col justify-center px-5 py-14 sm:px-8">
        <p className="eyebrow flex items-center gap-2">
          <span className="h-1 w-1 rounded-full bg-atmo" aria-hidden="true" />
          {t('welcomeEyebrow')}
        </p>

        <h1
          id="welcome-title"
          className="mt-5 max-w-xl text-[34px] font-semibold leading-[1.04] tracking-[-0.03em] text-ink sm:text-[46px]"
        >
          {t('welcomeTitle')}
        </h1>

        <p id="welcome-body" className="prose-measure mt-5 max-w-xl text-[13.5px] leading-relaxed text-ink-2 sm:text-[15px]">
          {t('welcomeBody')}
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            id="welcome-begin"
            type="button"
            variant="primary"
            size="lg"
            icon={ArrowRight}
            onClick={dismiss}
            className="w-full sm:w-auto"
          >
            {t('welcomeBegin')}
          </Button>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-[10px] border border-line-strong/80 bg-void/40 px-5 text-sm font-medium text-ink-2 backdrop-blur-md transition-colors hover:border-atmo/40 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)] sm:w-auto"
          >
            {t('welcomeSkip')}
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

        <label className="mt-7 flex w-fit cursor-pointer items-start gap-3 rounded-lg text-[12.5px] text-ink-3">
          <input
            type="checkbox"
            checked={showOnStartup}
            onChange={(event) => setShowOnStartup(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-[var(--atmo,#5ed3f2)]"
          />
          <span>{t('welcomeShowOnStartup')}</span>
        </label>

        <p className="mt-10 border-t border-line/60 pt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-4">
          {APP_VERSION_LABEL}
        </p>
      </div>
    </motion.div>
  );
};

export default WelcomeScreen;
