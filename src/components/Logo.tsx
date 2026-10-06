'use client';

import React, { useState } from 'react';

export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | number;

export interface LogoProps {
  size?: LogoSize;
  className?: string;
  pulse?: boolean;
  withGlow?: boolean;
  alt?: string;
  priority?: boolean;
  showLabel?: boolean;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const SIZES: Record<string, { width: number; height: number; className: string }> = {
  xs: { width: 24, height: 24, className: 'w-6 h-6' },
  sm: { width: 36, height: 36, className: 'w-9 h-9' },
  md: { width: 48, height: 48, className: 'w-12 h-12' },
  lg: { width: 64, height: 64, className: 'w-16 h-16' },
  xl: { width: 96, height: 96, className: 'w-24 h-24' },
  '2xl': { width: 128, height: 128, className: 'w-32 h-32' }
};

export const Logo: React.FC<LogoProps> = ({
  size = 'md',
  className = '',
  pulse = false,
  withGlow = true,
  alt = 'NASA Web App Logo',
  priority = false,
  showLabel = false,
  onClick
}) => {
  const [hasError, setHasError] = useState(false);
  const sizeConfig = typeof size === 'string' && SIZES[size] ? SIZES[size] : SIZES.md;
  const customDimension = typeof size === 'number' ? size : sizeConfig.width;

  const glowClass = withGlow ? 'drop-shadow-[0_0_12px_rgba(34,211,238,0.3)]' : '';
  const pulseClass = pulse ? 'animate-pulse duration-1000' : '';

  return (
    <div 
      className={`inline-flex items-center gap-3 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div 
        className={`relative flex items-center justify-center shrink-0 transition-transform duration-300 hover:scale-105 ${glowClass} ${pulseClass}`}
        style={{ width: customDimension, height: customDimension }}
      >
        {!hasError ? (
          <img
            src="/logo.png"
            alt={alt}
            width={customDimension}
            height={customDimension}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            onError={() => setHasError(true)}
            className="w-full h-full object-contain filter drop-shadow-[0_0_12px_rgba(34,211,238,0.3)] rounded-xl"
          />
        ) : (
          /* High-Fidelity SVG Fallback matching NASA Web App Rocket Badge */
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full drop-shadow-[0_0_12px_rgba(34,211,238,0.4)]"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Dark Blue Outer Circle */}
            <circle cx="50" cy="50" r="46" fill="#0B1E48" />
            
            {/* Central Planet Sphere */}
            <circle cx="50" cy="46" r="22" fill="#2F80ED" />
            
            {/* White Planetary Orbit Ring */}
            <ellipse 
              cx="50" 
              cy="48" 
              rx="36" 
              ry="14" 
              stroke="#FFFFFF" 
              strokeWidth="4" 
              transform="rotate(-18 50 48)" 
            />
            
            {/* White Rocket Plume */}
            <path 
              d="M47 52 Q50 68 45 84 L55 84 Q50 68 53 52 Z" 
              fill="#FFFFFF" 
            />
            
            {/* Red Rocket Wings */}
            <path 
              d="M38 52 L45 36 L47 48 Z" 
              fill="#EB5757" 
            />
            <path 
              d="M62 52 L55 36 L53 48 Z" 
              fill="#EB5757" 
            />
            
            {/* White Rocket Fuselage */}
            <path 
              d="M45 48 C45 30 50 20 50 20 C50 20 55 30 55 48 Z" 
              fill="#FFFFFF" 
            />
            
            {/* Red Rocket Nose Cone */}
            <path 
              d="M47 30 C47 24 50 20 50 20 C50 20 53 24 53 30 Z" 
              fill="#EB5757" 
            />
            
            {/* Rocket Center Porthole */}
            <circle cx="50" cy="35" r="3.5" fill="#0B1E48" />
          </svg>
        )}
      </div>

      {showLabel && (
        <div className="flex flex-col text-left">
          <span className="font-['Orbitron'] font-black text-white text-base md:text-lg tracking-wider bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
            NASA
          </span>
          <span className="text-[10px] font-mono tracking-widest text-cyan-400 font-semibold uppercase -mt-0.5">
            WEB APP
          </span>
        </div>
      )}
    </div>
  );
};

export default Logo;
