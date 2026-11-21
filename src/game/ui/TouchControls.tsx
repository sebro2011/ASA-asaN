/**
 * On-screen controls for tablets and phones.
 *
 * Two thumbs, two jobs: the left thumb drives a relative stick that appears where
 * the finger lands, the right thumb drags anywhere on the right half to look. The
 * action buttons sit under the right thumb but above the look pad, so a tap on a
 * button never also rotates the camera.
 *
 * The pads are siblings of the canvas and carry `touch-action: none`, so a drag
 * never scrolls the page. That is scoped to the pads — the surrounding site keeps
 * its normal scrolling.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { TouchState } from '../input/touch';
import { stickVector, STICK_RADIUS } from '../input/touch';
import type { GameCopy } from './copy';

export interface TouchControlsProps {
  copy: GameCopy;
  state: TouchState;
  onChange: () => void;
  /** Look deltas are written here, in radians, and consumed by the render loop. */
  lookRef: React.MutableRefObject<{ x: number; y: number }>;
  sensitivity: number;
  onMenu: () => void;
  playerMode: 'foot' | 'rover';
  roverNear: boolean;
}

const BUTTONS = [
  { id: 'interact', key: 'touchInteract' as const },
  { id: 'board', key: 'touchBoard' as const },
  { id: 'jump', key: 'touchJump' as const },
];

export function TouchControls({ copy, state, onChange, lookRef, sensitivity, onMenu, playerMode, roverNear }: TouchControlsProps) {
  const movePad = useRef<HTMLDivElement>(null);
  const moveKnob = useRef<HTMLDivElement>(null);
  const lookPad = useRef<HTMLDivElement>(null);
  const lastLook = useRef<{ x: number; y: number; id: number | null }>({ x: 0, y: 0, id: null });

  const updateMovePad = useCallback(() => {
    const knob = moveKnob.current;
    if (!knob) return;
    knob.style.transform = `translate(${state.move.x * STICK_RADIUS * 0.55}px, ${state.move.y * STICK_RADIUS * 0.55}px)`;
    knob.style.opacity = state.move.active ? '1' : '0.5';
  }, [state]);

  useEffect(updateMovePad, [updateMovePad]);

  const onMoveStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (state.move.pointerId !== null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    state.move.active = true;
    state.move.pointerId = event.pointerId;
    state.move.originX = event.clientX;
    state.move.originY = event.clientY;
    state.move.x = 0;
    state.move.y = 0;
    onChange();
  };

  const onMoveMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (state.move.pointerId !== event.pointerId) return;
    const vector = stickVector(state.move.originX, state.move.originY, event.clientX, event.clientY);
    state.move.x = vector.x;
    state.move.y = vector.y;
    onChange();
  };

  const onMoveEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (state.move.pointerId !== event.pointerId) return;
    state.move.active = false;
    state.move.pointerId = null;
    state.move.x = 0;
    state.move.y = 0;
    onChange();
  };

  const onLookStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (lastLook.current.id !== null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    lastLook.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };

  const onLookMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (lastLook.current.id !== event.pointerId) return;
    const dx = event.clientX - lastLook.current.x;
    const dy = event.clientY - lastLook.current.y;
    lastLook.current.x = event.clientX;
    lastLook.current.y = event.clientY;
    // 0.0032 rad/px: a 300 px swipe is just over half a turn.
    lookRef.current.x += dx * 0.0032 * sensitivity;
    lookRef.current.y += dy * 0.0032 * sensitivity;
  };

  const onLookEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (lastLook.current.id !== event.pointerId) return;
    lastLook.current = { x: 0, y: 0, id: null };
  };

  const toggleButton = (id: string, next: boolean) => {
    state.buttons[id] = next;
    onChange();
  };

  return (
    <>
      {/* Look pad: the right half, under the buttons. */}
      <div
        ref={lookPad}
        onPointerDown={onLookStart}
        onPointerMove={onLookMove}
        onPointerUp={onLookEnd}
        onPointerCancel={onLookEnd}
        onLostPointerCapture={onLookEnd}
        className="absolute inset-y-0 right-0 z-10 w-1/2"
        style={{ touchAction: 'none' }}
        aria-hidden="true"
      />

      {/* Movement stick: the left third. */}
      <div
        ref={movePad}
        onPointerDown={onMoveStart}
        onPointerMove={onMoveMove}
        onPointerUp={onMoveEnd}
        onPointerCancel={onMoveEnd}
        onLostPointerCapture={onMoveEnd}
        className="absolute bottom-36 left-4 z-20 grid h-28 w-28 place-items-center rounded-full border border-line/60 bg-surface/25"
        style={{ touchAction: 'none' }}
        aria-hidden="true"
      >
        <div
          ref={moveKnob}
          className="h-12 w-12 rounded-full border border-atmo/50 bg-atmo/25 transition-[transform,opacity] duration-75"
        />
      </div>

      {/* Action cluster. */}
      <div className="absolute bottom-36 right-4 z-20 flex flex-col items-end gap-2">
        {(playerMode === 'rover' || roverNear) && (
          <button
            type="button"
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); toggleButton('board', true); }}
            onPointerUp={() => toggleButton('board', false)}
            onPointerCancel={() => toggleButton('board', false)}
            onLostPointerCapture={() => toggleButton('board', false)}
            className="h-12 rounded-full border border-line-strong bg-surface-2/85 px-4 text-[12px] font-medium text-ink active:bg-atmo/25"
            style={{ touchAction: 'none' }}
          >
            {copy.touchBoard}
          </button>
        )}
        {BUTTONS.filter((button) => button.id !== 'board').map((button) => (
          <button
            key={button.id}
            type="button"
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); toggleButton(button.id, true); }}
            onPointerUp={() => toggleButton(button.id, false)}
            onPointerCancel={() => toggleButton(button.id, false)}
            onLostPointerCapture={() => toggleButton(button.id, false)}
            className={`grid place-items-center rounded-full border text-[11px] font-medium text-ink active:bg-atmo/25 ${
              button.id === 'interact'
                ? 'h-16 w-16 border-atmo/50 bg-atmo/15'
                : 'h-12 w-12 border-line-strong bg-surface-2/85'
            }`}
            style={{ touchAction: 'none' }}
          >
            {button.id === 'jump' && playerMode === 'rover' ? copy.touchBrake : copy[button.key]}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onMenu}
        className="absolute right-3 top-16 z-30 rounded-lg border border-line-strong bg-surface-2/85 px-2.5 py-1 font-mono text-[10px] text-ink-2"
        style={{ touchAction: 'none' }}
      >
        {copy.touchMenu}
      </button>
    </>
  );
}
