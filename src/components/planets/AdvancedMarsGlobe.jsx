'use client';

import React, { useEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  EARTH_VERTEX_GLSL,
  PLANET_ATMOSPHERE_FRAGMENT_GLSL,
} from '../../three/shaders';

const DEFAULT_SUN_DIR = new THREE.Vector3(10, 6, 8).normalize();

/**
 * AdvancedMarsGlobe Component
 * Production-ready 3D Mars globe with physically consistent BackSide GLSL
 * dust-limb scattering, procedural terrain bump detailing, and strict GPU cleanup.
 */
export function AdvancedMarsGlobe({
  radius = 2.4,
  rotationSpeed = 0.003,
  segments = 64,
  showAtmosphere = true,
  atmosphereColor = '#f97316',
  reducedMotion = false,
  sunDirection = DEFAULT_SUN_DIR,
}) {
  const marsRef = useRef();
  const atmosphereRef = useRef();

  // Procedural Canvas Textures for Mars Albedo & Normal Relief (Keyless & 100% Client-Side)
  const { marsTexture, bumpTexture } = useMemo(() => {
    if (typeof document === 'undefined') {
      return { marsTexture: null, bumpTexture: null };
    }

    // 1. Mars Albedo Surface Map
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { marsTexture: null, bumpTexture: null };

    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, '#7f1d1d');
    gradient.addColorStop(0.25, '#c2410c');
    gradient.addColorStop(0.5, '#ea580c');
    gradient.addColorStop(0.75, '#9a3412');
    gradient.addColorStop(1, '#431407');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, 512);

    // Procedural Craters & Dark Basaltic Plains (Syrtis Major & Valles Marineris)
    ctx.fillStyle = '#451a03';
    for (let i = 0; i < 70; i++) {
      const x = Math.sin(i * 99) * 400 + 512;
      const y = Math.cos(i * 33) * 180 + 256;
      const r = (Math.sin(i) + 1.5) * 22;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 2.2, r, i, 0, Math.PI * 2);
      ctx.fill();
    }

    // Polar Ice Caps (White CO2 / H2O Frost)
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.ellipse(512, 18, 280, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(512, 494, 220, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    const marsTex = new THREE.CanvasTexture(canvas);
    marsTex.colorSpace = THREE.SRGBColorSpace;
    marsTex.wrapS = THREE.RepeatWrapping;
    marsTex.wrapT = THREE.ClampToEdgeWrapping;

    // 2. Normal / Bump Height Map
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 512;
    bumpCanvas.height = 256;
    const bCtx = bumpCanvas.getContext('2d');
    if (!bCtx) {
      marsTex.dispose();
      return { marsTexture: null, bumpTexture: null };
    }
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, 512, 256);

    bCtx.fillStyle = '#ffffff';
    for (let i = 0; i < 120; i++) {
      const x = Math.sin(i * 45) * 200 + 256;
      const y = Math.cos(i * 77) * 90 + 128;
      const r = (Math.sin(i) + 1.2) * 8;
      bCtx.beginPath();
      bCtx.arc(x, y, r, 0, Math.PI * 2);
      bCtx.fill();
    }
    const bumpTex = new THREE.CanvasTexture(bumpCanvas);
    bumpTex.wrapS = THREE.RepeatWrapping;
    bumpTex.wrapT = THREE.ClampToEdgeWrapping;

    return { marsTexture: marsTex, bumpTexture: bumpTex };
  }, []);

  // Verified BackSide inward-normal Fresnel & sun-wrap dust atmosphere shader
  const atmosphereMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: EARTH_VERTEX_GLSL,
      fragmentShader: PLANET_ATMOSPHERE_FRAGMENT_GLSL,
      uniforms: {
        uSunDirection: { value: sunDirection.clone() },
        uDayColor: { value: new THREE.Color(atmosphereColor) },
        uRimColor: { value: new THREE.Color('#fdba74') },
        uPower: { value: 3.1 },
        uIntensity: { value: 0.92 },
      },
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
  }, [atmosphereColor, sunDirection]);

  useEffect(() => {
    return () => {
      marsTexture?.dispose();
      bumpTexture?.dispose();
    };
  }, [marsTexture, bumpTexture]);

  useEffect(() => {
    return () => {
      atmosphereMaterial.dispose();
    };
  }, [atmosphereMaterial]);

  useFrame((_, rawDelta) => {
    if (reducedMotion) return;
    const delta = Math.min(rawDelta, 0.1);
    if (marsRef.current) {
      marsRef.current.rotation.y += rotationSpeed * delta * 60;
    }
    if (atmosphereRef.current) {
      atmosphereRef.current.rotation.y += rotationSpeed * 0.9 * delta * 60;
    }
  });

  return (
    <group>
      {/* Planetary Sphere with Day/Night Diffuse + Bump Lighting */}
      <mesh ref={marsRef}>
        <sphereGeometry args={[radius, segments, segments]} />
        <meshStandardMaterial
          map={marsTexture}
          bumpMap={bumpTexture}
          bumpScale={0.06}
          roughness={0.82}
          metalness={0.08}
        />
      </mesh>

      {/* Atmospheric Dust Limb Layer */}
      {showAtmosphere && (
        <mesh ref={atmosphereRef} scale={[1.08, 1.08, 1.08]}>
          <sphereGeometry args={[radius, Math.max(32, Math.floor(segments * 0.75)), Math.max(32, Math.floor(segments * 0.75))]} />
          <primitive object={atmosphereMaterial} attach="material" />
        </mesh>
      )}
    </group>
  );
}

export default AdvancedMarsGlobe;
