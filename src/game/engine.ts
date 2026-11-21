import { updateMissionFlags, type MissionFlag } from './science/missions';
/**
 * The simulation engine.
 *
 * Owns the authoritative game state and advances it one frame at a time. It is
 * deliberately renderer-agnostic: `MarsScene` calls `engine.step(dt)` from R3F's
 * `useFrame` and then reads `engine.state` to position objects. Nothing in this
 * file imports Three.js or React, which is why the whole game loop can be driven
 * from a test.
 *
 * Two responsibilities that are easy to get wrong and are therefore explicit here:
 *
 *  · **Fixed-step simulation.** Rendering runs at whatever the display does; the
 *    simulation integrates at 1/60 s. A tablet at 24 FPS gets the same physics as
 *    a desktop at 144 FPS, which means the same jump height and the same rover
 *    turning radius.
 *  · **Resource honesty.** Oxygen and batteries drain at rates the HUD reports as
 *    *simulated*. They are bounded, they regenerate where the fiction says they
 *    should (the pad, the hab), and they never silently refill to keep a session
 *    alive.
 */
import type { InteractionPrompt, JournalRecord, QualityPreset, SampleRecord, StoreSnapshot } from './state/marsGameStore';
import { STATIONS, rockColliders, stationColliders } from './state/marsGameStore';
import type { SimulationState, Vec3 } from './state/marsGameStore';
import { stepAstronaut, spawnAstronaut } from './physics/astronaut';
import { stepRover, roverTilt, roverDrain, ROVER_RECHARGE_PER_SECOND, normaliseAngle } from './physics/roverDrive';
import type { RoverState } from './physics/roverDrive';
import { resolveCollisions, withinRadius } from './physics/colliders';
import type { Collider } from './physics/colliders';
import { groundHeight } from './physics/heightfield';
import { MINERALS, identify, TOTAL_MINERAL_WEIGHT } from './science/catalogue';
import { terrainHeight } from './world/terrain';
import { rocksInChunk } from './world/rocks';
import type { RockInstance } from './world/rocks';
import { chunkOf, CHUNK_SIZE } from './world/chunks';
import { QUALITY_PRESETS } from './quality';
import type { InputIntent } from './input/keyboard';

/** Fixed simulation step. */
export const FIXED_STEP = 1 / 60;

/** How far the player can reach to scan. */
export const INTERACT_RANGE = 6.5;

/** Seconds of oxygen, suit power and rover power at a full tank. */
export const OXYGEN_SECONDS = 900;
export const SUIT_SECONDS = 1200;

/** The landing site, kept in one place so the camera and the engine agree. */
export const START_POSITION: Vec3 = { x: 6, y: 0, z: -14 };
export const ROVER_START = { x: -8, z: -18, heading: 0 };

export interface EngineOptions {
  onSnapshot: (snapshot: StoreSnapshot) => void;
  /** Wall-clock ISO timestamp; injectable so tests are deterministic. */
  now?: () => string;
}

export class MarsEngine {
  state: SimulationState;

  private readonly onSnapshot: (snapshot: StoreSnapshot) => void;
  private readonly now: () => string;

  private accumulator = 0;
  private snapshotClock = 0;
  private promptClock = 0;
  private notificationClock = 0;
  private notificationId = 0;
  private heldBoard = false;
  private heldInteract = false;
  private walkedDistance = 0;
  private lastPlayer: Vec3;
  private fps = 0;
  private fpsSamples = 0;
  private fpsAccumulator = 0;

  /** Rocks within streaming range, refreshed when the chunk ring changes. */
  private rocks: RockInstance[] = [];
  private colliders: Collider[] = [];
  private streamedKey = '';
  private lastChunk = { cx: Number.NaN, cz: Number.NaN };
  private roverColliderId = 'rover';

  paused = false;
  startedAt: string | null = null;
  quality: QualityPreset = 'high';
  qualityNote: string | null = null;

