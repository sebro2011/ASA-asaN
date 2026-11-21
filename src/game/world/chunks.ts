/**
 * Chunked terrain streaming.
 *
 * The world is continuous and unbounded, but it is only ever *built* in fixed
 * 64 m tiles around the player. A ring of tiles is added ahead of movement and
 * disposed behind it, so memory is bounded by the view radius rather than by how
 * far the player has walked.
 *
 * Geometry is generated directly into typed arrays (no `BufferGeometryUtils`, no
 * merge pass) and the renderer instances one mesh per chunk. Each chunk carries
 * three levels of detail; a tile picks its level from its distance to the camera,
 * and the seam between levels is hidden by the fact that all three levels sample
 * the same height function — a crack can open between them, but the ground is
 * never in a different place than the collision at that point.
 *
 * The generator is pure: `buildChunkGeometry(cx, cz, resolution)` returns arrays
 * and touches no Three.js object, which is what makes it testable in Node.
 */
import { terrainHeight } from './terrain';

/** Edge length of a chunk, in metres. */
export const CHUNK_SIZE = 64;

/**
 * Vertex counts per edge for each level of detail.
 *
 * At `CHUNK_SIZE = 64`, 65 vertices is ~1 m spacing and 33 is 2 m. The difference
 * is not cosmetic: terrain detail below the vertex spacing is simply not drawn, so
 * the 2 m grid flattened every ripple and made the surface read as moulded clay
 * regardless of how good the shader was. The nearest ring now uses 1 m spacing
 * (8 192 triangles per chunk, still trivial for a 2016-era GPU at ~25 chunks);
 * the far bands drop back to 2 m and 8 m, where the screen-space size of a 1 m
 * feature is under a pixel anyway.
 */
export const LOD_RESOLUTION = {
  high: 65,
  medium: 33,
  low: 9,
} as const;

export type LodLevel = keyof typeof LOD_RESOLUTION;

export interface ChunkIndices {
  cx: number;
  cz: number;
}

export interface ChunkGeometryData {
  cx: number;
  cz: number;
  resolution: number;
  /** Vertex positions, local to the chunk origin (x, y, z). */
  positions: Float32Array;
  /** Vertex normals. */
  normals: Float32Array;
  /** Per-vertex slope in degrees, packed for the shader and the science layer. */
  slopes: Float32Array;
  /** Triangle indices (Uint32 so 33×33 grids are addressed safely). */
  indices: Uint32Array;
  /** World-space minimum and maximum height, for culling and placement. */
  minY: number;
  maxY: number;
}

/** The chunk that contains a world position. */
export function chunkOf(x: number, z: number): ChunkIndices {
  return { cx: Math.floor(x / CHUNK_SIZE), cz: Math.floor(z / CHUNK_SIZE) };
}

/**
 * Level of detail for a chunk, given the camera distance to its *centre*.
 *
 * Thresholds are in metres and assume a 64 m chunk. The high band covers the
 * ground the player can see in detail; medium fills the mid-field where dune
 * shapes still read; low is the horizon, where a 9×9 grid is indistinguishable
 * from a 33×33 one at 200 m under a dusty sky.
 */
/**
 * LOD bands, metres.
 *
 * The high band is deliberately *narrow* — roughly the chunk under the player plus
 * its immediate neighbours. At 1 m vertex spacing a chunk is 8 192 triangles, so
 * extending the band to 92 m (as it was) put eleven chunks at high LOD and blew the
 * tablet budget for detail the player cannot resolve anyway: at 60 m, a 1 m vertical
 * ripple subtends about 1.5° of screen, which the medium LOD's 2 m grid still
 * represents. Concentration, not generosity, is what keeps this affordable.
 */
export function lodForDistance(distance: number): LodLevel {
  if (distance < 46) return 'high';
  if (distance < 150) return 'medium';
  return 'low';
}

/** Resolution that the terrain uses for a given distance. */
export function resolutionForDistance(distance: number): number {
  return LOD_RESOLUTION[lodForDistance(distance)];
}

/**
 * The chunk ring around a player, ordered nearest-first.
 *
 * `radius` counts chunks, so radius 3 is an 7×7 block — 49 to 98 meshes depending
 * on level of detail, which is deliberately modest for a tablet.
 */
