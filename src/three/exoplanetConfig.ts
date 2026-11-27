/**
 * Pure, DOM-free configuration & illustrative visual classification for
 * `ExoplanetLab` (Phase 5).
 *
 * Scientific honesty guarantee: `classifyExoplanetVisual` ONLY selects an
 * illustrative rendering palette/atmosphere tint when archive values exist; it
 * never substitutes or fabricates missing measurements for display.
 */

import type { QualityProfile } from './quality';

export type ExoplanetVisualClass =
  | 'hot-jupiter'
  | 'hycean'
  | 'tidally-locked'
  | 'temperate-rocky';

export interface ExoplanetRecordLike {
  readonly pl_name?: string | null;
  readonly pl_rade?: number | null;
  readonly pl_eqt?: number | null;
}

export interface ExoplanetVisualProfile {
  readonly archetype: ExoplanetVisualClass;
  readonly atmosphereColor: string;
  readonly rimColor: string;
  readonly rimPower: number;
  readonly rimIntensity: number;
  readonly roughness: number;
  readonly bumpScale: number;
}

export function classifyExoplanetVisual(
  planet: ExoplanetRecordLike | null | undefined
): ExoplanetVisualProfile {
  const name = typeof planet?.pl_name === 'string' ? planet.pl_name.toLowerCase() : '';
  const rad = typeof planet?.pl_rade === 'number' && Number.isFinite(planet.pl_rade) ? planet.pl_rade : null;
  const temp = typeof planet?.pl_eqt === 'number' && Number.isFinite(planet.pl_eqt) ? planet.pl_eqt : null;

  if ((rad !== null && rad > 3.5) || (temp !== null && temp > 600)) {
    return {
      archetype: 'hot-jupiter',
      atmosphereColor: '#f59e0b',
      rimColor: '#fde68a',
      rimPower: 3.1,
      rimIntensity: 1.05,
      roughness: 0.65,
      bumpScale: 0.025,
    };
  }

  if (rad !== null && rad > 1.8 && rad <= 3.5) {
    return {
      archetype: 'hycean',
      atmosphereColor: '#06b6d4',
      rimColor: '#a5f3fc',
      rimPower: 3.4,
      rimIntensity: 1.0,
      roughness: 0.42,
      bumpScale: 0.02,
    };
  }

  if (name.includes('trappist') || name.includes('proxima')) {
    return {
      archetype: 'tidally-locked',
      atmosphereColor: '#ea580c',
      rimColor: '#fdba74',
      rimPower: 3.3,
      rimIntensity: 0.9,
      roughness: 0.84,
      bumpScale: 0.055,
    };
  }

  return {
    archetype: 'temperate-rocky',
    atmosphereColor: '#38bdf8',
    rimColor: '#bae6fd',
    rimPower: 3.5,
    rimIntensity: 0.95,
    roughness: 0.68,
    bumpScale: 0.04,
  };
}

/**
 * Clamps the target exoplanet's 3D radius relative to Earth (`1.0`) so both
 * spheres sit cleanly side-by-side inside the unified comparison canvas
 * without clipping or overlapping.
 */
export function computeDisplayRadius(earthRadii: number | null | undefined): number {
  if (typeof earthRadii !== 'number' || !Number.isFinite(earthRadii) || earthRadii <= 0) {
    return 1.0;
  }
  return Math.min(1.85, Math.max(0.55, earthRadii * 0.85));
}

export interface ExoplanetLabConfig {
  readonly enableWebGL: boolean;
  readonly dpr: [number, number];
  readonly sphereSegments: number;
  readonly starCount: number;
  readonly environmentResolution: number;
  readonly enablePostprocessing: boolean;
  readonly bloomIntensity: number;
}

export function getExoplanetLabConfig(profile: QualityProfile): ExoplanetLabConfig {
  if (!profile.enableWebGL) {
    return {
      enableWebGL: false,
      dpr: [1, 1],
      sphereSegments: 0,
      starCount: 0,
      environmentResolution: 0,
      enablePostprocessing: false,
      bloomIntensity: 0,
    };
  }

  switch (profile.tier) {
    case 'tier-1':
      return {
        enableWebGL: true,
        dpr: [profile.dpr[0], profile.dpr[1]],
        sphereSegments: 48,
        starCount: 350,
        environmentResolution: 64,
        enablePostprocessing: false,
        bloomIntensity: 0,
      };
    case 'tier-2':
      return {
        enableWebGL: true,
        dpr: [profile.dpr[0], profile.dpr[1]],
        sphereSegments: 64,
        starCount: 800,
        environmentResolution: 128,
        enablePostprocessing: true,
        bloomIntensity: 0.45,
      };
    case 'tier-3':
    default:
      return {
        enableWebGL: true,
        dpr: [profile.dpr[0], profile.dpr[1]],
        sphereSegments: 80,
        starCount: 1400,
        environmentResolution: 256,
        enablePostprocessing: true,
        bloomIntensity: 0.58,
      };
  }
}
