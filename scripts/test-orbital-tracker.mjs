import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getSubSolarPoint,
  getNightTerminatorPolygon,
  isSpacecraftInSunlight,
  computeVisibilityRadiusMeters,
  computeGreatCircleDistanceKm,
  computeGreatCircleArc,
  splitAntimeridianPath,
  computeOrbitPeriodMinutes,
  getApproximateRegion,
  formatCoordinate
} from '../src/utils/orbitalHelpers.js';

const SINHALA = /[\u0D80-\u0DFF]/;
const TAMIL = /[\u0B80-\u0BFF]/;

test('sub-solar point and terminator polygon stay within valid geographic bounds', () => {
  const juneSolstice = new Date('2026-06-21T12:00:00Z');
  const sun = getSubSolarPoint(juneSolstice);
  assert.ok(sun.latitude > 20 && sun.latitude <= 24, `expected summer solstice declination near +23.4, got ${sun.latitude}`);
  assert.ok(Math.abs(sun.longitude) < 2, `expected UTC noon sun near prime meridian, got ${sun.longitude}`);

  const poly = getNightTerminatorPolygon(juneSolstice);
  assert.ok(poly.length > 100);
  for (const [lat, lon] of poly) {
    assert.ok(lat >= -85 && lat <= 85, `lat out of bounds: ${lat}`);
    assert.ok(lon >= -360 && lon <= 360, `lon out of bounds: ${lon}`);
  }
});

test('spacecraft sunlight check identifies daylight vs deep night eclipse', () => {
  const noonUtc = new Date('2026-03-21T12:00:00Z'); // Sun over (0, 0)
  assert.equal(isSpacecraftInSunlight(0, 0, 420, noonUtc), true, 'sub-solar point is sunlit');
  assert.equal(isSpacecraftInSunlight(0, 180, 420, noonUtc), false, 'anti-solar LEO point is in Earth shadow');
  assert.equal(isSpacecraftInSunlight(0, 180, 1500000, noonUtc), true, 'deep-space JWST remains illuminated');
});

test('visibility radius matches geometric horizon for LEO and returns null for deep space', () => {
  const issMeters = computeVisibilityRadiusMeters(419);
  assert.ok(issMeters > 2150000 && issMeters < 2350000, `expected ISS horizon ~2265 km, got ${issMeters}`);
  const landsatMeters = computeVisibilityRadiusMeters(705);
  assert.ok(landsatMeters > issMeters, 'higher LEO altitude yields wider visibility circle');
  assert.equal(computeVisibilityRadiusMeters(1500000), null, 'deep space has no small LEO ground circle');
  assert.equal(computeVisibilityRadiusMeters(64200), null, 'high elliptical Chandra omits LEO ground circle');
});

test('antimeridian splitting prevents horizontal wrap streaks across +/-180 deg', () => {
  const crossing = [
    [10, 175],
    [11, 179],
    [12, -178],
    [13, -174]
  ];
  const segments = splitAntimeridianPath(crossing);
  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0], [[10, 175], [11, 179]]);
  assert.deepEqual(segments[1], [[12, -178], [13, -174]]);
});

test('great-circle distance and arc between Colombo and Tokyo are accurate and safe', () => {
  const dist = computeGreatCircleDistanceKm(6.9271, 79.8612, 35.6762, 139.6503);
  assert.ok(dist > 6700 && dist < 7000, `expected Colombo-Tokyo ~6860 km, got ${dist}`);

  const arcAcrossDateline = computeGreatCircleArc(35.6762, 139.6503, 29.5593, -95.0900, 40);
  assert.ok(arcAcrossDateline.length >= 1);
  for (const seg of arcAcrossDateline) {
    for (let i = 1; i < seg.length; i += 1) {
      assert.ok(Math.abs(seg[i][1] - seg[i - 1][1]) <= 180, 'no single arc segment may jump >180 deg');
    }
  }
});

