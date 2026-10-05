'use client';

import React, { useState, useEffect, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AsteroidRiskBadge from './AsteroidRiskBadge.jsx';
import AsteroidRiskGauge from './AsteroidRiskGauge.jsx';
import { getNasaApiKey } from '../utils/nasaApiClient';
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
  ChevronRight,
  Database,
  WifiOff
} from 'lucide-react';

// Comprehensive 8-item Fallback Mock Dataset for Reliable Offline / Netlify Production
const MOCK_NEOWS_FALLBACK = [
  {
    id: '2026-PHA-1',
    name: '433 Eros (1898 DQ)',
    jplUrl: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=433',
    isHazardous: true,
    minDiameterMeters: 16840,
    maxDiameterMeters: 16840,
    avgDiameterMeters: 16840,
    velocityKms: '24.36',
    velocityKmh: '87,696',
    missDistanceKm: '26,740,000',
    rawKmDistance: 26740000,
    lunarDistance: '69.5',
    closeApproachDate: '2026-10-15',
    orbitingBody: 'Earth'
  },
  {
    id: '2026-PHA-2',
    name: '99942 Apophis (2004 MN4)',
    jplUrl: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=99942',
    isHazardous: true,
    minDiameterMeters: 340,
    maxDiameterMeters: 370,
    avgDiameterMeters: 355,
    velocityKms: '30.73',
    velocityKmh: '110,628',
    missDistanceKm: '31,600',
    rawKmDistance: 31600,
    lunarDistance: '0.08',
    closeApproachDate: '2029-04-13',
    orbitingBody: 'Earth'
  },
  {
    id: '2026-PHA-3',
    name: '101955 Bennu (1999 RQ36)',
    jplUrl: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=101955',
    isHazardous: true,
    minDiameterMeters: 490,
    maxDiameterMeters: 510,
    avgDiameterMeters: 500,
    velocityKms: '27.72',
    velocityKmh: '99,792',
    missDistanceKm: '4,800,000',
    rawKmDistance: 4800000,
    lunarDistance: '12.4',
    closeApproachDate: '2026-11-02',
    orbitingBody: 'Earth'
  },
  {
    id: '2026-PHA-4',
    name: '162173 Ryugu (1999 JU3)',
    jplUrl: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=162173',
    isHazardous: true,
    minDiameterMeters: 880,
    maxDiameterMeters: 920,
    avgDiameterMeters: 900,
    velocityKms: '29.00',
    velocityKmh: '104,400',
    missDistanceKm: '9,200,000',
    rawKmDistance: 9200000,
    lunarDistance: '23.9',
    closeApproachDate: '2026-10-24',
    orbitingBody: 'Earth'
  },
  {
    id: '2026-PHA-5',
    name: '65803 Didymos (1996 GT)',
    jplUrl: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=65803',
    isHazardous: true,
    minDiameterMeters: 760,
    maxDiameterMeters: 800,
    avgDiameterMeters: 780,
    velocityKms: '23.50',
    velocityKmh: '84,600',
    missDistanceKm: '10,500,000',
    rawKmDistance: 10500000,
    lunarDistance: '27.3',
    closeApproachDate: '2026-10-30',
    orbitingBody: 'Earth'
  },
  {
    id: '2026-PHA-6',
    name: '4179 Toutatis (1989 AC)',
    jplUrl: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=4179',
    isHazardous: true,
    minDiameterMeters: 2400,
    maxDiameterMeters: 2500,
    avgDiameterMeters: 2450,
    velocityKms: '38.00',
    velocityKmh: '136,800',
    missDistanceKm: '7,100,000',
    rawKmDistance: 7100000,
    lunarDistance: '18.4',
    closeApproachDate: '2026-12-12',
    orbitingBody: 'Earth'
  },
  {
    id: '2026-PHA-7',
    name: '3122 Florence (1981 ET3)',
    jplUrl: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=3122',
    isHazardous: true,
    minDiameterMeters: 4800,
    maxDiameterMeters: 5000,
    avgDiameterMeters: 4900,
    velocityKms: '13.60',
    velocityKmh: '48,960',
    missDistanceKm: '7,060,000',
    rawKmDistance: 7060000,
    lunarDistance: '18.3',
    closeApproachDate: '2026-11-18',
    orbitingBody: 'Earth'
  },
  {
    id: '2026-PHA-8',
    name: '3200 Phaethon (1983 TB)',
    jplUrl: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=3200',
    isHazardous: true,
    minDiameterMeters: 5700,
    maxDiameterMeters: 5900,
    avgDiameterMeters: 5800,
    velocityKms: '34.00',
    velocityKmh: '122,400',
    missDistanceKm: '10,300,000',
    rawKmDistance: 10300000,
    lunarDistance: '26.8',
    closeApproachDate: '2026-12-16',
    orbitingBody: 'Earth'
  }
];

