/**
 * NOVA HYPOTHESIS FORGE — evidence engine.
 *
 * Evidence classification is a small, explicit rule set. It is not a model
 * opinion: each item records the rule that produced it and the numbers that
 * justified it, so a reader (or a test) can recompute the decision.
 *
 * Thresholds
 *   α (significance)     0.05, two-sided
 *   minimum n            10 paired observations for any correlation
 *   minimum trend n      12 monthly samples
 *   minimum threshold n  20 paired observations
 *   |r| support floor    0.30, plus p ≤ 0.05 and matching sign
 *
 * Strength describes the *evidence*, never the AI's confidence. NOVA reports no
 * model confidence for a numerical result, because no model produced it.
 */

import type {
  AnalysisResult,
  DatasetResult,
  EvidenceClassification,
  EvidenceItem,
  EvidenceStrength,
  Hypothesis,
  LanguageCode,
  NormalizedSeries,
} from './types';
import { datasetById } from './vocab';
import { forgeText, variableLabel } from './strings';
import { effectMagnitude } from './analysis';

export const ALPHA = 0.05;
export const MIN_CORRELATION_N = 10;
export const MIN_TREND_N = 12;
export const MIN_THRESHOLD_N = 20;
export const EFFECT_FLOOR = 0.3;

function format(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return Number(value.toFixed(digits)).toString();
}

function strengthFrom(r: number | null, p: number | null, significant: boolean): EvidenceStrength {
  const magnitude = effectMagnitude(r);
  if (!significant || magnitude === 'none') return 'none';
  if (magnitude === 'strong' && p !== null && p <= 0.01) return 'strong';
  if (magnitude === 'strong') return 'moderate';
  return magnitude;
}

export interface CorrelationVerdict {
  classification: EvidenceClassification;
  strength: EvidenceStrength;
  ruleKey: string;
  rule: string;
  values: Record<string, number | null>;
}

/** Classify a Pearson result against a hypothesis' expected sign. */
export function classifyCorrelation(args: {
  r: number | null;
  p: number | null;
  n: number;
  expected: 'positive' | 'negative' | 'none';
  language: LanguageCode;
  minR?: number;
}): CorrelationVerdict {
  const { r, p, n, expected, language } = args;
  const minR = args.minR ?? EFFECT_FLOOR;
  const values = { r, p, n, minR };
  if (n < MIN_CORRELATION_N || r === null || p === null) {
    return {
      classification: 'insufficient',
      strength: 'none',
      ruleKey: 'rule_insufficient_n',
      rule: forgeText(language, 'rule_insufficient_n', { n, min: MIN_CORRELATION_N }),
      values,
    };
  }
  const significant = p <= ALPHA && Math.abs(r) >= minR;
  if (!significant) {
    return {
      classification: 'neutral',
      strength: 'none',
      ruleKey: 'rule_correlation_neutral',
      rule: forgeText(language, 'rule_correlation_neutral', { r: format(r), n, p: format(p) }),
      values,
    };
  }
  const signMatches =
    expected === 'none' ? true : expected === 'positive' ? r > 0 : r < 0;
  if (expected !== 'none' && !signMatches) {
    return {
      classification: 'contradicting',
      strength: strengthFrom(r, p, true),
      ruleKey: 'rule_correlation_contradict',
      rule: forgeText(language, 'rule_correlation_contradict', { r: format(r), n, p: format(p) }),
      values,
    };
  }
  return {
    classification: 'supporting',
    strength: strengthFrom(r, p, true),
    ruleKey: 'rule_correlation_support',
    rule: forgeText(language, 'rule_correlation_support', {
      r: format(r),
      n,
      p: format(p),
      minR,
    }),
    values,
  };
}

export interface ThresholdVerdict {
  classification: EvidenceClassification;
  strength: EvidenceStrength;
  rule: string;
}

