/**
 * Research context — the only thing the assistant ever sees.
 *
 * The assistant must "understand" the selected project without being handed a
 * licence to invent. Two decisions make that possible:
 *
 *  1. The context is **structured and bounded**. It carries ids, claims,
 *     lifecycle states, provenance and counts — never raw series, never the whole
 *     project blob, never storage keys.
 *  2. The context is **closed**. `allowedNumbers()` lists every number the model
 *     is permitted to repeat; an answer containing any other number is rejected
 *     wholesale rather than silently trimmed, because a partially-correct answer
 *     with one invented figure is worse than no answer.
 *
 * The same module builds the deterministic fallback brief, so the local path and
 * the remote path describe the project from one source of truth.
 */

import type { ResearchProject } from './project';
import type { HypothesisLifecycle, ResearchHypothesis } from './hypothesis';
import type { EvidenceRecord, EvidenceSourceType, EvidenceStance } from './evidenceIntel';

export const CONTEXT_VERSION = 'research-context/1';

export interface ContextHypothesis {
  id: string;
  statement: string;
  lifecycle: HypothesisLifecycle;
  methodology: string;
  falsificationConditions: string[];
  assumptions: string[];
  predictions: string[];
  alternativeExplanations: string[];
  selected: boolean;
}

export interface ContextEvidence {
  id: string;
  title: string;
  sourceType: EvidenceSourceType;
  stance: EvidenceStance;
  hypothesisIds: string[];
  fullText: EvidenceRecord['fullText'];
  verification: EvidenceRecord['verification'];
  /** Present only when the record carries one; never synthesised. */
  doi: string | null;
}

export interface ContextDataset {
  datasetId: string;
  title: string;
  organisation: string;
  version: string;
  retrievedAt: string;
  payloadHash: string;
  rowCount: number;
  units: string[];
}

export interface ResearchContext {
  version: typeof CONTEXT_VERSION;
  projectId: string;
  title: string;
  discipline: string;
  archived: boolean;
  questions: string[];
  objectives: string[];
  variables: Array<{ name: string; role: string; unit: string }>;
  assumptions: Array<{ statement: string; status: string }>;
  methods: Array<{ name: string; kind: string; preregistered: boolean; decisionRule: string }>;
  hypotheses: ContextHypothesis[];
  selectedHypothesisId: string | null;
  evidence: ContextEvidence[];
  datasets: ContextDataset[];
  conclusions: Array<{ hypothesisId: string; support: string; independentlyReproduced: boolean; caveats: string[] }>;
  /** Stated limits, derived from the evidence and the project's own gaps. */
  uncertainties: string[];
  /** Structural gaps a reader must know about. */
  gaps: string[];
  counts: {
    hypotheses: number;
    evidence: number;
    datasets: number;
    conclusions: number;
    versions: number;
    simulations: number;
  };
  /** True when lists were cut to fit the context budget. */
  truncated: string[];
}

const MAX_TEXT = 400;
const MAX_QUESTIONS = 8;
const MAX_EVIDENCE = 40;
const MAX_HYPOTHESES = 12;

