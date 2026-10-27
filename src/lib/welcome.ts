/**
 * Welcome-screen preference logic.
 *
 * Pure and DOM-free: every function accepts an optional Storage-like object
 * so the exact first-visit / returning-user rules are testable under Node
 * without a browser. The browser default is `localStorage`, matching the
 * project's existing preference mechanism (favorites, language, PWA state).
 *
 * Rules
 *  - First visit (no stored record)            → welcome is shown.
 *  - Record with `showOnStartup: false`         → returning user, not interrupted.
 *  - Record with `showOnStartup: true`          → user opted in, shown every startup.
 *  - Corrupt/unreadable storage                 → treated as a first visit, never throws.
 */

export const WELCOME_STORAGE_KEY = 'nasa_welcome_preference_v1';

export interface WelcomePreference {
  /** Whether the welcome screen should appear on subsequent startups. */
  showOnStartup: boolean;
  /** ISO timestamp of the last explicit dismissal (Begin or Skip). */
  dismissedAt: string | null;
}

/** Minimal Storage contract — both `localStorage` and test shims satisfy it. */
export type WelcomeStorage = Pick<Storage, 'getItem' | 'setItem'>;

const DEFAULT_PREFERENCE: WelcomePreference = { showOnStartup: false, dismissedAt: null };

/** Resolve the browser storage, or null during SSR / when storage is blocked. */
export function defaultStorage(): WelcomeStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null; // privacy mode / disabled storage — behave as a session visit
  }
}

/** Read the stored preference. Null means "never seen before". Never throws. */
export function readWelcomePreference(storage: WelcomeStorage | null = defaultStorage()): WelcomePreference | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(WELCOME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WelcomePreference>;
    if (typeof parsed.showOnStartup !== 'boolean') return null;
    return {
      showOnStartup: parsed.showOnStartup,
      dismissedAt: typeof parsed.dismissedAt === 'string' ? parsed.dismissedAt : null
    };
  } catch {
    return null; // corrupt record → first-visit semantics
  }
}

/** Persist the user's explicit choice and return the stored record. */
export function persistWelcomePreference(
  showOnStartup: boolean,
  storage: WelcomeStorage | null = defaultStorage()
): WelcomePreference {
  const preference: WelcomePreference = {
    showOnStartup,
    dismissedAt: new Date().toISOString()
  };
  if (storage) {
    try {
      storage.setItem(WELCOME_STORAGE_KEY, JSON.stringify(preference));
    } catch {
      /* storage full/blocked: the in-memory record still applies this visit */
    }
  }
  return preference;
}

/**
 * Decide whether the welcome screen should render.
 * First visit and explicit opt-in show it; an opted-out returning user does not.
 */
export function shouldShowWelcome(storage: WelcomeStorage | null = defaultStorage()): boolean {
  const preference = readWelcomePreference(storage);
  if (preference === null) return true;
  return preference.showOnStartup === true;
}

/** The checkbox's initial state: opt-in only, so the default is off. */
export function initialShowOnStartup(storage: WelcomeStorage | null = defaultStorage()): boolean {
  return readWelcomePreference(storage)?.showOnStartup ?? DEFAULT_PREFERENCE.showOnStartup;
}
