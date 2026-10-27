'use client';

/**
 * MobileTabBar — thumb-reachable primary navigation on phones and small tablets.
 *
 * Primary destinations; everything else is one level deeper in the sheet. The
 * bar respects the device safe area and never overlaps page content because the
 * app shell reserves matching bottom padding.
 */

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clapperboard, Grid2x2, House, Leaf, MoreHorizontal, Sparkles, X } from 'lucide-react';
import { NAV_ENTRIES, NAV_GROUPS, type TabId } from './navigation';
import type { SupportedLanguage } from '../i18n/translations';
import { cx } from './primitives';

const ITEMS: Array<{
  id: TabId | 'menu';
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  labels: Record<SupportedLanguage, string>;
}> = [
  { id: 'home', icon: House, labels: { en: 'Home', si: 'මුල් පිටුව', ta: 'முகப்பு' } },
  { id: 'earth', icon: Leaf, labels: { en: 'Earth', si: 'පෘථිවිය', ta: 'பூமி' } },
  { id: 'space-shorts', icon: Clapperboard, labels: { en: 'Shorts', si: 'කෙටි වීඩියෝ', ta: 'குறுங்காணொளி' } },
  { id: 'assistant', icon: Sparkles, labels: { en: 'NOVA', si: 'NOVA', ta: 'NOVA' } },
  { id: 'saved', icon: Grid2x2, labels: { en: 'Saved', si: 'සුරැකි', ta: 'சேமிப்பு' } },
  { id: 'menu', icon: MoreHorizontal, labels: { en: 'More', si: 'තව', ta: 'மேலும்' } }
];

export default function MobileTabBar({
  activeTab,
  onTabChange,
  lang
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  lang: SupportedLanguage;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const select = (tab: TabId) => {
    onTabChange(tab);
    setMenuOpen(false);
  };

  return (
    <>
      <nav
        aria-label="Primary mobile"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-abyss/95 backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-between px-2 pt-1.5">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.id !== 'menu' && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => (item.id === 'menu' ? setMenuOpen(true) : select(item.id))}
                aria-current={active ? 'page' : undefined}
                aria-label={item.labels[lang] || item.labels.en}
                className="relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg py-2"
              >
                <span
                  className={cx(
                    'grid h-7 w-12 place-items-center rounded-full transition-colors',
                    active ? 'bg-atmo/15 text-atmo' : 'text-ink-3'
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2 : 1.7} />
                </span>
                <span
                  className={cx(
                    'truncate text-[10px] font-medium',
                    active ? 'text-ink' : 'text-ink-4'
                  )}
                >
                  {item.labels[lang] || item.labels.en}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[55] lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="All destinations"
          >
            <div className="absolute inset-0 bg-void/85 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
            <motion.div
              initial={{ y: 28, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-[20px] border-t border-line bg-abyss px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3"
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-strong" />
              <div className="flex items-center justify-between">
                <p className="eyebrow">All destinations</p>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close destinations"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-2"
                >
                  <X className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>
              {NAV_GROUPS.map((group) => (
                <div key={group.id} className="mt-4">
                  <p className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-4">
                    {group.labels[lang] || group.labels.en}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {NAV_ENTRIES.filter((entry) => entry.group === group.id).map((entry) => {
                      const Icon = entry.icon;
                      const active = entry.id === activeTab;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => select(entry.id)}
                          className={cx(
                            'flex min-h-[62px] flex-col items-start justify-between rounded-xl border p-2.5 text-left',
                            active ? 'border-atmo/40 bg-atmo/10' : 'border-line/70 bg-surface/50'
                          )}
                        >
                          <Icon className="h-4 w-4 text-atmo" strokeWidth={1.7} />
                          <span className="mt-2 line-clamp-2 text-[11.5px] font-medium leading-tight text-ink">
                            {entry.labels[lang] || entry.labels.en}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
