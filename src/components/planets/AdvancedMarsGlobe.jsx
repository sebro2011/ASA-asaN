'use client';

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Custom Vertex Shader for Atmospheric Glow Haze
const AtmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Custom Fragment Shader for Atmospheric Glow Haze
const AtmosphereFragmentShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform vec3 uColor;
  uniform float uCoefficient;
  uniform float uPower;

  void main() {
    vec3 viewDir = normalize(-vPosition);
    float intensity = pow(uCoefficient - dot(vNormal, viewDir), uPower);
    gl_FragColor = vec4(uColor, intensity * 0.85);
  }
`;

/**
 * AdvancedMarsGlobe Component
 * Production-ready 3D Mars globe with custom GLSL atmospheric glow shader,
 * Day/Night illumination, and procedural terrain bump detailing.
 */
export function AdvancedMarsGlobe({ 
  radius = 2.4, 
  rotationSpeed = 0.003,
  showAtmosphere = true,
  atmosphereColor = '#f97316' // Mars Orange Haze
}) {
  const marsRef = useRef();
  const atmosphereRef = useRef();

  // Procedural Canvas Textures for Mars Albedo & Normal Relief (Keyless & 100% Client-Side)
  const { marsTexture, bumpTexture } = useMemo(() => {
    // 1. Mars Albedo Surface Map
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base Rust Red / Orange Gradient
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
    marsTex.wrapS = THREE.RepeatWrapping;
    marsTex.wrapT = THREE.ClampToEdgeWrapping;

    // 2. Normal / Bump Height Map
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 512;
    bumpCanvas.height = 256;
    const bCtx = bumpCanvas.getContext('2d');
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

    return { marsTexture: marsTex, bumpTexture: bumpTex };
  }, []);

  // Atmospheric Glow Shader Material
  const atmosphereMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: AtmosphereVertexShader,
      fragmentShader: AtmosphereFragmentShader,
      uniforms: {
        uColor: { value: new THREE.Color(atmosphereColor) },
        uCoefficient: { value: 0.82 },
        uPower: { value: 2.8 }
      },
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false
    });
  }, [atmosphereColor]);

  useFrame((_, delta) => {
    if (marsRef.current) {
      marsRef.current.rotation.y += rotationSpeed * delta * 60;
    }
    if (atmosphereRef.current) {
      atmosphereRef.current.rotation.y += (rotationSpeed * 0.9) * delta * 60;
    }
  });

  return (
    <group>
      {/* Planetary Sphere with Day/Night Diffuse + Bump Lighting */}
      <mesh ref={marsRef}>
        <sphereGeometry args={[radius, 64, 64]} />
        <meshStandardMaterial
          map={marsTexture}
          bumpMap={bumpTexture}
          bumpScale={0.06}
          roughness={0.78}
          metalness={0.12}
        />
      </mesh>

      {/* Atmospheric Glow Haze Layer */}
      {showAtmosphere && (
        <mesh ref={atmosphereRef} scale={[1.16, 1.16, 1.16]}>
          <sphereGeometry args={[radius, 48, 48]} />
          <primitive object={atmosphereMaterial} attach="material" />
        </mesh>
      )}
    </group>
  );
}

export default AdvancedMarsGlobe;
