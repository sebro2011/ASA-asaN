/**
 * en interface bundle.
 *
 * Merged in the same order the single-file dictionary used, so precedence is
 * unchanged; only the loading strategy differs. English is imported statically by
 * `src/i18n.ts`; Sinhala and Tamil are dynamic imports, so a visitor who reads
 * English never downloads them.
 */

import { baseEn } from './base';
import { earthIntelligenceEn } from './earthIntelligence';
import { interfaceCopyEn } from './interfaceCopy';
import { pageCopyEn } from './pageCopy';
import { spaceShortsEn } from './spaceShorts';
import { workspaceCopyEn } from './workspaceCopy';
import { hypothesisForgeEn } from './hypothesisForge';
import { forgeResearchEn } from './forgeResearch';

export const enTranslation: Record<string, string> = {
  ...baseEn,
  ...earthIntelligenceEn,
  ...interfaceCopyEn,
  ...pageCopyEn,
  ...spaceShortsEn,
  ...workspaceCopyEn,
  ...hypothesisForgeEn,
  ...forgeResearchEn,
};
