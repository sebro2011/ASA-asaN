/**
 * Discovery intelligence — pattern *candidates*, never discoveries.
 *
 * The engine scans a retrieved series for structures a researcher should look
 * at: anomalies, gaps, a monotonic trend, and lagged associations. Every output
 * is labelled with what it is:
 *
 *   observed pattern      → something visible in the numbers
 *   statistical finding   → a number with an uncertainty attached
 *   model prediction      → produced by a stated model
 *   suggestion            → worth testing; not a result
 *   verified discovery    → only after independent reproduction (never set here)
 *
 * The engine cannot return "verified". That gate is deliberate: it is the only
 * place in the Forge where a stronger claim than "candidate" is possible, and it
 * requires a human to record the reproduction.
 */

import {
  buildReproducibility,
  cleanValues,
  hashValues,
  type ClaimLevel,
  type ComputationResult,
} from './contracts';
import { detectOutliers } from './stats';

export interface DiscoveryCandidate {
  id: string;
  kind: 'anomaly' | 'gap' | 'trend' | 'association' | 'periodicity-scan';
  claim: ClaimLevel;
  title: string;
  /** Plain-language statement of exactly what was observed. */
  statement: string;
  /** What would be needed before this could be called a finding. */
  verificationRequired: string;
  score: number;
  evidence: Record<string, number | string>;
  /** True only when a human recorded an independent reproduction. */
  verified: boolean;
}

export interface DiscoveryScan {
  candidates: DiscoveryCandidate[];
  summary: string;
  /** Methods that were attempted but are not valid for this input. */
  notRun: Array<{ method: string; reason: string }>;
}

/** Mann–Kendall trend test (tie-corrected variance), the standard monotonic test. */
export function mannKendall(values: number[]): { s: number; z: number; pValue: number; tau: number } {
  const n = values.length;
  let s = 0;
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      s += Math.sign(values[j] - values[i]);
    }
  }
  // Tie correction
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let tieTerm = 0;
  for (const count of counts.values()) tieTerm += count * (count - 1) * (2 * count + 5);
  const variance = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  const z = variance > 0 ? (s > 0 ? (s - 1) / Math.sqrt(variance) : s < 0 ? (s + 1) / Math.sqrt(variance) : 0) : 0;
  // Normal approximation for the two-sided p-value (valid for n ≥ 8).
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const pairs = (n * (n - 1)) / 2;
  const tau = pairs > 0 ? s / pairs : 0;
  return { s, z, pValue, tau };
}

function normalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26 — adequate for a screening test.
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

const MIN_CANDIDATES = 0;
void MIN_CANDIDATES;

/**
 * Scans one retrieved series. `times` is optional; when present, gaps are
 * measured in the series' own cadence.
 */
