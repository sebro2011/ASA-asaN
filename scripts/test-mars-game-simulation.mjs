/**
 * Movement, driving, collisions and the save system — the parts that must be
 * right before any pixels exist.
 *
 * These run the real simulation modules in Node. No renderer, no DOM: the physics
 * is pure functions over plain state for exactly this reason.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-mars-game-simulation.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepAstronaut, spawnAstronaut, JUMP_VELOCITY, WALK_SPEED, RUN_SPEED, MARTIAN_GRAVITY, approach } from '../src/game/physics/astronaut.ts';
import { stepRover, stepDistance, roverTilt, normaliseAngle, ROVER_TUNING, roverDrain, ROVER_RECHARGE_PER_SECOND } from '../src/game/physics/roverDrive.ts';
import { resolveCollisions, withinRadius } from '../src/game/physics/colliders.ts';
import { sampleGround, groundHeight, MAX_WALK_SLOPE } from '../src/game/physics/heightfield.ts';
import { validateSave, newGameData, SAVE_VERSION } from '../src/game/state/save.ts';
import { STATIONS, stationColliders, rockColliders, createSnapshot } from '../src/game/state/marsGameStore.ts';
import { rocksInChunk } from '../src/game/world/rocks.ts';

const STEP = 1 / 60;

/** Runs the astronaut for `seconds`, returning the final state and speed. */
function walk(state, input, seconds, speed = 0) {
  let current = state;
  let currentSpeed = speed;
  for (let i = 0; i < Math.round(seconds / STEP); i += 1) {
    const out = stepAstronaut(current, input, STEP, currentSpeed);
    current = out.state;
    currentSpeed = out.speed;
  }
  return { state: current, speed: currentSpeed };
}

test('walking stays on the ground and reaches the expected speed', () => {
  const start = spawnAstronaut(6, -14);
  assert.equal(start.grounded, true);
  assert.ok(Math.abs(start.y - groundHeight(6, -14)) < 1e-9, 'spawns on the surface');

  const walked = walk(start, { forward: 1, strafe: 0, running: false, jump: false }, 3);
  assert.ok(Math.abs(walked.speed - WALK_SPEED) < 0.05, `walk speed ${walked.speed.toFixed(2)}`);
  assert.ok(walked.state.grounded, 'walking over uneven ground never launches the player');

  const ran = walk(spawnAstronaut(6, -14), { forward: 1, strafe: 0, running: true, jump: false }, 3);
  assert.ok(Math.abs(ran.speed - RUN_SPEED) < 0.05, `run speed ${ran.speed.toFixed(2)}`);
  assert.ok(Math.abs(ran.state.y - groundHeight(ran.state.x, ran.state.z)) < 0.01, 'feet stay on the terrain');

  const still = walk(spawnAstronaut(6, -14), { forward: 0, strafe: 0, running: false, jump: false }, 1);
  assert.ok(Math.hypot(still.state.x - 6, still.state.z + 14) < 1e-6, 'no input, no drift');
});

test('a Martian jump is a hop: about a metre up and 1.4 s airborne', () => {
  const start = spawnAstronaut(6, -14);
  let state = start;
  let speed = 0;
  let peak = start.y;
  let airborneFrames = 0;

  // Launch.
  const launch = stepAstronaut(start, { forward: 0, strafe: 0, running: false, jump: true }, STEP, 0);
  state = launch.state;
  assert.equal(state.grounded, false, 'jump leaves the ground');
  assert.ok(Math.abs(state.verticalVelocity - (JUMP_VELOCITY - MARTIAN_GRAVITY * STEP)) < 1e-9);

  while (!state.grounded && airborneFrames < 600) {
    peak = Math.max(peak, state.y);
    const out = stepAstronaut(state, { forward: 0, strafe: 0, running: false, jump: false }, STEP, speed);
    state = out.state;
    speed = out.speed;
    airborneFrames += 1;
  }

  const height = peak - start.y;
  // h = v²/2g on Mars → 2.6² / (2 × 3.711) = 0.91 m.
  assert.ok(height > 0.7 && height < 1.2, `peak height ${height.toFixed(2)} m`);
  assert.ok(airborneFrames / 60 > 1.1 && airborneFrames / 60 < 1.7, `airborne ${(airborneFrames / 60).toFixed(2)} s`);
  assert.ok(state.grounded, 'lands again');
});

