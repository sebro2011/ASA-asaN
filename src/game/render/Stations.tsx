/**
 * The base: hab, laboratory, landing pad and relay mast.
 *
 * These are the only structures in the world and they exist to make the open world
 * feel inhabited rather than empty. Each is seeded at a fixed offset from the
 * landing site (see `STATIONS`), sunk onto the terrain by sampling the ground at its
 * corners so a module never floats over a slope.
 *
 * No emissive glows or holograms: the visual language is a working field station,
 * not a video-game outpost. The cyan accent is reserved for interactive things.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { STATIONS, type StationDefinition } from '../state/marsGameStore';
import { terrainHeight } from '../world/terrain';
import { SCAN_ACCENT } from './palette';

/**
 * Ground range under a station's footprint, plus the height to seat it at.
 *
 * Every station is a rigid box resting on ground that is not flat. The landing
 * site's footprints span 1.7–2.8 m of relief, so *no single y value* can avoid a
 * gap: seat it high and daylight shows underneath the downhill side; seat it low
 * and it swallows itself. Both of those produced very visible bugs — a hovering
 * slab, then a black wedge where an unlit box side was exposed.
 *
 * The fix is not a better y. It is to stop presenting a bare box rim to the
 * camera: the structure is seated low enough that its lower edge is always buried,
 * and a skirt of earth-toned geometry is dropped from that edge deep enough to
 * cover the worst drop in the footprint. Because the skirt is *below* ground
 * everywhere on the high side, only its buried part is ever hidden; on the low
 * side it becomes the visible foundation, which is what a graded pad looks like.
 */
export function groundSpan(station: StationDefinition): { seat: number; drop: number } {
  const cos = Math.cos(station.rotation);
  const sin = Math.sin(station.rotation);
  const centre = terrainHeight(station.x, station.z);
  let lowest = centre;
  let highest = centre;

  // Four corners plus the edge midpoints: a corner-only sample misses the case
  // where the ground bulges along an edge.
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ]) {
    const localX = sx * station.halfX;
    const localZ = sz * station.halfZ;
    const worldX = station.x + localX * cos - localZ * sin;
    const worldZ = station.z + localX * sin + localZ * cos;
    const height = terrainHeight(worldX, worldZ);
    lowest = Math.min(lowest, height);
    highest = Math.max(highest, height);
  }

  // Seat a third of the way up from the low corner: deep enough that the deck
  // always bites into the ground, high enough that the structure is not swallowed.
  const seat = lowest + (highest - lowest) * 0.34;
  // The skirt must reach past the lowest point, with a margin for the mesh being
  // a coarse approximation of the terrain between the sample points.
  const drop = (seat - lowest) + 0.9;
  return { seat, drop };
}

