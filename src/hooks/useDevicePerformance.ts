import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  classifyGpuTier,
  isSoftwareRendererName,
  QUALITY_PROFILES,
  type GpuTier,
  type PerformanceMode,
  type QualityProfile,
} from '../three/quality';

export type { GpuTier, PerformanceMode, QualityProfile } from '../three/quality';

export interface WebGLProbeResult {
  supportsWebGL: boolean;
  supportsWebGL2: boolean;
  gpuRenderer: string;
  isSoftwareWebGL: boolean;
}

export interface DeviceSpecs {
  cores: number;
  memoryGB: number | null;
  isMobile: boolean;
  isLowEndDevice: boolean;
  supportsWebGL: boolean;
  supportsWebGL2: boolean;
  gpuRenderer?: string;
  isSoftwareWebGL?: boolean;
  reason: string;
}

export interface UseDevicePerformanceReturn extends DeviceSpecs {
  isOptimizedModeActive: boolean;
  gpuTier: GpuTier;
  qualityProfile: Readonly<QualityProfile>;
  userMode: PerformanceMode;
  setUserMode: (mode: PerformanceMode) => void;
  togglePerfMode: () => void;
  recheckPerformance: () => void;
}

interface ProbeableCanvas {
  getContext: (contextId: string) => unknown;
}

interface MinimalWebGLContext {
  getExtension: (name: string) => unknown;
  getParameter: (pname: number) => unknown;
}

interface DebugRendererInfoExtension {
  UNMASKED_RENDERER_WEBGL: number;
}

interface LoseContextExtension {
  loseContext: () => void;
}

interface NavigatorWithDeviceHints extends Navigator {
  deviceMemory?: number;
  connection?: {
    saveData?: boolean;
  };
}

const STORAGE_KEY = 'nasa_space_perf_mode';

let cachedWebGLProbe: WebGLProbeResult | null = null;

/** Clears the cached WebGL capability probe (used by manual rechecks and tests). */
export function resetWebGLProbeCache(): void {
  cachedWebGLProbe = null;
}

function isMinimalWebGLContext(value: unknown): value is MinimalWebGLContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as MinimalWebGLContext).getExtension === 'function' &&
    typeof (value as MinimalWebGLContext).getParameter === 'function'
  );
}

/**
 * Probes WebGL / WebGL2 support and unmasked GPU renderer name without leaking
 * contexts. The temporary context is immediately released via
 * `WEBGL_lose_context` and the result is memoized across viewport resizes.
 */
export function probeWebGLCapabilities(options: {
  force?: boolean;
  createCanvas?: () => ProbeableCanvas;
} = {}): WebGLProbeResult {
  const { force = false, createCanvas } = options;

  if (!force && cachedWebGLProbe) {
    return cachedWebGLProbe;
  }

  const fallback: WebGLProbeResult = {
    supportsWebGL: false,
    supportsWebGL2: false,
    gpuRenderer: 'Unavailable',
    isSoftwareWebGL: false,
  };

  const factory =
    createCanvas ??
    (typeof document !== 'undefined' ? () => document.createElement('canvas') : null);

  if (!factory) {
    return fallback;
  }

  let gl: MinimalWebGLContext | null = null;
  let supportsWebGL2 = false;
  let gpuRenderer = 'Default WebGL';
  let isSoftwareWebGL = false;

  try {
    const canvas = factory();
    const webgl2 = canvas.getContext('webgl2');
    if (isMinimalWebGLContext(webgl2)) {
      gl = webgl2;
      supportsWebGL2 = true;
    } else {
      const webgl1 = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (isMinimalWebGLContext(webgl1)) {
        gl = webgl1;
      }
    }

    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info') as DebugRendererInfoExtension | null;
      if (debugInfo && typeof debugInfo.UNMASKED_RENDERER_WEBGL === 'number') {
        const rawRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        if (typeof rawRenderer === 'string' && rawRenderer.trim()) {
          gpuRenderer = rawRenderer.trim();
          isSoftwareWebGL = isSoftwareRendererName(gpuRenderer);
        }
      }
    }
  } catch {
    // WebGL context creation failed or blocked by browser policy.
  } finally {
    if (gl) {
      try {
        const lose = gl.getExtension('WEBGL_lose_context') as LoseContextExtension | null;
        lose?.loseContext();
      } catch {
        // Ignore cleanup errors from stripped or synthetic contexts.
      }
    }
  }

  const result: WebGLProbeResult = gl
    ? {
        supportsWebGL: true,
        supportsWebGL2,
        gpuRenderer,
        isSoftwareWebGL,
      }
    : fallback;

  cachedWebGLProbe = result;
  return result;
}

const MOBILE_UA_REGEX =
  /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i;

