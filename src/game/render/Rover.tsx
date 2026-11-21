/** A procedural six-wheel field rover, inspired by Mars exploration vehicles. */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MarsEngine } from '../engine';
import { ROVER_HALF_LENGTH, ROVER_HALF_WIDTH } from '../physics/roverDrive';
import { STATIONS } from '../state/marsGameStore';
import { groundSpan } from './Stations';

const WHEEL_RADIUS = 0.36;
const WHEEL_OFFSETS: Array<[number, number, number]> = [
  [-ROVER_HALF_WIDTH, WHEEL_RADIUS, -ROVER_HALF_LENGTH],
  [ROVER_HALF_WIDTH, WHEEL_RADIUS, -ROVER_HALF_LENGTH],
  [-ROVER_HALF_WIDTH, WHEEL_RADIUS, 0],
  [ROVER_HALF_WIDTH, WHEEL_RADIUS, 0],
  [-ROVER_HALF_WIDTH, WHEEL_RADIUS, ROVER_HALF_LENGTH],
  [ROVER_HALF_WIDTH, WHEEL_RADIUS, ROVER_HALF_LENGTH],
];

/** Merge the tyre and raised treads into one shared draw per wheel. */
export function makeWheelGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tyre = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.28, 16);
  tyre.rotateZ(Math.PI / 2);
  parts.push(tyre);
  for (let i = 0; i < 10; i += 1) {
    const angle = i * Math.PI * 2 / 10;
    const tread = new THREE.BoxGeometry(0.29, 0.045, 0.065);
    tread.translate(0, WHEEL_RADIUS, 0);
    tread.rotateX(angle);
    parts.push(tread);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((geometry) => geometry.dispose());
  return merged;
}

