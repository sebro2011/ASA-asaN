/**
 * Units, dimensions and error propagation.
 *
 * The Forge never converts a retrieved value silently. A conversion is a named
 * operation with a recorded factor, and an operation on incompatible dimensions
 * is an error rather than a number.
 *
 * Dimensions are the seven SI base quantities; angles are treated as
 * dimensionless (rad), which is the SI convention.
 */

import {
  ScienceInputError,
  assertFinite,
  buildReproducibility,
  hashValues,
  type ComputationResult,
} from './contracts';

export type Dimension =
  | 'length'
  | 'mass'
  | 'time'
  | 'temperature'
  | 'current'
  | 'amount'
  | 'luminous'
  | 'dimensionless';

/** A unit is `factor × baseUnit` with an optional offset (only °C/°F). */
export interface UnitDefinition {
  symbol: string;
  dimension: Dimension;
  /** Multiplier to the dimension's SI base unit. */
  factor: number;
  /** Added after scaling (temperature scales only). */
  offset?: number;
  aliases?: string[];
}

const UNIT_TABLE: UnitDefinition[] = [
  // length
  { symbol: 'm', dimension: 'length', factor: 1 },
  { symbol: 'km', dimension: 'length', factor: 1000 },
  { symbol: 'cm', dimension: 'length', factor: 0.01 },
  { symbol: 'mm', dimension: 'length', factor: 0.001 },
  { symbol: 'au', dimension: 'length', factor: 1.495978707e11 },
  { symbol: 'ly', dimension: 'length', factor: 9.4607304725808e15 },
  { symbol: 'pc', dimension: 'length', factor: 3.0856775814913673e16 },
  { symbol: 'R_sun', dimension: 'length', factor: 6.957e8 },
  { symbol: 'R_earth', dimension: 'length', factor: 6.371e6 },
  // mass
  { symbol: 'kg', dimension: 'mass', factor: 1 },
  { symbol: 'g', dimension: 'mass', factor: 0.001 },
  { symbol: 'M_sun', dimension: 'mass', factor: 1.98847e30 },
  { symbol: 'M_earth', dimension: 'mass', factor: 5.9722e24 },
  // time
  { symbol: 's', dimension: 'time', factor: 1 },
  { symbol: 'min', dimension: 'time', factor: 60 },
  { symbol: 'h', dimension: 'time', factor: 3600 },
  { symbol: 'day', dimension: 'time', factor: 86400, aliases: ['d'] },
  { symbol: 'yr', dimension: 'time', factor: 31557600, aliases: ['year', 'a'] },
  // temperature (offset scales handled explicitly)
  { symbol: 'K', dimension: 'temperature', factor: 1 },
  { symbol: 'degC', dimension: 'temperature', factor: 1, offset: 273.15, aliases: ['°C', 'C', 'celsius'] },
  // angle / ratios
  { symbol: 'rad', dimension: 'dimensionless', factor: 1 },
  { symbol: 'deg', dimension: 'dimensionless', factor: Math.PI / 180, aliases: ['°'] },
  { symbol: '1', dimension: 'dimensionless', factor: 1, aliases: ['', 'ratio', '%/100'] },
  { symbol: '%', dimension: 'dimensionless', factor: 0.01 },
  // derived / compound — declared with their own dimension so they cannot be
  // mixed with a base unit by accident.
  { symbol: 'm/s', dimension: 'length', factor: 1 },
  { symbol: 'km/s', dimension: 'length', factor: 1000 },
  { symbol: 'km/h', dimension: 'length', factor: 1000 / 3600 },
  { symbol: 'kg/m^3', dimension: 'mass', factor: 1 },
  { symbol: 'Pa', dimension: 'mass', factor: 1 },
  { symbol: 'J', dimension: 'mass', factor: 1 },
  { symbol: 'W', dimension: 'mass', factor: 1 },
  { symbol: 'Hz', dimension: 'time', factor: 1 },
  { symbol: 'mm/day', dimension: 'length', factor: 1 },
  { symbol: 'nT', dimension: 'mass', factor: 1 },
  { symbol: 'Kp', dimension: 'dimensionless', factor: 1 },
  { symbol: 'count', dimension: 'dimensionless', factor: 1, aliases: ['counts', 'events'] },
];

