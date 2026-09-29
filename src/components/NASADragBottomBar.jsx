'use client';

import React, { useRef, useState, useEffect } from 'react';
import { motion, useMotionValue, useSpring, animate } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Image, Newspaper, Box, Bot } from 'lucide-react';

/**
 * 4 Navigation Tabs with Trilingual Labels
 */
const TABS = [
  {
    id: 'apod',
    icon: Image,
    labels: {
      en: 'APOD',
      si: 'ඡායාරූප',
      ta: 'படம்'
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
    id: '3d',
    icon: Box,
    labels: {
      en: '3D Lab',
      si: '3D අභ්‍යවකාශය',
      ta: '3D ஆய்வகம்'
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
 * Spring physics configuration for snappy gesture release
 */
const SNAP_SPRING_CONFIG = {
  type: 'spring',
  stiffness: 450,
  damping: 25,
  mass: 0.8
};

/**
 * Draggable Gesture-Based Bottom Navigation Bar Component
 * Supports both Tap-to-Select and Drag-to-Select gestures with Framer Motion spring physics.
 * 
 * @param {Object} props
 * @param {string} [props.activeTab='apod']
 * @param {(tabId: string) => void} [props.onTabChange]
 * @param {string} [props.className='']
 */
export default function NASADragBottomBar({
  activeTab = 'apod',
  onTabChange = () => {},
  className = ''
}) {
  const { i18n } = useTranslation();
  const currentLang = (i18n.language || 'en').slice(0, 2);

  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const activeIndex = Math.max(0, TABS.findIndex((t) => t.id === activeTab));
  const tabCount = TABS.length;

  const tabWidth = containerWidth > 0 ? containerWidth / tabCount : 0;
  const pillX = useMotionValue(0);

  // Measure container dimensions on mount and resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        setContainerWidth(width);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Sync active pill position when activeTab prop changes externally
  useEffect(() => {
    if (tabWidth > 0 && !isDragging) {
      animate(pillX, activeIndex * tabWidth, SNAP_SPRING_CONFIG);
    }
  }, [activeIndex, tabWidth, isDragging, pillX]);

  // Handle Drag End Gesture: Calculate nearest tab and snap with spring physics
  const handleDragEnd = (event, info) => {
    setIsDragging(false);
    if (!containerRef.current || tabWidth === 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const dropClientX = info.point.x;
    const relativeX = dropClientX - rect.left;

    // Calculate closest tab index based on release coordinate
    const targetIndex = Math.min(
      tabCount - 1,
      Math.max(0, Math.floor(relativeX / tabWidth))
    );

    const targetTab = TABS[targetIndex];
    if (targetTab) {
      onTabChange(targetTab.id);
      animate(pillX, targetIndex * tabWidth, SNAP_SPRING_CONFIG);

      // Light haptic feedback if supported on mobile
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(12);
        } catch {}
      }
    }
  };

  // Direct Tap-to-Select handler
  const handleTabClick = (tabId, index) => {
    onTabChange(tabId);
    if (tabWidth > 0) {
      animate(pillX, index * tabWidth, SNAP_SPRING_CONFIG);
    }
  };

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 md:hidden pointer-events-auto select-none ${className}`}>
      {/* Outer Cosmic Glassmorphic Container */}
      <nav className="bg-slate-900/80 backdrop-blur-2xl border-t border-slate-800/80 px-3 pt-2 pb-safe shadow-[0_-12px_32px_rgba(0,0,0,0.85)]">
        
        {/* Subtle Top Drag Indicator Pill */}
        <div className="flex items-center justify-center gap-1 mb-1.5 opacity-60">
          <div className="w-8 h-1 bg-gradient-to-r from-indigo-500/60 via-purple-500/60 to-cyan-500/60 rounded-full" />
        </div>

        {/* Tab Strip Wrapper */}
        <div
          ref={containerRef}
          className="relative flex items-center justify-between max-w-md mx-auto h-14"
        >
          {/* Draggable Active Floating Pill */}
          {tabWidth > 0 && (
            <motion.div
              drag="x"
              dragConstraints={containerRef}
              dragElastic={0.15}
              dragMomentum={false}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={handleDragEnd}
              style={{
                x: pillX,
                width: tabWidth
              }}
              whileTap={{ scale: 0.94 }}
              className="absolute top-0 bottom-0 z-10 p-1 cursor-grab active:cursor-grabbing touch-none"
            >
              <div className="w-full h-full rounded-2xl bg-gradient-to-r from-indigo-600/30 via-purple-600/25 to-indigo-600/30 border border-indigo-400/40 shadow-[0_0_20px_rgba(99,102,241,0.35)] backdrop-blur-md flex flex-col items-center justify-between py-1">
                {/* Micro Drag Handle Grip Bar */}
                <div className="w-5 h-0.5 bg-indigo-300/60 rounded-full" />
                {/* Bottom Neon Accent Line */}
                <div className="w-4 h-0.5 bg-gradient-to-r from-cyan-400 to-indigo-400 rounded-full shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
              </div>
            </motion.div>
          )}

          {/* Navigation Item Buttons (Tap Targets) */}
          {TABS.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = activeIndex === index;
            const label = tab.labels[currentLang] || tab.labels.en;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id, index)}
                className="flex-1 flex flex-col items-center justify-center h-full relative z-20 focus:outline-none touch-manipulation cursor-pointer group"
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
              >
                {/* Icon with Dynamic Spring Scale on Active State */}
                <motion.div
                  animate={{
                    scale: isActive ? 1.18 : 1,
                    y: isActive ? -1 : 0
                  }}
                  transition={SNAP_SPRING_CONFIG}
                  className="relative flex items-center justify-center"
                >
                  <Icon
                    className={`w-5 h-5 transition-all duration-200 ${
                      isActive
                        ? 'text-indigo-300 drop-shadow-[0_0_12px_rgba(129,140,248,0.9)]'
                        : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  />
                </motion.div>

                {/* Trilingual Tab Label */}
                <motion.span
                  animate={{
                    y: isActive ? -1 : 0,
                    scale: isActive ? 1.05 : 1
                  }}
                  transition={SNAP_SPRING_CONFIG}
                  className={`text-[11px] font-sans tracking-tight mt-0.5 truncate max-w-[68px] text-center transition-colors duration-200 ${
                    isActive
                      ? 'text-indigo-200 font-bold drop-shadow-[0_0_6px_rgba(129,140,248,0.6)]'
                      : 'text-slate-400 group-hover:text-slate-300 font-medium'
                  }`}
                >
                  {label}
                </motion.span>
              </button>
            );
          })}
        </div>

        {/* iOS Home Indicator Bar */}
        <div className="w-28 h-1 bg-slate-800/80 rounded-full mx-auto mt-2 mb-1" />
      </nav>
    </div>
  );
}
