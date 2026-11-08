/**
 * NOVA HYPOTHESIS FORGE — server orchestration and input validation.
 *
 * Validation happens before anything is fetched:
 *  - question length and type;
 *  - language must be one of en/si/ta;
 *  - a follow-up context is rebuilt field-by-field from an allow-list, so a
 *    crafted payload cannot inject arbitrary properties into the request or the
 *    report;
 *  - the hypothesis id must be one the generator actually produced.
 *
 * No language model is called anywhere in this pipeline. A prompt-injection
 * string is therefore just text: it can change the interpreted question, never
 * the analysis code, the thresholds or the conclusion rules.
 */

import { generateHypotheses } from '../../src/lib/forge/hypotheses';
import { buildPlan, type NasaKeyMode } from '../../src/lib/forge/planner';
import { assembleInvestigation } from '../../src/lib/forge/orchestrator';
import { interpret } from '../../src/lib/forge/interpreter';
import type {
  AnalysisMethodId,
  Investigation,
  LanguageCode,
  ResearchRequest,
  ScientificDomain,
  TimeRange,
  VariableId,
  VariableRef,
} from '../../src/lib/forge/types';
import { DATASETS, VARIABLES } from '../../src/lib/forge/vocab';
import { retrieveDatasets, type ConnectorOptions, type FetchLike } from './connectors';

export const MAX_QUESTION_CHARS = 1200;
export const MIN_QUESTION_CHARS = 8;

const LANGUAGES: LanguageCode[] = ['en', 'si', 'ta'];
const DOMAINS: ScientificDomain[] = [
  'space-weather',
  'earth-environment',
  'near-earth-objects',
  'orbital',
  'planetary-imagery',
  'astronomy-context',
  'unsupported',
];
const METHODS: AnalysisMethodId[] = [
  'descriptive',
  'correlation',
  'cross-correlation',
  'before-after',
  'threshold-exceedance',
  'trend',
  'anomaly',
  'missing-data',
];

export interface ForgeRequestError {
  status: number;
  code: string;
  message: string;
}

export function validateQuestion(question: unknown): ForgeRequestError | null {
  if (typeof question !== 'string') {
    return { status: 400, code: 'INVALID_REQUEST', message: 'A question string is required.' };
  }
  const trimmed = question.trim();
  if (trimmed.length < MIN_QUESTION_CHARS) {
    return { status: 400, code: 'INVALID_REQUEST', message: 'Ask a fuller research question.' };
  }
  if (trimmed.length > MAX_QUESTION_CHARS) {
    return { status: 413, code: 'QUESTION_TOO_LONG', message: 'That question is too long.' };
  }
  return null;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/** Rebuild a follow-up context from an allow-list; anything unknown is dropped. */
export function sanitiseContext(raw: unknown): ResearchRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  if (typeof input.question !== 'string') return null;
  const domain = DOMAINS.includes(input.domain as ScientificDomain)
    ? (input.domain as ScientificDomain)
    : 'unsupported';
  const language = LANGUAGES.includes(input.language as LanguageCode)
    ? (input.language as LanguageCode)
    : 'en';
  const rawRange = input.timeRange as Record<string, unknown> | undefined;
  if (!rawRange || !isIsoDate(rawRange.start) || !isIsoDate(rawRange.end)) return null;
  const timeRange: TimeRange = {
    start: new Date(rawRange.start as string).toISOString(),
    end: new Date(rawRange.end as string).toISOString(),
    resolution: ['hour', 'day', 'month'].includes(String(rawRange.resolution))
      ? (rawRange.resolution as TimeRange['resolution'])
      : 'day',
    origin: 'default',
    label: typeof rawRange.label === 'string' ? rawRange.label.slice(0, 120) : 'previous window',
    assumed: Boolean(rawRange.assumed),
  };
  const rawRegion = input.region as Record<string, unknown> | undefined;
  const region = {
    name: typeof rawRegion?.name === 'string' ? rawRegion.name.slice(0, 120) : 'Global',
    latitude:
      typeof rawRegion?.latitude === 'number' && Number.isFinite(rawRegion.latitude)
        ? rawRegion.latitude
        : null,
    longitude:
      typeof rawRegion?.longitude === 'number' && Number.isFinite(rawRegion.longitude)
        ? rawRegion.longitude
        : null,
    source: ['gazetteer', 'global', 'none'].includes(String(rawRegion?.source))
      ? (rawRegion?.source as ResearchRequest['region']['source'])
      : 'global',
  };
  const variables: VariableRef[] = Array.isArray(input.variables)
    ? (input.variables as unknown[])
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const variable = entry as Record<string, unknown>;
          const id = variable.id as VariableId;
          const meta = VARIABLES.find((candidate) => candidate.id === id);
          if (!meta) return null;
          return {
            id,
            unit: meta.unit,
            datasetId: meta.datasetId,
            role: ['independent', 'dependent', 'context'].includes(String(variable.role))
              ? (variable.role as VariableRef['role'])
              : 'context',
          } satisfies VariableRef;
        })
        .filter((entry): entry is VariableRef => Boolean(entry))
        .slice(0, 6)
    : [];
  return {
    version: 'forge/1',
    id: typeof input.id === 'string' ? input.id.slice(0, 64) : 'context',
    question: input.question.slice(0, MAX_QUESTION_CHARS),
    language,
    domain,
    objective: typeof input.objective === 'string' ? input.objective.slice(0, 300) : '',
    timeRange,
    region,
    variables,
    requiredDatasets: Array.isArray(input.requiredDatasets)
      ? input.requiredDatasets
          .filter((id): id is string => typeof id === 'string' && DATASETS.some((dataset) => dataset.id === id))
          .slice(0, 8)
      : [],
    methods: Array.isArray(input.methods)
      ? input.methods.filter((method): method is AnalysisMethodId => METHODS.includes(method as AnalysisMethodId)).slice(0, 8)
      : [],
    expectedOutput: 'unknown',
    followUp: true,
    interpretationConfidence: 'medium',
    notes: [],
  };
}

