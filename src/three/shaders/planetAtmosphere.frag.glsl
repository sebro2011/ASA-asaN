// Generic sun-aware Rayleigh / dust atmospheric scattering shell (BackSide, AdditiveBlending).
// Uses inward-facing `dot(-normal, viewDir)` so the outer atmospheric boundary
// fades smoothly to 0.0 into deep space with zero hard circular rim artifact.
// Composed with `common.glsl`.

uniform vec3 uSunDirection;
uniform vec3 uDayColor;
uniform vec3 uHorizonColor;
uniform vec3 uNightColor;
uniform float uIntensity;
uniform float uFalloff;

varying vec3 vNormalWorld;
varying vec3 vPositionWorld;

void main() {
  vec3 normal = normalize(vNormalWorld);
  vec3 viewDir = normalize(cameraPosition - vPositionWorld);
  vec3 sunDir = normalize(uSunDirection);

  // Positive on visible back hemisphere: 0.0 at outer edge, rises smoothly toward planet horizon.
  float backFacing = cosmoraSaturate(dot(-normal, viewDir));
  float innerGlow = pow(backFacing, max(uFalloff, 1.4)) * 2.8;
  float outerGlow = pow(backFacing, max(uFalloff + 2.0, 3.2)) * 6.0;
  float scatter = cosmoraSaturate(innerGlow * 0.68 + outerGlow * 0.52);

  float sunDot = dot(normal, sunDir);
  float sunPresence = smoothstep(-0.40, 0.52, sunDot);
  float terminatorBand = exp(-pow((sunDot + 0.04) * 4.5, 2.0));

  vec3 litColor = mix(uDayColor, uHorizonColor, cosmoraSaturate(backFacing * 1.9 + terminatorBand * 0.35));
  vec3 tint = mix(uNightColor, litColor, sunPresence);

  float brightness = (0.12 + 0.88 * sunPresence) * uIntensity;
  vec3 finalRgb = tint * scatter * brightness;
  float finalAlpha = cosmoraSaturate(scatter * brightness * 0.9);

  gl_FragColor = vec4(finalRgb, finalAlpha);
}
