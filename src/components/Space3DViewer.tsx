import React, { useState } from 'react';
import { SupportedLanguage } from '../i18n/translations';
import SpaceLab3D from './SpaceLab3D.jsx';
import CelestialLab3D from './CelestialLab3D.jsx';
import ARStarMap from './ARStarMap.jsx';
import { Orbit, Sparkles, Compass } from 'lucide-react';

interface Space3DViewerProps {
  lang: SupportedLanguage;
}

export const Space3DViewer: React.FC<Space3DViewerProps> = ({ lang }) => {
  const [labMode, setLabMode] = useState<'focused' | 'full' | 'starmap'>('starmap');

  return (
    <div className="w-full space-y-4">
      {/* Sub-navigation mode switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-2.5 rounded-2xl border border-slate-800 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          <span className="text-xs font-mono text-cyan-300 font-semibold uppercase tracking-wider">
            {lang === 'si' 
              ? '3D සහ AR අන්තර්ක්‍රියාකාරී ගවේෂණ විද්‍යාගාරය' 
              : lang === 'ta' 
              ? '3D & AR ஊடாடும் விண்வெளி ஆய்வகம்' 
              : 'Interactive 3D & AR Space Observation Lab'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800 flex-wrap">
          <button
            onClick={() => setLabMode('starmap')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              labMode === 'starmap'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-cyan-300" />
            <span>{lang === 'si' ? 'AR තාරකා සිතියම' : lang === 'ta' ? 'AR விண்மீன் வரைபடம்' : 'AR Star Map'}</span>
          </button>
          <button
            onClick={() => setLabMode('focused')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              labMode === 'focused'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {lang === 'si' ? 'අඟහරු • සඳ • JWST' : lang === 'ta' ? 'செவ்வாய் • நிலவு • JWST' : 'Mars • Moon • JWST (Focused)'}
          </button>
          <button
            onClick={() => setLabMode('full')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              labMode === 'full'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {lang === 'si' ? 'සම්පූර්ණ පද්ධතිය' : lang === 'ta' ? 'முழு அமைப்பு' : 'Full Celestial System'}
          </button>
        </div>
      </div>

      {/* Render the selected Lab Component */}
      {labMode === 'starmap' ? (
        <ARStarMap lang={lang} />
      ) : labMode === 'focused' ? (
        <SpaceLab3D lang={lang} />
      ) : (
        <CelestialLab3D lang={lang} />
      )}
    </div>
  );
};
