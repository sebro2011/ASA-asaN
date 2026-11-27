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
import { EARTH_TEXTURES } from '../three/earthConfig';
import {
  createFallbackPlanetaryTexture,
  createLunarRegolithTextures,
} from '../three/textures/proceduralTextures';
import {
  createManagedShaderMaterial,
  createUniforms,
  EARTH_ATMOSPHERE_FRAGMENT_GLSL,
  EARTH_CLOUDS_FRAGMENT_GLSL,
  EARTH_SURFACE_FRAGMENT_GLSL,
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
} from 'lucide-react';

const TWO_PI = Math.PI * 2;
const LAB_SUN_DIR = new THREE.Vector3(...LAB_SUN_POSITION).normalize();

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
      ta: 'பூமி கிரகம்',
    },
    subtitle: {
      en: 'Habitable Zone • Low Earth Orbit',
      si: 'ජීවය සහිත කලාපය • පහළ පෘථිවි කක්ෂය',
      ta: 'வாழ்விட மண்டலம் • குறைந்த புவி சுற்றுப்பாதை',
    },
    cameraPosition: [0, 4, 12],
    glowColor: '#38bdf8',
    telemetry: {
      velocity: '29.78 km/s (Helio)',
      distance: '1.000 AU (149.6M km)',
      altitude: '408 km (ISS Trajectory)',
      temperature: '15°C (Mean Surface)',
      atmosphere: '78% N₂, 21% O₂, 0.9% Ar',
      status: 'Biosphere Active • DSN Online',
    },
  },
  {
    id: 'mars',
    type: 'planet',
    name: {
      en: 'Mars (Red Planet)',
      si: 'අඟහරු (රතු ග්‍රහලෝකය)',
      ta: 'செவ்வாய் (சிவப்பு கிரகம்)',
    },
    subtitle: {
      en: 'Jezero Delta • Perseverance Active',
      si: 'ජෙසීරෝ ඩෙල්ටාව • පර්සෙවරන්ස් මෙහෙයුම',
      ta: 'ஜெசெரோ டெல்டா • பெர்சவரன்ஸ் பணி',
    },
    cameraPosition: [0, 3, 10],
    glowColor: '#ea580c',
    telemetry: {
      velocity: '24.07 km/s',
      distance: '1.524 AU (227.9M km)',
      altitude: 'Surface Probe Grid',
      temperature: '-63°C (-81°F)',
      atmosphere: '95.3% CO₂, 2.6% N₂',
      status: 'Dust Haze Detected • MRO Relay',
    },
  },
  {
    id: 'moon',
    type: 'celestial',
    name: {
      en: "Earth's Moon",
      si: 'චන්ද්‍රයා (සඳ)',
      ta: 'பூமியின் நிலவு',
    },
    subtitle: {
      en: 'Shackleton Crater • Artemis Zone',
      si: 'ෂැකල්ටන් ආවාටය • ආටෙමිස් කලාපය',
      ta: 'ஷேக்லட்டன் பள்ளம் • ஆர்ட்டெமிஸ் மண்டலம்',
    },
    cameraPosition: [0, 2.5, 8],
    glowColor: '#94a3b8',
    telemetry: {
      velocity: '1.022 km/s (Orbit)',
      distance: '384,400 km from Earth',
      altitude: 'Perilune 110 km',
      temperature: '-130°C to +120°C',
      atmosphere: 'Surface Boundary Exosphere',
      status: 'Tidally Locked • Gateway Trajectory',
    },
  },
  {
    id: 'jwst',
    type: 'spacecraft',
    name: {
      en: 'James Webb Space Telescope',
      si: 'ජේම්ස් වෙබ් අභ්‍යවකාශ දුරේක්ෂය',
      ta: 'ஜேம்ஸ் வெப் தொலைநோக்கி',
    },
    subtitle: {
      en: 'Sun-Earth L2 Lagrange Point',
      si: 'සූර්ය-පෘථිවි L2 ලග්‍රාන්ජ් ලක්ෂ්‍යය',
      ta: 'சூரியன்-பூமி L2 லாக்ராஞ்ச் புள்ளி',
    },
    cameraPosition: [6, 4, 9],
    glowColor: '#fbbf24',
    telemetry: {
      velocity: '0.20 km/s (Halo Orbit)',
      distance: '1.5M km from Earth',
      altitude: 'L2 Insertion Point',
      temperature: 'Cryo-Cold: -233°C (40K)',
      atmosphere: 'Deep Space Hard Vacuum',
      status: '18 Gold Be-Hex Mirrors Aligned',
    },
  },
];

