'use client';

/**
 * OrbitalEarth — the homepage's focal 3D planet (Phase 2 Cinematic Upgrade).
 *
 * Everything drawn here is derived from real NASA Blue Marble / Black Marble /
 * global cloud imagery bundled in `/public/textures/earth`. There are no
 * procedural continents: if WebGL is unavailable, context is lost, Eco mode is
 * active, or a texture fails to decode, the scene falls back seamlessly to
 * `PosterEarth`.
 *
 * Rendering rules
 *  - Governed by the Phase 1 4-tier GPU quality engine (`useDevicePerformance`
 *    + `getHeroEarthConfig`), reusing the cached WebGL capability probe.
 *  - Modular GLSL shaders (`src/three/shaders/*`) deliver ocean solar sunglint,
 *    Rayleigh terminator twilight scattering, cloud-cast shadows, warm Black
 *    Marble city lights, and a sun-aware BackSide atmospheric horizon glow.
 *  - Idle rotation, star twinkle, and subtle desktop pointer parallax pause
 *    when hidden/off-screen and disable completely under `prefers-reduced-motion`
 *    or `still`.
 */

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PosterEarth } from './PosterEarth';
import { useDevicePerformance } from '../../hooks/useDevicePerformance';
import { getHeroEarthConfig, type HeroEarthConfig } from '../../three/earthConfig';
import {
  createManagedShaderMaterial,
  createUniforms,
  EARTH_ATMOSPHERE_FRAGMENT_GLSL,
  EARTH_CLOUDS_FRAGMENT_GLSL,
  EARTH_SURFACE_FRAGMENT_GLSL,
  EARTH_VERTEX_GLSL,
  STARFIELD_FRAGMENT_GLSL,
  STARFIELD_VERTEX_GLSL,
} from '../../three/shaders';

const TWO_PI = Math.PI * 2;
const EARTH_ROTATION_SPEED = 0.018;
const CLOUD_RELATIVE_SPEED = 0.008;

/** Deterministic PRNG (Mulberry32) so the orbital starfield never flickers across remounts. */
function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Realistic stellar blackbody tints (O/B blue-white, A/F white, G cream, K pale amber). */
const STAR_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0.74, 0.87, 1.0],
  [0.86, 0.92, 1.0],
  [0.98, 0.98, 1.0],
  [1.0, 0.95, 0.88],
  [1.0, 0.86, 0.72],
];

