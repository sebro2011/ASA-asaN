/**
 * Adaptive 4-tier GPU quality engine for COSMORA 3D scenes.
 *
 * Pure, DOM-free classification so both React hooks and Node unit tests evaluate
 * identical tier decisions:
 *
 *   tier-0 — Eco / Poster fallback (no WebGL, software rasterizer, Save-Data,
 *            ultra-constrained hardware, or explicit user Eco selection)
 *   tier-1 — Mobile / Lite WebGL (capable phones & 4-core laptops; no shadows
 *            or postprocessing so frame pacing stays near 60 FPS)
 *   tier-2 — Standard Desktop WebGL (full shaders, subtle bloom, no MSAA)
 *   tier-3 — Ultra Cinematic WebGL (high-end multi-core desktop GPUs)
 */

export type GpuTier = 'tier-0' | 'tier-1' | 'tier-2' | 'tier-3';

export type PerformanceMode = 'auto' | 'optimized' | 'high';

export interface HardwareProbe {
  cores: number;
  memoryGB: number | null;
  isMobile: boolean;
  supportsWebGL: boolean;
  supportsWebGL2: boolean;
  gpuRenderer: string;
  isSoftwareWebGL: boolean;
  saveData?: boolean;
}

export interface QualityProfile {
  readonly tier: GpuTier;
  readonly label: string;
  readonly enableWebGL: boolean;
  readonly dpr: readonly [number, number];
  readonly sphereSegments: number;
  readonly atmosphereSegments: number;
  readonly starCount: number;
  readonly enableShadows: boolean;
  readonly shadowMapSize: number;
  readonly enablePostprocessing: boolean;
  readonly postprocessingMultisampling: number;
  readonly enableClouds: boolean;
  readonly enableOrbitTrails: boolean;
  readonly anisotropy: number;
  readonly maxTextureSize: number;
  readonly environmentResolution: number;
}

export interface GpuClassification {
  readonly tier: GpuTier;
  readonly profile: Readonly<QualityProfile>;
  readonly reason: string;
}

const SOFTWARE_RENDERER_PATTERNS: readonly RegExp[] = [
  /swiftshader/i,
  /llvmpipe/i,
  /softpipe/i,
  /software/i,
  /basic render/i,
  /microsoft basic/i,
  /mesa offscreen/i,
];

const HIGH_TIER_GPU_PATTERNS: readonly RegExp[] = [
  /\brtx\b/i,
  /\bgtx\s*(1[06]|20|30|40|50)/i,
  /geforce/i,
  /radeon\s*(rx|pro|vii)/i,
  /apple\s*m[1-9]/i,
  /apple\s*gpu/i,
  /quadro/i,
  /intel.*arc\s*[ab]/i,
];

export const QUALITY_PROFILES: Readonly<Record<GpuTier, Readonly<QualityProfile>>> = Object.freeze({
  'tier-0': Object.freeze({
    tier: 'tier-0',
    label: 'Eco Parallax',
    enableWebGL: false,
    dpr: [1, 1] as const,
    sphereSegments: 0,
    atmosphereSegments: 0,
    starCount: 0,
    enableShadows: false,
    shadowMapSize: 0,
    enablePostprocessing: false,
    postprocessingMultisampling: 0,
    enableClouds: false,
    enableOrbitTrails: false,
    anisotropy: 1,
    maxTextureSize: 1024,
    environmentResolution: 0,
  }),
  'tier-1': Object.freeze({
    tier: 'tier-1',
    label: 'WebGL Lite',
    enableWebGL: true,
    dpr: [1, 1.25] as const,
    sphereSegments: 48,
    atmosphereSegments: 36,
    starCount: 1800,
    enableShadows: false,
    shadowMapSize: 0,
    enablePostprocessing: false,
    postprocessingMultisampling: 0,
    enableClouds: true,
    enableOrbitTrails: false,
    anisotropy: 2,
    maxTextureSize: 1024,
    environmentResolution: 64,
  }),
  'tier-2': Object.freeze({
    tier: 'tier-2',
    label: 'WebGL Standard',
    enableWebGL: true,
    dpr: [1, 1.5] as const,
    sphereSegments: 64,
    atmosphereSegments: 48,
    starCount: 5000,
    enableShadows: false,
    shadowMapSize: 1024,
    enablePostprocessing: true,
    postprocessingMultisampling: 0,
    enableClouds: true,
    enableOrbitTrails: true,
    anisotropy: 4,
    maxTextureSize: 2048,
    environmentResolution: 128,
  }),
  'tier-3': Object.freeze({
    tier: 'tier-3',
    label: 'WebGL Ultra',
    enableWebGL: true,
    dpr: [1, 2] as const,
    sphereSegments: 96,
    atmosphereSegments: 64,
    starCount: 9000,
    enableShadows: true,
    shadowMapSize: 2048,
    enablePostprocessing: true,
    postprocessingMultisampling: 0,
    enableClouds: true,
    enableOrbitTrails: true,
    anisotropy: 8,
    maxTextureSize: 4096,
    environmentResolution: 256,
  }),
});