export function scanSeries(options: {
  values: Array<number | null>;
  times?: Array<number | null>;
  unit: string;
  label: string;
  /** Maximum lag examined for associations (in samples). */
  maxLag?: number;
}): ComputationResult<DiscoveryScan> {
  const { values: clean, dropped, policy } = cleanValues(options.values, options.label);
  const candidates: DiscoveryCandidate[] = [];
  const notRun: Array<{ method: string; reason: string }> = [];
  const n = clean.length;

  /* ------------------------------- anomalies ------------------------------ */
  if (n >= 4) {
    const outliers = detectOutliers(clean, options.unit, options.label);
    if (!outliers.skipped && outliers.value.indices.length > 0) {
      candidates.push({
        id: 'anomaly:robust',
        kind: 'anomaly',
        claim: 'observed',
        title: `${outliers.value.indices.length} point(s) far from the median`,
        statement: `${outliers.value.indices.length} observation(s) exceed a modified z-score of 3.5 relative to the series median (${outliers.value.centre.toPrecision(5)} ${options.unit}).`,
        verificationRequired:
          'Check the instrument, calibration and quality flags for those timestamps before treating them as unusual events. An outlier is often a recording fault.',
        score: Math.min(1, outliers.value.indices.length / Math.max(1, n)),
        evidence: {
          flagged: outliers.value.indices.length,
          threshold: outliers.value.threshold,
          median: outliers.value.centre,
          scale: outliers.value.scale,
        },
        verified: false,
      });
    }
  } else {
    notRun.push({ method: 'Robust anomaly detection', reason: `n=${n} is below the minimum of 4.` });
  }

  /* --------------------------------- gaps -------------------------------- */
  if (options.times && options.times.length > 2) {
    const times = options.times.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (times.length > 2) {
      const differences = times.slice(1).map((value, index) => value - times[index]).filter((delta) => delta > 0);
      if (differences.length > 0) {
        const sorted = [...differences].sort((a, b) => a - b);
        const medianGap = sorted[Math.floor(sorted.length / 2)];
        const bigGaps = differences.filter((delta) => medianGap > 0 && delta > 1.5 * medianGap);
        if (bigGaps.length > 0) {
          candidates.push({
            id: 'gap:cadence',
            kind: 'gap',
            claim: 'observed',
            title: `${bigGaps.length} gap(s) in the sampling cadence`,
            statement: `${bigGaps.length} interval(s) are more than 1.5× the median cadence (${medianGap.toPrecision(4)}). Missing intervals can create apparent trends.`,
            verificationRequired:
              'Confirm the gaps are missing data rather than a change of instrument resolution, then state the gap explicitly in any trend claim.',
            score: Math.min(1, bigGaps.length / Math.max(1, differences.length)),
            evidence: {
              medianGap,
              largestGap: Math.max(...differences),
              gaps: bigGaps.length,
            },
            verified: false,
          });
        }
      }
    }
  } else {
    notRun.push({ method: 'Sampling-gap detection', reason: 'No usable timestamps were supplied with this series.' });
  }

  /* --------------------------------- trend -------------------------------- */
  if (n >= 8) {
    const trend = mannKendall(clean);
    if (trend.pValue < 0.05) {
      const direction = trend.tau > 0 ? 'increasing' : 'decreasing';
      candidates.push({
        id: 'trend:mann-kendall',
        kind: 'trend',
        claim: 'statistical',
        title: `Monotonic ${direction} trend`,
        statement: `Mann–Kendall S=${trend.s}, τ=${trend.tau.toFixed(3)}, z=${trend.z.toFixed(2)}, p=${trend.pValue.toExponential(2)} — the series is ${direction} more often than expected by chance within this window.`,
        verificationRequired:
          'A monotonic tendency is not a rate or a mechanism. Re-estimate on an independent window and report the trend with its time range; autocorrelation inflates significance.',
        score: Math.min(1, Math.abs(trend.z) / 4),
        evidence: { tau: trend.tau, z: trend.z, p: trend.pValue, s: trend.s },
        verified: false,
      });
    } else {
      notRun.push({
        method: 'Monotonic trend (Mann–Kendall)',
        reason: `No monotonic tendency at p<0.05 (p=${trend.pValue.toFixed(3)}).`,
      });
    }
  } else {
    notRun.push({ method: 'Monotonic trend (Mann–Kendall)', reason: `n=${n} is below the minimum of 8.` });
  }

  /* ------------------------------ periodicity ----------------------------- */
  if (n >= 32) {
    // A coarse autocorrelation scan: reports the strongest lag, not a period.
    const m = clean.reduce((total, value) => total + value, 0) / n;
    const centred = clean.map((value) => value - m);
    const denominator = centred.reduce((total, value) => total + value * value, 0);
    const maxLag = Math.min(options.maxLag ?? Math.floor(n / 3), Math.floor(n / 3), 64);
    let bestLag = 0;
    let bestCorrelation = 0;
    for (let lag = 1; lag <= maxLag; lag += 1) {
      let numerator = 0;
      for (let index = 0; index + lag < n; index += 1) numerator += centred[index] * centred[index + lag];
      const correlation = denominator > 0 ? numerator / denominator : 0;
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }
    if (bestLag > 1 && bestCorrelation > 0.3) {
      candidates.push({
        id: 'periodicity:autocorrelation',
        kind: 'periodicity-scan',
        claim: 'observed',
        title: `Repeating structure near lag ${bestLag}`,
        statement: `The strongest positive autocorrelation is at lag ${bestLag} samples (r=${bestCorrelation.toFixed(3)}). This is a screening result on ${maxLag} lags — one of them being high is partly expected by chance.`,
        verificationRequired:
          'A lag peak is not a physical period. Confirm with a dedicated periodogram, check the window against the sample rate, and account for the number of lags tested.',
        score: bestCorrelation,
        evidence: { lag: bestLag, correlation: bestCorrelation, lagsTested: maxLag },
        verified: false,
      });
    } else {
      notRun.push({ method: 'Periodicity screening', reason: 'No autocorrelation above 0.3 at a lag greater than 1.' });
    }
  } else {
    notRun.push({ method: 'Periodicity screening', reason: `n=${n} is below the minimum of 32.` });
  }

  candidates.sort((a, b) => b.score - a.score);

  const summary =
    candidates.length === 0
      ? `No candidate structures passed the screening thresholds for ${options.label}. That is a valid outcome: it means the series in this window shows no obvious anomaly, gap, monotonic trend or repeating structure.`
      : `${candidates.length} candidate structure(s) in ${options.label}. All are labelled by claim level: none is a discovery, and each states what verification would require.`;

  return {
    id: `discovery:${options.label}`,
    kind: 'discovery',
    claim: 'observed',
    value: { candidates, summary, notRun },
    unit: options.unit,
    uncertainty: null,
    interval: null,
    sampleSize: n,
    assumptions: [
      'Screening thresholds are conventions (3.5 modified z-score, p<0.05 Mann–Kendall, r>0.3 autocorrelation), not natural laws.',
      'The series is analysed as retrieved; no smoothing, detrending or gap filling is applied.',
      'Independence is assumed by the trend test; autocorrelated series overstate significance.',
    ],
    limitations: [
      'Multiple screening tests were run, so a single marginal result is expected by chance.',
      'Absence of a candidate is not absence of a phenomenon — the sampling window may simply be too short.',
      'No candidate may be described as a discovery until it has been independently reproduced and the reproduction is recorded.',
    ],
    skipped: n === 0,
    reproducibility: buildReproducibility(
      'Pattern screening (robust anomalies, cadence gaps, Mann–Kendall, autocorrelation)',
      'Modified z-score > 3.5 · gap > 1.5× median cadence · Mann–Kendall p<0.05 · max autocorrelation over lags 1…n/3',
      [{ name: options.label, unit: options.unit, count: n, hash: hashValues(options.values) }],
      { maxLag: options.maxLag ?? null, testsRun: 4, dropped },
      [
        'Screening only: no model is fitted and no causal statement is made.',
        'Timestamps are used only for cadence; values are assumed ordered by time.',
      ],
      policy,
      n,
      null,
    ),
  };
}