const UNITS = new Map<string, UnitDefinition>();
for (const unit of UNIT_TABLE) {
  UNITS.set(unit.symbol.toLowerCase(), unit);
  for (const alias of unit.aliases ?? []) UNITS.set(alias.toLowerCase(), unit);
}

export function findUnit(symbol: string): UnitDefinition | null {
  if (typeof symbol !== 'string') return null;
  return UNITS.get(symbol.trim().toLowerCase()) ?? null;
}

export function listUnits(): string[] {
  return UNIT_TABLE.map((unit) => unit.symbol);
}

/** Converts a value between units of the same dimension. Throws on mismatch. */
export function convert(value: number, from: string, to: string): number {
  const amount = assertFinite(value, 'value');
  const source = findUnit(from);
  const target = findUnit(to);
  if (!source) throw new ScienceInputError('UNKNOWN_UNIT', `Unknown unit "${from}".`);
  if (!target) throw new ScienceInputError('UNKNOWN_UNIT', `Unknown unit "${to}".`);
  if (source.dimension !== target.dimension) {
    throw new ScienceInputError(
      'UNIT_MISMATCH',
      `Cannot convert ${from} (${source.dimension}) to ${to} (${target.dimension}): incompatible dimensions.`,
    );
  }
  // to base, then to target, honouring temperature offsets.
  const base = amount * source.factor + (source.offset ?? 0);
  const result = (base - (target.offset ?? 0)) / target.factor;
  // Guard against returning -0 or float dust for exact conversions.
  return Math.abs(result) < 1e-12 ? 0 : result;
}

/** Converts a whole series, preserving nulls (never imputes). */
export function convertSeries(values: Array<number | null>, from: string, to: string): Array<number | null> {
  return values.map((value) => (value === null || !Number.isFinite(value) ? null : convert(value, from, to)));
}

export interface ConversionResult {
  values: Array<number | null>;
  from: string;
  to: string;
  factor: number;
  offset: number;
  dimension: Dimension;
}

export function conversionMetadata(from: string, to: string): ConversionResult {
  const source = findUnit(from);
  const target = findUnit(to);
  if (!source || !target) throw new ScienceInputError('UNKNOWN_UNIT', `Unknown unit in ${from} → ${to}.`);
  if (source.dimension !== target.dimension) {
    throw new ScienceInputError('UNIT_MISMATCH', `${from} and ${to} are not compatible.`);
  }
  return {
    values: [],
    from,
    to,
    factor: source.factor / target.factor,
    offset: (source.offset ?? 0) - (target.offset ?? 0),
    dimension: target.dimension,
  };
}

/**
 * First-order (linear) propagation: σ_f = sqrt( Σ (∂f/∂xᵢ · σᵢ)² ).
 * The partial derivatives are supplied by the caller because only it knows the
 * formula; this function only does the quadrature, and says so in the record.
 */
export function propagateUncertainty(
  terms: Array<{ name: string; derivative: number; sigma: number }>,
): ComputationResult {
  if (!Array.isArray(terms) || terms.length === 0) {
    throw new ScienceInputError('INVALID_PARAMETER', 'Uncertainty propagation needs at least one term.');
  }
  for (const term of terms) {
    assertFinite(term.derivative, `derivative(${term.name})`);
    if (assertFinite(term.sigma, `sigma(${term.name})`) < 0) {
      throw new ScienceInputError('INVALID_PARAMETER', `sigma(${term.name}) cannot be negative.`);
    }
  }
  const variance = terms.reduce((total, term) => total + (term.derivative * term.sigma) ** 2, 0);
  const sigma = Math.sqrt(variance);
  const assumptions = [
    'Inputs are independent (no covariance term is included).',
    'Uncertainties are small enough for the first-order Taylor expansion to hold.',
    'Each σ is a standard uncertainty (1σ), not a 95 % interval.',
  ];
  return {
    id: 'uncertainty-linear',
    kind: 'uncertainty',
    claim: 'computed',
    value: sigma,
    unit: 'combined',
    uncertainty: null,
    interval: null,
    sampleSize: terms.length,
    assumptions,
    limitations: [
      'Correlated inputs require the full covariance matrix; that is not supported here.',
      'For large relative uncertainties the linear approximation underestimates σ — use Monte Carlo.',
    ],
    skipped: false,
    reproducibility: buildReproducibility(
      'First-order uncertainty propagation',
      'σ_f = √( Σ (∂f/∂xᵢ · σᵢ)² )',
      terms.map((term) => ({
        name: term.name,
        unit: 'input',
        count: 1,
        hash: hashValues([term.derivative, term.sigma]),
      })),
      { terms: terms.length },
      assumptions,
      'All supplied terms used; no values dropped.',
      terms.length,
      null,
    ),
  };
}

