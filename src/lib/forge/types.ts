/**
 * NOVA HYPOTHESIS FORGE — versioned data models.
 *
 * These types are the typed interface between every Forge module:
 * interpreter → hypothesis generator → planner → connectors → normaliser →
 * analysis → evidence engine → counter-evidence → passport.
 *
 * Design rules encoded here:
 *  - every observation keeps its original value, unit and source record;
 *  - every derived number carries the method that produced it;
 *  - nothing in this file can represent an AI "confidence" in a scientific
 *    result, because no LLM is allowed to produce one (see evidence.ts);
 *  - all models are versioned (`FORGE_MODEL_VERSION`) so a stored
 *    investigation can be identified when the schema evolves.
 */

export const FORGE_MODEL_VERSION = 'forge/1' as const;
export const FORGE_SCHEMA_TAG = 'nova-hypothesis-forge';

export type LanguageCode = 'en' | 'si' | 'ta';

/** Organisation that owns a dataset. `Other` covers the existing ISS/TLE feed. */
export type SourceOrganisation = 'NASA' | 'NOAA' | 'Other';

export type ScientificDomain =
  | 'space-weather'
  | 'earth-environment'
  | 'near-earth-objects'
  | 'orbital'
  | 'planetary-imagery'
  | 'astronomy-context'
  | 'unsupported';

export type VariableId =
  | 'kp'
  | 'solar_wind_speed'
  | 'bz_gsm'
  | 'bt'
  | 'proton_density'
  | 'cme_speed'
  | 'temperature'
  | 'precipitation'
  | 'asteroid_miss_distance'
  | 'asteroid_diameter'
  | 'orbital_altitude';

export interface VariableRef {
  id: VariableId;
  /** Original measurement unit. Never converted silently. */
  unit: string;
  /** Dataset the variable is requested from. */
  datasetId: string;
  /** Free-text role (independent / dependent / context). */
  role: 'independent' | 'dependent' | 'context';
}

export type TimeResolution = 'hour' | 'day' | 'month';

export interface TimeRange {
  /** Inclusive UTC start, ISO-8601 with `Z`. */
  start: string;
  /** Inclusive UTC end, ISO-8601 with `Z`. */
  end: string;
  resolution: TimeResolution;
  /** How the range was obtained from the question. */
  origin: 'explicit-date' | 'explicit-year' | 'explicit-month' | 'relative' | 'named-event' | 'default';
  /** Human-readable statement of what the user asked for, e.g. "March 1989". */
  label: string;
  /** True when the interpreter had to assume rather than read the range. */
  assumed: boolean;
}

export interface ResearchRegion {
  name: string;
  latitude: number | null;
  longitude: number | null;
  /** Where the coordinates came from (gazetteer / global default / none). */
  source: 'gazetteer' | 'global' | 'none';
  /** Bounding box `[south, west, north, east]` when available. */
  bounds?: [number, number, number, number];
}

export type AnalysisMethodId =
  | 'descriptive'
  | 'correlation'
  | 'cross-correlation'
  | 'before-after'
  | 'threshold-exceedance'
  | 'trend'
  | 'anomaly'
  | 'missing-data';

export interface ResearchRequest {
  version: typeof FORGE_MODEL_VERSION;
  /** Stable hash of question + language + range; used as investigation base id. */
  id: string;
  question: string;
  /** Original user wording, unchanged. */
  language: LanguageCode;
  domain: ScientificDomain;
  objective: string;
  timeRange: TimeRange;
  region: ResearchRegion;
  variables: VariableRef[];
  /** Dataset ids the planner should consider (compatibility is checked there). */
  requiredDatasets: string[];
  methods: AnalysisMethodId[];
  expectedOutput: string;
  followUp: boolean;
  /** Parsing confidence — explicitly *not* scientific confidence. */
  interpretationConfidence: 'high' | 'medium' | 'low';
  notes: string[];
}

export interface DatasetDescriptor {
  id: string;
  organisation: SourceOrganisation;
  programme: string;
  title: string;
  description: string;
  /** Official documentation / landing page (never an invented URL). */
  documentationUrl: string;
  /** API endpoint actually called by the server connector. */
  endpoint: string;
  access: 'open' | 'api-key';
  /** Rolling window, or earliest → latest supported period. */
  coverage: {
    kind: 'rolling' | 'archive';
    /** Days of history for rolling datasets. */
    rollingDays?: number;
    /** Earliest supported ISO date for archive datasets. */
    earliest?: string;
    latest?: string;
    description: string;
  };
  cadence: string;
  variables: Array<{
    id: VariableId | string;
    label: string;
    unit: string;
    notes?: string;
  }>;
  /** Domains this dataset can legitimately address. */
  domains: ScientificDomain[];
  limitations: string[];
  attribution: string;
  /** True when the server holds the only copy of a required key. */
  keyRequired: boolean;
}