// ----------------------------------------------------
// 1. Hook-Safe Local Texture Loaders with GPU Disposal
// ----------------------------------------------------

function useSafeTexture(url, fallbackTexture, anisotropy = 4) {
  const { gl } = useThree();
  const [loadedTex, setLoadedTex] = useState(null);

  useEffect(() => {
    if (!url) return undefined;
    let isMounted = true;
    let ownedTex = null;
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
        ownedTex = tex;
        setLoadedTex(tex);
      },
      undefined,
      () => {
        // Retain deterministic procedural fallback texture
      }
    );

    return () => {
      isMounted = false;
      if (ownedTex) ownedTex.dispose();
    };
  }, [url, anisotropy, gl]);

  return loadedTex || fallbackTexture;
}

function useSafeEarthTextures(dayUrl, fallbackEarthTex, anisotropy = 4) {
  const { gl } = useThree();
  const emptyBlackTex = useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    tex.needsUpdate = true;
    return tex;
  }, []);

  const [textures, setTextures] = useState(() => ({
    day: fallbackEarthTex,
    night: emptyBlackTex,
    clouds: emptyBlackTex,
  }));

  useEffect(() => {
    let isMounted = true;
    const owned = [];
    const loader = new THREE.TextureLoader();
    const maxAniso = Math.min(anisotropy, gl.capabilities.getMaxAnisotropy());

    const entries = [
      ['day', dayUrl],
      ['night', EARTH_TEXTURES.night],
      ['clouds', EARTH_TEXTURES.clouds],
    ];

    entries.forEach(([key, url]) => {
      loader.load(
        url,
        (tex) => {
          if (!isMounted) {
            tex.dispose();
            return;
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = maxAniso;
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          if (key === 'clouds') tex.premultiplyAlpha = false;
          tex.needsUpdate = true;
          owned.push(tex);
          setTextures((prev) => ({ ...prev, [key]: tex }));
        },
        undefined,
        () => {
          // Gracefully keep fallback
        }
      );
    });

    return () => {
      isMounted = false;
      owned.forEach((tex) => tex.dispose());
    };
  }, [dayUrl, anisotropy, gl]);

  useEffect(() => {
    return () => {
      emptyBlackTex.dispose();
    };
  }, [emptyBlackTex]);

  return textures;
}

// ----------------------------------------------------
// 2. Realistic Celestial & Spacecraft Models
// ----------------------------------------------------

/**
 * UltraEarth — Powered by modular Phase 2/3 GLSL shaders (real NASA Blue/Black
 * Marble terminator, ocean specular glint, twilight scatter, cloud shadows, and
 * sun-aware Rayleigh limb halo), with clean wireframe inspection mode.
 */
