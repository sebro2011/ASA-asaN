/**
 * Hero Orbital Earth — Tier-Adaptive Rendering Configuration.
 *
 * Pure, DOM-free module mapping a `QualityProfile` (from the Phase 1 4-tier
 * GPU engine) onto exact geometry density, texture resolution, shader feature
 * toggles, background starfield count, and subtle parallax limits for the
 * homepage OrbitalEarth scene.
 */

import type { QualityProfile } from './quality';

export const EARTH_TEXTURES = {
  dayStandard: '/textures/earth/earth-day.jpg',
  dayLite: '/textures/earth/earth-day-1024.jpg',
  night: '/textures/earth/earth-night.jpg',
  clouds: '/textures/earth/earth-clouds.webp',
} as const;

export interface HeroEarthConfig {
  /** Whether the WebGL Canvas should mount at all (`false` on tier-0). */
  enableWebGL: boolean;
  /** Bundled NASA Blue Marble texture matched to GPU tier. */
  dayTexture: string;
  /** Bundled NASA Black Marble night-lights texture. */
  nightTexture: string;
  /** Bundled NASA global cloud-cover texture. */
  cloudTexture: string;
  /** Sphere tessellation for Earth surface & cloud shell. */
  sphereSegments: number;
  /** Sphere tessellation for the outer Rayleigh atmosphere shell. */
  atmosphereSegments: number;
  /** Texture anisotropic filtering level. */
  anisotropy: number;
  /** DPR clamp passed to R3F `<Canvas dpr={...}>`. */
  dpr: [number, number];
  /** Enable MSAA on the WebGL backbuffer for crisp planetary horizons. */
  antialias: boolean;
  /** Background orbital starfield particle count (`0` on tier-0). */
  starCount: number;
  /** Cloud-cast shadow intensity onto surface (`0` disables extra cloud tap on tier-1). */
  cloudShadowStrength: number;
  /** Subtle luminance-gradient continental micro-relief (`0` disables extra taps on tier-1). */
  reliefStrength: number;
  /** Specular ocean sunglint intensity. */
  oceanSpecularStrength: number;
  /** Enable subtle desktop pointer parallax camera drift. */
  enableParallax: boolean;
}

export function getHeroEarthConfig(profile: QualityProfile): HeroEarthConfig {
  if (!profile.enableWebGL) {
    return {
      enableWebGL: false,
      dayTexture: EARTH_TEXTURES.dayLite,
      nightTexture: EARTH_TEXTURES.night,
      cloudTexture: EARTH_TEXTURES.clouds,
      sphereSegments: 0,
      atmosphereSegments: 0,
      anisotropy: 1,
      dpr: [1, 1],
      antialias: false,
      starCount: 0,
      cloudShadowStrength: 0,
      reliefStrength: 0,
      oceanSpecularStrength: 0,
      enableParallax: false,
    };
  }

  switch (profile.tier) {
    case 'tier-1':
      return {
        enableWebGL: true,
        dayTexture: EARTH_TEXTURES.dayLite,
        nightTexture: EARTH_TEXTURES.night,
        cloudTexture: EARTH_TEXTURES.clouds,
        sphereSegments: 48,
        atmosphereSegments: 36,
        anisotropy: 2,
        dpr: [profile.dpr[0], profile.dpr[1]],
        antialias: true,
        starCount: 320,
        cloudShadowStrength: 0.0,
        reliefStrength: 0.0,
        oceanSpecularStrength: 0.42,
        enableParallax: false,
      };
    case 'tier-2':
      return {
        enableWebGL: true,
        dayTexture: EARTH_TEXTURES.dayStandard,
        nightTexture: EARTH_TEXTURES.night,
        cloudTexture: EARTH_TEXTURES.clouds,
        sphereSegments: 64,
        atmosphereSegments: 48,
        anisotropy: 4,
        dpr: [profile.dpr[0], profile.dpr[1]],
        antialias: true,
        starCount: 700,
        cloudShadowStrength: 0.24,
        reliefStrength: 0.14,
        oceanSpecularStrength: 0.58,
        enableParallax: true,
      };
    case 'tier-3':
    default:
      return {
        enableWebGL: true,
        dayTexture: EARTH_TEXTURES.dayStandard,
        nightTexture: EARTH_TEXTURES.night,
        cloudTexture: EARTH_TEXTURES.clouds,
        sphereSegments: 96,
        atmosphereSegments: 64,
        anisotropy: 8,
        dpr: [profile.dpr[0], profile.dpr[1]],
        antialias: true,
        starCount: 1100,
        cloudShadowStrength: 0.30,
        reliefStrength: 0.20,
        oceanSpecularStrength: 0.68,
        enableParallax: true,
      };
  }
}
