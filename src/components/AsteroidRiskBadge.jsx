'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, AlertTriangle, AlertOctagon, Gauge, Ruler, Zap, Compass } from 'lucide-react';
import { calculateAsteroidRisk } from '../utils/asteroidRisk';

/**
 * AsteroidRiskBadge
 * Interactive Glassmorphic Gauge Card displaying deterministic risk percentage (0–100%)
 * based on NASA NeoWs API payload (Diameter 40%, Velocity 30%, Miss Distance 30%).
 * 
 * @param {Object} props
 * @param {Object} props.asteroid - Asteroid payload or metrics object
 * @param {string} [props.className='']
 */
export default function AsteroidRiskBadge({ asteroid, className = '' }) {
  const risk = calculateAsteroidRisk(asteroid || {});

  // Circumference for radial progress (radius = 36)
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (risk.score / 100) * circumference;

  const getStatusIcon = () => {
    if (risk.score >= 70) return <AlertOctagon className="w-4 h-4 text-rose-400" />;
    if (risk.score >= 40) return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    return <ShieldCheck className="w-4 h-4 text-emerald-400" />;
  };

  return (
    <div className={`rounded-3xl bg-slate-950/80 border border-slate-800 p-5 backdrop-blur-xl shadow-2xl font-sans space-y-4 ${className}`}>
      
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">
            <Gauge className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              NASA JPL Planetary Defense
            </span>
            <h4 className="text-sm font-bold font-['Orbitron'] text-white">
              {asteroid?.name || asteroid?.title || 'NeoWs Target Analysis'}
            </h4>
          </div>
        </div>

        {/* Status Badge */}
        <div className={`px-3 py-1 rounded-full border text-xs font-mono font-bold flex items-center gap-1.5 shadow-sm ${risk.levelColor}`}>
          {getStatusIcon()}
          <span>{risk.level.toUpperCase()}</span>
        </div>
      </div>

      {/* Main Meter Grid */}
      <div className="flex flex-col sm:flex-row items-center gap-6 justify-between">
        
        {/* Radial Animated Circular Gauge */}
        <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
          <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 96 96">
            {/* Background Track */}
            <circle
              cx="48"
              cy="48"
              r={radius}
              stroke="currentColor"
              strokeWidth="8"
              className="text-slate-800/80"
              fill="transparent"
            />
            {/* Animated Score Progress */}
            <motion.circle
              cx="48"
              cy="48"
              r={radius}
              stroke={risk.badgeColor}
              strokeWidth="8"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>

          {/* Centered Score Number */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-black font-['Orbitron'] text-white">
              {risk.score}
              <span className="text-xs text-slate-400 font-sans">%</span>
            </span>
            <span className="text-[9px] font-mono text-slate-400 uppercase">
              Hazard Index
            </span>
          </div>
        </div>

        {/* Weighted Sub-metrics Breakdown */}
        <div className="flex-1 w-full space-y-2 text-xs font-mono">
          
          {/* Diameter Factor (40%) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 flex items-center gap-1">
                <Ruler className="w-3.5 h-3.5 text-cyan-400" />
                Est. Diameter (40%)
              </span>
              <span className="text-slate-200 font-bold">
                {risk.diameterKm < 1 ? `${Math.round(risk.diameterKm * 1000)} m` : `${risk.diameterKm} km`}
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div 
                className="h-full bg-cyan-400 rounded-full transition-all duration-700" 
                style={{ width: `${risk.diameterScore}%` }}
              />
            </div>
          </div>

          {/* Relative Velocity Factor (30%) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Relative Velocity (30%)
              </span>
              <span className="text-slate-200 font-bold">
                {risk.velocityKmh.toLocaleString()} km/h
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div 
                className="h-full bg-amber-400 rounded-full transition-all duration-700" 
                style={{ width: `${risk.velocityScore}%` }}
              />
            </div>
          </div>

          {/* Miss Distance Factor (30%) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-indigo-400" />
                Miss Distance (30%)
              </span>
              <span className="text-slate-200 font-bold">
                {risk.missDistanceLd} Lunar Dist. ({Math.round(risk.missDistanceKm / 1000000).toFixed(1)}M km)
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div 
                className="h-full bg-indigo-400 rounded-full transition-all duration-700" 
                style={{ width: `${risk.distanceScore}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Footer */}
      <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-[11px] text-slate-300 font-mono">
        💡 {risk.statusText}
      </div>
    </div>
  );
}
