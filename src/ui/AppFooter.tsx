'use client';

/**
 * AppFooter — attribution, data-source register and secondary navigation.
 *
 * The product's credibility depends on the reader being able to see where each
 * number came from, so the footer is a data register, not decoration.
 */

import React from 'react';
import { ArrowUpRight, Download } from 'lucide-react';
import type { SupportedLanguage } from '../i18n/translations';
import { NAV_ENTRIES, type TabId } from './navigation';

const SOURCES = [
  { name: 'NASA Open APIs', detail: 'APOD · NeoWs · EPIC · Exoplanet Archive', href: 'https://api.nasa.gov' },
  { name: 'NASA POWER', detail: 'Monthly climate & land-surface archive', href: 'https://power.larc.nasa.gov' },
  { name: 'NASA GIBS', detail: 'EOSDIS Global Imagery Browse Services', href: 'https://nasa.github.io/nasaworldview' },
  { name: 'NASA EONET / News', detail: 'Agency releases & mission imagery', href: 'https://www.nasa.gov/news/' }
];

export default function AppFooter({
  onTabChange,
  onOpenExport,
  lang
}: {
  onTabChange: (tab: TabId) => void;
  onOpenExport: () => void;
  lang: SupportedLanguage;
}) {
  const groups: Array<{ title: string; ids: TabId[] }> = [
    { title: 'Explore', ids: ['apod', '3d', 'missions', 'news', 'quiz'] },
    { title: 'Earth', ids: ['earth', 'epic', 'iss'] },
    { title: 'Solar system', ids: ['asteroids', 'exoplanets', 'launch'] },
    { title: 'Assistant', ids: ['assistant', 'saved'] }
  ];

  return (
    <footer className="relative z-10 mt-20 border-t border-line bg-abyss/80 pb-24 pt-12 lg:pb-12">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_2fr]">
          <div>
            <p className="text-sm font-semibold tracking-tight text-ink">NASA Space Explorer</p>
            <p className="mt-2 max-w-sm text-[12.5px] leading-relaxed text-ink-3">
              An independent, trilingual interface to publicly available NASA science data. Not affiliated with or
              endorsed by the National Aeronautics and Space Administration.
            </p>
            <button
              type="button"
              onClick={onOpenExport}
              className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface/60 px-2.5 text-[11.5px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
              Export as single-file HTML
            </button>
            <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-4">
              English · සිංහල · தமிழ்
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {groups.map((group) => (
              <div key={group.title}>
                <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-4">{group.title}</p>
                <ul className="mt-2.5 space-y-1.5">
                  {group.ids.map((id) => {
                    const entry = NAV_ENTRIES.find((item) => item.id === id);
                    if (!entry) return null;
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => onTabChange(id)}
                          className="text-left text-[12px] text-ink-3 transition-colors hover:text-ink"
                        >
                          {entry.labels[lang] || entry.labels.en}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 rounded-[14px] border border-line/70 bg-surface/40 p-4">
          <p className="eyebrow">Data sources</p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SOURCES.map((source) => (
              <li key={source.name}>
                <a
                  href={source.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group flex items-start justify-between gap-2"
                >
                  <span>
                    <span className="block text-[12px] font-medium text-ink-2 group-hover:text-ink">{source.name}</span>
                    <span className="mt-0.5 block text-[10.5px] leading-snug text-ink-4">{source.detail}</span>
                  </span>
                  <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0 text-ink-4 group-hover:text-atmo" strokeWidth={1.8} />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-line/60 pt-5 text-[11px] text-ink-4 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Earth imagery: NASA Blue Marble / Visible Earth. Values shown in the Earth Lab are NASA POWER grid
            estimates, not station measurements.
          </p>
          <p className="font-mono uppercase tracking-[0.14em]">Built for scientific literacy</p>
        </div>
      </div>
    </footer>
  );
}
