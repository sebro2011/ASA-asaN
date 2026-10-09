'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface AtmosphericEntryTransitionProps {
  children: React.ReactNode;
  tabKey: string;
  className?: string;
}

// Fixed pseudo-random spark particles for deterministic render
const ENTRY_SPARKS = Array.from({ length: 18 }).map((_, i) => ({
  id: i,
  left: `${(i * 5.8 + 2) % 96}%`,
  delay: (i * 0.04) % 0.4,
  duration: 0.5 + ((i * 0.07) % 0.4),
  height: 20 + (i % 5) * 12,
  size: (i % 3 === 0) ? 'w-1' : 'w-0.5',
  color: (i % 2 === 0) ? 'bg-amber-400' : (i % 3 === 0 ? 'bg-orange-500' : 'bg-cyan-300')
}));

export const AtmosphericEntryTransition: React.FC<AtmosphericEntryTransitionProps> = ({
  children,
  tabKey,
  className = ''
}) => {
  const [showPlasmaEffects, setShowPlasmaEffects] = useState<boolean>(true);

  useEffect(() => {
    setShowPlasmaEffects(true);
    const timer = setTimeout(() => {
      setShowPlasmaEffects(false);
    }, 700);
    return () => clearTimeout(timer);
  }, [tabKey]);

  return (
    <motion.div
      key={tabKey}
      initial={{ 
        opacity: 0, 
        y: 16
      }}
      animate={{ 
        opacity: 1, 
        y: 0
      }}
      exit={{ 
        opacity: 0, 
        y: -12
      }}
      transition={{ 
        duration: 0.22,
        ease: 'easeOut'
      }}
      className={`relative w-full overflow-visible ${className}`}
    >
      {/* Hypersonic Re-Entry Plasma & Spark Effects Overlay */}
      {showPlasmaEffects && (
        <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden rounded-3xl">
          {/* Heat Shield Bow Shock Wave (Upper Plasma Compression Layer) */}
          <motion.div
            initial={{ opacity: 0.9, scaleX: 0.7, y: -20 }}
            animate={{ opacity: 0, scaleX: 1.3, y: 40 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
            className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-orange-500/30 via-amber-400/20 to-transparent blur-md"
          />

          {/* Incandescent Leading-Edge Shockwave Line */}
          <motion.div
            initial={{ opacity: 1, width: '30%', left: '35%' }}
            animate={{ opacity: 0, width: '100%', left: '0%' }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="absolute top-0 h-1 bg-gradient-to-r from-transparent via-amber-300 to-transparent shadow-[0_0_20px_rgba(251,191,36,1)]"
          />

          {/* Mach Cone Cyan/Amber Ionized Side Sheaths */}
          <motion.div
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="absolute inset-0 bg-radial-gradient from-transparent via-orange-500/5 to-cyan-500/10 mix-blend-screen"
          />

          {/* Ionized Friction Streak Sparks Burning Through Atmosphere */}
          {ENTRY_SPARKS.map((spark) => (
            <motion.div
              key={spark.id}
              initial={{ y: -60, opacity: 0 }}
              animate={{ y: 260, opacity: [0, 1, 0.8, 0] }}
              transition={{
                duration: spark.duration,
                delay: spark.delay,
                ease: 'easeIn'
              }}
              style={{ left: spark.left, height: `${spark.height}px` }}
              className={`absolute top-0 ${spark.size} ${spark.color} rounded-full shadow-[0_0_8px_currentColor]`}
            />
          ))}

          {/* Atmospheric Entry Telemetry HUD Stamp */}
          <motion.div
            initial={{ opacity: 0.9, y: 0 }}
            animate={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="absolute top-3 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-950/80 border border-orange-500/50 text-orange-300 font-mono text-[10px] font-bold shadow-lg"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-ping" />
            <span>MACH 25 • ENTRY SHEATH ACTIVE</span>
          </motion.div>
        </div>
      )}

      {/* Main Tab Workspace Content */}
      <div className="relative z-10">
        {children}
      </div>
    </motion.div>
  );
};

export default AtmosphericEntryTransition;
