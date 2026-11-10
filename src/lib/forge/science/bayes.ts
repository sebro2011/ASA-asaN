/**
 * Bayesian updating, priors and model comparison.
 *
 * Everything here is closed-form conjugate updating: the prior, the likelihood
 * and the posterior are all printed, so a reader can see exactly how a belief
 * moved. There is no "AI confidence" anywhere — a posterior is a probability
 * under stated assumptions, not a measure of how sure a model feels.
 */

import {
  ScienceInputError,
  assertFinite,
  buildReproducibility,
  cleanValues,
  hashValues,
  type ComputationResult,
} from './contracts';

/* ------------------------- normal–normal updating ------------------------ */

export interface NormalPosterior {
  priorMean: number;
  priorSd: number;
  /** Posterior over the *mean* of the sampled population. */
  posteriorMean: number;
  posteriorSd: number;
  /** 95 % credible interval of the posterior mean. */
  credibleInterval: [number, number];
  n: number;
  observedMean: number;
  observedSd: number;
  /** Shrinkage of the posterior mean towards the prior, 0…1. */
  weightOnData: number;
}

/**
 * Conjugate normal–normal update with known sampling standard deviation σ.
 *
 *   prior:      μ ~ N(μ₀, σ₀²)
 *   likelihood: x̄ ~ N(μ, σ²/n)
 *   posterior:  precision-weighted mean of μ₀ and x̄
 */
export function normalNormalUpdate(
  values: Array<number | null>,
  options: {
    priorMean: number;
    priorSd: number;
    /** Known observation standard deviation; the sample sd is used when omitted. */
    knownSd?: number;
    unit: string;
    label?: string;
  },
): ComputationResult<NormalPosterior> {
  const label = options.label ?? 'series';
  const { values: clean, dropped, policy } = cleanValues(values, label);
  const priorMean = assertFinite(options.priorMean, 'priorMean');
  const priorSd = assertFinite(options.priorSd, 'priorSd');
  if (priorSd <= 0) throw new ScienceInputError('INVALID_PARAMETER', 'The prior standard deviation must be positive.');
  const n = clean.length;
  if (n < 2) throw new ScienceInputError('INSUFFICIENT_SAMPLE', 'At least 2 observations are required to update a mean.');

  const observedMean = clean.reduce((total, value) => total + value, 0) / n;
  const observedSd =
    options.knownSd ??
    Math.sqrt(clean.reduce((total, value) => total + (value - observedMean) ** 2, 0) / (n - 1));
  if (!(observedSd > 0)) {
    throw new ScienceInputError('INVALID_PARAMETER', 'The observation standard deviation must be positive.');
  }

  const priorPrecision = 1 / priorSd ** 2;
  const dataPrecision = n / observedSd ** 2;
  const posteriorPrecision = priorPrecision + dataPrecision;
  const posteriorMean = (priorPrecision * priorMean + dataPrecision * observedMean) / posteriorPrecision;
  const posteriorSd = Math.sqrt(1 / posteriorPrecision);
  const weightOnData = dataPrecision / posteriorPrecision;

  const assumptions = [
    `Prior: μ ~ Normal(${priorMean}, ${priorSd}²) in ${options.unit}, chosen by the researcher — it is an assumption, not a measurement.`,
    `Likelihood: the ${n} observations are independent and normal with standard deviation ${observedSd.toPrecision(4)} ${options.unit}${options.knownSd ? ' (supplied)' : ' (estimated from the sample)'}.`,
    'The posterior is the exact conjugate result, not a sample approximation.',
  ];
  return {
    id: `bayes-normal:${label}`,
    kind: 'bayesian',
    claim: 'statistical',
    value: {
      priorMean,
      priorSd,
      posteriorMean,
      posteriorSd,
      credibleInterval: [posteriorMean - 1.959963984540054 * posteriorSd, posteriorMean + 1.959963984540054 * posteriorSd],
      n,
      observedMean,
      observedSd,
      weightOnData,
    },
    unit: options.unit,
    uncertainty: posteriorSd,
    interval: [posteriorMean - 1.959963984540054 * posteriorSd, posteriorMean + 1.959963984540054 * posteriorSd],
    sampleSize: n,
    assumptions,
    limitations: [
      'A credible interval is a statement about the parameter given the prior and the model — change the prior and it changes.',
      'Observations are treated as independent; autocorrelated series overstate the information content.',
      dropped > 0 ? `${dropped} missing value(s) excluded — if not missing at random, the posterior is biased.` : '',
    ].filter(Boolean),
    skipped: false,
    reproducibility: buildReproducibility(
      'Conjugate normal–normal update',
      '1/σ_post² = 1/σ₀² + n/σ² · μ_post = σ_post²(μ₀/σ₀² + n·x̄/σ²)',
      [{ name: label, unit: options.unit, count: n, hash: hashValues(values) }],
      { priorMean, priorSd, knownSd: options.knownSd ?? null, n },
      assumptions,
      policy,
      n,
      null,
    ),
  };
}

