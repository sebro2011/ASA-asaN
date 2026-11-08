/**
 * NOVA HYPOTHESIS FORGE — investigation orchestrator.
 *
 * Pure function of (request, hypotheses, plan, retrieved datasets) → Investigation.
 * It performs no network access, so the whole scientific pipeline can be tested
 * with fixture payloads, and the server layer stays a thin connector runner.
 *
 * Order of operations is deliberate:
 *   1. analyses are computed from normalised series only;
 *   2. evidence is classified from those analyses by explicit rules;
 *   3. counter-evidence is generated *after* evidence, so gaps and
 *      contradictions are never filtered out by an earlier step;
 *   4. the conclusion is derived from counts, and can only be
 *      insufficient / not-supported / mixed / weakly-supported.
 */

import type {
  AnalysisMethodId,
  AnalysisResult,
  DatasetResult,
  EvidenceItem,
  Hypothesis,
  Investigation,
  LanguageCode,
  NormalizedSeries,
  Observation,
  ResearchPlan,
  ResearchRequest,
  ScientificConclusion,
  SourceReport,
  VariableId,
} from './types';
import { FORGE_MODEL_VERSION } from './types';
import {
  alignSeries,
  compareGroups,
  correlationTest,
  crossCorrelation,
  describe,
  detectAnomalies,
  linearRegression,
  missingReport,
  round,
  twoByTwoTable,
  type PairedSeries,
} from './analysis';
import { buildEvidence, evidenceCounts, hypothesisEvidence } from './evidence';
import { buildCounterEvidence } from './counterEvidence';
import { DRIVER_THRESHOLDS, STORM_KP_THRESHOLD } from './hypotheses';
import { METHOD_LABEL_KEYS } from './strings';
import { forgeText } from './strings';
import { variableLabel } from './strings';
import { GIBS_ATTRIBUTION, getGibsLayer, wmsGetMapUrl } from '../earth/gibsCatalog.ts';
import { boundingBoxAround } from '../earth/geo.ts';
import { hashString } from './interpreter';

const PAIR_TOLERANCE_MS = 90 * 60 * 1000; // 90 min covers the 3-hour Kp cadence
const MAX_LAG_HOURS = 12;

function methodLabel(language: LanguageCode, method: AnalysisMethodId): string {
  return forgeText(language, METHOD_LABEL_KEYS[method] ?? 'method_descriptive');
}

function numeric(observations: Observation[]): number[] {
  return observations.map((observation) =>
    typeof observation.value === 'number' && Number.isFinite(observation.value)
      ? observation.value
      : Number.NaN,
  );
}

