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
  AUTO_CHAIN_BUDGET_MS,
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_FALLBACKS,
  GEMINI_GENERATE_CONTENT_URL,
  OPENROUTER_CHAT_COMPLETIONS_URL,
  UPSTREAM_TIMEOUT_MS,
  createNovaChatHandler,
  geminiGenerationConfig,
  OPENROUTER_FREE_MODEL,
} from './novaChat.js';
import { getNovaLocalInferenceConfig } from './novaLocalInference.js';

// One probe may now take longer than the old 6 s: probes run in parallel, so the
// worst case for the whole endpoint is a single timeout, not the sum of three.
// Gemini 3.x needs the headroom even at the "low" thinking level; 20 s leaves
// room for a cold model without holding the request for a minute.
const PROBE_TIMEOUT_MS = 20_000;
// A key check is a metadata call (no tokens). It only runs after a generation
// probe timed out, to tell "the key is rejected" apart from "the model is slow".
const KEY_CHECK_TIMEOUT_MS = 6_000;
const PROBE_COOLDOWN_MS = 10_000;
const MAX_REASON_CHARS = 180;
// The chat self-test spends real tokens on a real completion, so it is both
// opt-in (`?chat=1`) and throttled harder than the one-token probe.
const CHAT_PROBE_COOLDOWN_MS = 30_000;
const CHAT_PROBE_PROMPT = 'Reply with the single word: OK';
// A self-test is a GET that a person waits for, so each provider is bounded and
// isolated: one provider cannot spend another's budget, and the whole report
// returns inside a browser request.
// Deliberately shorter than a real chat hop (15 s): a self-test answers "does a
// completion come back at all", and it has to fit in one browser request. A
// provider that needs longer reports AI_TIMEOUT here and still gets its full
// budget from `/api/nova/chat`.
const CHAT_PROBE_TIMEOUT_MS = 6_000;
const CHAT_PROBE_BUDGET_MS = 7_000;

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

/**
 * Cheap metadata calls that validate a key without spending tokens.
 * `openrouter` GET /api/v1/key returns the key's label and limits;
 * Gemini's models list is authorised by the same key as generation.
 */
const KEY_CHECKS = {
  openrouter: (key) => ({
    label: 'GET /api/v1/key',
    url: 'https://openrouter.ai/api/v1/key',
    init: { method: 'GET', headers: { Authorization: `Bearer ${key}` } },
  }),
  gemini: (key) => ({
    label: 'GET /v1beta/models',
    url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
    init: { method: 'GET', headers: { 'x-goog-api-key': key } },
  }),
};

/**
 * Which models can this key actually call? A 503 on one id says nothing about
 * the others, so on a Gemini failure the report lists what the key may use.
 * Returns [] when the list cannot be read; never throws.
 */
