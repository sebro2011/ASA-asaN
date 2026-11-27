/**
 * Offline Procedural Planetary Surface & Bump Texture Generators.
 *
 * Zero external network dependencies: produces crisp, deterministic canvas
 * textures for:
 *  - High-relief Lunar regolith (layered maria basins, terraced impact craters
 *    with dark floors and bright ejecta rims, plus a paired height/bump map)
 *  - Fallback Mars & Earth equirectangular maps (only used while local NASA
 *    JPEG/WebP textures finish decoding or if a decode error occurs).
 */

import * as THREE from 'three';
import type { ExoplanetVisualClass } from '../exoplanetConfig';

function hashSeed(label: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < label.length; i += 1) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1337;
}

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LunarTextureSet {
  albedoMap: THREE.CanvasTexture | null;
  bumpMap: THREE.CanvasTexture | null;
  dispose: () => void;
}

/**
 * Generates paired Lunar regolith albedo & crater-relief bump maps locally on
 * an offscreen `<canvas>` (1024×512 to stay lightweight on mobile VRAM).
 */
export function createLunarRegolithTextures(): LunarTextureSet {
  if (typeof document === 'undefined') {
    return { albedoMap: null, bumpMap: null, dispose: () => {} };
  }

  const width = 1024;
  const height = 512;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = width;
  albedoCanvas.height = height;
  const aCtx = albedoCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bCtx = bumpCanvas.getContext('2d');

  if (!aCtx || !bCtx) {
    return { albedoMap: null, bumpMap: null, dispose: () => {} };
  }

  const rng = createSeededRng(19690720);

  // Base highland anorthosite regolith
  const baseGrad = aCtx.createLinearGradient(0, 0, 0, height);
  baseGrad.addColorStop(0, '#9fa8b4');
  baseGrad.addColorStop(0.5, '#8c95a3');
  baseGrad.addColorStop(1, '#9ca4b0');
  aCtx.fillStyle = baseGrad;
  aCtx.fillRect(0, 0, width, height);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // Broad dark basaltic maria basins (Mare Tranquillitatis / Imbrium / Serenitatis style)
  for (let i = 0; i < 24; i += 1) {
    const cx = rng() * width;
    const cy = (0.18 + rng() * 0.64) * height;
    const radius = 38 + rng() * 88;

    const mareGrad = aCtx.createRadialGradient(cx, cy, radius * 0.12, cx, cy, radius);
    mareGrad.addColorStop(0, 'rgba(54, 62, 74, 0.72)');
    mareGrad.addColorStop(0.65, 'rgba(66, 74, 88, 0.42)');
    mareGrad.addColorStop(1, 'rgba(66, 74, 88, 0)');
    aCtx.fillStyle = mareGrad;
    aCtx.beginPath();
    aCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    aCtx.fill();

    const basinBump = bCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    basinBump.addColorStop(0, 'rgba(72, 72, 72, 0.55)');
    basinBump.addColorStop(1, 'rgba(128, 128, 128, 0)');
    bCtx.fillStyle = basinBump;
    bCtx.beginPath();
    bCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    bCtx.fill();
  }

  // Multi-scale terraced impact craters with depressed floors & bright ejecta rims
  const drawCrater = (cx: number, cy: number, radius: number, brightRays: boolean) => {
    // Ejecta rays for prominent young craters (Tycho / Copernicus)
    if (brightRays) {
      const rayGrad = aCtx.createRadialGradient(cx, cy, radius * 0.85, cx, cy, radius * 3.1);
      rayGrad.addColorStop(0, 'rgba(226, 232, 240, 0.32)');
      rayGrad.addColorStop(0.55, 'rgba(203, 213, 225, 0.12)');
      rayGrad.addColorStop(1, 'rgba(203, 213, 225, 0)');
      aCtx.fillStyle = rayGrad;
      aCtx.beginPath();
      aCtx.arc(cx, cy, radius * 3.1, 0, Math.PI * 2);
      aCtx.fill();
    }

    // Albedo: darker inner floor, lighter uplifted rim
    const albedoCrater = aCtx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
    albedoCrater.addColorStop(0, 'rgba(62, 70, 82, 0.65)');
    albedoCrater.addColorStop(0.72, 'rgba(84, 93, 106, 0.45)');
    albedoCrater.addColorStop(0.88, 'rgba(210, 218, 228, 0.55)');
    albedoCrater.addColorStop(1, 'rgba(148, 156, 168, 0)');
    aCtx.fillStyle = albedoCrater;
    aCtx.beginPath();
    aCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    aCtx.fill();

    // Bump: depressed dark bowl surrounded by bright white raised rim
    const bumpCrater = bCtx.createRadialGradient(cx, cy, radius * 0.08, cx, cy, radius * 1.1);
    bumpCrater.addColorStop(0, 'rgba(30, 30, 30, 0.85)');
    bumpCrater.addColorStop(0.68, 'rgba(55, 55, 55, 0.72)');
    bumpCrater.addColorStop(0.86, 'rgba(238, 238, 238, 0.88)');
    bumpCrater.addColorStop(1, 'rgba(128, 128, 128, 0)');
    bCtx.fillStyle = bumpCrater;
    bCtx.beginPath();
    bCtx.arc(cx, cy, radius * 1.1, 0, Math.PI * 2);
    bCtx.fill();
  };

  for (let i = 0; i < 42; i += 1) {
    drawCrater(rng() * width, (0.08 + rng() * 0.84) * height, 14 + rng() * 26, i < 6);
  }
  for (let i = 0; i < 180; i += 1) {
    drawCrater(rng() * width, (0.04 + rng() * 0.92) * height, 3 + rng() * 11, false);
  }

  // Fine regolith micro-grain
  for (let i = 0; i < 700; i += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const r = 0.8 + rng() * 2.1;
    const shade = rng() > 0.5 ? 'rgba(220,226,235,0.22)' : 'rgba(36,42,52,0.26)';
    aCtx.fillStyle = shade;
    aCtx.beginPath();
    aCtx.arc(x, y, r, 0, Math.PI * 2);
    aCtx.fill();

    bCtx.fillStyle = rng() > 0.5 ? 'rgba(185,185,185,0.35)' : 'rgba(65,65,65,0.35)';
    bCtx.beginPath();
    bCtx.arc(x, y, r, 0, Math.PI * 2);
    bCtx.fill();
  }

  const albedoMap = new THREE.CanvasTexture(albedoCanvas);
  albedoMap.colorSpace = THREE.SRGBColorSpace;
  albedoMap.generateMipmaps = true;
  albedoMap.minFilter = THREE.LinearMipmapLinearFilter;
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.ClampToEdgeWrapping;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.generateMipmaps = true;
  bumpMap.minFilter = THREE.LinearMipmapLinearFilter;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.ClampToEdgeWrapping;

  return {
    albedoMap,
    bumpMap,
    dispose: () => {
      albedoMap.dispose();
      bumpMap.dispose();
    },
  };
}

