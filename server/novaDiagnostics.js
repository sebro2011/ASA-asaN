/**
 * NOVA AI provider diagnostics.
 *
 * Answers one question honestly: *can this deployment actually reach the AI
 * providers it advertises, right now?* The public config endpoint only reports
 * whether a key is set; a set key can still be expired, out of free-tier
 * credit, or pointed at a model the key may not use. This endpoint performs one
 * minimal request per provider and reports the upstream status code, the
 * latency and a redacted reason.
 *
 * Safety rules:
 *  - no API key, and no fragment of one, is ever returned (every upstream
 *    message is redacted, and the value itself is scrubbed);
 *  - upstream bodies are never echoed — only a status code and a short reason;
 *  - the deep probe costs one token per provider and is throttled, so it cannot
 *    be used to burn a key's quota.
 */
import {
  ARENA_BASE_URL,
  DEFAULT_GEMINI_MODEL,
  GEMINI_GENERATE_CONTENT_URL,
  OPENROUTER_CHAT_COMPLETIONS_URL,
  geminiGenerationConfig,
  OPENROUTER_FREE_MODEL,
} from './novaChat.js';

// One probe may now take longer than the old 6 s: probes run in parallel, so the
// worst case for the whole endpoint is a single timeout, not the sum of three.
// Gemini 3.x needs the headroom even at the "low" thinking level.
const PROBE_TIMEOUT_MS = 12_000;
const PROBE_COOLDOWN_MS = 10_000;
const MAX_REASON_CHARS = 180;

function envValue(env, key) {
  const value = env?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** Strip anything that looks like a credential, plus the live key values. */
export function redactReason(text, secrets = []) {
  let out = typeof text === 'string' ? text : '';
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 8) out = out.split(secret).join('[redacted]');
  }
  out = out
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/sk-or-[A-Za-z0-9._-]+/gi, '[redacted]')
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[redacted]')
    .replace(/\bkey=[A-Za-z0-9._-]+/gi, 'key=[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  return out.length > MAX_REASON_CHARS ? `${out.slice(0, MAX_REASON_CHARS - 1)}…` : out;
}

/** A provider-specific one-token request. Returns `{url, init}`. */
function probeRequest(provider, { keys, models }) {
  if (provider === 'openrouter') {
    return {
      url: OPENROUTER_CHAT_COMPLETIONS_URL,
      init: {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${keys.openrouter}`,
          'Content-Type': 'application/json',
          'X-Title': 'NOVA AI diagnostics',
        },
        body: JSON.stringify({
          model: models.openrouter,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
      },
    };
  }

  if (provider === 'gemini') {
    return {
      url: `${GEMINI_GENERATE_CONTENT_URL}/${encodeURIComponent(models.gemini)}:generateContent`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': keys.gemini },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
          // Same shape the chat handler sends: Gemini 3.x rejects `temperature`
          // and thinks at "medium" by default, which alone can outlast the probe.
          generationConfig: probeGenerationConfig(models.gemini),
        }),
      },
    };
  }

  return {
    url: ARENA_BASE_URL,
    init: {
      method: 'POST',
      headers: { Authorization: `Bearer ${keys.arena}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: models.arena,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
    },
  };
}

/** One-token probe config that matches how NOVA actually calls the model. */
export function probeGenerationConfig(model) {
  const config = { ...geminiGenerationConfig(model), maxOutputTokens: 1 };
  if ('temperature' in config) config.temperature = 0;
  return config;
}

/** Turn an HTTP status into the same vocabulary the chat handler uses. */
function codeForStatus(status) {
  if (status === 401 || status === 403) return 'PROVIDER_AUTH_ERROR';
  if (status === 402) return 'PROVIDER_CREDIT_REQUIRED';
  if (status === 404) return 'PROVIDER_MODEL_NOT_FOUND';
  if (status === 429) return 'UPSTREAM_RATE_LIMITED';
  if (status === 408 || status === 504) return 'AI_TIMEOUT';
  if (status >= 500) return 'PROVIDER_UNAVAILABLE';
  if (status >= 400) return 'PROVIDER_REJECTED';
  return 'OK';
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid-url';
  }
}