/** How much the posterior mean depends on the prior width. */
export function priorSensitivity(
  values: Array<number | null>,
  options: { priorMeans: number[]; priorSds: number[]; unit: string; label?: string },
): ComputationResult<Array<{ priorMean: number; priorSd: number; posteriorMean: number; weightOnData: number }>> {
  const results = [] as Array<{ priorMean: number; priorSd: number; posteriorMean: number; weightOnData: number }>;
  for (const priorMean of options.priorMeans) {
    for (const priorSd of options.priorSds) {
      const update = normalNormalUpdate(values, {
        priorMean,
        priorSd,
        unit: options.unit,
        label: options.label,
      });
      results.push({
        priorMean,
        priorSd,
        posteriorMean: update.value.posteriorMean,
        weightOnData: update.value.weightOnData,
      });
    }
  }
  const spread =
    results.length > 0
      ? Math.max(...results.map((entry) => entry.posteriorMean)) - Math.min(...results.map((entry) => entry.posteriorMean))
      : 0;
  return {
    id: 'bayes-prior-sensitivity',
    kind: 'sensitivity',
    claim: 'statistical',
    value: results,
    unit: options.unit,
    uncertainty: null,
    interval: null,
    sampleSize: results.length,
    assumptions: [
      'The same likelihood is used for every prior in the grid.',
      'Priors are varied only in location and width; the family stays normal.',
    ],
    limitations: [
      `The posterior mean moves by ${spread.toPrecision(3)} ${options.unit} across this grid.`,
      'A large movement means the data alone do not determine the answer; report the range, not one number.',
    ],
    skipped: results.length === 0,
    skipReason: results.length === 0 ? 'No prior grid was supplied.' : undefined,
    reproducibility: buildReproducibility(
      'Prior sensitivity sweep',
      'Posterior mean across a grid of normal priors',
      [{ name: options.label ?? 'series', unit: options.unit, count: values.length, hash: hashValues(values) }],
      { priorMeans: options.priorMeans.join(','), priorSds: options.priorSds.join(','), cells: results.length },
      ['Every cell reuses the identical data.'],
      'Listwise deletion via the underlying update.',
      values.length,
      null,
    ),
  };
}

/* -------------------------- beta–binomial updating ----------------------- */

export interface BetaPosterior {
  priorAlpha: number;
  priorBeta: number;
  posteriorAlpha: number;
  posteriorBeta: number;
  posteriorMean: number;
  credibleInterval: [number, number];
  successes: number;
  trials: number;
}

/** Quantile of Beta(a,b) by bisection on the regularised incomplete beta. */
function betaQuantile(a: number, b: number, p: number): number {
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 90; iteration += 1) {
    const mid = (low + high) / 2;
    if (betaCdf(a, b, mid) < p) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function logGamma(value: number): number {
  const coefficients = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2,
    -0.5395239384953e-5,
  ];
  let y = value;
  const x = value;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const coefficient of coefficients) {
    y += 1;
    ser += coefficient / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const eps = 3e-12;
  const fpMin = 1e-300;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpMin) d = fpMin;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < eps) break;
  }
  return h;
}

