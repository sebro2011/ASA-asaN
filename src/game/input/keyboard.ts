/**
 * Keyboard and pointer input.
 *
 * Two rules shape this module:
 *
 *  1. **The game never steals keys it is not using.** Listeners are attached to
 *     the game host while it has focus, and every handled key calls
 *     `preventDefault` only for the keys that would otherwise scroll, zoom or
 *     navigate. Escape and Tab always keep their browser meaning outside the game.
 *  2. **The reducer is pure.** `reduceKeys` maps a key set to an intent, so the
 *     whole control scheme is testable in Node without a browser. The DOM layer
 *     only maintains the pressed-key set and the pointer-lock lifecycle.
 */

export type KeyName =
  | 'KeyW' | 'KeyA' | 'KeyS' | 'KeyD'
  | 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
  | 'ShiftLeft' | 'ShiftRight'
  | 'Space' | 'KeyE' | 'KeyF' | 'KeyM' | 'KeyJ' | 'KeyI' | 'KeyP' | 'KeyR'
  | 'Digit1' | 'Digit2' | 'Digit3'
  | 'Escape' | 'Tab';

export interface InputIntent {
  /** −1 … 1, forward positive. */
  forward: number;
  /** −1 … 1, right positive. */
  strafe: number;
  running: boolean;
  jump: boolean;
  /** Held: interact. */
  interact: boolean;
  /** Held: board/exit rover. */
  board: boolean;
  /** Edge-triggered this frame. */
  toggleMap: boolean;
  toggleJournal: boolean;
  toggleInventory: boolean;
  togglePause: boolean;
  toggleCamera: boolean;
  /** −1 … 1 throttle for the rover (same keys, interpreted by mode). */
  throttle: number;
  steer: number;
  brake: boolean;
}

/** A key set is a `Set<string>` of `KeyboardEvent.code` values. */
export function reduceKeys(pressed: ReadonlySet<string>): Omit<InputIntent, 'toggleMap' | 'toggleJournal' | 'toggleInventory' | 'togglePause' | 'toggleCamera'> {
  const has = (code: string): boolean => pressed.has(code);

  const forwardRaw = (has('KeyW') || has('ArrowUp') ? 1 : 0) - (has('KeyS') || has('ArrowDown') ? 1 : 0);
  const strafeRaw = (has('KeyD') || has('ArrowRight') ? 1 : 0) - (has('KeyA') || has('ArrowLeft') ? 1 : 0);
  const running = has('ShiftLeft') || has('ShiftRight');

  return {
    forward: forwardRaw,
    strafe: strafeRaw,
    throttle: forwardRaw,
    steer: strafeRaw,
    running,
    jump: has('Space'),
    interact: has('KeyE'),
    board: has('KeyF'),
    brake: has('Space'),
  };
}

/**
 * Keys the game consumes while it has focus.
 *
 * Space is consumed (it would scroll the page), as are the arrows. Escape is
 * *not* consumed: the browser uses it to exit pointer lock and the game watches
 * for the result.
 */
export const CONSUMED_KEYS = new Set<string>([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight',
  'KeyE', 'KeyF', 'KeyM', 'KeyJ', 'KeyI', 'KeyR',
]);

/** One-shot action keys, mapped to the intent flag they set. */
export const ACTION_KEYS: Record<string, keyof Pick<InputIntent, 'toggleMap' | 'toggleJournal' | 'toggleInventory' | 'togglePause' | 'toggleCamera'>> = {
  KeyM: 'toggleMap',
  KeyJ: 'toggleJournal',
  KeyI: 'toggleInventory',
  Escape: 'togglePause',
  KeyP: 'togglePause',
  KeyR: 'toggleCamera',
};

export const EMPTY_INTENT: InputIntent = {
  forward: 0,
  strafe: 0,
  running: false,
  jump: false,
  interact: false,
  board: false,
  toggleMap: false,
  toggleJournal: false,
  toggleInventory: false,
  togglePause: false,
  toggleCamera: false,
  throttle: 0,
  steer: 0,
  brake: false,
};
