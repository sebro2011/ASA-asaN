/**
 * Deterministic value noise for the Mars terrain.
 *
 * Why not a noise dependency: the whole world is one pure function of (x, z,
 * seed). It has to be reproducible across devices (so a save file of a few bytes
 * restores the same planet), fast enough to call thousands of times per frame
 * (every chunk vertex, every ground query, every collision probe), and free of
 * allocation in the hot path. A 2-D value-noise lattice with a smoothstep
 * interpolant meets all three in ~60 lines and no bytes of bundle.
 *
 * Value noise (interpolated lattice gradients) rather than simplex: it is
 * marginally more axis-aligned, which for ridged Martian terrain reads as
 * wind-scoured ridges rather than as a defect. The FBM below combines several
 * octaves with rotated sample positions, which hides the grid.
 */

/** 32-bit integer hash → [0, 1). Deterministic in every JS engine. */
export function hash2(ix: number, iz: number, seed: number): number {
  let h = (ix | 0) * 374761393 + (iz | 0) * 668265263 + (seed | 0) * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  // >>> 0 makes it unsigned; dividing by 2^32 maps to [0, 1).
  return (h >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Bilinear, smoothstep-interpolated value noise in [0, 1). */
export function valueNoise2(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smoothstep(x - x0);
  const fz = smoothstep(z - z0);

  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);

  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fz;
}

export interface FbmOptions {
  octaves: number;
  /** Frequency multiplier per octave. */
  lacunarity: number;
  /** Amplitude multiplier per octave. */
  gain: number;
  seed: number;
}

/**
 * Fractal Brownian motion in [0, 1).
 *
 * Each octave rotates the sample position by ≈0.7 rad so the lattice of one
 * octave cannot line up with the next; without it the integer grid of the base
 * frequency shows through as a checkerboard on flat ground.
 */
export function fbm2(x: number, z: number, options: FbmOptions): number {
  const { octaves, lacunarity, gain, seed } = options;
  let frequency = 1;
  let amplitude = 1;
  let sum = 0;
  let norm = 0;

  // Rotated basis: every octave samples along a different axis pair.
  let px = x;
  let pz = z;

  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise2(px * frequency, pz * frequency, seed + octave * 1013) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;

    const nx = px * 0.8 - pz * 0.6;
    const nz = px * 0.6 + pz * 0.8;
    px = nx;
    pz = nz;
  }

  return norm === 0 ? 0 : sum / norm;
}

/**
 * Ridged FBM in [0, 1): `1 - |2n - 1|` folds the noise around its midpoint, so
 * ridges become crests instead of smooth hills. Used for the distant massifs.
 */
export function ridged2(x: number, z: number, options: FbmOptions): number {
  const { octaves, lacunarity, gain, seed } = options;
  let frequency = 1;
  let amplitude = 1;
  let sum = 0;
  let norm = 0;
  let px = x;
  let pz = z;

  for (let octave = 0; octave < octaves; octave += 1) {
    const value = valueNoise2(px * frequency, pz * frequency, seed + octave * 7919);
    sum += (1 - Math.abs(2 * value - 1)) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;

    const nx = px * 0.8 - pz * 0.6;
    const nz = px * 0.6 + pz * 0.8;
    px = nx;
    pz = nz;
  }

  return norm === 0 ? 0 : sum / norm;
}

/* ------------------------------------------------------------------ randomness */

/**
 * Mulberry32 — a 32-bit PRNG with a full 2^32 period, adequate for scattering
 * rocks and placing craters. Deterministic from its seed, so chunk contents are
 * identical on every visit and after a reload.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit seed from a string, so "mars" is always the same world. */
export function seedFromString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
