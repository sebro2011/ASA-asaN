/**
 * Provider adapters for the Earth Science Analyst.
 *
 * Gemini stays the primary provider and keeps the same model id, system
 * instruction and response schema it always had — only the call is now wrapped
 * so its failures are classifiable instead of fatal. OpenRouter and Arena are
 * opt-in: they participate only when their key is already present in the
 * environment, so nothing new has to be bought or configured to run the app.
 */

import { GoogleGenAI, Type } from '@google/genai';
import { ProviderError, type ProviderAdapter, type ProviderGenerateArgs } from './providerOrchestrator';

/**
 * `@google/genai` exposes the answer as a string in current versions and as a
 * getter in older ones. Both are read here, and anything else is treated as an
 * empty answer so the orchestrator's `EMPTY_RESPONSE` path still applies.
 */
function readResponseText(response: unknown): string {
  if (!response || typeof response !== 'object') return '';
  const text = (response as { text?: unknown }).text;
  if (typeof text === 'string') return text;
  if (typeof text === 'function') {
    const value: unknown = (text as () => unknown).call(response);
    return typeof value === 'string' ? value : '';
  }
  return '';
}

/** Only the two fields of an OpenAI-compatible chat completion that are read. */
interface ChatCompletionResponse {
  choices?: { message?: { content?: unknown } }[];
}

export const ANALYST_MODEL = process.env.NOVA_ANALYST_MODEL || 'gemini-3.8-flash';
export const OPENROUTER_MODEL = process.env.EARTH_ANALYST_OPENROUTER_MODEL || 'google/gemini-2.0-flash-001';
export const ARENA_MODEL = process.env.EARTH_ANALYST_ARENA_MODEL || 'gemini-2.5-flash';

export const ANALYST_SYSTEM_INSTRUCTION = `You are the Earth Science Analyst inside the NASA Space Explorer Earth Intelligence Lab.

Absolute rules:
1. You may ONLY use the numbers, dataset names, dates, coverage strings and URLs present in the JSON context supplied by the client. Never add measurements, hotspot counts, alerts, place names or sources from memory.
2. If a value needed to answer is absent from the context, say it is not available in the retrieved data and name what would be required.
3. Separate your answer into:
   - verified: statements that restate retrieved values or documented dataset metadata;
   - derived: arithmetic or comparisons you performed on those retrieved values (show the calculation style, e.g. "mean of the 12 monthly values");
   - interpretation: scientific reading, always hedged and clearly labelled as interpretation;
   - limitations: dataset limitations, uncertainty, and what the data cannot establish;
   - gaps: missing data.
4. Never claim that two images prove a trend. Never claim statistical significance or attribution.
5. Cite the source URLs exactly as they appear in the context, and only those.
6. Be concise: at most 5 bullets per section, each under 45 words.
7. Write in the requested language (English, Sinhala or Tamil) using correct scientific terminology.
8. The context may contain a "localAnalysis" block of arithmetic already computed from the retrieved values. You may restate those results; you may not recompute them differently.`;

const ANALYST_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: { type: Type.STRING, description: 'verified | derived | interpretation | limitations | gaps' },
          title: { type: Type.STRING },
          bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['kind', 'title', 'bullets'],
      },
    },
    sources: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          url: { type: Type.STRING },
          detail: { type: Type.STRING },
        },
        required: ['label', 'url'],
      },
    },
  },
  required: ['sections'],
};

/** JSON Schema flavour used by OpenAI-compatible endpoints. */
const OPENAI_SCHEMA = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string' },
          title: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string' } },
        },
        required: ['kind', 'title', 'bullets'],
        additionalProperties: false,
      },
    },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: { label: { type: 'string' }, url: { type: 'string' }, detail: { type: 'string' } },
        required: ['label', 'url'],
        additionalProperties: false,
      },
    },
  },
  required: ['sections'],
  additionalProperties: false,
};

export function analystPrompt(question: string, context: unknown, languageName: string): string {
  return `Question from the user (answer in ${languageName}):\n\n${question}\n\nRetrieved data context (JSON, the only allowed source of facts):\n${JSON.stringify(
    context
  )}`;
}

/**
 * A persona is what makes a provider call specific to one surface: its system
 * instruction, the prompt it builds from (question, context, language) and the
 * JSON schema the model must return.
 *
 * The Earth analyst and the Forge research assistant share the same retry,
 * backoff, circuit-breaker and timeout code (providerOrchestrator) and differ
 * only here — which is why they cannot drift apart in resilience behaviour.
 */
export interface Persona {
  systemInstruction: string;
  buildPrompt: (args: { question: string; context: unknown; languageName: string }) => string;
  /** Gemini structured-output schema; omitted for providers without schema support. */
  responseSchema?: unknown;
}

export const EARTH_ANALYST_PERSONA: Persona = {
  systemInstruction: ANALYST_SYSTEM_INSTRUCTION,
  buildPrompt: ({ question, context, languageName }) => analystPrompt(question, context, languageName),
  responseSchema: ANALYST_RESPONSE_SCHEMA,
};

