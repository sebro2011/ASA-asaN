/**
 * Where NOVA keeps conversations.
 *
 * Signed-in readers sync to Supabase; signed-out readers use the device store
 * (`localChat.ts`). This module adds the third option a reader may actually want:
 * *always* keep chats on this device, even when signed in — a conversation about
 * a personal observation does not have to leave the browser.
 *
 * The preference is a single localStorage flag with a change event, so an open
 * chat surface reacts immediately instead of waiting for a reload. Nothing here
 * deletes anything: switching back to sync leaves the device copy in place.
 */

export const CHAT_LOCAL_ONLY_KEY = 'nova_chat_local_only';

/** Fired on `window` after the preference changes, so hooks can re-read it. */
export const CHAT_LOCAL_ONLY_EVENT = 'nova:chat-local-only';

export function isChatLocalOnly(): boolean {
  try {
    return localStorage.getItem(CHAT_LOCAL_ONLY_KEY) === '1';
  } catch {
    // Storage unavailable (private mode, server render): behave like the default.
    return false;
  }
}

export function setChatLocalOnly(value: boolean): void {
  try {
    if (value) localStorage.setItem(CHAT_LOCAL_ONLY_KEY, '1');
    else localStorage.removeItem(CHAT_LOCAL_ONLY_KEY);
  } catch {
    // Ignore storage failures; the in-memory state still reflects the choice.
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new Event(CHAT_LOCAL_ONLY_EVENT));
    } catch {
      // Older environments without Event construction: the next mount re-reads.
    }
  }
}
