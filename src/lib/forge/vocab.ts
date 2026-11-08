/**
 * NOVA HYPOTHESIS FORGE — dataset registry and trilingual scientific lexicon.
 *
 * The registry is documentation, not data: titles, units, official URLs,
 * coverage windows and limitations. It contains no measurements. Everything
 * numeric is fetched live by the server connectors (`server/forge/connectors.ts`)
 * and normalised in `normalize.ts`.
 *
 * Coverage statements are deliberately conservative. NOAA's Kp product is a
 * rolling window, so a historical storm (1989, 2003) cannot be investigated
 * from it; the planner says so instead of substituting a nearby period.
 */

import type {
  DatasetDescriptor,
  ScientificDomain,
  TimeResolution,
  VariableId,
} from './types';

export interface VariableMeta {
  id: VariableId;
  unit: string;
  datasetId: string;
  /** Canonical English name (kept alongside translations everywhere). */
  englishLabel: string;
  kind: 'space-weather' | 'earth-climate' | 'planetary' | 'orbital';
  notes: string;
}

export const VARIABLES: VariableMeta[] = [
  {
    id: 'kp',
    unit: 'Kp (dimensionless, 0–9)',
    datasetId: 'noaa-swpc-kp',
    englishLabel: 'Planetary K index (Kp)',
    kind: 'space-weather',
    notes:
      'Planetary 3-hour geomagnetic index derived from ground magnetometer observatories. Kp is a quasi-logarithmic index, not a physical field strength.',
  },
  {
    id: 'solar_wind_speed',
    unit: 'km/s',
    datasetId: 'noaa-swpc-solar-wind',
    englishLabel: 'Solar wind speed',
    kind: 'space-weather',
    notes: 'Bulk proton speed measured near the Sun–Earth L1 point (DSCOVR/ACE).',
  },
  {
    id: 'bz_gsm',
    unit: 'nT',
    datasetId: 'noaa-swpc-solar-wind',
    englishLabel: 'Interplanetary magnetic field Bz (GSM)',
    kind: 'space-weather',
    notes:
      'North–south component of the interplanetary magnetic field in GSM coordinates. Sustained negative Bz favours magnetic reconnection at the dayside magnetopause.',
  },
  {
    id: 'bt',
    unit: 'nT',
    datasetId: 'noaa-swpc-solar-wind',
    englishLabel: 'Interplanetary magnetic field magnitude (Bt)',
    kind: 'space-weather',
    notes: 'Total field strength at L1.',
  },
  {
    id: 'proton_density',
    unit: 'p/cm³',
    datasetId: 'noaa-swpc-solar-wind',
    englishLabel: 'Solar wind proton density',
    kind: 'space-weather',
    notes: 'Proton number density at L1.',
  },
  {
    id: 'cme_speed',
    unit: 'km/s',
    datasetId: 'nasa-donki',
    englishLabel: 'CME linear speed (model fit)',
    kind: 'space-weather',
    notes:
      'Speed from DONKI CME analysis. It is a model fit to coronagraph imagery, not an in-situ measurement.',
  },
  {
    id: 'temperature',
    unit: '°C',
    datasetId: 'nasa-power',
    englishLabel: 'Air temperature at 2 m',
    kind: 'earth-climate',
    notes: 'POWER monthly mean for the grid cell containing the study point.',
  },
  {
    id: 'precipitation',
    unit: 'mm/day',
    datasetId: 'nasa-power',
    englishLabel: 'Precipitation rate',
    kind: 'earth-climate',
    notes: 'POWER bias-corrected precipitation rate (monthly mean of daily rate).',
  },
  {
    id: 'asteroid_miss_distance',
    unit: 'au',
    datasetId: 'nasa-neows',
    englishLabel: 'Close-approach miss distance',
    kind: 'planetary',
    notes: 'Nominal close-approach distance from NeoWs.',
  },
  {
    id: 'asteroid_diameter',
    unit: 'km',
    datasetId: 'nasa-neows',
    englishLabel: 'Estimated asteroid diameter',
    kind: 'planetary',
    notes:
      'NeoWs diameter range is an estimate derived from absolute magnitude and an assumed albedo.',
  },
  {
    id: 'orbital_altitude',
    unit: 'km',
    datasetId: 'nova-iss-tle',
    englishLabel: 'ISS orbital altitude',
    kind: 'orbital',
    notes: 'Derived from the publicly published TLE used by the existing ISS tracker.',
  },
];

