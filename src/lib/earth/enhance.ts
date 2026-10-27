/**
 * Browser-based satellite imagery enhancement pipeline.
 *
 * Design constraints (see the AI-Enhanced Earth Viewer feature brief):
 *  - Pure pixel math over `PixelFrame` (Uint8ClampedArray RGBA). No DOM access
 *    here, so every kernel runs in Node tests without a canvas.
 *  - Conservative ranges only: enhancement must aid visual interpretation, not
 *    fabricate colours or imply measurements that the source does not contain.
 *  - Cancellable via AbortSignal; work is sliced across tasks so the main
 *    thread keeps painting and progress is genuinely measurable.
 *  - Hard dimension/memory caps protect low-end mobile devices.
 *
 * This module performs *rendered image* adjustments only. It never derives
 * scientific measurements, classifications or trends.
 */

export interface PixelFrame {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface EnhancementSettings {
  /** Additive level shift in -30..30 (0 = neutral). */
  brightness: number;
  /** Contrast factor in 0.8..1.3 around the 128 midpoint (1 = neutral). */
  contrast: number;
  /** Saturation factor in 0.7..1.4 around Rec. 709 luma (1 = neutral). */
  saturation: number;
  /** Unsharp-mask amount in 0..0.6 (0 = no sharpening). */
  sharpen: number;
}

export const ENHANCEMENT_LIMITS = {
  brightness: { min: -30, max: 30 },
  contrast: { min: 0.8, max: 1.3 },
  saturation: { min: 0.7, max: 1.4 },
  sharpen: { min: 0, max: 0.6 }
} as const;

/** Longest edge accepted for in-browser processing. Larger frames are scaled. */
export const MAX_FRAME_DIM = 1024;
/** RGBA bytes per pixel — used for the memory budget check. */
const BYTES_PER_PIXEL = 4;
/** Rough RGBA byte ceiling for a single frame buffer (~4 MB). */
export const MAX_FRAME_BYTES = MAX_FRAME_DIM * MAX_FRAME_DIM * BYTES_PER_PIXEL;
/** Rows processed between task yields, keeping each slice under ~4 ms. */
const ROWS_PER_SLICE = 64;

export const DEFAULT_SETTINGS: EnhancementSettings = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  sharpen: 0
};

export type EnhancementMode = 'original' | 'browser';

