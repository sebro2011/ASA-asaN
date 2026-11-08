/**
 * NOVA HYPOTHESIS FORGE — hypothesis generator.
 *
 * Generates falsifiable, parameterised hypotheses from a structured request.
 * These are *proposals for investigation*: the module never labels one a finding,
 * and every hypothesis carries its alternative explanations, falsification
 * criteria and known limitations in the investigation's language.
 *
 * The set always includes a null hypothesis when a quantitative test is
 * possible, so an investigation can fail to reject it.
 */

import type {
  AnalysisMethodId,
  Hypothesis,
  ResearchRequest,
  VariableId,
} from './types';
import { FORGE_MODEL_VERSION } from './types';
import { datasetById, variableMeta } from './vocab';
import { forgeText, variableLabel } from './strings';
import { hashString } from './interpreter';

const DRIVER_PREFERENCE: VariableId[] = [
  'solar_wind_speed',
  'bz_gsm',
  'bt',
  'proton_density',
  'cme_speed',
];

export const DRIVER_THRESHOLDS: Partial<Record<VariableId, { value: number; unit: string }>> = {
  solar_wind_speed: { value: 500, unit: 'km/s' },
  bz_gsm: { value: -10, unit: 'nT' },
  bt: { value: 10, unit: 'nT' },
  proton_density: { value: 20, unit: 'p/cm³' },
  cme_speed: { value: 800, unit: 'km/s' },
};

export const STORM_KP_THRESHOLD = 5;

function hypothesisId(template: string, request: ResearchRequest, index: number): string {
  return `H${index + 1}-${hashString(`${template}|${request.id}|${index}`)}`;
}

function labels(language: ResearchRequest['language'], ids: VariableId[]): string[] {
  return ids.map((id) => variableLabel(language, id));
}

function requiredObservations(request: ResearchRequest): string[] {
  return request.requiredDatasets
    .map((id) => datasetById(id))
    .filter((dataset): dataset is NonNullable<typeof dataset> => Boolean(dataset))
    .map((dataset) => `${dataset.title} (${dataset.organisation})`);
}

function limitations(request: ResearchRequest): string[] {
  const language = request.language;
  const list: string[] = [forgeText(language, 'lim_correlation')];
  if (request.domain === 'space-weather') {
    list.push(forgeText(language, 'lim_global_index'));
    list.push(forgeText(language, 'lim_single_point'));
    list.push(forgeText(language, 'lim_rolling'));
  }
  if (request.domain === 'earth-environment') {
    list.push(forgeText(language, 'lim_monthly'));
    list.push(forgeText(language, 'lim_global_index'));
  }
  if (request.domain === 'near-earth-objects' || request.domain === 'space-weather') {
    list.push(forgeText(language, 'lim_estimate'));
  }
  if (request.variables.length === 0) list.push(forgeText(language, 'lim_no_numeric_domain'));
  return list;
}

function alternatives(language: ResearchRequest['language']): string[] {
  return [
    forgeText(language, 'alt_autocorrelation'),
    forgeText(language, 'alt_other_driver'),
    forgeText(language, 'alt_seasonal'),
    forgeText(language, 'alt_instrument'),
    forgeText(language, 'alt_chance'),
  ];
}

function nullHypothesis(request: ResearchRequest, index: number, driver: VariableId, response: VariableId): Hypothesis {
  const language = request.language;
  return {
    version: FORGE_MODEL_VERSION,
    id: hypothesisId('null-association', request, index),
    template: 'null-association',
    question: request.question,
    statement: forgeText(language, 'hyp_null_statement', {
      driver: variableLabel(language, driver),
      response: variableLabel(language, response),
      period: request.timeRange.label,
    }),
    explanation: forgeText(language, 'hyp_null_explanation'),
    independentVariables: labels(language, [driver]),
    dependentVariables: labels(language, [response]),
    requiredObservations: requiredObservations(request),
    expectedRelationship: { type: 'none', lagHours: null, effectThreshold: 0.3 },
    alternativeExplanations: alternatives(language),
    falsificationCriteria: [forgeText(language, 'falsify_null')],
    limitations: limitations(request),
    testMethod: 'correlation',
    isNull: true,
    status: 'proposed',
  };
}