  private samples: SampleRecord[] = [];
  private missionFlags: MissionFlag[] = [];
  private journal: JournalRecord[] = [];
  private discoveries: StoreSnapshot['discoveries'] = [];
  private prompt: InteractionPrompt | null = null;
  private notification: StoreSnapshot['notification'] = null;

  constructor(options: EngineOptions) {
    this.onSnapshot = options.onSnapshot;
    this.now = options.now ?? (() => new Date().toISOString());

    const astronaut = spawnAstronaut(START_POSITION.x, START_POSITION.z);
    this.state = {
      time: 0,
      running: false,
      player: {
        position: { x: astronaut.x, y: astronaut.y, z: astronaut.z },
        yaw: 0,
        pitch: -0.05,
        speed: 0,
        verticalVelocity: 0,
        grounded: true,
        mode: 'foot',
      },
      rover: {
        position: { x: ROVER_START.x, y: terrainHeight(ROVER_START.x, ROVER_START.z), z: ROVER_START.z },
        heading: ROVER_START.heading,
        speed: 0,
        steer: 0,
        occupied: false,
        distance: 0,
      },
      resources: { oxygen: 1, suitBattery: 1, roverBattery: 1, energy: 1 },
      // Pitch 0.18 rad (10 degrees) put the camera appreciably above the
      // astronaut and aimed it at the ground 15 m ahead, so the horizon sat in the
      // top third of the frame and the sky was usually a thin band. This world's
      // best feature is its skyline — mesas, canyon rims and distant massifs — and
      // the default camera was cropping almost all of it. A flatter 0.09 keeps the
      // astronaut fully framed while letting the horizon sit near the middle.
      camera: { mode: 'third', yaw: 0, pitch: 0.09, distance: 6.2 },
      sunAngle: Math.PI / 3,
      daylight: 1,
    };
    this.lastPlayer = { ...this.state.player.position };

    // Populate the first ring immediately so the world is never empty on frame 1.
    this.refreshStreaming(true);
  }

  /* ------------------------------------------------------------ lifecycle */

  start(): void {
    this.state.running = true;
    this.paused = false;
    if (!this.startedAt) this.startedAt = this.now();
    this.publish(true);
  }

  pause(): void {
    this.paused = true;
    this.heldBoard = false;
    this.heldInteract = false;
    this.state.running = false;
    this.publish(true);
  }

  resume(): void {
    this.paused = false;
    this.state.running = true;
    this.publish(true);
  }

  /** Restores a validated save. Positions are re-seated on the ground. */
  restore(save: {
    player: { position: Vec3; yaw: number; mode: 'foot' | 'rover' };
    rover: { position: Vec3; heading: number };
    resources: SimulationState['resources'];
    progress: {
      samples: SampleRecord[];
      missionFlags?: MissionFlag[];
      journal: JournalRecord[];
      discoveries: StoreSnapshot['discoveries'];
      roverDistance: number;
      walkedDistance: number;
      researchProgress: number;
      sunAngle: number;
    };
    settings: { quality: QualityPreset; cameraMode: 'third' | 'first' };
  }): void {
    const playerGround = terrainHeight(save.player.position.x, save.player.position.z);
    this.state.player.position = { x: save.player.position.x, y: playerGround, z: save.player.position.z };
    this.state.player.yaw = save.player.yaw;
    this.state.player.mode = save.player.mode;

    this.state.rover.position = {
      x: save.rover.position.x,
      y: terrainHeight(save.rover.position.x, save.rover.position.z),
      z: save.rover.position.z,
    };
    this.state.rover.heading = save.rover.heading;
    this.state.rover.occupied = save.player.mode === 'rover';

    this.state.resources = { ...save.resources };
    this.state.camera.mode = save.settings.cameraMode;
    this.state.sunAngle = save.progress.sunAngle;
    this.state.daylight = daylightFor(save.progress.sunAngle);
    this.quality = save.settings.quality;

    this.samples = [...save.progress.samples];
    this.missionFlags = [...(save.progress.missionFlags ?? [])];
    this.journal = [...save.progress.journal];
    this.discoveries = [...save.progress.discoveries];
    this.state.rover.distance = save.progress.roverDistance;
    this.walkedDistance = save.progress.walkedDistance;

    this.lastPlayer = { ...this.state.player.position };
    this.lastChunk = { cx: Number.NaN, cz: Number.NaN };
    this.refreshStreaming(true);
    this.publish(true);
  }

