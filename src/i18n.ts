import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { enTranslation } from './i18n/en/index.ts';

/**
 * Trilingual resources, split by language.
 *
 * English is imported statically because it is the default and the fallback.
 * Sinhala and Tamil are dynamic imports: measured at 740 KB raw / 121 KB gzip,
 * the three languages together were roughly half of the first-load JavaScript,
 * and a visitor who reads English never needed two thirds of it.
 *
 * The split changes only *when* a dictionary is downloaded. Key parity is still
 * enforced by the test suite, and the source data was verified byte-identical to
 * the single-file originals when it was moved.
 */

export const resources: Record<string, { translation: Record<string, string> }> = {
  en: { translation: enTranslation },
};

export type AppLanguage = 'en' | 'si' | 'ta';

const LOCALE_LOADERS = {
  si: () => import('./i18n/si/index.ts'),
  ta: () => import('./i18n/ta/index.ts'),
} as const;

const namespaced = new Set<AppLanguage>(['en']);
const inFlight = new Map<AppLanguage, Promise<void>>();

/**
 * Loads a language bundle once and registers it with i18next.
 *
 * Concurrent callers share one import: two clicks on "සිංහල" must not download
 * the chunk twice. An unknown language resolves immediately — i18next then falls
 * back to English, which is the pre-existing behaviour.
 */
export async function ensureLocale(language?: string): Promise<void> {
  const code = String(language || '').slice(0, 2) as AppLanguage;
  if (code !== 'si' && code !== 'ta') return;
  if (namespaced.has(code)) return;

  const pending = inFlight.get(code);
  if (pending) return pending;

  const load = (code === 'si' ? LOCALE_LOADERS.si() : LOCALE_LOADERS.ta())
    .then((module: { siTranslation?: Record<string, string>; taTranslation?: Record<string, string> }) => {
      const bundle = (code === 'si' ? module.siTranslation : module.taTranslation) || {};
      i18n.addResourceBundle(code, 'translation', bundle, true, true);
      resources[code] = { translation: bundle };
      namespaced.add(code);
    })
    .catch((failure) => {
      // Do not cache a failure: the next switch retries instead of leaving the
      // user on English for the rest of the session.
      console.error(`[i18n] could not load the ${code} bundle`, failure);
    })
    .finally(() => {
      inFlight.delete(code);
    });

  inFlight.set(code, load);
  return load;
}

/** Loads every language — used by the i18n audit and by the test suite. */
export async function loadAllLocales(): Promise<void> {
  await Promise.all([ensureLocale('si'), ensureLocale('ta')]);
}

// Honour the language already saved by the header (or its legacy provider).
// Storage may be unavailable in private browsing or server-side tests.
function initialLanguage(): AppLanguage {
  try {
    const saved = localStorage.getItem('i18nextLng') || localStorage.getItem('nasa_preferred_lang');
    if (saved === 'en' || saved === 'si' || saved === 'ta') return saved;
  } catch { /* use English */ }
  return 'en';
}

// Initialize i18next with English already in memory, so `t()` is usable on the
// very first render and in server-side tests that never touch a browser.
i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

/**
 * Every existing caller keeps calling `i18n.changeLanguage(code)` — the header,
 * the command palette, the settings surface and the tests. Wrapping the method
 * means none of them has to know that a switch may need to download a bundle
 * first, and no surface can render raw keys because it changed language too
 * early.
 */
type ChangeLanguage = typeof i18n.changeLanguage;
const changeLanguageFromI18next: ChangeLanguage = i18n.changeLanguage.bind(i18n);
i18n.changeLanguage = (async (language?: string, callback?: Parameters<ChangeLanguage>[1]) => {
  await ensureLocale(language);
  return changeLanguageFromI18next(language, callback);
}) as ChangeLanguage;

/**
 * Applies the stored preference before the first paint.
 *
 * Called once from `src/main.tsx`. A returning Sinhala or Tamil reader therefore
 * never sees an English flash; a first-time visitor resolves immediately because
 * English is already loaded.
 */
export async function ensureInitialLanguage(): Promise<void> {
  const code = initialLanguage();
  if (code === 'en') return;
  await ensureLocale(code);
  if (i18n.language !== code) {
    await changeLanguageFromI18next(code);
  }
}

// Keep <html lang> in sync with the active language. This is a WCAG 3.1.1
// requirement (screen readers pick pronunciation from it) and it applies to both
// the workspace and the Explore suite, which share this instance.
export function syncDocumentLanguage(language?: string) {
  if (typeof document === 'undefined') return;
  const code = (language || i18n.language || 'en').slice(0, 2);
  document.documentElement.lang = code;
}

syncDocumentLanguage();
i18n.on('languageChanged', syncDocumentLanguage);

export default i18n;
