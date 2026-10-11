/**
 * Deterministic Earth-science analysis helpers.
 *
 * Everything here operates on values that were actually retrieved, and every
 * string is written so that the boundary between "observed", "computed by this
 * app" and "interpretation" stays explicit. This module is also the non-AI
 * fallback analyst used when no Gemini key is configured or the model call fails.
 */

import { parameterMeta } from './power';
import { describeCoverage } from './domains';
import type { AvailabilityVerdict, GibsDomain, GibsLayerMeta, PowerDataset, PowerSeriesStats } from './types';

export type AnalystSectionKind = 'verified' | 'derived' | 'interpretation' | 'limitations' | 'gaps';

export interface AnalystSource {
  label: string;
  url: string;
  retrievedAt: string;
  detail?: string;
}

export interface AnalystAnswer {
  sections: Array<{ kind: AnalystSectionKind; title: string; bullets: string[] }>;
  sources: AnalystSource[];
  /** `ai` = Gemini over the retrieved bundle, `local` = deterministic engine. */
  provider: 'ai' | 'local';
  model?: string;
  generatedAt: string;
  /** True when the returned answer is built only from retrieved values. */
  groundedInRetrievedData: boolean;
}

export interface AnalystContext {
  areaLabel: string;
  latitude: number;
  longitude: number;
  dates: string[];
  layers: Array<{
    id: string;
    title: string;
    category: string;
    unit?: string;
    coverage?: string;
    availability?: AvailabilityVerdict;
    provenanceUrl?: string;
  }>;
  domains: Array<{ layerId: string; domain: GibsDomain | null }>;
  power?: {
    placeLabel: string;
    latitude: number;
    longitude: number;
    requestedParameters: string[];
    available: string[];
    unavailable: string[];
    rows: number;
    firstMonth?: string;
    lastMonth?: string;
    stats: PowerSeriesStats[];
    sourceUrl: string;
    retrievedAt: string;
  } | null;
  /** Free-form notes about missing data (never fabricated values). */
  dataGaps: string[];
}

function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'no value';
  return Number(value).toFixed(digits);
}

/** Neutral, unit-aware description of a POWER monthly series. */
export function describeSeries(stats: PowerSeriesStats, label?: string): string[] {
  const meta = parameterMeta(stats.code);
  const name = label || meta?.label || stats.code;
  const unit = stats.unit || meta?.unit || '';
  const lines: string[] = [];

  lines.push(
    `${name} (${stats.code}): ${stats.count} monthly values, mean ${fmt(stats.mean, 2)} ${unit}` +
      (stats.min ? `, minimum ${fmt(stats.min.value, 2)} ${unit} (${stats.min.date})` : '') +
      (stats.max ? `, maximum ${fmt(stats.max.value, 2)} ${unit} (${stats.max.date})` : '') +
      '.'
  );

  if (stats.trend) {
    const direction = stats.trend.slopePerYear > 0 ? 'increasing' : stats.trend.slopePerYear < 0 ? 'decreasing' : 'flat';
    lines.push(
      `Least-squares slope of annual means: ${fmt(stats.trend.slopePerYear, 3)} ${unit}/year over ${stats.trend.years} complete years ` +
        `(${stats.trend.fromYear}–${stats.trend.toYear}), i.e. a ${direction} annual mean across that window.`
    );
  } else {
    lines.push('Fewer than two complete calendar years are available, so no slope was computed.');
  }

  return lines;
}

/** Constant, dataset-derived caveats — never specific to a measurement. */
export function seriesLimitations(stats: PowerSeriesStats): string[] {
  const meta = parameterMeta(stats.code);
  const unit = stats.unit || meta?.unit || '';
  const notes = meta?.notes ? [meta.notes] : [];
  return [
    ...notes,
    'POWER values are satellite/re-analysis estimates for a grid cell (≈0.5° × 0.625°), not station measurements.',
    `This is a descriptive statistic of the retrieved ${stats.count}-month series in ${unit}; no statistical significance test, seasonal decomposition or attribution has been applied.`,
    'A short record (a few years) cannot separate a long-term climate signal from interannual variability such as ENSO or monsoon variation.'
  ];
}

export function layerCoverageLine(layer: GibsLayerMeta, domain: GibsDomain | null): string {
  return describeCoverage(domain) || 'observation-date coverage not retrieved';
}

/**
 * Deterministic answer used when the AI service is unavailable, or when the
 * user explicitly selects "local analysis". It answers only what the retrieved
 * bundle supports and says so otherwise.
 */
