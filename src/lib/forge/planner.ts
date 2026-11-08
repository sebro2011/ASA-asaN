/**
 * NOVA HYPOTHESIS FORGE — research planner.
 *
 * The plan is produced *before* any data-intensive request and is shown to the
 * user. It answers, in the investigation's language: which datasets would be
 * used, why, over what window, in what units, and what is missing.
 *
 * Coverage is computed from the registry's published windows, so a question
 * about a 1989 storm is honestly reported as outside NOAA's rolling Kp product
 * instead of being silently answered from a different period.
 */

import type {
  DatasetDescriptor,
  PlanDataset,
  ResearchPlan,
  ResearchRequest,
  TimeRange,
} from './types';
import { FORGE_MODEL_VERSION } from './types';
import { DATASETS, METHOD_REASONS, datasetById, variableMeta } from './vocab';
import { forgeText } from './strings';
import { MIN_CORRELATION_N } from './evidence';

export type NasaKeyMode = 'key' | 'demo' | 'none';

export interface PlanContext {
  now?: Date;
  nasaKeyMode?: NasaKeyMode;
}

const DAY_MS = 86_400_000;

function overlapFraction(start: number, end: number, coverageStart: number, coverageEnd: number): number {
  const span = Math.max(1, end - start);
  const overlap = Math.max(0, Math.min(end, coverageEnd) - Math.max(start, coverageStart));
  return overlap / span;
}

export interface CoverageVerdict {
  coverage: PlanDataset['coverage'];
  detail: string;
}

export function coverageVerdict(
  dataset: DatasetDescriptor,
  range: TimeRange,
  now: Date,
  language: ResearchRequest['language'],
): CoverageVerdict {
  const start = Date.parse(range.start);
  const end = Date.parse(range.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { coverage: 'unknown', detail: forgeText(language, 'coverageUnknown') };
  }
  const { coverage } = dataset;
  if (coverage.kind === 'rolling') {
    const days = coverage.rollingDays ?? 30;
    const coverageEnd = now.getTime();
    const coverageStart = coverageEnd - days * DAY_MS;
    const fraction = overlapFraction(start, end, coverageStart, coverageEnd);
    const label = `${new Date(coverageStart).toISOString().slice(0, 10)} → ${new Date(coverageEnd)
      .toISOString()
      .slice(0, 10)}`;
    if (fraction >= 0.95) return { coverage: 'in-range', detail: forgeText(language, 'coverageInRange') };
    if (fraction > 0) {
      return {
        coverage: 'partial',
        detail: `${forgeText(language, 'coveragePartial')} (${label})`,
      };
    }
    return {
      coverage: 'out-of-coverage',
      detail: forgeText(language, 'coverageOut', { coverage: `${days}-day rolling window (${label})` }),
    };
  }
  const earliest = coverage.earliest ? Date.parse(coverage.earliest) : Number.NEGATIVE_INFINITY;
  const latest = coverage.latest ? Date.parse(coverage.latest) : now.getTime();
  const archiveEnd = Math.min(latest, now.getTime());
  const fraction = overlapFraction(start, end, earliest, archiveEnd);
  const label = `${Number.isFinite(earliest) ? new Date(earliest).toISOString().slice(0, 10) : '—'} → ${new Date(
    archiveEnd,
  )
    .toISOString()
    .slice(0, 10)}`;
  if (fraction >= 0.95) return { coverage: 'in-range', detail: forgeText(language, 'coverageInRange') };
  if (fraction > 0) {
    return { coverage: 'partial', detail: `${forgeText(language, 'coveragePartial')} (${label})` };
  }
  return {
    coverage: 'out-of-coverage',
    detail: forgeText(language, 'coverageOut', { coverage: `${dataset.coverage.description} (${label})` }),
  };
}

function candidateDatasets(request: ResearchRequest): DatasetDescriptor[] {
  const ids = new Set<string>(request.requiredDatasets);
  for (const variable of request.variables) {
    const meta = variableMeta(variable.id);
    if (meta) ids.add(meta.datasetId);
  }
  const selected: DatasetDescriptor[] = [];
  for (const id of ids) {
    const dataset = datasetById(id);
    if (dataset) selected.push(dataset);
  }
  // Datasets that publish a variable but belong to another domain are still
  // listed when they were explicitly requested; nothing is silently dropped.
  return selected;
}

