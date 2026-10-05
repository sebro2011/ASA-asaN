'use client';

import React, { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LiquidGlassCard } from './LiquidGlassCard.jsx';
import { 
  Target, 
  Sparkles, 
  Info, 
  X, 
  Camera, 
  Compass, 
  MapPin, 
  Layers,
  ChevronRight
} from 'lucide-react';

// Curated default Mars Perseverance Jezero Crater Hotspots
const DEFAULT_MARS_HOTSPOTS = [
  {
    id: 'hs1',
    x: 28, // percentage X
    y: 34, // percentage Y
    title: 'Martian Delta Strata (Kodiak Butte)',
    category: 'Sedimentary Geology',
    color: '#38bdf8',
    description: 'Ancient river delta sediments deposited over 3.5 billion years ago. Layered sandstone and mudstone suggest a persistent ancient lake in Jezero Crater.'
  },
  {
    id: 'hs2',
    x: 52,
    y: 72,
    title: 'Perseverance Aluminum Tread Wheel',
    category: 'Rover Engineering',
    color: '#f59e0b',
    description: 'Machined from a single block of aerospace-grade aluminum with 48 curved cleats (grousers) for enhanced traction over rough basaltic rocks and dunes.'
  },
  {
    id: 'hs3',
    x: 76,
    y: 48,
    title: 'Basaltic Regolith & Iron Oxide Dust',
    category: 'Mineralogy',
    color: '#f43f5e',
    description: 'Fine Martian sand composed of oxidized iron minerals (rust) giving the planet its distinctive reddish hue, interspersed with volcanic olivine grains.'
  },
  {
    id: 'hs4',
    x: 42,
    y: 22,
    title: 'Mastcam-Z Multispectral Stereo Mast',
    category: 'Science Instruments',
    color: '#a855f7',
    description: 'Dual multispectral zoom cameras mounted 2 meters above ground level, capturing 3D stereoscopic panoramas and mineral diagnostic wavelengths.'
  }
];

function MarsImageTagger({
  imageUrl = 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=1600&q=85',
  hotspots = DEFAULT_MARS_HOTSPOTS,
  className = ''
}) {
  const [activeHotspot, setActiveHotspot] = useState(hotspots[0] || null);

  return (
    <LiquidGlassCard 
      className={`p-6 font-sans space-y-5 select-none ${className}`}
      edgeHighlight={true}
      hoverable={true}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600 to-amber-600 flex items-center justify-center shadow-lg shadow-rose-950/40">
            <Target className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-rose-400 uppercase tracking-wider block font-semibold">
              NASA JPL Mars 2020 Exploration
            </span>
            <h3 className="text-base font-bold font-['Orbitron'] text-white">
              Mars Rover Image Hotspot Tagger
            </h3>
          </div>
        </div>

        <span className="text-xs font-mono text-cyan-300 px-3.5 py-1.5 rounded-full liquid-glass shadow-sm">
          {hotspots.length} Geological Targets Identified
        </span>
      </div>

      {/* Main Interactive 2D Coordinate Viewport Container */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 bg-slate-950 group aspect-[16/10] sm:aspect-[16/9] shadow-inner">
        
        {/* Background Mars Image */}
        <img
          src={imageUrl}
          alt="Mars Surface Landscape"
          className="w-full h-full object-cover select-none pointer-events-none filter brightness-90 contrast-105"
        />

        {/* Subtle Vignette Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/30 pointer-events-none" />

        {/* Hotspot Beacons */}
        {hotspots.map((hs) => {
          const isActive = activeHotspot?.id === hs.id;
          const beaconColor = hs.color || '#38bdf8';

          return (
            <div
              key={hs.id}
              style={{ left: `${hs.x}%`, top: `${hs.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
            >
              {/* Pulsing Beacon Rings */}
              <motion.span
                animate={{ scale: [1, 2.2, 2.8], opacity: [0.8, 0.4, 0] }}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeOut' }}
                style={{ backgroundColor: beaconColor }}
                className="absolute -inset-1 rounded-full pointer-events-none opacity-40"
              />

              {/* Beacon Button */}
              <button
                type="button"
                onClick={() => setActiveHotspot(hs)}
                title={hs.title}
                className={`relative w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center transition-all shadow-xl cursor-pointer ${
                  isActive
                    ? 'scale-125 border-white bg-slate-950 text-white shadow-cyan-500/50 ring-4 ring-cyan-500/30'
                    : 'border-white/80 bg-slate-950/80 text-white/90 hover:scale-110 hover:border-white'
                }`}
                style={{ borderColor: isActive ? '#ffffff' : beaconColor }}
              >
                <span 
                  className="w-2.5 h-2.5 rounded-full" 
                  style={{ backgroundColor: beaconColor }}
                />
              </button>
            </div>
          );
        })}

        {/* Floating Detail Popover over Image */}
        <AnimatePresence>
          {activeHotspot && (
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute bottom-4 left-4 right-4 sm:right-auto sm:max-w-md p-4 rounded-2xl liquid-glass border border-white/20 shadow-2xl z-30 space-y-2 text-slate-200"
            >
              <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2">
                <div>
                  <span 
                    className="text-[10px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded-full inline-block mb-1"
                    style={{ 
                      backgroundColor: `${activeHotspot.color}20`, 
                      color: activeHotspot.color,
                      borderColor: `${activeHotspot.color}40`,
                      borderWidth: '1px'
                    }}
                  >
                    {activeHotspot.category}
                  </span>
                  <h4 className="font-['Orbitron'] font-bold text-white text-sm">
                    {activeHotspot.title}
                  </h4>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveHotspot(null)}
                  className="p-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                {activeHotspot.description}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hotspots Quick Selection Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
        {hotspots.map((hs) => {
          const isSelected = activeHotspot?.id === hs.id;
          return (
            <button
              key={hs.id}
              type="button"
              onClick={() => setActiveHotspot(hs)}
              className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'liquid-glass border-cyan-400 shadow-md shadow-cyan-950/40'
                  : 'bg-white/[0.02] hover:bg-white/[0.05] border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              <span className="text-[10px] text-slate-400 block truncate">{hs.category}</span>
              <span className="font-bold text-white truncate block mt-0.5">{hs.title}</span>
            </button>
          );
        })}
      </div>
    </LiquidGlassCard>
  );
}

export default memo(MarsImageTagger);