function spaceWeatherHypotheses(request: ResearchRequest): Hypothesis[] {
  const language = request.language;
  const ids = request.variables.map((variable) => variable.id);
  const driver = DRIVER_PREFERENCE.find((candidate) => ids.includes(candidate)) ?? 'solar_wind_speed';
  const response: VariableId = 'kp';
  const driverMeta = variableMeta(driver);
  const threshold = DRIVER_THRESHOLDS[driver];
  const list: Hypothesis[] = [];

  list.push({
    version: FORGE_MODEL_VERSION,
    id: hypothesisId('lead-lag', request, 0),
    template: 'lead-lag',
    question: request.question,
    statement: forgeText(language, 'hyp_lead_lag_statement', {
      period: request.timeRange.label,
      driver: variableLabel(language, driver),
      response: variableLabel(language, response),
      lag: 12,
      direction: forgeText(language, driver === 'bz_gsm' ? 'direction_negative' : 'direction_positive'),
    }),
    explanation: forgeText(language, 'hyp_lead_lag_explanation'),
    independentVariables: labels(language, [driver]),
    dependentVariables: labels(language, [response]),
    requiredObservations: requiredObservations(request),
    expectedRelationship: {
      type: driver === 'bz_gsm' ? 'negative' : 'positive',
      lagHours: 12,
      effectThreshold: 0.3,
    },
    alternativeExplanations: alternatives(language),
    falsificationCriteria: [forgeText(language, 'falsify_lead_lag')],
    limitations: limitations(request),
    testMethod: 'cross-correlation',
    isNull: false,
    status: 'proposed',
  });

  if (threshold && driverMeta) {
    list.push({
      version: FORGE_MODEL_VERSION,
      id: hypothesisId('threshold-response', request, 1),
      template: 'threshold-response',
      question: request.question,
      statement: forgeText(language, 'hyp_threshold_statement', {
        period: request.timeRange.label,
        driver: `${variableLabel(language, driver)} ${driver === 'bz_gsm' ? '≤' : '≥'} ${threshold.value} ${threshold.unit}`,
        response: variableLabel(language, response),
        threshold: STORM_KP_THRESHOLD,
      }),
      explanation: forgeText(language, 'hyp_threshold_explanation'),
      independentVariables: labels(language, [driver]),
      dependentVariables: labels(language, [response]),
      requiredObservations: requiredObservations(request),
      expectedRelationship: { type: 'threshold', lagHours: 6, effectThreshold: 0.3 },
      alternativeExplanations: alternatives(language),
      falsificationCriteria: [forgeText(language, 'falsify_threshold')],
      limitations: limitations(request),
      testMethod: 'threshold-exceedance',
      isNull: false,
      status: 'proposed',
    });
  }

  if (request.timeRange.origin === 'named-event') {
    list.push({
      version: FORGE_MODEL_VERSION,
      id: hypothesisId('before-after', request, list.length),
      template: 'before-after',
      question: request.question,
      statement: forgeText(language, 'hyp_before_after_statement', {
        period: request.timeRange.label,
        response: variableLabel(language, response),
      }),
      explanation: forgeText(language, 'hyp_before_after_explanation'),
      independentVariables: [request.timeRange.label],
      dependentVariables: labels(language, [response]),
      requiredObservations: requiredObservations(request),
      expectedRelationship: { type: 'threshold', lagHours: null, effectThreshold: 0.3 },
      alternativeExplanations: alternatives(language),
      falsificationCriteria: [forgeText(language, 'falsify_before_after')],
      limitations: limitations(request),
      testMethod: 'before-after',
      isNull: false,
      status: 'proposed',
    });
  }

  list.push(nullHypothesis(request, list.length, driver, response));
  return list;
}

