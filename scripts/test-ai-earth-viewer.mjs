/**
 * AI-Enhanced Earth Viewer — unit tests for the pure data layer.
 *
 * Run with:  npm run test:ai-viewer
 * (equivalently: node --import tsx --test scripts/test-ai-earth-viewer.mjs)
 *
 * Scope (per the feature brief):
 *  - GIBS WMS GetMap URL integrity: verified catalog identifiers/hosts only,
 *    no invented layer ids, hosts or dates; dimension/memory caps.
 *  - Observation-date validation: malformed, future and outside-domain dates
 *    are blocked before any image request.
 *  - The viewer reducer's full state machine, including stale-job guards and
 *    the rule that enhancement can only start from a displayed frame.
 *  - The browser enhancement pipeline: conservative clamps, non-destructive
 *    copies, real progress, transparent-pixel handling and cancellation.
 *  - The AI adapter's honest "unavailable" contract (it never fakes success).
 *
 * Canvas/DOM behaviour is covered by the smoke render suite; everything here
 * is DOM-free so it runs under Node's built-in test runner.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_LAYER_ID,
  GIBS_LAYERS,
  GIBS_WMS_BASE,
  getGibsLayer
} from '../src/lib/earth/gibsCatalog.ts';
import { buildDomain } from '../src/lib/earth/domains.ts';
import {
  buildFrameRequest,
  initialViewerState,
  validateObservationDate,
  viewerReducer,
  VIEWER_AREAS
} from '../src/lib/earth/viewerState.ts';
import {
  DEFAULT_SETTINGS,
  ENHANCEMENT_LIMITS,
  EnhancementAbortedError,
  MAX_FRAME_BYTES,
  MAX_FRAME_DIM,
  clampFrameDimensions,
  clampSettings,
  describeSettings,
  enhanceFrame,
  isAbortError
} from '../src/lib/earth/enhance.ts';
import {
  aiSuperResolutionAvailable,
  getAiUpscaleBackend
} from '../src/lib/earth/aiUpscale.ts';

const TODAY = '2026-10-27';
const DEFAULT_LAYER = getGibsLayer(DEFAULT_LAYER_ID);
const SRI_LANKA = VIEWER_AREAS.find((area) => area.id === 'sri-lanka');

/* ------------------------------------------------------------------ */
/* A. GIBS frame request / URL integrity                               */
/* ------------------------------------------------------------------ */

test('frame request targets the documented GIBS WMS host with a verified catalog layer', () => {
  const request = buildFrameRequest(DEFAULT_LAYER, '2026-10-20', SRI_LANKA, 768);
  const url = new URL(request.url);

  assert.equal(url.origin, 'https://gibs.earthdata.nasa.gov');
  assert.equal(url.href.startsWith(GIBS_WMS_BASE), true);
  assert.equal(url.searchParams.get('SERVICE'), 'WMS');
  assert.equal(url.searchParams.get('REQUEST'), 'GetMap');
  assert.equal(url.searchParams.get('VERSION'), '1.3.0');
  assert.equal(url.searchParams.get('CRS'), 'EPSG:3857');
  assert.equal(url.searchParams.get('LAYERS'), DEFAULT_LAYER_ID);
  assert.ok(GIBS_LAYERS.some((layer) => layer.id === url.searchParams.get('LAYERS')), 'layer id must exist in the verified catalog');
  assert.equal(url.searchParams.get('TIME'), '2026-10-20');
  assert.equal(url.searchParams.get('FORMAT'), 'image/png');

  const bbox = url.searchParams.get('BBOX').split(',').map(Number);
  assert.equal(bbox.length, 4);
  assert.ok(bbox.every(Number.isFinite));
  // EPSG:3857 metres stay inside the world extent.
  assert.ok(bbox.every((value) => Math.abs(value) <= 20037508.34));
  assert.ok(bbox[2] > bbox[0] && bbox[3] > bbox[1], 'bbox must be ordered [minX,minY,maxX,maxY]');

  assert.equal(Number(url.searchParams.get('WIDTH')), request.width);
  assert.equal(Number(url.searchParams.get('HEIGHT')), request.height);
  assert.ok(request.width <= MAX_FRAME_DIM && request.height <= MAX_FRAME_DIM);
});