/** Classify a 2×2 exceedance table (driver extreme vs response storm). */
export function classifyThreshold(args: {
  cellA: number;
  cellB: number;
  cellC: number;
  cellD: number;
  phi: number | null;
  p: number | null;
  n: number;
  language: LanguageCode;
}): ThresholdVerdict {
  const { cellA, cellB, cellC, cellD, phi, p, n, language } = args;
  if (n < MIN_THRESHOLD_N || phi === null || p === null) {
    return {
      classification: 'insufficient',
      strength: 'none',
      rule: forgeText(language, 'rule_insufficient_n', { n, min: MIN_THRESHOLD_N }),
    };
  }
  if (n === 0 || cellA + cellB === 0 || cellC + cellD === 0) {
    return {
      classification: 'insufficient',
      strength: 'none',
      rule: forgeText(language, 'rule_threshold_absent'),
    };
  }
  if (p <= ALPHA && phi > 0.1) {
    return {
      classification: 'supporting',
      strength: strengthFrom(phi, p, true),
      rule: forgeText(language, 'rule_correlation_support', {
        r: format(phi),
        n,
        p: format(p),
        minR: 0.1,
      }),
    };
  }
  if (p <= ALPHA && phi < -0.1) {
    return {
      classification: 'contradicting',
      strength: strengthFrom(phi, p, true),
      rule: forgeText(language, 'rule_correlation_contradict', {
        r: format(phi),
        n,
        p: format(p),
      }),
    };
  }
  return {
    classification: 'neutral',
    strength: 'none',
    rule: forgeText(language, 'rule_correlation_neutral', {
      r: format(phi),
      n,
      p: format(p),
    }),
  };
}

function seriesDatasetId(seriesRef: string): string {
  return seriesRef.split(':')[0];
}

function qualityNote(series: NormalizedSeries, language: LanguageCode): string {
  const total = series.observations.length;
  const missing = series.observations.filter((observation) => observation.missing).length;
  if (missing === 0) return forgeText(language, 'quality_complete');
  return forgeText(language, 'quality_fill', { missing, total });
}

/**
 * Build the evidence set.
 *
 * - one item per comparable analysis result, linked to the hypotheses it tests;
 * - one quality item per retrieved dataset;
 * - one explicit `insufficient` item for every dataset that returned nothing,
 *   so a gap can never look like a negative result.
 */
