import React, { useState, useEffect, useMemo, useRef, memo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { fetchExoplanets as fetchExoplanetsPipeline } from '@/lib/nasaApi';
import {
  Globe,
  Sparkles,
  Search,
  RefreshCw,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { useDevicePerformance } from '../hooks/useDevicePerformance';
import { EARTH_TEXTURES } from '../three/earthConfig';
import {
  classifyExoplanetVisual,
  computeDisplayRadius,
  getExoplanetLabConfig,
} from '../three/exoplanetConfig';
import SpaceEnvironment from '../three/lighting/SpaceEnvironment';
import CinematicPostprocessing from '../three/postprocessing/CinematicPostprocessing';
import DynamicStarfield from './DynamicStarfield.jsx';
import {
  EARTH_VERTEX_GLSL,
  PLANET_ATMOSPHERE_FRAGMENT_GLSL,
} from '../three/shaders';
import {
  createExoplanetSurfaceTextures,
  createFallbackPlanetaryTexture,
} from '../three/textures/proceduralTextures';

const LAB_SUN_DIR = new THREE.Vector3(8, 6, 8).normalize();

// ====================================================
// 3D Rotating Planet Sphere with Rayleigh Limb Shader
// ====================================================
function InteractivePlanetGlobe({
  position = [0, 0, 0],
  radius = 1.0,
  segments = 64,
  texture,
  bumpMap = null,
  bumpScale = 0.03,
  roughness = 0.68,
  atmosphereColor = '#38bdf8',
  rimColor = '#bae6fd',
  rimPower = 3.4,
  rimIntensity = 0.95,
  wireframe = false,
  reducedMotion = false,
  rotationRate = 0.14,
}) {
  const meshRef = useRef();

  const atmosphereMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: EARTH_VERTEX_GLSL,
        fragmentShader: PLANET_ATMOSPHERE_FRAGMENT_GLSL,
        uniforms: {
          uSunDirection: { value: LAB_SUN_DIR.clone() },
          uDayColor: { value: new THREE.Color(atmosphereColor) },
          uRimColor: { value: new THREE.Color(rimColor) },
          uPower: { value: rimPower },
          uIntensity: { value: rimIntensity },
        },
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      }),
    [atmosphereColor, rimColor, rimPower, rimIntensity]
  );

  useEffect(() => () => atmosphereMaterial.dispose(), [atmosphereMaterial]);

  useFrame((_, rawDelta) => {
    if (!reducedMotion && meshRef.current) {
      meshRef.current.rotation.y += Math.min(rawDelta, 0.1) * rotationRate;
    }
  });

  const atmoSegs = Math.max(32, Math.floor(segments * 0.75));

  return (
    <group position={position}>
      <group ref={meshRef}>
        <mesh>
          <sphereGeometry args={[radius, segments, segments]} />
          <meshStandardMaterial
            map={texture}
            bumpMap={bumpMap}
            bumpScale={bumpScale}
            roughness={roughness}
            metalness={0.08}
            wireframe={wireframe}
          />
        </mesh>
      </group>

      {!wireframe && (
        <mesh scale={[1.075, 1.075, 1.075]}>
          <sphereGeometry args={[radius, atmoSegs, atmoSegs]} />
          <primitive object={atmosphereMaterial} attach="material" />
        </mesh>
      )}
    </group>
  );
}

function formatValue(value, digits) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'N/A';
}