test('frame request dimensions are clamped to the processing budget while keeping aspect ratio', () => {
  const request = buildFrameRequest(DEFAULT_LAYER, '2026-10-20', SRI_LANKA, 2048);
  assert.ok(request.width <= MAX_FRAME_DIM);
  assert.ok(request.height <= MAX_FRAME_DIM);
  assert.equal(Math.max(request.width, request.height), MAX_FRAME_DIM);

  const modest = buildFrameRequest(DEFAULT_LAYER, '2026-10-20', SRI_LANKA, 512);
  assert.equal(Math.max(modest.width, modest.height), 512);
});

test('viewer areas are well-formed and include Sri Lanka and Colombo', () => {
  assert.equal(VIEWER_AREAS.length, 5);
  const ids = VIEWER_AREAS.map((area) => area.id);
  assert.deepEqual(new Set(ids).size, ids.length, 'area ids are unique');
  for (const area of VIEWER_AREAS) {
    const [south, west, north, east] = area.bounds;
    assert.ok(north > south, `${area.id}: north must exceed south`);
    assert.ok(east > west, `${area.id}: east must exceed west`);
    assert.ok([south, north].every((lat) => Math.abs(lat) <= 90));
    assert.ok([west, east].every((lon) => Math.abs(lon) <= 180));
  }
  assert.ok(ids.includes('sri-lanka') && ids.includes('colombo'));
});

/* ------------------------------------------------------------------ */
/* B. Observation-date validation                                      */
/* ------------------------------------------------------------------ */

const SAMPLE_DOMAIN_XML = `
<DomainSet>
  <Dimension>
    <Identifier>Time</Identifier>
    <Value>2020-01-01/2020-03-31/P1D</Value>
  </Dimension>
</DomainSet>`;

test('malformed date strings are rejected without issuing any request', () => {
  for (const bad of ['not-a-date', '2026-13-40', '2026/10/01', '']) {
    const result = validateObservationDate(bad, null, TODAY);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'invalid');
  }
});

test('future observation dates are rejected and point back to today', () => {
  const result = validateObservationDate('2030-01-01', null, TODAY);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'future');
    assert.equal(result.nearestDate, TODAY);
  }
});

test('dates outside the reported layer domain are rejected with a nearest in-domain date', () => {
  const domain = buildDomain({ layerId: 'X', xml: SAMPLE_DOMAIN_XML, sourceUrl: 'u' });
  const result = validateObservationDate('2021-06-01', domain, TODAY);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'outside-domain');
    assert.equal(result.nearestDate, '2020-03-31');
    assert.match(result.detail, /2020-03-31|domain/i);
  }
});

test('valid past dates pass, including when the domain has not been fetched yet', () => {
  assert.equal(validateObservationDate('2026-10-20', null, TODAY).ok, true);
  const domain = buildDomain({ layerId: 'X', xml: SAMPLE_DOMAIN_XML, sourceUrl: 'u' });
  const inDomain = validateObservationDate('2020-02-15', domain, TODAY);
  assert.equal(inDomain.ok, true);
  if (inDomain.ok) assert.equal(inDomain.date, '2020-02-15');
});

/* ------------------------------------------------------------------ */
/* C. Viewer reducer state machine                                     */
/* ------------------------------------------------------------------ */

function reduce(...actions) {
  return actions.reduce(viewerReducer, initialViewerState);
}

test('happy path: idle -> loading -> ready -> enhancing -> enhanced -> original', () => {
  let state = viewerReducer(initialViewerState, { type: 'fetch_start' });
  assert.equal(state.status, 'loading');
  assert.equal(state.requestId, 1);
  assert.equal(state.processing, 'original');

  state = viewerReducer(state, { type: 'fetch_success', loadedAt: '2026-10-27T00:00:00.000Z', availability: null });
  assert.equal(state.status, 'ready');
  assert.equal(state.lastLoadedAt, '2026-10-27T00:00:00.000Z');

  state = viewerReducer(state, { type: 'enhance_start' });
  assert.equal(state.status, 'enhancing');
  assert.equal(state.progress, 0);

  state = viewerReducer(state, { type: 'enhance_progress', fraction: 0.5 });
  assert.equal(state.progress, 0.5);

  state = viewerReducer(state, { type: 'enhance_success' });
  assert.equal(state.status, 'enhanced');
  assert.equal(state.processing, 'browser');
  assert.equal(state.progress, null);

  state = viewerReducer(state, { type: 'reset_original' });
  assert.equal(state.status, 'ready');
  assert.equal(state.processing, 'original');
});