  /** The current state as a save payload. */
  toSave() {
    return {
      seed: 'mars-explorer-2047',
      player: {
        position: { ...this.state.player.position },
        yaw: this.state.player.yaw,
        mode: this.state.player.mode,
      },
      rover: {
        position: { ...this.state.rover.position },
        heading: this.state.rover.heading,
      },
      resources: { ...this.state.resources },
      settings: { quality: this.quality, cameraMode: this.state.camera.mode },
      progress: {
        samples: this.samples,
        missionFlags: this.missionFlags,
        journal: this.journal,
        discoveries: this.discoveries,
        roverDistance: this.state.rover.distance,
        walkedDistance: this.walkedDistance,
        researchProgress: this.researchProgress(),
        sunAngle: this.state.sunAngle,
      },
    };
  }

  setQuality(preset: QualityPreset, note: string | null = null): void {
    this.quality = preset;
    this.qualityNote = note;
    // A new preset may change the streaming radius; force the ring to rebuild.
    this.lastChunk = { cx: Number.NaN, cz: Number.NaN };
    this.refreshStreaming(true);
    this.publish(true);
  }

  setCameraMode(mode: 'third' | 'first'): void {
    this.state.camera.mode = mode;
    this.publish(true);
  }

  /* ---------------------------------------------------------------- input */

  /**
   * Applies a frame of input and advances the simulation.
   *
   * `lookX`/`lookY` are already scaled deltas (radians) from mouse or touch.
   */
  step(dt: number, intent: InputIntent, look?: { x: number; y: number }): void {
    const clamped = Math.min(dt, 0.25);
    this.fpsAccumulator += clamped;
    this.fpsSamples += 1;
    if (this.fpsAccumulator >= 0.5) {
      this.fps = Math.round(this.fpsSamples / this.fpsAccumulator);
      this.fpsAccumulator = 0;
      this.fpsSamples = 0;
    }

    if (look) this.applyLook(look.x, look.y);

    if (!this.paused) {
      this.accumulator += clamped;
      let guard = 0;
      while (this.accumulator >= FIXED_STEP && guard < 8) {
        this.fixedStep(intent);
        this.accumulator -= FIXED_STEP;
        guard += 1;
      }
      // If the device fell far behind (tab backgrounded), drop the backlog rather
      // than run a burst of catch-up steps that would teleport the player.
      if (this.accumulator > FIXED_STEP * 8) this.accumulator = 0;
    }

    this.snapshotClock += clamped;
    if (this.snapshotClock >= 0.1) {
      this.snapshotClock = 0;
      this.publish(false);
    }
  }

  private applyLook(deltaX: number, deltaY: number): void {
    const camera = this.state.camera;
    camera.yaw = normaliseAngle(camera.yaw + deltaX);
    camera.pitch = clamp(camera.pitch - deltaY, -0.42, 1.05);

    // In first person the body follows the camera exactly; in third person the
    // body turns to face where the camera looks only while moving.
    if (camera.mode === 'first') {
      this.state.player.yaw = camera.yaw;
    }
  }

