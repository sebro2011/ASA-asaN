import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AsteroidRiskBadge from './AsteroidRiskBadge.jsx';
import { 
  Radio, 
  AlertTriangle, 
  ShieldCheck, 
  Ruler, 
  Zap, 
  Calendar, 
  ExternalLink, 
  RefreshCw, 
  Info, 
  Compass, 
  Search,
  CheckCircle2,
  X,
  Target,
  Globe,
  SlidersHorizontal,
  ChevronRight
} from 'lucide-react';

export default function AsteroidRadar({ lang = 'en' }) {
  const [asteroids, setAsteroids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAsteroid, setSelectedAsteroid] = useState(null);
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'HAZARDOUS' | 'CLOSE' | 'LARGE'
  const [searchQuery, setSearchQuery] = useState('');
  const [isFallback, setIsFallback] = useState(false);
  const [radarRotation, setRadarRotation] = useState(0);

  // Fetch live NASA NeoWs Feed
  const fetchAsteroids = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/asteroids/neows');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const neoObj = json.data.near_earth_objects || {};
          const allList = [];
          
          Object.keys(neoObj).forEach(date => {
            neoObj[date].forEach(item => {
              const closeApp = item.close_approach_data?.[0] || {};
              const kmDistance = parseFloat(closeApp.miss_distance?.kilometers || '10000000');
              const lunarDistance = parseFloat(closeApp.miss_distance?.lunar || '25');
              const velocityKms = parseFloat(closeApp.relative_velocity?.kilometers_per_second || '20');
              const minDiam = item.estimated_diameter?.meters?.estimated_diameter_min || 50;
              const maxDiam = item.estimated_diameter?.meters?.estimated_diameter_max || 120;
              const avgDiam = (minDiam + maxDiam) / 2;

              allList.push({
                id: item.id,
                name: item.name,
                jplUrl: item.nasa_jpl_url,
                isHazardous: Boolean(item.is_potentially_hazardous_asteroid),
                minDiameterMeters: Math.round(minDiam),
                maxDiameterMeters: Math.round(maxDiam),
                avgDiameterMeters: Math.round(avgDiam),
                velocityKms: velocityKms.toFixed(2),
                velocityKmh: Math.round(velocityKms * 3600).toLocaleString(),
                missDistanceKm: Math.round(kmDistance).toLocaleString(),
                rawKmDistance: kmDistance,
                lunarDistance: lunarDistance.toFixed(2),
                closeApproachDate: closeApp.close_approach_date_full || closeApp.close_approach_date || 'Today',
                orbitingBody: closeApp.orbiting_body || 'Earth'
              });
            });
          });

          setAsteroids(allList);
          setIsFallback(Boolean(json.isFallback));
        }
      }
    } catch (err) {
      console.warn('NeoWs fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAsteroids();
  }, []);

  // Filtered Asteroid List
  const filteredAsteroids = useMemo(() => {
    return asteroids.filter(item => {
      if (filter === 'HAZARDOUS' && !item.isHazardous) return false;
      if (filter === 'CLOSE' && parseFloat(item.lunarDistance) > 10) return false;
      if (filter === 'LARGE' && item.avgDiameterMeters < 100) return false;
      
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.name.toLowerCase().includes(q) || item.id.includes(q);
      }
      return true;
    });
  }, [asteroids, filter, searchQuery]);

  // Language Dictionary
  const UI = {
    en: {
      title: 'NASA NeoWs Near-Earth Asteroid Radar',
      subtitle: 'Real-time tracking of close-approach asteroids, orbital velocities, and hazardous threat levels',
      refresh: 'Refresh NeoWs Feed',
      filterAll: 'All Near-Earth Objects',
      filterHazardous: 'Potentially Hazardous (PHA)',
      filterClose: 'Closest Approach (< 10 LD)',
      filterLarge: 'Largest Diameter (> 100m)',
      searchPlaceholder: 'Search asteroid name or JPL ID...',
      hazardousTag: 'POTENTIALLY HAZARDOUS',
      safeTag: 'SAFE ORBIT PASS',
      missDistance: 'Miss Distance',
      velocity: 'Relative Velocity',
      diameter: 'Est. Diameter',
      approachDate: 'Approach Time',
      viewDetails: 'Inspect Orbit & Risk',
      modalTitle: 'Near-Earth Object Telemetry Dossier',
      jplDatabase: 'NASA JPL Small-Body Database',
      radarLegend: 'Radar Range: 0 to 30 Million km (80 Lunar Distances)',
      sizeBenchmark: 'Size Comparison Benchmark',
      machSpeed: 'Velocity Equivalent',
      closeApproachTelemetry: 'Close-Approach Coordinates'
    },
    si: {
      title: 'නාසා NeoWs පෘථිවි ආසන්න අභ්‍යවකාශ රේඩාර් පද්ධතිය',
      subheading: 'පෘථිවියට ආසන්නව ගමන් කරන ඡායාරූප, ප්‍රවේග සහ අවදානම් මට්ටම් තත්‍ය කාලීනව නිරීක්ෂණය කරන්න',
      refresh: 'දත්ත යාවත්කාලීන කරන්න',
      filterAll: 'සියලුම වස්තූන්',
      filterHazardous: 'අනතුරුදායක වස්තූන් (PHA)',
      filterClose: 'ආසන්නතම ගමන් (< 10 LD)',
      filterLarge: 'විශාලතම වස්තූන් (> 100m)',
      searchPlaceholder: 'වස්තුවේ නම හෝ ID ඇතුළත් කරන්න...',
      hazardousTag: 'අනතුරුදායක විය හැක',
      safeTag: 'ආරක්ෂිත කක්ෂය',
      missDistance: 'පෘථිවියේ සිට දුර',
      velocity: 'සාපේක්ෂ වේගය',
      diameter: 'ඇස්තමේන්තුගත විෂ්කම්භය',
      approachDate: 'ආසන්න වන වේලාව',
      viewDetails: 'විස්තර පරීක්ෂා කරන්න',
      modalTitle: 'අභ්‍යවකාශ වස්තු විද්‍යාත්මක වාර්තාව',
      jplDatabase: 'නාසා JPL දත්ත සමුදාය',
      radarLegend: 'රේඩාර් පරාසය: කි.මී. මිලියන 0 සිට 30 දක්වා',
      sizeBenchmark: 'ප්‍රමාණ සැසඳීම',
      machSpeed: 'මැක් වේග සාපේක්ෂතාව',
      closeApproachTelemetry: 'ආසන්න වීමේ ටෙලිමෙට්‍රි දත්ත'
    },
    ta: {
      title: 'நாசா NeoWs பூமிக்கு அருகிலுள்ள சிறுகோள் ரேடார்',
      subheading: 'பூமியை நெருங்கும் சிறுகோள்கள், வேகம் மற்றும் அபாய அளவுகளை நேரலையில் கண்காணிக்கவும்',
      refresh: 'தரவைப் புதுப்பிக்கவும்',
      filterAll: 'அனைத்து பொருட்கள்',
      filterHazardous: 'அபாயகரமானவை (PHA)',
      filterClose: 'மிக அருகில் (< 10 LD)',
      filterLarge: 'பெரியவை (> 100m)',
      searchPlaceholder: 'பெயர் அல்லது ID தேடுக...',
      hazardousTag: 'சாத்தியமான அபாயம்',
      safeTag: 'பாதுகாப்பான சுற்றுப்பாதை',
      missDistance: 'பூமியிலிருந்து தொலைவு',
      velocity: 'சார்பு வேகம்',
      diameter: 'மதிப்பிடப்பட்ட விட்டம்',
      approachDate: 'நெருங்கும் நேரம்',
      viewDetails: 'விவரங்களை ஆராய்க',
      modalTitle: 'சிறுகோள் தொலைநிலை ஆய்வு அறிக்கை',
      jplDatabase: 'நாசா JPL தரவுத்தளம்',
      radarLegend: 'ரேடார் வரம்பு: 0 முதல் 30 மில்லியன் கி.மீ',
      sizeBenchmark: 'அளவு ஒப்பீடு',
      machSpeed: 'வேக ஒப்பீடு',
      closeApproachTelemetry: 'நெருங்கும் தொலைநிலை அளவீடுகள்'
    }
  };

  const t = UI[lang] || UI.en;

  // Size benchmark calculation helper
  const getSizeComparison = (meters) => {
    if (meters < 10) return lang === 'si' ? 'බස් රථයක ප්‍රමාණය' : lang === 'ta' ? 'பேருந்து அளவு' : 'Size of a City Bus';
    if (meters < 50) return lang === 'si' ? 'ඔලිම්පික් පිහිනුම් තටාකයක ප්‍රමාණය' : lang === 'ta' ? 'நீச்சல் குளம் அளவு' : 'Olympic Swimming Pool Length';
    if (meters < 150) return lang === 'si' ? 'පාපන්දු ක්‍රීඩාංගණයක ප්‍රමාණය' : lang === 'ta' ? 'கால்பந்து மைதானம் அளவு' : 'Full Football Stadium Size';
    if (meters < 400) return lang === 'si' ? 'ඊෆල් කුළුණේ උසට සමානයි' : lang === 'ta' ? 'ஈபிள் கோபுரம் உயரம்' : 'Eiffel Tower Height Equivalent';
    return lang === 'si' ? 'බුර්ජ් කලීෆා ගොඩනැගිල්ලට සමානයි' : lang === 'ta' ? 'புர்ஜ் கலீஃபா உயரம்' : 'Burj Khalifa Tower Scale';
  };

  return (
    <div className="w-full space-y-6 select-none font-sans">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-indigo-950/80 to-slate-950 border border-slate-800 p-6 shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono mb-2">
              <Radio className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              <span>LIVE NASA NeoWs TRACKING NETWORK</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black font-['Orbitron'] text-white tracking-wide">
              {t.title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl font-sans">
              {t.subtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={fetchAsteroids}
            disabled={loading}
            className="px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-mono font-bold flex items-center gap-2 transition cursor-pointer self-start md:self-auto shadow-lg shadow-cyan-950/40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{t.refresh}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Radar Screen (Left) + Asteroid Controls & Feed (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Radar Circular Target Visualizer */}
        <div className="lg:col-span-6 rounded-3xl bg-slate-950 border border-slate-800 p-6 shadow-2xl flex flex-col items-center justify-between relative overflow-hidden min-h-[460px]">
          {/* Ambient Radar Grid Background */}
          <div className="w-full flex items-center justify-between text-[11px] font-mono text-slate-400 z-10 w-full mb-2">
            <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
              <Target className="w-3.5 h-3.5" />
              EARTH CENTERED RADAR
            </span>
            <span className="text-slate-500 text-[10px] hidden sm:inline">
              {t.radarLegend}
            </span>
          </div>

          {/* Radar Screen Sphere Container */}
          <div className="relative w-[300px] h-[300px] sm:w-[360px] sm:h-[360px] rounded-full border-2 border-cyan-500/40 bg-slate-950/90 shadow-[0_0_50px_rgba(6,182,212,0.15)] flex items-center justify-center my-4 overflow-hidden">
            
            {/* Concentric Distance Rings */}
            <div className="absolute w-[80%] h-[80%] rounded-full border border-dashed border-cyan-500/30 flex items-center justify-start pl-2">
              <span className="text-[9px] font-mono text-cyan-500/60">5 LD</span>
            </div>
            <div className="absolute w-[60%] h-[60%] rounded-full border border-cyan-500/25 flex items-center justify-start pl-2">
              <span className="text-[9px] font-mono text-cyan-500/60">2.5 LD</span>
            </div>
            <div className="absolute w-[38%] h-[38%] rounded-full border border-dashed border-cyan-500/30 flex items-center justify-start pl-2">
              <span className="text-[9px] font-mono text-cyan-500/60">1 LD</span>
            </div>

            {/* Radar Crosshairs Axis */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-full h-[1px] bg-cyan-500/30" />
              <div className="h-full w-[1px] bg-cyan-500/30 absolute" />
            </div>

            {/* Central Earth Hub */}
            <div className="relative w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-500 border-2 border-white shadow-[0_0_20px_rgba(6,182,212,0.8)] z-20 flex items-center justify-center">
              <Globe className="w-4 h-4 text-white animate-pulse" />
            </div>

            {/* Rotating Radar Sweep Beam */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
              className="absolute inset-0 rounded-full pointer-events-none z-10"
              style={{
                background: 'conic-gradient(from 0deg, rgba(6, 182, 212, 0.4) 0deg, rgba(6, 182, 212, 0.05) 45deg, transparent 90deg, transparent 360deg)'
              }}
            />

            {/* Asteroids Plotted on Radar Target Grid */}
            {!loading && filteredAsteroids.map((ast, idx) => {
              // Scale miss distance to radar radius (max ~30 million km -> radius 140px)
              const maxScaleKm = 28000000;
              const normalizedDist = Math.min(1, Math.max(0.12, ast.rawKmDistance / maxScaleKm));
              const radiusPx = normalizedDist * 140; // 0 to 140px radius

              // Spread asteroids along different polar angles based on index
              const angleDeg = (idx * 48 + parseInt(ast.id) % 360) % 360;
              const angleRad = (angleDeg * Math.PI) / 180;

              const x = Math.cos(angleRad) * radiusPx;
              const y = Math.sin(angleRad) * radiusPx;

              const isSelected = selectedAsteroid?.id === ast.id;

              return (
                <div
                  key={ast.id}
                  onClick={() => setSelectedAsteroid(ast)}
                  style={{ transform: `translate(${x}px, ${y}px)` }}
                  className="absolute z-20 cursor-pointer group -translate-x-1/2 -translate-y-1/2"
                >
                  {/* Glowing Radar Blip */}
                  <div className="relative flex items-center justify-center">
                    {ast.isHazardous ? (
                      <>
                        <div className="absolute w-6 h-6 rounded-full bg-rose-500/40 animate-ping" />
                        <div className={`w-3.5 h-3.5 rounded-full bg-rose-500 border border-white shadow-[0_0_12px_#ef4444] transition-transform ${isSelected ? 'scale-150 ring-4 ring-rose-500/50' : 'group-hover:scale-125'}`} />
                      </>
                    ) : (
                      <>
                        <div className="absolute w-4 h-4 rounded-full bg-indigo-500/20 animate-pulse" />
                        <div className={`w-2.5 h-2.5 rounded-full bg-indigo-400 border border-white shadow-[0_0_10px_#6366f1] transition-transform ${isSelected ? 'scale-150 ring-4 ring-indigo-500/50' : 'group-hover:scale-125'}`} />
                      </>
                    )}
                  </div>

                  {/* Hover Callout Tag */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 rounded-lg bg-slate-950/90 border border-slate-700 text-[10px] font-mono text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl">
                    {ast.name} • {ast.lunarDistance} LD
                  </div>
                </div>
              );
            })}
          </div>

          {/* Radar Telemetry Footer Strip */}
          <div className="w-full flex items-center justify-between text-xs font-mono text-slate-400 pt-3 border-t border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span>Hazardous (PHA): {asteroids.filter(a => a.isHazardous).length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
              <span>Safe Passing: {asteroids.filter(a => !a.isHazardous).length}</span>
            </div>
          </div>
        </div>

        {/* Asteroids Feed List & Filtering Controls */}
        <div className="lg:col-span-6 space-y-4">
          
          {/* Search & Filter Bar */}
          <div className="p-4 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full pl-10 pr-4 py-2 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono pb-1">
              {[
                { id: 'ALL', label: t.filterAll },
                { id: 'HAZARDOUS', label: t.filterHazardous },
                { id: 'CLOSE', label: t.filterClose },
                { id: 'LARGE', label: t.filterLarge }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition cursor-pointer ${
                    filter === f.id
                      ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white font-bold shadow-md shadow-cyan-950/50'
                      : 'bg-slate-950/80 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Asteroid Cards Scrollable Feed */}
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {loading ? (
              <div className="p-8 text-center font-mono text-xs text-slate-400 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-400" />
                <p>Receiving NASA NeoWs Asteroid Telemetry...</p>
              </div>
            ) : filteredAsteroids.length === 0 ? (
              <div className="p-8 text-center font-mono text-xs text-slate-400 bg-slate-950/60 rounded-3xl border border-slate-800">
                No near-Earth objects match the selected filter.
              </div>
            ) : (
              filteredAsteroids.map(ast => (
                <div
                  key={ast.id}
                  onClick={() => setSelectedAsteroid(ast)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer text-left space-y-3 relative overflow-hidden ${
                    ast.isHazardous
                      ? 'bg-slate-950/90 border-rose-500/40 hover:border-rose-400 shadow-lg shadow-rose-950/20'
                      : 'bg-slate-950/90 border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {ast.isHazardous ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-mono font-bold">
                          <AlertTriangle className="w-3 h-3 text-rose-400 animate-pulse" />
                          {t.hazardousTag}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-bold">
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          {t.safeTag}
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-slate-500">ID: {ast.id}</span>
                    </div>

                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </div>

                  <div>
                    <h4 className="text-sm font-bold font-['Orbitron'] text-white">
                      {ast.name}
                    </h4>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-3 gap-2 text-[11px] font-mono pt-1">
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 block text-[9px]">{t.missDistance}</span>
                      <span className="text-cyan-300 font-bold">{ast.lunarDistance} LD</span>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 block text-[9px]">{t.velocity}</span>
                      <span className="text-indigo-300 font-bold">{ast.velocityKms} km/s</span>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 block text-[9px]">{t.diameter}</span>
                      <span className="text-amber-300 font-bold">~{ast.avgDiameterMeters}m</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Asteroid Inspection Spring Modal */}
      <AnimatePresence>
        {selectedAsteroid && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg rounded-3xl bg-slate-950 border border-slate-800 p-6 shadow-2xl space-y-5"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-cyan-400" />
                  <span className="text-xs font-mono font-bold text-cyan-300">
                    {t.modalTitle}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedAsteroid(null)}
                  className="p-1.5 rounded-xl bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Asteroid Overview Banner */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {selectedAsteroid.isHazardous ? (
                    <span className="px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-mono font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                      {t.hazardousTag}
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      {t.safeTag}
                    </span>
                  )}
                </div>

                <h3 className="text-xl font-bold font-['Orbitron'] text-white">
                  {selectedAsteroid.name}
                </h3>
              </div>

              {/* Detailed Technical Telemetry Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">{t.missDistance}</span>
                  <span className="text-white font-bold text-sm">{selectedAsteroid.missDistanceKm} km</span>
                  <span className="text-cyan-400 block text-[10px] mt-0.5">({selectedAsteroid.lunarDistance} Lunar Distances)</span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">{t.velocity}</span>
                  <span className="text-white font-bold text-sm">{selectedAsteroid.velocityKms} km/s</span>
                  <span className="text-indigo-400 block text-[10px] mt-0.5">({selectedAsteroid.velocityKmh} km/h)</span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">{t.diameter}</span>
                  <span className="text-white font-bold text-sm">{selectedAsteroid.minDiameterMeters}m - {selectedAsteroid.maxDiameterMeters}m</span>
                  <span className="text-amber-400 block text-[10px] mt-0.5">Avg: ~{selectedAsteroid.avgDiameterMeters}m</span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">{t.approachDate}</span>
                  <span className="text-white font-bold text-xs">{selectedAsteroid.closeApproachDate}</span>
                  <span className="text-emerald-400 block text-[10px] mt-0.5">Target: {selectedAsteroid.orbitingBody}</span>
                </div>
              </div>

              {/* Asteroid Hazard Risk Score Engine Badge */}
              <AsteroidRiskBadge asteroid={selectedAsteroid} />

              {/* Size Comparison Box */}
              <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 text-xs font-mono space-y-1">
                <span className="text-indigo-300 font-bold flex items-center gap-1.5">
                  <Ruler className="w-3.5 h-3.5" />
                  {t.sizeBenchmark}:
                </span>
                <p className="text-slate-200">
                  {getSizeComparison(selectedAsteroid.avgDiameterMeters)}
                </p>
              </div>

              {/* External JPL Link & Dismiss Button */}
              <div className="flex items-center justify-between pt-2">
                <a
                  href={selectedAsteroid.jplUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-cyan-300 flex items-center gap-1.5 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{t.jplDatabase}</span>
                </a>

                <button
                  type="button"
                  onClick={() => setSelectedAsteroid(null)}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