export function buildLocalAnalystAnswer(question: string, context: AnalystContext): AnalystAnswer {
  const verified: string[] = [];
  const derived: string[] = [];
  const interpretation: string[] = [];
  const limitations: string[] = [];
  const gaps: string[] = [...context.dataGaps];

  verified.push(
    `Study area: ${context.areaLabel} at ${fmt(context.latitude, 4)}°, ${fmt(context.longitude, 4)}° (WGS84). ` +
      `Date(s) in view: ${context.dates.length ? context.dates.join(', ') : 'none selected'}.`
  );

  if (context.layers.length) {
    for (const layer of context.layers) {
      const availability = layer.availability;
      const coverage = layer.coverage ? ` Reported coverage: ${layer.coverage}.` : ' Coverage not retrieved.';
      const availabilityText = availability
        ? availability.verdict === 'available'
          ? ` Status for ${availability.requestedDate}: reported as available.`
          : availability.verdict === 'outside-domain'
            ? ` Status for ${availability.requestedDate}: outside the reported observation domain${
                availability.nearestDate ? ` (nearest reported date ${availability.nearestDate})` : ''
              }.`
            : ` Status for ${availability.requestedDate}: unverified (domain unavailable).`
        : '';
      verified.push(`Active dataset: ${layer.title} [${layer.id}].${coverage}${availabilityText}`);
      limitations.push(`${layer.title}: ${layerLimitation(layer.id)}`);
    }
  } else {
    gaps.push('No imagery layer is selected, so no imagery statements can be made.');
  }

  if (context.power) {
    verified.push(
      `NASA POWER monthly archive retrieved for ${context.power.placeLabel} ` +
        `(${fmt(context.power.latitude, 3)}°, ${fmt(context.power.longitude, 3)}°): ${context.power.rows} monthly records` +
        (context.power.firstMonth && context.power.lastMonth ? `, ${context.power.firstMonth} → ${context.power.lastMonth}.` : '.')
    );
    for (const stats of context.power.stats) {
      const lines = describeSeries(stats);
      verified.push(lines[0]);
      if (lines[1]) derived.push(lines[1]);
      limitations.push(...seriesLimitations(stats));
    }
    if (context.power.unavailable.length) {
      gaps.push(
        `POWER did not return usable values for: ${context.power.unavailable.join(', ')}. These variables are reported as unavailable rather than estimated.`
      );
    }
  } else {
    gaps.push('No POWER monthly archive was retrieved for this area, so no climate-series statement can be made.');
  }

  const intent = classifyQuestion(question);
  if (intent === 'trend') {
    interpretation.push(
      'Trend questions can only be answered descriptively from the retrieved series: the slope above describes the direction of annual means over the retrieved window. Without significance testing, a change-point analysis and a longer baseline, it must not be presented as a verified climate trend.'
    );
  } else if (intent === 'imagery') {
    interpretation.push(
      'Two images are not proof of a trend. True-colour imagery is a rendering of reflectance; differences between dates can be caused by cloud, sun angle, aerosols, sensor and processing changes, or an actual surface change — a single pair cannot distinguish these.'
    );
  } else if (intent === 'fire') {
    interpretation.push(
      'Thermal-anomaly layers show individual detections with confidence classes. They are not burned area, fire size, or severity, and the count of detections cannot be read from the rendered raster.'
    );
  } else if (intent === 'flood') {
    interpretation.push(
      'The flood layer marks surface water at 250 m resolution; it misses small or short-lived flooding, can be confused by cloud shadow and sediment, and is not an official flood warning.'
    );
  } else {
    interpretation.push(
      'Interpretation is limited to reasoning over the values listed above; the Lab does not add external claims about this area.'
    );
  }

  limitations.push(
    'This answer was produced locally from the retrieved bundle without a language model: it restates retrieved values and documented dataset limitations only.'
  );

  const sources: AnalystSource[] = context.layers
    .filter((layer) => layer.provenanceUrl)
    .map((layer) => ({
      label: `NASA GIBS — ${layer.id}`,
      url: layer.provenanceUrl as string,
      retrievedAt: new Date().toISOString(),
      detail: 'OGC WMTS DescribeDomains request for the displayed observation-date domain'
    }));
  if (context.power) {
    sources.push({
      label: 'NASA POWER monthly point API',
      url: context.power.sourceUrl,
      retrievedAt: context.power.retrievedAt,
      detail: 'Monthly archived climate/land-surface parameters for the requested grid cell'
    });
  }
  if (context.domains.length) {
    for (const entry of context.domains) {
      if (!entry.domain) continue;
      sources.push({
        label: `GIBS reported coverage — ${entry.layerId}`,
        url: entry.domain.sourceUrl,
        retrievedAt: entry.domain.retrievedAt
      });
    }
  }

  return {
    sections: [
      { kind: 'verified', title: 'Verified observations (retrieved values)', bullets: verified },
      { kind: 'derived', title: 'Calculated from the retrieved values', bullets: derived.length ? derived : ['No derived statistic was requested for this selection.'] },
      { kind: 'interpretation', title: 'AI / analytical interpretation', bullets: interpretation },
      { kind: 'limitations', title: 'Limitations & uncertainty', bullets: dedupe(limitations).slice(0, 8) },
      { kind: 'gaps', title: 'Missing data', bullets: gaps.length ? dedupe(gaps) : ['Nothing required by this question was missing from the retrieved data.'] }
    ],
    sources,
    provider: 'local',
    generatedAt: new Date().toISOString(),
    groundedInRetrievedData: true
  };
}

