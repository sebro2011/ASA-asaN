'use client';

import React, { useEffect, useMemo, useRef, memo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Stellar spectral colors (O/B Blue-White, A Pure White, G Yellow-White, K Orange, M Reddish)
 */
const SPECTRAL_COLORS = [
  new THREE.Color('#93c5fd'), // Blue-white
  new THREE.Color('#bfdbfe'), // Light blue
  new THREE.Color('#ffffff'), // White
  new THREE.Color('#fef08a'), // Yellow-white
  new THREE.Color('#fed7aa'), // Light orange
  new THREE.Color('#fda4af'), // Reddish-pink
];

function createSeededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STARFIELD_VERTEX_SHADER = `
  attribute float size;
  attribute vec3 customColor;
  attribute float twinkleSpeed;
  attribute float phase;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uMotionScale;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = customColor;

    float wave = sin(uTime * twinkleSpeed + phase) * 0.32 + 0.68;
    vAlpha = mix(0.88, wave, uMotionScale);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float dist = max(-mvPosition.z, 1.0);
    gl_PointSize = clamp(size * uPixelRatio * (190.0 / dist) * (0.82 + 0.28 * vAlpha), 1.0, 6.5);
  }
`;

const STARFIELD_FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float distSq = dot(coord, coord);
    if (distSq > 0.25) discard;

    float core = exp(-distSq * 24.0);
    float halo = smoothstep(0.25, 0.02, distSq) * 0.48;
    float glow = clamp(core + halo, 0.0, 1.0);
    gl_FragColor = vec4(vColor * (0.88 + 0.42 * core), vAlpha * glow);
  }
`;

/**
 * DynamicStarfield — Deterministic GPU Points starfield with explicit resource
 * disposal and `prefers-reduced-motion` support.
 */
function DynamicStarfield({
  count = 4800,
  minRadius = 80,
  maxRadius = 380,
  driftSpeed = 0.006,
  reducedMotion = false,
}) {
  const pointsRef = useRef(null);
  const { gl } = useThree();

  const { geometry, material } = useMemo(() => {
    const safeCount = Math.max(0, Math.floor(count));
    const rng = createSeededRng(20261126 + safeCount);
    const pos = new Float32Array(safeCount * 3);
    const sz = new Float32Array(safeCount);
    const col = new Float32Array(safeCount * 3);
    const speeds = new Float32Array(safeCount);
    const ph = new Float32Array(safeCount);

    for (let i = 0; i < safeCount; i += 1) {
      const u = rng();
      const v = rng();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = minRadius + Math.cbrt(rng()) * (maxRadius - minRadius);

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      const sizeRandom = rng();
      let starSize = 1.1;
      if (sizeRandom > 0.985) {
        starSize = 3.8 + rng() * 2.0;
      } else if (sizeRandom > 0.92) {
        starSize = 2.4 + rng() * 1.2;
      } else if (sizeRandom > 0.7) {
        starSize = 1.6 + rng() * 0.7;
      } else {
        starSize = 0.95 + rng() * 0.55;
      }
      sz[i] = starSize;

      const chosenColor = SPECTRAL_COLORS[Math.floor(rng() * SPECTRAL_COLORS.length)];
      col[i * 3] = chosenColor.r;
      col[i * 3 + 1] = chosenColor.g;
      col[i * 3 + 2] = chosenColor.b;

      speeds[i] = 0.7 + rng() * 2.8;
      ph[i] = rng() * Math.PI * 2.0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sz, 1));
    geo.setAttribute('customColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('twinkleSpeed', new THREE.BufferAttribute(speeds, 1));
    geo.setAttribute('phase', new THREE.BufferAttribute(ph, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: STARFIELD_VERTEX_SHADER,
      fragmentShader: STARFIELD_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: gl.getPixelRatio() },
        uMotionScale: { value: reducedMotion ? 0 : 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { geometry: geo, material: mat };
  }, [count, minRadius, maxRadius, gl, reducedMotion]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    material.uniforms.uPixelRatio.value = gl.getPixelRatio();
    material.uniforms.uMotionScale.value = reducedMotion ? 0 : 1;
    if (reducedMotion) return;

    material.uniforms.uTime.value += delta;
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * driftSpeed;
      pointsRef.current.rotation.x += delta * (driftSpeed * 0.3);
    }
  });

  if (count <= 0) return null;

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />;
}

export default memo(DynamicStarfield);
