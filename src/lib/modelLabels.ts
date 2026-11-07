/**
 * Human labels for AI model identifiers.
 *
 * The server stores whatever the provider called the model — `nasa-local-engine`,
 * `openrouter/free`, `arena_smart.aria`. Those are routing identifiers, not product
 * names, and they leaked into the chat footer, the assistant bubble chip and the
 * AI-status card. This module is the single place that turns an identifier into
 * something a person should read, and hides the ones that must never be seen.
 */

/**
 * Identifiers that must never reach a user. The local engine is the important one:
 * "nasa-local-engine" is an implementation detail of the offline engine, not a
 * product the reader is talking to.
 */
const INTERNAL_ONLY = new Set([
  'nasa-local-engine',
  'local-engine',
  'local',
  'engine',
  'auto',
  'unknown',
  'test',
]);

/** Known models get a deliberate label; the fallback only prettifies. */
const FRIENDLY: Record<string, string> = {
  'openrouter/free': 'OpenRouter Free',
  'arena_smart.aria': 'Arena Smart',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
  'gpt-4o-mini': 'GPT-4o mini',
};

/**
 * `displayModelName('nasa-local-engine')` → `''` (render nothing).
 * `displayModelName('gemini-2.5-flash')` → `'Gemini 2.5 Flash'`.
 */
export function displayModelName(model: string | null | undefined): string {
  const raw = typeof model === 'string' ? model.trim() : '';
  if (!raw) return '';

  const key = raw.toLowerCase();
  if (INTERNAL_ONLY.has(key)) return '';
  if (FRIENDLY[key]) return FRIENDLY[key];

  // Prefer the specific half of a namespaced id: `vendor/model-name` → `model-name`.
  const tail = key.includes('/') ? key.slice(key.lastIndexOf('/') + 1) : key;
  const pretty = tail
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

  // A single short token is an id, not a name (e.g. `free`, `v3`): show nothing
  // rather than something meaningless.
  if (pretty.length < 4 || !/[a-z]/i.test(pretty)) return '';
  return pretty;
}