function layerLimitation(layerId: string): string {
  // Imported lazily to avoid a circular import at module scope.
  const table: Record<string, string> = {
    MODIS_Terra_CorrectedReflectance_TrueColor:
      'true colour is a rendering of reflectance, not a calibrated measurement, and cloud cover limits single-date comparisons.',
    MODIS_Aqua_CorrectedReflectance_TrueColor:
      'true colour is a rendering of reflectance, not a calibrated measurement; afternoon overpass only.',
    VIIRS_SNPP_CorrectedReflectance_TrueColor: 'true colour rendering; cloud cover limits usefulness in the monsoon season.',
    VIIRS_NOAA20_CorrectedReflectance_TrueColor: 'true colour rendering; archive starts January 2018.',
    MODIS_Terra_NDVI_8Day:
      '8-day composites; NDVI saturates over dense tropical forest and GIBS currently publishes only a limited recent archive for this layer.',
    MODIS_Terra_Land_Surface_Temp_Day: 'skin temperature, not 2 m air temperature; cloud-masked.',
    'MODIS_Terra_L3_NDSI_Snow_Cover_Daily': 'classification layer; not snow-water equivalent.',
    'MODIS_Combined_Flood_2-Day': '250 m water detection; misses small/short floods; archive starts 2021.',
    'MODIS_Terra_L2_Chlorophyll_A': 'cloud, sun-glint and turbid water degrade retrievals; log-scaled palette.',
    GHRSST_L4_MUR_Sea_Surface_Temperature: 'L4 blended analysis (gap-filled), not a raw pixel measurement.',
    GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies: 'anomalies depend on the product climatology baseline.',
    MODIS_Terra_Cloud_Fraction_Day: 'single daytime snapshot per day, not a daily-mean cloud climatology.',
    MODIS_Terra_Aerosol: 'AOD is not a surface air-quality index and is unreliable over bright surfaces.',
    IMERG_Precipitation_Rate: 'satellite precipitation retrieval, not a rain gauge measurement.',
    VIIRS_SNPP_Thermal_Anomalies_375m_All: 'individual detections with confidence classes; not burned area or severity.',
    MODIS_Terra_Thermal_Anomalies_All: '1 km detections only; a missing detection is not proof that no fire occurred.',
    VIIRS_Black_Marble: 'annual 2012 and 2016 epochs with different processing; not pixel-comparable.'
  };
  return table[layerId] || 'see the dataset description for documented limitations.';
}

export function classifyQuestion(question: string): 'trend' | 'imagery' | 'fire' | 'flood' | 'general' {
  const q = question.toLowerCase();
  if (/(trend|increas|decreas|warming|cooling|change over|long.?term|climate|shift)/.test(q)) return 'trend';
  if (/(fire|burn|hotspot|thermal)/.test(q)) return 'fire';
  if (/(flood|inundation|water extent)/.test(q)) return 'flood';
  if (/(image|imagery|picture|satellite view|compare|before|after)/.test(q)) return 'imagery';
  return 'general';
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}

export interface SelectionSummaryInput {
  latitude: number;
  longitude: number;
  placeLabel: string;
  power: PowerDataset | null;
}

/** Compact, human readable summary of the currently retrieved climate archive. */
export function summarisePower(power: PowerDataset | null): string[] {
  if (!power) return ['No POWER archive retrieved.'];
  const lines: string[] = [];
  lines.push(
    `${power.placeLabel}: ${power.rows.length} monthly records, ${power.available.length} parameter(s) available` +
      (power.unavailable.length ? `, ${power.unavailable.length} unavailable` : '') +
      '.'
  );
  for (const code of power.available) {
    const stats = power.stats[code];
    if (!stats) continue;
    const meta = parameterMeta(code);
    lines.push(
      `${meta?.label || code}: mean ${fmt(stats.mean, 2)} ${stats.unit}` +
        (stats.max ? `, max ${fmt(stats.max.value, 2)} ${stats.unit} (${stats.max.date})` : '') +
        (stats.min ? `, min ${fmt(stats.min.value, 2)} ${stats.unit} (${stats.min.date})` : '')
    );
  }
  return lines;
}
