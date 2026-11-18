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
// Ordered by what the deployed key can actually reach. `GET /v1beta/models`
// lists 47 generateContent models for this key, so a refusal on one id says
// nothing about the next; the list is short because every entry costs a request.
export const GEMINI_MODEL_FALLBACKS = ['gemini-flash-latest', 'gemini-2.5-pro', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'];

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
/**
 * How long one upstream attempt may take.
 *
 * The previous 8 s ceiling covered the *whole* exchange — connection, headers
 * and the entire JSON body. Measured on production (`/api/nova/diagnostics` on
 * `a542980`), a one-token probe answered in 401 ms, but a real completion with
 * the NOVA system prompt needs far longer than 8 s to finish its body. The
 * timer therefore fired while the body was still streaming, the read rejected,
 * and the failure was reported as `INVALID_PROVIDER_RESPONSE` (a 200 that "was
 * not JSON") instead of a timeout: one root cause, two misleading codes.
 *
 * 15 s per attempt and 25 s for the whole automatic chain stay inside the
 * function's `maxDuration: 30` (vercel.json) *and* leave room for the local
 * engine to answer. Both are tunable per deployment without a code change.
 */
const DEFAULT_UPSTREAM_TIMEOUT_MS = 15_000;
// Hard ceiling for one automatic request across every configured provider, so a
// chain of slow failures cannot outlast the browser's patience (or the function
// timeout) before the local engine answers.
const DEFAULT_AUTO_CHAIN_BUDGET_MS = 25_000;
const MIN_UPSTREAM_TIMEOUT_MS = 4_000;
const MAX_UPSTREAM_TIMEOUT_MS = 24_000;
const MIN_AUTO_CHAIN_BUDGET_MS = 6_000;
const MAX_AUTO_CHAIN_BUDGET_MS = 27_000;
// Time kept back at the end of the chain so the offline engine can always answer
// instead of the platform killing the function mid-flight.
const LOCAL_FALLBACK_RESERVE_MS = 1_200;
// A second attempt is only worth it when the first failure could be momentary.
const DEFAULT_MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 350;
// A retry is only worth starting when it has room to finish; otherwise the
// budget belongs to the next provider, which may be healthy.
const MIN_RETRY_BUDGET_MS = 4_000;
// Never start another upstream attempt with less than this left: a request that
// cannot finish would only turn a useful timeout into a platform 504.
const MIN_ATTEMPT_BUDGET_MS = 1_500;
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

/** A positive integer from the environment, clamped; anything else is ignored. */
function envInt(env, key, fallback, min, max) {
  const raw = env?.[key];
  const value = typeof raw === 'string' ? Number.parseInt(raw.trim(), 10) : Number.NaN;
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(max, Math.max(min, value));
}

/**
 * The effective request budgets. Exported because the deployment's real limits
 * are part of its contract, not an implementation detail: the tests assert they
 * stay inside `maxDuration`, and the diagnostics report echoes them.
 */
export const UPSTREAM_TIMEOUT_MS = envInt(
  getProcessEnv(),
  'NOVA_UPSTREAM_TIMEOUT_MS',
  DEFAULT_UPSTREAM_TIMEOUT_MS,
  MIN_UPSTREAM_TIMEOUT_MS,
  MAX_UPSTREAM_TIMEOUT_MS,
);
export const AUTO_CHAIN_BUDGET_MS = envInt(
  getProcessEnv(),
  'NOVA_AUTO_CHAIN_BUDGET_MS',
  DEFAULT_AUTO_CHAIN_BUDGET_MS,
  MIN_AUTO_CHAIN_BUDGET_MS,
  MAX_AUTO_CHAIN_BUDGET_MS,
);

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
  //
  // The model id travels too. Without it a 404 is a dead end: audit M4 found a
  // key that listed 48 models while the configured one 404'd, and the response
  // said only "the selected model is unavailable" — no way to tell which model,
  // or that the list and the call disagreed. Model ids are configuration, not
  // secrets; they are returned on every success already.
  return withProvider(
    {
      ...response,
      body: {
        ...response.body,
        upstreamStatus: status,
        model: model || null,
        hint: modelFailureHint(status),
      },
    },
    provider,
  );
}

/**
 * What a 404/422 from a provider actually means here — and what it does not.
 * A model can be listed for a key and still 404 when the key lacks access to it
 * or the API version differs, so this points at evidence rather than guessing.
 */
