'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Globe2, Check, ChevronDown, Sparkles } from 'lucide-react';
import { SupportedLanguage } from '../i18n/translations';

const LANGUAGES = [
  {
    code: 'en' as SupportedLanguage,
    flag: '🇬🇧',
    nativeName: 'English',
    englishName: 'English',
    region: 'International'
  },
  {
    code: 'si' as SupportedLanguage,
    flag: '🇱🇰',
    nativeName: 'සිංහල',
    englishName: 'Sinhala',
    region: 'ශ්‍රී ලංකාව'
  },
  {
    code: 'ta' as SupportedLanguage,
    flag: '🇮🇳',
    nativeName: 'தமிழ்',
    englishName: 'Tamil',
    region: 'தமிழ்நாடு / இலங்கை'
  }
];

export const FloatingLanguageSwitcher: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { i18n } = useTranslation();
  const currentCode = (i18n.language || 'en').slice(0, 2) as SupportedLanguage;
  const currentLang = LANGUAGES.find((l) => l.code === currentCode) || LANGUAGES[0];
  
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectLanguage = (code: SupportedLanguage) => {
    i18n.changeLanguage(code);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = code;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('i18nextLng', code);
    }
    setIsOpen(false);
  };

  return (
    <div
      ref={dropdownRef}
      className={`fixed top-3 sm:top-4 right-4 sm:right-6 z-50 pointer-events-auto ${className}`}
    >
      {/* Floating Pill Trigger */}
      <motion.button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 450, damping: 25 }}
        className="flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full bg-slate-950/85 hover:bg-slate-900 border border-cyan-500/40 hover:border-cyan-400 backdrop-blur-2xl shadow-[0_8px_24px_rgba(0,0,0,0.6),0_0_15px_rgba(6,182,212,0.2)] text-white select-none transition-colors"
        aria-label="Change Language"
        aria-expanded={isOpen}
      >
        <div className="w-5 h-5 sm:w-5.5 sm:h-5.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
          <Globe2 className="w-3.5 h-3.5 text-cyan-400" />
        </div>

        <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold tracking-wide">
          <span className="text-sm sm:text-base leading-none">{currentLang.flag}</span>
          <span className="font-sans font-bold text-slate-100">{currentLang.nativeName}</span>
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-cyan-400' : ''
          }`}
        />
      </motion.button>

      {/* Glassmorphic Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 450, damping: 28 }}
            className="absolute right-0 mt-2.5 w-64 sm:w-72 rounded-3xl bg-slate-950/95 border border-cyan-500/40 shadow-[0_20px_50px_rgba(0,0,0,0.85),0_0_30px_rgba(6,182,212,0.15)] backdrop-blur-3xl p-3 text-slate-200"
          >
            {/* Header with Cosmic Badge */}
            <div className="flex items-center justify-between px-2.5 py-1.5 mb-1.5 border-b border-slate-800/80">
              <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-400">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                <span>Trilingual i18n</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500 font-semibold">
                NASA & Gemini AI
              </span>
            </div>

            {/* Language Selection List */}
            <div className="space-y-1">
              {LANGUAGES.map((lang) => {
                const isSelected = currentCode === lang.code;

                return (
                  <motion.button
                    key={lang.code}
                    type="button"
                    onClick={() => handleSelectLanguage(lang.code)}
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-2xl transition-all select-none text-left ${
                      isSelected
                        ? 'bg-gradient-to-r from-cyan-950/80 via-blue-950/70 to-indigo-950/80 border border-cyan-500/50 shadow-md shadow-cyan-950/40'
                        : 'hover:bg-slate-900/80 border border-transparent hover:border-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl sm:text-2xl leading-none">{lang.flag}</span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-sans font-bold text-sm ${
                              isSelected ? 'text-cyan-200' : 'text-slate-200'
                            }`}
                          >
                            {lang.nativeName}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 uppercase">
                            ({lang.code})
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono block">
                          {lang.englishName} • {lang.region}
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-cyan-300">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* AI Auto-Translation Status Note */}
            <div className="mt-2.5 pt-2 border-t border-slate-800/80 px-2 text-[10px] font-mono text-slate-400 text-center">
              <span>Dynamic deep-space text translated on-the-fly</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FloatingLanguageSwitcher;
