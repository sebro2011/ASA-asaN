'use client';

import React, { useState, useEffect, memo } from 'react';
import { 
  Sun, 
  AlertTriangle, 
  ShieldCheck, 
  ShieldAlert, 
  Radio, 
  Zap, 
  Compass, 
  Sliders, 
  RefreshCw 
} from 'lucide-react';
import { fetchSpaceWeather } from '@/lib/nasaApi';

/**
 * SolarWeather Component
 * 
 * Clean Cosmic Dark UI Space Weather Monitor:
 * - Natural in-flow text overlays without any absolute background clipping bars
 * - Description text and mitigation tips flow dynamically with full readability
 * - Real-time planetary Kp-index and solar wind telemetry simulation
 */
export function SolarWeather({ initialKp = 3.5, className = '', lang = 'en' }) {
  const [kpIndex, setKpIndex] = useState(initialKp);
  const [solarWindSpeed, setSolarWindSpeed] = useState(412);
  const [isLiveSimulating, setIsLiveSimulating] = useState(false);
  const [feedSource, setFeedSource] = useState('sample');

  // Fetch real-time space weather via central API pipeline on mount
  useEffect(() => {
    let mounted = true;
    async function loadSpaceWeather() {
      try {
        const sw = await fetchSpaceWeather();
        if (mounted && sw) {
          if (typeof sw.kpIndex === 'number') setKpIndex(sw.kpIndex);
          if (typeof sw.solarWindSpeedKmS === 'number') setSolarWindSpeed(sw.solarWindSpeedKmS);
          setFeedSource(sw._isSample ? 'sample' : 'live');
        }
      } catch {}
    }
    loadSpaceWeather();
    return () => { mounted = false; };
  }, []);

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
        borderColor: 'border-rose-500/40',
        badgeColor: 'bg-rose-500 text-white',
        icon: ShieldAlert,
        description: 'Major solar storm underway! High risk of satellite communications degradation, widespread high-frequency radio blackouts on the sunlit hemisphere, and electrical power grid voltage fluctuations across polar and temperate transmission corridors.',
        auroraVisibility: 'Mid-to-low latitudes (Down to ~45° geomagnetic latitude)',
        mitigationTips: [
          'Satellite operators: Enable payload safe mode & orbital drag corrections.',
          'Power grid dispatchers: Activate reactive power reserves and reduce transformer load.',
          'High-frequency radio: Reroute transpolar commercial aviation communications.'
        ]
      };
    }
    if (kp >= 5.0) {
      return {
        level: 'Moderate Watch (G1–G2)',
        status: 'Geomagnetic Storming',
        color: 'text-caution',
        borderColor: 'border-amber-500/40',
        badgeColor: 'bg-amber-500 text-slate-950 font-bold',
        icon: AlertTriangle,
        description: 'Moderate geomagnetic storming underway. Mild low-Earth orbit satellite orientation drag and auroral displays visible across higher temperate latitudes.',
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
      borderColor: 'border-line',
      badgeColor: 'bg-emerald-500/20 text-signal border border-emerald-500/40',
      icon: ShieldCheck,
      description: 'Quiet magnetospheric conditions. Solar wind speeds and interplanetary magnetic flux are within nominal baselines with stable transpolar radio propagation and zero satellite orbital perturbations.',
      auroraVisibility: 'Limited to extreme polar caps (Greenland, Svalbard, Antarctica)',
      mitigationTips: [
        'All orbital satellite transponders operating at standard baseline.',
        'Ionospheric D-region absorption nominal.',
        'Solar radiation levels within safe astronaut EVA parameters.'
      ]
    };
  };

  const weather = getSpaceWeatherStatus(kpIndex);
  const StatusIcon = weather.icon;

  return (
    <div 
      className={`bg-surface/65 border border-line rounded-[14px] p-5 shadow-xl space-y-4 font-sans text-ink ${weather.borderColor} ${className}`}
    >
      {/* Top Banner - In-flow flex header */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-line pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-caution/30 bg-caution/10">
            <Sun className="h-5 w-5 text-caution" strokeWidth={1.7} />
          </div>
          <div>
            <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-atmo">
              {feedSource === 'live' ? 'NOAA SWPC feed' : 'Simulated conditions'}
            </span>
            <h3 className="mt-1 font-display text-base font-bold leading-tight text-ink">
              Space weather monitor
            </h3>
          </div>
        </div>

        {/* Live Kp Badge & Simulation Control */}
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

      {/* Main Telemetry Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
        <div className="rounded-[10px] border border-line bg-abyss/60 p-3.5">
          <span className="mb-0.5 block text-[10px] uppercase text-ink-3">
            {feedSource === 'live' ? 'Planetary Kp' : 'Planetary Kp (simulated)'}
          </span>
          <span className={`text-base font-bold font-display ${weather.color}`}>
            {kpIndex.toFixed(1)} / 9.0
          </span>
          <span className="text-ink-4 block text-[10px] mt-0.5">({weather.level})</span>
        </div>

        <div className="p-3.5 rounded-[10px] bg-abyss/60 border border-line">
          <span className="text-ink-3 block text-[10px] uppercase mb-0.5">Solar Wind Speed</span>
          <span className="text-base font-bold font-display text-cyan-300">
            {solarWindSpeed} km/s
          </span>
          <span className="mt-0.5 block text-[10px] text-ink-4">
            {feedSource === 'live' ? 'NOAA SWPC via server' : 'Bundled reference value'}
          </span>
        </div>

        <div className="rounded-[10px] border border-line bg-abyss/60 p-3.5">
          <span className="mb-0.5 block text-[10px] uppercase text-ink-3">Flare class</span>
          <span className="text-base font-bold text-ink-3">not provided</span>
          <span className="mt-0.5 block text-[10px] text-ink-4">
            GOES X-ray flux is not fetched by this endpoint
          </span>
        </div>
      </div>

      {/* Natural In-Flow Description Box - 100% visible text without any absolute clipping bars */}
      <div className="p-4 rounded-[10px] bg-abyss/60 border border-line space-y-2.5">
        <div className="flex items-center justify-between text-[11px] font-mono text-ink-2">
          <span className="font-bold flex items-center gap-1.5 text-cyan-300">
            <Radio className="w-4 h-4 text-cyan-400" />
            Magnetospheric Assessment:
          </span>
          <span className="font-mono text-[10px] text-ink-4">Kp-based outlook</span>
        </div>

        {/* Text flows naturally with unrestricted height */}
        <p className="text-ink-2 leading-relaxed font-sans text-xs sm:text-sm">
          {weather.description}
        </p>

        <div className="pt-2 border-t border-line flex items-center gap-2 text-indigo-300 font-mono text-xs">
          <Compass className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>Aurora Visibility Zone: <strong className="text-white">{weather.auroraVisibility}</strong></span>
        </div>
      </div>

      {/* Operational Mitigation Protocols - In-flow list */}
      <div className="p-4 rounded-[10px] bg-indigo-950/20 border border-indigo-500/20 space-y-2">
        <span className="text-[11px] font-mono font-bold text-indigo-300 flex items-center gap-1.5 uppercase">
          <Zap className="w-3.5 h-3.5 text-indigo-400" />
          Operational Mitigation Protocols:
        </span>
        <ul className="space-y-1.5 text-xs text-ink-2 font-mono list-disc list-inside">
          {weather.mitigationTips.map((tip, idx) => (
            <li key={idx} className="leading-relaxed">
              <span className="text-ink-2">{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Manual Slider for Kp Index Testing */}
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

export default memo(SolarWeather);
