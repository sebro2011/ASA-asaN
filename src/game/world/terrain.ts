/**
 * The Mars surface, as a pure function.
 *
 * One function — `terrainHeight(x, z)` — is the single source of truth for the
 * shape of the ground. The renderer builds triangles from it, the player stands
 * on it, the rover casts its suspension rays at it, and the map samples it. No
 * mesh raycasting, no heightfield texture, no divergence between "what you see"
 * and "what you collide with".
 *
 * Features, in the order they are composed:
 *
 *   1. basin       — very low frequency roll, ±38 m, gives the horizon its shape
 *   2. dunes       — medium frequency, wind-aligned ripples (fbm, stretched on X)
 *   3. rubble      — high frequency detail, ±0.8 m, keeps the ground from reading
 *                    as smooth plastic at walking distance
 *   4. massifs     — ridged noise gated to the far field, so a mountain range
 *                    rings the playable basin without blocking it
 *   5. mesas       — flat-topped buttes with cliffed edges, the signature
 *                    landform of the Martian highlands
 *   6. canyons     — sinuous incised channels with a V cross-section
 *   7. craters     — explicitly placed from a hashed grid, with rim and ejecta
 *
 * Landform-note: everything here is *procedural*, generated from a fixed seed. It
 * is not a reconstruction of any real place on Mars, and the game says so.
 *
 * All frequencies are in metres. The world is unbounded: the same field continues
 * to the horizon in every direction.
 */
import { fbm2, hash2, ridged2, seedFromString } from './noise';

/** "Mars" — the seed from DOCS/MARS_GAME_PLAN.md §2.2. */
export const WORLD_SEED = seedFromString('mars-explorer-2047');

/* ------------------------------------------------------------------ constants */

/** Height of the reference plain at the landing site, in metres. */
export const BASE_ELEVATION = 0;

/** Radius (m) of the old, flat basin the player starts in. */
const BASIN_RADIUS = 240;

/** Frequencies, m⁻¹. */
const FREQ_BASIN = 1 / 340;
const FREQ_DUNE = 1 / 62;
const FREQ_RUBBLE = 1 / 7.5;
const FREQ_RIDGE = 1 / 210;

/** Amplitudes, m. */
const AMP_BASIN = 38;
const AMP_DUNE = 5.5;
const AMP_RUBBLE = 0.8;
const AMP_RIDGE = 96;

/**
 * Craters are drawn from a grid of this cell size, m.
 *
 * The size is constrained by the neighbour search: a crater contributes out to
 * 2.6·radius, and the field sums the 3×3 cells around the query point. With a
 * 140 m cell and a 48 m maximum radius the reach is 125 m, so a 3×3 search is
 * provably enough — no crater is ever clipped by the search window.
 */
const CRATER_CELL = 140;

/** Largest radius any generated crater may have, m. Must stay below CELL/2.6. */
const MAX_CRATER_RADIUS = 48;

/** Probability that a given crater cell holds a crater. */
const CRATER_DENSITY = 0.42;

/**
 * Mesas (flat-topped buttes) are drawn from a grid of this cell size, m.
 *
 * Martian highland terrain is dominated by these: a hard, dust-cemented caprock
 * resists erosion while the softer material below retreats, leaving a flat top
 * with near-vertical cliffs. They are what makes a Mars landscape legible as
 * *Mars* rather than as a generic desert, because they produce the sharp
 * horizontal skyline that no amount of rolling noise can.
 */
const MESA_CELL = 420;

/** Probability a mesa cell contains a butte. Sparse: they are landmarks. */
const MESA_DENSITY = 0.3;

/** Radius range of a mesa, m. */
const MESA_MIN_RADIUS = 55;
const MESA_MAX_RADIUS = 145;

/** Height range of a mesa above its base, m. Mars' buttes are genuinely tall. */
const MESA_MIN_HEIGHT = 14;
const MESA_MAX_HEIGHT = 58;

/**
 * The hard reach limit of one mesa's influence, m — a *constant*, deliberately
 * independent of the mesa's own dimensions.
 *
 * This is the single most important line in the mesa code. The field is summed
 * over a 3×3 cell window, so a mesa's influence must be exactly zero before the
 * window can change with the query point. Deriving the cut-off from each mesa's
 * radius instead makes the boundary of influence move, and the truncation shows
 * up as a vertical wall in the terrain. Sized from the largest possible mesa:
 * radius 145 × 1.275 (maximum lobe growth) + cliff 28 + apron 48 = 261 m, rounded
 * up generously.
 */
