// Shared orbital planetary vertex shader (WebGL1 & WebGL2 compatible).
varying vec2 vUv;
varying vec3 vNormalWorld;
varying vec3 vPositionWorld;

void main() {
  vUv = uv;
  vNormalWorld = normalize(mat3(modelMatrix) * normal);
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vPositionWorld = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
