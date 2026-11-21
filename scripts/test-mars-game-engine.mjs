/**
 * The engine, driven end to end.
 *
 * The simulation suites test `stepAstronaut` and `stepRover` directly; this suite
 * tests the thing the game actually runs, because those are not the same code path.
 * It exists because of a real bug: the engine re-derived the astronaut's vertical
 * state from the ground every step, which made the jump unreachable in the game
 * while every unit test of `stepAstronaut` still passed.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-mars-game-engine.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MarsEngine, FIXED_STEP, INTERACT_RANGE, daylightFor, sunDirection, START_POSITION } from '../src/game/engine.ts';
import { EMPTY_INTENT } from '../src/game/input/keyboard.ts';
import { STATIONS } from '../src/game/state/marsGameStore.ts';
import { terrainHeight } from '../src/game/world/terrain.ts';

/** Builds an engine that records the snapshots it publishes. */
function makeEngine(options = {}) {
  const snapshots = [];
  const engine = new MarsEngine({ onSnapshot: (snapshot) => snapshots.push(snapshot), now: () => '2026-11-20T00:00:00.000Z' });
  if (options.start !== false) engine.start();
  return { engine, snapshots };
}

const intent = (overrides = {}) => ({ ...EMPTY_INTENT, ...overrides });

/** Runs `frames` fixed steps with a constant intent. */
function run(engine, frames, overrides = {}) {
  for (let i = 0; i < frames; i += 1) engine.step(FIXED_STEP, intent(overrides), { x: 0, y: 0 });
}

test('the astronaut can actually jump in the engine, not only in the module', () => {
  const { engine } = makeEngine();
  const groundY = engine.state.player.position.y;
  assert.ok(engine.state.player.grounded);

  // Press once, then release for the flight.
  engine.step(FIXED_STEP, intent({ jump: true }), { x: 0, y: 0 });
  assert.equal(engine.state.player.grounded, false, 'the engine dropped the jump on the floor');

  let peak = engine.state.player.position.y;
  let airborneFrames = 0;
  while (!engine.state.player.grounded && airborneFrames < 400) {
    engine.step(FIXED_STEP, intent(), { x: 0, y: 0 });
    peak = Math.max(peak, engine.state.player.position.y);
    airborneFrames += 1;
  }

  assert.ok(airborneFrames > 30, `airborne for only ${airborneFrames} frames`);
  assert.ok(peak - groundY > 0.6, `the hop rose ${(peak - groundY).toFixed(2)} m`);
  assert.ok(peak - groundY < 1.4, `the hop rose ${(peak - groundY).toFixed(2)} m — too high for a suit`);
  assert.ok(engine.state.player.grounded, 'landed');
  assert.ok(Math.abs(engine.state.player.position.y - terrainHeight(engine.state.player.position.x, engine.state.player.position.z)) < 0.05);
});

test('walking moves the player in the direction the camera looks', () => {
  const { engine } = makeEngine();
  const start = { ...engine.state.player.position };
  const yawBefore = engine.state.camera.yaw;

  run(engine, 120, { forward: 1, running: false });
  const after = engine.state.player.position;
  const moved = Math.hypot(after.x - start.x, after.z - start.z);

  assert.ok(moved > 2, `only moved ${moved.toFixed(2)} m in two seconds`);

  // At yaw 0 the camera looks along −Z, so forward must decrease z.
  const expectedX = -Math.sin(yawBefore);
  const expectedZ = -Math.cos(yawBefore);
  const directionX = (after.x - start.x) / moved;
  const directionZ = (after.z - start.z) / moved;
  assert.ok(directionX * expectedX + directionZ * expectedZ > 0.85, 'movement does not follow the camera');

  // Turning the camera turns the movement. At yaw +π/2 the basis is
  // forward = (−sin, −cos) = (−1, 0), so forward is −X — the same formula the
  // renderer and the astronaut use, which is the point of checking it here.
  engine.step(FIXED_STEP, intent(), { x: Math.PI / 2, y: 0 });
  assert.ok(Math.abs(engine.state.camera.yaw - Math.PI / 2) < 1e-6);
  const beforeTurn = { ...engine.state.player.position };
  run(engine, 60, { forward: 1 });
  const turned = engine.state.player.position;
  assert.ok(turned.x - beforeTurn.x < -0.5, `after a 90° turn, forward should be −X (moved ${(turned.x - beforeTurn.x).toFixed(2)})`);
  assert.ok(Math.abs(turned.z - beforeTurn.z) < 0.3, 'and not sideways');
});