interface ErrorLike {
  status?: unknown;
  code?: unknown;
  error?: { code?: unknown };
  response?: { status?: unknown; headers?: Record<string, unknown> };
  headers?: Record<string, unknown>;
}

/** Reads a status off whatever an SDK threw, without trusting its shape. */
function statusFromError(input: unknown): number | undefined {
  const error = (input ?? {}) as ErrorLike;
  const candidates = [error.status, error.code, error.error?.code, error.response?.status];
  for (const candidate of candidates) {
    const value = typeof candidate === 'string' ? Number(candidate) : candidate;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 100 && value <= 599) return value;
  }
  return undefined;
}

function retryAfterFromError(input: unknown): number | undefined {
  const error = (input ?? {}) as ErrorLike;
  const header = error.response?.headers?.['retry-after'] || error.headers?.['retry-after'];
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : undefined;
}

export function createGeminiProvider(options: { client: GoogleGenAI; model?: string }): ProviderAdapter {
  return createGeminiPersonaProvider({ ...options, persona: EARTH_ANALYST_PERSONA });
}

/** Gemini adapter for any persona; the Earth analyst passes its own. */
export function createGeminiPersonaProvider(options: {
  client: GoogleGenAI;
  model?: string;
  persona: Persona;
}): ProviderAdapter {
  const persona = options.persona;
  const model = options.model || ANALYST_MODEL;
  return {
    id: 'gemini',
    label: 'Google Gemini',
    model,
    isConfigured: () => Boolean(options.client),
    async generate({ question, context, lang, signal, timeoutMs }: ProviderGenerateArgs) {
      const languageName = ({ en: 'English', si: 'Sinhala (සිංහල)', ta: 'Tamil (தமிழ்)' } as Record<string, string>)[lang] || 'English';
      const call = options.client.models.generateContent({
        model,
        contents: persona.buildPrompt({ question, context, languageName }),
        config: {
          systemInstruction: persona.systemInstruction,
          responseMimeType: 'application/json',
          ...(persona.responseSchema ? { responseSchema: persona.responseSchema } : {}),
          temperature: 0.2,
          // The SDK forwards this when it supports it; the orchestrator's own
          // timeout still bounds the attempt either way.
          abortSignal: signal,
        },
      });

      let timer: ReturnType<typeof setTimeout> | undefined;
      const guard = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ProviderError(`Gemini exceeded ${timeoutMs} ms`, { code: 'TIMEOUT', retryable: true })), timeoutMs);
      });

      try {
        const response = await Promise.race([call, guard]);
        const text = readResponseText(response);
        if (!text) throw new ProviderError('Gemini returned an empty response', { code: 'EMPTY_RESPONSE', retryable: true });
        return text;
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError(String((error as Error)?.message || 'Gemini call failed'), {
          status: statusFromError(error),
          retryAfterMs: retryAfterFromError(error),
        });
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}

interface ChatProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl: string;
  extraHeaders?: Record<string, string>;
  fetchImpl?: typeof fetch;
  /** Defaults to the Earth analyst persona for the existing call sites. */
  persona?: Persona;
}

/** Exported so the Forge assistant can reuse the same transport with its own persona. */
export function createChatCompletionsProvider(
  id: 'openrouter' | 'arena' | 'forge',
  label: string,
  options: ChatProviderOptions
): ProviderAdapter {
  const persona = options.persona ?? EARTH_ANALYST_PERSONA;
  const model = options.model || OPENROUTER_MODEL;
  const fetchImpl = options.fetchImpl || fetch;
  return {
    id,
    label,
    model,
    isConfigured: () => Boolean(options.apiKey),
    async generate({ question, context, lang, signal, timeoutMs }: ProviderGenerateArgs) {
      const languageName = ({ en: 'English', si: 'Sinhala (සිංහල)', ta: 'Tamil (தமிழ்)' } as Record<string, string>)[lang] || 'English';
      let response: Response;
      try {
        response = await fetchImpl(`${options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.apiKey}`,
            ...(options.extraHeaders || {}),
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: persona.systemInstruction },
              { role: 'user', content: persona.buildPrompt({ question, context, languageName }) },
            ],
          }),
          signal,
        });
      } catch (error) {
        const aborted = (error as Error)?.name === 'AbortError';
        throw new ProviderError(aborted ? `${label} timed out after ${timeoutMs} ms` : `${label} request failed`, {
          code: aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
          retryable: true,
        });
      }

      if (!response.ok) {
        const retryAfter = Number(response.headers?.get?.('retry-after'));
        throw new ProviderError(`${label} responded ${response.status}`, {
          status: response.status,
          retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : undefined,
        });
      }

      let payload: ChatCompletionResponse | null = null;
      try {
        payload = await response.json() as ChatCompletionResponse | null;
      } catch {
        throw new ProviderError(`${label} returned a non-JSON body`, { code: 'UNPARSABLE_RESPONSE', retryable: true });
      }
      const text = payload?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) {
        throw new ProviderError(`${label} returned an empty message`, { code: 'EMPTY_RESPONSE', retryable: true });
      }
      return text;
    },
  };
}