export function chunksAround(x: number, z: number, radius: number): ChunkIndices[] {
  const origin = chunkOf(x, z);
  const out: ChunkIndices[] = [];
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      out.push({ cx: origin.cx + dx, cz: origin.cz + dz });
    }
  }
  out.sort((a, b) => {
    const da = (a.cx - origin.cx) ** 2 + (a.cz - origin.cz) ** 2;
    const db = (b.cx - origin.cx) ** 2 + (b.cz - origin.cz) ** 2;
    return da - db;
  });
  return out;
}

/** Distance from a point to the centre of a chunk. */
export function distanceToChunk(x: number, z: number, cx: number, cz: number): number {
  const centreX = (cx + 0.5) * CHUNK_SIZE;
  const centreZ = (cz + 0.5) * CHUNK_SIZE;
  return Math.hypot(x - centreX, z - centreZ);
}

/**
 * Builds one chunk's geometry.
 *
 * Normals come from central differences over the sampled height grid, not from
 * the triangle cross product: a per-triangle normal gives faceted shading on the
 * dunes, while a per-vertex grid normal gives smooth shading at every level of
 * detail. The cost is that a chunk's lighting is computed at its own resolution,
 * so an LOD seam can show a soft shading step. Collision is unaffected — it
 * queries `terrainHeight()` directly, at whatever resolution it likes.
 */
export function buildChunkGeometry(cx: number, cz: number, resolution: number): ChunkGeometryData {
  const res = Math.max(2, Math.floor(resolution));
  const vertexCount = res * res;
  const step = CHUNK_SIZE / (res - 1);
  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const slopes = new Float32Array(vertexCount);
  const heights = new Float32Array(vertexCount);

  let minY = Infinity;
  let maxY = -Infinity;

  // One terrain sample per vertex. Normals are then derived from this grid
  // rather than from four more analytic samples per vertex, which is the single
  // biggest cost in a chunk build: 5× fewer height() calls for a shading
  // difference that is invisible at 33×33 (2 m spacing) and merely a little
  // softer at 9×9. Collision never used these normals — it uses terrainHeight().
  for (let iz = 0; iz < res; iz += 1) {
    for (let ix = 0; ix < res; ix += 1) {
      const index = iz * res + ix;
      const localX = ix * step;
      const localZ = iz * step;
      const height = terrainHeight(originX + localX, originZ + localZ);
      heights[index] = height;
      if (height < minY) minY = height;
      if (height > maxY) maxY = height;

      // Local coordinates: the mesh is positioned at (originX, 0, originZ).
      positions[index * 3] = localX;
      positions[index * 3 + 1] = height;
      positions[index * 3 + 2] = localZ;
    }
  }

  for (let iz = 0; iz < res; iz += 1) {
    for (let ix = 0; ix < res; ix += 1) {
      const index = iz * res + ix;
      const left = ix > 0 ? heights[index - 1] : heights[index];
      const right = ix < res - 1 ? heights[index + 1] : heights[index];
      const back = iz > 0 ? heights[index - res] : heights[index];
      const front = iz < res - 1 ? heights[index + res] : heights[index];

      const nx = left - right;
      const ny = 2 * step;
      const nz = back - front;
      const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

      normals[index * 3] = nx / length;
      normals[index * 3 + 1] = ny / length;
      normals[index * 3 + 2] = nz / length;

      slopes[index] = (Math.acos(Math.min(1, Math.max(0, ny / length))) * 180) / Math.PI;
    }
  }

  // Two triangles per cell. Winding is counter-clockwise seen from above, which
  // is what `FrontSide` expects for ground.
  const cells = (res - 1) * (res - 1);
  const indices = new Uint32Array(cells * 6);
  let cursor = 0;
  for (let iz = 0; iz < res - 1; iz += 1) {
    for (let ix = 0; ix < res - 1; ix += 1) {
      const a = iz * res + ix;
      const b = a + 1;
      const c = a + res;
      const d = c + 1;

      indices[cursor] = a;
      indices[cursor + 1] = c;
      indices[cursor + 2] = b;

      indices[cursor + 3] = b;
      indices[cursor + 4] = c;
      indices[cursor + 5] = d;
      cursor += 6;
    }
  }

  return {
    cx,
    cz,
    resolution: res,
    positions,
    normals,
    slopes,
    indices,
    minY: Number.isFinite(minY) ? minY : 0,
    maxY: Number.isFinite(maxY) ? maxY : 0,
  };
}

/** Approximate triangle count of a chunk, used by the performance budget test. */
export function chunkTriangleCount(resolution: number): number {
  const cells = (resolution - 1) * (resolution - 1);
  return cells * 2;
}