function clip(text: string, limit = MAX_TEXT): string {
  const value = String(text ?? '').trim();
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function evidenceUncertainties(evidence: EvidenceRecord[]): string[] {
  const lines = new Set<string>();
  for (const record of evidence) {
    if (record.fullText !== 'full') {
      lines.add(`"${clip(record.title, 80)}" was available as ${record.fullText.replace('-', ' ')} only.`);
    }
    if (record.verification === 'unverified' || record.verification === 'rejected') {
      lines.add(`"${clip(record.title, 80)}" could not be verified (${record.verification}).`);
    }
    for (const limitation of record.limitations.slice(0, 2)) {
      lines.add(`${clip(record.title, 60)}: ${clip(limitation, 160)}`);
    }
  }
  return [...lines].slice(0, 12);
}

export function buildResearchContext(
  project: ResearchProject,
  options: { selectedHypothesisId?: string | null } = {},
): ResearchContext {
  const truncated: string[] = [];
  const selectedId = options.selectedHypothesisId ?? project.hypotheses[0]?.id ?? null;

  const hypotheses: ContextHypothesis[] = project.hypotheses.slice(0, MAX_HYPOTHESES).map((hypothesis) => ({
    id: hypothesis.id,
    statement: clip(hypothesis.statement),
    lifecycle: hypothesis.lifecycle,
    methodology: clip(hypothesis.methodology),
    falsificationConditions: hypothesis.falsificationConditions.slice(0, 5).map((entry) => clip(entry, 200)),
    assumptions: hypothesis.assumptions.slice(0, 5).map((entry) => clip(entry, 200)),
    predictions: hypothesis.predictions.slice(0, 5).map((entry) => clip(`${entry.prediction} → ${entry.expectedObservation}`, 220)),
    alternativeExplanations: hypothesis.alternativeExplanations.slice(0, 5).map((entry) => clip(entry, 200)),
    selected: hypothesis.id === selectedId,
  }));
  if (project.hypotheses.length > hypotheses.length) truncated.push('hypotheses');

  const evidence = project.evidence.slice(0, MAX_EVIDENCE).map((record) => ({
    id: record.id,
    title: clip(record.title, 180),
    sourceType: record.sourceType,
    stance: record.stance,
    hypothesisIds: [...record.hypothesisIds],
    fullText: record.fullText,
    verification: record.verification,
    doi: record.doi,
  }));
  if (project.evidence.length > evidence.length) truncated.push('evidence');

  const questions = project.questions.slice(0, MAX_QUESTIONS).map((question) => clip(question, 240));
  if (project.questions.length > questions.length) truncated.push('questions');

  const gaps: string[] = [];
  if (project.questions.length === 0) gaps.push('No research question is recorded.');
  if (project.hypotheses.length === 0) gaps.push('No hypothesis is recorded.');
  if (project.datasets.length === 0) gaps.push('No dataset snapshot is pinned, so nothing in this project can be reproduced yet.');
  if (!project.methods.some((method) => method.preregistered)) {
    gaps.push('No method was pre-registered, so a decision rule can still drift after seeing the data.');
  }
  if (project.hypotheses.some((hypothesis) => hypothesis.falsificationConditions.length === 0)) {
    gaps.push('At least one hypothesis has no falsification condition, so it cannot be tested.');
  }
  if (project.evidence.some((record) => record.verification !== 'verified-structure')) {
    gaps.push('Some evidence records could not be verified structurally.');
  }

  return {
    version: CONTEXT_VERSION,
    projectId: project.id,
    title: clip(project.title, 200),
    discipline: project.discipline,
    archived: project.archivedAt !== null,
    questions,
    objectives: project.objectives.slice(0, 8).map((objective) => clip(objective, 200)),
    variables: project.variables.slice(0, 24).map((variable) => ({
      name: clip(variable.name, 80),
      role: variable.role,
      unit: clip(variable.unit, 40),
    })),
    assumptions: project.assumptions.slice(0, 16).map((assumption) => ({
      statement: clip(assumption.statement, 240),
      status: assumption.status,
    })),
    methods: project.methods.slice(0, 12).map((method) => ({
      name: clip(method.name, 120),
      kind: method.kind,
      preregistered: method.preregistered,
      decisionRule: clip(method.decisionRule, 240),
    })),
    hypotheses,
    selectedHypothesisId: selectedId,
    evidence,
    datasets: project.datasets.slice(0, 16).map((snapshot) => ({
      datasetId: snapshot.datasetId,
      title: clip(snapshot.title, 160),
      organisation: clip(snapshot.organisation, 80),
      version: clip(snapshot.version, 80),
      retrievedAt: snapshot.retrievedAt,
      payloadHash: snapshot.payloadHash,
      rowCount: snapshot.rowCount,
      units: snapshot.units.slice(0, 8).map((unit) => clip(unit, 24)),
    })),
    conclusions: project.conclusions.slice(0, 12).map((conclusion) => ({
      hypothesisId: conclusion.hypothesisId,
      support: conclusion.support,
      independentlyReproduced: conclusion.independentlyReproduced,
      caveats: conclusion.caveats.slice(0, 4).map((caveat) => clip(caveat, 200)),
    })),
    uncertainties: evidenceUncertainties(project.evidence),
    gaps,
    counts: {
      hypotheses: project.hypotheses.length,
      evidence: project.evidence.length,
      datasets: project.datasets.length,
      conclusions: project.conclusions.length,
      versions: project.versions.length,
      simulations: project.simulations.length,
    },
    truncated,
  };
}

/** Identifier sets the answer is allowed to cite. */
export function citableIds(context: ResearchContext): { evidence: Set<string>; datasets: Set<string>; project: Set<string> } {
  return {
    evidence: new Set(context.evidence.map((record) => record.id)),
    datasets: new Set(context.datasets.map((dataset) => dataset.datasetId)),
    project: new Set([context.projectId]),
  };
}

/**
 * Every numeric token the model may repeat. Built from the serialised context,
 * so it is impossible for the list to contain something the model could not have
 * read — and impossible for the model to introduce a number we did not send.
 */
export function allowedNumbers(context: ResearchContext): Set<string> {
  const text = JSON.stringify(context);
  const tokens = text.match(/-?\d+(?:\.\d+)?/g) ?? [];
  const allowed = new Set<string>();
  for (const token of tokens) {
    allowed.add(token);
    const numeric = Number(token);
    if (Number.isFinite(numeric)) allowed.add(String(numeric));
  }
  // Years are dates, not measurements; they are already in the context but the
  // non-ASCII ellipsis/clipping can split one, so add the four-digit prefix.
  for (const token of tokens) {
    if (/^\d{4}$/.test(token)) allowed.add(token.slice(0, 4));
  }
  return allowed;
}

export interface NumberAudit {
  ok: boolean;
  offending: string[];
  checked: number;
}

/**
 * Rejects any answer containing a number that was not in the context. Written as
 * a hard gate: the caller must not fall back to "show it anyway with a warning".
 */
export function auditNumbers(answer: string, context: ResearchContext): NumberAudit {
  const allowed = allowedNumbers(context);
  const tokens = String(answer ?? '').match(/-?\d+(?:\.\d+)?/g) ?? [];
  const offending: string[] = [];
  for (const token of tokens) {
    if (allowed.has(token)) continue;
    // A trailing/leading punctuation artefact is not a fabricated quantity.
    const normalised = token.replace(/^-/, '');
    if (allowed.has(normalised)) continue;
    if (!offending.includes(token)) offending.push(token);
  }
  return { ok: offending.length === 0, offending, checked: tokens.length };
}

/* --------------------------- deterministic fallback ---------------------- */

export interface LocalBrief {
  mode: 'local';
  summary: string;
  sections: Array<{ title: string; lines: string[] }>;
  citations: string[];
  caveat: string;
}

/**
 * What the workspace can say without a language model. Every sentence is derived
 * from stored fields and counts; none of it interprets a result.
 */
export function localBrief(context: ResearchContext): LocalBrief {
  const selected = context.hypotheses.find((hypothesis) => hypothesis.id === context.selectedHypothesisId) ?? null;
  const linked = selected ? context.evidence.filter((record) => record.hypothesisIds.includes(selected.id)) : [];
  const supporting = linked.filter((record) => record.stance === 'supporting').length;
  const contradicting = linked.filter((record) => record.stance === 'contradicting').length;
  const unverified = context.evidence.filter((record) => record.verification !== 'verified-structure').length;

  const summary = [
    `Project "${context.title}" (${context.discipline}), ${context.archived ? 'archived' : 'active'}.`,
    `${context.counts.hypotheses} hypothesis(es), ${context.counts.evidence} evidence record(s), ${context.counts.datasets} dataset snapshot(s).`,
    selected ? `Selected hypothesis: "${selected.statement || 'no statement recorded'}" — lifecycle ${selected.lifecycle}.` : 'No hypothesis is selected.',
  ].join(' ');

  const sections: Array<{ title: string; lines: string[] }> = [];
  sections.push({
    title: 'What is recorded',
    lines: [
      ...context.questions.slice(0, 3).map((question) => `Question: ${question}`),
      selected && selected.methodology ? `Method: ${selected.methodology}` : 'No methodology is recorded for the selected hypothesis.',
      selected && selected.falsificationConditions.length > 0
        ? `Falsification: ${selected.falsificationConditions[0]}`
        : 'No falsification condition is recorded, so the hypothesis is not yet testable.',
    ],
  });
  sections.push({
    title: 'Evidence attached to the selected hypothesis',
    lines:
      linked.length === 0
        ? ['No evidence record is linked to this hypothesis yet.']
        : [
            `${supporting} supporting, ${contradicting} contradicting, ${linked.length} linked in total.`,
            ...linked.slice(0, 5).map((record) => `${record.stance} · ${record.sourceType} · ${record.title}`),
          ],
  });
  sections.push({
    title: 'Uncertainties and limits',
    lines:
      context.uncertainties.length === 0
        ? ['No limitation is recorded on the attached evidence; absence of a recorded limitation is not absence of one.']
        : context.uncertainties.slice(0, 6),
  });
  sections.push({
    title: 'What is missing',
    lines: context.gaps.length === 0 ? ['No structural gap was detected. This does not mean the design is sound.'] : context.gaps.slice(0, 6),
  });

  return {
    mode: 'local',
    summary,
    sections,
    citations: linked.slice(0, 8).map((record) => record.id),
    caveat:
      'This is a deterministic summary of the fields you entered, not a model response. It adds no interpretation, performs no calculation and cites nothing beyond your own records.',
  };
}

export function hypothesisById(project: ResearchProject, id: string | null): ResearchHypothesis | null {
  if (!id) return null;
  return project.hypotheses.find((hypothesis) => hypothesis.id === id) ?? null;
}