  private fixedStep(intent: InputIntent): void {
    this.state.time += FIXED_STEP;
    this.advanceSun();
    this.drainResources();
    this.refreshStreaming(false);

    // Actions are edges, not held controls: a long press must not board and
    // immediately exit the rover (or scan the same object sixty times a second).
    const actions = { ...intent, board: intent.board && !this.heldBoard, interact: intent.interact && !this.heldInteract };
    this.heldBoard = intent.board;
    this.heldInteract = intent.interact;
    if (this.state.player.mode === 'rover') {
      this.stepRoverMode(actions);
    } else {
      this.stepFootMode(actions);
    }

    this.missionFlags = updateMissionFlags(this.missionFlags, this.state.player.mode, this.state.player.position.x, this.state.player.position.z);
    this.updatePrompt();
    this.clearExpiredNotification();
  }

  /* --------------------------------------------------------------- on foot */

  private stepFootMode(intent: InputIntent): void {
    const camera = this.state.camera;
    const player = this.state.player;

    // Camera-relative basis: forward is where the camera looks, projected onto the
    // ground plane. Right is forward rotated −90°.
    const forwardX = -Math.sin(camera.yaw);
    const forwardZ = -Math.cos(camera.yaw);
    const rightX = Math.cos(camera.yaw);
    const rightZ = -Math.sin(camera.yaw);

    const moveX = forwardX * intent.forward + rightX * intent.strafe;
    const moveZ = forwardZ * intent.forward + rightZ * intent.strafe;
    const magnitude = Math.hypot(moveX, moveZ);

    // The astronaut simulation owns speed, gravity and the jump. It is given the
    // camera-relative displacement expressed as a world step, because its own slide
    // logic works in world space.
    const out = stepAstronaut(
      {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        verticalVelocity: player.verticalVelocity,
        grounded: player.grounded,
        bob: 0,
      },
      {
        forward: magnitude > 1e-4 ? moveX / Math.max(1, magnitude) : 0,
        strafe: magnitude > 1e-4 ? moveZ / Math.max(1, magnitude) : 0,
        // Running is stamina-gated: at zero energy the suit drops to a walk
        // rather than letting the player sprint forever on an empty reserve.
        running: intent.running && this.state.resources.energy > 0.05,
        jump: intent.jump,
      },
      FIXED_STEP,
      player.speed,
    );

    // Resolve obstacles at the position the astronaut module produced, then take
    // its vertical state wholesale — including an airborne one. Overwriting `y`
    // with the ground height here is what made the jump unreachable.
    const resolved = resolveCollisions(out.state.x, out.state.z, out.state.y, 0.42, this.colliders);
    player.position.x = resolved.x;
    player.position.z = resolved.z;
    player.position.y = resolved.hit ? groundHeight(resolved.x, resolved.z) : out.state.y;
    player.verticalVelocity = resolved.hit ? 0 : out.state.verticalVelocity;
    player.grounded = resolved.hit ? true : out.state.grounded;
    player.speed = out.speed;

    // Face the direction of travel in third person, and follow the camera in first.
    if (camera.mode === 'third' && magnitude > 1e-4 && out.speed > 0.15) {
      player.yaw = approachAngle(player.yaw, Math.atan2(-moveX, -moveZ), 6 * FIXED_STEP);
    } else if (camera.mode === 'first') {
      player.yaw = camera.yaw;
    }

    const stepDistance = Math.hypot(player.position.x - this.lastPlayer.x, player.position.z - this.lastPlayer.z);
    // A teleport (restore, or stepping out of the rover) must not count as walking.
    if (stepDistance < 2) this.walkedDistance += stepDistance;
    this.lastPlayer = { x: player.position.x, y: player.position.y, z: player.position.z };

    if (intent.interact) this.tryInteract();
    if (intent.board) this.tryBoardOrExit();
  }

  /* ---------------------------------------------------------------- rover */

