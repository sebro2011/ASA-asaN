/** A lightweight, procedural pressure suit. All geometry is local and no assets are downloaded. */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MarsEngine } from '../engine';

export function Astronaut({ engine }: { engine: MarsEngine }) {
  const group = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);

  const materials = useMemo(() => ({
    suit: new THREE.MeshStandardMaterial({ color: '#d8d6cc', roughness: 0.84, metalness: 0.04 }),
    joint: new THREE.MeshStandardMaterial({ color: '#77756e', roughness: 0.88, metalness: 0.05 }),
    visor: new THREE.MeshStandardMaterial({ color: '#34444b', roughness: 0.22, metalness: 0.55 }),
    trim: new THREE.MeshStandardMaterial({ color: '#c47b42', roughness: 0.7, metalness: 0.08 }),
    panel: new THREE.MeshStandardMaterial({ color: '#4f5b5d', roughness: 0.7, metalness: 0.15 }),
  }), []);
  useEffect(() => () => { Object.values(materials).forEach((material) => material.dispose()); }, [materials]);

  useFrame(() => {
    const body = group.current;
    if (!body) return;
    const { player, camera } = engine.state;
    // A first-person camera is at helmet height; drawing the helmet around it
    // would obstruct the view. The physical player remains present in the engine.
    body.visible = player.mode === 'foot' && camera.mode !== 'first';
    if (!body.visible) return;
    body.position.set(player.position.x, player.position.y, player.position.z);
    body.rotation.y = player.yaw;
    const speed = player.speed;
    const swing = Math.sin(engine.state.time * speed * 2.6) * Math.min(1, speed / 3) * 0.48;
    if (leftLeg.current) leftLeg.current.rotation.x = swing;
    if (rightLeg.current) rightLeg.current.rotation.x = -swing;
    if (leftArm.current) leftArm.current.rotation.x = -swing * 0.65;
    if (rightArm.current) rightArm.current.rotation.x = swing * 0.65;
    if (player.grounded) body.position.y += Math.abs(Math.sin(engine.state.time * speed * 2.6)) * 0.025 * Math.min(1, speed / 3);
  });

  return (
    <group ref={group} name="astronaut">
      {/* Suit torso, waist ring and a recessed life-support pack. */}
      <mesh position={[0, 1.06, 0]} material={materials.suit} castShadow>
        <capsuleGeometry args={[0.27, 0.38, 4, 10]} />
      </mesh>
      <mesh position={[0, 0.82, 0]} material={materials.joint}>
        <cylinderGeometry args={[0.245, 0.235, 0.08, 12]} />
      </mesh>
      <mesh position={[0, 1.17, 0.29]} material={materials.suit} castShadow>
        <boxGeometry args={[0.43, 0.55, 0.24]} />
      </mesh>
      <mesh position={[0, 1.18, 0.418]} material={materials.panel}>
        <boxGeometry args={[0.31, 0.35, 0.025]} />
      </mesh>
      <mesh position={[0, 0.99, 0.435]} material={materials.trim}>
        <boxGeometry args={[0.31, 0.035, 0.025]} />
      </mesh>
      {/* A broad, dark visor faces the same -Z direction as the movement model. */}
      <mesh position={[0, 1.51, 0]} material={materials.suit} castShadow>
        <sphereGeometry args={[0.255, 16, 12]} />
      </mesh>
      <mesh position={[0, 1.52, -0.204]} scale={[1, 0.72, 0.3]} material={materials.visor}>
        <sphereGeometry args={[0.205, 16, 10]} />
      </mesh>
      <mesh position={[0, 1.235, 0]} material={materials.joint}>
        <cylinderGeometry args={[0.2, 0.22, 0.06, 12]} />
      </mesh>
      <mesh position={[0, 1.09, -0.268]} material={materials.panel}>
        <boxGeometry args={[0.22, 0.16, 0.06]} />
      </mesh>
      <mesh position={[0, 1.11, -0.301]} material={materials.trim}>
        <boxGeometry args={[0.14, 0.025, 0.012]} />
      </mesh>
      {/* Limbs rotate around hips and shoulders rather than their centres. */}
      {([-1, 1] as const).map((side) => (
        <group key={`leg:${side}`} ref={side < 0 ? leftLeg : rightLeg} position={[side * 0.13, 0.78, 0]}>
          <mesh position={[0, -0.25, 0]} material={materials.suit} castShadow>
            <capsuleGeometry args={[0.1, 0.35, 3, 8]} />
          </mesh>
          <mesh position={[0, -0.31, -0.008]} material={materials.joint}>
            <boxGeometry args={[0.18, 0.055, 0.18]} />
          </mesh>
          <mesh position={[0, -0.65, -0.055]} material={materials.joint} castShadow>
            <boxGeometry args={[0.19, 0.14, 0.29]} />
          </mesh>
        </group>
      ))}
      {([-1, 1] as const).map((side) => (
        <group key={`arm:${side}`} ref={side < 0 ? leftArm : rightArm} position={[side * 0.34, 1.25, 0]}>
          <mesh material={materials.joint}><sphereGeometry args={[0.1, 8, 6]} /></mesh>
          <mesh position={[0, -0.21, 0]} material={materials.suit} castShadow>
            <capsuleGeometry args={[0.075, 0.28, 3, 8]} />
          </mesh>
          <mesh position={[0, -0.42, 0]} material={materials.joint}>
            <sphereGeometry args={[0.085, 8, 6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
