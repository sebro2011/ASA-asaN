/**
 * Phase 4 — Spacecraft Viewer, GLB/USDZ Assets & AR Planet Viewer Verification Suite.
 *
 * Verifies:
 *  1. Shared `SPACECRAFT_CATALOG` integrity (5 NASA craft, trilingual copy, specs,
 *     exact match with `public/models/manifest.json`).
 *  2. Binary validity & PWA size budgets for every `.glb` (`glTF` magic) and `.usdz`
 *     (`PK` archive header) file under `public/models/`.
 *  3. 4-tier `getSpacecraftViewerConfig` scaling (`tier-0` Eco fallback, `tier-1`
 *     WebGL Lite without heavy postprocessing/shadows, `tier-2`/`tier-3` full studio).
 *  4. `isSafeModelUrl` protocol & extension guard for custom AR `.glb`/`.gltf` URLs.
 *  5. `SpacecraftViewer.tsx`, `ARPlanetViewer.jsx`, and `ArModelViewer.jsx` contracts
 *     (local `SpaceEnvironment`, baked `ContactShadows frames={1}`, `CinematicPostprocessing`,
 *     `ModelErrorBoundary`, `webglcontextlost`, `prefers-reduced-motion`, ACES tone-mapping,
 *     zero broken opacity typos, zero raw `backdrop-blur-*`).
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-spacecraft-ar.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { QUALITY_PROFILES } from '../src/three/quality.ts';
import {
  getSpacecraftViewerConfig,
  isSafeModelUrl,
  SPACECRAFT_CATALOG,
} from '../src/three/spacecraftCatalog.ts';

test('SPACECRAFT_CATALOG matches public/models/manifest.json with complete trilingual metadata & NASA specs', () => {
  const manifest = JSON.parse(readFileSync('public/models/manifest.json', 'utf8'));
  assert.equal(SPACECRAFT_CATALOG.length, 5);
  assert.equal(manifest.length, 5);

  const manifestById = new Map(manifest.map((m) => [m.id, m]));
  for (const craft of SPACECRAFT_CATALOG) {
    const entry = manifestById.get(craft.id);
    assert.ok(entry, `manifest.json missing ${craft.id}`);
    assert.equal(craft.glb, entry.glb);
    assert.equal(craft.usdz, entry.usdz);
    for (const lang of ['en', 'si', 'ta']) {
      assert.ok(craft.name[lang].trim().length > 0, `${craft.id} missing name.${lang}`);
      assert.ok(craft.detail[lang].trim().length > 0, `${craft.id} missing detail.${lang}`);
    }
    assert.ok(craft.specs.orbit && craft.specs.launchYear && craft.specs.dimensions && craft.specs.mass);
  }
});

test('all exported GLB and USDZ binaries exist, carry valid magic headers, and stay compact for PWA precache', () => {
  let totalGlbBytes = 0;
  const MAX_PWA_FILE_BYTES = 6 * 1024 * 1024;

  for (const craft of SPACECRAFT_CATALOG) {
    const glbDisk = join('public', craft.glb);
    const usdzDisk = join('public', craft.usdz);
    assert.ok(existsSync(glbDisk), `missing GLB file: ${glbDisk}`);
    assert.ok(existsSync(usdzDisk), `missing USDZ file: ${usdzDisk}`);

    const glbBuf = readFileSync(glbDisk);
    assert.equal(glbBuf.subarray(0, 4).toString('ascii'), 'glTF', `${glbDisk} must start with glTF binary header`);
    assert.ok(glbBuf.byteLength > 10_000 && glbBuf.byteLength < MAX_PWA_FILE_BYTES);
    totalGlbBytes += glbBuf.byteLength;

    const usdzBuf = readFileSync(usdzDisk);
    assert.equal(usdzBuf.subarray(0, 2).toString('ascii'), 'PK', `${usdzDisk} must start with ZIP/USDZ PK signature`);
    assert.ok(usdzBuf.byteLength > 10_000 && usdzBuf.byteLength < MAX_PWA_FILE_BYTES);
    assert.ok(statSync(usdzDisk).size === usdzBuf.byteLength);
  }

  assert.ok(
    totalGlbBytes < 500_000,
    `total GLB payload (${totalGlbBytes} B) should stay under 500 KB for fast mobile loads`
  );
});

test('getSpacecraftViewerConfig scales cleanly across tier-0 through tier-3', () => {
  const c0 = getSpacecraftViewerConfig(QUALITY_PROFILES['tier-0']);
  const c1 = getSpacecraftViewerConfig(QUALITY_PROFILES['tier-1']);
  const c2 = getSpacecraftViewerConfig(QUALITY_PROFILES['tier-2']);
  const c3 = getSpacecraftViewerConfig(QUALITY_PROFILES['tier-3']);

  assert.equal(c0.enableWebGL, false);
  assert.equal(c0.starCount, 0);
  assert.equal(c0.environmentResolution, 0);

  assert.equal(c1.enableWebGL, true);
  assert.equal(c1.enableContactShadows, false, 'tier-1 skips extra shadow pass');
  assert.equal(c1.enablePostprocessing, false, 'tier-1 skips postprocessing composer');
  assert.equal(c1.enableShadows, false);

  assert.equal(c2.enableContactShadows, true);
  assert.equal(c2.enablePostprocessing, true);
  assert.equal(c2.enableShadows, false);

  assert.equal(c3.enableShadows, true);
  assert.ok(c1.environmentResolution < c2.environmentResolution && c2.environmentResolution < c3.environmentResolution);
  assert.ok(c1.starCount < c2.starCount && c2.starCount < c3.starCount);
});

test('isSafeModelUrl accepts valid https/local GLB & GLTF paths and rejects unsafe schemes', () => {
  assert.equal(isSafeModelUrl('/models/jwst.glb'), true);
  assert.equal(isSafeModelUrl('/models/iss.gltf?v=2'), true);
  assert.equal(isSafeModelUrl('https://assets.nasa.gov/models/rover.glb'), true);
  assert.equal(isSafeModelUrl('https://example.org/craft/apollo.gltf?download=1'), true);

  assert.equal(isSafeModelUrl(''), false);
  assert.equal(isSafeModelUrl('javascript:alert(1)//.glb'), false);
  assert.equal(isSafeModelUrl('data:model/gltf-binary;base64,AAAA'), false);
  assert.equal(isSafeModelUrl('http://insecure.example/rover.glb'), false);
  assert.equal(isSafeModelUrl('//evil.example/rover.glb'), false);
  assert.equal(isSafeModelUrl('https://example.org/not-a-model.png'), false);
});

test('SpacecraftViewer, ARPlanetViewer, and ArModelViewer satisfy Phase 4 engineering contracts', () => {
  const viewerSrc = readFileSync('src/components/spacecraft/SpacecraftViewer.tsx', 'utf8');
  const arPlanetSrc = readFileSync('src/components/ARPlanetViewer.jsx', 'utf8');
  const arModelSrc = readFileSync('src/components/ArModelViewer.jsx', 'utf8');

  // SpacecraftViewer studio lighting, baked ContactShadows, error boundary, resilience
  assert.match(viewerSrc, /SPACECRAFT_CATALOG/);
  assert.match(viewerSrc, /getSpacecraftViewerConfig/);
  assert.match(viewerSrc, /<SpaceEnvironment\b/);
  assert.match(viewerSrc, /<CinematicPostprocessing\b/);
  assert.match(viewerSrc, /<DynamicStarfield\b/);
  assert.match(viewerSrc, /<ModelErrorBoundary\b/);
  assert.match(viewerSrc, /<ContactShadows[\s\S]*frames=\{1\}/, 'ContactShadows must bake once (frames={1}) instead of every frame');
  assert.match(viewerSrc, /webglcontextlost/);
  assert.match(viewerSrc, /prefers-reduced-motion/);
  assert.doesNotMatch(viewerSrc, /backdrop-blur-/);

  // ARPlanetViewer fixed broken double-opacity surface typos & respects reduced motion
  assert.doesNotMatch(arPlanetSrc, /bg-surface\/60\/(85|95)/);
  assert.match(arPlanetSrc, /prefers-reduced-motion/);
  assert.doesNotMatch(arPlanetSrc, /backdrop-blur-/);

  // ArModelViewer shares SPACECRAFT_CATALOG, validates URLs, uses ACES tone mapping, accessible toolbar
  assert.match(arModelSrc, /SPACECRAFT_CATALOG/);
  assert.match(arModelSrc, /export const DEFAULT_AR_MODELS/);
  assert.match(arModelSrc, /isSafeModelUrl/);
  assert.match(arModelSrc, /tone-mapping=\{STATIC_CONFIG\.toneMapping\}/);
  assert.match(arModelSrc, /prefers-reduced-motion/);
  assert.match(arModelSrc, /aria-label="Toggle auto-rotation"/);
  assert.match(arModelSrc, /aria-label="Reset camera view"/);
  assert.doesNotMatch(arModelSrc, /backdrop-blur-/);
});