export class EnhancementAbortedError extends Error {
  constructor() {
    super('Enhancement cancelled');
    this.name = 'EnhancementAbortedError';
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof EnhancementAbortedError || (error as Error)?.name === 'AbortError';
}

/** Clamp a settings object to the documented, conservative ranges. */
export function clampSettings(input: Partial<EnhancementSettings>): EnhancementSettings {
  const clamp = (value: number | undefined, fallback: number, min: number, max: number) => {
    const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    brightness: clamp(input.brightness, DEFAULT_SETTINGS.brightness, ENHANCEMENT_LIMITS.brightness.min, ENHANCEMENT_LIMITS.brightness.max),
    contrast: clamp(input.contrast, DEFAULT_SETTINGS.contrast, ENHANCEMENT_LIMITS.contrast.min, ENHANCEMENT_LIMITS.contrast.max),
    saturation: clamp(input.saturation, DEFAULT_SETTINGS.saturation, ENHANCEMENT_LIMITS.saturation.min, ENHANCEMENT_LIMITS.saturation.max),
    sharpen: clamp(input.sharpen, DEFAULT_SETTINGS.sharpen, ENHANCEMENT_LIMITS.sharpen.min, ENHANCEMENT_LIMITS.sharpen.max)
  };
}

/** True when every control is at its neutral position. */
export function isNeutral(settings: EnhancementSettings): boolean {
  return (
    settings.brightness === DEFAULT_SETTINGS.brightness &&
    settings.contrast === DEFAULT_SETTINGS.contrast &&
    settings.saturation === DEFAULT_SETTINGS.saturation &&
    settings.sharpen === DEFAULT_SETTINGS.sharpen
  );
}

export interface FrameDimensions {
  width: number;
  height: number;
}

/**
 * Scale requested dimensions to fit the processing budget while preserving the
 * aspect ratio. Returns the input unchanged when it already fits.
 */
export function clampFrameDimensions(width: number, height: number): FrameDimensions {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid frame dimensions: ${width}x${height}`);
  }
  const longest = Math.max(width, height);
  if (longest <= MAX_FRAME_DIM) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = MAX_FRAME_DIM / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function assertFrame(frame: PixelFrame): void {
  const expected = frame.width * frame.height * BYTES_PER_PIXEL;
  if (frame.data.length !== expected) {
    throw new Error(`PixelFrame data length ${frame.data.length} does not match ${frame.width}x${frame.height} (expected ${expected})`);
  }
  if (frame.data.length > MAX_FRAME_BYTES) {
    throw new Error(`Frame exceeds the ${MAX_FRAME_BYTES}-byte processing budget`);
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new EnhancementAbortedError();
}

const yieldToUiThread = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Brightness, contrast and saturation in a single pass.
 * Rec. 709 luma coefficients keep saturation adjustments perceptually even.
 */
function applyTonalPass(frame: PixelFrame, settings: EnhancementSettings, signal?: AbortSignal): void {
  const { data, width, height } = frame;
  const { brightness, contrast, saturation } = settings;
  const totalRows = height;

  for (let row = 0; row < totalRows; row += 1) {
    if (row % ROWS_PER_SLICE === 0) throwIfAborted(signal);
    const rowStart = row * width * BYTES_PER_PIXEL;
    const rowEnd = rowStart + width * BYTES_PER_PIXEL;
    for (let i = rowStart; i < rowEnd; i += BYTES_PER_PIXEL) {
      const alpha = data[i + 3];
      if (alpha === 0) continue; // leave transparent padding untouched

      for (let channel = 0; channel < 3; channel += 1) {
        const value = data[i + channel];
        // Contrast pivots around the 128 mid-grey, then brightness shifts.
        data[i + channel] = (value - 128) * contrast + 128 + brightness;
      }

      if (saturation !== 1) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        data[i] = luma + (r - luma) * saturation;
        data[i + 1] = luma + (g - luma) * saturation;
        data[i + 2] = luma + (b - luma) * saturation;
      }
    }
  }
}

/**
 * Separable 3×3 box blur used as the unsharp-mask low-pass reference.
 * Writes into `out`; the source frame is never mutated.
 */
function boxBlur(source: PixelFrame, out: PixelFrame, signal?: AbortSignal): void {
  const { width, height, data } = source;
  const tmp = new Uint8ClampedArray(data.length);

  // Horizontal pass: source -> tmp
  for (let y = 0; y < height; y += 1) {
    if (y % ROWS_PER_SLICE === 0) throwIfAborted(signal);
    for (let x = 0; x < width; x += 1) {
      const xLeft = Math.max(0, x - 1);
      const xRight = Math.min(width - 1, x + 1);
      for (let c = 0; c < 3; c += 1) {
        const i = (y * width + x) * 4 + c;
        // Reference neighbours by explicit offsets (edges clamp inward).
        const left = data[(y * width + xLeft) * 4 + c];
        const center = data[i];
        const right = data[(y * width + xRight) * 4 + c];
        tmp[i] = (left + center + right) / 3;
      }
      tmp[(y * width + x) * 4 + 3] = data[(y * width + x) * 4 + 3];
    }
  }

  // Vertical pass: tmp -> out
  for (let y = 0; y < height; y += 1) {
    if (y % ROWS_PER_SLICE === 0) throwIfAborted(signal);
    const yUp = Math.max(0, y - 1);
    const yDown = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x += 1) {
      for (let c = 0; c < 3; c += 1) {
        const i = (y * width + x) * 4 + c;
        const up = tmp[(yUp * width + x) * 4 + c];
        const center = tmp[i];
        const down = tmp[(yDown * width + x) * 4 + c];
        out.data[i] = (up + center + down) / 3;
      }
      out.data[(y * width + x) * 4 + 3] = tmp[(y * width + x) * 4 + 3];
    }
  }
}

/** Unsharp mask: output = source + amount × (source − blurred reference). */
function applySharpen(frame: PixelFrame, amount: number, signal?: AbortSignal): void {
  if (amount <= 0) return;
  const blurred: PixelFrame = {
    width: frame.width,
    height: frame.height,
    data: new Uint8ClampedArray(frame.data.length)
  };
  boxBlur(frame, blurred, signal);

  const { data, width, height } = frame;
  for (let y = 0; y < height; y += 1) {
    if (y % ROWS_PER_SLICE === 0) throwIfAborted(signal);
    for (let x = 0; x < width; x += 1) {
      const px = (y * width + x) * 4;
      if (data[px + 3] === 0) continue;
      for (let c = 0; c < 3; c += 1) {
        const i = px + c;
        data[i] = data[i] + amount * (data[i] - blurred.data[i]);
      }
    }
  }
}

export interface EnhancementProgress {
  /** 0..1 fraction of the pipeline rows completed. */
  fraction: number;
  stage: 'tonal' | 'sharpen';
}

export interface EnhanceOptions {
  signal?: AbortSignal;
  onProgress?: (progress: EnhancementProgress) => void;
}

/**
 * Produce an enhanced *copy* of `source`. The original pixels are retained by
 * the caller for recovery and provenance; this function never mutates input.
 */
export async function enhanceFrame(
  source: PixelFrame,
  rawSettings: Partial<EnhancementSettings>,
  options: EnhanceOptions = {}
): Promise<PixelFrame> {
  assertFrame(source);
  const settings = clampSettings(rawSettings);
  throwIfAborted(options.signal);

  const output: PixelFrame = {
    width: source.width,
    height: source.height,
    data: new Uint8ClampedArray(source.data)
  };

  const totalRows = source.height * 2; // tonal pass + sharpen pass
  const report = (stage: EnhancementProgress['stage'], rowsDone: number): void => {
    options.onProgress?.({ fraction: Math.min(1, rowsDone / totalRows), stage });
  };

  applyTonalPass(output, settings, options.signal);
  report('tonal', source.height);
  await yieldToUiThread();

  if (settings.sharpen > 0) {
    applySharpen(output, settings.sharpen, options.signal);
  }
  report('sharpen', totalRows);

  return output;
}

/** Human-readable description of the active adjustments for the details panel. */
export function describeSettings(settings: EnhancementSettings): string {
  const parts: string[] = [];
  if (settings.brightness !== 0) parts.push(`brightness ${settings.brightness > 0 ? '+' : ''}${settings.brightness}`);
  if (settings.contrast !== 1) parts.push(`contrast ×${settings.contrast.toFixed(2)}`);
  if (settings.saturation !== 1) parts.push(`saturation ×${settings.saturation.toFixed(2)}`);
  if (settings.sharpen > 0) parts.push(`unsharp mask ${Math.round(settings.sharpen * 100)}%`);
  return parts.length ? parts.join(' · ') : 'no adjustments';
}
