/**
 * Research projects — the unit of work above a single investigation.
 *
 * The Forge could already run one investigation at a time. A research programme
 * needs more than that: several questions, several hypotheses, methods chosen in
 * advance, evidence gathered over months, simulations, and the ability to reopen
 * a past run months later and know exactly what it was computed from.
 *
 * Design constraints, in order of importance:
 *
 *  1. **No second database.** Projects live in the same localStorage family as
 *     investigations (`nova_forge_*`), with a versioned envelope and a migration
 *     path. A blocked or full store degrades to "not saved", never to silence.
 *  2. **Reopening never recalculates.** A saved run carries the dataset snapshot
 *     reference and the computation hashes; reopening shows what was computed,
 *     and any recomputation is an explicit, labelled action.
 *  3. **Autosave is not a commit.** Drafts are recovered on crash; versions are
 *     explicit snapshots with a content hash so two people can tell them apart.
 *  4. **One representation per fact.** A hypothesis lives in `hypotheses` — not
 *     also in an id list beside it. Evidence lives in `evidence` as a research
 *     record — engine evidence items are *converted* on import, never kept in a
 *     parallel shape.
 */

import type { EvidenceItem, LanguageCode } from '../types';
import { fromEngineEvidence, type EvidenceRecord } from './evidenceIntel';
import type { ResearchHypothesis } from './hypothesis';

export const PROJECT_STORE_KEY = 'nova_forge_projects_v1';
export const PROJECT_DRAFT_KEY = 'nova_forge_project_draft_v1';
export const PROJECT_SCHEMA_VERSION = 2;
export const MAX_PROJECTS = 24;
export const MAX_VERSIONS_PER_PROJECT = 40;
export const MAX_HYPOTHESES_PER_PROJECT = 24;
export const MAX_EVIDENCE_PER_PROJECT = 200;

export type Discipline =
  | 'space-weather'
  | 'earth-environment'
  | 'near-earth-objects'
  | 'orbital-mechanics'
  | 'planetary-science'
  | 'astronomy'
  | 'exoplanets'
  | 'life-sciences'
  | 'interdisciplinary'
  | 'unsupported';

export const DISCIPLINES: Discipline[] = [
  'space-weather',
  'earth-environment',
  'near-earth-objects',
  'orbital-mechanics',
  'planetary-science',
  'astronomy',
  'exoplanets',
  'life-sciences',
  'interdisciplinary',
];

export interface ResearchVariable {
  id: string;
  name: string;
  role: 'independent' | 'dependent' | 'control' | 'mediator' | 'confounder';
  unit: string;
  /** How the variable is measured, and by which instrument or dataset. */
  operationalisation: string;
}

export interface ResearchAssumption {
  id: string;
  statement: string;
  /** What breaks if the assumption is false. */
  ifFalse: string;
  status: 'untested' | 'supported' | 'challenged' | 'violated';
}

export interface MethodPlan {
  id: string;
  name: string;
  /** Deterministic methods only — never "ask the model". */
  kind: 'descriptive' | 'correlation' | 'regression' | 'test' | 'simulation' | 'bayesian' | 'screening';
  variables: string[];
  decisionRule: string;
  preregistered: boolean;
}

/** A dataset pinned to a version so a run can be reopened identically. */
export interface DatasetSnapshot {
  datasetId: string;
  title: string;
  organisation: string;
  /** Version or retrieval timestamp as reported by the source. */
  version: string;
  retrievedAt: string;
  /** Hash of the payload actually used (`DataProvenance.payloadHash`). */
  payloadHash: string;
  rowCount: number;
  units: string[];
  /** Query actually sent, so it can be replayed. */
  query: string;
}

export interface SimulationRecord {
  id: string;
  modelId: string;
  parameters: Record<string, string | number>;
  engineVersion: string;
  createdAt: string;
  /** Diagnostics captured at run time; reopening shows these, not new numbers. */
  diagnostics: Record<string, number | string | boolean | null>;
  validationPassed: boolean | null;
}