function values(observations: Observation[]): number[] {
  return observations
    .map((observation) => observation.value)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function seriesMap(datasets: DatasetResult[]): Map<VariableId, NormalizedSeries> {
  const map = new Map<VariableId, NormalizedSeries>();
  for (const result of datasets) {
    for (const series of result.series) {
      const id = series.variableId as VariableId;
      if (!map.has(id)) map.set(id, series);
    }
  }
  return map;
}

function baseAnalysis(
  language: LanguageCode,
  method: AnalysisMethodId,
  inputVariables: string[],
  datasetRefs: string[],
): AnalysisResult {
  return {
    id: '',
    method,
    methodLabel: methodLabel(language, method),
    inputVariables,
    datasetRefs,
    assumptions: [],
    parameters: {},
    results: {},
    limitations: [],
    skipped: false,
    sampleSize: 0,
  };
}

/** All numeric analyses for an investigation. Deterministic and network-free. */
export function runAnalyses(
  request: ResearchRequest,
  datasets: DatasetResult[],
  language: LanguageCode = request.language,
): AnalysisResult[] {
  const languageCode = language;
  const map = seriesMap(datasets);
  const analyses: AnalysisResult[] = [];
  const push = (analysis: AnalysisResult) => {
    if (!analysis.id) {
      analysis.id = `AN-${analyses.length + 1}-${analysis.method}-${hashString(
        `${analysis.datasetRefs.join('+')}|${analysis.inputVariables.join('+')}`,
      )}`;
    }
    analysis.results = Object.fromEntries(
      Object.entries(analysis.results).map(([key, value]) => [
        key,
        typeof value === 'number' ? round(value, 6) : value,
      ]),
    );
    analyses.push(analysis);
  };

  /* Descriptive + missing data for every series that has any record. */
  for (const series of map.values()) {
    const descriptive = baseAnalysis(languageCode, 'descriptive', [series.variableId], [series.id]);
    const stats = describe(values(series.observations));
    descriptive.assumptions = [forgeText(languageCode, 'assumption_units')];
    descriptive.parameters = { unit: series.unit, cadence: series.cadence };
    descriptive.results = {
      n: stats.n,
      mean: stats.mean,
      median: stats.median,
      sd: stats.sd,
      min: stats.min,
      max: stats.max,
      q1: stats.q1,
      q3: stats.q3,
    };
    descriptive.sampleSize = stats.n;
    descriptive.limitations = [forgeText(languageCode, 'limitation_causality')];
    descriptive.series = series.observations.map((observation, index) => ({
      x: index,
      y: observation.value,
    }));
    if (stats.n === 0) {
      descriptive.skipped = true;
      descriptive.skipReason = forgeText(languageCode, 'limitation_insufficient');
    }
    push(descriptive);

    const missing = baseAnalysis(languageCode, 'missing-data', [series.variableId], [series.id]);
    const report = missingReport(
      series.observations.map((observation) => observation.time),
      series.observations.map((observation) => observation.value),
    );
    missing.parameters = { unit: series.unit, cadence: series.cadence };
    missing.results = {
      observations: series.observations.length,
      present: report.present,
      missing: report.missing,
      missingFraction: report.fraction,
      coveragePercent: report.coveragePercent,
      largestGapHours: report.largestGapMs === null ? null : report.largestGapMs / 3_600_000,
      expected: report.expected,
    };
    missing.sampleSize = series.observations.length;
    missing.assumptions = [forgeText(languageCode, 'assumption_alignment')];
    missing.limitations = [forgeText(languageCode, 'limitation_missing')];
    if (report.expected !== null && report.coveragePercent !== null && report.coveragePercent < 90) {
      missing.limitations.push(
        forgeText(languageCode, 'rule_missing_coverage', {
          coverage: report.coveragePercent.toFixed(1),
        }),
      );
    }
    if (series.observations.length === 0) {
      missing.skipped = true;
      missing.skipReason = forgeText(languageCode, 'limitation_insufficient');
    }
    push(missing);
  }

  /* Domain-specific tests. */
  const kp = map.get('kp');
  const driverOrder: VariableId[] = ['bz_gsm', 'solar_wind_speed', 'bt', 'proton_density', 'cme_speed'];
  const driverVariable = driverOrder.find((id) => map.has(id));
  const driver = driverVariable ? map.get(driverVariable) : undefined;

  if (kp && driver && driverVariable) {
    const paired: PairedSeries = alignSeries(driver.observations, kp.observations, PAIR_TOLERANCE_MS);
    const driverNumbers = paired.driver.map((value) => (value === null ? Number.NaN : value));
    const responseNumbers = paired.response.map((value) => (value === null ? Number.NaN : value));

    const correlation = baseAnalysis(
      languageCode,
      'correlation',
      [driverVariable, 'kp'],
      [driver.id, kp.id],
    );
    const test = correlationTest(driverNumbers, responseNumbers);
    correlation.parameters = {
      driver: driverVariable,
      response: 'kp',
      toleranceMinutes: PAIR_TOLERANCE_MS / 60_000,
      driverCadence: paired.driverCadence,
      responseCadence: paired.responseCadence,
    };
    correlation.results = { r: test.r, p: test.p, n: test.n, t: test.t };
    correlation.sampleSize = test.n;
    correlation.assumptions = [
      forgeText(languageCode, 'assumption_linear'),
      forgeText(languageCode, 'assumption_independence'),
      forgeText(languageCode, 'assumption_normal'),
      forgeText(languageCode, 'assumption_alignment'),
    ];
    correlation.limitations = [
      forgeText(languageCode, 'limitation_autocorr'),
      forgeText(languageCode, 'limitation_causality'),
      ...(test.n < 30 ? [forgeText(languageCode, 'limitation_smallN')] : []),
    ];
    correlation.series = paired.times.map((time, index) => ({
      x: Date.parse(time),
      y: driverNumbers[index] ?? null,
    }));
    correlation.pairs = paired.times.reduce<Array<{ x: number; y: number }>>((acc, _time, index) => {
      const driverValue = driverNumbers[index];
      const responseValue = responseNumbers[index];
      if (Number.isFinite(driverValue) && Number.isFinite(responseValue)) {
        acc.push({ x: driverValue, y: responseValue });
      }
      return acc;
    }, []);
    if (test.n < 3) {
      correlation.skipped = true;
      correlation.skipReason = forgeText(languageCode, 'limitation_insufficient');
    }
    push(correlation);

    const stepMs = paired.medianStepMs;
    if (stepMs && stepMs > 0 && test.n >= 3) {
      const maxSteps = Math.max(1, Math.min(12, Math.round((MAX_LAG_HOURS * 3_600_000) / stepMs)));
      const cc = crossCorrelation(driverNumbers, responseNumbers, maxSteps);
      const cross = baseAnalysis(
        languageCode,
        'cross-correlation',
        [driverVariable, 'kp'],
        [driver.id, kp.id],
      );
      cross.parameters = {
        driver: driverVariable,
        response: 'kp',
        maxLagHours: MAX_LAG_HOURS,
        lagStepHours: stepMs / 3_600_000,
        driverCadence: paired.driverCadence,
        responseCadence: paired.responseCadence,
      };
      let bestP: number | null = null;
      if (cc.bestLagSteps !== null) {
        const lag = cc.bestLagSteps;
        const xs: number[] = [];
        const ys: number[] = [];
        for (let i = 0; i < driverNumbers.length; i += 1) {
          const j = i + lag;
          if (j < 0 || j >= responseNumbers.length) continue;
          if (Number.isFinite(driverNumbers[i]) && Number.isFinite(responseNumbers[j])) {
            xs.push(driverNumbers[i]);
            ys.push(responseNumbers[j]);
          }
        }
        bestP = correlationTest(xs, ys).p;
      }
      cross.results = {
        r: cc.bestR,
        p: bestP,
        bestLagHours: cc.bestLagSteps === null ? null : (cc.bestLagSteps * stepMs) / 3_600_000,
        n: cc.bestN,
        testedLags: cc.curve.length,
      };
      cross.sampleSize = cc.bestN;
      cross.assumptions = [
        forgeText(languageCode, 'assumption_linear'),
        forgeText(languageCode, 'assumption_independence'),
        forgeText(languageCode, 'assumption_alignment'),
      ];
      cross.limitations = [
        forgeText(languageCode, 'limitation_autocorr'),
        forgeText(languageCode, 'limitation_causality'),
        `Lag resolution equals the paired sampling interval (${(stepMs / 3_600_000).toFixed(2)} h).`,
      ];
      cross.series = cc.curve.map((entry) => ({ x: entry.lagSteps, y: entry.r }));
      if (cc.bestLagSteps === null) {
        cross.skipped = true;
        cross.skipReason = forgeText(languageCode, 'limitation_insufficient');
      }
      push(cross);

      const threshold = DRIVER_THRESHOLDS[driverVariable];
      if (threshold) {
        const thresholdAnalysis = baseAnalysis(
          languageCode,
          'threshold-exceedance',
          [driverVariable, 'kp'],
          [driver.id, kp.id],
        );
        let a = 0;
        let b = 0;
        let c = 0;
        let d = 0;
        for (let i = 0; i < paired.driver.length; i += 1) {
          const driverValue = paired.driver[i];
          const responseValue = paired.response[i];
          if (driverValue === null || responseValue === null) continue;
          const driverExtreme =
            driverVariable === 'bz_gsm' ? driverValue <= threshold.value : driverValue >= threshold.value;
          const responseExtreme = responseValue >= STORM_KP_THRESHOLD;
          if (driverExtreme && responseExtreme) a += 1;
          else if (driverExtreme && !responseExtreme) b += 1;
          else if (!driverExtreme && responseExtreme) c += 1;
          else d += 1;
        }
        const table = twoByTwoTable(a, b, c, d);
        const relativeRisk =
          a + b > 0 && c + d > 0
            ? (a / (a + b)) / (c / (c + d) === 0 ? Number.NaN : c / (c + d))
            : null;
        thresholdAnalysis.parameters = {
          driver: driverVariable,
          driverThreshold: threshold.value,
          driverThresholdUnit: threshold.unit,
          response: 'kp',
          responseThreshold: STORM_KP_THRESHOLD,
        };
        thresholdAnalysis.results = {
          cellA: a,
          cellB: b,
          cellC: c,
          cellD: d,
          phi: table.phi,
          chiSquare: table.chiSquare,
          p: table.p,
          oddsRatio: table.oddsRatio,
          relativeRisk: Number.isFinite(relativeRisk as number) ? (relativeRisk as number) : null,
          n: table.n,
        };
        thresholdAnalysis.sampleSize = table.n;
        thresholdAnalysis.assumptions = [
          forgeText(languageCode, 'assumption_independence'),
          'The Kp storm threshold is the NOAA G1 level (Kp = 5).',
        ];
        thresholdAnalysis.limitations = [
          forgeText(languageCode, 'limitation_autocorr'),
          forgeText(languageCode, 'limitation_causality'),
          forgeText(languageCode, 'lim_global_index'),
        ];
        if (table.n < 20) {
          thresholdAnalysis.skipped = true;
          thresholdAnalysis.skipReason = forgeText(languageCode, 'limitation_insufficient');
        }
        push(thresholdAnalysis);
      }
    }

    if (request.timeRange.origin === 'named-event') {
      const inside: number[] = [];
      const outside: number[] = [];
      const start = Date.parse(request.timeRange.start);
      const end = Date.parse(request.timeRange.end);
      for (const observation of kp.observations) {
        if (observation.value === null) continue;
        const time = Date.parse(observation.time);
        if (time >= start && time <= end) inside.push(observation.value);
        else outside.push(observation.value);
      }
      const comparison = compareGroups(outside, inside);
      const beforeAfter = baseAnalysis(languageCode, 'before-after', ['kp'], [kp.id, driver.id]);
      beforeAfter.parameters = {
        eventWindow: request.timeRange.label,
        baseline: 'all retrieved Kp samples outside the event window',
        toleranceMinutes: PAIR_TOLERANCE_MS / 60_000,
      };
      beforeAfter.results = {
        beforeMean: comparison.beforeMean,
        afterMean: comparison.afterMean,
        changePercent: comparison.changePercent,
        welchT: comparison.welchT,
        p: comparison.p,
        n: comparison.beforeN + comparison.afterN,
        baselineN: comparison.beforeN,
        eventN: comparison.afterN,
      };
      beforeAfter.sampleSize = comparison.beforeN + comparison.afterN;
      beforeAfter.assumptions = [
        forgeText(languageCode, 'assumption_independence'),
        forgeText(languageCode, 'assumption_normal'),
      ];
      beforeAfter.limitations = [
        forgeText(languageCode, 'limitation_autocorr'),
        forgeText(languageCode, 'limitation_causality'),
        'The baseline is the remainder of the retrieved window, which may itself be disturbed.',
      ];
      if (inside.length === 0 || outside.length < 3) {
        beforeAfter.skipped = true;
        beforeAfter.skipReason = forgeText(languageCode, 'limitation_insufficient');
      }
      push(beforeAfter);
    }
  }

  /* Earth-environment: trend + cross-variable correlation. */
  const temperature = map.get('temperature');
  const precipitation = map.get('precipitation');
  for (const [series, variable] of [
    [temperature, 'temperature'],
    [precipitation, 'precipitation'],
  ] as Array<[NormalizedSeries | undefined, string]>) {
    if (!series) continue;
    const points = series.observations
      .map((observation, index) => ({ index, value: observation.value, time: observation.time }))
      .filter((point): point is { index: number; value: number; time: string } =>
        typeof point.value === 'number' && Number.isFinite(point.value),
      );
    if (points.length === 0) continue;
    const regression = linearRegression(
      points.map((point) => point.index),
      points.map((point) => point.value),
    );
    const test = correlationTest(
      points.map((point) => point.index),
      points.map((point) => point.value),
    );
    const trend = baseAnalysis(languageCode, 'trend', [variable], [series.id]);
    trend.parameters = {
      unit: series.unit,
      cadence: series.cadence,
      xAxis: 'month index within the retrieved window',
    };
    trend.results = {
      slope: regression.slope,
      slopePerYear:
        regression.slope === null ? null : regression.slope * 12,
      intercept: regression.intercept,
      r2: regression.r2,
      r: test.r,
      p: test.p,
      n: points.length,
      slopeStandardError: regression.slopeStandardError,
    };
    trend.sampleSize = points.length;
    trend.assumptions = [
      forgeText(languageCode, 'assumption_linear'),
      forgeText(languageCode, 'assumption_independence'),
      forgeText(languageCode, 'assumption_normal'),
    ];
    trend.limitations = [
      forgeText(languageCode, 'limitation_autocorr'),
      forgeText(languageCode, 'limitation_causality'),
      forgeText(languageCode, 'lim_monthly'),
    ];
    trend.series = points.map((point) => ({ x: point.index, y: point.value }));
    if (points.length < 3) {
      trend.skipped = true;
      trend.skipReason = forgeText(languageCode, 'limitation_insufficient');
    }
    push(trend);
  }

  if (temperature && precipitation) {
    const byTime = new Map<string, { temperature: number | null; precipitation: number | null }>();
    for (const observation of temperature.observations) {
      byTime.set(observation.time, { temperature: observation.value, precipitation: null });
    }
    for (const observation of precipitation.observations) {
      const entry = byTime.get(observation.time) ?? { temperature: null, precipitation: null };
      entry.precipitation = observation.value;
      byTime.set(observation.time, entry);
    }
    const paired = [...byTime.entries()]
      .filter(([, entry]) => entry.temperature !== null && entry.precipitation !== null)
      .sort((a, b) => a[0].localeCompare(b[0]));
    const test = correlationTest(
      paired.map(([, entry]) => entry.precipitation as number),
      paired.map(([, entry]) => entry.temperature as number),
    );
    const correlation = baseAnalysis(
      languageCode,
      'correlation',
      ['precipitation', 'temperature'],
      [precipitation.id, temperature.id],
    );
    correlation.parameters = {
      driver: 'precipitation',
      response: 'temperature',
      pairing: 'exact monthly timestamp',
    };
    correlation.results = { r: test.r, p: test.p, n: test.n };
    correlation.sampleSize = test.n;
    correlation.assumptions = [
      forgeText(languageCode, 'assumption_linear'),
      forgeText(languageCode, 'assumption_independence'),
      forgeText(languageCode, 'assumption_normal'),
    ];
    correlation.limitations = [
      forgeText(languageCode, 'limitation_autocorr'),
      forgeText(languageCode, 'limitation_causality'),
      forgeText(languageCode, 'lim_monthly'),
    ];
    correlation.series = paired.map(([time, entry]) => ({
      x: Date.parse(time),
      y: entry.precipitation,
    }));
    if (test.n < 3) {
      correlation.skipped = true;
      correlation.skipReason = forgeText(languageCode, 'limitation_insufficient');
    }
    push(correlation);
  }

  /* Near-Earth objects: diameter vs miss distance (same approach records). */
  const diameter = map.get('asteroid_diameter');
  const missDistance = map.get('asteroid_miss_distance');
  if (diameter && missDistance) {
    const byTime = new Map<string, { diameter: number | null; distance: number | null }>();
    for (const observation of diameter.observations) {
      byTime.set(observation.time, { diameter: observation.value, distance: null });
    }
    for (const observation of missDistance.observations) {
      const entry = byTime.get(observation.time) ?? { diameter: null, distance: null };
      entry.distance = observation.value;
      byTime.set(observation.time, entry);
    }
    const paired = [...byTime.entries()]
      .filter(([, entry]) => entry.diameter !== null && entry.distance !== null)
      .sort((a, b) => a[0].localeCompare(b[0]));
    const test = correlationTest(
      paired.map(([, entry]) => entry.diameter as number),
      paired.map(([, entry]) => entry.distance as number),
    );
    const correlation = baseAnalysis(
      languageCode,
      'correlation',
      ['asteroid_diameter', 'asteroid_miss_distance'],
      [diameter.id, missDistance.id],
    );
    correlation.parameters = {
      driver: 'asteroid_diameter',
      response: 'asteroid_miss_distance',
      pairing: 'same close-approach record',
    };
    correlation.results = { r: test.r, p: test.p, n: test.n };
    correlation.sampleSize = test.n;
    correlation.assumptions = [
      forgeText(languageCode, 'assumption_linear'),
      forgeText(languageCode, 'assumption_independence'),
    ];
    correlation.limitations = [
      forgeText(languageCode, 'lim_estimate'),
      forgeText(languageCode, 'alt_selection'),
      forgeText(languageCode, 'limitation_causality'),
    ];
    correlation.series = paired.map(([time, entry]) => ({ x: Date.parse(time), y: entry.diameter }));
    if (test.n < 3) {
      correlation.skipped = true;
      correlation.skipReason = forgeText(languageCode, 'limitation_insufficient');
    }
    push(correlation);
  }

  /* Anomalies for every numeric series with enough samples. */
  for (const series of map.values()) {
    const numbers = values(series.observations);
    if (numbers.length < 8) continue;
    const anomaly = baseAnalysis(languageCode, 'anomaly', [series.variableId], [series.id]);
    const result = detectAnomalies(numbers, 3);
    anomaly.parameters = { zThreshold: 3, unit: series.unit };
    anomaly.results = {
      anomalies: result.count,
      mean: result.mean,
      sd: result.sd,
      observations: numbers.length,
    };
    anomaly.sampleSize = numbers.length;
    anomaly.assumptions = [forgeText(languageCode, 'assumption_normal')];
    anomaly.limitations = [
      forgeText(languageCode, 'limitation_autocorr'),
      'A z-score flag is not automatically a physical anomaly.',
    ];
    anomaly.series = series.observations.map((observation, index) => ({
      x: index,
      y: observation.value,
    }));
    push(anomaly);
  }

  return analyses;
}

/* --------------------------------------------------------------- conclusion */

export function conclude(
  request: ResearchRequest,
  hypotheses: Hypothesis[],
  selected: Hypothesis | null,
  evidence: EvidenceItem[],
  analyses: AnalysisResult[],
  language: LanguageCode,
): ScientificConclusion {
  const relevant = selected
    ? hypothesisEvidence(evidence, selected.id)
    : evidence.filter((item) => item.hypothesisIds.length > 0);
  const counts = evidenceCounts(relevant);
  const supporting = relevant.filter((item) => item.classification === 'supporting');
  const contradicting = relevant.filter((item) => item.classification === 'contradicting');

  let verdict: ScientificConclusion['verdict'] = 'insufficient-evidence';
  if (supporting.length > 0 && contradicting.length > 0) verdict = 'mixed';
  else if (contradicting.length > supporting.length) verdict = 'not-supported';
  else if (supporting.length > 0) verdict = 'weakly-supported';
  else verdict = 'insufficient-evidence';

  const titleKey =
    verdict === 'mixed'
      ? 'verdict_mixed_title'
      : verdict === 'not-supported'
        ? 'verdict_not_supported_title'
        : verdict === 'weakly-supported'
          ? 'verdict_weak_title'
          : 'verdict_insufficient_title';
  const summaryKey =
    verdict === 'mixed'
      ? 'verdict_mixed_summary'
      : verdict === 'not-supported'
        ? 'verdict_not_supported_summary'
        : verdict === 'weakly-supported'
          ? 'verdict_weak_summary'
          : 'verdict_insufficient_summary';

  const params = {
    supporting: counts.supporting,
    contradicting: counts.contradicting,
    neutral: counts.neutral,
    insufficient: counts.insufficient,
  };

  const limitations = new Set<string>();
  if (selected) {
    for (const limitation of selected.limitations) limitations.add(limitation);
  }
  for (const analysis of analyses) {
    if (analysis.skipped) continue;
    for (const limitation of analysis.limitations.slice(0, 3)) limitations.add(limitation);
  }
  if (limitations.size === 0) {
    limitations.add(forgeText(language, 'limitation_insufficient'));
  }

  return {
    verdict,
    title: forgeText(language, titleKey),
    summary: forgeText(language, summaryKey, params),
    causalCaveat: forgeText(language, 'causal_caveat'),
    supportingCount: counts.supporting,
    contradictingCount: counts.contradicting,
    neutralCount: counts.neutral,
    insufficientCount: counts.insufficient,
    limitations: [...limitations].slice(0, 10),
    alternatives: selected ? selected.alternativeExplanations : [],
  };
}

/* ------------------------------------------------------------------ imagery */

function mercator(latitude: number, longitude: number): [number, number] {
  const RADIUS = 6_378_137;
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const x = (RADIUS * (longitude * Math.PI)) / 180;
  const y = RADIUS * Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360));
  return [x, y];
}