function AsteroidRadar({ lang = 'en' }) {
  const [asteroids, setAsteroids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAsteroid, setSelectedAsteroid] = useState(null);
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'HAZARDOUS' | 'CLOSE' | 'LARGE'
  const [searchQuery, setSearchQuery] = useState('');
  const [isFallback, setIsFallback] = useState(false);
  const [dateRangeInfo, setDateRangeInfo] = useState({ start: '', end: '' });

  // Helper to format Date to YYYY-MM-DD
  const formatYYYYMMDD = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Fetch live NASA NeoWs Feed with dynamic 7-day start_date & end_date
  const fetchAsteroids = async () => {
    setLoading(true);

    // 1. Dynamic Date Logic: today & 7 days from today in YYYY-MM-DD format
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const startDate = formatYYYYMMDD(today);
    const endDate = formatYYYYMMDD(nextWeek);
    setDateRangeInfo({ start: startDate, end: endDate });

    const apiKey = getNasaApiKey();
    // Guaranteed HTTPS URL
    const httpsApiUrl = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${startDate}&end_date=${endDate}&api_key=${apiKey}`;

    let rawNeoObj = null;

    // Tier 1: Try local proxy route first (for full-stack dev)
    try {
      const res = await fetch(`/api/asteroids/neows?start_date=${startDate}&end_date=${endDate}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.near_earth_objects) {
          rawNeoObj = json.data.near_earth_objects;
          setIsFallback(Boolean(json.isFallback));
        }
      }
    } catch {}

    // Tier 2: Try direct NASA Open API via HTTPS with fallback key
    if (!rawNeoObj || Object.keys(rawNeoObj).length === 0) {
      let timeout;
      try {
        const controller = new AbortController();
        timeout = setTimeout(() => {
          try { controller.abort(); } catch {}
        }, 4500);

        const directRes = await fetch(httpsApiUrl, { signal: controller.signal });
        if (directRes.ok) {
          const directJson = await directRes.json();
          if (directJson.near_earth_objects && Object.keys(directJson.near_earth_objects).length > 0) {
            rawNeoObj = directJson.near_earth_objects;
            setIsFallback(false);
          }
        }
      } catch (err) {
        console.warn('NASA NeoWs API request failed or timed out:', err);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }

    // Process Received Real-Time Objects
    if (rawNeoObj && Object.keys(rawNeoObj).length > 0) {
      const allList = [];
      Object.keys(rawNeoObj).forEach(date => {
        (rawNeoObj[date] || []).forEach(item => {
          const closeApp = item.close_approach_data?.[0] || {};
          const kmDistance = parseFloat(closeApp.miss_distance?.kilometers || '10000000');
          const lunarDistance = parseFloat(closeApp.miss_distance?.lunar || '25');
          const velocityKms = parseFloat(closeApp.relative_velocity?.kilometers_per_second || '20');
          const minDiam = item.estimated_diameter?.meters?.estimated_diameter_min || 50;
          const maxDiam = item.estimated_diameter?.meters?.estimated_diameter_max || 120;
          const avgDiam = (minDiam + maxDiam) / 2;

          allList.push({
            id: item.id || `ast-${Math.random()}`,
            name: item.name || 'Unnamed Asteroid',
            jplUrl: item.nasa_jpl_url || `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${item.id}`,
            isHazardous: Boolean(item.is_potentially_hazardous_asteroid),
            minDiameterMeters: Math.round(minDiam),
            maxDiameterMeters: Math.round(maxDiam),
            avgDiameterMeters: Math.round(avgDiam),
            velocityKms: velocityKms.toFixed(2),
            velocityKmh: Math.round(velocityKms * 3600).toLocaleString(),
            missDistanceKm: Math.round(kmDistance).toLocaleString(),
            rawKmDistance: kmDistance,
            lunarDistance: lunarDistance.toFixed(2),
            closeApproachDate: closeApp.close_approach_date_full || closeApp.close_approach_date || 'Upcoming',
            orbitingBody: closeApp.orbiting_body || 'Earth'
          });
        });
      });

      if (allList.length > 0) {
        setAsteroids(allList);
        setLoading(false);
        return;
      }
    }

    // Tier 3: Seamlessly load Fallback Mock Dataset if API fails, rate-limits (429), or 400
    setAsteroids(MOCK_NEOWS_FALLBACK);
    setIsFallback(true);
    setLoading(false);
  };

  useEffect(() => {
    fetchAsteroids();
    const interval = setInterval(fetchAsteroids, 45000); // 45s throttled polling for 60FPS background efficiency
    return () => clearInterval(interval);
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
      subtitle: 'Real-time 7-day tracking of close-approach asteroids, orbital velocities, and hazardous threat levels',
      refresh: 'Refresh NeoWs Feed',
      filterAll: 'All Near-Earth Objects',
      filterHazardous: 'Potentially Hazardous (PHA)',
      filterClose: 'Closest Approaches (< 10 LD)',
      filterLarge: 'Largest Objects (> 100m)',
      searchPlaceholder: 'Search asteroid name or JPL ID...',
      hazardousTag: 'Potentially Hazardous',
      safeTag: 'Non-Hazardous Orbit',
      missDistance: 'Miss Distance',
      velocity: 'Relative Velocity',
      diameter: 'Estimated Diameter',
      approachDate: 'Close Approach Time',
      viewDetails: 'Inspect Object',
      modalTitle: 'Near-Earth Object Telemetry Dossier',
      jplDatabase: 'NASA JPL Small-Body Database',
      radarLegend: 'Target Range: 0 to 30 Million KM',
      sizeBenchmark: 'Size Equivalent',
      machSpeed: 'Mach Number Scale',
      closeApproachTelemetry: 'Close Approach Vector',
      offlineActive: 'OFFLINE / CACHED TELEMETRY ACTIVE',
      liveActive: 'LIVE NASA NEOWS FEED'
    },
    si: {
      title: 'නාසා NeoWs පෘථිවි ආසන්න අභ්‍යවකාශ රේඩාර් පද්ධතිය',
      subheading: 'පෘථිවියට ආසන්නව ගමන් කරන උල්කාෂ්ම, ප්‍රවේග සහ අවදානම් මට්ටම් තත්‍ය කාලීනව නිරීක්ෂණය කරන්න',
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
      closeApproachTelemetry: 'ආසන්න වීමේ ටෙලිමෙට්‍රි දත්ත',
      offlineActive: 'නොබැඳි / කැෂේ දත්ත සක්‍රියයි',
      liveActive: 'සජීවී නාසා NEOWS දත්ත'
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
      closeApproachTelemetry: 'நெருங்கும் தொலைநிலை அளவீடுகள்',
      offlineActive: 'ஆஃப்லைன் / சேமிக்கப்பட்ட தரவு',
      liveActive: 'நேரலை நாசா NEOWS தரவு'
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
      <div className="relative overflow-hidden rounded-3xl apple-liquid-glass p-6 sm:p-7 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full apple-liquid-glass text-rose-300 text-xs font-mono border-rose-500/30">
                <Radio className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                <span>NASA NeoWs 7-DAY ORBITAL RADAR</span>
              </div>

              {/* Live / Offline Fallback Badge */}
              {isFallback ? (
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[11px] font-mono font-bold">
                  <WifiOff className="w-3 h-3 text-amber-400" />
                  <span>{t.offlineActive}</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[11px] font-mono font-bold">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>{t.liveActive}</span>
                </div>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-black font-['Orbitron'] text-white tracking-wide">
              {t.title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl font-sans">
              {t.subtitle} {dateRangeInfo.start ? `(${dateRangeInfo.start} to ${dateRangeInfo.end})` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={fetchAsteroids}
            disabled={loading}
            className="px-4 py-2.5 rounded-2xl apple-liquid-glass hover:text-white text-cyan-300 text-xs font-mono font-bold flex items-center gap-2 transition cursor-pointer self-start md:self-auto shadow-lg shadow-cyan-950/40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{t.refresh}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Radar Screen (Left) + Asteroid Controls & Feed (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Radar Circular Target Visualizer */}
        <div className="lg:col-span-6 rounded-3xl apple-liquid-glass p-6 sm:p-7 shadow-2xl flex flex-col items-center justify-between relative overflow-hidden min-h-[460px]">
          {/* Ambient Radar Grid Background */}
          <div className="w-full flex items-center justify-between text-[11px] font-mono text-slate-300 z-10 w-full mb-2">
            <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
              <Target className="w-3.5 h-3.5" />
              EARTH CENTERED RADAR
            </span>
            <span className="text-slate-400 text-[10px] hidden sm:inline">
              {t.radarLegend}
            </span>
          </div>

          {/* Radar Screen Sphere Container */}
          <div className="relative w-[300px] h-[300px] sm:w-[360px] sm:h-[360px] rounded-full border-2 border-cyan-500/40 apple-liquid-glass shadow-[0_0_50px_rgba(6,182,212,0.2)] flex items-center justify-center my-4 overflow-hidden">
            
            {/* Concentric Distance Rings */}
            <div className="absolute w-[80%] h-[80%] rounded-full border border-dashed border-cyan-500/30 flex items-center justify-start pl-2">
              <span className="text-[9px] font-mono text-cyan-400/70 font-semibold">5 LD</span>
            </div>
            <div className="absolute w-[60%] h-[60%] rounded-full border border-cyan-500/25 flex items-center justify-start pl-2">
              <span className="text-[9px] font-mono text-cyan-400/70 font-semibold">2.5 LD</span>
            </div>
            <div className="absolute w-[38%] h-[38%] rounded-full border border-dashed border-cyan-500/30 flex items-center justify-start pl-2">
              <span className="text-[9px] font-mono text-cyan-400/70 font-semibold">1 LD</span>
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
                background: 'conic-gradient(from 0deg, rgba(6, 182, 212, 0.45) 0deg, rgba(6, 182, 212, 0.08) 45deg, transparent 90deg, transparent 360deg)'
              }}
            />

            {/* Asteroids Plotted on Radar Target Grid */}
            {!loading && filteredAsteroids.map((ast, idx) => {
              const maxScaleKm = 28000000;
              const normalizedDist = Math.min(1, Math.max(0.12, ast.rawKmDistance / maxScaleKm));
              const radiusPx = normalizedDist * 140;

              const angleDeg = (idx * 48 + (parseInt(ast.id.replace(/\D/g, '')) || idx * 37)) % 360;
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
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 rounded-xl apple-liquid-glass text-[10px] font-mono text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl">
                    {ast.name} • {ast.lunarDistance} LD
                  </div>
                </div>
              );
            })}
          </div>

          {/* Radar Telemetry Footer Strip */}
          <div className="w-full flex items-center justify-between text-xs font-mono text-slate-300 pt-3 border-t border-white/10">
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
          <div className="p-4 sm:p-5 rounded-3xl apple-liquid-glass space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl apple-liquid-glass text-xs font-mono text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500/60"
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
                  className={`px-3.5 py-1.5 rounded-2xl whitespace-nowrap transition cursor-pointer ${
                    filter === f.id
                      ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white font-bold shadow-md shadow-cyan-950/50'
                      : 'apple-liquid-glass text-slate-300 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Asteroid Cards Scrollable Feed */}
          <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
            {loading ? (
              /* Graceful Loading Skeletons */
              <div className="space-y-3">
                {[1, 2, 3, 4].map(n => (
                  <div 
                    key={n} 
                    className="p-4 rounded-3xl apple-liquid-glass animate-pulse space-y-3"
                  >
                    <div className="flex justify-between items-center">
                      <div className="h-4 w-40 bg-white/10 rounded-lg" />
                      <div className="h-5 w-24 bg-white/10 rounded-full" />
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="h-8 bg-white/5 rounded-xl" />
                      <div className="h-8 bg-white/5 rounded-xl" />
                      <div className="h-8 bg-white/5 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredAsteroids.length === 0 ? (
              <div className="p-8 text-center font-mono text-xs text-slate-400 apple-liquid-glass rounded-3xl">
                No matching asteroids found in current 7-day orbital window.
              </div>
            ) : (
              filteredAsteroids.map(ast => (
                <motion.div
                  key={ast.id}
                  layout
                  onClick={() => setSelectedAsteroid(ast)}
                  className={`p-4 sm:p-5 rounded-3xl apple-liquid-glass transition-all cursor-pointer space-y-3 ${
                    selectedAsteroid?.id === ast.id
                      ? 'ring-2 ring-cyan-400 shadow-lg shadow-cyan-950/40'
                      : 'hover:border-cyan-400/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${ast.isHazardous ? 'bg-rose-500 animate-pulse' : 'bg-indigo-400'}`} />
                      <h4 className="font-['Orbitron'] font-bold text-white text-sm">
                        {ast.name}
                      </h4>
                    </div>

                    <span className={`px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${
                      ast.isHazardous 
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' 
                        : 'apple-liquid-glass text-slate-300'
                    }`}>
                      {ast.isHazardous ? t.hazardousTag : t.safeTag}
                    </span>
                  </div>

                  {/* Key Telemetry Badges */}
                  <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                    <div className="p-2.5 rounded-2xl apple-liquid-glass">
                      <span className="text-slate-400 block text-[9px] uppercase">Miss Distance</span>
                      <span className="text-cyan-300 font-bold">{ast.lunarDistance} LD</span>
                    </div>

                    <div className="p-2.5 rounded-2xl apple-liquid-glass">
                      <span className="text-slate-400 block text-[9px] uppercase">Velocity</span>
                      <span className="text-amber-300 font-bold">{ast.velocityKms} km/s</span>
                    </div>

                    <div className="p-2.5 rounded-2xl apple-liquid-glass">
                      <span className="text-slate-400 block text-[9px] uppercase">Est. Diameter</span>
                      <span className="text-indigo-300 font-bold">{ast.avgDiameterMeters} m</span>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Selected Asteroid Modal Dossier */}
      <AnimatePresence>
        {selectedAsteroid && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl rounded-3xl apple-liquid-glass p-6 sm:p-8 shadow-2xl space-y-6 text-slate-200 font-sans max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-2xl ${selectedAsteroid.isHazardous ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'}`}>
                    <Target className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-['Orbitron'] font-bold text-white text-lg sm:text-xl">
                      {selectedAsteroid.name}
                    </h3>
                    <p className="text-xs font-mono text-slate-400">
                      JPL SPK-ID: {selectedAsteroid.id} • Approach: {selectedAsteroid.closeApproachDate}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedAsteroid(null)}
                  className="p-2 rounded-xl apple-liquid-glass text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Integrated Risk Gauge */}
              <AsteroidRiskGauge asteroid={selectedAsteroid} />

              {/* Detailed Physical Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                <div className="p-3.5 rounded-2xl apple-liquid-glass space-y-1">
                  <span className="text-slate-400 block text-[10px] uppercase">Miss Distance Breakdown</span>
                  <span className="text-white font-bold text-sm">{selectedAsteroid.missDistanceKm} km</span>
                  <span className="text-cyan-400 block text-[11px]">({selectedAsteroid.lunarDistance}x Lunar Distances)</span>
                </div>

                <div className="p-3.5 rounded-2xl apple-liquid-glass space-y-1">
                  <span className="text-slate-400 block text-[10px] uppercase">Orbital Velocity</span>
                  <span className="text-white font-bold text-sm">{selectedAsteroid.velocityKmh} km/h</span>
                  <span className="text-amber-400 block text-[11px]">({selectedAsteroid.velocityKms} km/s • ~Mach {Math.round(parseFloat(selectedAsteroid.velocityKms) * 2916)})</span>
                </div>

                <div className="p-3.5 rounded-2xl apple-liquid-glass space-y-1">
                  <span className="text-slate-400 block text-[10px] uppercase">Size Benchmark</span>
                  <span className="text-white font-bold text-sm">~{selectedAsteroid.avgDiameterMeters} meters</span>
                  <span className="text-indigo-400 block text-[11px]">{getSizeComparison(selectedAsteroid.avgDiameterMeters)}</span>
                </div>

                <div className="p-3.5 rounded-2xl apple-liquid-glass space-y-1">
                  <span className="text-slate-400 block text-[10px] uppercase">Primary Orbiting Body</span>
                  <span className="text-white font-bold text-sm">{selectedAsteroid.orbitingBody}</span>
                  <span className="text-slate-400 block text-[11px]">Heliocentric / Earth Intersection</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <a
                  href={selectedAsteroid.jplUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 rounded-xl apple-liquid-glass text-cyan-300 font-mono text-xs flex items-center gap-1.5 transition hover:border-cyan-400"
                >
                  <span>{t.jplDatabase}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={() => setSelectedAsteroid(null)}
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono font-bold text-xs transition cursor-pointer"
                >
                  Close Dossier
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default memo(AsteroidRadar);
