'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback, Suspense, memo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  Float,
  AdaptiveDpr,
  AdaptiveEvents,
  PerformanceMonitor,
} from '@react-three/drei';
import DynamicStarfield from './DynamicStarfield.jsx';
import { FallbackPlanet, ModelErrorBoundary } from './FallbackPlanet.jsx';
import SpaceEnvironment from '../three/lighting/SpaceEnvironment';
import CinematicPostprocessing from '../three/postprocessing/CinematicPostprocessing';
import { useDevicePerformance } from '../hooks/useDevicePerformance';
import {
  getLabSceneConfig,
  JWST_HONEYCOMB_OFFSETS,
  LAB_SUN_POSITION,
} from '../three/labConfig';
import {
  createFallbackPlanetaryTexture,
  createLunarRegolithTextures,
} from '../three/textures/proceduralTextures';
import {
  createManagedShaderMaterial,
  createUniforms,
  EARTH_VERTEX_GLSL,
  PLANET_ATMOSPHERE_FRAGMENT_GLSL,
} from '../three/shaders';
import * as THREE from 'three';
import gsap from 'gsap';
import { motion } from 'framer-motion';
import {
  RotateCcw,
  Play,
  Pause,
  Sun,
  Sparkles,
  Gauge,
  Layers,
  Radio,
  ShieldCheck,
  Zap,
  Activity,
} from 'lucide-react';

const LAB_SUN_DIR = new THREE.Vector3(...LAB_SUN_POSITION).normalize();

const SPACE_TARGETS = [
  {
    id: 'mars',
    type: 'planet',
    name: {
      en: 'Mars (The Red Planet)',
      si: 'අඟහරු (රතු ග්‍රහලෝකය)',
      ta: 'செவ்வாய் (சிவப்பு கிரகம்)',
    },
    subtitle: {
      en: 'Olympus Mons • Valles Marineris • Perseverance Active',
      si: 'ඔලිම්පස් මොන්ස් • වැලෙස් මැරිනරිස් • පර්සෙවරන්ස් රෝවරය',
      ta: 'ஒலிம்பஸ் மோன்ஸ் • வாலஸ் மரினரிஸ் • பெர்சவரன்ஸ் பணி',
    },
    cameraPosition: [0, 3, 9.5],
    glowColor: '#ea580c',
    telemetry: {
      velocity: '24.07 km/s',
      distance: '1.524 AU (227.9M km)',
      surfacePressure: '610 Pa (0.088 psi)',
      temperature: '-63°C (-81°F)',
      gravity: '3.721 m/s² (0.38g)',
      atmosphere: '95.3% CO₂, 2.6% N₂',
      status: 'Relay Active • Mars 2020 Online',
    },
  },
  {
    id: 'moon',
    type: 'lunar',
    name: {
      en: 'Moon (Lunar Surface)',
      si: 'චන්ද්‍රයා (සඳ මතුපිට)',
      ta: 'சந்திரன் (நிலவு மேற்பரப்பு)',
    },
    subtitle: {
      en: 'Mare Tranquillitatis • Shackleton Crater • Hard Vacuum',
      si: 'මාරේ ට්‍රැන්ක්විලිටාටිස් • ෂැකල්ටන් ආවාටය • පරම රික්තය',
      ta: 'மேர் டிரான்குவிலிதாடிஸ் • ஷேக்லட்டன் பள்ளம் • முழு வெற்றிடம்',
    },
    cameraPosition: [0, 2.5, 8],
    glowColor: '#cbd5e1',
    telemetry: {
      velocity: '1.022 km/s (Mean Velocity)',
      distance: '384,400 km from Earth',
      surfacePressure: '3 × 10⁻¹⁰ Pa (Vacuum)',
      temperature: 'Day: +120°C | Night: -130°C',
      gravity: '1.62 m/s² (0.166g)',
      atmosphere: 'Zero Scattering (High Contrast)',
      status: 'Tidally Locked • Artemis Target',
    },
  },
  {
    id: 'jwst',
    type: 'spacecraft',
    name: {
      en: 'James Webb Space Telescope (JWST)',
      si: 'ජේම්ස් වෙබ් අභ්‍යවකාශ දුරේක්ෂය',
      ta: 'ஜேம்ஸ் வெப் விண்வெளி தொலைநோக்கி',
    },
    subtitle: {
      en: 'Sun-Earth L2 Lagrange Point • 18 Be-Au Mirrors',
      si: 'සූර්ය-පෘථිවි L2 ලග්‍රාන්ජ් ලක්ෂ්‍යය • 18 රන් මිරර් ඛණ්ඩ',
      ta: 'சூரியன்-பூமி L2 லாக்ராஞ்ச் புள்ளி • 18 தங்க கண்ணாடிகள்',
    },
    cameraPosition: [5.5, 3.8, 8.5],
    glowColor: '#f59e0b',
    telemetry: {
      velocity: '0.20 km/s (Halo Orbit)',
      distance: '1.5M km from Earth (L2)',
      surfacePressure: 'Deep Space Hard Vacuum',
      temperature: 'Cold Side: -233°C (40K)',
      gravity: 'Microgravity Environment',
      atmosphere: 'Infrared Deep Field Vacuum',
      status: '18 Hex Mirrors Phase-Aligned',
    },
  },
];