test('enhancement can only start from a displayed frame', () => {
  for (const status of ['idle', 'loading', 'offline', 'unavailable', 'error']) {
    const base = { ...initialViewerState, status };
    assert.equal(viewerReducer(base, { type: 'enhance_start' }), base, `enhance_start ignored in ${status}`);
  }
  const ready = reduce({ type: 'fetch_start' }, { type: 'fetch_success', loadedAt: 'x', availability: null });
  assert.equal(viewerReducer(ready, { type: 'enhance_start' }).status, 'enhancing');
});

test('progress values are clamped to 0..1 and ignored outside the enhancing phase', () => {
  const ready = reduce({ type: 'fetch_start' }, { type: 'fetch_success', loadedAt: 'x', availability: null });
  let enhancing = viewerReducer(ready, { type: 'enhance_start' });
  enhancing = viewerReducer(enhancing, { type: 'enhance_progress', fraction: 5 });
  assert.equal(enhancing.progress, 1);
  enhancing = viewerReducer(enhancing, { type: 'enhance_progress', fraction: -9 });
  assert.equal(enhancing.progress, 0);

  const ignored = viewerReducer(ready, { type: 'enhance_progress', fraction: 0.9 });
  assert.equal(ignored.progress, null);
});

test('enhancement failure returns to the original frame with an honest message', () => {
  const state = reduce(
    { type: 'fetch_start' },
    { type: 'fetch_success', loadedAt: 'x', availability: null },
    { type: 'enhance_start' },
    { type: 'enhance_error', message: 'boom' }
  );
  assert.equal(state.status, 'ready');
  assert.equal(state.processing, 'original');
  assert.equal(state.errorMessage, 'boom');
  assert.equal(state.progress, null);
});

test('offline and outside-domain availability are surfaced as distinct states', () => {
  const offline = viewerReducer(initialViewerState, { type: 'mark_offline' });
  assert.equal(offline.status, 'offline');

  const verdict = {
    layerId: 'X',
    requestedDate: '2021-06-01',
    verdict: 'outside-domain',
    nearestDate: '2020-03-31',
    matches: [],
    domain: null,
    detail: 'outside'
  };
  const unavailable = viewerReducer(initialViewerState, { type: 'mark_unavailable', availability: verdict });
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.availability.nearestDate, '2020-03-31');
});

test('retry restarts loading, bumps the request id and clears stale errors', () => {
  const errored = reduce(
    { type: 'fetch_start' },
    { type: 'fetch_error', message: 'network down' },
    { type: 'retry' }
  );
  assert.equal(errored.status, 'loading');
  assert.equal(errored.requestId, 2);
  assert.equal(errored.errorMessage, undefined);
  assert.equal(errored.availability, null);
});

test('unknown actions leave state untouched (forward-compatible reducer)', () => {
  assert.equal(viewerReducer(initialViewerState, { type: 'no-such-action' }), initialViewerState);
});

/* ------------------------------------------------------------------ */
/* D. Browser enhancement pipeline                                     */
/* ------------------------------------------------------------------ */

test('clampSettings enforces the conservative ranges and falls back on non-finite input', () => {
  const clamped = clampSettings({
    brightness: 999,
    contrast: 0.1,
    saturation: 5,
    sharpen: -2
  });
  assert.equal(clamped.brightness, ENHANCEMENT_LIMITS.brightness.max);
  assert.equal(clamped.contrast, ENHANCEMENT_LIMITS.contrast.min);
  assert.equal(clamped.saturation, ENHANCEMENT_LIMITS.saturation.max);
  assert.equal(clamped.sharpen, ENHANCEMENT_LIMITS.sharpen.min);

  const fallback = clampSettings({ brightness: Number.NaN, contrast: undefined });
  assert.deepEqual(fallback, DEFAULT_SETTINGS);
});

test('clampFrameDimensions preserves aspect ratio and rejects invalid dimensions', () => {
  assert.deepEqual(clampFrameDimensions(300, 200), { width: 300, height: 200 });
  const scaled = clampFrameDimensions(2048, 1024);
  assert.equal(scaled.width, MAX_FRAME_DIM);
  assert.equal(scaled.height, 512);
  assert.throws(() => clampFrameDimensions(0, 100), /Invalid frame dimensions/);
  assert.throws(() => clampFrameDimensions(Number.NaN, 100), /Invalid frame dimensions/);
});

