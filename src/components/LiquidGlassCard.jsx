'use client';

import React from 'react';
import { motion } from 'framer-motion';

/**
 * LiquidGlassCard Component
 * Two-Layer Architecture:
 * 1. Absolute Background Layer: Holds backdrop-blur, translucency, specular border, and SVG displacement.
 * 2. Relative Foreground Layer: Holds all text, icons, and controls with ZERO filter distortion.
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
  padding = 'p-6',
  ...props
}) {
  const glowStyles = {
    none: '',
    cyan: 'shadow-[0_12px_36px_0_rgba(6,182,212,0.22)] hover:shadow-[0_20px_54px_0_rgba(6,182,212,0.38)]',
    purple: 'shadow-[0_12px_36px_0_rgba(217,70,239,0.22)] hover:shadow-[0_20px_54px_0_rgba(217,70,239,0.38)]',
    amber: 'shadow-[0_12px_36px_0_rgba(245,158,11,0.22)] hover:shadow-[0_20px_54px_0_rgba(245,158,11,0.38)]',
    rose: 'shadow-[0_12px_36px_0_rgba(244,63,94,0.22)] hover:shadow-[0_20px_54px_0_rgba(244,63,94,0.38)]',
    emerald: 'shadow-[0_12px_36px_0_rgba(16,185,129,0.22)] hover:shadow-[0_20px_54px_0_rgba(16,185,129,0.38)]'
  };

  const containerClasses = `
    relative
    overflow-hidden
    rounded-3xl
    ${hoverable ? 'transition-all duration-300 hover:-translate-y-0.5' : ''}
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
      {/* 1. Absolute Background Layer: Backdrop blur, optical refraction, specular gradient */}
      <div 
        className={`absolute inset-0 pointer-events-none rounded-3xl apple-liquid-glass-bg ${edgeHighlight ? 'liquid-glass-edge' : ''}`} 
        aria-hidden="true" 
      />

      {/* 2. Relative Foreground Content Layer: 100% Crisp, Untouched Typography & Icons */}
      <div className={`relative z-10 w-full h-full ${padding}`}>
        {children}
      </div>
    </motion.div>
  );
}

export default LiquidGlassCard;
