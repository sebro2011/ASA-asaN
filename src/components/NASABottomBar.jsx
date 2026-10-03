'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Compass, Newspaper, Orbit, Rocket, Bot, BrainCircuit, Globe2, Heart } from 'lucide-react';

/**
 * Navigation Tabs with Trilingual Labels
 */
const TABS = [
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
      ta: 'பணிகள்'
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
 * Custom Elastic Spring Physics Configurations
 */
const TAP_SPRING_TRANSITION = {
  type: 'spring',
  stiffness: 600,
  damping: 15
};

const ACTIVE_ICON_SPRING_TRANSITION = {
  type: 'spring',
  stiffness: 400,
  damping: 18,
  mass: 0.8
};

const PILL_SPRING_TRANSITION = {
  type: 'spring',
  stiffness: 450,
  damping: 28,
  mass: 0.7
};

/**
 * Highly Performant, Responsive Trilingual Navigation Bar Component
 * Featuring Elastic Spring Physics, Active Overshoot Bounce, and Cosmic Glassmorphism
 * 
 * @param {Object} props
 * @param {string} [props.activeTab='apod']
 * @param {(tabId: string) => void} [props.onTabChange]
 * @param {string} [props.className='']
 */
export default function NASABottomBar({
  activeTab = 'apod',
  onTabChange = () => {},
  className = ''
}) {
  const { i18n } = useTranslation();
  const currentLang = (i18n.language || 'en').slice(0, 2);

  const handleTabClick = (tabId) => {
    // Optional light haptic feedback on mobile touch
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(10);
      } catch {
        // Safe ignore
      }
    }
    onTabChange(tabId);
  };

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 md:hidden pointer-events-auto ${className}`}>
      {/* Cosmic Glassmorphism Container */}
      <nav className="bg-slate-950/90 backdrop-blur-xl border-t border-slate-800/80 px-3 pt-2 pb-safe shadow-[0_-12px_32px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-around max-w-md mx-auto relative">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const label = tab.labels[currentLang] || tab.labels.en;

            return (
              <motion.button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id)}
                whileTap={{ scale: 0.78 }}
                transition={TAP_SPRING_TRANSITION}
                className="flex-1 flex flex-col items-center justify-center py-1.5 px-1 select-none focus:outline-none relative group touch-manipulation cursor-pointer z-10"
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
              >
                {/* Active Capsule Glass Highlight Pill */}
                {isActive && (
                  <motion.div
                    layoutId="nasa-bottom-active-pill"
                    className="absolute inset-0 bg-gradient-to-b from-indigo-500/20 via-indigo-600/10 to-transparent rounded-2xl border border-indigo-500/30 shadow-[0_0_16px_rgba(99,102,241,0.2)]"
                    transition={PILL_SPRING_TRANSITION}
                    style={{ zIndex: -1 }}
                  />
                )}

                {/* Active Glow Accent Indicator */}
                <div className="h-1 w-full flex items-center justify-center mb-0.5">
                  {isActive && (
                    <motion.div
                      layoutId="nasa-bottom-indicator-dot"
                      className="w-4 h-1 bg-gradient-to-r from-indigo-400 to-cyan-400 rounded-full shadow-[0_0_8px_rgba(129,140,248,0.9)]"
                      transition={PILL_SPRING_TRANSITION}
                    />
                  )}
                </div>

                {/* Elastic Spring Icon Container with Overshoot Bounce */}
                <div className="relative flex items-center justify-center p-1">
                  <motion.div
                    animate={{ 
                      scale: isActive ? 1.2 : 1,
                      y: isActive ? -1 : 0
                    }}
                    transition={ACTIVE_ICON_SPRING_TRANSITION}
                  >
                    <Icon
                      className={`w-5 h-5 transition-all duration-200 ${
                        isActive
                          ? 'text-indigo-400 drop-shadow-[0_0_12px_rgba(129,140,248,0.85)]'
                          : 'text-slate-400 group-hover:text-slate-200'
                      }`}
                    />
                  </motion.div>
                </div>

                {/* Trilingual Animated Label */}
                <motion.span
                  animate={{
                    y: isActive ? -1 : 0,
                    scale: isActive ? 1.05 : 1
                  }}
                  transition={PILL_SPRING_TRANSITION}
                  className={`text-[11px] tracking-tight mt-0.5 transition-colors duration-200 font-sans truncate max-w-[64px] text-center ${
                    isActive
                      ? 'text-indigo-200 font-bold drop-shadow-[0_0_6px_rgba(129,140,248,0.5)]'
                      : 'text-slate-400 group-hover:text-slate-300 font-medium'
                  }`}
                >
                  {label}
                </motion.span>
              </motion.button>
            );
          })}
        </div>

        {/* iOS Home Indicator Bar Pill */}
        <div className="w-28 h-1 bg-slate-800/80 rounded-full mx-auto mt-2 mb-1" />
      </nav>
    </div>
  );
}