/** mulberry32 — small, fast, fully deterministic given a seed. */
export function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Monte Carlo propagation. The seed is part of the record, so the same inputs
 * reproduce the same estimate exactly.
 */
export function propagateUncertaintyMonteCarlo(options: {
  model: (inputs: Record<string, number>) => number;
  inputs: Array<{ name: string; mean: number; sigma: number; distribution?: 'normal' | 'uniform' }>;
  draws?: number;
  seed?: number;
}): ComputationResult & { quantiles: { p2_5: number; p50: number; p97_5: number } } {
  const { model, inputs } = options;
  const draws = Math.max(100, Math.min(200_000, Math.round(options.draws ?? 10_000)));
  const seed = options.seed ?? 20240512;
  const rng = makeRng(seed);

  const samples: number[] = [];
  for (let index = 0; index < draws; index += 1) {
    const drawn: Record<string, number> = {};
    for (const input of inputs) {
      const mean = assertFinite(input.mean, input.name);
      const sigma = assertFinite(input.sigma, input.name);
      if (sigma < 0) throw new ScienceInputError('INVALID_PARAMETER', `sigma(${input.name}) cannot be negative.`);
      if ((input.distribution ?? 'normal') === 'uniform') {
        const half = sigma * Math.sqrt(3);
        drawn[input.name] = mean + (rng() * 2 - 1) * half;
      } else {
        // Box–Muller, deterministic from the seeded stream.
        const u1 = Math.max(rng(), Number.EPSILON);
        const u2 = rng();
        drawn[input.name] = mean + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      }
    }
    const value = model(drawn);
    if (Number.isFinite(value)) samples.push(value);
  }
  if (samples.length === 0) {
    throw new ScienceInputError('INVALID_PARAMETER', 'The model produced no finite values.');
  }
  samples.sort((a, b) => a - b);
  const quantile = (p: number) => samples[Math.min(samples.length - 1, Math.max(0, Math.round((samples.length - 1) * p)))];
  const mean = samples.reduce((total, value) => total + value, 0) / samples.length;
  const sigma = Math.sqrt(samples.reduce((total, value) => total + (value - mean) ** 2, 0) / (samples.length - 1));

  const assumptions = [
    'Input distributions are independent.',
    `Normal inputs are sampled by Box–Muller; uniform inputs use ±σ√3.`,
    `Monte Carlo with ${samples.length} draws and a fixed seed.`,
  ];
  return {
    id: 'uncertainty-monte-carlo',
    kind: 'uncertainty',
    claim: 'computed',
    value: mean,
    unit: 'combined',
    uncertainty: sigma,
    interval: [quantile(0.025), quantile(0.975)],
    quantiles: { p2_5: quantile(0.025), p50: quantile(0.5), p97_5: quantile(0.975) },
    sampleSize: samples.length,
    assumptions,
    limitations: [
      'The output distribution is whatever the model and input distributions produce; it is not assumed normal.',
      'Monte Carlo error decreases as 1/√N; a different seed gives a slightly different estimate.',
    ],
    skipped: false,
    reproducibility: buildReproducibility(
      'Monte Carlo uncertainty propagation',
      'For i in 1..N: draw inputs from their distributions, evaluate the model, summarise the output quantiles',
      inputs.map((input) => ({
        name: input.name,
        unit: 'input',
        count: 1,
        hash: hashValues([input.mean, input.sigma]),
      })),
      { draws: samples.length, seed, distributions: inputs.map((input) => input.distribution ?? 'normal').join(',') },
      assumptions,
      'Every draw that produced a non-finite value was discarded.',
      samples.length,
      seed,
    ),
  };
}