test('orbit period and localized region helpers return intuitive values in en/si/ta', () => {
  const issPeriod = computeOrbitPeriodMinutes(419, 'iss');
  assert.ok(issPeriod >= 91 && issPeriod <= 95, `expected ISS period ~93 min, got ${issPeriod}`);
  assert.equal(computeOrbitPeriodMinutes(1500000, 'jwst'), null);

  const colomboRegion = getApproximateRegion(6.93, 79.86);
  assert.equal(colomboRegion.en, 'Near Sri Lanka');
  assert.match(colomboRegion.si, SINHALA);
  assert.doesNotMatch(colomboRegion.si, TAMIL);
  assert.match(colomboRegion.ta, TAMIL);
  assert.doesNotMatch(colomboRegion.ta, SINHALA);

  assert.equal(formatCoordinate(6.9271, 'lat', 'en'), '6.93° N');
  assert.equal(formatCoordinate(-95.09, 'lon', 'en'), '95.09° W');
});

test('ISSTracker obeys design-token, focus-trap, and honest pass-prediction contracts', () => {
  const source = readFileSync('src/components/ISSTracker.jsx', 'utf8');
  assert.doesNotMatch(source, /backdrop-blur/, 'must use design-system glass classes, never raw backdrop-blur');
  assert.doesNotMatch(source, /countdownFormatted|minutesToClosest/);
  assert.match(source, /Next-pass time is not predict/);
  assert.match(source, /useFocusTrap/);
});

test('ISSTracker mounts cleanly and supports guide, spacecraft switching, layers, modal, and Sinhala UI', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/'
  });
  const saved = {};
  const keys = [
    'window', 'document', 'navigator', 'HTMLElement', 'Element', 'SVGElement',
    'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'localStorage', 'sessionStorage',
    'getComputedStyle', 'DOMRect'
  ];
  for (const k of keys) {
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
    if (dom.window[k] !== undefined) {
      Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
    }
  }
  const origRaf = globalThis.requestAnimationFrame;
  const origCaf = globalThis.cancelAnimationFrame;
  const origFetch = globalThis.fetch;
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ latitude: 7.2, longitude: 80.1, altitude: 419, velocity: 27584, timestamp: Math.floor(Date.now() / 1000) }),
      { status: 200 }
    );

  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { I18nextProvider } = await import('react-i18next');
    const i18n = (await import('../src/i18n.ts')).default;
    const ISSTracker = (await import('../src/components/ISSTracker.jsx')).default;

    await i18n.changeLanguage('en');
    const root = createRoot(document.getElementById('root'));
    await act(async () => {
      root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(ISSTracker)));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    assert.ok(document.body.textContent.includes('Interactive Orbital Map Tracker'));
    assert.ok(document.body.textContent.includes('Right Now in Plain Words'));
    assert.ok(document.body.textContent.includes('Colombo, Sri Lanka'));
    assert.ok(document.body.textContent.includes('Next-pass time is not predicted here'));

    const guideBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent.includes('How to Read Map')
    );
    assert.ok(guideBtn, 'Guide toggle button exists');
    await act(async () => { guideBtn.click(); });
    assert.ok(document.body.textContent.includes('1. Choose a Spacecraft'));

    const jwstBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent.includes('James Webb')
    );
    assert.ok(jwstBtn, 'JWST fleet button exists');
    await act(async () => { jwstBtn.click(); });
    assert.ok(document.body.textContent.includes('Deep-space observatory'));

    const layersBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Map Layers'
    );
    assert.ok(layersBtn, 'Map layers button exists');
    await act(async () => { layersBtn.click(); });
    assert.ok(document.body.textContent.includes('Earth Night Shadow'));

    const detailsBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Mission Details')
    );
    assert.ok(detailsBtn, 'Mission Details button exists');
    await act(async () => { detailsBtn.click(); });
    assert.ok(document.querySelector('[role="dialog"]'), 'Mission details dialog opens');

    await act(async () => { await i18n.changeLanguage('si'); });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    assert.ok(document.body.textContent.includes('අන්තර්ක්‍රියාකාරී කක්ෂීය සිතියම් නිරීක්ෂකය'));
    assert.ok(document.body.textContent.includes('දැන් තත්ත්වය සරලව'));
    assert.ok(document.body.textContent.includes('කොළඹ, ශ්‍රී ලංකාව'));

    await act(async () => { root.unmount(); });
  } finally {
    globalThis.requestAnimationFrame = origRaf;
    globalThis.cancelAnimationFrame = origCaf;
    globalThis.fetch = origFetch;
    for (const k of keys) {
      if (saved[k]) Object.defineProperty(globalThis, k, saved[k]);
      else delete globalThis[k];
    }
  }
});