test('steep ground is refused, not climbed, and the mover slides along the contour', () => {
  // Build a synthetic cliff from the real terrain: a point whose slope is above
  // the walk limit, approached from gentler ground 6 m downhill. Scanning for a
  // natural example is flaky — the launch site is deliberately gentle — so the
  // test finds the steepest real slope and asserts the *rule* against it.
  let steepest = null;
  for (let angle = 0; angle < Math.PI * 2; angle += 0.02) {
    for (let radius = 20; radius < 400; radius += 3) {
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const ground = sampleGround(x, z);
      if (!steepest || ground.slope > steepest.ground.slope) steepest = { x, z, ground };
    }
  }
  assert.ok(steepest.ground.slope > MAX_WALK_SLOPE, `the terrain never exceeds ${MAX_WALK_SLOPE}° (max ${steepest.ground.slope.toFixed(1)}°)`);

  // Walk straight uphill from 3 m below the steepest point for two seconds.
  //
  // Precondition: that 3 m downhill must itself be walkable, or the test is
  // asserting a rule about a body that was already standing somewhere it could
  // never have reached. The steepest point moved when the canyon field was added —
  // it used to be a gentle ridge and is now a 74° wall with ~70° ground for 3 m in
  // every direction, which made this a test of teleportation. Scan outward along
  // the downhill gradient for the first walkable approach and assert from there.
  const uphillX = Math.sin(steepest.ground.uphill);
  const uphillZ = Math.cos(steepest.ground.uphill);
  let standoff = 3;
  while (standoff < 60 && sampleGround(steepest.x - uphillX * standoff, steepest.z - uphillZ * standoff).slope > MAX_WALK_SLOPE) {
    standoff += 1;
  }
  assert.ok(standoff < 60, 'no walkable ground within 60 m of the steepest point; the slide rule is untestable');

  const startX = steepest.x - uphillX * standoff;
  const startZ = steepest.z - uphillZ * standoff;
  const start = spawnAstronaut(startX, startZ);
  const climbed = walk(start, { forward: 1, strafe: 0, running: true, jump: false }, 6);

  // The invariant is a bound: the mover may never end a step on a slope beyond
  // the limit, wherever it started.
  const endSlope = sampleGround(climbed.state.x, climbed.state.z).slope;
  assert.ok(endSlope <= MAX_WALK_SLOPE + 1, `ended on a ${endSlope.toFixed(1)}° slope`);

  // And it is still on the ground, not floating or buried by the refusal.
  assert.ok(climbed.state.grounded, 'the slide must not launch the player');
  assert.ok(Math.abs(climbed.state.y - groundHeight(climbed.state.x, climbed.state.z)) < 0.02);
});

test('speed ramps rather than snapping', () => {
  assert.equal(approach(0, 5, 1), 1);
  assert.equal(approach(0, 5, 100), 5, 'never overshoots');
  assert.equal(approach(5, 0, 1), 4);
  assert.equal(approach(3, 3, 1), 3);
});

