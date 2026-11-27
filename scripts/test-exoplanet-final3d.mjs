/**
 * Phase 5 — ExoplanetLab Unified 3D Canvas, AdvancedMarsGlobe, FallbackPlanet
 * & Cross-Phase 3D Hardening Verification Suite.
 *
 * Verifies:
 *  1. `classifyExoplanetVisual` classifies hot-jupiter, hycean, tidally-locked,
 *     and temperate-rocky worlds honestly without fabricating missing archive data.
 *  2. `computeDisplayRadius` clamps visual radii cleanly to avoid sphere overlap.
 *  3. `getExoplanetLabConfig` scales monotonically across tier-0..tier-3.
 *  4. `createExoplanetSurfaceTextures` stays SSR/Node-safe when `document` is absent.
 *  5. `ExoplanetLab.jsx` uses a SINGLE unified `<Canvas>` context, real local NASA
 *     `EARTH_TEXTURES.day1024`, Rayleigh `PLANET_ATMOSPHERE_FRAGMENT_GLSL`,
 *     `SpaceEnvironment`, `CinematicPostprocessing`, `DynamicStarfield`,
 *     `useDevicePerformance`, `webglcontextlost`, `prefers-reduced-motion`,
 *     defines `subtitle` in all 3 languages (`en`/`si`/`ta`), and preserves the
 *     scientific honesty disclaimer.
 *  6. `AdvancedMarsGlobe.jsx` uses `PLANET_ATMOSPHERE_FRAGMENT_GLSL` with zero
 *     inverted BackSide `pow()` bugs and disposes GPU textures/materials on unmount.
 *  7. `FallbackPlanet.jsx` clamps frame delta and resets `ModelErrorBoundary` on
 *     `resetKey` changes.
 *  8. Cross-phase audit across all Phase 1–5 3D files: zero external HDRI presets,
 *     zero Unsplash CDN URLs, zero raw `backdrop-blur-*`, and zero `multisampling > 0`.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-exoplanet-final3d.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { QUALITY_PROFILES } from '../src/three/quality.ts';
import {
  classifyExoplanetVisual,
  computeDisplayRadius,
  getExoplanetLabConfig,
} from '../src/three/exoplanetConfig.ts';
import { createExoplanetSurfaceTextures } from '../src/three/textures/proceduralTextures.ts';

test('classifyExoplanetVisual classifies planetary archetypes without fabricating missing data', () => {
  assert.equal(classifyExoplanetVisual({ pl_name: 'HD 189733 b', pl_rade: 12.6, pl_eqt: 1200 }).archetype, 'hot-jupiter');
  assert.equal(classifyExoplanetVisual({ pl_name: 'K2-18 b', pl_rade: 2.61, pl_eqt: 255 }).archetype, 'hycean');
  assert.equal(classifyExoplanetVisual({ pl_name: 'TRAPPIST-1 e', pl_rade: 0.92, pl_eqt: 251 }).archetype, 'tidally-locked');
  assert.equal(classifyExoplanetVisual({ pl_name: 'Kepler-452 b', pl_rade: 1.63, pl_eqt: 265 }).archetype, 'temperate-rocky');
  // Missing/null values fall back cleanly to temperate-rocky without throwing
  assert.equal(classifyExoplanetVisual({ pl_name: 'Unknown b', pl_rade: null, pl_eqt: null }).archetype, 'temperate-rocky');
  assert.equal(classifyExoplanetVisual(null).archetype, 'temperate-rocky');
});

test('computeDisplayRadius clamps safely between 0.55 and 1.85', () => {
  assert.equal(computeDisplayRadius(null), 1.0);
  assert.equal(computeDisplayRadius(NaN), 1.0);
  assert.equal(computeDisplayRadius(0.2), 0.55);
  assert.equal(computeDisplayRadius(12.5), 1.85);
  assert.ok(computeDisplayRadius(1.2) > 0.55 && computeDisplayRadius(1.2) < 1.85);
});

test('getExoplanetLabConfig scales monotonically across all 4 GPU tiers', () => {
  const c0 = getExoplanetLabConfig(QUALITY_PROFILES['tier-0']);
  const c1 = getExoplanetLabConfig(QUALITY_PROFILES['tier-1']);
  const c2 = getExoplanetLabConfig(QUALITY_PROFILES['tier-2']);
  const c3 = getExoplanetLabConfig(QUALITY_PROFILES['tier-3']);

  assert.equal(c0.enableWebGL, false);
  assert.equal(c0.sphereSegments, 0);
  assert.equal(c1.enableWebGL, true);
  assert.equal(c1.enablePostprocessing, false);
  assert.equal(c2.enablePostprocessing, true);
  assert.equal(c3.enablePostprocessing, true);

  assert.ok(c1.sphereSegments < c2.sphereSegments && c2.sphereSegments < c3.sphereSegments);
  assert.ok(c1.starCount < c2.starCount && c2.starCount < c3.starCount);
  assert.ok(c1.environmentResolution < c2.environmentResolution && c2.environmentResolution < c3.environmentResolution);
});

test('createExoplanetSurfaceTextures stays SSR/Node-safe when document is undefined', () => {
  const res = createExoplanetSurfaceTextures('Kepler-452 b', 'temperate-rocky');
  assert.equal(res.albedoMap, null);
  assert.equal(res.bumpMap, null);
  assert.doesNotThrow(() => res.dispose());
});

test('ExoplanetLab uses a single unified Canvas, real NASA Earth texture, Rayleigh shader, and trilingual subtitles', () => {
  const src = readFileSync('src/components/ExoplanetLab.jsx', 'utf8');

  // Exactly ONE <Canvas mounted (eliminating duplicate simultaneous WebGL contexts)
  const canvasMatches = src.match(/<Canvas\b/g) || [];
  assert.equal(canvasMatches.length, 1, `Expected 1 unified <Canvas>, found ${canvasMatches.length}`);

  assert.match(src, /EARTH_TEXTURES\.day1024/);
  assert.match(src, /EARTH_VERTEX_GLSL/);
  assert.match(src, /PLANET_ATMOSPHERE_FRAGMENT_GLSL/);
  assert.match(src, /<SpaceEnvironment\b/);
  assert.match(src, /<CinematicPostprocessing\b/);
  assert.match(src, /<DynamicStarfield\b/);
  assert.match(src, /useDevicePerformance/);
  assert.match(src, /webglcontextlost/);
  assert.match(src, /prefers-reduced-motion/);
  assert.match(src, /Illustrative procedural textures are not observations/);

  // All 3 languages define `subtitle:` (no broken `subheading:` typo)
  const subtitleDefs = src.match(/\bsubtitle:/g) || [];
  assert.equal(subtitleDefs.length, 3, 'en, si, and ta UI objects must all define subtitle');
  assert.doesNotMatch(src, /\bsubheading:/);
});

test('AdvancedMarsGlobe and FallbackPlanet enforce shader correctness, GPU disposal, and resetKey recovery', () => {
  const marsSrc = readFileSync('src/components/planets/AdvancedMarsGlobe.jsx', 'utf8');
  const fallbackSrc = readFileSync('src/components/FallbackPlanet.jsx', 'utf8');

  assert.match(marsSrc, /EARTH_VERTEX_GLSL/);
  assert.match(marsSrc, /PLANET_ATMOSPHERE_FRAGMENT_GLSL/);
  assert.doesNotMatch(marsSrc, /pow\(uCoefficient\s*-\s*dot/);
  assert.match(marsSrc, /marsTexture\?\.dispose\(\)/);
  assert.match(marsSrc, /bumpTexture\?\.dispose\(\)/);
  assert.match(marsSrc, /atmosphereMaterial\.dispose\(\)/);

  assert.match(fallbackSrc, /Math\.min\(rawDelta,\s*0\.1\)/);
  assert.match(fallbackSrc, /prevProps\.resetKey !== this\.props\.resetKey/);
});

test('Cross-phase 3D hardening audit across all Phase 1–5 scenes', () => {
  const files = [
    'src/three/lighting/SpaceEnvironment.tsx',
    'src/three/postprocessing/CinematicPostprocessing.tsx',
    'src/components/hero/OrbitalEarth.tsx',
    'src/components/hero/PosterEarth.tsx',
    'src/components/DynamicStarfield.jsx',
    'src/components/SpaceLab3D.jsx',
    'src/components/CelestialLab3D.jsx',
    'src/components/Space3DViewer.tsx',
    'src/components/LightweightEarthFallback.tsx',
    'src/components/spacecraft/SpacecraftViewer.tsx',
    'src/components/ARPlanetViewer.jsx',
    'src/components/ArModelViewer.jsx',
    'src/components/ExoplanetLab.jsx',
    'src/components/planets/AdvancedMarsGlobe.jsx',
    'src/components/FallbackPlanet.jsx',
  ];

  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    // Strip JS/TS comments so JSDoc references explaining removed anti-patterns don't false-trigger.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
    assert.doesNotMatch(code, /<Environment[^>]*\bpreset=/, `${file} must not fetch external HDRI presets`);
    assert.doesNotMatch(code, /images\.unsplash\.com/, `${file} must not load remote Unsplash images`);
    assert.doesNotMatch(code, /backdrop-blur-/, `${file} must use design-system glass tokens, not raw backdrop-blur-*`);
    assert.doesNotMatch(code, /multisampling=\{\s*[1-9]/, `${file} must keep EffectComposer multisampling at 0`);
  }
});
