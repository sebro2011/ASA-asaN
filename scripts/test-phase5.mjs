import test from 'node:test';
import assert from 'node:assert/strict';

// Pure import/export helpers — no browser APIs, no secrets.
import {
  NOVA_EXPORT_VERSION,
  buildNovaExportPayload,
  parseNovaImportFile
} from '../lib/novaExport.js';

// YouTube ID extraction + watch-page duration parsing — server-side, no keys.
import { extractYouTubeId, parseYoutubeDuration } from '../server.ts';

test('extractYouTubeId parses all public YouTube URL shapes', () => {
  assert.equal(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeId('https://www.youtube.com/v/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeId('https://example.com/not-youtube'), null);
  assert.equal(extractYouTubeId(''), null);
  assert.equal(extractYouTubeId('https://www.youtube.com/watch'), null);
});

test('parseYoutubeDuration reads lengthSeconds from watch page variants', () => {
  assert.equal(
    parseYoutubeDuration('ytInitialPlayerResponse = {"videoDetails":{"lengthSeconds":"360"}};'),
    360
  );
  assert.equal(parseYoutubeDuration('ytInitialPlayerResponse = {"videoDetails":{"lengthSeconds":42}};'), 42);
  assert.equal(
    parseYoutubeDuration('... "microformat":{"playerMetadata":{"lengthSeconds":"123"}} ...'),
    123
  );
  assert.equal(parseYoutubeDuration('<html><body>no player here</body></html>'), null);
  assert.equal(parseYoutubeDuration('ytInitialPlayerResponse = {};'), null);
});

test('buildNovaExportPayload creates a bounded, secret-free payload', () => {
  const messages = [
    { role: 'user', content: 'What is a black hole?' },
    { role: 'assistant', content: 'A region of spacetime...' },
    { role: 'assistant', content: 'leaked-secret', extra: 'ignored' }
  ];
  const payload = buildNovaExportPayload({ messages, language: 'si', model: 'gemini' });
  assert.equal(payload.version, NOVA_EXPORT_VERSION);
  assert.equal(payload.source, 'nova-ai');
  assert.equal(payload.language, 'si');
  assert.equal(payload.model, 'gemini');
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(payload.exportedAt));
  assert.equal(payload.messages.length, 3);
  assert.equal(payload.messages[0].role, 'user');
  assert.equal(payload.messages[2].extra, undefined);
  assert.equal(payload.messages[0].content, 'What is a black hole?');
  assert.equal(payload.messages[1].content, 'A region of spacetime...');
  assert.equal(payload.messages[1].extra, undefined);
});

test('parseNovaImportFile accepts valid files and rejects invalid ones', () => {
  const good = JSON.stringify({
    version: NOVA_EXPORT_VERSION,
    exportedAt: '2026-10-29T00:00:00.000Z',
    source: 'nova-ai',
    language: 'ta',
    model: 'local',
    messages: [{ role: 'user', content: 'வணக்கம்' }]
  });
  const { messages, language, model } = parseNovaImportFile(good);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].content, 'வணக்கம்');
  assert.equal(language, 'ta');
  assert.equal(model, 'local');

  assert.throws(() => parseNovaImportFile('not json'), SyntaxError);
  assert.throws(() => parseNovaImportFile(JSON.stringify({ version: 99, messages: [] })), /Invalid NOVA conversation/);
  assert.throws(() => parseNovaImportFile(JSON.stringify({ version: NOVA_EXPORT_VERSION, messages: [] })), /No messages/);
  assert.throws(() => parseNovaImportFile(JSON.stringify({ version: NOVA_EXPORT_VERSION, messages: [{ role: 'hacker', content: 'x' }] })), /No messages/);
});

test('/api/youtube/meta rejects bad input and reports fetch failures', async () => {
  // eslint-disable-next-line no-unused-vars
  const { app } = await import('../server.ts');

  let server;
  try {
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;

    async function request(path) {
      const response = await fetch(base + path);
      return { statusCode: response.status, body: await response.json() };
    }

    const missing = await request('/api/youtube/meta');
    assert.equal(missing.statusCode, 400);
    assert.equal(missing.body.code, 'missing-url');

    const invalid = await request('/api/youtube/meta?url=not-a-youtube-url');
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.body.code, 'invalid-url');

    // No outbound network to YouTube in this sandbox: a valid URL must surface a
    // verification failure rather than fabricate a duration.
    const valid = await request('/api/youtube/meta?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ');
    assert.equal(valid.statusCode, 404);
    assert.equal(valid.body.videoId, 'dQw4w9WgXcQ');
    assert.ok(valid.body.code);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
  }
});
