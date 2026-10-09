'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Logo from './Logo';
import { useTranslation } from 'react-i18next';
import { useTelemetrySync } from '../hooks/useTelemetrySync';
import { 
  Compass, 
  Orbit, 
  Rocket, 
  Newspaper, 
  Sparkles,
  Menu,
  X,
  FileCode,
  Radio,
  Bookmark,
  Heart,
  Bot,
  Globe2,
  Share2,
  BrainCircuit,
  Target,
  Globe,
  Flame
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
    id: 'asteroids',
    icon: Target,
    badge: 'LIVE',
    labels: {
      en: 'Asteroid Radar',
      si: 'අභ්‍යවකාශ රේඩාර්',
      ta: 'சிறுகෝள் ரேடார்'
    }
  },
  {
    id: 'epic',
    icon: Globe,
    badge: 'L1',
    labels: {
      en: 'EPIC Earth',
      si: 'EPIC පෘථිවිය',
      ta: 'EPIC பூமி'
    }
  },
  {
    id: 'exoplanets',
    icon: Sparkles,
    badge: '3D',
    labels: {
      en: 'Exoplanet Lab',
      si: 'බාහිර ග්‍රහලෝක',
      ta: 'புறக்கோள்கள்'
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
    id: 'launch',
    icon: Flame,
    badge: 'LIVE',
    labels: {
      en: 'Launch Sim',
      si: 'දියත්කිරීම',
      ta: 'ஏவுதல்'
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
    id: 'quiz',
    icon: BrainCircuit,
    badge: 'NEW',
    labels: {
      en: 'Trivia Quiz',
      si: 'දැනුම මිනුම',
      ta: 'வினாடி வினா'
    }
  },
  {
    id: 'iss',
    icon: Globe2,
    badge: 'LIVE',
    labels: {
      en: 'ISS Orbit',
      si: 'ISS කක්ෂය',
      ta: 'ISS நேரலை'
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

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Real-time telemetry sync status and periodic live pulse synced with live data stream
  const { isOnline, isSyncing } = useTelemetrySync();
  const [isTelemetryPulse, setIsTelemetryPulse] = useState(false);

  useEffect(() => {
    // 3.5s communication heartbeat cycle matching live telemetry packet intervals
    const interval = setInterval(() => {
      setIsTelemetryPulse(true);
      const timer = setTimeout(() => {
        setIsTelemetryPulse(false);
      }, 1100);
      return () => clearTimeout(timer);
    }, 3500);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isSyncing) {
      setIsTelemetryPulse(true);
    }
  }, [isSyncing]);

  const handleLanguageChange = (code) => {
    i18n.changeLanguage(code);
    setMobileMenuOpen(false);
  };

  const handleTabClick = (tabId) => {
    onTabChange(tabId);
    setMobileMenuOpen(false);
    if (tabId === 'assistant' && onOpenAssistant) {
      onOpenAssistant();
    }
  };

  return (
    <header className={`sticky top-0 z-50 w-full bg-[#030718]/92 backdrop-blur-2xl border-b border-cyan-500/20 shadow-[0_12px_32px_rgba(0,0,0,0.7)] transition-all ${className}`}>
      {/* Subtle top neon ambient bar */}
      <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-85" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20 gap-4">
          
          {/* Brand Logo & Telemetry Indicator */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => handleTabClick('apod')}
              className="flex items-center gap-3 text-left group focus:outline-none"
            >
              <Logo size="md" />

              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-['Orbitron'] font-black text-base md:text-lg tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-cyan-300">
                    NASA
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    WEB APP
                  </span>
                </div>
                <div 
                  className={`flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full border transition-all duration-700 select-none ${
                    !isOnline
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.25)]'
                      : isSyncing
                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                        : isTelemetryPulse
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)] ring-1 ring-emerald-400/30'
                          : 'bg-slate-900/60 border-slate-800/80 text-slate-400'
                  }`}
                  title={
                    !isOnline 
                      ? 'Offline Telemetry Cached' 
                      : isSyncing 
                        ? 'Syncing Live Telemetry Packets' 
                        : 'Active High-Frequency Telemetry Stream (3.5s interval)'
                  }
                >
                  {/* Status Beacon LED with Live Pulse Ripple */}
                  <span className="relative flex h-2 w-2 items-center justify-center shrink-0">
                    {isOnline && (
                      <span 
                        className={`absolute inline-flex h-full w-full rounded-full transition-opacity duration-500 ${
                          isSyncing 
                            ? 'bg-cyan-400 animate-ping opacity-75' 
                            : isTelemetryPulse 
                              ? 'bg-emerald-400 animate-ping opacity-90' 
                              : 'opacity-0'
                        }`} 
                      />
                    )}
                    <span 
                      className={`relative inline-flex rounded-full h-1.5 w-1.5 transition-all duration-500 ${
                        !isOnline
                          ? 'bg-amber-400 shadow-[0_0_6px_#f59e0b]'
                          : isSyncing
                            ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-pulse'
                            : isTelemetryPulse
                              ? 'bg-emerald-300 shadow-[0_0_10px_#34d399]'
                              : 'bg-emerald-400 shadow-[0_0_4px_#10b981]'
                      }`} 
                    />
                  </span>

                  {/* Telemetry Span with Synchronized Color-Pulsing & Glow Animation */}
                  <span 
                    className={`hidden sm:inline font-semibold tracking-wider transition-all duration-700 ${
                      !isOnline
                        ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]'
                        : isSyncing
                          ? 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.7)] animate-pulse'
                          : isTelemetryPulse
                            ? 'text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)] scale-[1.02]'
                            : 'text-slate-400 group-hover:text-slate-300'
                    }`}
                  >
                    {isSyncing ? 'SYNCING TELEMETRY' : isOnline ? 'LIVE TELEMETRY' : 'OFFLINE CACHED'}
                  </span>

                  <span 
                    className={`sm:hidden font-semibold tracking-wider transition-all duration-700 ${
                      !isOnline
                        ? 'text-amber-400'
                        : isSyncing
                          ? 'text-cyan-300'
                          : isTelemetryPulse
                            ? 'text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                            : 'text-slate-400'
                    }`}
                  >
                    {isSyncing ? 'SYNC' : isOnline ? 'LIVE' : 'OFFLINE'}
                  </span>
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

          {/* Right Action Tools: Mobile Toggle */}
          <div className="flex items-center gap-2 sm:gap-3">
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
