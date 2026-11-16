/**
 * NASA Space Apps Challenge Earth Science Resource Evaluation, Multi-Agency
 * Provenance Taxonomy, Native Format Parsers, and Statistical Adapter.
 *
 * Every resource carries:
 *   - Explicit agency classification ('nasa' | 'partner-agency' | 'research-institution')
 *   - Honest operational integration mode (never claiming an unauthenticated live API
 *     when upstream enforces Earthdata Login, API tokens, or batch queues)
 *   - Provider terms, rate-limit policy, units, spatial/temporal coverage, and
 *     retrieval timestamp tracking.
 */

import {
  computeSeriesCorrelation,
  mannKendallTest,
  pettittChangePointTest,
  seasonalMannKendallTest,
  type MannKendallResult,
  type PettittChangePointResult,
  type SeasonalMannKendallResult,
  type SeriesCorrelationResult
} from './climateStatistics';
import type { BoundingBox, PowerDataset } from './types';

export type AgencyCategory = 'nasa' | 'partner-agency' | 'research-institution' | 'community';

export type ResourceIntegrationMode =
  | 'live-keyless-api'
  | 'live-token-api'
  | 'portal-workflow-and-import';

export interface SpaceAppsResourceEvaluation {
  id:
    | 'nasa-power'
    | 'nasa-hydrology-rods'
    | 'nasa-giovanni'
    | 'nasa-appeears'
    | 'noaa-cdo'
    | 'knmi-climexp'
    | 'csa-swot';
  name: string;
  agencyLabel: string;
  agencyCategory: AgencyCategory;
  officialUrl: string;
  integrationMode: ResourceIntegrationMode;
  integrationBadge: string;
  usableApiSummary: string;
  authRequirement: string;
  rateLimitPolicy: string;
  spatialTemporalCoverage: string;
  primaryVariables: string[];
  cosmoraCapabilities: string[];
  limitationsNote: string;
}

