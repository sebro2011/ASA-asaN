'use client';

import React, { useRef, Component } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * FallbackPlanet Component
 * 
 * Styled glowing Mesh Sphere with Wireframe and translucent atmospheric halo.
 * Renders automatically as a 3D fallback if any GLB model fails to load, returns a 404,
 * or suffers network latency.
 */
export function FallbackPlanet({ 
  radius = 2.4, 
  color = '#38bdf8', 
  haloColor = '#0284c7', 
  autoRotate = true,
  wireframe = true
}) {
  const meshRef = useRef();
  const haloRef = useRef();

  useFrame((_, delta) => {
    if (autoRotate && meshRef.current) {
      meshRef.current.rotation.y += delta * 0.4;
      meshRef.current.rotation.x += delta * 0.15;
    }
    if (haloRef.current) {
      haloRef.current.rotation.y -= delta * 0.2;
    }
  });

  return (
    <group>
      {/* Core Glowing Wireframe Mesh Sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.35}
          wireframe={wireframe}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Inner Solid Core for depth */}
      <mesh>
        <sphereGeometry args={[radius * 0.82, 24, 24]} />
        <meshStandardMaterial
          color="#0f172a"
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>

      {/* Outer Atmospheric Glow Halo */}
      <mesh ref={haloRef}>
        <sphereGeometry args={[radius * 1.15, 32, 32]} />
        <meshBasicMaterial
          color={haloColor}
          transparent
          opacity={0.25}
          wireframe={true}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * ModelErrorBoundary Class
 * 
 * React Error Boundary that catches 3D GLTF/GLB network 404 errors or rendering crashes
 * and renders FallbackPlanet safely.
 */
export class ModelErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.warn('3D Model Loading Error caught by ModelErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return <FallbackPlanet radius={this.props.radius || 2.4} color="#0ea5e9" wireframe={true} />;
    }

    return this.props.children;
  }
}

export default FallbackPlanet;
