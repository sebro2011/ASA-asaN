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
      className={`p-6 transition-all duration-500 font-sans space-y-4 ${weather.bgColor} ${weather.neonGlow} ${className}`}
      edgeHighlight={true}
      hoverable={true}
    >
      {/* Top Banner */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-600 p-0.5 flex items-center justify-center shadow-lg">
            <Sun className="w-5 h-5 text-white animate-spin" style={{ animationDuration: '24s' }} />
          </div>
          <div>
            <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block font-semibold">
              NASA DONKI Space Weather Core
            </span>
            <h3 className="text-base font-bold font-['Orbitron'] text-white">
              Solar Weather AI Alert System
            </h3>
          </div>
        </div>

        {/* Live Kp Badge */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsLiveSimulating(!isLiveSimulating)}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-1.5 ${
              isLiveSimulating 
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-sm shadow-cyan-500/30' 
                : 'bg-white/[0.04] text-slate-300 border border-white/10 hover:text-white hover:bg-white/[0.08]'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLiveSimulating ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{isLiveSimulating ? 'Simulating' : 'Simulate Drift'}</span>
          </button>

          <div className={`px-3.5 py-1.5 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 shadow-md ${weather.badgeColor}`}>
            <StatusIcon className="w-4 h-4" />
            <span>Kp {kpIndex.toFixed(1)}: {weather.status.toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
        <div className="p-3.5 rounded-2xl liquid-glass liquid-glass-edge">
          <span className="text-slate-400 block text-[10px] mb-0.5">Planetary K-Index</span>
          <span className={`text-xl font-bold font-['Orbitron'] ${weather.color}`}>
            {kpIndex.toFixed(1)} / 9.0
          </span>
          <span className="text-slate-400 block text-[9px] mt-0.5">({weather.level})</span>
        </div>

        <div className="p-3.5 rounded-2xl liquid-glass liquid-glass-edge">
          <span className="text-slate-400 block text-[10px] mb-0.5">Solar Wind Speed</span>
          <span className="text-xl font-bold font-['Orbitron'] text-cyan-300">
            {solarWindSpeed} km/s
          </span>
          <span className="text-slate-400 block text-[9px] mt-0.5">(Interplanetary Solar Wind)</span>
        </div>

        <div className="p-3.5 rounded-2xl liquid-glass liquid-glass-edge">
          <span className="text-slate-400 block text-[10px] mb-0.5">Solar Flare Classification</span>
          <span className="text-xl font-bold font-['Orbitron'] text-amber-300">
            {kpIndex > 6 ? 'X1.4 Major' : kpIndex > 4 ? 'M2.1 Moderate' : 'C3.2 Baseline'}
          </span>
          <span className="text-slate-400 block text-[9px] mt-0.5">(GOES-16 Solar X-Ray)</span>
        </div>
      </div>

      {/* Primary Impact Description */}
      <div className="p-4 rounded-2xl liquid-glass space-y-2 text-xs">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
          <span className="font-bold flex items-center gap-1.5 text-cyan-300">
            <Radio className="w-4 h-4" />
            Atmospheric & Magnetospheric Assessment:
          </span>
          <span className="text-slate-400 font-mono text-[10px]">DSCOVR L1 Real-time Link</span>
        </div>
        <p className="text-slate-200 leading-relaxed font-sans text-xs sm:text-sm">
          {weather.description}
        </p>
        <div className="pt-2 border-t border-white/10 flex items-center gap-2 text-indigo-300 font-mono text-[11px]">
          <Compass className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>Aurora Zone: <strong className="text-white">{weather.auroraVisibility}</strong></span>
        </div>
      </div>

      {/* Mitigation Tips & Protocols */}
      <div className="p-4 rounded-2xl bg-indigo-950/25 border border-indigo-500/25 space-y-2">
        <span className="text-[11px] font-mono font-bold text-indigo-300 flex items-center gap-1.5 uppercase">
          <Zap className="w-3.5 h-3.5 text-indigo-400" />
          Recommended Operational Mitigation Protocols:
        </span>
        <ul className="space-y-1.5 text-xs text-slate-300 font-mono list-disc list-inside">
          {weather.mitigationTips.map((tip, idx) => (
            <li key={idx} className="leading-relaxed">
              <span className="text-slate-200">{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Interactive Kp Intensity Slider */}
      <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-400">
        <span className="flex items-center gap-1.5 text-slate-300">
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          Manual Kp Storm Index Testing:
        </span>
        <div className="flex items-center gap-3 w-full sm:w-64">
          <span className="text-[10px] text-slate-500">1.0</span>
          <input
            type="range"
            min="1.0"
            max="9.0"
            step="0.1"
            value={kpIndex}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setKpIndex(val);
              setSolarWindSpeed(Math.round(300 + val * 65));
            }}
            className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
          <span className="text-[10px] text-slate-500">9.0</span>
        </div>
      </div>
    </LiquidGlassCard>
  );
}