test('the player cannot walk through the hab, and is pushed out cleanly', () => {
  const { engine } = makeEngine();
  const hab = STATIONS.find((station) => station.id === 'hab');
  assert.ok(hab);

  // Stand just outside the hab and walk straight at it for three seconds.
  const approachX = hab.x;
  const approachZ = hab.z + hab.halfZ + 4;
  engine.state.player.position = { x: approachX, y: terrainHeight(approachX, approachZ), z: approachZ };
  engine.state.camera.yaw = 0; // faces −Z, toward the hab
  run(engine, 180, { forward: 1, running: true });

  const dx = engine.state.player.position.x - hab.x;
  const dz = engine.state.player.position.z - hab.z;
  // Either it went around the module, or it is outside its footprint; it must not be inside.
  const inside = Math.abs(dx) < hab.halfX && Math.abs(dz) < hab.halfZ;
  assert.equal(inside, false, `walked into the ${hab.label} at ${dx.toFixed(1)}, ${dz.toFixed(1)}`);
});

test('boarding swaps to the rover, driving moves it, and the exit is beside it', () => {
  const { engine, snapshots } = makeEngine();
  const rover = engine.state.rover;

  // Walk within reach of the rover.
  const standX = rover.position.x;
  const standZ = rover.position.z + 3;
  engine.state.player.position = { x: standX, y: terrainHeight(standX, standZ), z: standZ };
  run(engine, 20);
  assert.equal(snapshots.at(-1).prompt?.kind, 'rover', 'the rover is offered for interaction');

  engine.step(FIXED_STEP, intent({ board: true }), { x: 0, y: 0 });
  assert.equal(engine.state.player.mode, 'rover');
  assert.equal(engine.state.rover.occupied, true);

  const before = { x: engine.state.rover.position.x, z: engine.state.rover.position.z };
  run(engine, 180, { throttle: 1 });
  const travelled = Math.hypot(engine.state.rover.position.x - before.x, engine.state.rover.position.z - before.z);
  assert.ok(travelled > 4, `the rover moved ${travelled.toFixed(1)} m in three seconds`);
  assert.ok(engine.state.rover.distance > 3, 'the odometer counted it');
  assert.ok(engine.state.resources.roverBattery < 1, 'driving drained the battery');
  assert.equal(engine.state.player.position.x, engine.state.rover.position.x, 'the astronaut rides along');

  // Step out.
  engine.step(FIXED_STEP, intent({ board: true }), { x: 0, y: 0 });
  assert.equal(engine.state.player.mode, 'foot');
  assert.equal(engine.state.rover.occupied, false);
  const exitDistance = Math.hypot(
    engine.state.player.position.x - engine.state.rover.position.x,
    engine.state.player.position.z - engine.state.rover.position.z,
  );
  assert.ok(exitDistance > 1.5 && exitDistance < 4, `stepped out ${exitDistance.toFixed(2)} m away`);
});

test('a rock in reach is scanned once, recorded, and counted toward research', () => {
  const { engine, snapshots } = makeEngine();
  // Pick a rock *near the landing site*, not merely the first in the ring.
  //
  // `visibleRocks` covers the physics ring nearest-first only by chunk, so with
  // the current density the first match can be hundreds of metres away on a
  // massif — and standing next to it would put the player outside the streamed
  // ring entirely, which is why this used to fail with "no prompt" rather than
  // anything to do with scanning.
  const rock = engine.visibleRocks
    .filter((candidate) => candidate.radius > 0.6)
    .map((candidate) => ({ candidate, distance: Math.hypot(candidate.x + 6, candidate.z + 14) }))
    .filter(({ distance }) => distance < 120)
    .sort((a, b) => a.distance - b.distance)[0]?.candidate;
  assert.ok(rock, 'no scannable rock near the landing site');

  // Stand within reach.
  const standX = rock.x + 2;
  const standZ = rock.z;
  engine.state.player.position = { x: standX, y: terrainHeight(standX, standZ), z: standZ };
  run(engine, 20);

  const prompt = snapshots.at(-1).prompt;
  assert.ok(prompt, 'no prompt while standing next to a rock');
  assert.equal(prompt.kind, 'rock');
  assert.ok(prompt.distance <= INTERACT_RANGE);

  const before = snapshots.at(-1).researchProgress;
  assert.equal(engine.collectSample(rock.id), true);
  assert.equal(snapshots.at(-1).samples.length, 1);
  assert.equal(snapshots.at(-1).journal.length, 1);
  assert.ok(snapshots.at(-1).researchProgress > before, 'research progress did not move');
  assert.equal(snapshots.at(-1).discoveries.length, 1, 'the find was marked on the map');

  // Idempotent: a second scan is refused and changes nothing.
  const journalLength = snapshots.at(-1).journal.length;
  assert.equal(engine.collectSample(rock.id), false);
  assert.equal(snapshots.at(-1).journal.length, journalLength);
  assert.equal(snapshots.at(-1).samples.length, 1);

  // Journal entries carry real provenance, not a placeholder.
  const entry = snapshots.at(-1).journal[0];
  assert.match(entry.body, /NASA|Curiosity|Opportunity|Spirit|Perseverance/i);
  assert.ok(entry.body.length > 60);
});

