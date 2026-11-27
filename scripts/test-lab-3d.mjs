/**
 * Phase 3 — SpaceLab3D & CelestialLab3D Cinematic Lighting, Postprocessing &
 * Planetary Realism Verification Suite.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-lab-3d.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import { QUALITY_PROFILES } from '../src/three/quality.ts';
import {
  getLabSceneConfig,
  JWST_HONEYCOMB_OFFSETS,
  LAB_SUN_POSITION,
} from '../src/three/labConfig.ts';
import { EARTH_TEXTURES } from '../src/three/earthConfig.ts';
import {
  createFallbackPlanetaryTexture,
  createLunarRegolithTextures,
} from '../src/three/textures/proceduralTextures.ts';
import {
  composeShader,
  createManagedShaderMaterial,
  createUniforms,
  validateGlslSource,
} from '../src/three/shaders/shaderUtils.ts';

const COMMON = readFileSync('src/three/shaders/common.glsl', 'utf8');
const EARTH_VERT = readFileSync('src/three/shaders/earth.vert.glsl', 'utf8');
const PLANET_ATMO_FRAG = composeShader([
  COMMON,
  readFileSync('src/three/shaders/planetAtmosphere.frag.glsl', 'utf8'),
]);

test('planetAtmosphere.frag.glsl validates cleanly, uses inward BackSide falloff, and builds a ShaderMaterial', () => {
  const res = validateGlslSource(PLANET_ATMO_FRAG);
  assert.equal(res.valid, true, `planetAtmosphere failed validation: ${res.issues.join('; ')}`);
  assert.match(PLANET_ATMO_FRAG, /dot\s*\(\s*-normal\s*,\s*viewDir\s*\)/);
  assert.match(PLANET_ATMO_FRAG, /uSunDirection/);
  assert.doesNotMatch(PLANET_ATMO_FRAG, /\bdFd[xy]\s*\(/);
  assert.doesNotMatch(PLANET_ATMO_FRAG, /#version\s+300\s+es/);

  const mat = createManagedShaderMaterial({
    vertexShader: EARTH_VERT,
    fragmentShader: PLANET_ATMO_FRAG,
    uniforms: createUniforms({
      uSunDirection: new THREE.Vector3(...LAB_SUN_POSITION).normalize(),
      uDayColor: new THREE.Color('#e0733b'),
      uHorizonColor: new THREE.Color('#ffb584'),
      uNightColor: new THREE.Color('#2a120a'),
      uIntensity: 0.92,
      uFalloff: 2.35,
    }),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
  assert.ok(mat instanceof THREE.ShaderMaterial);
  mat.dispose();
});

test('getLabSceneConfig scales monotonically across all 4 GPU tiers and enforces 0 MSAA postprocessing', () => {
  const c0 = getLabSceneConfig(QUALITY_PROFILES['tier-0']);
  const c1 = getLabSceneConfig(QUALITY_PROFILES['tier-1']);
  const c2 = getLabSceneConfig(QUALITY_PROFILES['tier-2']);
  const c3 = getLabSceneConfig(QUALITY_PROFILES['tier-3']);

  for (const cfg of [c0, c1, c2, c3]) {
    assert.equal(cfg.postprocessingMultisampling, 0, 'lab postprocessing must always use multisampling=0');
  }

  assert.equal(c1.enablePostprocessingByDefault, false, 'tier-1 mobile defaults postprocessing off for 60 FPS');
  assert.equal(c2.enablePostprocessingByDefault, true);
  assert.equal(c3.enablePostprocessingByDefault, true);

  assert.equal(c1.enableShadows, false);
  assert.equal(c2.enableShadows, false);
  assert.equal(c3.enableShadows, true);

  assert.equal(c1.earthDayTexture, EARTH_TEXTURES.dayLite);
  assert.equal(c2.earthDayTexture, EARTH_TEXTURES.dayStandard);
  assert.equal(c3.earthDayTexture, EARTH_TEXTURES.dayStandard);

  assert.ok(c0.sphereSegments < c1.sphereSegments && c1.sphereSegments < c2.sphereSegments && c2.sphereSegments < c3.sphereSegments);
  assert.ok(c0.starCount < c1.starCount && c1.starCount < c2.starCount && c2.starCount < c3.starCount);
  assert.ok(c0.anisotropy < c1.anisotropy && c1.anisotropy < c2.anisotropy && c2.anisotropy < c3.anisotropy);
  assert.ok(c0.bloomIntensity < c1.bloomIntensity && c1.bloomIntensity < c2.bloomIntensity && c2.bloomIntensity < c3.bloomIntensity);
});

test('JWST_HONEYCOMB_OFFSETS models all 18 segments with a hollow central aft-optics aperture', () => {
  assert.equal(JWST_HONEYCOMB_OFFSETS.length, 18);
  const hasOrigin = JWST_HONEYCOMB_OFFSETS.some(([x, y]) => x === 0 && y === 0);
  assert.equal(hasOrigin, false, 'JWST center [0,0] must remain open for the aft optical subsystem baffle');
});

test('procedural texture helpers stay SSR/Node-safe when document is undefined', () => {
  const lunar = createLunarRegolithTextures();
  assert.equal(lunar.albedoMap, null);
  assert.equal(lunar.bumpMap, null);
  assert.doesNotThrow(() => lunar.dispose());

  assert.equal(createFallbackPlanetaryTexture('mars'), null);
  assert.equal(createFallbackPlanetaryTexture('earth'), null);
});

test('CinematicPostprocessing enforces multisampling=0, mipmapBlur, and ACES Filmic tone mapping', () => {
  const src = readFileSync('src/three/postprocessing/CinematicPostprocessing.tsx', 'utf8');
  assert.match(src, /multisampling=\{0\}/);
  assert.doesNotMatch(src, /multisampling=\{[1-9]/);
  assert.match(src, /mipmapBlur/);
  assert.match(src, /ToneMappingMode\.ACES_FILMIC/);
});

test('SpaceLab3D and CelestialLab3D eliminate legacy shader/MSAA/IBL bugs and wire Phase 3 contracts', () => {
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const spaceLab = stripComments(readFileSync('src/components/SpaceLab3D.jsx', 'utf8'));
  const celestialLab = stripComments(readFileSync('src/components/CelestialLab3D.jsx', 'utf8'));
  const shaderIndex = readFileSync('src/three/shaders/index.ts', 'utf8');
  const starfield = readFileSync('src/components/DynamicStarfield.jsx', 'utf8');

  assert.ok(shaderIndex.includes('planetAtmosphere.frag.glsl?raw'));

  for (const [name, src] of [
    ['SpaceLab3D.jsx', spaceLab],
    ['CelestialLab3D.jsx', celestialLab],
  ]) {
    assert.match(src, /useDevicePerformance/, `${name} must use adaptive GPU engine`);
    assert.match(src, /getLabSceneConfig/, `${name} must map profile via getLabSceneConfig`);
    assert.match(src, /<SpaceEnvironment\b/, `${name} must render local SpaceEnvironment IBL`);
    assert.match(src, /<CinematicPostprocessing\b/, `${name} must use shared CinematicPostprocessing`);
    assert.match(src, /PLANET_ATMOSPHERE_FRAGMENT_GLSL/, `${name} must use sun-aware planetary atmosphere shader`);
    assert.match(src, /createLunarRegolithTextures/, `${name} must use paired cratered lunar textures`);
    assert.match(src, /webglcontextlost/, `${name} must handle WebGL context loss`);
    assert.match(src, /prefers-reduced-motion/, `${name} must respect prefers-reduced-motion`);
    assert.match(src, /\.dispose\(\)/, `${name} must dispose GPU resources`);
    assert.match(src, /dpr=\{\[1,\s*activeDpr\]\}/, `${name} must wire PerformanceMonitor DPR to Canvas`);

    assert.doesNotMatch(src, /multisampling=\{[1-9]/, `${name} must not enable costly MSAA on EffectComposer`);
    assert.doesNotMatch(src, /<Environment\s+[^>]*preset\s*=/, `${name} must not fetch external HDRI presets`);
    assert.doesNotMatch(src, /0\.72?\s*-\s*dot\s*\(\s*vNormal/, `${name} must not retain broken BackSide Fresnel formula`);
    assert.doesNotMatch(src, /https?:\/\//i, `${name} must contain zero external asset URLs`);
    assert.doesNotMatch(src, /backdrop-blur-/, `${name} must not use raw backdrop-blur utilities`);
  }

  // SpaceLab3D Mars Dust Haze toggle is now wired to the atmosphere mesh
  assert.match(spaceLab, /atmosphereHaze\s*&&\s*!wireframe/);

  // CelestialLab3D UltraEarth uses modular Phase 2 GLSL shaders (not emissive-on-daylight PBR)
  assert.match(celestialLab, /EARTH_SURFACE_FRAGMENT_GLSL/);
  assert.match(celestialLab, /EARTH_CLOUDS_FRAGMENT_GLSL/);
  assert.match(celestialLab, /EARTH_ATMOSPHERE_FRAGMENT_GLSL/);
  assert.doesNotMatch(celestialLab, /bg-surface\/60\/85/);

  // DynamicStarfield disposes geometry/material and supports reducedMotion
  assert.match(starfield, /reducedMotion/);
  assert.match(starfield, /geometry\.dispose\(\)/);
  assert.match(starfield, /material\.dispose\(\)/);
});