export const SPACE_APPS_RESOURCE_MATRIX: SpaceAppsResourceEvaluation[] = [
  {
    id: 'nasa-power',
    name: 'NASA POWER (Climate & MERRA-2 Land Hydrology)',
    agencyLabel: 'NASA Langley Research Center (LaRC) / GMAO MERRA-2',
    agencyCategory: 'nasa',
    officialUrl: 'https://power.larc.nasa.gov/',
    integrationMode: 'live-keyless-api',
    integrationBadge: 'Live Keyless NASA API (Primary)',
    usableApiSummary:
      'Public synchronous REST JSON endpoint (/api/temporal/monthly/point) providing historical temperature, bias-corrected precipitation, radiation, humidity, wind, and MERRA-2 surface & root-zone soil wetness.',
    authRequirement: 'None (keyless public NASA API)',
    rateLimitPolicy: 'Server-cached (6 h TTL) + 60 req/min proxy guard; progressive fallback to core parameters.',
    spatialTemporalCoverage: 'Global ~0.5° × 0.625° grid · Monthly archive 1981–present',
    primaryVariables: [
      'T2M (°C)',
      'T2M_MAX / T2M_MIN (°C)',
      'PRECTOTCORR (mm/day)',
      'GWETTOP Surface Soil Wetness (0–1)',
      'GWETROOT Root-Zone Soil Wetness (0–1)',
      'RH2M (%)',
      'ALLSKY_SFC_SW_DWN (kWh/m²/day)'
    ],
    cosmoraCapabilities: [
      'Live point time-series retrieval & caching',
      'Mann–Kendall (Hamed–Rao), Seasonal Mann–Kendall & Pettitt change-point tests',
      'WMO/Gamma SPI-12 drought/wetness index & soil-moisture coupling',
      'Multi-location comparison & AI Analyst grounding'
    ],
    limitationsNote:
      'Represents ~55 km grid-cell satellite/reanalysis averages rather than homogenized single-point rain-gauge readings.'
  },
  {
    id: 'nasa-hydrology-rods',
    name: 'NASA GES DISC Hydrology Time Series (Data Rods)',
    agencyLabel: 'NASA Goddard Earth Sciences DISC (GLDAS / NLDAS / IMERG)',
    agencyCategory: 'nasa',
    officialUrl: 'https://disc.gsfc.nasa.gov/information/tools?title=Hydrology%20Time%20Series',
    integrationMode: 'live-token-api',
    integrationBadge: 'Server Proxy (Earthdata Token) + Native asc2 Importer',
    usableApiSummary:
      'GES DISC timeseries.cgi serves GLDAS-2.1 / IMERG hydrological data rods in WaterML and ASCII (asc2). Modern EOSDIS endpoints enforce Earthdata Login bearer tokens on many collections.',
    authRequirement:
      'Optional server EARTHDATA_BEARER_TOKEN for direct proxy retrieval; zero-auth URL generator & asc2 file import always available.',
    rateLimitPolicy: 'Strict 1 req / 2 s upstream throttle + 6 h server cache; never scrapes HTML.',
    spatialTemporalCoverage: 'Global land 0.25° × 0.25° (GLDAS-2.1 Noah) · Monthly 2000–present',
    primaryVariables: [
      'SoilMoi0_10cm_inst (kg/m²)',
      'Qs_acc Surface Runoff (kg/m²)',
      'Evap_tavg Evapotranspiration (kg/m²/s)',
      'Rainf_f_tavg Precipitation Rate (kg/m²/s)'
    ],
    cosmoraCapabilities: [
      'GET /api/earth/hydrology/gesdisc proxy with asc2 parser',
      'Direct GES DISC Data Rod URL builder for active COSMORA coordinates',
      'Client-side asc2 rod import into Mann–Kendall & POWER cross-correlation'
    ],
    limitationsNote:
      'Direct server fetch returns 503/401 setup guidance when EARTHDATA_BEARER_TOKEN is not configured; keyless MERRA-2 soil wetness (GWETTOP/GWETROOT) remains live via NASA POWER.'
  },
  {
    id: 'nasa-giovanni',
    name: 'NASA Giovanni Earth Science Portal',
    agencyLabel: 'NASA GES DISC',
    agencyCategory: 'nasa',
    officialUrl: 'https://giovanni.gsfc.nasa.gov/',
    integrationMode: 'portal-workflow-and-import',
    integrationBadge: 'Deep-Link Bookmark Builder + Giovanni CSV Importer',
    usableApiSummary:
      'Interactive web analysis environment (GPM IMERG, MERRA-2, MODIS, GLDAS). Backend job submission requires an authenticated NASA Earthdata Login browser/session workflow rather than an anonymous public JSON API.',
    authRequirement: 'NASA Earthdata Login required on giovanni.gsfc.nasa.gov (external portal)',
    rateLimitPolicy: 'No automated background scraping; deterministic #service=ArAvTs deep-link handoff + user CSV import.',
    spatialTemporalCoverage: 'Global bounding-box area-averaged series · Mission-dependent (1979–present)',
    primaryVariables: [
      'GPM_3IMERGDF_07_precipitation (mm/day)',
      'M2TMNXSLV_5_12_4_T2M (K / °C)',
      'GLDAS_NOAH025_M_2_1_SoilMoi0_10cm_inst (kg/m²)'
    ],
    cosmoraCapabilities: [
      '1-click Giovanni Area-Averaged Time Series deep-link synced to COSMORA bbox & dates',
      'Native Giovanni CSV parser (strips metadata preamble & fill flags) for local statistical testing'
    ],
    limitationsNote:
      'Not claimed as a background live API; Giovanni requires interactive Earthdata authentication.'
  },
  {
    id: 'nasa-appeears',
    name: 'NASA AppEEARS (LP DAAC Analysis Ready Samples)',
    agencyLabel: 'NASA Land Processes DAAC (USGS EROS)',
    agencyCategory: 'nasa',
    officialUrl: 'https://appeears.earthdatacloud.nasa.gov/',
    integrationMode: 'portal-workflow-and-import',
    integrationBadge: 'API v1 Point-Task Spec Generator + Results CSV Importer',
    usableApiSummary:
      'AppEEARS REST API (/api/v1/task) executes asynchronous batch extractions for MODIS, VIIRS, SMAP, and ECOSTRESS point/polygon samples and requires a 48-hour Earthdata Login token.',
    authRequirement: 'NASA Earthdata Login required to submit batch tasks on appeears.earthdatacloud.nasa.gov',
    rateLimitPolicy: 'Zero unauthenticated polling; generates compliant point-task JSON specs & parses exported *-results.csv files locally.',
    spatialTemporalCoverage: 'Global land 250 m – 9 km (MODIS / VIIRS / SMAP) · 2000–present',
    primaryVariables: [
      'MOD13Q1.061 250m 16-day NDVI',
      'MOD11A2.061 1km 8-day Land Surface Temperature (K)',
      'SPL3SMP_E.006 9km SMAP Soil Moisture (cm³/cm³)'
    ],
    cosmoraCapabilities: [
      'Downloadable AppEEARS API v1 point-sample task JSON prefilled with active coordinates & date window',
      'Native AppEEARS point CSV importer with fill-value filtering and monthly aggregation'
    ],
    limitationsNote:
      'Asynchronous batch service (minutes per job); COSMORA generates valid task specs and analyzes exported CSVs rather than blocking the UI.'
  },
  {
    id: 'noaa-cdo',
    name: 'NOAA Climate Data Online (CDO Web Services v2)',
    agencyLabel: 'Partner Agency · NOAA National Centers for Environmental Information (NCEI)',
    agencyCategory: 'partner-agency',
    officialUrl: 'https://www.ncei.noaa.gov/cdo-web/',
    integrationMode: 'live-token-api',
    integrationBadge: 'Live Partner-Agency REST Proxy (NOAA_CDO_TOKEN) + CSV Import',
    usableApiSummary:
      'Official synchronous REST API v2 (/cdo-web/api/v2/stations & /data) serving quality-controlled Global Summary of the Month (GSOM) meteorological station observations (including Sri Lankan WMO stations).',
    authRequirement: 'Free server-side NOAA_CDO_TOKEN header (ncei.noaa.gov/cdo-web/token); CSV import works without token.',
    rateLimitPolicy: 'Enforced 4 req/s token-bucket (< NOAA 5 req/s cap, 10,000/day) + 10-year chunking + 6 h cache.',
    spatialTemporalCoverage: 'Global land weather stations (point gauges) · Historical 1880s–present (station-dependent)',
    primaryVariables: [
      'TAVG Monthly Mean Station Temperature (°C)',
      'TMAX / TMIN Monthly Extreme Means (°C)',
      'PRCP Monthly Station Precipitation Total (mm)'
    ],
    cosmoraCapabilities: [
      'GET /api/earth/noaa/cdo nearest-station discovery & GSOM multi-decade series retrieval',
      'Side-by-side station-gauge (NOAA GSOM) vs gridded reanalysis (NASA POWER) comparison & correlation',
      'NOAA CDO CSV file importer'
    ],
    limitationsNote:
      'Station records can contain missing observation months and instrument relocations; coverage fraction is surfaced per station.'
  },
  {
    id: 'knmi-climexp',
    name: 'KNMI Climate Explorer',
    agencyLabel: 'Research Institution · Royal Netherlands Meteorological Institute (KNMI / WMO)',
    agencyCategory: 'research-institution',
    officialUrl: 'https://climexp.knmi.nl/',
    integrationMode: 'portal-workflow-and-import',
    integrationBadge: 'Allowlisted Teleconnection Index Fetch + Native KNMI .dat Parser',
    usableApiSummary:
      'Academic climate research workbench publishing century-scale ENSO (Niño 3.4), Indian Ocean Dipole (DMI), and station/gridded series in standard KNMI 12-month ASCII (.dat) format. Interactive CGI forms are not a commercial JSON API.',
    authRequirement: 'None for static reference .dat files & local .dat imports; polite academic fair-use.',
    rateLimitPolicy: 'Strict 1 req / 10 s throttle + 24 h server cache on allowlisted static .dat files only; zero CGI form scraping.',
    spatialTemporalCoverage: 'Basin-wide teleconnection indices (Pacific Niño 3.4, Tropical Indian Ocean DMI) · 1854–present',
    primaryVariables: [
      'Niño 3.4 SST Anomaly Index (°C)',
      'Indian Ocean Dipole Mode Index — DMI (°C)',
      'User-imported KNMI .dat monthly climate/hydrology tables'
    ],
    cosmoraCapabilities: [
      'GET /api/earth/knmi/index polite cached fetcher for Niño 3.4 & IOD DMI indices',
      'Full client-side KNMI .dat ASCII parser (12-column & 2-column tables, -999.9 / 3e33 missing flags)',
      'Autocorrelation-adjusted correlation (Bretherton N_eff) between ENSO/IOD and local rainfall/temperature'
    ],
    limitationsNote:
      'Statistical teleconnection correlation measures co-variability (e.g., IOD/ENSO phase vs Sri Lankan Maha rainfall) and does not imply deterministic seasonal forecasting.'
  },
  {
    id: 'csa-swot',
    name: 'CSA / NASA / CNES SWOT Surface Water & Ocean Topography',
    agencyLabel: 'Partner Mission · Canadian Space Agency (CSA) / NASA / CNES / UKSA',
    agencyCategory: 'partner-agency',
    officialUrl: 'https://www.asc-csa.gc.ca/eng/satellites/swot/',
    integrationMode: 'live-keyless-api',
    integrationBadge: 'Live Keyless SWOT Granule Discovery (NASA CMR) + CSA Mission Context',
    usableApiSummary:
      'SWOT Ka-band Radar Interferometer (KaRIn, launched Dec 2022) measures inland river/reservoir water-surface elevation and ocean SSH. CSA provides key KaRIn Extended Interaction Klystron (EIK) subsystem hardware; science granules are indexed publicly in NASA CMR.',
    authRequirement: 'None for NASA CMR granule discovery (/search/granules.json); Earthdata Login required only to download raw NetCDF/shapefiles from PO.DAAC.',
    rateLimitPolicy: '2 req/s server rate limit + 1 h granule metadata cache.',
    spatialTemporalCoverage: '78°S–78°N rivers (>100 m), lakes/reservoirs (>250 m)² & oceans · 21-day orbit cycle (2023–present)',
    primaryVariables: [
      'SWOT_L2_HR_LakeSP_2.0 (Inland Reservoir/Lake Polygons)',
      'SWOT_L2_HR_RiverSP_2.0 (River Reach Slope & Width)',
      'SWOT_L2_LR_SSH_2.0 (KaRIn Sea Surface Height)'
    ],
    cosmoraCapabilities: [
      'GET /api/earth/swot/granules live satellite pass & granule search over the active COSMORA bounding box',
      'Displays exact SWOT orbit cycle, pass number, acquisition timestamps, collection ID, and PO.DAAC / CSA links'
    ],
    limitationsNote:
      'CMR granule discovery confirms satellite pass coverage and metadata since 2023; short (<4 yr) SWOT records cannot support multi-decadal climate trend claims.'
  }
];