async function probe({ fetchImpl, provider, keys, models, secrets, timeoutMs, now }) {
  const { url, init } = probeRequest(provider, { keys, models });
  const started = now();
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetchImpl(url, controller ? { ...init, signal: controller.signal } : init);
    const ms = now() - started;
    const status = typeof response?.status === 'number' ? response.status : 0;

    let reason = '';
    if (status >= 400) {
      // Read only enough to name the problem; never echo the body back wholesale.
      try {
        const text = await response.text();
        reason = redactReason(typeof text === 'string' ? text : '', secrets);
      } catch {
        reason = '';
      }
    }

    return {
      reachable: status > 0,
      ok: status >= 200 && status < 300,
      status,
      ms,
      code: codeForStatus(status),
      reason: reason || undefined,
    };
  } catch (error) {
    const ms = now() - started;
    const aborted = error?.name === 'AbortError';
    return {
      reachable: false,
      ok: false,
      status: 0,
      ms,
      code: aborted ? 'AI_TIMEOUT' : 'UPSTREAM_NETWORK_ERROR',
      reason: redactReason(aborted ? `no answer within ${timeoutMs} ms` : error?.message || 'network error', secrets),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   env?: Record<string, string | undefined>,
 *   timeoutMs?: number,
 *   now?: () => number,
 * }} [options]
 */
export function createDiagnosticsHandler({
  fetchImpl = (...args) => globalThis.fetch(...args),
  env = typeof process !== 'undefined' ? process.env : {},
  timeoutMs = PROBE_TIMEOUT_MS,
  now = Date.now,
} = {}) {
  let lastProbeAt = 0;

  return async function handleNovaDiagnostics({ probe: deep = false } = {}) {
    const keys = {
      openrouter: envValue(env, 'OPENROUTER_API_KEY'),
      gemini: envValue(env, 'GEMINI_API_KEY'),
      arena: envValue(env, 'ARENA_API_KEY'),
    };
    const models = {
      openrouter: envValue(env, 'NOVA_OPENROUTER_MODEL') || OPENROUTER_FREE_MODEL,
      gemini: envValue(env, 'NOVA_GEMINI_MODEL') || DEFAULT_GEMINI_MODEL,
      arena: envValue(env, 'NOVA_ARENA_MODEL') || 'arena_smart.aria',
    };
    const secrets = Object.values(keys).filter(Boolean);

    const providers = {
      local: {
        provider: 'NOVA Local Space Engine',
        configured: true,
        endpoint: 'in-process',
        model: 'nasa-local-engine',
        status: 'ok',
        code: 'OK',
      },
    };

    const wantProbe = deep && now() - lastProbeAt >= PROBE_COOLDOWN_MS;
    const throttled = deep && !wantProbe;
    if (wantProbe) lastProbeAt = now();

    const endpoints = {
      openrouter: OPENROUTER_CHAT_COMPLETIONS_URL,
      gemini: GEMINI_GENERATE_CONTENT_URL,
      arena: ARENA_BASE_URL,
    };
    const names = { openrouter: 'OpenRouter', gemini: 'Google Gemini', arena: 'Arena AI' };

    const providerIds = ['openrouter', 'gemini', 'arena'];

    // Probes run concurrently: they are independent, and a slow model would
    // otherwise spend the next provider's budget as well. Sequential probing is
    // what forced a 6 s timeout, which Gemini 3.x cannot always meet.
    const outcomes = await Promise.all(
      providerIds.map(async (provider) => {
        const entry = {
          provider: names[provider],
          configured: Boolean(keys[provider]),
          endpoint: hostOf(endpoints[provider]),
          model: models[provider],
          status: keys[provider] ? 'configured' : 'not-configured',
          code: keys[provider] ? 'NOT_PROBED' : 'PROVIDER_NOT_CONFIGURED',
        };
        if (!entry.configured || !wantProbe) return entry;

        const outcome = await probe({ fetchImpl, provider, keys, models, secrets, timeoutMs, now });
        entry.status = outcome.ok ? 'ok' : 'error';
        entry.code = outcome.code;
        entry.httpStatus = outcome.status;
        entry.ms = outcome.ms;
        entry.reachable = outcome.reachable;
        if (outcome.reason) entry.reason = outcome.reason;
        return entry;
      }),
    );

    providerIds.forEach((provider, index) => { providers[provider] = outcomes[index]; });
    const probes = outcomes.filter((entry) => entry.status === 'ok' || entry.status === 'error').length;

    return {
      checkedAt: new Date(now()).toISOString(),
      // Environment plus short commit: two deployments can serve the same URL
      // over time, and 'production' alone cannot tell them apart.
      deployment: [envValue(env, 'VERCEL_ENV') || 'local', envValue(env, 'VERCEL_GIT_COMMIT_SHA').slice(0, 7)].filter(Boolean).join(' · '),
      // `probed` means an upstream request actually ran, not that probing was allowed.
      probed: probes > 0,
      throttled,
      providers,
    };
  };
}

export const handleNovaDiagnostics = createDiagnosticsHandler();