function modelFailureHint(status) {
  if (status === 404 || status === 422) {
    return 'This model id may be listed for the key yet restricted by access or API version. /api/nova/diagnostics lists the ids this key can call.';
  }
  if (status === 401 || status === 403) {
    return 'The provider rejected this deployment\'s key. It is configured but not authorised for this request.';
  }
  if (status === 429) {
    return 'The provider is rate-limiting this key. The request was not retried against another model.';
  }
  return undefined;
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

/**
 * Attach safe evidence to an error body. Only numbers, short ids and fixed
 * vocabulary live here — never a key, a header or a fragment of provider text.
 */
function withEvidence(response, evidence) {
  const body = { ...response.body };
  for (const [key, value] of Object.entries(evidence)) {
    if (value === undefined || value === '') continue;
    body[key] = value;
  }
  return { ...response, body };
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/** Time left before an absolute deadline (`null` deadline means "no limit"). */
function remainingTime(deadline) {
  if (!deadline) return Number.POSITIVE_INFINITY;
  return deadline - Date.now();
}

/**
 * What kind of body did a 2xx response carry? Naming the shape is what turns
 * "unreadable response" into evidence — an HTML page from a proxy, a truncated
 * JSON document, or a stream — without ever echoing provider content back.
 */
export function classifyBodyShape(text, contentType = '') {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  const type = typeof contentType === 'string' ? contentType.toLowerCase() : '';
  if (!trimmed) return 'empty';
  if (type.includes('text/event-stream') || /^(:|data:|event:)/m.test(trimmed.slice(0, 400))) return 'event-stream';
  if (type.includes('text/html') || /^<(!doctype|html|head|body|\?xml)/i.test(trimmed)) return 'html';
  if (/^\{\s*$|^[\[{]/.test(trimmed)) return 'truncated-json';
  return 'text';
}

function headerValue(headers, name) {
  try {
    if (!headers) return '';
    if (typeof headers.get === 'function') return String(headers.get(name) || '');
    const lower = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === lower) return String(value);
    }
  } catch {
    /* a headers object that cannot be read is simply absent */
  }
  return '';
}

/** Collect the text out of an OpenAI-style or Gemini-style SSE body. */
export function textFromEventStream(text) {
  const parts = [];
  let model = '';
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = /^data:\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    const payload = match[1].trim();
    if (!payload || payload === '[DONE]') continue;
    let chunk;
    try {
      chunk = JSON.parse(payload);
    } catch {
      continue;
    }
    if (typeof chunk?.model === 'string' && !model) model = chunk.model;
    const delta = chunk?.choices?.[0]?.delta?.content ?? chunk?.choices?.[0]?.message?.content;
    if (typeof delta === 'string') parts.push(delta);
    else if (Array.isArray(delta)) {
      for (const item of delta) if (typeof item?.text === 'string') parts.push(item.text);
    }
    const geminiParts = chunk?.candidates?.[0]?.content?.parts;
    if (Array.isArray(geminiParts)) {
      for (const item of geminiParts) if (typeof item?.text === 'string') parts.push(item.text);
    }
  }
  return { text: parts.join(''), model };
}

/**
 * Re-shape an aggregated stream into the non-streaming body each provider
 * usually returns, so every caller keeps one code path for extracting text.
 */
function streamedData(provider, { text, model }) {
  if (provider === 'gemini') {
    return { model: model || undefined, candidates: [{ content: { parts: [{ text }] } }] };
  }
  return { model: model || undefined, choices: [{ message: { role: 'assistant', content: text } }] };
}

/** One attempt. Never throws; always resolves to `{data}` or `{error}`. */
async function fetchProviderJsonOnce({ fetchImpl, url, init, timeoutMs, provider, model }) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timeoutExpired = false;
  const timeout = controller
    ? setTimeout(() => {
      timeoutExpired = true;
      controller.abort();
    }, Math.max(1, timeoutMs))
    : null;

  try {
    const upstream = await fetchImpl(url, controller ? { ...init, signal: controller.signal } : init);
    if (!upstream || !upstream.ok) {
      return { error: providerError(Number(upstream?.status) || 502, provider, model) };
    }

    // Read the body as text first: `json()` hides *why* a 2xx was unreadable,
    // and that "why" is the difference between a proxy page and a timeout.
    let text = '';
    try {
      if (typeof upstream.text === 'function') {
        text = await upstream.text();
      } else if (typeof upstream.json === 'function') {
        const parsed = await upstream.json();
        return { data: parsed };
      } else {
        text = '';
      }
    } catch (error) {
      const aborted = timeoutExpired || error?.name === 'AbortError';
      const looksLikeTransport = /terminated|other side closed|socket|ECONN|EAI_AGAIN|network|fetch failed/i
        .test(String(error?.message || ''));
      if (!aborted && !looksLikeTransport) {
        // A 2xx whose body could not be read as JSON is an unreadable response.
        return {
          error: withProvider(
            withEvidence(
              errorResult(502, 'INVALID_PROVIDER_RESPONSE', 'The AI provider returned an unreadable response. Please retry.'),
              { bodyShape: 'unparseable', model: model || null },
            ),
            provider,
          ),
        };
      }
      if (aborted) {
        // The headers arrived but the body did not finish in time. Reporting
        // this as an unreadable response (the old behaviour) hid a timeout.
        return {
          error: withProvider(
            withEvidence(errorResult(504, 'AI_TIMEOUT', 'The AI response took too long. Please retry.'), {
              phase: 'body',
              model: model || null,
            }),
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
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      const shape = classifyBodyShape(text, headerValue(upstream.headers, 'content-type'));
      if (shape === 'event-stream') {
        // A provider that streamed anyway still produced a usable answer.
        const aggregated = textFromEventStream(text);
        if (aggregated.text.trim()) return { data: streamedData(provider, aggregated) };
      }
      return {
        error: withProvider(
          withEvidence(
            errorResult(502, 'INVALID_PROVIDER_RESPONSE', 'The AI provider returned an unreadable response. Please retry.'),
            {
              // No `upstreamStatus` on purpose: a 2xx is not a failure status, and
              // putting 200 in the chain made the UI print "HTTP 200" for a
              // failure. The shape is the evidence that matters here.
              bodyShape: shape,
              bodyBytes: typeof text === 'string' ? text.length : 0,
              model: model || null,
            },
          ),
          provider,
        ),
      };
    }

    // A 2xx that carries an `error` object is a provider-side refusal, not an answer.
    if (data && typeof data === 'object' && data.error && !data.choices && !data.candidates) {
      const upstreamStatus = Number(data.error.code) || 502;
      return { error: providerError(upstreamStatus, provider, model) };
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
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Failures where a second, identical attempt can plausibly answer. A rejected
 * key, a retired model or a 429 for the day cannot, so they are not retried.
 */
const RETRYABLE_ATTEMPT_CODES = new Set([
  'AI_TIMEOUT',
  'INVALID_PROVIDER_RESPONSE',
  'UPSTREAM_NETWORK_ERROR',
  'EMPTY_PROVIDER_RESPONSE',
  'PROVIDER_UNAVAILABLE',
]);

/**
 * One provider call, with a bounded retry and a shared deadline.
 *
 * `deadline` is absolute (`Date.now()` based): every attempt is sized to what is
 * left, so a retry can never push the request past the chain budget.
 */
async function fetchProviderJson({
  fetchImpl,
  url,
  init,
  timeoutMs,
  provider,
  model,
  deadline = null,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  retryDelayMs = RETRY_DELAY_MS,
}) {
  let result = null;
  let attempt = 0;
  while (attempt < maxAttempts) {
    const left = remainingTime(deadline);
    if (attempt > 0 && left !== Number.POSITIVE_INFINITY && left < retryDelayMs + MIN_RETRY_BUDGET_MS) break;
    const budget = Math.max(1, Math.min(timeoutMs, left === Number.POSITIVE_INFINITY ? timeoutMs : left));
    attempt += 1;
    result = await fetchProviderJsonOnce({ fetchImpl, url, init, timeoutMs: budget, provider, model });
    if (!result.error) {
      if (attempt > 1) result.attempts = attempt;
      return result;
    }
    const code = typeof result.error.body?.code === 'string' ? result.error.body.code : '';
    if (!RETRYABLE_ATTEMPT_CODES.has(code)) break;
    const after = remainingTime(deadline);
    if (after !== Number.POSITIVE_INFINITY && after < retryDelayMs + MIN_RETRY_BUDGET_MS) break;
    await sleep(retryDelayMs);
  }
  if (result?.error) {
    // How many attempts were spent is diagnostic, not secret.
    result = { error: { ...result.error, body: { ...result.error.body, attempts: attempt } } };
  }
  return result;
}

/**
 * `openrouter/free` is a *router*, not a model: it picks a free model per
 * request, and the free pool is documented as "availability can vary". When the
 * router itself has no endpoint to offer it answers 404, so the deployment gets
 * one documented alternative instead of a dead hop.
 */
export const OPENROUTER_FALLBACK_MODEL = 'openrouter/auto';

function openRouterRequestBody({ model, messages, language, thinking }) {
  return JSON.stringify({
    model,
    messages: [
      { role: 'system', content: makeSystemPrompt(language, thinking) },
      ...messages,
    ],
    ...openRouterThinkingFields(thinking),
  });
}

async function callOpenRouter({
  fetchImpl,
  apiKey,
  model,
  messages,
  language,
  thinking = DEFAULT_THINKING_LEVEL,
  timeoutMs,
  deadline = null,
  fallbackModel = OPENROUTER_FALLBACK_MODEL,
}) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-Title': 'NOVA AI',
  };
  const referer = getReferer();
  if (referer) headers['HTTP-Referer'] = referer;

  const send = (modelId) => fetchProviderJson({
    fetchImpl,
    url: OPENROUTER_CHAT_COMPLETIONS_URL,
    init: {
      method: 'POST',
      headers,
      body: openRouterRequestBody({ model: modelId, messages, language, thinking }),
    },
    timeoutMs,
    provider: 'openrouter',
    model: modelId,
    deadline,
  });

  let usedModel = model;
  let upstreamResult = await send(model);
  const firstError = upstreamResult.error || null;
  if (upstreamResult.error) {
    const code = upstreamResult.error.body?.code;
    // Only the shared free router is substituted: an operator who pinned a specific
    // model wants that model's error, not a silent switch to `openrouter/auto`.
    const modelGone = model === OPENROUTER_FREE_MODEL
      && (code === 'FREE_MODEL_UNAVAILABLE' || code === 'MODEL_UNAVAILABLE');
    const worthAnother = modelGone && fallbackModel && fallbackModel !== model
      && remainingTime(deadline) > MIN_ATTEMPT_BUDGET_MS + RETRY_DELAY_MS;
    if (worthAnother) {
      usedModel = fallbackModel;
      upstreamResult = await send(fallbackModel);
      if (!upstreamResult.error) upstreamResult.modelFallback = true;
    }
  }
  if (upstreamResult.error) {
    // The configured model's reason is the truth; "openrouter/auto 404'd" is an
    // artefact of the fallback. Report the first failure and keep the evidence.
    const reported = firstError || upstreamResult.error;
    return usedModel === model
      ? reported
      : { ...reported, body: { ...reported.body, fallbackModel: usedModel } };
  }

  const rawText = extractText(upstreamResult.data?.choices?.[0]?.message?.content);
  if (!rawText) {
    return withProvider(
      errorResult(502, 'EMPTY_PROVIDER_RESPONSE', 'The AI provider returned an empty response. Please retry.'),
      'openrouter',
    );
  }

  const parsed = extractSuggestions(rawText, language);
  const body = {
    text: parsed.text || rawText,
    suggestions: parsed.suggestions,
    model: typeof upstreamResult.data?.model === 'string' && upstreamResult.data.model.length <= 160
      ? upstreamResult.data.model
      : usedModel,
    provider: PROVIDER_NAMES.openrouter,
    lang: language,
    thinking,
    fallback: false,
  };
  if (usedModel !== model) {
    body.requestedModel = model;
    body.modelFallback = true;
  }
  if (upstreamResult.attempts > 1) body.attempts = upstreamResult.attempts;
  return result(200, body);
}

// ---------------------------------------------------------------------------
// Gemini model discovery
//
// The hand-written fallback list cannot keep up with Google's retirements: on
// production `gemini-2.5-pro`, `-flash-lite` and `-flash` all answer 404 for
// this key while still being *listed* by it. When every static candidate fails,
// one cheap `GET /v1beta/models` (measured at 51 ms) tells us which chat ids the
// key may actually call, and one of them gets the last attempt.
// ---------------------------------------------------------------------------
const GEMINI_DISCOVERY_TTL_MS = 10 * 60_000;
const GEMINI_DISCOVERY_TIMEOUT_MS = 3_000;
const GEMINI_DISCOVERY_MAX_CANDIDATES = 2;
const geminiDiscoveryCache = { key: '', at: 0, models: [] };
// Ids this process already saw retired (404/422). A warm function can spend
// ~250 ms asking three dead ids on every request; remembering them is free and
// the configured model is still always tried first.
const GEMINI_RETIRED_TTL_MS = 30 * 60_000;
const geminiRetired = new Map();

/** Test seam: forget what was discovered (never needed in production). */
export function resetGeminiDiscoveryCache() {
  geminiDiscoveryCache.key = '';
  geminiDiscoveryCache.at = 0;
  geminiDiscoveryCache.models = [];
  geminiRetired.clear();
}

function isRetired(model) {
  const at = geminiRetired.get(model);
  if (!at) return false;
  if (Date.now() - at > GEMINI_RETIRED_TTL_MS) {
    geminiRetired.delete(model);
    return false;
  }
  return true;
}

/** Chat-capable ids from the key's own catalogue, most capable first. */
export function pickGeminiChatModels(models) {
  const usable = (Array.isArray(models) ? models : [])
    .map((entry) => String(entry || '').trim().replace(/^models\//, ''))
    .filter((id) => /^gemini-(3|4)[.-]/i.test(id))
    .filter((id) => !/(image|tts|audio|embedding|live|computer-use|deep-research|antigravity)/i.test(id));
  const rank = (id) => (/flash/i.test(id) ? 0 : /pro/i.test(id) ? 1 : 2);
  return [...new Set(usable)].sort((a, b) => rank(a) - rank(b) || a.length - b.length);
}

async function discoverGeminiModels({ fetchImpl, apiKey }) {
  if (!apiKey) return [];
  const now = Date.now();
  if (geminiDiscoveryCache.key === apiKey && now - geminiDiscoveryCache.at < GEMINI_DISCOVERY_TTL_MS) {
    return geminiDiscoveryCache.models;
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), GEMINI_DISCOVERY_TIMEOUT_MS) : null;
  try {
    const response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
      method: 'GET',
      headers: { 'x-goog-api-key': apiKey },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!response?.ok || typeof response.json !== 'function') return [];
    const data = await response.json();
    const models = (Array.isArray(data?.models) ? data.models : [])
      .filter((model) => Array.isArray(model?.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'))
      .map((model) => model?.name);
    geminiDiscoveryCache.key = apiKey;
    geminiDiscoveryCache.at = now;
    geminiDiscoveryCache.models = pickGeminiChatModels(models);
    return geminiDiscoveryCache.models;
  } catch {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function callGemini({
  fetchImpl,
  apiKey,
  model,
  messages,
  language,
  thinking = DEFAULT_THINKING_LEVEL,
  timeoutMs,
  deadline = null,
  discoverModels = discoverGeminiModels,
}) {
  const contents = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
  // One absolute deadline for the whole hop: candidates share it, so the chain
  // can never spend five separate timeouts on a provider that is down.
  const hopDeadline = deadline || (timeoutMs ? Date.now() + timeoutMs : null);
  let upstreamResult = null;
  let firstError = null;
  let usedModel = model;
  let discoveries = 0;
  const tried = new Set();
  const queue = [...geminiModelCandidates(model)];

  while (queue.length) {
    const left = remainingTime(hopDeadline);
    if (left !== Number.POSITIVE_INFINITY && left <= 0) break;
    // The configured id always gets its attempt; extra ids only when there is
    // room for one, so a nearly-spent budget cannot start a doomed request.
    if (tried.size > 0 && left !== Number.POSITIVE_INFINITY && left < MIN_ATTEMPT_BUDGET_MS) break;
    const candidate = queue.shift();
    if (tried.has(candidate)) continue;
    // Never skip the configured id: it must report its own reason.
    if (candidate !== model && isRetired(candidate)) continue;
    tried.add(candidate);
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
      deadline: hopDeadline,
      retryDelayMs: 600,
    });
    if (!upstreamResult.error) break;
    if (!firstError) firstError = upstreamResult.error;
    // Only a missing id, or a model Google itself calls overloaded, is worth
    // another id. A 429, a rejected key or a generic 5xx is reported as it is.
    const upstreamStatus = upstreamResult.error.body?.upstreamStatus;
    if (upstreamStatus === 404 || upstreamStatus === 422) geminiRetired.set(candidate, Date.now());
    if (!GEMINI_RETRYABLE_MODEL_STATUSES.has(upstreamStatus)) break;
    // The static list is exhausted and the budget allows it: ask the key what it
    // can actually call, then give the best remaining id one attempt.
    const leftAfter = remainingTime(hopDeadline);
    if (!queue.length && !discoveries && leftAfter !== Number.POSITIVE_INFINITY && leftAfter > MIN_ATTEMPT_BUDGET_MS * 2) {
      discoveries += 1;
      const discovered = await discoverModels({ fetchImpl, apiKey });
      for (const id of pickGeminiChatModels(discovered).slice(0, GEMINI_DISCOVERY_MAX_CANDIDATES)) {
        if (!tried.has(id)) queue.push(id);
      }
    }
  }
  if (!upstreamResult) {
    // Not one attempt fitted in the remaining budget: say so instead of throwing.
    return withProvider(
      withEvidence(errorResult(504, 'AI_TIMEOUT', 'The AI response took too long. Please retry.'), {
        reason: 'no-budget',
        modelsTried: [...tried],
      }),
      'gemini',
    );
  }
  // Report the configured model's error, not the last fallback's: "your model is
  // overloaded" is the truth, "the alias 404'd" is an artefact of the retry.
  if (upstreamResult.error) {
    const reported = firstError || upstreamResult.error;
    return {
      ...reported,
      body: { ...reported.body, modelsTried: [...tried] },
    };
  }

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

async function callArena({
  fetchImpl,
  apiKey,
  model,
  messages,
  language,
  thinking = DEFAULT_THINKING_LEVEL,
  timeoutMs,
  deadline = null,
}) {
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
    deadline,
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
  budgetMs = AUTO_CHAIN_BUDGET_MS,
} = {}) {
  const readOpenRouterKey = getOpenRouterApiKey || getApiKey || (() => getProcessEnv().OPENROUTER_API_KEY);
  // One ceiling for the whole automatic chain; a test may shrink it.
  const chainBudgetMs = Math.max(1_000, Number(budgetMs) || AUTO_CHAIN_BUDGET_MS);

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
    // Absolute deadline for every online attempt, with time kept back so the
    // offline engine can still answer before the platform kills the function.
    const reserve = Math.min(LOCAL_FALLBACK_RESERVE_MS, Math.floor(chainBudgetMs / 4));
    const chainDeadline = chainStartedAt + Math.max(500, chainBudgetMs - reserve);
    // A hop is worth starting only if it can finish; the floor scales with the
    // budget so a deliberately short chain (tests, a constrained deployment)
    // still tries every provider instead of skipping them all.
    const minHopMs = Math.min(MIN_ATTEMPT_BUDGET_MS, Math.max(50, Math.floor(chainBudgetMs / 6)));
    for (const provider of providerOrder) {
      const remainingMs = remainingTime(chainDeadline);
      if (remainingMs < minHopMs) break;
      const providerTimeout = Math.min(timeoutMs, remainingMs);
      // Each hop gets its own slice: one slow provider may not eat the budget
      // another provider could have answered with.
      const hopDeadline = Date.now() + providerTimeout;
      const shared = {
        fetchImpl,
        messages: validated.messages,
        language: validated.language,
        thinking: validated.thinking,
        timeoutMs: providerTimeout,
        deadline: hopDeadline,
      };

      let response;
      if (provider === 'arena') {
        response = await callArena({ ...shared, apiKey: keys.arena, model: models.arena });
      } else if (provider === 'openrouter') {
        response = await callOpenRouter({ ...shared, apiKey: keys.openrouter, model: models.openrouter });
      } else {
        response = await callGemini({ ...shared, apiKey: keys.gemini, model: models.gemini });
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
        // Numbers and fixed vocabulary only: how many attempts were spent, what
        // kind of body arrived, and how long the hop took. This is what makes
        // "the provider returned an unreadable response" actionable.
        ...(Number(response.body?.attempts) > 1 ? { attempts: Number(response.body.attempts) } : {}),
        ...(typeof response.body?.bodyShape === 'string' ? { bodyShape: response.body.bodyShape } : {}),
        ...(typeof response.body?.phase === 'string' ? { phase: response.body.phase } : {}),
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
