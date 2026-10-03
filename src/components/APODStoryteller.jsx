'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LiquidGlassCard } from './LiquidGlassCard.jsx';
import { 
  Play, 
  Pause, 
  Square, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  Gauge, 
  Radio, 
  RotateCcw,
  Check
} from 'lucide-react';

/**
 * APODStoryteller
 * AI APOD Audio Narrator component powered by native Browser SpeechSynthesis API
 * 
 * @param {Object} props
 * @param {string} props.title - Title of the APOD picture
 * @param {string} props.explanation - Full scientific narrative text
 * @param {string} [props.lang='en-US'] - Language tag ('en-US', 'si-LK', 'ta-IN')
 * @param {string} [props.className='']
 */
export default function APODStoryteller({
  title = '',
  explanation = '',
  lang = 'en-US',
  className = ''
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);

  const utteranceRef = useRef(null);

  // Initialize SpeechSynthesis on client
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setSupported(false);
      return;
    }

    setSupported(true);

    const updateVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);

      // Auto-pick best matching voice for current language
      const prefix = lang.slice(0, 2).toLowerCase();
      const matched = availableVoices.find(v => v.lang.toLowerCase().startsWith(prefix)) || availableVoices[0];
      setSelectedVoice(matched);
    };

    updateVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [lang]);

  // Handle Stop
  const handleStop = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      setIsPaused(false);
    }
  }, []);

  // Play narration
  const handlePlay = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    window.speechSynthesis.cancel();

    const fullNarration = `${title}. ${explanation}`;
    const utterance = new SpeechSynthesisUtterance(fullNarration);
    utterance.rate = speed;
    utterance.pitch = 1.0;
    utterance.lang = lang;

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsPaused(false);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    utterance.onerror = (e) => {
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        console.warn('SpeechSynthesis notice:', e.error);
      }
      setIsPlaying(false);
      setIsPaused(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [title, explanation, lang, speed, selectedVoice, isPaused]);

  // Pause narration
  const handlePause = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis && isPlaying) {
      window.speechSynthesis.pause();
      setIsPaused(true);
      setIsPlaying(false);
    }
  }, [isPlaying]);

  // Handle rate change
  const handleRateChange = (newSpeed) => {
    setSpeed(newSpeed);
    if (isPlaying) {
      handleStop();
      setTimeout(() => {
        handlePlay();
      }, 100);
    }
  };

  if (!supported) return null;

  return (
    <LiquidGlassCard 
      className={`p-4 font-sans space-y-3 ${className}`}
      edgeHighlight={true}
      hoverable={true}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative p-2.5 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shadow-lg shadow-cyan-950/40">
            <Volume2 className="w-4 h-4 text-cyan-400" />
            {isPlaying && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            )}
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold font-['Orbitron'] text-white flex items-center gap-1.5">
              <span>AI Audio Storyteller</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                KEYLESS TTS
              </span>
            </h4>
            <p className="text-[11px] text-slate-400 font-mono">
              Narrating official NASA deep-space scientific release
            </p>
          </div>
        </div>

        {/* Dynamic Animated Audio Wave */}
        <div className="flex items-center gap-1 h-6 px-2.5 rounded-xl liquid-glass border border-white/10">
          {[0.3, 0.7, 1.0, 0.6, 0.9, 0.4, 0.8].map((h, i) => (
            <motion.span
              key={i}
              animate={isPlaying ? {
                scaleY: [0.25, 1, 0.3],
                transition: { repeat: Infinity, duration: 0.6 + i * 0.1, ease: 'easeInOut' }
              } : { scaleY: 0.25 }}
              className={`w-0.5 rounded-full origin-bottom ${
                isPlaying ? 'bg-cyan-400' : 'bg-slate-700'
              }`}
              style={{ height: '14px' }}
            />
          ))}
        </div>
      </div>

      {/* Control Buttons & Playback Rate Strip */}
      <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-white/10">
        
        {/* Playback Action Buttons */}
        <div className="flex items-center gap-2">
          {!isPlaying ? (
            <button
              type="button"
              onClick={handlePlay}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-md shadow-cyan-950/50 cursor-pointer transition active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isPaused ? 'Resume' : 'Narrate Story'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePause}
              className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-md shadow-amber-950/50 cursor-pointer transition active:scale-95"
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>Pause</span>
            </button>
          )}

          {(isPlaying || isPaused) && (
            <button
              type="button"
              onClick={handleStop}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 hover:text-rose-400 transition cursor-pointer"
              title="Stop narration"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          )}
        </div>

        {/* Narration Speed Selector */}
        <div className="flex items-center gap-1 font-mono text-[11px]">
          <span className="text-slate-400 text-[10px] mr-1 hidden sm:inline">Speed:</span>
          {[0.8, 1.0, 1.2].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleRateChange(s)}
              className={`px-2 py-1 rounded-lg transition cursor-pointer ${
                speed === s
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold shadow-sm'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/10'
              }`}
            >
              {s.toFixed(1)}x
            </button>
          ))}
        </div>
      </div>
    </LiquidGlassCard>
  );
}
