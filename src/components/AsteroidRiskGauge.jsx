'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, ShieldCheck, AlertTriangle, Activity, Ruler, Zap, Compass } from 'lucide-react';
import { calculateAsteroidRisk } from '../utils/calculateAsteroidRisk';
import { useTrilingual } from '../context/TrilingualProvider';
import { LiquidGlassCard } from './LiquidGlassCard.jsx';

/**
 * AsteroidRiskGauge Component
 * Glassmorphic SVG radial gauge rendering the deterministic 0-100% PHA risk score.
 */
export function AsteroidRiskGauge({ asteroid, className = '' }) {
  const trilingual = useTrilingual ? useTrilingual() : null;
  const lang = trilingual?.lang || 'en';

  const assessment = useMemo(() => {
    return calculateAsteroidRisk(asteroid);
  }, [asteroid]);

  const { riskScore, tier, color, glowColor, factors, details } = assessment;

  // SVG Radial Gauge Calculations
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (riskScore / 100) * circumference;

  const localizedTier = assessment.tierLabel[lang] || assessment.tierLabel.en;

  return (
    <LiquidGlassCard 
      className={`p-6 font-sans space-y-4 ${className}`}
      edgeHighlight={true}
      hoverable={true}
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2.5">
          {tier === 'CRITICAL' && <ShieldAlert className="w-5 h-5 text-rose-500 animate-pulse" />}
          {tier === 'MODERATE' && <AlertTriangle className="w-5 h-5 text-amber-400" />}
          {tier === 'LOW' && <ShieldCheck className="w-5 h-5 text-emerald-400" />}
          <div>
            <h4 className="font-['Orbitron'] font-bold text-xs uppercase tracking-wider text-white">
              Asteroid Hazard Index
            </h4>
            <p className="text-[10px] font-mono text-slate-400">
              Deterministic 0–100% Impact Assessment
            </p>
          </div>
        </div>

        <span
          className="px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wide uppercase shadow-sm"
          style={{
            backgroundColor: `${color}18`,
            color: color,
            borderColor: `${color}50`,
            borderWidth: '1px'
          }}
        >
          {localizedTier}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 justify-around">
        {/* Radial SVG Gauge */}
        <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            {/* Background Track */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="transparent"
              stroke="#1e293b"
              strokeWidth="10"
            />
            {/* Animated Value Arc */}
            <motion.circle
              cx="60"
              cy="60"
              r={radius}
              fill="transparent"
              stroke={color}
              strokeWidth="10"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 8px ${glowColor})` }}
            />
          </svg>

          {/* Central Score readout */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="font-['Orbitron'] text-3xl font-black text-white tracking-tight">
              {riskScore}%
            </span>
            <span className="text-[9px] font-mono uppercase tracking-widest text-slate-400 -mt-1">
              RISK SCORE
            </span>
          </div>
        </div>

        {/* Breakdown Factors Metric Bars */}
        <div className="flex-1 w-full space-y-2.5 text-xs font-mono">
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-slate-400 flex items-center gap-1">
                <Ruler className="w-3 h-3 text-cyan-400" />
                Diameter Weight ({details.diameterKm} km)
              </span>
              <span className="text-slate-200 font-bold">{factors.diameterScore}/40</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-900/90 overflow-hidden border border-white/10">
              <div
                className="h-full rounded-full bg-cyan-400 transition-all duration-700 shadow-sm"
                style={{ width: `${(factors.diameterScore / 40) * 100}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-slate-400 flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-400" />
                Velocity Vector ({details.velocityKmh.toLocaleString()} km/h)
              </span>
              <span className="text-slate-200 font-bold">{factors.velocityScore}/30</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-900/90 overflow-hidden border border-white/10">
              <div
                className="h-full rounded-full bg-amber-400 transition-all duration-700 shadow-sm"
                style={{ width: `${(factors.velocityScore / 30) * 100}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-slate-400 flex items-center gap-1">
                <Compass className="w-3 h-3 text-indigo-400" />
                Miss Distance ({details.lunarDistanceRatio} LD)
              </span>
              <span className="text-slate-200 font-bold">{factors.proximityScore}/30</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-900/90 overflow-hidden border border-white/10">
              <div
                className="h-full rounded-full bg-indigo-400 transition-all duration-700 shadow-sm"
                style={{ width: `${(factors.proximityScore / 30) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </LiquidGlassCard>
  );
}

export default AsteroidRiskGauge;
