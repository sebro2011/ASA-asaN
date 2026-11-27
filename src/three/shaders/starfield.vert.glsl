// Lightweight orbital background starfield vertex shader (WebGL1 & WebGL2 compatible).
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;

uniform float uTime;
uniform float uPixelRatio;
uniform float uMotionScale;

varying vec3 vColor;
varying float vTwinkle;

void main() {
  vColor = aColor;
  float wave = sin(uTime * (0.65 + fract(aPhase) * 0.9) + aPhase * 6.2831853);
  vTwinkle = mix(1.0, 0.72 + 0.28 * wave, uMotionScale);

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float dist = max(-mvPosition.z, 1.0);
  gl_PointSize = clamp(aSize * uPixelRatio * (18.0 / dist), 1.0, 5.0);
  gl_Position = projectionMatrix * mvPosition;
}
