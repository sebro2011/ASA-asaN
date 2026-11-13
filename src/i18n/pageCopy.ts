/**
 * Page framing copy for destinations that had no dedicated headings in the
 * legacy dictionary (asteroids, orbital tracking, EPIC, exoplanets, quiz,
 * simulator, assistant, saved).
 *
 * Each description states what the page actually shows and — where relevant —
 * that values are simulated or historical. No page claims live data it does not
 * have.
 */

import { pageCopyEn } from './en/pageCopy';
import { pageCopySi } from './si/pageCopy';
import { pageCopyTa } from './ta/pageCopy';

export const pageCopy = {
  en: pageCopyEn,
  si: pageCopySi,
  ta: pageCopyTa,
};
