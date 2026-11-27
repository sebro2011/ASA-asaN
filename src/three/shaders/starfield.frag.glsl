// Crisp circular anti-aliased orbital star point fragment shader.
varying vec3 vColor;
varying float vTwinkle;

void main() {
  vec2 centered = gl_PointCoord - vec2(0.5);
  float distSq = dot(centered, centered);
  if (distSq > 0.25) discard;

  float core = exp(-distSq * 22.0);
  float halo = smoothstep(0.25, 0.02, distSq) * 0.45;
  float alpha = clamp((core + halo) * vTwinkle, 0.0, 1.0);

  gl_FragColor = vec4(vColor * (0.85 + 0.45 * core), alpha * 0.82);
}
