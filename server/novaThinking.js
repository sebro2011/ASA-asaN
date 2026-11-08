/**
 * NOVA thinking levels — one ordered ladder over the models OpenRouter exposes.
 *
 * The ladder is the product contract (fast → slow, shallow → deep):
 *
 *   auto → flash → flash-thinking → thinking → deep-thinking
 *
 * `auto` keeps the historical NOVA behaviour byte-for-byte: the configured
 * OpenRouter model, temperature 0.7 and no reasoning block. The four explicit
 * levels map onto OpenRouter's `reasoning.effort` parameter
 * (`low` | `medium` | `high`) plus a token budget, which is how reasoning models
 * on OpenRouter (Gemini Flash, o-series, DeepSeek R1, Qwen, Grok, …) actually
 * trade latency for deliberation. A deployment can pin a different OpenRouter
 * model per level with `NOVA_OPENROUTER_<LEVEL>_MODEL`, so "flash thinking" can
 * point at a thinking-capable variant while "flash" stays cheap and instant.
 *
 * Nothing here reads or returns a key: the module only describes request shape.
 */

/** Ordered, user-facing ladder. The order is part of the contract. */
export const NOVA_THINKING_LEVELS = ['auto', 'flash', 'flash-thinking', 'thinking', 'deep-thinking'];

export const DEFAULT_THINKING_LEVEL = 'auto';

/**
 * Per-level request shape.
 *
 * - `effort`        OpenRouter `reasoning.effort`; `null` means "send no
 *                   reasoning block at all" (non-reasoning answer).
 * - `maxTokens`     completion budget; reasoning tokens are spent from this.
 * - `temperature`   only sent where the level is not reasoning-first, because
 *                   reasoning models on OpenRouter ignore or reject sampling
 *                   knobs.
 * - `geminiLevel`   Gemini `thinkingConfig.thinkingLevel` for the native API.
 * - `guidance`      one line appended to the system prompt, so a provider that
 *                   ignores reasoning parameters still behaves like the level.
 * - `envKey`        optional per-level OpenRouter model override.
 */
export const NOVA_THINKING_PRESETS = {
  auto: {
    id: 'auto',
    effort: null,
    maxTokens: 1_200,
    temperature: 0.7,
    geminiLevel: null,
    envKey: null,
    guidance: '',
  },
  flash: {
    id: 'flash',
    effort: null,
    maxTokens: 700,
    temperature: 0.4,
    geminiLevel: 'low',
    envKey: 'NOVA_OPENROUTER_FLASH_MODEL',
    guidance: '',
  },
  'flash-thinking': {
    id: 'flash-thinking',
    effort: 'low',
    maxTokens: 1_400,
    temperature: null,
    geminiLevel: 'medium',
    envKey: 'NOVA_OPENROUTER_FLASH_THINKING_MODEL',
    guidance: '',
  },
  thinking: {
    id: 'thinking',
    effort: 'medium',
    maxTokens: 2_200,
    temperature: null,
    geminiLevel: 'medium',
    envKey: 'NOVA_OPENROUTER_THINKING_MODEL',
    guidance: '',
  },
  'deep-thinking': {
    id: 'deep-thinking',
    effort: 'high',
    maxTokens: 3_200,
    temperature: null,
    geminiLevel: 'high',
    envKey: 'NOVA_OPENROUTER_DEEP_THINKING_MODEL',
    guidance:
      'Deep thinking is on: reason carefully and step by step before answering, state assumptions, and prefer a correct, well-structured derivation over speed.',
  },
};

export const THINKING_LEVEL_SET = new Set(NOVA_THINKING_LEVELS);

/** Normalise an untrusted level to a known one, or `null` when it is invalid. */
export function normaliseThinkingLevel(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_THINKING_LEVEL;
  if (typeof value !== 'string') return null;
  const level = value.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return THINKING_LEVEL_SET.has(level) ? level : null;
}

export function thinkingPreset(level) {
  return NOVA_THINKING_PRESETS[level] || NOVA_THINKING_PRESETS[DEFAULT_THINKING_LEVEL];
}

/**
 * The OpenRouter request fields for a level. `auto` returns only the legacy
 * sampling knobs, so existing behaviour and tests are untouched.
 */
export function openRouterThinkingFields(level) {
  const preset = thinkingPreset(level);
  const fields = { max_tokens: preset.maxTokens };
  if (preset.temperature !== null) fields.temperature = preset.temperature;
  if (preset.effort) fields.reasoning = { effort: preset.effort };
  return fields;
}

/** Gemini generation config for one model + level (auto keeps the old shape). */
export function geminiThinkingConfig(model, level) {
  const isGemini3 = /^gemini-3/i.test(String(model || ''));
  const preset = thinkingPreset(level);

  if (level === 'auto') {
    if (isGemini3) {
      return { maxOutputTokens: 1_200, thinkingConfig: { thinkingLevel: 'low' } };
    }
    return { temperature: 0.7, maxOutputTokens: 1_200 };
  }

  if (isGemini3) {
    return {
      maxOutputTokens: preset.maxTokens,
      thinkingConfig: { thinkingLevel: preset.geminiLevel || 'low' },
    };
  }
  // Gemini 2.x has no thinkingLevel; the token budget is the only honest knob.
  return { maxOutputTokens: preset.maxTokens, ...(preset.temperature !== null ? { temperature: preset.temperature } : {}) };
}

/** One extra system-prompt line, so every provider can honour the level. */
export function thinkingGuidance(level) {
  return thinkingPreset(level).guidance;
}

/** `deep thinking` → `NOVA_OPENROUTER_DEEP_THINKING_MODEL` lookup helper. */
export function resolveOpenRouterModel({ baseModel, level, readEnv }) {
  const preset = thinkingPreset(level);
  if (!preset.envKey || typeof readEnv !== 'function') return baseModel;
  try {
    const override = readEnv(preset.envKey);
    return typeof override === 'string' && override.trim() ? override.trim().slice(0, 160) : baseModel;
  } catch {
    return baseModel;
  }
}

/**
 * The public catalogue for `/api/nova/config`. Ordered, key-free, and honest
 * about what each level needs: `requiresReasoning` tells the UI that a level
 * only makes a difference on a reasoning-capable model, and `available` is true
 * only when at least one online provider (Arena, OpenRouter or Gemini) is
 * configured — otherwise only `auto` can be answered, by the offline engine.
 */
export function publicThinkingCatalog({ onlineConfigured = false, env = {} } = {}) {
  return {
    default: DEFAULT_THINKING_LEVEL,
    levels: NOVA_THINKING_LEVELS.map((id) => {
      const preset = NOVA_THINKING_PRESETS[id];
      const override = preset.envKey && typeof env[preset.envKey] === 'string'
        ? env[preset.envKey].trim()
        : '';
      return {
        id,
        effort: preset.effort,
        maxTokens: preset.maxTokens,
        requiresReasoning: Boolean(preset.effort),
        model: override || null,
        available: id === 'auto' ? true : onlineConfigured || Boolean(override),
      };
    }),
  };
}
