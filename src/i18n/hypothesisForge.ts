/**
 * NOVA HYPOTHESIS FORGE — interface copy (English / Sinhala / Tamil).
 *
 * Kept in its own typed module (like `workspaceCopy.ts` and
 * `earthIntelligence.ts`) so translators review one file and the interface can
 * never silently fall back to English. Merged into the i18next resources in
 * src/i18n.ts.
 *
 * Rule: every key exists in all three languages. scripts/test-forge-ui.mjs fails
 * the suite if that stops being true.
 */

import { hypothesisForgeEn } from './en/hypothesisForge';
import { hypothesisForgeSi } from './si/hypothesisForge';
import { hypothesisForgeTa } from './ta/hypothesisForge';

export type CopyLanguage = 'en' | 'si' | 'ta';
export type Copy = Record<string, string>;

export const hypothesisForgeCopy: Record<'en' | 'si' | 'ta', Copy> = {
  en: hypothesisForgeEn,
  si: hypothesisForgeSi,
  ta: hypothesisForgeTa,
};

export const HYPOTHESIS_FORGE_KEYS = Object.keys(hypothesisForgeEn);
