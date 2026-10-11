/**
 * Shared types for the Earth Intelligence Lab data layer.
 *
 * Every value that reaches the UI is wrapped in a `Sourced<T>` envelope so the
 * interface can always show provider, dataset, observation date, retrieval
 * timestamp and the data status. Nothing in this project presents a number
 * without its provenance.
 */

/** Where a value came from and how fresh it is. */
export type DataStatus =
  | 'live' // retrieved from the provider during this session
  | 'cached' // retrieved earlier from the provider, served from local cache
  | 'derived' // computed by this application from retrieved values
  | 'unavailable' // provider reported no data / request failed
  | 'not-configured'; // provider requires a key that is not configured

export interface Provenance {
  /** Human readable dataset name. */
  dataset: string;
  /** Providing organisation, e.g. "NASA EOSDIS GIBS". */
  provider: string;
  /** Machine readable dataset / layer identifier. */
  datasetId: string;
  /** Canonical service URL or documentation URL used for this value. */
  sourceUrl: string;
  /** Observation / acquisition date (ISO `YYYY-MM-DD`) when applicable. */
  observationDate?: string;
  /** When the client or server retrieved this value (ISO timestamp). */
  retrievedAt: string;
  /** Temporal coverage reported by the provider, when known. */
  coverage?: string;
  /** Unit string, e.g. "°C" or "mm/day". */
  unit?: string;
  /** Spatial coverage / resolution note. */
  resolution?: string;
  /** True when the value was served from a local cache. */
  fromCache?: boolean;
  /** Free-form status note surfaced in the UI. */
  note?: string;
}

export interface Sourced<T> {
  data: T | null;
  status: DataStatus;
  provenance: Provenance;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* GIBS catalog                                                        */
/* ------------------------------------------------------------------ */

export type GibsService = 'wmts' | 'wms';
export type GibsCategory = 'true-color' | 'vegetation' | 'atmosphere' | 'ocean' | 'fire' | 'land' | 'night';

export interface GibsLayerMeta {
  /** GIBS visualization identifier (validated against the GIBS endpoint). */
  id: string;
  title: string;
  /** Short description shown in the layer selector. */
  summary: string;
  category: GibsCategory;
  /** WMTS service when the layer has pre-generated tiles, `wms` for vector-derived layers. */
  service: GibsService;
  /** Tile matrix set for EPSG:3857 (WMTS layers). */
  tileMatrixSet?: string;
  /** Default tile/image format extension. Validated by a live probe at runtime. */
  format: 'jpg' | 'png';
  /** Native imagery resolution description. */
  resolution: string;
  /** `daily`, `8-day`, `monthly`, `annual`, `subdaily` … */
  period: string;
  /** Platform / instrument. */
  platform: string;
  instrument: string;
  /** Science parameter measured by the visualization. */
  parameter: string;
  /** Units of the underlying measurement, when the visualization encodes one. */
  unit?: string;
  /** What the dataset supports scientifically. */
  appropriateFor: string[];
  /** What the dataset must not be used for. */
  limitations: string;
  /** How this entry was validated. */
  verification: 'describe-domains' | 'catalog';
  /** Date the verification was performed. */
  verifiedOn: string;
  /** Higher = suggested first in the layer list. */
  priority?: number;
}

export interface GibsTimeRange {
  /** Inclusive ISO start date. */
  start: string;
  /** Inclusive ISO end date. */
  end: string;
  /** ISO 8601 duration descriptor from the service, e.g. `P1D`, `P1Y`. */
  period?: string;
}

export interface GibsDomain {
  layerId: string;
  tileMatrixSet?: string;
  /** Ranges reported by GIBS DescribeDomains, ordered by start date. */
  ranges: GibsTimeRange[];
  /** Earliest reported observation date. */
  minDate: string | null;
  /** Latest reported observation date. */
  maxDate: string | null;
  retrievedAt: string;
  fromCache: boolean;
  /** Service URL that produced this domain. */
  sourceUrl: string;
}

export type DateAvailability =
  | 'available'
  | 'outside-domain'
  | 'unknown';

export interface AvailabilityVerdict {
  layerId: string;
  requestedDate: string;
  verdict: DateAvailability;
  /** Nearest reported date inside the domain (used to offer a jump). */
  nearestDate: string | null;
  /** Ranges that contain the requested date (usually 0 or 1). */
  matches: GibsTimeRange[];
  domain: GibsDomain | null;
  /** Explanation surfaced to the user. */
  detail: string;
}

/* ------------------------------------------------------------------ */
/* NASA POWER                                                          */
/* ------------------------------------------------------------------ */

export interface PowerParameterMeta {
  /** POWER parameter code, e.g. `T2M`. */
  code: string;
  label: string;
  unit: string;
  /** Chart/axis family; drives formatting and axis selection. */
  kind: 'temperature' | 'precipitation' | 'humidity' | 'wind' | 'radiation' | 'cloud' | 'soil';
  /** Part of the conservative core request that always ships. */
  core: boolean;
  /** Interpretation notes shown next to the chart. */
  notes: string;
}

export interface PowerMonthlyRow {
  /** `YYYY-MM` */
  date: string;
  year: number;
  month: number;
  /** Parameter code -> monthly value (null when the grid cell is missing). */
  values: Record<string, number | null>;
}

export interface PowerSeriesStats {
  code: string;
  unit: string;
  count: number;
  mean: number | null;
  min: { value: number; date: string } | null;
  max: { value: number; date: string } | null;
  /** Least-squares slope of annual means (per year) with the year span used. */
  trend: { slopePerYear: number; fromYear: number; toYear: number; years: number } | null;
  /** Annual aggregates built from complete calendar years only. */
  annual: { year: number; mean: number | null; total?: number | null; complete: boolean }[];
}

export interface PowerDataset {
  latitude: number;
  longitude: number;
  /** Area label used for the charts (POWER returns the nearest grid cell). */
  placeLabel: string;
  rows: PowerMonthlyRow[];
  /** Parameters that came back with at least one finite value. */
  available: string[];
  /** Requested parameters the service did not return usable values for. */
  unavailable: string[];
  requestedParameters: string[];
  startYear: number;
  endYear: number;
  /** POWER grid elevation of the returned cell, when provided. */
  elevationMeters?: number | null;
  /** Approximate POWER grid resolution description. */
  gridNote: string;
  /** Data source header reported by POWER (`header.title` / `header.source`). */
  serviceTitle?: string;
  serviceVersion?: string;
  stats: Record<string, PowerSeriesStats>;
}
