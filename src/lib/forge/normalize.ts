/**
 * NOVA HYPOTHESIS FORGE — universal data normalisation.
 *
 * One adapter per published payload shape. Every adapter:
 *  - parses timestamps and rewrites them as UTC ISO-8601 (`...Z`);
 *  - preserves the source value verbatim in `raw` and keeps the published unit;
 *  - maps the source's own fill/null markers to `missing: true` (no imputation,
 *    no forward fill, no interpolation);
 *  - carries the dataset id, official source URL, retrieval time and a payload
 *    hash into provenance;
 *  - keeps the original records separately from the processed values.
 *
 * If a payload does not match the shape the adapter expects, the adapter throws
 * `NormalisationError`. The connector turns that into an explicit `unavailable`
 * state — it never guesses what the payload meant.
 */

import { parsePowerResponse } from '../earth/power.ts';
import { hashString } from './interpreter';
import { datasetById } from './vocab';
import type {
  DataProvenance,
  NormalizedSeries,
  Observation,
  SourceStatus,
  VariableId,
} from './types';
import { missingReport } from './analysis';

export class NormalisationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NormalisationError';
  }
}

/** Fill / null markers used by the integrated providers. */
export const MISSING_SENTINELS = new Set<number>([-999, -9999, -99999, -1e31]);

export interface ParsedValue {
  value: number | null;
  missing: boolean;
  raw: string | null;
}

/**
 * Parse one published cell. Naive timestamps are treated as UTC because NOAA
 * SWPC documents its products in UTC; that assumption is recorded by the caller.
 */
export function parseValue(cell: unknown): ParsedValue {
  if (cell === null || cell === undefined) return { value: null, missing: true, raw: null };
  if (typeof cell === 'number') {
    if (!Number.isFinite(cell) || MISSING_SENTINELS.has(cell)) {
      return { value: null, missing: true, raw: String(cell) };
    }
    return { value: cell, missing: false, raw: String(cell) };
  }
  if (typeof cell === 'string') {
    const trimmed = cell.trim();
    if (!trimmed || /^(null|nan|n\/a|na|undefined)$/i.test(trimmed)) {
      return { value: null, missing: true, raw: trimmed || null };
    }
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric) || MISSING_SENTINELS.has(numeric)) {
      return { value: null, missing: true, raw: trimmed };
    }
    return { value: numeric, missing: false, raw: trimmed };
  }
  return { value: null, missing: true, raw: null };
}