  private stepRoverMode(intent: InputIntent): void {
    const rover = this.state.rover;
    const player = this.state.player;

    const current: RoverState = {
      x: rover.position.x,
      z: rover.position.z,
      y: rover.position.y,
      heading: rover.heading,
      speed: rover.speed,
      turnRate: 0,
    };

    const next = stepRover(
      current,
      { throttle: intent.throttle, steer: intent.steer, brake: intent.brake },
      FIXED_STEP,
    );

    const resolved = resolveCollisions(next.x, next.z, next.y, 1.35, this.colliders.filter((c) => c.id !== this.roverColliderId));
    const travelled = Math.hypot(resolved.x - rover.position.x, resolved.z - rover.position.z);

    rover.position = { x: resolved.x, y: groundHeight(resolved.x, resolved.z), z: resolved.z };
    rover.heading = next.heading;
    rover.speed = resolved.hit ? 0 : next.speed;
    rover.steer = intent.steer;

    // Only count real travel, not a push-out.
    if (travelled < 3) {
      rover.distance += travelled;
      this.state.resources.roverBattery = Math.max(0, this.state.resources.roverBattery - roverDrain(next.speed, FIXED_STEP));
    }

    // The astronaut rides with the rover.
    player.position = { x: rover.position.x, y: rover.position.y + 1.3, z: rover.position.z };
    player.yaw = rover.heading;
    player.speed = Math.abs(rover.speed);

    // Recharge on the pad — but not while the drive is drawing power. The rover
    // spawns *centred on its own charging pad*, so the recharge rate (1.2 %/s) was
    // silently cancelling the drain (0.0252 %/s at full throttle) and the battery
    // never moved from 100 %. That made "driving costs power" untrue and the flat
    // battery warning unreachable. A charger that tops the vehicle up faster than
    // it can discharge is fine when parked; it must not be in circuit while driving.
    // Gate on the *intent*, not on the speed. Speed is a lagging signal — it takes
    // ~22 steps to reach full throttle and decays slowly after release — so a
    // speed test both missed the start of a drive and kept the charger cut for
    // seconds after the player stopped. What the player asked for is the honest
    // condition: under power, no charging.
    const driving = Math.abs(intent.throttle) > 0.01;
    if (!driving && this.onPad(rover.position.x, rover.position.z) && this.state.resources.roverBattery < 1) {
      this.state.resources.roverBattery = Math.min(1, this.state.resources.roverBattery + ROVER_RECHARGE_PER_SECOND * FIXED_STEP);
    }

    if (this.state.resources.roverBattery <= 0 && Math.abs(rover.speed) > 0.05) {
      rover.speed = 0;
      this.notify('Rover battery flat', 'The drive has stopped. Recharge on the marked pad, or continue on foot.');
    }

    if (intent.board) this.tryBoardOrExit();
    if (intent.interact) this.tryInteract();
  }

  private onPad(x: number, z: number): boolean {
    const pad = STATIONS.find((station) => station.kind === 'pad');
    if (!pad) return false;
    return Math.hypot(x - pad.x, z - pad.z) <= Math.max(pad.halfX, pad.halfZ);
  }

  /* --------------------------------------------------------- interaction */

  private tryBoardOrExit(): void {
    const player = this.state.player;
    const rover = this.state.rover;

    if (player.mode === 'rover') {
      // Exit onto the ground beside the vehicle.
      const sideX = Math.cos(rover.heading) * 2.4;
      const sideZ = -Math.sin(rover.heading) * 2.4;
      const exitX = rover.position.x + sideX;
      const exitZ = rover.position.z + sideZ;
      player.mode = 'foot';
      player.position = { x: exitX, y: groundHeight(exitX, exitZ), z: exitZ };
      player.grounded = true;
      player.verticalVelocity = 0;
      rover.occupied = false;
      rover.speed = 0;
      this.state.camera.mode = 'third';
      this.notify('On foot', 'You stepped out of the rover.');
      return;
    }

    const distance = Math.hypot(player.position.x - rover.position.x, player.position.z - rover.position.z);
    if (distance <= INTERACT_RANGE) {
      player.mode = 'rover';
      rover.occupied = true;
      this.state.camera.mode = 'third';
      this.notify('Rover boarded', 'W/S throttle, A/D steer, Space brakes, F to step out.');
    }
  }

