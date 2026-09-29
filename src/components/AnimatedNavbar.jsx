'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { 
  Compass, 
  Orbit, 
  Rocket, 
  Newspaper, 
  ChevronDown, 
  Check, 
  Sparkles,
  Menu,
  X,
  FileCode,
  Radio,
  Bookmark,
  Heart,
  Bot,
  Globe2,
  Share2
} from 'lucide-react';
import { useFavorites } from '../utils/favorites';

/**
 * Trilingual navigation item definitions with icons & badges
 */
export const NAV_ITEMS = [
  {
    id: 'apod',
    icon: Compass,
    labels: {
      en: 'Cosmic APOD',
      si: 'දවසේ තාරකා ඡායාරූපය',
      ta: 'நாளின் வானியல் படம்'
    }
  },
  {
    id: '3d',
    icon: Orbit,
    labels: {
      en: '3D Space Lab',
      si: '3D අභ්‍යවකාශගාරය',
      ta: '3D விண்வெளி ஆய்வகம்'
    }
  },
  {
    id: 'missions',
    icon: Rocket,
    labels: {
      en: 'Landmark Missions',
      si: 'ඓතිහාසික මෙහෙයුම්',
      ta: 'வரலாற்றுப் பணிகள்'
    }
  },
  {
    id: 'news',
    icon: Newspaper,
    labels: {
      en: 'NASA News',
      si: 'නාසා පුවත්',
      ta: 'நாசா செய்திகள்'
    }
  },
  {
    id: 'assistant',
    icon: Bot,
    badge: 'AI',
    labels: {
      en: 'AI Assistant',
      si: 'AI සහකරු',
      ta: 'AI உதவியாளர்'
    }
  },
  {
    id: 'saved',
    icon: Bookmark,
    labels: {
      en: 'Saved',
      si: 'සුරැකි දෑ',
      ta: 'சேமிக்கப்பட்டவை'
    }
  }
];

