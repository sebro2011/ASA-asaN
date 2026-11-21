/**
 * WebGL capability detection.
 *
 * The brief asks for a clear fallback when WebGL is unavailable, and "available"
 * is not a yes/no: a device can create a context and still be unusable (SwiftShader
 * software rasterisation at 3 FPS). So the probe reports three things — whether a
 * context exists, what GPU it reports, and whether that GPU is software — and the
 * quality chooser uses the third.
 *
 * The probe allocates a real context and must release it: browsers cap live WebGL
 * contexts (~16), and leaking one here would make the game itself fail to start on
 * the surface. `loseContext()` is called immediately.
 */

export interface WebGLInfo {
  /** Highest supported major version: 2, 1, or 0 for none. */
  version: 2 | 1 | 0;
  vendor: string;
  renderer: string;
  /** True when the renderer string indicates a CPU rasteriser. */
  software: boolean;
}

export type WebGLSupport = { ok: true; info: WebGLInfo } | { ok: false; info: WebGLInfo; reason: string };

const SOFTWARE_PATTERNS = /swiftshader|llvmpipe|software|basic render|microsoft basic/i;

/** Probes for WebGL without keeping a context alive. */
export async function detectWebGL(): Promise<WebGLSupport> {
  if (typeof document === 'undefined') {
    return { ok: false, info: { version: 0, vendor: '', renderer: '', software: false }, reason: 'no DOM' };
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;

  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  let version: 2 | 1 | 0 = 0;

  try {
    gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) as WebGL2RenderingContext | null;
    if (gl) version = 2;
  } catch {
    gl = null;
  }

  if (!gl) {
    try {
      gl = canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false }) as WebGLRenderingContext | null;
      if (gl) version = 1;
    } catch {
      gl = null;
    }
  }

  if (!gl) {
    return {
      ok: false,
      info: { version: 0, vendor: '', renderer: '', software: false },
      reason: 'No WebGL context could be created.',
    };
  }

  let vendor = '';
  let renderer = '';
  let software = false;

  try {
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    if (debug) {
      vendor = String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) ?? '');
      renderer = String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) ?? '');
    } else {
      vendor = String(gl.getParameter(gl.VENDOR) ?? '');
      renderer = String(gl.getParameter(gl.RENDERER) ?? '');
    }
    software = SOFTWARE_PATTERNS.test(renderer) || SOFTWARE_PATTERNS.test(vendor);
  } catch {
    // Parameter queries can throw on a lost context; a blank renderer is not fatal.
  }

  // Release the context: browsers limit how many live contexts a page may hold.
  try {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // Ignore: the context will be collected.
  }

  const info: WebGLInfo = { version, vendor, renderer, software };

  // A software rasteriser is playable at `low`; refusing it would deny the game to
  // machines that can genuinely run it at 20–30 FPS.
  return { ok: true, info };
}

/** Device signals for the preset chooser, from the probe plus the platform. */
export function readDeviceSignals(info: WebGLInfo): {
  cores: number | null;
  deviceMemory: number | null;
  mobile: boolean;
  softwareRenderer: boolean;
  touchPrimary: boolean;
} {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  const mobileUa = /android|iphone|ipad|ipod|tablet|mobile/i.test(nav?.userAgent ?? '');
  const touchPrimary = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;

  return {
    cores: nav?.hardwareConcurrency ?? null,
    deviceMemory: (nav as { deviceMemory?: number } | null)?.deviceMemory ?? null,
    mobile: mobileUa,
    softwareRenderer: info.software,
    touchPrimary,
  };
}