test('the rover accelerates, steers, brakes and cannot exceed its limits', () => {
  const start = { x: 6, z: -14, y: 0, heading: 0, speed: 0, turnRate: 0 };
  let rover = start;
  for (let i = 0; i < 600; i += 1) rover = stepRover(rover, { throttle: 1, steer: 0, brake: false }, STEP);

  assert.ok(rover.speed > 5, `rover reached only ${rover.speed.toFixed(2)} m/s`);
  assert.ok(rover.speed <= ROVER_TUNING.maxSpeed + 1e-6, 'top speed is capped');
  assert.ok(Math.hypot(rover.x - start.x, rover.z - start.z) > 30, 'the rover actually travels');

  // Steering turns the heading.
  const beforeHeading = rover.heading;
  for (let i = 0; i < 120; i += 1) rover = stepRover(rover, { throttle: 1, steer: 0.5, brake: false }, STEP);
  assert.notEqual(rover.heading, beforeHeading, 'steering changed nothing');

  // Braking stops it dead.
  for (let i = 0; i < 240; i += 1) rover = stepRover(rover, { throttle: 0, steer: 0, brake: true }, STEP);
  assert.ok(Math.abs(rover.speed) < 0.05, `still rolling at ${rover.speed.toFixed(2)}`);

  // Reverse is slower than forward, and capped.
  for (let i = 0; i < 600; i += 1) rover = stepRover(rover, { throttle: -1, steer: 0, brake: false }, STEP);
  assert.ok(rover.speed <= ROVER_TUNING.maxReverseSpeed + 0.6, `reverse ${rover.speed.toFixed(2)}`);
});

test('the rover sits on the terrain and tilts with it', () => {
  const rover = { x: 6, z: -14, y: groundHeight(6, -14), heading: 0.7, speed: 0, turnRate: 0 };
  const tilt = roverTilt(rover);
  assert.ok(Number.isFinite(tilt.pitch) && Number.isFinite(tilt.roll));
  assert.ok(Math.abs(tilt.pitch) < 1.2 && Math.abs(tilt.roll) < 1.2, 'tilt is a slope, not a flip');

  let state = rover;
  for (let i = 0; i < 300; i += 1) state = stepRover(state, { throttle: 1, steer: 0.2, brake: false }, STEP);
  assert.ok(Math.abs(state.y - groundHeight(state.x, state.z)) < 1e-6, 'the chassis follows the ground');
});

test('odometer and battery describe driving honestly', () => {
  const a = { x: 0, z: 0, y: 0, heading: 0, speed: 5, turnRate: 0 };
  const b = { x: 3, z: 4, y: 0, heading: 0, speed: 5, turnRate: 0 };
  assert.equal(stepDistance(a, b), 5);

  const idle = roverDrain(0, 1);
  const driving = roverDrain(8, 1);
  assert.ok(driving > idle, 'driving costs more than idling');
  assert.ok(driving < 0.01, 'a minute of driving does not empty the battery');

  // From full, the battery lasts a plausible session, not ten seconds and not a week.
  // At 8 m/s (the top speed) a charge should be a substantial expedition:
  // roughly 15–40 minutes of continuous flat-out driving, then the pad.
  const minutesToEmpty = 1 / (roverDrain(8, 1) * 60);
  assert.ok(minutesToEmpty > 12 && minutesToEmpty < 45, `${minutesToEmpty.toFixed(0)} minutes of driving on a charge`);
  assert.ok(ROVER_RECHARGE_PER_SECOND > 0);
});

test('normaliseAngle keeps headings in (−π, π]', () => {
  for (const angle of [0, Math.PI, -Math.PI, 7, -7, 100]) {
    const value = normaliseAngle(angle);
    assert.ok(value > -Math.PI - 1e-9 && value <= Math.PI + 1e-9, `${angle} → ${value}`);
  }
  assert.ok(Math.abs(normaliseAngle(Math.PI * 4 + 0.5) - 0.5) < 1e-9);
});