/**
 * Verifies a candidate. This is the gate: a candidate becomes `verified` only
 * when an external, independent reproduction is supplied with its own record.
 * The function refuses to verify anything on its own authority.
 */
export function verificationGate(
  candidate: DiscoveryCandidate,
  reproduction: { reproducedBy: string; method: string; independentDataset: string; agrees: boolean } | null,
): { verified: boolean; status: string; reason: string } {
  if (!reproduction) {
    return {
      verified: false,
      status: 'candidate',
      reason: 'No independent reproduction recorded. The candidate remains a candidate.',
    };
  }
  if (!reproduction.independentDataset || !reproduction.reproducedBy || !reproduction.method) {
    return {
      verified: false,
      status: 'incomplete-record',
      reason: 'A reproduction must name the person or process, the method and the independent dataset. Missing fields mean the record is not admissible.',
    };
  }
  if (!reproduction.agrees) {
    return {
      verified: false,
      status: 'not-reproduced',
      reason: `${reproduction.reproducedBy} attempted reproduction on ${reproduction.independentDataset} and the result did not agree. The candidate is not supported.`,
    };
  }
  return {
    verified: true,
    status: 'reproduced',
    reason: `Reproduced by ${reproduction.reproducedBy} on ${reproduction.independentDataset} using ${reproduction.method}. This is a reproduced result — not yet a scientific discovery, which also requires community review.`,
  };
}