export function variableMeta(id: VariableId): VariableMeta | undefined {
  return VARIABLES.find((entry) => entry.id === id);
}

export const DATASETS: DatasetDescriptor[] = [
  {
    id: 'noaa-swpc-kp',
    organisation: 'NOAA',
    programme: 'SWPC — Planetary K index',
    title: 'NOAA SWPC planetary K index (3-hour)',
    description:
      'The official NOAA Space Weather Prediction Center planetary K index product: one Kp value per 3-hour interval, derived from a network of ground magnetometers.',
    documentationUrl: 'https://www.swpc.noaa.gov/products/planetary-k-index',
    endpoint: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
    access: 'open',
    coverage: {
      kind: 'rolling',
      rollingDays: 30,
      description:
        'The JSON product is a rolling window (up to ~30 days). It is not a historical archive.',
    },
    cadence: '3 hours',
    variables: [
      { id: 'kp', label: 'Planetary K index', unit: 'Kp' },
    ],
    domains: ['space-weather'],
    limitations: [
      'Kp is a global index: it cannot localise a disturbance to a country or a city.',
      'Kp saturates at 9; the largest storms are indistinguishable in Kp alone.',
      'The rolling window means historical events require a different archive (e.g. GFZ Potsdam), which this project does not integrate.',
    ],
    attribution: 'NOAA Space Weather Prediction Center (SWPC), planetary K index product.',
    keyRequired: false,
  },
  {
    id: 'noaa-swpc-solar-wind',
    organisation: 'NOAA',
    programme: 'SWPC — Real-time solar wind',
    title: 'NOAA SWPC real-time solar wind (L1 magnetometer + plasma)',
    description:
      'In-situ interplanetary magnetic field and solar wind plasma measurements from the L1 monitor, published by NOAA SWPC as one-day JSON tables.',
    documentationUrl: 'https://www.swpc.noaa.gov/products/real-time-solar-wind',
    endpoint: 'https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json',
    access: 'open',
    coverage: {
      kind: 'rolling',
      rollingDays: 1,
      description:
        'One-day (and two-hour) JSON tables only. There is no historical archive on this endpoint.',
    },
    cadence: '1 minute (published as a one-day table)',
    variables: [
      { id: 'bz_gsm', label: 'IMF Bz (GSM)', unit: 'nT' },
      { id: 'bt', label: 'IMF magnitude', unit: 'nT' },
      { id: 'solar_wind_speed', label: 'Proton speed', unit: 'km/s' },
      { id: 'proton_density', label: 'Proton density', unit: 'p/cm³' },
    ],
    domains: ['space-weather'],
    limitations: [
      'L1 measurements are a single point upstream of Earth, not a global field map.',
      'The one-day window is far shorter than a geomagnetic storm sequence.',
      'Rows flagged by the source as fill values are preserved as missing, never interpolated into the analysis.',
    ],
    attribution: 'NOAA SWPC real-time solar wind (DSCOVR/ACE) products.',
    keyRequired: false,
  },
  {
    id: 'nasa-donki',
    organisation: 'NASA',
    programme: 'CCMC — DONKI',
    title: 'NASA DONKI space-weather notifications and CME catalogue',
    description:
      'The Database Of Notifications, Knowledge, Information: human-curated and automated space-weather notifications plus the CME catalogue with modelled speeds.',
    documentationUrl: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
    endpoint: 'https://api.nasa.gov/DONKI/notifications',
    access: 'api-key',
    coverage: {
      kind: 'archive',
      earliest: '2008-01-01',
      description:
        'DONKI events are available from roughly 2008 onwards. Pre-2008 events are not in the service.',
    },
    cadence: 'event-based',
    variables: [
      { id: 'cme_speed', label: 'CME speed (model fit)', unit: 'km/s' },
    ],
    domains: ['space-weather'],
    limitations: [
      'Notifications are curated text summaries, not measurements.',
      'CME speeds are model fits to coronagraph imagery with substantial uncertainty.',
      'Requires a NASA API key on the server; DEMO_KEY exists but is heavily rate-limited.',
    ],
    attribution: 'NASA Community Coordinated Modeling Center, DONKI.',
    keyRequired: false,
  },
  {
    id: 'nasa-power',
    organisation: 'NASA',
    programme: 'POWER — Prediction Of Worldwide Energy Resources',
    title: 'NASA POWER monthly environmental archive',
    description:
      'Satellite/re-analysis derived monthly climate estimates for the grid cell containing a requested point (1981 to near-present). Already used by the Earth Intelligence Lab.',
    documentationUrl: 'https://power.larc.nasa.gov/docs/services/api/temporal/monthly/',
    endpoint: 'https://power.larc.nasa.gov/api/temporal/monthly/point',
    access: 'open',
    coverage: {
      kind: 'archive',
      earliest: '1981-01-01',
      description:
        '1981 to near-present at monthly resolution. This is a re-analysis product, not station data.',
    },
    cadence: '1 month',
    variables: [
      { id: 'temperature', label: 'Air temperature at 2 m', unit: '°C' },
      { id: 'precipitation', label: 'Precipitation rate', unit: 'mm/day' },
    ],
    domains: ['earth-environment'],
    limitations: [
      'Monthly means cannot resolve individual storms or daily events.',
      'Values are grid-cell estimates, not local station measurements.',
      'A monthly series is strongly autocorrelated, which inflates naive significance tests.',
    ],
    attribution: 'NASA POWER (NASA Langley Research Center).',
    keyRequired: false,
  },
  {
    id: 'nasa-neows',
    organisation: 'NASA',
    programme: 'Planetary Defense — NeoWs',
    title: 'NASA NeoWs near-Earth object close approaches',
    description:
      'Near-Earth object close-approach feed with estimated diameters and miss distances for a requested 7-day window.',
    documentationUrl: 'https://api.nasa.gov/',
    endpoint: 'https://api.nasa.gov/neo/rest/v1/feed',
    access: 'api-key',
    coverage: {
      kind: 'archive',
      earliest: '1900-01-01',
      description:
        'The feed accepts at most a 7-day window per request and is not a complete impact-risk assessment.',
    },
    cadence: 'per close approach',
    variables: [
      { id: 'asteroid_miss_distance', label: 'Miss distance', unit: 'au' },
      { id: 'asteroid_diameter', label: 'Estimated diameter', unit: 'km' },
    ],
    domains: ['near-earth-objects'],
    limitations: [
      'Only objects that were detected are listed — a strong selection effect.',
      'Diameters are estimated from brightness and assumed albedo.',
      'A close approach is not an impact risk; orbital solutions carry uncertainty.',
    ],
    attribution: 'NASA JPL Near Earth Object Web Service (NeoWs).',
    keyRequired: false,
  },
  {
    id: 'nasa-gibs',
    organisation: 'NASA',
    programme: 'EOSDIS — GIBS',
    title: 'NASA GIBS satellite imagery',
    description:
      'Global Imagery Browse Services provides map tiles of satellite imagery for specific layers and dates. Used here for context imagery, not for measurement.',
    documentationUrl: 'https://nasa-gibs.github.io/gibs-api-docs/',
    endpoint: 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi',
    access: 'open',
    coverage: {
      kind: 'archive',
      earliest: '2000-02-24',
      description: 'Layer-dependent observation dates, validated by the existing Earth Lab catalogue.',
    },
    cadence: 'daily (layer dependent)',
    variables: [],
    domains: ['earth-environment', 'space-weather', 'planetary-imagery'],
    limitations: [
      'Imagery is visual context only; no quantitative value is extracted from a tile here.',
      'Availability has gaps that the existing catalogue refuses to paper over.',
    ],
    attribution: 'NASA EOSDIS Global Imagery Browse Services (GIBS).',
    keyRequired: false,
  },
  {
    id: 'nasa-apod',
    organisation: 'NASA',
    programme: 'APOD',
    title: 'Astronomy Picture of the Day',
    description:
      'NASA APOD entries give astronomy context (image + caption) for a date. They are educational material, not measurements.',
    documentationUrl: 'https://apod.nasa.gov/apod/lib/about_apod.html',
    endpoint: 'https://api.nasa.gov/planetary/apod',
    access: 'api-key',
    coverage: {
      kind: 'archive',
      earliest: '1995-06-16',
      description: 'Daily since 1995-06-16.',
    },
    cadence: '1 day',
    variables: [],
    domains: ['astronomy-context'],
    limitations: [
      'Caption text is human-written editorial content and is never used as a numeric measurement.',
    ],
    attribution: 'NASA APOD.',
    keyRequired: false,
  },
  {
    id: 'nasa-mars-photos',
    organisation: 'NASA',
    programme: 'Mars Rover Photos',
    title: 'NASA Mars rover imagery',
    description:
      'Surface imagery from Curiosity, Perseverance and the older rovers, indexed by Earth date.',
    documentationUrl: 'https://api.nasa.gov/',
    endpoint: 'https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/photos',
    access: 'api-key',
    coverage: {
      kind: 'archive',
      earliest: '2012-08-06',
      description: 'Rover-dependent; a date with no downlink returns an empty list, which is reported as a gap.',
    },
    cadence: 'sol / Earth date',
    variables: [],
    domains: ['planetary-imagery'],
    limitations: [
      'Imagery is qualitative; no surface variable is measured here.',
      'Camera availability per sol varies, so absence of a photo is not evidence of absence of a phenomenon.',
    ],
    attribution: 'NASA Mars rover photo archives.',
    keyRequired: false,
  },
  {
    id: 'nova-iss-tle',
    organisation: 'Other',
    programme: 'Existing ISS integration',
    title: 'ISS orbital elements (existing Space Explorer feed)',
    description:
      'Two-line elements already used by the app’s ISS tracker, served by wheretheiss.at. Provides orbital information, not measurements of any Earth phenomenon.',
    documentationUrl: 'https://wheretheiss.at/w/developer',
    endpoint: 'https://api.wheretheiss.at/v1/satellites/25544/tles',
    access: 'open',
    coverage: {
      kind: 'rolling',
      rollingDays: 10,
      description: 'Current TLE only.',
    },
    cadence: 'TLE epoch',
    variables: [
      { id: 'orbital_altitude', label: 'Derived ISS altitude', unit: 'km' },
    ],
    domains: ['orbital'],
    limitations: [
      'A propagated altitude is a derived quantity, not a direct measurement.',
      'Not a NASA API; attribution is shown wherever it is used.',
    ],
    attribution: 'wheretheiss.at orbital data (existing NASA Space Explorer integration).',
    keyRequired: false,
  },
];

