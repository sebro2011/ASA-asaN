import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_BASE_URL,
  createNovaChatHandler,
  createNovaRateLimiter,
  DEFAULT_GEMINI_MODEL,
  geminiGenerationConfig,
  getNovaPublicConfig,
  OPENROUTER_FREE_MODEL,
} from '../server/novaChat.js';
import vercelNovaChatHandler from '../api/nova/chat.js';
import vercelNovaConfigHandler from '../api/nova/config.js';
import { askNovaAi } from '../lib/nasaApi.js';

const TEST_API_KEY = 'sk-or-test-only-never-a-real-key';
const sampleBody = {
  lang: 'en',
  messages: [
    { role: 'user', content: 'What does the James Webb Space Telescope study?' },
  ],
};

function successFetch(responseData = {
  model: 'example/test-model:free',
  choices: [{
    message: {
      role: 'assistant',
      content: 'JWST observes the universe in infrared.\nSUGGESTIONS: [What is infrared?] | [What has JWST found?]',
    },
  }],
}) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => responseData,
  });
}

function createTestHandler(options = {}) {
  return createNovaChatHandler({
    getApiKey: () => TEST_API_KEY,
    getGeminiApiKey: () => '',
    fetchImpl: successFetch(),
    ...options,
  });
}

test('sends a bounded chat to the free-model router and returns the selected model', async () => {
  let capturedRequest;
  const handler = createTestHandler({
    fetchImpl: async (url, options) => {
      capturedRequest = { url, options, payload: JSON.parse(options.body) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: 'example/test-model:free',
          choices: [{
            message: {
              role: 'assistant',
              content: 'JWST observes the universe in infrared.\nSUGGESTIONS: [What is infrared?] | [What has JWST found?]',
            },
          }],
        }),
      };
    },
  });

  const response = await handler({ body: sampleBody, ip: '198.51.100.10' });

  assert.equal(response.status, 200);
  assert.equal(capturedRequest.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(capturedRequest.options.method, 'POST');
  assert.equal(capturedRequest.options.headers.Authorization, `Bearer ${TEST_API_KEY}`);
  assert.equal(capturedRequest.payload.model, OPENROUTER_FREE_MODEL);
  assert.equal(capturedRequest.payload.messages[0].role, 'system');
  assert.match(capturedRequest.payload.messages[0].content, /latest user message/i);
  assert.equal(response.body.text, 'JWST observes the universe in infrared.');
  assert.deepEqual(response.body.suggestions, ['What is infrared?', 'What has JWST found?']);
  assert.equal(response.body.model, 'example/test-model:free');
  assert.equal(response.body.provider, 'OpenRouter');
  assert.equal(response.body.fallback, false);
  assert.equal(JSON.stringify(response).includes(TEST_API_KEY), false);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('passes Sinhala and Tamil language guidance while keeping the latest message', async () => {
  const cases = [
    { lang: 'si-LK', base: 'si', content: 'ජේම්ස් වෙබ් දුරේක්ෂය ගැන කියන්න.' },
    { lang: 'ta-LK', base: 'ta', content: 'ஜேம்ஸ் வெப் தொலைநோக்கி பற்றி சொல்லுங்கள்.' },
  ];

  for (const languageCase of cases) {
    let capturedPayload;
    const handler = createTestHandler({
      fetchImpl: async (_url, options) => {
        capturedPayload = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            model: 'example/test-model:free',
            choices: [{ message: { role: 'assistant', content: languageCase.content } }],
          }),
        };
      },
    });

    const response = await handler({
      body: { lang: languageCase.lang, messages: [{ role: 'user', content: languageCase.content }] },
      ip: `198.51.100.${languageCase.base === 'si' ? '23' : '24'}`,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.lang, languageCase.base);
    assert.equal(capturedPayload.messages[0].role, 'system');
    assert.match(capturedPayload.messages[0].content, new RegExp(languageCase.base === 'si' ? 'Sinhala' : 'Tamil', 'i'));
  }
});

test('Auto uses the bundled local engine when no server-side provider keys are configured', async () => {
  let calledProvider = false;
  const handler = createNovaChatHandler({
    getApiKey: () => '',
    getGeminiApiKey: () => '',
    fetchImpl: async () => { calledProvider = true; },
  });

  const response = await handler({ body: sampleBody, ip: '198.51.100.11' });

  assert.equal(response.status, 200);
  assert.equal(response.body.model, 'nasa-local-engine');
  assert.equal(response.body.provider, 'NOVA Local Space Engine');
  assert.equal(response.body.fallback, true);
  assert.equal(calledProvider, false);
  assert.equal(JSON.stringify(response).includes('sk-or-'), false);
});