/** A deterministic computation recorded against the project, as it was run. */
export interface ProjectAnalysisRecord {
  id: string;
  method: string;
  engineVersion: string;
  /** Dataset snapshots the computation used. */
  datasetIds: string[];
  sampleSize: number;
  /** Headline values exactly as computed; never recomputed on read. */
  values: Record<string, number | string | null>;
  limitations: string[];
  computedAt: string;
}

export interface ConclusionRecord {
  id: string;
  statement: string;
  /** Which hypothesis this conclusion is about. */
  hypothesisId: string;
  support: 'supported' | 'not-supported' | 'inconclusive';
  /** Every reason this conclusion could be wrong. */
  caveats: string[];
  createdAt: string;
  /** Never true by default — set only through the verification gate. */
  independentlyReproduced: boolean;
}

export interface ReportRecord {
  id: string;
  title: string;
  format: 'markdown' | 'json';
  body: string;
  createdAt: string;
  /** Dataset snapshots and engine version the report was generated from. */
  provenance: { snapshots: string[]; engineVersion: string };
}

export interface ResearchProject {
  schemaVersion: number;
  id: string;
  title: string;
  description: string;
  discipline: Discipline;
  language: LanguageCode;
  questions: string[];
  objectives: string[];
  variables: ResearchVariable[];
  assumptions: ResearchAssumption[];
  methods: MethodPlan[];
  /** The single source of truth for hypotheses. */
  hypotheses: ResearchHypothesis[];
  /** The single source of truth for evidence (research records). */
  evidence: EvidenceRecord[];
  datasets: DatasetSnapshot[];
  analyses: ProjectAnalysisRecord[];
  simulations: SimulationRecord[];
  conclusions: ConclusionRecord[];
  citations: CitationRecord[];
  reports: ReportRecord[];
  /** Investigation runs attached to the project (ids in forge memory). */
  investigationIds: string[];
  /** Change log; each entry carries the content hash it produced. */
  versions: ProjectVersion[];
  /** ISO timestamp when archived, null while active. */
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CitationRecord {
  id: string;
  /** Never generated by the Forge: supplied by the researcher or a connector. */
  title: string;
  authors: string[];
  year: number | null;
  publisher: string;
  url: string | null;
  doi: string | null;
  retrievedAt: string;
  /** Where the record came from, so a reader can check it. */
  origin: 'user' | 'connector' | 'dataset';
  /** Full text inspected, abstract only, or metadata only. */
  fullText: 'full' | 'abstract' | 'metadata-only';
}

export interface ProjectVersion {
  id: string;
  label: string;
  createdAt: string;
  /** FNV-1a hash over the canonical JSON of the project, excluding versions. */
  contentHash: string;
  /** Fields that differ from the previous version, for a readable history. */
  changed: string[];
  snapshot: string;
}

/* ------------------------------- utilities -------------------------------- */

/** Stable JSON: object keys sorted, so a hash does not depend on insertion order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

export function contentHash(value: unknown): string {
  const text = canonicalJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

let idCounter = 0;

/**
 * Ids stay unique without a network or a clock dependency in tests: the counter
 * is process-local, the timestamp keeps them sortable, the random suffix keeps
 * two tabs apart.
 */
export function newId(prefix: string): string {
  idCounter = (idCounter + 1) % 1_000_000;
  const random = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}_${random}`;
}

export function emptyProject(options: { title: string; discipline?: Discipline; language?: LanguageCode }): ResearchProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: newId('prj'),
    title: options.title.trim() || 'Untitled research project',
    description: '',
    discipline: options.discipline ?? 'interdisciplinary',
    language: options.language ?? 'en',
    questions: [],
    objectives: [],
    variables: [],
    assumptions: [],
    methods: [],
    hypotheses: [],
    evidence: [],
    datasets: [],
    analyses: [],
    simulations: [],
    conclusions: [],
    citations: [],
    reports: [],
    investigationIds: [],
    versions: [],
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/* ------------------------------ validation -------------------------------- */

export interface ProjectValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const ARRAY_FIELDS = [
  'questions',
  'objectives',
  'variables',
  'assumptions',
  'methods',
  'hypotheses',
  'evidence',
  'datasets',
  'analyses',
  'simulations',
  'conclusions',
  'citations',
  'reports',
  'versions',
  'investigationIds',
] as const;

/**
 * Structural validation on load. Unknown or corrupt fields are dropped rather
 * than trusted, and a project missing its identity is refused.
 */
export function validateProject(value: unknown): ProjectValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!value || typeof value !== 'object') {
    return { ok: false, errors: ['Project payload is not an object.'], warnings };
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.id.length === 0) errors.push('Missing project id.');
  if (typeof record.title !== 'string' || record.title.trim().length === 0) errors.push('Missing project title.');
  if (record.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    warnings.push(`Schema version ${String(record.schemaVersion)} will be migrated to ${PROJECT_SCHEMA_VERSION}.`);
  }
  if (Array.isArray(record.hypothesisIds) && !Array.isArray(record.hypotheses)) {
    warnings.push('Legacy "hypothesisIds" found: ids alone cannot rebuild a hypothesis, so the list is reported and reset.');
  }
  for (const key of ARRAY_FIELDS) {
    if (!Array.isArray(record[key])) warnings.push(`Field "${key}" was missing or not an array; it was reset to an empty list.`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

function isEngineEvidence(value: unknown): value is EvidenceItem {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.classification === 'string' && typeof record.datasetTitle === 'string';
}

/** Drafts made after PR #46 stored engine evidence items; convert, don't discard. */
function migrateEvidence(entry: unknown): EvidenceRecord | null {
  if (!entry || typeof entry !== 'object') return null;
  if (isEngineEvidence(entry)) {
    return fromEngineEvidence(entry, { datasetVersion: 'unversioned (migrated from v1)' });
  }
  const record = entry as Partial<EvidenceRecord>;
  if (typeof record.id !== 'string' || typeof record.title !== 'string') return null;
  return {
    ...record,
    authors: Array.isArray(record.authors) ? record.authors : [],
    limitations: Array.isArray(record.limitations) ? record.limitations : [],
    hypothesisIds: Array.isArray(record.hypothesisIds) ? record.hypothesisIds : [],
    stance: record.stance ?? 'unverified',
    sourceType: record.sourceType ?? 'secondary',
    origin: record.origin ?? 'user',
    fullText: record.fullText ?? 'metadata-only',
    verification: record.verification ?? 'unverified',
    verificationNote: record.verificationNote ?? 'Migrated record: no verification was recorded with it.',
    accessNote: record.accessNote ?? 'No access note was recorded with this migrated item.',
    citation: record.citation ?? `${record.title}`,
  } as EvidenceRecord;
}

/** Migrates any older/partial payload to the current schema, losslessly. */
export function migrateProject(value: unknown): ResearchProject | null {
  const validation = validateProject(value);
  if (!validation.ok) return null;
  const record = value as Record<string, unknown>;
  const base = emptyProject({ title: String(record.title) });
  const pickArray = <T>(key: string): T[] => (Array.isArray(record[key]) ? (record[key] as T[]) : []);
  const evidence = pickArray<unknown>('evidence')
    .map(migrateEvidence)
    .filter((entry): entry is EvidenceRecord => entry !== null)
    .slice(-MAX_EVIDENCE_PER_PROJECT);
  return {
    ...base,
    ...record,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    discipline: (typeof record.discipline === 'string' ? record.discipline : 'interdisciplinary') as Discipline,
    language: (typeof record.language === 'string' ? record.language : 'en') as LanguageCode,
    questions: pickArray<string>('questions'),
    objectives: pickArray<string>('objectives'),
    variables: pickArray<ResearchVariable>('variables'),
    assumptions: pickArray<ResearchAssumption>('assumptions'),
    methods: pickArray<MethodPlan>('methods'),
    hypotheses: pickArray<ResearchHypothesis>('hypotheses').slice(-MAX_HYPOTHESES_PER_PROJECT),
    evidence,
    datasets: pickArray<DatasetSnapshot>('datasets'),
    analyses: pickArray<ProjectAnalysisRecord>('analyses'),
    simulations: pickArray<SimulationRecord>('simulations'),
    conclusions: pickArray<ConclusionRecord>('conclusions'),
    citations: pickArray<CitationRecord>('citations'),
    reports: pickArray<ReportRecord>('reports'),
    investigationIds: pickArray<string>('investigationIds'),
    versions: pickArray<ProjectVersion>('versions').slice(-MAX_VERSIONS_PER_PROJECT),
    archivedAt: typeof record.archivedAt === 'string' ? record.archivedAt : null,
  };
}

/* -------------------------------- versions -------------------------------- */

const TRACKED_FIELDS = [
  'title',
  'description',
  'discipline',
  'questions',
  'objectives',
  'variables',
  'assumptions',
  'methods',
  'hypotheses',
  'evidence',
  'datasets',
  'analyses',
  'simulations',
  'conclusions',
  'citations',
  'reports',
] as const;

export function projectHash(project: ResearchProject): string {
  const { versions: _versions, updatedAt: _updatedAt, archivedAt: _archivedAt, ...rest } = project;
  return contentHash(rest);
}

/** Creates an immutable snapshot. The snapshot itself is stored as JSON text. */
export function commitVersion(project: ResearchProject, label: string): ResearchProject {
  const previous = project.versions[project.versions.length - 1];
  const previousProject = previous ? (safeParse(previous.snapshot) as ResearchProject | null) : null;
  const changed = TRACKED_FIELDS.filter((field) => {
    if (!previousProject) return true;
    return canonicalJson(previousProject[field]) !== canonicalJson(project[field]);
  });
  // The snapshot excludes `versions` on purpose: embedding prior snapshots
  // inside new ones grows the payload exponentially and would blow the quota.
  // History lives once, at the top level of the project.
  const { versions: _history, ...snapshottable } = project;
  const version: ProjectVersion = {
    id: newId('ver'),
    label: label.trim() || 'Snapshot',
    createdAt: new Date().toISOString(),
    contentHash: projectHash(project),
    changed: [...changed],
    snapshot: JSON.stringify(snapshottable),
  };
  return {
    ...project,
    updatedAt: version.createdAt,
    versions: [...project.versions, version].slice(-MAX_VERSIONS_PER_PROJECT),
  };
}

/** Reopens a stored version *as it was*, without recomputing anything. */
export function restoreVersion(project: ResearchProject, versionId: string): { project: ResearchProject | null; reason: string } {
  const version = project.versions.find((entry) => entry.id === versionId);
  if (!version) return { project: null, reason: 'Unknown version id.' };
  const restored = safeParse(version.snapshot) as ResearchProject | null;
  if (!restored) return { project: null, reason: 'The stored snapshot could not be parsed.' };
  // The restored project keeps the full history so nothing is lost.
  return {
    project: {
      ...restored,
      id: project.id,
      versions: project.versions,
      updatedAt: new Date().toISOString(),
    },
    reason: `Restored "${version.label}" as recorded on ${version.createdAt}. Values are the ones computed then — nothing was recalculated.`,
  };
}

/* ----------------------------- reproducibility ---------------------------- */

export interface ReproducibilityCheck {
  ok: boolean;
  drift: Array<{ datasetId: string; pinnedHash: string; currentHash: string | null }>;
  message: string;
}

/**
 * Compares the pinned dataset snapshots of a stored run with what the source
 * currently reports. A changed payload is *reported*, never silently absorbed.
 */
export function checkReproducibility(
  project: ResearchProject,
  current: Array<{ datasetId: string; payloadHash: string | null }>,
): ReproducibilityCheck {
  const drift: ReproducibilityCheck['drift'] = [];
  for (const snapshot of project.datasets) {
    const live = current.find((entry) => entry.datasetId === snapshot.datasetId);
    if (!live || !live.payloadHash) {
      drift.push({ datasetId: snapshot.datasetId, pinnedHash: snapshot.payloadHash, currentHash: null });
      continue;
    }
    if (live.payloadHash !== snapshot.payloadHash) {
      drift.push({ datasetId: snapshot.datasetId, pinnedHash: snapshot.payloadHash, currentHash: live.payloadHash });
    }
  }
  const missing = drift.filter((entry) => entry.currentHash === null).length;
  const changed = drift.length - missing;
  return {
    ok: drift.length === 0,
    drift,
    message:
      drift.length === 0
        ? 'Every dataset snapshot still matches the source. The run can be reproduced exactly.'
        : `${changed} dataset(s) have changed at the source and ${missing} could not be re-checked. The stored run keeps its original values; new results must be computed as a new version.`,
  };
}

/* -------------------------------- storage --------------------------------- */

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export interface ProjectStore {
  version: number;
  projects: ResearchProject[];
}

/** Reads the store, migrating older payloads. Corrupt entries are skipped. */
export function readProjects(): ProjectStore {
  const store = storage();
  if (!store) return { version: PROJECT_SCHEMA_VERSION, projects: [] };
  const raw = store.getItem(PROJECT_STORE_KEY);
  if (!raw) return { version: PROJECT_SCHEMA_VERSION, projects: [] };
  const parsed = safeParse(raw) as { projects?: unknown[] } | null;
  if (!parsed || !Array.isArray(parsed.projects)) return { version: PROJECT_SCHEMA_VERSION, projects: [] };
  const projects: ResearchProject[] = [];
  for (const entry of parsed.projects) {
    const migrated = migrateProject(entry);
    if (migrated) projects.push(migrated);
  }
  return { version: PROJECT_SCHEMA_VERSION, projects: projects.slice(-MAX_PROJECTS) };
}

export function writeProjects(projects: ResearchProject[]): { ok: boolean; reason?: string } {
  const store = storage();
  if (!store) return { ok: false, reason: 'storage-unavailable' };
  try {
    store.setItem(PROJECT_STORE_KEY, JSON.stringify({ version: PROJECT_SCHEMA_VERSION, projects: projects.slice(-MAX_PROJECTS) }));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.name : 'write-failed' };
  }
}

export function saveProject(project: ResearchProject): { ok: boolean; projects: ResearchProject[]; reason?: string } {
  const store = readProjects();
  const existing = store.projects.filter((entry) => entry.id !== project.id);
  const updated = { ...project, updatedAt: new Date().toISOString() };
  const projects = [...existing, updated];
  const result = writeProjects(projects);
  return { ok: result.ok, projects, reason: result.reason };
}

export function deleteProject(id: string): { ok: boolean; projects: ResearchProject[] } {
  const store = readProjects();
  const projects = store.projects.filter((entry) => entry.id !== id);
  const result = writeProjects(projects);
  return { ok: result.ok, projects };
}

/* ---------------------------- autosave & recovery ------------------------- */

export interface DraftEnvelope {
  projectId: string;
  savedAt: string;
  /** Hash of what was saved, so a recover can detect partial writes. */
  contentHash: string;
  project: ResearchProject;
}

/**
 * Stores the in-progress project. Separate from the committed store: a crash
 * during editing must not overwrite the last good version.
 */
export function saveDraft(project: ResearchProject): { ok: boolean; reason?: string } {
  const store = storage();
  if (!store) return { ok: false, reason: 'storage-unavailable' };
  const envelope: DraftEnvelope = {
    projectId: project.id,
    savedAt: new Date().toISOString(),
    contentHash: projectHash(project),
    project,
  };
  try {
    store.setItem(PROJECT_DRAFT_KEY, JSON.stringify(envelope));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.name : 'write-failed' };
  }
}

export function readDraft(): DraftEnvelope | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(PROJECT_DRAFT_KEY);
  if (!raw) return null;
  const parsed = safeParse(raw) as DraftEnvelope | null;
  if (!parsed || !parsed.project) return null;
  const project = migrateProject(parsed.project);
  if (!project) return null;
  const expected = projectHash(project);
  if (parsed.contentHash !== expected) {
    // A partial write: refuse to hand back a project that does not match its hash.
    return null;
  }
  return { ...parsed, project };
}

export function clearDraft(): void {
  storage()?.removeItem(PROJECT_DRAFT_KEY);
}

/* --------------------------- editing operations --------------------------- */

/**
 * Every mutation below is a pure function returning a new project plus the time
 * it changed. Keeping them here (rather than in components) is what makes the
 * research workflow testable without a DOM.
 */
export function touch(project: ResearchProject): ResearchProject {
  return { ...project, updatedAt: new Date().toISOString() };
}

export function hypothesisIdsOf(project: ResearchProject): string[] {
  return project.hypotheses.map((hypothesis) => hypothesis.id);
}

export function findHypothesis(project: ResearchProject, id: string): ResearchHypothesis | null {
  return project.hypotheses.find((hypothesis) => hypothesis.id === id) ?? null;
}

export function upsertHypothesis(project: ResearchProject, hypothesis: ResearchHypothesis): ResearchProject {
  const exists = project.hypotheses.some((entry) => entry.id === hypothesis.id);
  const hypotheses = exists
    ? project.hypotheses.map((entry) => (entry.id === hypothesis.id ? hypothesis : entry))
    : [...project.hypotheses, hypothesis].slice(-MAX_HYPOTHESES_PER_PROJECT);
  return touch({ ...project, hypotheses });
}

export function removeHypothesis(project: ResearchProject, hypothesisId: string): ResearchProject {
  return touch({
    ...project,
    hypotheses: project.hypotheses.filter((entry) => entry.id !== hypothesisId),
    // Evidence links to a hypothesis that no longer exists would be dangling.
    evidence: project.evidence.map((record) => ({
      ...record,
      hypothesisIds: record.hypothesisIds.filter((id) => id !== hypothesisId),
    })),
    conclusions: project.conclusions.filter((conclusion) => conclusion.hypothesisId !== hypothesisId),
  });
}

export function upsertEvidence(project: ResearchProject, record: EvidenceRecord): ResearchProject {
  const exists = project.evidence.some((entry) => entry.id === record.id);
  const evidence = exists
    ? project.evidence.map((entry) => (entry.id === record.id ? record : entry))
    : [...project.evidence, record].slice(-MAX_EVIDENCE_PER_PROJECT);
  return touch({ ...project, evidence });
}

export function removeEvidence(project: ResearchProject, evidenceId: string): ResearchProject {
  return touch({ ...project, evidence: project.evidence.filter((entry) => entry.id !== evidenceId) });
}

/** Links or unlinks an existing record to a hypothesis; never edits the claim. */
export function setEvidenceLink(
  project: ResearchProject,
  evidenceId: string,
  hypothesisId: string,
  linked: boolean,
): ResearchProject {
  return touch({
    ...project,
    evidence: project.evidence.map((record) => {
      if (record.id !== evidenceId) return record;
      const has = record.hypothesisIds.includes(hypothesisId);
      if (linked === has) return record;
      return {
        ...record,
        hypothesisIds: linked
          ? [...record.hypothesisIds, hypothesisId]
          : record.hypothesisIds.filter((id) => id !== hypothesisId),
      };
    }),
  });
}

export function upsertVariable(project: ResearchProject, variable: ResearchVariable): ResearchProject {
  const exists = project.variables.some((entry) => entry.id === variable.id);
  return touch({
    ...project,
    variables: exists
      ? project.variables.map((entry) => (entry.id === variable.id ? variable : entry))
      : [...project.variables, variable],
  });
}

export function removeVariable(project: ResearchProject, variableId: string): ResearchProject {
  return touch({ ...project, variables: project.variables.filter((entry) => entry.id !== variableId) });
}

export function upsertAssumption(project: ResearchProject, assumption: ResearchAssumption): ResearchProject {
  const exists = project.assumptions.some((entry) => entry.id === assumption.id);
  return touch({
    ...project,
    assumptions: exists
      ? project.assumptions.map((entry) => (entry.id === assumption.id ? assumption : entry))
      : [...project.assumptions, assumption],
  });
}

export function removeAssumption(project: ResearchProject, assumptionId: string): ResearchProject {
  return touch({ ...project, assumptions: project.assumptions.filter((entry) => entry.id !== assumptionId) });
}

export function upsertMethod(project: ResearchProject, method: MethodPlan): ResearchProject {
  const exists = project.methods.some((entry) => entry.id === method.id);
  return touch({
    ...project,
    methods: exists ? project.methods.map((entry) => (entry.id === method.id ? method : entry)) : [...project.methods, method],
  });
}

export function removeMethod(project: ResearchProject, methodId: string): ResearchProject {
  return touch({ ...project, methods: project.methods.filter((entry) => entry.id !== methodId) });
}

export function addDatasetSnapshot(project: ResearchProject, snapshot: DatasetSnapshot): ResearchProject {
  const exists = project.datasets.some((entry) => entry.datasetId === snapshot.datasetId);
  return touch({
    ...project,
    datasets: exists
      ? project.datasets.map((entry) => (entry.datasetId === snapshot.datasetId ? snapshot : entry))
      : [...project.datasets, snapshot],
  });
}

export function addAnalysis(project: ResearchProject, record: ProjectAnalysisRecord): ResearchProject {
  return touch({ ...project, analyses: [...project.analyses, record] });
}

export function addSimulation(project: ResearchProject, record: SimulationRecord): ResearchProject {
  return touch({ ...project, simulations: [...project.simulations, record] });
}

export function upsertConclusion(project: ResearchProject, conclusion: ConclusionRecord): ResearchProject {
  const exists = project.conclusions.some((entry) => entry.id === conclusion.id);
  return touch({
    ...project,
    conclusions: exists
      ? project.conclusions.map((entry) => (entry.id === conclusion.id ? conclusion : entry))
      : [...project.conclusions, conclusion],
  });
}

export function removeConclusion(project: ResearchProject, conclusionId: string): ResearchProject {
  return touch({ ...project, conclusions: project.conclusions.filter((entry) => entry.id !== conclusionId) });
}

export function addCitation(project: ResearchProject, citation: CitationRecord): ResearchProject {
  return touch({ ...project, citations: [...project.citations, citation] });
}

export function removeCitation(project: ResearchProject, citationId: string): ResearchProject {
  return touch({ ...project, citations: project.citations.filter((entry) => entry.id !== citationId) });
}

export function linkInvestigation(project: ResearchProject, investigationId: string): ResearchProject {
  if (project.investigationIds.includes(investigationId)) return project;
  return touch({ ...project, investigationIds: [...project.investigationIds, investigationId] });
}

export function unlinkInvestigation(project: ResearchProject, investigationId: string): ResearchProject {
  return touch({ ...project, investigationIds: project.investigationIds.filter((id) => id !== investigationId) });
}

export function archiveProject(project: ResearchProject): ResearchProject {
  return touch({ ...project, archivedAt: new Date().toISOString() });
}

export function unarchiveProject(project: ResearchProject): ResearchProject {
  return touch({ ...project, archivedAt: null });
}

/* ------------------------------- summary ---------------------------------- */

export interface ProjectSummary {
  id: string;
  title: string;
  discipline: Discipline;
  archived: boolean;
  hypothesisCount: number;
  evidenceCount: number;
  datasetCount: number;
  simulationCount: number;
  conclusionCount: number;
  versionCount: number;
  updatedAt: string;
  /** Data problems a reader should know before trusting the project. */
  gaps: string[];
}

export function summariseProject(project: ResearchProject): ProjectSummary {
  const gaps: string[] = [];
  if (project.questions.length === 0) gaps.push('No research question recorded.');
  if (project.hypotheses.length === 0) gaps.push('No hypothesis recorded.');
  if (project.variables.length === 0) gaps.push('No variables defined.');
  if (project.datasets.length === 0) gaps.push('No dataset snapshot pinned.');
  if (project.evidence.length === 0) gaps.push('No evidence recorded.');
  if (!project.methods.some((method) => method.preregistered)) gaps.push('No method was pre-registered before data collection.');
  if (project.conclusions.some((conclusion) => !conclusion.independentlyReproduced)) {
    gaps.push('Some conclusions have not been independently reproduced.');
  }
  return {
    id: project.id,
    title: project.title,
    discipline: project.discipline,
    archived: project.archivedAt !== null,
    hypothesisCount: project.hypotheses.length,
    evidenceCount: project.evidence.length,
    datasetCount: project.datasets.length,
    simulationCount: project.simulations.length,
    conclusionCount: project.conclusions.length,
    versionCount: project.versions.length,
    updatedAt: project.updatedAt,
    gaps,
  };
}
