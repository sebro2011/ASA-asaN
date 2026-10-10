'use client';

import React, { useRef, memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Compass,
  Flame,
  Orbit,
  Rocket,
  Newspaper,
  BrainCircuit,
  Globe2,
  Leaf,
  Bot,
  LucideIcon
} from 'lucide-react';

export interface BottomBarTab {
  id: string;
  icon: LucideIcon;
  labels: {
    en: string;
    si: string;
    ta: string;
  };
}

/**
 * 9 Primary Navigation Tabs with Trilingual Labels
 */
export const TABS: BottomBarTab[] = [
  {
    id: 'apod',
    icon: Compass,
    labels: {
      en: 'APOD',
      si: 'ඡායාරූප',
      ta: 'படம்'
    }
  },
  {
    id: 'launch',
    icon: Flame,
    labels: {
      en: 'Launch',
      si: 'දියත්කිරීම',
      ta: 'ஏவுதல்'
    }
  },
  {
    id: '3d',
    icon: Orbit,
    labels: {
      en: '3D Lab',
      si: '3D අභ්‍යවකාශය',
      ta: '3D ஆய்வகம்'
    }
  },
  {
    id: 'missions',
    icon: Rocket,
    labels: {
      en: 'Missions',
      si: 'මෙහෙයුම්',
      ta: 'පණிகள்'
    }
  },
  {
    id: 'news',
    icon: Newspaper,
    labels: {
      en: 'News',
      si: 'පුවත්',
      ta: 'செய்திகள்'
    }
  },
  {
    id: 'quiz',
    icon: BrainCircuit,
    labels: {
      en: 'Quiz',
      si: 'දැනුම',
      ta: 'வினா'
    }
  },
  {
    id: 'iss',
    icon: Globe2,
    labels: {
      en: 'ISS',
      si: 'ISS',
      ta: 'ISS'
    }
  },
  {
    id: 'earth',
    icon: Leaf,
    labels: {
      en: 'Earth',
      si: 'පෘථිවිය',
      ta: 'பூமி'
    }
  },
  {
    id: 'assistant',
    icon: Bot,
    labels: {
      en: 'AI Chat',
      si: 'AI සහකරු',
      ta: 'AI அரட்டை'
    }
  }
];

/**
 * High-precision Spring Physics Configurations
 */
const TAP_SPRING_TRANSITION = {
  type: 'spring' as const,
  stiffness: 600,
  damping: 18,
  mass: 0.5
};

const ACTIVE_ICON_SPRING_TRANSITION = {
  type: 'spring' as const,
  stiffness: 450,
  damping: 20,
  mass: 0.6
};

const PILL_SPRING_TRANSITION = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 32,
  mass: 0.65
};

export interface NASABottomBarProps {
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  className?: string;
}

/**
 * iOS-Style Floating Bottom Navigation Bar for NASA Space Exploration
 * Features:
 * - Centered floating pill with cosmic glassmorphism & deep space backdrop blur
 * - Fluid sliding active background pill layoutId transition
 * - Stacked icons with trilingual labels (English, Sinhala, Tamil)
 * - Horizontal touch swipe navigation directly across the pill bar
 * - Mobile & tablet responsive visibility (hidden on desktop lg+)
 */