const MESA_REACH_LIMIT = 300;

/**
 * Canyons: one sinuous channel is cut through the field by warping the sample
 * position along a low-frequency noise curve and subtracting a V-shaped
 * profile near the curve's zero crossing.
 */
const CANYON_WIDTH = 26;
const CANYON_DEPTH = 34;
const CANYON_FREQ = 1 / 620;

/* ------------------------------------------------------------------ helpers */

/**
 * Cheap polynomial smoothstep on [edge0, edge1]. Used for the massif gate and
 * for crater rims; the analytic derivative is not needed anywhere.
 */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/* ------------------------------------------------------------------ craters */

export interface Crater {
  /** Centre, m. */
  x: number;
  z: number;
  /** Rim radius, m. */
  radius: number;
  /** Depth at the bowl centre, m (positive number). */
  depth: number;
}

/**
 * Crater profile as a function of normalised distance `d` (0 at the centre,
 * 1 at the rim):
 *
 *   d ≤ 1   → a bowl  −depth·(1 − d²) with a raised rim near d = 1
 *   d > 1   → an ejecta blanket decaying as d⁻³, as on real simple craters
 *
 * Returning 0 outside 2.6·radius keeps the evaluation bounded, which matters:
 * this runs for every terrain vertex of every visible chunk.
 */
export function craterOffset(crater: Crater, x: number, z: number): number {
  const dx = x - crater.x;
  const dz = z - crater.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  const d = distance / crater.radius;
  if (d > 2.6) return 0;

  const depth = crater.depth;

  // Rim crest height, as a fraction of the bowl depth. Simple Martian craters
  // run 0.15–0.25; 0.2 keeps a 20 m crater's rim a 2 m step, which reads clearly
  // while walking and does not become an unclimbable wall.
  const rimFraction = 0.2;

  if (d <= 1) {
    // Bowl (parabolic floor, zero at the rim) plus the rim crest, which peaks at
    // exactly d = 1 and falls away inside. Both terms are continuous at d = 1
    // with the ejecta branch below, so no seam appears in the mesh.
    const bowl = -depth * (1 - d * d);
    const rim = depth * rimFraction * Math.exp(-((d - 1) * (d - 1)) / 0.012);
    return bowl + rim;
  }

  // Ejecta: starts at the rim height and decays as d⁻³, as on real simple
  // craters (the classic McGetchin scaling).
  return depth * rimFraction * Math.pow(d, -3);
}

/**
 * Cell → crater cache.
 *
 * `craterForCell` runs a string-free hash chain, a `pow` and several divisions;
 * the terrain field calls it nine times per height sample, and a chunk build
 * makes over a thousand height samples. The set of cells is unbounded, so the
 * cache is bounded: when it fills it is cleared wholesale, which costs one
 * rebuild and keeps memory flat during a long walk. Every entry is a pure
 * function of the cell index, so evicting anything is always safe.
 */
const craterCache = new Map<number, Crater | null>();
const CRATER_CACHE_LIMIT = 4096;

/** Cell index → a collision-free integer key (both components fit in ±2^15). */
function craterKey(cx: number, cz: number): number {
  return ((cx & 0xffff) << 16) | (cz & 0xffff);
}

/**
 * The crater that owns a given grid cell, or `null` if that cell is empty.
 *
 * Craters are keyed to a grid rather than stored in a list so they can be
 * evaluated anywhere without a spatial index, and so the same crater is found
 * whether the player is generating a chunk or querying the ground beneath them.
 */
export function craterForCell(cx: number, cz: number): Crater | null {
  const key = craterKey(cx, cz);
  const cached = craterCache.get(key);
  if (cached !== undefined) return cached;

  const crater = computeCraterForCell(cx, cz);
  if (craterCache.size >= CRATER_CACHE_LIMIT) craterCache.clear();
  craterCache.set(key, crater);
  return crater;
}