/**
 * Context imagery from the *existing* GIBS catalogue. Only Earth-environment
 * investigations attach imagery, and the URL is labelled as context: no value is
 * read back out of a tile.
 */
function buildImagery(request: ResearchRequest): Investigation['imagery'] {
  if (request.domain !== 'earth-environment') return [];
  const hasPrecipitation = request.variables.some((variable) => variable.id === 'precipitation');
  const layerId = hasPrecipitation ? 'IMERG_Precipitation_Rate' : 'MODIS_Terra_Land_Surface_Temp_Day';
  const layer = getGibsLayer(layerId);
  if (!layer) return [];
  const { latitude, longitude } = request.region;
  const date = request.timeRange.end.slice(0, 10);
  if (latitude === null || longitude === null) return [];
  const bounds = request.region.bounds ?? boundingBoxAround(latitude, longitude, 2);
  const [south, west, north, east] = bounds;
  const [minX, minY] = mercator(south, west);
  const [maxX, maxY] = mercator(north, east);
  return [
    {
      layerId: layer.id,
      title: layer.title,
      date,
      wmsUrl: wmsGetMapUrl({
        layer,
        time: date,
        bbox3857: [minX, minY, maxX, maxY],
        width: 1024,
        height: 640,
      }),
      attribution: GIBS_ATTRIBUTION,
    },
  ];
}

