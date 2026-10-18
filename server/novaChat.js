import { generateLocalSpaceResponse } from '../src/utils/spaceLocalAiEngine.js';

const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_GENERATE_CONTENT_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
export const OPENROUTER_FREE_MODEL = 'openrouter/free';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

const MAX_REQUEST_BYTES = 24 * 1024;
const MAX_TOTAL_MESSAGE_BYTES = 20 * 1024;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_MESSAGES = 12;
const UPSTREAM_TIMEOUT_MS = 8_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 8;
const SUPPORTED_LANGUAGES = new Set(['en', 'si', 'ta']);
const SUPPORTED_PROVIDERS = new Set(['auto', 'local', 'gemini', 'openrouter']);
const PROVIDER_NAMES = {
  local: 'NOVA Local Space Engine',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
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

  let provider = 'auto';
  if (body.provider !== undefined) {
    if (typeof body.provider !== 'string' || !SUPPORTED_PROVIDERS.has(body.provider.trim().toLowerCase())) {
      return { error: errorResult(400, 'INVALID_PROVIDER', 'Provider must be auto, local, gemini, or openrouter.') };
    }
    provider = body.provider.trim().toLowerCase();
  }

  return { messages, language, provider };
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

function makeSystemPrompt(language) {
  return [
    'You are NOVA, a helpful AI assistant for NASA missions, astronomy, and space exploration.',
    'Answer accurately and accessibly. Do not claim to be an official NASA service or to have live NASA telemetry, current web access, or data that was not supplied in the conversation. State uncertainty when facts may have changed.',
    `Language preference: ${LANGUAGE_GUIDANCE[language]} Always prioritize the language used in the latest user message if it differs from this hint.`,
    'Use readable Markdown. End with up to three short, relevant follow-up questions on one line using exactly: SUGGESTIONS: [Question 1] | [Question 2] | [Question 3]. Write those questions in the response language.',
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

function providerError(status, provider, model) {
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
  return withProvider(response, provider);
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

function getLocalResponse(query, language, { fallback = false } = {}) {
  const local = generateLocalSpaceResponse(query, language);
  return result(200, {
    text: local.text,
    suggestions: Array.isArray(local.suggestions) ? local.suggestions : FALLBACK_SUGGESTIONS[language],
    model: 'nasa-local-engine',
    provider: PROVIDER_NAMES.local,
    lang: language,
    fallback,
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

async function callOpenRouter({ fetchImpl, apiKey, model, messages, language, timeoutMs }) {
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
          { role: 'system', content: makeSystemPrompt(language) },
          ...messages,
        ],
        temperature: 0.7,
        max_tokens: 1_200,
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
    fallback: false,
  });
}

async function callGemini({ fetchImpl, apiKey, model, messages, language, timeoutMs }) {
  const url = `${GEMINI_GENERATE_CONTENT_URL}/${encodeURIComponent(model)}:generateContent`;
  const contents = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
  const upstreamResult = await fetchProviderJson({
    fetchImpl,
    url,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: makeSystemPrompt(language) }] },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1_200,
        },
      }),
    },
    timeoutMs,
    provider: 'gemini',
    model,
  });
  if (upstreamResult.error) return upstreamResult.error;

  const rawText = extractText(upstreamResult.data?.candidates?.[0]?.content?.parts);
  if (!rawText) {
    return withProvider(
      errorResult(502, 'EMPTY_PROVIDER_RESPONSE', 'The AI provider returned an empty response. Please retry.'),
      'gemini',
    );
  }

  const parsed = extractSuggestions(rawText, language);
  return result(200, {
    text: parsed.text || rawText,
    suggestions: parsed.suggestions,
    model,
    provider: PROVIDER_NAMES.gemini,
    lang: language,
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

/** Return only safe provider availability information. Never return API key values. */
export function getNovaPublicConfig({ env = getProcessEnv() } = {}) {
  return {
    providers: {
      auto: true,
      local: true,
      gemini: typeof env.GEMINI_API_KEY === 'string' && Boolean(env.GEMINI_API_KEY.trim()),
      openrouter: typeof env.OPENROUTER_API_KEY === 'string' && Boolean(env.OPENROUTER_API_KEY.trim()),
    },
  };
}

export function createNovaChatHandler({
  fetchImpl = (...args) => globalThis.fetch(...args),
  getOpenRouterApiKey,
  getGeminiApiKey = () => getProcessEnv().GEMINI_API_KEY,
  // Backwards-compatible alias for callers/tests written for the original OpenRouter-only handler.
  getApiKey,
  getOpenRouterModel = () => getProcessEnv().NOVA_OPENROUTER_MODEL,
  getGeminiModel = () => getProcessEnv().NOVA_GEMINI_MODEL,
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
      return getLocalResponse(validated.messages.at(-1).content, validated.language);
    }

    const keys = {
      openrouter: readKey(readOpenRouterKey),
      gemini: readKey(getGeminiApiKey),
    };
    const models = {
      openrouter: cleanModelName(readKey(getOpenRouterModel), OPENROUTER_FREE_MODEL),
      gemini: cleanModelName(readKey(getGeminiModel), DEFAULT_GEMINI_MODEL),
    };

    const providerOrder = validated.provider === 'auto'
      ? ['openrouter', 'gemini'].filter((provider) => Boolean(keys[provider]))
      : [validated.provider];

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
      return getLocalResponse(validated.messages.at(-1).content, validated.language, { fallback: true });
    }

    let lastError = null;
    for (const provider of providerOrder) {
      const response = provider === 'openrouter'
        ? await callOpenRouter({
          fetchImpl,
          apiKey: keys.openrouter,
          model: models.openrouter,
          messages: validated.messages,
          language: validated.language,
          timeoutMs,
        })
        : await callGemini({
          fetchImpl,
          apiKey: keys.gemini,
          model: models.gemini,
          messages: validated.messages,
          language: validated.language,
          timeoutMs,
        });

      if (response.status === 200) return response;
      lastError = response;
      if (validated.provider !== 'auto') return response;
    }

    // Automatic routing is resilient: if configured online providers are unavailable,
    // answer from the bundled local knowledge engine and identify that provider honestly.
    if (validated.provider === 'auto') {
      return getLocalResponse(validated.messages.at(-1).content, validated.language, { fallback: true });
    }

    return lastError || errorResult(503, 'PROVIDER_UNAVAILABLE', 'NOVA could not complete this request. Please retry.');
  };
}

// Vercel and Express adapters share this handler. Its limiter is per warm process;
// use a distributed rate limiter if a deployment-wide quota is needed.
export const handleNovaChatRequest = createNovaChatHandler();
