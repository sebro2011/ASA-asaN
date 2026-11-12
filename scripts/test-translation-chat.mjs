import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { setupNasaRoutes, translationCache } from '../server/nasaRoutes.ts';
import { historyWindow } from '../src/workspace/chat/chatClient.ts';
import { clearNasaApiCache, translateSpaceContent, askNasaAi } from '../lib/nasaApi.js';

const realFetch = globalThis.fetch;

test('translation validates input, caches by complete content, and fails closed', async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'unit-only-secret';
  translationCache.clear();
  let calls = 0;
  let fail = false;
  let invalid = false;
  const ai = { models: { generateContent: async () => {
    calls += 1;
    if (fail) throw new Error('provider unavailable');
    if (invalid) return { text: JSON.stringify({ title: 'x', explanation: {} }) };
    return { text: JSON.stringify({ title: `translated ${calls}`, explanation: 'translated text' }) };
  } } };
  const app = express(); app.use(express.json()); setupNasaRoutes(app, ai);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = body => realFetch(base + '/api/translate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await post({ title: {}, explanation: 'x', targetLang: 'si' })).status, 400);
    assert.equal((await post({ title: 'x', explanation: 'x', targetLang: 'other' })).status, 400);
    const original = await (await post({ title: 'Earth', explanation: 'English', targetLang: 'en' })).json();
    assert.equal(original.provider, 'original');
    assert.equal(calls, 0);
    const one = { title: 'Same title', explanation: 'First article', targetLang: 'si' };
    const first = await (await post(one)).json();
    assert.equal(first.provider, 'gemini');
    assert.equal((await (await post(one)).json()).cached, true);
    const second = await (await post({ ...one, explanation: 'Second article' })).json();
    assert.notEqual(second.data.title, first.data.title);
    assert.equal(calls, 2);
    fail = true;
    const failed = await post({ ...one, title: 'New title' });
    assert.equal(failed.status, 503);
    const body = await failed.json();
    assert.equal(body.code, 'TRANSLATION_UNAVAILABLE');
    assert.equal(body.data, undefined);
    assert.equal(JSON.stringify(body).includes('unit-only-secret'), false);
    fail = false;
    invalid = true;
    const malformed = await post({ ...one, title: 'Malformed output' });
    assert.equal(malformed.status, 503);
    assert.equal((await malformed.json()).code, 'TRANSLATION_UNAVAILABLE');
    delete process.env.GEMINI_API_KEY;
    assert.equal((await post({ ...one, title: 'Unconfigured title' })).status, 503);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous;
    translationCache.clear();
    await new Promise(resolve => server.close(resolve));
  }
});

test('translation client refuses an old unlabelled fallback and keys cache by entire text', async () => {
  clearNasaApiCache();
  let calls = 0;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: { title: 'partial', explanation: 'fake' } }), { status: 200 });
    assert.equal(await translateSpaceContent('Title', 'Text', 'si'), null);
    globalThis.fetch = async () => { calls += 1; return new Response(JSON.stringify({ provider: 'gemini', data: { title: `result ${calls}`, explanation: 'translation' } }), { status: 200 }); };
    const first = await translateSpaceContent('Same title', 'Text 1', 'si');
    const second = await translateSpaceContent('Same title', 'Text 2', 'si');
    assert.notEqual(first.title, second.title);
    await translateSpaceContent('Same title', 'Text 1', 'si');
    assert.equal(calls, 2);
  } finally { globalThis.fetch = realFetch; clearNasaApiCache(); }
});

test('legacy AI fallback uses local engine and does not invent NASA telemetry', async () => {
  globalThis.fetch = async () => new Response('', { status: 503 });
  try {
    const reply = await askNasaAi('unrecognized xyzzy question', 'en');
    assert.equal(reply.provider, 'NOVA Local Space Engine');
    assert.equal(reply.fallback, true);
    assert.doesNotMatch(reply.text, /NASA Astrophysics telemetry confirms/);
  } finally { globalThis.fetch = realFetch; }
});

test('NOVA history respects message, unicode byte and serialized size limits', () => {
  const turns = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i}` }));
  turns.push({ role: 'user', content: 'latest' });
  const result = historyWindow(turns);
  assert.equal(result.length, 12);
  assert.equal(result.at(-1).content, 'latest');
  const unicode = Array.from({ length: 12 }, (_, i) => ({ role: i === 11 ? 'user' : 'assistant', content: 'ක'.repeat(3000) }));
  const bounded = historyWindow(unicode);
  assert.ok(new TextEncoder().encode(bounded.map(item => item.content).join('')).length <= 20 * 1024);
  const escaped = Array.from({ length: 12 }, (_, i) => ({ role: i === 11 ? 'user' : 'assistant', content: '\\'.repeat(3500) }));
  assert.ok(new TextEncoder().encode(JSON.stringify(historyWindow(escaped))).length <= 23 * 1024);
  const longUser = { role: 'user', content: 'x'.repeat(4001) };
  assert.equal(historyWindow([longUser])[0].content, longUser.content, 'the server validates the user turn without silent truncation');
});

test('Express translation route rate limits requests', async () => {
  const { app } = await import('../server.ts');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let response;
    for (let i = 0; i < 16; i++) {
      response = await realFetch(base + '/api/translate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'a', explanation: 'b', targetLang: 'en' }) });
    }
    assert.equal(response.status, 429);
    assert.equal((await response.json()).code, 'rate-limit');
    assert.ok(response.headers.get('retry-after'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
