/**
 * Modular GLSL entry point for browser/Vite bundles and Node/tsx DOM tests.
 *
 * All shader source strings live canonically in `src/three/shaders/*.glsl` and
 * are mirrored byte-for-byte in `./glslSources.ts` (verified in CI by
 * `scripts/test-3d-foundation.mjs`) so React components importing this module
 * work seamlessly in both Vite builds and Node/jsdom tests without custom loaders.
 */

import {
  COMMON_RAW,
  EARTH_ATMOSPHERE_FRAGMENT_RAW,
  EARTH_CLOUDS_FRAGMENT_RAW,
  EARTH_SURFACE_FRAGMENT_RAW,
  EARTH_VERTEX_RAW,
  PLANET_ATMOSPHERE_FRAGMENT_RAW,
  STARFIELD_FRAGMENT_RAW,
  STARFIELD_VERTEX_RAW,
} from './glslSources';
import { composeShader } from './shaderUtils';

export const COMMON_GLSL: string = COMMON_RAW;

/** Composed GLSL programs for the Phase 2 Hero Orbital Earth & Celestial Earth scenes. */
export const EARTH_VERTEX_GLSL: string = EARTH_VERTEX_RAW;
export const EARTH_SURFACE_FRAGMENT_GLSL: string = composeShader([COMMON_RAW, EARTH_SURFACE_FRAGMENT_RAW]);
export const EARTH_CLOUDS_FRAGMENT_GLSL: string = composeShader([COMMON_RAW, EARTH_CLOUDS_FRAGMENT_RAW]);
export const EARTH_ATMOSPHERE_FRAGMENT_GLSL: string = composeShader([COMMON_RAW, EARTH_ATMOSPHERE_FRAGMENT_RAW]);

/** Composed GLSL program for parameterized planetary/Mars/exoplanet Rayleigh & dust haze shells. */
export const PLANET_ATMOSPHERE_FRAGMENT_GLSL: string = composeShader([COMMON_RAW, PLANET_ATMOSPHERE_FRAGMENT_RAW]);

/** Composed GLSL programs for lightweight orbital background starfields. */
export const STARFIELD_VERTEX_GLSL: string = STARFIELD_VERTEX_RAW;
export const STARFIELD_FRAGMENT_GLSL: string = STARFIELD_FRAGMENT_RAW;

export {
  composeShader,
  createManagedShaderMaterial,
  createUniforms,
  validateGlslSource,
  type ManagedShaderOptions,
  type ShaderUniformMap,
  type ShaderUniformValue,
  type ShaderValidationResult,
} from './shaderUtils';