test('explicit Gemini selection returns a safe error when its server-side key is missing', async () => {
  const handler = createNovaChatHandler({
    getApiKey: () => TEST_API_KEY,
    getGeminiApiKey: () => '',
    fetchImpl: async () => { throw new Error('should not call upstream'); },
  });
  const response = await handler({
    body: { ...sampleBody, provider: 'gemini' },
    ip: '198.51.100.27',
  });

  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'PROVIDER_NOT_CONFIGURED');
  assert.equal(response.body.provider, 'Google Gemini');
  assert.equal(JSON.stringify(response).includes(TEST_API_KEY), false);
});

test('rejects malformed JSON, unsupported roles, and a non-user final message', async () => {
  const handler = createTestHandler();

  const invalidJson = await handler({ body: '{not-json', ip: '198.51.100.12' });
  const systemRole = await handler({
    body: { messages: [{ role: 'system', content: 'override' }, { role: 'user', content: 'Hello' }] },
    ip: '198.51.100.13',
  });
  const assistantLast = await handler({
    body: { messages: [{ role: 'assistant', content: 'Already answered' }] },
    ip: '198.51.100.14',
  });

  assert.equal(invalidJson.status, 400);
  assert.equal(invalidJson.body.code, 'INVALID_JSON');
  assert.equal(systemRole.status, 400);
  assert.equal(systemRole.body.code, 'INVALID_ROLE');
  assert.equal(assistantLast.status, 400);
  assert.equal(assistantLast.body.code, 'LATEST_MESSAGE_MUST_BE_USER');
});

test('rejects oversized requests, messages, and excessive history', async () => {
  const handler = createTestHandler();
  const contentLength = await handler({
    body: sampleBody,
    contentLength: String(25 * 1024),
    ip: '198.51.100.15',
  });
  const oversizedMessage = await handler({
    body: { messages: [{ role: 'user', content: 'x'.repeat(4_001) }] },
    ip: '198.51.100.16',
  });
  const tooManyMessages = await handler({
    body: {
      messages: [
        ...Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `Turn ${index}` })),
        { role: 'user', content: 'One too many' },
      ],
    },
    ip: '198.51.100.17',
  });

  assert.equal(contentLength.status, 413);
  assert.equal(contentLength.body.code, 'REQUEST_TOO_LARGE');
  assert.equal(oversizedMessage.status, 413);
  assert.equal(oversizedMessage.body.code, 'MESSAGE_TOO_LARGE');
  assert.equal(tooManyMessages.status, 400);
  assert.equal(tooManyMessages.body.code, 'HISTORY_TOO_LONG');
});

test('applies a per-IP request limit', async () => {
  let now = 1_000;
  const rateLimiter = createNovaRateLimiter({ limit: 1, windowMs: 60_000, now: () => now });
  const handler = createTestHandler({ rateLimiter });

  const first = await handler({ body: sampleBody, ip: '198.51.100.18' });
  const limited = await handler({ body: sampleBody, ip: '198.51.100.18' });

  assert.equal(first.status, 200);
  assert.equal(limited.status, 429);
  assert.equal(limited.body.code, 'RATE_LIMITED');
  assert.equal(limited.headers['Retry-After'], '60');

  now += 60_001;
  const afterWindow = await handler({ body: sampleBody, ip: '198.51.100.18' });
  assert.equal(afterWindow.status, 200);
});

test('maps provider rate limits and outages to safe retryable errors', async () => {
  const upstream429 = createTestHandler({
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: TEST_API_KEY }) }),
  });
  const upstream500 = createTestHandler({
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({ error: TEST_API_KEY }) }),
  });
  const unavailableFreeModel = createTestHandler({
    fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({ error: TEST_API_KEY }) }),
  });

  const selectedOpenRouter = { ...sampleBody, provider: 'openrouter' };
  const rateLimited = await upstream429({ body: selectedOpenRouter, ip: '198.51.100.19' });
  const unavailable = await upstream500({ body: selectedOpenRouter, ip: '198.51.100.20' });
  const noFreeModel = await unavailableFreeModel({ body: selectedOpenRouter, ip: '198.51.100.21' });

  assert.equal(rateLimited.status, 429);
  assert.equal(rateLimited.body.code, 'UPSTREAM_RATE_LIMITED');
  assert.equal(rateLimited.headers['Retry-After'], '30');
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body.code, 'PROVIDER_UNAVAILABLE');
  assert.equal(noFreeModel.status, 503);
  assert.equal(noFreeModel.body.code, 'FREE_MODEL_UNAVAILABLE');
  assert.equal(JSON.stringify([rateLimited, unavailable, noFreeModel]).includes(TEST_API_KEY), false);
});

