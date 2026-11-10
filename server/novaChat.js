import { generateLocalSpaceResponse } from '../src/utils/spaceLocalAiEngine.js';
import {
  DEFAULT_THINKING_LEVEL,
  geminiThinkingConfig,
  normaliseThinkingLevel,
  openRouterThinkingFields,
  publicThinkingCatalog,
  resolveOpenRouterModel,
  thinkingGuidance,
  thinkingPreset,
} from './novaThinking.js';

export const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const GEMINI_GENERATE_CONTENT_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
export const OPENROUTER_FREE_MODEL = 'openrouter/free';
// Verified against the live API: `gemini-3.8-flash` is a real model — a bad id
// answers 404 NOT_FOUND, while this one answers 503 "high demand". So the id
// stays, and the fallbacks below exist only for the case where the API starts
// rejecting it (retired ids) — `gemini-flash-latest` is Google's moving alias.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const GEMINI_MODEL_FALLBACKS = ['gemini-flash-latest', 'gemini-2.5-flash'];

// A model can answer 503 "currently experiencing high demand" while the key is
// fine and other models still work — measured on production: `gemini-3.8-flash`
// stayed 503 for over a day on both ids. Google's own wording scopes that error
// to the model, so another id is worth one attempt, and the response says which
// model answered.
const GEMINI_RETRYABLE_MODEL_STATUSES = new Set([404, 422, 503]);

// A configured model id that the API does not know is a configuration error, not
// an outage. Rather than failing the whole chat, try the known-good ids in order
// and say which one actually answered.
export function geminiModelCandidates(model) {
  const requested = String(model || '').trim();
  const candidates = requested ? [requested] : [];
  // The pinned default comes before the moving alias: if a configured id turns
  // out to be retired, the known-good versioned id is the better first answer.
  for (const fallback of [DEFAULT_GEMINI_MODEL, ...GEMINI_MODEL_FALLBACKS]) {
    if (!candidates.includes(fallback)) candidates.push(fallback);
  }
  return candidates;
}

// Arena AI uses an OpenAI-compatible chat completions endpoint. The exact base
// URL is instance-specific and shown on the Arena key creation screen.
// Defaults to https://api.arena.ai/v1 per the official Arena documentation.
export const ARENA_BASE_URL = (() => {
  try {
    const configured = process.env.ARENA_BASE_URL;
    if (typeof configured === 'string' && configured.trim()) {
      return configured.replace(/\/$/, '') + '/v1/chat/completions';
    }
  } catch {}
  return 'https://api.arena.ai/v1/chat/completions';
})();

const MAX_REQUEST_BYTES = 24 * 1024;
const MAX_TOTAL_MESSAGE_BYTES = 20 * 1024;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_MESSAGES = 12;
const UPSTREAM_TIMEOUT_MS = 8_000;
// Hard ceiling for one automatic request across every configured provider, so a
// chain of slow failures cannot outlast the browser's patience (or the function
// timeout) before the local engine answers.
const AUTO_CHAIN_BUDGET_MS = 18_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 8;
const SUPPORTED_LANGUAGES = new Set(['en', 'si', 'ta']);
const SUPPORTED_PROVIDERS = new Set(['auto', 'local', 'gemini', 'openrouter', 'arena']);
// Upstream failures worth routing around. A missing key, a rejected key or a bad
// request is NOT in this set: those are deployment/client mistakes and must
// surface instead of being answered by a different provider.
const RETRYABLE_FAILURES = new Set([
  'EMPTY_PROVIDER_RESPONSE',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_ERROR',
  'INVALID_PROVIDER_RESPONSE',
  'UPSTREAM_RATE_LIMITED',
  'UPSTREAM_NETWORK_ERROR',
  'MODEL_UNAVAILABLE',
  'FREE_MODEL_UNAVAILABLE',
  'PROVIDER_MODEL_NOT_FOUND',
  'AI_TIMEOUT',
]);

const PROVIDER_NAMES = {
  local: 'NOVA Local Space Engine',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
  arena: 'Arena AI',
};

