'use client';

/**
 * Discovery — the editorial directory of the platform.
 *
 * Typographic cards rather than stock photography: a premium science product
 * earns its atmosphere from composition and typography, and never borrows an
 * unrelated stock image to stand in for an instrument.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight } from 'lucide-react';
import type { SupportedLanguage } from '../../i18n/translations';
import { Gamepad2 } from 'lucide-react';
import { NAV_ENTRIES, type TabId } from '../../ui/navigation';
import { navigate } from '../../app/router';

const FEATURED: Array<{ id: TabId; index: string; metric: string; meta: string }> = [
  { id: 'earth', index: '01', metric: 'POWER + GIBS', meta: '1981 → present' },
  { id: 'asteroids', index: '02', metric: 'NEO · NeoWs', meta: '24-hour feed' },
  { id: 'missions', index: '03', metric: 'Apollo → Artemis', meta: '4 mission dossiers' },
  { id: 'apod', index: '04', metric: 'NASA APOD', meta: 'Daily archive' },
  { id: 'iss', index: '05', metric: 'ORBITAL TRACKING', meta: '~92.6 min period' },
  { id: 'launch', index: '06', metric: 'SIMULATED FLIGHT', meta: 'Not flight data' }
];

export default function Discovery({
  lang,
  onNavigate
}: {
  lang: SupportedLanguage;
  onNavigate: (tab: TabId) => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{t('discoveryEyebrow')}</p>
          <h2 className="mt-2.5 text-[22px] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[28px]">
            {t('discoveryTitle')}
          </h2>
        </div>
        <p className="max-w-sm text-[12px] leading-relaxed text-ink-3">{t('discoveryDescription')}</p>
      </div>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[16px] border border-line bg-line/70 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURED.map((item) => {
          const entry = NAV_ENTRIES.find((candidate) => candidate.id === item.id);
          if (!entry) return null;
          const Icon = entry.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className="group relative flex min-h-[168px] flex-col justify-between bg-abyss/85 p-5 text-left transition-colors duration-300 hover:bg-surface/70"
            >
              <div className="flex items-start justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-surface/70 text-atmo transition-colors group-hover:border-atmo/40">
                  <Icon className="h-4 w-4" strokeWidth={1.6} />
                </span>
                <span className="font-mono text-[10px] tracking-[0.14em] text-ink-4">{item.index}</span>
              </div>

              <div>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-4">{item.metric}</p>
                <h3 className="mt-2 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-ink">
                  {entry.labels[lang] || entry.labels.en}
                </h3>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[10.5px] text-ink-4">{item.meta}</span>
                  <ArrowUpRight
                    className="h-3.5 w-3.5 text-ink-4 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-atmo"
                    strokeWidth={1.8}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/*
        The game is not an Explore tab: it is a full-screen module with its own
        route, so it gets its own card rather than a thirteenth cell in a grid
        whose every other cell opens a science destination.
      */}
      <button
        type="button"
        onClick={() => navigate('/mars-game')}
        className="group mt-3 flex w-full items-center gap-4 overflow-hidden rounded-[16px] border border-line bg-abyss/85 p-5 text-left transition-colors duration-300 hover:border-atmo/40 hover:bg-surface/70"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-atmo/30 bg-atmo/10 text-atmo">
          <Gamepad2 className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              {t('discoveryGameTitle')}
            </span>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-4">
              {t('discoveryGameMeta')}
            </span>
          </span>
          <span className="mt-1 block text-[12px] leading-relaxed text-ink-3">{t('discoveryGameBody')}</span>
        </span>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-ink-4 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-atmo"
          strokeWidth={1.8}
          aria-hidden="true"
        />
      </button>
    </section>
  );
}
