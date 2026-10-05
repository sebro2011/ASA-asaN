'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback, Suspense, memo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { 
  OrbitControls, 
  Float, 
  useGLTF,
  AdaptiveDpr,
  AdaptiveEvents,
  PerformanceMonitor,
  Environment
} from '@react-three/drei';
import DynamicStarfield from './DynamicStarfield.jsx';
import { 
  EffectComposer, 
  Bloom, 
  Vignette, 
  ToneMapping 
} from '@react-three/postprocessing';
import * as THREE from 'three';
import gsap from 'gsap';
import { motion, AnimatePresence } from 'framer-motion';
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
  Cpu
} from 'lucide-react';

/**
 * Optimized Procedural Fallback Texture Generator (Max 1024x512 to preserve mobile memory)
 */
function createOptimizedFallbackTexture(type = 'mars') {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (type === 'mars') {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#5a1d12');
    gradient.addColorStop(0.5, '#b94420');
    gradient.addColorStop(1, '#5a1d12');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#421a14';
    for (let i = 0; i < 70; i++) {
      const x = (Math.sin(i * 1.8) * 0.45 + 0.5) * canvas.width;
      const y = (Math.cos(i * 2.2) * 0.4 + 0.5) * canvas.height;
      const r = Math.abs(Math.sin(i * 3.7)) * 50 + 12;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Olympus Mons Caldera
    const omX = canvas.width * 0.28;
    const omY = canvas.height * 0.42;
    const omGrad = ctx.createRadialGradient(omX, omY, 2, omX, omY, 45);
    omGrad.addColorStop(0, '#d97736');
    omGrad.addColorStop(0.6, '#a83c1e');
    omGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = omGrad;
    ctx.beginPath();
    ctx.arc(omX, omY, 45, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'moon') {
    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#334155';
    for (let i = 0; i < 90; i++) {
      const x = (Math.sin(i * 2.7) * 0.48 + 0.5) * canvas.width;
      const y = (Math.cos(i * 1.9) * 0.42 + 0.5) * canvas.height;
      const r = Math.abs(Math.sin(i * 4.3)) * 60 + 10;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * Lightweight Fresnel Shader for Mars Dust Haze
 */
const MarsDustShader = {
  uniforms: {
    color: { value: new THREE.Color('#f97316') },
    power: { value: 2.8 },
    intensity: { value: 1.0 }
  },
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 color;
    uniform float power;
    uniform float intensity;
    varying vec3 vNormal;
    void main() {
      float glow = pow(0.72 - dot(vNormal, vec3(0, 0, 1.0)), power);
      gl_FragColor = vec4(color, glow * intensity);
    }
  `
};

const SPACE_TARGETS = [
  {
    id: 'mars',
    type: 'planet',
    name: {
      en: 'Mars (The Red Planet)',
      si: 'අඟහරු (රතු ග්‍රහලෝකය)',
      ta: 'செவ்வாய் (சிவப்பு கிரகம்)'
    },
    subtitle: {
      en: 'Olympus Mons • Valles Marineris • Perseverance Active',
      si: 'ඔලිම්පස් මොන්ස් • වැලෙස් මැරිනරිස් • පර්සෙවරන්ස් රෝවරය',
      ta: 'ஒலிம்பஸ் மோன்ஸ் • வாலஸ் மரினரிஸ் • பெர்சவரன்ஸ் பணி'
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
      status: 'Relay Active • Mars 2020 Online'
    }
  },
  {
    id: 'moon',
    type: 'lunar',
    name: {
      en: 'Moon (Lunar Surface)',
      si: 'චන්ද්‍රයා (සඳ මතුපිට)',
      ta: 'சந்திரன் (நிலவு மேற்பரப்பு)'
    },
    subtitle: {
      en: 'Mare Tranquillitatis • Shackleton Crater • Hard Vacuum',
      si: 'මාරේ ට්‍රැන්ක්විලිටාටිස් • ෂැකල්ටන් ආවාටය • පරම රික්තය',
      ta: 'மேர் டிரான்குவிலிதாடிஸ் • ஷேக்லட்டன் பள்ளம் • முழு வெற்றிடம்'
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
      status: 'Tidally Locked • Artemis Target'
    }
  },
  {
    id: 'jwst',
    type: 'spacecraft',
    name: {
      en: 'James Webb Space Telescope (JWST)',
      si: 'ජේම්ස් වෙබ් අභ්‍යවකාශ දුරේක්ෂය',
      ta: 'ஜேம்ஸ் வெப் விண்வெளி தொலைநோக்கி'
    },
    subtitle: {
      en: 'Sun-Earth L2 Lagrange Point • 18 Be-Au Mirrors',
      si: 'සූර්ය-පෘථිවි L2 ලග්‍රාන්ජ් ලක්ෂ්‍යය • 18 රන් මිරර් ඛණ්ඩ',
      ta: 'சூரியன்-பூமி L2 லாக்ராஞ்ச் புள்ளி • 18 தங்க கண்ணாடிகள்'
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
      status: '18 Hex Mirrors Phase-Aligned'
    }
  }
];

// ====================================================
// Hook-Safe Texture Loader
// ====================================================
function useSafeTexture(url, fallbackTexture) {
  const [texture, setTexture] = useState(fallbackTexture);

  useEffect(() => {
    if (!url) return;
    let isMounted = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      url,
      (loadedTex) => {
        if (isMounted) {
          loadedTex.colorSpace = THREE.SRGBColorSpace;
          loadedTex.wrapS = THREE.RepeatWrapping;
          loadedTex.wrapT = THREE.ClampToEdgeWrapping;
          loadedTex.needsUpdate = true;
          setTexture(loadedTex);
        }
      },
      undefined,
      () => {
        // Fallback texture remains active
      }
    );

    return () => {
      isMounted = false;
    };
  }, [url]);

  return texture || fallbackTexture;
}

// ====================================================
// 1. MARS MODEL (Custom Equirectangular Texture Map)
// ====================================================
const MarsModel = memo(function MarsModel({ autoRotate, atmosphereHaze, wireframe }) {
  const marsRef = useRef();
  const fallbackTex = useMemo(() => createOptimizedFallbackTexture('mars'), []);
  // Use custom local equirectangular Mars surface texture
  const marsMap = useSafeTexture('/textures/mars.jpg', fallbackTex);

  // Cleanup texture on unmount
  useEffect(() => {
    return () => {
      if (fallbackTex) fallbackTex.dispose();
    };
  }, [fallbackTex]);

  useFrame((_, delta) => {
    if (autoRotate && marsRef.current) {
      marsRef.current.rotation.y += delta * 0.08;
    }
  });

  return (
    <group ref={marsRef}>
      {/* Interactive 3D textured Mars sphere */}
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[2.7, 96, 96]} />
        <meshStandardMaterial
          map={marsMap || fallbackTex}
          roughness={0.78}
          metalness={0.08}
          wireframe={wireframe}
        />
      </mesh>

      {/* Translucent Atmospheric Glow Halo Sphere (Secondary larger sphere with soft additive blending) */}
      <mesh>
        <sphereGeometry args={[2.86, 64, 64]} />
        <meshBasicMaterial
          color="#f97316"
          transparent
          opacity={0.32}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* Outer Atmospheric Limb Fresnel Glow */}
      <mesh>
        <sphereGeometry args={[2.92, 64, 64]} />
        <shaderMaterial
          args={[MarsDustShader]}
          side={THREE.BackSide}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
});

// ====================================================
// 2. MOON MODEL (Memoized, 64-segment geometry)
// ====================================================
const MoonModel = memo(function MoonModel({ autoRotate, wireframe }) {
  const moonRef = useRef();
  const fallbackTex = useMemo(() => createOptimizedFallbackTexture('moon'), []);
  const moonMap = useSafeTexture(
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg',
    fallbackTex
  );

  useEffect(() => {
    return () => {
      if (fallbackTex) fallbackTex.dispose();
    };
  }, [fallbackTex]);

  useFrame((_, delta) => {
    if (autoRotate && moonRef.current) {
      moonRef.current.rotation.y += delta * 0.05;
    }
  });

  return (
    <group ref={moonRef}>
      <mesh>
        <sphereGeometry args={[2.4, 64, 64]} />
        <meshStandardMaterial
          map={moonMap || fallbackTex}
          color="#94a3b8"
          roughness={0.95}
          metalness={0.02}
          wireframe={wireframe}
        />
      </mesh>
    </group>
  );
});

// ====================================================
// 3. JWST MODEL (Memoized, Shared Geometries & Materials)
// ====================================================
const JWSTModel = memo(function JWSTModel({ autoRotate, wireframe }) {
  const groupRef = useRef();
  const elapsedRef = useRef(0);

  useFrame((_, delta) => {
    elapsedRef.current += delta;
    const elapsed = elapsedRef.current;
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(elapsed * 0.8) * 0.1;
      groupRef.current.rotation.z = Math.sin(elapsed * 0.5) * 0.02;
      if (autoRotate) {
        groupRef.current.rotation.y += delta * 0.14;
      }
    }
  });

  // Coordinates for the 18 hexagonal primary mirror segments
  const mirrorOffsets = useMemo(() => [
    [0, 0],
    [-0.55, 0.95], [0.55, 0.95],
    [-1.1, 0], [1.1, 0],
    [-0.55, -0.95], [0.55, -0.95],
    [0, 1.9],
    [-1.1, 1.9], [1.1, 1.9],
    [-1.65, 0.95], [1.65, 0.95],
    [-1.65, -0.95], [1.65, -0.95],
    [0, -1.9],
    [-1.1, -1.9], [1.1, -1.9],
    [-2.2, 0], [2.2, 0]
  ], []);

  // Shared geometry & material for 18 mirrors (drastically reduces draw calls)
  const mirrorGeo = useMemo(() => new THREE.CylinderGeometry(0.42, 0.42, 0.05, 6), []);
  const goldMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#fbbf24',
    metalness: 0.95,
    roughness: 0.08,
    wireframe
  }), [wireframe]);

  // Cleanup shared assets
  useEffect(() => {
    return () => {
      mirrorGeo.dispose();
      goldMaterial.dispose();
    };
  }, [mirrorGeo, goldMaterial]);

  return (
    <group ref={groupRef}>
      {/* 5-Layer Kapton Sunshield */}
      <group position={[0, -1.5, 0]}>
        {[-0.2, -0.1, 0, 0.1, 0.2].map((yOffset, i) => (
          <mesh key={i} position={[0, yOffset, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[4.6 - i * 0.12, 0.08, 6]} />
            <meshStandardMaterial
              color={i === 0 ? '#f8fafc' : '#c026d3'}
              metalness={0.92}
              roughness={0.12}
              wireframe={wireframe}
            />
          </mesh>
        ))}
      </group>

      {/* 18 Hexagonal Mirrors (using shared geometry and material) */}
      <group position={[0, 0.45, 0.75]}>
        {mirrorOffsets.slice(0, 18).map(([mx, my], index) => (
          <mesh 
            key={index} 
            position={[mx * 0.8, my * 0.8, 0]} 
            rotation={[0, 0, Math.PI / 6]}
            geometry={mirrorGeo}
            material={goldMaterial}
          />
        ))}
      </group>

      {/* Secondary Mirror Support Tripod */}
      <group position={[0, 0.45, 2.4]}>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.32, 0.32, 0.08, 12]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.95} roughness={0.08} />
        </mesh>
        <mesh position={[-0.9, 0.9, -1.2]} rotation={[0.4, 0.4, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 2.5]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} />
        </mesh>
        <mesh position={[0.9, 0.9, -1.2]} rotation={[0.4, -0.4, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 2.5]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} />
        </mesh>
        <mesh position={[0, -1.1, -1.2]} rotation={[-0.5, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 2.5]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} />
        </mesh>
      </group>

      {/* ISIM Core Bus */}
      <mesh position={[0, 0.45, -0.5]}>
        <boxGeometry args={[1.8, 1.8, 0.9]} />
        <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.3} wireframe={wireframe} />
      </mesh>
    </group>
  );
});

// ====================================================
// 4. GSAP Camera Transition with Tween Cleanup
// ====================================================
function CameraGSAPController({ target, controlsRef }) {
  const { camera } = useThree();

  useEffect(() => {
    if (!target) return;

    const [tx, ty, tz] = target.cameraPosition;

    const camTween = gsap.to(camera.position, {
      x: tx,
      y: ty,
      z: tz,
      duration: 1.4,
      ease: 'power3.inOut'
    });

    let targetTween = null;
    if (controlsRef.current?.target) {
      targetTween = gsap.to(controlsRef.current.target, {
        x: 0,
        y: 0,
        z: 0,
        duration: 1.4,
        ease: 'power3.inOut',
        onUpdate: () => {
          if (controlsRef.current && typeof controlsRef.current.update === 'function') {
            controlsRef.current.update();
          }
        }
      });
    }

    return () => {
      camTween.kill();
      if (targetTween) targetTween.kill();
    };
  }, [target, camera, controlsRef]);

  return null;
}

// ====================================================
// 5. Main SpaceLab3D Component
// ====================================================
function SpaceLab3D({ lang = 'en' }) {
  const [selectedTargetId, setSelectedTargetId] = useState('mars');
  const [autoRotate, setAutoRotate] = useState(true);
  const [atmosphereHaze, setAtmosphereHaze] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [sunIntensity, setSunIntensity] = useState(2.4);
  const [bloomEnabled, setBloomEnabled] = useState(true);
  const [hudExpanded, setHudExpanded] = useState(true);
  const [fpsStatus, setFpsStatus] = useState('60 FPS (Stable)');
  const [dpr, setDpr] = useState(1.2);

  const controlsRef = useRef();
  const containerRef = useRef(null);
  const [isInView, setIsInView] = useState(true);

  // Pause 3D animation loop when scrolled out of viewport
  useEffect(() => {
    if (!containerRef.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0.05 }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const currentTarget =
    SPACE_TARGETS.find((t) => t.id === selectedTargetId) || SPACE_TARGETS[0];

  const handleResetCamera = useCallback(() => {
    if (controlsRef.current?.object && controlsRef.current?.target) {
      const [tx, ty, tz] = currentTarget.cameraPosition;
      gsap.to(controlsRef.current.object.position, {
        x: tx,
        y: ty,
        z: tz,
        duration: 1.2,
        ease: 'power2.out'
      });
      gsap.to(controlsRef.current.target, {
        x: 0,
        y: 0,
        z: 0,
        duration: 1.2,
        ease: 'power2.out',
        onUpdate: () => {
          if (controlsRef.current && typeof controlsRef.current.update === 'function') {
            controlsRef.current.update();
          }
        }
      });
    }
  }, [currentTarget]);

  return (
    <div ref={containerRef} className="relative w-full h-[720px] sm:h-[800px] rounded-3xl overflow-hidden border border-cyan-500/30 bg-slate-950 shadow-2xl flex flex-col justify-between selection:bg-cyan-500/30">
      {/* 3D WebGL Canvas */}
      <div className="absolute inset-0 z-0">
        <Canvas
          frameloop={isInView ? 'always' : 'never'}
          dpr={dpr}
          camera={{ position: [0, 3, 9.5], fov: 45 }}
          gl={{
            powerPreference: 'high-performance',
            antialias: false
          }}
        >
          {/* Performance Monitor: Dynamically adjusts DPR & disables heavy effects if frame drops occur */}
          <PerformanceMonitor
            onIncline={() => {
              setDpr(1.5);
              setFpsStatus('60 FPS (Peak)');
            }}
            onDecline={() => {
              setDpr(1.0);
              setBloomEnabled(false); // Disable bloom automatically on low-spec hardware
              setFpsStatus('60 FPS (Optimized)');
            }}
          />

          {/* Adaptive scaling: low DPR & no event listeners during camera drag */}
          <AdaptiveDpr pixelated />
          <AdaptiveEvents />

          <CameraGSAPController target={currentTarget} controlsRef={controlsRef} />

          {/* Optimized Lighting */}
          <ambientLight intensity={selectedTargetId === 'moon' ? 0.08 : 0.25} />
          
          <directionalLight
            position={[16, 12, 10]}
            intensity={sunIntensity}
            color="#fffcf2"
          />

          <pointLight position={[-14, -10, -12]} intensity={0.2} color="#38bdf8" />

          {/* Baked Environment lighting for realistic metallic sheen without heavy shadow cascades */}
          <Environment preset="night" environmentIntensity={0.2} />

          {/* Optimized Starfield (6,500 points with GPU twinkling) */}
          <DynamicStarfield count={6500} minRadius={85} maxRadius={360} driftSpeed={0.005} />

          {/* Render Active Celestial Model with 3D Placeholder Sphere Fallback */}
          <Suspense fallback={
            <mesh>
              <sphereGeometry args={[2.4, 24, 24]} />
              <meshStandardMaterial color="#0ea5e9" wireframe={true} />
            </mesh>
          }>
            <Float
              speed={currentTarget.type === 'spacecraft' ? 1.2 : 0.2}
              rotationIntensity={0.1}
              floatIntensity={0.15}
            >
              {selectedTargetId === 'mars' ? (
                <MarsModel
                  autoRotate={autoRotate}
                  atmosphereHaze={atmosphereHaze}
                  wireframe={wireframe}
                />
              ) : selectedTargetId === 'moon' ? (
                <MoonModel autoRotate={autoRotate} wireframe={wireframe} />
              ) : (
                <JWSTModel autoRotate={autoRotate} wireframe={wireframe} />
              )}
            </Float>
          </Suspense>

          {/* Orbit Controls with Damping */}
          <OrbitControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.05}
            minDistance={3.5}
            maxDistance={32}
          />

          {/* Lightweight Post-Processing (multisampling=0 for 60 FPS mobile performance) */}
          {bloomEnabled && (
            <EffectComposer multisampling={0}>
              <Bloom
                mipmapBlur
                luminanceThreshold={0.82}
                intensity={0.9}
                radius={0.5}
              />
              <Vignette eskil={false} offset={0.25} darkness={0.6} />
              <ToneMapping />
            </EffectComposer>
          )}
        </Canvas>
      </div>

      {/* Top Header & Target Switcher */}
      <div className="relative z-10 p-4 sm:p-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pointer-events-none">
        <div className="pointer-events-auto apple-liquid-glass rounded-2xl p-3 shadow-xl flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-colors"
            style={{ 
              backgroundColor: `${currentTarget.glowColor}25`,
              borderColor: `${currentTarget.glowColor}50` 
            }}
          >
            <Radio className="w-5 h-5 animate-pulse text-cyan-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-['Orbitron'] text-xs sm:text-sm font-bold text-white tracking-wider">
                {currentTarget.name[lang] || currentTarget.name.en}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                <Activity className="w-3 h-3 text-emerald-400" />
                {fpsStatus}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              {currentTarget.subtitle[lang] || currentTarget.subtitle.en}
            </p>
          </div>
        </div>

        {/* Mars, Moon, JWST Selector Pill */}
        <div className="pointer-events-auto flex items-center gap-1.5 p-1.5 rounded-2xl apple-liquid-glass shadow-2xl overflow-x-auto">
          {SPACE_TARGETS.map((target) => {
            const isSelected = selectedTargetId === target.id;
            return (
              <button
                key={target.id}
                onClick={() => setSelectedTargetId(target.id)}
                className={`relative px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors select-none z-10 ${
                  isSelected ? 'text-cyan-200 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {isSelected && (
                  <motion.div
                    layoutId="spacelab-opt-pill"
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-600 shadow-md shadow-cyan-500/40 border border-cyan-400/50 -z-10"
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
        <div className="pointer-events-auto w-full lg:max-w-md apple-liquid-glass rounded-2xl p-4 shadow-2xl space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-400" />
              <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                {lang === 'si' ? 'කක්ෂීය සහ පාරිසරික දත්ත' : lang === 'ta' ? 'சுற்றுப்பாதை மற்றும் சுற்றுச்சூழல் தரவு' : 'Orbital & Environmental HUD'}
              </span>
            </div>
            <button
              onClick={() => setHudExpanded(!hudExpanded)}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 font-mono font-medium"
            >
              {hudExpanded ? 'Hide' : 'Show'}
            </button>
          </div>

          {hudExpanded && (
            <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
              <div className="p-2.5 rounded-xl apple-liquid-glass">
                <span className="text-[10px] text-slate-400 block mb-0.5">
                  {lang === 'si' ? 'කක්ෂීය ප්‍රවේගය' : lang === 'ta' ? 'சுற்றுப்பாதை வேகம்' : 'Orbital Velocity'}
                </span>
                <span className="text-cyan-300 font-bold">{currentTarget.telemetry.velocity}</span>
              </div>

              <div className="p-2.5 rounded-xl apple-liquid-glass">
                <span className="text-[10px] text-slate-400 block mb-0.5">
                  {lang === 'si' ? 'දුරස්ථභාවය' : lang === 'ta' ? 'தொலைவு' : 'Distance'}
                </span>
                <span className="text-cyan-300 font-bold">{currentTarget.telemetry.distance}</span>
              </div>

              <div className="p-2.5 rounded-xl apple-liquid-glass">
                <span className="text-[10px] text-slate-400 block mb-0.5">
                  {lang === 'si' ? 'පෘෂ්ඨීය පීඩනය' : lang === 'ta' ? 'மேற்பரப்பு அழுத்தம்' : 'Pressure / Vacuum'}
                </span>
                <span className="text-emerald-300 font-bold">{currentTarget.telemetry.surfacePressure}</span>
              </div>

              <div className="p-2.5 rounded-xl apple-liquid-glass">
                <span className="text-[10px] text-slate-400 block mb-0.5">
                  {lang === 'si' ? 'තාප තත්ත්වය' : lang === 'ta' ? 'வெப்பநிலை' : 'Thermal Profile'}
                </span>
                <span className="text-amber-300 font-bold">{currentTarget.telemetry.temperature}</span>
              </div>

              <div className="col-span-2 p-2.5 rounded-xl apple-liquid-glass">
                <span className="text-[10px] text-slate-400 block mb-0.5">
                  {lang === 'si' ? 'වායුගෝලය / පරිසරය' : lang === 'ta' ? 'வளிமண்டலம்' : 'Environment & Medium'}
                </span>
                <span className="text-sky-300 font-medium">{currentTarget.telemetry.atmosphere}</span>
              </div>
            </div>
          )}

          <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between pt-1">
            <span>Status: <strong className="text-cyan-400">{currentTarget.telemetry.status}</strong></span>
            <span className="text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> DSN Link Active
            </span>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 p-2 rounded-2xl apple-liquid-glass shadow-2xl">
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              autoRotate ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30' : 'bg-slate-800/80 text-slate-300 hover:text-white'
            }`}
            title="Toggle Auto Rotation"
          >
            {autoRotate ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span className="hidden sm:inline">
              {autoRotate ? (lang === 'si' ? 'නවත්වන්න' : lang === 'ta' ? 'நிறுத்து' : 'Pause') : (lang === 'si' ? 'භ්‍රමණය' : lang === 'ta' ? 'சுழற்று' : 'Rotate')}
            </span>
          </button>

          <button
            onClick={handleResetCamera}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition"
            title="Reset Camera View"
          >
            <RotateCcw className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          <button
            onClick={() => setWireframe(!wireframe)}
            className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              wireframe ? 'bg-indigo-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:text-white'
            }`}
            title="Toggle Wireframe Mesh"
          >
            <Layers className="w-4 h-4 text-indigo-300" />
            <span className="hidden sm:inline">Mesh</span>
          </button>

          {selectedTargetId === 'mars' && (
            <button
              onClick={() => setAtmosphereHaze(!atmosphereHaze)}
              className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                atmosphereHaze ? 'bg-orange-600 text-white' : 'bg-slate-800/80 text-slate-300'
              }`}
              title="Toggle Mars Dust Haze"
            >
              <Sparkles className="w-4 h-4 text-orange-200" />
              <span className="hidden sm:inline">Dust Haze</span>
            </button>
          )}

          <button
            onClick={() => setBloomEnabled(!bloomEnabled)}
            className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              bloomEnabled ? 'bg-amber-600 text-white' : 'bg-slate-800/80 text-slate-300'
            }`}
            title="Toggle Mirror Specular Bloom"
          >
            <Zap className="w-4 h-4 text-amber-200" />
            <span className="hidden sm:inline">Bloom</span>
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <input
              type="range"
              min="0.5"
              max="4.0"
              step="0.2"
              value={sunIntensity}
              onChange={(e) => setSunIntensity(parseFloat(e.target.value))}
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