const FALLBACK_SUGGESTIONS = {
  en: ['What is the Artemis mission?', 'What has JWST discovered?', 'How do Mars rovers explore?'],
  si: ['ආටෙමිස් මෙහෙයුම කුමක්ද?', 'ජේම්ස් වෙබ් දුරේක්ෂය සොයාගෙන ඇත්තේ කුමක්ද?', 'අඟහරු රෝවර් ගවේෂණය කරන්නේ කෙසේද?'],
  ta: ['ஆர்ட்டெமிஸ் திட்டம் என்றால் என்ன?', 'ஜேம்ஸ் வெப் என்ன கண்டறிந்துள்ளது?', 'செவ்வாய் ரோவர்கள் எவ்வாறு ஆய்வு செய்கின்றன?'],
};

const LANGUAGE_GUIDANCE = {
  en: 'Use clear, natural English when English is the language of the latest user message.',
  si: 'Use clear, natural Sinhala when Sinhala is the language of the latest user message.',
  ta: 'Use clear, natural Tamil when Tamil is the language of the latest user message.',
};

function utf8ByteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function result(status, body, headers = {}) {
  return {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
    body,
  };
}

function errorResult(status, code, error, headers = {}, details = {}) {
  return result(status, { error, code, ...details }, headers);
}

function parseRequestBody(body, contentLength) {
  const declaredLength = Number(contentLength);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return { error: errorResult(413, 'REQUEST_TOO_LARGE', 'The chat request is too large.') };
  }

  let parsed = body;
  if (Buffer.isBuffer(body)) {
    if (body.byteLength > MAX_REQUEST_BYTES) {
      return { error: errorResult(413, 'REQUEST_TOO_LARGE', 'The chat request is too large.') };
    }
    try {
      parsed = JSON.parse(body.toString('utf8'));
    } catch {
      return { error: errorResult(400, 'INVALID_JSON', 'Send a valid JSON request.') };
    }
  } else if (typeof body === 'string') {
    if (utf8ByteLength(body) > MAX_REQUEST_BYTES) {
      return { error: errorResult(413, 'REQUEST_TOO_LARGE', 'The chat request is too large.') };
    }
    try {
      parsed = JSON.parse(body);
    } catch {
      return { error: errorResult(400, 'INVALID_JSON', 'Send a valid JSON request.') };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: errorResult(400, 'INVALID_REQUEST', 'A JSON object is required.') };
  }

  try {
    const serialized = JSON.stringify(parsed);
    if (typeof serialized !== 'string' || utf8ByteLength(serialized) > MAX_REQUEST_BYTES) {
      return { error: errorResult(413, 'REQUEST_TOO_LARGE', 'The chat request is too large.') };
    }
  } catch {
    return { error: errorResult(400, 'INVALID_REQUEST', 'The chat request could not be read.') };
  }

  return { body: parsed };
}

function validateChatRequest(body) {
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { error: errorResult(400, 'INVALID_MESSAGES', 'At least one chat message is required.') };
  }
  if (body.messages.length > MAX_MESSAGES) {
    return { error: errorResult(400, 'HISTORY_TOO_LONG', `Keep conversation history to ${MAX_MESSAGES} messages or fewer.`) };
  }

  let totalMessageBytes = 0;
  const messages = [];
  for (const item of body.messages) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { error: errorResult(400, 'INVALID_MESSAGE', 'Each chat message must have a role and text content.') };
    }
    if (item.role !== 'user' && item.role !== 'assistant') {
      return { error: errorResult(400, 'INVALID_ROLE', 'Only user and assistant messages are accepted.') };
    }
    if (typeof item.content !== 'string' || !item.content.trim()) {
      return { error: errorResult(400, 'INVALID_CONTENT', 'Chat message content must be a non-empty string.') };
    }
    if (item.content.length > MAX_MESSAGE_CHARS) {
      return { error: errorResult(413, 'MESSAGE_TOO_LARGE', `Each message must be ${MAX_MESSAGE_CHARS} characters or fewer.`) };
    }

    totalMessageBytes += utf8ByteLength(item.content);
    if (totalMessageBytes > MAX_TOTAL_MESSAGE_BYTES) {
      return { error: errorResult(413, 'HISTORY_TOO_LARGE', 'The conversation history is too large.') };
    }
    messages.push({ role: item.role, content: item.content.trim() });
  }

  if (messages[messages.length - 1].role !== 'user') {
    return { error: errorResult(400, 'LATEST_MESSAGE_MUST_BE_USER', 'The latest chat message must be from the user.') };
  }

  let language = 'en';
  if (body.lang !== undefined) {
    if (typeof body.lang !== 'string') {
      return { error: errorResult(400, 'INVALID_LANGUAGE', 'Language must be English, Sinhala, or Tamil.') };
    }
    language = body.lang.trim().toLowerCase().split(/[-_]/)[0];
    if (!SUPPORTED_LANGUAGES.has(language)) {
      return { error: errorResult(400, 'INVALID_LANGUAGE', 'Language must be English, Sinhala, or Tamil.') };
    }
  }

  const thinking = normaliseThinkingLevel(body.thinking);
  if (thinking === null) {
    return {
      error: errorResult(
        400,
        'INVALID_THINKING',
        'Thinking level must be auto, flash, flash-thinking, thinking, or deep-thinking.',
      ),
    };
  }

  let provider = 'auto';
  if (body.provider !== undefined) {
    if (typeof body.provider !== 'string' || !SUPPORTED_PROVIDERS.has(body.provider.trim().toLowerCase())) {
      return { error: errorResult(400, 'INVALID_PROVIDER', 'Provider must be auto, local, gemini, openrouter, or arena.') };
    }
    provider = body.provider.trim().toLowerCase();
  }

  return { messages, language, provider, thinking };
}

