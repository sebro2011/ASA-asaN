/**
 * Lazy-loaded 3D globe — the cinematic rendering layer over a real NASA GIBS image.
 *
 * three.js is imported only when this module is dynamically imported by the Lab,
 * so the library never lands in the initial bundle. The surface texture is a real
 * NASA GIBS WMS rendering (EPSG:4326 equirectangular) of the selected layer and
 * observation date.
 *
 * What is data and what is rendering (the Lab's scientific-integrity contract):
 *  - **Data** — the surface image (GIBS WMS for this layer + date), the served
 *    texture resolution shown in the badge, and the sun position, which is
 *    *computed* from the observation date at 12:00 UTC with the standard solar
 *    declination approximation. The terminator is therefore a geometric
 *    consequence of the chosen date, not decoration.
 *  - **Rendering** — lighting, the atmosphere shader, the graticule, the star
 *    field and the rotation. A note under the globe says so, and the night side
 *    is deliberately left partly lit so the imagery stays legible.
 *
 * Failure ladder: WebGL unavailable → `onFallback('webgl')`; every texture size
 * in the ladder failing → `onFallback('texture')`. The Lab then keeps the 2D map.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Grid3x3, Loader2, Pause, Play, RotateCcw, Sun } from 'lucide-react';
import * as THREE from 'three';
import { GIBS_WMS_BASE } from '../../lib/earth/gibsCatalog';
import type { GibsLayerMeta } from '../../lib/earth/types';

interface Globe3DProps {
  layer: GibsLayerMeta;
  date: string;
  reducedMotion: boolean;
  onFallback: (reason: 'webgl' | 'texture') => void;
  /** Opens the globe on this coordinate (the Lab's current study area). */
  center?: { latitude: number; longitude: number };
  /** `low` caps the texture ladder at 2048×1024 for low-end devices. */
  quality?: 'high' | 'low';
}

const CAMERA_FOV = 32;
const DISTANCE_WIDE = 4.35;
const DISTANCE_DEFAULT = 3.6;
const DISTANCE_MIN = 1.95;
const DISTANCE_MAX = 5.4;
const PITCH_LIMIT = THREE.MathUtils.degToRad(78);

/* ------------------------------------------------------------------ */
/* imagery + astronomy                                                */
/* ------------------------------------------------------------------ */

/** GIBS WMS GetMap URL for an equirectangular rendering of the whole globe. */
function wmsTextureUrl(layer: GibsLayerMeta, date: string, width: number, height: number): string {
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: '1.3.0',
    LAYERS: layer.id,
    STYLES: '',
    FORMAT: layer.format === 'png' ? 'image/png' : 'image/jpeg',
    TRANSPARENT: 'false',
    CRS: 'EPSG:4326',
    BBOX: '-180,-90,180,90',
    WIDTH: String(width),
    HEIGHT: String(height),
    TIME: date
  });
  return `${GIBS_WMS_BASE}?${params.toString()}`;
}

/**
 * Sub-solar point for the observation date at 12:00 UTC.
 *
 * Declination uses Cooper's approximation (accurate to ≈1°), and because the
 * time is fixed at 12:00 UTC the sub-solar meridian is Greenwich. Returned as a
 * unit vector in the globe's Earth-fixed frame, using the same longitude →
 * geometry mapping as the equirectangular texture.
 */
function subsolarPoint(dateISO: string): { declinationDeg: number; direction: THREE.Vector3 } {
  const date = new Date(`${dateISO}T12:00:00Z`);
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - start) / 86_400_000) + 1;
  const declinationDeg = -23.44 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365.24);
  const lat = THREE.MathUtils.degToRad(declinationDeg);
  const direction = new THREE.Vector3(Math.cos(lat), Math.sin(lat), 0).normalize();
  return { declinationDeg, direction };
}

/** Yaw/pitch that turn a coordinate towards the camera (+Z). */
function orientationFor(latitude: number, longitude: number): { yaw: number; pitch: number } {
  return {
    yaw: THREE.MathUtils.degToRad(-90 - longitude),
    pitch: THREE.MathUtils.clamp(THREE.MathUtils.degToRad(latitude), -PITCH_LIMIT, PITCH_LIMIT)
  };
}