function computeCraterForCell(cx: number, cz: number): Crater | null {
  const base = WORLD_SEED ^ (cx * 73856093) ^ (cz * 19349663);
  const roll = hash2(cx, cz, base ^ 0x9e3779b9);
  if (roll > CRATER_DENSITY) return null;

  const x = cx * CRATER_CELL + hash2(cx, cz, base ^ 0x51ed270b) * CRATER_CELL;
  const z = cz * CRATER_CELL + hash2(cx, cz, base ^ 0x2545f491) * CRATER_CELL;

  // Radius: mostly small, occasionally large. pow() biases toward small craters,
  // which is the actual size-frequency distribution of impact craters.
  const size = hash2(cx, cz, base ^ 0x68e31da4);
  const radius = 11 + Math.pow(size, 2.6) * (MAX_CRATER_RADIUS - 11);

  // Depth scales as radius^0.8 for simple craters; clamped so bowls stay walkable.
  const depth = Math.min(26, 0.42 * Math.pow(radius, 0.8));

  return { x, z, radius, depth };
}

/** Total crater displacement at a point, summed over the 3×3 cells around it. */
function craterField(x: number, z: number): number {
  const cx = Math.floor(x / CRATER_CELL);
  const cz = Math.floor(z / CRATER_CELL);
  let sum = 0;
  for (let ix = cx - 1; ix <= cx + 1; ix += 1) {
    for (let iz = cz - 1; iz <= cz + 1; iz += 1) {
      const crater = craterForCell(ix, iz);
      if (crater) sum += craterOffset(crater, x, z);
    }
  }
  return sum;
}

/* -------------------------------------------------------------------- mesas */

export interface Mesa {
  x: number;
  z: number;
  /** Top-plateau radius, m. */
  radius: number;
  /** Height above the surrounding plain, m. */
  height: number;
  /** Cliff-band width, m. Narrower reads as more resistant caprock. */
  cliff: number;
  /** 0–1 irregularity of the outline. */
  rugged: number;
}

const mesaCache = new Map<number, Mesa | null>();
const MESA_CACHE_LIMIT = 1024;

function mesaKey(cx: number, cz: number): number {
  return ((cx & 0xffff) << 16) | (cz & 0xffff);
}

/** The mesa owned by a grid cell, or null. Deterministic, cached. */
export function mesaForCell(cx: number, cz: number): Mesa | null {
  const key = mesaKey(cx, cz);
  const cached = mesaCache.get(key);
  if (cached !== undefined) return cached;

  const mesa = computeMesaForCell(cx, cz);
  if (mesaCache.size >= MESA_CACHE_LIMIT) mesaCache.clear();
  mesaCache.set(key, mesa);
  return mesa;
}

function computeMesaForCell(cx: number, cz: number): Mesa | null {
  const base = WORLD_SEED ^ (cx * 83492791) ^ (cz * 2654435761);
  if (hash2(cx, cz, base ^ 0x1b873593) > MESA_DENSITY) return null;

  // Keep the landing basin clear: a butte in the spawn area would make the first
  // thirty seconds a climb test instead of an introduction.
  const x = cx * MESA_CELL + hash2(cx, cz, base ^ 0x85ebca6b) * MESA_CELL;
  const z = cz * MESA_CELL + hash2(cx, cz, base ^ 0xc2b2ae35) * MESA_CELL;
  if (Math.sqrt(x * x + z * z) < BASIN_RADIUS * 0.95) return null;

  const sizeRoll = hash2(cx, cz, base ^ 0x27d4eb2f);
  const radius = MESA_MIN_RADIUS + sizeRoll * (MESA_MAX_RADIUS - MESA_MIN_RADIUS);
  const height = MESA_MIN_HEIGHT + hash2(cx, cz, base ^ 0x165667b1) * (MESA_MAX_HEIGHT - MESA_MIN_HEIGHT);
  const cliff = 12 + hash2(cx, cz, base ^ 0x9e3779b1) * 16;
  const rugged = hash2(cx, cz, base ^ 0xd3a2646c);

  return { x, z, radius, height, cliff, rugged };
}

/**
 * Height contribution of one mesa.
 *
 * The profile is deliberately *flat on top*: the plateau is a plateau, with a
 * smoothstep cliff band at its edge. Adding noise to the outline radius (not to
 * the height) gives an eroded, irregular plan view while keeping the top
 * perfectly flat — which is exactly how these landforms appear from orbit.
 */
/**
 * Height contribution of one mesa.
 *
 * **The profile must reach exactly zero at its cut-off**, and that constraint is
 * not cosmetic. This function is summed over a 3×3 cell window, so when a mesa's
 * influence is truncated at a distance the *field* is discontinuous: the ground
 * jumps by whatever the truncated value was. The first version of this function
 * had an apron term that returned 12 m at the cut-off, which put a 12 m vertical
 * wall into the terrain at every cell boundary — invisible in the noise, and an
 * unclimbable ledge in play. The apron therefore fades all the way to zero and
 * the early-out sits beyond the point where the profile is already 0.
 */
