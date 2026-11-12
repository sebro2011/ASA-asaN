/**
 * Chat transport for the workspace (Phase 3D-1).
 *
 * The server contract is frozen — this is a thin, typed client of
 * `POST /api/nova/chat`, which is the same handler the legacy `/explore` chat
 * uses. Nothing here touches provider selection logic; it only forwards
 * `{ messages, lang, provider }` and normalises the reply or the error code.
 */

export type ChatProvider = 'auto' | 'arena' | 'openrouter' | 'gemini' | 'local';

/**
 * Reasoning ladder, ordered fastest → deepest. The server maps each level onto
 * OpenRouter's `reasoning.effort` plus a token budget; see `thinking.ts`.
 */
export type ChatThinking = 'auto' | 'flash' | 'flash-thinking' | 'thinking' | 'deep-thinking';

export interface ChatTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** One online provider that was tried and failed while answering offline. */
export interface ChatFallbackHop {
  provider: string;
  code: string;
  status: number;
}

export interface ChatReply {
  text: string;
  provider: string;
  model: string;
  /** The level the server actually used (echoed, never guessed). */
  thinking: ChatThinking;
  suggestions: string[];
  fallback: boolean;
  /** Empty unless `fallback` — then it says which providers failed and how. */
  fallbackChain: ChatFallbackHop[];
}

export type ChatErrorCode =
  | 'PROVIDER_NOT_CONFIGURED'
  | 'UPSTREAM_RATE_LIMITED'
  | 'UPSTREAM_NETWORK_ERROR'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_AUTH_ERROR'
  | 'AI_TIMEOUT'
  | 'HISTORY_TOO_LONG'
  | 'MESSAGE_TOO_LARGE'
  | 'REQUEST_TOO_LARGE'
  | 'INVALID_REQUEST'
  | 'INVALID_THINKING'
  | 'EMPTY_PROVIDER_RESPONSE'
  | 'RATE_LIMITED'
  | 'MODEL_UNAVAILABLE'
  | 'PROVIDER_MODEL_NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'NETWORK'
  /** The reader pressed Stop; nothing failed, so no error bubble is shown. */
  | 'ABORTED'
  | 'UNKNOWN';

export type ChatResult =
  | { ok: true; reply: ChatReply }
  | {
      ok: false;
      code: ChatErrorCode;
      /** Which online provider refused, and the status it returned. Never a key. */
      provider?: string;
      upstreamStatus?: number;
    };

/** Server codes map to one localised sentence each; unknown codes stay generic. */
const KNOWN_CODES = new Set<string>([
  'PROVIDER_NOT_CONFIGURED',
  'UPSTREAM_RATE_LIMITED',
  'UPSTREAM_NETWORK_ERROR',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_AUTH_ERROR',
  'AI_TIMEOUT',
  'HISTORY_TOO_LONG',
  'MESSAGE_TOO_LARGE',
  'REQUEST_TOO_LARGE',
  'INVALID_REQUEST',
  'INVALID_MESSAGES',
  'INVALID_CONTENT',
  'INVALID_ROLE',
  'INVALID_PROVIDER',
  'INVALID_LANGUAGE',
  'INVALID_THINKING',
  'EMPTY_PROVIDER_RESPONSE',
  'INVALID_PROVIDER_RESPONSE',
  'PROVIDER_ERROR',
  'RATE_LIMITED',
  // The server answers 429 with a lowercase 'rate-limit' from the Express
  // middleware, and with 'RATE_LIMITED' from the chat handler. Same thing.
  'rate-limit',
  'MODEL_UNAVAILABLE',
  'FREE_MODEL_UNAVAILABLE',
  'PROVIDER_MODEL_NOT_FOUND',
  'INTERNAL_ERROR',
]);

export function normaliseErrorCode(code: unknown, status?: number): ChatErrorCode {
  if (typeof code === 'string' && KNOWN_CODES.has(code)) {
    if (code === 'INVALID_MESSAGES' || code === 'INVALID_CONTENT' || code === 'INVALID_ROLE'
      || code === 'INVALID_PROVIDER' || code === 'INVALID_LANGUAGE') {
      return 'INVALID_REQUEST';
    }
    if (code === 'INVALID_THINKING') return 'INVALID_THINKING';
    if (code === 'INVALID_PROVIDER_RESPONSE' || code === 'PROVIDER_ERROR') {
      return 'PROVIDER_UNAVAILABLE';
    }
    if (code === 'rate-limit') {
      return 'RATE_LIMITED';
    }
    if (code === 'FREE_MODEL_UNAVAILABLE' || code === 'MODEL_UNAVAILABLE') {
      return 'MODEL_UNAVAILABLE';
    }
    return code as ChatErrorCode;
  }
  // A 429 without a code came from our own limiter, not from a provider.
  if (status === 429) return 'RATE_LIMITED';
  if (status === 413) return 'MESSAGE_TOO_LARGE';
  if (status === 504) return 'AI_TIMEOUT';
  return 'UNKNOWN';
}