const UltraEarth = memo(function UltraEarth({
  autoRotate,
  atmosphereGlow,
  wireframe,
  labConfig,
  sunIntensity,
  reducedMotion,
}) {
  const planetRef = useRef(null);
  const cloudsRef = useRef(null);

  const fallbackEarthTex = useMemo(() => createFallbackPlanetaryTexture('earth'), []);
  const textures = useSafeEarthTextures(
    labConfig.earthDayTexture,
    fallbackEarthTex,
    labConfig.anisotropy
  );

  const surfaceMaterial = useMemo(
    () =>
      createManagedShaderMaterial({
        vertexShader: EARTH_VERTEX_GLSL,
        fragmentShader: EARTH_SURFACE_FRAGMENT_GLSL,
        uniforms: createUniforms({
          uDay: textures.day,
          uNight: textures.night,
          uClouds: textures.clouds,
          uSunDirection: LAB_SUN_DIR,
          uCloudOffsetU: 0,
          uCloudShadowStrength: labConfig.earthCloudShadowStrength,
          uReliefStrength: labConfig.earthReliefStrength,
          uOceanSpecularStrength: 0.62,
        }),
      }),
    // Created once per mount; texture & tier uniform updates happen in place below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const cloudMaterial = useMemo(
    () =>
      createManagedShaderMaterial({
        vertexShader: EARTH_VERTEX_GLSL,
        fragmentShader: EARTH_CLOUDS_FRAGMENT_GLSL,
        uniforms: createUniforms({
          uClouds: textures.clouds,
          uSunDirection: LAB_SUN_DIR,
          uOpacity: 0.58,
        }),
        transparent: true,
        depthWrite: false,
      }),
    []
  );

  const atmosphereMaterial = useMemo(
    () =>
      createManagedShaderMaterial({
        vertexShader: EARTH_VERTEX_GLSL,
        fragmentShader: EARTH_ATMOSPHERE_FRAGMENT_GLSL,
        uniforms: createUniforms({
          uSunDirection: LAB_SUN_DIR,
          uIntensity: 1.05,
        }),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      }),
    []
  );

  useEffect(() => {
    surfaceMaterial.uniforms.uDay.value = textures.day;
    surfaceMaterial.uniforms.uNight.value = textures.night;
    surfaceMaterial.uniforms.uClouds.value = textures.clouds;
    cloudMaterial.uniforms.uClouds.value = textures.clouds;
  }, [surfaceMaterial, cloudMaterial, textures]);

  useEffect(() => {
    surfaceMaterial.uniforms.uCloudShadowStrength.value = labConfig.earthCloudShadowStrength;
    surfaceMaterial.uniforms.uReliefStrength.value = labConfig.earthReliefStrength;
  }, [surfaceMaterial, labConfig.earthCloudShadowStrength, labConfig.earthReliefStrength]);

  useEffect(() => {
    atmosphereMaterial.uniforms.uIntensity.value = Math.min(1.45, 0.58 + sunIntensity * 0.22);
    surfaceMaterial.uniforms.uOceanSpecularStrength.value = Math.min(0.95, 0.28 + sunIntensity * 0.16);
  }, [atmosphereMaterial, surfaceMaterial, sunIntensity]);

  useEffect(() => {
    return () => {
      if (fallbackEarthTex) fallbackEarthTex.dispose();
    };
  }, [fallbackEarthTex]);

  useEffect(() => {
    return () => {
      surfaceMaterial.dispose();
      cloudMaterial.dispose();
      atmosphereMaterial.dispose();
    };
  }, [surfaceMaterial, cloudMaterial, atmosphereMaterial]);

  useFrame((_, rawDelta) => {
    if (reducedMotion || !autoRotate) return;
    const delta = Math.min(rawDelta, 0.1);
    if (planetRef.current) planetRef.current.rotation.y += delta * 0.11;
    if (cloudsRef.current) {
      cloudsRef.current.rotation.y += delta * 0.045;
      surfaceMaterial.uniforms.uCloudOffsetU.value =
        ((-cloudsRef.current.rotation.y / TWO_PI) % 1 + 1) % 1;
    }
  });

  return (
    <group ref={planetRef} rotation={[0.14, -1.1, 0.06]}>
      {wireframe ? (
        <mesh>
          <sphereGeometry args={[3, labConfig.sphereSegments, labConfig.sphereSegments]} />
          <meshStandardMaterial map={textures.day} color="#38bdf8" wireframe />
        </mesh>
      ) : (
        <>
          <mesh material={surfaceMaterial}>
            <sphereGeometry args={[3, labConfig.sphereSegments, labConfig.sphereSegments]} />
          </mesh>

          <mesh ref={cloudsRef} material={cloudMaterial}>
            <sphereGeometry args={[3.018, labConfig.sphereSegments, labConfig.sphereSegments]} />
          </mesh>

          {atmosphereGlow && (
            <mesh scale={1.105} material={atmosphereMaterial}>
              <sphereGeometry args={[3, labConfig.atmosphereSegments, labConfig.atmosphereSegments]} />
            </mesh>
          )}
        </>
      )}
    </group>
  );
});

