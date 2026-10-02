'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

export default function MarsImageTagger({
  imageUrl = 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=1600&q=85',
  hotspots = DEFAULT_MARS_HOTSPOTS,
  className = ''
}) {
  const [activeHotspot, setActiveHotspot] = useState(hotspots[0] || null);

  return (
    <div className={`rounded-3xl bg-slate-950/90 border border-slate-800 p-5 shadow-2xl backdrop-blur-2xl font-sans space-y-4 select-none ${className}`}>
      
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-rose-600 to-amber-600 flex items-center justify-center shadow-lg shadow-rose-950/40">
            <Target className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              NASA JPL Mars 2020 Exploration
            </span>
            <h3 className="text-base font-bold font-['Orbitron'] text-white">
              Mars Rover Image Hotspot Tagger
            </h3>
          </div>
        </div>

        <span className="text-xs font-mono text-cyan-300 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30">
          {hotspots.length} Geological Targets Identified
        </span>
      </div>

      {/* Main Interactive 2D Coordinate Viewport Container */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 group aspect-[16/10] sm:aspect-[16/9]">
        
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
                    ? 'scale-125 border-white bg-slate-950 text-white shadow-cyan-500/50'
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

        {/* Floating Hotspot Popover Detail Card */}
        <AnimatePresence>
          {activeHotspot && (
            <motion.div
              key={activeHotspot.id}
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-30 p-4 rounded-2xl bg-slate-950/95 border border-cyan-500/40 backdrop-blur-2xl shadow-2xl space-y-2 text-xs"
            >
              <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
                <div>
                  <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider block">
                    {activeHotspot.category}
                  </span>
                  <h4 className="text-sm font-bold font-['Orbitron'] text-white">
                    {activeHotspot.title}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveHotspot(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-slate-300 leading-relaxed font-sans text-xs">
                {activeHotspot.description}
              </p>

              <div className="pt-1 flex items-center justify-between font-mono text-[10px] text-slate-500">
                <span>Coord: {activeHotspot.x}% X, {activeHotspot.y}% Y</span>
                <span className="text-cyan-400 font-bold">Jezero Crater Grid</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Target Selector Bar */}
      <div className="flex items-center gap-2 overflow-x-auto text-xs font-mono pb-1">
        <span className="text-slate-500 text-[10px] uppercase shrink-0">Focus Target:</span>
        {hotspots.map((hs) => (
          <button
            key={hs.id}
            type="button"
            onClick={() => setActiveHotspot(hs)}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              activeHotspot?.id === hs.id
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white font-bold shadow-md shadow-cyan-950/50'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hs.color }} />
            <span>{hs.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
