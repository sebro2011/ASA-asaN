/**
 * Astronaut movement.
 *
 * Ground-following with gravity, a slope limit, and jump — all against the
 * analytic terrain. The integration is a fixed step called from the frame loop, so
 * the same code path is exercised by the tests without a renderer.
 *
 * Martian gravity is 3.711 m/s², 0.38 g. That number is the reason the movement
 * feel matters: a 1.6 m jump carries a human 0.7 s off the ground and 2.1 m high,
 * which is the single most "this is Mars" sensation the game has.
 */
import { MAX_WALK_SLOPE, groundSlope, groundHeight } from './heightfield';
import { terrainHeight } from '../world/terrain';

export const MARTIAN_GRAVITY = 3.711;

export interface AstronautState {
  x: number;
  y: number;
  z: number;
  /** Vertical velocity, m/s. */
  verticalVelocity: number;
  grounded: boolean;
  /** Head bob phase, radians — drives the camera bob in first person. */
  bob: number;
}

export interface MovementInput {
  /** Local forward/strafe in the range −1…1, already rotated by the camera yaw. */
  forward: number;
  strafe: number;
  /** True while the run modifier (or a full joystick) is held. */
  running: boolean;
  jump: boolean;
}

export const WALK_SPEED = 2.6;
export const RUN_SPEED = 5.1;
/** A suited astronaut cannot jump high; this is a hop, not a leap. */
export const JUMP_VELOCITY = 2.6;

/**
 * Advances the astronaut by `dt` seconds.
 *
 * Speed is ramped rather than set: a suit has mass, and instant acceleration
 * reads as a floating camera. The ramp is asymmetric (0.9 s to reach running
 * speed, 0.35 s to stop) because deceleration is what makes a stop feel planted.
 */
export function stepAstronaut(
  state: AstronautState,
  input: MovementInput,
  dt: number,
  currentSpeed: number,
): { state: AstronautState; speed: number } {
  const targetSpeed = (input.running ? RUN_SPEED : WALK_SPEED) * Math.min(1, Math.hypot(input.strafe, input.forward));
  const accel = targetSpeed > currentSpeed ? 5.6 : 12;
  const speed = approach(currentSpeed, targetSpeed, accel * dt);

  // Direction from the (already camera-relative) input.
  const magnitude = Math.hypot(input.forward, input.strafe);
  let dx = 0;
  let dz = 0;
  if (magnitude > 1e-4 && speed > 1e-4) {
    dx = (input.forward / magnitude) * speed * dt;
    dz = (input.strafe / magnitude) * speed * dt;
  }

  let x = state.x;
  let z = state.z;
  if (dx !== 0 || dz !== 0) {
    const accepted = acceptStep(x, z, dx, dz);
    x = accepted.x;
    z = accepted.z;
    // Descending is never refused — a slope too steep to climb is still a slope
    // you can walk down, which is also the only way off a cliff.
    if (!accepted.ok && groundHeight(x, z) > groundHeight(x + dx, z + dz)) {
      x += dx;
      z += dz;
    }
  }

  const ground = terrainHeight(x, z);
  let y = state.y;
  let verticalVelocity = state.verticalVelocity;
  let grounded = state.grounded;

  if (grounded && input.jump) {
    verticalVelocity = JUMP_VELOCITY;
    grounded = false;
  }

  if (grounded) {
    // Glued to the surface: follow it exactly, so walking uphill never stutters.
    y = ground;
    verticalVelocity = 0;
  } else {
    verticalVelocity -= MARTIAN_GRAVITY * dt;
    y += verticalVelocity * dt;
    if (y <= ground) {
      y = ground;
      verticalVelocity = 0;
      grounded = true;
    }
  }

  // A step down a slope bigger than the suit can descend ends in a fall.
  if (grounded && y > ground + 0.05) {
    grounded = false;
  }

  const bob = grounded && speed > 0.4 ? state.bob + speed * dt * 2.4 : state.bob;

  return {
    state: { x, y, z, verticalVelocity, grounded, bob },
    speed: grounded ? speed : Math.max(speed, 0),
  };
}

/** Places an astronaut on the ground at a position, at rest. */
export function spawnAstronaut(x: number, z: number): AstronautState {
  return { x, y: terrainHeight(x, z), z, verticalVelocity: 0, grounded: true, bob: 0 };
}

/**
 * Accepts a step, or converts it into a slide along the contour.
 *
 * The rule is stated as a bound on the *result*, applied iteratively: a step that
 * would land on impossible ground is reduced, rotated onto the contour, or halved,
 * until either a legal step is found or there is nothing left to try. This matters
 * because the terrain is continuous — a player can walk into a region where every
 * direction exceeds the limit, and a single clamp would leave them standing on a
 * 49° slope trying to walk uphill.
 */
function acceptStep(x: number, z: number, dx: number, dz: number): { x: number; z: number; ok: boolean } {
  let currentX = dx;
  let currentZ = dz;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const targetX = x + currentX;
    const targetZ = z + currentZ;
    if (groundSlope(targetX, targetZ) <= MAX_WALK_SLOPE) {
      return { x: targetX, z: targetZ, ok: true };
    }

    // Rotate the step onto the contour line: perpendicular to the gradient.
    const uphill = uphillDirection(x, z);
    const tangentX = -Math.sin(uphill);
    const tangentZ = Math.cos(uphill);
    const along = currentX * tangentX + currentZ * tangentZ;
    currentX = tangentX * along;
    currentZ = tangentZ * along;

    if (Math.hypot(currentX, currentZ) < 1e-4) {
      // The move was straight uphill: try a half step, then give up.
      currentX = dx * 0.5 ** (attempt + 1);
      currentZ = dz * 0.5 ** (attempt + 1);
    }
  }

  return { x, z, ok: false };
}

function uphillDirection(x: number, z: number): number {
  const epsilon = 0.8;
  const hL = groundHeight(x - epsilon, z);
  const hR = groundHeight(x + epsilon, z);
  const hD = groundHeight(x, z - epsilon);
  const hU = groundHeight(x, z + epsilon);
  return Math.atan2(hR - hL, hU - hD);
}

/** Moves `current` toward `target` by at most `maxDelta`. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  if (current > target) return Math.max(target, current - maxDelta);
  return target;
}