function betaCdf(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    Math.log(x) * a + Math.log(1 - x) * b + logGamma(a + b) - logGamma(a) - logGamma(b),
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Conjugate Beta–Binomial update for a proportion. */
export function betaBinomialUpdate(options: {
  successes: number;
  trials: number;
  priorAlpha?: number;
  priorBeta?: number;
  unit?: string;
}): ComputationResult<BetaPosterior> {
  const successes = assertFinite(options.successes, 'successes');
  const trials = assertFinite(options.trials, 'trials');
  if (successes < 0 || trials < 0) throw new ScienceInputError('INVALID_PARAMETER', 'Counts cannot be negative.');
  if (successes > trials) throw new ScienceInputError('INVALID_PARAMETER', 'successes cannot exceed trials.');
  const priorAlpha = assertFinite(options.priorAlpha ?? 1, 'priorAlpha');
  const priorBeta = assertFinite(options.priorBeta ?? 1, 'priorBeta');
  if (priorAlpha <= 0 || priorBeta <= 0) throw new ScienceInputError('INVALID_PARAMETER', 'Beta parameters must be positive.');

  const posteriorAlpha = priorAlpha + successes;
  const posteriorBeta = priorBeta + (trials - successes);
  const posteriorMean = posteriorAlpha / (posteriorAlpha + posteriorBeta);
  const assumptions = [
    `Prior: p ~ Beta(${priorAlpha}, ${priorBeta})${priorAlpha === 1 && priorBeta === 1 ? ' (uniform: no prior information)' : ''}.`,
    'Trials are independent and each has the same probability p.',
  ];
  return {
    id: 'bayes-beta-binomial',
    kind: 'bayesian',
    claim: 'statistical',
    value: {
      priorAlpha,
      priorBeta,
      posteriorAlpha,
      posteriorBeta,
      posteriorMean,
      credibleInterval: [betaQuantile(posteriorAlpha, posteriorBeta, 0.025), betaQuantile(posteriorAlpha, posteriorBeta, 0.975)],
      successes,
      trials,
    },
    unit: options.unit ?? 'dimensionless',
    uncertainty: Math.sqrt(
      (posteriorAlpha * posteriorBeta) /
        ((posteriorAlpha + posteriorBeta) ** 2 * (posteriorAlpha + posteriorBeta + 1)),
    ),
    interval: [betaQuantile(posteriorAlpha, posteriorBeta, 0.025), betaQuantile(posteriorAlpha, posteriorBeta, 0.975)],
    sampleSize: trials,
    assumptions,
    limitations: [
      'Independence between trials is assumed; clustered or duplicated events violate it.',
      'A wide credible interval at small n is the honest answer — it is not a reason to add pseudocounts.',
      'The prior contributes information; report it alongside the result.',
    ],
    skipped: false,
    reproducibility: buildReproducibility(
      'Conjugate Beta–Binomial update',
      'p | k ~ Beta(α₀ + k, β₀ + n − k)',
      [{ name: 'counts', unit: 'dimensionless', count: trials, hash: hashValues([successes, trials]) }],
      { successes, trials, priorAlpha, priorBeta },
      assumptions,
      'No trials were discarded or reweighted.',
      trials,
      null,
    ),
  };
}

/* --------------------------- model comparison ---------------------------- */

/**
 * Bayes factor between two simple hypotheses using their marginal likelihoods
 * under normal likelihoods with known σ. Reported with the Jeffreys scale
 * wording, which is a convention — not a discovery claim.
 */
export function bayesFactor(options: {
  observedMean: number;
  n: number;
  knownSd: number;
  modelA: { mean: number };
  modelB: { mean: number };
  unit?: string;
}): ComputationResult<{ log10BayesFactor: number; interpretation: string }> {
  const { observedMean, n, knownSd, modelA, modelB } = options;
  assertFinite(observedMean, 'observedMean');
  if (!(n > 0)) throw new ScienceInputError('INSUFFICIENT_SAMPLE', 'n must be positive.');
  if (!(knownSd > 0)) throw new ScienceInputError('INVALID_PARAMETER', 'knownSd must be positive.');
  const se = knownSd / Math.sqrt(n);
  const logLikelihood = (mu: number) => -0.5 * ((observedMean - mu) / se) ** 2;
  const log10 = (logLikelihood(modelA.mean) - logLikelihood(modelB.mean)) / Math.LN10;
  const magnitude = Math.abs(log10);
  const interpretation =
    magnitude < 0.5
      ? 'Barely worth mentioning: the data do not separate the two hypotheses.'
      : magnitude < 1
        ? 'Weak evidence.'
        : magnitude < 2
          ? 'Moderate evidence.'
          : magnitude < 3
            ? 'Strong evidence.'
            : 'Very strong evidence — still conditional on both models being the only candidates.';
  return {
    id: 'bayes-factor',
    kind: 'bayesian',
    claim: 'statistical',
    value: { log10BayesFactor: log10, interpretation },
    unit: options.unit ?? 'dimensionless',
    uncertainty: null,
    interval: null,
    sampleSize: n,
    assumptions: [
      'Two simple, fixed-mean hypotheses are compared — not a full model space.',
      `Likelihood: normal with known σ (${knownSd}) and n = ${n}.`,
      'The prior odds between the two hypotheses are equal (1:1).',
    ],
    limitations: [
      'A Bayes factor is relative: it says how the data shift the balance between these two, not whether either is true.',
      'Choosing the hypotheses after seeing the data invalidates the number.',
    ],
    skipped: false,
    reproducibility: buildReproducibility(
      'Bayes factor for two fixed-mean hypotheses',
      'log₁₀BF₁₀ = (lnL(model A) − lnL(model B))/ln 10 with lnL = −½((x̄−μ)/(σ/√n))²',
      [{ name: 'observed mean', unit: options.unit ?? 'dimensionless', count: n, hash: hashValues([observedMean, n, knownSd]) }],
      { modelAMean: modelA.mean, modelBMean: modelB.mean, n, knownSd },
      ['Fixed, pre-specified hypotheses.', 'Known sampling standard deviation.'],
      'Not applicable: no raw observations are used.',
      n,
      null,
    ),
  };
}
