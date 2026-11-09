/**
 * AI provider diagnostics — behaviour tests.
 *
 * The point of this endpoint is to tell the truth about *why* a provider is
 * failing, so these tests care most about two things: the provider-specific
 * error codes, and the guarantee that no key ever leaks into the response.
 *
 * Run: node --import tsx --test scripts/test-nova-diagnostics.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiagnosticsHandler, redactReason } from '../server/novaDiagnostics.js';
import vercelDiagnosticsHandler from '../api/nova/diagnostics.js';

const KEYS = {
  OPENROUTER_API_KEY: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789',
  GEMINI_API_KEY: 'AIzaSyA1b2C3d4E5f6G7h8I9j0KlMnOpQrStUv',
  ARENA_API_KEY: 'arena_key_0123456789abcdef',
};

function envWith(extra = {}) {
  return { ...KEYS, ...extra };
}

/** Records every call and replies with the given status/body. */
function fetchStub({ status = 200, body = '{}', throwError = null, hang = false } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (hang) {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }
    if (throwError) throw throwError;
    return {
      status,
      ok: status >= 200 && status < 300,
      text: async () => body,
      json: async () => JSON.parse(body),
    };
  };
  return { impl, calls };
}

test('without keys every online provider is reported as not configured', async () => {
  const { impl, calls } = fetchStub();
  const handler = createDiagnosticsHandler({ fetchImpl: impl, env: {} });
  const report = await handler({ probe: true });

  assert.equal(calls.length, 0, 'no request is made for an unconfigured provider');
  assert.equal(report.providers.local.status, 'ok');
  for (const provider of ['openrouter', 'gemini', 'arena']) {
    assert.equal(report.providers[provider].configured, false);
    assert.equal(report.providers[provider].code, 'PROVIDER_NOT_CONFIGURED');
  }
});

test('a shallow check reports configuration without spending a request', async () => {
  const { impl, calls } = fetchStub();
  const handler = createDiagnosticsHandler({ fetchImpl: impl, env: envWith() });
  const report = await handler({ probe: false });

  assert.equal(calls.length, 0);
  assert.equal(report.probed, false);
  for (const provider of ['openrouter', 'gemini', 'arena']) {
    assert.equal(report.providers[provider].configured, true);
    assert.equal(report.providers[provider].code, 'NOT_PROBED');
    assert.equal(report.providers[provider].status, 'configured');
  }
  assert.equal(report.providers.gemini.endpoint, 'generativelanguage.googleapis.com');
  assert.equal(report.providers.openrouter.endpoint, 'openrouter.ai');
});

test('a healthy provider is reported as ok', async () => {
  const { impl, calls } = fetchStub({ status: 200, body: '{"ok":true}' });
  const handler = createDiagnosticsHandler({ fetchImpl: impl, env: envWith() });
  const report = await handler({ probe: true });

  const probed = calls.filter((call) => !call.url.includes('api.arena.ai'));
  assert.equal(probed.length, 2, 'openrouter and gemini are probed');
  assert.equal(report.providers.openrouter.status, 'ok');
  assert.equal(report.providers.openrouter.httpStatus, 200);
  assert.equal(report.providers.gemini.status, 'ok');
  assert.equal(report.probed, true);
});

test('upstream failures map to the chat handler vocabulary', async () => {
  const cases = [
    [401, 'PROVIDER_AUTH_ERROR'],
    [402, 'PROVIDER_CREDIT_REQUIRED'],
    [403, 'PROVIDER_AUTH_ERROR'],
    [404, 'PROVIDER_MODEL_NOT_FOUND'],
    [429, 'UPSTREAM_RATE_LIMITED'],
    [500, 'PROVIDER_UNAVAILABLE'],
    [503, 'PROVIDER_UNAVAILABLE'],
  ];

  for (const [status, code] of cases) {
    const { impl } = fetchStub({ status, body: `{"error":"upstream says ${status}"}` });
    const handler = createDiagnosticsHandler({ fetchImpl: impl, env: envWith() });
    const report = await handler({ probe: true });
    assert.equal(report.providers.gemini.code, code, `status ${status}`);
    assert.equal(report.providers.gemini.status, 'error');
    assert.equal(report.providers.gemini.httpStatus, status);
  }
});

test('network failures and timeouts are named, not swallowed', async () => {
  const refused = createDiagnosticsHandler({
    fetchImpl: fetchStub({ throwError: new TypeError('fetch failed: ENOTFOUND openrouter.ai') }).impl,
    env: envWith(),
  });
  const report = await refused({ probe: true });
  assert.equal(report.providers.openrouter.code, 'UPSTREAM_NETWORK_ERROR');
  assert.match(report.providers.openrouter.reason, /ENOTFOUND/);

  const timedOut = createDiagnosticsHandler({
    fetchImpl: fetchStub({ hang: true }).impl,
    env: envWith(),
    timeoutMs: 20,
    keyCheckTimeoutMs: 20,
    now: () => Date.now(),
  });
  const slow = await timedOut({ probe: true });
  assert.equal(slow.providers.gemini.code, 'AI_TIMEOUT');
});