function earthHypotheses(request: ResearchRequest): Hypothesis[] {
  const language = request.language;
  const ids = request.variables.map((variable) => variable.id);
  const response: VariableId = ids.includes('precipitation') ? 'precipitation' : 'temperature';
  const other: VariableId = response === 'temperature' ? 'precipitation' : 'temperature';
  const list: Hypothesis[] = [];

  list.push({
    version: FORGE_MODEL_VERSION,
    id: hypothesisId('trend', request, 0),
    template: 'trend',
    question: request.question,
    statement: forgeText(language, 'hyp_trend_statement', {
      start: request.timeRange.start.slice(0, 10),
      end: request.timeRange.end.slice(0, 10),
      response: variableLabel(language, response),
      region: request.region.name,
      direction: forgeText(language, 'direction_positive'),
    }),
    explanation: forgeText(language, 'hyp_trend_explanation'),
    independentVariables: ['UTC time (month index)'],
    dependentVariables: labels(language, [response]),
    requiredObservations: requiredObservations(request),
    expectedRelationship: { type: 'positive', lagHours: null, effectThreshold: 0.2 },
    alternativeExplanations: [
      forgeText(language, 'alt_seasonal'),
      forgeText(language, 'alt_instrument'),
      forgeText(language, 'alt_selection'),
      forgeText(language, 'alt_autocorrelation'),
    ],
    falsificationCriteria: [forgeText(language, 'falsify_trend')],
    limitations: limitations(request),
    testMethod: 'trend',
    isNull: false,
    status: 'proposed',
  });

  list.push({
    version: FORGE_MODEL_VERSION,
    id: hypothesisId('lead-lag', request, 1),
    template: 'lead-lag',
    question: request.question,
    statement: forgeText(language, 'hyp_lead_lag_statement', {
      period: request.timeRange.label,
      driver: variableLabel(language, other),
      response: variableLabel(language, response),
      lag: 0,
      direction: forgeText(language, 'direction_positive'),
    }),
    explanation: forgeText(language, 'hyp_lead_lag_explanation'),
    independentVariables: labels(language, [other]),
    dependentVariables: labels(language, [response]),
    requiredObservations: requiredObservations(request),
    expectedRelationship: { type: 'positive', lagHours: 0, effectThreshold: 0.3 },
    alternativeExplanations: alternatives(language),
    falsificationCriteria: [forgeText(language, 'falsify_lead_lag')],
    limitations: limitations(request),
    testMethod: 'correlation',
    isNull: false,
    status: 'proposed',
  });

  list.push(nullHypothesis(request, list.length, other, response));
  return list;
}

function neoHypotheses(request: ResearchRequest): Hypothesis[] {
  const language = request.language;
  const list: Hypothesis[] = [
    {
      version: FORGE_MODEL_VERSION,
      id: hypothesisId('lead-lag', request, 0),
      template: 'lead-lag',
      question: request.question,
      statement: forgeText(language, 'hyp_lead_lag_statement', {
        period: request.timeRange.label,
        driver: variableLabel(language, 'asteroid_diameter'),
        response: variableLabel(language, 'asteroid_miss_distance'),
        lag: 0,
        direction: forgeText(language, 'direction_positive'),
      }),
      explanation: forgeText(language, 'hyp_lead_lag_explanation'),
      independentVariables: labels(language, ['asteroid_diameter']),
      dependentVariables: labels(language, ['asteroid_miss_distance']),
      requiredObservations: requiredObservations(request),
      expectedRelationship: { type: 'positive', lagHours: null, effectThreshold: 0.3 },
      alternativeExplanations: [
        forgeText(language, 'alt_selection'),
        forgeText(language, 'alt_instrument'),
        forgeText(language, 'alt_chance'),
      ],
      falsificationCriteria: [forgeText(language, 'falsify_null')],
      limitations: limitations(request),
      testMethod: 'correlation',
      isNull: false,
      status: 'proposed',
    },
    nullHypothesis(request, 1, 'asteroid_diameter', 'asteroid_miss_distance'),
  ];
  return list;
}

