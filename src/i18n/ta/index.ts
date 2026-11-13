/**
 * ta interface bundle.
 *
 * Merged in the same order the single-file dictionary used, so precedence is
 * unchanged; only the loading strategy differs. English is imported statically by
 * `src/i18n.ts`; Sinhala and Tamil are dynamic imports, so a visitor who reads
 * English never downloads them.
 */

import { baseTa } from './base';
import { earthIntelligenceTa } from './earthIntelligence';
import { interfaceCopyTa } from './interfaceCopy';
import { pageCopyTa } from './pageCopy';
import { spaceShortsTa } from './spaceShorts';
import { workspaceCopyTa } from './workspaceCopy';
import { hypothesisForgeTa } from './hypothesisForge';
import { forgeResearchTa } from './forgeResearch';

export const taTranslation: Record<string, string> = {
  ...baseTa,
  ...earthIntelligenceTa,
  ...interfaceCopyTa,
  ...pageCopyTa,
  ...spaceShortsTa,
  ...workspaceCopyTa,
  ...hypothesisForgeTa,
  ...forgeResearchTa,
};
