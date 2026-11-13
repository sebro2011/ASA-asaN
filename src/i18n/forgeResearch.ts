/**
 * NOVA Forge — Research Workspace copy (English / Sinhala / Tamil).
 *
 * Kept in its own module rather than appended to `hypothesisForge.ts`: that file
 * has a key-parity contract with the investigation surface, and a research
 * workspace that grows independently should not be able to break it.
 *
 * The same rules apply: no key is empty, every language carries every key, and
 * no string claims proof, discovery or peer review.
 */

import { forgeResearchEn } from './en/forgeResearch';
import { forgeResearchSi } from './si/forgeResearch';
import { forgeResearchTa } from './ta/forgeResearch';

export type ForgeResearchKey =
  | 'frTitle'
  | 'frSubtitle'
  | 'frNew'
  | 'frProjectName'
  | 'frCreate'
  | 'frCancel'
  | 'frNoProjects'
  | 'frNoProjectsBody'
  | 'frArchive'
  | 'frUnarchive'
  | 'frDelete'
  | 'frDiscipline'
  | 'frOverview'
  | 'frHypotheses'
  | 'frEvidence'
  | 'frVersions'
  | 'frAnalysis'
  | 'frAssistant'
  | 'frSaved'
  | 'frSaving'
  | 'frSaveFailed'
  | 'frStorageUnavailable'
  | 'frDraftFound'
  | 'frUntitled'
  | 'frRestoreDraft'
  | 'frDiscardDraft'
  | 'frQuestions'
  | 'frObjectives'
  | 'frVariables'
  | 'frRole'
  | 'frOperationalisation'
  | 'frAssumptions'
  | 'frIfFalse'
  | 'frStatus'
  | 'frMethods'
  | 'frDecisionRule'
  | 'frPreregistered'
  | 'frDatasetSnapshots'
  | 'frNoDatasets'
  | 'frVersionLabel'
  | 'frPayloadHash'
  | 'frRows'
  | 'frQuery'
  | 'frNewHypothesis'
  | 'frLifecycle'
  | 'frAdvanceTo'
  | 'frBlocked'
  | 'frCompare'
  | 'frCompareHint'
  | 'frFStatement'
  | 'frFRationale'
  | 'frFTheory'
  | 'frFIndependent'
  | 'frFDependent'
  | 'frFControls'
  | 'frFAssumptions'
  | 'frFPredictions'
  | 'frFMethodology'
  | 'frFDatasets'
  | 'frFLimitations'
  | 'frFAlternatives'
  | 'frFFalsification'
  | 'frAddEvidence'
  | 'frStance'
  | 'frSourceType'
  | 'frIdentifier'
  | 'frPublisher'
  | 'frObservation'
  | 'frFullText'
  | 'frValidation'
  | 'frLinkTo'
  | 'frNoEvidence'
  | 'frCommit'
  | 'frCommitLabel'
  | 'frNoVersions'
  | 'frRestoreVersion'
  | 'frChanged'
  | 'frAsk'
  | 'frAskPlaceholder'
  | 'frLocalMode'
  | 'frRemoteMode'
  | 'frRejected'
  | 'frCitations'
  | 'frUncertainties'
  | 'frNextStep'
  | 'frAssistantHint'
  | 'frConclusions'
  | 'frAddConclusion'
  | 'frReproduced'
  | 'frGaps'
  | 'frAnalysisHint'
  | 'frAttachInvestigation'
  | 'frNoInvestigations'
  | 'frFullscreen'
  | 'frExitFullscreen'
  | 'frCollapse'
  | 'frExpand'
  | 'frResizeHint'
  | 'frAdd'
  | 'frRemove'
  | 'frUnit'
  | 'frLimitationsField'
  | 'frNoSelection';

export type ForgeResearchCopy = Record<ForgeResearchKey, string>;

export const forgeResearchCopy: Record<'en' | 'si' | 'ta', ForgeResearchCopy> = {
  en: forgeResearchEn,
  si: forgeResearchSi,
  ta: forgeResearchTa,
};

export const FORGE_RESEARCH_KEYS = Object.keys(forgeResearchEn) as ForgeResearchKey[];
