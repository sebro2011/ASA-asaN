/**
 * build-3d-models.mjs — generate the app's spacecraft 3D assets.
 *
 * The site historically faked spacecraft (JWST, ISS, …) out of primitive meshes
 * inside the React scene. This script builds five recognisable spacecraft from
 * the same Three.js geometry primitives once, offline, and exports real model
 * files the app loads with useGLTF:
 *
 *   public/models/<id>.glb   — WebGL / Android Scene Viewer
 *   public/models/<id>.usdz  — iOS Quick Look AR
 *
 * Design constraints
 *  - Pure geometry + PBR colours, zero image textures: GLTFExporter's Node
 *    path only needs a tiny FileReader polyfill (no canvas/DOM dependencies).
 *  - Low segment counts keep every GLB small enough to ship in the PWA
 *    precache and load on mobile without a loading screen.
 *  - Every model is normalised to a ~4-unit bounding sphere and centred at the
 *    origin so one camera rig frames all of them.
 *
 * Run:  node scripts/build-3d-models.mjs
 * The outputs are committed; this script only needs re-running when the models
 * change, so the hosting build never depends on it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';

// GLTFExporter binary path converts a Blob via FileReader, which Node lacks.
// Blob.arrayBuffer() is the standard equivalent and Node ships Blob globally.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'models');
fs.mkdirSync(OUT_DIR, { recursive: true });

/* ------------------------------------------------------------- materials */

const mat = (color, metalness = 0.6, roughness = 0.45) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });

const M = {
  truss: mat(0x9aa6b2, 0.85, 0.35),
  module: mat(0xe8edf2, 0.25, 0.55),
  moduleDark: mat(0xb8c2cc, 0.5, 0.5),
  solar: mat(0x1d3f8f, 0.55, 0.35),
  solarFrame: mat(0xc7d0da, 0.8, 0.3),
  radiator: mat(0xf2f5f8, 0.3, 0.4),
  gold: mat(0xd9a441, 1.0, 0.28),
  goldFoil: mat(0xc98a2e, 0.9, 0.42),
  sunshield: mat(0xc08bb8, 0.15, 0.6),
  graphite: mat(0x23282d, 0.75, 0.45),
  black: mat(0x0e1116, 0.4, 0.6),
  white: mat(0xf4f6f8, 0.2, 0.5),
  red: mat(0xb3372e, 0.5, 0.45),
  wheel: mat(0x1b1e22, 0.6, 0.55),
  copper: mat(0xb5643d, 0.85, 0.35),
};

function mesh(geometry, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

/* -------------------------------------------------------------- builders */

function buildISS() {
  const g = new THREE.Group();
  g.name = 'ISS';

  // Main horizontal truss spine.
  g.add(mesh(new THREE.BoxGeometry(9.4, 0.12, 0.12), M.truss));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), M.truss, -3.4, 0, 0));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), M.truss, 3.4, 0, 0));

  // Pressurised module cluster along Z (perpendicular to truss).
  const moduleZ = (z, radius, length, material) =>
    g.add(mesh(new THREE.CylinderGeometry(radius, radius, length, 24), material, 0, 0, z, Math.PI / 2));
  moduleZ(-1.05, 0.34, 1.5, M.module);
  moduleZ(0.25, 0.32, 1.35, M.module);
  moduleZ(1.45, 0.3, 1.1, M.moduleDark);
  // Node capsules.
  g.add(mesh(new THREE.SphereGeometry(0.36, 20, 16), M.module, 0, 0, -0.35));
  g.add(mesh(new THREE.SphereGeometry(0.32, 20, 16), M.module, 0, 0, 0.95));

  // Four solar array wing pairs on either end of the truss.
  const solarWing = (x, side) => {
    const frame = mesh(new THREE.BoxGeometry(1.7, 0.06, 1.5), M.solarFrame, x, side * 0.55, 0);
    const panel = mesh(new THREE.BoxGeometry(1.6, 0.07, 1.4), M.solar, x, side * 0.55, 0);
    g.add(frame, panel);
    g.add(mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), M.truss, x, side * 0.18, 0));
  };
  [-3.9, -2.5, 2.5, 3.9].forEach((x) => {
    solarWing(x, 1);
    solarWing(x, -1);
  });

  // Radiator panels (white, smaller wings near the centre).
  [-1.55, 1.55].forEach((x) => {
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), M.radiator, x, 0.42, 0));
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), M.radiator, x, -0.42, 0));
  });

  // Docked visiting capsule under the module cluster.
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.5, 20), M.white, 0, -0.55, -0.35));
  g.add(mesh(new THREE.ConeGeometry(0.28, 0.35, 20), M.graphite, 0, -0.95, -0.35, Math.PI));

  // Canadarm2-style manipulator (two segments).
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8), M.moduleDark, 1.1, -0.25, 0.7, 0.9, 0, 0.4));
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 8), M.moduleDark, 1.9, -0.7, 0.9, 1.15, 0, -0.2));
  return g;
}

