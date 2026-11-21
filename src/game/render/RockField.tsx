/**
 * Rocks, rendered with instancing.
 *
 * A single low-poly geometry (20 triangles: a distorted icosahedron) is drawn
 * once per chunk per rock *kind*, so a talus field of 60 boulders costs a handful
 * of draw calls instead of 60. Rocks are the most numerous object in the world and
 * the least individually important, which is exactly the case instancing exists
 * for.
 *
 * The rocks in the streamed chunk ring are collected and grouped by kind; the
 * groups are rebuilt when the ring changes (every 64 m), not per frame.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { rocksInChunk, type RockInstance, type RockKind } from '../world/rocks';

/**
 * Rock colours.
 *
 * These are **sRGB picker values**, and three.js converts them to linear before
 * lighting — a squaring, roughly. `#4a3a30` therefore reaches the shader as an
 * albedo of 0.07, not the 0.29 the hex suggests, and no amount of fill light makes
 * a 0.07 albedo read as stone. The whole set was authored as if it were linear.
 *
 * The values below are the sRGB that *linearises* to the intended albedo: a basalt
 * stone of ~0.17 linear (which is what a dark silicate actually is) needs to be
 * near `#6f6055` in sRGB. Cross-checked against Mars Hand Lens Imager frames,
 * where the same basalt appears mid-grey-brown on a bright dust background.
 */
const ROCK_COLORS: Record<RockKind, string> = {
  basalt: '#6f6055',
  sedimentary: '#a8846a',
  olivine: '#75805e',
  hematite: '#96605a',
  sulphate: '#c3b3a0',
};

/**
 * A stone.
 *
 * Detail 1 (80 faces) rather than 0 (20). At detail 0 an instanced rock is a
 * spiky tetrahedral blob: from ten metres it reads as a floating triangle rather
 * than a stone, and with the new density the field is dense enough that the flaw
 * is everywhere on screen. 80 faces × ~40 rocks per chunk, all in a single
 * instanced draw, is still trivially cheap — the *count* of draw calls is what
 * matters, and instancing means this costs four calls for the whole world.
 *
 * The distortion is applied per *direction* rather than per vertex index. An
 * icosahedron's vertices are shared between faces, so jittering by index splits
 * coincident vertices and tears the surface into the detached shards that showed
 * up on screen. Deriving the displacement from the normalised direction means
 * vertices that share a position always receive the same offset.
 */
function buildRockGeometry(seedOffset: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(0.5, 1);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;

  const displace = (x: number, y: number, z: number): number => {
    // Hash the *quantised direction*: coincident vertices hash identically.
    const qx = Math.round((x / 0.5) * 4096);
    const qy = Math.round((y / 0.5) * 4096);
    const qz = Math.round((z / 0.5) * 4096);
    let h = (qx * 374761393 + qy * 668265263 + qz * 1274126177 + seedOffset * 2654435761) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return 0.78 + ((h >>> 0) / 4294967296) * 0.44;
  };

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const jitter = displace(x, y, z);
    // No extra Y squash here. `rock.flatten` (mean 0.80) already shapes each
    // instance, and multiplying by a second constant on top of it turned every
    // stone into a pancake about 70 % as tall as it was wide — which is why they
    // read as flat plates lying on the sand rather than as rock.
    position.setXYZ(i, x * jitter, y * jitter, z * jitter);
  }

  position.needsUpdate = true;
  // Smooth normals, not flat. An icosahedron at detail 1 has 80 facets, and each
  // one on a 1 m stone is a plate roughly 15 cm across: flat shading turns that
  // into a hard chevron pattern of near-black and near-white triangles that reads
  // as a folded paper shape. Real stones of this size are rounded at their
  // convexities. The displacement still gives an irregular silhouette, which is
  // what carries the "rock" reading at any distance.
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

interface RockGroup {
  kind: RockKind;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  instances: RockInstance[];
}

/** Groups rocks by kind, preserving the stable order of the input. */
function groupByKind(rocks: RockInstance[]): Map<RockKind, RockInstance[]> {
  const groups = new Map<RockKind, RockInstance[]>();
  for (const rock of rocks) {
    const list = groups.get(rock.kind) ?? [];
    list.push(rock);
    groups.set(rock.kind, list);
  }
  return groups;
}

const KINDS: RockKind[] = ['basalt', 'sedimentary', 'olivine', 'hematite', 'sulphate'];

export interface RockFieldProps {
  chunks: Array<{ cx: number; cz: number }>;
  /** Called with every rock currently visible, for the interaction system. */
  onRocksChange?: (rocks: RockInstance[]) => void;
}

export function RockField({ chunks, onRocksChange }: RockFieldProps) {
  const rocks = useMemo(() => {
    const all: RockInstance[] = [];
    for (const chunk of chunks) all.push(...rocksInChunk(chunk.cx, chunk.cz));
    return all;
  }, [chunks]);

  const groups = useMemo<RockGroup[]>(() => {
    const byKind = groupByKind(rocks);
    return KINDS.flatMap((kind, index) => {
      const instances = byKind.get(kind);
      if (!instances || instances.length === 0) return [];
      return [
        {
          kind,
          geometry: buildRockGeometry(index * 977),
          material: new THREE.MeshStandardMaterial({
            color: new THREE.Color(ROCK_COLORS[kind]),
            roughness: 0.92,
            metalness: 0.04,
            flatShading: false,
          }),
          instances,
        },
      ];
    });
  }, [rocks]);

  // Notify the interaction layer once per ring rebuild, not per frame.
  useEffect(() => {
    onRocksChange?.(rocks);
  }, [rocks, onRocksChange]);

  // Instance transforms are computed once per group, in a layout effect, so the
  // matrices exist before the first frame rather than popping in on frame two.
  useEffect(() => {
    for (const group of groups) {
      group.geometry.userData.instanceCount = group.instances.length;
    }
  }, [groups]);

  useEffect(
    () => () => {
      for (const group of groups) {
        group.geometry.dispose();
        group.material.dispose();
      }
    },
    [groups],
  );

  return (
    <group>
      {groups.map((group) => (
        <instancedMesh
          key={group.kind}
          args={[group.geometry, group.material, group.instances.length]}
          // Frustum culling ON: the bounding sphere is computed after the
          // instance matrices are written, so the whole field culls as one object
          // when the player looks away from it.
          frustumCulled
          // Rocks cast into the small sun-shadow box; the instanced draw means
          // this is one extra draw call per rock kind, not one per rock.
          castShadow
          receiveShadow={false}
          ref={(mesh) => {
            if (!mesh) return;
            const matrix = new THREE.Matrix4();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            const position = new THREE.Vector3();
            const up = new THREE.Vector3(0, 1, 0);

            group.instances.forEach((rock, index) => {
              // Seat the stone *in* the ground, not on it: a flattened rock sunk by
              // a quarter of its radius reads as embedded, which is what nearly
              // every rock in a rover panorama looks like.
              position.set(rock.x, rock.y - rock.radius * 0.34, rock.z);
              rotation.setFromAxisAngle(up, rock.rotation);
              // Radius is the *diameter* of the geometry (it is built at 0.5), so
              // a scale of 2·radius gives the intended size.
              scale.set(rock.scale * 2, rock.scale * 2 * rock.flatten, rock.scale * 2);
              matrix.compose(position, rotation, scale);
              mesh.setMatrixAt(index, matrix);
            });
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingSphere();
          }}
        />
      ))}
    </group>
  );
}
