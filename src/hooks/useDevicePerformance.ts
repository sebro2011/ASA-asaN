import { useState, useEffect, useCallback } from 'react';

export type PerformanceMode = 'auto' | 'optimized' | 'high';

export interface DeviceSpecs {
  cores: number;
  memoryGB: number | null;
  isMobile: boolean;
  isLowEndDevice: boolean;
  gpuRenderer?: string;
  isSoftwareWebGL?: boolean;
  reason: string;
}

export interface UseDevicePerformanceReturn extends DeviceSpecs {
  isOptimizedModeActive: boolean;
  userMode: PerformanceMode;
  setUserMode: (mode: PerformanceMode) => void;
  togglePerfMode: () => void;
  recheckPerformance: () => void;
}

const STORAGE_KEY = 'nasa_space_perf_mode';

/**
 * Detects device hardware specifications and determines whether
 * the application should run in Auto-Optimized mode (CSS Parallax Fallback)
 * or High-Performance Mode (Full Three.js 3D WebGL Canvas).
 */
export function useDevicePerformance(): UseDevicePerformanceReturn {
  // Saved preference: 'auto' | 'optimized' | 'high'
  const [userMode, setUserModeState] = useState<PerformanceMode>(() => {
    if (typeof window === 'undefined') return 'auto';
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as PerformanceMode;
      if (saved === 'auto' || saved === 'optimized' || saved === 'high') {
        return saved;
      }
    } catch {}
    return 'auto';
  });

  const [specs, setSpecs] = useState<DeviceSpecs>(() => ({
    cores: 4,
    memoryGB: null,
    isMobile: false,
    isLowEndDevice: false,
    reason: 'Checking hardware...'
  }));

  const detectHardware = useCallback(() => {
    if (typeof window === 'undefined') return;

    // 1. Mobile Detection (User Agent + Viewport + Touch)
    const ua = navigator.userAgent || '';
    const mobileRegex = /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i;
    const isMobileUA = mobileRegex.test(ua);
    const isTouchScreen = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
    const isSmallScreen = window.innerWidth < 768;
    const isMobile = Boolean(isMobileUA || (isTouchScreen && isSmallScreen));

    // 2. CPU Logical Cores
    const cores = navigator.hardwareConcurrency || 4;

    // 3. RAM in Gigabytes (Chromium / Device Memory API)
    const memoryGB = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null;

    // 4. WebGL unmasked GPU renderer inspection
    let gpuRenderer = 'Default WebGL';
    let isSoftwareWebGL = false;
    try {
      const canvas = document.createElement('canvas');
      const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
          const lowerGpu = gpuRenderer.toLowerCase();
          if (
            lowerGpu.includes('swiftshader') ||
            lowerGpu.includes('llvmpipe') ||
            lowerGpu.includes('software') ||
            lowerGpu.includes('basic render')
          ) {
            isSoftwareWebGL = true;
          }
        }
      }
    } catch {}

    // 5. Evaluate if low-end based on user instructions:
    // Mobile user agent, device memory (<= 4GB), hardware cores (<= 4 cores), or software WebGL
    const reasons: string[] = [];
    if (isMobile) reasons.push('Mobile device');
    if (memoryGB !== null && memoryGB <= 4) reasons.push(`Low memory (${memoryGB}GB RAM)`);
    if (cores <= 4) reasons.push(`Limited CPU (${cores} cores)`);
    if (isSoftwareWebGL) reasons.push('Software WebGL rasterizer');

    const isLowEndDevice = Boolean(
      isMobile ||
      (memoryGB !== null && memoryGB <= 4) ||
      cores <= 4 ||
      isSoftwareWebGL
    );

    const reason = reasons.length > 0 ? reasons.join(' • ') : 'High-End Multi-Core Desktop';

    setSpecs({
      cores,
      memoryGB,
      isMobile,
      isLowEndDevice,
      gpuRenderer,
      isSoftwareWebGL,
      reason
    });
  }, []);

  useEffect(() => {
    detectHardware();
    const handleResize = () => detectHardware();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [detectHardware]);

  const setUserMode = useCallback((mode: PerformanceMode) => {
    setUserModeState(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
  }, []);

  const togglePerfMode = useCallback(() => {
    setUserModeState(prev => {
      let next: PerformanceMode = 'auto';
      if (prev === 'auto') next = 'optimized';
      else if (prev === 'optimized') next = 'high';
      else next = 'auto';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {}
      return next;
    });
  }, []);

  // Compute final effective mode
  const isOptimizedModeActive =
    userMode === 'optimized' || (userMode === 'auto' && specs.isLowEndDevice);

  return {
    ...specs,
    isOptimizedModeActive,
    userMode,
    setUserMode,
    togglePerfMode,
    recheckPerformance: detectHardware
  };
}
