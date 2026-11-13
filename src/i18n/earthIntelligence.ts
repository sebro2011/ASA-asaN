/**
 * Earth Intelligence Lab translation keys.
 *
 * Merged into the existing i18n resources by `src/i18n.ts`, so the trilingual
 * behaviour and fallback chain of the rest of the site is preserved. Dataset
 * identifiers, units and service names stay in Latin script by design.
 */

import { earthIntelligenceEn } from './en/earthIntelligence';
import { earthIntelligenceSi } from './si/earthIntelligence';
import { earthIntelligenceTa } from './ta/earthIntelligence';

export interface EarthIntelligenceStrings {
  [key: string]: string;
}

export const earthIntelligenceTranslations = {
  en: earthIntelligenceEn,
  si: earthIntelligenceSi,
  ta: earthIntelligenceTa
};