test('browser helper posts only bounded history to the same-origin endpoint', async () => {
  const originalFetch = globalThis.fetch;
  let capturedRequest;
  globalThis.fetch = async (url, options) => {
    capturedRequest = { url, options, payload: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        text: 'விண்வெளி ஆய்வுக்கான பதில்.',
        suggestions: [],
        model: 'example/test-model:free',
        provider: 'OpenRouter',
        lang: 'ta',
        fallback: false,
      }),
    };
  };

  try {
    const history = Array.from({ length: 11 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      text: `Turn ${index}: ${'அ'.repeat(3_500)}`,
    }));
    const result = await askNovaAi('ஜேம்ஸ் வெப் பற்றி விளக்குங்கள்.', 'ta-LK', history, { provider: 'gemini' });

    assert.equal(capturedRequest.url, '/api/nova/chat');
    assert.equal(capturedRequest.options.method, 'POST');
    assert.equal(capturedRequest.options.headers.Authorization, undefined);
    assert.equal(capturedRequest.payload.lang, 'ta');
    assert.equal(capturedRequest.payload.provider, 'gemini');
    assert.ok(capturedRequest.payload.messages.length <= 12);
    assert.equal(capturedRequest.payload.messages.at(-1).role, 'user');
    assert.ok(capturedRequest.payload.messages.every((message) => message.content.length <= 4_000));
    assert.ok(Buffer.byteLength(capturedRequest.payload.messages.map((message) => message.content).join(''), 'utf8') <= 18 * 1024);
    assert.equal(result.provider, 'OpenRouter');
    assert.equal(result.model, 'example/test-model:free');
    assert.equal(JSON.stringify(capturedRequest.payload).includes('OPENROUTER_API_KEY'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Vercel function adapter enforces POST and handles fake-key requests without leaking the key', async () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  process.env.OPENROUTER_API_KEY = '';
  process.env.GEMINI_API_KEY = '';

  function mockResponse() {
    return {
      headers: {},
      statusCode: 200,
      body: null,
      setHeader(name, value) { this.headers[name] = value; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
  }

  try {
    const methodResponse = mockResponse();
    await vercelNovaChatHandler({ method: 'GET', headers: {} }, methodResponse);
    assert.equal(methodResponse.statusCode, 405);
    assert.equal(methodResponse.headers.Allow, 'POST');

    const missingKeyResponse = mockResponse();
    await vercelNovaChatHandler({
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.25', 'content-length': '100' },
      body: sampleBody,
      socket: { remoteAddress: '127.0.0.1' },
    }, missingKeyResponse);

    assert.equal(missingKeyResponse.statusCode, 200);
    assert.equal(missingKeyResponse.body.model, 'nasa-local-engine');
    assert.equal(missingKeyResponse.body.fallback, true);
    assert.equal(missingKeyResponse.headers['Cache-Control'], 'no-store');
    assert.equal(JSON.stringify(missingKeyResponse.body).includes('OPENROUTER_API_KEY'), false);

    const originalFetch = globalThis.fetch;
    let capturedUpstream;
    process.env.OPENROUTER_API_KEY = TEST_API_KEY;
    globalThis.fetch = async (url, options) => {
      capturedUpstream = { url, options };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: 'example/vercel-test:free',
          choices: [{ message: { role: 'assistant', content: 'Mock Vercel function response.' } }],
        }),
      };
    };

    try {
      const successResponse = mockResponse();
      await vercelNovaChatHandler({
        method: 'POST',
        headers: { 'x-forwarded-for': '198.51.100.26', 'content-length': '100' },
        body: sampleBody,
      }, successResponse);

      assert.equal(successResponse.statusCode, 200);
      assert.equal(successResponse.body.text, 'Mock Vercel function response.');
      assert.equal(successResponse.body.model, 'example/vercel-test:free');
      assert.equal(capturedUpstream.url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.equal(capturedUpstream.options.headers.Authorization, `Bearer ${TEST_API_KEY}`);
      assert.equal(JSON.stringify(successResponse.body).includes(TEST_API_KEY), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
    if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGeminiKey;
  }
});

test('the local provider runs the built-in trilingual knowledge engine without an upstream request', async () => {
  let calledProvider = false;
  const handler = createNovaChatHandler({
    getApiKey: () => TEST_API_KEY,
    getGeminiApiKey: () => 'another-server-key',
    fetchImpl: async () => { calledProvider = true; throw new Error('local mode must not call a provider'); },
  });
  const response = await handler({
    body: { lang: 'en', provider: 'local', messages: [{ role: 'user', content: 'What does the James Webb telescope do?' }] },
    ip: '198.51.100.28',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.provider, 'NOVA Local Space Engine');
  assert.equal(response.body.model, 'nasa-local-engine');
  assert.equal(response.body.intent, 'jwst');
  assert.equal(response.body.fallback, false);
  assert.equal(calledProvider, false);
});

test('Gemini uses the server-only key header and translates conversation roles to Gemini format', async () => {
  let capturedRequest;
  const handler = createNovaChatHandler({
    getApiKey: () => '',
    getGeminiApiKey: () => TEST_API_KEY,
    fetchImpl: async (url, options) => {
      capturedRequest = { url, options, payload: JSON.parse(options.body) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              role: 'model',
              parts: [{ text: 'JWST studies infrared light.\nSUGGESTIONS: [What is infrared?] | [What did it find?]' }],
            },
          }],
        }),
      };
    },
  });
  const response = await handler({
    body: {
      lang: 'en',
      provider: 'gemini',
      messages: [
        { role: 'user', content: 'What is infrared?' },
        { role: 'assistant', content: 'It is electromagnetic radiation.' },
        { role: 'user', content: 'What does JWST study?' },
      ],
    },
    ip: '198.51.100.29',
  });

  assert.equal(response.status, 200);
  assert.equal(capturedRequest.url, `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`);
  assert.equal(capturedRequest.options.headers['x-goog-api-key'], TEST_API_KEY);
  assert.equal(capturedRequest.url.includes(TEST_API_KEY), false);
  assert.equal(capturedRequest.payload.contents[1].role, 'model');
  assert.equal(capturedRequest.payload.contents[2].role, 'user');
  assert.match(capturedRequest.payload.systemInstruction.parts[0].text, /latest user message/i);
  assert.equal(response.body.text, 'JWST studies infrared light.');
  assert.deepEqual(response.body.suggestions, ['What is infrared?', 'What did it find?']);
  assert.equal(response.body.provider, 'Google Gemini');
  assert.equal(response.body.model, DEFAULT_GEMINI_MODEL);
  assert.equal(JSON.stringify(response).includes(TEST_API_KEY), false);
});

