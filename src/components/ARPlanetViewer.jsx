'use client';

import React, { useState, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  RotateCw, 
  ZoomIn, 
  X, 
  Sparkles, 
  HelpCircle, 
  Hand,
  Check,
  ChevronRight
} from 'lucide-react';
import ArModelViewer from './ArModelViewer';

/**
 * Trilingual Gesture Guidance Texts (English, Sinhala, Tamil)
 */
const GESTURE_TEXTS = {
  en: {
    tipBadge: 'GESTURE TIP',
    title: 'Interactive 3D & AR Controls',
    rotateAction: 'Drag to Rotate',
    rotateDesc: 'Drag with 1 finger (or mouse) to orbit around the 3D model in 360°.',
    scaleAction: 'Pinch to Scale',
    scaleDesc: 'Pinch with 2 fingers (or scroll wheel) to zoom and scale the model size.',
    arHint: 'Tap "PROJECT IN REAL SPACE" to project onto real floors via camera.',
    dismiss: 'Got it',
    showTip: 'Gesture Controls'
  },
  si: {
    tipBadge: 'අභිනය ඉඟිය',
    title: '3D සහ AR අන්තර්ක්‍රියාකාරී පාලන',
    rotateAction: 'කරකැවීමට අදින්න (Drag to Rotate)',
    rotateDesc: 'ආකෘතිය 360° කරකැවීමට එක් ඇඟිල්ලකින් (හෝ මවුසයෙන්) අදින්න.',
    scaleAction: 'ප්‍රමාණය වෙනස් කිරීමට Pinch කරන්න',
    scaleDesc: 'ආකෘතිය විශාලනය හෝ කුඩා කිරීමට ඇඟිලි දෙකකින් Pinch කරන්න (හෝ මවුස් ස්ක්‍රෝල් කරන්න).',
    arHint: 'සැබෑ ලෝකයේ ප්‍රක්ෂේපණය කිරීමට "PROJECT IN REAL SPACE" ඔබන්න.',
    dismiss: 'තේරුණා',
    showTip: 'අභිනය ඉඟිය පෙන්වන්න'
  },
  ta: {
    tipBadge: 'சைகை குறிப்பு',
    title: '3D மற்றும் AR சைகை வழிகாட்டுதல்',
    rotateAction: 'சுழற்ற இழுக்கவும் (Drag to Rotate)',
    rotateDesc: '3D மாதிரியை 360° சுழற்ற 1 விரலால் (அல்லது மவுஸால்) இழுக்கவும்.',
    scaleAction: 'அளவை மாற்ற சுருக்கவும் (Pinch to Scale)',
    scaleDesc: 'மாதிரியின் அளவை மாற்ற 2 விரல்களால் சுருக்கவும் (அல்லது மவுஸ் ஸ்க்ரோல் செய்யவும்).',
    arHint: 'உண்மையான இடத்தில் நிறுவ "PROJECT IN REAL SPACE" பொத்தானைத் தொடவும்.',
    dismiss: 'புரிந்தது',
    showTip: 'சைகை உதவி'
  }
};

/**
 * ARPlanetViewer - WebXR Augmented Reality Planet & Spacecraft Viewer
 * Enhanced with a small, non-intrusive 'Gesture Tip' toast notification
 * that mounts automatically to guide users on pinching to scale and dragging to rotate.
 */
export function ARPlanetViewer({ className = '', lang = 'en', ...props }) {
  const [showGestureTip, setShowGestureTip] = useState(true);
  const t = GESTURE_TEXTS[lang] || GESTURE_TEXTS.en;

  // Auto-dismiss the toast notification after 8 seconds to remain non-intrusive
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowGestureTip(false);
    }, 8500);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setShowGestureTip(false);
  };

  return (
    <div className={`relative w-full ${className}`}>
      {/* Underlying WebXR & 3D Model Viewer */}
      <ArModelViewer 
        lang={lang} 
        arModes="webxr scene-viewer quick-look"
        {...props} 
      />

      {/* Floating Gesture Tip Toast Notification on Component Mount */}
      <AnimatePresence>
        {showGestureTip && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-20 right-4 sm:right-6 z-30 max-w-sm sm:max-w-md w-[calc(100%-2rem)] bg-slate-900/95 backdrop-blur-xl border border-cyan-500/40 rounded-2xl p-4 shadow-2xl shadow-cyan-950/60 text-slate-100 pointer-events-auto select-none"
            role="status"
            aria-live="polite"
          >
            {/* Header: Badge, Title & Close */}
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 flex items-center gap-1 shadow-sm">
                  <Sparkles className="w-3 h-3 text-cyan-400 animate-pulse" />
                  {t.tipBadge}
                </span>
                <h4 className="font-['Orbitron'] font-bold text-xs sm:text-sm text-white tracking-wide">
                  {t.title}
                </h4>
              </div>

              <button
                type="button"
                onClick={handleDismiss}
                className="w-6 h-6 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
                title="Dismiss gesture tip"
                aria-label="Close gesture tip"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Content: Drag to Rotate & Pinch to Scale */}
            <div className="py-2.5 space-y-2 text-xs">
              {/* 1. Drag to Rotate */}
              <div className="flex items-start gap-2.5 bg-slate-950/50 p-2 rounded-xl border border-slate-800/80">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                  <RotateCw className="w-4 h-4 animate-spin-slow" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-cyan-300 text-[11px] font-mono flex items-center gap-1">
                    <span>{t.rotateAction}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">
                    {t.rotateDesc}
                  </p>
                </div>
              </div>

              {/* 2. Pinch to Scale */}
              <div className="flex items-start gap-2.5 bg-slate-950/50 p-2 rounded-xl border border-slate-800/80">
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0 mt-0.5">
                  <ZoomIn className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-purple-300 text-[11px] font-mono flex items-center gap-1">
                    <span>{t.scaleAction}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">
                    {t.scaleDesc}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer with quick confirmation */}
            <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-400">
              <span className="truncate text-slate-400">
                {t.arHint}
              </span>
              <button
                type="button"
                onClick={handleDismiss}
                className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 hover:text-cyan-200 font-bold flex items-center gap-1 transition cursor-pointer shrink-0"
              >
                <Check className="w-3 h-3 text-cyan-400" />
                <span>{t.dismiss}</span>
              </button>
            </div>

            {/* Subtle Auto-Dismiss Indicator Bar */}
            <div className="w-full bg-slate-800 h-0.5 rounded-full mt-2.5 overflow-hidden">
              <motion.div 
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: 8.5, ease: 'linear' }}
                className="h-full bg-gradient-to-r from-cyan-400 to-purple-400"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtle floating re-open pill when toast is dismissed */}
      {!showGestureTip && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => setShowGestureTip(true)}
          type="button"
          className="absolute top-20 right-4 sm:right-6 z-20 px-3 py-1.5 rounded-xl bg-slate-900/85 hover:bg-slate-800/90 border border-cyan-500/40 text-cyan-300 text-[11px] font-mono flex items-center gap-1.5 backdrop-blur-md shadow-lg shadow-cyan-950/40 transition cursor-pointer hover:border-cyan-400 hover:text-white"
          title="Show Gesture Tip"
        >
          <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
          <span>{t.showTip}</span>
          <ChevronRight className="w-3 h-3 text-cyan-400/70" />
        </motion.button>
      )}
    </div>
  );
}

export default memo(ARPlanetViewer);
