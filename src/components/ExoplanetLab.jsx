import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Globe, 
  Sparkles, 
  Thermometer, 
  Orbit as OrbitIcon, 
  Ruler, 
  Weight, 
  Compass, 
  Search, 
  RefreshCw, 
  ShieldCheck, 
  AlertCircle, 
  Info, 
  ExternalLink,
  ChevronRight,
  Sliders
} from 'lucide-react';

// ====================================================
// Procedural Texture Generator for Exoplanet Classes
// ====================================================
function createProceduralExoplanetTexture(planet) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const temp = planet?.pl_eqt || 255;
  const rad = planet?.pl_rade || 1.0;

  // Classify planet type for custom procedural surface
  let isHotJupiter = rad > 3.5 || temp > 600;
  let isHycean = rad > 1.8 && rad <= 3.5;
  let isTidallyLocked = planet?.pl_name?.toLowerCase().includes('trappist') || planet?.pl_name?.toLowerCase().includes('proxima');

  if (isHotJupiter) {
    // Swirling Gas Giant Bands (Hot Jupiter)
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#451a03');
    grad.addColorStop(0.2, '#d97706');
    grad.addColorStop(0.4, '#b45309');
    grad.addColorStop(0.6, '#f59e0b');
    grad.addColorStop(0.8, '#78350f');
    grad.addColorStop(1, '#451a03');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Thermal Storm Bands
    ctx.fillStyle = 'rgba(254, 243, 199, 0.25)';
    for (let i = 0; i < 40; i++) {
      const y = (i / 40) * canvas.height;
      const h = Math.random() * 12 + 4;
      ctx.fillRect(0, y, canvas.width, h);
    }
  } else if (isHycean) {
    // Deep Ocean World (Hycean)
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#0284c7');
    grad.addColorStop(0.5, '#0369a1');
    grad.addColorStop(1, '#075985');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dense atmospheric swirls
    ctx.fillStyle = 'rgba(224, 242, 254, 0.35)';
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const r = Math.random() * 80 + 20;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (isTidallyLocked) {
    // Tidally-Locked Red Dwarf World (Copper/Terminator)
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0, '#1e1b4b'); // Night side (Dark Ice)
    grad.addColorStop(0.45, '#9a3412'); // Twilight Zone (Habitable Rim)
    grad.addColorStop(0.55, '#ea580c'); // Dayside (Copper Desert)
    grad.addColorStop(1, '#b45309');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Surface Craters & Basins
    ctx.fillStyle = 'rgba(67, 20, 7, 0.4)';
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const r = Math.random() * 45 + 10;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Super-Earth / Earth-like World (Oceans & Continents)
    ctx.fillStyle = '#0284c7'; // Deep Ocean
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Green/Ochre Landmasses
    ctx.fillStyle = '#15803d';
    for (let i = 0; i < 70; i++) {
      const x = (Math.sin(i * 1.7) * 0.45 + 0.5) * canvas.width;
      const y = (Math.cos(i * 2.3) * 0.4 + 0.5) * canvas.height;
      const r = Math.abs(Math.sin(i * 3.1)) * 90 + 20;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Atmosphere Clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const r = Math.random() * 60 + 15;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

// ====================================================
// 3D Rotating Planet Sphere Component
// ====================================================
function InteractivePlanetGlobe({ radius = 1.0, texture, glowColor = '#38bdf8', wireframe = false }) {
  const meshRef = useRef();

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.12;
    }
  });

  return (
    <group ref={meshRef}>
      {/* Main Textured Sphere */}
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[radius, 96, 96]} />
        <meshStandardMaterial
          map={texture}
          roughness={0.7}
          metalness={0.1}
          wireframe={wireframe}
        />
      </mesh>

      {/* Atmospheric Glow Halo */}
      <mesh>
        <sphereGeometry args={[radius * 1.06, 64, 64]} />
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export default function ExoplanetLab({ lang = 'en' }) {
  const [exoplanets, setExoplanets] = useState([]);
  const [selectedPlanet, setSelectedPlanet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [wireframe, setWireframe] = useState(false);

  // Fetch confirmed exoplanet targets from TAP API / Backend Proxy
  const fetchExoplanets = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/exoplanets');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.exoplanets) {
          setExoplanets(json.exoplanets);
          setSelectedPlanet(json.exoplanets[0]);
        }
      }
    } catch (err) {
      console.warn('Exoplanet fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExoplanets();
  }, []);

  // Earth Reference Texture & Exoplanet Texture
  const earthTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#166534';
      for (let i = 0; i < 80; i++) {
        const x = (Math.sin(i * 1.9) * 0.45 + 0.5) * canvas.width;
        const y = (Math.cos(i * 2.1) * 0.4 + 0.5) * canvas.height;
        const r = Math.abs(Math.sin(i * 3.3)) * 80 + 15;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  const exoplanetTexture = useMemo(() => {
    return createProceduralExoplanetTexture(selectedPlanet);
  }, [selectedPlanet]);

  // Scaled Radius for 3D Viewport (Clamped between 0.5 and 2.4 for clean viewing)
  const displayRadius = useMemo(() => {
    if (!selectedPlanet?.pl_rade) return 1.0;
    return Math.min(2.4, Math.max(0.5, selectedPlanet.pl_rade * 0.9));
  }, [selectedPlanet]);

  // Filtered Exoplanets List
  const filteredPlanets = useMemo(() => {
    if (!searchQuery.trim()) return exoplanets;
    const q = searchQuery.toLowerCase();
    return exoplanets.filter(p => p.pl_name.toLowerCase().includes(q) || p.hostname?.toLowerCase().includes(q));
  }, [exoplanets, searchQuery]);

  // Language Dictionary
  const UI = {
    en: {
      title: '3D Exoplanet Comparative Habitability Lab',
      subtitle: 'Side-by-side 3D planetary mesh comparison of Earth with confirmed extrasolar candidates from NASA Exoplanet Archive',
      earthRef: 'EARTH (REFERENCE: 1.0 R⊕)',
      targetExo: 'TARGET EXOPLANET MESH',
      radiusRatio: 'Radius Ratio',
      massRatio: 'Mass Ratio',
      orbitalPeriod: 'Orbital Period',
      eqTemp: 'Equilibrium Temp',
      distance: 'Distance from Earth',
      esiIndex: 'Earth Similarity Index (ESI)',
      esiLabel: 'Habitability Potential',
      facility: 'Discovery Observatory',
      searchPlaceholder: 'Search exoplanet (e.g. Kepler-452b, TRAPPIST-1e)...',
      refresh: 'Reload TAP Data',
      wireframeToggle: 'Toggle Mesh Wireframe',
      specSheetTitle: 'Astrophysical Spec Sheet'
    },
    si: {
      title: '3D බාහිර ග්‍රහලෝක සංසන්දනාත්මක විද්‍යාගාරය',
      subheading: 'නාසා බාහිර ග්‍රහලෝක දත්ත සමුදායේ තහවුරු කළ ග්‍රහලෝක පෘථිවිය සමඟ පසෙකින් පසෙක සංසන්දනය කරන්න',
      earthRef: 'පෘථිවිය (සංසන්දනාත්මක: 1.0 R⊕)',
      targetExo: 'බාහිර ග්‍රහලෝක ආකෘතිය',
      radiusRatio: 'විෂ්කම්භ අනුපාතය',
      massRatio: 'ස්කන්ධ අනුපාතය',
      orbitalPeriod: 'කක්ෂීය කාලපරිච්ඡේදය',
      eqTemp: 'සමතුලිත උෂ්ණත්වය',
      distance: 'පෘථිවියේ සිට දුර',
      esiIndex: 'පෘථිවි සමානතා දර්ශකය (ESI)',
      esiLabel: 'වාසස්ථානීය සම්භාවිතාව',
      facility: 'සොයාගත් දුරේක්ෂය',
      searchPlaceholder: 'ග්‍රහලෝකය සොයන්න (උදා: Kepler-452b, TRAPPIST-1e)...',
      refresh: 'දත්ත යාවත්කාලීන කරන්න',
      wireframeToggle: 'වයර්ෆ්‍රේම් ආකෘතිය',
      specSheetTitle: 'විද්‍යාත්මක දත්ත වාර්තාව'
    },
    ta: {
      title: '3D புறக்கோள் ஒப்பீட்டு ஆய்வகம்',
      subheading: 'நாசா புறக்கோள் காப்பகத்தின் உறுதிப்படுத்தப்பட்ட கோள்களை பூமியுடன் ஒப்பீடு செய்திடுங்கள்',
      earthRef: 'பூமி (ஒப்பீடு: 1.0 R⊕)',
      targetExo: 'இலக்கு புறக்கோள் 3D',
      radiusRatio: 'ஆர விகிதம்',
      massRatio: 'நிறை விகிதம்',
      orbitalPeriod: 'சுற்றுப்பாதை காலம்',
      eqTemp: 'சமநிலை வெப்பநிலை',
      distance: 'பூமியிலிருந்து தொலைவு',
      esiIndex: 'பூமி ஒப்புமை குறியீடு (ESI)',
      esiLabel: 'வாழ்விட சாத்தியம்',
      facility: 'கண்டுபிடித்த தொலைநோக்கி',
      searchPlaceholder: 'புறக்கோள் தேடுக (எ.கா. Kepler-452b, TRAPPIST-1e)...',
      refresh: 'புதுப்பிக்குக',
      wireframeToggle: 'வலை வடிவமைப்பு',
      specSheetTitle: 'வானியற்பியல் தரவு அறிக்கை'
    }
  };

  const t = UI[lang] || UI.en;

  return (
    <div className="w-full space-y-6 select-none font-sans">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-indigo-950/80 to-slate-950 border border-slate-800 p-6 shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono mb-2">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>NASA EXOPLANET ARCHIVE TAP SYSTEM</span>
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
              onClick={() => setWireframe(!wireframe)}
              className={`px-3.5 py-2 rounded-2xl border text-xs font-mono font-bold transition cursor-pointer ${
                wireframe ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              Wireframe
            </button>

            <button
              type="button"
              onClick={fetchExoplanets}
              disabled={loading}
              className="px-3.5 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
              <span className="hidden sm:inline">{t.refresh}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main 3D Side-by-Side Comparison Canvas Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* 3D WebGL Viewport (Left/Top) */}
        <div className="lg:col-span-7 rounded-3xl apple-liquid-glass p-6 sm:p-7 shadow-2xl flex flex-col justify-between relative overflow-hidden min-h-[480px]">
          
          {/* Top Scale Callout Header */}
          <div className="w-full flex items-center justify-between text-xs font-mono text-slate-300 z-10 mb-2">
            <span className="flex items-center gap-1.5 text-cyan-300 font-bold">
              <Globe className="w-4 h-4 text-cyan-400" />
              SIDE-BY-SIDE 3D MESH COMPARISON
            </span>
            {selectedPlanet && (
              <span className="px-3 py-1 rounded-full apple-liquid-glass text-cyan-300 font-bold text-[11px] border-cyan-500/30">
                Scale: 1.0x Earth vs {selectedPlanet.pl_rade?.toFixed(2)}x Earth
              </span>
            )}
          </div>

          {/* Dual 3D Viewport Side-by-Side Layout */}
          <div className="grid grid-cols-2 gap-4 w-full my-auto h-[320px] relative">
            
            {/* Viewport 1: Earth Reference */}
            <div className="relative rounded-3xl apple-liquid-glass overflow-hidden flex flex-col justify-between p-3.5">
              <div className="absolute top-2 left-3 z-10 text-[10px] font-mono text-slate-300 font-bold apple-liquid-glass px-2.5 py-0.5 rounded-lg border-white/10">
                {t.earthRef}
              </div>

              <div className="w-full h-full cursor-grab active:cursor-grabbing">
                <Canvas gl={{ antialias: true }}>
                  <PerspectiveCamera makeDefault position={[0, 0, 3.8]} fov={50} />
                  <ambientLight intensity={0.6} />
                  <directionalLight position={[10, 10, 8]} intensity={1.5} />
                  <InteractivePlanetGlobe radius={1.0} texture={earthTexture} glowColor="#38bdf8" wireframe={wireframe} />
                  <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.8} />
                </Canvas>
              </div>

              <div className="text-center font-mono text-[10px] text-cyan-300 font-bold z-10">
                R⊕ = 6,371 km • 1.00 Earth Mass
              </div>
            </div>

            {/* Viewport 2: Target Exoplanet */}
            <div className="relative rounded-3xl apple-liquid-glass overflow-hidden flex flex-col justify-between p-3.5">
              <div className="absolute top-2 left-3 z-10 text-[10px] font-mono text-cyan-300 font-bold apple-liquid-glass px-2.5 py-0.5 rounded-lg border-cyan-500/30">
                {selectedPlanet?.pl_name || t.targetExo}
              </div>

              <div className="w-full h-full cursor-grab active:cursor-grabbing">
                <Canvas gl={{ antialias: true }}>
                  <PerspectiveCamera makeDefault position={[0, 0, 3.8]} fov={50} />
                  <ambientLight intensity={0.6} />
                  <directionalLight position={[10, 10, 8]} intensity={1.5} />
                  {selectedPlanet && (
                    <InteractivePlanetGlobe
                      radius={displayRadius}
                      texture={exoplanetTexture}
                      glowColor={selectedPlanet.pl_eqt > 500 ? '#f59e0b' : '#38bdf8'}
                      wireframe={wireframe}
                    />
                  )}
                  <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.8} />
                </Canvas>
              </div>

              <div className="text-center font-mono text-[10px] text-amber-300 font-bold z-10">
                R = {selectedPlanet?.pl_rade?.toFixed(2) || '1.0'} R⊕ • {selectedPlanet?.pl_masse?.toFixed(1) || '1.0'} M⊕
              </div>
            </div>
          </div>

          <div className="text-center text-[11px] font-mono text-slate-400 pt-2 border-t border-white/10">
            Rotate 3D spheres with click & drag • Real-time WebGL shader rendering
          </div>
        </div>

        {/* Exoplanet Selector & Spec Sheet (Right) */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Target Exoplanet Presets Bar */}
          <div className="p-5 rounded-3xl apple-liquid-glass space-y-3 shadow-xl">
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

            {/* Quick Target Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono pb-1">
              {filteredPlanets.slice(0, 6).map(p => (
                <button
                  key={p.pl_name}
                  type="button"
                  onClick={() => setSelectedPlanet(p)}
                  className={`px-3.5 py-1.5 rounded-2xl whitespace-nowrap transition cursor-pointer ${
                    selectedPlanet?.pl_name === p.pl_name
                      ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white font-bold shadow-md shadow-cyan-950/50'
                      : 'apple-liquid-glass text-slate-300 hover:text-white'
                  }`}
                >
                  {p.pl_name}
                </button>
              ))}
            </div>
          </div>

          {/* Habitability Spec Sheet Cards */}
          {selectedPlanet && (
            <div className="p-6 rounded-3xl apple-liquid-glass space-y-4 shadow-xl">
              
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h3 className="text-lg font-bold font-['Orbitron'] text-white">
                    {selectedPlanet.pl_name}
                  </h3>
                  <p className="text-xs font-mono text-cyan-400 mt-0.5">
                    Host Star: {selectedPlanet.hostname} • {selectedPlanet.class || 'Extrasolar Target'}
                  </p>
                </div>

                <div className="px-3.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>ESI: {(selectedPlanet.esi || 0.82).toFixed(2)}</span>
                </div>
              </div>

              {/* Spec Sheet Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3.5 rounded-2xl apple-liquid-glass">
                  <span className="text-slate-400 block text-[10px] mb-0.5">{t.radiusRatio}</span>
                  <span className="text-cyan-300 font-bold text-sm">{selectedPlanet.pl_rade?.toFixed(2)} R⊕</span>
                  <span className="text-slate-400 block text-[9px] mt-0.5">({Math.round((selectedPlanet.pl_rade || 1) * 6371).toLocaleString()} km)</span>
                </div>

                <div className="p-3.5 rounded-2xl apple-liquid-glass">
                  <span className="text-slate-400 block text-[10px] mb-0.5">{t.massRatio}</span>
                  <span className="text-indigo-300 font-bold text-sm">{selectedPlanet.pl_masse?.toFixed(2) || 'N/A'} M⊕</span>
                  <span className="text-slate-400 block text-[9px] mt-0.5">(Earth Mass Multiple)</span>
                </div>

                <div className="p-3.5 rounded-2xl apple-liquid-glass">
                  <span className="text-slate-400 block text-[10px] mb-0.5">{t.orbitalPeriod}</span>
                  <span className="text-amber-300 font-bold text-sm">{selectedPlanet.pl_orbper?.toFixed(1)} Days</span>
                  <span className="text-slate-400 block text-[9px] mt-0.5">({(selectedPlanet.pl_orbper / 365.25).toFixed(2)} Earth Years)</span>
                </div>

                <div className="p-3.5 rounded-2xl apple-liquid-glass">
                  <span className="text-slate-400 block text-[10px] mb-0.5">{t.eqTemp}</span>
                  <span className="text-rose-300 font-bold text-sm">{selectedPlanet.pl_eqt || 255} K</span>
                  <span className="text-slate-400 block text-[9px] mt-0.5">({((selectedPlanet.pl_eqt || 255) - 273.15).toFixed(1)} °C)</span>
                </div>
              </div>

              {/* Distance & Facility Box */}
              <div className="p-3.5 rounded-2xl apple-liquid-glass space-y-1 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-300">
                  <span>{t.distance}:</span>
                  <span className="text-cyan-300 font-bold">
                    {selectedPlanet.sy_dist ? `${(selectedPlanet.sy_dist * 3.26156).toFixed(1)} ly (${selectedPlanet.sy_dist.toFixed(1)} pc)` : '124 ly'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400 text-[11px] pt-1 border-t border-white/10">
                  <span>{t.facility}:</span>
                  <span className="text-slate-200">{selectedPlanet.disc_facility || 'Kepler Space Telescope'} ({selectedPlanet.disc_year || '2015'})</span>
                </div>
              </div>

              {/* Planet Overview Description */}
              <div className="p-4 rounded-2xl apple-liquid-glass text-xs text-slate-300 space-y-1 border-cyan-500/30">
                <span className="font-bold font-mono text-cyan-300 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  Astrophysical Overview:
                </span>
                <p className="leading-relaxed font-sans text-slate-300 text-[11px]">
                  {selectedPlanet.description || `${selectedPlanet.pl_name} is a confirmed exoplanet orbiting host star ${selectedPlanet.hostname} with a radius of ${selectedPlanet.pl_rade} Earth radii and an equilibrium temperature of ${selectedPlanet.pl_eqt} K.`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
