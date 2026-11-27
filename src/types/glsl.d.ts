/**
 * Ambient module declarations for Vite's native `?raw` GLSL asset imports.
 *
 * Using `?raw` keeps shader modules zero-dependency and fully compatible with
 * Vite 8 / Rolldown and strict production CSP (`script-src 'self'`).
 */

declare module '*.glsl?raw' {
  const source: string;
  export default source;
}

declare module '*.vert?raw' {
  const source: string;
  export default source;
}

declare module '*.frag?raw' {
  const source: string;
  export default source;
}

declare module '*.glsl' {
  const source: string;
  export default source;
}
