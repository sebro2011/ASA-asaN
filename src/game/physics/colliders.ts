/**
 * Solid obstacles: rocks, buildings, the rover, the lander.
 *
 * A flat list of cylinders and boxes, rebuilt when the streamed chunk ring
 * changes. Every query is a squared-distance test in the XZ plane plus a height
 * overlap check, so resolving against ~200 obstacles costs microseconds and
 * allocates nothing.
 *
 * Why cylinders and not mesh collision: everything the player can walk into in
 * this game is either an upright rock, a hab module, or a rover. Approximating
 * them with a cylinder or a box is not a compromise for these shapes — it is the
 * shape.
 */

export type ColliderKind = 'rock' | 'building' | 'rover' | 'lander';

export interface CylinderCollider {
  kind: ColliderKind;
  x: number;
  z: number;
  /** Centre of the collider's vertical extent, metres. */
  y: number;
  radius: number;
  /** Half-height, metres. */
  halfHeight: number;
  /** Identifier used by the interaction system (rock id, building id…). */
  id: string;
}

export interface BoxCollider {
  kind: ColliderKind;
  x: number;
  z: number;
  /** Centre height, metres. */
  y: number;
  /** Half extents along local X and Z. */
  halfX: number;
  halfZ: number;
  halfHeight: number;
  /** Y rotation, radians. */
  rotation: number;
  id: string;
}

export type Collider = CylinderCollider | BoxCollider;

export interface ResolvedPosition {
  x: number;
  z: number;
  /** The collider that pushed the mover out, if any. */
  hit: Collider | null;
}

/**
 * Pushes a circle (the mover's footprint) out of every collider it overlaps.
 *
 * One pass, not iterative: with this obstacle density a single push-out resolves
 * a corner case well enough, and an iterative solver in the walking loop is the
 * kind of thing that turns into unexplained jitter on a slope.
 */
export function resolveCollisions(
  x: number,
  z: number,
  y: number,
  radius: number,
  colliders: readonly Collider[],
): ResolvedPosition {
  let outX = x;
  let outZ = z;
  let hit: Collider | null = null;

  for (const collider of colliders) {
    if (Math.abs(y - collider.y) > collider.halfHeight + 1.7) continue;

    if (isBox(collider)) {
      const resolved = resolveBox(outX, outZ, radius, collider);
      if (resolved) {
        outX = resolved.x;
        outZ = resolved.z;
        hit = collider;
      }
      continue;
    }

    const dx = outX - collider.x;
    const dz = outZ - collider.z;
    const minimum = collider.radius + radius;
    const distanceSq = dx * dx + dz * dz;

    if (distanceSq >= minimum * minimum) continue;

    const distance = Math.sqrt(distanceSq);
    if (distance < 1e-5) {
      // Dead centre: pick an arbitrary but stable direction.
      outX = collider.x + minimum;
      outZ = collider.z;
    } else {
      const push = minimum / distance;
      outX = collider.x + dx * push;
      outZ = collider.z + dz * push;
    }
    hit = collider;
  }

  return { x: outX, z: outZ, hit };
}

function isBox(collider: Collider): collider is BoxCollider {
  return 'halfX' in collider;
}

/** Separating-axis push-out against a rotated box, in its own local frame. */
function resolveBox(
  x: number,
  z: number,
  radius: number,
  box: BoxCollider,
): { x: number; z: number } | null {
  const cos = Math.cos(-box.rotation);
  const sin = Math.sin(-box.rotation);
  const dx = x - box.x;
  const dz = z - box.z;

  // World → box local.
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;

  const extentX = box.halfX + radius;
  const extentZ = box.halfZ + radius;

  if (Math.abs(localX) >= extentX || Math.abs(localZ) >= extentZ) return null;

  // Push out along the shallower penetration axis, in local space.
  const penetrationX = extentX - Math.abs(localX);
  const penetrationZ = extentZ - Math.abs(localZ);

  let pushedX = localX;
  let pushedZ = localZ;
  if (penetrationX < penetrationZ) pushedX = Math.sign(localX || 1) * extentX;
  else pushedZ = Math.sign(localZ || 1) * extentZ;

  // Box local → world (inverse rotation).
  const wCos = Math.cos(box.rotation);
  const wSin = Math.sin(box.rotation);
  return {
    x: box.x + pushedX * wCos - pushedZ * wSin,
    z: box.z + pushedX * wSin + pushedZ * wCos,
  };
}

/** True when two circles overlap in the XZ plane (used for interaction range). */
export function withinRadius(
  x: number,
  z: number,
  targetX: number,
  targetZ: number,
  radius: number,
): boolean {
  const dx = x - targetX;
  const dz = z - targetZ;
  return dx * dx + dz * dz <= radius * radius;
}