export function buildPlan(
  request: ResearchRequest,
  context: PlanContext = {},
  hypothesesCount: number = 0,
): ResearchPlan {
  const now = context.now ?? new Date();
  const language = request.language;
  const nasaKeyMode = context.nasaKeyMode ?? 'demo';
  const requestedVariables = request.variables.map((variable) => variable.id);

  const datasets: PlanDataset[] = candidateDatasets(request).map((dataset) => {
    const domainMatch = dataset.domains.includes(request.domain);
    const datasetVariables = dataset.variables.map((variable) => String(variable.id));
    const variableMatch =
      requestedVariables.length === 0 ||
      datasetVariables.length === 0 ||
      requestedVariables.some((id) => datasetVariables.includes(id));
    // A dataset may be scientifically relevant to the domain without publishing
    // the exact variable named in the question (e.g. DONKI's CME catalogue for a
    // solar-wind question). It is included as *context*, and the reason says so.
    const contextRelevant = domainMatch && !variableMatch && datasetVariables.length > 0;
    const compatible = domainMatch && (variableMatch || contextRelevant);
    const verdict = coverageVerdict(dataset, request.timeRange, now, language);
    const keyConfigured = !dataset.keyRequired || nasaKeyMode !== 'none';
    const reason = !domainMatch
      ? forgeText(language, 'compatDomainMismatch')
      : contextRelevant
        ? forgeText(language, 'compatContext')
        : !variableMatch
          ? forgeText(language, 'compatVariableMismatch')
          : datasetVariables.length === 0
          ? `${forgeText(language, 'compatDomain')} ${forgeText(language, 'lim_no_numeric_domain')}`
          : forgeText(language, 'compatDomain');
    return {
      datasetId: dataset.id,
      title: dataset.title,
      organisation: dataset.organisation,
      compatible,
      reason,
      coverage: verdict.coverage,
      coverageDetail: verdict.detail,
      variables: dataset.variables.map((variable) => `${variable.label} (${variable.unit})`),
      units: [...new Set(dataset.variables.map((variable) => variable.unit))],
      endpoint: dataset.endpoint,
      documentationUrl: dataset.documentationUrl,
      requiresKey: dataset.access === 'api-key',
      keyConfigured,
      expectedLimitations: dataset.limitations,
    };
  });

  const executable = datasets.some(
    (dataset) =>
      dataset.compatible &&
      dataset.keyConfigured &&
      dataset.coverage !== 'out-of-coverage',
  );

  const methods = request.methods.map((id) => ({
    id,
    reason: forgeText(language, METHOD_REASONS[id] ?? 'planVerifySample'),
  }));

  const verification = [
    forgeText(language, 'planVerifyProvenance'),
    forgeText(language, 'planVerifyMissing'),
    forgeText(language, 'planVerifyUnits'),
    forgeText(language, 'planVerifySample', { min: MIN_CORRELATION_N }),
  ];

  const missingInformation: string[] = [];
  if (request.timeRange.assumed) missingInformation.push(forgeText(language, 'planMissingTime'));
  if (request.timeRange.resolution === 'hour' && datasets.some((dataset) => dataset.coverage === 'in-range' && dataset.datasetId === 'nasa-power')) {
    missingInformation.push(forgeText(language, 'planMissingResolution'));
  }
  const keyedNotConfigured = datasets.some((dataset) => dataset.requiresKey && !dataset.keyConfigured);
  if (keyedNotConfigured) missingInformation.push(forgeText(language, 'planMissingKey'));
  if (nasaKeyMode === 'demo' && datasets.some((dataset) => dataset.requiresKey)) {
    missingInformation.push(forgeText(language, 'planDemoKey'));
  }
  if (hypothesesCount === 0) missingInformation.push(forgeText(language, 'noCompatibleDataset'));

  const limitations: string[] = [];
  for (const dataset of datasets) {
    if (dataset.compatible) limitations.push(...dataset.expectedLimitations);
  }
  if (datasets.length === 0) limitations.push(forgeText(language, 'noCompatibleDataset'));

  let blockingReason: string | undefined;
  if (!executable) {
    const outOfCoverage = datasets.find((dataset) => dataset.coverage === 'out-of-coverage');
    blockingReason = outOfCoverage
      ? outOfCoverage.coverageDetail
      : datasets.length === 0
        ? forgeText(language, 'noCompatibleDataset')
        : forgeText(language, 'noCompatibleDataset');
  }

  return {
    version: FORGE_MODEL_VERSION,
    requestId: request.id,
    question: request.question,
    objective:
      hypothesesCount === 0 && datasets.length === 0
        ? forgeText(language, 'noCompatibleDataset')
        : request.objective,
    datasets,
    retrievalWindow: request.timeRange,
    methods,
    verification,
    missingInformation: [...new Set(missingInformation)],
    limitations: [...new Set(limitations)],
    executable,
    blockingReason,
  };
}

/** All registered datasets, for the Data Explorer panel. */
export function datasetCatalogue(): DatasetDescriptor[] {
  return DATASETS.map((dataset) => ({ ...dataset }));
}
