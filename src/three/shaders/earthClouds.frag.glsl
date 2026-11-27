// Global NASA cloud-deck shader with terminator twilight scatter and soft limb fade.
// Composed with `common.glsl`.

uniform sampler2D uClouds;
uniform vec3 uSunDirection;
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vNormalWorld;
varying vec3 vPositionWorld;

void main() {
  vec4 cloudSample = texture2D(uClouds, vUv);
  if (cloudSample.a < 0.012) discard;

  vec3 normal = normalize(vNormalWorld);
  vec3 viewDir = normalize(cameraPosition - vPositionWorld);
  vec3 sunDir = normalize(uSunDirection);

  float sunDot = dot(normal, sunDir);
  float lit = smoothstep(-0.20, 0.36, sunDot);

  // Subtle warm coral-gold scattering as high-altitude cloud tops cross the terminator.
  float sunsetBand = exp(-pow((sunDot + 0.01) * 5.8, 2.0));
  vec3 nightCloud = vec3(0.045, 0.075, 0.135);
  vec3 dayCloud = vec3(0.95, 0.975, 1.0);
  vec3 sunsetCloud = vec3(0.98, 0.62, 0.38);

  vec3 cloudColor = mix(nightCloud, dayCloud, lit);
  cloudColor = mix(cloudColor, sunsetCloud, sunsetBand * 0.34);

  // Softly blend grazing clouds into the atmospheric limb so edges never look harsh.
  float ndotv = max(dot(normal, viewDir), 0.0);
  float edgeSoft = smoothstep(0.02, 0.24, ndotv);
  float alpha = cloudSample.a * uOpacity * (0.16 + 0.84 * lit) * edgeSoft;

  gl_FragColor = vec4(cloudColor, alpha);
}