export function createNovaRateLimiter({ limit = RATE_LIMIT_REQUESTS, windowMs = RATE_LIMIT_WINDOW_MS, now = Date.now } = {}) {
  const clients = new Map();

  return function checkRateLimit(clientIp) {
    const key = typeof clientIp === 'string' && clientIp.trim()
      ? clientIp.trim().slice(0, 128)
      : 'unknown';
    const timestamp = now();
    let entry = clients.get(key);

    if (!entry && clients.size >= 4_096) {
      for (const [client, bucket] of clients) {
        if (bucket.resetAt <= timestamp) clients.delete(client);
      }
      if (clients.size >= 4_096) {
        return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
      }
    }

    if (!entry || entry.resetAt <= timestamp) {
      entry = { count: 0, resetAt: timestamp + windowMs };
      clients.set(key, entry);
    }

    if (entry.count >= limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000)),
      };
    }

    entry.count += 1;

    return { allowed: true, retryAfterSeconds: 0 };
  };
}

function makeSystemPrompt(language, thinking = DEFAULT_THINKING_LEVEL) {
  const guidance = thinkingGuidance(thinking);
  return [
    'You are NOVA, a helpful AI assistant for NASA missions, astronomy, and space exploration.',
    'Answer accurately and accessibly. Do not claim to be an official NASA service or to have live NASA telemetry, current web access, or data that was not supplied in the conversation. State uncertainty when facts may have changed.',
    `Language preference: ${LANGUAGE_GUIDANCE[language]} Always prioritize the language used in the latest user message if it differs from this hint.`,
    'Use readable Markdown. End with up to three short, relevant follow-up questions on one line using exactly: SUGGESTIONS: [Question 1] | [Question 2] | [Question 3]. Write those questions in the response language.',
    ...(guidance ? [guidance] : []),
  ].join('\n\n');
}

function extractText(content) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part && typeof part === 'object' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();
}

