/**
 * Pure logic behind the CosmoVision cinematic player.
 *
 * Everything here is data-in / data-out so the behaviour that is easy to get wrong
 * — time formatting, seeking past the end, keyboard mapping, which controls may be
 * shown at all, when the chrome hides — is testable without a browser. The
 * component keeps only DOM wiring.
 */

/** The two skip buttons are 15 s; arrow keys nudge 5 s. */
export const SKIP_SECONDS = 15;
export const NUDGE_SECONDS = 5;
export const VOLUME_STEP = 5;
/** Chrome hides after this much inactivity while playing. */
export const CHROME_IDLE_MS = 2600;

export type PlayerAction =
  | 'toggle'
  | 'seek-back'
  | 'seek-forward'
  | 'jump-back'
  | 'jump-forward'
  | 'mute'
  | 'volume-up'
  | 'volume-down'
  | 'fullscreen'
  | 'captions'
  | 'close'
  | 'start'
  | 'end';

/** `1:07`, `12:05`, `1:02:03` — and `0:00` for anything unusable. */
export function formatClock(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** Countdown form: `-4:21`, and `0:00` rather than `-0:00` at the end. */
export function formatRemaining(current: number | null | undefined, duration: number | null | undefined): string {
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return '0:00';
  const elapsed = typeof current === 'number' && Number.isFinite(current) ? current : 0;
  const left = Math.max(0, duration - Math.max(0, elapsed));
  return left < 1 ? '0:00' : `-${formatClock(left)}`;
}

/** Seek targets are clamped into [0, duration]; an unknown duration means 0. */
export function clampSeek(target: number, duration: number | null | undefined): number {
  const limit = typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : 0;
  if (!Number.isFinite(target) || target <= 0) return 0;
  return limit ? Math.min(target, limit) : target;
}

/** 0…1, never NaN, never negative — a progress bar that cannot break layout. */
export function progressFraction(current: number | null | undefined, duration: number | null | undefined): number {
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return 0;
  if (typeof current !== 'number' || !Number.isFinite(current) || current <= 0) return 0;
  return Math.min(1, current / duration);
}

export function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Which controls may be rendered. A control that would not work is not shown at
 * all rather than shown and inert: Picture-in-Picture needs a same-origin <video>
 * (a YouTube iframe has none), and the iframe API exposes neither audio tracks nor
 * a caption-track list, so those are reported as unavailable instead of faked.
 */
export interface PlayerCapabilities {
  play: true;
  seek: boolean;
  volume: boolean;
  fullscreen: boolean;
  captions: boolean;
  share: boolean;
  pictureInPicture: boolean;
  audioTracks: false;
}

export function playerCapabilities(input: {
  /** The iframe API answered and the player object is usable. */
  apiReady: boolean;
  /** `setOption`/`unloadModule` exist, which is what the captions toggle needs. */
  captionsApi: boolean;
  /** A same-origin <video> this page could hand to `requestPictureInPicture`. */
  sameOriginVideo: boolean;
  fullscreenApi: boolean;
  /** iOS ignores `setVolume`; the hardware buttons own the level. */
  hardwareVolume: boolean;
  shareApi: boolean;
}): PlayerCapabilities {
  const ready = input.apiReady;
  return {
    play: true,
    seek: ready,
    volume: ready && !input.hardwareVolume,
    fullscreen: input.fullscreenApi,
    captions: ready && input.captionsApi,
    // Sharing is a plain URL, so it never depends on the player object.
    share: true,
    pictureInPicture: input.sameOriginVideo,
    audioTracks: false
  };
}

/** Keyboard map. Letters are case-insensitive; anything else is ignored. */
export function resolveShortcut(key: string, options: { hasClose: boolean } = { hasClose: false }): PlayerAction | null {
  if (typeof key !== 'string' || !key) return null;
  const lower = key.length === 1 ? key.toLowerCase() : key;
  switch (lower) {
    case ' ':
    case 'Spacebar':
    case 'k':
      return 'toggle';
    case 'ArrowLeft':
      return 'seek-back';
    case 'ArrowRight':
      return 'seek-forward';
    case 'j':
      return 'jump-back';
    case 'l':
      return 'jump-forward';
    case 'm':
      return 'mute';
    case 'ArrowUp':
      return 'volume-up';
    case 'ArrowDown':
      return 'volume-down';
    case 'f':
      return 'fullscreen';
    case 'c':
      return 'captions';
    case 'Home':
      return 'start';
    case 'End':
      return 'end';
    case 'Escape':
      return options.hasClose ? 'close' : null;
    default:
      return null;
  }
}

/**
 * The chrome stays while paused, while the pointer is on it, while seeking and
 * while anything inside it has focus. It is the *absence* of all of those, during
 * playback and after the idle window, that hides it.
 */
export function chromeVisible(input: {
  playing: boolean;
  hoveringChrome: boolean;
  focusWithin: boolean;
  scrubbing: boolean;
  idleMs: number;
  idleLimit?: number;
}): boolean {
  if (!input.playing) return true;
  if (input.hoveringChrome || input.focusWithin || input.scrubbing) return true;
  return input.idleMs < (input.idleLimit ?? CHROME_IDLE_MS);
}

/** Volume icon state, so the button and its label can never disagree. */
export function volumeState(volume: number, muted: boolean): 'muted' | 'low' | 'high' {
  if (muted || volume <= 0) return 'muted';
  return volume < 50 ? 'low' : 'high';
}

/** `aria-valuetext` for the timeline: what a screen reader announces while scrubbing. */
export function timelineValueText(current: number, duration: number): string {
  return `${formatClock(current)} / ${formatClock(duration)}, ${formatRemaining(current, duration)}`;
}
