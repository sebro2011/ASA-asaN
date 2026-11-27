'use client';

/**
 * SpaceEnvironment — 100% local procedural IBL lighting rig for 3D space scenes.
 *
 * Replaces remote HDRI `<Environment preset="..." />` fetches (which depended
 * on external CDNs and failed offline or under strict egress/CSP policies) with
 * procedural `<Lightformer>` emitters baked once into a lightweight cubemap
 * (`frames={1}`).
 *
 * Lighting composition:
 *  - Solar key disc (warm white) for metallic/gold specular highlights (JWST, ISS)
 *  - Earth-albedo bounce panel (atmospheric cyan) for orbital under-fill
 *  - Deep-space cosmic rim ring (cool azure) to separate dark hulls from space
 */

import React, { memo } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { useDevicePerformance } from '../../hooks/useDevicePerformance';

export interface SpaceEnvironmentProps {
  /** Overall environment reflection strength. Defaults to 0.35. */
  intensity?: number;
  /** Optional explicit cubemap resolution override; otherwise adapts to GPU tier. */
  resolution?: number;
}

export const SpaceEnvironment: React.FC<SpaceEnvironmentProps> = memo(function SpaceEnvironment({
  intensity = 0.35,
  resolution,
}) {
  const { qualityProfile } = useDevicePerformance();
  const resolvedResolution = resolution ?? qualityProfile.environmentResolution;

  if (resolvedResolution <= 0) {
    return null;
  }

  return (
    <Environment resolution={resolvedResolution} frames={1} environmentIntensity={intensity}>
      {/* Solar key disc — drives realistic reflections on gold mirrors and solar arrays */}
      <Lightformer
        form="circle"
        intensity={3.4}
        color="#fff6e5"
        position={[12, 7, 10]}
        scale={5.5}
        target={[0, 0, 0]}
      />

      {/* Planetary Earth-albedo bounce light from below */}
      <Lightformer
        form="rect"
        intensity={0.95}
        color="#5ed3f2"
        position={[-9, -6, 5]}
        scale={[12, 6, 1]}
        target={[0, 0, 0]}
      />

      {/* Deep-space azure rim ring for crisp dark-side silhouette separation */}
      <Lightformer
        form="ring"
        intensity={0.45}
        color="#4f8dff"
        position={[0, 8, -12]}
        scale={16}
        target={[0, 0, 0]}
      />

      {/* Subtle warm starlight counter-rim */}
      <Lightformer
        form="rect"
        intensity={0.22}
        color="#a7e8fa"
        position={[8, -4, -9]}
        scale={[8, 4, 1]}
        target={[0, 0, 0]}
      />
    </Environment>
  );
});

export default SpaceEnvironment;
