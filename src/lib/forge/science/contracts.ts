/**
 * NOVA HYPOTHESIS FORGE — deterministic scientific computing contracts.
 *
 * Every computation in this folder returns the same envelope, so a result can
 * always be audited: what went in, in which units, by which method, under which
 * assumptions, with which missing-value policy, at which software version.
 *
 * Two rules are enforced by these types rather than by convention:
 *
 *  1. A number without a unit is not a scientific quantity. Inputs and outputs
 *     carry their unit; conversions are explicit and recorded.
 *  2. An AI model may never fill in a value here. These functions take numbers
 *     and return numbers; no provider is reachable from this module tree.
 */

/** Bumped when a formula, default or numerical method changes its results. */
export const SCIENCE_ENGINE_VERSION = 'nova-science/1.0.0';

export type MethodKind =
  | 'descriptive'
  | 'correlation'
  | 'regression'
  | 'hypothesis-test'
  | 'uncertainty'
  | 'sensitivity'
  | 'outlier'
  | 'model-comparison'
  | 'bayesian'
  | 'simulation'
  | 'discovery';

/** What a statement is allowed to claim. Ordered from weakest to strongest. */
export type ClaimLevel =
  | 'observed'          // a value that was retrieved, restated
  | 'computed'          // arithmetic on retrieved values
  | 'statistical'       // inference with a stated uncertainty
  | 'model-prediction'  // output of a stated model
  | 'suggestion'        // an idea worth testing — never a finding
  | 'verified';         // independently reproduced; only set by an explicit check

export interface ReproducibilityRecord {
  engineVersion: string;
  method: string;
  /** Human-readable formula or algorithm actually executed. */
  formula: string;
  /** Inputs exactly as used (already converted), with units. */
  inputs: Array<{ name: string; unit: string; count: number; hash: string }>;
  parameters: Record<string, string | number | boolean | null>;
  assumptions: string[];
  missingValuePolicy: string;
  sampleSize: number;
  /** Seed for any stochastic method; null for deterministic methods. */
  seed: number | null;
  computedAt: string;
}

export interface Quantity {
  value: number;
  unit: string;
}

export interface ComputationResult<T = number> {
  /** Stable id of this computation within its run. */
  id: string;
  kind: MethodKind;
  /** What the output is allowed to claim. */
  claim: ClaimLevel;
  /** The headline value(s). Never a string that looks like a number. */
  value: T;
  unit: string;
  /** Standard uncertainty of the headline value, in `unit`; null when N/A. */
  uncertainty: number | null;
  /** 95 % interval when a calibrated method produced one. */
  interval: [number, number] | null;
  sampleSize: number;
  assumptions: string[];
  limitations: string[];
  /** True when the method could not run; `value` is then never read. */
  skipped: boolean;
  skipReason?: string;
  reproducibility: ReproducibilityRecord;
}

export class ScienceInputError extends Error {
  readonly code:
    | 'INVALID_NUMBER'
    | 'EMPTY_DATASET'
    | 'UNIT_MISMATCH'
    | 'UNKNOWN_UNIT'
    | 'INSUFFICIENT_SAMPLE'
    | 'INVALID_PARAMETER';

  constructor(code: ScienceInputError['code'], message: string) {
    super(message);
    this.name = 'ScienceInputError';
    this.code = code;
  }
}

/** FNV-1a over the numeric values — identifies an input vector exactly. */
export function hashValues(values: Array<number | null>): string {
  let hash = 0x811c9dc5;
  const text = values.map((value) => (value === null || Number.isNaN(value) ? 'null' : String(value))).join(',');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function assertFinite(value: unknown, name: string): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new ScienceInputError('INVALID_NUMBER', `${name} must be a finite number (received ${String(value)}).`);
  }
  return number;
}

/** Drops null/NaN entries, recording how many were dropped. */
export function cleanValues(values: Array<number | null | undefined>, name = 'dataset'): {
  values: number[];
  dropped: number;
  policy: string;
} {
  if (!Array.isArray(values)) {
    throw new ScienceInputError('EMPTY_DATASET', `${name} must be an array of numbers.`);
  }
  const cleaned: number[] = [];
  let dropped = 0;
  for (const value of values) {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      dropped += 1;
      continue;
    }
    cleaned.push(value as number);
  }
  if (cleaned.length === 0) {
    throw new ScienceInputError('EMPTY_DATASET', `${name} contains no usable numeric values.`);
  }
  return {
    values: cleaned,
    dropped,
    policy:
      dropped === 0
        ? 'No missing values: every retained observation was used.'
        : `Listwise deletion: ${dropped} missing value(s) excluded from every statistic; no imputation, no interpolation.`,
  };
}

export function buildReproducibility(
  method: string,
  formula: string,
  inputs: ReproducibilityRecord['inputs'],
  parameters: ReproducibilityRecord['parameters'],
  assumptions: string[],
  missingValuePolicy: string,
  sampleSize: number,
  seed: number | null,
): ReproducibilityRecord {
  return {
    engineVersion: SCIENCE_ENGINE_VERSION,
    method,
    formula,
    inputs,
    parameters,
    assumptions,
    missingValuePolicy,
    sampleSize,
    seed,
    computedAt: new Date().toISOString(),
  };
}