test('collisions push out of cylinders and rotated boxes without tunnelling', () => {
  const hab = stationColliders().find((c) => c.id === 'hab');
  assert.ok(hab);

  // Start inside the hab and resolve: must end up outside its footprint.
  const resolved = resolveCollisions(STATIONS[0].x, STATIONS[0].z, 1, 0.4, [hab]);
  assert.equal(resolved.hit?.id, 'hab');
  const dx = resolved.x - STATIONS[0].x;
  const dz = resolved.z - STATIONS[0].z;
  assert.ok(Math.hypot(dx, dz) > 0, 'pushed somewhere');

  // A point already clear is not moved.
  const clear = resolveCollisions(200, 200, 1, 0.4, [hab]);
  assert.equal(clear.x, 200);
  assert.equal(clear.z, 200);
  assert.equal(clear.hit, null);

  // Rocks: standing on a rock's centre pushes out to its radius.
  const rocks = rocksInChunk(0, 0);
  const colliders = rockColliders(rocks);
  for (const collider of colliders.slice(0, 3)) {
    const pushed = resolveCollisions(collider.x, collider.z, collider.y, 0.4, [collider]);
    const distance = Math.hypot(pushed.x - collider.x, pushed.z - collider.z);
    assert.ok(Math.abs(distance - (collider.radius + 0.4)) < 0.15, `pushed to ${distance.toFixed(2)}, expected ${(collider.radius + 0.4).toFixed(2)}`);
  }

  // Box push-out is stable: resolving twice changes nothing more.
  const once = resolveCollisions(STATIONS[0].x, STATIONS[0].z, 1, 0.4, [hab]);
  const twice = resolveCollisions(once.x, once.z, 1, 0.4, [hab]);
  assert.ok(Math.hypot(twice.x - once.x, twice.z - once.z) < 1e-6, 'oscillates between frames');
});

test('interaction range is a circle, not a rectangle', () => {
  assert.ok(withinRadius(0, 0, 3, 4, 5));
  assert.ok(withinRadius(0, 0, 3, 4, 5.01));
  assert.equal(withinRadius(0, 0, 3, 4, 4.9), false);
});

test('a save round-trips through validation intact', () => {
  const data = newGameData(Math.PI / 2);
  const result = validateSave({ ...data, version: SAVE_VERSION, savedAt: '2026-11-20T00:00:00.000Z' });
  assert.equal(result.status, 'ok');
  assert.equal(result.data.player.position.x, 6);
  assert.equal(result.data.progress.sunAngle, Math.PI / 2);
  assert.deepEqual(result.data.progress.samples, []);
});

test('a corrupt save is rejected with a reason instead of being half-applied', () => {
  const cases = [
    [null, /not an object/],
    [{}, /missing version/],
    [{ version: 99, player: {}, rover: {} }, /newer than/],
    [{ version: 1, rover: { position: { x: 0, y: 0, z: 0 } } }, /player position/],
    [{ version: 1, player: { position: { x: NaN, y: 0, z: 0 } }, rover: { position: { x: 0, y: 0, z: 0 } } }, /player position/],
  ];
  for (const [input, pattern] of cases) {
    const result = validateSave(input);
    assert.equal(result.status, 'corrupt', `accepted ${JSON.stringify(input)}`);
    assert.match(result.reason, pattern);
  }
});