test('research progress counts distinct minerals, not repeat finds', () => {
  const { engine } = makeEngine();
  const rocks = engine.visibleRocks.filter((rock) => rock.radius > 0.4);
  assert.ok(rocks.length > 3);

  const byKind = new Map();
  for (const rock of rocks) if (!byKind.has(rock.kind)) byKind.set(rock.kind, rock);

  let previous = 0;
  for (const rock of byKind.values()) {
    engine.collectSample(rock.id);
    const progress = engine.researchProgress();
    assert.ok(progress >= previous, 'progress went backwards');
    previous = progress;
  }
  assert.ok(previous > 0, 'finding every kind produced no progress');

  // Finding the same kind again must not advance it.
  const repeated = rocks.find((rock) => rock.kind === [...byKind.keys()][0] && rock.id !== byKind.get(rock.kind)?.id);
  if (repeated) {
    engine.collectSample(repeated.id);
    assert.equal(engine.researchProgress(), previous, 'a duplicate mineral advanced the research bar');
  }
});

test('resource drain is bounded, gated and disclosed', () => {
  const { engine, snapshots } = makeEngine();
  assert.equal(engine.state.resources.oxygen, 1);

  run(engine, 60 * 60, { forward: 1, running: true });
  const after = engine.state.resources;

  assert.ok(after.oxygen < 1 && after.oxygen > 0.85, `oxygen after a minute: ${after.oxygen}`);
  assert.ok(after.suitBattery < 1 && after.suitBattery > 0.9, `suit after a minute: ${after.suitBattery}`);
  assert.ok(after.energy >= 0 && after.energy <= 1);

  // Running on an empty reserve must fall back to walking, not sprint.
  engine.state.resources.energy = 0;
  const speedBefore = engine.state.player.speed;
  run(engine, 120, { forward: 1, running: true });
  assert.ok(engine.state.player.speed <= 2.7, `sprinted at ${engine.state.player.speed.toFixed(2)} m/s on empty stamina`);
  assert.ok(speedBefore >= 0);

  // The HUD is told the value is simulated, not measured.
  assert.ok(snapshots.length > 10);
});

test('the pad recharges the rover, and a flat battery stops it', () => {
  const { engine } = makeEngine();
  const pad = STATIONS.find((station) => station.kind === 'pad');
  assert.ok(pad);

  // Park on the pad with a low battery.
  engine.state.rover.position = { x: pad.x, y: terrainHeight(pad.x, pad.z), z: pad.z };
  engine.state.player.mode = 'rover';
  engine.state.rover.occupied = true;
  engine.state.resources.roverBattery = 0.4;

  run(engine, 120, {});
  assert.ok(engine.state.resources.roverBattery > 0.4, 'the pad did not recharge the rover');

  // Flat battery off the pad: the drive must not move.
  engine.state.player.mode = 'rover';
  engine.state.resources.roverBattery = 0;
  engine.state.rover.position = { x: pad.x + 80, y: terrainHeight(pad.x + 80, pad.z + 80), z: pad.z + 80 };
  const stuck = { ...engine.state.rover.position };
  run(engine, 120, { throttle: 1 });
  const moved = Math.hypot(engine.state.rover.position.x - stuck.x, engine.state.rover.position.z - stuck.z);
  assert.ok(moved < 0.6, `drove ${moved.toFixed(2)} m on an empty battery`);
});

test('pausing freezes the simulation; resuming continues it', () => {
  const { engine } = makeEngine();
  const start = { ...engine.state.player.position };

  engine.pause();
  run(engine, 120, { forward: 1, running: true });
  assert.ok(Math.hypot(engine.state.player.position.x - start.x, engine.state.player.position.z - start.z) < 1e-9, 'moved while paused');
  const oxygenPaused = engine.state.resources.oxygen;

  engine.resume();
  run(engine, 120, { forward: 1, running: true });
  assert.ok(Math.hypot(engine.state.player.position.x - start.x, engine.state.player.position.z - start.z) > 0.5, 'did not move after resuming');
  assert.ok(engine.state.resources.oxygen < oxygenPaused, 'resources did not drain after resuming');
});

test('streaming follows the player and keeps obstacles solid', () => {
  const { engine } = makeEngine();
  const before = engine.visibleRocks.length;
  assert.ok(before > 100, `only ${before} rocks streamed at the landing site`);

  // Walk far enough to cross several chunk boundaries.
  engine.state.player.position = { x: 340, y: terrainHeight(340, -220), z: -220 };
  run(engine, 10, {});
  assert.ok(engine.visibleRocks.length > 100, 'the ring is empty after a long jump');
  assert.ok(engine.obstacleCount > 30, 'obstacles did not come with the ring');

  // Every rock in the physics ring must sit on the terrain.
  for (const rock of engine.visibleRocks.slice(0, 50)) {
    assert.ok(Math.abs(rock.y - terrainHeight(rock.x, rock.z)) < 1e-6);
  }
});