/**
 * Lightweight deterministic fallback surface texture while local NASA imagery
 * decodes (or if an offline decode error occurs).
 */
export function createFallbackPlanetaryTexture(type: 'mars' | 'earth'): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const rng = createSeededRng(type === 'mars' ? 20210218 : 19721207);

  if (type === 'mars') {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#c8b8ab');
    grad.addColorStop(0.08, '#6a2618');
    grad.addColorStop(0.5, '#ba4b24');
    grad.addColorStop(0.92, '#6a2618');
    grad.addColorStop(1, '#d6c8bc');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 95; i += 1) {
      const cx = rng() * canvas.width;
      const cy = (0.1 + rng() * 0.8) * canvas.height;
      const r = 6 + rng() * 28;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, rng() > 0.35 ? 'rgba(66, 24, 15, 0.42)' : 'rgba(218, 128, 68, 0.32)');
      g.addColorStop(1, 'rgba(66, 24, 15, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#0a2342');
    grad.addColorStop(0.5, '#0e3f6e');
    grad.addColorStop(1, '#0a2342');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(45, 98, 56, 0.78)';
    for (let i = 0; i < 60; i += 1) {
      const cx = rng() * canvas.width;
      const cy = (0.14 + rng() * 0.72) * canvas.height;
      const r = 10 + rng() * 30;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export interface ExoplanetTextureSet {
  albedoMap: THREE.CanvasTexture | null;
  bumpMap: THREE.CanvasTexture | null;
  dispose: () => void;
}

/**
 * Generates deterministic, illustrative seeded albedo & relief bump maps for
 * an exoplanet visual class. Purely client-side & SSR-safe (returns null maps
 * when `document` is unavailable).
 */
export function createExoplanetSurfaceTextures(
  planetName: string,
  archetype: ExoplanetVisualClass
): ExoplanetTextureSet {
  if (typeof document === 'undefined') {
    return { albedoMap: null, bumpMap: null, dispose: () => {} };
  }

  const width = 1024;
  const height = 512;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = width;
  albedoCanvas.height = height;
  const aCtx = albedoCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512;
  bumpCanvas.height = 256;
  const bCtx = bumpCanvas.getContext('2d');

  if (!aCtx || !bCtx) {
    return { albedoMap: null, bumpMap: null, dispose: () => {} };
  }

  const rng = createSeededRng(hashSeed(`${planetName}:${archetype}`));
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, bumpCanvas.width, bumpCanvas.height);

  if (archetype === 'hot-jupiter') {
    const grad = aCtx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#3b1505');
    grad.addColorStop(0.18, '#b45309');
    grad.addColorStop(0.36, '#f59e0b');
    grad.addColorStop(0.52, '#92400e');
    grad.addColorStop(0.68, '#fbbf24');
    grad.addColorStop(0.84, '#78350f');
    grad.addColorStop(1, '#3b1505');
    aCtx.fillStyle = grad;
    aCtx.fillRect(0, 0, width, height);

    for (let i = 0; i < 48; i += 1) {
      const y = (i / 48) * height;
      const bandH = 3 + rng() * 14;
      aCtx.fillStyle = i % 2 === 0 ? 'rgba(254, 243, 199, 0.22)' : 'rgba(69, 26, 3, 0.26)';
      aCtx.fillRect(0, y, width, bandH);
      bCtx.fillStyle = i % 2 === 0 ? 'rgba(170,170,170,0.35)' : 'rgba(90,90,90,0.35)';
      bCtx.fillRect(0, y * 0.5, bumpCanvas.width, bandH * 0.5);
    }

    // Anticyclonic storm ovals
    for (let i = 0; i < 9; i += 1) {
      const cx = rng() * width;
      const cy = (0.18 + rng() * 0.64) * height;
      const rx = 24 + rng() * 52;
      const ry = 10 + rng() * 18;
      const storm = aCtx.createRadialGradient(cx, cy, 2, cx, cy, rx);
      storm.addColorStop(0, 'rgba(255, 237, 213, 0.62)');
      storm.addColorStop(0.6, 'rgba(234, 88, 12, 0.38)');
      storm.addColorStop(1, 'rgba(234, 88, 12, 0)');
      aCtx.fillStyle = storm;
      aCtx.beginPath();
      aCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      aCtx.fill();
    }
  } else if (archetype === 'hycean') {
    const grad = aCtx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#082f49');
    grad.addColorStop(0.3, '#0369a1');
    grad.addColorStop(0.5, '#0284c7');
    grad.addColorStop(0.7, '#0369a1');
    grad.addColorStop(1, '#082f49');
    aCtx.fillStyle = grad;
    aCtx.fillRect(0, 0, width, height);

    for (let i = 0; i < 70; i += 1) {
      const cx = rng() * width;
      const cy = (0.08 + rng() * 0.84) * height;
      const rx = 24 + rng() * 84;
      const ry = 10 + rng() * 26;
      const swirl = aCtx.createRadialGradient(cx, cy, 2, cx, cy, rx);
      swirl.addColorStop(0, 'rgba(224, 242, 254, 0.42)');
      swirl.addColorStop(0.65, 'rgba(125, 211, 252, 0.18)');
      swirl.addColorStop(1, 'rgba(125, 211, 252, 0)');
      aCtx.fillStyle = swirl;
      aCtx.beginPath();
      aCtx.ellipse(cx, cy, rx, ry, (rng() - 0.5) * 0.4, 0, Math.PI * 2);
      aCtx.fill();

      bCtx.fillStyle = 'rgba(175, 175, 175, 0.25)';
      bCtx.beginPath();
      bCtx.ellipse(cx * 0.5, cy * 0.5, rx * 0.5, ry * 0.5, 0, 0, Math.PI * 2);
      bCtx.fill();
    }
  } else if (archetype === 'tidally-locked') {
    const grad = aCtx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, '#17153b');
    grad.addColorStop(0.32, '#3b1d52');
    grad.addColorStop(0.47, '#9a3412');
    grad.addColorStop(0.58, '#ea580c');
    grad.addColorStop(0.76, '#c2410c');
    grad.addColorStop(1, '#17153b');
    aCtx.fillStyle = grad;
    aCtx.fillRect(0, 0, width, height);

    for (let i = 0; i < 85; i += 1) {
      const cx = rng() * width;
      const cy = (0.08 + rng() * 0.84) * height;
      const r = 8 + rng() * 34;
      const basin = aCtx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
      basin.addColorStop(0, 'rgba(67, 20, 7, 0.52)');
      basin.addColorStop(0.82, 'rgba(251, 146, 60, 0.28)');
      basin.addColorStop(1, 'rgba(67, 20, 7, 0)');
      aCtx.fillStyle = basin;
      aCtx.beginPath();
      aCtx.arc(cx, cy, r, 0, Math.PI * 2);
      aCtx.fill();

      const bGrad = bCtx.createRadialGradient(cx * 0.5, cy * 0.5, r * 0.1, cx * 0.5, cy * 0.5, r * 0.55);
      bGrad.addColorStop(0, 'rgba(42, 42, 42, 0.72)');
      bGrad.addColorStop(0.85, 'rgba(220, 220, 220, 0.72)');
      bGrad.addColorStop(1, 'rgba(128, 128, 128, 0)');
      bCtx.fillStyle = bGrad;
      bCtx.beginPath();
      bCtx.arc(cx * 0.5, cy * 0.5, r * 0.55, 0, Math.PI * 2);
      bCtx.fill();
    }
  } else {
    // Temperate rocky / Super-Earth illustrative ocean & landmass relief
    const grad = aCtx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#cbd5e1');
    grad.addColorStop(0.1, '#0b3b66');
    grad.addColorStop(0.5, '#0369a1');
    grad.addColorStop(0.9, '#0b3b66');
    grad.addColorStop(1, '#cbd5e1');
    aCtx.fillStyle = grad;
    aCtx.fillRect(0, 0, width, height);

    for (let i = 0; i < 65; i += 1) {
      const cx = rng() * width;
      const cy = (0.14 + rng() * 0.72) * height;
      const rx = 20 + rng() * 68;
      const ry = 14 + rng() * 44;
      aCtx.fillStyle = rng() > 0.35 ? 'rgba(22, 118, 68, 0.85)' : 'rgba(161, 118, 56, 0.76)';
      aCtx.beginPath();
      aCtx.ellipse(cx, cy, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
      aCtx.fill();

      bCtx.fillStyle = 'rgba(215, 215, 215, 0.65)';
      bCtx.beginPath();
      bCtx.ellipse(cx * 0.5, cy * 0.5, rx * 0.5, ry * 0.5, rng() * Math.PI, 0, Math.PI * 2);
      bCtx.fill();
    }

    for (let i = 0; i < 44; i += 1) {
      const cx = rng() * width;
      const cy = (0.08 + rng() * 0.84) * height;
      const rx = 22 + rng() * 72;
      const ry = 8 + rng() * 18;
      const cloud = aCtx.createRadialGradient(cx, cy, 2, cx, cy, rx);
      cloud.addColorStop(0, 'rgba(248, 250, 252, 0.45)');
      cloud.addColorStop(1, 'rgba(248, 250, 252, 0)');
      aCtx.fillStyle = cloud;
      aCtx.beginPath();
      aCtx.ellipse(cx, cy, rx, ry, (rng() - 0.5) * 0.35, 0, Math.PI * 2);
      aCtx.fill();
    }
  }

  const albedoMap = new THREE.CanvasTexture(albedoCanvas);
  albedoMap.colorSpace = THREE.SRGBColorSpace;
  albedoMap.generateMipmaps = true;
  albedoMap.minFilter = THREE.LinearMipmapLinearFilter;
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.ClampToEdgeWrapping;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.generateMipmaps = true;
  bumpMap.minFilter = THREE.LinearMipmapLinearFilter;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.ClampToEdgeWrapping;

  return {
    albedoMap,
    bumpMap,
    dispose: () => {
      albedoMap.dispose();
      bumpMap.dispose();
    },
  };
}
