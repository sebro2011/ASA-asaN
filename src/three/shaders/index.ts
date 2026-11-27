/**
 * Modular GLSL entry point for browser/Vite bundles.
 *
 * Imports `.glsl` files using Vite's native `?raw` pipeline so shaders stay
 * zero-plugin, offline-bundled, and CSP-compliant.
 */

import commonGlsl from './common.glsl?raw';
import earthVertexGlsl from './earth.vert.glsl?raw';
import earthSurfaceFragmentGlsl from './earthSurface.frag.glsl?raw';
import earthCloudsFragmentGlsl from './earthClouds.frag.glsl?raw';
import earthAtmosphereFragmentGlsl from './earthAtmosphere.frag.glsl?raw';
import planetAtmosphereFragmentGlsl from './planetAtmosphere.frag.glsl?raw';
import starfieldVertexGlsl from './starfield.vert.glsl?raw';
import starfieldFragmentGlsl from './starfield.frag.glsl?raw';
import { composeShader } from './shaderUtils';

export const COMMON_GLSL: string = commonGlsl;

/** Composed GLSL programs for the Phase 2 Hero Orbital Earth & Celestial Earth scenes. */
export const EARTH_VERTEX_GLSL: string = earthVertexGlsl;
export const EARTH_SURFACE_FRAGMENT_GLSL: string = composeShader([commonGlsl, earthSurfaceFragmentGlsl]);
export const EARTH_CLOUDS_FRAGMENT_GLSL: string = composeShader([commonGlsl, earthCloudsFragmentGlsl]);
export const EARTH_ATMOSPHERE_FRAGMENT_GLSL: string = composeShader([commonGlsl, earthAtmosphereFragmentGlsl]);

/** Composed GLSL program for parameterized planetary/Mars Rayleigh & dust haze shells. */
export const PLANET_ATMOSPHERE_FRAGMENT_GLSL: string = composeShader([commonGlsl, planetAtmosphereFragmentGlsl]);

/** Composed GLSL programs for lightweight orbital background starfields. */
export const STARFIELD_VERTEX_GLSL: string = starfieldVertexGlsl;
export const STARFIELD_FRAGMENT_GLSL: string = starfieldFragmentGlsl;

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