function OrbitalStarfield({
  count,
  reducedMotion,
}: {
  count: number;
  reducedMotion: boolean;
}) {
  const { gl } = useThree();
  const pointsRef = useRef<THREE.Points>(null);

  const { geometry, material } = useMemo(() => {
    const rng = createSeededRng(20260412);
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      const u = rng();
      const v = rng();
      const theta = u * TWO_PI;
      const phi = Math.acos(2 * v - 1);
      const radius = 14 + rng() * 14;

      const sinPhi = Math.sin(phi);
      positions[i * 3] = radius * sinPhi * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * sinPhi * Math.sin(theta) - 6;

      // Power-law size distribution: many faint pinpricks, a few brighter stars.
      const brightnessBias = Math.pow(rng(), 2.8);
      sizes[i] = 1.0 + brightnessBias * 2.4;
      phases[i] = rng();

      const palette = STAR_PALETTE[Math.floor(rng() * STAR_PALETTE.length)];
      const dim = 0.55 + brightnessBias * 0.45;
      colors[i * 3] = palette[0] * dim;
      colors[i * 3 + 1] = palette[1] * dim;
      colors[i * 3 + 2] = palette[2] * dim;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    const mat = createManagedShaderMaterial({
      vertexShader: STARFIELD_VERTEX_GLSL,
      fragmentShader: STARFIELD_FRAGMENT_GLSL,
      uniforms: createUniforms({
        uTime: 0,
        uPixelRatio: gl.getPixelRatio(),
        uMotionScale: reducedMotion ? 0 : 1,
      }),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { geometry: geo, material: mat };
  }, [count, gl, reducedMotion]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame((state, delta) => {
    material.uniforms.uPixelRatio.value = gl.getPixelRatio();
    material.uniforms.uMotionScale.value = reducedMotion ? 0 : 1;
    if (reducedMotion) return;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.0022;
    }
  });

  if (count <= 0) return null;

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />;
}

interface PlanetProps {
  config: HeroEarthConfig;
  reducedMotion: boolean;
  pointerRef: React.MutableRefObject<{ x: number; y: number }>;
}

function Planet({ config, reducedMotion, pointerRef }: PlanetProps) {
  const { gl, invalidate } = useThree();
  const rigRef = useRef<THREE.Group>(null);
  const planetRef = useRef<THREE.Group>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);

  const [day, night, cloud] = useLoader(THREE.TextureLoader, [
    config.dayTexture,
    config.nightTexture,
    config.cloudTexture,
  ]);

  useEffect(() => {
    const maxAnisotropy = Math.min(config.anisotropy, gl.capabilities.getMaxAnisotropy());
    [day, night, cloud].forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = maxAnisotropy;
      texture.wrapS = THREE.RepeatWrapping;
      texture.needsUpdate = true;
    });
    cloud.premultiplyAlpha = false;
    invalidate();
  }, [day, night, cloud, config.anisotropy, gl, invalidate]);

  const sunDirection = useMemo(() => new THREE.Vector3(-0.56, 0.28, 0.78).normalize(), []);

  const surfaceMaterial = useMemo(
    () =>
      createManagedShaderMaterial({
        vertexShader: EARTH_VERTEX_GLSL,
        fragmentShader: EARTH_SURFACE_FRAGMENT_GLSL,
        uniforms: createUniforms({
          uDay: day,
          uNight: night,
          uClouds: cloud,
          uSunDirection: sunDirection,
          uCloudOffsetU: 0,
          uCloudShadowStrength: config.cloudShadowStrength,
          uReliefStrength: config.reliefStrength,
          uOceanSpecularStrength: config.oceanSpecularStrength,
        }),
      }),
    [
      day,
      night,
      cloud,
      sunDirection,
      config.cloudShadowStrength,
      config.reliefStrength,
      config.oceanSpecularStrength,
    ]
  );

  const cloudMaterial = useMemo(
    () =>
      createManagedShaderMaterial({
        vertexShader: EARTH_VERTEX_GLSL,
        fragmentShader: EARTH_CLOUDS_FRAGMENT_GLSL,
        uniforms: createUniforms({
          uClouds: cloud,
          uSunDirection: sunDirection,
          uOpacity: 0.56,
        }),
        transparent: true,
        depthWrite: false,
      }),
    [cloud, sunDirection]
  );

  const atmosphereMaterial = useMemo(
    () =>
      createManagedShaderMaterial({
        vertexShader: EARTH_VERTEX_GLSL,
        fragmentShader: EARTH_ATMOSPHERE_FRAGMENT_GLSL,
        uniforms: createUniforms({
          uSunDirection: sunDirection,
          uIntensity: 1.08,
        }),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      }),
    [sunDirection]
  );

  useEffect(() => {
    return () => {
      surfaceMaterial.dispose();
      cloudMaterial.dispose();
      atmosphereMaterial.dispose();
    };
  }, [surfaceMaterial, cloudMaterial, atmosphereMaterial]);

  useFrame((_, rawDelta) => {
    // Clamp frame delta to prevent jarring jumps after tab resume.
    const delta = Math.min(rawDelta, 0.1);

    if (!reducedMotion) {
      if (planetRef.current) {
        planetRef.current.rotation.y += delta * EARTH_ROTATION_SPEED;
      }
      if (cloudsRef.current) {
        cloudsRef.current.rotation.y += delta * CLOUD_RELATIVE_SPEED;
        // Keep projected cloud shadows locked to the drifting cloud mesh.
        surfaceMaterial.uniforms.uCloudOffsetU.value =
          ((-cloudsRef.current.rotation.y / TWO_PI) % 1 + 1) % 1;
      }
    }

    if (rigRef.current) {
      const targetX = config.enableParallax && !reducedMotion ? pointerRef.current.y * 0.045 : 0;
      const targetY = config.enableParallax && !reducedMotion ? pointerRef.current.x * 0.065 : 0;
      const ease = 1 - Math.exp(-delta * 3.5);
      rigRef.current.rotation.x += (targetX - rigRef.current.rotation.x) * ease;
      rigRef.current.rotation.y += (targetY - rigRef.current.rotation.y) * ease;
    }
  });

  return (
    <group ref={rigRef} position={[0.42, -0.32, 0]}>
      <group ref={planetRef} rotation={[0.18, -1.2, 0.05]}>
        {/* NASA Blue Marble / Black Marble surface with ocean glint, twilight & cloud shadows */}
        <mesh material={surfaceMaterial}>
          <sphereGeometry args={[1, config.sphereSegments, config.sphereSegments]} />
        </mesh>

        {/* Elevated NASA global cloud deck */}
        <mesh ref={cloudsRef} material={cloudMaterial}>
          <sphereGeometry args={[1.0055, config.sphereSegments, config.sphereSegments]} />
        </mesh>

        {/* Sun-aware Rayleigh / Mie outer atmospheric scattering shell */}
        <mesh scale={1.11} material={atmosphereMaterial}>
          <sphereGeometry args={[1, config.atmosphereSegments, config.atmosphereSegments]} />
        </mesh>
      </group>
    </group>
  );
}