export interface ExternalMonthlyPoint {
  date: string; // YYYY-MM
  year: number;
  month: number;
  value: number;
}

export interface ExternalMonthlySeries {
  id: string;
  sourceId: SpaceAppsResourceEvaluation['id'] | 'custom-csv';
  title: string;
  variableLabel: string;
  unit: string;
  agencyLabel: string;
  agencyCategory: AgencyCategory;
  sourceUrl: string;
  retrievedAt: string;
  spatialNote: string;
  coverageStart: string | null;
  coverageEnd: string | null;
  points: ExternalMonthlyPoint[];
  notes?: string;
}

export interface ExternalSeriesAnalysis {
  series: ExternalMonthlySeries;
  completeYearsCount: number;
  mean: number | null;
  min: ExternalMonthlyPoint | null;
  max: ExternalMonthlyPoint | null;
  mannKendall: MannKendallResult;
  seasonalMannKendall: SeasonalMannKendallResult;
  pettitt: PettittChangePointResult;
  correlationWithPower: SeriesCorrelationResult | null;
  comparedPowerCode: string | null;
}

export interface SwotGranuleRecord {
  id: string;
  title: string;
  collectionShortName: string;
  productLabel: string;
  timeStart: string;
  timeEnd: string | null;
  cycleNumber: number | null;
  passNumber: number | null;
  downloadUrl: string | null;
   spatialSummary: string;
}