export type SourceStatus =
  | 'live'
  | 'cached'
  | 'unavailable'
  | 'out-of-coverage'
  | 'not-requested'
  | 'partial';

export interface DataProvenance {
  organisation: SourceOrganisation;
  datasetId: string;
  datasetTitle: string;
  sourceUrl: string;
  documentationUrl: string;
  /** ISO timestamp of the HTTP retrieval (server clock, UTC). */
  retrievedAt: string;
  /** Observation period actually covered by the returned records. */
  observationStart: string | null;
  observationEnd: string | null;
  /** Number of source records returned before normalisation. */
  recordCount: number;
  /** Hash of the payload used for reproducibility (FNV-1a over the raw text). */
  payloadHash: string;
  processingHistory: string[];
  attribution: string;
}

export interface Observation {
  /** UTC ISO timestamp. */
  time: string;
  value: number | null;
  /** Original measurement unit, preserved verbatim. */
  unit: string;
  /** True when the source itself flagged the value as missing. */
  missing: boolean;
  /** Raw source value exactly as delivered (string form). */
  raw: string | null;
  quality?: string;
}

export interface NormalizedSeries {
  /** `${datasetId}:${variableId}` */
  id: string;
  datasetId: string;
  variableId: string;
  label: string;
  unit: string;
  cadence: string;
  observations: Observation[];
  /** Missing-value statistics computed from the observations. */
  missing: {
    count: number;
    fraction: number;
    expected: number | null;
    method: string;
  };
  provenance: DataProvenance;
  status: SourceStatus;
  /** Present when the connector could not deliver data; never a placeholder. */
  statusDetail?: string;
  /** Original source records, preserved separately from processed values. */
  rawRecords?: unknown;
}

export interface DatasetResult {
  datasetId: string;
  status: SourceStatus;
  series: NormalizedSeries[];
  detail?: string;
  /** Per-dataset error code, e.g. `SOURCE_TIMEOUT`, `KEY_NOT_CONFIGURED`. */
  errorCode?: string;
  /** Official URL to cite even when no data could be retrieved. */
  documentationUrl: string;
}

/** Result of a deterministic statistical computation. */
export interface AnalysisResult {
  id: string;
  method: AnalysisMethodId;
  /** Human-readable method name, in the investigation language. */
  methodLabel: string;
  inputVariables: string[];
  datasetRefs: string[];
  assumptions: string[];
  parameters: Record<string, string | number | boolean | null>;
  /** Numeric results only — never model-generated text. */
  results: Record<string, number | string | null>;
  limitations: string[];
  /** Chart-ready derived numbers (never observations: those live in the series). */
  series?: Array<{ x: number; y: number | null }>;
  /**
   * Paired values exactly as they were aligned for a two-variable statistic.
   * Present only where a paired test ran, so the scatter view plots the same
   * numbers the statistic used instead of re-pairing in the browser.
   */
  pairs?: Array<{ x: number; y: number }>;
  /** True when the method could not be applied to the retrieved data. */
  skipped: boolean;
  skipReason?: string;
  sampleSize: number;
}

export type EvidenceClassification = 'supporting' | 'contradicting' | 'neutral' | 'insufficient';
export type EvidenceStrength = 'none' | 'weak' | 'moderate' | 'strong';

export interface EvidenceItem {
  id: string;
  datasetId: string;
  datasetTitle: string;
  organisation: SourceOrganisation;
  sourceUrl: string;
  documentationUrl: string;
  retrievedAt: string;
  observationStart: string | null;
  observationEnd: string | null;
  measurements: string;
  units: string;
  processing: string;
  quality: string;
  limitations: string[];
  hypothesisIds: string[];
  classification: EvidenceClassification;
  strength: EvidenceStrength;
  /** Explicit, auditable rule that produced the classification. */
  rule: string;
  analysisId: string | null;
  /** Numeric values that justify the classification. */
  values: Record<string, number | string | null>;
}

export interface CounterEvidenceFinding {
  id: string;
  kind:
    | 'assumption'
    | 'alternative-explanation'
    | 'missing-variable'
    | 'temporal-mismatch'
    | 'measurement-uncertainty'
    | 'selection-bias'
    | 'data-gap'
    | 'falsification';
  severity: 'low' | 'medium' | 'high';
  /** Localised text. */
  title: string;
  detail: string;
}

