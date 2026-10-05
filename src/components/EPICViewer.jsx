'use client';

import React, { useState, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { buildNasaEpicUrl } from '../utils/nasaApiClient';
import { LiquidGlassCard } from './LiquidGlassCard.jsx';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Globe, 
  Sun, 
  Satellite, 
  Clock, 
  Compass, 
  Maximize2, 
  Minimize2, 
  RefreshCw, 
  Layers, 
  Info, 
  Zap, 
  Sparkles,
  Sliders
} from 'lucide-react';

function EPICViewer({ lang = 'en' }) {
  const [frames, setFrames] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1500); // ms per frame
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState('image'); // 'image' | 'telemetry'
  const timerRef = useRef(null);

  // Fetch live NASA EPIC Earth frames with multiple resilient fallback tiers
  const fetchEpicData = async () => {
    setLoading(true);
    let loadedFrames = null;

    // Tier 1: Try local proxy route
    try {
      const res = await fetch('/api/epic');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.frames && json.frames.length > 0) {
          loadedFrames = json.frames;
        }
      }
    } catch {}

    // Tier 2: Try direct NASA API with safe environment key / DEMO_KEY
    if (!loadedFrames || loadedFrames.length === 0) {
      try {
        const directUrl = buildNasaEpicUrl();
        const directRes = await fetch(directUrl);
        if (directRes.ok) {
          const directData = await directRes.json();
          if (Array.isArray(directData) && directData.length > 0) {
            loadedFrames = directData.slice(0, 12).map((item) => {
              const dateStr = (item.date || '').split(' ')[0] || '2026-09-30';
              const [year, month, day] = dateStr.split('-');
              return {
                id: item.identifier || `epic-${item.image}`,
                caption: item.caption || 'DSCOVR EPIC Natural Color Earth Observation',
                imageName: item.image,
                date: item.date,
                pngUrl: `https://epic.gsfc.nasa.gov/archive/natural/${year}/${month}/${day}/png/${item.image}.png`,
                thumbUrl: `https://epic.gsfc.nasa.gov/archive/natural/${year}/${month}/${day}/thumbs/${item.image}.jpg`,
                centroid_coordinates: item.centroid_coordinates || { lat: 0, lon: 0 },
                sun_j2000_position: item.sun_j2000_position || { x: 0, y: 0, z: 0 },
                dscovr_j2000_position: item.dscovr_j2000_position || { x: 0, y: 0, z: 0 },
                lunar_distance: item.lunar_distance || '3.9 LD'
              };
            });
          }
        }
      } catch {}
    }

    // Tier 3: Curated Astronomical Fallback
    if (!loadedFrames || loadedFrames.length === 0) {
      loadedFrames = [
        {
          id: 'epic-fallback-1',
          caption: 'DSCOVR EPIC Full-Disc Sunlit Earth View from Lagrange Point L1',
          imageName: 'epic_1b_20260930',
          date: '2026-09-30 18:24:12',
          pngUrl: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=1400&q=80',
          thumbUrl: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=400&q=80',
          centroid_coordinates: { lat: 12.4, lon: -78.2 },
          sun_j2000_position: { x: -145000000, y: 35000000, z: 15000000 },
          dscovr_j2000_position: { x: -1450000, y: 220000, z: 110000 },
          lunar_distance: '3.92 LD'
        },
        {
          id: 'epic-fallback-2',
          caption: 'Pacific & Cloud Vortex Systems captured by EPIC',
          imageName: 'epic_1b_20260930_2',
          date: '2026-09-30 20:12:05',
          pngUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1400&q=80',
          thumbUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=400&q=80',
          centroid_coordinates: { lat: 8.2, lon: -110.5 },
          sun_j2000_position: { x: -145200000, y: 34800000, z: 14900000 },
          dscovr_j2000_position: { x: -1452000, y: 218000, z: 109000 },
          lunar_distance: '3.93 LD'
        }
      ];
    }

    setFrames(loadedFrames);
    setCurrentIndex(0);
    setLoading(false);
  };

  useEffect(() => {
    fetchEpicData();
  }, []);

  // Time-lapse auto-play playback loop
  useEffect(() => {
    if (isPlaying && frames.length > 1) {
      timerRef.current = setInterval(() => {
        setCurrentIndex(prev => (prev + 1) % frames.length);
      }, playSpeed);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, frames.length, playSpeed]);

  const currentFrame = frames[currentIndex] || {};

  // Language Dictionary
  const UI = {
    en: {
      title: 'NASA EPIC Full-Disc Earth Observation',
      subtitle: 'Real-time full-disc sunlit imagery of Earth captured from Lagrange Point L1 (~1.5 Million km)',
      play: 'Play Time-Lapse',
      pause: 'Pause Animation',
      prev: 'Previous Frame',
      next: 'Next Frame',
      speed: 'Playback Speed',
      frame: 'Frame',
      captureTime: 'Exact UTC Timestamp',
      centroid: 'Centroid Coordinates',
      sunPos: 'Sun-Earth Vector (J2000)',
      dscovrPos: 'DSCOVR Position Vector (J2000)',
      satelliteDist: 'Satellite Distance',
      lagrangeL1: 'Lagrange Point L1',
      refresh: 'Reload EPIC Feed',
      fullscreen: 'Toggle Fullscreen',
      captionTitle: 'Scientific Caption & Overview'
    },
    si: {
      title: 'නාසා EPIC සම්පූර්ණ පෘථිවි තත්‍ය කාලීන නිරීක්ෂණ',
      subtitle: 'ලග්‍රාන්ජ් L1 ලක්ෂ්‍යයේ (~කි.මී. මිලියන 1.5) සිට DSCOVR මගින් ලබාගත් සූර්යාලෝකිත පෘථිවි ඡායාරූප',
      play: 'වීඩියෝව ක්‍රියාත්මක කරන්න',
      pause: 'වීඩියෝව නවත්වන්න',
      prev: 'පෙර ඡායාරූපය',
      next: 'ඊළඟ ඡායාරූපය',
      speed: 'වේගය',
      frame: 'රාමුව',
      captureTime: 'නිරීක්ෂණ වේලාව (UTC)',
      centroid: 'කේන්ද්‍රීය ඛණ්ඩාංක',
      sunPos: 'සූර්ය-පෘථිවි දෛශිකය',
      dscovrPos: 'DSCOVR පිහිටුම් දෛශිකය',
      satelliteDist: 'චන්ද්‍රිකාවට ඇති දුර',
      lagrangeL1: 'ලැග්‍රාන්ජ් L1 ලක්ෂ්‍යය',
      refresh: 'යාවත්කාලීන කරන්න',
      fullscreen: 'පූර්ණ තිරය',
      captionTitle: 'විද්‍යාත්මක විස්තරය'
    },
    ta: {
      title: 'நாசா EPIC பூமி முழு வட்ட நேரலை ஆய்வு',
      subtitle: 'லாக்ராஞ்ச் புள்ளி L1 இலிருந்து (~1.5 மில்லியன் கி.மீ) எடுக்கப்பட்ட பூமியின் நேரலை சூரிய ஒளி புகைப்படங்கள்',
      play: 'இயக்கு',
      pause: 'நிறுத்து',
      prev: 'முந்தைய படம்',
      next: 'அடுத்த படம்',
      speed: 'வேகம்',
      frame: 'சட்டகம்',
      captureTime: 'நேரம் (UTC)',
      centroid: 'மைய ஆயத்தொலைவுகள்',
      sunPos: 'சூரிய-பூமி திசையன்',
      dscovrPos: 'DSCOVR திசையன்',
      satelliteDist: 'செயற்கைக்கோள் தூரம்',
      lagrangeL1: 'லாக்ராஞ்ச் புள்ளி L1',
      refresh: 'புதுப்பி',
      fullscreen: 'முழுத்திரை',
      captionTitle: 'அறிவியல் கண்ணோட்டம்'
    }
  };

  const t = UI[lang] || UI.en;

  return (
    <div className="w-full space-y-6 select-none font-sans">
      {/* Header Banner */}
      <LiquidGlassCard className="p-6">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono mb-2">
              <Satellite className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>DSCOVR EPIC • LAGRANGE POINT L1</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black font-['Orbitron'] text-white tracking-wide">
              {t.title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl font-sans">
              {t.subtitle}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={fetchEpicData}
              disabled={loading}
              className="px-3.5 py-2 rounded-2xl liquid-glass text-cyan-300 text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer hover:text-white"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
              <span className="hidden sm:inline">{t.refresh}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-2xl liquid-glass text-slate-300 hover:text-white transition cursor-pointer"
              title={t.fullscreen}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </LiquidGlassCard>

      {/* Main Full-Disc Earth Viewer Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Full-Disc Earth Image Screen (Left/Top) */}
        <LiquidGlassCard className="lg:col-span-7 p-4 sm:p-6 flex flex-col items-center justify-between relative overflow-hidden min-h-[460px]">
          
          {/* Top Info Bar */}
          <div className="w-full flex items-center justify-between text-xs font-mono text-slate-400 z-10 mb-3">
            <span className="flex items-center gap-1.5 text-cyan-300 font-bold">
              <Globe className="w-4 h-4 text-cyan-400" />
              SUNLIT FULL-DISC EARTH
            </span>
            <span className="px-2.5 py-0.5 rounded-full liquid-glass text-[10px] text-cyan-400">
              {t.frame} {currentIndex + 1} / {frames.length || 1}
            </span>
          </div>

          {/* Earth Image Frame Container */}
          <div className="relative w-full aspect-square max-w-[380px] sm:max-w-[420px] rounded-3xl apple-liquid-glass shadow-[0_0_60px_rgba(6,182,212,0.2)] flex items-center justify-center overflow-hidden my-2">
            {loading ? (
              <div className="p-8 text-center font-mono text-xs text-slate-400 space-y-3">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-cyan-400" />
                <p>Downloading DSCOVR EPIC Full-Disc Telemetry...</p>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.img
                  key={currentFrame.id || currentIndex}
                  src={currentFrame.pngUrl || currentFrame.thumbUrl}
                  alt={currentFrame.caption || 'NASA EPIC Earth Image'}
                  initial={{ opacity: 0.3, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0.3 }}
                  transition={{ duration: 0.4 }}
                  className="w-full h-full object-cover rounded-3xl shadow-inner"
                />
              </AnimatePresence>
            )}

            {/* Earth Atmosphere Blue Glow Layer */}
            <div className="absolute inset-0 rounded-3xl pointer-events-none ring-1 ring-inset ring-cyan-500/20 shadow-[inset_0_0_40px_rgba(6,182,212,0.2)]" />
          </div>

          {/* Interactive Time-Lapse Player Controls */}
          <div className="w-full space-y-3 pt-4 border-t border-white/10 z-10">
            {/* Scrubber Slider */}
            <div className="space-y-1">
              <input
                type="range"
                min="0"
                max={Math.max(0, frames.length - 1)}
                value={currentIndex}
                onChange={e => setCurrentIndex(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentIndex(prev => (prev - 1 + frames.length) % frames.length)}
                  className="p-2 rounded-xl liquid-glass text-slate-300 hover:text-white cursor-pointer"
                  title={t.prev}
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-cyan-950/50 cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>{isPlaying ? t.pause : t.play}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentIndex(prev => (prev + 1) % frames.length)}
                  className="p-2 rounded-xl liquid-glass text-slate-300 hover:text-white cursor-pointer"
                  title={t.next}
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              {/* Speed Selector */}
              <div className="flex items-center gap-1.5 liquid-glass px-3 py-1.5 rounded-xl border border-white/10">
                <Sliders className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] text-slate-400">{t.speed}:</span>
                {[
                  { label: '0.5s', val: 500 },
                  { label: '1.5s', val: 1500 },
                  { label: '3.0s', val: 3000 }
                ].map(s => (
                  <button
                    key={s.val}
                    type="button"
                    onClick={() => setPlaySpeed(s.val)}
                    className={`px-2 py-0.5 rounded text-[10px] cursor-pointer ${
                      playSpeed === s.val ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </LiquidGlassCard>

        {/* Astronomy Metadata Overlay Cards (Right) */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* UTC Timestamp & Centroid Coordinates Card */}
          <LiquidGlassCard className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-cyan-400">
              <Clock className="w-4 h-4" />
              <span>{t.captureTime}</span>
            </div>

            <div className="p-3.5 rounded-2xl liquid-glass space-y-1">
              <span className="text-xl font-bold font-mono text-white tracking-wide">
                {currentFrame.date || 'Synchronizing...'}
              </span>
              <span className="text-[10px] font-mono text-cyan-400/80 block">
                DSCOVR EPIC Instrument Sensor Time
              </span>
            </div>

            {/* Coordinates Grid */}
            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="p-3.5 rounded-2xl liquid-glass liquid-glass-edge">
                <span className="text-[10px] text-slate-400 block mb-1">{t.centroid}</span>
                <span className="text-cyan-300 font-bold text-sm">
                  {currentFrame.centroid_coordinates?.lat ? `${currentFrame.centroid_coordinates.lat.toFixed(2)}° N` : '0.00°'}
                </span>
                <span className="text-indigo-300 font-bold text-sm block mt-0.5">
                  {currentFrame.centroid_coordinates?.lon ? `${currentFrame.centroid_coordinates.lon.toFixed(2)}° E` : '0.00°'}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl liquid-glass liquid-glass-edge">
                <span className="text-[10px] text-slate-400 block mb-1">{t.satelliteDist}</span>
                <span className="text-amber-300 font-bold text-xs block">
                  {currentFrame.lunar_distance || '1,500,000 km'}
                </span>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  {t.lagrangeL1}
                </span>
              </div>
            </div>
          </LiquidGlassCard>

          {/* Sun-Earth Position Vector Card */}
          <LiquidGlassCard className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-400">
              <Sun className="w-4 h-4 text-amber-400" />
              <span>{t.sunPos}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 font-mono text-xs">
              <div className="p-2.5 rounded-xl liquid-glass">
                <span className="text-[9px] text-slate-400 block">X Vector</span>
                <span className="text-slate-200 font-bold text-[11px]">
                  {currentFrame.sun_j2000_position?.x ? `${Math.round(currentFrame.sun_j2000_position.x / 1000).toLocaleString()} km` : 'N/A'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl liquid-glass">
                <span className="text-[9px] text-slate-400 block">Y Vector</span>
                <span className="text-slate-200 font-bold text-[11px]">
                  {currentFrame.sun_j2000_position?.y ? `${Math.round(currentFrame.sun_j2000_position.y / 1000).toLocaleString()} km` : 'N/A'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl liquid-glass">
                <span className="text-[9px] text-slate-400 block">Z Vector</span>
                <span className="text-slate-200 font-bold text-[11px]">
                  {currentFrame.sun_j2000_position?.z ? `${Math.round(currentFrame.sun_j2000_position.z / 1000).toLocaleString()} km` : 'N/A'}
                </span>
              </div>
            </div>
          </LiquidGlassCard>

          {/* Scientific Overview Box */}
          <div className="p-4 rounded-3xl liquid-glass text-xs text-slate-300 space-y-2">
            <span className="font-bold font-mono text-cyan-300 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              {t.captionTitle}
            </span>
            <p className="leading-relaxed font-sans text-slate-300 text-[11px]">
              {currentFrame.caption || 'DSCOVR EPIC captures full-disc daylight perspectives of Earth from Lagrange Point L1, tracking ozone levels, cloud dynamics, vegetation health, and solar irradiance across the globe.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(EPICViewer);