function buildJWST() {
  const g = new THREE.Group();
  g.name = 'JWST';

  // Primary mirror: 18 gold hex segments in the classic centre + two wings.
  const hexGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 6);
  const hexRing = [
    [0, 0],
    [0.62, 0],
    [-0.62, 0],
    [0.31, 0.54],
    [-0.31, 0.54],
    [0.31, -0.54],
    [-0.31, -0.54],
  ];
  const wing = (sign) => {
    g.add(mesh(hexGeo, M.gold, sign * 0.93, 0.54, 0, Math.PI / 2));
    g.add(mesh(hexGeo, M.gold, sign * 0.93, -0.54, 0, Math.PI / 2));
    g.add(mesh(hexGeo, M.gold, sign * 1.24, 0, 0, Math.PI / 2));
  };
  hexRing.forEach(([x, y]) => g.add(mesh(hexGeo, M.gold, x, y, 0, Math.PI / 2)));
  wing(1);
  wing(-1);

  // Secondary mirror on three struts in front of the primary.
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 6), M.graphite, 0, 0, -0.95, Math.PI / 2));
  for (const [x, y] of [
    [0.3, 0.26],
    [-0.3, 0.26],
    [0, -0.32],
  ]) {
    const strut = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.05, 8), M.graphite, x / 2, y / 2, -0.5);
    strut.lookAt(new THREE.Vector3(x, y, -0.95));
    strut.rotateX(Math.PI / 2);
    g.add(strut);
  }

  // Bus / instrument block behind the mirror.
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.7, 0.7), M.graphite, 0, 0, 0.65));

  // Five-layer sunshield, each plate larger than the one above it.
  for (let i = 0; i < 5; i += 1) {
    const size = 2.6 + i * 0.42;
    const plate = mesh(
      new THREE.BoxGeometry(size, size * 0.66, 0.02),
      i === 4 ? M.radiator : M.sunshield,
      0,
      0,
      1.05 + i * 0.09,
      -0.12,
      0,
      0
    );
    g.add(plate);
  }
  return g;
}

function buildPerseverance() {
  const g = new THREE.Group();
  g.name = 'Perseverance';

  // Warm-gold equipment chassis.
  g.add(mesh(new THREE.BoxGeometry(1.5, 0.55, 1.7), M.goldFoil, 0, 0.55, 0));
  g.add(mesh(new THREE.BoxGeometry(1.1, 0.35, 1.2), M.graphite, 0, 0.95, -0.1));

  // Six wheels on rocker-bogie legs.
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.28, 20);
  for (const z of [-0.85, 0, 0.85]) {
    for (const x of [-1.05, 1.05]) {
      g.add(mesh(wheelGeo, M.wheel, x, 0.32, z, 0, 0, Math.PI / 2));
      g.add(mesh(new THREE.BoxGeometry(0.55, 0.08, 0.08), M.graphite, x * 0.72, 0.55, z));
    }
  }

  // Instrument mast with dual cameras.
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.15, 10), M.truss, -0.35, 1.35, -0.55));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.22, 0.22), M.white, -0.35, 1.95, -0.55));
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 14), M.black, -0.5, 1.95, -0.67, Math.PI / 2));
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 14), M.black, -0.2, 1.95, -0.67, Math.PI / 2));

  // Robotic arm folded over the front.
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8), M.truss, 0.55, 0.95, -0.95, 1.1, 0, 0.3));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8), M.truss, 1.1, 0.7, -1.25, 1.35, 0, -0.4));
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.18, 0.18), M.copper, 1.4, 0.55, -1.45));

  // RTG unit at the rear.
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 14), M.graphite, 0, 0.6, 1.05));
  return g;
}

