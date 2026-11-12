/**
 * Research-grade hypotheses: the thirteen fields, a lifecycle, and versioning.
 *
 * The existing `Hypothesis` type in `../types.ts` is what the *investigation
 * engine* generates automatically from a question. It is deliberately narrow so
 * the engine can only produce claims it can test. This module extends it to what
 * a researcher needs when they write their own hypothesis, without changing that
 * type: a `ResearchHypothesis` wraps an engine hypothesis or stands alone.
 *
 * The lifecycle is explicit because the words matter:
 *
 *   draft → needs-evidence → testable → under-evaluation
 *         → supported | not-supported | inconclusive → archived
 *
 * "Supported" means *the stated test, on the stated data, with the stated
 * assumptions, produced a result consistent with the hypothesis*. It does not
 * mean true, and it never becomes "discovery".
 */

import { contentHash } from './project';

export const HYPOTHESIS_SCHEMA_VERSION = 1;

export type HypothesisLifecycle =
  | 'draft'
  | 'needs-evidence'
  | 'testable'
  | 'under-evaluation'
  | 'supported'
  | 'not-supported'
  | 'inconclusive'
  | 'archived';

export const LIFECYCLE_ORDER: HypothesisLifecycle[] = [
  'draft',
  'needs-evidence',
  'testable',
  'under-evaluation',
  'supported',
  'not-supported',
  'inconclusive',
  'archived',
];

/** Allowed transitions. Anything else is refused with a reason. */
const TRANSITIONS: Record<HypothesisLifecycle, HypothesisLifecycle[]> = {
  draft: ['needs-evidence', 'testable', 'archived'],
  'needs-evidence': ['testable', 'draft', 'archived'],
  testable: ['under-evaluation', 'needs-evidence', 'archived'],
  'under-evaluation': ['supported', 'not-supported', 'inconclusive', 'testable', 'archived'],
  supported: ['under-evaluation', 'archived'],
  'not-supported': ['under-evaluation', 'archived'],
  inconclusive: ['under-evaluation', 'testable', 'archived'],
  archived: ['draft'],
};

export interface ResearchHypothesisFields {
  /** 1. The testable claim, one sentence, falsifiable. */
  statement: string;
  /** 2. Why someone would expect this. */
  rationale: string;
  /** 3. The theory or prior work it comes from. */
  theory: string;
  /** 4. Independent variables (ids from the project). */
  independentVariables: string[];
  /** 5. Dependent variables (ids from the project). */
  dependentVariables: string[];
  /** 6. Controls: what is held fixed or compared against. */
  controls: string[];
  /** 7. Assumptions that must hold for the test to mean anything. */
  assumptions: string[];
  /** 8. Predictions, each with the observation that would confirm it. */
  predictions: Array<{ prediction: string; expectedObservation: string; unit: string }>;
  /** 9. Methodology: how it will be tested, decided *before* looking. */
  methodology: string;
  /** 10. Datasets required (ids), with the variable each supplies. */
  datasets: Array<{ datasetId: string; variable: string }>;
  /** 11. Limitations the researcher already knows about. */
  limitations: string[];
  /** 12. Alternative explanations that would produce the same pattern. */
  alternativeExplanations: string[];
  /** 13. Falsification conditions: what result would refute the hypothesis. */
  falsificationConditions: string[];
}

export interface ResearchHypothesis extends ResearchHypothesisFields {
  schemaVersion: number;
  id: string;
  projectId: string;
  /** Set when this was derived from an engine-generated hypothesis. */
  sourceHypothesisId: string | null;
  lifecycle: HypothesisLifecycle;
  /** Why the current lifecycle state was chosen. */
  stateReason: string;
  createdAt: string;
  updatedAt: string;
  /** Previous states of the thirteen fields, newest last. */
  history: Array<{ at: string; contentHash: string; lifecycle: HypothesisLifecycle; note: string }>;
  /** The engine confidence is deliberately absent: a hypothesis has no probability. */
}

export const FIELD_LABELS: Record<keyof ResearchHypothesisFields, string> = {
  statement: 'Statement',
  rationale: 'Rationale',
  theory: 'Theory',
  independentVariables: 'Independent variables',
  dependentVariables: 'Dependent variables',
  controls: 'Controls',
  assumptions: 'Assumptions',
  predictions: 'Predictions',
  methodology: 'Methodology',
  datasets: 'Datasets',
  limitations: 'Limitations',
  alternativeExplanations: 'Alternative explanations',
  falsificationConditions: 'Falsification conditions',
};

export const FIELD_ORDER = Object.keys(FIELD_LABELS) as Array<keyof ResearchHypothesisFields>;

