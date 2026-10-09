'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useMotionValue, useTransform, useSpring, animate } from 'framer-motion';
import { ChevronRight, Sparkles, Check, Rocket } from 'lucide-react';

/**
 * SlideToAction - iOS-style Drag-to-Unlock / Slide to Action with Magnetic Hover & Dynamic Glow
 * 
 * @param {Object} props
 * @param {() => void} props.onSuccess - Callback triggered when slide threshold is reached
 * @param {string} [props.label="Slide to Explore"] - Label text with shimmer
 * @param {string} [props.successLabel="Exploration Initiated"] - Text shown upon success
 * @param {number} [props.threshold=180] - Distance in pixels required to trigger action
 * @param {number} [props.resetDelay=2200] - Duration in ms before slider resets (0 to disable auto-reset)
 * @param {string} [props.className=""] - Additional container classes
 * @param {React.ReactNode} [props.icon] - Custom icon inside the dragging knob
 */
export default function SlideToAction({
  onSuccess = () => {},
  label = 'Slide to Explore',
  successLabel = 'Exploration Initiated',
  threshold = 180,
  resetDelay = 2200,
  className = '',
  icon = null
}) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [maxDrag, setMaxDrag] = useState(240);
  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 120, y: 28 });

  const containerRef = useRef(null);
  const knobRef = useRef(null);

  // Motion value tracking the knob X position
  const x = useMotionValue(0);

  // Magnetic card shift motion values with spring smoothing
  const magneticRawX = useMotionValue(0);
  const magneticRawY = useMotionValue(0);
  const smoothMagneticX = useSpring(magneticRawX, { stiffness: 320, damping: 22 });
  const smoothMagneticY = useSpring(magneticRawY, { stiffness: 320, damping: 22 });

  // Mouse hover coordinate handler to shift subtle colored glow gradient & apply magnetic pull
  const handleMouseMove = useCallback((e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    setMousePos({ x: currentX, y: currentY });

    if (!isDragging && !isUnlocked) {
      // Normalized offset from center (-1 to 1)
      const normX = ((currentX / rect.width) - 0.5) * 2;
      const normY = ((currentY / rect.height) - 0.5) * 2;
      magneticRawX.set(normX * 6);
      magneticRawY.set(normY * 4);
    }
  }, [isDragging, isUnlocked, magneticRawX, magneticRawY]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    magneticRawX.set(0);
    magneticRawY.set(0);
  }, [magneticRawX, magneticRawY]);

  // Measure container and knob width to determine exact maximum draggable range
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current && knobRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const knobWidth = knobRef.current.offsetWidth;
        const availableDrag = Math.max(containerWidth - knobWidth - 8, 120);
        setMaxDrag(availableDrag);
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Compute actual trigger threshold (defaults to min of threshold or 75% of max distance)
  const effectiveThreshold = Math.min(threshold, maxDrag * 0.78);

  // Dynamic transforms based on drag progress (0 -> 1)
  const progress = useTransform(x, [0, maxDrag], [0, 1]);
  
  // Shimmer text smoothly fades out as the knob slides right
  const textOpacity = useTransform(x, [0, effectiveThreshold], [1, 0.05]);
  
  // Subtle text shift as knob approaches
  const textTranslateX = useTransform(x, [0, effectiveThreshold], [0, 24]);

  // Glow fill bar width behind the knob
  const fillWidth = useTransform(x, (currentX) => `${Math.max(currentX + 28, 48)}px`);

  // Scale feedback for the knob as you drag closer to threshold
  const knobScale = useTransform(x, [0, effectiveThreshold, maxDrag], [1, 1.08, 1.15]);

  // Dynamic glow opacity around the track
  const trackGlowOpacity = useTransform(x, [0, effectiveThreshold], [0.15, 0.65]);

  const handleDragStart = () => {
    if (isUnlocked) return;
    setIsDragging(true);
  };

  const handleDrag = () => {
    // Subtle visual / haptic feedback near threshold
    if (x.get() >= effectiveThreshold && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(10);
      } catch {
        // Safe vibration fallback
      }
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    if (isUnlocked) return;

    const currentX = x.get();

    // Past threshold -> Snap to end & trigger success
    if (currentX >= effectiveThreshold) {
      setIsUnlocked(true);

      // Smooth spring snap to the finish line
      animate(x, maxDrag, {
        type: 'spring',
        stiffness: 420,
        damping: 32,
      });

      // Haptic confirmation
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([20, 40, 20]);
        } catch {
          // Ignore
        }
      }

      // Fire callback
      onSuccess();

      // Auto-reset if delay > 0
      if (resetDelay > 0) {
        setTimeout(() => {
          setIsUnlocked(false);
          animate(x, 0, {
            type: 'spring',
            stiffness: 350,
            damping: 28,
          });
        }, resetDelay);
      }
    } else {
      // Released before threshold -> spring back to origin
      animate(x, 0, {
        type: 'spring',
        stiffness: 450,
        damping: 30,
      });
    }
  };

  return (
    <motion.div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        x: smoothMagneticX,
        y: smoothMagneticY,
      }}
      className={`relative w-full max-w-sm h-14 select-none rounded-full overflow-hidden p-1.5 transition-all duration-300 ${
        isUnlocked
          ? 'bg-emerald-950/70 border border-emerald-400/50 shadow-lg shadow-emerald-500/20'
          : 'bg-slate-950/80 border border-cyan-500/30 shadow-xl shadow-cyan-950/40 backdrop-blur-xl hover:border-cyan-400/60'
      } ${className}`}
    >
      {/* Outer ambient glow reacting to drag progress */}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-600/30 via-blue-600/20 to-emerald-500/30 pointer-events-none"
        style={{ opacity: trackGlowOpacity }}
      />

      {/* Dynamic Magnetic Mouse-Following Colored Glow Gradient */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full transition-opacity duration-300 z-10 overflow-hidden"
        style={{
          opacity: isHovered && !isUnlocked ? 1 : 0,
        }}
      >
        {/* Diffused colored gradient aura shifting with cursor */}
        <div
          className="absolute w-52 h-52 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none blur-xl transition-transform duration-75 ease-out"
          style={{
            left: `${mousePos.x}px`,
            top: `${mousePos.y}px`,
            background: 'radial-gradient(circle, rgba(34, 211, 238, 0.45) 0%, rgba(59, 130, 246, 0.28) 35%, rgba(168, 85, 247, 0.15) 60%, transparent 80%)'
          }}
        />
        {/* Concentrated radial core following mouse coordinates */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(130px circle at ${mousePos.x}px ${mousePos.y}px, rgba(34, 211, 238, 0.32) 0%, rgba(59, 130, 246, 0.14) 40%, transparent 75%)`
          }}
        />
      </div>

      {/* Dynamic magnetic border glow reacting to cursor position */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full z-20 transition-opacity duration-300"
        style={{
          opacity: isHovered && !isUnlocked ? 1 : 0,
          background: `radial-gradient(90px circle at ${mousePos.x}px ${mousePos.y}px, rgba(34, 211, 238, 0.6), transparent 70%)`,
          mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          maskComposite: 'exclude',
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          padding: '1px'
        }}
      />

      {/* Dynamic progress fill bar trailing behind the knob */}
      <motion.div
        className="absolute left-0 top-0 bottom-0 rounded-full bg-gradient-to-r from-cyan-600/40 via-sky-500/30 to-blue-500/40 border-r border-cyan-400/40 pointer-events-none"
        style={{ width: fillWidth }}
      />

      {/* Shimmer Text Container */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-12">
        {!isUnlocked ? (
          <motion.div
            style={{ opacity: textOpacity, x: textTranslateX }}
            className="flex items-center gap-2 font-mono text-xs sm:text-sm font-semibold tracking-wider uppercase text-center"
          >
            {/* Shimmer gradient text */}
            <span className="bg-gradient-to-r from-slate-400 via-cyan-100 via-white to-slate-400 bg-clip-text text-transparent animate-shimmer">
              {label}
            </span>
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2 font-mono text-xs sm:text-sm font-bold tracking-wider uppercase text-emerald-300"
          >
            <Check className="w-4 h-4 text-emerald-400 animate-bounce" />
            <span>{successLabel}</span>
          </motion.div>
        )}
      </div>

      {/* Draggable Fluid Knob */}
      <motion.div
        ref={knobRef}
        drag={!isUnlocked ? 'x' : false}
        dragConstraints={{ left: 0, right: maxDrag }}
        dragElastic={{ left: 0, right: 0.18 }}
        dragSnapToOrigin={!isUnlocked}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        style={{ x, scale: knobScale }}
        whileTap={{ scale: 1.12 }}
        className={`relative z-20 w-11 h-11 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing shadow-xl transition-colors duration-300 ${
          isUnlocked
            ? 'bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-emerald-500/50'
            : isDragging
            ? 'bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 text-white shadow-cyan-400/50 ring-2 ring-cyan-300'
            : 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border border-cyan-400/50 text-cyan-300 shadow-cyan-500/30 hover:border-cyan-300'
        }`}
      >
        {isUnlocked ? (
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          >
            <Rocket className="w-5 h-5 text-white" />
          </motion.div>
        ) : (
          icon || (
            <motion.div
              animate={!isDragging ? { x: [0, 3, 0] } : {}}
              transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
              className="flex items-center justify-center"
            >
              <ChevronRight className="w-5 h-5 text-current stroke-[2.5]" />
            </motion.div>
          )
        )}
      </motion.div>
    </motion.div>
  );
}
