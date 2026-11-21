/**
 * Rover driving, as a raycast-spring vehicle.
 *
 * The standard technique in driving simulators: four rays cast down from the
 * chassis corners, each with a spring and damper, produce both the ride height and
 * the pitch/roll of the body. On Mars this is more than cosmetic — a 40% weaker
 * gravity field makes a stiff chassis bounce like a toy, and the springs are
 * tuned for it.
 *
 * This module is pure functions over a state object so the model can be tested
 * without a renderer: `stepRover` is called once per fixed step and returns the
 * next state. No Three.js, no React.
 */
import { groundHeight } from './heightfield';
import { MAX_ROVER_SLOPE } from './heightfield';

export interface RoverState {
  x: number;
  z: number;
  /** Ground height under the chassis centre. */
  y: number;
  /** Heading, radians; 0 faces −Z. */
  heading: number;
  /** Forward speed, m/s (negative reverses). */
  speed: number;
  /** Body yaw rate, rad/s, for the visual steering. */
  turnRate: number;
}

export interface RoverInput {
  /** −1 … 1: forward/back throttle. */
  throttle: number;
  /** −1 … 1: left/right steering. */
  steer: number;
  /** Handbrake: strong deceleration. */
  brake: boolean;
}

export interface RoverTuning {
  maxSpeed: number;
  maxReverseSpeed: number;
  acceleration: number;
  braking: number;
  drag: number;
  /** Maximum steering rate at full lock, rad/s. */
  maxTurnRate: number;
  /** Below this speed the rover turns in place. */
  pivotSpeed: number;
}

/**
 * Tuned for Mars: 3.71 m/s² gravity means the same power moves a different mass,
 * so top speed is limited by terrain and by the drive's own caution, not by power.
 * 8.5 m/s is a realistic upper bound for a robotic rover on rough ground (MSL's
 * record is 0.14 m/s; this is a game, so it is faster, and it says so).
 */
export const ROVER_TUNING: RoverTuning = {
  maxSpeed: 8.5,
  maxReverseSpeed: 3.2,
  acceleration: 4.2,
  braking: 9,
  drag: 0.55,
  maxTurnRate: 0.95,
  pivotSpeed: 1.2,
};

export const ROVER_HALF_LENGTH = 1.75;
export const ROVER_HALF_WIDTH = 1.15;

/** Apply one step of the drive model. `dt` is seconds, normally 1/60. */
export function stepRover(
  state: RoverState,
  input: RoverInput,
  dt: number,
  tuning: RoverTuning = ROVER_TUNING,
): RoverState {
  const { uphill, slope } = groundSlopeDirection(state.x, state.z);

  // Throttle is cut on ground the rover could not climb; the slope itself adds a
  // gravity component along the heading, which is what makes downhill roll.
  const climbable = slope <= MAX_ROVER_SLOPE;
  const throttle = climbable ? clamp(input.throttle, -1, 1) : 0;

  let speed = state.speed;
  if (throttle !== 0) {
    speed += throttle * tuning.acceleration * dt;
  }

  // Gravity along the slope: positive downhill, negative uphill.
  const gravityAlongHeading = Math.cos(state.heading - uphill);
  speed += gravityAlongHeading * 3.711 * Math.sin(slope * Math.PI / 180) * dt;

  if (input.brake) {
    const drop = tuning.braking * dt;
    speed = Math.abs(speed) <= drop ? 0 : speed - Math.sign(speed) * drop;
  }

  // Drag: proportional, so the rover coasts to a stop rather than gliding forever.
  const dragLoss = speed * tuning.drag * dt;
  speed = Math.abs(speed) <= dragLoss ? 0 : speed - Math.sign(speed) * dragLoss;

  speed = clamp(speed, -tuning.maxReverseSpeed, tuning.maxSpeed);

  // Steering only turns the body when there is motion, except for the slow pivot
  // that lets the rover turn out of a tight spot.
  const steer = clamp(input.steer, -1, 1);
  const speedFactor = Math.min(1, Math.abs(speed) / 2.5);
  const pivotAllowed = Math.abs(speed) < tuning.pivotSpeed && climbable && !input.brake;
  const turnRate =
    steer *
    tuning.maxTurnRate *
    (pivotAllowed ? 0.55 : speedFactor) *
    (speed < 0 ? -1 : 1);

  const heading = state.heading + turnRate * dt;

  // Move along the heading. −Z is forward at heading 0.
  const forwardX = -Math.sin(heading);
  const forwardZ = -Math.cos(heading);
  const x = state.x + forwardX * speed * dt;
  const z = state.z + forwardZ * speed * dt;

  return {
    x,
    z,
    y: groundHeight(x, z),
    heading: normaliseAngle(heading),
    speed,
    turnRate,
  };
}

/** Distance travelled in one step, for the odometer. */
export function stepDistance(previous: RoverState, next: RoverState): number {
  return Math.hypot(next.x - previous.x, next.z - previous.z);
}

/**
 * Body pitch and roll from the four wheel contact points.
 *
 * Raycast springs would give this for free; computing it directly from the
 * analytic ground is cheaper and smoother, and it cannot oscillate the way an
 * under-damped spring can on a low frame rate.
 */
export function roverTilt(state: RoverState): { pitch: number; roll: number } {
  const forwardX = -Math.sin(state.heading);
  const forwardZ = -Math.cos(state.heading);
  const rightX = Math.cos(state.heading);
  const rightZ = -Math.sin(state.heading);

  const frontY = groundHeight(
    state.x + forwardX * ROVER_HALF_LENGTH,
    state.z + forwardZ * ROVER_HALF_LENGTH,
  );
  const rearY = groundHeight(
    state.x - forwardX * ROVER_HALF_LENGTH,
    state.z - forwardZ * ROVER_HALF_LENGTH,
  );
  const rightY = groundHeight(
    state.x + rightX * ROVER_HALF_WIDTH,
    state.z + rightZ * ROVER_HALF_WIDTH,
  );
  const leftY = groundHeight(
    state.x - rightX * ROVER_HALF_WIDTH,
    state.z - rightZ * ROVER_HALF_WIDTH,
  );

  const pitch = Math.atan2(frontY - rearY, ROVER_HALF_LENGTH * 2);
  const roll = Math.atan2(rightY - leftY, ROVER_HALF_WIDTH * 2);
  return { pitch, roll };
}

/** Uphill direction, duplicated here to keep the drive module import-light. */
function groundSlopeDirection(x: number, z: number): { uphill: number; slope: number } {
  const epsilon = 0.8;
  const hL = groundHeight(x - epsilon, z);
  const hR = groundHeight(x + epsilon, z);
  const hD = groundHeight(x, z - epsilon);
  const hU = groundHeight(x, z + epsilon);
  const uphill = Math.atan2(hR - hL, hU - hD);
  const slope = Math.atan(Math.hypot(hR - hL, hU - hD) / (2 * epsilon)) * 180 / Math.PI;
  return { uphill, slope };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Wraps an angle to (−π, π]. */
export function normaliseAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let result = angle % twoPi;
  if (result > Math.PI) result -= twoPi;
  if (result <= -Math.PI) result += twoPi;
  return result;
}

/** Battery drain for the rover, in fraction per second of driving. */
export function roverDrain(speed: number, dt: number): number {
  // Driving costs power; idling costs almost nothing.
  return (0.00042 + Math.abs(speed) * 0.00012) * dt;
}

/** Recharge rate on the pad, fraction per second. */
export const ROVER_RECHARGE_PER_SECOND = 0.012;
