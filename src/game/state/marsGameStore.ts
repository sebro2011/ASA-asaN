/**
 * The game's state, split into two clocks.
 *
 * Mutating React state every frame would re-render the HUD 60 times a second and
 * drop a tablet to single digits. So there are two layers:
 *
 *   `SimulationState`  — mutated by the frame loop in place. Never read by React
 *                        directly; it is the physics truth.
 *   `StoreSnapshot`    — an immutable summary published at ≤10 Hz through
 *                        `useSyncExternalStore`, which React renders from.
 *
 * The 10 Hz cap is deliberate: a HUD that updates at 60 Hz is unreadable anyway,
 * and oxygen/battery are slow quantities. Interaction prompts and notifications
 * are immediate (they are state transitions, not telemetry).
 */
import type { MissionFlag } from '../science/missions';
import type { RockInstance } from '../world/rocks';
import type { Collider } from '../physics/colliders';

export type CameraMode = 'third' | 'first';
export type PlayerMode = 'foot' | 'rover';
export type QualityPreset = 'high' | 'balanced' | 'low';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Everything the frame loop mutates. One instance, lives in a ref. */
export interface SimulationState {
  time: number;
  /** Whether the simulation is advancing (false while a menu is open). */
  running: boolean;

  player: {
    position: Vec3;
    /** Yaw around Y, radians. 0 faces −Z. */
    yaw: number;
    /** Pitch, radians, clamped. */
    pitch: number;
    /** Horizontal speed, m/s. */
    speed: number;
    /** Vertical velocity, m/s (jumping/falling). */
    verticalVelocity: number;
    grounded: boolean;
    mode: PlayerMode;
  };

  rover: {
    position: Vec3;
    /** Heading, radians. */
    heading: number;
    /** Forward speed, m/s. */
    speed: number;
    /** Steering input this frame, −1…1. */
    steer: number;
    /** True once the astronaut has boarded. */
    occupied: boolean;
    /** Metres travelled this session. */
    distance: number;
  };

  resources: {
    /** Oxygen, 0…1. */
    oxygen: number;
    /** Suit battery, 0…1. */
    suitBattery: number;
    /** Rover battery, 0…1. */
    roverBattery: number;
    /** Player energy/stamina, 0…1. */
    energy: number;
  };

  camera: {
    mode: CameraMode;
    /** Smoothed orbit yaw/pitch offset for the third-person camera. */
    yaw: number;
    pitch: number;
    distance: number;
  };

  /** Sun angle, radians (0 = dawn, π = dusk). */
  sunAngle: number;
  /** 0 = night, 1 = full day; derived from the sun angle. */
  daylight: number;
}

export interface SampleRecord {
  /** Rock id, or a synthetic id for a surface sample. */
  sourceId: string;
  kind: string;
  label: string;
  /** 0…1 confidence of the (illustrative) identification. */
  confidence: number;
  x: number;
  z: number;
  /** ISO timestamp of collection. */
  collectedAt: string;
}

export interface JournalRecord {
  id: string;
  /** ISO timestamp. */
  at: string;
  title: string;
  body: string;
  /** Research progress contribution, 0…1. */
  progress: number;
}

export interface DiscoveryRecord {
  id: string;
  label: string;
  x: number;
  z: number;
  at: string;
}

export interface StoreSnapshot {
  ready: boolean;
  paused: boolean;
  playerMode: PlayerMode;
  cameraMode: CameraMode;
  quality: QualityPreset;
  /** Player position, rounded for display. */
  position: Vec3;
  heading: number;
  oxygen: number;
  suitBattery: number;
  roverBattery: number;
  energy: number;
  /** Rover distance, metres. */
  roverDistance: number;
  /** Walked distance, metres. */
  walkedDistance: number;
  samples: SampleRecord[];
  missionFlags: MissionFlag[];
  journal: JournalRecord[];
  discoveries: DiscoveryRecord[];
  /** What the player can interact with right now, if anything. */
  prompt: InteractionPrompt | null;
  /** Transient toast, cleared after a few seconds. */
  notification: { id: string; title: string; body: string } | null;
  /** Research completion, 0…1. */
  researchProgress: number;
  fps: number;
  /** Set when the renderer had to shed quality or resolution. */
  qualityNote: string | null;
  daylight: number;
  startedAt: string | null;
}

