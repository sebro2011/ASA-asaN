/**
 * NOVA workspace copy (Phase 3A).
 *
 * Kept in its own typed module — like `interfaceCopy.ts` — so translators can
 * review one file and the shell can never silently fall back to English.
 * Merged into the i18next resources in src/i18n.ts.
 *
 * Rule for this file: every key exists in all three languages. The parity test
 * (scripts/test-workspace-shell.mjs) fails the suite if that stops being true.
 */

import { workspaceCopyEn } from './en/workspaceCopy';
import { workspaceCopySi } from './si/workspaceCopy';
import { workspaceCopyTa } from './ta/workspaceCopy';

export type CopyLanguage = 'en' | 'si' | 'ta';
export type Copy = Record<string, string>;

export const workspaceCopy: Record<'en' | 'si' | 'ta', Copy> = {
  en: workspaceCopyEn,
  si: workspaceCopySi,
  ta: workspaceCopyTa,
};
