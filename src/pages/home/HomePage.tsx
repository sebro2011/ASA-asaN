'use client';

/**
 * HomePage — the platform's front door.
 *
 * Section rhythm: hero → service state → operational overview → one Earth
 * observation → directory. Each section is separated by generous whitespace and
 * a hairline, never by a card inside a card.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from '../../i18n/translations';
import type { TabId } from '../../ui/navigation';
import { useApiResource } from '../../hooks/useApiResource';
import { loadApod, loadEarthPreview, loadIss, loadNeo } from './homeData';
import HomeHero from './Hero';
import SignalStrip from './SignalStrip';
import MissionOverview from './MissionOverview';
import EarthPreview from './EarthPreview';
import Discovery from './Discovery';

export default function HomePage({
  lang,
  onNavigate
}: {
  lang: SupportedLanguage;
  onNavigate: (tab: TabId) => void;
}) {
  const { t } = useTranslation();
  const apod = useApiResource(loadApod, []);
  const iss = useApiResource(loadIss, []);
  const neo = useApiResource(loadNeo, []);
  const earth = useApiResource(loadEarthPreview, []);

  return (
    <div className="pb-4">
      <HomeHero onNavigate={onNavigate} />

      <div className="relative z-10 -mt-8 sm:-mt-10">
        <SignalStrip apod={apod} iss={iss} neo={neo} earth={earth} />
      </div>

      <div className="mt-16 sm:mt-20">
        <MissionOverview iss={iss} neo={neo} apod={apod} onNavigate={onNavigate} />
      </div>

      <div className="mt-16 border-t border-line/60 pt-14 sm:mt-24 sm:pt-20">
        <EarthPreview resource={earth} onNavigate={onNavigate} />
      </div>

      <div className="mt-16 border-t border-line/60 pt-14 sm:mt-24 sm:pt-20">
        <Discovery lang={lang} onNavigate={onNavigate} />
      </div>

      <div className="mx-auto mt-16 max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[18px] border border-line bg-[linear-gradient(120deg,rgba(79,141,255,0.12),rgba(94,211,242,0.05)_48%,rgba(3,6,14,0)_100%)] p-6 sm:p-8">
          <div className="pointer-events-none absolute inset-0 grid-field opacity-50" aria-hidden="true" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <p className="eyebrow">NOVA · grounded assistant</p>
              <h2 className="mt-2.5 text-[20px] font-semibold leading-snug tracking-[-0.02em] text-ink sm:text-[24px]">
                {t('navAskNova')} — in English, සිංහල or தமிழ்
              </h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
                Ask about a mission, a dataset or a result on this page. NOVA answers from retrieved NASA data and
                says so when it does not know.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('assistant')}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] bg-atmo px-5 text-sm font-semibold text-[#04202b] transition-colors hover:bg-atmo-soft"
            >
              {t('navAskNova')}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