export function createOpenRouterProvider(options: { apiKey?: string; model?: string; fetchImpl?: typeof fetch }): ProviderAdapter {
  return createChatCompletionsProvider('openrouter', 'OpenRouter', {
    apiKey: options.apiKey,
    model: options.model || OPENROUTER_MODEL,
    baseUrl: 'https://openrouter.ai/api/v1',
    extraHeaders: { 'HTTP-Referer': 'https://nasa-space-expolere.vercel.app', 'X-Title': 'NASA Space Explorer — Earth Lab' },
    fetchImpl: options.fetchImpl,
  });
}

export function createArenaProvider(options: { apiKey?: string; baseUrl?: string; model?: string; fetchImpl?: typeof fetch }): ProviderAdapter {
  const baseUrl = options.baseUrl || process.env.ARENA_BASE_URL || '';
  return createChatCompletionsProvider('arena', 'Arena AI', {
    apiKey: options.apiKey && baseUrl ? options.apiKey : undefined,
    model: options.model || ARENA_MODEL,
    baseUrl: baseUrl || 'https://api.arena.ai/v1',
    fetchImpl: options.fetchImpl,
  });
}

/** Builds the adapters from the environment. Missing keys simply skip. */
export function createConfiguredProviders(options: { fetchImpl?: typeof fetch } = {}): ProviderAdapter[] {
  const gemini = createGeminiProvider({
    client: process.env.GEMINI_API_KEY
      ? new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: { headers: { 'User-Agent': 'nasa-space-explorer-earth-lab' } },
        })
      : (null as unknown as GoogleGenAI),
  });

  return [
    gemini,
    createOpenRouterProvider({ apiKey: process.env.OPENROUTER_API_KEY, fetchImpl: options.fetchImpl }),
    createArenaProvider({ apiKey: process.env.ARENA_API_KEY, fetchImpl: options.fetchImpl }),
  ];
}

/** Pulls the first JSON object out of a model reply (tolerates ``` fences). */
export function extractJson(text: string): unknown {
  const trimmed = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new ProviderError('Model reply contained no JSON object', { code: 'UNPARSABLE_RESPONSE', retryable: false });
  }
}

export interface NormalisedAnswer {
  sections: Array<{ kind: string; title: string; bullets: string[] }>;
  sources: Array<{ label: string; url: string; detail?: string; verifiedInContext: boolean }>;
  droppedSources: number;
}

const SECTION_KINDS = ['verified', 'derived', 'interpretation', 'limitations', 'gaps'];

/**
 * Validates a model answer: enum-checks the section kinds and keeps only source
 * URLs that actually appear in the context we sent.
 */
export function normaliseAnswer(parsed: unknown, context: unknown, limit = 6): NormalisedAnswer {
  const answer = (parsed && typeof parsed === 'object' ? parsed : {}) as { sections?: unknown; sources?: unknown };
  const sections = Array.isArray(answer.sections) ? answer.sections : [];
  if (!sections.length) throw new ProviderError('Model returned no sections', { code: 'EMPTY_RESPONSE', retryable: false });

  const allowed = new Set<string>();
  JSON.stringify(context).replace(/"(https?:\/\/[^"]+)"/g, (match, url) => {
    allowed.add(url);
    return match;
  });

  const normalisedSections = sections
    .filter((section): section is Record<string, unknown> => Boolean(section) && typeof section === 'object')
    .map((section) => ({
      // Enum-check before the `includes`, so a non-string kind can never be coerced into a match.
      kind: typeof section.kind === 'string' && SECTION_KINDS.includes(section.kind) ? section.kind : 'interpretation',
      title: String(section.title || 'Interpretation'),
      bullets: Array.isArray(section.bullets)
        ? section.bullets.map((bullet: unknown) => String(bullet)).slice(0, limit)
        : [],
    }))
    .filter((section) => section.bullets.length > 0);

  if (!normalisedSections.length) throw new ProviderError('Model sections contained no bullets', { code: 'EMPTY_RESPONSE', retryable: false });

  const sourceList = Array.isArray(answer.sources) ? answer.sources : [];
  const sources = sourceList
    .filter((source): source is Record<string, unknown> => Boolean(source) && typeof source === 'object' && typeof source.url === 'string')
    .map((source) => ({
      label: String(source.label || source.url),
      url: String(source.url),
      detail: source.detail ? String(source.detail) : undefined,
      verifiedInContext: allowed.has(String(source.url)),
    }));

  return { sections: normalisedSections, sources, droppedSources: sources.filter((source: NormalisedAnswer['sources'][number]) => !source.verifiedInContext).length };
}
