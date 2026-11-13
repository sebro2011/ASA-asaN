/**
 * Interface copy for the redesigned shell, home page and page framing.
 *
 * Kept in one typed module instead of inline conditionals so translators can
 * review a single file and no screen silently falls back to English. Merged into
 * the existing i18next resources in src/i18n.ts (same pattern as the Earth Lab).
 */

import { interfaceCopyEn } from './en/interfaceCopy';
import { interfaceCopySi } from './si/interfaceCopy';
import { interfaceCopyTa } from './ta/interfaceCopy';

export type CopyLanguage = 'en' | 'si' | 'ta';

export type Copy = Record<string, string>;

export const interfaceCopy: Record<'en' | 'si' | 'ta', Copy> = {
  en: interfaceCopyEn,
  si: interfaceCopySi,
  ta: interfaceCopyTa,
};

export type InterfaceCopyKey = keyof typeof interfaceCopyEn;