test('Auto falls through from a rate-limited OpenRouter request to Gemini', async () => {
  const attemptedProviders = [];
  const handler = createNovaChatHandler({
    getApiKey: () => TEST_API_KEY,
    getGeminiApiKey: () => 'gemini-test-key',
    fetchImpl: async (url) => {
      attemptedProviders.push(url.includes('openrouter.ai') ? 'openrouter' : 'gemini');
      if (url.includes('openrouter.ai')) return { ok: false, status: 429 };
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'Gemini fallback succeeded.' }] } }] }),
      };
    },
  });
  const response = await handler({ body: sampleBody, ip: '198.51.100.30' });

  assert.equal(response.status, 200);
  assert.deepEqual(attemptedProviders, ['openrouter', 'gemini']);
  assert.equal(response.body.provider, 'Google Gemini');
  assert.equal(response.body.fallback, false);
  assert.equal(JSON.stringify(response).includes(TEST_API_KEY), false);
  assert.equal(JSON.stringify(response).includes('gemini-test-key'), false);
});

test('Auto falls back to the local engine when every configured online provider fails', async () => {
  const attemptedProviders = [];
  const handler = createNovaChatHandler({
    getApiKey: () => TEST_API_KEY,
    getGeminiApiKey: () => 'gemini-test-key',
    fetchImpl: async (url) => {
      attemptedProviders.push(url.includes('openrouter.ai') ? 'openrouter' : 'gemini');
      return { ok: false, status: 503 };
    },
  });
  const response = await handler({ body: sampleBody, ip: '198.51.100.32' });

  assert.equal(response.status, 200);
  assert.deepEqual(attemptedProviders, ['openrouter', 'gemini']);
  assert.equal(response.body.provider, 'NOVA Local Space Engine');
  assert.equal(response.body.model, 'nasa-local-engine');
  assert.equal(response.body.fallback, true);
});

test('public provider config reports availability without exposing API keys', () => {
  const config = getNovaPublicConfig({
    env: {
      GEMINI_API_KEY: 'private-gemini-key',
      OPENROUTER_API_KEY: 'private-openrouter-key',
    },
  });

  assert.deepEqual(config.providers, { auto: true, local: true, gemini: true, openrouter: true, arena: false });
  assert.equal(JSON.stringify(config).includes('private-gemini-key'), false);
  assert.equal(JSON.stringify(config).includes('private-openrouter-key'), false);
});