// ====================================================
// Hook-Safe Local Texture Loader with GPU Disposal
// ====================================================
function useSafeTexture(url, fallbackTexture, anisotropy = 4) {
  const { gl } = useThree();
  const [loadedTexture, setLoadedTexture] = useState(null);

  useEffect(() => {
    if (!url) return undefined;
    let isMounted = true;
    let ownedTexture = null;
    const loader = new THREE.TextureLoader();

    loader.load(
      url,
      (tex) => {
        if (!isMounted) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(anisotropy, gl.capabilities.getMaxAnisotropy());
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;
        ownedTexture = tex;
        setLoadedTexture(tex);
      },
      undefined,
      () => {
        // Retain deterministic procedural fallback texture
      }
    );

    return () => {
      isMounted = false;
      if (ownedTexture) {
        ownedTexture.dispose();
      }
    };
  }, [url, anisotropy, gl]);

  return loadedTexture || fallbackTexture;
}

// ====================================================
// 1. MARS MODEL (Local NASA Map + Relief + Sun-Aware Dust Limb)
// ====================================================
const MarsModel = memo(function MarsModel({
  autoRotate,
  atmosphereHaze,
  wireframe,
  sphereSegments,
  atmosphereSegments,
  anisotropy,
  sunIntensity,
  enableShadows,
  reducedMotion,
}) {
  const marsRef = useRef(null);
  const fallbackTex = useMemo(() => createFallbackPlanetaryTexture('mars'), []);
  const marsMap = useSafeTexture('/textures/mars.jpg', fallbackTex, anisotropy);

  const atmosphereMaterial = useMemo(
    () =>
      createManagedShaderMaterial({
        vertexShader: EARTH_VERTEX_GLSL,
        fragmentShader: PLANET_ATMOSPHERE_FRAGMENT_GLSL,
        uniforms: createUniforms({
          uSunDirection: LAB_SUN_DIR,
          uDayColor: new THREE.Color('#e0733b'),
          uHorizonColor: new THREE.Color('#ffb584'),
          uNightColor: new THREE.Color('#2a120a'),
          uIntensity: 0.92,
          uFalloff: 2.35,
        }),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      }),
    []
  );

  useEffect(() => {
    atmosphereMaterial.uniforms.uIntensity.value = Math.min(1.4, 0.52 + sunIntensity * 0.18);
  }, [atmosphereMaterial, sunIntensity]);

  useEffect(() => {
    return () => {
      if (fallbackTex) fallbackTex.dispose();
      atmosphereMaterial.dispose();
    };
  }, [fallbackTex, atmosphereMaterial]);

  useFrame((_, rawDelta) => {
    if (reducedMotion || !autoRotate || !marsRef.current) return;
    marsRef.current.rotation.y += Math.min(rawDelta, 0.1) * 0.08;
  });

  return (
    <group ref={marsRef}>
      <mesh castShadow={enableShadows} receiveShadow={enableShadows}>
        <sphereGeometry args={[2.7, sphereSegments, sphereSegments]} />
        <meshStandardMaterial
          map={marsMap}
          bumpMap={marsMap}
          bumpScale={0.045}
          roughness={0.86}
          metalness={0.04}
          wireframe={wireframe}
        />
      </mesh>

      {/* Physically smooth sun-aware Martian CO2 dust limb (respects Dust Haze toggle) */}
      {atmosphereHaze && !wireframe && (
        <mesh scale={1.095} material={atmosphereMaterial}>
          <sphereGeometry args={[2.7, atmosphereSegments, atmosphereSegments]} />
        </mesh>
      )}
    </group>
  );
});