function extractSuggestions(text, language) {
  const match = /(?:^|\n)\s*SUGGESTIONS:\s*([^\n]+)\s*$/im.exec(text);
  if (!match) return { text: text.trim(), suggestions: FALLBACK_SUGGESTIONS[language] };

  const suggestions = match[1]
    .split('|')
    .map((item) => item.trim().replace(/^\[|\]$/g, '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((item) => item.slice(0, 180));

  return {
    text: text.replace(match[0], '').trim(),
    suggestions: suggestions.length ? suggestions : FALLBACK_SUGGESTIONS[language],
  };
}

function cleanModelName(value, fallback) {
  return typeof value === 'string' && value.trim() && value.trim().length <= 160
    ? value.trim()
    : fallback;
}

function getProcessEnv() {
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

function getReferer() {
  const env = getProcessEnv();
  const configuredUrl = env.APP_URL;
  if (configuredUrl && /^https?:\/\//i.test(configuredUrl)) return configuredUrl;

  const vercelUrl = env.VERCEL_URL;
  if (vercelUrl && /^[a-z0-9.-]+(?::\d+)?$/i.test(vercelUrl)) return `https://${vercelUrl}`;
  return '';
}

/**
 * Gemini generation config. `auto` keeps the historical shape: Gemini 3.x asks
 * for the "low" thinking level so a chat answer starts inside the diagnostics
 * probe, and 2.x keeps the legacy temperature. An explicit thinking level maps
 * onto `thinkingConfig.thinkingLevel` plus the level's token budget.
 */
export function geminiGenerationConfig(model, thinking = DEFAULT_THINKING_LEVEL) {
  return geminiThinkingConfig(model, thinking);
}

/**
 * Arena/BYOM endpoints are OpenAI-compatible but not guaranteed to understand
 * `reasoning.effort`; sending an unknown field there is a 400. The level still
 * reaches Arena through the system prompt, and the token budget is bounded here.
 */
function arenaThinkingFields(thinking) {
  const preset = thinkingPreset(thinking);
  const fields = { max_tokens: preset.maxTokens };
  if (preset.temperature !== null) fields.temperature = preset.temperature;
  return fields;
}

export function providerError(status, provider, model) {
  let response;
  if (status === 429) {
    response = errorResult(
      429,
      'UPSTREAM_RATE_LIMITED',
      'The selected AI provider is busy or rate-limited right now. Please wait a moment and retry.',
      { 'Retry-After': '30' },
    );
  } else if (status === 404 || status === 422) {
    const isOpenRouterFreeModel = provider === 'openrouter' && model === OPENROUTER_FREE_MODEL;
    response = errorResult(
      503,
      isOpenRouterFreeModel ? 'FREE_MODEL_UNAVAILABLE' : 'MODEL_UNAVAILABLE',
      'The selected AI model is unavailable right now. Please retry shortly.',
    );
  } else if (status === 401 || status === 403) {
    response = errorResult(503, 'PROVIDER_AUTH_ERROR', 'The AI provider could not process this request. Check its server-side API key.');
  } else if (status === 408 || status === 504) {
    response = errorResult(504, 'AI_TIMEOUT', 'The AI response took too long. Please retry.');
  } else if (status >= 500) {
    response = errorResult(503, 'PROVIDER_UNAVAILABLE', 'The AI provider is temporarily unavailable. Please retry shortly.');
  } else {
    response = errorResult(502, 'PROVIDER_ERROR', 'The AI provider could not complete this request. Please retry.');
  }
  // The status the *provider* returned, kept separate from ours: a 401 upstream
  // becomes a 503 for the browser, and the number is what makes a failure
  // diagnosable ("Arena AI said 401") without ever exposing the key.
  return withProvider(
    { ...response, body: { ...response.body, upstreamStatus: status } },
    provider,
  );
}

function withProvider(response, provider) {
  return {
    ...response,
    body: {
      ...response.body,
      provider: PROVIDER_NAMES[provider] || provider,
    },
  };
}

function getLocalResponse(query, language, { fallback = false, chain = [], thinking = DEFAULT_THINKING_LEVEL } = {}) {
  const local = generateLocalSpaceResponse(query, language);
  return result(200, {
    text: local.text,
    suggestions: Array.isArray(local.suggestions) ? local.suggestions : FALLBACK_SUGGESTIONS[language],
    model: 'nasa-local-engine',
    provider: PROVIDER_NAMES.local,
    lang: language,
    thinking,
    fallback,
    // Why every online provider was skipped: safe (codes and statuses only) and
    // essential, because an offline answer that does not say why is a dead end.
    ...(chain.length ? { fallbackChain: chain } : {}),
    intent: local.intent,
  });
}

async function fetchProviderJson({ fetchImpl, url, init, timeoutMs, provider, model }) {
  const controller = new AbortController();
  let timeoutExpired = false;
  const timeout = setTimeout(() => {
    timeoutExpired = true;
    controller.abort();
  }, timeoutMs);

  try {
    const upstream = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!upstream || !upstream.ok) {
      return { error: providerError(Number(upstream?.status) || 502, provider, model) };
    }

    let data;
    try {
      data = await upstream.json();
    } catch {
      return {
        error: withProvider(
          errorResult(502, 'INVALID_PROVIDER_RESPONSE', 'The AI provider returned an unreadable response. Please retry.'),
          provider,
        ),
      };
    }
    return { data };
  } catch (error) {
    if (timeoutExpired || error?.name === 'AbortError') {
      return {
        error: withProvider(
          errorResult(504, 'AI_TIMEOUT', 'The AI response took too long. Please retry.'),
          provider,
        ),
      };
    }
    return {
      error: withProvider(
        errorResult(503, 'UPSTREAM_NETWORK_ERROR', 'Could not reach the AI provider. Check your connection and retry.'),
        provider,
      ),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenRouter({ fetchImpl, apiKey, model, messages, language, thinking = DEFAULT_THINKING_LEVEL, timeoutMs }) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-Title': 'NOVA AI',
  };
  const referer = getReferer();
  if (referer) headers['HTTP-Referer'] = referer;

  const upstreamResult = await fetchProviderJson({
    fetchImpl,
    url: OPENROUTER_CHAT_COMPLETIONS_URL,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: makeSystemPrompt(language, thinking) },
          ...messages,
        ],
        ...openRouterThinkingFields(thinking),
      }),
    },
    timeoutMs,
    provider: 'openrouter',
    model,
  });
  if (upstreamResult.error) return upstreamResult.error;

  const rawText = extractText(upstreamResult.data?.choices?.[0]?.message?.content);
  if (!rawText) {
    return withProvider(
      errorResult(502, 'EMPTY_PROVIDER_RESPONSE', 'The AI provider returned an empty response. Please retry.'),
      'openrouter',
    );
  }

  const parsed = extractSuggestions(rawText, language);
  return result(200, {
    text: parsed.text || rawText,
    suggestions: parsed.suggestions,
    model: typeof upstreamResult.data?.model === 'string' && upstreamResult.data.model.length <= 160
      ? upstreamResult.data.model
      : model,
    provider: PROVIDER_NAMES.openrouter,
    lang: language,
    thinking,
    fallback: false,
  });
}