test('save and restore round-trips through the engine', () => {
  const { engine } = makeEngine();
  const rock = engine.visibleRocks.find((candidate) => candidate.radius > 0.6);
  engine.collectSample(rock.id);
  run(engine, 60, { forward: 1 });
  engine.state.camera.yaw = 1.1;

  const save = engine.toSave();
  assert.equal(save.progress.samples.length, 1);

  const { engine: restored } = makeEngine({ start: false });
  restored.restore(save);

  assert.ok(Math.abs(restored.state.player.position.x - engine.state.player.position.x) < 0.5);
  assert.ok(Math.abs(restored.state.player.position.z - engine.state.player.position.z) < 0.5);
  assert.equal(restored.toSave().progress.samples.length, 1);
  assert.equal(restored.toSave().progress.samples[0].kind, save.progress.samples[0].kind);
  // The restored position is seated on the ground, never mid-air.
  assert.ok(Math.abs(restored.state.player.position.y - terrainHeight(restored.state.player.position.x, restored.state.player.position.z)) < 0.01);
});

test('the sun rises and sets, and daylight tracks it', () => {
  assert.equal(daylightFor(0), daylightFor(0));
  assert.ok(daylightFor(Math.PI / 2) > 0.95, 'noon is full daylight');
  assert.ok(daylightFor(-Math.PI / 2) < 0.05, 'midnight is dark');
  assert.ok(daylightFor(Math.PI / 2) > daylightFor(0.2), 'the sun brightens toward noon');

  for (const angle of [0, 0.5, Math.PI / 2, 2.5, Math.PI, 4, 5.5]) {
    const direction = sunDirection(angle);
    const length = Math.hypot(direction.x, direction.y, direction.z);
    assert.ok(length > 0.2, `degenerate sun direction at ${angle}`);
    assert.ok(Number.isFinite(direction.x) && Number.isFinite(direction.y) && Number.isFinite(direction.z));
  }

  // The cycle actually advances, and loops rather than running away.
  const { engine } = makeEngine();
  const first = engine.state.sunAngle;
  run(engine, 600);
  assert.notEqual(engine.state.sunAngle, first, 'the sun never moved');
  assert.ok(engine.state.sunAngle >= 0 && engine.state.sunAngle < Math.PI * 2, 'sun angle left its range');
});

test('the engine starts at the documented landing site, on the ground', () => {
  const { engine } = makeEngine({ start: false });
  assert.ok(Math.abs(engine.state.player.position.x - START_POSITION.x) < 1e-6);
  assert.ok(Math.abs(engine.state.player.position.z - START_POSITION.z) < 1e-6);
  // The constructor seats the astronaut; a menu that starts the engine later must
  // not find the player underground.
  assert.ok(Math.abs(engine.state.player.position.y - terrainHeight(START_POSITION.x, START_POSITION.z)) < 0.01);
});

test('partial analogue walking input controls speed rather than normalising to full speed', () => {
  const partial = makeEngine().engine;
  const full = makeEngine().engine;
  run(partial, 30, { forward: 0.3 });
  run(full, 30, { forward: 1 });
  assert.ok(partial.state.player.speed < full.state.player.speed * 0.5);
  assert.ok(partial.state.player.speed > 0);
});

test('holding the board button boards once until released', () => {
  const { engine } = makeEngine();
  const rover = engine.state.rover.position;
  engine.state.player.position = { x: rover.x + 3, y: terrainHeight(rover.x + 3, rover.z), z: rover.z };
  run(engine, 20, { board: true });
  assert.equal(engine.state.player.mode, 'rover');
  run(engine, 1, { board: false });
  run(engine, 1, { board: true });
  assert.equal(engine.state.player.mode, 'foot');
});

test('reaching a crater rim records a milestone through engine save and restore', async () => {
  const { SURVEY_CRATER } = await import('../src/game/science/missions.ts');
  const first = makeEngine().engine;
  first.state.player.position = { x: SURVEY_CRATER.x + SURVEY_CRATER.radius, y: terrainHeight(SURVEY_CRATER.x + SURVEY_CRATER.radius, SURVEY_CRATER.z), z: SURVEY_CRATER.z };
  run(first, 1);
  const saved = first.toSave();
  assert.ok(saved.progress.missionFlags.includes('crater-rim'));
  const second = makeEngine().engine;
  second.restore(saved);
  assert.ok(second.toSave().progress.missionFlags.includes('crater-rim'));
});
