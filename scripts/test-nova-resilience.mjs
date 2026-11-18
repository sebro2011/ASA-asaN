/**
 * NOVA provider-resilience regression suite.
 *
 * Every case here is a production failure observed on
 * `https://nasa-space-expolere.vercel.app` (deployment `a542980`) or the exact
 * defect that produced it:
 *
 *  - OpenRouter answered **HTTP 200** to a real chat request while the 8-second
 *    timer was still draining the body. The read rejected, the old code called
 *    that `INVALID_PROVIDER_RESPONSE` ("unreadable response"), and the UI showed
 *    `OpenRouter · INVALID_PROVIDER_RESPONSE · HTTP 502` even though the
 *    provider was healthy (`/api/nova/diagnostics?probe=1` → 200 in 401 ms).
 *  - Gemini answered 503 on the only id the key can actually call
 *    (`gemini-3.8-flash`, `gemini-flash-latest`) and 404 on every id in the
 *    hand-written fallback list, so an 8-second hop spent its budget on models
 *    that cannot answer and reported `AI_TIMEOUT` (504).
 *
 * These tests pin the repaired behaviour: correct classification, a bounded
 * retry, real model discovery, and a chain that cannot outlive its budget.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_CHAIN_BUDGET_MS,
  classifyBodyShape,
  createNovaChatHandler,
  OPENROUTER_FALLBACK_MODEL,
  OPENROUTER_FREE_MODEL,
  pickGeminiChatModels,
  resetGeminiDiscoveryCache,
  textFromEventStream,
  UPSTREAM_TIMEOUT_MS,
} from '../server/novaChat.js';

const OPENROUTER_KEY = 'sk-or-v1-resilience-test-key-never-real';
const GEMINI_KEY = 'gemini-resilience-test-key';
const body = { lang: 'en', messages: [{ role: 'user', content: 'What is the altitude of the ISS?' }] };

/** A 2xx whose body is whatever the test asks for. */
function rawResponse(text, { contentType = 'application/json', status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}

function okJson(payload) {
  return rawResponse(JSON.stringify(payload));
}

function openRouterHandler(options = {}) {
  return createNovaChatHandler({
    getOpenRouterApiKey: () => OPENROUTER_KEY,
    getGeminiApiKey: () => '',
    getArenaApiKey: () => '',
    ...options,
  });
}

function geminiHandler(options = {}) {
  return createNovaChatHandler({
    getOpenRouterApiKey: () => '',
    getGeminiApiKey: () => GEMINI_KEY,
    getArenaApiKey: () => '',
    getGeminiModel: () => 'gemini-3.8-flash',
    ...options,
  });
}

const chatReply = (text = 'The ISS orbits at about 408 km.') => okJson({
  model: OPENROUTER_FREE_MODEL,
  choices: [{ message: { role: 'assistant', content: text } }],
});

test('the request budget fits inside the function limit and is no longer 8 s', () => {
  // vercel.json keeps `maxDuration: 30`; the chain must leave room for the
  // offline answer, so the whole budget stays below it with a margin.
  assert.ok(UPSTREAM_TIMEOUT_MS >= 12_000, `per-attempt timeout is ${UPSTREAM_TIMEOUT_MS} ms`);
  assert.ok(AUTO_CHAIN_BUDGET_MS <= 27_000, `chain budget is ${AUTO_CHAIN_BUDGET_MS} ms`);
  assert.ok(UPSTREAM_TIMEOUT_MS < AUTO_CHAIN_BUDGET_MS, 'one attempt may not consume the whole chain');
});

test('body shapes are named, never echoed', () => {
  assert.equal(classifyBodyShape('', 'application/json'), 'empty');
  assert.equal(classifyBodyShape('<!DOCTYPE html><html>blocked</html>'), 'html');
  assert.equal(classifyBodyShape('data: {"choices":[]}\n\n', 'text/event-stream'), 'event-stream');
  assert.equal(classifyBodyShape('{"choices": [{"message"'), 'truncated-json');
  assert.equal(classifyBodyShape('Service Unavailable', 'text/plain'), 'text');
});

test('an event-stream body still yields the answer text', () => {
  const openai = [
    'data: {"model":"example/model:free","choices":[{"delta":{"content":"The ISS "}}]}',
    'data: {"choices":[{"delta":{"content":"orbits at 408 km."}}]}',
    'data: [DONE]',
    '',
  ].join('\n');
  assert.deepEqual(textFromEventStream(openai), { text: 'The ISS orbits at 408 km.', model: 'example/model:free' });

  const gemini = 'data: {"candidates":[{"content":{"parts":[{"text":"408 km"}]}}]}\n\n';
  assert.equal(textFromEventStream(gemini).text, '408 km');
});

test('a 200 whose body is cut off by the timer is a timeout, not an unreadable response', async () => {
  let calls = 0;
  const handler = openRouterHandler({
    timeoutMs: 30,
    fetchImpl: async (_url, init) => {
      calls += 1;
      // Headers arrive; the body never finishes before the abort fires.
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: () => new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const error = new Error('terminated');
            error.name = 'AbortError';
            reject(error);
          }, { once: true });
        }),
      };
    },
  });

  const response = await handler({ body: { ...body, provider: 'openrouter' }, ip: '203.0.113.21' });

  assert.equal(response.status, 200, 'the local engine still answers');
  assert.equal(response.body.fallback, true);
  assert.equal(response.body.fallbackChain[0].code, 'AI_TIMEOUT', 'the abort is reported as a timeout');
  assert.equal(response.body.fallbackChain[0].phase, 'body', 'and says which phase timed out');
  assert.equal(response.body.fallbackChain[0].status, 504);
  assert.ok(calls >= 1);
});