  private tryInteract(): void {
    const prompt = this.prompt;
    if (!prompt) return;

    if (prompt.kind === 'rock' || prompt.kind === 'sample') {
      this.collectSample(prompt.id);
      return;
    }

    if (prompt.kind === 'station') {
      const station = STATIONS.find((candidate) => candidate.id === prompt.id);
      if (station) {
        this.notify(station.label, station.body);
        const alreadyLogged = this.journal.some((entry) => entry.id === `station:${station.id}`);
        if (!alreadyLogged) {
          this.journal = [
            {
              id: `station:${station.id}`,
              at: this.now(),
              title: `Visited: ${station.label}`,
              body: station.body,
              progress: 0,
            },
            ...this.journal,
          ].slice(0, 40);
        }
        this.publish(true);
      }
      return;
    }

    if (prompt.kind === 'rover') {
      this.tryBoardOrExit();
    }
  }

  /** Scans and records a rock. Idempotent: a second scan adds nothing. */
  collectSample(rockId: string): boolean {
    if (this.samples.some((sample) => sample.sourceId === rockId)) {
      this.notify('Already sampled', 'This rock is in the inventory.');
      return false;
    }

    const rock = this.rocks.find((candidate) => candidate.id === rockId);
    if (!rock) return false;

    const seedFraction = ((Math.abs(rock.x * 31 + rock.z * 17) % 100) / 100);
    const { entry, confidence } = identify(rock.kind, seedFraction);

    this.samples = [
      {
        sourceId: rock.id,
        kind: rock.kind,
        label: entry.label,
        confidence,
        x: rock.x,
        z: rock.z,
        collectedAt: this.now(),
      },
      ...this.samples,
    ].slice(0, 60);

    this.journal = [
      {
        id: `sample:${rock.id}`,
        at: this.now(),
        title: `${entry.label} at sol ${(2000 + Math.round(this.state.time / 60)).toString()}`,
        body: `${entry.summary} ${entry.evidence} ${entry.significance}`,
        progress: entry.weight,
      },
      ...this.journal,
    ].slice(0, 40);

    this.notify(`Sample logged: ${entry.name}`, `${Math.round(confidence * 100)}% match · illustrative classification, ${entry.evidence}`);

    if (this.discoveries.length < 24 && !this.discoveries.some((d) => Math.abs(d.x - rock.x) < 24 && Math.abs(d.z - rock.z) < 24)) {
      this.discoveries = [
        { id: `d:${rock.id}`, label: `${entry.label} site`, x: rock.x, z: rock.z, at: this.now() },
        ...this.discoveries,
      ];
    }

    this.publish(true);
    return true;
  }

  /* ------------------------------------------------------------ resources */

  private drainResources(): void {
    const resources = this.state.resources;
    const working = this.state.player.mode === 'rover' ? 1.15 : 1;

    resources.oxygen = Math.max(0, resources.oxygen - (FIXED_STEP / OXYGEN_SECONDS) * working);
    resources.suitBattery = Math.max(0, resources.suitBattery - (FIXED_STEP / SUIT_SECONDS) * working);

    // Energy is stamina: running costs it, standing still restores it.
    const running = this.state.player.mode === 'foot' && this.state.player.speed > 3.6;
    if (running) resources.energy = Math.max(0, resources.energy - FIXED_STEP * 0.016);
    else resources.energy = Math.min(1, resources.energy + FIXED_STEP * 0.02);

    // The hab resupplies life support when the player is inside its footprint.
    const hab = STATIONS.find((station) => station.id === 'hab');
    if (hab && this.state.player.mode === 'foot') {
      const near = Math.hypot(this.state.player.position.x - hab.x, this.state.player.position.z - hab.z) < 9;
      if (near) {
        resources.oxygen = Math.min(1, resources.oxygen + FIXED_STEP * 0.05);
        resources.suitBattery = Math.min(1, resources.suitBattery + FIXED_STEP * 0.03);
      }
    }

    if (resources.oxygen <= 0) {
      this.notify('Oxygen depleted', 'The simulation would end the EVA here. Move to the hab module to resupply, or restart from the main menu.');
    }
  }

