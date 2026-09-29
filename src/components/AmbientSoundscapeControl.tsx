'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Volume2, VolumeX, Volume1, Sparkles } from 'lucide-react';
import { spaceSoundscape } from '../utils/spaceSoundscape';
import { SupportedLanguage } from '../i18n/translations';

interface AmbientSoundscapeControlProps {
  lang: SupportedLanguage;
  className?: string;
}

const LABELS = {
  en: { title: 'Deep Space Soundscape', active: 'Audio Active', inactive: 'Enable Soundscape' },
  si: { title: 'ගැඹුරු අභ්‍යවකාශ ශබ්ද තරංග', active: 'ශබ්දය සක්‍රියයි', inactive: 'ශබ්දය සක්‍රිය කරන්න' },
  ta: { title: 'ஆழ விண்வெளி ஒலி அலைகள்', active: 'ஒலி இயங்குகிறது', inactive: 'ஒலியை இயக்குக' }
};

export const AmbientSoundscapeControl: React.FC<AmbientSoundscapeControlProps> = ({
  lang = 'en',
  className = ''
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [volume, setVolumeState] = useState<number>(0.7);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [showVolTooltip, setShowVolTooltip] = useState<boolean>(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const text = LABELS[lang] || LABELS.en;

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = spaceSoundscape.toggle();
    setIsPlaying(nextState);
  };

  const updateVolumeFromPointer = (e: any) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;

    const dx = clientX - centerX;
    const dy = clientY - centerY;

    // Angle starting from top (-90 deg)
    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    if (angle < 0) angle += 2 * Math.PI;

    const newVol = Math.max(0.02, Math.min(1, angle / (2 * Math.PI)));
    setVolumeState(newVol);
    spaceSoundscape.setVolume(newVol);
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    setShowVolTooltip(true);
    updateVolumeFromPointer(e);
  };

  useEffect(() => {
    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (isDragging) {
        updateVolumeFromPointer(e);
      }
    };

    const handlePointerUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setTimeout(() => setShowVolTooltip(false), 1200);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handlePointerMove);
      window.addEventListener('mouseup', handlePointerUp);
      window.addEventListener('touchmove', handlePointerMove);
      window.addEventListener('touchend', handlePointerUp);
    }

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDragging]);

  // SVG Arc Calculation (Radius = 20, Circumference = 125.66)
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - volume);

  // Knob Position Coordinates
  const knobAngle = volume * 2 * Math.PI - Math.PI / 2;
  const knobX = 26 + radius * Math.cos(knobAngle);
  const knobY = 26 + radius * Math.sin(knobAngle);

  return (
    <div className={`relative flex items-center gap-3 px-3.5 py-2 rounded-2xl transition-all duration-300 border select-none ${
      isPlaying
        ? 'bg-gradient-to-r from-cyan-950/80 via-blue-950/80 to-purple-950/80 border-cyan-400/60 shadow-[0_0_20px_rgba(6,182,212,0.3)] text-cyan-200'
        : 'bg-slate-950/80 hover:bg-slate-900/90 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white'
    } ${className}`}>
      
      {/* Circular Volume Slider Container */}
      <div 
        className="relative w-13 h-13 flex items-center justify-center cursor-pointer group"
        onMouseEnter={() => setShowVolTooltip(true)}
        onMouseLeave={() => !isDragging && setShowVolTooltip(false)}
      >
        {/* SVG Circular Volume Arc Slider */}
        <svg
          ref={svgRef}
          viewBox="0 0 52 52"
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
          className="w-12 h-12 transform -rotate-90 cursor-pointer touch-none"
        >
          <defs>
            <linearGradient id="vol-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="50%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>

          {/* Background Ring */}
          <circle
            cx="26"
            cy="26"
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth="3.5"
          />

          {/* Active Volume Arc Ring */}
          <circle
            cx="26"
            cy="26"
            r={radius}
            fill="none"
            stroke={isPlaying ? 'url(#vol-gradient)' : 'rgba(148, 163, 184, 0.4)'}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-150"
          />

          {/* Interactive Knob Handle */}
          <circle
            cx={knobX}
            cy={knobY}
            r="4"
            fill={isPlaying ? '#22d3ee' : '#94a3b8'}
            stroke="#090d16"
            strokeWidth="2"
            className="shadow-md transition-transform duration-75 group-hover:scale-125"
          />
        </svg>

        {/* Center Toggle Button */}
        <button
          type="button"
          onClick={handleTogglePlay}
          className={`absolute inset-2 rounded-full flex items-center justify-center transition-all ${
            isPlaying
              ? 'bg-cyan-500/20 text-cyan-300 shadow-inner hover:scale-105'
              : 'bg-slate-900 text-slate-400 hover:text-cyan-300 hover:bg-slate-800'
          }`}
          title={isPlaying ? 'Pause Soundscape' : 'Play Deep Space Soundscape'}
        >
          {isPlaying ? (
            volume > 0.5 ? (
              <Volume2 className="w-4 h-4 text-cyan-300 animate-pulse" />
            ) : (
              <Volume1 className="w-4 h-4 text-cyan-300" />
            )
          ) : (
            <VolumeX className="w-4 h-4" />
          )}
        </button>

        {/* Volume Percentage Floating Badge Tooltip */}
        {showVolTooltip && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.9 }}
            animate={{ opacity: 1, y: -24, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.9 }}
            className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full px-2 py-0.5 rounded-md bg-cyan-950/90 border border-cyan-400/50 text-[10px] font-mono font-bold text-cyan-300 shadow-lg whitespace-nowrap pointer-events-none z-30"
          >
            VOL: {Math.round(volume * 100)}%
          </motion.div>
        )}
      </div>

      {/* Text Info & Controls */}
      <div className="text-left cursor-pointer" onClick={handleTogglePlay}>
        <div className="flex items-center gap-1.5 text-xs font-bold font-['Orbitron'] tracking-wide">
          <span>{text.title}</span>
          {isPlaying && (
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
          )}
        </div>
        <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1 mt-0.5">
          <span>{isPlaying ? `${text.active} • ${Math.round(volume * 100)}%` : text.inactive}</span>
        </div>
      </div>

      {/* Animated Sound Wave Equalizer Bars when playing */}
      {isPlaying && (
        <div className="flex items-end gap-0.5 h-4 ml-1 pr-1 cursor-pointer" onClick={handleTogglePlay}>
          {[0.4, 0.9, 0.5, 1, 0.6].map((scale, i) => (
            <motion.div
              key={i}
              className="w-1 bg-gradient-to-t from-cyan-500 to-indigo-400 rounded-full"
              animate={{ height: ['20%', '100%', '35%'] }}
              transition={{
                repeat: Infinity,
                repeatType: 'mirror',
                duration: 0.6 + i * 0.15,
                ease: 'easeInOut'
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AmbientSoundscapeControl;