/** Deterministic PRNG so the star field is identical on every visit. */
function mulberry32(seed: number): () => number {
  let value = seed;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRATICULE_RADIUS = 1.0022;

/** Equirectangular point on the globe for a latitude/longitude in degrees. */
function spherePoint(latitude: number, longitude: number, radius: number, out: THREE.Vector3): THREE.Vector3 {
  const lat = THREE.MathUtils.degToRad(latitude);
  const lon = THREE.MathUtils.degToRad(longitude);
  return out.set(
    radius * Math.cos(lat) * Math.cos(lon),
    radius * Math.sin(lat),
    -radius * Math.cos(lat) * Math.sin(lon)
  );
}

/* ------------------------------------------------------------------ */
/* shaders                                                            */
/* ------------------------------------------------------------------ */

const ATMOSPHERE_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDirW = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

/**
 * Limb glow. `abs()` on the normal/view dot product makes the same shader work
 * for the inner shell (front faces) and the outer halo (back faces), and the
 * glow follows the sun so the lit limb is brighter than the night limb.
 */
const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSunDirection;
  uniform float uPower;
  uniform float uIntensity;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDirW))), uPower);
    float sunFacing = clamp(dot(normalize(vNormalW), normalize(uSunDirection)) * 0.5 + 0.5, 0.0, 1.0);
    float glow = rim * uIntensity * mix(0.32, 1.0, sunFacing);
    gl_FragColor = vec4(uColor * glow, glow);
  }