function contextHypothesis(request: ResearchRequest): Hypothesis[] {
  const language = request.language;
  const imagery = request.domain === 'planetary-imagery';
  return [
    {
      version: FORGE_MODEL_VERSION,
      id: hypothesisId('descriptive-context', request, 0),
      template: 'descriptive-context',
      question: request.question,
      statement: forgeText(language, 'hyp_context_statement', {
        period: request.timeRange.label,
        sourceType: forgeText(language, imagery ? 'sourceType_imagery' : 'sourceType_context'),
      }),
      explanation: forgeText(language, 'hyp_context_explanation'),
      independentVariables: [],
      dependentVariables: [],
      requiredObservations: requiredObservations(request),
      expectedRelationship: { type: 'none', lagHours: null, effectThreshold: null },
      alternativeExplanations: [forgeText(language, 'alt_selection')],
      falsificationCriteria: [
        imagery
          ? 'Reject if the rover image API returns no records for the requested date.'
          : 'Reject if the APOD archive has no entry for the requested date.',
      ],
      limitations: [forgeText(language, 'lim_no_numeric_domain')],
      testMethod: 'descriptive',
      isNull: false,
      status: 'proposed',
    },
  ];
}

/** Generate hypotheses. Empty for an unsupported domain — never invented. */
export function generateHypotheses(request: ResearchRequest): Hypothesis[] {
  switch (request.domain) {
    case 'space-weather':
      return spaceWeatherHypotheses(request);
    case 'earth-environment':
      return earthHypotheses(request);
    case 'near-earth-objects':
      return neoHypotheses(request);
    case 'planetary-imagery':
    case 'astronomy-context':
      return contextHypothesis(request);
    case 'orbital': {
      const language = request.language;
      return [
        {
          version: FORGE_MODEL_VERSION,
          id: hypothesisId('descriptive-context', request, 0),
          template: 'descriptive-context',
          question: request.question,
          statement: forgeText(language, 'hyp_context_statement', {
            period: request.timeRange.label,
            sourceType: 'ISS orbital elements (TLE)',
          }),
          explanation: forgeText(language, 'hyp_context_explanation'),
          independentVariables: [],
          dependentVariables: labels(language, ['orbital_altitude']),
          requiredObservations: requiredObservations(request),
          expectedRelationship: { type: 'none', lagHours: null, effectThreshold: null },
          alternativeExplanations: [forgeText(language, 'alt_selection')],
          falsificationCriteria: ['Reject if no TLE is available for the request.'],
          limitations: [
            ...limitations(request),
            'A single propagated altitude is not a measured time series.',
          ],
          testMethod: 'descriptive',
          isNull: false,
          status: 'proposed',
        },
      ];
    }
    default:
      return [];
  }
}

/* ----------------------------------------------------- user hypothesis state */

export type HypothesisDecision = 'accepted' | 'rejected' | 'proposed';

/** Pure state transition used by the UI and unit-tested directly. */
export function decideHypothesis(
  hypotheses: Hypothesis[],
  id: string,
  decision: HypothesisDecision,
  editedStatement?: string,
): Hypothesis[] {
  return hypotheses.map((hypothesis) => {
    if (hypothesis.id !== id) return hypothesis;
    const statement = editedStatement?.trim();
    if (statement && statement.length > 0) {
      return { ...hypothesis, status: 'edited', userStatement: statement.slice(0, 1200) };
    }
    return { ...hypothesis, status: decision };
  });
}

export function activeStatement(hypothesis: Hypothesis): string {
  return hypothesis.userStatement?.trim() || hypothesis.statement;
}

export function analysisMethodForHypothesis(testMethod: AnalysisMethodId): AnalysisMethodId {
  return testMethod;
}