export function Rover({ engine }: { engine: MarsEngine }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const wheels = useRef<Array<THREE.Group | null>>([]);
  const wheelGeometry = useMemo(makeWheelGeometry, []);
  const pad = useMemo(() => {
    const station = STATIONS.find((item) => item.kind === 'pad');
    if (!station) return null;
    // Pad's top is 0.04 m above the seat plus half its 0.26 m slab.
    return { ...station, top: groundSpan(station).seat + 0.17 };
  }, []);
  const materials = useMemo(() => ({
    chassis: new THREE.MeshStandardMaterial({ color: '#c5c2b8', roughness: 0.68, metalness: 0.22 }),
    deck: new THREE.MeshStandardMaterial({ color: '#626a6b', roughness: 0.75, metalness: 0.25 }),
    insulation: new THREE.MeshStandardMaterial({ color: '#bd9252', roughness: 0.56, metalness: 0.5 }),
    wheel: new THREE.MeshStandardMaterial({ color: '#49494a', roughness: 0.9, metalness: 0.2 }),
    hub: new THREE.MeshStandardMaterial({ color: '#a1a19b', roughness: 0.72, metalness: 0.35 }),
    lens: new THREE.MeshStandardMaterial({ color: '#243c46', roughness: 0.22, metalness: 0.5 }),
  }), []);
  useEffect(() => () => {
    wheelGeometry.dispose();
    Object.values(materials).forEach((material) => material.dispose());
  }, [materials, wheelGeometry]);

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;
    const rover = engine.state.rover;
    // The charging pad is visual geometry above the analytic terrain. Without a
    // render-only lift the rover spawns with its wheels buried inside the slab.
    // Blend at its edges; physics, saves and interaction positions stay unchanged.
    let padBlend = 0;
    if (pad) {
      const dx = rover.position.x - pad.x;
      const dz = rover.position.z - pad.z;
      const cos = Math.cos(pad.rotation), sin = Math.sin(pad.rotation);
      const x = Math.abs(dx * cos + dz * sin);
      const z = Math.abs(-dx * sin + dz * cos);
      padBlend = Math.max(0, Math.min(1, pad.halfX - x, pad.halfZ - z));
    }
    const lift = pad ? Math.max(0, pad.top - rover.position.y) * padBlend : 0;
    group.position.set(rover.position.x, rover.position.y + lift, rover.position.z);
    group.rotation.y = rover.heading;
    if (body.current) {
      const tilt = engine.roverTilt();
      body.current.rotation.x = tilt.pitch * (1 - padBlend);
      body.current.rotation.z = tilt.roll * (1 - padBlend);
    }
    // The wheel group rotates around its horizontal axle. Reverse reverses spin.
    const spin = rover.speed / WHEEL_RADIUS * Math.min(delta, 0.1);
    for (const wheel of wheels.current) if (wheel) wheel.rotation.x -= spin;
  });

  return (
    <group ref={root} name="rover">
      <group ref={body}>
        {/* Layered deck, belly and protective equipment panels. */}
        <mesh position={[0, 0.66, 0]} material={materials.chassis} castShadow>
          <boxGeometry args={[ROVER_HALF_WIDTH * 2 - 0.2, 0.22, ROVER_HALF_LENGTH * 2 - 0.2]} />
        </mesh>
        <mesh position={[0, 0.46, 0]} material={materials.deck} castShadow>
          <boxGeometry args={[1.76, 0.22, 2.9]} />
        </mesh>
        <mesh position={[0, 0.81, 0.1]} material={materials.insulation} castShadow>
          <boxGeometry args={[1.55, 0.1, 1.6]} />
        </mesh>
        {([-1, 1] as const).map((side) => (
          <group key={`side:${side}`}>
            <mesh position={[side * 0.96, 0.73, 0]} material={materials.deck}>
              <boxGeometry args={[0.08, 0.22, 2.8]} />
            </mesh>
            {[-ROVER_HALF_LENGTH, 0, ROVER_HALF_LENGTH].map((z) => (
              <mesh key={z} position={[side * 1.03, 0.49, z]} rotation={[0, 0, Math.PI / 2]} material={materials.deck}>
                <cylinderGeometry args={[0.055, 0.055, 0.44, 8]} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Mast: a pair of cameras on a raised head. */}
        <mesh position={[0.28, 1.17, -0.85]} material={materials.chassis} castShadow>
          <cylinderGeometry args={[0.065, 0.075, 1.02, 8]} />
        </mesh>
        <mesh position={[0.28, 1.72, -0.85]} material={materials.chassis} castShadow>
          <boxGeometry args={[0.49, 0.22, 0.24]} />
        </mesh>
        {[-0.12, 0.12].map((x) => (
          <mesh key={x} position={[0.28 + x, 1.72, -0.977]} material={materials.lens}>
            <sphereGeometry args={[0.065, 10, 8]} />
          </mesh>
        ))}
        <mesh position={[-0.38, 0.87, 0.72]} material={materials.chassis} castShadow>
          <boxGeometry args={[0.48, 0.3, 0.55]} />
        </mesh>
        <mesh position={[-0.38, 1.04, 0.72]} material={materials.insulation}>
          <boxGeometry args={[0.5, 0.05, 0.57]} />
        </mesh>
        {/* Antenna and a compact forward-facing instrument housing. */}
        <mesh position={[-0.45, 0.94, -0.72]} rotation={[0.35, 0, 0]} material={materials.deck}>
          <cylinderGeometry args={[0.28, 0.28, 0.035, 16]} />
        </mesh>
        <mesh position={[0, 0.57, -1.66]} material={materials.deck} castShadow>
          <boxGeometry args={[0.55, 0.25, 0.22]} />
        </mesh>
        <mesh position={[0, 0.57, -1.78]} material={materials.lens}>
          <sphereGeometry args={[0.09, 10, 8]} />
        </mesh>

        {WHEEL_OFFSETS.map((offset, index) => (
          <group key={index} ref={(wheel) => { wheels.current[index] = wheel; }} position={offset}>
            <mesh geometry={wheelGeometry} material={materials.wheel} dispose={null} castShadow />
            <mesh position={[offset[0] < 0 ? -0.15 : 0.15, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.hub}>
              <cylinderGeometry args={[0.16, 0.16, 0.04, 12]} />
            </mesh>
          </group>
        ))}
      </group>
      <pointLight position={[0, 1.1, -1.4]} intensity={1.2} distance={12} color="#cfe9ff" />
    </group>
  );
}