export interface OrbitalEarthProps {
  className?: string;
  /** Disable idle motion without removing the scene. */
  still?: boolean;
}

export default function OrbitalEarth({ className = '', still = false }: OrbitalEarthProps) {
  const { isOptimizedModeActive, supportsWebGL, qualityProfile } = useDevicePerformance();
  const config = useMemo(() => getHeroEarthConfig(qualityProfile), [qualityProfile]);

  const [contextLost, setContextLost] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const hostRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cleanupCanvasRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener?.('change', sync);
    return () => query.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    const node = hostRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: '140px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!config.enableParallax || reducedMotion || still || typeof window === 'undefined') {
      pointerRef.current = { x: 0, y: 0 };
      return undefined;
    }
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const nx = (event.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
      const ny = (event.clientY / Math.max(window.innerHeight, 1)) * 2 - 1;
      pointerRef.current = {
        x: Math.max(-1, Math.min(1, nx)),
        y: Math.max(-1, Math.min(1, ny)),
      };
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [config.enableParallax, reducedMotion, still]);

  useEffect(() => {
    return () => {
      cleanupCanvasRef.current?.();
      cleanupCanvasRef.current = null;
    };
  }, []);

  const canMeasureCanvas = typeof ResizeObserver !== 'undefined';
  const showCanvas =
    canMeasureCanvas && supportsWebGL && config.enableWebGL && !contextLost && !isOptimizedModeActive;
  const activeFrameloop = inView && tabVisible && !(reducedMotion || still) ? 'always' : 'demand';

  return (
    <div
      ref={hostRef}
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {/* Deep-space atmospheric backdrop keeps planet transitions seamless against void. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_72%_58%,rgba(28,104,196,0.34),rgba(5,9,18,0)_64%)]" />
      {showCanvas ? (
        <Canvas
          className="!absolute inset-0"
          flat
          dpr={config.dpr}
          frameloop={activeFrameloop}
          camera={{ position: [0, 0.05, 2.42], fov: 36 }}
          gl={{
            antialias: config.antialias,
            alpha: true,
            powerPreference: 'high-performance',
          }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
            cleanupCanvasRef.current?.();
            const domElement = gl.domElement;
            const handleLost = (event: Event) => {
              event.preventDefault();
              setContextLost(true);
            };
            const handleRestored = () => {
              setContextLost(false);
            };
            domElement.addEventListener('webglcontextlost', handleLost, false);
            domElement.addEventListener('webglcontextrestored', handleRestored, false);
            cleanupCanvasRef.current = () => {
              domElement.removeEventListener('webglcontextlost', handleLost, false);
              domElement.removeEventListener('webglcontextrestored', handleRestored, false);
            };
          }}
        >
          <Suspense fallback={null}>
            <OrbitalStarfield count={config.starCount} reducedMotion={reducedMotion || still} />
            <Planet
              config={config}
              reducedMotion={reducedMotion || still}
              pointerRef={pointerRef}
            />
          </Suspense>
        </Canvas>
      ) : (
        <PosterEarth />
      )}
      {showCanvas && (
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(4,7,15,0.86)_0%,rgba(4,7,15,0.28)_48%,rgba(4,7,15,0)_72%)]" />
      )}
    </div>
  );
}
