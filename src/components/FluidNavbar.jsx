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
  Bot
} from 'lucide-react';
import { useFavorites } from '../utils/favorites';

/**
 * Trilingual navigation item definitions
 */
const NAV_ITEMS = [
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
      en: 'NASA News Feed',
      si: 'නාසා සජීවී පුවත්',
      ta: 'நாசா நேரலைச் செய்திகள்'
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

const LANGUAGES = [
  { code: 'en', label: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'si', label: 'Sinhala', nativeName: 'සිංහල', flag: '🇱🇰' },
  { code: 'ta', label: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' },
];

/**
 * @param {{
 *   activeTab?: string,
 *   onTabChange?: (tab: any) => void,
 *   onOpenExportModal?: () => void
 * }} props
 */
export default function FluidNavbar({
  activeTab = 'apod',
  onTabChange = (_tab) => {},
  onOpenExportModal = () => {}
}) {
  const { i18n } = useTranslation();
  const currentLang = (i18n.language || 'en').slice(0, 2);
  const { totalCount } = useFavorites();

  const [hoveredTab, setHoveredTab] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageChange = (code) => {
    i18n.changeLanguage(code);
    document.documentElement.lang = code;
    setDropdownOpen(false);
  };

  const activeLangObj = LANGUAGES.find(l => l.code === currentLang) || LANGUAGES[0];

  return (
    <header className="sticky top-0 z-40 w-full bg-[#0B0F19]/85 backdrop-blur-2xl border-b border-cyan-500/20 shadow-2xl shadow-cyan-950/40 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-4">
          
          {/* Brand Logo & Telemetry Indicator */}
          <div 
            onClick={() => onTabChange('apod')}
            className="flex items-center gap-3.5 cursor-pointer group select-none"
          >
            <div className="relative w-11 h-11 rounded-full bg-gradient-to-br from-blue-700 via-blue-900 to-slate-950 p-0.5 border border-cyan-400/40 shadow-lg shadow-cyan-500/25 flex items-center justify-center overflow-hidden transition-transform duration-300 group-hover:scale-105">
              <div className="absolute inset-0 bg-cyan-400/10 rounded-full animate-ping opacity-25" />
              <span className="font-['Orbitron'] font-black text-xs text-rose-500 tracking-wider">
                NASA
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-['Orbitron'] font-bold text-base md:text-lg tracking-tight text-white group-hover:text-cyan-200 transition-colors">
                  {currentLang === 'si' ? 'නාසා විශ්ව ගවේෂකය' : currentLang === 'ta' ? 'நாசா விண்வெளி ஆய்வு' : 'NASA Space Explorer'}
                </span>
                <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  <Radio className="w-2.5 h-2.5 text-cyan-400 animate-pulse" />
                  DSN LIVE
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium tracking-wide">
                {currentLang === 'si' ? 'තුන්භාෂා අභ්‍යවකාශ ද්වාරය' : currentLang === 'ta' ? 'முமொழி விண்வெளி தளம்' : 'Trilingual Cosmic Portal'}
              </p>
            </div>
          </div>

          {/* Desktop Fluid Navigation Menu with Framer Motion layoutId */}
          <nav 
            className="hidden md:flex items-center p-1.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-inner backdrop-blur-md relative"
            onMouseLeave={() => setHoveredTab(null)}
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              const isHovered = hoveredTab === item.id;
              const Icon = item.icon;
              const label = item.labels[currentLang] || item.labels.en;

              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  onMouseEnter={() => setHoveredTab(item.id)}
                  className={`relative px-4 py-2 rounded-xl text-xs font-semibold transition-colors duration-200 flex items-center gap-2 select-none z-10 ${
                    isActive 
                      ? 'text-cyan-200 font-bold' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {/* Fluid Spring Background Indicator (Active Tab) */}
                  {isActive && (
                    <motion.div
                      layoutId="fluid-active-pill"
                      className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-600/90 via-sky-600/90 to-blue-600/90 shadow-lg shadow-cyan-500/30 border border-cyan-400/50"
                      transition={{
                        type: 'spring',
                        stiffness: 380,
                        damping: 30
                      }}
                    />
                  )}

                  {/* Subtle Hover Glow Highlight */}
                  {isHovered && !isActive && (
                    <motion.div
                      layoutId="fluid-hover-pill"
                      className="absolute inset-0 rounded-xl bg-slate-800/60 border border-slate-700/50"
                      transition={{
                        type: 'spring',
                        stiffness: 450,
                        damping: 35
                      }}
                    />
                  )}

                  <Icon className={`relative z-10 w-4 h-4 transition-transform duration-200 ${isActive ? 'scale-110 text-white' : 'text-cyan-400/80'}`} />
                  <span className="relative z-10 tracking-wide drop-shadow-sm">{label}</span>
                  {item.id === 'saved' && totalCount > 0 && (
                    <span className="relative z-10 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-pink-500 text-white shadow-sm">
                      {totalCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Action Bar: Language Switcher Dropdown & Single HTML Export */}
          <div className="flex items-center gap-3">
            {/* Language Switcher Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/90 border border-cyan-500/30 text-white hover:border-cyan-400 text-xs font-semibold shadow-md transition-all duration-200 hover:shadow-cyan-500/20"
                aria-expanded={dropdownOpen}
                aria-haspopup="true"
              >
                <span className="text-base leading-none">{activeLangObj.flag}</span>
                <span className="font-medium tracking-wide">{activeLangObj.nativeName}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-cyan-400 transition-transform duration-300 ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Card with AnimatePresence */}
              <AnimatePresence>
                {dropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -8 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    className="absolute right-0 mt-2 w-52 rounded-2xl bg-slate-900/95 border border-cyan-500/30 shadow-2xl backdrop-blur-2xl p-1.5 z-50"
                    role="menu"
                  >
                    <div className="px-3 py-2 border-b border-slate-800 text-[10px] font-mono text-cyan-400 uppercase tracking-wider">
                      {currentLang === 'si' ? 'භාෂාව තෝරන්න' : currentLang === 'ta' ? 'மொழியைத் தேர்ந்தெடுக்கவும்' : 'Select Language'}
                    </div>

                    <div className="py-1 space-y-1">
                      {LANGUAGES.map((lang) => {
                        const isSelected = lang.code === currentLang;
                        return (
                          <button
                            key={lang.code}
                            onClick={() => handleLanguageChange(lang.code)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
                              isSelected
                                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md'
                                : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                            }`}
                            role="menuitem"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-lg leading-none">{lang.flag}</span>
                              <div className="text-left">
                                <div className="leading-snug">{lang.nativeName}</div>
                                <div className="text-[10px] opacity-70 font-normal">{lang.label}</div>
                              </div>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-white" />}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Standalone Single HTML Export Shortcut */}
            <button
              onClick={onOpenExportModal}
              className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition shadow-sm"
              title="Single HTML Export"
            >
              <FileCode className="w-3.5 h-3.5 text-amber-400" />
              <span>{currentLang === 'si' ? 'තනි HTML ගොනුව' : currentLang === 'ta' ? 'ஒற்றை HTML' : 'Single HTML'}</span>
            </button>

            {/* Mobile Hamburger Toggle Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition"
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer with Fluid Slide & Fade */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="md:hidden overflow-hidden border-t border-slate-800 py-3 space-y-2"
            >
              <div className="grid grid-cols-2 gap-2">
                {NAV_ITEMS.map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;
                  const label = item.labels[currentLang] || item.labels.en;

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onTabChange(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`p-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 transition ${
                        isActive 
                          ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30' 
                          : 'bg-slate-900/90 text-slate-300 border border-slate-800'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="truncate">{label}</span>
                      {item.id === 'saved' && totalCount > 0 && (
                        <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-pink-500 text-white shadow-sm">
                          {totalCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <button
                  onClick={() => {
                    onOpenExportModal();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full py-2 rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center justify-center gap-2"
                >
                  <FileCode className="w-4 h-4 text-amber-400" />
                  <span>{currentLang === 'si' ? 'තනි HTML ගොනුව බාගන්න' : currentLang === 'ta' ? 'ஒற்றை HTML கோப்பு' : 'Export Single HTML'}</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