export interface CounterEvidenceReport {
  findings: CounterEvidenceFinding[];
  /** Highest severity present; used by the conclusion rules. */
  severity: 'low' | 'medium' | 'high';
  /** True when a genuinely empty-data situation was found. */
  dataGapDetected: boolean;
}

export interface Hypothesis {
  version: typeof FORGE_MODEL_VERSION;
  id: string;
  /** Template key, used for localisation. */
  template:
    | 'lead-lag'
    | 'threshold-response'
    | 'null-association'
    | 'trend'
    | 'before-after'
    | 'descriptive-context';
  question: string;
  /** Localised statement of the testable claim. */
  statement: string;
  /** Plain-language mechanism proposed by the hypothesis (not a finding). */
  explanation: string;
  independentVariables: string[];
  dependentVariables: string[];
  requiredObservations: string[];
  expectedRelationship: {
    type: 'positive' | 'negative' | 'threshold' | 'none';
    /** Hours the independent variable is expected to lead by, when relevant. */
    lagHours: number | null;
    /** Minimum absolute effect size considered meaningful. */
    effectThreshold: number | null;
  };
  alternativeExplanations: string[];
  falsificationCriteria: string[];
  limitations: string[];
  testMethod: AnalysisMethodId;
  isNull: boolean;
  /** User decision; the server never sets this on its own. */
  status: 'proposed' | 'accepted' | 'rejected' | 'edited';
  /** Editable copy of the statement when the user changed it. */
  userStatement?: string;
}

export interface PlanDataset {
  datasetId: string;
  title: string;
  organisation: SourceOrganisation;
  /** True when the dataset can address the domain and variables requested. */
  compatible: boolean;
  reason: string;
  /** Coverage verdict for the requested time range. */
  coverage: 'in-range' | 'out-of-coverage' | 'partial' | 'unknown';
  coverageDetail: string;
  variables: string[];
  units: string[];
  endpoint: string;
  documentationUrl: string;
  requiresKey: boolean;
  keyConfigured: boolean;
  expectedLimitations: string[];
}

export interface ResearchPlan {
  version: typeof FORGE_MODEL_VERSION;
  requestId: string;
  question: string;
  objective: string;
  datasets: PlanDataset[];
  retrievalWindow: TimeRange;
  methods: Array<{ id: AnalysisMethodId; reason: string }>;
  verification: string[];
  missingInformation: string[];
  limitations: string[];
  /** True when at least one compatible dataset can cover the window. */
  executable: boolean;
  /** Honest statement when nothing can be retrieved. */
  blockingReason?: string;
}

export interface ScientificConclusion {
  /** Never 'proven'. */
  verdict: 'insufficient-evidence' | 'not-supported' | 'mixed' | 'weakly-supported';
  title: string;
  summary: string;
  /** Explicit correlation ≠ causation statement, always present. */
  causalCaveat: string;
  supportingCount: number;
  contradictingCount: number;
  neutralCount: number;
  insufficientCount: number;
  limitations: string[];
  alternatives: string[];
}

export interface SourceReport {
  datasetId: string;
  title: string;
  organisation: SourceOrganisation;
  status: SourceStatus;
  detail: string | null;
  errorCode: string | null;
  documentationUrl: string;
  recordCount: number;
  retrievedAt: string | null;
}

export interface Investigation {
  version: typeof FORGE_MODEL_VERSION;
  id: string;
  question: string;
  language: LanguageCode;
  createdAt: string;
  request: ResearchRequest;
  hypotheses: Hypothesis[];
  selectedHypothesisId: string | null;
  plan: ResearchPlan;
  datasets: DatasetResult[];
  analyses: AnalysisResult[];
  evidence: EvidenceItem[];
  counterEvidence: CounterEvidenceReport;
  conclusion: ScientificConclusion;
  sources: SourceReport[];
  /** Optional imagery references built from the existing GIBS catalogue. */
  imagery: Array<{
    layerId: string;
    title: string;
    date: string;
    wmsUrl: string;
    attribution: string;
  }>;
  /** Explicit list of things the system could not do. */
  limitations: string[];
  /** Set when the engine could not run the investigation at all. */
  error?: { code: string; message: string };
}

export const FORGE_SECTION_IDS = [
  'workspace',
  'research',
  'hypotheses',
  'data',
  'evidence',
  'analysis',
  'counter',
  'passport',
  'history',
] as const;

export type ForgeSectionId = (typeof FORGE_SECTION_IDS)[number];