test('Vercel provider-config endpoint only supports GET and returns safe availability flags', async () => {
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
  process.env.GEMINI_API_KEY = 'private-gemini-key';
  process.env.OPENROUTER_API_KEY = '';
  const makeResponse = () => ({
    headers: {}, statusCode: 200, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });

  try {
    const methodResponse = makeResponse();
    vercelNovaConfigHandler({ method: 'POST' }, methodResponse);
    assert.equal(methodResponse.statusCode, 405);
    assert.equal(methodResponse.headers.Allow, 'GET');

    const getResponse = makeResponse();
    vercelNovaConfigHandler({ method: 'GET' }, getResponse);
    assert.equal(getResponse.statusCode, 200);
    assert.deepEqual(getResponse.body.providers, { auto: true, local: true, gemini: true, openrouter: false, arena: false });
    assert.equal(JSON.stringify(getResponse.body).includes('private-gemini-key'), false);
    assert.equal(getResponse.headers['Cache-Control'], 'no-store');
  } finally {
    if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGeminiKey;
    if (previousOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousOpenRouterKey;
  }
});

test('rejects unknown provider selection', async () => {
  const response = await createTestHandler()({
    body: { ...sampleBody, provider: 'unknown-provider' },
    ip: '198.51.100.31',
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'INVALID_PROVIDER');
});

test('aborts a provider request after the configured timeout', async () => {
  const handler = createTestHandler({
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((resolve, reject) => {
      if (signal.aborted) {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
        return;
      }
      signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
  });

  const response = await handler({ body: { ...sampleBody, provider: 'openrouter' }, ip: '198.51.100.22' });
  assert.equal(response.status, 504);
  assert.equal(response.body.code, 'AI_TIMEOUT');
  assert.equal(JSON.stringify(response).includes(TEST_API_KEY), false);
});

const ARENA_TEST_KEY = 'arena-sk-test-only-never-a-real-key';

function arenaSuccessFetch(responseData = {
  model: 'arena_smart.aria',
  choices: [{
    message: {
      role: 'assistant',
      content: 'JWST observes the universe in infrared.\nSUGGESTIONS: [What is infrared?] | [What has JWST found?]',
    },
  }],
}) {
  return async (url, options) => {
    assert.equal(url, ARENA_BASE_URL || 'https://api.arena.ai/v1/chat/completions');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, `Bearer ${ARENA_TEST_KEY}`);
    const payload = JSON.parse(options.body);
    assert.equal(payload.stream, false);
    assert.ok(Array.isArray(payload.messages));
    assert.ok(payload.messages.some(m => m.role === 'system'));
    return {
      ok: true,
      status: 200,
      json: async () => responseData,
    };
  };
}

function arenaKeyHandler(options = {}) {
  return createNovaChatHandler({
    getArenaApiKey: () => ARENA_TEST_KEY,
    getOpenRouterApiKey: () => '',
    getGeminiApiKey: () => '',
    fetchImpl: options.fetchImpl || arenaSuccessFetch(options.responseData),
  });
}

test('Arena successful response returns normalized NOVA format', async () => {
  let capturedPayload;
  const handler = arenaKeyHandler({
    fetchImpl: async (url, options) => {
      capturedPayload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: 'arena_smart.aria',
          choices: [{
            message: {
              role: 'assistant',
              content: 'JWST observes the universe in infrared.\nSUGGESTIONS: [What is infrared?] | [What has JWST found?]',
            },
          }],
        }),
      };
    },
  });

  const response = await handler({ body: { ...sampleBody, provider: 'arena' }, ip: '198.51.100.40' });

  assert.equal(response.status, 200);
  assert.equal(response.body.text, 'JWST observes the universe in infrared.');
  assert.deepEqual(response.body.suggestions, ['What is infrared?', 'What has JWST found?']);
  assert.equal(response.body.model, 'arena_smart.aria');
  assert.equal(response.body.provider, 'Arena AI');
  assert.equal(response.body.lang, 'en');
  assert.equal(response.body.fallback, false);
  assert.equal(JSON.stringify(response).includes(ARENA_TEST_KEY), false);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.ok(capturedPayload.messages.some(m => m.role === 'system'));
});

test('Arena missing API key returns safe error when explicitly selected', async () => {
  const handler = createNovaChatHandler({
    getArenaApiKey: () => '',
    getOpenRouterApiKey: () => '',
    getGeminiApiKey: () => '',
    fetchImpl: async () => { throw new Error('must not call upstream'); },
  });

  const response = await handler({
    body: { ...sampleBody, provider: 'arena' },
    ip: '198.51.100.41',
  });

  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'PROVIDER_NOT_CONFIGURED');
  assert.equal(response.body.provider, 'Arena AI');
  assert.equal(JSON.stringify(response).includes(ARENA_TEST_KEY), false);
});

test('Arena invalid API key (401) maps to PROVIDER_AUTH_ERROR', async () => {
  const handler = arenaKeyHandler({
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: 'invalid key' }) }),
  });

  const response = await handler({ body: { ...sampleBody, provider: 'arena' }, ip: '198.51.100.42' });

  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'PROVIDER_AUTH_ERROR');
  assert.equal(response.body.provider, 'Arena AI');
  assert.equal(JSON.stringify(response).includes(ARENA_TEST_KEY), false);
});

test('Arena forbidden request (403) maps to PROVIDER_AUTH_ERROR', async () => {
  const handler = arenaKeyHandler({
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: 'forbidden' }) }),
  });

  const response = await handler({ body: { ...sampleBody, provider: 'arena' }, ip: '198.51.100.43' });

  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'PROVIDER_AUTH_ERROR');
  assert.equal(response.body.provider, 'Arena AI');
});

test('Arena rate limit (429) maps to UPSTREAM_RATE_LIMITED', async () => {
  const handler = arenaKeyHandler({
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: 'rate limited' }) }),
  });

  const response = await handler({ body: { ...sampleBody, provider: 'arena' }, ip: '198.51.100.44' });

  assert.equal(response.status, 429);
  assert.equal(response.body.code, 'UPSTREAM_RATE_LIMITED');
  assert.equal(response.body.provider, 'Arena AI');
  assert.equal(response.headers['Retry-After'], '30');
});