export interface SwotDiscoveryResult {
  bbox: BoundingBox;
  collection: string;
  totalHits: number;
  granules: SwotGranuleRecord[];
  agencyAttribution: string;
  csaReferenceUrl: string;
  sourceUrl: string;
  retrievedAt: string;
}

function round(val: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(val * f) / f;
}

function isMissingSentinel(v: number): boolean {
  if (!Number.isFinite(v)) return true;
  if (v <= -900 && (Math.abs(v + 999.9) < 1 || Math.abs(v + 999) < 1 || Math.abs(v + 9999) < 2 || v <= -9990)) {
    return true;
  }
  if (Math.abs(v) >= 1e19) return true;
  return false;
}

function aggregateByMonth(raw: Array<{ year: number; month: number; value: number }>): ExternalMonthlyPoint[] {
  const buckets = new Map<string, { year: number; month: number; sum: number; count: number }>();
  for (const item of raw) {
    if (item.month < 1 || item.month > 12 || item.year < 1700 || item.year > 2100) continue;
    if (isMissingSentinel(item.value)) continue;
    const key = `${item.year}-${String(item.month).padStart(2, '0')}`;
    const prev = buckets.get(key);
    if (prev) {
      prev.sum += item.value;
      prev.count += 1;
    } else {
      buckets.set(key, { year: item.year, month: item.month, sum: item.value, count: 1 });
    }
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      year: b.year,
      month: b.month,
      value: round(b.sum / b.count, 4)
    }));
}

/**
 * Parses NASA GES DISC Hydrology Data Rods `type=asc2` text output.
 */
