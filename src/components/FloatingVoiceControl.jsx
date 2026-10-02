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
    <div className={`fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 font-sans select-none ${className}`}>
      
      {/* Real-time Voice Command Toast / Feedback Bubble */}
      <AnimatePresence>
        {(isListening || lastCommand || error) && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="max-w-xs p-3 rounded-2xl bg-slate-950/90 border border-cyan-500/30 backdrop-blur-xl shadow-2xl text-xs space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1 font-mono text-[10px]">
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
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Commands Quick List */}
            {showHelp && (
              <div className="pt-1.5 border-t border-slate-800 text-[10px] text-slate-400 font-mono space-y-0.5">
                <p>🗣️ Say: <b>"Mars"</b>, <b>"ISS"</b>, <b>"Sun"</b>, <b>"Exoplanets"</b></p>
                <p>🎥 Camera: <b>"Rotate"</b>, <b>"Reset view"</b>, <b>"Zoom in"</b></p>
                <p>සිංහල: <b>"අඟහරු"</b>, <b>"මධ්‍යස්ථානය"</b>, <b>"කැරකෙන්න"</b></p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Glassmorphic Mic Button with Pulse Rings */}
      <div className="relative flex items-center justify-center">
        {/* Animated Pulse Rings when Active */}
        {isListening && (
          <>
            <motion.span
              animate={{ scale: [1, 1.6, 2], opacity: [0.6, 0.3, 0] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: 'easeOut' }}
              className="absolute inset-0 rounded-full bg-rose-500/30 pointer-events-none"
            />
            <motion.span
              animate={{ scale: [1, 1.4, 1.8], opacity: [0.8, 0.4, 0] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: 'easeOut', delay: 0.3 }}
              className="absolute inset-0 rounded-full bg-cyan-500/30 pointer-events-none"
            />
          </>
        )}

        <button
          type="button"
          onClick={toggleListening}
          disabled={!supported}
          title={supported ? (isListening ? 'Stop Voice Control' : 'Start Voice Control') : 'Speech recognition not supported in this browser'}
          className={`relative z-10 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all cursor-pointer ${
            !supported
              ? 'bg-slate-900 border border-slate-800 text-slate-600 opacity-60 cursor-not-allowed'
              : isListening
              ? 'bg-gradient-to-tr from-rose-600 to-amber-600 text-white border-2 border-rose-400/80 shadow-rose-900/50 scale-105'
              : 'bg-slate-950/90 hover:bg-slate-900 text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 backdrop-blur-xl shadow-cyan-950/50 hover:scale-105'
          }`}
        >
          {isListening ? (
            <Mic className="w-6 h-6 animate-pulse" />
          ) : supported ? (
            <Mic className="w-6 h-6" />
          ) : (
            <MicOff className="w-6 h-6" />
          )}
        </button>
      </div>
    </div>
  );
}
