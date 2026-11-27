/**
 * SpaceLab3D & CelestialLab3D — Tier-Adaptive Scene Configuration.
 *
 * Pure, DOM-free mapper converting a Phase 1 `QualityProfile` into exact
 * geometry, starfield, lighting, shadow, texture, and postprocessing settings
 * for interactive 3D observation labs.
 */

import type { QualityProfile } from './quality';
import { EARTH_TEXTURES } from './earthConfig';

/** Shared primary solar directional vector matching lab `<directionalLight position={[16, 12, 10]} />`. */
export const LAB_SUN_POSITION = [16, 12, 10] as const;

/**
 * Authentic 18-segment James Webb Space Telescope primary mirror honeycomb:
 * inner ring (6 hexagons) + outer ring (12 hexagons) surrounding the dark
 * central aft-optics aperture.
 */
export const JWST_HONEYCOMB_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  // Inner ring of 6 segments around the central baffle
  [-0.55, 0.95],
  [0.55, 0.95],
  [-1.1, 0],
  [1.1, 0],
  [-0.55, -0.95],
  [0.55, -0.95],
  // Outer ring of 12 segments
  [0, 1.9],
  [-1.1, 1.9],
  [1.1, 1.9],
  [-1.65, 0.95],
  [1.65, 0.95],
  [-2.2, 0],
  [2.2, 0],
  [-1.65, -0.95],
  [1.65, -0.95],
  [-1.1, -1.9],
  [0, -1.9],
  [1.1, -1.9],
];

export interface LabSceneConfig {
  /** Clamp passed to `<Canvas dpr={...}>`. */
  dpr: [number, number];
  /** Default DPR ceiling when PerformanceMonitor inclines. */
  maxDpr: number;
  /** WebGL backbuffer antialias (crisp planet silhouettes when EffectComposer is off). */
  antialias: boolean;
  /** Sphere tessellation for hero planets. */
  sphereSegments: number;
  /** Sphere tessellation for BackSide atmospheric scattering shells. */
  atmosphereSegments: number;
  /** Background DynamicStarfield particle budget. */
  starCount: number;
  /** Enable real-time shadow maps (tier-3 only). */
  enableShadows: boolean;
  /** Directional shadow map resolution when shadows are active. */
  shadowMapSize: number;
  /** Whether cinematic postprocessing starts enabled by default (tier-2/3 only). */
  enablePostprocessingByDefault: boolean;
  /** EffectComposer MSAA samples (always 0 to preserve 60 FPS across GPUs). */
  postprocessingMultisampling: number;
  /** Bloom intensity scaled conservatively per tier. */
  bloomIntensity: number;
  /** High luminance threshold so only real specular / gold highlights bloom. */
  bloomLuminanceThreshold: number;
  /** Procedural `<SpaceEnvironment />` cubemap resolution. */
  environmentResolution: number;
  /** Texture anisotropy cap. */
  anisotropy: number;
  /** Local NASA Earth day texture matched to tier bandwidth/VRAM. */
  earthDayTexture: string;
  /** Cloud-cast shadow intensity on Earth surface shader. */
  earthCloudShadowStrength: number;
  /** Continental luminance-slope micro-relief on Earth surface shader. */
  earthReliefStrength: number;
}

export function getLabSceneConfig(profile: QualityProfile): LabSceneConfig {
  switch (profile.tier) {
    case 'tier-0':
      return {
        dpr: [1, 1],
        maxDpr: 1,
        antialias: false,
        sphereSegments: 32,
        atmosphereSegments: 24,
        starCount: 900,
        enableShadows: false,
        shadowMapSize: 0,
        enablePostprocessingByDefault: false,
        postprocessingMultisampling: 0,
        bloomIntensity: 0.45,
        bloomLuminanceThreshold: 0.9,
        environmentResolution: 64,
        anisotropy: 1,
        earthDayTexture: EARTH_TEXTURES.dayLite,
        earthCloudShadowStrength: 0,
        earthReliefStrength: 0,
      };
    case 'tier-1':
      return {
        dpr: [profile.dpr[0], profile.dpr[1]],
        maxDpr: profile.dpr[1],
        antialias: true,
        sphereSegments: 48,
        atmosphereSegments: 36,
        starCount: 1800,
        enableShadows: false,
        shadowMapSize: 0,
        enablePostprocessingByDefault: false,
        postprocessingMultisampling: 0,
        bloomIntensity: 0.55,
        bloomLuminanceThreshold: 0.88,
        environmentResolution: profile.environmentResolution,
        anisotropy: 2,
        earthDayTexture: EARTH_TEXTURES.dayLite,
        earthCloudShadowStrength: 0,
        earthReliefStrength: 0,
      };
    case 'tier-2':
      return {
        dpr: [profile.dpr[0], profile.dpr[1]],
        maxDpr: profile.dpr[1],
        antialias: true,
        sphereSegments: 64,
        atmosphereSegments: 48,
        starCount: 4800,
        enableShadows: false,
        shadowMapSize: 0,
        enablePostprocessingByDefault: true,
        postprocessingMultisampling: 0,
        bloomIntensity: 0.78,
        bloomLuminanceThreshold: 0.86,
        environmentResolution: profile.environmentResolution,
        anisotropy: 4,
        earthDayTexture: EARTH_TEXTURES.dayStandard,
        earthCloudShadowStrength: 0.24,
        earthReliefStrength: 0.14,
      };
    case 'tier-3':
    default:
      return {
        dpr: [profile.dpr[0], profile.dpr[1]],
        maxDpr: profile.dpr[1],
        antialias: true,
        sphereSegments: 96,
        atmosphereSegments: 64,
        starCount: 8500,
        enableShadows: true,
        shadowMapSize: profile.shadowMapSize,
        enablePostprocessingByDefault: true,
        postprocessingMultisampling: 0,
        bloomIntensity: 0.92,
        bloomLuminanceThreshold: 0.84,
        environmentResolution: profile.environmentResolution,
        anisotropy: 8,
        earthDayTexture: EARTH_TEXTURES.dayStandard,
        earthCloudShadowStrength: 0.3,
        earthReliefStrength: 0.2,
      };
  }
}