/**
 * UltraMars — Bundled NASA Mars texture with terrain bump relief and sun-aware dust limb.
 */
const UltraMars = memo(function UltraMars({
  autoRotate,
  atmosphereGlow,
  wireframe,
  labConfig,
  sunIntensity,
  reducedMotion,
}) {
  const marsRef = useRef(null);
  const fallbackMarsTex = useMemo(() => createFallbackPlanetaryTexture('mars'), []);
  const marsMap = useSafeTexture('/textures/mars.jpg', fallbackMarsTex, labConfig.anisotropy);

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
    atmosphereMaterial.uniforms.uIntensity.value = Math.min(1.4, 0.5 + sunIntensity * 0.18);
  }, [atmosphereMaterial, sunIntensity]);

  useEffect(() => {
    return () => {
      if (fallbackMarsTex) fallbackMarsTex.dispose();
      atmosphereMaterial.dispose();
    };
  }, [fallbackMarsTex, atmosphereMaterial]);

  useFrame((_, rawDelta) => {
    if (reducedMotion || !autoRotate || !marsRef.current) return;
    marsRef.current.rotation.y += Math.min(rawDelta, 0.1) * 0.1;
  });

  return (
    <group ref={marsRef}>
      <mesh castShadow={labConfig.enableShadows} receiveShadow={labConfig.enableShadows}>
        <sphereGeometry args={[2.5, labConfig.sphereSegments, labConfig.sphereSegments]} />
        <meshStandardMaterial
          map={marsMap}
          bumpMap={marsMap}
          bumpScale={0.048}
          roughness={0.86}
          metalness={0.04}
          wireframe={wireframe}
        />
      </mesh>

      {atmosphereGlow && !wireframe && (
        <mesh scale={1.095} material={atmosphereMaterial}>
          <sphereGeometry args={[2.5, labConfig.atmosphereSegments, labConfig.atmosphereSegments]} />
        </mesh>
      )}
    </group>
  );
});

/**
 * UltraMoon — Multi-octave cratered lunar regolith with paired relief bump map.
 */
const UltraMoon = memo(function UltraMoon({
  autoRotate,
  wireframe,
  labConfig,
  reducedMotion,
}) {
  const { gl } = useThree();
  const moonRef = useRef(null);
  const lunarTextures = useMemo(() => createLunarRegolithTextures(), []);

  useEffect(() => {
    const maxAniso = Math.min(labConfig.anisotropy, gl.capabilities.getMaxAnisotropy());
    if (lunarTextures.albedoMap) lunarTextures.albedoMap.anisotropy = maxAniso;
    if (lunarTextures.bumpMap) lunarTextures.bumpMap.anisotropy = maxAniso;
  }, [lunarTextures, labConfig.anisotropy, gl]);

  useEffect(() => {
    return () => {
      lunarTextures.dispose();
    };
  }, [lunarTextures]);

  useFrame((_, rawDelta) => {
    if (reducedMotion || !autoRotate || !moonRef.current) return;
    moonRef.current.rotation.y += Math.min(rawDelta, 0.1) * 0.08;
  });

  return (
    <group ref={moonRef}>
      <mesh castShadow={labConfig.enableShadows} receiveShadow={labConfig.enableShadows}>
        <sphereGeometry args={[2.2, labConfig.sphereSegments, labConfig.sphereSegments]} />
        <meshStandardMaterial
          map={lunarTextures.albedoMap}
          bumpMap={lunarTextures.bumpMap}
          color="#cbd5e1"
          roughness={0.95}
          metalness={0.02}
          bumpScale={0.085}
          wireframe={wireframe}
        />
      </mesh>
    </group>
  );
});