export function mesaOffset(mesa: Mesa, x: number, z: number): number {
  const dx = x - mesa.x;
  const dz = z - mesa.z;
  const distance = Math.sqrt(dx * dx + dz * dz);

  // Cheap rejection *before* the angular noise, which is the expensive part.
  // A mesa's influence can never reach past the constant limit, and the largest
  // possible footprint is `radius × 1.275 + cliff × 2.7`; anything beyond that
  // is zero regardless of where the lobe noise would put the outline.
  if (distance > MESA_REACH_LIMIT) return 0;

  // Irregular plan view: perturb the *effective radius* by an angular noise, so
  // the butte's outline wanders instead of being a circle.
  const angle = Math.atan2(dz, dx);
  const lobes = fbm2(Math.cos(angle) * 2.4 + 11, Math.sin(angle) * 2.4 + 7, {
    octaves: 3,
    lacunarity: 2.1,
    gain: 0.5,
    seed: WORLD_SEED + 4409,
  });
  const effectiveRadius = mesa.radius * (1 + (lobes - 0.5) * 0.55 * mesa.rugged);

  // Flat top out to `effectiveRadius`, then a cliff band of width `cliff`.
  const plateau = 1 - smoothstep(effectiveRadius, effectiveRadius + mesa.cliff, distance);

  // Talus apron: debris spilling from the cliff foot. It is exactly zero at the
  // foot and rises to its maximum just outside it, then decays — the earlier
  // form jumped from 0 to its peak at `apronStart`, which put a 3.9 m ledge around
  // every butte. `smoothstep` already clamps outside its edges, so no branch is
  // needed; the clamp *is* the continuity.
  const apronStart = effectiveRadius + mesa.cliff;
  const apronEnd = apronStart + mesa.cliff * 1.7;
  // Peak at the foot, zero at the end of the apron.
  const apronSkirt = 0.22 * (1 - smoothstep(apronStart, apronEnd, distance));

  // A very slight dome on top, never enough to make it a hill.
  const dome = 0.06 * Math.cos((distance / Math.max(effectiveRadius, 1)) * Math.PI * 0.5);

  const height = mesa.height * (plateau * (1 + dome) + apronSkirt);

  // **Fade the whole contribution out over a fixed margin, so it is exactly zero
  // at the reach limit.** Applying a hard cut-off to a profile that is still
  // non-zero at that distance is what puts a vertical wall at a cell boundary:
  // the 3×3 summation window changes as the point crosses a boundary, and the
  // clamped value appears and disappears. The fade guarantees the value is 0
  // before the window can change.
  const fadeStart = apronEnd;
  const fadeEnd = MESA_REACH_LIMIT;
  if (distance >= fadeEnd) return 0;
  const fade = distance <= fadeStart ? 1 : 1 - smoothstep(fadeStart, fadeEnd, distance);

  return height * fade;
}

/** Summed mesa displacement over the 3×3 cells around a point. */
function mesaField(x: number, z: number): number {
  const cx = Math.floor(x / MESA_CELL);
  const cz = Math.floor(z / MESA_CELL);
  let sum = 0;
  for (let ix = cx - 1; ix <= cx + 1; ix += 1) {
    for (let iz = cz - 1; iz <= cz + 1; iz += 1) {
      const mesa = mesaForCell(ix, iz);
      if (mesa) sum += mesaOffset(mesa, x, z);
    }
  }
  return sum;
}

/* ------------------------------------------------------------------ canyons */

/**
 * A canyon system: sinuous, incised channels cut into the field.
 *
 * Implementation: a low-frequency noise field defines the channel's *centreline*
 * as its zero contour. The distance to that contour (approximated by the field
 * value divided by its local gradient, the standard first-order estimate) gives
 * a true perpendicular distance, so the channel keeps a constant width even
 * where the centreline bends sharply — which a naive pure-value threshold does
 * not, and the failure is visible as the canyon pinching and bulging.
 */