export function parseGesDiscAsc2(
  rawText: string,
  metaOverride?: Partial<{
    sourceUrl: string;
    retrievedAt: string;
    latitude: number;
    longitude: number;
  }>
): ExternalMonthlySeries {
  const lines = rawText.split(/\r?\n/);
  const headerMap = new Map<string, string>();
  const samples: Array<{ year: number; month: number; value: number }> = [];
  let inData = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^data$/i.test(line) || /^date[\s,]+/i.test(line)) {
      inData = true;
      continue;
    }
    if (!inData && line.includes('=')) {
      const eq = line.indexOf('=');
      const k = line.slice(0, eq).trim().replace(/^#\s*/, '');
      const v = line.slice(eq + 1).trim();
      headerMap.set(k, v);
      continue;
    }
    const match = /^(\d{4})-(\d{2})(?:-\d{2}(?:[T\s][\d:Z+-]+)?)?[\s,;]+([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.exec(
      line
    );
    if (match) {
      inData = true;
      samples.push({
        year: Number(match[1]),
        month: Number(match[2]),
        value: Number(match[3])
      });
    }
  }

  const points = aggregateByMonth(samples);
  const shortName = headerMap.get('param_short_name') || 'GLDAS_Hydrology';
  const paramName = headerMap.get('param_name') || shortName;
  const unit = headerMap.get('unit') || headerMap.get('units') || 'model units';
  const lat = metaOverride?.latitude ?? Number(headerMap.get('lat'));
  const lon = metaOverride?.longitude ?? Number(headerMap.get('lon'));
  const spatialNote =
    Number.isFinite(lat) && Number.isFinite(lon)
      ? `GES DISC Data Rod point (${lat.toFixed(3)}°, ${lon.toFixed(3)}°)`
      : 'GES DISC Hydrology Data Rod point';

  return {
    id: `gesdisc-${shortName}-${Date.now()}`,
    sourceId: 'nasa-hydrology-rods',
    title: `NASA GES DISC Hydrology · ${paramName}`,
    variableLabel: `${paramName} (${shortName})`,
    unit,
    agencyLabel: 'NASA GES DISC (Hydrology Data Rods / GLDAS)',
    agencyCategory: 'nasa',
    sourceUrl:
      metaOverride?.sourceUrl || 'https://disc.gsfc.nasa.gov/information/tools?title=Hydrology%20Time%20Series',
    retrievedAt: metaOverride?.retrievedAt || new Date().toISOString(),
    spatialNote,
    coverageStart: points.length ? points[0].date : null,
    coverageEnd: points.length ? points[points.length - 1].date : null,
    points,
    notes: 'Aggregated to monthly means excluding fill/missing flags (-9999 / 9.999e20).'
  };
}

export interface NoaaStationMeta {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  datacoverage?: number;
  mindate?: string;
  maxdate?: string;
}

export interface NoaaGsomRecord {
  date: string;
  datatype: string;
  station: string;
  value: number;
  attributes?: string;
}

/**
 * Normalizes NOAA NCEI Climate Data Online (CDO v2) GSOM station observations.
 * Note: With `units=metric` on CDO v2 GSOM, TAVG/TMAX/TMIN are reported in °C
 * and PRCP is reported in total mm for the month.
 */
export function parseNoaaGsomSeries(args: {
  station: NoaaStationMeta;
  records: NoaaGsomRecord[];
  datatype: 'TAVG' | 'TMAX' | 'TMIN' | 'PRCP';
  sourceUrl: string;
  retrievedAt?: string;
}): ExternalMonthlySeries {
  const { station, records, datatype, sourceUrl } = args;
  const metaByCode: Record<string, { label: string; unit: string }> = {
    TAVG: { label: 'Station Monthly Mean Temperature (TAVG)', unit: '°C' },
    TMAX: { label: 'Station Monthly Mean Maximum Temperature (TMAX)', unit: '°C' },
    TMIN: { label: 'Station Monthly Mean Minimum Temperature (TMIN)', unit: '°C' },
    PRCP: { label: 'Station Monthly Total Precipitation (PRCP)', unit: 'mm/month' }
  };
  const info = metaByCode[datatype] || { label: datatype, unit: '' };

  const samples: Array<{ year: number; month: number; value: number }> = [];
  for (const rec of records) {
    if (rec.datatype !== datatype || typeof rec.value !== 'number' || !Number.isFinite(rec.value)) continue;
    const m = /^(\d{4})-(\d{2})/.exec(rec.date || '');
    if (!m) continue;
    samples.push({ year: Number(m[1]), month: Number(m[2]), value: rec.value });
  }

  const points = aggregateByMonth(samples);
  const elevText = typeof station.elevation === 'number' ? `, ${station.elevation} m` : '';
  const covText =
    typeof station.datacoverage === 'number' ? ` · reported coverage ${Math.round(station.datacoverage * 100)}%` : '';

  return {
    id: `noaa-${station.id}-${datatype}`,
    sourceId: 'noaa-cdo',
    title: `NOAA NCEI GSOM · ${station.name} (${station.id})`,
    variableLabel: info.label,
    unit: info.unit,
    agencyLabel: 'Partner Agency · NOAA National Centers for Environmental Information (NCEI)',
    agencyCategory: 'partner-agency',
    sourceUrl,
    retrievedAt: args.retrievedAt || new Date().toISOString(),
    spatialNote: `Ground station ${station.id} (${station.latitude.toFixed(3)}°, ${station.longitude.toFixed(3)}°${elevText}${covText})`,
    coverageStart: points.length ? points[0].date : null,
    coverageEnd: points.length ? points[points.length - 1].date : null,
    points,
    notes: 'In-situ weather station gauge observations from NOAA Global Summary of the Month (GSOM, metric units).'
  };
}

/**
 * Parses standard KNMI Climate Explorer ASCII `.dat` files:
 *   - 13-column monthly table: `YYYY v1 v2 v3 v4 v5 v6 v7 v8 v9 v10 v11 v12`
 *   - 3-column rows: `YYYY MM value`
 *   - 2-column decimal-year or YYYYMM rows: `YYYYMM value`
 */
export function parseKnmiAsciiSeries(
  rawText: string,
  metaOverride?: Partial<{
    title: string;
    variableLabel: string;
    unit: string;
    sourceUrl: string;
    retrievedAt: string;
    spatialNote: string;
  }>
): ExternalMonthlySeries {
  const lines = rawText.split(/\r?\n/);
  let detectedTitle = '';
  let detectedUnit = '';
  const samples: Array<{ year: number; month: number; value: number }> = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#') || line.startsWith('%')) {
      const comment = line.replace(/^[#%]\s*/, '').trim();
      const unitMatch = /\[([^\]]+)\]/.exec(comment);
      if (unitMatch && !detectedUnit) detectedUnit = unitMatch[1].trim();
      if (
        !detectedTitle &&
        comment.length > 4 &&
        !/^(institution|source|history|references|climexp|contact|file)/i.test(comment)
      ) {
        detectedTitle = comment.slice(0, 90);
      }
      continue;
    }

    const tokens = line.split(/\s+/).map(Number);
    if (tokens.some((n) => Number.isNaN(n))) continue;

    if (tokens.length >= 13 && Number.isInteger(tokens[0]) && tokens[0] >= 1700 && tokens[0] <= 2100) {
      const year = tokens[0];
      for (let m = 1; m <= 12; m += 1) {
        const val = tokens[m];
        if (!isMissingSentinel(val)) {
          samples.push({ year, month: m, value: val });
        }
      }
    } else if (
      tokens.length === 3 &&
      Number.isInteger(tokens[0]) &&
      tokens[0] >= 1700 &&
      tokens[0] <= 2100 &&
      tokens[1] >= 1 &&
      tokens[1] <= 12
    ) {
      if (!isMissingSentinel(tokens[2])) {
        samples.push({ year: tokens[0], month: tokens[1], value: tokens[2] });
      }
    } else if (tokens.length === 2 && tokens[0] >= 170001 && tokens[0] <= 210012) {
      const ym = Math.trunc(tokens[0]);
      const year = Math.floor(ym / 100);
      const month = ym % 100;
      if (month >= 1 && month <= 12 && !isMissingSentinel(tokens[1])) {
        samples.push({ year, month, value: tokens[1] });
      }
    }
  }

  const points = aggregateByMonth(samples);
  const title = metaOverride?.title || (detectedTitle ? `KNMI Climate Explorer · ${detectedTitle}` : 'KNMI Climate Explorer Series');
  return {
    id: `knmi-${Date.now()}`,
    sourceId: 'knmi-climexp',
    title,
    variableLabel: metaOverride?.variableLabel || detectedTitle || 'KNMI Monthly Index',
    unit: metaOverride?.unit || detectedUnit || 'index / anomaly',
    agencyLabel: 'Research Institution · KNMI (Royal Netherlands Meteorological Institute)',
    agencyCategory: 'research-institution',
    sourceUrl: metaOverride?.sourceUrl || 'https://climexp.knmi.nl/',
    retrievedAt: metaOverride?.retrievedAt || new Date().toISOString(),
    spatialNote: metaOverride?.spatialNote || 'KNMI Climate Explorer basin/station monthly series',
    coverageStart: points.length ? points[0].date : null,
    coverageEnd: points.length ? points[points.length - 1].date : null,
    points,
    notes: 'Parsed from KNMI ASCII (.dat) monthly format with missing-sentinel (-999.9 / 3e33) filtering.'
  };
}

function splitCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Auto-detects and parses exported CSV files from:
 *   - NASA Giovanni Area-Averaged Time Series
 *   - NASA LP DAAC AppEEARS Point Sample Results
 *   - NOAA Climate Data Online (CDO) Station CSV
 */
export function parseExternalTimeSeriesCsv(
  csvText: string,
  preferredColumn?: string
): ExternalMonthlySeries {
  const rawLines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const preambleNotes: string[] = [];
  let headerIdx = -1;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(rawLines.length, 60); i += 1) {
    const line = rawLines[i].trim();
    if (line.startsWith('#')) {
      preambleNotes.push(line.replace(/^#\s*/, ''));
      continue;
    }
    const cols = splitCsvRow(line);
    const hasDateCol = cols.some((c) => /^(time|date|datetime|year_month|yyyy-mm)$/i.test(c));
    if (cols.length >= 2 && hasDateCol) {
      headerIdx = i;
      headers = cols;
      break;
    }
    preambleNotes.push(line);
  }

  if (headerIdx === -1 || headers.length < 2) {
    throw new Error('Could not locate a CSV header row containing a Date or time column.');
  }

  const dateColIdx = headers.findIndex((c) => /^(time|date|datetime|year_month|yyyy-mm)$/i.test(c));
  const upperHeaders = headers.map((h) => h.toUpperCase());

  // Identify source provenance from header signatures
  const isNoaaCsv = upperHeaders.includes('STATION') && (upperHeaders.includes('PRCP') || upperHeaders.includes('TAVG') || upperHeaders.includes('TMAX'));
  const isAppeears = headers.some((h) => /MOD\d|MYD\d|VNP\d|SPL3|ECO/i.test(h)) || (upperHeaders.includes('LATITUDE') && upperHeaders.includes('LONGITUDE') && headers.some((h) => h.includes('__')));
  const isGiovanni =
    preambleNotes.some((p) => /giovanni|ges disc|area-averaged/i.test(p)) ||
    headers[dateColIdx].toLowerCase() === 'time';

  const excludedCols = new Set([
    dateColIdx,
    ...headers
      .map((h, idx) =>
        /^(id|category|station|name|latitude|longitude|elevation|tile|aid|qa|qc|quality|pixel_reliability|attributes|.*_attributes)$/i.test(h)
          ? idx
          : -1
      )
      .filter((idx) => idx >= 0)
  ]);

  let valueColIdx = preferredColumn ? headers.findIndex((h) => h === preferredColumn) : -1;
  if (valueColIdx < 0 || excludedCols.has(valueColIdx)) {
    valueColIdx = headers.findIndex((_, idx) => !excludedCols.has(idx));
  }
  if (valueColIdx < 0) {
    throw new Error('No numeric measurement column found in CSV.');
  }

  const chosenCol = headers[valueColIdx];
  const samples: Array<{ year: number; month: number; value: number }> = [];
  let stationLabel = '';

  for (let i = headerIdx + 1; i < rawLines.length; i += 1) {
    const cols = splitCsvRow(rawLines[i]);
    if (cols.length <= Math.max(dateColIdx, valueColIdx)) continue;
    const rawDate = cols[dateColIdx];
    const rawVal = Number(cols[valueColIdx]);
    if (!Number.isFinite(rawVal) || isMissingSentinel(rawVal) || rawVal <= -3000) continue;

    const m = /^(\d{4})[-/](\d{1,2})/.exec(rawDate);
    if (!m) continue;
    samples.push({ year: Number(m[1]), month: Number(m[2]), value: rawVal });

    if (isNoaaCsv && !stationLabel) {
      const nameIdx = upperHeaders.indexOf('NAME');
      const stIdx = upperHeaders.indexOf('STATION');
      stationLabel = [nameIdx >= 0 ? cols[nameIdx] : '', stIdx >= 0 ? cols[stIdx] : ''].filter(Boolean).join(' · ');
    }
  }

  const points = aggregateByMonth(samples);
  const unitMatch = /\(([^)]+)\)|\[([^\]]+)\]/.exec(chosenCol);
  const detectedUnit = unitMatch ? (unitMatch[1] || unitMatch[2]).trim() : isNoaaCsv && chosenCol.toUpperCase() === 'PRCP' ? 'mm' : isNoaaCsv ? '°C' : 'reported units';

  if (isAppeears) {
    return {
      id: `appeears-${chosenCol}-${Date.now()}`,
      sourceId: 'nasa-appeears',
      title: `NASA AppEEARS Point Sample · ${chosenCol}`,
      variableLabel: chosenCol,
      unit: detectedUnit,
      agencyLabel: 'NASA LP DAAC (AppEEARS Imported Sample)',
      agencyCategory: 'nasa',
      sourceUrl: 'https://appeears.earthdatacloud.nasa.gov/',
      retrievedAt: new Date().toISOString(),
      spatialNote: 'Imported AppEEARS point extraction CSV (aggregated to monthly mean)',
      coverageStart: points.length ? points[0].date : null,
      coverageEnd: points.length ? points[points.length - 1].date : null,
      points
    };
  }

  if (isNoaaCsv) {
    return {
      id: `noaa-csv-${chosenCol}-${Date.now()}`,
      sourceId: 'noaa-cdo',
      title: `NOAA CDO Station CSV · ${stationLabel || chosenCol}`,
      variableLabel: chosenCol,
      unit: detectedUnit,
      agencyLabel: 'Partner Agency · NOAA NCEI (Imported CDO CSV)',
      agencyCategory: 'partner-agency',
      sourceUrl: 'https://www.ncei.noaa.gov/cdo-web/',
      retrievedAt: new Date().toISOString(),
      spatialNote: stationLabel || 'Imported NOAA weather station CSV',
      coverageStart: points.length ? points[0].date : null,
      coverageEnd: points.length ? points[points.length - 1].date : null,
      points
    };
  }

  if (isGiovanni) {
    return {
      id: `giovanni-${chosenCol}-${Date.now()}`,
      sourceId: 'nasa-giovanni',
      title: `NASA Giovanni Area-Averaged Series · ${chosenCol}`,
      variableLabel: chosenCol,
      unit: detectedUnit,
      agencyLabel: 'NASA GES DISC (Giovanni Imported CSV)',
      agencyCategory: 'nasa',
      sourceUrl: 'https://giovanni.gsfc.nasa.gov/',
      retrievedAt: new Date().toISOString(),
      spatialNote: preambleNotes.find((p) => /region|bbox|bounding/i.test(p)) || 'Giovanni bounding-box area average',
      coverageStart: points.length ? points[0].date : null,
      coverageEnd: points.length ? points[points.length - 1].date : null,
      points
    };
  }

  return {
    id: `csv-${chosenCol}-${Date.now()}`,
    sourceId: 'custom-csv',
    title: `Imported Research CSV · ${chosenCol}`,
    variableLabel: chosenCol,
    unit: detectedUnit,
    agencyLabel: 'User-Imported External Time Series',
    agencyCategory: 'research-institution',
    sourceUrl: 'local-csv-import',
    retrievedAt: new Date().toISOString(),
    spatialNote: 'User-imported monthly/daily CSV (monthly aggregated)',
    coverageStart: points.length ? points[0].date : null,
    coverageEnd: points.length ? points[points.length - 1].date : null,
    points
  };
}

