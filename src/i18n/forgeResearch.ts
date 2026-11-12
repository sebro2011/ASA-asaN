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

const en: ForgeResearchCopy = {
  frTitle: 'Research workspace',
  frSubtitle: 'Projects, hypotheses, evidence and versions — stored on this device only.',
  frNew: 'New project',
  frProjectName: 'Project name',
  frCreate: 'Create',
  frCancel: 'Cancel',
  frNoProjects: 'No research project yet',
  frNoProjectsBody: 'Create a project to record a question, its hypotheses and the evidence you gather for them. Nothing is uploaded.',
  frArchive: 'Archive',
  frUnarchive: 'Restore from archive',
  frDelete: 'Delete project',
  frDiscipline: 'Discipline',
  frOverview: 'Overview',
  frHypotheses: 'Hypotheses',
  frEvidence: 'Evidence',
  frVersions: 'Versions',
  frAnalysis: 'Analysis and conclusions',
  frAssistant: 'Research assistant',
  frSaved: 'Saved',
  frSaving: 'Saving…',
  frSaveFailed: 'Could not save',
  frStorageUnavailable: 'Device storage is unavailable, so changes are not saved. Anything you type will be lost when you leave.',
  frDraftFound: 'An unsaved draft of this project was recovered from your last session.',
  frUntitled: 'Untitled project',
  frRestoreDraft: 'Open the draft',
  frDiscardDraft: 'Discard it',
  frQuestions: 'Research questions',
  frObjectives: 'Objectives',
  frVariables: 'Variables',
  frRole: 'Role',
  frOperationalisation: 'How it is measured',
  frAssumptions: 'Assumptions',
  frIfFalse: 'If this is false',
  frStatus: 'Status',
  frMethods: 'Methods',
  frDecisionRule: 'Decision rule, fixed before analysis',
  frPreregistered: 'Pre-registered',
  frDatasetSnapshots: 'Dataset snapshots',
  frNoDatasets: 'No dataset snapshot is pinned. Without one this project cannot be reproduced.',
  frVersionLabel: 'Version',
  frPayloadHash: 'Payload hash',
  frRows: 'Rows',
  frQuery: 'Query',
  frNewHypothesis: 'New hypothesis',
  frLifecycle: 'Lifecycle',
  frAdvanceTo: 'Move to',
  frBlocked: 'Blocked',
  frCompare: 'Compare hypotheses',
  frCompareHint: 'Differences that matter are usually in the methodology and the falsification conditions, not in the statement.',
  frFStatement: 'Statement',
  frFRationale: 'Rationale',
  frFTheory: 'Theory or prior work',
  frFIndependent: 'Independent variables',
  frFDependent: 'Dependent variables',
  frFControls: 'Controls',
  frFAssumptions: 'Assumptions',
  frFPredictions: 'Predictions',
  frFMethodology: 'Methodology',
  frFDatasets: 'Datasets required',
  frFLimitations: 'Limitations',
  frFAlternatives: 'Alternative explanations',
  frFFalsification: 'Falsification conditions',
  frAddEvidence: 'Record evidence',
  frStance: 'Stance',
  frSourceType: 'Source type',
  frIdentifier: 'DOI or URL',
  frPublisher: 'Publisher',
  frObservation: 'Observation',
  frFullText: 'Text inspected',
  frValidation: 'Structural validation',
  frLinkTo: 'Linked hypotheses',
  frNoEvidence: 'No evidence has been recorded for this project yet.',
  frCommit: 'Save a version',
  frCommitLabel: 'Version label',
  frNoVersions: 'No version has been saved. Autosave keeps your work, but a version is the snapshot you can return to.',
  frRestoreVersion: 'Restore this version',
  frChanged: 'Changed fields',
  frAsk: 'Ask about this project',
  frAskPlaceholder: 'For example: what evidence is missing for the selected hypothesis?',
  frLocalMode: 'Local deterministic summary — no model was used',
  frRemoteMode: 'Model answer, validated against this project',
  frRejected: 'A model answer was rejected because it did not survive validation',
  frCitations: 'Citations',
  frUncertainties: 'Uncertainties',
  frNextStep: 'Next step',
  frAssistantHint:
    'The assistant can only use what is recorded in this project. It cannot calculate, and any number or citation that is not in the project is rejected before you see it.',
  frConclusions: 'Conclusions',
  frAddConclusion: 'Record a conclusion',
  frReproduced: 'Independently reproduced',
  frGaps: 'What this project is missing',
  frAnalysisHint:
    'Analyses are recorded with the dataset snapshots and engine version that produced them. Reopening a version never recalculates.',
  frAttachInvestigation: 'Attach an investigation',
  frNoInvestigations: 'No stored investigation is available to attach yet.',
  frFullscreen: 'Full screen',
  frExitFullscreen: 'Exit full screen',
  frCollapse: 'Collapse project list',
  frExpand: 'Expand project list',
  frResizeHint: 'Drag to resize, or use the arrow keys',
  frAdd: 'Add',
  frRemove: 'Remove',
  frUnit: 'Unit',
  frLimitationsField: 'Limitations',
  frNoSelection: 'Select a project to begin.',
};

