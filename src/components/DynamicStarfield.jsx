'use client';

import React, { useRef, useMemo, memo } from 'react';
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
  new THREE.Color('#fda4af')  // Reddish-pink
];

/**
 * DynamicStarfield - Custom Three.js Points starfield with:
 * - Varying particle sizes (realistic stellar magnitude distribution)
 * - Custom vertex & fragment shaders for smooth circular points with soft radial glow
 * - Individual twinkle frequencies and phase offsets
 * - Slow cosmic background drift
 */
function DynamicStarfield({
  count = 9500,
  minRadius = 80,
  maxRadius = 380,
  driftSpeed = 0.008
}) {
  const pointsRef = useRef();
  const { gl } = useThree();
  const pixelRatio = gl.getPixelRatio();

  // Generate attributes for geometry
  const { positions, sizes, colors, twinkleSpeeds, phases } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    const col = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const ph = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Spherical distribution around center
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = minRadius + Math.cbrt(Math.random()) * (maxRadius - minRadius);

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      // Power law size distribution: lots of tiny stars (magnitude 5-6), few bright stars
      const sizeRandom = Math.random();
      let starSize = 1.2;
      if (sizeRandom > 0.985) {
        starSize = 4.2 + Math.random() * 2.5; // Bright prominent star
      } else if (sizeRandom > 0.92) {
        starSize = 2.8 + Math.random() * 1.4; // Medium star
      } else if (sizeRandom > 0.70) {
        starSize = 1.8 + Math.random() * 0.8;
      } else {
        starSize = 1.0 + Math.random() * 0.6; // Distant background pinprick
      }
      sz[i] = starSize;

      // Realistic stellar spectral color selection
      const colorIndex = Math.floor(Math.random() * SPECTRAL_COLORS.length);
      const chosenColor = SPECTRAL_COLORS[colorIndex];
      col[i * 3] = chosenColor.r;
      col[i * 3 + 1] = chosenColor.g;
      col[i * 3 + 2] = chosenColor.b;

      // Random twinkle frequency (0.8 Hz to 4.5 Hz) and phase
      speeds[i] = 0.8 + Math.random() * 3.7;
      ph[i] = Math.random() * Math.PI * 2.0;
    }

    return {
      positions: pos,
      sizes: sz,
      colors: col,
      twinkleSpeeds: speeds,
      phases: ph
    };
  }, [count, minRadius, maxRadius]);

  // Custom Shader Material uniforms
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uPixelRatio: { value: pixelRatio }
  }), [pixelRatio]);

  // Shader definitions
  const shader = useMemo(() => ({
    vertexShader: `
      attribute float size;
      attribute vec3 customColor;
      attribute float twinkleSpeed;
      attribute float phase;

      uniform float uTime;
      uniform float uPixelRatio;

      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vColor = customColor;

        // Subtle, asynchronous twinkling calculation
        float twinkle = sin(uTime * twinkleSpeed + phase) * 0.35 + 0.65;
        vAlpha = twinkle;

        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        // Realistic distance attenuation and point size scaling
        gl_PointSize = size * uPixelRatio * (200.0 / -mvPosition.z) * (0.8 + 0.35 * twinkle);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        // Soft circular point with smooth edge glow
        vec2 coord = gl_PointCoord - vec2(0.5);
        float dist = length(coord);
        if (dist > 0.5) discard;

        // Radial falloff for glow appearance
        float glow = smoothstep(0.5, 0.05, dist);
        gl_FragColor = vec4(vColor, vAlpha * glow);
      }
    `
  }), []);

  // Update time and slow rotation
  useFrame(({ clock }, delta) => {
    if (uniforms) {
      uniforms.uTime.value = clock.getElapsedTime();
    }
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * driftSpeed;
      pointsRef.current.rotation.x += delta * (driftSpeed * 0.3);
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={sizes.length}
          array={sizes}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-customColor"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-twinkleSpeed"
          count={twinkleSpeeds.length}
          array={twinkleSpeeds}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-phase"
          count={phases.length}
          array={phases}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        args={[shader]}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default memo(DynamicStarfield);
