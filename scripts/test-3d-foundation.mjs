/**
 * Phase 1 — 3D Foundation Verification Suite.
 *
 * Verifies:
 *  1. Adaptive 4-tier GPU quality classification (mobile, low-end, software, Eco, desktop).
 *  2. WebGL probe context release (`WEBGL_lose_context`) & resize caching (zero context leaks).
 *  3. Modular GLSL infrastructure (`?raw` types, shared `common.glsl`, composition & validation).
 *  4. Zero external HDRI (`preset=`) dependencies in `SpaceEnvironment` and `SpaceLab3D`.
 *  5. Zero external Unsplash URLs in `LightweightEarthFallback` and verified local NASA textures.
 *  6. `@types/three` minor-version alignment with runtime `three`.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-3d-foundation.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';

import {
  classifyGpuTier,
  getQualityProfile,
  isHighTierGpuName,
  isSoftwareRendererName,
  QUALITY_PROFILES,
} from '../src/three/quality.ts';
import {
  probeWebGLCapabilities,
  resetWebGLProbeCache,
} from '../src/hooks/useDevicePerformance.ts';
import {
  composeShader,
  createManagedShaderMaterial,
  createUniforms,
  validateGlslSource,
} from '../src/three/shaders/shaderUtils.ts';

/* ----------------------------------------------------- 1. 4-tier GPU engine */

const BASE_DESKTOP = {
  cores: 8,
  memoryGB: 16,
  isMobile: false,
  supportsWebGL: true,
  supportsWebGL2: true,
  gpuRenderer: 'ANGLE (Apple, Apple M3 Pro, OpenGL 4.1)',
  isSoftwareWebGL: false,
  saveData: false,
};

test('no WebGL always classifies as tier-0 even under high override', () => {
  const probe = { ...BASE_DESKTOP, supportsWebGL: false, supportsWebGL2: false };
  assert.equal(classifyGpuTier(probe, 'auto').tier, 'tier-0');
  assert.equal(classifyGpuTier(probe, 'high').tier, 'tier-0');
  assert.equal(classifyGpuTier(probe, 'high').profile.enableWebGL, false);
});

test('Eco mode (optimized) forces tier-0 on any hardware', () => {
  const res = classifyGpuTier(BASE_DESKTOP, 'optimized');
  assert.equal(res.tier, 'tier-0');
  assert.equal(res.profile.enableWebGL, false);
  assert.match(res.reason, /Eco Parallax/i);
});

test('software WebGL renderers fall back to tier-0 in auto mode and tier-1 on manual high override', () => {
  for (const renderer of ['Google SwiftShader', 'llvmpipe (LLVM 15.0)', 'Microsoft Basic Render Driver']) {
    assert.equal(isSoftwareRendererName(renderer), true, `should detect software renderer: ${renderer}`);
    const probe = { ...BASE_DESKTOP, gpuRenderer: renderer, isSoftwareWebGL: true };
    const autoRes = classifyGpuTier(probe, 'auto');
    assert.equal(autoRes.tier, 'tier-0', `${renderer} must map to tier-0 in auto`);
    assert.equal(autoRes.profile.enableWebGL, false);

    const manualRes = classifyGpuTier(probe, 'high');
    assert.equal(manualRes.tier, 'tier-1', `${renderer} manual override stays conservative (tier-1)`);
  }
});

test('Data Saver and ultra-low-end devices fall back safely to tier-0', () => {
  assert.equal(classifyGpuTier({ ...BASE_DESKTOP, saveData: true }, 'auto').tier, 'tier-0');
  assert.equal(classifyGpuTier({ ...BASE_DESKTOP, isMobile: true, cores: 2, memoryGB: 2 }, 'auto').tier, 'tier-0');
  assert.equal(classifyGpuTier({ ...BASE_DESKTOP, isMobile: true, cores: 4, memoryGB: 2 }, 'auto').tier, 'tier-0');
});

test('capable mobile devices and 4-core laptops receive tier-1 WebGL Lite instead of being locked out', () => {
  const iphoneLike = {
    cores: 6,
    memoryGB: null, // Safari omits navigator.deviceMemory
    isMobile: true,
    supportsWebGL: true,
    supportsWebGL2: true,
    gpuRenderer: 'Apple GPU',
    isSoftwareWebGL: false,
  };
  const mobileRes = classifyGpuTier(iphoneLike, 'auto');
  assert.equal(mobileRes.tier, 'tier-1');
  assert.equal(mobileRes.profile.enableWebGL, true);
  assert.deepEqual(mobileRes.profile.dpr, [1, 1.25]);
  assert.equal(mobileRes.profile.enablePostprocessing, false);
  assert.equal(mobileRes.profile.enableShadows, false);

  // Explicit user 'high' override on capable mobile promotes to tier-2.
  const mobileHigh = classifyGpuTier(iphoneLike, 'high');
  assert.equal(mobileHigh.tier, 'tier-2');

  // 4-core laptop gets WebGL Lite in auto mode.
  const laptop4Core = { ...BASE_DESKTOP, cores: 4, memoryGB: 8, gpuRenderer: 'Intel Iris Xe' };
  assert.equal(classifyGpuTier(laptop4Core, 'auto').tier, 'tier-1');
});