/**
 * UltraJWST — Shared geometries/materials, authentic 18-segment hollow honeycomb,
 * 5-layer Kapton diamond sunshield, illuminated by local `<SpaceEnvironment />`.
 */
const UltraJWST = memo(function UltraJWST({
  autoRotate,
  wireframe,
  labConfig,
  reducedMotion,
}) {
  const jwstRef = useRef(null);

  const shared = useMemo(() => {
    const mirrorGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.06, 6);
    const strutGeo = new THREE.CylinderGeometry(0.03, 0.03, 2.55, 8);
    const shieldShape = new THREE.Shape();
    shieldShape.moveTo(0, 4.9);
    shieldShape.lineTo(3.15, 0.25);
    shieldShape.lineTo(0, -4.45);
    shieldShape.lineTo(-3.15, 0.25);
    shieldShape.closePath();
    const shieldGeo = new THREE.ShapeGeometry(shieldShape);

    const goldMat = new THREE.MeshPhysicalMaterial({
      color: '#f5b938',
      metalness: 0.96,
      roughness: 0.08,
      clearcoat: 0.9,
      reflectivity: 1.0,
      wireframe,
    });
    const kaptonTopMat = new THREE.MeshPhysicalMaterial({
      color: '#dbe4f0',
      metalness: 0.92,
      roughness: 0.16,
      clearcoat: 0.5,
      side: THREE.DoubleSide,
      wireframe,
    });
    const kaptonLowerMat = new THREE.MeshPhysicalMaterial({
      color: '#b478c8',
      metalness: 0.88,
      roughness: 0.2,
      clearcoat: 0.45,
      side: THREE.DoubleSide,
      wireframe,
    });
    const carbonMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      metalness: 0.82,
      roughness: 0.26,
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
    if (reducedMotion || !autoRotate || !jwstRef.current) return;
    jwstRef.current.rotation.y += Math.min(rawDelta, 0.1) * 0.16;
  });

  return (
    <group ref={jwstRef}>
      {/* 5-Layer Silver / Silicon-Kapton Diamond Sunshield */}
      <group position={[0, -1.6, 0.15]}>
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
              castShadow={labConfig.enableShadows}
            />
          );
        })}
      </group>

      {/* 18 Beryllium-Gold Hexagonal Mirrors around Central Aft-Optics Baffle */}
      <group position={[0, 0.44, 0.7]}>
        {JWST_HONEYCOMB_OFFSETS.map(([mx, my], index) => (
          <mesh
            key={index}
            position={[mx * 0.8, my * 0.8, 0]}
            rotation={[Math.PI / 2, 0, Math.PI / 6]}
            geometry={shared.mirrorGeo}
            material={shared.goldMat}
            castShadow={labConfig.enableShadows}
          />
        ))}
        <mesh position={[0, 0, 0.18]} rotation={[Math.PI / 2, 0, 0]} material={shared.carbonMat}>
          <cylinderGeometry args={[0.24, 0.34, 0.42, 6]} />
        </mesh>
      </group>

      {/* Secondary Mirror Support Tripod */}
      <group position={[0, 0.44, 2.42]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={shared.goldMat}>
          <cylinderGeometry args={[0.32, 0.32, 0.07, 16]} />
        </mesh>
        <mesh position={[-0.85, 0.85, -1.15]} rotation={[0.42, 0.38, 0.32]} geometry={shared.strutGeo} material={shared.carbonMat} />
        <mesh position={[0.85, 0.85, -1.15]} rotation={[0.42, -0.38, -0.32]} geometry={shared.strutGeo} material={shared.carbonMat} />
        <mesh position={[0, -1.08, -1.15]} rotation={[-0.52, 0, 0]} geometry={shared.strutGeo} material={shared.carbonMat} />
      </group>

      {/* ISIM Science Instrument Module Core */}
      <mesh position={[0, 0.44, -0.48]} material={shared.carbonMat} castShadow={labConfig.enableShadows}>
        <boxGeometry args={[1.8, 1.8, 0.9]} />
      </mesh>
    </group>
  );
});