function ExoplanetLab({ lang = 'en' }) {
  const [exoplanets, setExoplanets] = useState([]);
  const [selectedPlanet, setSelectedPlanet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [wireframe, setWireframe] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isInView, setIsInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const [contextLost, setContextLost] = useState(false);
  const [earthMap, setEarthMap] = useState(null);

  const containerRef = useRef(null);
  const cleanupCanvasRef = useRef(null);

  const { isOptimizedModeActive, supportsWebGL, qualityProfile, gpuTier } = useDevicePerformance();
  const labConfig = useMemo(() => getExoplanetLabConfig(qualityProfile), [qualityProfile]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  // Pause 3D render loop when scrolled out of viewport or tab hidden
  useEffect(() => {
    if (!containerRef.current || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold: 0.05 }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onVis = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    return () => {
      cleanupCanvasRef.current?.();
      cleanupCanvasRef.current = null;
    };
  }, []);

  // Fetch confirmed exoplanet targets from Central NASA API Pipeline
  const fetchExoplanets = async () => {
    setLoading(true);
    try {
      const list = await fetchExoplanetsPipeline();
      const valid = Array.isArray(list)
        ? list.filter((p) => p && typeof p.pl_name === 'string' && p.pl_name.trim())
        : [];
      setExoplanets(valid);
      setSelectedPlanet(valid[0] || null);
    } catch (err) {
      console.warn('Exoplanet pipeline fetch error:', err);
      setExoplanets([]);
      setSelectedPlanet(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExoplanets();
  }, []);

  // Instant fallback Earth texture + local NASA Blue Marble upgrade
  const fallbackEarthTex = useMemo(() => createFallbackPlanetaryTexture('earth'), []);
  useEffect(() => () => fallbackEarthTex?.dispose(), [fallbackEarthTex]);

  useEffect(() => {
    let active = true;
    let loadedTex = null;
    const loader = new THREE.TextureLoader();
    loader.load(
      EARTH_TEXTURES.day1024,
      (tex) => {
        if (!active) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        loadedTex = tex;
        setEarthMap(tex);
      },
      undefined,
      () => {
        // Retain deterministic fallbackEarthTex cleanly if image decode fails
      }
    );
    return () => {
      active = false;
      loadedTex?.dispose();
    };
  }, []);

  const visualProfile = useMemo(
    () => classifyExoplanetVisual(selectedPlanet),
    [selectedPlanet]
  );

  // Deterministic seeded albedo + relief bump map for the selected exoplanet
  const exoplanetTextures = useMemo(
    () =>
      createExoplanetSurfaceTextures(
        selectedPlanet?.pl_name || 'exoplanet-default',
        visualProfile.archetype
      ),
    [selectedPlanet?.pl_name, visualProfile.archetype]
  );

  useEffect(() => () => exoplanetTextures.dispose(), [exoplanetTextures]);

  // Scaled Radius for 3D Viewport (clamped cleanly so Earth & Target sit side-by-side)
  const displayRadius = useMemo(
    () => computeDisplayRadius(selectedPlanet?.pl_rade),
    [selectedPlanet?.pl_rade]
  );

  // Filtered Exoplanets List
  const filteredPlanets = useMemo(() => {
    if (!searchQuery.trim()) return exoplanets;
    const q = searchQuery.toLowerCase();
    return exoplanets.filter(
      (p) => p.pl_name.toLowerCase().includes(q) || p.hostname?.toLowerCase().includes(q)
    );
  }, [exoplanets, searchQuery]);

  // Language Dictionary (all 3 languages define `subtitle`)
  const UI = {
    en: {
      title: '3D Exoplanet Comparative Habitability Lab',
      subtitle:
        'Side-by-side 3D planetary mesh comparison of Earth with confirmed extrasolar candidates from NASA Exoplanet Archive',
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
      specSheetTitle: 'Astrophysical Spec Sheet',
    },
    si: {
      title: '3D බාහිර ග්‍රහලෝක සංසන්දනාත්මක විද්‍යාගාරය',
      subtitle:
        'නාසා බාහිර ග්‍රහලෝක දත්ත සමුදායේ තහවුරු කළ ග්‍රහලෝක පෘථිවිය සමඟ පසෙකින් පසෙක සංසන්දනය කරන්න',
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
      specSheetTitle: 'විද්‍යාත්මක දත්ත වාර්තාව',
    },
    ta: {
      title: '3D புறக்கோள் ஒப்பீட்டு ஆய்வகம்',
      subtitle:
        'நாசா புறக்கோள் காப்பகத்தின் உறுதிப்படுத்தப்பட்ட கோள்களை பூமியுடன் ஒப்பீடு செய்திடுங்கள்',
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
      specSheetTitle: 'வானியற்பியல் தரவு அறிக்கை',
    },
  };

  const t = UI[lang] || UI.en;
  const canMeasureCanvas = typeof ResizeObserver !== 'undefined';
  const showWebGL =
    canMeasureCanvas && supportsWebGL && labConfig.enableWebGL && !isOptimizedModeActive && !contextLost;

  // Dynamic horizontal spacing so Earth (radius 1.0) and Target never collide
  const earthX = -1.65;
  const targetX = 1.45 + Math.max(0, (displayRadius - 1.0) * 0.55);

  return (
    <div className="w-full space-y-6 select-none font-sans">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-indigo-950/80 to-slate-950 border border-line p-6 shadow-2xl glass-strong">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono mb-2">
              <Sparkles className={`w-3.5 h-3.5 text-cyan-400 ${reducedMotion ? '' : 'animate-pulse'}`} />
              <span>NASA EXOPLANET ARCHIVE TAP SYSTEM · {gpuTier.toUpperCase()}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black font-display text-white tracking-wide">
              {t.title}
            </h2>
            <p className="text-xs sm:text-sm text-ink-2 mt-1 max-w-2xl">
              {t.subtitle}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setWireframe((v) => !v)}
              className={`px-3.5 py-2 rounded-[14px] border text-xs font-mono font-bold transition cursor-pointer ${
                wireframe
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                  : 'bg-surface/60 border-line text-ink-2 hover:text-ink'
              }`}
            >
              Wireframe
            </button>

            <button
              type="button"
              onClick={fetchExoplanets}
              disabled={loading}
              className="px-3.5 py-2 rounded-[14px] bg-surface/60 hover:bg-surface-2 border border-line text-cyan-300 text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
              <span className="hidden sm:inline">{t.refresh}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main 3D Side-by-Side Comparison Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Unified Single-Context 3D WebGL Viewport (or Tier-0 Eco Scale Card) */}
        <div
          ref={containerRef}
          className="lg:col-span-7 rounded-[14px] apple-liquid-glass p-5 sm:p-6 shadow-2xl flex flex-col justify-between relative overflow-hidden min-h-[480px]"
        >
          {/* Top Scale Callout Header */}
          <div className="w-full flex items-center justify-between gap-2 flex-wrap text-xs font-mono text-ink-2 z-10 mb-3">
            <span className="flex items-center gap-1.5 text-cyan-300 font-bold">
              <Globe className="w-4 h-4 text-cyan-400" />
              UNIFIED 3D SCALE COMPARISON
            </span>
            {selectedPlanet && (
              <span className="px-3 py-1 rounded-full apple-liquid-glass text-cyan-300 font-bold text-[11px] border-cyan-500/30">
                Archive radius: {formatValue(selectedPlanet.pl_rade, 2)} × Earth
              </span>
            )}
          </div>

          {/* Comparative Stage */}
          <div className="relative w-full h-[340px] rounded-[14px] border border-white/10 bg-[radial-gradient(ellipse_at_50%_45%,rgba(12,34,74,0.35),rgba(2,6,18,0.98)_76%)] overflow-hidden">
            {/* Corner Planet Badges */}
            <div className="pointer-events-none absolute top-3 left-3 z-10 rounded-[8px] border border-white/10 bg-abyss/80 px-2.5 py-1 text-[10px] font-mono font-bold text-ink-2">
              {t.earthRef}
            </div>
            <div className="pointer-events-none absolute top-3 right-3 z-10 rounded-[8px] border border-cyan-500/30 bg-abyss/80 px-2.5 py-1 text-[10px] font-mono font-bold text-cyan-300">
              {selectedPlanet?.pl_name || t.targetExo}
            </div>

            {showWebGL ? (
              <div className="w-full h-full cursor-grab active:cursor-grabbing">
                <Canvas
                  frameloop={isInView && tabVisible ? 'always' : 'demand'}
                  dpr={labConfig.dpr}
                  gl={{
                    powerPreference: 'high-performance',
                    antialias: true,
                    alpha: true,
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 1.12,
                  }}
                  onCreated={({ gl }) => {
                    gl.setClearColor(0x000000, 0);
                    cleanupCanvasRef.current?.();
                    const dom = gl.domElement;
                    const onLost = (e) => {
                      e.preventDefault();
                      setContextLost(true);
                    };
                    const onRestored = () => setContextLost(false);
                    dom.addEventListener('webglcontextlost', onLost, false);
                    dom.addEventListener('webglcontextrestored', onRestored, false);
                    cleanupCanvasRef.current = () => {
                      dom.removeEventListener('webglcontextlost', onLost, false);
                      dom.removeEventListener('webglcontextrestored', onRestored, false);
                    };
                  }}
                >
                  <PerspectiveCamera makeDefault position={[0, 0.35, 6.4]} fov={42} />

                  <ambientLight intensity={0.22} />
                  <hemisphereLight args={[0xa5d8ff, 0x0b1224, 0.32]} />
                  <directionalLight position={[8, 6, 8]} intensity={2.2} color="#fff9ed" />
                  <directionalLight position={[-7, -3, -5]} intensity={0.45} color="#38bdf8" />

                  <SpaceEnvironment
                    intensity={0.45}
                    resolution={labConfig.environmentResolution}
                  />

                  <DynamicStarfield
                    count={labConfig.starCount}
                    minRadius={36}
                    maxRadius={130}
                    driftSpeed={0.002}
                    reducedMotion={reducedMotion}
                  />

                  {/* Left Sphere: Real NASA Blue Marble Earth Reference (1.0 R⊕) */}
                  <InteractivePlanetGlobe
                    position={[earthX, 0, 0]}
                    radius={1.0}
                    segments={labConfig.sphereSegments}
                    texture={earthMap || fallbackEarthTex}
                    roughness={0.62}
                    atmosphereColor="#38bdf8"
                    rimColor="#bae6fd"
                    rimPower={3.5}
                    rimIntensity={0.95}
                    wireframe={wireframe}
                    reducedMotion={reducedMotion}
                    rotationRate={0.14}
                  />

                  {/* Right Sphere: Selected Target Exoplanet */}
                  {selectedPlanet && (
                    <InteractivePlanetGlobe
                      position={[targetX, 0, 0]}
                      radius={displayRadius}
                      segments={labConfig.sphereSegments}
                      texture={exoplanetTextures.albedoMap}
                      bumpMap={exoplanetTextures.bumpMap}
                      bumpScale={visualProfile.bumpScale}
                      roughness={visualProfile.roughness}
                      atmosphereColor={visualProfile.atmosphereColor}
                      rimColor={visualProfile.rimColor}
                      rimPower={visualProfile.rimPower}
                      rimIntensity={visualProfile.rimIntensity}
                      wireframe={wireframe}
                      reducedMotion={reducedMotion}
                      rotationRate={0.11}
                    />
                  )}

                  <OrbitControls
                    enablePan={false}
                    enableDamping
                    dampingFactor={0.07}
                    minDistance={4.0}
                    maxDistance={10.5}
                  />

                  <CinematicPostprocessing
                    enabled={labConfig.enablePostprocessing}
                    bloomIntensity={labConfig.bloomIntensity}
                    luminanceThreshold={0.9}
                    vignetteDarkness={0.38}
                  />
                </Canvas>
              </div>
            ) : (
              /* Zero-WebGL Tier-0 Eco Comparative Scale Diagram */
              <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6">
                <div className="flex items-center justify-center gap-10">
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className="rounded-full border border-cyan-400/60 bg-[radial-gradient(circle_at_35%_30%,#38bdf8,#0369a1_62%,#082f49)] shadow-[0_0_24px_rgba(56,189,248,0.35)]"
                      style={{ width: 84, height: 84 }}
                    />
                    <span className="font-mono text-[10px] text-cyan-200">1.00 R⊕</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className="rounded-full border border-amber-400/50 shadow-[0_0_26px_rgba(245,158,11,0.28)]"
                      style={{
                        width: Math.round(84 * displayRadius),
                        height: Math.round(84 * displayRadius),
                        background: `radial-gradient(circle at 35% 30%, ${visualProfile.rimColor}, ${visualProfile.atmosphereColor} 65%, #0f172a)`,
                      }}
                    />
                    <span className="font-mono text-[10px] text-amber-300">
                      {formatValue(selectedPlanet?.pl_rade, 2)} R⊕
                    </span>
                  </div>
                </div>
                {contextLost && (
                  <button
                    type="button"
                    onClick={() => setContextLost(false)}
                    className="rounded-[10px] bg-cyan-600 px-3.5 py-1.5 font-mono text-xs font-semibold text-white hover:bg-cyan-500 transition"
                  >
                    Restore 3D Comparison
                  </button>
                )}
              </div>
            )}

            {/* Bottom Scale Readout Strip */}
            <div className="pointer-events-none absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2 font-mono text-[10px]">
              <span className="rounded-[8px] border border-white/10 bg-abyss/80 px-2.5 py-0.5 text-cyan-300 font-bold">
                R⊕ = 6,371 km • 1.00 Earth Mass
              </span>
              <span className="rounded-[8px] border border-white/10 bg-abyss/80 px-2.5 py-0.5 text-amber-300 font-bold">
                R = {formatValue(selectedPlanet?.pl_rade, 2)} R⊕ • {formatValue(selectedPlanet?.pl_masse, 1)} M⊕
              </span>
            </div>
          </div>

          <div className="text-center text-[11px] font-mono text-ink-3 pt-3 border-t border-white/10">
            {lang === 'si'
              ? 'මෙම රූප කලාත්මක සංකල්ප පමණි; මතුපිට, වායුගෝලය හෝ වාසය කළ හැකි බව පිළිබඳ නිරීක්ෂණ නොවේ. දෘශ්‍ය පරිමාණය සීමා කර ඇත.'
              : lang === 'ta'
              ? 'இவை கலைக் கற்பனைகள் மட்டுமே; மேற்பரப்பு, வளிமண்டலம் அல்லது வாழ்தகுதி பற்றிய அவதானிப்புகள் அல்ல. காட்சியின் அளவு வரையறுக்கப்பட்டுள்ளது.'
              : 'Illustrative procedural textures are not observations of surface, atmosphere, or habitability. Display scale is capped.'}
          </div>
        </div>

        {/* Exoplanet Selector & Spec Sheet (Right) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Target Exoplanet Presets Bar */}
          <div className="p-5 rounded-[14px] apple-liquid-glass space-y-3 shadow-xl">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                aria-label={t.searchPlaceholder}
                className="w-full pl-10 pr-4 py-2.5 rounded-[14px] apple-liquid-glass text-xs font-mono text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500/60"
              />
            </div>

            {/* Quick Target Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono pb-1">
              {filteredPlanets.slice(0, 6).map((p) => (
                <button
                  key={p.pl_name}
                  type="button"
                  onClick={() => setSelectedPlanet(p)}
                  className={`px-3.5 py-1.5 rounded-[14px] whitespace-nowrap transition cursor-pointer ${
                    selectedPlanet?.pl_name === p.pl_name
                      ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white font-bold shadow-md shadow-cyan-950/50'
                      : 'apple-liquid-glass text-ink-2 hover:text-ink'
                  }`}
                >
                  {p.pl_name}
                </button>
              ))}
            </div>
          </div>

          {!loading && exoplanets.length === 0 && (
            <div role="status" className="p-5 rounded-[14px] apple-liquid-glass text-sm text-ink-2">
              {lang === 'si'
                ? 'Exoplanet Archive දත්ත දැනට නොමැත. නැවත උත්සාහ කරන්න.'
                : lang === 'ta'
                ? 'Exoplanet Archive தரவு தற்போது கிடைக்கவில்லை. மீண்டும் முயற்சிக்கவும்.'
                : 'Exoplanet Archive data is unavailable or empty. Please retry.'}
            </div>
          )}

          {/* Archive Spec Sheet Cards */}
          {selectedPlanet && (
            <div className="p-6 rounded-[14px] apple-liquid-glass space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h3 className="text-lg font-bold font-display text-white">
                    {selectedPlanet.pl_name}
                  </h3>
                  <p className="text-xs font-mono text-cyan-400 mt-0.5">
                    Host Star: {selectedPlanet.hostname} • {selectedPlanet.class || 'Extrasolar Target'}
                  </p>
                </div>

                <div className="px-3.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-signal font-mono text-xs font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-signal" />
                  <span>ESI: {formatValue(selectedPlanet.esi, 2)}</span>
                </div>
              </div>

              {/* Spec Sheet Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3.5 rounded-[14px] apple-liquid-glass">
                  <span className="text-ink-3 block text-[10px] mb-0.5">{t.radiusRatio}</span>
                  <span className="text-cyan-300 font-bold text-sm">
                    {formatValue(selectedPlanet.pl_rade, 2)} R⊕
                  </span>
                  <span className="text-ink-3 block text-[9px] mt-0.5">
                    {Number.isFinite(selectedPlanet.pl_rade)
                      ? `(${Math.round(selectedPlanet.pl_rade * 6371).toLocaleString()} km)`
                      : ''}
                  </span>
                </div>

                <div className="p-3.5 rounded-[14px] apple-liquid-glass">
                  <span className="text-ink-3 block text-[10px] mb-0.5">{t.massRatio}</span>
                  <span className="text-indigo-300 font-bold text-sm">
                    {formatValue(selectedPlanet.pl_masse, 2)} M⊕
                  </span>
                  <span className="text-ink-3 block text-[9px] mt-0.5">(Earth Mass Multiple)</span>
                </div>

                <div className="p-3.5 rounded-[14px] apple-liquid-glass">
                  <span className="text-ink-3 block text-[10px] mb-0.5">{t.orbitalPeriod}</span>
                  <span className="text-amber-300 font-bold text-sm">
                    {formatValue(selectedPlanet.pl_orbper, 1)} Days
                  </span>
                  <span className="text-ink-3 block text-[9px] mt-0.5">
                    {Number.isFinite(selectedPlanet.pl_orbper)
                      ? `(${(selectedPlanet.pl_orbper / 365.25).toFixed(2)} Earth Years)`
                      : ''}
                  </span>
                </div>

                <div className="p-3.5 rounded-[14px] apple-liquid-glass">
                  <span className="text-ink-3 block text-[10px] mb-0.5">{t.eqTemp}</span>
                  <span className="text-critical font-bold text-sm">
                    {formatValue(selectedPlanet.pl_eqt, 0)} K
                  </span>
                  <span className="text-ink-3 block text-[9px] mt-0.5">
                    {Number.isFinite(selectedPlanet.pl_eqt)
                      ? `(${(selectedPlanet.pl_eqt - 273.15).toFixed(1)} °C)`
                      : ''}
                  </span>
                </div>
              </div>

              {/* Distance & Facility Box */}
              <div className="p-3.5 rounded-[14px] apple-liquid-glass space-y-1 text-xs font-mono">
                <div className="flex items-center justify-between text-ink-2">
                  <span>{t.distance}:</span>
                  <span className="text-cyan-300 font-bold">
                    {Number.isFinite(selectedPlanet.sy_dist)
                      ? `${(selectedPlanet.sy_dist * 3.26156).toFixed(1)} ly (${selectedPlanet.sy_dist.toFixed(1)} pc)`
                      : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-ink-3 text-[11px] pt-1 border-t border-white/10">
                  <span>{t.facility}:</span>
                  <span className="text-ink-2">
                    {selectedPlanet.disc_facility || 'N/A'} ({selectedPlanet.disc_year ?? 'N/A'})
                  </span>
                </div>
              </div>

              {/* Planet Overview Description */}
              <div className="p-4 rounded-[14px] apple-liquid-glass text-xs text-ink-2 space-y-1 border-cyan-500/30">
                <span className="font-bold font-mono text-cyan-300 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  Astrophysical Overview:
                </span>
                <p className="leading-relaxed font-sans text-ink-2 text-[11px]">
                  {selectedPlanet.description ||
                    `NASA Exoplanet Archive record: ${selectedPlanet.pl_name}. Missing values are not estimates. An equilibrium temperature is not a surface measurement or evidence of habitability.`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(ExoplanetLab);
