'use client';

import React, { useState, useRef, useEffect, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { 
  OrbitControls, 
  Stars, 
  Float, 
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
  Thermometer, 
  Eye, 
  Sliders, 
  Camera,
  Compass,
  Zap,
  Globe2
} from 'lucide-react';

/**
 * Procedural Fallback Texture Generator (guarantees offline/instantaneous visual realism)
 */
function createProceduralSpaceTexture(type = 'earth') {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (type === 'earth') {
    // Deep Ocean Blue Base
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#0a2342');
    gradient.addColorStop(0.5, '#0d3b66');
    gradient.addColorStop(1, '#0a2342');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Procedural Landmasses
    ctx.fillStyle = '#2d5a27';
    for (let i = 0; i < 90; i++) {
      const x = Math.sin(i * 1.5) * 450 + canvas.width / 2;
      const y = Math.cos(i * 0.9) * 200 + canvas.height / 2;
      const r = Math.abs(Math.sin(i)) * 60 + 20;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'mars') {
    // Rust-Red Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#78281f');
    gradient.addColorStop(0.5, '#b03a2e');
    gradient.addColorStop(1, '#641e16');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Craters & Dark Basins
    ctx.fillStyle = '#4a150e';
    for (let i = 0; i < 140; i++) {
      const x = (Math.sin(i * 2.3) * 0.5 + 0.5) * canvas.width;
      const y = (Math.cos(i * 1.7) * 0.5 + 0.5) * canvas.height;
      const r = Math.abs(Math.sin(i)) * 35 + 8;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'moon') {
    // Lunar Regolith Greyscale
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Lunar Maria (Dark Basins)
    ctx.fillStyle = '#374151';
    for (let i = 0; i < 120; i++) {
      const x = (Math.sin(i * 3.1) * 0.5 + 0.5) * canvas.width;
      const y = (Math.cos(i * 2.4) * 0.5 + 0.5) * canvas.height;
      const r = Math.abs(Math.sin(i)) * 40 + 6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * Atmosphere Glow Shader Material (Fresnel effect)
 */
const AtmosphereShaderMaterial = {
  uniforms: {
    color: { value: new THREE.Color('#38bdf8') },
    power: { value: 2.2 },
    intensity: { value: 1.4 }
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 color;
    uniform float power;
    uniform float intensity;
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      float glow = pow(0.7 - dot(vNormal, vec3(0, 0, 1.0)), power);
      gl_FragColor = vec4(color, glow * intensity);
    }
  `
};

/**
 * Target Celestial Bodies & Spacecraft with Trilingual Metadata
 */
const TARGETS = [
  {
    id: 'earth',
    type: 'planet',
    name: {
      en: 'Planet Earth',
      si: 'පෘථිවි ග්‍රහලෝකය',
      ta: 'பூமி கிரகம்'
    },
    subtitle: {
      en: 'Habitable Zone • Low Earth Orbit',
      si: 'ජීවය සහිත කලාපය • පහළ පෘථිවි කක්ෂය',
      ta: 'வாழ்விட மண்டலம் • குறைந்த புவி சுற்றுப்பாதை'
    },
    cameraPosition: [0, 4, 12],
    glowColor: '#38bdf8',
    telemetry: {
      velocity: '29.78 km/s (Helio)',
      distance: '1.000 AU (149.6M km)',
      altitude: '408 km (ISS Trajectory)',
      temperature: '15°C (Mean Surface)',
      atmosphere: '78% N₂, 21% O₂, 0.9% Ar',
      status: 'Biosphere Active • DSN Online'
    }
  },
  {
    id: 'mars',
    type: 'planet',
    name: {
      en: 'Mars (Red Planet)',
      si: 'අඟහරු (රතු ග්‍රහලෝකය)',
      ta: 'செவ்வாய் (சிவப்பு கிரகம்)'
    },
    subtitle: {
      en: 'Jezero Delta • Perseverance Active',
      si: 'ජෙසීරෝ ඩෙල්ටාව • පර්සෙවරන්ස් මෙහෙයුම',
      ta: 'ஜெசெரோ டெல்டா • பெர்சவரன்ஸ் பணி'
    },
    cameraPosition: [0, 3, 10],
    glowColor: '#ea580c',
    telemetry: {
      velocity: '24.07 km/s',
      distance: '1.524 AU (227.9M km)',
      altitude: 'Surface Probe Grid',
      temperature: '-63°C (-81°F)',
      atmosphere: '95.3% CO₂, 2.6% N₂',
      status: 'Dust Haze Detected • MRO Relay'
    }
  },
  {
    id: 'moon',
    type: 'celestial',
    name: {
      en: "Earth's Moon",
      si: 'චන්ද්‍රයා (සඳ)',
      ta: 'பூமியின் நிலவு'
    },
    subtitle: {
      en: 'Shackleton Crater • Artemis Zone',
      si: 'ෂැකල්ටන් ආවාටය • ආටෙමිස් කලාපය',
      ta: 'ஷேக்லட்டன் பள்ளம் • ஆர்ட்டெமிஸ் மண்டலம்'
    },
    cameraPosition: [0, 2.5, 8],
    glowColor: '#94a3b8',
    telemetry: {
      velocity: '1.022 km/s (Orbit)',
      distance: '384,400 km from Earth',
      altitude: 'Perilune 110 km',
      temperature: '-130°C to +120°C',
      atmosphere: 'Surface Boundary Exosphere',
      status: 'Tidally Locked • Gateway Trajectory'
    }
  },
  {
    id: 'jwst',
    type: 'spacecraft',
    name: {
      en: 'James Webb Space Telescope',
      si: 'ජේම්ස් වෙබ් අභ්‍යවකාශ දුරේක්ෂය',
      ta: 'ஜேம்ஸ் வெப் தொலைநோக்கி'
    },
    subtitle: {
      en: 'Sun-Earth L2 Lagrange Point',
      si: 'සූර්ය-පෘථිවි L2 ලග්‍රාන්ජ් ලක්ෂ්‍යය',
      ta: 'சூரியன்-பூமி L2 லாக்ராஞ்ச் புள்ளி'
    },
    cameraPosition: [6, 4, 9],
    glowColor: '#fbbf24',
    telemetry: {
      velocity: '0.20 km/s (Halo Orbit)',
      distance: '1.5M km from Earth',
      altitude: 'L2 Insertion Point',
      temperature: 'Cryo-Cold: -233°C (40K)',
      atmosphere: 'Deep Space Hard Vacuum',
      status: '18 Gold Be-Hex Mirrors Aligned'
    }
  }
];

// ----------------------------------------------------
// 1. Realistic PBR Celestial Models (Hook-Safe Loaders)
// ----------------------------------------------------

/**
 * Hook-safe texture loader using Three.js TextureLoader in useEffect
 * Eliminates Rules of Hooks violations and prevents suspense crashes
 */
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
          loadedTex.wrapS = THREE.RepeatWrapping;
          loadedTex.wrapT = THREE.ClampToEdgeWrapping;
          setTexture(loadedTex);
        }
      },
      undefined,
      () => {
        // Fallback texture remains active on network or CORS errors
      }
    );

    return () => {
      isMounted = false;
    };
  }, [url]);

  return texture || fallbackTexture;
}

/**
 * Hook-safe multi-texture loader for Earth (surface, normal, specular, clouds)
 */
function useSafeEarthTextures(fallbackEarthTex) {
  const [textures, setTextures] = useState({
    map: fallbackEarthTex,
    normalMap: null,
    specularMap: null,
    cloudsMap: null
  });

  useEffect(() => {
    let isMounted = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');

    const urls = {
      map: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg',
      normalMap: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg',
      specularMap: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg',
      cloudsMap: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png'
    };

    Object.entries(urls).forEach(([key, url]) => {
      loader.load(
        url,
        (loadedTex) => {
          if (isMounted) {
            setTextures((prev) => ({ ...prev, [key]: loadedTex }));
          }
        },
        undefined,
        () => {
          // Gracefully retain fallback
        }
      );
    });

    return () => {
      isMounted = false;
    };
  }, [fallbackEarthTex]);

  return textures;
}

/**
 * Ultra-Realistic Earth with PBR Shaders, Dual-Layer Clouds, and Fresnel Atmosphere Glow
 */
function UltraEarth({ autoRotate, atmosphereGlow, wireframe }) {
  const earthRef = useRef();
  const cloudsRef = useRef();
  const atmosphereRef = useRef();

  // Create procedural fallback textures
  const fallbackEarthTex = useMemo(() => createProceduralSpaceTexture('earth'), []);
  const textures = useSafeEarthTextures(fallbackEarthTex);

  useFrame((_, delta) => {
    if (autoRotate) {
      if (earthRef.current) earthRef.current.rotation.y += delta * 0.12;
      if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.18; // Clouds drift faster
    }
  });

  return (
    <group>
      {/* Earth Surface PBR Mesh */}
      <mesh ref={earthRef} castShadow receiveShadow>
        <sphereGeometry args={[3, 96, 96]} />
        <meshPhysicalMaterial
          map={textures.map || fallbackEarthTex}
          normalMap={textures.normalMap || null}
          normalScale={new THREE.Vector2(0.85, 0.85)}
          roughness={0.4}
          metalness={0.1}
          clearcoat={0.3}
          clearcoatRoughness={0.2}
          wireframe={wireframe}
        />
      </mesh>

      {/* Drifting Cloud Layer */}
      <mesh ref={cloudsRef}>
        <sphereGeometry args={[3.045, 64, 64]} />
        <meshStandardMaterial
          map={textures.cloudsMap || null}
          color="#ffffff"
          transparent
          opacity={textures.cloudsMap ? 0.85 : 0.28}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          wireframe={wireframe}
        />
      </mesh>

      {/* Cinematic Fresnel Atmosphere Shader Halo */}
      {atmosphereGlow && (
        <mesh ref={atmosphereRef}>
          <sphereGeometry args={[3.25, 48, 48]} />
          <shaderMaterial
            args={[AtmosphereShaderMaterial]}
            side={THREE.BackSide}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

/**
 * Ultra-Realistic Mars with Crater Bump/Normal, Dusty Red PBR, and Polar Ice
 */
function UltraMars({ autoRotate, atmosphereGlow, wireframe }) {
  const marsRef = useRef();
  const fallbackMarsTex = useMemo(() => createProceduralSpaceTexture('mars'), []);
  const marsMap = useSafeTexture(
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/mars_1k_color.jpg',
    fallbackMarsTex
  );

  useFrame((_, delta) => {
    if (autoRotate && marsRef.current) {
      marsRef.current.rotation.y += delta * 0.1;
    }
  });

  return (
    <group ref={marsRef}>
      {/* Mars Body */}
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[2.5, 96, 96]} />
        <meshStandardMaterial
          map={marsMap || fallbackMarsTex}
          color="#c1440e"
          roughness={0.88}
          metalness={0.12}
          bumpScale={0.06}
          wireframe={wireframe}
        />
      </mesh>

      {/* North Polar Ice Cap */}
      <mesh position={[0, 2.44, 0]}>
        <sphereGeometry args={[0.55, 32, 16, 0, Math.PI * 2, 0, Math.PI / 3.5]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.25} wireframe={wireframe} />
      </mesh>

      {/* South Polar Ice Cap */}
      <mesh position={[0, -2.44, 0]} rotation={[Math.PI, 0, 0]}>
        <sphereGeometry args={[0.42, 32, 16, 0, Math.PI * 2, 0, Math.PI / 3.5]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.25} wireframe={wireframe} />
      </mesh>

      {/* Mars Atmospheric Dust Haze */}
      {atmosphereGlow && (
        <mesh>
          <sphereGeometry args={[2.65, 48, 48]} />
          <meshBasicMaterial
            color="#fb923c"
            transparent
            opacity={0.14}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
    </group>
  );
}

/**
 * Ultra-Realistic Moon with Lunar Regolith Texture and Craters
 */
function UltraMoon({ autoRotate, wireframe }) {
  const moonRef = useRef();
  const fallbackMoonTex = useMemo(() => createProceduralSpaceTexture('moon'), []);
  const moonMap = useSafeTexture(
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg',
    fallbackMoonTex
  );

  useFrame((_, delta) => {
    if (autoRotate && moonRef.current) {
      moonRef.current.rotation.y += delta * 0.08;
    }
  });

  return (
    <group ref={moonRef}>
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[2.2, 96, 96]} />
        <meshStandardMaterial
          map={moonMap || fallbackMoonTex}
          color="#94a3b8"
          roughness={0.92}
          metalness={0.08}
          bumpScale={0.08}
          wireframe={wireframe}
        />
      </mesh>
    </group>
  );
}

/**
 * Ultra-Realistic James Webb Space Telescope (JWST)
 * Features PBR Gold-Beryllium Honeycomb array, 5-layer Kapton sunshield, and tripod secondary mirror
 */
function UltraJWST({ autoRotate, wireframe }) {
  const jwstRef = useRef();

  useFrame((_, delta) => {
    if (autoRotate && jwstRef.current) {
      jwstRef.current.rotation.y += delta * 0.18;
    }
  });

  const mirrorOffsets = [
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
  ];

  return (
    <group ref={jwstRef}>
      {/* 5-Layer Silver / Kapton Sunshield Membranes */}
      <group position={[0, -1.5, 0]}>
        {[-0.2, -0.1, 0, 0.1, 0.2].map((yOffset, i) => (
          <mesh key={i} position={[0, yOffset, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
            <coneGeometry args={[4.6 - i * 0.12, 0.08, 6]} />
            <meshPhysicalMaterial
              color={i === 0 ? '#e2e8f0' : '#b45309'}
              metalness={0.95}
              roughness={0.15}
              clearcoat={0.8}
              wireframe={wireframe}
            />
          </mesh>
        ))}
      </group>

      {/* 18 Beryllium-Gold Hexagonal Honeycomb Mirrors with Specular Sheen */}
      <group position={[0, 0.4, 0.7]}>
        {mirrorOffsets.slice(0, 18).map(([mx, my], index) => (
          <mesh 
            key={index} 
            position={[mx * 0.8, my * 0.8, 0]} 
            rotation={[0, 0, Math.PI / 6]}
            castShadow
          >
            <cylinderGeometry args={[0.42, 0.42, 0.06, 6]} />
            <meshPhysicalMaterial
              color="#fbbf24"
              metalness={0.98}
              roughness={0.08}
              clearcoat={1.0}
              reflectivity={1.0}
              wireframe={wireframe}
            />
          </mesh>
        ))}
      </group>

      {/* Secondary Mirror Support Tripod & Boom */}
      <group position={[0, 0.4, 2.4]}>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.32, 0.32, 0.07, 16]} />
          <meshPhysicalMaterial color="#f59e0b" metalness={0.95} roughness={0.1} />
        </mesh>
        <mesh position={[-0.85, 0.85, -1.15]} rotation={[0.4, 0.4, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 2.5]} />
          <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.2} />
        </mesh>
        <mesh position={[0.85, 0.85, -1.15]} rotation={[0.4, -0.4, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 2.5]} />
          <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.2} />
        </mesh>
        <mesh position={[0, -1.05, -1.15]} rotation={[-0.5, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 2.5]} />
          <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.2} />
        </mesh>
      </group>

      {/* ISIM Science Instrument Module Core */}
      <mesh position={[0, 0.4, -0.45]} castShadow>
        <boxGeometry args={[1.8, 1.8, 0.9]} />
        <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.3} wireframe={wireframe} />
      </mesh>
    </group>
  );
}

// ----------------------------------------------------
// 2. Camera GSAP Controller with Safe Lifecycle
// ----------------------------------------------------
function CameraGSAPController({ target, controlsRef }) {
  const { camera } = useThree();

  useEffect(() => {
    if (!target) return;

    const [tx, ty, tz] = target.cameraPosition;

    const camTween = gsap.to(camera.position, {
      x: tx,
      y: ty,
      z: tz,
      duration: 1.5,
      ease: 'power3.inOut'
    });

    let targetTween = null;
    if (controlsRef.current?.target) {
      targetTween = gsap.to(controlsRef.current.target, {
        x: 0,
        y: 0,
        z: 0,
        duration: 1.5,
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

// ----------------------------------------------------
// 3. Main CelestialLab3D Component
// ----------------------------------------------------
export default function CelestialLab3D({ lang = 'en' }) {
  const [selectedTargetId, setSelectedTargetId] = useState('earth');
  const [autoRotate, setAutoRotate] = useState(true);
  const [atmosphereGlow, setAtmosphereGlow] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [sunIntensity, setSunIntensity] = useState(2.2);
  const [postProcessingEnabled, setPostProcessingEnabled] = useState(true);
  const [hudExpanded, setHudExpanded] = useState(true);

  const controlsRef = useRef();

  const currentTarget =
    TARGETS.find((t) => t.id === selectedTargetId) || TARGETS[0];

  const handleResetCamera = () => {
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
  };

  return (
    <div className="relative w-full h-[700px] sm:h-[780px] rounded-3xl overflow-hidden border border-cyan-500/30 bg-slate-950 shadow-2xl flex flex-col justify-between selection:bg-cyan-500/30">
      {/* 3D WebGL Canvas with Post-Processing */}
      <div className="absolute inset-0 z-0">
        <Canvas
          shadows
          camera={{ position: [0, 4, 12], fov: 45 }}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.25
          }}
        >
          <CameraGSAPController target={currentTarget} controlsRef={controlsRef} />

          {/* Realistic Space Lighting */}
          <ambientLight intensity={0.25} />
          
          {/* Intense Directional Sunlight */}
          <directionalLight
            position={[16, 12, 10]}
            intensity={sunIntensity}
            color="#fffcf2"
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-near={0.5}
            shadow-camera-far={60}
          />

          {/* Deep Space Fill Light with subtle nebula tone */}
          <pointLight position={[-14, -10, -12]} intensity={0.4} color="#38bdf8" />
          <pointLight position={[10, -12, -8]} intensity={0.2} color="#818cf8" />

          {/* Dynamic Twinkling Starfield using Three.js Points */}
          <DynamicStarfield count={9500} minRadius={85} maxRadius={380} driftSpeed={0.006} />

          {/* Active Target Render */}
          <Suspense fallback={null}>
            <Float
              speed={currentTarget.type === 'spacecraft' ? 1.6 : 0.3}
              rotationIntensity={0.15}
              floatIntensity={0.25}
            >
              {selectedTargetId === 'earth' ? (
                <UltraEarth
                  autoRotate={autoRotate}
                  atmosphereGlow={atmosphereGlow}
                  wireframe={wireframe}
                />
              ) : selectedTargetId === 'mars' ? (
                <UltraMars
                  autoRotate={autoRotate}
                  atmosphereGlow={atmosphereGlow}
                  wireframe={wireframe}
                />
              ) : selectedTargetId === 'moon' ? (
                <UltraMoon autoRotate={autoRotate} wireframe={wireframe} />
              ) : (
                <UltraJWST autoRotate={autoRotate} wireframe={wireframe} />
              )}
            </Float>
          </Suspense>

          {/* Orbit Controls */}
          <OrbitControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.05}
            minDistance={4}
            maxDistance={32}
          />

          {/* Cinematic Post-Processing Effects */}
          {postProcessingEnabled && (
            <EffectComposer multisampling={4}>
              <Bloom
                luminanceThreshold={0.75}
                luminanceSmoothing={0.8}
                intensity={1.15}
                radius={0.7}
              />
              <Vignette eskil={false} offset={0.25} darkness={0.65} />
              <ToneMapping />
            </EffectComposer>
          )}
        </Canvas>
      </div>

      {/* Top Header & Interactive Target Selector Bar */}
      <div className="relative z-10 p-4 sm:p-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pointer-events-none">
        {/* Mission Telemetry Badge */}
        <div className="pointer-events-auto bg-slate-900/85 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-3 shadow-xl flex items-center gap-3">
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
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                PBR 3D
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              {currentTarget.subtitle[lang] || currentTarget.subtitle.en}
            </p>
          </div>
        </div>

        {/* Target Selector Pill with Framer Motion layoutId */}
        <div className="pointer-events-auto flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-900/85 backdrop-blur-2xl border border-slate-800 shadow-2xl overflow-x-auto">
          {TARGETS.map((target) => {
            const isSelected = selectedTargetId === target.id;
            return (
              <button
                key={target.id}
                onClick={() => setSelectedTargetId(target.id)}
                className={`relative px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors select-none z-10 ${
                  isSelected ? 'text-cyan-200 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {isSelected && (
                  <motion.div
                    layoutId="ultra-target-pill"
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

      {/* Bottom Floating Area: Glassmorphic Telemetry HUD & Interactive Controls */}
      <div className="relative z-10 p-4 sm:p-6 flex flex-col lg:flex-row items-end justify-between gap-4 pointer-events-none">
        {/* Left: Futuristic Telemetry HUD */}
        <div className="pointer-events-auto w-full lg:max-w-md bg-slate-950/85 backdrop-blur-2xl border border-cyan-500/30 rounded-2xl p-4 shadow-2xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-400" />
              <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                {lang === 'si' ? 'කක්ෂීය තාක්ෂණික දත්ත (Telemetry)' : lang === 'ta' ? 'சுற்றுப்பாதை தொலை அளவீடு (Telemetry)' : 'Orbital Telemetry HUD'}
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
              <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 block mb-0.5">
                  {lang === 'si' ? 'කක්ෂීය ප්‍රවේගය' : lang === 'ta' ? 'சுற்றுப்பாதை வேகம்' : 'Velocity'}
                </span>
                <span className="text-cyan-300 font-bold">{currentTarget.telemetry.velocity}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 block mb-0.5">
                  {lang === 'si' ? 'දුරස්ථභාවය' : lang === 'ta' ? 'தொலைவு' : 'Distance'}
                </span>
                <span className="text-cyan-300 font-bold">{currentTarget.telemetry.distance}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 block mb-0.5">
                  {lang === 'si' ? 'උන්නතාංශය' : lang === 'ta' ? 'உயரம்' : 'Altitude'}
                </span>
                <span className="text-emerald-300 font-bold">{currentTarget.telemetry.altitude}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 block mb-0.5">
                  {lang === 'si' ? 'උෂ්ණත්වය' : lang === 'ta' ? 'வெப்பநிலை' : 'Thermal'}
                </span>
                <span className="text-amber-300 font-bold">{currentTarget.telemetry.temperature}</span>
              </div>

              <div className="col-span-2 p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 block mb-0.5">
                  {lang === 'si' ? 'වායුගෝලීය සංයුතිය' : lang === 'ta' ? 'வளிமண்டலக் கலவை' : 'Atmospheric Composition'}
                </span>
                <span className="text-sky-300 font-medium">{currentTarget.telemetry.atmosphere}</span>
              </div>
            </div>
          )}

          <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between pt-1">
            <span>Status: <strong className="text-cyan-400">{currentTarget.telemetry.status}</strong></span>
            <span className="text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> DSN Link
            </span>
          </div>
        </div>

        {/* Right: Interactive Controls Bar */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 p-2 rounded-2xl bg-slate-900/85 backdrop-blur-xl border border-cyan-500/30 shadow-2xl">
          {/* Auto-Rotation Toggle */}
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              autoRotate
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                : 'bg-slate-800/80 text-slate-300 hover:text-white'
            }`}
            title="Toggle Auto Rotation"
          >
            {autoRotate ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span className="hidden sm:inline">
              {autoRotate ? (lang === 'si' ? 'නවත්වන්න' : lang === 'ta' ? 'நிறுத்து' : 'Pause') : (lang === 'si' ? 'භ්‍රමණය' : lang === 'ta' ? 'சுழற்று' : 'Rotate')}
            </span>
          </button>

          {/* Reset Camera Button */}
          <button
            onClick={handleResetCamera}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition"
            title="Reset Camera View"
          >
            <RotateCcw className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          {/* Wireframe Mesh Toggle */}
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

          {/* Atmosphere Glow Toggle */}
          {currentTarget.type === 'planet' && (
            <button
              onClick={() => setAtmosphereGlow(!atmosphereGlow)}
              className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                atmosphereGlow ? 'bg-sky-600/80 text-white' : 'bg-slate-800/80 text-slate-300'
              }`}
              title="Atmosphere Glow"
            >
              <Sparkles className="w-4 h-4 text-sky-300" />
              <span className="hidden sm:inline">Haze</span>
            </button>
          )}

          {/* Post-Processing Bloom Toggle */}
          <button
            onClick={() => setPostProcessingEnabled(!postProcessingEnabled)}
            className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              postProcessingEnabled ? 'bg-amber-600/80 text-white' : 'bg-slate-800/80 text-slate-300'
            }`}
            title="Toggle Cinematic Post-Processing"
          >
            <Zap className="w-4 h-4 text-amber-300" />
            <span className="hidden sm:inline">Bloom</span>
          </button>

          {/* Sunlight Intensity Slider */}
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
