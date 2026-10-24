'use client';

/**
 * AppHeader — primary navigation, language switching and global actions.
 *
 * Desktop: grouped dropdown menus (Explore / Earth / Solar System / Assistant)
 * with a persistent "Ask NOVA" action and a compact data-status cluster.
 * Mobile: brand + language + menu sheet (the bottom tab bar handles fast travel).
 *
 * All menus are real buttons with `aria-expanded` / `aria-haspopup`, close on
 * Escape and outside click, and every item is keyboard reachable.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  Check,
  Globe2,
  Menu,
  Search,
  Sparkles,
  X,
  Command,
  Download
} from 'lucide-react';
import type { SupportedLanguage } from '../i18n/translations';
import { NAV_ENTRIES, NAV_GROUPS, type TabId } from './navigation';
import { cx } from './primitives';

const LANGUAGES: Array<{ code: SupportedLanguage; native: string; english: string; script: string }> = [
  { code: 'en', native: 'English', english: 'English', script: 'EN' },
  { code: 'si', native: 'සිංහල', english: 'Sinhala', script: 'සිං' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil', script: 'தமி' }
];

function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer, { passive: true });
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);
  return ref;
}

export interface AppHeaderProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onOpenExport?: () => void;
  dataStatus?: React.ReactNode;
  lang: SupportedLanguage;
}

export default function AppHeader({ activeTab, onTabChange, onOpenExport, dataStatus, lang }: AppHeaderProps) {
  const { i18n } = useTranslation();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useOutsideClose(() => {
    setOpenGroup(null);
    setLangOpen(false);
  });

  const current = LANGUAGES.find((item) => item.code === lang) || LANGUAGES[0];

  const changeLanguage = (code: SupportedLanguage) => {
    i18n.changeLanguage(code);
    if (typeof document !== 'undefined') document.documentElement.lang = code;
    try {
      localStorage.setItem('i18nextLng', code);
    } catch {
      /* storage can be blocked — language still applies for the session */
    }
    setLangOpen(false);
    setMobileOpen(false);
  };

  const go = (tab: TabId) => {
    onTabChange(tab);
    setOpenGroup(null);
    setMobileOpen(false);
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 border-b border-line/80 bg-void/80 backdrop-blur-2xl supports-[backdrop-filter]:bg-void/60"
    >
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:h-[72px] lg:gap-5 lg:px-8">
        {/* Brand ------------------------------------------------------------ */}
        <button
          type="button"
          onClick={() => go('home')}
          className="group flex shrink-0 items-center gap-2.5 rounded-lg text-left"
          aria-label="NASA Space Explorer — home"
        >
          <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-line-strong bg-[radial-gradient(circle_at_30%_25%,#1a3a63,#040911_70%)] lg:h-10 lg:w-10">
            <svg viewBox="0 0 32 32" className="h-5 w-5 text-atmo" aria-hidden="true">
              <circle cx="16" cy="16" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <ellipse
                cx="16"
                cy="16"
                rx="13"
                ry="5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.1"
                opacity="0.7"
                transform="rotate(-24 16 16)"
              />
              <circle cx="27.5" cy="9.5" r="1.6" fill="currentColor" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold leading-none tracking-tight text-ink lg:text-sm">
              NASA Space Explorer
            </span>
            <span className="mt-1 block font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-4">
              Earth · Missions · Deep Space
            </span>
          </span>
        </button>

        {/* Desktop navigation ---------------------------------------------- */}
        <nav className="ml-2 hidden items-center gap-1 lg:flex" aria-label="Primary">
          <button
            type="button"
            onClick={() => go('home')}
            aria-current={activeTab === 'home' ? 'page' : undefined}
            className={cx(
              'rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
              activeTab === 'home' ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2/60 hover:text-ink'
            )}
          >
            Home
          </button>

          {NAV_GROUPS.map((group) => {
            const items = NAV_ENTRIES.filter((entry) => entry.group === group.id);
            const isActive = items.some((item) => item.id === activeTab);
            const isOpen = openGroup === group.id;
            return (
              <div key={group.id} className="relative">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-haspopup="menu"
                  onClick={() => setOpenGroup(isOpen ? null : group.id)}
                  className={cx(
                    'flex items-center gap-1 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                    isActive || isOpen ? 'text-ink' : 'text-ink-2 hover:text-ink'
                  )}
                >
                  {group.labels[lang] || group.labels.en}
                  <ChevronDown
                    className={cx('h-3.5 w-3.5 text-ink-4 transition-transform', isOpen && 'rotate-180')}
                    strokeWidth={1.8}
                  />
                </button>

                <AnimatePresence>
                  {isOpen ? (
                    <motion.div
                      role="menu"
                      initial={{ opacity: 0, y: 6, scale: 0.985 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.99 }}
                      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute left-0 top-[calc(100%+10px)] w-[340px] overflow-hidden rounded-[14px] border border-line bg-abyss/95 p-1.5 shadow-[0_28px_70px_-30px_rgba(0,0,0,0.95)] backdrop-blur-2xl"
                    >
                      {items.map((item) => {
                        const Icon = item.icon;
                        const active = item.id === activeTab;
                        return (
                          <button
                            key={item.id}
                            role="menuitem"
                            type="button"
                            onClick={() => go(item.id)}
                            className={cx(
                              'flex w-full items-start gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors',
                              active ? 'bg-surface-2' : 'hover:bg-surface-2/70'
                            )}
                          >
                            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line bg-surface/80">
                              <Icon className="h-3.5 w-3.5 text-atmo" strokeWidth={1.7} />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[13px] font-medium text-ink">
                                {item.labels[lang] || item.labels.en}
                              </span>
                              <span className="mt-0.5 block text-[11px] leading-snug text-ink-4">
                                {item.hint[lang] || item.hint.en}
                              </span>
                            </span>
                            {active ? <Check className="ml-auto mt-1 h-3.5 w-3.5 text-atmo" strokeWidth={2} /> : null}
                          </button>
                        );
                      })}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {dataStatus ? <div className="hidden xl:block">{dataStatus}</div> : null}

          {/* Language ------------------------------------------------------ */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setLangOpen((open) => !open)}
              aria-expanded={langOpen}
              aria-haspopup="menu"
              aria-label={`Language: ${current.english}`}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface/60 px-2.5 text-[12px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            >
              <Globe2 className="h-3.5 w-3.5" strokeWidth={1.7} />
              <span className="font-medium">{current.script}</span>
              <ChevronDown className="h-3 w-3 text-ink-4" strokeWidth={1.9} />
            </button>
            <AnimatePresence>
              {langOpen ? (
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-[calc(100%+8px)] w-56 overflow-hidden rounded-[12px] border border-line bg-abyss/97 p-1.5 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.95)] backdrop-blur-2xl"
                >
                  <p className="px-2.5 pb-1 pt-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-4">
                    Interface language
                  </p>
                  {LANGUAGES.map((item) => (
                    <button
                      key={item.code}
                      role="menuitemradio"
                      aria-checked={item.code === current.code}
                      type="button"
                      onClick={() => changeLanguage(item.code)}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                      <span>
                        <span className="block text-ink">{item.native}</span>
                        <span className="text-[10.5px] text-ink-4">{item.english}</span>
                      </span>
                      {item.code === current.code ? <Check className="h-3.5 w-3.5 text-atmo" strokeWidth={2} /> : null}
                    </button>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={() => go('assistant')}
            className="hidden h-9 items-center gap-1.5 rounded-lg bg-atmo px-3 text-[12.5px] font-semibold text-[#04202b] transition-colors hover:bg-atmo-soft sm:flex"
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
            Ask NOVA
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface/60 text-ink-2 transition-colors hover:text-ink lg:hidden"
          >
            <Menu className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Mobile sheet ----------------------------------------------------- */}
      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <div className="absolute inset-0 bg-void/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <motion.div
              initial={{ y: -16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-x-0 top-0 max-h-[88vh] overflow-y-auto border-b border-line bg-abyss px-4 pb-6 pt-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-4">Navigate</span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-2"
                >
                  <X className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => go('home')}
                className="mt-4 flex w-full items-center justify-between rounded-xl border border-line bg-surface/70 px-3.5 py-3 text-left"
              >
                <span className="text-sm font-medium text-ink">Mission overview</span>
                <Search className="h-4 w-4 text-ink-3" strokeWidth={1.7} />
              </button>

              {NAV_GROUPS.map((group) => (
                <div key={group.id} className="mt-5">
                  <p className="eyebrow mb-2">{group.labels[lang] || group.labels.en}</p>
                  <div className="grid gap-1.5">
                    {NAV_ENTRIES.filter((entry) => entry.group === group.id).map((entry) => {
                      const Icon = entry.icon;
                      const active = entry.id === activeTab;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => go(entry.id)}
                          className={cx(
                            'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                            active ? 'border-atmo/40 bg-atmo/10' : 'border-line/70 bg-surface/40'
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-atmo" strokeWidth={1.7} />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-ink">
                              {entry.labels[lang] || entry.labels.en}
                            </span>
                            <span className="block truncate text-[10.5px] text-ink-4">
                              {entry.hint[lang] || entry.hint.en}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="mt-6 flex flex-wrap gap-2">
                {onOpenExport ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      onOpenExport();
                    }}
                    className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface/60 px-3 text-[12px] text-ink-2"
                  >
                    <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
                    Export single-file HTML
                  </button>
                ) : null}
                <span className="flex h-9 items-center gap-2 rounded-lg border border-line/70 px-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-4">
                  <Command className="h-3 w-3" strokeWidth={1.8} />
                  EN · සිං · தமி
                </span>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
