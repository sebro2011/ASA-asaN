'use client';

import React, { useEffect, useRef } from 'react';

/**
 * LiquidGlassFilter Component
 * Subtle, ultra-smooth SVG Displacement Refraction Filter (scale: 3.0)
 * Designed strictly for separate absolute background layers to never distort text.
 */
export default function LiquidGlassFilter() {
  const displacementRef = useRef(null);

  useEffect(() => {
    let animationFrameId;
    let targetScale = 3.0;
    let currentScale = 3.0;

    const handleMouseMove = (e) => {
      // Subtle edge warp modulation capped at max 3.5
      const speed = Math.min(1.0, (Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0)) / 20);
      targetScale = 2.8 + speed * 0.7; // Range: 2.8 - 3.5
    };

    const handleScroll = () => {
      targetScale = 3.4;
    };

    const animate = () => {
      targetScale = targetScale * 0.95 + 3.0 * 0.05;
      currentScale += (targetScale - currentScale) * 0.1;

      if (displacementRef.current) {
        displacementRef.current.setAttribute('scale', currentScale.toFixed(2));
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <svg 
      className="pointer-events-none absolute w-0 h-0 overflow-hidden" 
      aria-hidden="true" 
      style={{ position: 'absolute', width: 0, height: 0 }}
    >
      <defs>
        <filter 
          id="liquid-glass-refraction" 
          x="-10%" 
          y="-10%" 
          width="120%" 
          height="120%" 
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence 
            type="fractalNoise" 
            baseFrequency="0.015 0.015" 
            numOctaves="2" 
            seed="5" 
            result="turbulenceNoise" 
          />
          <feDisplacementMap 
            ref={displacementRef}
            in="SourceGraphic" 
            in2="turbulenceNoise" 
            scale="3" 
            xChannelSelector="R" 
            yChannelSelector="G" 
            result="displacedGraphic" 
          />
          <feMerge>
            <feMergeNode in="displacedGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}
