/**
 * Airborne dust.
 *
 * Martian dust is not snow: it is fine iron-oxide particles that stay suspended
 * for days, drift with a light wind, and catch the sun. It reads as slow, warm
 * motes near the camera and as a general haze far away (the haze itself is the
 * terrain shader's fog term).
 *
 * Implementation: one `Points` cloud in a 60 m box that follows the camera. Each
 * particle wraps around the box when it leaves it, so a few thousand points cover
 * the whole walk instead of needing to be re-spawned. Motion is one vertex-shader
 * expression per frame — the CPU never touches the buffer.
 */
import * as THREE from 'three';

const DUST_VERTEX = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3 uWind;
  uniform float uBoxSize;
  uniform float uPixelRatio;
  uniform float uSizeScale;
  attribute float aSeed;

  varying float vFade;

  void main() {
    // Base position plus wind drift. mod() wraps the particle inside the box, so
    // the cloud is unbounded without any CPU work.
    vec3 drifted = position + uWind * uTime * (0.4 + aSeed * 0.8);

    // Vertical bob gives the drift a little turbulence without a noise texture.
    drifted.y += sin(uTime * 0.6 + aSeed * 12.0) * 0.9;

    vec3 wrapped = mod(drifted + uBoxSize * 0.5, uBoxSize) - uBoxSize * 0.5;

    vec4 mvPosition = modelViewMatrix * vec4(wrapped, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Size attenuates with distance, and particles very close to the camera fade
    // out so they never smear across the lens.
    float distance = -mvPosition.z;
    gl_PointSize = (38.0 * uSizeScale * (0.4 + aSeed)) / max(distance, 1.0);
    gl_PointSize *= uPixelRatio;

    vFade = smoothstep(0.6, 3.0, distance) * (1.0 - smoothstep(34.0, 60.0, distance));
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  precision mediump float;

  uniform vec3 uColor;
  uniform float uOpacity;

  varying float vFade;

  void main() {
    // A soft round mote: discard the corners of the point sprite.
    vec2 centred = gl_PointCoord - 0.5;
    float radius = length(centred);
    if (radius > 0.5) discard;
    float alpha = (1.0 - radius * 2.0) * uOpacity * vFade;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export class DustField {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly boxSize: number;

  constructor(count = 1400, boxSize = 60) {
    this.boxSize = boxSize;

    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    let state = 0x51f3a7;
    const random = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };

    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (random() - 0.5) * boxSize;
      positions[i * 3 + 1] = random() * boxSize * 0.55;
      positions[i * 3 + 2] = (random() - 0.5) * boxSize;
      seeds[i] = random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    // The shader moves particles far outside the initial bounds; a fixed bounding
    // sphere keeps Three from culling the whole cloud.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), boxSize);
    geometry.boundingSphere.radius = boxSize * 1.5;

    const material = new THREE.ShaderMaterial({
      vertexShader: DUST_VERTEX,
      fragmentShader: DUST_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uWind: { value: new THREE.Vector3(1.4, 0.05, 0.55) },
        uBoxSize: { value: boxSize },
        uPixelRatio: { value: 1 },
        uSizeScale: { value: 1 },
        uColor: { value: new THREE.Color('#d9b18c') },
        uOpacity: { value: 0.5 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  update(time: number, cameraPosition: THREE.Vector3): void {
    const uniforms = this.points.material.uniforms;
    uniforms.uTime.value = time;
    // Follow the camera on the ground plane so the cloud always surrounds it.
    this.points.position.set(cameraPosition.x, Math.max(cameraPosition.y - 2, 0), cameraPosition.z);
  }

  setQuality(preset: 'high' | 'balanced' | 'low', pixelRatio: number): void {
    const uniforms = this.points.material.uniforms;
    uniforms.uPixelRatio.value = pixelRatio;
    uniforms.uOpacity.value = preset === 'low' ? 0.32 : 0.5;
    uniforms.uSizeScale.value = preset === 'low' ? 1.5 : 1;
    // Fewer motes on low: the GPU still rasterises every sprite for blending.
    const drawCount = preset === 'low' ? 400 : preset === 'balanced' ? 900 : 1400;
    this.points.geometry.setDrawRange(0, drawCount);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