test('an HTML page from a proxy is retried once, and a healthy retry answers', async () => {
  let calls = 0;
  const handler = openRouterHandler({
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return rawResponse('<html><body>blocked</body></html>', { contentType: 'text/html' });
      return chatReply('Recovered on the second attempt.');
    },
  });

  const response = await handler({ body: { ...body, provider: 'openrouter' }, ip: '203.0.113.22' });

  assert.equal(response.status, 200);
  assert.equal(response.body.provider, 'OpenRouter');
  assert.match(response.body.text, /Recovered on the second attempt/);
  assert.equal(response.body.attempts, 2, 'the retry is visible in the response');
  assert.equal(calls, 2);
});

test('two unreadable responses are reported with their shape and fall back safely', async () => {
  let calls = 0;
  const handler = openRouterHandler({
    fetchImpl: async () => {
      calls += 1;
      return rawResponse(`<html>${OPENROUTER_KEY}</html>`, { contentType: 'text/html' });
    },
  });

  const response = await handler({ body: { ...body, provider: 'openrouter' }, ip: '203.0.113.23' });
  const hop = response.body.fallbackChain[0];

  assert.equal(response.body.fallback, true);
  assert.equal(hop.code, 'INVALID_PROVIDER_RESPONSE');
  assert.equal(hop.bodyShape, 'html', 'the body shape is the evidence');
  assert.equal(hop.attempts, 2, 'one bounded retry');
  assert.equal(calls, 2);
  assert.doesNotMatch(JSON.stringify(response), /sk-or-v1-resilience/, 'provider content never reaches the client');
});

test('a truncated JSON body is named as such instead of "not JSON"', async () => {
  const handler = openRouterHandler({
    fetchImpl: async () => rawResponse('{"choices": [{"message": {"content": "The IS'),
  });
  const response = await handler({ body: { ...body, provider: 'openrouter' }, ip: '203.0.113.24' });
  assert.equal(response.body.fallbackChain[0].bodyShape, 'truncated-json');
});

test('a streamed answer is reassembled instead of rejected', async () => {
  const stream = [
    'data: {"model":"example/model:free","choices":[{"delta":{"content":"The ISS orbits "}}]}',
    'data: {"choices":[{"delta":{"content":"at roughly 408 km."}}]}',
    'data: [DONE]',
    '',
  ].join('\n');
  const handler = openRouterHandler({
    fetchImpl: async () => rawResponse(stream, { contentType: 'text/event-stream' }),
  });

  const response = await handler({ body: { ...body, provider: 'openrouter' }, ip: '203.0.113.25' });
  assert.equal(response.status, 200);
  assert.equal(response.body.provider, 'OpenRouter');
  assert.match(response.body.text, /408 km/);
});

