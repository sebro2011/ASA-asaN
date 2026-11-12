/**
 * NASA archive client contract — an outage must not look like "no results".
 *
 * Before this fix `fetchNasaArchive` caught every failure and returned
 * `{ success: true, articles: [], total: 0 }`, so an unreachable upstream rendered
 * the neutral "No Historical Discoveries Found" empty state. The panel now shows
 * an error with a retry, and this suite pins the client half of that contract.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-nasa-archive-client.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { fetchNasaArchive, clearNasaApiCache } = await import('../lib/nasaApi.js');

const realFetch = globalThis.fetch;

function stub(mode) {
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (mode === 'offline') throw new TypeError('fetch failed');
    if (mode === 'abort') {
      const error = new Error('The operation was aborted.');
      error.name = 'AbortError';
      throw error;
    }
    if (mode === 'unavailable') {
      return new Response(
        JSON.stringify({ success: false, code: 'UPSTREAM_UNAVAILABLE', error: 'The NASA Images API answered 503.' }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({
        success: true,
        articles: [
          {
            id: 'PIA12345',
            nasaId: 'PIA12345',
            title: 'Real record',
            thumbnail: 'https://images-assets.nasa.gov/image/PIA12345/PIA12345~thumb.jpg',
            detailsUrl: 'https://images.nasa.gov/details/PIA12345',
          },
        ],
        total: 1,
        hasMore: false,
        source: 'NASA Images (images.nasa.gov)',
        fetchedAt: '2026-11-12T10:00:00.000Z',
        cached: false,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  return calls;
}

test('the archive always searches NASA Images, even with no term typed', async () => {
  clearNasaApiCache();
  const calls = stub('ok');
  const result = await fetchNasaArchive({ q: '', page: 1, limit: 8 });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/api\/nasa-archive\?/);
  assert.match(calls[0], /q=NASA/);
  assert.equal(result.success, true);
  assert.equal(result.articles[0].nasaId, 'PIA12345');
  globalThis.fetch = realFetch;
});

test('an upstream failure is reported as a failure, never as an empty success', async () => {
  for (const [mode, code] of [
    ['unavailable', 'UPSTREAM_UNAVAILABLE'],
    ['offline', 'NETWORK_ERROR'],
    ['abort', 'TIMEOUT'],
  ]) {
    clearNasaApiCache();
    stub(mode);
    const result = await fetchNasaArchive({ q: `query-${mode}`, page: 1, limit: 8 });
    assert.equal(result.success, false, mode);
    assert.equal(result.code, code, mode);
    assert.ok(result.error && result.error.length > 0, `${mode} carries a human message`);
    assert.deepEqual(result.articles, []);
  }
  globalThis.fetch = realFetch;
});

test('a successful search is cached, a failed one is not', async () => {
  clearNasaApiCache();
  stub('ok');
  await fetchNasaArchive({ q: 'cached-ok', page: 1, limit: 8 });
  const before = stub('ok');
  const cached = await fetchNasaArchive({ q: 'cached-ok', page: 1, limit: 8 });
  assert.equal(before.length, 0, 'the cached success spared the network');
  assert.equal(cached.success, true);

  clearNasaApiCache();
  stub('offline');
  const failed = await fetchNasaArchive({ q: 'cached-fail', page: 1, limit: 8 });
  assert.equal(failed.success, false);
  const retryCalls = stub('ok');
  const retried = await fetchNasaArchive({ q: 'cached-fail', page: 1, limit: 8 });
  assert.equal(retryCalls.length, 1, 'a failure is retried rather than cached');
  assert.equal(retried.success, true);
  globalThis.fetch = realFetch;
});

test('no fabricated identifiers survive in the client API module', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../lib/nasaApi.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /PIA25000|PIA25001/, 'the mock PIA ids are gone');
  assert.doesNotMatch(source, /nasa-\$\{Math\.random\(\)\}/, 'no random id is ever generated');
  assert.doesNotMatch(source, /export async function fetchMarsPhotos/, 'the dead client-side Mars call is gone');
  assert.doesNotMatch(source, /export async function searchNasaMedia/, 'the dead browser-side media search is gone');
});
