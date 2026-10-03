'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LiquidGlassCard } from './LiquidGlassCard.jsx';
import { 
  Sun, 
  AlertTriangle, 
  ShieldAlert, 
  ShieldCheck, 
  Activity, 
  Radio, 
  Zap, 
  Sliders, 
  RefreshCw,
  Compass
} from 'lucide-react';

/**
 * SolarAlertCard
 * Solar Weather AI Alert System mapping Kp-Index & Coronal Mass Ejections (CMEs)
 * to real-time space weather impact levels, aurora visibility, and grid mitigation tips.
 */
export default function SolarAlertCard({ initialKp = 3.5, className = '' }) {
  const [kpIndex, setKpIndex] = useState(initialKp);
  const [solarFlareClass, setSolarFlareClass] = useState('C3.2');
  const [solarWindSpeed, setSolarWindSpeed] = useState(412);
  const [isLiveSimulating, setIsLiveSimulating] = useState(false);

  // Auto-simulate minor live telemetry drift for visual fidelity
  useEffect(() => {
    if (!isLiveSimulating) return;
    const interval = setInterval(() => {
      setKpIndex(prev => {
        const delta = (Math.random() - 0.5) * 0.4;
        return parseFloat(Math.max(1, Math.min(9, prev + delta)).toFixed(1));
      });
      setSolarWindSpeed(prev => Math.round(prev + (Math.random() - 0.5) * 8));
    }, 3000);
    return () => clearInterval(interval);
  }, [isLiveSimulating]);

  // Determine Kp Impact Level & Guidance
  const getSpaceWeatherStatus = (kp) => {
    if (kp >= 7.0) {
      return {
        level: 'Severe Alert (G3–G5)',
        status: 'Major Solar Storm',
        color: 'text-rose-400',
        bgColor: 'border-rose-500/40',
        neonGlow: 'shadow-[0_0_35px_rgba(244,63,94,0.3)]',
        badgeColor: 'bg-rose-500 text-white',
        icon: ShieldAlert,
        description: 'Major solar storm! High risk of satellite communications degradation, widespread HF radio blackouts, and electrical power grid voltage fluctuations.',
        auroraVisibility: 'Mid-to-low latitudes (Down to ~45° geomagnetic latitude)',
        mitigationTips: [
          'Satellite operators: Enable payload safe mode & orbital drag corrections.',
          'Power grid dispatchers: Activate reactive power reserves.',
          'High-frequency radio: Reroute transpolar aviation communications.'
        ]
      };
    }
    if (kp >= 5.0) {
      return {
        level: 'Moderate Watch (G1–G2)',
        status: 'Geomagnetic Storming',
        color: 'text-amber-400',
        bgColor: 'border-amber-500/40',
        neonGlow: 'shadow-[0_0_30px_rgba(245,158,11,0.25)]',
        badgeColor: 'bg-amber-500 text-slate-950 font-bold',
        icon: AlertTriangle,
        description: 'Moderate storming underway. Mild satellite orientation drag and auroral displays visible across higher temperate latitudes.',
        auroraVisibility: 'High-latitude regions (Northern US, Scandinavia, Southern New Zealand)',
        mitigationTips: [
          'Monitor low-Earth orbit constellation telemetry.',
          'Prepare for HF radio signal fading on daylight side.',
          'Check GPS navigational differential corrections.'
        ]
      };
    }
    return {
      level: 'Nominal Condition (G0)',
      status: 'Quiet Space Weather',
      color: 'text-emerald-400',
      bgColor: 'border-emerald-500/30',
      neonGlow: 'shadow-[0_0_25px_rgba(16,185,129,0.15)]',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
      icon: ShieldCheck,
      description: 'Quiet magnetospheric conditions. Solar wind speeds and magnetic flux are within nominal interplanetary baselines.',
      auroraVisibility: 'Limited to extreme polar caps (Greenland, Svalbard)',
      mitigationTips: [
        'All orbital satellite transponders operating at standard margins.',
        'Ionospheric D-region absorption nominal.',
        'Solar radiation storm levels at safe astronaut EVA baseline.'
      ]
    };
  };

  const weather = getSpaceWeatherStatus(kpIndex);
  const StatusIcon = weather.icon;

  return (
    <LiquidGlassCard 
      className={`px-5 py-4 max-h-[250px] transition-all duration-500 font-sans space-y-3 ${weather.bgColor} ${weather.neonGlow} ${className}`}
      edgeHighlight={true}
      hoverable={true}
      padding="py-4 px-5"
    >
      {/* Top Banner */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-600 p-0.5 flex items-center justify-center shadow-md shrink-0">
            <Sun className="w-4 h-4 text-white animate-spin" style={{ animationDuration: '24s' }} />
          </div>
          <div>
            <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider block font-semibold leading-none">
              NASA DONKI Space Weather Core
            </span>
            <h3 className="text-sm font-bold font-['Orbitron'] text-white leading-tight">
              Solar Weather AI Alert System
            </h3>
          </div>
        </div>

        {/* Live Kp Badge */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsLiveSimulating(!isLiveSimulating)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition cursor-pointer flex items-center gap-1 ${
              isLiveSimulating 
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-sm shadow-cyan-500/30' 
                : 'bg-white/[0.04] text-slate-300 border border-white/10 hover:text-white hover:bg-white/[0.08]'
            }`}
          >
            <RefreshCw className={`w-3 h-3 ${isLiveSimulating ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{isLiveSimulating ? 'Simulating' : 'Simulate'}</span>
          </button>

          <div className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold flex items-center gap-1 shadow-md ${weather.badgeColor}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            <span>Kp {kpIndex.toFixed(1)}: {weather.status.toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* Main Content Area with internal scroll wrapper */}
      <div className="overflow-y-auto max-h-[140px] space-y-2.5 pr-1 text-xs">
        {/* Main Stats Grid */}
        <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
          <div className="p-2 rounded-xl apple-liquid-glass">
            <span className="text-slate-400 block text-[9px] leading-none mb-0.5">Planetary Kp</span>
            <span className={`text-sm font-bold font-['Orbitron'] ${weather.color}`}>
              {kpIndex.toFixed(1)} / 9.0
            </span>
          </div>

          <div className="p-2 rounded-xl apple-liquid-glass">
            <span className="text-slate-400 block text-[9px] leading-none mb-0.5">Solar Wind</span>
            <span className="text-sm font-bold font-['Orbitron'] text-cyan-300">
              {solarWindSpeed} km/s
            </span>
          </div>

          <div className="p-2 rounded-xl apple-liquid-glass">
            <span className="text-slate-400 block text-[9px] leading-none mb-0.5">X-Ray Flare</span>
            <span className="text-sm font-bold font-['Orbitron'] text-amber-300">
              {kpIndex > 6 ? 'X1.4' : kpIndex > 4 ? 'M2.1' : 'C3.2'}
            </span>
          </div>
        </div>

        {/* Primary Impact Description */}
        <div className="p-2.5 rounded-xl apple-liquid-glass space-y-1 text-xs">
          <p className="text-slate-200 leading-relaxed font-sans text-xs">
            {weather.description}
          </p>
          <div className="pt-1 border-t border-white/10 flex items-center gap-1.5 text-indigo-300 font-mono text-[10px]">
            <Compass className="w-3 h-3 text-indigo-400 shrink-0" />
            <span>Aurora Zone: <strong className="text-white">{weather.auroraVisibility}</strong></span>
          </div>
        </div>

        {/* Mitigation Tips */}
        <div className="p-2.5 rounded-xl bg-indigo-950/25 border border-indigo-500/25 space-y-1">
          <span className="text-[10px] font-mono font-bold text-indigo-300 flex items-center gap-1 uppercase">
            <Zap className="w-3 h-3 text-indigo-400" />
            Operational Mitigation:
          </span>
          <ul className="space-y-0.5 text-[11px] text-slate-300 font-mono list-disc list-inside">
            {weather.mitigationTips.map((tip, idx) => (
              <li key={idx} className="leading-snug">
                <span className="text-slate-200">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </LiquidGlassCard>
  );
}