/* -------------------------------------------------------------- assembly */

export interface AssembleInput {
  request: ResearchRequest;
  hypotheses: Hypothesis[];
  plan: ResearchPlan;
  datasets: DatasetResult[];
  selectedHypothesisId?: string | null;
  createdAt?: string;
  investigationId?: string;
}

export function assembleInvestigation(input: AssembleInput): Investigation {
  const { request, hypotheses, plan, datasets } = input;
  const language = request.language;
  const createdAt = input.createdAt ?? new Date().toISOString();
  const analyses = runAnalyses(request, datasets, language);
  const evidence = buildEvidence({ analyses, hypotheses, series: datasets.flatMap((d) => d.series), datasets, language });
  const counterEvidence = buildCounterEvidence({ request, plan, datasets, analyses, evidence, hypotheses, language });
  const selected =
    hypotheses.find((hypothesis) => hypothesis.id === input.selectedHypothesisId) ??
    hypotheses.find((hypothesis) => !hypothesis.isNull) ??
    hypotheses[0] ??
    null;
  const conclusion = conclude(request, hypotheses, selected, evidence, analyses, language);

  const sources: SourceReport[] = datasets.map((result) => ({
    datasetId: result.datasetId,
    title: result.series[0]?.provenance.datasetTitle ?? result.datasetId,
    organisation: result.series[0]?.provenance.organisation ?? 'Other',
    status: result.status,
    detail: result.detail ?? null,
    errorCode: result.errorCode ?? null,
    documentationUrl: result.documentationUrl,
    recordCount: result.series.reduce((total, series) => total + series.observations.length, 0),
    retrievedAt: result.series[0]?.provenance.retrievedAt ?? null,
  }));

  const limitations = new Set<string>(plan.limitations);
  for (const analysis of analyses) {
    if (analysis.skipped) continue;
    for (const limitation of analysis.limitations) limitations.add(limitation);
  }
  for (const source of sources) {
    if (source.status === 'unavailable' || source.status === 'out-of-coverage') {
      limitations.add(`${source.title}: ${source.detail ?? source.status}`);
    }
  }
  if (limitations.size === 0) limitations.add(forgeText(language, 'limitation_causality'));

  return {
    version: FORGE_MODEL_VERSION,
    id: input.investigationId ?? `INV-${hashString(`${request.id}|${createdAt}|${datasets.length}`)}`,
    question: request.question,
    language,
    createdAt,
    request,
    hypotheses,
    selectedHypothesisId: selected ? selected.id : null,
    plan,
    datasets,
    analyses,
    evidence,
    counterEvidence,
    conclusion,
    sources,
    imagery: buildImagery(request),
    limitations: [...limitations].slice(0, 16),
  };
}

/** Convenience for tests and the passport: all observations for a variable. */
export function seriesFor(datasets: DatasetResult[], variableId: string): NormalizedSeries | undefined {
  for (const result of datasets) {
    for (const series of result.series) {
      if (series.variableId === variableId) return series;
    }
  }
  return undefined;
}

export { variableLabel };
