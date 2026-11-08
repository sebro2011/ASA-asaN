/**
 * Astronomy maths — the numbers behind Orbit Lab and the observing plan.
 *
 * These are closed-form results, so the tests can compare against textbook
 * values instead of against the implementation's own output: a wrong formula
 * fails here rather than being shown to a reader as a computed orbit.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-workspace-astronomy.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CENTRAL_BODIES,
  MOON_PHASE_KEYS,
  angularDiameterDegrees,
  escapeSpeedKmS,
  formatPeriod,
  lightTimeSeconds,
  moonPhase,
  orbitalPeriodDays,
  orbitalPeriodSeconds,
  orbitalSpeedKmS,
  radiusFromAltitude,
  toDateInputValue,
} from '../src/workspace/modules/astronomy.ts';

const EARTH_MU = CENTRAL_BODIES.earth.mu;
const EARTH_RADIUS = CENTRAL_BODIES.earth.radius;

test('Kepler period: circular LEO at 300 km altitude is about 90 minutes', () => {
  const radius = radiusFromAltitude(300, EARTH_RADIUS);
  assert.equal(radius, 6671);
  const seconds = orbitalPeriodSeconds(radius, EARTH_MU);
  assert.ok(seconds !== null);
  assert.ok(Math.abs(seconds - 5430) < 60, `LEO period was ${seconds}s`);
  const speed = orbitalSpeedKmS(radius, EARTH_MU);
  assert.ok(speed !== null && Math.abs(speed - 7.73) < 0.05, `LEO speed was ${speed}`);
});

test('Kepler period: a geostationary radius returns one sidereal day', () => {
  const period = orbitalPeriodDays(42164, EARTH_MU);
  assert.ok(period !== null);
  // Sidereal day 86164 s = 0.99727 d — within a minute of the mean solar day.
  assert.ok(Math.abs(period - 0.99727) < 0.002, `GEO period was ${period} d`);
});

test('Kepler period: the Moon takes a sidereal month around Earth', () => {
  // Earth's own μ alone (the module's two-body input) gives 27.45 d; adding the
  // Moon's μ — i.e. orbiting the Earth–Moon barycentre — gives the familiar
  // 27.3 d. Both are checked so the difference is visible, not glossed over.
  const earthOnly = orbitalPeriodDays(384400, EARTH_MU);
  assert.ok(earthOnly !== null);
  assert.ok(Math.abs(earthOnly - 27.45) < 0.05, `Earth-only period was ${earthOnly} d`);
  const barycentric = orbitalPeriodDays(384400, EARTH_MU + CENTRAL_BODIES.moon.mu);
  assert.ok(barycentric !== null);
  assert.ok(Math.abs(barycentric - 27.28) < 0.05, `barycentric period was ${barycentric} d`);
});

test('Kepler period scales as a^(3/2)', () => {
  const one = orbitalPeriodSeconds(10000, EARTH_MU);
  const eight = orbitalPeriodSeconds(40000, EARTH_MU);
  assert.ok(one !== null && eight !== null);
  assert.ok(Math.abs(eight / one - 8) < 1e-9);
});

test('escape speed is root two times the circular speed', () => {
  const circular = orbitalSpeedKmS(EARTH_RADIUS, EARTH_MU);
  const escape = escapeSpeedKmS(EARTH_RADIUS, EARTH_MU);
  assert.ok(circular !== null && escape !== null);
  assert.ok(Math.abs(circular - 7.91) < 0.02, `surface speed was ${circular}`);
  assert.ok(Math.abs(escape - 11.19) < 0.03, `escape speed was ${escape}`);
  assert.ok(Math.abs(escape / circular - Math.SQRT2) < 1e-12);
});

test('the Sun surface escape speed is the textbook 617 km/s', () => {
  const escape = escapeSpeedKmS(CENTRAL_BODIES.sun.radius, CENTRAL_BODIES.sun.mu);
  assert.ok(escape !== null);
  assert.ok(Math.abs(escape - 617.7) < 1, `solar escape speed was ${escape}`);
});

test('light time for one astronomical unit is 499 seconds', () => {
  const seconds = lightTimeSeconds(149_597_870.7);
  assert.ok(seconds !== null);
  assert.ok(Math.abs(seconds - 499.005) < 0.5, `light time was ${seconds}`);
});

test('angular diameter: Sun and Moon are both about half a degree from Earth', () => {
  const sun = angularDiameterDegrees(1_391_400, 149_597_870.7);
  const moon = angularDiameterDegrees(3474.8, 384_400);
  assert.ok(sun !== null && moon !== null);
  assert.ok(Math.abs(sun - 0.533) < 0.01, `Sun diameter was ${sun}°`);
  assert.ok(Math.abs(moon - 0.518) < 0.01, `Moon diameter was ${moon}°`);
});

test('moon phase: a known new moon is dark and full two weeks later', () => {
  const newMoon = moonPhase('2000-01-06T18:14:00.000Z');
  assert.ok(newMoon);
  assert.equal(newMoon.phaseKey, 'wsMoonNew');
  assert.ok(newMoon.illumination < 0.01);
  // Exactly at new moon the Moon is about to wax, so `waxing` is true there.
  assert.equal(newMoon.waxing, true);

  const full = moonPhase('2000-01-21T04:00:00.000Z');
  assert.ok(full);
  assert.equal(full.phaseKey, 'wsMoonFull');
  assert.ok(full.illumination > 0.99);
});

test('moon phase: all eight boundaries map to distinct copy keys', () => {
  const reference = Date.UTC(2000, 0, 6, 18, 14);
  const synodicMs = 29.530588853 * 86_400_000;
  const seen = [];
  for (let index = 0; index < 8; index += 1) {
    const phase = moonPhase(reference + (synodicMs * index) / 8);
    assert.ok(phase);
    assert.equal(phase.phaseKey, MOON_PHASE_KEYS[index]);
    seen.push(phase.phaseKey);
  }
  assert.equal(seen.length, 8);
  assert.equal(new Set(seen).size, 8);
  assert.equal(MOON_PHASE_KEYS.length, 8);
});

test('moon phase: illumination is symmetric about full moon', () => {
  const reference = Date.UTC(2000, 0, 6, 18, 14);
  const synodicMs = 29.530588853 * 86_400_000;
  const waxing = moonPhase(reference + synodicMs * 0.25);
  const waning = moonPhase(reference + synodicMs * 0.75);
  assert.ok(waxing && waning);
  assert.ok(Math.abs(waxing.illumination - 0.5) < 1e-6);
  assert.ok(Math.abs(waxing.illumination - waning.illumination) < 1e-6);
  assert.equal(waxing.waxing, true);
  assert.equal(waning.waxing, false);
});

test('invalid input returns null instead of a misleading number', () => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '', 'abc', null, undefined]) {
    assert.equal(orbitalPeriodSeconds(value, EARTH_MU), null, `period accepted ${String(value)}`);
    assert.equal(orbitalSpeedKmS(value, EARTH_MU), null, `speed accepted ${String(value)}`);
    if (value !== 0) assert.equal(lightTimeSeconds(value), null, `light time accepted ${String(value)}`);
  }
  assert.equal(orbitalPeriodSeconds(7000, 0), null);
  assert.equal(orbitalPeriodSeconds(7000, -5), null);
  assert.equal(orbitalSpeedKmS(7000, Number.NaN), null);
  assert.equal(radiusFromAltitude(-1, EARTH_RADIUS), null);
  assert.equal(radiusFromAltitude(1000, 0), null);
  assert.equal(radiusFromAltitude(0, EARTH_RADIUS), EARTH_RADIUS, 'sea level is a valid radius');
  assert.equal(angularDiameterDegrees(0, 1000), null);
  assert.equal(angularDiameterDegrees(1000, 0), null);
  assert.equal(moonPhase('not a date'), null);
  assert.equal(moonPhase(Number.NaN), null);
});

test('formatPeriod switches from days to years and never invents precision', () => {
  assert.deepEqual(formatPeriod(0.5), { value: '0.500', unit: 'days' });
  assert.deepEqual(formatPeriod(27.321), { value: '27.32', unit: 'days' });
  assert.deepEqual(formatPeriod(365.25), { value: '1.00', unit: 'years' });
});

test('toDateInputValue uses local date parts, not UTC', () => {
  assert.equal(toDateInputValue(new Date(2026, 0, 2, 23, 30)), '2026-01-02');
  assert.equal(toDateInputValue(new Date(2026, 10, 8, 0, 5)), '2026-11-08');
});