export const LANGUAGES = [
  { code: 'en', label: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'si', label: 'Sinhala', nativeName: 'සිංහල', flag: '🇱🇰' },
  { code: 'ta', label: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' },
];

/**
 * Spring physics configuration for lag-free, ultra-fast tab snapping
 */
const SPRING_TRANSITION = {
  type: 'spring',
  stiffness: 500,
  damping: 35,
  mass: 0.8
};

/**
 * Enhanced Top Navigation Bar Component with Framer Motion layoutId pill gliding
 * 
 * @param {Object} props
 * @param {string} [props.activeTab='apod']
 * @param {(tab: string) => void} [props.onTabChange]
 * @param {() => void} [props.onOpenExportModal]
 * @param {() => void} [props.onOpenAssistant]
 * @param {string} [props.className]
 */
export default function AnimatedNavbar({
  activeTab = 'apod',
  onTabChange = () => {},
  onOpenExportModal,
  onOpenAssistant,
  className = ''
}) {
  const { i18n } = useTranslation();
  const currentLang = (i18n.language || 'en').slice(0, 2);
  const { totalCount } = useFavorites();

  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close language dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setLangDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageChange = (code) => {
    i18n.changeLanguage(code);
    setLangDropdownOpen(false);
    setMobileMenuOpen(false);
  };

  const handleTabClick = (tabId) => {
    onTabChange(tabId);
    setMobileMenuOpen(false);
    if (tabId === 'assistant' && onOpenAssistant) {
      onOpenAssistant();
    }
  };

  const currentLangObj = LANGUAGES.find(l => l.code === currentLang) || LANGUAGES[0];

  return (
    <header className={`sticky top-0 z-50 w-full bg-slate-950/80 backdrop-blur-xl border-b border-cyan-500/20 shadow-2xl transition-all ${className}`}>
      {/* Subtle top neon ambient bar */}
      <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-80" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20 gap-4">
          
          {/* Brand Logo & Telemetry Indicator */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => handleTabClick('apod')}
              className="flex items-center gap-3 text-left group focus:outline-none"
            >
              <div className="relative w-10 h-10 md:w-11 md:h-11 rounded-2xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 p-[1.5px] shadow-lg shadow-cyan-500/25 group-hover:shadow-cyan-400/40 transition-shadow">
                <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Rocket className="w-5 h-5 text-cyan-400 group-hover:scale-110 group-hover:-translate-y-0.5 transition-transform" />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-['Orbitron'] font-black text-base md:text-lg tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-cyan-300">
                    NASA
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    EXP
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="hidden sm:inline">LIVE FEED</span>
                  <span className="sm:hidden">LIVE</span>
                </div>
              </div>
            </button>
          </div>

          {/* Desktop Navigation with Framer Motion Active Indicator layoutId */}
          <nav className="hidden lg:flex items-center p-1.5 bg-slate-900/70 border border-slate-800/80 rounded-2xl backdrop-blur-md relative shadow-inner">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const label = item.labels[currentLang] || item.labels.en;

              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item.id)}
                  className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold font-['Orbitron'] tracking-wide transition-colors duration-200 z-10 ${
                    isActive
                      ? 'text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                  }`}
                >
                  {/* Framer Motion Active Gliding Pill with Spring Physics */}
                  {isActive && (
                    <motion.div
                      layoutId="active-nav-pill"
                      className="absolute inset-0 bg-gradient-to-r from-cyan-600 via-blue-600 to-cyan-500 rounded-xl shadow-lg shadow-cyan-500/30 border border-cyan-400/40"
                      transition={SPRING_TRANSITION}
                      style={{ zIndex: -1 }}
                    />
                  )}

                  <Icon className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isActive ? 'text-white scale-110' : 'text-cyan-400 group-hover:scale-105'
                  }`} />

                  <span>{label}</span>

                  {/* AI Badge */}
                  {item.badge && (
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-md uppercase tracking-wider ${
                      isActive 
                        ? 'bg-black/40 text-cyan-200 border border-cyan-300/40' 
                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    }`}>
                      {item.badge}
                    </span>
                  )}

                  {/* Saved Counter Badge */}
                  {item.id === 'saved' && totalCount > 0 && (
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                      isActive 
                        ? 'bg-pink-500 text-white shadow-sm' 
                        : 'bg-pink-500/20 text-pink-300 border border-pink-500/40'
                    }`}>
                      {totalCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Action Tools: Language Switcher & Export */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Trilingual Language Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 text-xs font-semibold text-slate-200 transition shadow-sm hover:border-cyan-500/40"
                aria-label="Change Language"
                aria-expanded={langDropdownOpen}
              >
                <span className="text-sm">{currentLangObj.flag}</span>
                <span className="font-mono text-xs hidden sm:inline">{currentLangObj.nativeName}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${langDropdownOpen ? 'rotate-180 text-cyan-400' : ''}`} />
              </button>

              <AnimatePresence>
                {langDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-48 rounded-2xl bg-slate-900/95 border border-cyan-500/30 shadow-2xl backdrop-blur-2xl p-1.5 z-50"
                  >
                    <div className="px-2.5 py-1.5 text-[10px] font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      Select Language / භාෂාව
                    </div>
                    {LANGUAGES.map((l) => {
                      const isSelected = l.code === currentLang;
                      return (
                        <button
                          key={l.code}
                          onClick={() => handleLanguageChange(l.code)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                            isSelected
                              ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                              : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-base">{l.flag}</span>
                            <div className="text-left">
                              <div className="font-semibold">{l.nativeName}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{l.label}</div>
                            </div>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Export HTML / Share Report Button */}
            {onOpenExportModal && (
              <button
                onClick={onOpenExportModal}
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/30 transition hover:scale-105 active:scale-95"
                title="Export HTML / Report"
              >
                <FileCode className="w-3.5 h-3.5" />
                <span className="font-['Orbitron'] text-[11px] tracking-wider">EXPORT</span>
              </button>
            )}

            {/* Mobile Hamburger Menu Toggle */}
            <div className="lg:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-cyan-500/50 transition"
                aria-label="Toggle Menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5 text-cyan-400" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu with Smooth Spring Slide-down */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={SPRING_TRANSITION}
            className="lg:hidden border-t border-slate-800 bg-slate-950/95 backdrop-blur-2xl px-4 py-4 space-y-3 overflow-hidden shadow-2xl"
          >
            {/* Navigation Tabs List */}
            <div className="grid grid-cols-1 gap-1.5">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const label = item.labels[currentLang] || item.labels.en;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleTabClick(item.id)}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl text-xs font-semibold transition ${
                      isActive
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-600/30 border border-cyan-400/50'
                        : 'bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-cyan-400'}`} />
                      <span className="font-['Orbitron'] tracking-wide">{label}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.badge && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-cyan-300 border border-cyan-400/30">
                          {item.badge}
                        </span>
                      )}
                      {item.id === 'saved' && totalCount > 0 && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-pink-500 text-white font-bold">
                          {totalCount}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Mobile Export & Languages */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
              {onOpenExportModal && (
                <button
                  onClick={() => {
                    onOpenExportModal();
                    setMobileMenuOpen(false);
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-cyan-600/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-600/30 text-xs font-semibold flex items-center justify-center gap-2"
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>Export HTML Report</span>
                </button>
              )}

              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => handleLanguageChange(l.code)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-mono transition ${
                      l.code === currentLang
                        ? 'bg-cyan-600 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {l.flag} {l.code.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
