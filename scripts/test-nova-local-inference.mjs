import test from 'node:test';
import assert from 'node:assert/strict';
import { createNovaChatHandler, getNovaPublicConfig } from '../server/novaChat.js';
import {
  createNovaLocalInference,
  getNovaLocalInferenceConfig,
  isLoopbackModelEndpoint,
} from '../server/novaLocalInference.js';
import { createDiagnosticsHandler } from '../server/novaDiagnostics.js';

const LOCAL_ENV = {
  NOVA_CHAT_LOCAL_PROVIDER: 'ollama',
  NOVA_LOCAL_MODEL: 'operator-selected-model',
  OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
  // These credentials must not affect or be used by explicit Local mode.
  OPENROUTER_API_KEY: 'sk-or-local-test-secret',
  GEMINI_API_KEY: 'gemini-local-test-secret',
  ARENA_API_KEY: 'arena-local-test-secret',
};

function okResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

test('local inference requires an operator-selected model and does not choose a default size', () => {
  const config = getNovaLocalInferenceConfig({ env: {} });
  assert.deepEqual(config, {
    mode: 'deterministic',
    configured: false,
    provider: null,
    model: null,
    code: 'LOCAL_MODEL_NOT_CONFIGURED',
    status: 0,
  });
});

test('only literal loopback model endpoints pass the local boundary', () => {
  for (const url of [
    'http://127.0.0.1:11434',
    'http://127.20.4.8:8080/v1',
    'https://[::1]:8080',
  ]) assert.equal(isLoopbackModelEndpoint(url), true, url);

  for (const url of [
    'https://api.example.com/v1',
    'http://localhost:11434',
    'http://192.168.1.10:11434',
    'http://127.0.0.1:11434?api_key=secret',
    'http://user:password@127.0.0.1:11434',
    'ftp://127.0.0.1:11434',
  ]) assert.equal(isLoopbackModelEndpoint(url), false, url);
});

test('the shared L.I.F.E. fabric sends local inference only to the selected loopback runtime', async () => {
  const requests = [];
  const runtime = createNovaLocalInference({
    env: LOCAL_ENV,
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init, body: JSON.parse(init.body) });
      return okResponse({ message: { content: 'Local runtime answer.' }, prompt_eval_count: 11 });
    },
  });

  const answer = await runtime.generate({
    messages: [
      { role: 'system', content: 'system instruction' },
      { role: 'user', content: 'First turn' },
      { role: 'assistant', content: 'Earlier answer' },
      { role: 'user', content: 'Follow-up turn' },
    ],
    timeoutMs: 1200,
  });

  assert.equal(answer.ok, true);
  assert.equal(answer.provider, 'Ollama (local)');
  assert.equal(answer.model, 'operator-selected-model');
  assert.equal(answer.text, 'Local runtime answer.');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(requests[0].init.redirect, 'manual', 'a local server cannot redirect chat to a remote host');
  assert.equal(requests[0].body.model, 'operator-selected-model');
  assert.deepEqual(requests[0].body.messages.map((message) => message.content), [
    'system instruction', 'First turn', 'Earlier answer', 'Follow-up turn',
  ]);
  assert.equal(JSON.stringify(requests[0].init.headers).includes('sk-or-local-test-secret'), false);
  assert.equal(requests.every((request) => new URL(request.url).hostname === '127.0.0.1'), true);
});