async function listGeminiModels({ fetchImpl, key, secrets, timeoutMs, now }) {
  if (!key) return [];
  const started = now();
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
      method: 'GET',
      headers: { 'x-goog-api-key': key },
      ...(controller ? { signal: controller.signal } : {}),
    });
    const status = typeof response?.status === 'number' ? response.status : 0;
    if (status < 200 || status >= 300 || typeof response.json !== 'function') return [];
    const data = await response.json();
    const models = Array.isArray(data?.models) ? data.models : [];
    return models
      .filter((model) => Array.isArray(model?.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'))
      .map((model) => String(model?.name || '').replace(/^models\//, ''))
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
    void started;
    void secrets;
  }
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

/**
 * Validate a key with a token-free request.
 * @returns {Promise<{ valid: boolean|null, httpStatus: number, ms: number, code: string, check: string }|null>}
 */
async function validateKey({ fetchImpl, provider, keys, secrets, timeoutMs, now }) {
  const build = KEY_CHECKS[provider];
  if (!build || !keys[provider]) return null;
  const { label, url, init } = build(keys[provider]);
  const started = now();
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(url, controller ? { ...init, signal: controller.signal } : init);
    const status = typeof response?.status === 'number' ? response.status : 0;
    return {
      valid: status >= 200 && status < 300 ? true : status === 401 || status === 403 ? false : null,
      httpStatus: status,
      ms: now() - started,
      code: codeForStatus(status),
      check: label,
    };
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    return {
      valid: null,
      httpStatus: 0,
      ms: now() - started,
      code: aborted ? 'AI_TIMEOUT' : 'UPSTREAM_NETWORK_ERROR',
      check: label,
      reason: redactReason(aborted ? `key check timed out after ${timeoutMs} ms` : error?.message || 'network error', secrets),
    };
  } finally {
    if (timer) clearTimeout(timer);
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
  keyCheckTimeoutMs = KEY_CHECK_TIMEOUT_MS,
  now = Date.now,
  // The chat self-test runs the *real* chat handler, so a green result means the
  // path a user takes works — not that a hand-written probe could reach a host.
  chatHandlerFactory = (options) => createNovaChatHandler(options),
} = {}) {
  let lastProbeAt = 0;
  let lastChatProbeAt = 0;
  // The self-test is expensive and slow by nature (a real completion), so a
  // throttled call returns the last report instead of an empty one. "Nothing
   // new for 30 s" is useful; "no information" is not.
  let lastChatSelfTest = null;

  return async function handleNovaDiagnostics({ probe: deep = false, chat: chatProbe = false } = {}) {
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

    const localInference = getNovaLocalInferenceConfig({ env });
    const providers = {
      local: localInference.configured
        ? {
            provider: `${localInference.provider} (local)`,
            configured: true,
            endpoint: 'loopback local runtime',
            model: localInference.model,
            status: 'configured',
            code: 'NOT_PROBED',
          }
        : {
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

    const wantChatProbe = chatProbe && now() - lastChatProbeAt >= CHAT_PROBE_COOLDOWN_MS;
    const chatThrottled = chatProbe && !wantChatProbe;
    if (wantChatProbe) lastChatProbeAt = now();

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

        // Gemini reports two very different things that both used to look like a
        // timeout: 404 NOT_FOUND means the configured *model id* does not exist
        // (a configuration error), while 503 says the model is overloaded. Name
        // the first, and in either case probe the alias so the report can say
        // whether a working model is reachable with this key.
        if (provider === 'gemini' && !outcome.ok) {
          const modelMissing = outcome.status === 404 || outcome.status === 422;
          const configuredModel = String(models.gemini || '');

          // What this key can actually call, asked BEFORE deciding what to say
          // or what to try next. This list is the only evidence that separates
          // "the model id is wrong" from "this key cannot use that model" —
          // without it, any explanation is a guess about quota or billing.
          const available = await listGeminiModels({
            fetchImpl,
            key: keys.gemini,
            secrets,
            timeoutMs: keyCheckTimeoutMs,
            now,
          });
          const listed = new Set(available);
          const modelListed = available.length ? listed.has(configuredModel) : undefined;

          if (modelMissing) {
            entry.modelInvalid = true;
            if (modelListed) {
              // The strongest, most surprising case: the key lists the model,
              // yet the call 404s. Say what that means instead of blaming the
              // model id.
              entry.hint = `The configured model is listed for this key, but the generateContent call returned HTTP ${outcome.status}. That points to access or API-version restrictions on this key or project, not to a missing model id.`;
            } else if (available.length) {
              entry.hint = `NOVA_GEMINI_MODEL is not among this key's ${available.length} generateContent models; set it to one of availableModels.`;
            } else {
              entry.hint = `The requested model returned HTTP ${outcome.status}; check NOVA_GEMINI_MODEL and whether this key can access that model.`;
            }
          }

          // Try the ids the key can actually see first. Calling one it cannot is
          // a wasted round trip, and its 404 adds nothing to the report.
          const alternatives = [...GEMINI_MODEL_FALLBACKS, DEFAULT_GEMINI_MODEL].filter((candidate) => candidate !== configuredModel);
          const ordered = [
            ...alternatives.filter((candidate) => listed.has(candidate)),
            ...alternatives.filter((candidate) => !listed.has(candidate)),
          ];
          const tried = [];
          for (const candidate of ordered) {
            const retry = await probe({ fetchImpl, provider, keys, models: { ...models, gemini: candidate }, secrets, timeoutMs, now });
            const attempt = { model: candidate, ok: retry.ok, httpStatus: retry.status, code: retry.code, ms: retry.ms };
            tried.push(attempt);
            if (retry.ok) {
              entry.fallbackModel = attempt;
              break;
            }
          }
          if (!entry.fallbackModel && tried.length) entry.fallbackModel = tried[tried.length - 1];
          entry.modelsTried = [configuredModel, ...tried.map((attempt) => attempt.model)];
          // `modelsTried` is a list of names; a name cannot say *why* an id failed.
          // Keeping each attempt's status is what separates "this id is retired"
          // (404) from "this id is merely busy" (429/503) when every attempt fails
          // — the case a live probe on 2026-11-13 ran into.
          entry.modelAttempts = tried;

          if (entry.fallbackModel?.ok) {
            // A model that answered is the only actionable evidence here: this key
            // *can* generate, it just cannot call the configured id. When that id
            // 404s while `models.list` still shows it, the usual reason is that the
            // model was retired for new projects — so name the working id instead
            // of leaving the operator to compare lists by hand.
            const pinned = modelMissing ? entry.fallbackModel.model : null;
            entry.hint = `${entry.hint ? `${entry.hint} ` : ''}${entry.fallbackModel.model} answered with the same key; the original model request failed. Review model availability and configuration.`
              + (pinned ? ` This key can generate: set NOVA_GEMINI_MODEL=${pinned} (or unset it to accept the default) so NOVA stops asking for an id this key cannot call. A listing in /v1beta/models is not an entitlement to call the model.` : '');
            if (pinned) entry.suggestedModel = pinned;
          } else {
            entry.hint = `${entry.hint ? `${entry.hint} ` : ''}No alternative model probe succeeded. Failures may have different causes; inspect the statuses and provider configuration before drawing a conclusion.`;
          }

          if (available.length) {
            entry.availableModelCount = available.length;
            entry.availableModels = available.slice(0, 12);
            if (modelListed !== undefined) entry.modelListed = modelListed;
          }
        }

        // A timeout says nothing about the key. Ask a metadata endpoint, so the
        // answer distinguishes a rejected/expired key from a slow model.
        if (outcome.code === 'AI_TIMEOUT' || outcome.code === 'UPSTREAM_NETWORK_ERROR' || outcome.code === 'PROVIDER_UNAVAILABLE') {
          const check = await validateKey({
            fetchImpl,
            provider,
            keys,
            secrets,
            timeoutMs: keyCheckTimeoutMs,
            now,
          });
          if (check) {
            entry.keyValid = check.valid;
            entry.keyCheck = { request: check.check, httpStatus: check.httpStatus, ms: check.ms, code: check.code };
            if (check.reason) entry.keyCheck.reason = check.reason;
            if (check.valid === false) {
              // The key itself is the problem, so report that rather than a timeout.
              entry.code = 'PROVIDER_AUTH_ERROR';
              entry.status = 'error';
            }
          }
        }
        return entry;
      }),
    );

    providerIds.forEach((provider, index) => { providers[provider] = outcomes[index]; });
    const probes = outcomes.filter((entry) => entry.status === 'ok' || entry.status === 'error').length;

    // End-to-end self-test: the same handler `/api/nova/chat` uses, one tiny
    // completion per configured provider. It reports *shape* (numbers, codes and
    // whether text came back) and never the answer itself.
    let chatSelfTest;
    if (chatProbe && chatThrottled && lastChatSelfTest) {
      chatSelfTest = { ...lastChatSelfTest, throttled: true, cachedFrom: lastChatSelfTest.ranAt };
    } else if (chatProbe) {
      chatSelfTest = { ranAt: new Date(now()).toISOString(), throttled: chatThrottled, results: {} };
      if (wantChatProbe) {
        const targets = ['local', ...providerIds.filter((provider) => keys[provider])];
        await Promise.all(targets.map(async (provider) => {
          const started = now();
          try {
            // One provider per handler: isolation is what keeps the report inside
            // the request budget when one provider is down (a shared chain would
            // spend Gemini's 10 s and then answer through OpenRouter anyway,
            // which says nothing about Gemini).
            const handler = chatHandlerFactory({
              getArenaApiKey: () => (provider === 'arena' ? keys.arena : ''),
              getOpenRouterApiKey: () => (provider === 'openrouter' ? keys.openrouter : ''),
              getGeminiApiKey: () => (provider === 'gemini' ? keys.gemini : ''),
              timeoutMs: CHAT_PROBE_TIMEOUT_MS,
              budgetMs: CHAT_PROBE_BUDGET_MS,
            });
            const response = await handler({
              body: { lang: 'en', provider, messages: [{ role: 'user', content: CHAT_PROBE_PROMPT }] },
              // A separate bucket, so the self-test never eats a visitor's quota.
              ip: 'nova-diagnostics-self-test',
            });
            const body = response?.body || {};
            chatSelfTest.results[provider] = {
              requested: provider,
              httpStatus: response?.status ?? 0,
              code: typeof body.code === 'string' ? body.code : 'OK',
              answeredBy: typeof body.provider === 'string' ? body.provider : null,
              model: typeof body.model === 'string' ? body.model.slice(0, 120) : null,
              hasText: typeof body.text === 'string' && body.text.trim().length > 0,
              textChars: typeof body.text === 'string' ? body.text.length : 0,
              fallback: body.fallback === true,
              ...(Array.isArray(body.fallbackChain) ? { fallbackChain: body.fallbackChain } : {}),
              ms: now() - started,
            };
          } catch (error) {
            chatSelfTest.results[provider] = {
              requested: provider,
              httpStatus: 0,
              code: 'DIAGNOSTICS_FAILED',
              reason: redactReason(error?.message || 'self-test threw', secrets),
              ms: now() - started,
            };
          }
        }));
        if (!chatSelfTest.throttled) lastChatSelfTest = chatSelfTest;
      }
    }

    return {
      checkedAt: new Date(now()).toISOString(),
      // Environment plus short commit: two deployments can serve the same URL
      // over time, and 'production' alone cannot tell them apart.
      deployment: [envValue(env, 'VERCEL_ENV') || 'local', envValue(env, 'VERCEL_GIT_COMMIT_SHA').slice(0, 7)].filter(Boolean).join(' · '),
      // `probed` means an upstream request actually ran, not that probing was allowed.
      probed: probes > 0,
      throttled,
      // The budgets the deployment is really running: a stale build answers with
      // the old 8 s / 18 s pair, which is how a "fix" can look merged and absent.
      budgets: { upstreamTimeoutMs: UPSTREAM_TIMEOUT_MS, chainBudgetMs: AUTO_CHAIN_BUDGET_MS },
      localInference: {
        mode: localInference.mode,
        configured: localInference.configured,
        provider: localInference.provider,
        model: localInference.model,
        code: localInference.code,
      },
      providers,
      ...(chatSelfTest ? { chatSelfTest } : {}),
    };
  };
}

export const handleNovaDiagnostics = createDiagnosticsHandler();
