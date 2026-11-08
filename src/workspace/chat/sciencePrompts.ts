/**
 * Astronomy starter prompts for the NOVA workspace.
 *
 * These are the "space science" entry points: four grounded tasks that a
 * space-science assistant can actually do well, each paired with the thinking
 * level that suits it — a quick visible-sky orientation is `flash-thinking`,
 * while mission architecture is `thinking`.
 *
 * Every prompt is written to keep NOVA honest: they ask for reasoning, named
 * sources and explicit uncertainty instead of asking for "live" telemetry that
 * a server-side chat model cannot have. Text lives in `workspaceCopy.ts` in all
 * three languages; this module only wires ids to copy keys and a level.
 */
import type { ThinkingLevel } from './thinking';

export type SciencePromptId = 'mission' | 'sky' | 'neo' | 'earth';

export interface SciencePrompt {
  id: SciencePromptId;
  /** i18n key for the card title. */
  titleKey: string;
  /** i18n key for the one-line card description. */
  bodyKey: string;
  /** i18n key for the full prompt inserted into the composer. */
  promptKey: string;
  /** The level this task benefits from. */
  thinking: ThinkingLevel;
}

export const SCIENCE_PROMPTS: SciencePrompt[] = [
  {
    id: 'mission',
    titleKey: 'wsScienceMissionTitle',
    bodyKey: 'wsScienceMissionBody',
    promptKey: 'wsScienceMissionPrompt',
    thinking: 'thinking',
  },
  {
    id: 'sky',
    titleKey: 'wsScienceSkyTitle',
    bodyKey: 'wsScienceSkyBody',
    promptKey: 'wsScienceSkyPrompt',
    thinking: 'flash-thinking',
  },
  {
    id: 'neo',
    titleKey: 'wsScienceNeoTitle',
    bodyKey: 'wsScienceNeoBody',
    promptKey: 'wsScienceNeoPrompt',
    thinking: 'thinking',
  },
  {
    id: 'earth',
    titleKey: 'wsScienceEarthTitle',
    bodyKey: 'wsScienceEarthBody',
    promptKey: 'wsScienceEarthPrompt',
    thinking: 'flash',
  },
];

/** The one deep-research starter used by the empty chat state. */
export const DEEP_SCIENCE_PROMPT = {
  titleKey: 'wsScienceDeepTitle',
  bodyKey: 'wsScienceDeepBody',
  promptKey: 'wsScienceDeepPrompt',
  thinking: 'deep-thinking' as ThinkingLevel,
};