function buildOrion() {
  const g = new THREE.Group();
  g.name = 'Orion';

  // Crew capsule: bell-shaped lathe profile.
  const capsuleProfile = [
    new THREE.Vector2(0.18, -0.55),
    new THREE.Vector2(0.5, -0.45),
    new THREE.Vector2(0.62, -0.1),
    new THREE.Vector2(0.55, 0.25),
    new THREE.Vector2(0.34, 0.5),
    new THREE.Vector2(0.12, 0.58),
  ];
  g.add(mesh(new THREE.LatheGeometry(capsuleProfile, 28), M.module));
  // Heat shield disc.
  g.add(mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.08, 28), M.graphite, 0, -0.52, 0));

  // European Service Module cylinder behind the capsule.
  g.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.95, 28), M.graphite, 0, -1.05, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.35, 24), M.copper, 0, -1.7, 0));

  // Four cross-shaped solar wings.
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2;
    const x = Math.cos(angle) * 0.85;
    const z = Math.sin(angle) * 0.85;
    const wing = mesh(new THREE.BoxGeometry(0.95, 0.42, 0.03), M.solar, x, -1.05, z);
    wing.lookAt(new THREE.Vector3(Math.cos(angle) * 2, -1.05, Math.sin(angle) * 2));
    g.add(wing);
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.06, 0.06), M.truss, Math.cos(angle) * 0.62, -1.05, Math.sin(angle) * 0.62));
  }
  return g;
}

function buildApolloCSM() {
  const g = new THREE.Group();
  g.name = 'Apollo CSM';

  // Command module: blunt cone with rounded apex.
  const cmProfile = [
    new THREE.Vector2(0.45, -0.45),
    new THREE.Vector2(0.45, -0.2),
    new THREE.Vector2(0.36, 0.1),
    new THREE.Vector2(0.2, 0.35),
    new THREE.Vector2(0.08, 0.45),
  ];
  g.add(mesh(new THREE.LatheGeometry(cmProfile, 28), M.module));
  g.add(mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.07, 28), M.graphite, 0, -0.46, 0));

  // Service module: long cylindrical equipment bay.
  g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 28), M.moduleDark, 0, -1.05, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 28), M.truss, 0, -0.5, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 28), M.truss, 0, -1.6, 0));

  // Engine bell at the aft end.
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.3, 0.45, 24), M.copper, 0, -1.85, 0));

  // Four RCS thruster quads around the service module.
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(
      mesh(
        new THREE.BoxGeometry(0.12, 0.18, 0.12),
        M.black,
        Math.cos(angle) * 0.43,
        -1.05,
        Math.sin(angle) * 0.43
      )
    );
  }

  // Docking probe tip at the apex.
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.25, 10), M.truss, 0, 0.58, 0));
  return g;
}

/* ------------------------------------------------------------ normalising */

function normalise(group, targetSize = 4) {
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = targetSize / maxDim;
  group.scale.setScalar(scale);
  const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
  group.position.sub(center);
  group.updateMatrixWorld(true);
}

/* ------------------------------------------------------------------ write */

const MODELS = [
  { id: 'iss', builder: buildISS, name: 'International Space Station' },
  { id: 'jwst', builder: buildJWST, name: 'James Webb Space Telescope' },
  { id: 'perseverance', builder: buildPerseverance, name: 'Perseverance Rover' },
  { id: 'orion', builder: buildOrion, name: 'Orion / Artemis Capsule' },
  { id: 'apollo-csm', builder: buildApolloCSM, name: 'Apollo Command & Service Module' },
];

const gltfExporter = new GLTFExporter();
const usdzExporter = new USDZExporter();
const manifest = [];

for (const { id, builder, name } of MODELS) {
  const group = builder();
  normalise(group);

  const glb = await gltfExporter.parseAsync(group, { binary: true });
  const glbPath = path.join(OUT_DIR, `${id}.glb`);
  fs.writeFileSync(glbPath, Buffer.from(glb));

  const usdz = await usdzExporter.parseAsync(group);
  const usdzPath = path.join(OUT_DIR, `${id}.usdz`);
  fs.writeFileSync(usdzPath, Buffer.from(usdz));

  manifest.push({ id, name, glb: `/models/${id}.glb`, usdz: `/models/${id}.usdz` });
  console.log(`✓ ${id.padEnd(12)} GLB ${glb.byteLength.toLocaleString()} B · USDZ ${usdz.byteLength.toLocaleString()} B`);
}

fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\nWrote ${MODELS.length} model pairs + manifest.json to ${path.relative(process.cwd(), OUT_DIR)}`);