/**
 * Parses NASA Common Metadata Repository (CMR) `granules.json` entries for
 * the joint NASA / CNES / CSA / UKSA SWOT Surface Water & Ocean Topography mission.
 */
export function parseCmrSwotGranules(args: {
  cmrPayload: unknown;
  bbox: BoundingBox;
  collection: string;
  totalHits: number;
  sourceUrl: string;
  retrievedAt?: string;
}): SwotDiscoveryResult {
  const feedObj =
    typeof args.cmrPayload === 'object' && args.cmrPayload !== null && 'feed' in args.cmrPayload
      ? (args.cmrPayload as { feed?: { entry?: unknown[] } }).feed
      : undefined;
  const entries = Array.isArray(feedObj?.entry) ? feedObj!.entry : [];

  const productLabels: Record<string, string> = {
    'SWOT_L2_HR_LakeSP_2.0': 'SWOT Level-2 High-Rate Lake/Reservoir Single-Pass Vector Product v2.0',
    'SWOT_L2_HR_RiverSP_2.0': 'SWOT Level-2 High-Rate River Single-Pass Vector Product v2.0',
    'SWOT_L2_LR_SSH_2.0': 'SWOT Level-2 Low-Rate KaRIn Sea Surface Height v2.0',
    'SWOT_L2_LR_SSH_Basic_2.0': 'SWOT Level-2 Low-Rate KaRIn SSH Basic v2.0'
  };

  const granules: SwotGranuleRecord[] = entries.slice(0, 20).map((raw, idx) => {
    const rec = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const title = String(rec.producer_granule_id || rec.title || `SWOT-granule-${idx + 1}`);
    const shortName = String(rec.dataset_id || args.collection);
    const timeStart = String(rec.time_start || '');
    const timeEnd = rec.time_end ? String(rec.time_end) : null;

    // Extract 3-digit cycle & pass from standard SWOT granule naming: SWOT_L2_..._<CCC>_<PPP>_...
    const cpMatch = /_(\d{3})_(\d{3})_\d{8}T/.exec(title);
    const cycleNumber = cpMatch ? Number(cpMatch[1]) : null;
    const passNumber = cpMatch ? Number(cpMatch[2]) : null;

    let downloadUrl: string | null = null;
    if (Array.isArray(rec.links)) {
      for (const link of rec.links) {
        if (typeof link === 'object' && link !== null) {
          const href = String((link as Record<string, unknown>).href || '');
          if (href.startsWith('https://')) {
            downloadUrl = href;
            break;
          }
        }
      }
    }

    const boxes = Array.isArray(rec.boxes) && rec.boxes.length ? String(rec.boxes[0]) : '';
    return {
      id: String(rec.id || title),
      title,
      collectionShortName: args.collection,
      productLabel: productLabels[args.collection] || shortName,
      timeStart,
      timeEnd,
      cycleNumber,
      passNumber,
      downloadUrl,
      spatialSummary: boxes ? `CMR footprint [${boxes}]` : `Intersects [${args.bbox.west}, ${args.bbox.south}, ${args.bbox.east}, ${args.bbox.north}]`
    };
  });

  return {
    bbox: args.bbox,
    collection: args.collection,
    totalHits: args.totalHits,
    granules,
    agencyAttribution:
      'Joint Mission: NASA / CNES with contributions from the Canadian Space Agency (CSA) and UK Space Agency (UKSA) · Archived at NASA PO.DAAC',
    csaReferenceUrl: 'https://www.asc-csa.gc.ca/eng/satellites/swot/',
    sourceUrl: args.sourceUrl,
    retrievedAt: args.retrievedAt || new Date().toISOString()
  };
}