test('Arena server error (500) maps to PROVIDER_UNAVAILABLE', async () => {
  const handler = arenaKeyHandler({
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({ error: 'internal' }) }),
  });

  const response = await handler({ body: { ...sampleBody, provider: 'arena' }, ip: '198.51.100.45' });

  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'PROVIDER_UNAVAILABLE');
  assert.equal(response.body.provider, 'Arena AI');
});

test('Arena timeout maps to AI_TIMEOUT', async () => {
  const handler = arenaKeyHandler({
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
  });

  const response = await handler({ body: { ...sampleBody, provider: 'arena' }, ip: '198.51.100.46' });

  assert.equal(response.status, 504);
  assert.equal(response.body.code, 'AI_TIMEOUT');
  assert.equal(response.body.provider, 'Arena AI');
});

test('Arena invalid JSON response maps to INVALID_PROVIDER_RESPONSE', async () => {
  const handler = arenaKeyHandler({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new Error('not json'); },
    }),
  });

  const response = await handler({ body: { ...sampleBody, provider: 'arena' }, ip: '198.51.100.47' });

  assert.equal(response.status, 502);
  assert.equal(response.body.code, 'INVALID_PROVIDER_RESPONSE');
  assert.equal(response.body.provider, 'Arena AI');
});

test('Arena empty response maps to EMPTY_PROVIDER_RESPONSE', async () => {
  const handler = arenaKeyHandler({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ model: 'arena_smart.aria', choices: [] }),
    }),
  });

  const response = await handler({ body: { ...sampleBody, provider: 'arena' }, ip: '198.51.100.48' });

  assert.equal(response.status, 502);
  assert.equal(response.body.code, 'EMPTY_PROVIDER_RESPONSE');
  assert.equal(response.body.provider, 'Arena AI');
});

test('Auto routing prefers Arena when configured, falls back to Gemini', async () => {
  const attemptedProviders = [];
  const handler = createNovaChatHandler({
    getArenaApiKey: () => ARENA_TEST_KEY,
    getOpenRouterApiKey: () => '',
    getGeminiApiKey: () => 'gemini-test-key',
    fetchImpl: async (url) => {
      attemptedProviders.push(url.includes('api.arena.ai') ? 'arena' : 'gemini');
      if (url.includes('api.arena.ai')) return { ok: false, status: 503 };
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'Gemini fallback succeeded.' }] } }] }),
      };
    },
  });
  const response = await handler({ body: sampleBody, ip: '198.51.100.49' });

  assert.equal(response.status, 200);
  assert.deepEqual(attemptedProviders, ['arena', 'gemini']);
  assert.equal(response.body.provider, 'Google Gemini');
  assert.equal(response.body.fallback, false);
  assert.equal(JSON.stringify(response).includes(ARENA_TEST_KEY), false);
  assert.equal(JSON.stringify(response).includes('gemini-test-key'), false);
});

test('Auto routing falls back from Arena to OpenRouter', async () => {
  const attemptedProviders = [];
  const handler = createNovaChatHandler({
    getArenaApiKey: () => ARENA_TEST_KEY,
    getOpenRouterApiKey: () => TEST_API_KEY,
    getGeminiApiKey: () => '',
    fetchImpl: async (url) => {
      attemptedProviders.push(url.includes('api.arena.ai') ? 'arena' : 'openrouter');
      if (url.includes('api.arena.ai')) return { ok: false, status: 429 };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: 'example/test-model:free',
          choices: [{ message: { role: 'assistant', content: 'OpenRouter fallback succeeded.' } }],
        }),
      };
    },
  });
  const response = await handler({ body: sampleBody, ip: '198.51.100.50' });

  assert.equal(response.status, 200);
  assert.deepEqual(attemptedProviders, ['arena', 'openrouter']);
  assert.equal(response.body.provider, 'OpenRouter');
  assert.equal(response.body.fallback, false);
});