const si: ForgeResearchCopy = {
  frTitle: 'පර්යේෂණ කාර්ය ප්‍රදේශය',
  frSubtitle: 'ව්‍යාපෘති, උපකල්පන, සාක්ෂි සහ අනුවාද — මෙම උපාංගයේ පමණක් ගබඩා වේ.',
  frNew: 'නව ව්‍යාපෘතියක්',
  frProjectName: 'ව්‍යාපෘති නම',
  frCreate: 'සාදන්න',
  frCancel: 'අවලංගු කරන්න',
  frNoProjects: 'තවම පර්යේෂණ ව්‍යාපෘතියක් නොමැත',
  frNoProjectsBody: 'ප්‍රශ්නයක්, එහි උපකල්පන සහ ඔබ රැස්කරන සාක්ෂි සටහන් කිරීමට ව්‍යාපෘතියක් සාදන්න. කිසිවක් උඩුගත නොවේ.',
  frArchive: 'සංරක්ෂණය කරන්න',
  frUnarchive: 'සංරක්ෂණයෙන් ගන්න',
  frDelete: 'ව්‍යාපෘතිය මකන්න',
  frDiscipline: 'විෂය ක්ෂේත්‍රය',
  frOverview: 'සමාලෝචනය',
  frHypotheses: 'උපකල්පන',
  frEvidence: 'සාක්ෂි',
  frVersions: 'අනුවාද',
  frAnalysis: 'විශ්ලේෂණය සහ නිගමන',
  frAssistant: 'පර්යේෂණ සහායක',
  frSaved: 'සුරකින ලදි',
  frSaving: 'සුරකිමින්…',
  frSaveFailed: 'සුරැකීමට නොහැකි විය',
  frStorageUnavailable: 'උපාංගයේ ගබඩාව නොමැති බැවින් වෙනස්කම් සුරැකෙන්නේ නැත. ඔබ ලියන දේ පිටවීමේදී නැති වේ.',
  frDraftFound: 'පසුගිය සැසියෙන් සුරැකී නොමැති කෙටුම්පතක් ප්‍රතිසාධනය කර ඇත.',
  frUntitled: 'නමක් නොමැති ව්‍යාපෘතිය',
  frRestoreDraft: 'කෙටුම්පත විවෘත කරන්න',
  frDiscardDraft: 'එය ඉවත් කරන්න',
  frQuestions: 'පර්යේෂණ ප්‍රශ්න',
  frObjectives: 'අරමුණු',
  frVariables: 'විචල්‍ය',
  frRole: 'භූමිකාව',
  frOperationalisation: 'මනින ආකාරය',
  frAssumptions: 'උපකල්පන',
  frIfFalse: 'මෙය අසත්‍ය නම්',
  frStatus: 'තත්ත්වය',
  frMethods: 'ක්‍රම',
  frDecisionRule: 'විශ්ලේෂණයට පෙර තීරණය කළ රීතිය',
  frPreregistered: 'පෙර ලියාපදිංචි කළ',
  frDatasetSnapshots: 'දත්ත මාලා ඡායාරූප',
  frNoDatasets: 'දත්ත ඡායාරූපයක් ඇමිණී නැත. එය නොමැතිව මෙම ව්‍යාපෘතිය ප්‍රතිනිෂ්පාදනය කළ නොහැක.',
  frVersionLabel: 'අනුවාදය',
  frPayloadHash: 'දත්ත හැෂ්',
  frRows: 'පේළි',
  frQuery: 'විමසුම',
  frNewHypothesis: 'නව උපකල්පනයක්',
  frLifecycle: 'ජීවන චක්‍රය',
  frAdvanceTo: 'මෙයට ගෙන යන්න',
  frBlocked: 'අවහිරයි',
  frCompare: 'උපකල්පන සසඳන්න',
  frCompareHint: 'වැදගත් වෙනස්කම් සාමාන්‍යයෙන් ක්‍රමවේදයේ සහ අසත්‍යකරණ කොන්දේසිවල මිස ප්‍රකාශයේ නොවේ.',
  frFStatement: 'ප්‍රකාශය',
  frFRationale: 'හේතුව',
  frFTheory: 'න්‍යාය හෝ පෙර කටයුතු',
  frFIndependent: 'ස්වාධීන විචල්‍ය',
  frFDependent: 'පරායත්ත විචල්‍ය',
  frFControls: 'පාලන',
  frFAssumptions: 'උපකල්පන',
  frFPredictions: 'අනාවැකි',
  frFMethodology: 'ක්‍රමවේදය',
  frFDatasets: 'අවශ්‍ය දත්ත',
  frFLimitations: 'සීමා',
  frFAlternatives: 'විකල්ප පැහැදිලි කිරීම්',
  frFFalsification: 'අසත්‍යකරණ කොන්දේසි',
  frAddEvidence: 'සාක්ෂියක් සටහන් කරන්න',
  frStance: 'ස්ථාවරය',
  frSourceType: 'මූලාශ්‍ර වර්ගය',
  frIdentifier: 'DOI හෝ URL',
  frPublisher: 'ප්‍රකාශක',
  frObservation: 'නිරීක්ෂණය',
  frFullText: 'පරීක්ෂා කළ පෙළ',
  frValidation: 'ව්‍යුහාත්මක වලංගුකරණය',
  frLinkTo: 'සම්බන්ධිත උපකල්පන',
  frNoEvidence: 'මෙම ව්‍යාපෘතිය සඳහා තවම සාක්ෂි සටහන් කර නැත.',
  frCommit: 'අනුවාදයක් සුරකින්න',
  frCommitLabel: 'අනුවාද ලේබලය',
  frNoVersions: 'තවම අනුවාදයක් සුරකා නැත. ස්වයං සුරැකීම ඔබේ වැඩ තබා ගනී, නමුත් අනුවාදයක් යනු ආපසු යා හැකි ඡායාරූපයයි.',
  frRestoreVersion: 'මෙම අනුවාදය ප්‍රතිසාධනය කරන්න',
  frChanged: 'වෙනස් වූ ක්ෂේත්‍ර',
  frAsk: 'මෙම ව්‍යාපෘතිය ගැන අසන්න',
  frAskPlaceholder: 'උදාහරණය: තෝරාගත් උපකල්පනයට අවශ්‍ය සාක්ෂි මොනවාද?',
  frLocalMode: 'දේශීය නිශ්චිත සාරාංශය — ආකෘතියක් භාවිතා නොකළා',
  frRemoteMode: 'මෙම ව්‍යාපෘතියට එරෙහිව වලංගු කළ ආකෘති පිළිතුර',
  frRejected: 'වලංගුකරණය අසමත් වූ බැවින් ආකෘති පිළිතුරක් ප්‍රතික්ෂේප විය',
  frCitations: 'උපුටා දැක්වීම්',
  frUncertainties: 'අවිනිශ්චිතතා',
  frNextStep: 'ඊළඟ පියවර',
  frAssistantHint:
    'සහායකට භාවිත කළ හැක්කේ මෙම ව්‍යාපෘතියේ සටහන් කර ඇති දේ පමණි. එය ගණනය කළ නොහැක. ව්‍යාපෘතියේ නොමැති අංකයක් හෝ උපුටා දැක්වීමක් ඔබට පෙනීමට පෙර ප්‍රතික්ෂේප වේ.',
  frConclusions: 'නිගමන',
  frAddConclusion: 'නිගමනයක් සටහන් කරන්න',
  frReproduced: 'ස්වාධීනව ප්‍රතිනිෂ්පාදිත',
  frGaps: 'මෙම ව්‍යාපෘතියේ නොමැති දේ',
  frAnalysisHint:
    'විශ්ලේෂණ ඒවා නිපදවූ දත්ත ඡායාරූප සහ එන්ජිම් අනුවාදය සමඟ සටහන් වේ. අනුවාදයක් නැවත විවෘත කිරීමෙන් නැවත ගණනය නොකෙරේ.',
  frAttachInvestigation: 'විමර්ශනයක් අමුණන්න',
  frNoInvestigations: 'අමුණා ගැනීමට ගබඩා කළ විමර්ශනයක් තවම නොමැත.',
  frFullscreen: 'පූර්ණ තිරය',
  frExitFullscreen: 'පූර්ණ තිරයෙන් ඉවත් වන්න',
  frCollapse: 'ව්‍යාපෘති ලැයිස්තුව හකුළන්න',
  frExpand: 'ව්‍යාපෘති ලැයිස්තුව දිගහරින්න',
  frResizeHint: 'ප්‍රමාණය වෙනස් කිරීමට අදින්න, නැතහොත් ඊතල යතුරු භාවිතා කරන්න',
  frAdd: 'එකතු කරන්න',
  frRemove: 'ඉවත් කරන්න',
  frUnit: 'ඒකකය',
  frLimitationsField: 'සීමා',
  frNoSelection: 'ආරම්භ කිරීමට ව්‍යාපෘතියක් තෝරන්න.',
};