export interface InteractionPrompt {
  id: string;
  kind: 'rock' | 'rover' | 'station' | 'sample' | 'lander';
  label: string;
  /** Distance in metres. */
  distance: number;
  /** Verb to show on the action button. */
  action: string;
}

/** The interactive structures the world seeds around the landing site. */
export interface StationDefinition {
  id: string;
  label: string;
  kind: 'base' | 'lab' | 'pad' | 'relay';
  x: number;
  z: number;
  /** Footprint half extents, metres. */
  halfX: number;
  halfZ: number;
  /** Height of the module, metres. */
  height: number;
  /** Y rotation. */
  rotation: number;
  body: string;
}

/** The seeded structures: a small base near the landing site. */
export const STATIONS: StationDefinition[] = [
  {
    id: 'hab',
    label: 'Hab module',
    kind: 'base',
    x: 18,
    z: -26,
    halfX: 6,
    halfZ: 3.4,
    height: 3.2,
    rotation: 0.35,
    body: 'Pressurised habitat. Simulated life-support figures are shown in the HUD; no real mission data feeds this module.',
  },
  {
    id: 'lab',
    label: 'Science laboratory',
    kind: 'lab',
    x: 3,
    z: -34,
    halfX: 4.6,
    halfZ: 3.2,
    height: 2.6,
    rotation: -0.2,
    body: 'Sample analysis bench. Identifications made here are illustrative classifications drawn from published Mars mineralogy, not measurements.',
  },
  {
    id: 'pad',
    label: 'Rover parking pad',
    kind: 'pad',
    x: -8,
    z: -18,
    halfX: 5,
    halfZ: 5,
    height: 0.35,
    rotation: 0,
    body: 'A graded pad of compacted regolith. The rover recharges here, slowly, as it would from a solar array.',
  },
  {
    id: 'relay',
    label: 'Relay mast',
    kind: 'relay',
    x: 26,
    z: -12,
    halfX: 0.6,
    halfZ: 0.6,
    height: 9,
    rotation: 0,
    body: 'A simulated UHF relay. No signal is actually transmitted or received by this page.',
  },
];

/** Colliders for the seeded structures. */
export function stationColliders(): Collider[] {
  return STATIONS.map((station) => ({
    kind: 'building' as const,
    id: station.id,
    x: station.x,
    z: station.z,
    y: station.height / 2,
    halfX: station.halfX,
    halfZ: station.halfZ,
    halfHeight: station.height / 2,
    rotation: station.rotation,
  }));
}

/** Rocks within interaction range are added to the collider list by the host. */
export function rockColliders(rocks: readonly RockInstance[]): Collider[] {
  // Only stones that can actually stop a 0.42 m-radius astronaut or a 1.35 m
  // rover. The threshold was irrelevant at 14 rocks per chunk and is not at 44:
  // a 0.46 m pebble cannot impede either, and including it multiplied the
  // per-step collision cost by six for no gameplay effect. 0.9 m is roughly
  // knee height — below that the mover steps over it.
  return rocks
    .filter((rock) => rock.radius > 0.9)
    .map((rock) => ({
      kind: 'rock' as const,
      id: rock.id,
      x: rock.x,
      z: rock.z,
      y: rock.y,
      radius: rock.radius * 0.8,
      halfHeight: rock.radius,
    }));
}

export function createSnapshot(): StoreSnapshot {
  return {
    ready: false,
    paused: false,
    playerMode: 'foot',
    cameraMode: 'third',
    quality: 'high',
    position: { x: 0, y: 0, z: 0 },
    heading: 0,
    oxygen: 1,
    suitBattery: 1,
    roverBattery: 1,
    energy: 1,
    roverDistance: 0,
    walkedDistance: 0,
    samples: [],
    missionFlags: [],
    journal: [],
    discoveries: [],
    prompt: null,
    notification: null,
    researchProgress: 0,
    fps: 0,
    qualityNote: null,
    daylight: 1,
    startedAt: null,
  };
}