export function emptyFields(): ResearchHypothesisFields {
  return {
    statement: '',
    rationale: '',
    theory: '',
    independentVariables: [],
    dependentVariables: [],
    controls: [],
    assumptions: [],
    predictions: [],
    methodology: '',
    datasets: [],
    limitations: [],
    alternativeExplanations: [],
    falsificationConditions: [],
  };
}

export function createHypothesis(options: {
  projectId: string;
  fields?: Partial<ResearchHypothesisFields>;
  sourceHypothesisId?: string | null;
  lifecycle?: HypothesisLifecycle;
}): ResearchHypothesis {
  const now = new Date().toISOString();
  const fields = { ...emptyFields(), ...options.fields };
  return {
    schemaVersion: HYPOTHESIS_SCHEMA_VERSION,
    id: `hyp_${Math.random().toString(36).slice(2, 8)}`,
    projectId: options.projectId,
    sourceHypothesisId: options.sourceHypothesisId ?? null,
    lifecycle: options.lifecycle ?? 'draft',
    stateReason: 'Created as a draft: nothing has been tested yet.',
    createdAt: now,
    updatedAt: now,
    history: [],
    ...fields,
  };
}

/** Which of the thirteen fields are empty — used to gate the lifecycle. */
export function missingFields(hypothesis: ResearchHypothesis): Array<keyof ResearchHypothesisFields> {
  return FIELD_ORDER.filter((field) => {
    const value = hypothesis[field];
    if (Array.isArray(value)) return value.length === 0;
    return typeof value !== 'string' || value.trim().length === 0;
  });
}

export interface TransitionCheck {
  allowed: boolean;
  reason: string;
  /** Fields that must be filled before the target state is honest. */
  blockers: Array<keyof ResearchHypothesisFields>;
}

/**
 * The lifecycle is gated on content, not on clicks: a hypothesis with no
 * falsification conditions cannot become `testable`, and one with missing fields
 * cannot claim `supported`.
 */
export function canTransition(hypothesis: ResearchHypothesis, target: HypothesisLifecycle): TransitionCheck {
  if (target === hypothesis.lifecycle) {
    return { allowed: true, reason: 'Already in this state.', blockers: [] };
  }
  if (!TRANSITIONS[hypothesis.lifecycle].includes(target)) {
    return {
      allowed: false,
      reason: `Transition ${hypothesis.lifecycle} → ${target} is not part of the lifecycle. Allowed: ${TRANSITIONS[hypothesis.lifecycle].join(', ')}.`,
      blockers: [],
    };
  }
  const blockers: Array<keyof ResearchHypothesisFields> = [];
  if (target === 'testable') {
    if (!hypothesis.statement.trim()) blockers.push('statement');
    if (!hypothesis.methodology.trim()) blockers.push('methodology');
    if (hypothesis.falsificationConditions.length === 0) blockers.push('falsificationConditions');
    if (hypothesis.predictions.length === 0) blockers.push('predictions');
  }
  if (target === 'under-evaluation') {
    if (hypothesis.datasets.length === 0) blockers.push('datasets');
    if (!hypothesis.methodology.trim()) blockers.push('methodology');
  }
  if (target === 'supported' || target === 'not-supported' || target === 'inconclusive') {
    if (hypothesis.alternativeExplanations.length === 0) blockers.push('alternativeExplanations');
    if (hypothesis.limitations.length === 0) blockers.push('limitations');
    if (hypothesis.assumptions.length === 0) blockers.push('assumptions');
  }
  return {
    allowed: blockers.length === 0,
    reason:
      blockers.length === 0
        ? `Transition to ${target} is permitted.`
        : `Cannot move to ${target}: ${blockers.map((field) => FIELD_LABELS[field].toLowerCase()).join(', ')} must be filled in first.`,
    blockers,
  };
}

export function transition(
  hypothesis: ResearchHypothesis,
  target: HypothesisLifecycle,
  note: string,
): { hypothesis: ResearchHypothesis; check: TransitionCheck } {
  const check = canTransition(hypothesis, target);
  if (!check.allowed) return { hypothesis, check };
  const now = new Date().toISOString();
  return {
    hypothesis: {
      ...hypothesis,
      lifecycle: target,
      stateReason: note.trim() || check.reason,
      updatedAt: now,
      history: [
        ...hypothesis.history,
        {
          at: now,
          contentHash: hypothesisHash(hypothesis),
          lifecycle: target,
          note: note.trim() || check.reason,
        },
      ],
    },
    check,
  };
}

export function hypothesisHash(hypothesis: ResearchHypothesis): string {
  const { history: _history, updatedAt: _updatedAt, ...rest } = hypothesis;
  return contentHash(rest);
}

