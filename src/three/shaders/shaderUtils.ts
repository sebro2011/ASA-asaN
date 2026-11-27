/**
 * Pure TypeScript GLSL composition, validation and material factory utilities.
 *
 * Kept free of Vite-specific `?raw` imports so Node unit tests can import and
 * verify shader tooling directly under `tsx`, while client bundles load `.glsl`
 * sources through `src/three/shaders/index.ts`.
 */

import * as THREE from 'three';

export type ShaderUniformValue =
  | number
  | boolean
  | THREE.Color
  | THREE.Vector2
  | THREE.Vector3
  | THREE.Vector4
  | THREE.Matrix3
  | THREE.Matrix4
  | THREE.Texture
  | null;

export type ShaderUniformMap = Record<string, THREE.IUniform<ShaderUniformValue>>;

export interface ShaderValidationResult {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

export interface ManagedShaderOptions {
  vertexShader: string;
  fragmentShader: string;
  uniforms?: ShaderUniformMap;
  transparent?: boolean;
  depthWrite?: boolean;
  blending?: THREE.Blending;
  side?: THREE.Side;
  toneMapped?: boolean;
}

/**
 * Joins modular GLSL chunks into a single shader program while stripping extra
 * leading/trailing blank space so line diagnostics remain readable.
 */
export function composeShader(chunks: readonly string[]): string {
  return chunks
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .join('\n\n');
}

/**
 * Static structural check for GLSL shader sources. Catches missing entrypoints,
 * unbalanced braces/parentheses and empty inputs before runtime GPU compile.
 */
export function validateGlslSource(source: string, options: { requireMain?: boolean } = {}): ShaderValidationResult {
  const { requireMain = true } = options;
  const issues: string[] = [];
  const trimmed = source.trim();

  if (!trimmed) {
    return { valid: false, issues: ['Shader source is empty'] };
  }

  // Strip C/C++ comments before checking structure so comments cannot affect counts.
  const stripped = trimmed
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  if (requireMain && !/\bvoid\s+main\s*\(\s*(?:void)?\s*\)/.test(stripped)) {
    issues.push('Shader source is missing a void main() entry point');
  }

  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (ch === '{') braceDepth += 1;
    else if (ch === '}') braceDepth -= 1;
    else if (ch === '(') parenDepth += 1;
    else if (ch === ')') parenDepth -= 1;

    if (braceDepth < 0) {
      issues.push('Unexpected closing brace "}" in shader source');
      break;
    }
    if (parenDepth < 0) {
      issues.push('Unexpected closing parenthesis ")" in shader source');
      break;
    }
  }

  if (braceDepth > 0) issues.push(`Unclosed brace(s) in shader source (${braceDepth} remaining)`);
  if (parenDepth > 0) issues.push(`Unclosed parenthesis in shader source (${parenDepth} remaining)`);

  return { valid: issues.length === 0, issues };
}

/**
 * Wraps raw uniform values into Three.js `{ value }` entries with strict typing.
 */
export function createUniforms<T extends Record<string, ShaderUniformValue>>(
  initial: T,
): { [K in keyof T]: THREE.IUniform<T[K]> } {
  const result = {} as { [K in keyof T]: THREE.IUniform<T[K]> };
  for (const key of Object.keys(initial) as Array<keyof T>) {
    result[key] = { value: initial[key] };
  }
  return result;
}

/**
 * Creates a strictly typed THREE.ShaderMaterial from validated GLSL strings.
 */
export function createManagedShaderMaterial(options: ManagedShaderOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: options.vertexShader,
    fragmentShader: options.fragmentShader,
    uniforms: options.uniforms ?? {},
    transparent: options.transparent ?? false,
    depthWrite: options.depthWrite ?? true,
    blending: options.blending ?? THREE.NormalBlending,
    side: options.side ?? THREE.FrontSide,
    toneMapped: options.toneMapped ?? true,
  });
}