async function callGemini({ fetchImpl, apiKey, model, messages, language, thinking = DEFAULT_THINKING_LEVEL, timeoutMs }) {
  const contents = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
  let upstreamResult = null;
  let firstError = null;
  let usedModel = model;
  const deadline = timeoutMs ? Date.now() + timeoutMs : 0;
  for (const candidate of geminiModelCandidates(model)) {
    usedModel = candidate;
    const url = `${GEMINI_GENERATE_CONTENT_URL}/${encodeURIComponent(candidate)}:generateContent`;
    upstreamResult = await fetchProviderJson({
      fetchImpl,
      url,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: makeSystemPrompt(language, thinking) }] },
          contents,
          generationConfig: geminiGenerationConfig(candidate, thinking),
        }),
      },
      timeoutMs,
      provider: 'gemini',
      model: candidate,
    });
    if (!upstreamResult.error) break;
    if (!firstError) firstError = upstreamResult.error;
    // Only a missing id, or a model Google itself calls overloaded, is worth
    // another id. A 429, a rejected key or a generic 5xx is reported as it is.
    const upstreamStatus = upstreamResult.error.body?.upstreamStatus;
    if (!GEMINI_RETRYABLE_MODEL_STATUSES.has(upstreamStatus)) break;
    // Never let the retries outlive the caller's budget.
    if (deadline && Date.now() > deadline) break;
  }
  // Report the configured model's error, not the last fallback's: "your model is
  // overloaded" is the truth, "the alias 404'd" is an artefact of the retry.
  if (upstreamResult.error) return firstError || upstreamResult.error;

  const rawText = extractText(upstreamResult.data?.candidates?.[0]?.content?.parts);
  if (!rawText) {
    return withProvider(
      errorResult(502, 'EMPTY_PROVIDER_RESPONSE', 'The AI provider returned an empty response. Please retry.'),
      'gemini',
    );
  }

  const parsed = extractSuggestions(rawText, language);
  const body = {
    text: parsed.text || rawText,
    suggestions: parsed.suggestions,
    model: usedModel,
    provider: PROVIDER_NAMES.gemini,
    lang: language,
    thinking,
    fallback: false,
  };
  if (usedModel !== model) {
    // Say which model answered and which one was asked for: silently reporting
    // the requested id would hide a broken NOVA_GEMINI_MODEL forever.
    body.requestedModel = model;
    body.modelFallback = true;
  }
  return result(200, body);
}