/** Edits fields, recording the pre-edit hash so the change is auditable. */
export function editFields(
  hypothesis: ResearchHypothesis,
  patch: Partial<ResearchHypothesisFields>,
  note = 'Fields edited.',
): ResearchHypothesis {
  const now = new Date().toISOString();
  return {
    ...hypothesis,
    ...patch,
    updatedAt: now,
    history: [
      ...hypothesis.history,
      { at: now, contentHash: hypothesisHash(hypothesis), lifecycle: hypothesis.lifecycle, note },
    ],
  };
}

/**
 * Builds a research hypothesis from an engine-generated one. The engine's
 * statement, alternatives and falsification criteria are carried over; the fields
 * the engine does not produce are left empty for the researcher to fill, and
 * nothing is invented to fill the gap.
 */
export function fromGenerated(options: {
  projectId: string;
  generated: {
    id: string;
    statement: string;
    explanation: string;
    independentVariables: string[];
    dependentVariables: string[];
    alternativeExplanations: string[];
    falsificationCriteria: string[];
    limitations: string[];
    expectedRelationship: { type: string; effectThreshold: number | null };
  };
}): ResearchHypothesis {
  const { generated } = options;
  return createHypothesis({
    projectId: options.projectId,
    sourceHypothesisId: generated.id,
    lifecycle: 'needs-evidence',
    fields: {
      statement: generated.statement,
      rationale: generated.explanation,
      independentVariables: [...generated.independentVariables],
      dependentVariables: [...generated.dependentVariables],
      alternativeExplanations: [...generated.alternativeExplanations],
      falsificationConditions: [...generated.falsificationCriteria],
      limitations: [...generated.limitations],
      controls: [],
      assumptions: [],
      predictions:
        generated.expectedRelationship.type === 'none'
          ? []
          : [
              {
                prediction: `A ${generated.expectedRelationship.type} relationship between the independent and dependent variable.`,
                expectedObservation: 'Measured relationship in the retrieved window',
                unit: 'dataset units',
              },
            ],
      methodology: '',
      datasets: [],
      theory: '',
    },
  });
}

/** States reachable from the current one, ignoring content gates. */
export function nextStates(hypothesis: ResearchHypothesis): HypothesisLifecycle[] {
  return TRANSITIONS[hypothesis.lifecycle].slice();
}

export interface ComparisonRow {
  field: keyof ResearchHypothesisFields;
  values: string[];
  same: boolean;
}

/**
 * Side-by-side comparison. This is what makes competing hypotheses useful: the
 * differences that matter are usually in methodology and falsification
 * conditions, not in the statements.
 */
export function compareHypotheses(hypotheses: ResearchHypothesis[]): ComparisonRow[] {
  const render = (value: ResearchHypothesisFields[keyof ResearchHypothesisFields]): string => {
    if (Array.isArray(value)) {
      return value
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          if (entry && typeof entry === 'object') {
            return Object.values(entry as Record<string, string>).filter(Boolean).join(' · ');
          }
          return String(entry);
        })
        .join(' | ');
    }
    return typeof value === 'string' ? value : String(value);
  };
  return FIELD_ORDER.map((field) => {
    const values = hypotheses.map((hypothesis) => render(hypothesis[field]));
    return {
      field,
      values,
      same: values.every((value) => value === values[0]),
    };
  });
}

/**
 * The single sentence the UI must show whenever a hypothesis is displayed.
 * Keeping it in one function stops it from drifting into a proof claim.
 */
export function lifecycleDisclosure(hypothesis: ResearchHypothesis): string {
  switch (hypothesis.lifecycle) {
    case 'supported':
      return 'Supported: the stated test produced a result consistent with this hypothesis under its stated assumptions. This is support, not proof, and not a discovery.';
    case 'not-supported':
      return 'Not supported: the stated test did not produce the predicted result. The hypothesis is not refuted universally — only under this test.';
    case 'inconclusive':
      return 'Inconclusive: the data could not separate this hypothesis from its alternatives.';
    case 'under-evaluation':
      return 'Under evaluation: a test is running or has run and the result is being interpreted. No conclusion is recorded yet.';
    case 'testable':
      return 'Testable: the statement, method and falsification conditions are complete, but no test has been run.';
    case 'needs-evidence':
      return 'Needs evidence: the hypothesis is stated but the evidence needed to test it has not been assembled.';
    case 'archived':
      return 'Archived: no longer active. Archived hypotheses are kept for the record.';
    default:
      return 'Draft: incomplete. A draft cannot be evaluated and makes no claim.';
  }
}
