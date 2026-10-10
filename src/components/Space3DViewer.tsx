import React, { useState } from 'react';
import { SupportedLanguage } from '../i18n/translations';
import SpaceLab3D from './SpaceLab3D.jsx';
import CelestialLab3D from './CelestialLab3D.jsx';
import ARStarMap from './ARStarMap.jsx';
import LightweightEarthFallback from './LightweightEarthFallback';
import { useDevicePerformance } from '../hooks/useDevicePerformance';
import { Orbit, Sparkles, Compass, Zap, Cpu } from 'lucide-react';

interface Space3DViewerProps {
  lang: SupportedLanguage;
}

export const Space3DViewer: React.FC<Space3DViewerProps> = React.memo(({ lang }) => {
  const [labMode, setLabMode] = useState<'focused' | 'full' | 'starmap'>('focused');
  
  const {
    isOptimizedModeActive,
    reason,
    cores,
    memoryGB,
    setUserMode
  } = useDevicePerformance();

  return (
    <div className="w-full space-y-6">
      {/* Sub-navigation mode & Hardware Performance Optimizer Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 apple-liquid-glass p-4 sm:p-5 rounded-2xl">
        <div className="flex items-center gap-2.5">
          <div className={`w-2.5 h-2.5 rounded-full ${isOptimizedModeActive ? 'bg-emerald-400' : 'bg-cyan-400'} animate-ping`} />
          <span className="text-xs font-mono text-cyan-300 font-semibold uppercase tracking-wider">
            {lang === 'si' 
              ? '3D සහ AR අන්තර්ක්‍රියාකාරී ගවේෂණ විද්‍යාගාරය' 
              : lang === 'ta' 
              ? '3D & AR ஊடாடும் விண்வெளி ஆய்வகம்' 
              : 'Interactive 3D & AR Space Observation Lab'}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Performance Mode Switcher Pill */}
          <button
            type="button"
            onClick={() => setUserMode(isOptimizedModeActive ? 'high' : 'optimized')}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-mono font-bold flex items-center gap-1.5 border transition cursor-pointer ${
              isOptimizedModeActive
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30'
            }`}
            title="Click to toggle between Eco Parallax Mode and Full WebGL 3D Canvas"
          >
            {isOptimizedModeActive ? (
              <>
                <Zap className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>ECO PARALLAX ({cores} CORES)</span>
              </>
            ) : (
              <>
                <Orbit className="w-3.5 h-3.5 text-cyan-400" />
                <span>3D WEBGL ({cores} CORES)</span>
              </>
            )}
          </button>

          {/* Sub-mode buttons for full 3D Canvas mode */}
          {!isOptimizedModeActive && (
            <div className="flex items-center gap-1.5 apple-liquid-glass p-1 rounded-xl flex-wrap">
              <button
                type="button"
                onClick={() => setLabMode('starmap')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  labMode === 'starmap'
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/30 font-bold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Compass className="w-3.5 h-3.5 text-cyan-300" />
                <span>{lang === 'si' ? 'AR තාරකා' : lang === 'ta' ? 'AR விண்மீன்' : 'AR Star Map'}</span>
              </button>
              <button
                type="button"
                onClick={() => setLabMode('focused')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  labMode === 'focused'
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/30 font-bold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {lang === 'si' ? 'අඟහරු • සඳ • JWST' : lang === 'ta' ? 'செவ்வாய் • நிலவு' : 'Mars • Moon • JWST'}
              </button>
              <button
                type="button"
                onClick={() => setLabMode('full')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  labMode === 'full'
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/30 font-bold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {lang === 'si' ? 'සම්පූර්ණ පද්ධතිය' : lang === 'ta' ? 'முழு அமைப்பு' : 'Full Celestial System'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Conditional 3D Rendering:
          Low-end/mobile device -> Lightweight CSS Parallax Earth fallback
          High-end desktop/tablet -> Full Three.js 3D WebGL Canvas */}
      {isOptimizedModeActive ? (
        <LightweightEarthFallback
          lang={lang}
          hardwareReason={reason}
          cores={cores}
          memoryGB={memoryGB}
          onLaunchFull3D={() => setUserMode('high')}
        />
      ) : (
        <>
          {labMode === 'starmap' ? (
            <ARStarMap lang={lang} />
          ) : labMode === 'focused' ? (
            <SpaceLab3D lang={lang} />
          ) : (
            <CelestialLab3D lang={lang} />
          )}
        </>
      )}
    </div>
  );
});

export default Space3DViewer;