/**
 * Builds a deterministic NASA Giovanni Area-Averaged Time Series deep-link URL
 * synced to COSMORA's active bounding box and study window.
 */
export function buildGiovanniDeepLink(args: {
  bbox: BoundingBox;
  startYear: number;
  endYear: number;
  dataField?: string;
}): string {
  const variable = args.dataField || 'GPM_3IMERGDF_07_precipitation';
  const bboxStr = `${args.bbox.west.toFixed(3)},${args.bbox.south.toFixed(3)},${args.bbox.east.toFixed(3)},${args.bbox.north.toFixed(3)}`;
  const start = `${args.startYear}-01-01T00:00:00Z`;
  const end = `${args.endYear}-12-31T23:59:59Z`;
  return `https://giovanni.gsfc.nasa.gov/giovanni/#service=ArAvTs&starttime=${encodeURIComponent(start)}&endtime=${encodeURIComponent(end)}&bbox=${bboxStr}&data=${encodeURIComponent(variable)}`;
}

/**
 * Builds an official NASA GES DISC Hydrology Data Rods (`timeseries.cgi`) URL.
 */
export function buildGesDiscDataRodUrl(args: {
  latitude: number;
  longitude: number;
  startYear: number;
  endYear: number;
  variable?: string;
}): string {
  const variable = args.variable || 'GLDAS2:GLDAS_NOAH025_M_v2.1:SoilMoi0_10cm_inst';
  const location = `GEOM:POINT(${args.longitude.toFixed(4)}, ${args.latitude.toFixed(4)})`;
  const params = new URLSearchParams({
    variable,
    location,
    startDate: `${args.startYear}-01-01T00`,
    endDate: `${args.endYear}-12-31T23`,
    type: 'asc2'
  });
  return `https://hydro1.gesdisc.eosdis.nasa.gov/daac-bin/access/timeseries.cgi?${params.toString()}`;
}

/**
 * Generates a valid NASA LP DAAC AppEEARS API v1 Point-Sample Task JSON spec.
 */
export function buildAppeearsPointTaskSpec(args: {
  label: string;
  latitude: number;
  longitude: number;
  startYear: number;
  endYear: number;
}): Record<string, unknown> {
  return {
    task_type: 'point',
    task_name: `COSMORA_${args.label.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 36)}_${args.startYear}_${args.endYear}`,
    params: {
      dates: [
        {
          startDate: `01-01-${Math.max(2000, args.startYear)}`,
          endDate: `12-31-${args.endYear}`
        }
      ],
      layers: [
        { product: 'MOD13Q1.061', layer: '_250m_16_days_NDVI' },
        { product: 'MOD11A2.061', layer: 'LST_Day_1km' },
        { product: 'SPL3SMP_E.006', layer: 'Soil_Moisture_Retrieval_Data_AM_soil_moisture' }
      ],
      coordinates: [
        {
          id: 'cosmora-study-site',
          category: args.label,
          latitude: Number(args.latitude.toFixed(5)),
          longitude: Number(args.longitude.toFixed(5))
        }
      ]
    }
  };
}

/**
 * Runs COSMORA's validated statistical trend suite on any external monthly series
 * and optionally computes autocorrelation-adjusted correlation against NASA POWER.
 */
export function analyzeExternalSeries(
  series: ExternalMonthlySeries,
  powerDataset?: PowerDataset | null,
  powerCode = 'PRECTOTCORR'
): ExternalSeriesAnalysis {
  const byYear = new Map<number, number[]>();
  let minPt: ExternalMonthlyPoint | null = null;
  let maxPt: ExternalMonthlyPoint | null = null;
  let sum = 0;

  for (const pt of series.points) {
    sum += pt.value;
    if (!minPt || pt.value < minPt.value) minPt = pt;
    if (!maxPt || pt.value > maxPt.value) maxPt = pt;
    const arr = byYear.get(pt.year) || [];
    arr.push(pt.value);
    byYear.set(pt.year, arr);
  }

  // Strictly complete 12-month calendar years for annual Mann–Kendall & Pettitt
  const completeYears: Array<{ year: number; value: number }> = [];
  for (const [year, vals] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    if (vals.length === 12) {
      completeYears.push({
        year,
        value: vals.reduce((a, b) => a + b, 0) / 12
      });
    }
  }

  const mannKendall = mannKendallTest(completeYears, series.unit);
  const seasonalMannKendall = seasonalMannKendallTest(series.points, series.unit);
  const pettitt = pettittChangePointTest(completeYears, series.unit);

  let correlationWithPower: SeriesCorrelationResult | null = null;
  let comparedPowerCode: string | null = null;

  if (powerDataset && powerDataset.rows.length > 0) {
    comparedPowerCode = powerCode;
    const powerByDate = new Map<string, number>();
    for (const r of powerDataset.rows) {
      const val = r.values[powerCode];
      if (typeof val === 'number' && Number.isFinite(val)) {
        powerByDate.set(r.date, val);
      }
    }
    const xs: number[] = [];
    const ys: number[] = [];
    for (const pt of series.points) {
      const pv = powerByDate.get(pt.date);
      if (pv !== undefined) {
        xs.push(pt.value);
        ys.push(pv);
      }
    }
    correlationWithPower = computeSeriesCorrelation(xs, ys);
  }

  return {
    series,
    completeYearsCount: completeYears.length,
    mean: series.points.length ? round(sum / series.points.length, 3) : null,
    min: minPt,
    max: maxPt,
    mannKendall,
    seasonalMannKendall,
    pettitt,
    correlationWithPower,
    comparedPowerCode
  };
}