test('standard desktops classify as tier-2 and high-end GPUs classify as tier-3', () => {
  const standardDesktop = {
    cores: 6,
    memoryGB: 8,
    isMobile: false,
    supportsWebGL: true,
    supportsWebGL2: true,
    gpuRenderer: 'Intel UHD Graphics 770',
    isSoftwareWebGL: false,
  };
  assert.equal(classifyGpuTier(standardDesktop, 'auto').tier, 'tier-2');

  assert.equal(isHighTierGpuName('NVIDIA GeForce RTX 4070'), true);
  assert.equal(isHighTierGpuName('Apple M3 Pro'), true);
  assert.equal(classifyGpuTier(BASE_DESKTOP, 'auto').tier, 'tier-3');
});

test('quality profiles scale monotonically and avoid costly MSAA postprocessing', () => {
  const t0 = getQualityProfile('tier-0');
  const t1 = getQualityProfile('tier-1');
  const t2 = getQualityProfile('tier-2');
  const t3 = getQualityProfile('tier-3');

  assert.ok(t0.sphereSegments < t1.sphereSegments && t1.sphereSegments < t2.sphereSegments && t2.sphereSegments < t3.sphereSegments);
  assert.ok(t0.starCount < t1.starCount && t1.starCount < t2.starCount && t2.starCount < t3.starCount);
  for (const profile of Object.values(QUALITY_PROFILES)) {
    assert.equal(profile.postprocessingMultisampling, 0, `${profile.tier} must keep postprocessing multisampling at 0`);
  }
});

/* ------------------------------------------- 2. WebGL context leak fix */

test('probeWebGLCapabilities releases WebGL context immediately and caches across calls', () => {
  resetWebGLProbeCache();
  let getContextCalls = 0;
  let loseContextCalls = 0;

  const mockCanvasFactory = () => ({
    getContext(id) {
      getContextCalls += 1;
      if (id !== 'webgl2') return null;
      return {
        getExtension(name) {
          if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_RENDERER_WEBGL: 0x9246 };
          if (name === 'WEBGL_lose_context') {
            return {
              loseContext() {
                loseContextCalls += 1;
              },
            };
          }
          return null;
        },
        getParameter(pname) {
          return pname === 0x9246 ? 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)' : null;
        },
      };
    },
  });

  const first = probeWebGLCapabilities({ createCanvas: mockCanvasFactory });
  assert.equal(first.supportsWebGL, true);
  assert.equal(first.supportsWebGL2, true);
  assert.equal(first.isSoftwareWebGL, false);
  assert.match(first.gpuRenderer, /RTX 3060/);
  assert.equal(getContextCalls, 1);
  assert.equal(loseContextCalls, 1, 'probe must immediately call loseContext() to prevent context leaks');

  // Repeated probes (e.g., debounced resize) must reuse cache and never allocate another context.
  const second = probeWebGLCapabilities({ createCanvas: mockCanvasFactory });
  const third = probeWebGLCapabilities({ createCanvas: mockCanvasFactory });
  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
  assert.equal(getContextCalls, 1, 'cached probe must not allocate additional WebGL contexts');
  assert.equal(loseContextCalls, 1);

  // Forced recheck allocates once and releases once.
  const forced = probeWebGLCapabilities({ force: true, createCanvas: mockCanvasFactory });
  assert.equal(forced.supportsWebGL, true);
  assert.equal(getContextCalls, 2);
  assert.equal(loseContextCalls, 2);
  resetWebGLProbeCache();
});

test('probeWebGLCapabilities handles WebGL1 fallback, software GPU and unavailable WebGL', () => {
  resetWebGLProbeCache();

  // WebGL1 software fallback
  const sw = probeWebGLCapabilities({
    force: true,
    createCanvas: () => ({
      getContext(id) {
        if (id === 'webgl2') return null;
        if (id === 'webgl') {
          return {
            getExtension(name) {
              if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_RENDERER_WEBGL: 0x9246 };
              if (name === 'WEBGL_lose_context') return { loseContext() {} };
              return null;
            },
            getParameter() {
              return 'Google SwiftShader';
            },
          };
        }
        return null;
      },
    }),
  });
  assert.equal(sw.supportsWebGL, true);
  assert.equal(sw.supportsWebGL2, false);
  assert.equal(sw.isSoftwareWebGL, true);

  // No WebGL available at all
  const none = probeWebGLCapabilities({
    force: true,
    createCanvas: () => ({ getContext: () => null }),
  });
  assert.equal(none.supportsWebGL, false);
  assert.equal(none.supportsWebGL2, false);
  resetWebGLProbeCache();
});

/* ------------------------------------------- 3. Modular GLSL infrastructure */

