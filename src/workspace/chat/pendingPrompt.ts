/**
 * Hand-off for a prompt typed on the Home dashboard.
 *
 * Home is a dashboard, not a chat: pressing send queues the text here and
 * navigates to `/chat`, which consumes it exactly once. `sessionStorage` keeps
 * the queue per-tab (so two tabs cannot steal each other's prompt) and it is
 * removed on read, so a reload never re-sends an old message.
 */

export const PENDING_PROMPT_KEY = 'nova_pending_prompt';
const MAX_PROMPT_CHARS = 4_000;

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function queuePrompt(text: string): boolean {
  const value = typeof text === 'string' ? text.trim().slice(0, MAX_PROMPT_CHARS) : '';
  if (!value) return false;
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(PENDING_PROMPT_KEY, value);
    return true;
  } catch {
    return false;
  }
}

/** Read-and-clear: the prompt is delivered once, never twice. */
export function takePrompt(): string | null {
  const store = storage();
  if (!store) return null;
  try {
    const value = store.getItem(PENDING_PROMPT_KEY);
    if (value === null) return null;
    store.removeItem(PENDING_PROMPT_KEY);
    const trimmed = value.trim().slice(0, MAX_PROMPT_CHARS);
    return trimmed || null;
  } catch {
    return null;
  }
}