export function datasetById(id: string): DatasetDescriptor | undefined {
  return DATASETS.find((entry) => entry.id === id);
}

/** Datasets that can legitimately address a domain. */
export function datasetsForDomain(domain: ScientificDomain): DatasetDescriptor[] {
  return DATASETS.filter((entry) => entry.domains.includes(domain));
}

export interface DomainDefinition {
  id: ScientificDomain;
  /** English keywords plus Sinhala and Tamil stems. Matching is language-agnostic. */
  keywords: string[];
  /** Dataset ids to consider, in priority order. */
  datasets: string[];
  variables: VariableId[];
  resolution: TimeResolution;
  objective: string;
}

/**
 * Domain lexicon. Sinhala and Tamil entries are stems: they are matched inside a
 * sentence, so a question phrased in either language selects the same domain as
 * its English equivalent (cross-language retrieval without machine translation).
 */
export const DOMAIN_DEFINITIONS: DomainDefinition[] = [
  {
    id: 'space-weather',
    keywords: [
      'solar storm', 'geomagnetic', 'magnetic storm', 'solar wind', 'coronal', 'cme',
      'flare', 'aurora', 'magnetosphere', 'space weather', 'kp index', 'sunspot',
      'radiation storm', 'solar activity', 'imf', 'dsto', 'dst',
      'සූර්ය', 'කුණාටු', 'චුම්බක', 'අරෝරා', 'සෞර', 'වායුගෝලය',
      'சூரிய', 'புயல்', 'காந்த', 'வளிமண்டல', 'விண்வெளி காலநிலை',
    ],
    datasets: ['noaa-swpc-kp', 'noaa-swpc-solar-wind', 'nasa-donki'],
    variables: ['kp', 'solar_wind_speed', 'bz_gsm', 'bt', 'proton_density', 'cme_speed'],
    resolution: 'hour',
    objective: 'Quantify the relationship between solar-wind drivers and geomagnetic response.',
  },
  {
    id: 'earth-environment',
    keywords: [
      'rain', 'rainfall', 'precipitation', 'temperature', 'climate', 'drought', 'monsoon',
      'heat', 'weather', 'humidity', 'warming', 'flood',
      'වර්ෂා', 'වැසි', 'උෂ්ණත්ව', 'දේශගුණ', 'නියඟ', 'මෝසම්',
      'மழை', 'வெப்பநிலை', 'காலநிலை', 'வறட்சி', 'பருவமழை', 'வெப்பம்',
    ],
    datasets: ['nasa-power'],
    variables: ['temperature', 'precipitation'],
    resolution: 'month',
    objective: 'Characterise an environmental time series and its limitations for a study area.',
  },
  {
    id: 'near-earth-objects',
    keywords: [
      'asteroid', 'near-earth', 'neo', 'meteor', 'impact', 'comet', 'space rock',
      'ග්‍රහක', 'උල්කා', 'asteroid',
      'சிறுகோள்', 'விண்கல்', 'asteroid',
    ],
    datasets: ['nasa-neows'],
    variables: ['asteroid_miss_distance', 'asteroid_diameter'],
    resolution: 'day',
    objective: 'Examine reported near-Earth object close approaches and their selection effects.',
  },
  {
    id: 'orbital',
    keywords: [
      'iss', 'space station', 'satellite', 'orbit', 'orbital', 'tle', 'altitude',
      'නිලධාරී', 'කක්ෂ', 'චන්ද්‍රිකා',
      'செயற்கைக்கோள்', 'சுற்றுப்பாதை', 'நிலையம்',
    ],
    datasets: ['nova-iss-tle'],
    variables: ['orbital_altitude'],
    resolution: 'hour',
    objective: 'Describe the current orbital state and what it cannot tell us.',
  },
  {
    id: 'planetary-imagery',
    keywords: ['mars', 'rover', 'perseverance', 'curiosity', 'jezero', 'martian', 'අඟහරු', 'செவ்வாய்'],
    datasets: ['nasa-mars-photos'],
    variables: [],
    resolution: 'day',
    objective: 'Retrieve planetary surface imagery for the requested date and state its limits.',
  },
  {
    id: 'astronomy-context',
    keywords: ['apod', 'galaxy', 'nebula', 'telescope', 'jwst', 'hubble', 'star', 'black hole', 'මන්දාකිණි', 'නිහාරිකා', 'விண்மீன்', 'நெபுலா'],
    datasets: ['nasa-apod'],
    variables: [],
    resolution: 'day',
    objective: 'Provide astronomy context for the requested date and label it as editorial material.',
  },
];