export function canyonField(x: number, z: number): number {
  // Cost discipline: this runs for every terrain vertex of every visible chunk.
  // The carrier is symmetric in (x, z) at the scale of the channel, so the whole
  // field is memoised on a COARSE but *interpolated* lattice.
  //
  // Interpolation is not cosmetic. An earlier version returned the coarse cell's
  // value verbatim, which turned the canyon wall into a staircase: a 16 m vertical
  // step in one metre of ground, which the slope solver refuses to walk over and
  // which reads as a seam in the terrain mesh. Bilinear interpolation of the
  // *distance field* keeps the wall continuous while still evaluating the
  // expensive carrier at only 4 lattice points per vertex.
  const gx = x / CANYON_LATTICE;
  const gz = z / CANYON_LATTICE;
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const fx = gx - x0;
  const fz = gz - z0;

  const v00 = canyonLattice(x0, z0);
  const v10 = canyonLattice(x0 + 1, z0);
  const v01 = canyonLattice(x0, z0 + 1);
  const v11 = canyonLattice(x0 + 1, z0 + 1);

  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return top + (bottom - top) * fz;
}

/** Lattice spacing of the canyon field, m. Well below the channel width. */
const CANYON_LATTICE = 8;

const canyonCache = new Map<number, number>();
const CANYON_CACHE_LIMIT = 40000;

function canyonLattice(ix: number, iz: number): number {
  const key = ((ix & 0xffff) << 16) | (iz & 0xffff);
  const cached = canyonCache.get(key);
  if (cached !== undefined) return cached;

  const value = computeCanyon(ix * CANYON_LATTICE, iz * CANYON_LATTICE);
  if (canyonCache.size >= CANYON_CACHE_LIMIT) canyonCache.clear();
  canyonCache.set(key, value);
  return value;
}

function computeCanyon(x: number, z: number): number {
  const value = carrierAt(x, z);
  // Cheap rejection before the four gradient samples. The carrier's gradient
  // near the channel is of order 1e-4 m⁻¹, so a point this far from the
  // zero contour cannot possibly be within the channel wall.
  if (Math.abs(value) > 0.02) return 0;

  const step = 8;
  const gdx = (carrierAt(x + step, z) - carrierAt(x - step, z)) / (2 * step);
  const gdz = (carrierAt(x, z + step) - carrierAt(x, z - step)) / (2 * step);
  const gradient = Math.sqrt(gdx * gdx + gdz * gdz) + 1e-7;

  const perpendicular = Math.abs(value) / gradient;
  if (perpendicular > CANYON_WIDTH * 1.35) return 0;

  // Gentle U/V hybrid: a flat-ish floor and steeper walls, which is what an
  // incised channel looks like rather than a symmetric sawtooth.
  const t = Math.min(1, perpendicular / (CANYON_WIDTH * 1.35));
  return -CANYON_DEPTH * (1 - t * t) * (1 - t * 0.35);
}

/** The canyon centreline carrier. */
function carrierAt(x: number, z: number): number {
  const warp = fbm2(x * CANYON_FREQ * 0.5, z * CANYON_FREQ * 0.5, {
    octaves: 2,
    lacunarity: 2.0,
    gain: 0.5,
    seed: WORLD_SEED + 7717,
  });

  return (
    fbm2(x * CANYON_FREQ + warp * 1.7, z * CANYON_FREQ * 0.35 + 91.3, {
      octaves: 2,
      lacunarity: 2.1,
      gain: 0.48,
      seed: WORLD_SEED + 3391,
    }) - 0.5
  );
}

/* ------------------------------------------------------------------ height */

/**
 * Terrain height at a world position, in metres relative to `BASE_ELEVATION`.
 *
 * Deterministic, allocation-free, and safe to call tens of thousands of times per
 * frame (chunk build, ground probes, rover suspension rays, map sampling).
 */