function Hab({ station }: { station: StationDefinition }) {
  const { seat: y, drop } = groundSpan(station);
  return (
    <group position={[station.x, y, station.z]} rotation={[0, station.rotation, 0]}>
      <Foundation drop={drop} halfX={station.halfX} halfZ={station.halfZ} />
      {/* Main cylinder: a pressurised tube on its side. */}
      <mesh position={[0, 1.15, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[1.5, 1.5, station.halfX * 2, 16]} />
        <meshStandardMaterial color="#d8d4cc" roughness={0.68} metalness={0.18} />
      </mesh>
      {/* Dust-covered end caps */}
      <mesh position={[-station.halfX, 1.15, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <sphereGeometry args={[1.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#c9a882" roughness={0.9} />
      </mesh>
      <mesh position={[station.halfX, 1.15, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <sphereGeometry args={[1.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#c9a882" roughness={0.9} />
      </mesh>
      {/* Structural hoops and observation ports give the pressure hull scale. */}
      {[-3.5, 0, 3.5].map((x) => (
        <mesh key={x} position={[x, 1.15, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[1.505, 0.045, 6, 24]} />
          <meshStandardMaterial color="#8f9695" roughness={0.78} metalness={0.2} />
        </mesh>
      ))}
      {[-2.1, 2.1].map((x) => (
        <group key={x} position={[x, 1.35, 1.49]}>
          <mesh><circleGeometry args={[0.28, 16]} /><meshStandardMaterial color="#31414a" roughness={0.25} metalness={0.4} /></mesh>
          <mesh position={[0, 0, 0.006]}><torusGeometry args={[0.28, 0.045, 6, 16]} /><meshStandardMaterial color="#b3b3a8" roughness={0.7} metalness={0.25} /></mesh>
        </group>
      ))}
      {/* Airlock stub */}
      <mesh position={[0, 0.9, 1.9]} castShadow>
        <boxGeometry args={[1.1, 2.0, 0.9]} />
        <meshStandardMaterial color="#b8b3aa" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.96, 2.36]}>
        <boxGeometry args={[0.72, 1.56, 0.035]} />
        <meshStandardMaterial color="#596265" roughness={0.75} metalness={0.2} />
      </mesh>
      <mesh position={[0, 1.35, 2.385]}>
        <circleGeometry args={[0.2, 16]} />
        <meshStandardMaterial color="#283b43" roughness={0.3} metalness={0.4} />
      </mesh>
    </group>
  );
}

function Lab({ station }: { station: StationDefinition }) {
  const { seat: y, drop } = groundSpan(station);
  return (
    <group position={[station.x, y, station.z]} rotation={[0, station.rotation, 0]}>
      <Foundation drop={drop} halfX={station.halfX} halfZ={station.halfZ} />
      <mesh position={[0, station.height / 2, 0]} castShadow>
        <boxGeometry args={[station.halfX * 2, station.height, station.halfZ * 2]} />
        <meshStandardMaterial color="#cfd4da" roughness={0.6} metalness={0.24} />
      </mesh>
      {/* A bench under a transparent canopy: reads as a science station. */}
      <mesh position={[0, station.height + 0.22, 0]} castShadow>
        <boxGeometry args={[station.halfX * 1.6, 0.12, station.halfZ * 1.4]} />
        <meshStandardMaterial color={SCAN_ACCENT} emissive={new THREE.Color(SCAN_ACCENT)} emissiveIntensity={0.25} roughness={0.4} />
      </mesh>
      <mesh position={[0, station.height + 0.5, 0]} castShadow>
        <boxGeometry args={[station.halfX * 1.2, 0.5, station.halfZ]} />
        <meshStandardMaterial color="#9fb0bd" roughness={0.5} metalness={0.3} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function Pad({ station }: { station: StationDefinition }) {
  const { seat: y, drop } = groundSpan(station);
  return (
    <group position={[station.x, y + 0.04, station.z]} rotation={[0, station.rotation, 0]}>
      <Foundation drop={drop} halfX={station.halfX} halfZ={station.halfZ} taper />
      <mesh>
        <boxGeometry args={[station.halfX * 2, 0.26, station.halfZ * 2]} />
        <meshStandardMaterial color="#6b6259" roughness={0.95} />
      </mesh>
      {/* Corner markers, in the interface accent so the pad is findable at night. */}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz], index) => (
        <mesh key={index} position={[sx * (station.halfX - 0.5), 0.09, sz * (station.halfZ - 0.5)]} castShadow>
          <boxGeometry args={[0.5, 0.06, 0.18]} />
          <meshStandardMaterial color={SCAN_ACCENT} emissive={new THREE.Color(SCAN_ACCENT)} emissiveIntensity={0.6} />
        </mesh>
      ))}
      {/* Charging pylon */}
      <mesh position={[station.halfX - 0.3, 0.7, -station.halfZ + 0.3]} castShadow>
        <boxGeometry args={[0.3, 1.4, 0.3]} />
        <meshStandardMaterial color="#8d949d" roughness={0.6} metalness={0.35} />
      </mesh>
    </group>
  );
}

function Relay({ station }: { station: StationDefinition }) {
  const { seat: y, drop } = groundSpan(station);
  return (
    <group position={[station.x, y, station.z]}>
      <Foundation drop={drop} halfX={station.halfX} halfZ={station.halfZ} />
      <mesh position={[0, station.height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.22, station.height, 8]} />
        <meshStandardMaterial color="#9aa3ad" roughness={0.55} metalness={0.45} />
      </mesh>
      <mesh position={[0, station.height + 0.1, 0]} rotation={[Math.PI / 2.6, 0, 0]} castShadow>
        <cylinderGeometry args={[1.1, 1.1, 0.1, 20, 1, true]} />
        <meshStandardMaterial color="#d9dde2" roughness={0.4} metalness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, station.height * 0.55, 0.3]} castShadow>
        <boxGeometry args={[0.4, 0.5, 0.2]} />
        <meshStandardMaterial color="#4f5862" roughness={0.7} metalness={0.2} />
      </mesh>
    </group>
  );
}

export function Stations() {
  const bodies = useMemo(
    () =>
      STATIONS.map((station) => {
        if (station.kind === 'base') return { station, node: <Hab key={station.id} station={station} /> };
        if (station.kind === 'lab') return { station, node: <Lab key={station.id} station={station} /> };
        if (station.kind === 'pad') return { station, node: <Pad key={station.id} station={station} /> };
        return { station, node: <Relay key={station.id} station={station} /> };
      }),
    [],
  );

  return <group name="stations">{bodies.map((entry) => entry.node)}</group>;
}

/**
 * Buried foundation.
 *
 * Earth-toned, unlit-looking on purpose: it is meant to read as the ground the
 * structure was graded into, not as hardware. `taper` widens it as it descends so
 * a landing pad never shows a vertical face; the buildings use a straight prism
 * because their walls are already vertical above it.
 */
function Foundation({
  drop,
  halfX,
  halfZ,
  taper = false,
}: {
  drop: number;
  halfX: number;
  halfZ: number;
  taper?: boolean;
}) {
  if (taper) {
    return (
      <mesh position={[0, -0.28 - drop / 2, 0]} receiveShadow>
        <cylinderGeometry args={[halfX * 1.01, halfX * 1.04, drop, 20]} />
        <meshStandardMaterial color="#6d5140" roughness={1} />
      </mesh>
    );
  }
  return (
    <mesh position={[0, -drop / 2, 0]} receiveShadow>
      <boxGeometry args={[halfX * 2.02, drop, halfZ * 2.02]} />
      <meshStandardMaterial color="#6d5140" roughness={1} />
    </mesh>
  );
}