export function buildEvidence(args: {
  analyses: AnalysisResult[];
  hypotheses: Hypothesis[];
  series: NormalizedSeries[];
  datasets: DatasetResult[];
  language: LanguageCode;
}): EvidenceItem[] {
  const { analyses, hypotheses, series, datasets, language } = args;
  const items: EvidenceItem[] = [];
  const seriesById = new Map(series.map((entry) => [entry.id, entry]));

  const hypothesisForAnalysis = (analysis: AnalysisResult): Hypothesis[] => {
    return hypotheses.filter((hypothesis) => {
      if (analysis.method === hypothesis.testMethod) return true;
      // Lead-lag hypotheses are supported by a lagged correlation analysis.
      if (hypothesis.testMethod === 'cross-correlation' && analysis.method === 'cross-correlation') return true;
      if (hypothesis.template === 'null-association' && analysis.method === 'correlation') return true;
      return false;
    });
  };

  for (const analysis of analyses) {
    if (analysis.skipped) continue;
    const linkedHypotheses = hypothesisForAnalysis(analysis);
    if (linkedHypotheses.length === 0) continue;
    const primarySeries = analysis.datasetRefs
      .map((ref) => seriesById.get(ref))
      .find((entry): entry is NormalizedSeries => Boolean(entry));
    if (!primarySeries) continue;
    const dataset = datasetById(primarySeries.datasetId);

    const numeric = (key: string): number | null => {
      const value = analysis.results[key];
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    };

    for (const hypothesis of linkedHypotheses) {
      let classification: EvidenceClassification = 'insufficient';
      let strength: EvidenceStrength = 'none';
      let rule = forgeText(language, 'rule_no_data');
      let values: Record<string, number | string | null> = { n: analysis.sampleSize };

      if (analysis.method === 'correlation' || analysis.method === 'cross-correlation') {
        const expected =
          hypothesis.expectedRelationship.type === 'negative'
            ? 'negative'
            : hypothesis.expectedRelationship.type === 'positive'
              ? 'positive'
              : 'none';
        const verdict = classifyCorrelation({
          r: numeric('r'),
          p: numeric('p'),
          n: analysis.sampleSize,
          expected,
          language,
          minR: hypothesis.expectedRelationship.effectThreshold ?? EFFECT_FLOOR,
        });
        classification = verdict.classification;
        strength = verdict.strength;
        rule = verdict.rule;
        values = { ...values, ...verdict.values };
        if (analysis.method === 'cross-correlation' && numeric('bestLagHours') !== null) {
          const bestLagHours = numeric('bestLagHours') as number;
          rule = `${rule} ${forgeText(language, 'rule_lead_lag', {
            lag: format(bestLagHours, 1),
            r: format(numeric('r')),
            expected: hypothesis.expectedRelationship.lagHours ?? '—',
          })}`;
          values.bestLagHours = bestLagHours;
          // A lead-lag hypothesis is falsified when the response leads the
          // driver: the peak then sits at a negative lag. Record that as
          // contradicting evidence instead of silently reporting a correlation.
          if (hypothesis.template === 'lead-lag' && bestLagHours < 0 && classification === 'supporting') {
            classification = 'contradicting';
            rule = `${rule} ${hypothesis.falsificationCriteria[0] ?? ''}`.trim();
          }
        }
      } else if (analysis.method === 'threshold-exceedance') {
        const verdict = classifyThreshold({
          cellA: numeric('cellA') ?? 0,
          cellB: numeric('cellB') ?? 0,
          cellC: numeric('cellC') ?? 0,
          cellD: numeric('cellD') ?? 0,
          phi: numeric('phi'),
          p: numeric('p'),
          n: analysis.sampleSize,
          language,
        });
        classification = verdict.classification;
        strength = verdict.strength;
        rule = verdict.rule;
        values = { ...values, phi: numeric('phi'), p: numeric('p'), risktRatio: numeric('relativeRisk') };
      } else if (analysis.method === 'trend') {
        const r = numeric('r');
        const p = numeric('p');
        const slope = numeric('slope');
        if (analysis.sampleSize < MIN_TREND_N || r === null || p === null || slope === null) {
          classification = 'insufficient';
          rule = forgeText(language, 'rule_insufficient_n', {
            n: analysis.sampleSize,
            min: MIN_TREND_N,
          });
        } else if (p <= ALPHA && Math.abs(r) >= 0.2) {
          const directionOk = hypothesis.expectedRelationship.type === 'positive' ? slope > 0 : slope < 0;
          classification = directionOk ? 'supporting' : 'contradicting';
          strength = strengthFrom(r, p, true);
          rule = forgeText(
            language,
            directionOk ? 'rule_correlation_support' : 'rule_correlation_contradict',
            { r: format(r), n: analysis.sampleSize, p: format(p), minR: 0.2 },
          );
        } else {
          classification = 'neutral';
          rule = forgeText(language, 'rule_correlation_neutral', {
            r: format(r),
            n: analysis.sampleSize,
            p: format(p),
          });
        }
        values = { ...values, r, p, slope };
      } else if (analysis.method === 'before-after') {
        const p = numeric('p');
        const change = numeric('changePercent');
        if (analysis.sampleSize < MIN_THRESHOLD_N || p === null || change === null) {
          classification = 'insufficient';
          rule = forgeText(language, 'rule_insufficient_n', {
            n: analysis.sampleSize,
            min: MIN_THRESHOLD_N,
          });
        } else if (p <= ALPHA && change > 0) {
          classification = 'supporting';
          strength = Math.abs(change) >= 50 ? 'moderate' : 'weak';
          rule = `${forgeText(language, 'rule_correlation_support', {
            r: format(change / 100),
            n: analysis.sampleSize,
            p: format(p),
            minR: EFFECT_FLOOR,
          })}`;
        } else if (p <= ALPHA && change < 0) {
          classification = 'contradicting';
          strength = 'weak';
          rule = forgeText(language, 'rule_correlation_contradict', {
            r: format(change / 100),
            n: analysis.sampleSize,
            p: format(p),
          });
        } else {
          classification = 'neutral';
          rule = forgeText(language, 'rule_correlation_neutral', {
            r: format(change / 100),
            n: analysis.sampleSize,
            p: format(p),
          });
        }
        values = { ...values, p, changePercent: change };
      } else if (analysis.method === 'descriptive') {
        classification = analysis.sampleSize > 0 ? 'neutral' : 'insufficient';
        rule =
          analysis.sampleSize > 0
            ? forgeText(language, 'quality_complete')
            : forgeText(language, 'rule_no_data');
      }

      items.push({
        id: `E-${items.length + 1}-${analysis.id}`,
        datasetId: primarySeries.datasetId,
        datasetTitle: dataset?.title ?? primarySeries.datasetId,
        organisation: dataset?.organisation ?? 'Other',
        sourceUrl: primarySeries.provenance.sourceUrl,
        documentationUrl: primarySeries.provenance.documentationUrl,
        retrievedAt: primarySeries.provenance.retrievedAt,
        observationStart: primarySeries.provenance.observationStart,
        observationEnd: primarySeries.provenance.observationEnd,
        measurements: forgeText(language, 'evidence_measurements', {
          variable: variableLabel(language, primarySeries.variableId),
          method: analysis.methodLabel,
          dataset: primarySeries.datasetId,
        }),
        units: primarySeries.unit,
        processing: forgeText(language, 'processing_parse', {
          rows: primarySeries.observations.length,
          tolerance: 90,
        }),
        quality: qualityNote(primarySeries, language),
        limitations: [...analysis.limitations, ...(dataset?.limitations ?? [])],
        hypothesisIds: [hypothesis.id],
        classification,
        strength,
        rule,
        analysisId: analysis.id,
        values,
      });
    }
  }

  // Dataset-level quality items (retrieved data).
  for (const result of datasets) {
    for (const entry of result.series) {
      items.push({
        id: `Q-${items.length + 1}-${entry.id}`,
        datasetId: entry.datasetId,
        datasetTitle: entry.provenance.datasetTitle,
        organisation: entry.provenance.organisation,
        sourceUrl: entry.provenance.sourceUrl,
        documentationUrl: entry.provenance.documentationUrl,
        retrievedAt: entry.provenance.retrievedAt,
        observationStart: entry.provenance.observationStart,
        observationEnd: entry.provenance.observationEnd,
        measurements: `${entry.label}: ${entry.observations.filter((observation) => !observation.missing).length} valid observations`,
        units: entry.unit,
        processing: entry.provenance.processingHistory.join(' → '),
        quality: qualityNote(entry, language),
        limitations: [...(datasetById(entry.datasetId)?.limitations ?? [])],
        hypothesisIds: [],
        classification: 'neutral',
        strength: 'none',
        rule:
          entry.missing.fraction > 0
            ? forgeText(language, 'rule_missing_coverage', {
                coverage: format((1 - entry.missing.fraction) * 100, 1),
              })
            : forgeText(language, 'rule_missing_coverage', { coverage: '100' }),
        analysisId: null,
        values: {
          observations: entry.observations.length,
          missingFraction: entry.missing.fraction,
          expected: entry.missing.expected,
        },
      });
    }
  }

  // Unavailable sources are evidence of a gap, never of a negative result.
  for (const result of datasets) {
    if (result.status === 'live' || result.status === 'cached' || result.status === 'partial') {
      if (result.series.length > 0) continue;
    }
    const dataset = datasetById(result.datasetId);
    items.push({
      id: `G-${items.length + 1}-${result.datasetId}`,
      datasetId: result.datasetId,
      datasetTitle: dataset?.title ?? result.datasetId,
      organisation: dataset?.organisation ?? 'Other',
      sourceUrl: dataset?.endpoint ?? result.documentationUrl,
      documentationUrl: result.documentationUrl,
      retrievedAt: new Date().toISOString(),
      observationStart: null,
      observationEnd: null,
      measurements: 'no measurement retrieved',
      units: '—',
      processing: 'none — the connector returned no usable records',
      quality: 'unavailable',
      limitations: dataset?.limitations ?? [],
      hypothesisIds: hypotheses.map((hypothesis) => hypothesis.id),
      classification: 'insufficient',
      strength: 'none',
      rule: result.detail ?? forgeText(language, 'rule_no_data'),
      analysisId: null,
      values: { errorCode: result.errorCode ?? null },
    });
  }

  return items;
}


export function evidenceCounts(items: EvidenceItem[]): {
  supporting: number;
  contradicting: number;
  neutral: number;
  insufficient: number;
} {
  return {
    supporting: items.filter((item) => item.classification === 'supporting').length,
    contradicting: items.filter((item) => item.classification === 'contradicting').length,
    neutral: items.filter((item) => item.classification === 'neutral').length,
    insufficient: items.filter((item) => item.classification === 'insufficient').length,
  };
}

/** Only items tied to hypotheses count towards a conclusion. */
export function hypothesisEvidence(items: EvidenceItem[], hypothesisId: string): EvidenceItem[] {
  return items.filter((item) => item.hypothesisIds.includes(hypothesisId));
}
