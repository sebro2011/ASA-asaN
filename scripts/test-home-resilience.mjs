/**
 * Resilience of the first paint: budgets that match, one honest retry, no dead ends.
 *
 * Two failures on the deployed app drove these tests.
 *
 * 1. The NEO tile said UNAVAILABLE while the server was still working. `/api/asteroids/neows`
 *    may spend 12 s on NeoWs and then 8 s on the JPL fallback, but the browser gave up at
 *    15 s, so the JPL data the server produced was never seen. A client budget shorter than
 *    the server's own worst case throws away a successful answer.
 * 2. A single dropped request left a permanent error panel/tile until the viewer pressed
 *    Retry. One bounded, silent second attempt fixes the transient case without pretending
 *    a down service is up.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-home-resilience.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/* ------------------------------------------------------------------- policy */
const { TRANSIENT_RETRY, isRetryable, withRetry } = await import('../src/lib/retry.ts');

test('a retry policy is bounded, ordered and never retries a caller abort', async () => {
  assert.equal(TRANSIENT_RETRY.attempts, 2);
  assert.ok(TRANSIENT_RETRY.delaysMs[0] > 0 && TRANSIENT_RETRY.delaysMs[0] <= 2000, 'a retry is a rescue, not a backoff loop');

  const waits = [];
  let calls = 0;
  const value = await withRetry(
    async () => {
      calls += 1;
      if (calls < 2) throw new Error('network');
      return 'ok';
    },
    TRANSIENT_RETRY,
    { wait: async (ms) => waits.push(ms) }
  );
  assert.equal(value, 'ok');
  assert.equal(calls, 2, 'a single failure is retried once');
  assert.deepEqual(waits, [TRANSIENT_RETRY.delaysMs[0]], 'the delay comes from the policy');

  let attempts = 0;
  await assert.rejects(
    () => withRetry(async () => { attempts += 1; throw new Error('still down'); }, { attempts: 3, delaysMs: [1, 1] }, { wait: async () => {} }),
    /still down/
  );
  assert.equal(attempts, 3, 'a persistent failure ends after the bounded attempts');

  const abortError = new Error('Aborted');
  abortError.name = 'AbortError';
  assert.equal(isRetryable(abortError), false);
  let abortedCalls = 0;
  await assert.rejects(
    () => withRetry(async () => { abortedCalls += 1; throw abortError; }, { attempts: 5, delaysMs: [1] }, { wait: async () => {} }),
    /Aborted/
  );
  assert.equal(abortedCalls, 1, 'the page moved on, so no retry races it');

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => withRetry(async () => { abortedCalls += 1; return 'never'; }, TRANSIENT_RETRY, { signal: controller.signal }),
    /Abort/
  );
  assert.equal(abortedCalls, 1, 'an already-aborted request is not started again');
});

/* ------------------------------------------------------------------ budgets */
test('the browser waits longer than the server can possibly take (NeoWs)', async () => {
  const { NEOWS_TIMEOUT_MS, CAD_TIMEOUT_MS } = await import('../server/nasaRoutes.ts');
  const { NEOWS_CLIENT_BUDGET_MS } = await import('../src/pages/home/homeData.ts');
  const serverWorstCase = NEOWS_TIMEOUT_MS + CAD_TIMEOUT_MS;
  assert.equal(serverWorstCase, 20_000, 'NeoWs 12 s, then the JPL fallback 8 s');
  assert.ok(
    NEOWS_CLIENT_BUDGET_MS > serverWorstCase,
    `client budget ${NEOWS_CLIENT_BUDGET_MS} ms must exceed the server's ${serverWorstCase} ms worst case`
  );
  assert.ok(NEOWS_CLIENT_BUDGET_MS < 30_000, 'and stay under the function’s 30 s limit');
});

test('the CosmoVision feed budget exceeds one search plus one videos.list', async () => {
  const { FEED_REQUEST_TIMEOUT_MS, FEED_RETRY } = await import('../src/features/space-shorts/feedPolicy.ts');
  assert.ok(FEED_REQUEST_TIMEOUT_MS > 14_000, 'the server caps each YouTube call at 7 s');
  assert.ok(FEED_RETRY.attempts >= 2, 'the first page is retried once');
});

/* ------------------------------------------------------- ISS provenance rule */
test('a last-known ISS fix is reported as cached, never as live telemetry', async () => {
  const { loadIss } = await import('../src/pages/home/homeData.ts');
  const originalFetch = globalThis.fetch;
  const respond = (body) => {
    globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const controller = new AbortController();
  try {
    respond({ success: true, data: { latitude: 1, longitude: 2, altitude: 400, velocity: 27000, timestamp: 1794643679000 } });
    assert.equal((await loadIss(controller.signal)).state, 'live');

    respond({ success: true, isFallback: true, data: { latitude: 1, longitude: 2, altitude: 400, velocity: 27000, timestamp: 1794643679000 } });
    const stale = await loadIss(controller.signal);
    assert.equal(stale.state, 'cached', 'old telemetry must not claim to be live');
    assert.match(stale.note ?? '', /last known/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/* --------------------------------------------------- useApiResource retrying */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://example.test/' });
const { window } = dom;
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'localStorage', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
}
globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { useApiResource } = await import('../src/hooks/useApiResource.ts');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function probe(loader, options) {
  const seen = [];
  function Probe() {
    const resource = useApiResource(loader, [], options);
    seen.push({ phase: resource.phase, data: resource.data });
    return null;
  }
  const host = window.document.createElement('div');
  window.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(Probe)); });
  const started = Date.now();
  while (seen.at(-1)?.phase === 'loading' && Date.now() - started < 6000) {
    await act(async () => { await sleep(30); });
  }
  await act(async () => { root.unmount(); });
  host.remove();
  return seen;
}

test('one retry turns a transient failure into data', async () => {
  let calls = 0;
  const seen = await probe(async () => {
    calls += 1;
    if (calls === 1) throw new Error('network');
    return { ok: true };
  }, { retries: 1 });
  assert.equal(calls, 2);
  assert.equal(seen.at(-1).phase, 'ready');
  assert.deepEqual(seen.at(-1).data, { ok: true });
});

test('retries stay opt-in, so a resource whose failure is the answer is asked once', async () => {
  let calls = 0;
  const seen = await probe(async () => {
    calls += 1;
    throw new Error('unavailable');
  }, {});
  assert.equal(calls, 1, 'default behaviour is unchanged');
  assert.equal(seen.at(-1).phase, 'error');
});

test('a persistent failure ends as an honest error after the bounded attempts', async () => {
  let calls = 0;
  const seen = await probe(async () => {
    calls += 1;
    throw new Error('still unavailable');
  }, { retries: 1 });
  assert.equal(calls, 2);
  assert.equal(seen.at(-1).phase, 'error');
});

test.after(() => { dom.window.close(); });
