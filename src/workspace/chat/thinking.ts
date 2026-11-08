/**
 * Thinking ladder — the one place the five reasoning levels are described.
 *
 * The order is the product contract and is identical on the server
 * (`server/novaThinking.js`): auto → flash → flash-thinking → thinking →
 * deep-thinking. Each level maps onto OpenRouter's `reasoning.effort` plus a
 * token budget, so an answer can be cheap and instant or slow and deliberate
 * without the reader having to choose a model id by hand.
 *
 * The chosen level is remembered on this device. It is deliberately *not* part
 * of a stored message: the transcript records the provider and model that
 * actually answered, which is the honest record.
 */

export type ThinkingLevel =
  | 'auto'
  | 'flash'
  | 'flash-thinking'
  | 'thinking'
  | 'deep-thinking';

export const THINKING_ORDER: ThinkingLevel[] = [
  'auto',
  'flash',
  'flash-thinking',
  'thinking',
  'deep-thinking',
];

export interface ThinkingLevelMeta {
  id: ThinkingLevel;
  /** i18n key for the short label shown in the picker. */
  labelKey: string;
  /** i18n key for the one-line explanation under the label. */
  hintKey: string;
  /** i18n key for the status line while an answer is being produced. */
  statusKey: string;
  /** OpenRouter reasoning effort, or null when the level sends no reasoning. */
  effort: 'low' | 'medium' | 'high' | null;
  /** Rough latency class, used for the "1–3 dots" meter. */
  depth: 0 | 1 | 2 | 3 | 4;
}

export const THINKING_LEVELS: Record<ThinkingLevel, ThinkingLevelMeta> = {
  auto: {
    id: 'auto',
    labelKey: 'wsThinkingAuto',
    hintKey: 'wsThinkingAutoHint',
    statusKey: 'wsThinkingStatusAuto',
    effort: null,
    depth: 0,
  },
  flash: {
    id: 'flash',
    labelKey: 'wsThinkingFlash',
    hintKey: 'wsThinkingFlashHint',
    statusKey: 'wsThinkingStatusFlash',
    effort: null,
    depth: 1,
  },
  'flash-thinking': {
    id: 'flash-thinking',
    labelKey: 'wsThinkingFlashThinking',
    hintKey: 'wsThinkingFlashThinkingHint',
    statusKey: 'wsThinkingStatusFlashThinking',
    effort: 'low',
    depth: 2,
  },
  thinking: {
    id: 'thinking',
    labelKey: 'wsThinkingThinking',
    hintKey: 'wsThinkingThinkingHint',
    statusKey: 'wsThinkingStatusThinking',
    effort: 'medium',
    depth: 3,
  },
  'deep-thinking': {
    id: 'deep-thinking',
    labelKey: 'wsThinkingDeep',
    hintKey: 'wsThinkingDeepHint',
    statusKey: 'wsThinkingStatusDeep',
    effort: 'high',
    depth: 4,
  },
};

export const DEFAULT_THINKING: ThinkingLevel = 'auto';
export const THINKING_STORAGE_KEY = 'nova_thinking_level_v1';

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === 'string' && (THINKING_ORDER as string[]).includes(value);
}

export function normaliseThinking(value: unknown): ThinkingLevel {
  return isThinkingLevel(value) ? value : DEFAULT_THINKING;
}

export function thinkingMeta(level: unknown): ThinkingLevelMeta {
  return THINKING_LEVELS[normaliseThinking(level)];
}

export function readThinkingPreference(): ThinkingLevel {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_THINKING;
    return normaliseThinking(window.localStorage.getItem(THINKING_STORAGE_KEY));
  } catch {
    return DEFAULT_THINKING;
  }
}

export function writeThinkingPreference(level: ThinkingLevel): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(THINKING_STORAGE_KEY, level);
  } catch {
    /* storage blocked — the preference still applies for this session */
  }
}

/** `●○○○` style depth meter; the label is always the accessible name. */
export function thinkingDepthDots(level: unknown): string {
  const meta = thinkingMeta(level);
  if (meta.depth === 0) return '·';
  return '●'.repeat(meta.depth);
}

/**
 * Levels the server says it cannot serve on this deployment.
 *
 * The picker still shows all five rungs — hiding them would make a real feature
 * look absent — but an unconfigured rung is marked and cannot be selected. `auto`
 * is never reported, because the offline engine always answers it.
 */
export function unavailableThinkingLevels(
  catalogue?: Array<{ id: string; available?: boolean }> | null,
): ThinkingLevel[] {
  if (!catalogue || catalogue.length === 0) return [];
  const availability = new Map(catalogue.map((item) => [item.id, item.available !== false]));
  return THINKING_ORDER.filter(
    (level) => level !== 'auto' && availability.get(level) === false,
  );
}
