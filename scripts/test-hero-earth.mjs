/**
 * Phase 2 — Hero Orbital Earth Cinematic Shader & Tier-Adaptive Verification Suite.
 *
 * Verifies:
 *  1. All Phase 2 GLSL shaders compose with `common.glsl` and pass structural validation.
 *  2. WebGL1 & WebGL2 compatibility (universal GLSL ES 1.00 — no WebGL2-only ops).
 *  3. Real `THREE.ShaderMaterial` instantiation and `.dispose()` lifecycle for surface,
 *     clouds, atmosphere, and orbital starfield programs.
 *  4. BackSide atmosphere shader uses inward-facing `dot(-normal, viewDir)` falloff
 *     (preventing flat outer-rim cutoff artifacts) and sun-aware scattering.
 *  5. 4-tier `getHeroEarthConfig` scaling across tier-0..tier-3 (mobile lite texture,
 *     monotonic geometry/stars/anisotropy, parallax gating).
 *  6. All referenced local NASA Earth textures exist on disk and fit within PWA limits.
 *  7. `OrbitalEarth.tsx` reuses `useDevicePerformance` (no duplicate WebGL context probe),
 *     handles `webglcontextlost`, disposes GPU objects, and `PosterEarth.tsx` stays zero-Three.js.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-hero-earth.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';

import { QUALITY_PROFILES } from '../src/three/quality.ts';
import { EARTH_TEXTURES, getHeroEarthConfig } from '../src/three/earthConfig.ts';
import {
  composeShader,
  createManagedShaderMaterial,
  createUniforms,
  validateGlslSource,
} from '../src/three/shaders/shaderUtils.ts';

const COMMON = readFileSync('src/three/shaders/common.glsl', 'utf8');
const EARTH_VERT = readFileSync('src/three/shaders/earth.vert.glsl', 'utf8');
const EARTH_SURFACE_FRAG = composeShader([
  COMMON,
  readFileSync('src/three/shaders/earthSurface.frag.glsl', 'utf8'),
]);
const EARTH_CLOUDS_FRAG = composeShader([
  COMMON,
  readFileSync('src/three/shaders/earthClouds.frag.glsl', 'utf8'),
]);
const EARTH_ATMO_FRAG = composeShader([
  COMMON,
  readFileSync('src/three/shaders/earthAtmosphere.frag.glsl', 'utf8'),
]);
const STARFIELD_VERT = readFileSync('src/three/shaders/starfield.vert.glsl', 'utf8');
const STARFIELD_FRAG = readFileSync('src/three/shaders/starfield.frag.glsl', 'utf8');

test('all Phase 2 GLSL shaders validate cleanly and stay WebGL1/WebGL2 compatible', () => {
  const programs = [
    ['earth.vert.glsl', EARTH_VERT],
    ['earthSurface.frag.glsl', EARTH_SURFACE_FRAG],
    ['earthClouds.frag.glsl', EARTH_CLOUDS_FRAG],
    ['earthAtmosphere.frag.glsl', EARTH_ATMO_FRAG],
    ['starfield.vert.glsl', STARFIELD_VERT],
    ['starfield.frag.glsl', STARFIELD_FRAG],
  ];

  for (const [name, source] of programs) {
    const res = validateGlslSource(source);
    assert.equal(res.valid, true, `${name} failed validation: ${res.issues.join('; ')}`);
    assert.doesNotMatch(source, /\bdFd[xy]\s*\(/, `${name} must not rely on WebGL1-optional dFdx/dFdy`);
    assert.doesNotMatch(source, /#version\s+300\s+es/, `${name} must stay GLSL ES 1.00 compatible`);
  }
});

test('surface, cloud, atmosphere and starfield shaders implement key Phase 2 physical cues', () => {
  // Surface: ocean sunglint, twilight scattering, cloud shadows, night lights, soft filmic rolloff
  assert.match(EARTH_SURFACE_FRAG, /estimateOceanMask/);
  assert.match(EARTH_SURFACE_FRAG, /uOceanSpecularStrength/);
  assert.match(EARTH_SURFACE_FRAG, /uCloudShadowStrength/);
  assert.match(EARTH_SURFACE_FRAG, /uReliefStrength/);
  assert.match(EARTH_SURFACE_FRAG, /twilightBand/);
  assert.match(EARTH_SURFACE_FRAG, /cosmoraFilmicSoft/);

  // Clouds: terminator sunset tint and grazing-angle limb softening
  assert.match(EARTH_CLOUDS_FRAG, /sunsetBand/);
  assert.match(EARTH_CLOUDS_FRAG, /edgeSoft/);

  // Atmosphere: BackSide inward-facing dot(-normal, viewDir) smooth falloff + solar modulation
  assert.match(EARTH_ATMO_FRAG, /dot\s*\(\s*-normal\s*,\s*viewDir\s*\)/);
  assert.match(EARTH_ATMO_FRAG, /uSunDirection/);
  assert.match(EARTH_ATMO_FRAG, /terminatorCusp/);

  // Starfield: reduced-motion twinkle damping and circular discard
  assert.match(STARFIELD_VERT, /uMotionScale/);
  assert.match(STARFIELD_FRAG, /gl_PointCoord/);
  assert.match(STARFIELD_FRAG, /discard/);
});

test('Phase 2 ShaderMaterials instantiate and dispose cleanly with Three.js', () => {
  const dummyTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const sun = new THREE.Vector3(-0.56, 0.28, 0.78).normalize();

  const surface = createManagedShaderMaterial({
    vertexShader: EARTH_VERT,
    fragmentShader: EARTH_SURFACE_FRAG,
    uniforms: createUniforms({
      uDay: dummyTex,
      uNight: dummyTex,
      uClouds: dummyTex,
      uSunDirection: sun,
      uCloudOffsetU: 0,
      uCloudShadowStrength: 0.24,
      uReliefStrength: 0.14,
      uOceanSpecularStrength: 0.58,
    }),
  });

  const clouds = createManagedShaderMaterial({
    vertexShader: EARTH_VERT,
    fragmentShader: EARTH_CLOUDS_FRAG,
    uniforms: createUniforms({ uClouds: dummyTex, uSunDirection: sun, uOpacity: 0.56 }),
    transparent: true,
    depthWrite: false,
  });

  const atmosphere = createManagedShaderMaterial({
    vertexShader: EARTH_VERT,
    fragmentShader: EARTH_ATMO_FRAG,
    uniforms: createUniforms({ uSunDirection: sun, uIntensity: 1.08 }),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });

  const stars = createManagedShaderMaterial({
    vertexShader: STARFIELD_VERT,
    fragmentShader: STARFIELD_FRAG,
    uniforms: createUniforms({ uTime: 0, uPixelRatio: 1, uMotionScale: 1 }),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  for (const mat of [surface, clouds, atmosphere, stars]) {
    assert.ok(mat instanceof THREE.ShaderMaterial);
    mat.dispose();
  }
  dummyTex.dispose();
});

test('getHeroEarthConfig scales monotonically across all 4 GPU tiers', () => {
  const c0 = getHeroEarthConfig(QUALITY_PROFILES['tier-0']);
  const c1 = getHeroEarthConfig(QUALITY_PROFILES['tier-1']);
  const c2 = getHeroEarthConfig(QUALITY_PROFILES['tier-2']);
  const c3 = getHeroEarthConfig(QUALITY_PROFILES['tier-3']);

  assert.equal(c0.enableWebGL, false);
  assert.equal(c0.sphereSegments, 0);
  assert.equal(c0.starCount, 0);
  assert.equal(c0.enableParallax, false);

  assert.equal(c1.enableWebGL, true);
  assert.equal(c1.dayTexture, EARTH_TEXTURES.dayLite, 'tier-1 mobile must use compact 1024px day texture');
  assert.equal(c1.cloudShadowStrength, 0, 'tier-1 skips extra cloud-shadow surface tap');
  assert.equal(c1.reliefStrength, 0, 'tier-1 skips extra micro-relief surface taps');
  assert.equal(c1.enableParallax, false, 'tier-1 mobile disables pointer parallax');

  assert.equal(c2.dayTexture, EARTH_TEXTURES.dayStandard);
  assert.ok(c2.cloudShadowStrength > 0 && c2.reliefStrength > 0);
  assert.equal(c2.enableParallax, true);

  assert.ok(c1.sphereSegments < c2.sphereSegments && c2.sphereSegments < c3.sphereSegments);
  assert.ok(c1.atmosphereSegments < c2.atmosphereSegments && c2.atmosphereSegments < c3.atmosphereSegments);
  assert.ok(c1.starCount < c2.starCount && c2.starCount < c3.starCount);
  assert.ok(c1.anisotropy < c2.anisotropy && c2.anisotropy < c3.anisotropy);
});

test('every bundled NASA Earth texture referenced by Phase 2 exists locally within PWA limits', () => {
  const MAX_PWA_BYTES = 6 * 1024 * 1024;
  for (const [key, rel] of Object.entries(EARTH_TEXTURES)) {
    assert.ok(rel.startsWith('/textures/earth/'), `${key} must be a local bundled texture`);
    const diskPath = join('public', rel);
    assert.ok(existsSync(diskPath), `missing Earth texture: ${diskPath}`);
    const size = statSync(diskPath).size;
    assert.ok(size > 1024 && size < MAX_PWA_BYTES, `texture ${diskPath} size (${size}) out of PWA bounds`);
  }
});

test('OrbitalEarth and PosterEarth satisfy architecture, leak-safety, and zero-threejs poster contracts', () => {
  const orbitalSrc = readFileSync('src/components/hero/OrbitalEarth.tsx', 'utf8');
  const posterSrc = readFileSync('src/components/hero/PosterEarth.tsx', 'utf8');
  const shaderIndexSrc = readFileSync('src/three/shaders/index.ts', 'utf8');

  // OrbitalEarth uses cached Phase 1 hook (no duplicate probe canvas creation)
  assert.match(orbitalSrc, /useDevicePerformance/);
  assert.match(orbitalSrc, /getHeroEarthConfig/);
  assert.doesNotMatch(orbitalSrc, /createElement\s*\(\s*['"]canvas['"]\s*\)/, 'OrbitalEarth must not duplicate WebGL probe canvas');

  // Context loss resilience, reduced motion, GPU disposal, modular shaders
  assert.match(orbitalSrc, /webglcontextlost/);
  assert.match(orbitalSrc, /webglcontextrestored/);
  assert.match(orbitalSrc, /prefers-reduced-motion/);
  assert.match(orbitalSrc, /\.dispose\(\)/);
  assert.match(orbitalSrc, /EARTH_SURFACE_FRAGMENT_GLSL/);
  assert.match(orbitalSrc, /EARTH_ATMOSPHERE_FRAGMENT_GLSL/);
  assert.match(orbitalSrc, /<PosterEarth/);
  assert.doesNotMatch(orbitalSrc, /https?:\/\//i, 'OrbitalEarth must contain zero external asset URLs');

  // Shader index exports all Phase 2 GLSL programs backed by canonical *.glsl sources
  for (const sym of [
    'EARTH_VERTEX_GLSL',
    'EARTH_SURFACE_FRAGMENT_GLSL',
    'EARTH_CLOUDS_FRAGMENT_GLSL',
    'EARTH_ATMOSPHERE_FRAGMENT_GLSL',
    'STARFIELD_VERTEX_GLSL',
    'STARFIELD_FRAGMENT_GLSL',
  ]) {
    assert.ok(shaderIndexSrc.includes(sym), `src/three/shaders/index.ts must export ${sym}`);
  }

  // PosterEarth stays completely free of Three.js and raw backdrop-blur utilities
  assert.doesNotMatch(posterSrc, /from\s+['"](three|@react-three)/, 'PosterEarth must never import Three.js');
  assert.doesNotMatch(posterSrc, /backdrop-blur-/, 'PosterEarth must never use raw backdrop-blur utilities');
  assert.doesNotMatch(posterSrc, /https?:\/\//i, 'PosterEarth must contain zero external asset URLs');
});
