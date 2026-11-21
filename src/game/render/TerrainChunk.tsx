/**
 * One streamed terrain tile.
 *
 * The chunk's typed arrays are built once on mount and disposed on unmount. The
 * mesh is positioned at the chunk origin with vertices local to it, which keeps
 * float precision acceptable far from the world origin (a single 10 km-spanning
 * mesh would jitter visibly in a 32-bit float once the camera is a few km out).
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { buildChunkGeometry, CHUNK_SIZE } from '../world/chunks';
import type { TerrainMaterial } from './TerrainMaterial';

export interface TerrainChunkProps {
  cx: number;
  cz: number;
  resolution: number;
  material: TerrainMaterial;
  receiveShadow?: boolean;
  /** Receives the geometry's height range so the streaming layer can cache it. */
  onBuilt?: (cx: number, cz: number, minY: number, maxY: number) => void;
}

export function TerrainChunk({ cx, cz, resolution, material, receiveShadow = false, onBuilt }: TerrainChunkProps) {
  const geometry = useMemo(() => {
    const data = buildChunkGeometry(cx, cz, resolution);

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    buffer.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    buffer.setAttribute('aSlope', new THREE.BufferAttribute(data.slopes, 1));
    buffer.setIndex(new THREE.BufferAttribute(data.indices, 1));
    buffer.computeBoundingSphere();
    buffer.computeBoundingBox();

    return { buffer, data };
  }, [cx, cz, resolution]);

  // Reporting the height range is a side effect, not part of the geometry: the
  // parent uses it for placement, and calling it inside useMemo would fire during
  // render, where a state update is illegal.
  useEffect(() => {
    onBuilt?.(cx, cz, geometry.data.minY, geometry.data.maxY);
  }, [geometry, cx, cz, onBuilt]);

  useEffect(() => () => geometry.buffer.dispose(), [geometry]);

  return (
    <mesh
      geometry={geometry.buffer}
      material={material.material}
      position={[cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE]}
      frustumCulled
      receiveShadow={receiveShadow}
      // Terrain never casts: the shadow pass would double the scene's draw calls
      // to darken ground that the dust-hazed ambient light already fills.
      castShadow={false}
    />
  );
}

/**
 * The streamed ring of terrain around the player.
 *
 * Rebuilt only when the player crosses a chunk boundary — not every frame — so a
 * walk across the planet allocates one ring per 64 m, which at running speed is
 * roughly once every eight seconds.
 */
export function TerrainField({
  chunks,
  material,
  resolutions,
  receiveShadow = false,
  onBuilt,
}: {
  chunks: Array<{ cx: number; cz: number }>;
  material: TerrainMaterial;
  resolutions: Map<string, number>;
  receiveShadow?: boolean;
  onBuilt?: (cx: number, cz: number, minY: number, maxY: number) => void;
}) {
  return (
    <group>
      {chunks.map((chunk) => (
        <TerrainChunk
          key={`${chunk.cx}:${chunk.cz}`}
          cx={chunk.cx}
          cz={chunk.cz}
          resolution={resolutions.get(`${chunk.cx}:${chunk.cz}`) ?? 17}
          material={material}
          receiveShadow={receiveShadow}
          onBuilt={onBuilt}
        />
      ))}
    </group>
  );
}
