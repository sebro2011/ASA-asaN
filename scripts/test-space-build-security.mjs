/** Build with a random, fake server credential and check it never enters artifacts or logs. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

async function filesBelow(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await filesBelow(full));
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

test('production build keeps server-only YouTube credentials out of logs and browser artifacts', { timeout: 120_000 }, async () => {
  // This randomly generated sentinel is not a real API key and is never printed.
  const sentinel = `unit-only-${randomBytes(24).toString('hex')}`;
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    env: { ...process.env, YOUTUBE_API_KEY: sentinel },
    encoding: 'utf8',
    timeout: 110_000
  });
  const output = `${build.stdout || ''}${build.stderr || ''}`;
  assert.equal(output.includes(sentinel), false, 'build logs must not contain the server credential');
  assert.equal(build.status, 0, 'production build must succeed');

  const clientFiles = await filesBelow(path.join(root, 'dist'));
  assert.ok(clientFiles.some((name) => name.endsWith('.js')), 'client build must contain JavaScript');
  for (const file of [...clientFiles, path.join(root, 'api/index.js')]) {
    const content = await readFile(file);
    const label = path.relative(root, file);
    assert.equal(content.includes(sentinel), false, `credential must not be embedded in ${label}`);
    if (file.startsWith(path.join(root, 'dist') + path.sep)) {
      assert.equal(content.includes('YOUTUBE_API_KEY'), false, `client artifact must not reference the server variable: ${label}`);
    }
  }
});

test('bundled Vercel Express adapter handles mocked YouTube search without leaking credentials', { timeout: 30_000 }, async () => {
  const sentinel = `unit-only-${randomBytes(24).toString('hex')}`;
  const originalKey = process.env.YOUTUBE_API_KEY;
  const originalFetch = globalThis.fetch;
  const originals = { log: console.log, warn: console.warn, error: console.error };
  const logs = [];
  const calls = [];
  let server;
  process.env.YOUTUBE_API_KEY = sentinel;
  for (const name of Object.keys(originals)) console[name] = (...args) => logs.push(args.map(String).join(' '));
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ path: parsed.pathname, urlContainsSecret: parsed.href.includes(sentinel), headerMatches: options?.headers?.['x-goog-api-key'] === sentinel });
    const payload = parsed.pathname.endsWith('/search')
      ? { items: [{ id: { videoId: 'v0000000001' } }] }
      : { items: [{
        id: 'v0000000001',
        snippet: { title: 'Mars astronomy', description: 'A look at the planet Mars.', channelTitle: 'Science creator', channelId: 'UC-other' },
        contentDetails: { duration: 'PT2M' },
        status: { embeddable: true, privacyStatus: 'public', uploadStatus: 'processed' }
      }] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const { default: app } = await import('../api/index.js');
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/space-videos?mode=shorts`);
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.equal(text.includes(sentinel), false, 'API response must not contain the server credential');
    const body = JSON.parse(text);
    assert.equal(body.source, 'youtube');
    assert.equal(body.items[0].id, 'v0000000001');
    assert.equal(body.items[0].portraitVerified, undefined);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => !call.urlContainsSecret && call.headerMatches));
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = originalKey;
    for (const name of Object.keys(originals)) console[name] = originals[name];
  }
  assert.equal(logs.some((line) => line.includes(sentinel)), false, 'server logs must not contain the credential');
});
