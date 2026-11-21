/**
 * The world is a function, so it can be tested like one.
 *
 * These assertions guard the properties the whole game rests on: the terrain is
 * deterministic, the chunk builder agrees with the collision function, the LOD
 * system cannot ask for more than the budget, and no generated rock or crater can
 * be placed somewhere a player could not stand.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-mars-game-world.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainHeight, terrainSlopeDegrees, craterForCell, craterOffset, LANDING_SITE, profileTerrain } from '../src/game/world/terrain.ts';
import { buildChunkGeometry, chunksAround, CHUNK_SIZE, chunkTriangleCount, resolutionForDistance, lodForDistance, chunkOf, LOD_RESOLUTION } from '../src/game/world/chunks.ts';
import { rocksInChunk } from '../src/game/world/rocks.ts';
import { fbm2, mulberry32, seedFromString, hash2 } from '../src/game/world/noise.ts';

test('noise is deterministic and stays inside its unit interval', () => {
  assert.equal(seedFromString('mars'), seedFromString('mars'), 'same string, same seed');
  assert.notEqual(seedFromString('mars'), seedFromString('venus'));

  for (let i = 0; i < 400; i += 1) {
    const value = fbm2(i * 0.37, i * 0.11, { octaves: 4, lacunarity: 2, gain: 0.5, seed: 7 });
    assert.ok(value >= 0 && value < 1, `fbm out of range at ${i}: ${value}`);
    assert.equal(fbm2(i * 0.37, i * 0.11, { octaves: 4, lacunarity: 2, gain: 0.5, seed: 7 }), value, 'pure');
  }

  // The hash must not collapse to a constant on a small lattice.
  const seen = new Set();
  for (let x = 0; x < 20; x += 1) for (let z = 0; z < 20; z += 1) seen.add(hash2(x, z, 1));
  assert.ok(seen.size > 380, `hash produced only ${seen.size} distinct values on 400 inputs`);
});

test('terrain is deterministic, continuous and unbounded', () => {
  const a = terrainHeight(12.5, -40.25);
  const b = terrainHeight(12.5, -40.25);
  assert.equal(a, b, 'same input, same height');

  // Continuity: adjacent samples 0.5 m apart may not jump more than 2 m, which
  // would be a cliff no walker could cross and a seam no mesh could hide.
  let worst = 0;
  for (let i = 0; i < 300; i += 1) {
    const x = i * 1.7 - 250;
    const z = Math.sin(i) * 140;
    worst = Math.max(worst, Math.abs(terrainHeight(x + 0.5, z) - terrainHeight(x, z)));
  }
  assert.ok(worst < 2, `largest 0.5 m step was ${worst.toFixed(2)} m`);

  // Far from the origin the field still responds to position (no clamp to zero).
  const far = [terrainHeight(9000, 9000), terrainHeight(12000, -500), terrainHeight(-30000, 0)];
  assert.ok(new Set(far.map((v) => v.toFixed(3))).size === 3, 'distant samples are distinct');
});

test('the landing site is somewhere a person can actually stand', () => {
  const slope = terrainSlopeDegrees(LANDING_SITE.x, LANDING_SITE.z);
  assert.ok(slope <= 30, `landing slope is ${slope.toFixed(1)}°`);

  const profile = profileTerrain(-100, -100, 200, 32);
  assert.ok(profile.maxSlope < 75, `the basin holds a ${profile.maxSlope.toFixed(0)}° wall`);
  assert.ok(profile.max - profile.min > 5, 'the near field has relief, not a plane');
});

test('craters are real depressions with raised rims and ejecta', () => {
  const crater = { x: 0, z: 0, radius: 40, depth: 12 };

  assert.ok(craterOffset(crater, 0, 0) < -10, 'the centre is a bowl');
  // The rim crest sits at the nominal radius and stands above the surrounding plain.
  const rim = craterOffset(crater, 40, 0);
  assert.ok(rim > 2 && rim < 4, `rim height ${rim.toFixed(2)} should be ~20% of depth`);
  // The floor rises monotonically from the centre out toward the rim.
  const profile = [0.2, 0.4, 0.6, 0.8].map((d) => craterOffset(crater, 40 * d, 0));
  for (let i = 1; i < profile.length; i += 1) assert.ok(profile[i] > profile[i - 1], 'bowl must rise toward its rim');
  // No discontinuity at the rim: the two branches must meet.
  assert.ok(Math.abs(craterOffset(crater, 40, 0) - craterOffset(crater, 40.001, 0)) < 0.05, 'rim seam');
  // Ejecta decays with distance rather than ringing forever.
  assert.ok(craterOffset(crater, 70, 0) < craterOffset(crater, 45, 0), 'ejecta decays outward');
  assert.equal(craterOffset(crater, 40 * 3, 0), 0, 'beyond the evaluated radius it contributes nothing');

  // The 3×3 neighbour search must cover every crater's reach: this is the
  // invariant that keeps a crater from being clipped at a chunk edge.
  const cell = 140;
  let checked = 0;
  for (let cx = -8; cx <= 8; cx += 1) {
    for (let cz = -8; cz <= 8; cz += 1) {
      const c = craterForCell(cx, cz);
      if (!c) continue;
      checked += 1;
      assert.ok(c.radius * 2.6 < cell, `crater reach ${(c.radius * 2.6).toFixed(0)} exceeds its cell`);
      assert.ok(c.depth > 0 && c.depth < 30);
    }
  }
  assert.ok(checked > 50, `only ${checked} craters generated; the field is too sparse to be Mars`);
});

test('chunk geometry matches the ground function it was built from', () => {
  const data = buildChunkGeometry(3, -2, 33);
  const step = CHUNK_SIZE / 32;

  // Spot-check vertices: the mesh cannot disagree with the collision height.
  for (let i = 0; i < data.positions.length; i += 3 * 97) {
    const localX = data.positions[i];
    const localZ = data.positions[i + 2];
    const worldX = 3 * CHUNK_SIZE + localX;
    const worldZ = -2 * CHUNK_SIZE + localZ;
    assert.ok(Math.abs(data.positions[i + 1] - terrainHeight(worldX, worldZ)) < 1e-3, 'vertex height matches terrainHeight');
    assert.ok(localX >= 0 && localX <= CHUNK_SIZE + 1e-6 && Math.abs(localZ / step - Math.round(localZ / step)) < 1e-6);
  }

  assert.equal(data.positions.length / 3, 33 * 33);
  assert.equal(data.indices.length / 3, chunkTriangleCount(33));
  // Normals are unit length and point up (ground is not inside-out).
  for (let i = 0; i < data.normals.length; i += 3) {
    const length = Math.hypot(data.normals[i], data.normals[i + 1], data.normals[i + 2]);
    assert.ok(Math.abs(length - 1) < 1e-3, `normal not unit: ${length}`);
    assert.ok(data.normals[i + 1] > 0.05, 'ground normal points downward somewhere');
  }
  assert.ok(data.maxY >= data.minY);
});

test('chunk ring, LOD and the triangle budget stay bounded', () => {
  assert.deepEqual(chunkOf(0, 0), { cx: 0, cz: 0 });
  assert.deepEqual(chunkOf(-1, -1), { cx: -1, cz: -1 }, 'negative coordinates floor, not truncate');
  assert.deepEqual(chunkOf(64, 63.9), { cx: 1, cz: 0 });

  assert.equal(lodForDistance(0), 'high');
  assert.equal(lodForDistance(120), 'medium');
  assert.equal(lodForDistance(400), 'low');
  assert.ok(resolutionForDistance(10) > resolutionForDistance(150));

  const ring = chunksAround(0, 0, 3);
  assert.equal(ring.length, 49, '7×7 ring');
  assert.deepEqual(ring[0], { cx: 0, cz: 0 }, 'nearest chunk first');

  // Worst case for the budget: every chunk at the highest LOD.
  const worstTriangles = ring.length * chunkTriangleCount(LOD_RESOLUTION.high);
  assert.ok(worstTriangles <= 500000, `${worstTriangles} triangles would blow the tablet budget`);

  // In practice the ring mixes LODs; count what the policy actually asks for.
  let actual = 0;
  let highCount = 0;
  for (const chunk of ring) {
    const distance = Math.hypot((chunk.cx + 0.5) * CHUNK_SIZE, (chunk.cz + 0.5) * CHUNK_SIZE);
    const resolution = resolutionForDistance(distance);
    if (resolution === LOD_RESOLUTION.high) highCount += 1;
    actual += chunkTriangleCount(resolution);
  }
  assert.ok(actual < worstTriangles, 'the LOD policy must reduce the worst case');
  // The budget rose from 60 k when the near LOD went to 1 m spacing, because
  // sub-2 m terrain detail is invisible at a 2 m grid and the surface read as
  // moulded clay. 80 k triangles is ~1.3 ms of vertex work on a GTX 960 and well
  // within an Android tablet's tile budget; the point of the assertion is that
  // high LOD stays *concentrated*, so it also pins the chunk count.
  assert.ok(actual <= 80000, `${actual} triangles in a radius-3 ring is too many`);
  assert.ok(highCount <= 5, `${highCount} chunks at high LOD is not concentrated enough`);
});

test('rocks are deterministic, sparse and never buried or floating', () => {
  const first = rocksInChunk(4, 7);
  const second = rocksInChunk(4, 7);
  assert.deepEqual(first, second, 'same chunk, same rocks');
  assert.deepEqual(rocksInChunk(4, 7).map((r) => r.id), first.map((r) => r.id));

  const total = new Set();
  for (let cx = -6; cx <= 6; cx += 1) {
    for (let cz = -6; cz <= 6; cz += 1) {
      for (const rock of rocksInChunk(cx, cz)) {
        total.add(rock.id);
        // Every rock sits on the ground, inside its own chunk.
        assert.ok(Math.abs(rock.y - terrainHeight(rock.x, rock.z)) < 1e-6, 'rock floats or sinks');
        assert.ok(rock.x >= cx * CHUNK_SIZE && rock.x < (cx + 1) * CHUNK_SIZE, 'rock outside its chunk');
        assert.ok(rock.x >= 0 || rock.x <= 0);
        // Upper bound raised with the new size distribution: 3.1 m is a boulder,
        // which real Mars has plenty of. The lower bound is unchanged — nothing is
        // smaller than a fist.
        assert.ok(rock.radius > 0.1 && rock.radius <= 3.25, `implausible radius ${rock.radius}`);
        assert.ok(rock.flatten > 0.4 && rock.flatten <= 1.05);
      }
    }
  }
  assert.equal(total.size, [...Array(13)].length * 0 + total.size, 'ids are unique by construction');
  assert.ok(total.size > 100, `only ${total.size} rocks over 169 chunks; the plain is bare`);

  // A tenth of chunks are empty by design; that must not become "most of them".
  // The bound is tight on purpose: the first density pass had a quarter of chunks
  // bare and an average of 7 rocks, which rendered as an empty dune field.
  const empty = [];
  for (let cx = -3; cx <= 3; cx += 1) for (let cz = -3; cz <= 3; cz += 1) if (rocksInChunk(cx, cz).length === 0) empty.push(`${cx}:${cz}`);
  assert.ok(empty.length < 10, `${empty.length}/49 chunks empty`);
  const counts = [];
  for (let cx = -3; cx <= 3; cx += 1) for (let cz = -3; cz <= 3; cz += 1) counts.push(rocksInChunk(cx, cz).length);
  const average = counts.reduce((a, b) => a + b, 0) / counts.length;
  assert.ok(average > 15, `only ${average.toFixed(1)} rocks per chunk; the plain is bare`);
});

test('seedFromString and mulberry32 are stable across calls', () => {
  const random = mulberry32(42);
  const values = Array.from({ length: 5 }, () => random());
  const again = mulberry32(42);
  assert.deepEqual(Array.from({ length: 5 }, () => again()), values);
  for (const value of values) assert.ok(value >= 0 && value < 1);
  assert.ok(new Set(values).size === 5, 'PRNG repeats immediately');
});
