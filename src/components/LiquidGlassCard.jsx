'use client';

import React from 'react';
import { motion } from 'framer-motion';

/**
 * Solid Cosmic Dark Card Component
 * Crisp, high-performance dark theme without liquid glass distortion
 */
export function LiquidGlassCard({
  children,
  className = '',
  edgeHighlight = true,
  hoverable = true,
  brackets = false,
  onClick,
  glow = 'none',
  layout = false,
  padding = 'p-5',
  ...props
}) {
  const glowStyles = {
    none: '',
    cyan: 'shadow-[0_12px_36px_0_rgba(6,182,212,0.15)] hover:shadow-[0_20px_54px_0_rgba(6,182,212,0.25)]',
    purple: 'shadow-[0_12px_36px_0_rgba(217,70,239,0.15)] hover:shadow-[0_20px_54px_0_rgba(217,70,239,0.25)]',
    amber: 'shadow-[0_12px_36px_0_rgba(245,158,11,0.15)] hover:shadow-[0_20px_54px_0_rgba(245,158,11,0.25)]',
    rose: 'shadow-[0_12px_36px_0_rgba(244,63,94,0.15)] hover:shadow-[0_20px_54px_0_rgba(244,63,94,0.25)]',
    emerald: 'shadow-[0_12px_36px_0_rgba(16,185,129,0.15)] hover:shadow-[0_20px_54px_0_rgba(16,185,129,0.25)]'
  };

  const containerClasses = `
    bg-slate-950/80
    backdrop-blur-xl
    border border-slate-800/80
    rounded-2xl
    shadow-2xl
    relative
    overflow-hidden
    ${hoverable ? 'transition-all duration-300 hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)]' : ''}
    ${brackets ? 'hud-brackets' : ''}
    ${glowStyles[glow] || ''}
    ${onClick ? 'cursor-pointer' : ''}
    ${className}
  `.replace(/\s+/g, ' ').trim();

  return (
    <motion.div
      className={containerClasses}
      onClick={onClick}
      layout={layout}
      {...props}
    >
      <div className={`w-full h-full ${padding}`}>
        {children}
      </div>
    </motion.div>
  );
}

export default LiquidGlassCard;