test('Auto routing falls back to local engine when Arena and all online providers fail', async () => {
  const handler = createNovaChatHandler({
    getArenaApiKey: () => ARENA_TEST_KEY,
    getOpenRouterApiKey: () => TEST_API_KEY,
    getGeminiApiKey: () => 'gemini-test-key',
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  const response = await handler({ body: sampleBody, ip: '198.51.100.51' });

  assert.equal(response.status, 200);
  assert.equal(response.body.provider, 'NOVA Local Space Engine');
  assert.equal(response.body.model, 'nasa-local-engine');
  assert.equal(response.body.fallback, true);
  assert.equal(JSON.stringify(response).includes(ARENA_TEST_KEY), false);
  assert.equal(JSON.stringify(response).includes(TEST_API_KEY), false);
  assert.equal(JSON.stringify(response).includes('gemini-test-key'), false);
});

test('public config names the build that answered, and nothing else', () => {
  const config = getNovaPublicConfig({
    env: {
      VERCEL_ENV: 'production',
      VERCEL_GIT_COMMIT_SHA: '4a1d42de9ad2c646c02a5188b1d48dca5a35f83f',
      VERCEL_GIT_COMMIT_REF: 'main',
      GEMINI_API_KEY: 'private-gemini-key',
    },
  });

  // A stale deployment and a rejected key look identical from the browser;
  // this is the field that separates them.
  assert.deepEqual(config.deployment, {
    environment: 'production',
    commit: '4a1d42d',
    branch: 'main',
  });
  assert.equal(JSON.stringify(config).includes('private-gemini-key'), false);
});

test('public config falls back to a safe label outside Vercel and sanitises env', () => {
  assert.deepEqual(getNovaPublicConfig({ env: {} }).deployment, {
    environment: 'development',
    commit: null,
    branch: null,
  });

  const hostile = getNovaPublicConfig({
    env: {
      VERCEL_ENV: 'preview\u0000<script>',
      VERCEL_GIT_COMMIT_SHA: 'not-a-sha',
      VERCEL_GIT_COMMIT_REF: 'feature/../../etc/passwd',
    },
  });

  assert.equal(hostile.deployment.commit, null);
  // Control characters and markup never survive; the label stays a plain string.
  assert.equal(hostile.deployment.environment, 'previewscript');
  assert.match(hostile.deployment.branch, /^[A-Za-z0-9._/-]+$/);
  assert.doesNotMatch(JSON.stringify(hostile.deployment), /[<>\u0000]/);
});

test('Arena provider config reports availability without exposing key', () => {
  const config = getNovaPublicConfig({
    env: {
      ARENA_API_KEY: 'private-arena-key',
      GEMINI_API_KEY: 'private-gemini-key',
      OPENROUTER_API_KEY: 'private-openrouter-key',
    },
  });

  assert.equal(config.providers.arena, true);
  assert.equal(config.providers.gemini, true);
  assert.equal(config.providers.openrouter, true);
  assert.equal(JSON.stringify(config).includes('private-arena-key'), false);
  assert.equal(JSON.stringify(config).includes('private-gemini-key'), false);
  assert.equal(JSON.stringify(config).includes('private-openrouter-key'), false);
});

test('Arena provider config reports unavailable when key not set', () => {
  const config = getNovaPublicConfig({
    env: {
      GEMINI_API_KEY: 'private-gemini-key',
    },
  });

  assert.equal(config.providers.arena, false);
  assert.equal(JSON.stringify(config).includes('ARENA_API_KEY'), false);
});

test('Auto routing never hangs longer than one budgeted chain', async () => {
  // Every provider hangs until its AbortSignal fires. The per-call timeout is
  // 40 ms, so an unbudgeted chain of three would take ~120 ms; the assertion
  // here is that the answer still arrives, from the local engine, and that no
  // provider can run past the budget.
  const timeouts = [];
  const handler = createNovaChatHandler({
    getArenaApiKey: () => ARENA_TEST_KEY,
    getOpenRouterApiKey: () => TEST_API_KEY,
    getGeminiApiKey: () => 'gemini-test-key',
    fetchImpl: async (_url, init) => {
      timeouts.push(init?.signal ? 'abortable' : 'unabortable');
      return await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    },
    timeoutMs: 40,
  });

  const startedAt = Date.now();
  const response = await handler({ body: sampleBody, ip: '198.51.100.60' });
  const elapsed = Date.now() - startedAt;

  assert.equal(response.status, 200);
  assert.equal(response.body.provider, 'NOVA Local Space Engine');
  assert.equal(response.body.fallback, true);
  assert.ok(elapsed < 2_000, `answered in ${elapsed} ms, not a 24-second chain`);
  assert.deepEqual(timeouts, ['abortable', 'abortable', 'abortable'], 'every provider call can be aborted');
});

test('a refused provider keeps its name and upstream status on the error', async () => {
  const handler = createNovaChatHandler({
    getOpenRouterApiKey: () => TEST_API_KEY,
    getGeminiApiKey: () => '',
    getArenaApiKey: () => '',
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }),
  });

  const response = await handler({
    body: { ...sampleBody, provider: 'openrouter' },
    ip: '198.51.100.21',
  });

  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'PROVIDER_AUTH_ERROR');
  assert.equal(response.body.provider, 'OpenRouter');
  assert.equal(response.body.upstreamStatus, 401);
  assert.doesNotMatch(JSON.stringify(response.body), /sk-or-test/);
});