function readSavedUserMode(): PerformanceMode {
  if (typeof window === 'undefined') return 'auto';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'auto' || saved === 'optimized' || saved === 'high') {
      return saved;
    }
  } catch {
    // Storage unavailable (private browsing / sandbox).
  }
  return 'auto';
}

interface RawHardwareState {
  cores: number;
  memoryGB: number | null;
  isMobile: boolean;
  supportsWebGL: boolean;
  supportsWebGL2: boolean;
  gpuRenderer: string;
  isSoftwareWebGL: boolean;
  saveData: boolean;
  detected: boolean;
}

const INITIAL_HARDWARE: RawHardwareState = {
  cores: 4,
  memoryGB: null,
  isMobile: false,
  supportsWebGL: true,
  supportsWebGL2: true,
  gpuRenderer: 'Default WebGL',
  isSoftwareWebGL: false,
  saveData: false,
  detected: false,
};

/**
 * Detects device hardware specifications and maps them onto the 4-tier GPU
 * quality engine while preserving Eco mode (`optimized`) and backward-compatible
 * fields (`isOptimizedModeActive`, `isLowEndDevice`, `userMode`, `setUserMode`).
 */
export function useDevicePerformance(): UseDevicePerformanceReturn {
  const [userMode, setUserModeState] = useState<PerformanceMode>(readSavedUserMode);
  const [hardware, setHardware] = useState<RawHardwareState>(INITIAL_HARDWARE);

  const detectHardware = useCallback((forceProbe = false) => {
    if (typeof window === 'undefined') return;

    const nav = navigator as NavigatorWithDeviceHints;
    const ua = nav.userAgent || '';
    const isMobileUA = MOBILE_UA_REGEX.test(ua);
    const isTouchScreen = 'ontouchstart' in window || (typeof nav.maxTouchPoints === 'number' && nav.maxTouchPoints > 0);
    const isSmallScreen = window.innerWidth < 768;
    const isMobile = Boolean(isMobileUA || (isTouchScreen && isSmallScreen));
    const cores = nav.hardwareConcurrency || 4;
    const memoryGB = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
    const saveData = Boolean(nav.connection?.saveData);

    // WebGL probe is cached after the first call so viewport resizes never
    // allocate or leak new WebGL contexts.
    const webgl = probeWebGLCapabilities({ force: forceProbe });

    setHardware({
      cores,
      memoryGB,
      isMobile,
      supportsWebGL: webgl.supportsWebGL,
      supportsWebGL2: webgl.supportsWebGL2,
      gpuRenderer: webgl.gpuRenderer,
      isSoftwareWebGL: webgl.isSoftwareWebGL,
      saveData,
      detected: true,
    });
  }, []);

  useEffect(() => {
    detectHardware(false);
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      // Only updates viewport-derived mobile status; reuses cached WebGL probe.
      resizeTimer = setTimeout(() => detectHardware(false), 250);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
    };
  }, [detectHardware]);

  const setUserMode = useCallback((mode: PerformanceMode) => {
    setUserModeState(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const togglePerfMode = useCallback(() => {
    setUserModeState((prev) => {
      const next: PerformanceMode =
        prev === 'auto' ? 'optimized' : prev === 'optimized' ? 'high' : 'auto';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Ignore storage failures.
      }
      return next;
    });
  }, []);

  const recheckPerformance = useCallback(() => {
    detectHardware(true);
  }, [detectHardware]);

  const classification = useMemo(() => {
    if (!hardware.detected && userMode === 'auto') {
      return {
        tier: 'tier-1' as GpuTier,
        profile: QUALITY_PROFILES['tier-1'],
        reason: 'Checking hardware...',
      };
    }
    return classifyGpuTier(hardware, userMode);
  }, [hardware, userMode]);

  const autoClassification = useMemo(() => classifyGpuTier(hardware, 'auto'), [hardware]);

  const isLowEndDevice = hardware.detected && autoClassification.tier === 'tier-0';
  const isOptimizedModeActive = userMode === 'optimized' || !classification.profile.enableWebGL;

  return {
    cores: hardware.cores,
    memoryGB: hardware.memoryGB,
    isMobile: hardware.isMobile,
    isLowEndDevice,
    supportsWebGL: hardware.supportsWebGL,
    supportsWebGL2: hardware.supportsWebGL2,
    gpuRenderer: hardware.gpuRenderer,
    isSoftwareWebGL: hardware.isSoftwareWebGL,
    reason: classification.reason,
    isOptimizedModeActive,
    gpuTier: classification.tier,
    qualityProfile: classification.profile,
    userMode,
    setUserMode,
    togglePerfMode,
    recheckPerformance,
  };
}