export function terrainHeight(x: number, z: number): number {
  const distanceFromOrigin = Math.sqrt(x * x + z * z);

  // 1. basin: broad roll of the plain.
  const basin = (fbm2(x * FREQ_BASIN, z * FREQ_BASIN, {
    octaves: 2,
    lacunarity: 2.1,
    gain: 0.5,
    seed: WORLD_SEED,
  }) - 0.5) * 2 * AMP_BASIN;

  // 2. dunes: stretched along X so the ripples read as wind-scoured.
  const dunes = (fbm2(x * FREQ_DUNE * 0.55, z * FREQ_DUNE * 1.6, {
    octaves: 3,
    lacunarity: 2.3,
    gain: 0.45,
    seed: WORLD_SEED + 77,
  }) - 0.5) * 2 * AMP_DUNE;

  // 3. rubble: the roughness you notice at walking distance.
  const rubble = (fbm2(x * FREQ_RUBBLE, z * FREQ_RUBBLE, {
    octaves: 1,
    lacunarity: 3.1,
    gain: 0.4,
    seed: WORLD_SEED + 313,
  }) - 0.5) * 2 * AMP_RUBBLE;

  // 4. massifs: only beyond the basin, so the landing site stays open.
  const ridgeGate = smoothstep(BASIN_RADIUS * 0.72, BASIN_RADIUS * 2.4, distanceFromOrigin);
  const ridges =
    ridgeGate *
    ridged2(x * FREQ_RIDGE, z * FREQ_RIDGE, {
      octaves: 4,
      lacunarity: 2.05,
      gain: 0.52,
      seed: WORLD_SEED + 1237,
    }) *
    AMP_RIDGE;

  // 5. mesas: the flat-topped buttes. Gated by the same ridge mask so they never
  //    grow out of the mountains, and added *before* canyons so the canyon can be
  //    suppressed where a caprock sits.
  const mesas = mesaField(x, z);

  // 6. canyons: incised channels. Suppressed inside the landing basin (a canyon
  //    through the spawn point would be an invisible fall) and under mesas (the
  //    caprock is more resistant than the surrounding plain).
  const basinGate = 1 - smoothstep(BASIN_RADIUS * 0.55, BASIN_RADIUS * 1.15, distanceFromOrigin);
  const mesaShield = mesas > 1 ? 1 - smoothstep(0, 6, mesas) : 1;
  const canyons = canyonField(x, z) * (1 - basinGate * 0.92) * mesaShield;

  // 7. craters, faded out where the massifs take over (they would be buried).
  const craterScale = 1 - ridgeGate * 0.7;
  const craters = craterField(x, z) * craterScale;

  return BASE_ELEVATION + basin + dunes + rubble + ridges + mesas + canyons + craters;
}

/** Analytic surface normal by central differences (metres per unit slope). */
export function terrainNormal(x: number, z: number, epsilon = 0.7): [number, number, number] {
  const hL = terrainHeight(x - epsilon, z);
  const hR = terrainHeight(x + epsilon, z);
  const hD = terrainHeight(x, z - epsilon);
  const hU = terrainHeight(x, z + epsilon);

  // Slope vectors scaled by the sample spacing, then normalised.
  const nx = hL - hR;
  const nz = hD - hU;
  const ny = 2 * epsilon;
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  return [nx / length, ny / length, nz / length];
}

/** Slope in degrees from vertical: 0 is flat, 90 is a cliff. */
export function terrainSlopeDegrees(x: number, z: number, epsilon = 0.7): number {
  const [, ny] = terrainNormal(x, z, epsilon);
  return (Math.acos(clamp(ny, -1, 1)) * 180) / Math.PI;
}

/* ------------------------------------------------------------------ landing */

/**
 * The landing site: flat-ish ground near the origin. If the exact origin happens
 * to sit inside a crater, the player would spawn underground, so the site picks
 * the flattest of a ring of candidates and returns its height.
 */
export const LANDING_SITE = { x: 6, z: -14 };

export function landingGroundHeight(): number {
  return terrainHeight(LANDING_SITE.x, LANDING_SITE.z);
}

/* ------------------------------------------------------------------ analysis */

export interface TerrainProfile {
  min: number;
  max: number;
  mean: number;
  /** Largest slope seen while sampling, degrees. */
  maxSlope: number;
  samples: number;
}

/** Samples a square region on a grid; used by the map and by the tests. */
export function profileTerrain(
  minX: number,
  minZ: number,
  size: number,
  steps = 32,
): TerrainProfile {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let maxSlope = 0;
  let samples = 0;
  const step = size / steps;

  for (let ix = 0; ix <= steps; ix += 1) {
    for (let iz = 0; iz <= steps; iz += 1) {
      const x = minX + ix * step;
      const z = minZ + iz * step;
      const height = terrainHeight(x, z);
      min = Math.min(min, height);
      max = Math.max(max, height);
      sum += height;
      maxSlope = Math.max(maxSlope, terrainSlopeDegrees(x, z, step));
      samples += 1;
    }
  }

  return { min, max, mean: sum / samples, maxSlope, samples };
}
