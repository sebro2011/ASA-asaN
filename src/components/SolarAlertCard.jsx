'use client';

import React, { useState, useEffect, memo } from 'react';
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
 */
function SolarAlertCard({ initialKp = 3.5, className = '' }) {
  const [kpIndex, setKpIndex] = useState(initialKp);
  const [solarFlareClass, setSolarFlareClass] = useState('C3.2');
  const [solarWindSpeed, setSolarWindSpeed] = useState(412);
  const [isLiveSimulating, setIsLiveSimulating] = useState(false);

  // Auto-simulate minor live telemetry drift every 45 seconds
  useEffect(() => {
    if (!isLiveSimulating) return;
    const interval = setInterval(() => {
      setKpIndex(prev => {
        const delta = (Math.random() - 0.5) * 0.4;
        return parseFloat(Math.max(1, Math.min(9, prev + delta)).toFixed(1));
      });
      setSolarWindSpeed(prev => Math.round(prev + (Math.random() - 0.5) * 8));
    }, 45000);
    return () => clearInterval(interval);
  }, [isLiveSimulating]);

  // Determine Kp Impact Level & Guidance
  const getSpaceWeatherStatus = (kp) => {
    if (kp >= 7.0) {
      return {
        level: 'Severe Alert (G3–G5)',
        status: 'Major Solar Storm',
        color: 'text-critical',
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
        color: 'text-caution',
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
      color: 'text-signal',
      bgColor: 'border-emerald-500/30',
      neonGlow: 'shadow-[0_0_25px_rgba(16,185,129,0.15)]',
      badgeColor: 'bg-emerald-500/20 text-signal border border-emerald-500/40',
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
    <div 
      className={`bg-surface/65 border border-line rounded-[14px] p-5 shadow-xl space-y-4 font-sans ${weather.bgColor} ${className}`}
    >
      {/* Top Banner */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-line pb-3">
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-[10px] bg-gradient-to-tr from-amber-500 to-rose-600 p-0.5 flex items-center justify-center shadow-md shrink-0">
            <Sun className="w-5 h-5 text-white animate-spin" style={{ animationDuration: '24s' }} />
          </div>
          <div>
            <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block font-semibold leading-none">
              NASA DONKI Space Weather Core
            </span>
            <h3 className="text-base font-bold font-display text-white leading-tight mt-1">
              Solar Weather Alert System
            </h3>
          </div>
        </div>

        {/* Live Kp Badge */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsLiveSimulating(!isLiveSimulating)}
            className={`px-3 py-1.5 rounded-[10px] text-xs font-mono font-bold transition cursor-pointer flex items-center gap-1.5 ${
              isLiveSimulating 
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-sm shadow-cyan-500/30' 
                : 'bg-surface-2 text-ink-2 border border-line hover:text-ink'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLiveSimulating ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{isLiveSimulating ? 'Simulating' : 'Simulate'}</span>
          </button>

          <div className={`px-3 py-1.5 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 shadow-md ${weather.badgeColor}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            <span>Kp {kpIndex.toFixed(1)}: {weather.status.toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
        <div className="p-3 rounded-[10px] bg-abyss/60 border border-line">
          <span className="text-ink-3 block text-[10px] uppercase mb-0.5">Planetary Kp</span>
          <span className={`text-base font-bold font-display ${weather.color}`}>
            {kpIndex.toFixed(1)} / 9.0
          </span>
          <span className="text-ink-4 block text-[10px] mt-0.5">({weather.level})</span>
        </div>

        <div className="p-3 rounded-[10px] bg-abyss/60 border border-line">
          <span className="text-ink-3 block text-[10px] uppercase mb-0.5">Solar Wind Speed</span>
          <span className="text-base font-bold font-display text-cyan-300">
            {solarWindSpeed} km/s
          </span>
          <span className="text-ink-4 block text-[10px] mt-0.5">DSCOVR L1 Realtime</span>
        </div>

        <div className="p-3 rounded-[10px] bg-abyss/60 border border-line">
          <span className="text-ink-3 block text-[10px] uppercase mb-0.5">Solar Flare Class</span>
          <span className="text-base font-bold font-display text-amber-300">
            {kpIndex > 6 ? 'X1.4 Major' : kpIndex > 4 ? 'M2.1 Moderate' : 'C3.2 Baseline'}
          </span>
          <span className="text-ink-4 block text-[10px] mt-0.5">GOES-16 X-Ray</span>
        </div>
      </div>

      {/* Clean In-Flow Primary Impact Description (No overlapping bars, 100% visible) */}
      <div className="p-4 rounded-[10px] bg-abyss/60 border border-line space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono text-ink-2">
          <span className="font-bold flex items-center gap-1.5 text-cyan-300">
            <Radio className="w-4 h-4 text-cyan-400" />
            Magnetospheric Assessment:
          </span>
          <span className="text-ink-3 font-mono text-[10px]">NOAA Space Weather Prediction</span>
        </div>

        <p className="text-ink-2 leading-relaxed font-sans text-xs sm:text-sm">
          {weather.description}
        </p>

        <div className="pt-2 border-t border-line flex items-center gap-2 text-indigo-300 font-mono text-xs">
          <Compass className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>Aurora Zone: <strong className="text-white">{weather.auroraVisibility}</strong></span>
        </div>
      </div>

      {/* Mitigation Tips */}
      <div className="p-3.5 rounded-[10px] bg-indigo-950/20 border border-indigo-500/20 space-y-1.5">
        <span className="text-[11px] font-mono font-bold text-indigo-300 flex items-center gap-1.5 uppercase">
          <Zap className="w-3.5 h-3.5 text-indigo-400" />
          Operational Mitigation Protocols:
        </span>
        <ul className="space-y-1 text-xs text-ink-2 font-mono list-disc list-inside">
          {weather.mitigationTips.map((tip, idx) => (
            <li key={idx} className="leading-snug">
              <span className="text-ink-2">{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Interactive Kp Intensity Slider */}
      <div className="pt-2 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-ink-3">
        <span className="flex items-center gap-1.5 text-ink-2">
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          Manual Kp Storm Index Testing:
        </span>
        <div className="flex items-center gap-3 w-full sm:w-64">
          <span className="text-[10px] text-ink-4">1.0</span>
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
            className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-surface-2 rounded-[8px]"
          />
          <span className="text-[10px] text-ink-4">9.0</span>
        </div>
      </div>
    </div>
  );
}

export default memo(SolarAlertCard);