export function isSoftwareRendererName(renderer: string): boolean {
  if (!renderer) return false;
  return SOFTWARE_RENDERER_PATTERNS.some((pattern) => pattern.test(renderer));
}

export function isHighTierGpuName(renderer: string): boolean {
  if (!renderer || isSoftwareRendererName(renderer)) return false;
  return HIGH_TIER_GPU_PATTERNS.some((pattern) => pattern.test(renderer));
}

export function getQualityProfile(tier: GpuTier): Readonly<QualityProfile> {
  return QUALITY_PROFILES[tier];
}

/**
 * Classifies hardware capabilities and user mode into one of the four quality
 * tiers while honouring explicit Eco/High user overrides safely.
 */
export function classifyGpuTier(
  probe: HardwareProbe,
  userMode: PerformanceMode = 'auto',
): GpuClassification {
  if (!probe.supportsWebGL) {
    return {
      tier: 'tier-0',
      profile: QUALITY_PROFILES['tier-0'],
      reason: 'WebGL unavailable',
    };
  }

  if (userMode === 'optimized') {
    return {
      tier: 'tier-0',
      profile: QUALITY_PROFILES['tier-0'],
      reason: 'Eco Parallax mode enabled',
    };
  }

  const software = probe.isSoftwareWebGL || isSoftwareRendererName(probe.gpuRenderer);
  const highEndDesktop =
    !probe.isMobile &&
    !software &&
    probe.cores >= 8 &&
    (probe.memoryGB === null || probe.memoryGB >= 8) &&
    (isHighTierGpuName(probe.gpuRenderer) || (probe.supportsWebGL2 && probe.cores >= 8));

  if (userMode === 'high') {
    if (software) {
      return {
        tier: 'tier-1',
        profile: QUALITY_PROFILES['tier-1'],
        reason: 'Manual WebGL override on software renderer',
      };
    }
    const targetTier: GpuTier = highEndDesktop ? 'tier-3' : 'tier-2';
    return {
      tier: targetTier,
      profile: QUALITY_PROFILES[targetTier],
      reason: probe.isMobile ? 'Manual high-quality WebGL override (mobile)' : 'Manual high-quality WebGL override',
    };
  }

  // Auto mode classification.
  if (software) {
    return {
      tier: 'tier-0',
      profile: QUALITY_PROFILES['tier-0'],
      reason: 'Software WebGL rasterizer',
    };
  }

  if (probe.saveData) {
    return {
      tier: 'tier-0',
      profile: QUALITY_PROFILES['tier-0'],
      reason: 'Data Saver preference active',
    };
  }

  const ultraLowReasons: string[] = [];
  if (probe.memoryGB !== null && probe.memoryGB <= 2) {
    ultraLowReasons.push(`Low memory (${probe.memoryGB}GB RAM)`);
  }
  if (probe.cores <= 2) {
    ultraLowReasons.push(`Limited CPU (${probe.cores} cores)`);
  }
  if (ultraLowReasons.length > 0) {
    return {
      tier: 'tier-0',
      profile: QUALITY_PROFILES['tier-0'],
      reason: ultraLowReasons.join(' • '),
    };
  }

  const liteReasons: string[] = [];
  if (probe.isMobile) liteReasons.push('Mobile GPU');
  if (probe.memoryGB !== null && probe.memoryGB <= 4) liteReasons.push(`${probe.memoryGB}GB RAM`);
  if (probe.cores <= 4) liteReasons.push(`${probe.cores} CPU cores`);

  if (liteReasons.length > 0) {
    return {
      tier: 'tier-1',
      profile: QUALITY_PROFILES['tier-1'],
      reason: `${liteReasons.join(' • ')} (WebGL Lite)`,
    };
  }

  if (highEndDesktop) {
    return {
      tier: 'tier-3',
      profile: QUALITY_PROFILES['tier-3'],
      reason: 'High-end desktop GPU',
    };
  }

  return {
    tier: 'tier-2',
    profile: QUALITY_PROFILES['tier-2'],
    reason: 'Standard desktop GPU',
  };
}
