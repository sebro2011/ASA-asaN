/**
 * The Martian sky.
 *
 * Two concentric shells:
 *
 *   inner (radius 900)  — vertical gradient from horizon to zenith, plus the
 *                         forward-scattering glow around the sun. This is what
 *                         produces the famous butterscotch sunset: Mars' dust
 *                         scatters red light *forward*, so the glow around the sun
 *                         is warm and the sky opposite it is blue-grey.
 *   outer (radius 4000) — star field, additive points, visible by day because the
 *                         atmosphere is only ~1% as thick as Earth's.
 *
 * Both are `depthWrite: false` and render before everything else, so they never
 * occlude terrain and never z-fight.
 */
import * as THREE from 'three';
import { MARS_NIGHT, MARS_PALETTE } from './palette';

const SKY_VERTEX = /* glsl */ `
  precision highp float;

  varying vec3 vWorldDirection;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uNightZenith;
  uniform vec3 uNightHorizon;
  uniform vec3 uSunDirection;
  uniform vec3 uSunGlow;
  uniform float uSunElevation;
  uniform float uDaylight;

  varying vec3 vWorldDirection;

  void main() {
    vec3 direction = normalize(vWorldDirection);

    // **The vertical ramp, which the first version got wrong.**
    // direction.y * 0.5 + 0.5 maps the horizon to 0.5, so at the horizon the
    // mix was already 59 percent of the way to the zenith colour (0.5^0.75).
    // with a horizon-to-zenith range of only #d8b08a→#6d5a4c across a ±20° visible
    // band, the result was the flat brown wall that filled the top of every frame.
    // Using the elevation angle directly — 0 at the horizon, 1 at the zenith —
    // gives the shader the full range to work with, and the exponent controls how
    // quickly the dust band compresses toward the horizon, which is what makes a
    // Martian sky look like a dusty atmosphere rather than a painted backdrop.
    float elevation = clamp(direction.y, 0.0, 1.0);
    float up = pow(elevation, 0.38);

    // Horizon dust band: a narrow, noticeably paler strip hugging the skyline.
    // Rover panoramas show the dust layer as a distinct band, not a smooth fade.
    float band = exp(-elevation * 9.0);

    vec3 dayColor = mix(uZenith, uHorizon, up);
    dayColor = mix(dayColor, uHorizon * 1.12, band * 0.55);

    // Night gradient, cross-faded by the sun's elevation.
    vec3 nightColor = mix(uNightZenith, uNightHorizon, up);

    float align = max(dot(direction, normalize(uSunDirection)), 0.0);

    // --- The Martian colour inversion -------------------------------------
    // This is the single most characteristic thing about the Martian sky, and the
    // first version of this shader got it backwards. Earth's Rayleigh scattering
    // makes the sky *blue* with a warm sun. Mars' dust is roughly the size of the
    // wavelength of light, so it scatters *forward*: the region immediately around
    // the sun is a pale, cold blue-white, while the sky away from the sun is warm
    // butterscotch. Getting this right is the difference between "a desert" and
    // "Mars".
    float nearSun = pow(align, 3.5);
    vec3 butterscotch = dayColor;
    vec3 coldGlow = vec3(0.62, 0.70, 0.80);
    dayColor = mix(butterscotch, coldGlow, nearSun * 0.55);

    // Broad halo plus a tight core.
    float halo = pow(align, 6.0) * 0.50 + pow(align, 96.0) * 0.45;

    vec3 color = mix(nightColor, dayColor, uDaylight);
    color += uSunGlow * halo * uDaylight;

    // The horizon band stays bright even below the geometric horizon, or the
    // ground appears to end in blackness where the ring runs out.
    color = mix(color, uHorizon * 0.78, smoothstep(-0.04, -0.30, direction.y));

    gl_FragColor = vec4(color, 1.0);

    #include <colorspace_fragment>
  }
`;

export class SkyDome {
  readonly group: THREE.Group;
  private readonly domeMaterial: THREE.ShaderMaterial;
  private readonly stars: THREE.Points;

  constructor(starCount = 900) {
    this.group = new THREE.Group();

    this.domeMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: {
        uZenith: { value: new THREE.Color(MARS_PALETTE.skyZenith) },
        uHorizon: { value: new THREE.Color(MARS_PALETTE.skyHorizon) },
        uNightZenith: { value: new THREE.Color(MARS_NIGHT.zenith) },
        uNightHorizon: { value: new THREE.Color(MARS_NIGHT.horizon) },
        uSunDirection: { value: new THREE.Vector3(0.4, 0.72, 0.3).normalize() },
        uSunGlow: { value: new THREE.Color(MARS_PALETTE.sunGlow) },
        uSunElevation: { value: 0.7 },
        uDaylight: { value: 1 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });

    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), this.domeMaterial);
    dome.renderOrder = -1000;
    dome.frustumCulled = false;
    this.group.add(dome);

    this.stars = buildStarField(starCount);
    this.group.add(this.stars);
  }

  /** Sun elevation in radians; drives both lighting and the sky gradient. */
  update(sunDirection: THREE.Vector3, daylight: number): void {
    const uniforms = this.domeMaterial.uniforms;
    (uniforms.uSunDirection.value as THREE.Vector3).copy(sunDirection).normalize();
    uniforms.uSunElevation.value = sunDirection.y;
    uniforms.uDaylight.value = daylight;
    // Stars fade in as the sun sets, and stay faintly visible by day.
    const starOpacity = 0.12 + (1 - daylight) * 0.88;
    (this.stars.material as THREE.PointsMaterial).opacity = starOpacity;
    this.stars.visible = starOpacity > 0.02;
  }

  /** The dome follows the camera so the horizon never approaches. */
  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
  }

  dispose(): void {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
      }
    });
    this.domeMaterial.dispose();
    (this.stars.material as THREE.PointsMaterial).dispose();
  }
}

function buildStarField(count: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  // Deterministic star placement: a fixed seed means the constellations are the
  // same on every device and after every reload.
  let seed = 0x2f6b1d;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < count; i += 1) {
    // Uniform on a sphere, biased to the upper hemisphere (below the horizon is
    // hidden by terrain anyway).
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(0.05 + random() * 0.95);
    const radius = 3600;
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    sizes[i] = 0.5 + random() * 0.9;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    color: new THREE.Color(MARS_NIGHT.starColor),
    size: 8,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });

  const points = new THREE.Points(geometry, material);
  points.renderOrder = -999;
  points.frustumCulled = false;
  return points;
}
