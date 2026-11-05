/**
 * Language switcher (English · සිංහල · தமிழ்).
 *
 * Accessible menu button: aria-haspopup/expanded, Escape closes, outside click
 * closes, roving focus via normal tab order, and the choice is persisted with
 * the same key the rest of the app already honours (`i18nextLng`).
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Globe } from 'lucide-react';
import type { SupportedLanguage } from '../i18n/translations';

const LANGUAGES: Array<{ code: SupportedLanguage; native: string; short: string }> = [
  { code: 'en', native: 'English', short: 'EN' },
  { code: 'si', native: 'සිංහල', short: 'සිං' },
  { code: 'ta', native: 'தமிழ்', short: 'தமி' },
];

export function useLanguage() {
  const { i18n } = useTranslation();
  const lang = ((i18n.language || 'en').slice(0, 2) as SupportedLanguage) || 'en';
  const changeLanguage = (code: SupportedLanguage) => {
    void i18n.changeLanguage(code);
    document.documentElement.lang = code;
    try {
      window.localStorage.setItem('i18nextLng', code);
    } catch {
      /* storage blocked — the session still changes language */
    }
  };
  return { lang, changeLanguage };
}

export default function LanguageMenu({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { lang, changeLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((item) => item.code === lang) || LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="nova-btn nova-btn--ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('wsLanguage')}: ${current.native}`}
        onClick={() => setOpen((value) => !value)}
        style={{ height: '2rem', paddingInline: compact ? '0.5rem' : '0.625rem', gap: '0.375rem' }}
      >
        <Globe size={15} strokeWidth={1.8} aria-hidden="true" />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em]">{current.short}</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={t('wsLanguage')}
          className="nova-panel absolute right-0 top-[calc(100%+6px)] z-50 min-w-[11rem] p-1 shadow-[var(--ws-shadow-2)]"
        >
          {LANGUAGES.map((item) => {
            const active = item.code === lang;
            return (
              <button
                key={item.code}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className="nova-nav-item"
                onClick={() => {
                  changeLanguage(item.code);
                  setOpen(false);
                }}
              >
                <span className="nova-nav-item__label">{item.native}</span>
                {active ? <Check size={14} strokeWidth={2.2} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
