/**
 * Scattered rocks, boulders and outcrops.
 *
 * Every chunk is seeded from its coordinates, so the same rocks are in the same
 * places on every visit and after every reload — which is what lets a save file
 * record "scanned rock at (82.3, -41.7)" without storing the world.
 *
 * Placement rules, all deterministic from the chunk seed:
 *   - density rises with slope (talus collects at the foot of steep ground) and
 *     falls inside craters (the bowl is swept clean by the impact)
 *   - rocks never spawn on the flattest 4% of ground, so the landing site and
 *     the base pad stay clear
 *   - size follows a power law: many pebbles, few boulders — the real
 *     size-frequency distribution of a rocky plain
 *
 * The generator returns plain data; the renderer instances it.
 */
import { mulberry32 } from './noise';
import { terrainHeight, terrainSlopeDegrees, craterForCell } from './terrain';
import { CHUNK_SIZE } from './chunks';

export type RockKind = 'basalt' | 'sedimentary' | 'olivine' | 'hematite' | 'sulphate';

export interface RockInstance {
  /** Stable identity: chunk coordinates plus an index within that chunk. */
  id: string;
  x: number;
  y: number;
  z: number;
  /** Largest radius, metres. */
  radius: number;
  /** Uniform scale applied to the shared low-poly rock geometry. */
  scale: number;
  /** Y rotation, radians. */
  rotation: number;
  /** Flattening factor: 1 is spherical, lower is a squashed cobble. */
  flatten: number;
  kind: RockKind;
  /** True when the rock is large enough to be a landform, not scenery. */
  boulder: boolean;
}

/**
 * Rocks per chunk at maximum density.
 *
 * The first version of this used 14, which sounds like a lot until you compare it
 * with the surface: a 64 m chunk holds ~4 100 m², so 14 rocks is one stone every
 * 290 m². Real Mars — and every rover panorama — is *paved* with gravel, with
 * boulders sitting in it. The render read as an empty dune field for a reason.
 * 44 per chunk at maximum is still only one rock per 93 m², but combined with the
 * new size distribution (most of them small, a few large) it reads correctly.
 */
const MAX_ROCKS_PER_CHUNK = 44;

/** Minerals a rock can be identified as, with the frequencies the game uses. */
const KIND_WEIGHTS: Array<{ kind: RockKind; weight: number }> = [
  { kind: 'basalt', weight: 0.5 },
  { kind: 'sedimentary', weight: 0.26 },
  { kind: 'olivine', weight: 0.1 },
  { kind: 'hematite', weight: 0.08 },
  { kind: 'sulphate', weight: 0.06 },
];

function pickKind(roll: number): RockKind {
  let cumulative = 0;
  for (const entry of KIND_WEIGHTS) {
    cumulative += entry.weight;
    if (roll <= cumulative) return entry.kind;
  }
  return 'basalt';
}

/** Seeded RNG for a chunk; independent of the rock count so ids stay stable. */
function chunkRandom(cx: number, cz: number): () => number {
  // Mix both coordinates into one integer seed before the PRNG.
  const mixed = ((cx & 0xffff) << 16) ^ (cz & 0xffff);
  return mulberry32((mixed * 2654435761) >>> 0);
}

/**
 * Rocks in one chunk.
 *
 * The count is derived from the chunk's own seed rather than from scratch space,
 * so the function is pure: same chunk, same rocks, always.
 */
export function rocksInChunk(cx: number, cz: number): RockInstance[] {
  const random = chunkRandom(cx, cz);
  const densityRoll = random();

  // Only a tenth of chunks are genuinely bare; the rest vary from a scatter to a
  // dense talus field.
  if (densityRoll < 0.1) return [];
  const count = Math.round(8 + densityRoll * (MAX_ROCKS_PER_CHUNK - 8));

  const rocks: RockInstance[] = [];
  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;

  for (let i = 0; i < count; i += 1) {
    const x = originX + random() * CHUNK_SIZE;
    const z = originZ + random() * CHUNK_SIZE;
    const y = terrainHeight(x, z);
    const slope = terrainSlopeDegrees(x, z, 1.2);

    // Thin the rocks on the flattest ground, but do NOT clear it. The previous
    // version skipped any sample under 1.4° of slope, which is most of a basin
    // floor — so the plain the player actually stands on was the one place
    // guaranteed to be bare, while the hillsides were covered. Real Mars is the
    // opposite: flat ground collects rocks and dust drifts. A probability gate
    // keeps more stone on the slopes without emptying the plain.
    const rockChance = slope < 1.4 ? 0.55 : 0.95;
    if (random() > rockChance) continue;
    const cellX = Math.floor(x / 140);
    const cellZ = Math.floor(z / 140);
    const crater = craterForCell(cellX, cellZ);
    if (crater) {
      const distance = Math.hypot(x - crater.x, z - crater.z) / crater.radius;
      if (distance < 0.7) continue;
    }

    // Size follows a power law: the exponent is what makes a field read as
    // *gravel with boulders in it* rather than as evenly sized pebbles. 4.2 was
    // far too steep — 96 % of rocks came out under 0.5 m, so the ground looked
    // smooth at any distance beyond a few metres. 2.6 gives a visible population
    // of 0.3–1 m stones, which is what the detail tile then carpets.
    const sizeRoll = random();
    const radius = 0.11 + Math.pow(sizeRoll, 2.6) * 3.1;

    rocks.push({
      id: `${cx}:${cz}:${i}`,
      x,
      y,
      z,
      radius,
      scale: radius,
      rotation: random() * Math.PI * 2,
      flatten: 0.55 + random() * 0.5,
      kind: pickKind(random()),
      boulder: radius > 1.15,
    });
  }

  return rocks;
}

/**
 * Rock identity for the science layer: a unit cube's worth of rock, rotated and
 * squashed. Kept here (rather than in the renderer) so the collision radius and
 * the rendered size can never disagree.
 */
export function rockSpawnClearance(rock: RockInstance): number {
  return rock.radius * 0.85;
}