// ----------------------------------------------------
// 3. Camera GSAP Controller with Safe Lifecycle
// ----------------------------------------------------
function CameraGSAPController({ target, controlsRef, reducedMotion }) {
  const { camera } = useThree();

  useEffect(() => {
    if (!target) return undefined;

    const [tx, ty, tz] = target.cameraPosition;
    const duration = reducedMotion ? 0.01 : 1.45;

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

// ----------------------------------------------------
// 4. Main CelestialLab3D Component
// ----------------------------------------------------
function CelestialLab3D({ lang = 'en' }) {
  const { qualityProfile, gpuTier } = useDevicePerformance();
  const labConfig = useMemo(() => getLabSceneConfig(qualityProfile), [qualityProfile]);

  const [selectedTargetId, setSelectedTargetId] = useState('earth');
  const [autoRotate, setAutoRotate] = useState(true);
  const [atmosphereGlow, setAtmosphereGlow] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [sunIntensity, setSunIntensity] = useState(2.2);
  const [postProcessingEnabled, setPostProcessingEnabled] = useState(
    () => labConfig.enablePostprocessingByDefault
  );
  const [postUserOverridden, setPostUserOverridden] = useState(false);
  const [hudExpanded, setHudExpanded] = useState(true);
  const [activeDpr, setActiveDpr] = useState(labConfig.maxDpr);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const controlsRef = useRef(null);
  const containerRef = useRef(null);
  const cleanupCanvasRef = useRef(null);
  const [isInView, setIsInView] = useState(true);

  useEffect(() => {
    setActiveDpr(labConfig.maxDpr);
    if (!postUserOverridden) {
      setPostProcessingEnabled(labConfig.enablePostprocessingByDefault);
    }
  }, [labConfig, postUserOverridden]);

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
    TARGETS.find((t) => t.id === selectedTargetId) || TARGETS[0];

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

  const handleTogglePost = useCallback(() => {
    setPostUserOverridden(true);
    setPostProcessingEnabled((prev) => !prev);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[700px] sm:h-[780px] rounded-3xl overflow-hidden border border-cyan-500/30 bg-abyss shadow-2xl flex flex-col justify-between selection:bg-cyan-500/30"
    >
      {/* 3D WebGL Canvas with Tier-Adaptive Post-Processing */}
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
            camera={{ position: [0, 4, 12], fov: 45 }}
            gl={{
              powerPreference: 'high-performance',
              antialias: labConfig.antialias,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.14,
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
            <PerformanceMonitor
              onIncline={() => setActiveDpr(labConfig.maxDpr)}
              onDecline={() => {
                setActiveDpr(1.0);
                setPostProcessingEnabled(false);
              }}
            />

            <AdaptiveDpr pixelated />
            <AdaptiveEvents />

            <CameraGSAPController
              target={currentTarget}
              controlsRef={controlsRef}
              reducedMotion={reducedMotion}
            />

            {/* Calibrated Orbital Space Lighting */}
            <ambientLight intensity={selectedTargetId === 'moon' ? 0.06 : 0.18} />

            <directionalLight
              position={LAB_SUN_POSITION}
              intensity={sunIntensity}
              color="#fffaf0"
              castShadow={labConfig.enableShadows}
              shadow-mapSize-width={labConfig.shadowMapSize || 1024}
              shadow-mapSize-height={labConfig.shadowMapSize || 1024}
              shadow-camera-near={0.5}
              shadow-camera-far={60}
            />

            <pointLight position={[-14, -10, -12]} intensity={0.32} color="#38bdf8" />
            <pointLight position={[10, -12, -8]} intensity={0.18} color="#818cf8" />

            {/* Local procedural IBL lighting (powers realistic JWST gold & metallic sheen) */}
            <SpaceEnvironment
              intensity={selectedTargetId === 'jwst' ? 0.72 : 0.32}
              resolution={labConfig.environmentResolution}
            />

            {/* Tier-Adaptive Twinkling Starfield */}
            <DynamicStarfield
              count={labConfig.starCount}
              minRadius={85}
              maxRadius={380}
              driftSpeed={0.006}
              reducedMotion={reducedMotion}
            />

            {/* Active Target Render with 3D Fallback Planet Error Boundary */}
            <ModelErrorBoundary fallback={<FallbackPlanet radius={2.5} color="#38bdf8" wireframe={true} />}>
              <Suspense fallback={<FallbackPlanet radius={2.5} color="#38bdf8" wireframe={true} />}>
                <Float
                  speed={reducedMotion ? 0 : currentTarget.type === 'spacecraft' ? 1.3 : 0.25}
                  rotationIntensity={reducedMotion ? 0 : 0.12}
                  floatIntensity={reducedMotion ? 0 : 0.18}
                >
                  {selectedTargetId === 'earth' ? (
                    <UltraEarth
                      autoRotate={autoRotate}
                      atmosphereGlow={atmosphereGlow}
                      wireframe={wireframe}
                      labConfig={labConfig}
                      sunIntensity={sunIntensity}
                      reducedMotion={reducedMotion}
                    />
                  ) : selectedTargetId === 'mars' ? (
                    <UltraMars
                      autoRotate={autoRotate}
                      atmosphereGlow={atmosphereGlow}
                      wireframe={wireframe}
                      labConfig={labConfig}
                      sunIntensity={sunIntensity}
                      reducedMotion={reducedMotion}
                    />
                  ) : selectedTargetId === 'moon' ? (
                    <UltraMoon
                      autoRotate={autoRotate}
                      wireframe={wireframe}
                      labConfig={labConfig}
                      reducedMotion={reducedMotion}
                    />
                  ) : (
                    <UltraJWST
                      autoRotate={autoRotate}
                      wireframe={wireframe}
                      labConfig={labConfig}
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
              minDistance={4}
              maxDistance={32}
            />

            {/* Tier-Adaptive Cinematic Post-Processing (multisampling=0 across all GPUs) */}
            <CinematicPostprocessing
              enabled={postProcessingEnabled}
              bloomIntensity={labConfig.bloomIntensity}
              luminanceThreshold={labConfig.bloomLuminanceThreshold}
              vignetteDarkness={0.55}
            />
          </Canvas>
        )}
      </div>

      {/* Top Header & Interactive Target Selector Bar */}
      <div className="relative z-10 p-4 sm:p-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pointer-events-none">
        {/* Mission Telemetry Badge */}
        <div className="pointer-events-auto bg-surface/85 glass-strong border border-cyan-500/30 rounded-[14px] p-3 shadow-xl flex items-center gap-3">
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
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-signal border border-emerald-500/40">
                PBR 3D • {gpuTier.toUpperCase()}
              </span>
            </div>
            <p className="text-[11px] text-ink-3 font-mono">
              {currentTarget.subtitle[lang] || currentTarget.subtitle.en}
            </p>
          </div>
        </div>

        {/* Target Selector Pill with Framer Motion layoutId */}
        <div className="pointer-events-auto flex items-center gap-1.5 p-1.5 rounded-[14px] bg-surface/85 glass-strong border border-line shadow-2xl overflow-x-auto">
          {TARGETS.map((target) => {
            const isSelected = selectedTargetId === target.id;
            return (
              <button
                type="button"
                key={target.id}
                onClick={() => setSelectedTargetId(target.id)}
                className={`relative px-3.5 py-1.5 rounded-[10px] text-xs font-semibold whitespace-nowrap transition-colors select-none z-10 ${
                  isSelected ? 'text-cyan-200 font-bold' : 'text-ink-3 hover:text-ink'
                }`}
              >
                {isSelected && (
                  <motion.div
                    layoutId="ultra-target-pill"
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

      {/* Bottom Floating Area: Glassmorphic Telemetry HUD & Interactive Controls */}
      <div className="relative z-10 p-4 sm:p-6 flex flex-col lg:flex-row items-end justify-between gap-4 pointer-events-none">
        {/* Left: Futuristic Telemetry HUD */}
        <div className="pointer-events-auto w-full lg:max-w-md bg-abyss/85 glass-strong border border-cyan-500/30 rounded-[14px] p-4 shadow-2xl space-y-3">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-400" />
              <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                {lang === 'si'
                  ? 'කක්ෂීය තාක්ෂණික දත්ත (Telemetry)'
                  : lang === 'ta'
                  ? 'சுற்றுப்பாதை தொலை அளவீடு (Telemetry)'
                  : 'Orbital Telemetry HUD'}
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
              <div className="p-2.5 rounded-[10px] bg-surface/60 border border-line">
                <span className="text-[10px] text-ink-3 block mb-0.5">
                  {lang === 'si' ? 'කක්ෂීය ප්‍රවේගය' : lang === 'ta' ? 'சுற்றுப்பாதை வேகம்' : 'Velocity'}
                </span>
                <span className="text-cyan-300 font-bold">{currentTarget.telemetry.velocity}</span>
              </div>

              <div className="p-2.5 rounded-[10px] bg-surface/60 border border-line">
                <span className="text-[10px] text-ink-3 block mb-0.5">
                  {lang === 'si' ? 'දුරස්ථභාවය' : lang === 'ta' ? 'தொலைவு' : 'Distance'}
                </span>
                <span className="text-cyan-300 font-bold">{currentTarget.telemetry.distance}</span>
              </div>

              <div className="p-2.5 rounded-[10px] bg-surface/60 border border-line">
                <span className="text-[10px] text-ink-3 block mb-0.5">
                  {lang === 'si' ? 'උන්නතාංශය' : lang === 'ta' ? 'உயரம்' : 'Altitude'}
                </span>
                <span className="text-signal font-bold">{currentTarget.telemetry.altitude}</span>
              </div>

              <div className="p-2.5 rounded-[10px] bg-surface/60 border border-line">
                <span className="text-[10px] text-ink-3 block mb-0.5">
                  {lang === 'si' ? 'උෂ්ණත්වය' : lang === 'ta' ? 'வெப்பநிலை' : 'Thermal'}
                </span>
                <span className="text-amber-300 font-bold">{currentTarget.telemetry.temperature}</span>
              </div>

              <div className="col-span-2 p-2.5 rounded-[10px] bg-surface/60 border border-line">
                <span className="text-[10px] text-ink-3 block mb-0.5">
                  {lang === 'si' ? 'වායුගෝලීය සංයුතිය' : lang === 'ta' ? 'வளிமண்டலக் கலவை' : 'Atmospheric Composition'}
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
              <ShieldCheck className="w-3.5 h-3.5" /> DSN Link
            </span>
          </div>
        </div>

        {/* Right: Interactive Controls Bar */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 p-2 rounded-[14px] bg-surface/85 glass-strong border border-cyan-500/30 shadow-2xl">
          <button
            type="button"
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-2.5 rounded-[10px] text-xs font-semibold flex items-center gap-1.5 transition ${
              autoRotate
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                : 'bg-surface-2/70 text-ink-2 hover:text-ink'
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

          {currentTarget.type === 'planet' && (
            <button
              type="button"
              onClick={() => setAtmosphereGlow(!atmosphereGlow)}
              className={`p-2.5 rounded-[10px] text-xs font-semibold flex items-center gap-1.5 transition ${
                atmosphereGlow ? 'bg-sky-600/80 text-white' : 'bg-surface-2/70 text-ink-2'
              }`}
              title="Atmosphere Glow"
            >
              <Sparkles className="w-4 h-4 text-sky-300" />
              <span className="hidden sm:inline">Haze</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleTogglePost}
            className={`p-2.5 rounded-[10px] text-xs font-semibold flex items-center gap-1.5 transition ${
              postProcessingEnabled ? 'bg-amber-600/80 text-white' : 'bg-surface-2/70 text-ink-2'
            }`}
            title="Toggle Cinematic Post-Processing"
          >
            <Zap className="w-4 h-4 text-amber-300" />
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

export default memo(CelestialLab3D);