function NASABottomBar({
  activeTab = 'apod',
  onTabChange,
  className = ''
}: NASABottomBarProps) {
  const { i18n } = useTranslation();
  const currentLang = ((i18n.language || 'en').slice(0, 2)) as 'en' | 'si' | 'ta';
  const touchStartRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });

  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(10);
      } catch {
        // Safe ignore
      }
    }
  }, []);

  const handleTabClick = useCallback(
    (tabId: string) => {
      if (tabId !== activeTab) {
        triggerHaptic();
        if (onTabChange) {
          onTabChange(tabId);
        }
      }
    },
    [activeTab, onTabChange, triggerHaptic]
  );

  // Touch Swipe Gesture Detection across the Floating Bar
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches && e.touches[0]) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now()
      };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || !e.changedTouches || !e.changedTouches[0]) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - touchStartRef.current.x;
    const deltaY = endY - touchStartRef.current.y;
    const elapsed = Date.now() - touchStartRef.current.time;

    // Detect deliberate horizontal swipe
    if (elapsed < 500 && Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      const currentIndex = TABS.findIndex((t) => t.id === activeTab);
      if (currentIndex !== -1) {
        if (deltaX < -35 && currentIndex < TABS.length - 1) {
          // Swipe left -> advance to next tab
          handleTabClick(TABS[currentIndex + 1].id);
        } else if (deltaX > 35 && currentIndex > 0) {
          // Swipe right -> return to previous tab
          handleTabClick(TABS[currentIndex - 1].id);
        }
      }
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[#010409]/85 backdrop-blur-2xl border border-white/10 rounded-full px-2.5 sm:px-3 py-1.5 sm:py-2 shadow-2xl lg:hidden pointer-events-auto max-w-[calc(100vw-1.25rem)] sm:max-w-xl w-auto ${className}`}
      role="navigation"
      aria-label="NASA Navigation Bar"
      style={{
        boxShadow:
          '0 20px 45px -10px rgba(0, 0, 0, 0.9), 0 0 25px rgba(6, 182, 212, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
      }}
    >
      <div className="flex items-center justify-between gap-0.5 sm:gap-1 overflow-x-auto no-scrollbar relative">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const label = tab.labels[currentLang] || tab.labels.en;

          return (
            <motion.button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab.id)}
              whileTap={{ scale: 0.88 }}
              transition={TAP_SPRING_TRANSITION}
              className="relative flex-1 min-w-[38px] sm:min-w-[46px] flex flex-col items-center justify-center py-1 px-1 sm:px-1.5 rounded-full select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 group touch-manipulation cursor-pointer z-10"
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Fluid Animated Background Indicator Pill */}
              {isActive && (
                <motion.div
                  layoutId="nasa-floating-active-pill"
                  className="absolute inset-0 bg-gradient-to-r from-cyan-500/25 via-blue-500/20 to-indigo-500/25 rounded-full border border-cyan-400/40 shadow-[0_0_16px_rgba(6,182,212,0.35)]"
                  transition={PILL_SPRING_TRANSITION}
                  style={{ zIndex: -1 }}
                />
              )}

              {/* Active Accent Micro Indicator Dot */}
              <div className="h-1 w-full flex items-center justify-center mb-0.5 pointer-events-none">
                {isActive ? (
                  <motion.div
                    layoutId="nasa-floating-indicator-dot"
                    className="w-1.5 h-1 bg-gradient-to-r from-cyan-400 to-indigo-400 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.9)]"
                    transition={PILL_SPRING_TRANSITION}
                  />
                ) : (
                  <div className="w-1.5 h-1 opacity-0" />
                )}
              </div>

              {/* Elastic Icon Container */}
              <div className="relative flex items-center justify-center">
                <motion.div
                  animate={{
                    scale: isActive ? 1.15 : 1,
                    y: isActive ? -1 : 0
                  }}
                  transition={ACTIVE_ICON_SPRING_TRANSITION}
                >
                  <Icon
                    className={`w-4 h-4 sm:w-4.5 sm:h-4.5 transition-colors duration-200 ${
                      isActive
                        ? 'text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.9)]'
                        : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  />
                </motion.div>
              </div>

              {/* Stacked Trilingual Compact Label */}
              <motion.span
                animate={{
                  y: isActive ? -0.5 : 0,
                  scale: isActive ? 1.05 : 1
                }}
                transition={PILL_SPRING_TRANSITION}
                className={`text-[9px] sm:text-[10px] tracking-tight mt-0.5 transition-colors duration-200 font-sans truncate max-w-[46px] sm:max-w-[54px] text-center leading-none ${
                  isActive
                    ? 'text-cyan-200 font-bold drop-shadow-[0_0_6px_rgba(34,211,238,0.5)]'
                    : 'text-slate-400 group-hover:text-slate-300 font-medium'
                }`}
              >
                {label}
              </motion.span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export default memo(NASABottomBar);
