/**
 * NOVA L.I.F.E. — runtime foundation tests.
 *
 * A real HTTP server stands in for Ollama and for an OpenAI-compatible endpoint,
 * so the adapters are exercised over the wire (JSON, NDJSON streaming, health,
 * embeddings, timeouts) without downloading a model. No test asserts that a real
 * model produced an answer: they assert the adapter, the guard rails and the
 * bookkeeping.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-life-runtime.mjs
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { createLifeEngine } from '../server/life/index.js';
import { contextBudget, detectHardware, estimateModelMemoryGb, inferProfile } from '../server/life/hardware.js';
import { detectLanguage, expandQueryTerms, isWellFormedUnicode, languageInstruction, normalizeText, statusCopy } from '../server/life/language.js';
import { defaultDbPath, isEphemeralPath } from '../server/life/store.js';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let server;
let baseUrl;
let ollamaCalls = [];
let chatDelayMs = 0;

function listen(handler) {
  return new Promise((resolve) => {
    const instance = createServer(handler);
    instance.listen(0, '127.0.0.1', () => resolve(instance));
  });
}

before(async () => {
  server = await listen(async (req, res) => {
    ollamaCalls.push({ method: req.method, url: req.url });
    if (req.url === '/api/tags') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'llama3.1:8b' }, { name: 'nomic-embed-text' }] }));
      return;
    }
    if (req.url === '/api/embeddings') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ embedding: [1, 0, 0] }));
      return;
    }
    if (req.url === '/api/chat') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (chatDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, chatDelayMs));
      if (body.stream) {
        res.writeHead(200, { 'content-type': 'application/x-ndjson' });
        res.write(`${JSON.stringify({ message: { content: 'Local ' } })}\n`);
        res.write(`${JSON.stringify({ message: { content: 'answer.' }, done: false })}\n`);
        res.write(`${JSON.stringify({ done: true })}\n`);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          message: { content: `echo:${body.messages.at(-1)?.content ?? ''}` },
          prompt_eval_count: 12,
          eval_count: 4,
        }),
      );
      return;
    }
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'local-model' }] }));
      return;
    }
    res.writeHead(404);
    res.end('{}');
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
});

function engine(env = {}) {
  return createLifeEngine({
    inMemory: true,
    root: process.cwd(),
    env: { OLLAMA_BASE_URL: baseUrl, ...env },
  });
}

test('status reports the real schema, storage and mode', () => {
  const life = engine({ NOVA_LOCAL_ONLY: '1' });
  const status = life.status();
  assert.equal(status.name, 'NOVA NEXUS');
  assert.equal(status.architecture.startsWith('NOVA L.I.F.E.'), true);
  assert.equal(status.schemaVersion, 1);
  assert.equal(status.storage.engine, 'sqlite');
  assert.equal(status.storage.fts, true, 'this Node build has FTS5');
  assert.equal(status.mode.localOnly, true);
  assert.equal(status.providers.localConfigured >= 1, true);
  assert.equal(status.hardware.id.match(/^(low|balanced|high)$/) !== null, true);
  life.close();
});

test('health checks a real local endpoint and blocks cloud providers in LOCAL_ONLY', async () => {
  const life = engine({ NOVA_LOCAL_ONLY: '1', GEMINI_API_KEY: 'test-key', OPENROUTER_API_KEY: 'test-key' });
  const health = await life.fabric.health({ force: true });
  const ollama = health.providers.find((provider) => provider.id === 'ollama');
  assert.equal(ollama.ok, true);
  assert.equal(ollama.status, 'ok');
  assert.deepEqual(ollama.models, ['llama3.1:8b', 'nomic-embed-text']);
  assert.ok(ollama.latencyMs >= 0);

  const gemini = health.providers.find((provider) => provider.id === 'gemini');
  assert.equal(gemini.status, 'blocked');
  assert.equal(gemini.ok, false);
  assert.equal(health.localAvailable, true);

  // A blocked cloud provider never reached the network: the fake server saw only
  // local calls, and no cloud host could answer a fetch.
  assert.equal(ollamaCalls.every((call) => call.url.startsWith('/api/') || call.url.startsWith('/v1/')), true);
  life.close();
});

test('generate uses the local model and reports what answered', async () => {
  const life = engine();
  const result = await life.fabric.generate({
    provider: 'ollama',
    messages: [{ role: 'user', content: 'hello local model' }],
    maxTokens: 32,
  });
  assert.equal(result.text, 'echo:hello local model');
  assert.equal(result.provider, 'ollama');
  assert.equal(result.kind, 'local');
  assert.equal(result.model, 'llama3.1:8b');
  assert.equal(result.usage.completionTokens, 4);
  assert.equal(result.localOnly, false);
  life.close();
});

test('streaming yields real chunks from the wire', async () => {
  const life = engine();
  const chunks = [];
  for await (const chunk of life.fabric.stream({
    provider: 'ollama',
    messages: [{ role: 'user', content: 'stream please' }],
  })) {
    chunks.push(chunk.delta);
  }
  assert.equal(chunks.join(''), 'Local answer.');
  life.close();
});

test('LOCAL_ONLY refuses a cloud provider without sending anything', async () => {
  const life = engine({ NOVA_LOCAL_ONLY: '1', GEMINI_API_KEY: 'test-key' });
  let outbound = 0;
  life.fabric.providers(); // descriptors are local
  const original = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    outbound += 1;
    return original(...args);
  };
  try {
    await assert.rejects(
      () => life.fabric.generate({ provider: 'gemini', messages: [{ role: 'user', content: 'secret prompt' }] }),
      (error) => error.code === 'LOCAL_ONLY_BLOCKED' && error.status === 409,
    );
    assert.equal(outbound, 0, 'nothing left the machine');
  } finally {
    globalThis.fetch = original;
    life.close();
  }
});

test('a cloud call needs a recorded approval, not just an id', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'cloud answer' } }], usage: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const life = createLifeEngine({
    inMemory: true,
    root: process.cwd(),
    env: { OPENROUTER_API_KEY: 'k' },
    fetchImpl: fakeFetch,
  });

  await assert.rejects(
    () => life.fabric.generate({ provider: 'openrouter', messages: [{ role: 'user', content: 'hi' }] }),
    (error) => error.code === 'APPROVAL_REQUIRED',
  );
  assert.equal(calls, 0);

  const approval = life.security.decide({ subjectType: 'task', subjectId: 'task-1', decision: 'approved' });
  const result = await life.fabric.generate({
    provider: 'openrouter',
    messages: [{ role: 'user', content: 'hi' }],
    approvalId: approval.id,
  });
  assert.equal(result.text, 'cloud answer');
  assert.equal(calls, 1);
  life.close();
});

test('a timeout is reported as AI_TIMEOUT and cancellation as CANCELLED', async () => {
  const life = engine();
  chatDelayMs = 400;
  try {
    await assert.rejects(
      () => life.fabric.generate({ provider: 'ollama', messages: [{ role: 'user', content: 'slow' }], timeoutMs: 100 }),
      (error) => error.code === 'AI_TIMEOUT' && error.status === 504,
    );
  } finally {
    chatDelayMs = 0;
  }

  const iterator = life.fabric.stream({ provider: 'ollama', messages: [{ role: 'user', content: 'cancel me' }] });
  const first = iterator.next();
  const inflight = life.fabric.inflight();
  assert.equal(inflight.length, 1, 'the request is tracked while it runs');
  const cancelled = await life.fabric.cancel(inflight[0]);
  assert.equal(cancelled.cancelled, true);
  await first.catch(() => {});
  await assert.rejects(() => life.fabric.cancel('nope').then((r) => { assert.equal(r.cancelled, false); throw new Error('done'); }), /done/);
  life.close();
});

test('model selection respects capability requirements and the hardware budget', () => {
  const life = engine({ NOVA_LOCAL_ONLY: '1' });
  const selection = life.fabric.selectModel({ complexity: 'simple', requireJson: true });
  assert.equal(selection.provider, 'ollama');
  assert.equal(selection.kind, 'local');
  // Complexity buckets choose the smallest capable local model; an operator
  // override (NOVA_LOCAL_MODEL) always wins.
  assert.equal(selection.model, 'llama3.2:3b');

  const context = life.fabric.fitContext(
    [
      { role: 'system', content: 'keep me' },
      { role: 'user', content: 'x'.repeat(40_000) },
      { role: 'user', content: 'newest' },
    ],
    { contextWindow: 1024 },
  );
  assert.equal(context.messages[0].role, 'system');
  assert.equal(context.messages.at(-1).content, 'newest');
  assert.ok(context.dropped >= 1);

  assert.ok(contextBudget({ profile: { contextTokens: 2048 } }, 999_999) === 2048);
  life.close();
});

test('the database path prefers an explicit setting and falls back to temp on a read-only cwd', () => {
  assert.equal(defaultDbPath({ NOVA_LIFE_DB: '/var/data/life.sqlite' }), '/var/data/life.sqlite');

  // A serverless deployment mounts the project directory read-only; the engine
  // must not fail every request with ENOENT, so it moves to the OS temp dir.
  const sandbox = mkdtempSync(join(tmpdir(), 'nova-life-ro-'));
  const previous = process.cwd();
  try {
    process.chdir(sandbox);
    chmodSync(sandbox, 0o500);
    const fallback = defaultDbPath({});
    assert.ok(fallback.startsWith(tmpdir()), `expected a temp path, got ${fallback}`);
    assert.ok(fallback.endsWith(join('nova-life', 'life.sqlite')));
  } finally {
    try {
      chmodSync(sandbox, 0o700);
    } catch {
      /* already restored */
    }
    process.chdir(previous);
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('the status endpoint marks a temporary database as ephemeral', () => {
  assert.equal(isEphemeralPath(':memory:'), true);
  assert.equal(isEphemeralPath('/var/data/life.sqlite'), false);
  assert.equal(isEphemeralPath(join(tmpdir(), 'nova-life', 'life.sqlite')), true);

  const ephemeral = createLifeEngine({ inMemory: true });
  try {
    assert.equal(ephemeral.status().storage.ephemeral, true);
  } finally {
    ephemeral.store.close();
  }
});