`;

interface GlobeScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  tilt: THREE.Group;
  spin: THREE.Group;
  material: THREE.MeshStandardMaterial;
  graticule: THREE.LineSegments;
  atmosphere: THREE.ShaderMaterial[];
  disposables: Array<{ dispose: () => void }>;
  sunDirection: THREE.Vector3;
  sunLight: THREE.DirectionalLight;
  maxAnisotropy: number;
  texture: THREE.Texture | null;
  yaw: number;
  pitch: number;
  yawTarget: number;
  pitchTarget: number;
  velocity: number;
  distance: number;
  distanceTarget: number;
  pinchDistance: number | null;
  textureOpacity: number;
  firstTexture: boolean;
  dragging: boolean;
  visible: boolean;
}

export default function Globe3D({ layer, date, reducedMotion, onFallback, center, quality = 'high' }: Globe3DProps) {
  const { t } = useTranslation();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<GlobeScene | null>(null);
  const resetRef = useRef<(() => void) | null>(null);
  const fallbackRef = useRef(onFallback);
  fallbackRef.current = onFallback;
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [textureWidth, setTextureWidth] = useState<number | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [spinEnabled, setSpinEnabled] = useState(!reducedMotion);

  const spinRef = useRef(spinEnabled);
  spinRef.current = spinEnabled;
  const gridRef = useRef(showGrid);
  gridRef.current = showGrid;

  const start = useMemo(() => orientationFor(center?.latitude ?? 0, center?.longitude ?? 0), [center?.latitude, center?.longitude]);
  const startRef = useRef(start);
  startRef.current = start;

  const sun = useMemo(() => subsolarPoint(date), [date]);

  /* --------------------------- scene lifecycle --------------------------- */

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      setStatus('error');
      fallbackRef.current('webgl');
      return undefined;
    }

    const width = mount.clientWidth || 480;
    const height = mount.clientHeight || 320;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1.5 : 2));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x03060d, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral tone mapping keeps the satellite colours close to the source image
    // while still rolling off highlights on the sunlit limb.
    const neutral = (THREE as unknown as { NeutralToneMapping?: THREE.ToneMapping }).NeutralToneMapping;
    renderer.toneMapping = neutral ?? THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'pan-y';
    renderer.domElement.tabIndex = 0;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / Math.max(1, height), 0.1, 200);
    camera.position.set(0, 0, DISTANCE_WIDE);

    const disposables: Array<{ dispose: () => void }> = [];
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    /* star field — deterministic, so the view is reproducible */
    const starCount = quality === 'low' ? 700 : 1500;
    const random = mulberry32(20261011);
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const starColor = new THREE.Color();
    for (let index = 0; index < starCount; index += 1) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      const radius = 26 + random() * 20;
      starPositions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[index * 3 + 1] = radius * Math.cos(phi);
      starPositions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      starColor.setHSL(0.55 + random() * 0.12, 0.3 + random() * 0.25, 0.62 + random() * 0.3);
      starColors[index * 3] = starColor.r;
      starColors[index * 3 + 1] = starColor.g;
      starColors[index * 3 + 2] = starColor.b;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMaterial = new THREE.PointsMaterial({
      size: quality === 'low' ? 0.12 : 0.095,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);
    disposables.push(starGeometry, starMaterial);

    /* Earth axis tilt: the globe, its graticule and the sun live in this frame */
    const tilt = new THREE.Group();
    tilt.rotation.z = THREE.MathUtils.degToRad(-23.44);
    scene.add(tilt);

    /* user-controlled spin (yaw about the axis, then a camera-space pitch) */
    const spin = new THREE.Group();
    tilt.add(spin);

    const globeGeometry = new THREE.SphereGeometry(1, quality === 'low' ? 96 : 144, quality === 'low' ? 72 : 108);
    // Opaque until the first image arrives: the globe must never be see-through
    // with the star field behind it while the texture is still loading.
    const material = new THREE.MeshStandardMaterial({
      color: 0x16283c,
      roughness: 0.72,
      metalness: 0,
      transparent: false,
      opacity: 1
    });
    const globe = new THREE.Mesh(globeGeometry, material);
    spin.add(globe);
    disposables.push(globeGeometry, material);

    /* graticule — a cartographic overlay, clearly a rendering aid */
    const graticulePositions: number[] = [];
    const cursor = new THREE.Vector3();
    const pushPoint = (latitude: number, longitude: number) => {
      spherePoint(latitude, longitude, GRATICULE_RADIUS, cursor);
      graticulePositions.push(cursor.x, cursor.y, cursor.z);
    };
    for (let longitude = -180; longitude < 180; longitude += 30) {
      for (let latitude = -90; latitude < 90; latitude += 4) {
        pushPoint(latitude, longitude);
        pushPoint(latitude + 4, longitude);
      }
    }
    for (const latitude of [-45, -30, -15, 15, 30, 45]) {
      for (let longitude = -180; longitude < 180; longitude += 6) {
        pushPoint(latitude, longitude);
        pushPoint(latitude, longitude + 6);
      }
    }
    const graticuleGeometry = new THREE.BufferGeometry();
    graticuleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(graticulePositions, 3));
    const graticuleMaterial = new THREE.LineBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const graticule = new THREE.LineSegments(graticuleGeometry, graticuleMaterial);
    spin.add(graticule);
    disposables.push(graticuleGeometry, graticuleMaterial);

    /* equator, drawn slightly brighter as a reference line */
    const equatorPositions: number[] = [];
    const pushEquatorPoint = (longitude: number) => {
      spherePoint(0, longitude, GRATICULE_RADIUS, cursor);
      equatorPositions.push(cursor.x, cursor.y, cursor.z);
    };
    for (let longitude = -180; longitude < 180; longitude += 4) {
      pushEquatorPoint(longitude);
      pushEquatorPoint(longitude + 4);
    }
    const equatorGeometry = new THREE.BufferGeometry();
    equatorGeometry.setAttribute('position', new THREE.Float32BufferAttribute(equatorPositions, 3));
    const equatorMaterial = new THREE.LineBasicMaterial({
      color: 0x9ae6ff,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const equator = new THREE.LineSegments(equatorGeometry, equatorMaterial);
    spin.add(equator);
    disposables.push(equatorGeometry, equatorMaterial);

    /* atmosphere: inner limb glow (front faces) + outer halo (back faces) */
    const atmosphere: THREE.ShaderMaterial[] = [];
    const makeShell = (radius: number, color: number, power: number, intensity: number, side: THREE.Side) => {
      const shellGeometry = new THREE.SphereGeometry(radius, 48, 32);
      const shellMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
          uPower: { value: power },
          uIntensity: { value: intensity }
        },
        vertexShader: ATMOSPHERE_VERTEX,
        fragmentShader: ATMOSPHERE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side
      });
      const shell = new THREE.Mesh(shellGeometry, shellMaterial);
      tilt.add(shell);
      atmosphere.push(shellMaterial);
      disposables.push(shellGeometry, shellMaterial);
      return shell;
    };
    makeShell(1.004, 0x8fd9ff, 2.6, 0.85, THREE.FrontSide);
    makeShell(1.14, 0x2f7bff, 3.4, 1.05, THREE.BackSide);

    /* lighting: a real declination-driven sun plus a cool fill so the night side
       stays readable (a rendering choice — the image itself is unchanged) */
    const ambient = new THREE.AmbientLight(0x2b4460, 0.55);
    const fill = new THREE.HemisphereLight(0x9ed6ff, 0x08131f, 0.35);
    const sunLight = new THREE.DirectionalLight(0xfff3e2, 2.45);
    sunLight.position.set(1, 0, 0);
    tilt.add(ambient, fill, sunLight);

    const initial = startRef.current;
    camera.position.z = DISTANCE_WIDE;
    let yaw = initial.yaw;
    let pitch = initial.pitch;

    const state: GlobeScene = {
      scene,
      camera,
      renderer,
      tilt,
      spin,
      material,
      graticule,
      atmosphere,
      disposables,
      sunDirection: new THREE.Vector3(1, 0, 0),
      sunLight,
      maxAnisotropy,
      texture: null,
      yaw,
      pitch,
      yawTarget: yaw,
      pitchTarget: pitch,
      velocity: 0,
      distance: DISTANCE_WIDE,
      distanceTarget: DISTANCE_WIDE,
      pinchDistance: null,
      textureOpacity: 1,
      firstTexture: true,
      dragging: false,
      visible: true
    };
    sceneRef.current = state;

    resetRef.current = () => {
      const target = startRef.current;
      state.yawTarget = target.yaw;
      state.pitchTarget = target.pitch;
      state.velocity = 0;
      state.distanceTarget = DISTANCE_DEFAULT;
    };

    /* ------------------------------ interaction ------------------------------ */

    const pointers = new Map<number, { x: number; y: number }>();
    const element = renderer.domElement;

    const onPointerDown = (event: PointerEvent) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        state.dragging = true;
        state.velocity = 0;
      }
      element.setPointerCapture?.(event.pointerId);
      element.focus({ preventScroll: true });
    };

    const onPointerMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (state.pinchDistance) {
          const ratio = distance / state.pinchDistance;
          state.distanceTarget = THREE.MathUtils.clamp(state.distanceTarget / ratio, DISTANCE_MIN, DISTANCE_MAX);
        }
        state.pinchDistance = distance;
        return;
      }

      if (!state.dragging) return;
      const yawSensitivity = 0.0052;
      const pitchSensitivity = 0.0045;
      state.yawTarget += dx * yawSensitivity;
      state.pitchTarget = THREE.MathUtils.clamp(state.pitchTarget + dy * pitchSensitivity, -PITCH_LIMIT, PITCH_LIMIT);
      state.velocity = dx * yawSensitivity * 60;
    };

    const endPointer = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) state.pinchDistance = null;
      if (pointers.size === 0) state.dragging = false;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      state.distanceTarget = THREE.MathUtils.clamp(state.distanceTarget + event.deltaY * 0.0018, DISTANCE_MIN, DISTANCE_MAX);
    };

    const onDoubleClick = () => resetRef.current?.();

    const onKeyDown = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 0.25 : 0.12;
      switch (event.key) {
        case 'ArrowLeft':
          state.yawTarget -= step;
          break;
        case 'ArrowRight':
          state.yawTarget += step;
          break;
        case 'ArrowUp':
          state.pitchTarget = THREE.MathUtils.clamp(state.pitchTarget - step, -PITCH_LIMIT, PITCH_LIMIT);
          break;
        case 'ArrowDown':
          state.pitchTarget = THREE.MathUtils.clamp(state.pitchTarget + step, -PITCH_LIMIT, PITCH_LIMIT);
          break;
        case '+':
        case '=':
          state.distanceTarget = THREE.MathUtils.clamp(state.distanceTarget - 0.35, DISTANCE_MIN, DISTANCE_MAX);
          break;
        case '-':
        case '_':
          state.distanceTarget = THREE.MathUtils.clamp(state.distanceTarget + 0.35, DISTANCE_MIN, DISTANCE_MAX);
          break;
        case 'r':
        case 'R':
          resetRef.current?.();
          break;
        default:
          return;
      }
      state.velocity = 0;
      event.preventDefault();
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', endPointer);
    element.addEventListener('pointercancel', endPointer);
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('dblclick', onDoubleClick);
    element.addEventListener('keydown', onKeyDown);

    const resize = () => {
      const nextWidth = mount.clientWidth;
      const nextHeight = mount.clientHeight;
      if (!nextWidth || !nextHeight) return;
      renderer.setSize(nextWidth, nextHeight, false);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(mount);
    window.addEventListener('resize', resize);
    resize();

    /* pause rendering when the globe is off-screen or the tab is hidden */
    const intersectionObserver =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((entries) => {
            state.visible = entries.some((entry) => entry.isIntersecting);
          }, { threshold: 0.02 })
        : null;
    intersectionObserver?.observe(mount);

    const clock = new THREE.Clock();

    const onVisibility = () => {
      if (!document.hidden) clock.getDelta();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const tmpQuaternion = new THREE.Quaternion();
    const sunWorld = new THREE.Vector3();
    let frame = 0;

    const renderLoop = () => {
      frame = requestAnimationFrame(renderLoop);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (!state.visible || document.hidden) return;

      if (spinRef.current && !state.dragging && !reducedMotionRef.current) {
        state.yawTarget += dt * 0.062;
      }
      if (!state.dragging && !reducedMotionRef.current && Math.abs(state.velocity) > 0.0005) {
        state.yawTarget += state.velocity * dt;
        state.velocity *= Math.pow(0.02, dt);
      } else if (!state.dragging) {
        state.velocity = 0;
      }

      state.yaw += (state.yawTarget - state.yaw) * Math.min(1, dt * 7);
      state.pitch += (state.pitchTarget - state.pitch) * Math.min(1, dt * 7);
      state.distance += (state.distanceTarget - state.distance) * Math.min(1, dt * 5);

      spin.rotation.y = state.yaw;
      spin.rotation.x = state.pitch;
      camera.position.z = state.distance;

      if (state.textureOpacity < 1) {
        state.textureOpacity = Math.min(1, state.textureOpacity + dt * 1.5);
        material.opacity = state.textureOpacity;
        if (state.textureOpacity >= 1) {
          material.transparent = false;
          material.needsUpdate = true;
        }
      }

      graticule.visible = gridRef.current;
      equator.visible = gridRef.current;

      sunWorld.copy(state.sunDirection).applyQuaternion(tilt.getWorldQuaternion(tmpQuaternion)).normalize();
      for (const shell of state.atmosphere) {
        (shell.uniforms.uSunDirection.value as THREE.Vector3).copy(sunWorld);
      }
      sunLight.position.copy(state.sunDirection).multiplyScalar(12);

      renderer.render(scene, camera);
    };
    renderLoop();

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', resize);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', endPointer);
      element.removeEventListener('pointercancel', endPointer);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('dblclick', onDoubleClick);
      element.removeEventListener('keydown', onKeyDown);
      pointers.clear();
      state.texture?.dispose();
      for (const item of disposables) item.dispose();
      tilt.clear();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss?.();
      if (element.parentElement === mount) mount.removeChild(element);
      sceneRef.current = null;
      resetRef.current = null;
    };
    // The scene is built once; layer/date/reduced-motion changes are handled by
    // the smaller effects below so the WebGL context is not rebuilt per date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality]);

  /* ---------------------------- sun / orientation ---------------------------- */

  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    state.sunDirection.copy(sun.direction);
  }, [sun]);

  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    state.yawTarget = start.yaw;
    state.pitchTarget = start.pitch;
    state.velocity = 0;
  }, [start]);

  useEffect(() => {
    if (reducedMotion) setSpinEnabled(false);
  }, [reducedMotion]);

  /* ------------------------------- imagery ---------------------------------- */

  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return undefined;

    let cancelled = false;
    const ladder = quality === 'low' ? [2048, 1024] : [4096, 2048, 1024];
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');

    setStatus('loading');
    setTextureWidth(null);

    const attempt = (index: number) => {
      if (cancelled) return;
      if (index >= ladder.length) {
        setStatus('error');
        fallbackRef.current('texture');
        return;
      }
      const width = ladder[index];
      loader.load(
        wmsTextureUrl(layer, date, width, width / 2),
        (texture) => {
          if (cancelled) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = state.maxAnisotropy;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = true;
          const previous = state.material.map;
          state.material.map = texture;
          state.material.color.set(0xffffff);
          state.material.needsUpdate = true;
          state.texture = texture;
          previous?.dispose();

          if (state.firstTexture) {
            state.firstTexture = false;
            state.distance = reducedMotionRef.current ? DISTANCE_DEFAULT : DISTANCE_WIDE;
            state.distanceTarget = DISTANCE_DEFAULT;
          }
          if (!reducedMotionRef.current) {
            state.textureOpacity = 0;
            state.material.transparent = true;
            state.material.opacity = 0;
          } else {
            state.textureOpacity = 1;
            state.material.opacity = 1;
            state.material.transparent = false;
            state.material.needsUpdate = true;
          }
          setTextureWidth(width);
          setStatus('ready');
        },
        undefined,
        () => attempt(index + 1)
      );
    };
    attempt(0);

    return () => {
      cancelled = true;
    };
  }, [layer.id, date, quality]);

  const resolutionLabel = textureWidth ? t('earthGlobeTextureRes', { width: textureWidth, height: textureWidth / 2 }) : null;
  const sunLabel = t('earthGlobeSunReadout', {
    lat: `${Math.abs(sun.declinationDeg).toFixed(1)}°${sun.declinationDeg >= 0 ? 'N' : 'S'}`
  });

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-[#03060d]">
      <div
        ref={mountRef}
        className="h-[340px] w-full sm:h-[460px]"
        role="application"
        tabIndex={-1}
        aria-label={`${t('earthGlobeAriaLabel', { title: layer.title, date })}. ${t('earthGlobeKeyboardHint')}`}
      />

      {/* vignette — pure presentation */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(120% 120% at 50% 45%, rgba(3,6,13,0) 45%, rgba(3,6,13,0.55) 100%)' }}
        aria-hidden="true"
      />

      <div className="pointer-events-none absolute top-2 left-2 flex flex-col gap-1">
        <span className="rounded-full border border-cyan-500/40 bg-slate-950/80 px-2 py-0.5 font-mono text-[10px] text-cyan-200">
          {layer.id} · {date}
        </span>
        {resolutionLabel ? (
          <span className="rounded-full border border-slate-700/80 bg-slate-950/75 px-2 py-0.5 font-mono text-[10px] text-slate-300">
            {resolutionLabel}
          </span>
        ) : null}
      </div>

      {status === 'ready' ? (
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          <button
            type="button"
            aria-pressed={showGrid}
            aria-label={t('earthGlobeGrid')}
            title={t('earthGlobeGrid')}
            onClick={() => setShowGrid((value) => !value)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition ${
              showGrid ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-100' : 'border-slate-700 bg-slate-950/85 text-slate-300 hover:border-slate-500'
            }`}
          >
            <Grid3x3 className="h-3 w-3" />
            <span className="hidden sm:inline">{t('earthGlobeGrid')}</span>
          </button>
          <button
            type="button"
            aria-pressed={spinEnabled}
            aria-label={spinEnabled ? t('earthGlobeSpinPause') : t('earthGlobeSpin')}
            title={spinEnabled ? t('earthGlobeSpinPause') : t('earthGlobeSpin')}
            onClick={() => setSpinEnabled((value) => !value)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition ${
              spinEnabled ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-100' : 'border-slate-700 bg-slate-950/85 text-slate-300 hover:border-slate-500'
            }`}
          >
            {spinEnabled ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            <span className="hidden sm:inline">{spinEnabled ? t('earthGlobeSpinPause') : t('earthGlobeSpin')}</span>
          </button>
          <button
            type="button"
            onClick={() => resetRef.current?.()}
            aria-label={t('earthResetView')}
            title={t('earthResetView')}
            className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-950/85 px-2 py-1 text-[10px] text-slate-200 transition hover:border-cyan-500/60"
          >
            <RotateCcw className="h-3 w-3" />
            <span className="hidden sm:inline">{t('earthResetView')}</span>
          </button>
        </div>
      ) : null}

      {status === 'ready' ? (
        <div className="pointer-events-none absolute right-2 bottom-2 flex items-center gap-1 rounded-full border border-amber-400/30 bg-slate-950/80 px-2 py-0.5 text-[10px] text-amber-100/90">
          <Sun className="h-3 w-3" />
          <span>{sunLabel}</span>
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-2 left-2 max-w-[80%] space-y-0.5 text-[10px] leading-relaxed text-slate-400">
        <p>
          {t('earthGlobeHint')} · {t('earthGlobeKeyboardHint')}
        </p>
        <p className="text-slate-500">{t('earthGlobeShadingNote')}</p>
        <p className="text-slate-500">{t('earthImageryAttribution')}</p>
      </div>

      {status === 'loading' ? (
        <div role="status" aria-live="polite" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/70">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
          <p className="text-xs text-slate-300">{t('earthGlobeTexturePending')}</p>
        </div>
      ) : null}
      {status === 'error' ? (
        <div role="status" className="absolute inset-0 flex items-center justify-center bg-slate-950/80 px-6 text-center">
          <p className="text-xs text-amber-200">{t('earthGlobeFallback')}</p>
        </div>
      ) : null}
    </div>
  );
}
