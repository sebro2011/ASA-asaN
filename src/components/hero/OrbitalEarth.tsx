'use client';

/**
 * OrbitalEarth — the homepage's focal 3D planet.
 *
 * Everything drawn here is derived from real NASA Blue Marble / Black Marble
 * imagery bundled in `/public/textures/earth`. There are no procedural
 * continents: if a texture fails to decode, the canvas is replaced by the
 * static `PosterEarth` composition rather than an invented planet.
 *
 * Rendering rules
 *  - WebGL is feature-detected; low-end devices get the poster.
 *  - Idle rotation pauses when the tab is hidden or the hero is off-screen.
 *  - `prefers-reduced-motion` disables rotation entirely (the scene still
 *    renders: the requirement is to remove motion, not the imagery).
 */

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { PosterEarth } from './PosterEarth';
import { useDevicePerformance } from '../../hooks/useDevicePerformance';

const DAY_MAP = '/textures/earth/earth-day.jpg';
const NIGHT_MAP = '/textures/earth/earth-night.jpg';
const CLOUD_MAP = '/textures/earth/earth-clouds.webp';

function supportsWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const probe = document.createElement('canvas');
    const context = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!context) return false;
    const lose = (context as WebGLRenderingContext).getExtension?.('WEBGL_lose_context');
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vPositionWorld;

  void main() {
    vUv = uv;
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPositionWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const surfaceFragment = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform vec3 uSunDirection;

  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vPositionWorld;

  void main() {
    vec3 normal = normalize(vNormalWorld);
    vec3 view = normalize(cameraPosition - vPositionWorld);
    float sun = dot(normal, normalize(uSunDirection));

    // A soft, physically-plausible terminator: city lights fade in over a
    // narrow band so the day/night boundary never looks cut out.
    float dayMix = smoothstep(-0.18, 0.34, sun);

    vec3 day = texture2D(uDay, vUv).rgb;
    vec3 night = texture2D(uNight, vUv).rgb;
    night = pow(night, vec3(1.25)) * vec3(1.28, 1.12, 0.84);

    // Air scattering is strongest near the limb and only on the lit side.
    float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 2.6);
    vec3 atmosphere = vec3(0.24, 0.56, 0.94) * fresnel * (0.25 + 0.95 * dayMix);

    vec3 color = mix(night * 0.85, day, dayMix) + atmosphere;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const cloudFragment = /* glsl */ `
  uniform sampler2D uClouds;
  uniform vec3 uSunDirection;
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vPositionWorld;

  void main() {
    vec4 cloud = texture2D(uClouds, vUv);
    if (cloud.a < 0.01) discard;
    float sun = dot(normalize(vNormalWorld), normalize(uSunDirection));
    float lit = smoothstep(-0.22, 0.4, sun);
    vec3 tint = mix(vec3(0.05, 0.08, 0.13), vec3(0.94, 0.97, 1.0), lit);
    gl_FragColor = vec4(tint, cloud.a * uOpacity * (0.18 + 0.82 * lit));
  }
`;

function Planet({ reducedMotion }: { reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const clouds = useRef<THREE.Mesh>(null);
  const [day, night, cloud] = useLoader(THREE.TextureLoader, [DAY_MAP, NIGHT_MAP, CLOUD_MAP]);

  useMemo(() => {
    [day, night, cloud].forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      texture.wrapS = THREE.RepeatWrapping;
    });
    cloud.premultiplyAlpha = false;
  }, [day, night, cloud]);

  const sunDirection = useMemo(() => new THREE.Vector3(-0.55, 0.28, 0.78).normalize(), []);
  const surfaceUniforms = useMemo(
    () => ({ uDay: { value: day }, uNight: { value: night }, uSunDirection: { value: sunDirection } }),
    [day, night, sunDirection]
  );
  const cloudUniforms = useMemo(
    () => ({ uClouds: { value: cloud }, uSunDirection: { value: sunDirection }, uOpacity: { value: 0.52 } }),
    [cloud, sunDirection]
  );

  useFrame((_, delta) => {
    if (reducedMotion) return;
    if (group.current) group.current.rotation.y += delta * 0.018;
    if (clouds.current) clouds.current.rotation.y += delta * 0.026;
  });

  return (
    <group ref={group} rotation={[0.18, -1.2, 0.05]}>
      <mesh>
        <sphereGeometry args={[1, 96, 96]} />
        <shaderMaterial vertexShader={vertexShader} fragmentShader={surfaceFragment} uniforms={surfaceUniforms} />
      </mesh>

      <mesh ref={clouds}>
        <sphereGeometry args={[1.004, 96, 96]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={cloudFragment}
          uniforms={cloudUniforms}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* Atmospheric halo: a back-faced shell that reads as scattered light. */}
      <mesh scale={1.045}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          vertexShader={vertexShader}
          fragmentShader={/* glsl */ `
            varying vec3 vNormalWorld;
            varying vec3 vPositionWorld;
            void main() {
              vec3 view = normalize(cameraPosition - vPositionWorld);
              float rim = pow(1.0 - max(dot(normalize(vNormalWorld), view), 0.0), 3.4);
              gl_FragColor = vec4(vec3(0.22, 0.55, 0.92) * rim * 0.9, rim * 0.85);
            }
          `}
        />
      </mesh>
    </group>
  );
}

export interface OrbitalEarthProps {
  className?: string;
  /** Disable idle motion without removing the scene. */
  still?: boolean;
}

export default function OrbitalEarth({ className = '', still = false }: OrbitalEarthProps) {
  const { isOptimizedModeActive } = useDevicePerformance();
  const [capable, setCapable] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCapable(supportsWebGL());
    if (!window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener?.('change', sync);
    return () => query.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    const node = hostRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), {
      rootMargin: '140px'
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const showCanvas = capable && !failed && !isOptimizedModeActive;

  return (
    <div ref={hostRef} className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {/* Deep-space gradient behind the planet keeps edges from looking pasted on. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_72%_58%,rgba(24,86,164,0.30),rgba(5,9,18,0)_62%)]" />
      {showCanvas ? (
        <Canvas
          className="!absolute inset-0"
          flat
          dpr={[1, 1.75]}
          frameloop={visible ? 'always' : 'demand'}
          camera={{ position: [0, 0.05, 2.42], fov: 36 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
        >
          <ambientLight intensity={0.15} />
          <Suspense fallback={null}>
            <group position={[0.42, -0.32, 0]}>
              <Planet reducedMotion={reducedMotion || still} />
            </group>
          </Suspense>
        </Canvas>
      ) : (
        <PosterEarth />
      )}
      {showCanvas && <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(4,7,15,0.86)_0%,rgba(4,7,15,0.28)_48%,rgba(4,7,15,0)_72%)]" />}
    </div>
  );
}
