// Shared GLSL lighting and math primitives for COSMORA 3D scenes.
// Written in portable GLSL ES 1.00 / WebGL 1 & 2 compatible syntax.

float cosmoraSaturate(float x) {
  return clamp(x, 0.0, 1.0);
}

// Physically-inspired Schlick-style Fresnel rim term.
float cosmoraFresnel(vec3 normalDir, vec3 viewDir, float power) {
  float ndotv = cosmoraSaturate(dot(normalize(normalDir), normalize(viewDir)));
  return pow(1.0 - ndotv, power);
}

// Smooth planetary day/night terminator curve avoiding hard cutoffs.
float cosmoraTerminator(vec3 normalDir, vec3 sunDir, float nightEdge, float dayEdge) {
  float ndotl = dot(normalize(normalDir), normalize(sunDir));
  return smoothstep(nightEdge, dayEdge, ndotl);
}

// Lightweight deterministic 2D hash for procedural starlight / surface grain.
float cosmoraHash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