// ====================================================
// 2. MOON MODEL (Multi-Octave Cratered Regolith + Dedicated Bump Map)
// ====================================================
const MoonModel = memo(function MoonModel({
  autoRotate,
  wireframe,
  sphereSegments,
  anisotropy,
  enableShadows,
  reducedMotion,
}) {
  const { gl } = useThree();
  const moonRef = useRef(null);
  const lunarTextures = useMemo(() => createLunarRegolithTextures(), []);

  useEffect(() => {
    const maxAniso = Math.min(anisotropy, gl.capabilities.getMaxAnisotropy());
    if (lunarTextures.albedoMap) lunarTextures.albedoMap.anisotropy = maxAniso;
    if (lunarTextures.bumpMap) lunarTextures.bumpMap.anisotropy = maxAniso;
  }, [lunarTextures, anisotropy, gl]);

  useEffect(() => {
    return () => {
      lunarTextures.dispose();
    };
  }, [lunarTextures]);

  useFrame((_, rawDelta) => {
    if (reducedMotion || !autoRotate || !moonRef.current) return;
    moonRef.current.rotation.y += Math.min(rawDelta, 0.1) * 0.05;
  });

  return (
    <group ref={moonRef}>
      <mesh castShadow={enableShadows} receiveShadow={enableShadows}>
        <sphereGeometry args={[2.4, sphereSegments, sphereSegments]} />
        <meshStandardMaterial
          map={lunarTextures.albedoMap}
          bumpMap={lunarTextures.bumpMap}
          bumpScale={0.085}
          color="#cbd5e1"
          roughness={0.96}
          metalness={0.02}
          wireframe={wireframe}
        />
      </mesh>
    </group>
  );
});