/** A stub that answers metadata calls and can hang the generation call. */
function keyCheckStub({ keyStatus = 200, generation = 'ok' } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, method: init?.method || 'GET' });
    // The generation call POSTs to `/v1beta/models/<model>:generateContent`; the
    // key check is the GET variant, so method is what tells them apart.
    const method = (init?.method || 'GET').toUpperCase();
    const isKeyCheck = (method === 'GET' && url.includes('/v1beta/models')) || url.endsWith('/api/v1/key');
    if (isKeyCheck) {
      return { status: keyStatus, ok: keyStatus < 300, text: async () => '{}', json: async () => ({}) };
    }
    if (generation === 'hang') {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }
    return { status: 200, ok: true, text: async () => '{}', json: async () => ({}) };
  };
  return { impl, calls };
}

test('a timed-out generation is explained by a token-free key check', async () => {
  const { impl, calls } = keyCheckStub({ keyStatus: 200, generation: 'hang' });
  const handler = createDiagnosticsHandler({
    fetchImpl: impl,
    env: envWith(),
    timeoutMs: 20,
    keyCheckTimeoutMs: 200,
    now: () => Date.now(),
  });
  const report = await handler({ probe: true });

  const gemini = report.providers.gemini;
  assert.equal(gemini.code, 'AI_TIMEOUT', 'the generation probe still reports the timeout');
  assert.equal(gemini.keyValid, true, 'the key itself is valid');
  assert.equal(gemini.keyCheck.request, 'GET /v1beta/models');
  assert.equal(gemini.keyCheck.httpStatus, 200);
  assert.ok(calls.some((call) => call.url.includes('/v1beta/models')), 'the metadata call was made');
});

test('a rejected key is reported as an auth error, not as a timeout', async () => {
  const { impl } = keyCheckStub({ keyStatus: 403, generation: 'hang' });
  const handler = createDiagnosticsHandler({
    fetchImpl: impl,
    env: envWith(),
    timeoutMs: 20,
    keyCheckTimeoutMs: 200,
    now: () => Date.now(),
  });
  const report = await handler({ probe: true });

  assert.equal(report.providers.gemini.keyValid, false);
  assert.equal(report.providers.gemini.code, 'PROVIDER_AUTH_ERROR');
  assert.equal(report.providers.gemini.keyCheck.httpStatus, 403);
});

test('no key fragment can appear anywhere in the report', async () => {
  const echo = JSON.stringify({
    error: `invalid api key ${KEYS.OPENROUTER_API_KEY}`,
    hint: 'Authorization: Bearer ' + KEYS.GEMINI_API_KEY,
  });
  const { impl } = fetchStub({ status: 401, body: echo });
  const handler = createDiagnosticsHandler({ fetchImpl: impl, env: envWith() });
  const report = await handler({ probe: true });
  const serialised = JSON.stringify(report);

  for (const key of Object.values(KEYS)) {
    assert.equal(serialised.includes(key), false, 'the key itself never appears');
    assert.equal(serialised.includes(key.slice(0, 12)), false, 'not even a leading fragment');
  }
  assert.match(report.providers.gemini.reason, /redacted/);
});

test('redactReason strips credential shapes and caps the length', () => {
  assert.equal(redactReason('Bearer abc.def.ghi is bad'), 'Bearer [redacted] is bad');
  assert.equal(redactReason('sk-or-v1-zzzzzz rejected'), '[redacted] rejected');
  assert.equal(redactReason(`leak ${KEYS.GEMINI_API_KEY}`, [KEYS.GEMINI_API_KEY]), 'leak [redacted]');
  assert.equal(redactReason('x'.repeat(400)).length, 180);
  assert.equal(redactReason(undefined), '');
});

test('the deep probe is throttled so it cannot drain a provider quota', async () => {
  let clock = 1_000_000;
  const { impl, calls } = fetchStub({ status: 200 });
  const handler = createDiagnosticsHandler({ fetchImpl: impl, env: envWith(), now: () => clock });

  const first = await handler({ probe: true });
  const afterFirst = calls.length;
  assert.equal(first.probed, true);

  const second = await handler({ probe: true });
  assert.equal(second.probed, false);
  assert.equal(second.throttled, true);
  assert.equal(calls.length, afterFirst, 'no extra upstream request inside the cooldown');

  clock += 11_000;
  const third = await handler({ probe: true });
  assert.equal(third.probed, true);
  assert.ok(calls.length > afterFirst);
});

test('the Vercel route only answers GET and never caches', async () => {
  function fakeResponse() {
    const state = { status: 0, headers: {}, body: null };
    return {
      state,
      setHeader(name, value) {
        state.headers[name.toLowerCase()] = value;
      },
      status(code) {
        state.status = code;
        return this;
      },
      json(payload) {
        state.body = payload;
        return this;
      },
    };
  }

  const post = fakeResponse();
  await vercelDiagnosticsHandler({ method: 'POST', query: {} }, post);
  assert.equal(post.state.status, 405);
  assert.equal(post.state.headers['cache-control'], 'no-store');

  const get = fakeResponse();
  await vercelDiagnosticsHandler({ method: 'GET', query: { probe: '1' } }, get);
  assert.equal(get.state.status, 200);
  assert.equal(get.state.headers['cache-control'], 'no-store');
  assert.equal(get.state.body.providers.local.configured, true);
  assert.equal(get.state.body.probed, false, 'no keys in the test environment');
});