const ta: ForgeResearchCopy = {
  frTitle: 'ஆய்வுப் பணியிடம்',
  frSubtitle: 'திட்டங்கள், கருதுகோள்கள், சான்றுகள், பதிப்புகள் — இந்தச் சாதனத்தில் மட்டுமே சேமிக்கப்படுகின்றன.',
  frNew: 'புதிய திட்டம்',
  frProjectName: 'திட்டப் பெயர்',
  frCreate: 'உருவாக்கு',
  frCancel: 'ரத்து',
  frNoProjects: 'இன்னும் ஆய்வுத் திட்டம் இல்லை',
  frNoProjectsBody: 'ஒரு கேள்வியையும் அதன் கருதுகோள்களையும் நீங்கள் சேகரிக்கும் சான்றுகளையும் பதிவு செய்ய ஒரு திட்டத்தை உருவாக்குங்கள். எதுவும் பதிவேற்றப்படாது.',
  frArchive: 'காப்பகப்படுத்து',
  frUnarchive: 'காப்பகத்திலிருந்து மீட்டெடு',
  frDelete: 'திட்டத்தை நீக்கு',
  frDiscipline: 'துறை',
  frOverview: 'மேலோட்டம்',
  frHypotheses: 'கருதுகோள்கள்',
  frEvidence: 'சான்றுகள்',
  frVersions: 'பதிப்புகள்',
  frAnalysis: 'பகுப்பாய்வு மற்றும் முடிவுகள்',
  frAssistant: 'ஆய்வு உதவியாளர்',
  frSaved: 'சேமிக்கப்பட்டது',
  frSaving: 'சேமிக்கிறது…',
  frSaveFailed: 'சேமிக்க முடியவில்லை',
  frStorageUnavailable: 'சாதனச் சேமிப்பு இல்லாததால் மாற்றங்கள் சேமிக்கப்படாது. நீங்கள் எழுதுவது வெளியேறும்போது போய்விடும்.',
  frDraftFound: 'கடந்த அமர்விலிருந்து சேமிக்கப்படாத வரைவு மீட்டெடுக்கப்பட்டது.',
  frUntitled: 'பெயரிடப்படாத திட்டம்',
  frRestoreDraft: 'வரைவைத் திற',
  frDiscardDraft: 'அதை நீக்கு',
  frQuestions: 'ஆய்வுக் கேள்விகள்',
  frObjectives: 'நோக்கங்கள்',
  frVariables: 'மாறிகள்',
  frRole: 'பங்கு',
  frOperationalisation: 'அளவிடும் முறை',
  frAssumptions: 'அனுமானங்கள்',
  frIfFalse: 'இது தவறானால்',
  frStatus: 'நிலை',
  frMethods: 'முறைகள்',
  frDecisionRule: 'பகுப்பாய்வுக்கு முன் நிர்ணயித்த விதி',
  frPreregistered: 'முன்பதிவு செய்யப்பட்டது',
  frDatasetSnapshots: 'தரவுத் தொகுப்பு நகல்கள்',
  frNoDatasets: 'தரவுத் தொகுப்பு நகல் இணைக்கப்படவில்லை. அது இல்லாமல் இந்தத் திட்டத்தை மீள உருவாக்க முடியாது.',
  frVersionLabel: 'பதிப்பு',
  frPayloadHash: 'தரவு ஹாஷ்',
  frRows: 'வரிசைகள்',
  frQuery: 'வினவல்',
  frNewHypothesis: 'புதிய கருதுகோள்',
  frLifecycle: 'வாழ்க்கைச் சுழற்சி',
  frAdvanceTo: 'இதற்கு நகர்த்து',
  frBlocked: 'தடுக்கப்பட்டது',
  frCompare: 'கருதுகோள்களை ஒப்பிடு',
  frCompareHint: 'முக்கியமான வேறுபாடுகள் பொதுவாக முறையியலிலும் பொய்ப்பிப்பு நிபந்தனைகளிலும் இருக்கும், கூற்றில் அல்ல.',
  frFStatement: 'கூற்று',
  frFRationale: 'காரணம்',
  frFTheory: 'கோட்பாடு அல்லது முன்னைய ஆய்வு',
  frFIndependent: 'சார்பற்ற மாறிகள்',
  frFDependent: 'சார்பு மாறிகள்',
  frFControls: 'கட்டுப்பாடுகள்',
  frFAssumptions: 'அனுமானங்கள்',
  frFPredictions: 'முன்கணிப்புகள்',
  frFMethodology: 'முறையியல்',
  frFDatasets: 'தேவையான தரவுகள்',
  frFLimitations: 'வரம்புகள்',
  frFAlternatives: 'மாற்று விளக்கங்கள்',
  frFFalsification: 'பொய்ப்பிப்பு நிபந்தனைகள்',
  frAddEvidence: 'சான்றைப் பதிவு செய்',
  frStance: 'நிலைப்பாடு',
  frSourceType: 'மூல வகை',
  frIdentifier: 'DOI அல்லது URL',
  frPublisher: 'வெளியீட்டாளர்',
  frObservation: 'அவதானிப்பு',
  frFullText: 'பரிசீலித்த உரை',
  frValidation: 'கட்டமைப்பு சரிபார்ப்பு',
  frLinkTo: 'இணைக்கப்பட்ட கருதுகோள்கள்',
  frNoEvidence: 'இந்தத் திட்டத்திற்கு இன்னும் சான்று பதிவு செய்யப்படவில்லை.',
  frCommit: 'பதிப்பைச் சேமி',
  frCommitLabel: 'பதிப்பு லேபிள்',
  frNoVersions: 'இன்னும் பதிப்பு சேமிக்கப்படவில்லை. தானியங்கிச் சேமிப்பு உங்கள் வேலையை வைத்திருக்கும், ஆனால் பதிப்பே நீங்கள் திரும்பிச் செல்லக்கூடிய நகல்.',
  frRestoreVersion: 'இந்தப் பதிப்பை மீட்டெடு',
  frChanged: 'மாறிய புலங்கள்',
  frAsk: 'இந்தத் திட்டம் பற்றிக் கேள்',
  frAskPlaceholder: 'உதாரணம்: தேர்ந்தெடுத்த கருதுகோளுக்கு எந்தச் சான்று இல்லை?',
  frLocalMode: 'உள்ளூர் நிர்ணய சுருக்கம் — மாதிரி பயன்படுத்தப்படவில்லை',
  frRemoteMode: 'இந்தத் திட்டத்திற்கு எதிராகச் சரிபார்க்கப்பட்ட மாதிரிப் பதில்',
  frRejected: 'சரிபார்ப்பில் தோல்வியடைந்ததால் ஒரு மாதிரிப் பதில் நிராகரிக்கப்பட்டது',
  frCitations: 'மேற்கோள்கள்',
  frUncertainties: 'நிச்சயமற்ற தன்மைகள்',
  frNextStep: 'அடுத்த படி',
  frAssistantHint:
    'இந்தத் திட்டத்தில் பதிவு செய்யப்பட்டதை மட்டுமே உதவியாளர் பயன்படுத்த முடியும். அது கணக்கிட முடியாது; திட்டத்தில் இல்லாத எண்ணோ மேற்கோளோ நீங்கள் பார்ப்பதற்கு முன் நிராகரிக்கப்படும்.',
  frConclusions: 'முடிவுகள்',
  frAddConclusion: 'ஒரு முடிவைப் பதிவு செய்',
  frReproduced: 'சுயாதீனமாக மீள உருவாக்கப்பட்டது',
  frGaps: 'இந்தத் திட்டத்தில் இல்லாதவை',
  frAnalysisHint:
    'பகுப்பாய்வுகள் அவற்றை உருவாக்கிய தரவு நகல்கள் மற்றும் இயந்திரப் பதிப்புடன் பதிவு செய்யப்படுகின்றன. ஒரு பதிப்பை மீண்டும் திறப்பது எதையும் மீண்டும் கணக்கிடாது.',
  frAttachInvestigation: 'ஒரு ஆய்வை இணை',
  frNoInvestigations: 'இணைக்கச் சேமிக்கப்பட்ட ஆய்வு இன்னும் இல்லை.',
  frFullscreen: 'முழுத்திரை',
  frExitFullscreen: 'முழுத்திரையிலிருந்து வெளியேறு',
  frCollapse: 'திட்டப் பட்டியலைச் சுருக்கு',
  frExpand: 'திட்டப் பட்டியலை விரி',
  frResizeHint: 'அளவை மாற்ற இழுக்கவும், அல்லது அம்பு விசைகளைப் பயன்படுத்தவும்',
  frAdd: 'சேர்',
  frRemove: 'நீக்கு',
  frUnit: 'அலகு',
  frLimitationsField: 'வரம்புகள்',
  frNoSelection: 'தொடங்க ஒரு திட்டத்தைத் தேர்ந்தெடுக்கவும்.',
};

export const forgeResearchCopy: Record<'en' | 'si' | 'ta', ForgeResearchCopy> = { en, si, ta };
export const FORGE_RESEARCH_KEYS = Object.keys(en) as ForgeResearchKey[];
