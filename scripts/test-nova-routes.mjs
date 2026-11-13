/**
 * The four NOVA chat entry points must be one route, not four copies.
 *
 * They were three byte-identical Express handlers plus a fourth path
 * (`/api/nasa-ai`) that the rate limiter counted but nothing routed. The client
 * calls `/api/nasa-ai` first, so every ask spent a 404 before falling back.
 *
 * These tests hold the shape: all four paths answer identically, none 404s, and
 * only one place calls the chat handler.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-nova-routes.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PATHS = ['/api/nova/chat', '/api/openrouter/chat', '/api/chat', '/api/nasa-ai'];

async function withServer(run) {
  const { app } = await import('../server.ts');
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postChat(base, path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('every NOVA chat path is routed and answers identically', async () => {
  await withServer(async (base) => {
    const answers = [];
    for (const path of PATHS) {
      // An empty body is rejected by validation before any provider is touched,
      // so this needs no key and no network.
      const answer = await postChat(base, path, {});
      assert.notEqual(answer.status, 404, `${path} must be routed`);
      answers.push({ path, ...answer });
    }

    const [first, ...rest] = answers;
    assert.equal(first.status, 400, `expected a validation error, got ${first.status}`);
    assert.equal(first.body.code, 'INVALID_MESSAGES');
    for (const answer of rest) {
      assert.equal(answer.status, first.status, `${answer.path} status differs from ${first.path}`);
      assert.deepEqual(answer.body, first.body, `${answer.path} body differs from ${first.path}`);
    }
  });
});

test('a local-only request answers on every path without any provider key', async () => {
  // `provider: 'local'` is answered by the offline engine, so this exercises the
  // shared handler end to end with no credentials and no egress.
  await withServer(async (base) => {
    for (const path of PATHS) {
      const answer = await postChat(base, path, {
        provider: 'local',
        messages: [{ role: 'user', content: 'What is the ISS?' }],
        lang: 'en',
      });
      assert.equal(answer.status, 200, `${path} should answer locally, got ${answer.status}`);
      assert.equal(typeof answer.body.text, 'string');
      assert.ok(answer.body.text.length > 0, `${path} returned an empty answer`);
      assert.equal(answer.body.provider, 'NOVA Local Space Engine');
    }
  });
});

test('the chat handler is wired once, from the same set the limiter uses', () => {
  const source = readFileSync('server.ts', 'utf8');

  const calls = source.match(/handleNovaChatRequest\(\{/g) || [];
  assert.equal(calls.length, 1, `expected one handler, found ${calls.length} — the copies are back`);

  // The limiter and the routes must be the same list, or one of them will drift
  // again (that is exactly how /api/nasa-ai became rate-limited but unrouted).
  assert.match(source, /const NOVA_CHAT_PATHS = new Set\(\[[^\]]+\]\)/, 'the path list must exist');
  assert.match(source, /for \(const path of NOVA_CHAT_PATHS\) app\.post\(path, novaChatHandler\)/, 'routes must be registered from that list');

  const listed = /const NOVA_CHAT_PATHS = new Set\(\[([^\]]+)\]\)/.exec(source)[1]
    .split(',')
    .map((entry) => entry.trim().replace(/['"]/g, ''))
    .filter(Boolean);
  assert.deepEqual(listed.sort(), [...PATHS].sort(), 'the limiter list and the tested paths must match');
});

test('the client stops paying a 404 for a path the server never had', async () => {
  const client = readFileSync('lib/nasaApi.js', 'utf8');
  // Other functions in this file also declare `endpoints` (the NeoWs helper uses
  // template literals); askNasaAi's is the one that lists literal /api paths.
  const lists = [...client.matchAll(/const endpoints = (\[[^\]]+\])/g)].map((match) => match[1]);
  assert.ok(lists.length > 0, 'askNasaAi should list its endpoints');

  const literalLists = lists.filter((list) => list.includes("'/api/"));
  assert.ok(literalLists.length > 0, 'at least one endpoint list must use literal paths');
  assert.ok(
    literalLists.some((list) => list.includes("'/api/nasa-ai'")),
    'the client must call /api/nasa-ai — and the server must now route it',
  );
});
