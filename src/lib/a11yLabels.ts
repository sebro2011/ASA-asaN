/**
 * Accessible names for the icon-only controls.
 *
 * A button whose only child is an icon has no accessible name: a screen reader
 * announces "button" and nothing else. Audit m4 counted these — 12 of them, all
 * close/dismiss or month navigation.
 *
 * The strings are kept in one place rather than repeated at each call site, and
 * they reuse the vocabulary already in `src/i18n/*` (`close` is literally the
 * same word in all three dictionaries). `previous month`/`next month` follow the
 * existing "පෙර පිටුව / ඊළඟ පිටුව" (previous/next page) pattern from the Mars
 * gallery so the phrasing stays consistent.
 */

export type A11yLanguage = 'en' | 'si' | 'ta' | string | undefined;

export const A11Y_LABELS = {
  close: { en: 'Close', si: 'වසන්න', ta: 'மூடு' },
  previousMonth: { en: 'Previous month', si: 'පෙර මාසය', ta: 'முந்தைய மாதம்' },
  nextMonth: { en: 'Next month', si: 'ඊළඟ මාසය', ta: 'அடுத்த மாதம்' },
  dismiss: { en: 'Dismiss', si: 'ඉවත් කරන්න', ta: 'நீக்கு' },
} as const;

export type A11yLabelKey = keyof typeof A11Y_LABELS;

/** Label for `key` in `lang`, falling back to English for an unknown locale. */
export function a11yLabel(key: A11yLabelKey, lang: A11yLanguage): string {
  const entry = A11Y_LABELS[key];
  if (lang === 'si' || lang === 'ta') return entry[lang];
  return entry.en;
}