test('GLSL infrastructure files, ?raw typings, composer and validator work end-to-end', () => {
  const glslTypes = readFileSync('src/types/glsl.d.ts', 'utf8');
  for (const mod of ['*.glsl?raw', '*.vert?raw', '*.frag?raw']) {
    assert.ok(glslTypes.includes(mod), `src/types/glsl.d.ts must declare ${mod}`);
  }

  const shaderIndex = readFileSync('src/three/shaders/index.ts', 'utf8');
  assert.match(shaderIndex, /common\.glsl\?raw/, 'shader index must import common.glsl via native Vite ?raw');

  const commonGlsl = readFileSync('src/three/shaders/common.glsl', 'utf8');
  assert.equal(validateGlslSource(commonGlsl, { requireMain: false }).valid, true);
  assert.match(commonGlsl, /cosmoraFresnel/);
  assert.match(commonGlsl, /cosmoraTerminator/);

  const composed = composeShader([
    commonGlsl,
    `
      varying vec3 vNormal;
      void main() {
        float rim = cosmoraFresnel(vNormal, vec3(0.0, 0.0, 1.0), 2.5);
        gl_FragColor = vec4(vec3(rim), 1.0);
      }
    `,
  ]);
  assert.equal(validateGlslSource(composed).valid, true);

  // Guard for the guard: malformed GLSL must fail validation.
  assert.equal(validateGlslSource('').valid, false);
  assert.equal(validateGlslSource('float x = 1.0;').valid, false);
  assert.equal(validateGlslSource('void main() { float x = 1.0;').valid, false);

  // Material factory produces a typed THREE.ShaderMaterial with working uniforms.
  const uniforms = createUniforms({
    uTime: 0,
    uColor: new THREE.Color('#5ed3f2'),
  });
  const material = createManagedShaderMaterial({
    vertexShader: 'void main() { gl_Position = vec4(position, 1.0); }',
    fragmentShader: composed,
    uniforms,
    transparent: true,
    depthWrite: false,
  });
  assert.ok(material instanceof THREE.ShaderMaterial);
  assert.equal(material.transparent, true);
  assert.equal(material.depthWrite, false);
  material.dispose();
});

/* ------------------------------------------- 4. Zero external HDRI & Unsplash */

test('SpaceEnvironment and SpaceLab3D have zero external HDRI presets or remote CDN fetches', () => {
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const spaceEnv = stripComments(readFileSync('src/three/lighting/SpaceEnvironment.tsx', 'utf8'));
  assert.match(spaceEnv, /<Environment\b/, 'SpaceEnvironment must render local drei Environment');
  assert.match(spaceEnv, /<Lightformer\b/, 'SpaceEnvironment must use procedural Lightformers');
  assert.doesNotMatch(spaceEnv, /\bpreset\s*=/, 'SpaceEnvironment must never use remote CDN presets');
  assert.doesNotMatch(spaceEnv, /https?:\/\//, 'SpaceEnvironment must contain no remote URLs');

  const spaceLab = stripComments(readFileSync('src/components/SpaceLab3D.jsx', 'utf8'));
  assert.match(spaceLab, /SpaceEnvironment/, 'SpaceLab3D must use local SpaceEnvironment');
  assert.doesNotMatch(spaceLab, /<Environment\s+[^>]*preset\s*=/, 'SpaceLab3D must not fetch remote HDRI presets');
  assert.doesNotMatch(spaceLab, /https?:\/\/[^\s'"]+\.(hdr|exr)/i, 'SpaceLab3D must not fetch remote HDRI/EXR files');
});

test('LightweightEarthFallback uses only local bundled NASA textures and zero Unsplash URLs', () => {
  const fallbackSrc = readFileSync('src/components/LightweightEarthFallback.tsx', 'utf8');
  assert.doesNotMatch(fallbackSrc, /unsplash\.com/i, 'LightweightEarthFallback must not reference Unsplash');
  assert.doesNotMatch(fallbackSrc, /https?:\/\//i, 'LightweightEarthFallback must not reference external URLs');

  const localPaths = [...fallbackSrc.matchAll(/['"](\/textures\/[^'"]+)['"]/g)].map((m) => m[1]);
  assert.ok(localPaths.length >= 2, 'LightweightEarthFallback should reference local NASA textures');

  const MAX_PWA_BYTES = 6 * 1024 * 1024;
  for (const rel of localPaths) {
    const diskPath = join('public', rel);
    assert.ok(existsSync(diskPath), `missing local texture asset: ${diskPath}`);
    const size = statSync(diskPath).size;
    assert.ok(size > 1024 && size < MAX_PWA_BYTES, `asset ${diskPath} size (${size}) out of PWA bounds`);
  }
});

/* ------------------------------------------- 5. Dependency alignment */

test('@types/three stays minor-aligned with runtime three (0.183.x)', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const runtimeRange = pkg.dependencies.three;
  const typesRange = pkg.devDependencies['@types/three'];
  assert.match(runtimeRange, /0\.183\./, `expected runtime three 0.183.x, got ${runtimeRange}`);
  assert.match(typesRange, /0\.183\./, `expected @types/three 0.183.x to match runtime, got ${typesRange}`);
});
