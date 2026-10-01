import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

export default function EPICViewer({ lang = 'en' }) {
  const [frames, setFrames] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1500); // ms per frame
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState('image'); // 'image' | 'telemetry'
  const timerRef = useRef(null);

  // Fetch live NASA EPIC Earth frames
  const fetchEpicData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/epic');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.frames && json.frames.length > 0) {
          setFrames(json.frames);
          setCurrentIndex(0);
        }
      }
    } catch (err) {
      console.warn('EPIC fetch error:', err);
    } finally {
      setLoading(false);
    }
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
      prev: 'පසුගිය රූපය',
      next: 'ඊළඟ රූපය',
      speed: 'වේගය',
      frame: 'ඡායාරූපය',
      captureTime: 'ඡායාරූපගත කළ වේලාව',
      centroid: 'කේන්ද්‍රීය අක්ෂාංශ/දේශාංශ',
      sunPos: 'සූර්ය-පෘථිවි දෛශිකය (J2000)',
      dscovrPos: 'DSCOVR චන්ද්‍රිකා දෛශිකය',
      satelliteDist: 'චන්ද්‍රිකාවේ සිට දුර',
      lagrangeL1: 'ලග්‍රාන්ජ් L1 ලක්ෂ්‍යය',
      refresh: 'යාවත්කාලීන කරන්න',
      fullscreen: 'සම්පූර්ණ තිරය',
      captionTitle: 'විද්‍යාත්මක විස්තරය'
    },
    ta: {
      title: 'நாசா EPIC பூமி முழு-வட்டு நேரலை கண்காணிப்பு',
      subtitle: 'லக்ராஞ்ச் L1 புள்ளியிலிருந்து (~1.5 மில்லியன் கி.மீ) DSCOVR விண்கலம் எடுத்த பூமியின் சூரிய ஒளிப் படங்கள்',
      play: 'இயக்கு',
      pause: 'நிறுத்து',
      prev: 'முந்தைய படம்',
      next: 'அடுத்த படம்',
      speed: 'வேகம்',
      frame: 'படம்',
      captureTime: 'படமெடுத்த நேரம் (UTC)',
      centroid: 'மைய ஆயத்தொலைவுகள்',
      sunPos: 'சூரிய-பூமி திசையன் (J2000)',
      dscovrPos: 'DSCOVR விண்கலம் திசையன்',
      satelliteDist: 'செயற்கைக்கோள் தொலைவு',
      lagrangeL1: 'லக்ராஞ்ச் L1 புள்ளி',
      refresh: 'புதுப்பிக்குக',
      fullscreen: 'முழுத்திரை',
      captionTitle: 'அறிவியல் விளக்கம்'
    }
  };

  const t = UI[lang] || UI.en;

  return (
    <div className={`w-full font-sans select-none space-y-6 ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-950 p-6 overflow-y-auto' : ''}`}>
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-blue-950/80 to-slate-950 border border-slate-800 p-6 shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono mb-2">
              <Satellite className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>DSCOVR EPIC • LAGRANGE POINT L1</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black font-['Orbitron'] text-white tracking-wide">
              {t.title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
              {t.subtitle}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={fetchEpicData}
              disabled={loading}
              className="px-3.5 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
              <span className="hidden sm:inline">{t.refresh}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title={t.fullscreen}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Main Full-Disc Earth Viewer Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Full-Disc Earth Image Screen (Left/Top) */}
        <div className="lg:col-span-7 rounded-3xl bg-slate-950 border border-slate-800 p-4 sm:p-6 shadow-2xl flex flex-col items-center justify-between relative overflow-hidden min-h-[460px]">
          
          {/* Top Info Bar */}
          <div className="w-full flex items-center justify-between text-xs font-mono text-slate-400 z-10 mb-3">
            <span className="flex items-center gap-1.5 text-cyan-300 font-bold">
              <Globe className="w-4 h-4 text-cyan-400" />
              SUNLIT FULL-DISC EARTH
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[10px] text-cyan-400">
              {t.frame} {currentIndex + 1} / {frames.length || 1}
            </span>
          </div>

          {/* Earth Image Frame Container */}
          <div className="relative w-full aspect-square max-w-[380px] sm:max-w-[420px] rounded-2xl bg-black border border-slate-800/80 shadow-[0_0_60px_rgba(6,182,212,0.12)] flex items-center justify-center overflow-hidden my-2">
            {loading ? (
              <div className="p-8 text-center font-mono text-xs text-slate-400 space-y-3">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-cyan-400" />
                <p>Downloading DSCOVR EPIC Full-Disc Telemetry...</p>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.img
                  key={currentFrame.identifier || currentIndex}
                  src={currentFrame.imageUrl}
                  alt={currentFrame.caption || 'NASA EPIC Earth Image'}
                  initial={{ opacity: 0.3, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0.3 }}
                  transition={{ duration: 0.4 }}
                  className="w-full h-full object-cover rounded-2xl shadow-inner"
                />
              </AnimatePresence>
            )}

            {/* Earth Atmosphere Blue Glow Layer */}
            <div className="absolute inset-0 rounded-2xl pointer-events-none ring-1 ring-inset ring-cyan-500/20 shadow-[inset_0_0_40px_rgba(6,182,212,0.2)]" />
          </div>

          {/* Interactive Time-Lapse Player Controls */}
          <div className="w-full space-y-3 pt-4 border-t border-slate-800/80 z-10">
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
                  className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
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
                  className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
                  title={t.next}
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              {/* Speed Selector */}
              <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
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
                      playSpeed === s.val ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Astronomy Metadata Overlay Cards (Right) */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* UTC Timestamp & Centroid Coordinates Card */}
          <div className="p-5 rounded-3xl bg-slate-950/90 border border-slate-800 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-cyan-400">
              <Clock className="w-4 h-4" />
              <span>{t.captureTime}</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800/80 space-y-1">
              <span className="text-xl font-bold font-mono text-white tracking-wide">
                {currentFrame.date || 'Synchronizing...'}
              </span>
              <span className="text-[10px] font-mono text-cyan-400/80 block">
                DSCOVR EPIC Instrument Sensor Time
              </span>
            </div>

            {/* Coordinates Grid */}
            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 block mb-1">{t.centroid}</span>
                <span className="text-cyan-300 font-bold text-sm">
                  {currentFrame.centroidCoords?.lat ? `${currentFrame.centroidCoords.lat.toFixed(2)}° N` : '0.00°'}
                </span>
                <span className="text-indigo-300 font-bold text-sm block mt-0.5">
                  {currentFrame.centroidCoords?.lon ? `${currentFrame.centroidCoords.lon.toFixed(2)}° E` : '0.00°'}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 block mb-1">{t.satelliteDist}</span>
                <span className="text-amber-300 font-bold text-xs block">
                  {currentFrame.distanceKm || '1,500,000 km'}
                </span>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  {t.lagrangeL1}
                </span>
              </div>
            </div>
          </div>

          {/* Sun-Earth Position Vector Card */}
          <div className="p-5 rounded-3xl bg-slate-950/90 border border-slate-800 space-y-3 shadow-xl">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-400">
              <Sun className="w-4 h-4 text-amber-400" />
              <span>{t.sunPos}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 font-mono text-xs">
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-[9px] text-slate-500 block">X Vector</span>
                <span className="text-slate-200 font-bold text-[11px]">
                  {currentFrame.sunPos?.x ? `${Math.round(currentFrame.sunPos.x / 1000).toLocaleString()} km` : 'N/A'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-[9px] text-slate-500 block">Y Vector</span>
                <span className="text-slate-200 font-bold text-[11px]">
                  {currentFrame.sunPos?.y ? `${Math.round(currentFrame.sunPos.y / 1000).toLocaleString()} km` : 'N/A'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-[9px] text-slate-500 block">Z Vector</span>
                <span className="text-slate-200 font-bold text-[11px]">
                  {currentFrame.sunPos?.z ? `${Math.round(currentFrame.sunPos.z / 1000).toLocaleString()} km` : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* DSCOVR Position Vector Card */}
          <div className="p-5 rounded-3xl bg-slate-950/90 border border-slate-800 space-y-3 shadow-xl">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-indigo-400">
              <Satellite className="w-4 h-4 text-indigo-400" />
              <span>{t.dscovrPos}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 font-mono text-xs">
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-[9px] text-slate-500 block">X Position</span>
                <span className="text-indigo-300 font-bold text-[11px]">
                  {currentFrame.dscovrPos?.x ? `${Math.round(currentFrame.dscovrPos.x).toLocaleString()} km` : 'N/A'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-[9px] text-slate-500 block">Y Position</span>
                <span className="text-indigo-300 font-bold text-[11px]">
                  {currentFrame.dscovrPos?.y ? `${Math.round(currentFrame.dscovrPos.y).toLocaleString()} km` : 'N/A'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-[9px] text-slate-500 block">Z Position</span>
                <span className="text-indigo-300 font-bold text-[11px]">
                  {currentFrame.dscovrPos?.z ? `${Math.round(currentFrame.dscovrPos.z).toLocaleString()} km` : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Scientific Overview Box */}
          <div className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 space-y-2">
            <span className="font-bold font-mono text-cyan-300 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              {t.captionTitle}
            </span>
            <p className="leading-relaxed font-sans text-slate-400 text-[11px]">
              {currentFrame.caption || 'DSCOVR EPIC captures full-disc daylight perspectives of Earth from Lagrange Point L1, tracking ozone levels, cloud dynamics, vegetation health, and solar irradiance across the globe.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