  private advanceSun(): void {
    // One Martian sol is 24 h 39 m; at game speed the sun crosses the sky in
    // about 25 real minutes, which is long enough to watch the light change.
    this.state.sunAngle = (this.state.sunAngle + (FIXED_STEP * Math.PI) / 750) % (Math.PI * 2);
    this.state.daylight = daylightFor(this.state.sunAngle);
  }

  /* ------------------------------------------------------------ streaming */

  private refreshStreaming(force: boolean): void {
    const cx = chunkOf(this.state.player.position.x, this.state.player.position.z);
    if (!force && cx.cx === this.lastChunk.cx && cx.cz === this.lastChunk.cz) return;

    this.lastChunk = cx;
    // The physics ring is one chunk WIDER than the rendered ring: a rock the
    // renderer draws must already have a collider, and the renderer streams
    // `chunkRadius` so this covers it with a margin for the transition frame.
    const radius = QUALITY_PRESETS[this.quality].chunkRadius + 1;
    const key = `${cx.cx}:${cx.cz}:${radius}`;
    if (key === this.streamedKey && !force) return;
    this.streamedKey = key;

    const rocks: RockInstance[] = [];
    for (let dx = -radius - 1; dx <= radius + 1; dx += 1) {
      for (let dz = -radius - 1; dz <= radius + 1; dz += 1) {
        rocks.push(...rocksInChunk(cx.cx + dx, cx.cz + dz));
      }
    }
    this.rocks = rocks;
    this.colliders = [...stationColliders(), ...rockColliders(rocks)];
  }

  /** Rocks in the physics ring — the renderer streams a wider visual ring. */
  get visibleRocks(): readonly RockInstance[] {
    return this.rocks;
  }

  /* --------------------------------------------------------------- prompt */

  private updatePrompt(): void {
    this.promptClock += FIXED_STEP;
    if (this.promptClock < 0.12) return;
    this.promptClock = 0;

    const { x, z } = this.state.player.position;
    let best: InteractionPrompt | null = null;

    for (const rock of this.rocks) {
      if (rock.radius < 0.4) continue;
      const distance = Math.hypot(rock.x - x, rock.z - z);
      if (distance > INTERACT_RANGE) continue;
      if (best && best.distance <= distance) continue;
      const sampled = this.samples.some((sample) => sample.sourceId === rock.id);
      best = {
        id: rock.id,
        kind: 'rock',
        label: sampled ? `${MINERALS[rock.kind].label} (sampled)` : MINERALS[rock.kind].label,
        distance,
        action: sampled ? 'Review' : 'Scan',
      };
    }

    for (const station of STATIONS) {
      const distance = Math.hypot(station.x - x, station.z - z);
      const reach = Math.max(station.halfX, station.halfZ) + 3;
      if (distance > reach) continue;
      if (best && best.distance <= distance) continue;
      best = { id: station.id, kind: 'station', label: station.label, distance, action: 'Inspect' };
    }

    // The rover beats scenery when in reach, because F is the boarding key.
    const rover = this.state.rover;
    if (this.state.player.mode === 'foot') {
      const distance = Math.hypot(rover.position.x - x, rover.position.z - z);
      if (distance <= INTERACT_RANGE) {
        best = { id: 'rover', kind: 'rover', label: 'Mars rover', distance, action: 'Board' };
      }
    } else {
      best = { id: 'rover', kind: 'rover', label: 'Mars rover', distance: 0, action: 'Disembark' };
    }

    const changed = best?.id !== this.prompt?.id || best?.action !== this.prompt?.action;
    this.prompt = best;
    if (changed) this.publish(true);
  }

  /* ---------------------------------------------------------- notification */