export interface ForgeDependencies {
  fetchImpl?: FetchLike;
  now?: () => Date;
  nasaKey?: string | null;
  nasaKeyIsShared?: boolean;
  timeoutMs?: number;
  investigationId?: string;
  cache?: Map<string, unknown>;
}

export function nasaKeyMode(nasaKey?: string | null): NasaKeyMode {
  if (!nasaKey) return 'none';
  return nasaKey === 'DEMO_KEY' ? 'demo' : 'key';
}

export interface InterpretOutcome {
  request: ResearchRequest;
  hypotheses: ReturnType<typeof generateHypotheses>;
  plan: ReturnType<typeof buildPlan>;
}

export function interpretQuestion(input: {
  question: string;
  language?: unknown;
  context?: unknown;
  now: Date;
  nasaKey?: string | null;
}): InterpretOutcome {
  const language = LANGUAGES.includes(input.language as LanguageCode)
    ? (input.language as LanguageCode)
    : undefined;
  const context = sanitiseContext(input.context);
  const request = interpret(input.question, {
    now: input.now,
    context,
    preferredLanguage: language,
  });
  const hypotheses = generateHypotheses(request);
  const plan = buildPlan(request, { now: input.now, nasaKeyMode: nasaKeyMode(input.nasaKey) }, hypotheses.length);
  return { request, hypotheses, plan };
}

export async function investigate(input: {
  question: string;
  language?: unknown;
  context?: unknown;
  hypothesisId?: unknown;
  dependencies?: ForgeDependencies;
}): Promise<Investigation> {
  const dependencies = input.dependencies ?? {};
  const now = (dependencies.now ?? (() => new Date()))();
  const { request, hypotheses, plan } = interpretQuestion({
    question: input.question,
    language: input.language,
    context: input.context,
    now,
    nasaKey: dependencies.nasaKey,
  });

  const connectorOptions: ConnectorOptions = {
    fetchImpl: dependencies.fetchImpl,
    now: dependencies.now,
    nasaKey: dependencies.nasaKey,
    nasaKeyIsShared: dependencies.nasaKeyIsShared,
    timeoutMs: dependencies.timeoutMs,
    cache: dependencies.cache as never,
  };
  const datasets = await retrieveDatasets(request, plan, connectorOptions);

  const hypothesisId =
    typeof input.hypothesisId === 'string' && hypotheses.some((h) => h.id === input.hypothesisId)
      ? input.hypothesisId
      : null;

  return assembleInvestigation({
    request,
    hypotheses,
    plan,
    datasets,
    selectedHypothesisId: hypothesisId,
    createdAt: now.toISOString(),
    investigationId: dependencies.investigationId,
  });
}

/** Catalogue response: documentation only, never credentials or live values. */
export function cataloguePayload(nasaKey?: string | null) {
  return {
    ok: true as const,
    engine: 'nova-hypothesis-forge/1',
    datasets: DATASETS,
    capabilities: {
      nasaKey: nasaKeyMode(nasaKey),
      noaaKeyless: true as const,
      liveInvestigation: true as const,
      llmRequired: false as const,
      languages: LANGUAGES,
      note:
        'Datasets are documented in the registry; every measurement is fetched live. No language model is used for any numeric result.',
    },
  };
}