/** Named historical events, with the bounds they are commonly studied over. */
export const NAMED_EVENTS: Array<{
  id: string;
  /** Names that identify the event. Bare years are deliberately NOT included:
   *  "March 2024" is a month, not the Gannon storm. */
  names: string[];
  start: string;
  end: string;
  label: string;
}> = [
  {
    id: 'carrington-1859',
    names: ['carrington event', 'carrington'],
    start: '1859-09-01T00:00:00.000Z',
    end: '1859-09-03T23:59:59.000Z',
    label: 'Carrington Event (1859)',
  },
  {
    id: 'quebec-1989',
    names: ['quebec', 'hydro-quebec', 'hydro québec'],
    start: '1989-03-12T00:00:00.000Z',
    end: '1989-03-15T23:59:59.000Z',
    label: 'March 1989 geomagnetic storm',
  },
  {
    id: 'halloween-2003',
    names: ['halloween storms', 'halloween'],
    start: '2003-10-28T00:00:00.000Z',
    end: '2003-11-04T23:59:59.000Z',
    label: 'Halloween 2003 solar storms',
  },
  {
    id: 'st-patrick-2015',
    names: ["st patrick", 'saint patrick', 'st. patrick'],
    start: '2015-03-16T00:00:00.000Z',
    end: '2015-03-19T23:59:59.000Z',
    label: 'St Patrick’s Day 2015 storm',
  },
  {
    id: 'gannon-2024',
    names: ['gannon'],
    start: '2024-05-09T00:00:00.000Z',
    end: '2024-05-13T23:59:59.000Z',
    label: 'May 2024 Gannon storm',
  },
];

/** Methods and the reason they are chosen, keyed for localisation. */
export const METHOD_REASONS: Record<string, string> = {
  descriptive: 'methodWhyDescriptive',
  correlation: 'methodWhyCorrelation',
  'cross-correlation': 'methodWhyCrossCorrelation',
  'before-after': 'methodWhyBeforeAfter',
  'threshold-exceedance': 'methodWhyThreshold',
  trend: 'methodWhyTrend',
  anomaly: 'methodWhyAnomaly',
  'missing-data': 'methodWhyMissing',
};
