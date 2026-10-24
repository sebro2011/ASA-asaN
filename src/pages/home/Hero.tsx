'use client';

/**
 * HomeHero — the first viewport.
 *
 * Composition rules applied here:
 *  - one focal point (the planet), one headline, one primary action;
 *  - copy column limited to 34rem so the eye lands before the data;
 *  - the scrim is a designed part of the image, not an afterthought;
 *  - the 3D scene is code-split and lazily mounted, with a real poster fallback.
 */

import React, { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowRight, Leaf } from 'lucide-react';
import type { TabId } from '../../ui/navigation';
import { Button } from '../../ui/primitives';
import ErrorBoundary from '../../ui/ErrorBoundary';
import { PosterEarth } from '../../components/hero/PosterEarth';

const OrbitalEarth = React.lazy(() => import('../../components/hero/OrbitalEarth'));

export default function HomeHero({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  const { t } = useTranslation();

  return (
    <section
      className="relative isolate overflow-hidden border-b border-line/70"
      aria-labelledby="hero-title"
    >
      {/* Planet + atmosphere ------------------------------------------------ */}
      <div className="absolute inset-0 -z-10">
        <ErrorBoundary fallback={<PosterEarth />}>
          <Suspense fallback={<PosterEarth />}>
            <OrbitalEarth />
          </Suspense>
        </ErrorBoundary>
      </div>
      <div className="absolute inset-0 -z-10 hero-scrim" aria-hidden="true" />
      <div
        className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(3,6,14,0.72)_0%,rgba(3,6,14,0.35)_44%,rgba(3,6,14,0.94)_100%)] lg:hidden"
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-atmo/25 to-transparent" aria-hidden="true" />

      <div className="mx-auto flex min-h-[590px] max-w-[1400px] flex-col justify-end px-4 pb-12 pt-16 sm:px-6 sm:pb-16 lg:min-h-[calc(100svh-72px)] lg:justify-center lg:px-8 lg:pb-24 lg:pt-24">
        <div className="max-w-[36rem]">
          <p className="eyebrow flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-atmo" />
            {t('heroEyebrow')}
          </p>

          <h1
            id="hero-title"
            className="mt-5 text-[40px] font-semibold leading-[0.98] tracking-[-0.035em] text-ink sm:text-[56px] lg:text-[72px]"
          >
            {t('heroTitleA')}{' '}
            <span className="bg-[linear-gradient(96deg,#a7e8fa_0%,#5ed3f2_38%,#4f8dff_100%)] bg-clip-text text-transparent">
              {t('heroTitleB')}
            </span>
          </h1>

          <p className="prose-measure mt-5 max-w-[34rem] text-[13.5px] leading-relaxed text-ink-2 sm:text-[15px]">
            {t('heroDescription')}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <Button
              variant="primary"
              size="lg"
              onClick={() => onNavigate('earth')}
              icon={Leaf}
              trailingIcon={ArrowRight}
              className="w-full sm:w-auto"
            >
              {t('heroCtaPrimary')}
            </Button>
            <a
              href="#mission-overview"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[10px] border border-line-strong/80 bg-void/40 px-5 text-sm font-medium text-ink backdrop-blur-md transition-colors hover:border-atmo/40 hover:bg-void/60 sm:w-auto"
            >
              {t('heroCtaSecondary')}
            </a>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('apod')}
            className="group mt-5 inline-flex items-center gap-2 text-[12.5px] text-ink-3 transition-colors hover:text-ink"
          >
            <span className="h-px w-6 bg-line-strong transition-colors group-hover:bg-atmo" />
            {t('heroCtaTertiary')}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.8} />
          </button>
        </div>

        {/* Credibility strip: verifiable facts only, no invented counters. */}
        <div className="mt-10 flex flex-col gap-4 border-t border-line/70 pt-5 sm:mt-14 lg:absolute lg:inset-x-8 lg:bottom-8 lg:mt-0 lg:flex-row lg:items-end lg:justify-between lg:border-t-0 lg:pt-0">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-4">
            <span>{t('heroFact1')}</span>
            <span className="h-3 w-px bg-line-strong" aria-hidden="true" />
            <span>{t('heroFact2')}</span>
            <span className="h-3 w-px bg-line-strong" aria-hidden="true" />
            <span>{t('heroFact3')}</span>
          </div>

          <div className="flex items-center justify-between gap-4 lg:justify-end">
            <p className="max-w-[20rem] text-[10.5px] leading-relaxed text-ink-4">{t('heroImageCredit')}</p>
            <a
              href="#mission-overview"
              aria-label={t('heroScroll')}
              className="hidden h-9 w-9 shrink-0 place-items-center rounded-full border border-line-strong/70 text-ink-3 transition-colors hover:border-atmo/50 hover:text-ink sm:grid"
            >
              <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.8} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
