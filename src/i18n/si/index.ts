/**
 * si interface bundle.
 *
 * Merged in the same order the single-file dictionary used, so precedence is
 * unchanged; only the loading strategy differs. English is imported statically by
 * `src/i18n.ts`; Sinhala and Tamil are dynamic imports, so a visitor who reads
 * English never downloads them.
 */

import { baseSi } from './base';
import { earthIntelligenceSi } from './earthIntelligence';
import { interfaceCopySi } from './interfaceCopy';
import { pageCopySi } from './pageCopy';
import { spaceShortsSi } from './spaceShorts';
import { workspaceCopySi } from './workspaceCopy';
import { hypothesisForgeSi } from './hypothesisForge';
import { forgeResearchSi } from './forgeResearch';

export const siTranslation: Record<string, string> = {
  ...baseSi,
  ...earthIntelligenceSi,
  ...interfaceCopySi,
  ...pageCopySi,
  ...spaceShortsSi,
  ...workspaceCopySi,
  ...hypothesisForgeSi,
  ...forgeResearchSi,
};