test('the Gemini probe uses the same generation config shape as chat', async () => {
  const { probeGenerationConfig } = await import('../server/novaDiagnostics.js');

  assert.deepEqual(probeGenerationConfig('gemini-3.8-flash'), {
    maxOutputTokens: 1,
    thinkingConfig: { thinkingLevel: 'low' },
  });
  assert.equal('temperature' in probeGenerationConfig('gemini-3.8-flash'), false);

  const legacy = probeGenerationConfig('gemini-2.5-flash');
  assert.equal(legacy.temperature, 0);
  assert.equal(legacy.maxOutputTokens, 1);
  assert.equal('thinkingConfig' in legacy, false);
});

test('probes run concurrently, so one slow model does not spend another budget', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const impl = async () => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 40));
    inFlight -= 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'pong' } }],
        candidates: [{ content: { parts: [{ text: 'pong' }] } }],
      }),
    };
  };

  const handler = createDiagnosticsHandler({ fetchImpl: impl, env: envWith() });
  const report = await handler({ probe: true });

  assert.equal(maxInFlight >= 2, true, 'at least two probes should overlap');
  for (const provider of ['openrouter', 'gemini', 'arena']) {
    assert.equal(report.providers[provider].status, 'ok', `${provider} should still be probed`);
  }
});

test('a bogus NOVA_GEMINI_MODEL is named, and the default is probed instead', async () => {
  const calls = [];
  const impl = async (url) => {
    calls.push(String(url));
    // A model id that does not exist: 404 NOT_FOUND. The default id answers.
    if (String(url).includes('gemini-9.9-ultra')) {
      return { status: 404, ok: false, text: async () => '{"error":{"code":404,"message":"models/gemini-9.9-ultra is not found"}}', json: async () => ({}) };
    }
    return { status: 200, ok: true, text: async () => '{"candidates":[]}', json: async () => ({ candidates: [] }) };
  };

  const handler = createDiagnosticsHandler({
    fetchImpl: impl,
    env: envWith({ NOVA_GEMINI_MODEL: 'gemini-9.9-ultra' }),
  });
  const report = await handler({ probe: true });
  const gemini = report.providers.gemini;

  assert.equal(gemini.model, 'gemini-9.9-ultra');
  assert.equal(gemini.modelInvalid, true, 'the report says the model id is wrong');
  assert.equal(gemini.code, 'PROVIDER_MODEL_NOT_FOUND');
  assert.match(gemini.hint, /is not a Gemini model id/);
  assert.match(gemini.fallbackModel.model, /^gemini-/);
  assert.equal(gemini.fallbackModel.ok, true, 'the retry proves another model works with this key');
  assert.match(gemini.hint, /not a key problem/);
  assert.equal(calls.filter((url) => url.includes('gemini-9.9-ultra')).length, 1, 'the bad id is tried once, not looped');
});

test('an overloaded model is reported as overloaded, not as a bad model id', async () => {
  // This is what the live API actually said about the default model: 503, high
  // demand. It must not be dressed up as a configuration error.
  const impl = async () => ({
    status: 503,
    ok: false,
    text: async () => '{"error":{"code":503,"message":"This model is currently experiencing high demand."}}',
    json: async () => ({}),
  });
  const handler = createDiagnosticsHandler({ fetchImpl: impl, env: envWith() });
  const report = await handler({ probe: true });
  const gemini = report.providers.gemini;

  assert.equal(gemini.code, 'PROVIDER_UNAVAILABLE');
  assert.equal(gemini.httpStatus, 503);
  assert.equal(gemini.modelInvalid, undefined, 'a valid but busy model is not "invalid"');
});

test('the busy default is compared against the alias, without probing the same id twice', async () => {
  const calls = [];
  const impl = async (url) => {
    calls.push(String(url));
    // The default model is overloaded; the alias is fine.
    if (String(url).includes('gemini-3.8-flash')) {
      return { status: 503, ok: false, text: async () => '{"error":{"code":503}}', json: async () => ({}) };
    }
    return { status: 200, ok: true, text: async () => '{"candidates":[]}', json: async () => ({ candidates: [] }) };
  };
  const handler = createDiagnosticsHandler({ fetchImpl: impl, env: envWith() });
  const report = await handler({ probe: true });
  const gemini = report.providers.gemini;

  // envWith() sets no NOVA_GEMINI_MODEL, so the default is what was probed.
  assert.equal(gemini.modelInvalid, undefined, 'a busy model is not an invalid model');
  assert.notEqual(gemini.fallbackModel.model, 'gemini-3.8-flash');
  assert.equal(gemini.fallbackModel.ok, true);
  assert.match(gemini.hint, /model problem and not a key problem/);

  const modelUrls = calls.filter((url) => url.includes('/models/'));
  assert.equal(new Set(modelUrls).size, modelUrls.length, 'no model id is probed twice');
});