test('an overloaded Gemini id is retried on the same id before another one is tried', async () => {
  resetGeminiDiscoveryCache();
  const urls = [];
  const handler = geminiHandler({
    fetchImpl: async (url) => {
      urls.push(String(url));
      if (urls.length === 1) {
        return rawResponse('{"error":{"code":503}}', { status: 503 });
      }
      return okJson({ candidates: [{ content: { parts: [{ text: 'Retried and answered.' }] } }] });
    },
  });

  const response = await handler({ body: { ...body, provider: 'gemini' }, ip: '203.0.113.26' });

  assert.equal(response.status, 200);
  assert.equal(response.body.provider, 'Google Gemini');
  assert.equal(urls.length, 2);
  assert.ok(urls[0].includes('gemini-3.8-flash') && urls[1].includes('gemini-3.8-flash'), 'the retry keeps the same id');
  assert.equal(response.body.modelsTried, undefined);
});

test('when every static model fails, the key catalogue supplies a model that answers', async () => {
  resetGeminiDiscoveryCache();
  const urls = [];
  const handler = geminiHandler({
    fetchImpl: async (url) => {
      urls.push(String(url));
      if (String(url).includes('/models?pageSize=')) {
        return okJson({
          models: [
            { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-3.9-flash-preview', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-3.8-image', supportedGenerationMethods: ['generateContent'] },
          ],
        });
      }
      if (String(url).includes('gemini-3.9-flash-preview')) {
        return okJson({ candidates: [{ content: { parts: [{ text: 'Answered by the discovered model.' }] } }] });
      }
      // Everything the code knows about is refused: 503 for the busy ids, 404 for retired ones.
      return rawResponse('{"error":{}}', { status: String(url).includes('gemini-2.5') ? 404 : 503 });
    },
  });

  const response = await handler({ body: { ...body, provider: 'gemini' }, ip: '203.0.113.27' });

  assert.equal(response.status, 200);
  assert.equal(response.body.model, 'gemini-3.9-flash-preview');
  assert.equal(response.body.requestedModel, 'gemini-3.8-flash');
  assert.equal(response.body.modelFallback, true);
  assert.ok(urls.some((url) => url.includes('/models?pageSize=')), 'the catalogue was consulted');
  assert.equal(urls.some((url) => url.includes('gemini-3.8-image')), false, 'image models are never called');
});

test('the catalogue filter keeps chat models and drops the rest', () => {
  const picked = pickGeminiChatModels([
    'models/gemini-3.8-flash',
    'gemini-3.9-flash-preview',
    'gemini-3.8-pro',
    'gemini-3.8-flash-image',
    'gemini-2.5-flash',
    'antigravity-preview-09-2026',
    'gemini-3.8-flash-preview-tts',
  ]);
  assert.deepEqual(picked, ['gemini-3.8-flash', 'gemini-3.9-flash-preview', 'gemini-3.8-pro']);
});

test('a retired free router falls back to the documented alternative router', async () => {
  const seen = [];
  const handler = openRouterHandler({
    fetchImpl: async (_url, init) => {
      const payload = JSON.parse(init.body);
      seen.push(payload.model);
      if (payload.model === OPENROUTER_FREE_MODEL) return rawResponse('{"error":{}}', { status: 404 });
      return okJson({ model: payload.model, choices: [{ message: { content: 'Answer from the auto router.' } }] });
    },
  });

  const response = await handler({ body: { ...body, provider: 'openrouter' }, ip: '203.0.113.28' });
  assert.equal(response.status, 200);
  assert.deepEqual(seen, [OPENROUTER_FREE_MODEL, OPENROUTER_FALLBACK_MODEL]);
  assert.equal(response.body.requestedModel, OPENROUTER_FREE_MODEL);
  assert.equal(response.body.modelFallback, true);
});

test('every provider hanging still answers quickly and inside the budget', async () => {
  const started = Date.now();
  const handler = createNovaChatHandler({
    getOpenRouterApiKey: () => OPENROUTER_KEY,
    getGeminiApiKey: () => GEMINI_KEY,
    getArenaApiKey: () => 'arena-resilience-test-key',
    timeoutMs: 120,
    budgetMs: 900,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
  });

  const response = await handler({ body, ip: '203.0.113.29' });
  const elapsed = Date.now() - started;

  assert.equal(response.status, 200);
  assert.equal(response.body.provider, 'NOVA Local Space Engine');
  assert.equal(response.body.fallback, true);
  assert.ok(elapsed < 3_000, `answered in ${elapsed} ms`);
  assert.equal(response.body.fallbackChain.length, 3, 'all three providers were tried, each within budget');
});