function makeFrame(width, height, fill = (x, y) => [(x * 7 + y * 13) % 256, (x * 5) % 256, (y * 11) % 256, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = (y * width + x) * 4;
      const [r, g, b, a] = fill(x, y);
      data[px] = r;
      data[px + 1] = g;
      data[px + 2] = b;
      data[px + 3] = a;
    }
  }
  return { width, height, data };
}

test('enhanceFrame returns a non-destructive copy and never mutates the source', async () => {
  const source = makeFrame(12, 12);
  const snapshot = new Uint8ClampedArray(source.data);
  const output = await enhanceFrame(source, { ...DEFAULT_SETTINGS, brightness: 20, contrast: 1.1, sharpen: 0.3 });

  assert.notEqual(output.data, source.data);
  assert.deepEqual(Array.from(source.data), Array.from(snapshot), 'source pixels are retained for lossless recovery');
  assert.notDeepEqual(Array.from(output.data), Array.from(snapshot), 'adjusted output differs from the source');
  assert.equal(output.width, source.width);
  assert.equal(output.height, source.height);
});

test('neutral settings reproduce the original pixels and transparent padding stays untouched', async () => {
  const source = makeFrame(8, 8, (x, y) => (x === 0 && y === 0 ? [10, 20, 30, 0] : [100, 110, 120, 255]));
  const output = await enhanceFrame(source, DEFAULT_SETTINGS);
  assert.deepEqual(Array.from(output.data), Array.from(source.data));

  // Even aggressive settings must leave fully transparent pixels alone.
  const adjusted = await enhanceFrame(source, { brightness: 30, contrast: 1.3, saturation: 1.4, sharpen: 0.6 });
  const px0 = adjusted.data.slice(0, 4);
  assert.deepEqual(Array.from(px0), [10, 20, 30, 0]);
});

test('enhanceFrame reports real progress ending at 100% with named stages', async () => {
  const source = makeFrame(16, 80); // > one 64-row slice so progress is meaningful
  const events = [];
  await enhanceFrame(source, { ...DEFAULT_SETTINGS, sharpen: 0.2 }, { onProgress: (event) => events.push(event) });

  assert.ok(events.length >= 2);
  assert.deepEqual(events.map((event) => event.stage), ['tonal', 'sharpen']);
  assert.ok(events.every((event) => event.fraction >= 0 && event.fraction <= 1));
  assert.equal(events.at(-1).fraction, 1);
});

test('cancellation: a pre-aborted signal rejects via the typed abort error and writes nothing', async () => {
  const source = makeFrame(128, 128);
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    enhanceFrame(source, DEFAULT_SETTINGS, { signal: controller.signal }),
    (error) => error instanceof EnhancementAbortedError && isAbortError(error)
  );
});

test('frames over the ~4 MB RGBA budget are refused before any allocation work', async () => {
  const oversized = makeFrame(MAX_FRAME_DIM + 1, MAX_FRAME_DIM + 1);
  assert.ok(oversized.data.length > MAX_FRAME_BYTES);
  await assert.rejects(() => enhanceFrame(oversized, DEFAULT_SETTINGS), /budget/);
});

test('describeSettings renders neutral and adjusted control summaries', () => {
  assert.equal(describeSettings(DEFAULT_SETTINGS), 'no adjustments');
  const summary = describeSettings({ brightness: -10, contrast: 1.15, saturation: 0.8, sharpen: 0.4 });
  assert.match(summary, /brightness -10/);
  assert.match(summary, /contrast ×1.15/);
  assert.match(summary, /saturation ×0.80/);
  assert.match(summary, /unsharp mask 40%/);
});

/* ------------------------------------------------------------------ */
/* E. AI adapter honesty contract                                      */
/* ------------------------------------------------------------------ */

test('the AI backend never fakes capability: it is unavailable and its upscale call rejects', async () => {
  const backend = getAiUpscaleBackend();
  assert.equal(backend.isAvailable(), false);
  assert.equal(backend.status, 'unavailable');
  assert.ok(backend.statusDetail.length > 20);
  assert.equal(aiSuperResolutionAvailable(), false);
  await assert.rejects(() => backend.upscale(makeFrame(4, 4)), /No AI super-resolution backend/);
});
