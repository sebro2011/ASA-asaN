'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
 * 
 * @param {Object} props
 * @param {number} [props.initialKp=3.5]
 * @param {string} [props.className='']
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
        bgColor: 'bg-rose-500/10 border-rose-500/40',
        neonGlow: 'shadow-[0_0_30px_rgba(244,63,94,0.25)]',
        badgeColor: 'bg-rose-500 text-white',
        icon: ShieldAlert,
        description: 'Major solar storm! High risk of satellite communications degradation, widespread HF radio blackouts, and electrical power grid voltage fluctuations.',
        auroraVisibility: 'Mid-to-low latitudes (Down to ~45° geomagnetic latitude)',
        mitigationTips: [
          'Satellite operators: Enable payload safe mode & orbital drag corrections.',
          'Power utilities: Monitor geomagnetic induced currents (GIC) on transformers.',
          'Aviation: Reroute polar flights away from HF communication degradation.'
        ]
      };
    }

    if (kp >= 5.0) {
      return {
        level: 'Moderate Warning (G1–G2)',
        status: 'Geomagnetic Storm Watch',
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10 border-amber-500/40',
        neonGlow: 'shadow-[0_0_25px_rgba(245,158,11,0.2)]',
        badgeColor: 'bg-amber-500 text-slate-950 font-bold',
        icon: AlertTriangle,
        description: 'Minor-to-moderate geomagnetic storm. Potential high-latitude auroras, localized GPS positioning drift, and weak power grid fluctuations.',
        auroraVisibility: 'High latitudes (Canada, Scandinavia, Alaska, Northern UK)',
        mitigationTips: [
          'GNSS / GPS users: Expect minor positioning inaccuracies.',
          'Amateur radio: Degraded HF propagation on nightside paths.',
          'Skywatchers: Prime conditions for vibrant Aurora Borealis displays.'
        ]
      };
    }

    return {
      level: 'Nominal Condition (G0)',
      status: 'Space Weather Calm',
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10 border-emerald-500/30',
      neonGlow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
      icon: ShieldCheck,
      description: 'Space weather calm. Satellites, power grids, and trans-polar communication channels operating under normal planetary baselines.',
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
    <div className={`rounded-3xl bg-slate-950/90 border p-5 backdrop-blur-xl transition-all duration-500 font-sans space-y-4 ${weather.bgColor} ${weather.neonGlow} ${className}`}>
      
      {/* Top Banner */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="relative w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-600 p-0.5 flex items-center justify-center shadow-lg">
            <Sun className="w-5 h-5 text-white animate-spin-slow" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
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
            className={`px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold border transition cursor-pointer flex items-center gap-1 ${
              isLiveSimulating 
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400' 
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            <RefreshCw className={`w-3 h-3 ${isLiveSimulating ? 'animate-spin' : ''}`} />
            <span>{isLiveSimulating ? 'Simulating' : 'Simulate Drift'}</span>
          </button>

          <div className={`px-3 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 shadow-md ${weather.badgeColor}`}>
            <StatusIcon className="w-4 h-4" />
            <span>Kp {kpIndex.toFixed(1)}: {weather.status.toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
        <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span className="text-slate-400 block text-[10px] mb-0.5">Planetary K-Index</span>
          <span className={`text-lg font-bold font-['Orbitron'] ${weather.color}`}>
            {kpIndex.toFixed(1)} / 9.0
          </span>
          <span className="text-slate-500 block text-[9px] mt-0.5">({weather.level})</span>
        </div>

        <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span className="text-slate-400 block text-[10px] mb-0.5">Solar Wind Speed</span>
          <span className="text-lg font-bold font-['Orbitron'] text-cyan-300">
            {solarWindSpeed} km/s
          </span>
          <span className="text-slate-500 block text-[9px] mt-0.5">(Interplanetary Solar Wind)</span>
        </div>

        <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span className="text-slate-400 block text-[10px] mb-0.5">Solar Flare Classification</span>
          <span className="text-lg font-bold font-['Orbitron'] text-amber-300">
            {kpIndex > 6 ? 'X1.4 Major' : kpIndex > 4 ? 'M2.1 Moderate' : 'C3.2 Baseline'}
          </span>
          <span className="text-slate-500 block text-[9px] mt-0.5">(GOES-16 Solar X-Ray)</span>
        </div>
      </div>

      {/* Primary Impact Description */}
      <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1.5 text-xs">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
          <span className="font-bold flex items-center gap-1.5 text-cyan-300">
            <Radio className="w-3.5 h-3.5" />
            Atmospheric & Magnetospheric Assessment:
          </span>
          <span className="text-slate-400 text-[10px]">
            Aurora: {weather.auroraVisibility}
          </span>
        </div>
        <p className="text-slate-300 leading-relaxed font-sans text-xs">
          {weather.description}
        </p>
      </div>

      {/* Mitigation Action Protocol Checklist */}
      <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2 text-xs font-mono">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-bold">
          Operational Mitigation Protocols:
        </span>
        <ul className="space-y-1 text-slate-300 text-[11px]">
          {weather.mitigationTips.map((tip, idx) => (
            <li key={idx} className="flex items-start gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                kpIndex >= 7 ? 'bg-rose-400' : kpIndex >= 5 ? 'bg-amber-400' : 'bg-emerald-400'
              }`} />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Interactive Kp Index Testing Slider */}
      <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-4 text-xs font-mono">
        <span className="text-slate-400 text-[10px] flex items-center gap-1 shrink-0">
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          Test Kp Level:
        </span>
        <input
          type="range"
          min="0"
          max="9"
          step="0.5"
          value={kpIndex}
          onChange={(e) => setKpIndex(parseFloat(e.target.value))}
          className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
        />
        <div className="flex items-center gap-1 shrink-0">
          {[2, 5.5, 8.5].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setKpIndex(preset)}
              className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] text-slate-300 hover:text-white cursor-pointer"
            >
              Kp {preset < 4 ? 'Nominal' : preset < 7 ? 'Warning' : 'Storm'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