test('a save with damaged fields keeps what is valid and repairs the rest', () => {
  const result = validateSave({
    version: 1,
    player: { position: { x: 12, y: 3, z: -8 }, yaw: 'sideways', mode: 'teleport' },
    rover: { position: { x: 1, y: 2, z: 3 }, heading: null },
    resources: { oxygen: 4, suitBattery: -2, roverBattery: 'lots' },
    settings: { quality: 'ultra', cameraMode: 'third' },
    progress: {
      samples: [{ sourceId: 'a', kind: 'basalt', confidence: 9 }, 'junk', { nope: true }],
      journal: [{ id: 'j1', title: 'First sample' }, null],
      discoveries: [{ id: 'd1', label: 'Crater rim', x: 1, z: 2 }],
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.data.player.yaw, 0, 'NaN/garbage yaw becomes 0');
  assert.equal(result.data.player.mode, 'foot', 'unknown mode falls back to walking');
  assert.equal(result.data.resources.oxygen, 1, 'out-of-range oxygen is clamped');
  assert.equal(result.data.resources.suitBattery, 0, 'negative battery is clamped to 0');
  assert.equal(result.data.resources.roverBattery, 1, 'a non-number falls back to full');
  assert.equal(result.data.settings.quality, 'high', 'unknown preset falls back to high');
  assert.equal(result.data.progress.samples.length, 1, 'only the well-formed sample survives');
  assert.equal(result.data.progress.samples[0].confidence, 1);
  assert.equal(result.data.progress.journal.length, 1);
  assert.equal(result.data.progress.discoveries[0].label, 'Crater rim');
});

test('the snapshot starts in a state the HUD can render without guards', () => {
  const snapshot = createSnapshot();
  assert.equal(snapshot.ready, false);
  assert.equal(snapshot.paused, false);
  for (const key of ['oxygen', 'suitBattery', 'roverBattery', 'energy', 'researchProgress']) {
    assert.ok(snapshot[key] >= 0 && snapshot[key] <= 1, `${key} is not normalised`);
  }
  assert.equal(Array.isArray(snapshot.samples), true);
  assert.equal(snapshot.prompt, null);
});

test('mission milestones are ordered, mode-specific and survive save validation', async () => {
  const { SURVEY_CRATER, TRAVERSE_WAYPOINTS, updateMissionFlags, missionProgress } = await import('../src/game/science/missions.ts');
  assert.ok(SURVEY_CRATER);
  const [a, b] = TRAVERSE_WAYPOINTS;
  let flags = updateMissionFlags([], 'rover', b.x, b.z);
  assert.deepEqual(flags, []);
  flags = updateMissionFlags(flags, 'foot', a.x, a.z);
  assert.deepEqual(flags, []);
  flags = updateMissionFlags(flags, 'rover', a.x, a.z);
  flags = updateMissionFlags(flags, 'rover', b.x, b.z);
  flags = updateMissionFlags(flags, 'foot', SURVEY_CRATER.x + SURVEY_CRATER.radius, SURVEY_CRATER.z);
  assert.deepEqual(flags, ['crater-rim', 'traverse-a', 'traverse-b']);
  assert.deepEqual(missionProgress([{kind:'basalt'}, {kind:'basalt'}, {kind:'olivine'}], flags), { geology: 2, crater: 1, traverse: 2 });
  const save = newGameData(Math.PI / 2);
  save.progress.missionFlags = [...flags, 'not-a-mission'];
  const restored = validateSave({ ...save, version: SAVE_VERSION });
  assert.equal(restored.status, 'ok');
  assert.deepEqual(restored.data.progress.missionFlags, flags);
  delete save.progress.missionFlags;
  assert.deepEqual(validateSave({ ...save, version: SAVE_VERSION }).data.progress.missionFlags, []);
});

test('rover gravity accelerates downhill and not sideways to the slope', async () => {
  const { stepRover } = await import('../src/game/physics/roverDrive.ts');
  const { terrainHeight, terrainSlopeDegrees } = await import('../src/game/world/terrain.ts');
  const x = 76, z = -237;
  const uphill = Math.atan2(terrainHeight(x + 0.8, z) - terrainHeight(x - 0.8, z), terrainHeight(x, z + 0.8) - terrainHeight(x, z - 0.8));
  assert.ok(terrainSlopeDegrees(x, z) > 8);
  const state = { x, z, y: terrainHeight(x,z), speed: 0, turnRate: 0 };
  const control = { throttle: 0, steer: 0, brake: false };
  const downhill = stepRover({ ...state, heading: uphill }, control, 1/60);
  const cross = stepRover({ ...state, heading: uphill + Math.PI / 2 }, control, 1/60);
  const uphillResult = stepRover({ ...state, heading: uphill + Math.PI }, control, 1/60);
  assert.ok(downhill.speed > 0);
  assert.ok(uphillResult.speed < 0);
  assert.ok(Math.abs(cross.speed) < 1e-10);
});
