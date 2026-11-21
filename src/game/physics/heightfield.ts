/**
 * Ground contact, answered analytically.
 *
 * Deliberately *not* a physics engine (see docs/MARS_GAME_PLAN.md §2.1). The two
 * questions this game actually asks are "how high is the ground here" and "may I
 * stand there", and both are one function call against the same terrain function
 * that built the visible mesh. That makes them exact: no mesh raycast, no triangle
 * index, no tunnelling, and identical results at every level of detail.
 */
import { terrainHeight, terrainSlopeDegrees } from '../world/terrain';

/** Highest slope an astronaut can climb without sliding back, degrees. */
export const MAX_WALK_SLOPE = 42;

/** Highest slope the rover can climb, degrees. Loose regolith limits this. */
export const MAX_ROVER_SLOPE = 34;

export interface GroundSample {
  height: number;
  slope: number;
  walkable: boolean;
  /** Direction of the uphill gradient, radians around Y. */
  uphill: number;
}

/**
 * The ground under a point.
 *
 * `uphill` is derived from the same central differences the normals use, so a
 * player sliding on a too-steep slope slides downhill in the direction the terrain
 * actually falls.
 */
export function sampleGround(x: number, z: number, epsilon = 0.8): GroundSample {
  const height = terrainHeight(x, z);
  const hL = terrainHeight(x - epsilon, z);
  const hR = terrainHeight(x + epsilon, z);
  const hD = terrainHeight(x, z - epsilon);
  const hU = terrainHeight(x, z + epsilon);

  const slope = (Math.acos(clamp01((2 * epsilon) / Math.hypot(hL - hR, 2 * epsilon, hD - hU))) * 180) / Math.PI;

  // Gradient points uphill: ∂h/∂x = (hR − hL)/2ε, ∂h/∂z = (hU − hD)/2ε.
  const uphill = Math.atan2(hR - hL, hU - hD);

  return {
    height,
    slope,
    walkable: slope <= MAX_WALK_SLOPE,
    uphill,
  };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Ground height only — the hottest path (rover suspension rays, 4 per frame). */
export function groundHeight(x: number, z: number): number {
  return terrainHeight(x, z);
}

/** Slope in degrees, for placement rules and the rover's pitch. */
export function groundSlope(x: number, z: number, epsilon = 0.8): number {
  return terrainSlopeDegrees(x, z, epsilon);
}
