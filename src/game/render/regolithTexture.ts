/**
 * The regolith detail texture.
 *
 * Mars' surface at sub-metre scale is not a smooth ochre gradient: it is a mix of
 * fine dust, sand-sized grains, coarse gravel, and exposed bedrock. That structure
 * is what makes a rendered surface read as *ground* rather than as a painted dune,
 * and it is exactly what procedural per-fragment FBM fails at — FBM is isotropic
 * and self-similar, so at every scale it looks like the same soft cloud.
 *
 * This module bakes one 256×256 RGBA tile **once, on the CPU, at startup**, and the
 * terrain shader samples it four ways (albedo break-up, dust mask, gravel mask and
 * micro-relief). Baking buys three things that matter here:
 *
 *   · **Zero download.** The texture ships as code, not bytes. Nothing to preload,
 *     nothing to cache-bust, nothing to fail on a bad network.
 *   · **Cheaper shading.** Eight periodic-noise octaves evaluated once for 65 536
 *     texels cost far less than the same octaves per fragment, every frame, on an
 *     Android tablet's GPU — the hardware the low preset exists for.
 *   · **Repeatable detail.** Because the tile wraps exactly, a surface at any
 *     distance can be tiled without a visible seam.
 *
 * Channels:
 *   R — layered periodic FBM: broad patchiness (dust vs. coarser material)
 *   G — ridged noise: gravel ridges and small rock edges
 *   B — white noise: per-texel speckle, the finest grain
 *   A — cellular (Worley) noise: discrete grain clumps and pebbles
 *
 * All four are periodic over the tile, so `RepeatWrapping` is seamless.
 */
import * as THREE from 'three';

/** Tile edge, texels. 256 is 0.26 MB of GPU memory as RGBA8. */
export const REGOLITH_SIZE = 256;

/* --------------------------------------------------------------- primitives */

/** Deterministic 32-bit float in [0, 1) from integer lattice coordinates. */
function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/**
 * Value noise on an integer lattice that **wraps** at `period`.
 *
 * The wrap is what makes the tile seamless: cell 256 is cell 0. Without it the
 * left and right edges would meet at a visible cliff, which on a repeating ground
 * texture reads as a grid of scars.
 */
function periodicNoise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;

  const wrap = (value: number) => ((value % period) + period) % period;

  const xa = wrap(x0);
  const xb = wrap(x0 + 1);
  const ya = wrap(y0);
  const yb = wrap(y0 + 1);

  // Quintic fade: C² continuous, so the derivative (which the shader uses for
  // micro-relief) has no visible lattice creases.
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);

  const n00 = hash2(xa, ya, seed);
  const n10 = hash2(xb, ya, seed);
  const n01 = hash2(xa, yb, seed);
  const n11 = hash2(xb, yb, seed);

  const top = n00 + (n10 - n00) * u;
  const bottom = n01 + (n11 - n01) * u;
  return top + (bottom - top) * v;
}

/** Fractal sum of `periodicNoise`. `basePeriod` must be a power of two ≤ size. */
function periodicFbm(
  x: number,
  y: number,
  basePeriod: number,
  octaves: number,
  seed: number,
): number {
  let amplitude = 0.5;
  let frequency = basePeriod;
  let sum = 0;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amplitude * periodicNoise((x / REGOLITH_SIZE) * frequency, (y / REGOLITH_SIZE) * frequency, frequency, seed + octave * 131);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / norm;
}

/** Ridged variant: folds the noise about its midpoint to make creases, not blobs. */
function periodicRidged(x: number, y: number, basePeriod: number, octaves: number, seed: number): number {
  let amplitude = 0.5;
  let frequency = basePeriod;
  let sum = 0;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    const n = periodicNoise((x / REGOLITH_SIZE) * frequency, (y / REGOLITH_SIZE) * frequency, frequency, seed + octave * 197);
    sum += amplitude * (1 - Math.abs(n * 2 - 1));
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / norm;
}

/**
 * Cellular noise: distance to the nearest of `cells²` jittered feature points.
 *
 * Gives the "gravel" channel its discrete, clumped character. A pure noise
 * function cannot do this — it has no notion of a discrete grain.
 */
function periodicCellular(x: number, y: number, cells: number, seed: number): number {
  const cx = (x / REGOLITH_SIZE) * cells;
  const cy = (y / REGOLITH_SIZE) * cells;
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);

  let nearest = 1e9;
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const gx = x0 + ox;
      const gy = y0 + oy;
      const wrapX = ((gx % cells) + cells) % cells;
      const wrapY = ((gy % cells) + cells) % cells;
      const px = gx + hash2(wrapX, wrapY, seed);
      const py = gy + hash2(wrapX, wrapY, seed + 977);
      const dx = px - cx;
      const dy = py - cy;
      const distance = dx * dx + dy * dy;
      if (distance < nearest) nearest = distance;
    }
  }
  return Math.min(1, Math.sqrt(nearest));
}

/* ----------------------------------------------------------------- the bake */

let cached: THREE.DataTexture | null = null;

/**
 * Builds (once) the shared regolith tile.
 *
 * The result is cached: every streamed chunk shares one texture object, so
 * crossing a chunk boundary never re-bakes and the GPU upload happens exactly
 * once per session.
 */
export function regolithTexture(): THREE.DataTexture {
  if (cached) return cached;

  const size = REGOLITH_SIZE;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;

      // R — broad material patchiness. Two octaves only: this channel is sampled
      // at a large world scale, where extra octaves would be invisible anyway.
      const patch = periodicFbm(x, y, 4, 4, 1017);

      // G — micro-relief. This channel is the *bump* source, so it must contain
      // high-frequency structure: a ridged field at 16 cells over 256 px is only
      // 16 px per cell, which the bilinear filter smooths into almost nothing once
      // it is tiled across a metre of ground. Three stacked scales — coarse
      // gravel, then sand grain, then a fine speckle lattice — give the normal
      // perturbation something to bite on at every distance.
      const gravel = periodicRidged(x, y, 24, 3, 2029);
      const sand = periodicFbm(x, y, 96, 2, 6151);
      const fine = periodicRidged(x, y, 192, 1, 8231);
      const ridges = gravel * 0.5 + sand * 0.3 + fine * 0.2;

      // B — finest grain: white noise, deliberately un-smoothed.
      const speckle = hash2(x, y, 4073);

      // A — discrete grain clumps.
      const cellular = 1 - periodicCellular(x, y, 32, 5099);

      data[index] = Math.round(Math.min(1, Math.max(0, patch)) * 255);
      data[index + 1] = Math.round(Math.min(1, Math.max(0, ridges)) * 255);
      data[index + 2] = Math.round(speckle * 255);
      data[index + 3] = Math.round(Math.min(1, Math.max(0, cellular)) * 255);
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Linear filtering with mipmaps: the shader samples this texture at four
  // different world scales, and without mipmaps the distant samples alias into a
  // shimmering moiré as the camera moves.
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;

  cached = texture;
  return texture;
}

/**
 * Releases the cached tile. Only meaningful in tests and on a full page teardown;
 * the game keeps one texture for its whole lifetime.
 */
export function disposeRegolithTexture(): void {
  cached?.dispose();
  cached = null;
}