/** Parse a UTC timestamp from the formats these services publish. */
export function parseUtcTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  // "2024-05-10 12:00:00.000" → "2024-05-10T12:00:00.000Z"
  const normalised = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}Z`
    : trimmed;
  const ms = Date.parse(normalised);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** Header-indexed JSON table (SWPC's array-of-arrays products). */
export function tableRows(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new NormalisationError('Expected a non-empty array table.');
  }
  const first = payload[0];
  if (Array.isArray(first)) {
    const header = first.map((cell) => String(cell));
    if (header.length === 0) throw new NormalisationError('Table header is empty.');
    return payload.slice(1).map((row) => {
      const record: Record<string, unknown> = {};
      if (!Array.isArray(row)) throw new NormalisationError('Table row is not an array.');
      header.forEach((name, index) => {
        record[name] = row[index];
      });
      return record;
    });
  }
  if (typeof first === 'object' && first !== null) {
    return payload as Array<Record<string, unknown>>;
  }
  throw new NormalisationError('Unsupported table shape.');
}

export interface AdapterInput {
  payload: unknown;
  /** Raw response text, hashed for reproducibility. */
  payloadText: string;
  retrievedAt: string;
  sourceUrl: string;
}

function provenanceFor(
  datasetId: string,
  input: AdapterInput,
  observations: Observation[],
  processing: string[],
): DataProvenance {
  const dataset = datasetById(datasetId);
  if (!dataset) throw new NormalisationError(`Unknown dataset id ${datasetId}`);
  const times = observations
    .map((observation) => observation.time)
    .filter(Boolean)
    .sort();
  return {
    organisation: dataset.organisation,
    datasetId,
    datasetTitle: dataset.title,
    sourceUrl: input.sourceUrl,
    documentationUrl: dataset.documentationUrl,
    retrievedAt: input.retrievedAt,
    observationStart: times.length ? times[0] : null,
    observationEnd: times.length ? times[times.length - 1] : null,
    recordCount: observations.length,
    payloadHash: hashString(input.payloadText || JSON.stringify(input.payload ?? null)),
    processingHistory: ['fetched by server connector', ...processing, 'timestamps normalised to UTC'],
    attribution: dataset.attribution,
  };
}

function buildSeries(options: {
  datasetId: string;
  variableId: string;
  label: string;
  unit: string;
  cadence: string;
  observations: Observation[];
  input: AdapterInput;
  processing: string[];
  rawRecords?: unknown;
  status?: SourceStatus;
}): NormalizedSeries {
  const dataset = datasetById(options.datasetId);
  if (!dataset) throw new NormalisationError(`Unknown dataset id ${options.datasetId}`);
  const times = options.observations.map((observation) => observation.time);
  const values = options.observations.map((observation) => observation.value);
  const missing = missingReport(times, values);
  return {
    id: `${options.datasetId}:${options.variableId}`,
    datasetId: options.datasetId,
    variableId: options.variableId,
    label: options.label,
    unit: options.unit,
    cadence: options.cadence,
    observations: options.observations,
    missing: {
      count: missing.missing,
      fraction: missing.fraction,
      expected: missing.expected,
      method: missing.method,
    },
    provenance: provenanceFor(options.datasetId, options.input, options.observations, options.processing),
    status: options.status ?? 'live',
    rawRecords: options.rawRecords,
  };
}

/* --------------------------------------------------------------- NOAA SWPC */

export function normaliseKp(input: AdapterInput): NormalizedSeries[] {
  const rows = tableRows(input.payload);
  const observations: Observation[] = [];
  for (const row of rows) {
    const time = parseUtcTimestamp(row.time_tag ?? row.time ?? row[Object.keys(row)[0]]);
    if (!time) continue;
    const parsed = parseValue(row.Kp ?? row.kp ?? row.kp_index);
    observations.push({ time, value: parsed.value, unit: 'Kp', missing: parsed.missing, raw: parsed.raw });
  }
  observations.sort((a, b) => a.time.localeCompare(b.time));
  if (observations.length === 0) {
    throw new NormalisationError('No rows with a usable timestamp and Kp value.');
  }
  return [
    buildSeries({
      datasetId: 'noaa-swpc-kp',
      variableId: 'kp',
      label: 'Planetary K index (Kp)',
      unit: 'Kp',
      cadence: '3 h',
      observations,
      input,
      processing: [`parsed ${rows.length} SWPC table rows`],
      rawRecords: input.payload,
    }),
  ];
}

const MAG_COLUMNS: Array<{ variable: VariableId; column: string; unit: string; label: string }> = [
  { variable: 'bz_gsm', column: 'bz_gsm', unit: 'nT', label: 'IMF Bz (GSM)' },
  { variable: 'bt', column: 'bt', unit: 'nT', label: 'IMF magnitude (Bt)' },
];

const PLASMA_COLUMNS: Array<{ variable: VariableId; column: string; unit: string; label: string }> = [
  { variable: 'solar_wind_speed', column: 'speed', unit: 'km/s', label: 'Solar wind speed' },
  { variable: 'proton_density', column: 'density', unit: 'p/cm³', label: 'Proton density' },
];

function normaliseSolarWindColumns(
  input: AdapterInput,
  columns: typeof MAG_COLUMNS,
  kind: string,
): NormalizedSeries[] {
  const rows = tableRows(input.payload);
  return columns.map((column) => {
    const observations: Observation[] = [];
    for (const row of rows) {
      const time = parseUtcTimestamp(row.time_tag ?? row.time);
      if (!time) continue;
      const parsed = parseValue(row[column.column]);
      observations.push({
        time,
        value: parsed.value,
        unit: column.unit,
        missing: parsed.missing,
        raw: parsed.raw,
      });
    }
    observations.sort((a, b) => a.time.localeCompare(b.time));
    if (observations.length === 0) {
      throw new NormalisationError(`No usable ${kind} rows for ${column.column}.`);
    }
    return buildSeries({
      datasetId: 'noaa-swpc-solar-wind',
      variableId: column.variable,
      label: column.label,
      unit: column.unit,
      cadence: '~1 min',
      observations,
      input,
      processing: [`parsed ${rows.length} SWPC ${kind} table rows`],
      rawRecords: input.payload,
    });
  });
}

export function normaliseSolarWind(input: AdapterInput): NormalizedSeries[] {
  const rows = tableRows(input.payload);
  const hasMag = rows.some((row) => 'bz_gsm' in row || 'bt' in row);
  const hasPlasma = rows.some((row) => 'speed' in row || 'density' in row);
  if (!hasMag && !hasPlasma) {
    throw new NormalisationError('Solar-wind table has neither magnetometer nor plasma columns.');
  }
  return hasMag
    ? normaliseSolarWindColumns(input, MAG_COLUMNS, 'magnetometer')
    : normaliseSolarWindColumns(input, PLASMA_COLUMNS, 'plasma');
}

export function normaliseSolarWindPair(
  magInput: AdapterInput,
  plasmaInput: AdapterInput,
): NormalizedSeries[] {
  const series: NormalizedSeries[] = [];
  try {
    series.push(...normaliseSolarWindColumns(magInput, MAG_COLUMNS, 'magnetometer'));
  } catch {
    /* reported by the caller through the returned array length */
  }
  try {
    series.push(...normaliseSolarWindColumns(plasmaInput, PLASMA_COLUMNS, 'plasma'));
  } catch {
    /* ditto */
  }
  if (series.length === 0) throw new NormalisationError('Neither solar-wind table could be parsed.');
  return series;
}

/* ---------------------------------------------------------------- NASA DONKI */

export interface DonkiEvent {
  id: string;
  type: string;
  startTime: string;
  note: string;
}

/** DONKI notifications (curated text) plus CME catalogue speeds. */
export function normaliseDonki(
  notificationsInput: AdapterInput,
  cmeInput: AdapterInput | null,
  language: 'en' | 'si' | 'ta',
): { series: NormalizedSeries[]; events: DonkiEvent[] } {
  const notifications = Array.isArray(notificationsInput.payload) ? notificationsInput.payload : [];
  const events: DonkiEvent[] = [];
  for (const raw of notifications) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const time = parseUtcTimestamp(record.messageIssueTime ?? record.messageIssueTimeUtc);
    if (!time) continue;
    events.push({
      id: String(record.messageID ?? 'donki-notification'),
      type: String(record.messageType ?? 'notification'),
      startTime: time,
      note: String(record.messageBody ?? '').slice(0, 400),
    });
  }

  const cmeRecords = cmeInput && Array.isArray(cmeInput.payload) ? (cmeInput.payload as unknown[]) : [];
  const observations: Observation[] = [];
  for (const raw of cmeRecords) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const time = parseUtcTimestamp(record.startTime);
    if (!time) continue;
    const analyses = Array.isArray(record.cmeAnalyses) ? record.cmeAnalyses : [];
    const speedCandidate = analyses
      .map((analysis) => Number((analysis as Record<string, unknown>)?.speed))
      .find((value) => Number.isFinite(value) && value > 0);
    observations.push({
      time,
      value: Number.isFinite(speedCandidate as number) ? (speedCandidate as number) : null,
      unit: 'km/s',
      missing: !Number.isFinite(speedCandidate as number),
      raw: Number.isFinite(speedCandidate as number) ? String(speedCandidate) : null,
    });
    events.push({
      id: String(record.cmeID ?? 'cme'),
      type: 'CME',
      startTime: time,
      note: String(record.sourceLocation ?? ''),
    });
  }
  observations.sort((a, b) => a.time.localeCompare(b.time));

  const series: NormalizedSeries[] = [];
  if (observations.length > 0) {
    series.push(
      buildSeries({
        datasetId: 'nasa-donki',
        variableId: 'cme_speed',
        label: 'CME linear speed (model fit)',
        unit: 'km/s',
        cadence: 'event-based',
        observations,
        input: cmeInput as AdapterInput,
        processing: [
          `parsed ${notifications.length} notifications and ${cmeRecords.length} CME records`,
          'CME speeds are model fits, not in-situ measurements',
        ],
        rawRecords: cmeInput ? cmeInput.payload : null,
      }),
    );
  } else {
    // Events without any numeric CME speed are still evidence of activity, but
    // there is no measurement, so no series is invented.
    series.push(
      buildSeries({
        datasetId: 'nasa-donki',
        variableId: 'event_count',
        label: 'DONKI events (no numeric speed published)',
        unit: 'events',
        cadence: 'event-based',
        observations: events.map((event) => ({
          time: event.startTime,
          value: 1,
          unit: 'events',
          missing: false,
          raw: event.type,
        })),
        input: notificationsInput,
        processing: [`parsed ${events.length} DONKI notifications`, language === 'en' ? 'no numeric speed available' : 'no numeric speed available'],
        rawRecords: notificationsInput.payload,
        status: 'partial',
      }),
    );
  }
  return { series, events };
}

/* ----------------------------------------------------------------- NASA NeoWs */

/** NeoWs close-approach feed. One observation per object, per variable. */
export function normaliseNeoWs(input: AdapterInput): NormalizedSeries[] {
  const payload = input.payload as Record<string, unknown> | null;
  const byDate = payload && typeof payload === 'object' ? (payload.near_earth_objects as Record<string, unknown>) : null;
  if (!byDate || typeof byDate !== 'object') {
    throw new NormalisationError('NeoWs payload has no near_earth_objects block.');
  }
  const miss: Observation[] = [];
  const diameter: Observation[] = [];
  for (const objects of Object.values(byDate)) {
    if (!Array.isArray(objects)) continue;
    for (const raw of objects) {
      if (!raw || typeof raw !== 'object') continue;
      const object = raw as Record<string, any>;
      const approach = Array.isArray(object.close_approach_data) ? object.close_approach_data[0] : null;
      const time = parseUtcTimestamp(approach?.close_approach_date_full ?? approach?.close_approach_date);
      if (!time) continue;
      const distanceAu = parseValue(approach?.miss_distance?.astronomical);
      const diameterKm = parseValue(
        object.estimated_diameter?.kilometers?.estimated_diameter_max ?? null,
      );
      miss.push({
        time,
        value: distanceAu.value,
        unit: 'au',
        missing: distanceAu.missing,
        raw: distanceAu.raw,
      });
      diameter.push({
        time,
        value: diameterKm.value,
        unit: 'km',
        missing: diameterKm.missing,
        raw: diameterKm.raw,
      });
    }
  }
  if (miss.length === 0) throw new NormalisationError('NeoWs payload contained no dated close approaches.');
  const sortByTime = (observations: Observation[]) =>
    observations.slice().sort((a, b) => a.time.localeCompare(b.time));
  return [
    buildSeries({
      datasetId: 'nasa-neows',
      variableId: 'asteroid_miss_distance',
      label: 'Close-approach miss distance',
      unit: 'au',
      cadence: 'event-based',
      observations: sortByTime(miss),
      input,
      processing: [`parsed ${miss.length} close approaches`],
      rawRecords: input.payload,
    }),
    buildSeries({
      datasetId: 'nasa-neows',
      variableId: 'asteroid_diameter',
      label: 'Estimated asteroid diameter',
      unit: 'km',
      cadence: 'event-based',
      observations: sortByTime(diameter),
      input,
      processing: ['diameters are estimates derived from absolute magnitude and assumed albedo'],
      rawRecords: input.payload,
    }),
  ];
}

/* ---------------------------------------------------------------- NASA POWER */

export function normalisePower(input: AdapterInput, variable: 'temperature' | 'precipitation'): NormalizedSeries {
  const code = variable === 'temperature' ? 'T2M' : 'PRECTOTCORR';
  // Request both core parameters so a month whose requested value is a fill
  // sentinel is still present in the grid and reported as missing.
  const parsed = parsePowerResponse(input.payload, ['T2M', 'PRECTOTCORR']);
  if (parsed.rows.length === 0) {
    throw new NormalisationError('POWER payload contained no monthly rows.');
  }
  const unit = variable === 'temperature' ? '°C' : 'mm/day';
  const observations: Observation[] = parsed.rows.map((row) => {
    const value = row.values[code];
    return {
      time: new Date(Date.UTC(row.year, row.month - 1, 1, 0, 0, 0, 0)).toISOString(),
      value: typeof value === 'number' ? value : null,
      unit,
      missing: typeof value !== 'number',
      raw: typeof value === 'number' ? String(value) : null,
      quality: 'monthly grid-cell mean',
    };
  });
  return buildSeries({
    datasetId: 'nasa-power',
    variableId: variable,
    label: variable === 'temperature' ? 'Air temperature at 2 m' : 'Precipitation rate',
    unit,
    cadence: '1 month',
    observations,
    input,
    processing: [
      `parsed ${parsed.rows.length} monthly POWER cells`,
      `requested parameter ${code}`,
      'POWER values are re-analysis grid estimates, not station measurements',
    ],
    rawRecords: input.payload,
  });
}

/* ------------------------------------------------------------ ISS / TLE feed */

/** Derive a mean altitude from a TLE using the vis-viva relation. */
export function normaliseTle(input: AdapterInput): NormalizedSeries[] {
  const payload = input.payload as Record<string, unknown> | null;
  const line1 = typeof payload?.line1 === 'string' ? payload.line1 : '';
  const line2 = typeof payload?.line2 === 'string' ? payload.line2 : '';
  if (!line1 || !line2) throw new NormalisationError('TLE payload lacks line1/line2.');
  const meanMotion = Number(line2.slice(52, 63));
  if (!Number.isFinite(meanMotion) || meanMotion <= 0) {
    throw new NormalisationError('TLE mean motion could not be parsed.');
  }
  // Kepler's third law for the semi-major axis: a = (μ (T/2π)²)^(1/3)
  const MU_EARTH = 398600.4418; // km³/s²
  const periodSeconds = 86_400 / meanMotion;
  const semiMajor = Math.cbrt(MU_EARTH * (periodSeconds / (2 * Math.PI)) ** 2);
  // Mean Earth radius used by the WGS-84 mean (6371 km); reported as derived.
  const altitude = semiMajor - 6371;
  const epoch = line1.slice(18, 32).trim();
  const epochYear = Number(epoch.slice(0, 2));
  const dayOfYear = Number(epoch.slice(2));
  const year = epochYear < 57 ? 2000 + epochYear : 1900 + epochYear;
  const epochDate = Number.isFinite(year) && Number.isFinite(dayOfYear)
    ? new Date(Date.UTC(year, 0, 1) + (dayOfYear - 1) * 86_400_000)
    : null;
  if (!epochDate || !Number.isFinite(epochDate.getTime())) {
    throw new NormalisationError('TLE epoch could not be parsed.');
  }
  const observation: Observation = {
    time: epochDate.toISOString(),
    value: Number(altitude.toFixed(1)),
    unit: 'km',
    missing: false,
    raw: String(altitude.toFixed(1)),
    quality: 'derived from TLE mean motion via Kepler’s third law',
  };
  return [
    buildSeries({
      datasetId: 'nova-iss-tle',
      variableId: 'orbital_altitude',
      label: 'Derived ISS altitude',
      unit: 'km',
      cadence: 'TLE epoch',
      observations: [observation],
      input,
      processing: [
        'parsed TLE mean motion',
        'derived semi-major axis with Kepler’s third law (μ = 398600.4418 km³/s²)',
        'derived value, not a direct measurement',
      ],
      rawRecords: input.payload,
    }),
  ];
}

/** APOD adapter: produces a single dated record with no numeric measurement. */
export function normaliseApod(input: AdapterInput): NormalizedSeries[] {
  const payload = input.payload as Record<string, unknown> | null;
  const date = parseUtcTimestamp(payload?.date);
  if (!date) throw new NormalisationError('APOD payload has no usable date.');
  return [
    buildSeries({
      datasetId: 'nasa-apod',
      variableId: 'record_count',
      label: 'APOD editorial record',
      unit: 'records',
      cadence: '1 day',
      observations: [{ time: date, value: 1, unit: 'records', missing: false, raw: 'present' }],
      input,
      processing: ['APOD is editorial content; no numeric measurement is extracted'],
      rawRecords: input.payload,
      status: 'partial',
    }),
  ];
}

/** Mars rover photos adapter: count of images for the date, no measurement. */
export function normaliseMarsPhotos(input: AdapterInput, date: string): NormalizedSeries[] {
  const payload = input.payload as Record<string, unknown> | null;
  const photos = Array.isArray(payload?.photos) ? payload.photos : [];
  const time = parseUtcTimestamp(`${date}T12:00:00Z`) ?? parseUtcTimestamp(date);
  if (!time) throw new NormalisationError('Mars photo request had no valid date.');
  return [
    buildSeries({
      datasetId: 'nasa-mars-photos',
      variableId: 'image_count',
      label: 'Rover images available for the date',
      unit: 'images',
      cadence: '1 sol',
      observations: [
        { time, value: photos.length, unit: 'images', missing: false, raw: String(photos.length) },
      ],
      input,
      processing: ['counted returned image records; no surface measurement is derived'],
      rawRecords: photos.slice(0, 5),
      status: photos.length === 0 ? 'partial' : 'live',
    }),
  ];
}