  private notify(title: string, body: string): void {
    this.notificationId += 1;
    this.notification = { id: `n${this.notificationId}`, title, body };
    this.notificationClock = 0;
    this.publish(true);
  }

  private clearExpiredNotification(): void {
    if (!this.notification) return;
    this.notificationClock += FIXED_STEP;
    if (this.notificationClock < 6) return;
    this.notification = null;
    this.notificationClock = 0;
    this.publish(true);
  }

  /* ------------------------------------------------------------- snapshot */

  researchProgress(): number {
    // Each mineral counts once, so finding the same rock type twice cannot fill
    // the journal with duplicates.
    const distinct = new Set(this.samples.map((sample) => sample.kind));
    let weight = 0;
    for (const kind of distinct) {
      const entry = MINERALS[kind as keyof typeof MINERALS];
      if (entry) weight += entry.weight;
    }
    return Math.min(1, weight / TOTAL_MINERAL_WEIGHT);
  }

  private publish(force: boolean): void {
    void force;
    const camera = this.state.camera;
    const rover = this.state.rover;
    this.onSnapshot({
      ready: true,
      paused: this.paused,
      playerMode: this.state.player.mode,
      cameraMode: camera.mode,
      quality: this.quality,
      position: {
        x: Math.round(this.state.player.position.x * 10) / 10,
        y: Math.round(this.state.player.position.y * 10) / 10,
        z: Math.round(this.state.player.position.z * 10) / 10,
      },
      heading: camera.yaw,
      oxygen: this.state.resources.oxygen,
      suitBattery: this.state.resources.suitBattery,
      roverBattery: this.state.resources.roverBattery,
      energy: this.state.resources.energy,
      roverDistance: rover.distance,
      walkedDistance: this.walkedDistance,
      samples: this.samples,
      missionFlags: this.missionFlags,
      journal: this.journal,
      discoveries: this.discoveries,
      prompt: this.prompt,
      notification: this.notification,
      researchProgress: this.researchProgress(),
      fps: this.fps,
      qualityNote: this.qualityNote,
      daylight: this.state.daylight,
      startedAt: this.startedAt,
    });
  }

  /** The rover's visual tilt, for the renderer. */
  roverTilt(): { pitch: number; roll: number } {
    return roverTilt({
      x: this.state.rover.position.x,
      z: this.state.rover.position.z,
      y: this.state.rover.position.y,
      heading: this.state.rover.heading,
      speed: this.state.rover.speed,
      turnRate: 0,
    });
  }

  /** Enemies of nothing: the collider list, for tests that assert obstacles exist. */
  get obstacleCount(): number {
    return this.colliders.length;
  }
}

/* ------------------------------------------------------------------ helpers */

export function daylightFor(sunAngle: number): number {
  // Sun elevation: sin of the angle, remapped so night is 0 and noon is 1.
  const elevation = Math.sin(sunAngle);
  return clamp((elevation + 0.18) / 0.55, 0, 1);
}

/** Sun direction from its angle, for the light and the sky. */
export function sunDirection(sunAngle: number): { x: number; y: number; z: number } {
  const elevation = Math.sin(sunAngle);
  const azimuth = sunAngle * 0.5 + 0.6;
  const horizontal = Math.cos(sunAngle) * 0.35 + 0.75;
  return {
    x: Math.cos(azimuth) * horizontal,
    y: Math.max(-0.35, elevation),
    z: Math.sin(azimuth) * horizontal,
  };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Rotates `current` toward `target` by at most `maxDelta`, the short way round. */
function approachAngle(current: number, target: number, maxDelta: number): number {
  const difference = normaliseAngle(target - current);
  if (Math.abs(difference) <= maxDelta) return normaliseAngle(target);
  return normaliseAngle(current + Math.sign(difference) * maxDelta);
}

/** Export for the renderer so the visual ring and the physics ring agree. */
export { CHUNK_SIZE };
