// Sun-aware Rayleigh / Mie outer atmospheric scattering shell (rendered BackSide, AdditiveBlending).
// On a BackSide sphere, `-vNormalWorld` faces the camera: `dot(-normal, view)` is
// 0.0 at the outer atmospheric edge and rises smoothly toward Earth's horizon,
// guaranteeing a seamless fade into space with zero hard circular rim.
// Composed with `common.glsl`.

uniform vec3 uSunDirection;
uniform float uIntensity;

varying vec3 vNormalWorld;
varying vec3 vPositionWorld;

void main() {
  vec3 normal = normalize(vNormalWorld);
  vec3 viewDir = normalize(cameraPosition - vPositionWorld);
  vec3 sunDir = normalize(uSunDirection);

  // Positive on the visible back hemisphere; 0 at outer boundary, ~0.43 at Earth's limb.
  float backFacing = cosmoraSaturate(dot(-normal, viewDir));

  // Dual-lobe scattering: crisp cyan inner horizon + soft azure outer exosphere glow.
  float innerGlow = pow(backFacing, 2.4) * 2.6;
  float outerGlow = pow(backFacing, 4.6) * 6.5;
  float scatter = cosmoraSaturate(innerGlow * 0.72 + outerGlow * 0.55);

  float sunDot = dot(normal, sunDir);
  float sunPresence = smoothstep(-0.42, 0.48, sunDot);
  float terminatorCusp = exp(-pow((sunDot + 0.02) * 4.4, 2.0));

  vec3 dayRayleigh = vec3(0.28, 0.70, 1.0);
  vec3 horizonCyan = vec3(0.56, 0.88, 1.0);
  vec3 sunsetMie = vec3(0.96, 0.54, 0.28);
  vec3 nightDeep = vec3(0.08, 0.20, 0.44);

  vec3 dayColor = mix(dayRayleigh, horizonCyan, cosmoraSaturate(backFacing * 1.8));
  vec3 tint = mix(nightDeep, dayColor, sunPresence);
  tint = mix(tint, sunsetMie, terminatorCusp * 0.22);

  float brightness = (0.14 + 0.86 * sunPresence) * uIntensity;
  vec3 finalRgb = tint * scatter * brightness;
  float finalAlpha = cosmoraSaturate(scatter * brightness * 0.92);

  gl_FragColor = vec4(finalRgb, finalAlpha);
}
