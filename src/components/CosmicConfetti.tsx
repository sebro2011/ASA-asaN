'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  shape: 'star' | 'circle' | 'diamond' | 'rect';
  delay: number;
}

interface CosmicConfettiProps {
  triggerKey: number | string;
  count?: number;
  originX?: number; // 0 to 1 (screen percentage)
  originY?: number; // 0 to 1 (screen percentage)
  onComplete?: () => void;
}

const COSMIC_COLORS = [
  '#38bdf8', // sky-400
  '#818cf8', // indigo-400
  '#c084fc', // purple-400
  '#f43f5e', // rose-500
  '#fbbf24', // amber-400
  '#34d399', // emerald-400
  '#22d3ee', // cyan-400
  '#f472b6', // pink-400
  '#60a5fa'  // blue-400
];

const SHAPES: ('star' | 'circle' | 'diamond' | 'rect')[] = ['star', 'circle', 'diamond', 'rect'];

export const CosmicConfetti: React.FC<CosmicConfettiProps> = ({
  triggerKey,
  count = 45,
  originX = 0.5,
  originY = 0.5,
  onComplete
}) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [active, setActive] = useState<boolean>(false);

  useEffect(() => {
    if (!triggerKey) return;

    // Generate burst particles
    const newParticles: Particle[] = Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const velocity = 180 + Math.random() * 320;
      const vx = Math.cos(angle) * velocity;
      const vy = Math.sin(angle) * velocity - 120; // Upward initial boost

      return {
        id: i,
        x: (Math.random() - 0.5) * 40,
        y: (Math.random() - 0.5) * 40,
        vx,
        vy,
        size: Math.random() * 10 + 6,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 720,
        color: COSMIC_COLORS[Math.floor(Math.random() * COSMIC_COLORS.length)],
        shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
        delay: Math.random() * 0.08
      };
    });

    setParticles(newParticles);
    setActive(true);

    const timer = setTimeout(() => {
      setActive(false);
      onComplete?.();
    }, 2200);

    return () => clearTimeout(timer);
  }, [triggerKey, count]);

  if (!active || particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <div
        className="absolute"
        style={{
          left: `${originX * 100}%`,
          top: `${originY * 100}%`
        }}
      >
        <AnimatePresence>
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{
                x: p.x,
                y: p.y,
                scale: 0,
                opacity: 1,
                rotate: 0
              }}
              animate={{
                x: [p.x, p.x + p.vx * 0.5, p.x + p.vx],
                y: [p.y, p.y + p.vy * 0.45, p.y + p.vy + 260], // Gravity pull
                scale: [0, 1.4, 0.9, 0],
                opacity: [1, 1, 0.9, 0],
                rotate: p.rotation + p.rotationSpeed
              }}
              transition={{
                duration: 1.8 + Math.random() * 0.4,
                delay: p.delay,
                ease: [0.16, 1, 0.3, 1]
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center filter drop-shadow-[0_0_8px_currentColor]"
              style={{ color: p.color }}
            >
              {p.shape === 'star' && (
                <svg
                  width={p.size * 1.5}
                  height={p.size * 1.5}
                  viewBox="0 0 24 24"
                  fill={p.color}
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              )}
              {p.shape === 'circle' && (
                <div
                  className="rounded-full shadow-lg"
                  style={{
                    width: `${p.size}px`,
                    height: `${p.size}px`,
                    backgroundColor: p.color
                  }}
                />
              )}
              {p.shape === 'diamond' && (
                <div
                  className="rotate-45 rounded-xs"
                  style={{
                    width: `${p.size * 1.1}px`,
                    height: `${p.size * 1.1}px`,
                    backgroundColor: p.color
                  }}
                />
              )}
              {p.shape === 'rect' && (
                <div
                  className="rounded-xs"
                  style={{
                    width: `${p.size * 1.6}px`,
                    height: `${p.size * 0.7}px`,
                    backgroundColor: p.color
                  }}
                />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CosmicConfetti;
