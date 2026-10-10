'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2, Sparkles, AlertCircle, Compass, RotateCw } from 'lucide-react';
import { useVoiceNavigation } from '../hooks/useVoiceNavigation';

/**
 * FloatingVoiceControl
 * Modern glassmorphic floating microphone button overlay for 3D Canvas / Space Explorer
 * Features animated pulse rings, real-time speech transcript, and audio action feedback.
 */
export default function FloatingVoiceControl({ 
  onNavigate, 
  onCameraAction, 
  lang = 'en-US',
  className = '' 
}) {
  const [showHelp, setShowHelp] = useState(false);

  const {
    isListening,
    transcript,
    lastCommand,
    error,
    supported,
    toggleListening
  } = useVoiceNavigation({ onNavigate, onCameraAction, lang });

  return (
    <div className={`fixed z-40 flex flex-col items-end gap-2 font-sans select-none ${className || 'bottom-36 sm:bottom-22 right-4 sm:right-6'}`}>
      
      {/* Real-time Voice Command Toast / Feedback Bubble */}
      <AnimatePresence>
        {(isListening || lastCommand || error) && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="max-w-xs p-3 rounded-2xl apple-liquid-glass shadow-2xl text-xs space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1 font-mono text-[10px]">
              <span className="flex items-center gap-1.5 text-cyan-300 font-bold">
                {isListening ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                    <span>LISTENING...</span>
                  </>
                ) : (
                  <span>VOICE RECOGNITION</span>
                )}
              </span>
              <button 
                type="button" 
                onClick={() => setShowHelp(!showHelp)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                {showHelp ? 'Hide' : 'Commands?'}
              </button>
            </div>

            {/* Live Transcript */}
            {transcript && (
              <p className="text-slate-200 text-xs italic line-clamp-2">
                "{transcript}"
              </p>
            )}

            {/* Last Recognized Command */}
            {lastCommand && (
              <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px] font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Command: {lastCommand.label}</span>
              </div>
            )}

            {/* Error Notice */}
            {error && (
              <div className="flex items-center gap-1 text-rose-400 text-[11px]">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Commands Quick List */}
            {showHelp && (
              <div className="pt-1.5 border-t border-white/10 text-[10px] text-slate-400 font-mono space-y-0.5">
                <p>🗣️ Say: <b>"Mars"</b>, <b>"ISS"</b>, <b>"Sun"</b>, <b>"Exoplanets"</b></p>
                <p>🎥 Camera: <b>"Rotate"</b>, <b>"Reset view"</b>, <b>"Zoom in"</b></p>
                <p>සිංහල: <b>"අඟහරු"</b>, <b>"මධ්‍යස්ථානය"</b>, <b>"කැරකෙන්න"</b></p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Glassmorphic 3D Cosmic Liquid Bubble Button with Zero-G Float & Satellite Micro-Bubbles */}
      <motion.div 
        animate={{ 
          y: [0, -8, 0],
          scaleX: [1, 1.03, 0.98, 1],
          scaleY: [1, 0.97, 1.02, 1]
        }}
        transition={{ repeat: Infinity, duration: 4.2, ease: 'easeInOut' }}
        className="relative flex items-center justify-center group"
      >
        {/* Floating Mini Satellite Micro-Bubble 1 (Zero-G Orbit) */}
        <motion.div
          animate={{ y: [0, -5, 0], x: [0, 2.5, 0], scale: [1, 1.15, 1] }}
          transition={{ repeat: Infinity, duration: 3.2, ease: 'easeInOut' }}
          className="absolute -top-2.5 -left-2 w-3.5 h-3.5 rounded-full pointer-events-none z-20 overflow-hidden"
          style={{
            background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.7) 0%, rgba(56,189,248,0.4) 40%, rgba(6,182,212,0.15) 80%)',
            boxShadow: '0 0 10px rgba(34,211,238,0.5), inset 0 1px 2px rgba(255,255,255,0.9)',
            border: '0.5px solid rgba(255,255,255,0.6)'
          }}
        >
          <div className="absolute top-0.5 left-0.5 w-1.5 h-1 rounded-full bg-white/90 rotate-[-30deg]" />
        </motion.div>

        {/* Floating Mini Satellite Micro-Bubble 2 */}
        <motion.div
          animate={{ y: [0, 4, 0], x: [0, -2, 0], scale: [0.95, 1.12, 0.95] }}
          transition={{ repeat: Infinity, duration: 3.6, ease: 'easeInOut', delay: 0.6 }}
          className="absolute -bottom-1 -right-2.5 w-2.5 h-2.5 rounded-full pointer-events-none z-20 overflow-hidden"
          style={{
            background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.6) 0%, rgba(168,85,247,0.4) 45%, rgba(6,182,212,0.15) 80%)',
            boxShadow: '0 0 8px rgba(168,85,247,0.4), inset 0 0.5px 1.5px rgba(255,255,255,0.85)',
            border: '0.5px solid rgba(255,255,255,0.5)'
          }}
        >
          <div className="absolute top-0.5 left-0.5 w-1 h-0.5 rounded-full bg-white/90 rotate-[-30deg]" />
        </motion.div>

        {/* Outer Iridescent Ambient Halo Ring (Thin-Film Bubble Refraction) */}
        <div 
          className={`absolute inset-[-6px] rounded-full blur-lg transition-all duration-700 pointer-events-none ${
            isListening 
              ? 'bg-rose-500/50 animate-pulse scale-110' 
              : 'bg-gradient-to-r from-cyan-400/35 via-fuchsia-400/25 to-sky-400/35 group-hover:scale-120 group-hover:opacity-100 opacity-60'
          }`}
        />

        {/* Animated Soundwave Pulse Rings when Listening */}
        {isListening && (
          <>
            <motion.span
              animate={{ scale: [1, 1.8, 2.4], opacity: [0.75, 0.35, 0] }}
              transition={{ repeat: Infinity, duration: 1.8, ease: 'easeOut' }}
              className="absolute inset-0 rounded-full bg-rose-500/40 pointer-events-none"
            />
            <motion.span
              animate={{ scale: [1, 1.5, 2.0], opacity: [0.9, 0.45, 0] }}
              transition={{ repeat: Infinity, duration: 1.8, ease: 'easeOut', delay: 0.35 }}
              className="absolute inset-0 rounded-full bg-cyan-400/40 pointer-events-none"
            />
          </>
        )}

        {/* Mini Floating Pill Tooltip Badge on Hover */}
        <div className="absolute -top-7 right-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#010409]/95 border border-cyan-400/60 text-[9px] font-mono text-cyan-200 font-bold tracking-wider shadow-[0_0_12px_rgba(6,182,212,0.4)] whitespace-nowrap z-30">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
          <span>VOICE NAV</span>
        </div>

        {/* Primary Liquid Bubble Sphere Button */}
        <motion.button
          type="button"
          onClick={toggleListening}
          disabled={!supported}
          whileHover={{ scale: 1.12, rotate: [0, -1.5, 1.5, 0] }}
          whileTap={{ scale: 0.86, scaleX: 1.15, scaleY: 0.8 }}
          transition={{ type: 'spring', stiffness: 450, damping: 16 }}
          title={supported ? (isListening ? 'Stop Voice Control' : 'Start Voice Control') : 'Speech recognition not supported in this browser'}
          className="relative z-10 w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all cursor-pointer overflow-hidden select-none"
          style={{
            background: !supported
              ? 'rgba(15, 23, 42, 0.7)'
              : isListening
              ? 'radial-gradient(circle at 35% 25%, rgba(255,255,255,0.4) 0%, rgba(244,63,94,0.5) 30%, rgba(136,19,55,0.75) 70%, rgba(2,6,23,0.9) 100%)'
              : 'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.48) 0%, rgba(56,189,248,0.32) 22%, rgba(168,85,247,0.2) 50%, rgba(6,182,212,0.18) 75%, rgba(2,6,23,0.8) 100%)',
            boxShadow: !supported
              ? 'none'
              : isListening
              ? '0 0 35px rgba(244,63,94,0.7), inset 0 2px 6px rgba(255,255,255,0.9), inset 0 -4px 12px rgba(225,29,72,0.5), inset 0 0 15px rgba(251,113,133,0.45)'
              : '0 12px 30px -4px rgba(0,0,0,0.7), 0 0 25px rgba(34,211,238,0.5), inset 0 2px 6px rgba(255,255,255,0.92), inset 0 -5px 12px rgba(6,182,212,0.5), inset 0 0 14px rgba(168,85,247,0.3)',
            border: isListening
              ? '1.5px solid rgba(254,205,211,0.9)'
              : '1.5px solid rgba(165,243,252,0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)'
          }}
        >
          {/* Soap Bubble Iridescent Thin-Film Interference Sheen (Chromatic Swirl) */}
          <div 
            className="absolute inset-0 rounded-full opacity-35 group-hover:opacity-60 transition-opacity duration-500 pointer-events-none"
            style={{
              background: 'conic-gradient(from 220deg at 50% 50%, rgba(34,211,238,0.6), rgba(168,85,247,0.5), rgba(244,114,182,0.45), rgba(56,189,248,0.55), rgba(34,211,238,0.6))',
              mixBlendMode: 'screen'
            }}
          />

          {/* Primary Top-Left Specular Lens Reflection (3D Glossy Curved Arc) */}
          <div 
            className="absolute top-1.5 left-2 w-7 h-4 sm:w-8 sm:h-4.5 rounded-[50%] pointer-events-none"
            style={{
              background: 'linear-gradient(175deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.4) 45%, transparent 100%)',
              transform: 'rotate(-32deg)',
              filter: 'blur(0.3px)'
            }}
          />

          {/* Apex Pinpoint Starlight Glint */}
          <div 
            className="absolute top-2 left-4 sm:top-2.5 sm:left-4.5 w-1.5 h-1.5 rounded-full bg-white pointer-events-none"
            style={{
              boxShadow: '0 0 6px 1px #ffffff'
            }}
          />

          {/* Secondary Bottom-Right Caustic Rim Reflection */}
          <div 
            className="absolute bottom-1.5 right-2 w-6 h-3 sm:w-7 sm:h-3.5 rounded-[50%] pointer-events-none"
            style={{
              background: isListening
                ? 'linear-gradient(355deg, rgba(254,205,211,0.8) 0%, rgba(244,63,94,0.3) 60%, transparent 100%)'
                : 'linear-gradient(355deg, rgba(165,243,252,0.8) 0%, rgba(192,132,252,0.35) 60%, transparent 100%)',
              transform: 'rotate(-32deg)',
              filter: 'blur(0.4px)'
            }}
          />

          {/* Internal Caustic Core Sphere Diffusion */}
          <div 
            className="absolute inset-0 rounded-full pointer-events-none opacity-50"
            style={{
              background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.45) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(6,182,212,0.35) 0%, transparent 60%)'
            }}
          />

          {/* Center Floating Icon with Deep Dimensional Shadow */}
          <div className="relative z-10 flex items-center justify-center drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]">
            {isListening ? (
              <Mic className="w-6 h-6 sm:w-7 sm:h-7 text-white animate-pulse" />
            ) : supported ? (
              <Mic className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-100 group-hover:text-white transition-colors" />
            ) : (
              <MicOff className="w-6 h-6 sm:w-7 sm:h-7 text-slate-500" />
            )}
          </div>
        </motion.button>
      </motion.div>
    </div>
  );
}