test('an offline answer lists every failed provider with its status', async () => {
  const handler = createNovaChatHandler({
    getOpenRouterApiKey: () => TEST_API_KEY,
    getGeminiApiKey: () => 'gemini-test-key',
    getArenaApiKey: () => 'arena-test-key',
    fetchImpl: async (url) => {
      if (String(url).includes('arena')) return { ok: false, status: 403, json: async () => ({}) };
      if (String(url).includes('openrouter')) return { ok: false, status: 429, json: async () => ({}) };
      return { ok: false, status: 400, json: async () => ({}) };
    },
  });

  const response = await handler({ body: sampleBody, ip: '198.51.100.22' });

  assert.equal(response.status, 200);
  assert.equal(response.body.fallback, true);
  assert.equal(response.body.provider, 'NOVA Local Space Engine');
  assert.deepEqual(response.body.fallbackChain, [
    { provider: 'Arena AI', code: 'PROVIDER_AUTH_ERROR', status: 403 },
    { provider: 'OpenRouter', code: 'UPSTREAM_RATE_LIMITED', status: 429 },
    { provider: 'Google Gemini', code: 'PROVIDER_ERROR', status: 400 },
  ]);
  assert.doesNotMatch(JSON.stringify(response.body), /sk-or-test|gemini-test-key|arena-test-key/);
});

test('a healthy chain carries no fallback chain at all', async () => {
  const handler = createTestHandler();
  const response = await handler({ body: sampleBody, ip: '198.51.100.23' });
  assert.equal(response.status, 200);
  assert.equal(response.body.fallback, false);
  assert.equal(response.body.fallbackChain, undefined);
});

test('a provider error never leaks the key or the raw upstream body', async () => {
  const handler = createNovaChatHandler({
    getOpenRouterApiKey: () => TEST_API_KEY,
    getGeminiApiKey: () => '',
    getArenaApiKey: () => '',
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: `bad key ${TEST_API_KEY}` }),
    }),
  });

  const response = await handler({
    body: { ...sampleBody, provider: 'openrouter' },
    ip: '198.51.100.24',
  });

  assert.equal(response.body.code, 'PROVIDER_UNAVAILABLE');
  assert.equal(response.body.upstreamStatus, 500);
  assert.doesNotMatch(JSON.stringify(response.body), /sk-or-test/);
});

test('Gemini 3 asks for low-latency thinking and drops the retired temperature', () => {
  const three = geminiGenerationConfig('gemini-3.8-flash');
  assert.deepEqual(three, { maxOutputTokens: 1_200, thinkingConfig: { thinkingLevel: 'low' } });
  assert.equal('temperature' in three, false, 'temperature is retired for Gemini 3.x');

  // 2.x models do not understand thinkingLevel, so they keep the legacy config.
  const two = geminiGenerationConfig('gemini-2.5-flash');
  assert.equal(two.temperature, 0.7);
  assert.equal('thinkingConfig' in two, false);
});

test('a Gemini 3 request body carries the thinking level, not a temperature', async () => {
  let payload;
  const handler = createNovaChatHandler({
    getApiKey: () => '',
    getGeminiApiKey: () => TEST_API_KEY,
    getGeminiModel: () => 'gemini-3.8-flash',
    fetchImpl: async (url, options) => {
      payload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'About 400 km.' }] } }] }),
      };
    },
  });
  const response = await handler({
    body: { lang: 'en', provider: 'gemini', messages: [{ role: 'user', content: 'ISS altitude?' }] },
    ip: '198.51.100.77',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.model, 'gemini-3.8-flash');
  assert.deepEqual(payload.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
  assert.equal(payload.generationConfig.temperature, undefined);
});

test('the browser client accepts Arena, the provider the assistant offers', async () => {
  const originalFetch = globalThis.fetch;
  let payload;
  globalThis.fetch = async (url, options) => {
    payload = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ text: 'Arena answer.', provider: 'Arena AI', model: 'arena_smart.aria' }),
    };
  };
  try {
    const result = await askNovaAi('What is a Lagragian orbit?', 'en', [], { provider: 'arena' });
    // Before the fix this threw INVALID_PROVIDER and never reached the network.
    assert.equal(payload.provider, 'arena');
    assert.equal(result.provider, 'Arena AI');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the invalid-provider message names every provider the server accepts', async () => {
  const handler = createNovaChatHandler({ getApiKey: () => '', getGeminiApiKey: () => '' });
  const response = await handler({
    body: { provider: 'nope', messages: [{ role: 'user', content: 'hi' }] },
    ip: '198.51.100.91',
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'INVALID_PROVIDER');
  for (const provider of ['auto', 'local', 'gemini', 'openrouter', 'arena']) {
    assert.match(response.body.error, new RegExp(provider, 'i'));
  }
});

test('a throttled request tells the client when to come back', async () => {
  const handler = createNovaChatHandler({
    getApiKey: () => '',
    getGeminiApiKey: () => '',
    rateLimiter: createNovaRateLimiter({ limit: 1, windowMs: 60_000 }),
  });
  const request = {
    body: { provider: 'local', messages: [{ role: 'user', content: 'hi' }] },
    ip: '198.51.100.92',
  };
  const first = await handler(request);
  const second = await handler(request);

  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
  assert.equal(second.body.code, 'RATE_LIMITED');
  assert.ok(Number(second.headers?.['Retry-After']) > 0, 'Retry-After must be present');
});