/** i18n key for an error code (every language defines all of them). */
export function chatErrorKey(code: ChatErrorCode): string {
  switch (code) {
    case 'PROVIDER_NOT_CONFIGURED':
      return 'wsChatErrProviderOff';
    case 'UPSTREAM_RATE_LIMITED':
      return 'wsChatErrRateLimited';
    case 'UPSTREAM_NETWORK_ERROR':
    case 'NETWORK':
      return 'wsChatErrNetwork';
    case 'PROVIDER_UNAVAILABLE':
    case 'EMPTY_PROVIDER_RESPONSE':
      return 'wsChatErrUnavailable';
    case 'RATE_LIMITED':
      return 'wsChatErrRateLimited';
    case 'PROVIDER_MODEL_NOT_FOUND':
      return 'wsChatErrModelRetired';
    case 'MODEL_UNAVAILABLE':
      return 'wsChatErrModel';
    case 'PROVIDER_AUTH_ERROR':
      return 'wsChatErrAuth';
    case 'AI_TIMEOUT':
      return 'wsChatErrTimeout';
    case 'HISTORY_TOO_LONG':
      return 'wsChatErrHistoryLong';
    case 'MESSAGE_TOO_LARGE':
    case 'REQUEST_TOO_LARGE':
      return 'wsChatErrTooLarge';
    case 'INVALID_REQUEST':
      return 'wsChatErrInvalid';
    case 'INVALID_THINKING':
      return 'wsChatErrThinking';
    default:
      return 'wsChatErrUnknown';
  }
}

export interface SendChatOptions {
  messages: ChatTurn[];
  lang: string;
  provider?: ChatProvider;
  /** Reasoning depth. `auto` keeps the deployment's default behaviour. */
  thinking?: ChatThinking;
  signal?: AbortSignal;
}

export async function sendChat({
  messages,
  lang,
  provider = 'auto',
  thinking = 'auto',
  signal,
}: SendChatOptions): Promise<ChatResult> {
  let response: Response;
  try {
    response = await fetch('/api/nova/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ messages, lang, provider, thinking }),
      signal,
    });
  } catch {
    // An aborted request is a user action, not a failure — keep the two apart.
    return { ok: false, code: signal?.aborted ? 'ABORTED' : 'NETWORK' };
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (!response.ok || typeof body.text !== 'string') {
    const upstreamStatus = Number(body.upstreamStatus);
    return {
      ok: false,
      code: normaliseErrorCode(body.code, response.status),
      ...(typeof body.provider === 'string' && body.provider.trim() ? { provider: body.provider.trim() } : {}),
      ...(Number.isFinite(upstreamStatus) && upstreamStatus > 0 ? { upstreamStatus } : {}),
    };
  }

  return {
    ok: true,
    reply: {
      text: body.text,
      provider: typeof body.provider === 'string' ? body.provider : 'NOVA',
      model: typeof body.model === 'string' ? body.model : '',
      thinking: normaliseThinking(body.thinking),
      suggestions: Array.isArray(body.suggestions)
        ? body.suggestions.filter((item): item is string => typeof item === 'string').slice(0, 4)
        : [],
      fallback: body.fallback === true,
      fallbackChain: normaliseFallbackChain(body.fallbackChain),
    },
  };
}

function normaliseFallbackChain(value: unknown): ChatFallbackHop[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((hop): hop is Record<string, unknown> => Boolean(hop) && typeof hop === 'object')
    .map((hop) => ({
      provider: typeof hop.provider === 'string' ? hop.provider.slice(0, 60) : '',
      code: typeof hop.code === 'string' ? hop.code.slice(0, 60) : '',
      status: Number(hop.status) > 0 ? Number(hop.status) : 0,
    }))
    .filter((hop) => Boolean(hop.provider || hop.code))
    .slice(0, 4);
}

/** `Google Gemini · PROVIDER_AUTH_ERROR · HTTP 401` — safe to show and to copy. */
export function describeChatFailure(failure: {
  code: string;
  provider?: string;
  upstreamStatus?: number;
}): string {
  return [
    failure.provider,
    failure.code,
    failure.upstreamStatus && failure.upstreamStatus > 0 ? `HTTP ${failure.upstreamStatus}` : '',
  ].filter(Boolean).join(' · ');
}

/** The same line for every failed hop behind an offline answer. */
export function describeFallbackChain(chain: ChatFallbackHop[]): string {
  return chain
    .map((hop) => [hop.provider, hop.code, hop.status > 0 ? `HTTP ${hop.status}` : ''].filter(Boolean).join(' · '))
    .filter(Boolean)
    .join(' | ');
}

/** Match the server's 12-message and 20 KiB text limits, including the new turn. */
export const HISTORY_WINDOW = 12;

export function historyWindow(messages: ChatTurn[]): ChatTurn[] {
  const usable = messages.filter((message) =>
    (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string' && message.content.trim(),
  );
  if (!usable.length) return [];
  // Never silently truncate the user's latest turn: the server will report a
  // useful error if it exceeds the per-message or request size limit.
  const result = [usable[usable.length - 1]];
  const encoder = new TextEncoder();
  let textBytes = encoder.encode(result[0].content).length;
  for (let index = usable.length - 2; index >= 0 && result.length < HISTORY_WINDOW; index -= 1) {
    const message = usable[index];
    const bytes = encoder.encode(message.content).length;
    if (message.content.length > 4_000 || textBytes + bytes > 20 * 1024) break;
    // JSON escaping may add many bytes (e.g. quotes or newlines). Leave room
    // for the rest of the request under the server's 24 KiB ceiling.
    if (encoder.encode(JSON.stringify([message, ...result])).length > 23 * 1024) break;
    result.unshift(message);
    textBytes += bytes;
  }
  return result;
}

/** Only the five known levels are accepted; anything else becomes `auto`. */
function normaliseThinking(value: unknown): ChatThinking {
  switch (value) {
    case 'flash':
    case 'flash-thinking':
    case 'thinking':
    case 'deep-thinking':
      return value;
    default:
      return 'auto';
  }
}
