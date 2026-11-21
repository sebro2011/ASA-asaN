/**
 * Touch controls for Android tablets and phones.
 *
 * Like the keyboard module, the interesting part is pure: `TouchState` is a plain
 * object updated by pointer events, and `touchToIntent` converts it to the same
 * `InputIntent` the keyboard produces. The DOM layer only routes pointer events
 * and renders the thumbsticks.
 *
 * Design notes learned from tablet play:
 *  - the left thumbstick is *relative* to where the thumb lands, not to a fixed
 *    circle: an absolute stick forces the player to look down at it
 *  - the right half of the screen is a look pad, not a second stick: dragging
 *    anywhere rotates the camera at a rate proportional to displacement
 *  - a dead zone of 12% keeps a resting thumb from walking the astronaut away
 */

export interface StickState {
  active: boolean;
  /** Pointer id owning this stick, or null. */
  pointerId: number | null;
  /** Origin of the drag, in client pixels. */
  originX: number;
  originY: number;
  /** Current displacement, normalised to −1…1. */
  x: number;
  y: number;
}

export interface TouchState {
  move: StickState;
  look: StickState;
  /** Buttons currently held, by action id. */
  buttons: Record<string, boolean>;
}

/** Fraction of the stick radius that is ignored. */
export const DEAD_ZONE = 0.12;

/** Pixels of drag that equal full deflection. */
export const STICK_RADIUS = 56;

export function createTouchState(): TouchState {
  return {
    move: { active: false, pointerId: null, originX: 0, originY: 0, x: 0, y: 0 },
    look: { active: false, pointerId: null, originX: 0, originY: 0, x: 0, y: 0 },
    buttons: {},
  };
}

/** Release every held touch when a pointer is cancelled or the game loses focus. */
export function resetTouchState(state: TouchState): void {
  for (const stick of [state.move, state.look]) {
    stick.active = false;
    stick.pointerId = null;
    stick.x = 0;
    stick.y = 0;
  }
  state.buttons = {};
}

function applyDeadZone(value: number): number {
  if (Math.abs(value) < DEAD_ZONE) return 0;
  // Rescale so the dead zone does not eat the first 12% of usable travel.
  const sign = value < 0 ? -1 : 1;
  return sign * ((Math.abs(value) - DEAD_ZONE) / (1 - DEAD_ZONE));
}

/** Normalised stick displacement from a client-space point. */
export function stickVector(originX: number, originY: number, clientX: number, clientY: number): { x: number; y: number } {
  const dx = (clientX - originX) / STICK_RADIUS;
  const dy = (clientY - originY) / STICK_RADIUS;
  const length = Math.hypot(dx, dy);
  // Clamp to the unit circle: a diagonal push must not be 41% faster.
  const scale = length > 1 ? 1 / length : 1;
  return { x: applyDeadZone(dx * scale), y: applyDeadZone(dy * scale) };
}

export interface TouchIntent {
  forward: number;
  strafe: number;
  running: boolean;
  jump: boolean;
  interact: boolean;
  board: boolean;
  /** Look delta in radians-per-frame units, applied by the camera system. */
  lookX: number;
  lookY: number;
}

/**
 * Converts held touch state into the movement intent.
 *
 * Screen Y grows downward, so pushing the stick up (negative dy) must produce
 * forward motion (positive forward).
 */
export function touchToIntent(state: TouchState): TouchIntent {
  const { move, look, buttons } = state;
  const button = (id: string): boolean => buttons[id] === true;

  return {
    forward: -move.y,
    strafe: move.x,
    running: Math.hypot(move.x, move.y) > 0.86,
    jump: button('jump'),
    interact: button('interact'),
    board: button('board'),
    lookX: look.x,
    lookY: look.y,
  };
}

/**
 * Which half of the screen a touch starts in.
 *
 * A tablet held in landscape has the left thumb on the UI-free half and the right
 * thumb over the buttons, so the split is 50/50 with the buttons carved out by
 * their own DOM hit areas (the pads are siblings, not children, of the canvas).
 */
export function isLookZone(clientX: number, width: number): boolean {
  return clientX > width * 0.5;
}