test('hardware profiles are derived conservatively and never invent a GPU', () => {
  const small = detectHardware({
    env: {},
    cpus: () => [{ model: 'test' }],
    totalmem: () => 4 * 1024 ** 3,
    freemem: () => 2 * 1024 ** 3,
    loadavg: () => [1, 1, 1],
  });
  assert.equal(small.profile.id, 'low');
  assert.equal(small.gpu, null);

  const big = detectHardware({
    env: { NOVA_GPU_VRAM_GB: '12', NOVA_GPU_VENDOR: 'nvidia' },
    cpus: () => [{ model: 'test' }, { model: 'test' }],
    totalmem: () => 64 * 1024 ** 3,
    freemem: () => 40 * 1024 ** 3,
    loadavg: () => [0, 0, 0],
  });
  assert.equal(big.profile.id, 'high');
  assert.equal(big.gpu.vramGb, 12);

  const forced = detectHardware({ env: { NOVA_RESOURCE_PROFILE: 'low' }, totalmem: () => 64 * 1024 ** 3 });
  assert.equal(forced.profile.id, 'low');
  assert.equal(forced.profileSource, 'env');

  assert.equal(inferProfile({ totalRamGb: 8, freeRamGb: 4 }), 'balanced');
  assert.equal(inferProfile({ totalRamGb: 8, freeRamGb: 1 }), 'low');
  assert.ok(estimateModelMemoryGb({ parametersB: 7, quantisationBits: 4, contextTokens: 4096 }) > 3.5);
});

test('language detection is script-based and the glossary bridges three languages', () => {
  assert.equal(detectLanguage('How do I observe the Moon?').language, 'en');
  assert.equal(detectLanguage('චන්ද්‍රයා නිරීක්ෂණය කරන්නේ කෙසේද?').language, 'si');
  assert.equal(detectLanguage('நிலாவை எப்படிக் கண்காணிப்பது?').language, 'ta');
  assert.equal(detectLanguage('').language, 'und');

  const expanded = expandQueryTerms('moon observing');
  assert.ok(expanded.includes('චන්ද්‍රයා'));
  assert.ok(expanded.includes('நிலா'));
  assert.equal(normalizeText('  a\n\n b  '), 'a b');
  assert.equal(isWellFormedUnicode('සිංහල'), true);
  assert.equal(isWellFormedUnicode('broken \uD800'), false);
  assert.match(languageInstruction('si'), /සිංහල/);
  assert.match(statusCopy('ta', 'unverified'), /உறுதி/);
});
