'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { 
  Compass, 
  Orbit, 
  Rocket, 
  Newspaper,
  Bookmark,
  Bot
} from 'lucide-react';
import { useFavorites } from '../utils/favorites';

/**
 * Trilingual navigation item definitions
 */
const DEFAULT_TABS = [
  {
    id: 'apod',
    icon: Compass,
    labels: {
      en: 'APOD',
      si: 'ඡායාරූපය',
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
    id: 'assistant',
    icon: Bot,
    labels: {
      en: 'AI Bot',
      si: 'AI සහකරු',
      ta: 'AI'
    }
  },
  {
    id: 'saved',
    icon: Bookmark,
    labels: {
      en: 'Saved',
      si: 'සුරැකි',
      ta: 'சேமிப்பு'
    }
  }
];

/**
 * @param {{
 *   activeTab?: string,
 *   onTabChange?: (tabId: string) => void,
 *   tabs?: Array<any>,
 *   className?: string
 * }} props
 */
export default function IOSBottomBar({
  activeTab = 'apod',
  onTabChange = (_tabId) => {},
  tabs = DEFAULT_TABS,
  className = ''
}) {
  const { i18n } = useTranslation();
  const currentLang = (i18n.language || 'en').slice(0, 2);
  const { totalCount } = useFavorites();

  const containerRef = useRef(null);
  const tabButtonRefs = useRef([]);
  const [tabWidths, setTabWidths] = useState([]);
  const [tabPositions, setTabPositions] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  // Active Index
  const activeIndex = useMemo(() => {
    const idx = tabs.findIndex(t => t.id === activeTab);
    return idx >= 0 ? idx : 0;
  }, [tabs, activeTab]);

  // Framer Motion native drag motion value for X transform
  const dragX = useMotionValue(0);

  // Trigger light haptic vibration if supported
  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(10);
      } catch {
        // Safe fallback
      }
    }
  }, []);

  // Measure tab dimensions once on mount or resize without polling
  const measureTabs = useCallback(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const positions = [];
    const widths = [];

    tabButtonRefs.current.forEach((el) => {
      if (el) {
        const rect = el.getBoundingClientRect();
        positions.push(rect.left - containerRect.left);
        widths.push(rect.width);
      }
    });

    if (positions.length > 0) {
      setTabPositions(positions);
      setTabWidths(widths);
    }
  }, []);

  useEffect(() => {
    measureTabs();
    window.addEventListener('resize', measureTabs);
    return () => window.removeEventListener('resize', measureTabs);
  }, [measureTabs]);

  // Synchronize motion value X to active tab position with spring animation
  useEffect(() => {
    if (tabPositions.length > 0 && !isDragging) {
      const targetX = tabPositions[activeIndex] || 0;
      animate(dragX, targetX, {
        type: 'spring',
        stiffness: 400,
        damping: 35
      });
    }
  }, [activeIndex, tabPositions, isDragging, dragX]);

  // Current pill width dynamically matched to current active tab
  const currentPillWidth = tabWidths[activeIndex] || 70;
  const maxDragX = tabPositions[tabPositions.length - 1] || 280;

  // Last throttled index to avoid spamming state updates on every pixel
  const lastReportedIndexRef = useRef(activeIndex);
  lastReportedIndexRef.current = activeIndex;

  // Throttled threshold detection during drag
  const handleDrag = useCallback(
    (_, info) => {
      if (tabPositions.length === 0) return;
      const currentX = dragX.get();

      // Find closest tab index by distance
      let closestIdx = 0;
      let minDistance = Infinity;

      for (let i = 0; i < tabPositions.length; i++) {
        const dist = Math.abs(currentX - tabPositions[i]);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = i;
        }
      }

      if (closestIdx !== lastReportedIndexRef.current && tabs[closestIdx]) {
        lastReportedIndexRef.current = closestIdx;
        triggerHaptic();
        onTabChange(tabs[closestIdx].id);
      }
    },
    [tabPositions, dragX, tabs, onTabChange, triggerHaptic]
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    if (tabPositions.length === 0) return;

    const currentX = dragX.get();
    let closestIdx = 0;
    let minDistance = Infinity;

    for (let i = 0; i < tabPositions.length; i++) {
      const dist = Math.abs(currentX - tabPositions[i]);
      if (dist < minDistance) {
        minDistance = dist;
        closestIdx = i;
      }
    }

    const targetTab = tabs[closestIdx];
    if (targetTab) {
      onTabChange(targetTab.id);
    }

    // Snap cleanly to target position
    const targetX = tabPositions[closestIdx] || 0;
    animate(dragX, targetX, {
      type: 'spring',
      stiffness: 400,
      damping: 35
    });
  }, [tabPositions, dragX, tabs, onTabChange]);

  return (
    <div
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 select-none ${className}`}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
    >
      {/* Outer ambient glow reacting to drag */}
      <div 
        className={`absolute inset-0 rounded-full transition-opacity duration-300 pointer-events-none -z-10 blur-xl ${
          isDragging 
            ? 'bg-gradient-to-r from-cyan-500/40 via-sky-500/40 to-blue-500/40 opacity-90 scale-105' 
            : 'bg-cyan-500/20 opacity-60'
        }`} 
      />

      {/* Floating Glassmorphic Container with hardware acceleration */}
      <nav
        ref={containerRef}
        className={`relative flex items-center p-1.5 sm:p-2 rounded-full bg-[#0B0F19]/90 backdrop-blur-2xl border border-cyan-500/30 shadow-2xl shadow-cyan-950/80 transition-shadow duration-200 ${
          isDragging ? 'ring-2 ring-cyan-400/40' : 'hover:border-cyan-400/50'
        }`}
      >
        {/* Hardware-accelerated sliding indicator pill with Framer Motion native drag */}
        {tabPositions.length > 0 && (
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: maxDragX }}
            dragElastic={0.1}
            dragTransition={{ bounceStiffness: 400, bounceDamping: 35 }}
            onDragStart={() => setIsDragging(true)}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            style={{
              x: dragX,
              width: currentPillWidth
            }}
            className="absolute top-1.5 sm:top-2 bottom-1.5 sm:bottom-2 rounded-full bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-600 border border-cyan-300/40 shadow-lg shadow-cyan-500/40 cursor-grab active:cursor-grabbing transform-gpu will-change-transform z-0"
          />
        )}

        {/* Tab Items List */}
        <div className="flex items-center gap-1 sm:gap-1.5 relative z-10">
          {tabs.map((tab, idx) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            const label = tab.labels?.[currentLang] || tab.labels?.en || tab.id;

            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabButtonRefs.current[idx] = el;
                }}
                type="button"
                onClick={() => {
                  triggerHaptic();
                  onTabChange(tab.id);
                }}
                className={`relative flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-full text-xs font-semibold transition-colors duration-200 ${
                  isActive 
                    ? 'text-white font-bold' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <motion.div
                  animate={{
                    scale: isActive ? 1.12 : 1
                  }}
                  transition={{ duration: 0.2 }}
                >
                  <Icon className={`w-4 h-4 sm:w-4.5 sm:h-4.5 transition-colors ${
                    isActive ? 'text-white' : 'text-cyan-400/80'
                  }`} />
                </motion.div>

                <span className={`tracking-wide text-[11px] sm:text-xs transition-opacity duration-200 ${
                  isActive ? 'opacity-100 font-bold' : 'opacity-85 font-medium'
                }`}>
                  {label}
                </span>

                {/* Badge for Saved Tab */}
                {tab.id === 'saved' && totalCount > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold shadow-sm ${
                    isActive ? 'bg-white text-cyan-900' : 'bg-pink-500 text-white'
                  }`}>
                    {totalCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