test('the local-only fabric instance receives an allowlisted environment, not hosted credentials', async () => {
  let fabricOptions;
  const env = {
    ...LOCAL_ENV,
    OPENAI_COMPAT_API_KEY: 'local-key-not-used-by-ollama',
    NOVA_RESOURCE_PROFILE: 'balanced',
    OPENROUTER_BASE_URL: 'https://hosted.example.com',
  };
  const runtime = createNovaLocalInference({
    env,
    createFabric: (options) => {
      fabricOptions = options;
      return {
        generate: async ({ provider, model }) => ({
          kind: 'local', provider, model, text: 'Captured local result.',
        }),
      };
    },
  });

  const answer = await runtime.generate({ messages: [{ role: 'user', content: 'local only' }] });
  assert.equal(answer.ok, true);
  assert.equal(fabricOptions.env.NOVA_LOCAL_ONLY, '1');
  assert.equal(fabricOptions.env.NOVA_LOCAL_MODEL, 'operator-selected-model');
  for (const key of ['OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'ARENA_API_KEY', 'OPENROUTER_BASE_URL']) {
    assert.equal(Object.hasOwn(fabricOptions.env, key), false, `${key} must not enter the local fabric`);
  }
  assert.equal(Object.hasOwn(fabricOptions.env, 'OPENAI_COMPAT_API_KEY'), false,
    'a local server key is only passed to the OpenAI-compatible adapter that needs it');
});

test('the OpenAI-compatible adapter uses only its selected loopback runtime and local credential', async () => {
  let request;
  const runtime = createNovaLocalInference({
    env: {
      ...LOCAL_ENV,
      NOVA_CHAT_LOCAL_PROVIDER: 'openai-compatible',
      OPENAI_COMPAT_BASE_URL: 'http://127.0.0.1:1234/v1',
      OPENAI_COMPAT_API_KEY: 'local-runtime-only-key',
    },
    fetchImpl: async (url, init) => {
      request = { url: String(url), init, body: JSON.parse(init.body) };
      return okResponse({ choices: [{ message: { content: 'Compatible local answer.' } }] });
    },
  });

  const answer = await runtime.generate({ messages: [{ role: 'user', content: 'hello' }] });
  assert.equal(answer.ok, true);
  assert.equal(answer.provider, 'OpenAI-compatible local runtime');
  assert.equal(request.url, 'http://127.0.0.1:1234/v1/chat/completions');
  assert.equal(request.init.headers.authorization, 'Bearer local-runtime-only-key');
  assert.equal(request.init.redirect, 'manual');
  assert.equal(request.body.model, 'operator-selected-model');
  assert.equal(request.url.includes(LOCAL_ENV.OPENROUTER_API_KEY), false);
  assert.equal(request.init.headers.authorization.includes(LOCAL_ENV.GEMINI_API_KEY), false);
});

test('llama.cpp adapter uses the operator alias and accepts IPv6 loopback only', async () => {
  let request;
  const runtime = createNovaLocalInference({
    env: {
      ...LOCAL_ENV,
      NOVA_CHAT_LOCAL_PROVIDER: 'llama-cpp',
      NOVA_LOCAL_MODEL: '',
      LLAMA_CPP_MODEL: 'operator-llama-alias',
      LLAMA_CPP_ENABLED: '1',
      LLAMA_CPP_BASE_URL: 'http://[::1]:8080',
    },
    fetchImpl: async (url, init) => {
      request = { url: String(url), init, body: JSON.parse(init.body) };
      return okResponse({ choices: [{ message: { content: 'llama.cpp answer.' } }] });
    },
  });

  const answer = await runtime.generate({ messages: [{ role: 'user', content: 'hello' }] });
  assert.equal(answer.ok, true);
  assert.equal(answer.provider, 'llama.cpp (local)');
  assert.equal(answer.model, 'operator-llama-alias');
  assert.equal(request.url, 'http://[::1]:8080/v1/chat/completions');
  assert.equal(request.body.model, 'operator-llama-alias');
  assert.equal(request.init.redirect, 'manual');
});

test('a remote endpoint is rejected before any fetch, even when a model id is configured', async () => {
  let calls = 0;
  const runtime = createNovaLocalInference({
    env: { ...LOCAL_ENV, OLLAMA_BASE_URL: 'https://hosted.example.com:443' },
    fetchImpl: async () => { calls += 1; throw new Error('must not fetch'); },
  });
  const answer = await runtime.generate({ messages: [{ role: 'user', content: 'private prompt' }] });
  assert.equal(answer.ok, false);
  assert.equal(answer.attempted, false);
  assert.equal(answer.code, 'LOCAL_MODEL_REMOTE_BLOCKED');
  assert.equal(answer.status, 403);
  assert.equal(calls, 0);
});

test('explicit Local uses full chat context and never reads or calls hosted providers', async () => {
  const localCalls = [];
  let hostedFetchCalls = 0;
  let hostedKeyReads = 0;
  const runtime = createNovaLocalInference({
    env: LOCAL_ENV,
    fetchImpl: async (url, init) => {
      localCalls.push({ url: String(url), body: JSON.parse(init.body) });
      return okResponse({
        message: {
          content: 'The station orbits Earth.\nSUGGESTIONS: [How fast does it travel?] | [How high is its orbit?]',
        },
      });
    },
  });
  const handler = createNovaChatHandler({
    localInference: runtime,
    fetchImpl: async () => { hostedFetchCalls += 1; throw new Error('hosted fetch is forbidden'); },
    getOpenRouterApiKey: () => { hostedKeyReads += 1; return LOCAL_ENV.OPENROUTER_API_KEY; },
    getGeminiApiKey: () => { hostedKeyReads += 1; return LOCAL_ENV.GEMINI_API_KEY; },
    getArenaApiKey: () => { hostedKeyReads += 1; return LOCAL_ENV.ARENA_API_KEY; },
  });

  const response = await handler({
    body: {
      provider: 'local',
      lang: 'en',
      messages: [
        { role: 'user', content: 'Tell me about the ISS.' },
        { role: 'assistant', content: 'It is an orbital laboratory.' },
        { role: 'user', content: 'How fast does it orbit?' },
      ],
    },
    ip: 'local-runtime-test',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.provider, 'Ollama (local)');
  assert.equal(response.body.model, 'operator-selected-model');
  assert.equal(response.body.text, 'The station orbits Earth.');
  assert.deepEqual(response.body.suggestions, ['How fast does it travel?', 'How high is its orbit?']);
  assert.equal(response.body.fallback, false);
  assert.equal(localCalls.length, 1);
  assert.equal(localCalls[0].body.messages.length, 4, 'system prompt plus every bounded user/assistant turn');
  assert.match(localCalls[0].body.messages[0].content, /Language preference/);
  assert.equal(hostedFetchCalls, 0);
  assert.equal(hostedKeyReads, 0, 'explicit Local does not even read hosted-provider keys');
  assert.equal(JSON.stringify(response).includes(LOCAL_ENV.GEMINI_API_KEY), false);
  assert.equal(JSON.stringify(response).includes(LOCAL_ENV.OPENROUTER_API_KEY), false);
});

test('local runtime failure falls back only to the deterministic engine, never a hosted provider', async () => {
  let hostedFetchCalls = 0;
  const runtime = createNovaLocalInference({
    env: LOCAL_ENV,
    fetchImpl: async () => { throw new TypeError('fetch failed: ECONNREFUSED 127.0.0.1'); },
  });
  const handler = createNovaChatHandler({
    localInference: runtime,
    getOpenRouterApiKey: () => LOCAL_ENV.OPENROUTER_API_KEY,
    getGeminiApiKey: () => LOCAL_ENV.GEMINI_API_KEY,
    getArenaApiKey: () => LOCAL_ENV.ARENA_API_KEY,
    fetchImpl: async () => { hostedFetchCalls += 1; throw new Error('hosted provider must not be tried'); },
  });
  const response = await handler({
    body: { provider: 'local', lang: 'en', messages: [{ role: 'user', content: 'What does JWST study?' }] },
    ip: 'local-runtime-failure-test',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.provider, 'NOVA Local Space Engine');
  assert.equal(response.body.model, 'nasa-local-engine');
  assert.equal(response.body.fallback, true);
  assert.deepEqual(response.body.fallbackChain, [
    { provider: 'Local model runtime', code: 'PROVIDER_UNREACHABLE', status: 503 },
  ]);
  assert.equal(hostedFetchCalls, 0);
  assert.equal(JSON.stringify(response).includes('ECONNREFUSED'), false);
  assert.equal(JSON.stringify(response).includes(LOCAL_ENV.OPENROUTER_API_KEY), false);
});

test('public config and diagnostics expose safe local-runtime identity, not URLs or credentials', async () => {
  const env = {
    ...LOCAL_ENV,
    OPENAI_COMPAT_API_KEY: 'local-runtime-secret-key',
  };
  const config = getNovaPublicConfig({ env });
  assert.deepEqual(config.localInference, {
    mode: 'local-model',
    configured: true,
    provider: 'ollama',
    model: 'operator-selected-model',
    code: 'OK',
  });
  assert.equal(JSON.stringify(config).includes('127.0.0.1'), false);
  assert.equal(JSON.stringify(config).includes('local-runtime-secret-key'), false);
  assert.equal(JSON.stringify(config).includes(LOCAL_ENV.OPENROUTER_API_KEY), false);

  let fetchCalls = 0;
  const diagnostics = await createDiagnosticsHandler({
    env,
    fetchImpl: async () => { fetchCalls += 1; throw new Error('not probing'); },
  })({ probe: false });
  assert.equal(diagnostics.providers.local.provider, 'ollama (local)');
  assert.equal(diagnostics.providers.local.status, 'configured', 'not a reachability claim');
  assert.equal(diagnostics.localInference.code, 'OK');
  assert.equal(JSON.stringify(diagnostics).includes('127.0.0.1'), false);
  assert.equal(JSON.stringify(diagnostics).includes('local-runtime-secret-key'), false);
  assert.equal(fetchCalls, 0, 'shallow config and diagnostics do not probe local or hosted endpoints');
});