// ====================================================
// 3. JWST MODEL (Authentic 18-Segment Hollow Honeycomb + Kapton Sunshield)
// ====================================================
const JWSTModel = memo(function JWSTModel({
  autoRotate,
  wireframe,
  enableShadows,
  reducedMotion,
}) {
  const groupRef = useRef(null);
  const elapsedRef = useRef(0);

  const shared = useMemo(() => {
    const mirrorGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.055, 6);
    const strutGeo = new THREE.CylinderGeometry(0.028, 0.028, 2.55, 8);
    const shieldShape = new THREE.Shape();
    shieldShape.moveTo(0, 4.9);
    shieldShape.lineTo(3.15, 0.25);
    shieldShape.lineTo(0, -4.45);
    shieldShape.lineTo(-3.15, 0.25);
    shieldShape.closePath();
    const shieldGeo = new THREE.ShapeGeometry(shieldShape);

    const goldMat = new THREE.MeshStandardMaterial({
      color: '#f5b938',
      metalness: 0.96,
      roughness: 0.08,
      wireframe,
    });
    const kaptonTopMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      metalness: 0.9,
      roughness: 0.18,
      side: THREE.DoubleSide,
      wireframe,
    });
    const kaptonLowerMat = new THREE.MeshStandardMaterial({
      color: '#b478c8',
      metalness: 0.88,
      roughness: 0.22,
      side: THREE.DoubleSide,
      wireframe,
    });
    const carbonMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      metalness: 0.78,
      roughness: 0.3,
      wireframe,
    });

    return {
      mirrorGeo,
      strutGeo,
      shieldGeo,
      goldMat,
      kaptonTopMat,
      kaptonLowerMat,
      carbonMat,
    };
  }, [wireframe]);

  useEffect(() => {
    return () => {
      shared.mirrorGeo.dispose();
      shared.strutGeo.dispose();
      shared.shieldGeo.dispose();
      shared.goldMat.dispose();
      shared.kaptonTopMat.dispose();
      shared.kaptonLowerMat.dispose();
      shared.carbonMat.dispose();
    };
  }, [shared]);

  useFrame((_, rawDelta) => {
    if (reducedMotion || !groupRef.current) return;
    const delta = Math.min(rawDelta, 0.1);
    elapsedRef.current += delta;
    const elapsed = elapsedRef.current;
    groupRef.current.position.y = Math.sin(elapsed * 0.8) * 0.1;
    groupRef.current.rotation.z = Math.sin(elapsed * 0.5) * 0.02;
    if (autoRotate) {
      groupRef.current.rotation.y += delta * 0.14;
    }
  });

  return (
    <group ref={groupRef}>
      {/* 5-Layer Diamond Kapton Sunshield */}
      <group position={[0, -1.65, 0.15]}>
        {[-0.24, -0.12, 0, 0.12, 0.24].map((yOffset, i) => {
          const layerScale = 1 - i * 0.032;
          return (
            <mesh
              key={i}
              position={[0, yOffset, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              scale={[layerScale, layerScale, 1]}
              geometry={shared.shieldGeo}
              material={i >= 3 ? shared.kaptonTopMat : shared.kaptonLowerMat}
              castShadow={enableShadows}
              receiveShadow={enableShadows}
            />
          );
        })}
      </group>

      {/* Authentic 18 Hexagonal Gold-Beryllium Mirrors around Central Aft-Optics Baffle */}
      <group position={[0, 0.48, 0.72]}>
        {JWST_HONEYCOMB_OFFSETS.map(([mx, my], index) => (
          <mesh
            key={index}
            position={[mx * 0.8, my * 0.8, 0]}
            rotation={[Math.PI / 2, 0, Math.PI / 6]}
            geometry={shared.mirrorGeo}
            material={shared.goldMat}
            castShadow={enableShadows}
          />
        ))}
        {/* Central Aft Optical Subsystem (AOS) Black Baffle */}
        <mesh position={[0, 0, 0.18]} rotation={[Math.PI / 2, 0, 0]} material={shared.carbonMat}>
          <cylinderGeometry args={[0.24, 0.34, 0.42, 6]} />
        </mesh>
      </group>

      {/* Secondary Mirror & Carbon-Composite Tripod */}
      <group position={[0, 0.48, 2.45]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={shared.goldMat}>
          <cylinderGeometry args={[0.32, 0.32, 0.08, 16]} />
        </mesh>
        <mesh position={[-0.9, 0.9, -1.2]} rotation={[0.42, 0.38, 0.32]} geometry={shared.strutGeo} material={shared.carbonMat} />
        <mesh position={[0.9, 0.9, -1.2]} rotation={[0.42, -0.38, -0.32]} geometry={shared.strutGeo} material={shared.carbonMat} />
        <mesh position={[0, -1.15, -1.2]} rotation={[-0.52, 0, 0]} geometry={shared.strutGeo} material={shared.carbonMat} />
      </group>

      {/* ISIM Science Instrument Core & Spacecraft Bus */}
      <mesh position={[0, 0.48, -0.52]} material={shared.carbonMat} castShadow={enableShadows}>
        <boxGeometry args={[1.8, 1.8, 0.9]} />
      </mesh>
    </group>
  );
});

// ====================================================
// 4. GSAP Camera Transition with Tween Cleanup
// ====================================================
function CameraGSAPController({ target, controlsRef, reducedMotion }) {
  const { camera } = useThree();

  useEffect(() => {
    if (!target) return undefined;

    const [tx, ty, tz] = target.cameraPosition;
    const duration = reducedMotion ? 0.01 : 1.35;

    const camTween = gsap.to(camera.position, {
      x: tx,
      y: ty,
      z: tz,
      duration,
      ease: 'power3.inOut',
    });

    let targetTween = null;
    if (controlsRef.current?.target) {
      targetTween = gsap.to(controlsRef.current.target, {
        x: 0,
        y: 0,
        z: 0,
        duration,
        ease: 'power3.inOut',
        onUpdate: () => {
          if (controlsRef.current && typeof controlsRef.current.update === 'function') {
            controlsRef.current.update();
          }
        },
      });
    }

    return () => {
      camTween.kill();
      if (targetTween) targetTween.kill();
    };
  }, [target, camera, controlsRef, reducedMotion]);

  return null;
}

// ====================================================
// 5. Main SpaceLab3D Component
// ====================================================
function SpaceLab3D({ lang = 'en' }) {
  const { qualityProfile, gpuTier } = useDevicePerformance();
  const labConfig = useMemo(() => getLabSceneConfig(qualityProfile), [qualityProfile]);

  const [selectedTargetId, setSelectedTargetId] = useState('mars');
  const [autoRotate, setAutoRotate] = useState(true);
  const [atmosphereHaze, setAtmosphereHaze] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [sunIntensity, setSunIntensity] = useState(2.4);
  const [bloomEnabled, setBloomEnabled] = useState(() => labConfig.enablePostprocessingByDefault);
  const [bloomUserOverridden, setBloomUserOverridden] = useState(false);
  const [hudExpanded, setHudExpanded] = useState(true);
  const [fpsStatus, setFpsStatus] = useState(`60 FPS (${gpuTier.toUpperCase()})`);
  const [activeDpr, setActiveDpr] = useState(labConfig.maxDpr);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const controlsRef = useRef(null);
  const containerRef = useRef(null);
  const cleanupCanvasRef = useRef(null);
  const [isInView, setIsInView] = useState(true);

  // Keep defaults aligned when GPU tier resolves, unless user manually toggled Bloom.
  useEffect(() => {
    setActiveDpr(labConfig.maxDpr);
    setFpsStatus(`60 FPS (${gpuTier.toUpperCase()})`);
    if (!bloomUserOverridden) {
      setBloomEnabled(labConfig.enablePostprocessingByDefault);
    }
  }, [labConfig, gpuTier, bloomUserOverridden]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  // Pause 3D animation loop when scrolled out of viewport
  useEffect(() => {
    if (!containerRef.current || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0.05 }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      cleanupCanvasRef.current?.();
      cleanupCanvasRef.current = null;
    };
  }, []);

  const currentTarget =
    SPACE_TARGETS.find((t) => t.id === selectedTargetId) || SPACE_TARGETS[0];

  const handleResetCamera = useCallback(() => {
    if (controlsRef.current?.object && controlsRef.current?.target) {
      const [tx, ty, tz] = currentTarget.cameraPosition;
      const duration = reducedMotion ? 0.01 : 1.15;
      gsap.to(controlsRef.current.object.position, {
        x: tx,
        y: ty,
        z: tz,
        duration,
        ease: 'power2.out',
      });
      gsap.to(controlsRef.current.target, {
        x: 0,
        y: 0,
        z: 0,
        duration,
        ease: 'power2.out',
        onUpdate: () => {
          if (controlsRef.current && typeof controlsRef.current.update === 'function') {
            controlsRef.current.update();
          }
        },
      });
    }
  }, [currentTarget, reducedMotion]);

  const handleToggleBloom = useCallback(() => {
    setBloomUserOverridden(true);
    setBloomEnabled((prev) => !prev);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[720px] sm:h-[800px] rounded-3xl overflow-hidden border border-cyan-500/30 bg-abyss shadow-2xl flex flex-col justify-between selection:bg-cyan-500/30"
    >
      {/* 3D WebGL Canvas */}
      <div className="absolute inset-0 z-0">
        {contextLost ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-abyss text-center p-6">
            <p className="text-sm font-mono text-cyan-300">WebGL context paused by GPU driver</p>
            <button
              type="button"
              onClick={() => setContextLost(false)}
              className="px-4 py-2 rounded-[10px] bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-500 transition"
            >
              Restore 3D Viewport
            </button>
          </div>
        ) : (
          <Canvas
            frameloop={isInView ? 'always' : 'never'}
            dpr={[1, activeDpr]}
            shadows={labConfig.enableShadows}
            camera={{ position: [0, 3, 9.5], fov: 45 }}
            gl={{
              powerPreference: 'high-performance',
              antialias: labConfig.antialias,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.12,
            }}
            onCreated={({ gl }) => {
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
            {/* Dynamically adjusts DPR & steps down bloom if real frame rate drops */}
            <PerformanceMonitor
              onIncline={() => {
                setActiveDpr(labConfig.maxDpr);
                setFpsStatus(`60 FPS (${gpuTier.toUpperCase()})`);
              }}
              onDecline={() => {
                setActiveDpr(1.0);
                setBloomEnabled(false);
                setFpsStatus('Adaptive Eco');
              }}
            />

            <AdaptiveDpr pixelated />
            <AdaptiveEvents />

            <CameraGSAPController
              target={currentTarget}
              controlsRef={controlsRef}
              reducedMotion={reducedMotion}
            />

            {/* Physically calibrated Space Lighting */}
            <ambientLight intensity={selectedTargetId === 'moon' ? 0.06 : 0.16} />

            <directionalLight
              position={LAB_SUN_POSITION}
              intensity={sunIntensity}
              color="#fffaf0"
              castShadow={labConfig.enableShadows}
              shadow-mapSize-width={labConfig.shadowMapSize || 1024}
              shadow-mapSize-height={labConfig.shadowMapSize || 1024}
            />

            <pointLight position={[-14, -10, -12]} intensity={0.24} color="#38bdf8" />

            {/* Local procedural IBL environment lighting (zero external HDRI fetches) */}
            <SpaceEnvironment
              intensity={selectedTargetId === 'jwst' ? 0.65 : 0.28}
              resolution={labConfig.environmentResolution}
            />

            {/* Tier-Adaptive Starfield */}
            <DynamicStarfield
              count={labConfig.starCount}
              minRadius={85}
              maxRadius={360}
              driftSpeed={0.005}
              reducedMotion={reducedMotion}
            />

            {/* Active Celestial Model with 3D Fallback Planet Error Boundary */}
            <ModelErrorBoundary fallback={<FallbackPlanet radius={2.4} color="#0ea5e9" wireframe={true} />}>
              <Suspense fallback={<FallbackPlanet radius={2.4} color="#0ea5e9" wireframe={true} />}>
                <Float
                  speed={reducedMotion ? 0 : currentTarget.type === 'spacecraft' ? 1.1 : 0.2}
                  rotationIntensity={reducedMotion ? 0 : 0.08}
                  floatIntensity={reducedMotion ? 0 : 0.12}
                >
                  {selectedTargetId === 'mars' ? (
                    <MarsModel
                      autoRotate={autoRotate}
                      atmosphereHaze={atmosphereHaze}
                      wireframe={wireframe}
                      sphereSegments={labConfig.sphereSegments}
                      atmosphereSegments={labConfig.atmosphereSegments}
                      anisotropy={labConfig.anisotropy}
                      sunIntensity={sunIntensity}
                      enableShadows={labConfig.enableShadows}
                      reducedMotion={reducedMotion}
                    />
                  ) : selectedTargetId === 'moon' ? (
                    <MoonModel
                      autoRotate={autoRotate}
                      wireframe={wireframe}
                      sphereSegments={labConfig.sphereSegments}
                      anisotropy={labConfig.anisotropy}
                      enableShadows={labConfig.enableShadows}
                      reducedMotion={reducedMotion}
                    />
                  ) : (
                    <JWSTModel
                      autoRotate={autoRotate}
                      wireframe={wireframe}
                      enableShadows={labConfig.enableShadows}
                      reducedMotion={reducedMotion}
                    />
                  )}
                </Float>
              </Suspense>
            </ModelErrorBoundary>

            <OrbitControls
              ref={controlsRef}
              enableDamping
              dampingFactor={0.05}
              minDistance={3.5}
              maxDistance={32}
            />

            {/* Tier-Adaptive Post-Processing (multisampling=0 across every GPU tier) */}
            <CinematicPostprocessing
              enabled={bloomEnabled}
              bloomIntensity={labConfig.bloomIntensity}
              luminanceThreshold={labConfig.bloomLuminanceThreshold}
              vignetteDarkness={0.52}
            />
          </Canvas>
        )}
      </div>

      {/* Top Header & Target Switcher */}
      <div className="relative z-10 p-4 sm:p-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pointer-events-none">
        <div className="pointer-events-auto apple-liquid-glass rounded-[14px] p-3 shadow-xl flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center shadow-lg transition-colors"
            style={{
              backgroundColor: `${currentTarget.glowColor}25`,
              borderColor: `${currentTarget.glowColor}50`,
            }}
          >
            <Radio className="w-5 h-5 animate-pulse text-cyan-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-xs sm:text-sm font-bold text-white tracking-wider">
                {currentTarget.name[lang] || currentTarget.name.en}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-signal border border-emerald-500/40 flex items-center gap-1">
                <Activity className="w-3 h-3 text-signal" />
                {fpsStatus}
              </span>
            </div>
            <p className="text-[11px] text-ink-3 font-mono">
              {currentTarget.subtitle[lang] || currentTarget.subtitle.en}
            </p>
          </div>
        </div>

        {/* Mars, Moon, JWST Selector Pill */}
        <div className="pointer-events-auto flex items-center gap-1.5 p-1.5 rounded-[14px] apple-liquid-glass shadow-2xl overflow-x-auto">
          {SPACE_TARGETS.map((target) => {
            const isSelected = selectedTargetId === target.id;
            return (
              <button
                type="button"
                key={target.id}
                onClick={() => setSelectedTargetId(target.id)}
                className={`relative px-4 py-2 rounded-[10px] text-xs font-semibold whitespace-nowrap transition-colors select-none z-10 ${
                  isSelected ? 'text-cyan-200 font-bold' : 'text-ink-3 hover:text-ink'
                }`}
              >
                {isSelected && (
                  <motion.div
                    layoutId="spacelab-opt-pill"
                    className="absolute inset-0 rounded-[10px] bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-600 shadow-md shadow-cyan-500/40 border border-cyan-400/50 -z-10"
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  />
                )}
                <span>{target.name[lang] || target.name.en}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Floating Area: Telemetry HUD & Controls */}
      <div className="relative z-10 p-4 sm:p-6 flex flex-col lg:flex-row items-end justify-between gap-4 pointer-events-none">
        <div className="pointer-events-auto w-full lg:max-w-md apple-liquid-glass rounded-[14px] p-4 shadow-2xl space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-400" />
              <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                {lang === 'si'
                  ? 'කක්ෂීය සහ පාරිසරික දත්ත'
                  : lang === 'ta'
                  ? 'சுற்றுப்பாதை மற்றும் சுற்றுச்சூழல் தரவு'
                  : 'Orbital & Environmental HUD'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setHudExpanded(!hudExpanded)}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 font-mono font-medium"
            >
              {hudExpanded ? 'Hide' : 'Show'}
            </button>
          </div>

          {hudExpanded && (
            <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
              <div className="p-2.5 rounded-[10px] apple-liquid-glass">
                <span className="text-[10px] text-ink-3 block mb-0.5">
                  {lang === 'si' ? 'කක්ෂීය ප්‍රවේගය' : lang === 'ta' ? 'சுற்றுப்பாதை வேகம்' : 'Orbital Velocity'}
                </span>
                <span className="text-cyan-300 font-bold">{currentTarget.telemetry.velocity}</span>
              </div>

              <div className="p-2.5 rounded-[10px] apple-liquid-glass">
                <span className="text-[10px] text-ink-3 block mb-0.5">
                  {lang === 'si' ? 'දුරස්ථභාවය' : lang === 'ta' ? 'தொலைவு' : 'Distance'}
                </span>
                <span className="text-cyan-300 font-bold">{currentTarget.telemetry.distance}</span>
              </div>

              <div className="p-2.5 rounded-[10px] apple-liquid-glass">
                <span className="text-[10px] text-ink-3 block mb-0.5">
                  {lang === 'si' ? 'පෘෂ්ඨීය පීඩනය' : lang === 'ta' ? 'மேற்பரப்பு அழுத்தம்' : 'Pressure / Vacuum'}
                </span>
                <span className="text-signal font-bold">{currentTarget.telemetry.surfacePressure}</span>
              </div>

              <div className="p-2.5 rounded-[10px] apple-liquid-glass">
                <span className="text-[10px] text-ink-3 block mb-0.5">
                  {lang === 'si' ? 'තාප තත්ත්වය' : lang === 'ta' ? 'வெப்பநிலை' : 'Thermal Profile'}
                </span>
                <span className="text-amber-300 font-bold">{currentTarget.telemetry.temperature}</span>
              </div>

              <div className="col-span-2 p-2.5 rounded-[10px] apple-liquid-glass">
                <span className="text-[10px] text-ink-3 block mb-0.5">
                  {lang === 'si' ? 'වායුගෝලය / පරිසරය' : lang === 'ta' ? 'வளிமண்டலம்' : 'Environment & Medium'}
                </span>
                <span className="text-sky-300 font-medium">{currentTarget.telemetry.atmosphere}</span>
              </div>
            </div>
          )}

          <div className="text-[11px] font-mono text-ink-3 flex items-center justify-between pt-1">
            <span>
              Status: <strong className="text-cyan-400">{currentTarget.telemetry.status}</strong>
            </span>
            <span className="text-signal flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> DSN Link Active
            </span>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 p-2 rounded-[14px] apple-liquid-glass shadow-2xl">
          <button
            type="button"
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-2.5 rounded-[10px] text-xs font-semibold flex items-center gap-1.5 transition ${
              autoRotate ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30' : 'bg-surface-2/70 text-ink-2 hover:text-ink'
            }`}
            title="Toggle Auto Rotation"
          >
            {autoRotate ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span className="hidden sm:inline">
              {autoRotate
                ? lang === 'si'
                  ? 'නවත්වන්න'
                  : lang === 'ta'
                  ? 'நிறுத்து'
                  : 'Pause'
                : lang === 'si'
                ? 'භ්‍රමණය'
                : lang === 'ta'
                ? 'சுழற்று'
                : 'Rotate'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleResetCamera}
            className="p-2.5 rounded-[10px] bg-surface-2/70 hover:bg-slate-700/80 text-ink-2 hover:text-ink text-xs font-semibold flex items-center gap-1.5 transition"
            title="Reset Camera View"
          >
            <RotateCcw className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          <button
            type="button"
            onClick={() => setWireframe(!wireframe)}
            className={`p-2.5 rounded-[10px] text-xs font-semibold flex items-center gap-1.5 transition ${
              wireframe ? 'bg-indigo-600 text-white' : 'bg-surface-2/70 text-ink-2 hover:text-ink'
            }`}
            title="Toggle Wireframe Mesh"
          >
            <Layers className="w-4 h-4 text-indigo-300" />
            <span className="hidden sm:inline">Mesh</span>
          </button>

          {selectedTargetId === 'mars' && (
            <button
              type="button"
              onClick={() => setAtmosphereHaze(!atmosphereHaze)}
              className={`p-2.5 rounded-[10px] text-xs font-semibold flex items-center gap-1.5 transition ${
                atmosphereHaze ? 'bg-orange-600 text-white' : 'bg-surface-2/70 text-ink-2'
              }`}
              title="Toggle Mars Dust Haze"
            >
              <Sparkles className="w-4 h-4 text-orange-200" />
              <span className="hidden sm:inline">Dust Haze</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleBloom}
            className={`p-2.5 rounded-[10px] text-xs font-semibold flex items-center gap-1.5 transition ${
              bloomEnabled ? 'bg-amber-600 text-white' : 'bg-surface-2/70 text-ink-2'
            }`}
            title="Toggle Mirror Specular Bloom"
          >
            <Zap className="w-4 h-4 text-amber-200" />
            <span className="hidden sm:inline">Bloom</span>
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] bg-abyss/70 border border-line">
            <Sun className="w-3.5 h-3.5 text-caution" />
            <input
              type="range"
              min="0.5"
              max="4.0"
              step="0.2"
              value={sunIntensity}
              onChange={(e) => setSunIntensity(parseFloat(e.target.value))}
              aria-label="Sunlight intensity"
              className="w-16 sm:w-20 accent-cyan-400 h-1 cursor-pointer"
              title={`Sunlight Intensity: ${sunIntensity}x`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(SpaceLab3D);