async function callArena({ fetchImpl, apiKey, model, messages, language, thinking = DEFAULT_THINKING_LEVEL, timeoutMs }) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const upstreamResult = await fetchProviderJson({
    fetchImpl,
    url: ARENA_BASE_URL,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: makeSystemPrompt(language, thinking) },
          ...messages,
        ],
        ...arenaThinkingFields(thinking),
        stream: false,
      }),
    },
    timeoutMs,
    provider: 'arena',
    model,
  });
  if (upstreamResult.error) return upstreamResult.error;

  const rawText = extractText(upstreamResult.data?.choices?.[0]?.message?.content);
  if (!rawText) {
    return withProvider(
      errorResult(502, 'EMPTY_PROVIDER_RESPONSE', 'The AI provider returned an empty response. Please retry.'),
      'arena',
    );
  }

  const parsed = extractSuggestions(rawText, language);
  return result(200, {
    text: parsed.text || rawText,
    suggestions: parsed.suggestions,
    model: typeof upstreamResult.data?.model === 'string' && upstreamResult.data.model.length <= 160
      ? upstreamResult.data.model
      : model,
    provider: PROVIDER_NAMES.arena,
    lang: language,
    thinking,
    fallback: false,
  });
}

function readKey(getter) {
  try {
    const value = getter();
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

/** A short, safe deployment label: no path, no query, no secret. */
function deploymentLabel(value, fallback = null) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().slice(0, 60).replace(/[^\w.\-/]/g, '');
  return trimmed || fallback;
}

/**
 * Return only safe provider availability information. Never return API key values.
 *
 * `providers` says whether a key is *set* — not whether it is accepted. The
 * `deployment` block says which build answered, so a stale deployment (or a
 * cached client) can be told apart from a real provider failure.
 */
export function getNovaPublicConfig({ env = getProcessEnv() } = {}) {
  const commit = deploymentLabel(env.VERCEL_GIT_COMMIT_SHA);
  const openrouter = typeof env.OPENROUTER_API_KEY === 'string' && Boolean(env.OPENROUTER_API_KEY.trim());
  const gemini = typeof env.GEMINI_API_KEY === 'string' && Boolean(env.GEMINI_API_KEY.trim());
  const arena = typeof env.ARENA_API_KEY === 'string' && Boolean(env.ARENA_API_KEY.trim());
  return {
    providers: {
      auto: true,
      local: true,
      gemini,
      openrouter,
      arena,
    },
    // Ordered thinking ladder (auto → deep). Keys never appear here.
    thinking: publicThinkingCatalog({ onlineConfigured: openrouter || gemini || arena, env }),
    deployment: {
      environment: deploymentLabel(env.VERCEL_ENV, 'development'),
      commit: commit && /^[0-9a-f]{7,40}$/i.test(commit) ? commit.slice(0, 7) : null,
      branch: deploymentLabel(env.VERCEL_GIT_COMMIT_REF),
    },
  };
}

export function createNovaChatHandler({
  fetchImpl = (...args) => globalThis.fetch(...args),
  getOpenRouterApiKey,
  getGeminiApiKey = () => getProcessEnv().GEMINI_API_KEY,
  getArenaApiKey = () => getProcessEnv().ARENA_API_KEY,
  // Backwards-compatible alias for callers/tests written for the original OpenRouter-only handler.
  getApiKey,
  getOpenRouterModel = () => getProcessEnv().NOVA_OPENROUTER_MODEL,
  getGeminiModel = () => getProcessEnv().NOVA_GEMINI_MODEL,
  getArenaModel = () => getProcessEnv().NOVA_ARENA_MODEL,
  rateLimiter = createNovaRateLimiter(),
  timeoutMs = UPSTREAM_TIMEOUT_MS,
} = {}) {
  const readOpenRouterKey = getOpenRouterApiKey || getApiKey || (() => getProcessEnv().OPENROUTER_API_KEY);

  /** @param {{ body?: unknown, ip?: string, contentLength?: string | number }} [request] */
  return async function handleNovaChatRequest({ body, ip = 'unknown', contentLength } = {}) {
    const parsed = parseRequestBody(body, contentLength);
    if (parsed.error) return parsed.error;

    const validated = validateChatRequest(parsed.body);
    if (validated.error) return validated.error;

    const limit = rateLimiter(ip);
    if (!limit.allowed) {
      return errorResult(
        429,
        'RATE_LIMITED',
        'Too many NOVA requests. Please wait a moment and try again.',
        { 'Retry-After': String(limit.retryAfterSeconds || 60) },
      );
    }

    if (validated.provider === 'local') {
      return getLocalResponse(validated.messages.at(-1).content, validated.language, {
        thinking: validated.thinking,
      });
    }

    const keys = {
      openrouter: readKey(readOpenRouterKey),
      gemini: readKey(getGeminiApiKey),
      arena: readKey(getArenaApiKey),
    };
    const baseOpenRouterModel = cleanModelName(readKey(getOpenRouterModel), OPENROUTER_FREE_MODEL);
    const models = {
      openrouter: resolveOpenRouterModel({
        baseModel: baseOpenRouterModel,
        level: validated.thinking,
        readEnv: (key) => getProcessEnv()[key],
      }),
      gemini: cleanModelName(readKey(getGeminiModel), DEFAULT_GEMINI_MODEL),
      arena: cleanModelName(readKey(getArenaModel), 'arena_smart.aria'),
    };

    // Auto routing prefers Arena when configured, then falls through to other
    // online providers. An explicitly chosen provider is tried first, but a
    // transient failure there must not dead-end the conversation: the remaining
    // configured providers (and finally the offline engine) still answer, and
    // the response says who did.
    const onlineOrder = ['arena', 'openrouter', 'gemini'].filter((provider) => Boolean(keys[provider]));
    const providerOrder = validated.provider === 'auto'
      ? onlineOrder
      : [validated.provider, ...onlineOrder.filter((provider) => provider !== validated.provider)];

    if (validated.provider !== 'auto' && !keys[validated.provider]) {
      return errorResult(
        503,
        'PROVIDER_NOT_CONFIGURED',
        `The ${PROVIDER_NAMES[validated.provider]} API key is not configured on this deployment.`,
        {},
        { provider: PROVIDER_NAMES[validated.provider] },
      );
    }

    if (providerOrder.length === 0) {
      return getLocalResponse(validated.messages.at(-1).content, validated.language, {
        fallback: true,
        thinking: validated.thinking,
      });
    }

    let lastError = null;
    /** One safe record per failed hop: provider, code and upstream status. */
    const chain = [];
    const chainStartedAt = Date.now();
    for (const provider of providerOrder) {
      const remainingMs = AUTO_CHAIN_BUDGET_MS - (Date.now() - chainStartedAt);
      if (remainingMs <= 0) break;
      const providerTimeout = Math.min(timeoutMs, remainingMs);

      let response;
      if (provider === 'arena') {
        response = await callArena({
          fetchImpl,
          apiKey: keys.arena,
          model: models.arena,
          messages: validated.messages,
          language: validated.language,
          thinking: validated.thinking,
          timeoutMs: providerTimeout,
        });
      } else if (provider === 'openrouter') {
        response = await callOpenRouter({
          fetchImpl,
          apiKey: keys.openrouter,
          model: models.openrouter,
          messages: validated.messages,
          language: validated.language,
          thinking: validated.thinking,
          timeoutMs: providerTimeout,
        });
      } else {
        response = await callGemini({
          fetchImpl,
          apiKey: keys.gemini,
          model: models.gemini,
          messages: validated.messages,
          language: validated.language,
          thinking: validated.thinking,
          timeoutMs: providerTimeout,
        });
      }

      if (response.status === 200) {
        // A later hop answered after an earlier one failed: keep the chain so the
        // UI can say which provider was skipped and why.
        if (chain.length === 0) return response;
        return {
          ...response,
          body: {
            ...response.body,
            fallback: true,
            fallbackChain: chain,
          },
        };
      }
      lastError = response;
      const failureCode = typeof response.body?.code === 'string' ? response.body.code : 'PROVIDER_UNAVAILABLE';
      chain.push({
        provider: typeof response.body?.provider === 'string' ? response.body.provider : PROVIDER_NAMES[provider],
        code: failureCode,
        status: Number(response.body?.upstreamStatus) || response.status,
      });
      // With an explicitly selected provider, a deployment problem (missing or
      // rejected key) or a bad request is reported as-is: routing around it
      // would hide the misconfiguration. Auto keeps walking the chain, because
      // one broken provider says nothing about the others.
      if (validated.provider !== 'auto' && !RETRYABLE_FAILURES.has(failureCode)) return response;
    }

    // Every hop that could answer failed transiently. The bundled offline engine
    // still holds real astronomy knowledge, so it answers — labelled, with the
    // chain that explains why the online providers were skipped.
    return getLocalResponse(validated.messages.at(-1).content, validated.language, {
      fallback: true,
      chain,
      thinking: validated.thinking,
    });
  };
}

// Vercel and Express adapters share this handler. Its limiter is per warm process;
// use a distributed rate limiter if a deployment-wide quota is needed.
export const handleNovaChatRequest = createNovaChatHandler();
