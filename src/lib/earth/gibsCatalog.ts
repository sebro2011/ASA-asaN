/**
 * Verified NASA GIBS layer catalog and URL builders.
 *
 * Every entry below was validated on 2026-10-11 against the live GIBS service
 * using the OGC WMTS `DescribeDomains` request
 *   https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/{layer}/default/{tms}/all/all.xml
 * (validation log: docs/EARTH_INTELLIGENCE_LAB_UPGRADE.md). Layers that the
 * service rejected during that validation are intentionally absent.
 *
 * The catalog ships *documentation* (titles, units, what a dataset can and
 * cannot establish) — never measurements. All measurements are fetched live.
 */

import type { GibsLayerMeta, GibsService } from './types';

export const GIBS_ATTRIBUTION =
  'NASA EOSDIS Global Imagery Browse Services (GIBS) — Worldview imagery. Imagery is provided by NASA and is not validated for operational use.';

export const GIBS_WMTS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
export const GIBS_WMS_BASE = 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi';

/** RESTful WMTS tile template, documented at nasa-gibs.github.io/gibs-api-docs. */
export const WMTS_URL_TEMPLATE =
  `${GIBS_WMTS_BASE}/{layer}/default/{date}/{tileMatrixSet}/{z}/{y}/{x}.{ext}`;

export function wmtsTileUrl(
  layer: GibsLayerMeta,
  date: string,
  tileMatrixSet: string,
  format: string,
  z: number,
  y: number,
  x: number
): string {
  return WMTS_URL_TEMPLATE.replace('{layer}', layer.id)
    .replace('{date}', date)
    .replace('{tileMatrixSet}', tileMatrixSet)
    .replace('{ext}', format)
    .replace('{z}', String(z))
    .replace('{y}', String(y))
    .replace('{x}', String(x));
}

/** The browser-facing template consumed by Leaflet's `L.tileLayer`. */
export function wmtsLeafletTemplate(layer: GibsLayerMeta, date: string, tileMatrixSet: string, format: string): string {
  return `${GIBS_WMTS_BASE}/{layer}/default/{date}/{tileMatrixSet}/{z}/{y}/{x}.{ext}`
    .replace('{layer}', layer.id)
    .replace('{date}', date)
    .replace('{tileMatrixSet}', tileMatrixSet)
    .replace('{ext}', format);
}

/** WMTS `DescribeDomains` request used to read the layer's observation-date domain. */
export function describeDomainsUrl(layer: GibsLayerMeta): string {
  const tms = layer.tileMatrixSet || 'GoogleMapsCompatible_Level9';
  return `${GIBS_WMTS_BASE}/1.0.0/${layer.id}/default/${tms}/all/all.xml`;
}

export interface WmsGetMapOptions {
  layer: GibsLayerMeta;
  time?: string;
  /** `[minX, minY, maxX, maxY]` in EPSG:3857 metres. */
  bbox3857: [number, number, number, number];
  width: number;
  height: number;
  /** Layer opacity-independent transparency (PNG output keeps alpha). */
  transparent?: boolean;
}

/** WMS 1.3.0 GetMap request in EPSG:3857 — the raster path for vector-derived layers. */
export function wmsGetMapUrl({ layer, time, bbox3857, width, height, transparent = true }: WmsGetMapOptions): string {
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: '1.3.0',
    LAYERS: layer.id,
    STYLES: '',
    FORMAT: layer.format === 'jpg' && !transparent ? 'image/jpeg' : 'image/png',
    TRANSPARENT: transparent ? 'true' : 'false',
    CRS: 'EPSG:3857',
    BBOX: bbox3857.map((value) => value.toFixed(2)).join(','),
    WIDTH: String(width),
    HEIGHT: String(height)
  });
  if (time) params.set('TIME', time);
  return `${GIBS_WMS_BASE}?${params.toString()}`;
}

/** Leaflet `L.tileLayer.wms` template with the time dimension substituted. */
export function wmsLeafletTemplate(layer: GibsLayerMeta, date: string): string {
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: '1.3.0',
    LAYERS: layer.id,
    STYLES: '',
    FORMAT: 'image/png',
    TRANSPARENT: 'true'
  });
  params.set('TIME', date);
  return `${GIBS_WMS_BASE}?${params.toString()}`;
}

const VERIFIED_ON = '2026-10-11';

interface LayerInput extends Omit<GibsLayerMeta, 'verification' | 'verifiedOn' | 'sourceUrl'> {
  verification?: GibsLayerMeta['verification'];
}

function layer(input: LayerInput): GibsLayerMeta {
  return {
    ...input,
    verification: input.verification || 'describe-domains',
    verifiedOn: VERIFIED_ON
  };
}

const CATALOG: GibsLayerMeta[] = [
  /* ------------------------------- true color ------------------------------ */
  layer({
    id: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    title: 'MODIS Terra — Corrected Reflectance (True Color)',
    summary: 'Natural-colour daily view of the surface at ~250 m. The standard choice for "what did this place look like on this date".',
    category: 'true-color',
    service: 'wmts',
    tileMatrixSet: 'GoogleMapsCompatible_Level9',
    format: 'jpg',
    resolution: '250 m/pixel (Web Mercator level 9)',
    period: 'daily',
    platform: 'Terra',
    instrument: 'MODIS',
    parameter: 'Reflectance composite (bands 1-4-3)',
    unit: 'reflectance (RGB composite, no physical unit)',
    appropriateFor: [
      'Daily context imagery for a location or region',
      'Visual before/after comparison of the same area on two dates',
      'Locating smoke plumes, flooding, burn scars and sediment plumes by eye'
    ],
    limitations:
      'Colour is a rendering of reflectance, not a measurement. Cloud cover, orbital gaps, and atmospheric effects mean two images can differ for reasons unrelated to the surface. Not radiometrically comparable between dates.',
    priority: 10
  }),
  layer({
    id: 'MODIS_Aqua_CorrectedReflectance_TrueColor',
    title: 'MODIS Aqua — Corrected Reflectance (True Color)',
    summary: 'Afternoon-overpass counterpart to Terra true colour — useful when Terra is cloudy at a location.',
    category: 'true-color',
    service: 'wmts',
    tileMatrixSet: 'GoogleMapsCompatible_Level9',
    format: 'jpg',
    resolution: '250 m/pixel (Web Mercator level 9)',
    period: 'daily',
    platform: 'Aqua',
    instrument: 'MODIS',
    parameter: 'Reflectance composite (bands 1-4-3)',
    unit: 'reflectance (RGB composite, no physical unit)',
    appropriateFor: ['Alternative daily true-colour coverage', 'Cross-checking cloud or smoke features seen on Terra'],
    limitations: 'Same rendering caveats as Terra true colour. Terra and Aqua overpass within a few hours but are not simultaneous observations.',
    priority: 9
  }),
  layer({
    id: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    title: 'VIIRS Suomi NPP — Corrected Reflectance (True Color)',
    summary: 'Higher-resolution (~250 m imagery, 375 m native bands) true colour from the VIIRS instrument.',
    category: 'true-color',
    service: 'wmts',
    tileMatrixSet: 'GoogleMapsCompatible_Level9',
    format: 'jpg',
    resolution: '250 m/pixel (Web Mercator level 9)',
    period: 'daily',
    platform: 'Suomi NPP',
    instrument: 'VIIRS',
    parameter: 'Reflectance composite (I1-M4-M3)',
    unit: 'reflectance (RGB composite, no physical unit)',
    appropriateFor: ['Detailed daily imagery of coastlines, islands and inland water', 'Visual comparison of land-surface change between dates'],
    limitations: 'Cloud cover limits usefulness in the monsoon and inter-monsoon seasons. Rendering, not a measurement.',
    priority: 8
  }),
  layer({
    id: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
    title: 'VIIRS NOAA-20 — Corrected Reflectance (True Color)',
    summary: 'Second VIIRS true-colour source (2018 onward); useful when the Suomi NPP scene is cloudy.',
    category: 'true-color',
    service: 'wmts',
    tileMatrixSet: 'GoogleMapsCompatible_Level9',
    format: 'jpg',
    resolution: '250 m/pixel (Web Mercator level 9)',
    period: 'daily',
    platform: 'NOAA-20',
    instrument: 'VIIRS',
    parameter: 'Reflectance composite (I1-M4-M3)',
    unit: 'reflectance (RGB composite, no physical unit)',
    appropriateFor: ['Alternative daily true colour', 'Filling cloud gaps left by earlier VIIRS/MODIS overpasses'],
    limitations: 'Available from January 2018 only. Rendering, not a measurement.',
    priority: 7
  }),

  /* ------------------------------ vegetation ------------------------------- */
  layer({
    id: 'MODIS_Terra_NDVI_8Day',
    title: 'MODIS Terra — NDVI (8-day composite)',
    summary: 'Normalised Difference Vegetation Index in 8-day composites — a greenness index used to track vegetation vigour.',
    category: 'vegetation',
    service: 'wmts',
    tileMatrixSet: 'GoogleMapsCompatible_Level9',
    format: 'png',
    resolution: '250 m/pixel (Web Mercator level 9)',
    period: '8-day composite',
    platform: 'Terra',
    instrument: 'MODIS',
    parameter: 'NDVI',
    unit: 'index (dimensionless, -1 to 1)',
    appropriateFor: [
      'Seasonal greenness patterns and monsoon onset/recession over vegetation',
      'Comparing the same 8-day window across consecutive years'
    ],
    limitations:
      'GIBS currently reports only a limited recent archive for this layer in Web Mercator (from 2025-02-12 in the domain returned on 2026-10-11) — long-term baselines are NOT available from this layer. NDVI saturates in dense tropical forest and is sensitive to cloud, aerosol and view geometry.',
    priority: 9
  }),
  layer({
    id: 'MODIS_Terra_Land_Surface_Temp_Day',
    title: 'MODIS Terra — Land Surface Temperature (day)',
    summary: 'Daytime skin temperature of the land surface (not air temperature), 2000 onward.',
    category: 'land',
    service: 'wmts',
    tileMatrixSet: 'GoogleMapsCompatible_Level7',
    format: 'png',
    resolution: '~1 km native, served at level 7 (≈1.2 km/pixel)',
    period: 'daily',
    platform: 'Terra',
    instrument: 'MODIS',
    parameter: 'Land surface temperature (day)',
    unit: '°C (rendered palette)',
    appropriateFor: ['Urban heat and dry-zone heat patterns', 'Relative comparison of hot surfaces between dates'],
    limitations:
      'Skin temperature, not 2 m air temperature — expect large differences from weather reports. Cloud-contaminated pixels are masked. Palettes are for visualisation; use the underlying MOD11 product for quantitative work.',
    priority: 7
  }),
  layer({
    id: 'MODIS_Terra_L3_NDSI_Snow_Cover_Daily',
    title: 'MODIS Terra — Snow Cover (NDSI, daily)',
    summary: 'Daily snow/ice index classification. Included mainly as a global-change layer — snow is not expected over Sri Lanka.',
    category: 'land',
    service: 'wmts',
    tileMatrixSet: 'GoogleMapsCompatible_Level8',
    format: 'png',
    resolution: '500 m/pixel (Web Mercator level 8)',
    period: 'daily',
    platform: 'Terra',
    instrument: 'MODIS',
    parameter: 'Normalised Difference Snow Index',
    unit: 'classification (no-data / snow / cloud / land)',
    appropriateFor: ['Seasonal snow-extent context', 'High-mountain and polar comparisons'],
    limitations: 'Classification layer with cloud masking; not a snow-water-equivalent measurement.',
    priority: 3
  }),
  layer({
    id: 'MODIS_Combined_Flood_2-Day',
    title: 'MODIS Combined — Flood (2-day)',
    summary: 'Near real-time surface-water/flood extent from MODIS, refreshed every 2 days since 2021.',
    category: 'land',
    service: 'wmts',
    tileMatrixSet: 'GoogleMapsCompatible_Level8',
    format: 'png',
    resolution: '250 m/pixel (Web Mercator level 8)',
    period: '2-day composite',
    platform: 'Terra + Aqua',
    instrument: 'MODIS',
    parameter: 'Surface water / flood extent',
    unit: 'classification (no physical unit)',
    appropriateFor: ['Locating large floods and standing water after heavy rain', 'Before/after flood extents in river basins'],
    limitations:
      'Detects water at 250 m — misses small or short-lived floods and misclassifies sediment-laden water and cloud shadows. Archive starts 2021-01-01. Not an official flood warning product.',
    priority: 8
  }),

  /* -------------------------------- ocean --------------------------------- */
  layer({
    id: 'MODIS_Terra_L2_Chlorophyll_A',
    title: 'MODIS Terra — Chlorophyll a concentration',
    summary: 'Ocean-colour proxy for phytoplankton biomass in surface waters.',
    category: 'ocean',
    service: 'wmts',
    tileMatrixSet: 'GoogleMapsCompatible_Level7',
    format: 'png',
    resolution: '~1 km native, served at level 7 (≈1.2 km/pixel)',
    period: 'daily',
    platform: 'Terra',
    instrument: 'MODIS',
    parameter: 'Chlorophyll a concentration',
    unit: 'mg/m³ (log-scaled palette)',
    appropriateFor: ['Coastal and offshore productivity patterns', 'Comparing bloom/upwelling periods between dates'],
    limitations:
      'Cloud, sun-glint and turbid coastal water degrade retrievals; the Web Mercator domain showed a gap between 2023-10 and 2025-02 when probed on 2026-10-11. Log-scaled palette: colours are not linear in mg/m³.',
    priority: 7
  }),
  layer({
    id: 'GHRSST_L4_MUR_Sea_Surface_Temperature',
    title: 'MUR — Sea Surface Temperature (L4 analysis)',
    summary: 'Blended microwave/infrared foundation SST at 1 km, 2002 onward.',
    category: 'ocean',
    service: 'wmts',
    tileMatrixSet: 'GoogleMapsCompatible_Level7',
    format: 'png',
    resolution: '~1 km analysis, served at level 7',
    period: 'daily',
    platform: 'Multi-mission (GHRSST MUR)',
    instrument: 'AVHRR / AMSR / others blended',
    parameter: 'Sea surface temperature',
    unit: '°C (palette)',
    appropriateFor: ['Coastal warming and upwelling context', 'Comparing SST between dates in the same season'],
    limitations:
      'An L4 *analysis* product (model-blended, gap-free), not a raw satellite measurement at every pixel. Coral-reef-scale gradients near shore may be smoothed.',
    priority: 6
  }),
  layer({
    id: 'GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies',
    title: 'MUR — Sea Surface Temperature Anomalies (L4)',
    summary: 'Departure of daily SST from the long-term climatological mean — the marine heatwave framing.',
    category: 'ocean',
    service: 'wmts',
    tileMatrixSet: 'GoogleMapsCompatible_Level7',
    format: 'png',
    resolution: '~1 km analysis, served at level 7',
    period: 'daily',
    platform: 'Multi-mission (GHRSST MUR)',
    instrument: 'AVHRR / AMSR / others blended',
    parameter: 'SST anomaly vs climatology',
    unit: '°C anomaly (palette)',
    appropriateFor: ['Spotting warmer/cooler-than-usual water', 'Marine heatwave context'],
    limitations:
      'Anomalies depend on the climatology baseline chosen by the product; a warm anomaly is not a measurement of bleaching or ecosystem damage. Layer domain began 2019-07-23 when probed.',
    priority: 6
  }),

  /* ------------------------------ atmosphere ------------------------------ */
  layer({
    id: 'MODIS_Terra_Cloud_Fraction_Day',
    title: 'MODIS Terra — Cloud Fraction (day)',
    summary: 'Fraction of each grid cell covered by cloud during the daytime overpass.',
    category: 'atmosphere',
    service: 'wmts',
    tileMatrixSet: 'GoogleMapsCompatible_Level6',
    format: 'png',
    resolution: '~5 km (Web Mercator level 6)',
    period: 'daily',
    platform: 'Terra',
    instrument: 'MODIS',
    parameter: 'Cloud fraction (day)',
    unit: '% (palette)',
    appropriateFor: ['Interpreting why a true-colour scene is obstructed', 'Regional cloudiness patterns between dates'],
    limitations: 'A single daytime snapshot per day — not a daily-average cloud climatology. Retrieval can confuse bright surfaces (sand, snow) with cloud.',
    priority: 6
  }),
  layer({
    id: 'MODIS_Terra_Aerosol',
    title: 'MODIS Terra — Aerosol Optical Depth',
    summary: 'Column aerosol optical depth over ocean and dark land — smoke, dust and haze loading.',
    category: 'atmosphere',
    service: 'wmts',
    tileMatrixSet: 'GoogleMapsCompatible_Level6',
    format: 'png',
    resolution: '~10 km native, served at level 6',
    period: 'daily',
    platform: 'Terra',
    instrument: 'MODIS',
    parameter: 'Aerosol optical depth (550 nm)',
    unit: 'AOD (dimensionless, palette)',
    appropriateFor: ['Regional haze, dust and smoke loading', 'Comparing pollution episodes with clear days'],
    limitations:
      'Retrievals are unreliable over bright surfaces and clouds; the daily product is a snapshot, not an air-quality index, and says nothing about surface PM2.5 concentrations.',
    priority: 5
  }),
  layer({
    id: 'IMERG_Precipitation_Rate',
    title: 'GPM IMERG — Precipitation Rate',
    summary: 'Global satellite precipitation estimate (GPM IMERG) in mm/hour.',
    category: 'atmosphere',
    service: 'wmts',
    tileMatrixSet: 'GoogleMapsCompatible_Level5',
    format: 'png',
    resolution: '0.1° grid (~11 km), served at level 5',
    period: 'daily view of a sub-daily product',
    platform: 'GPM',
    instrument: 'GMI + constellation radiometers',
    parameter: 'Precipitation rate',
    unit: 'mm/h (palette)',
    appropriateFor: ['Heavy-rain event context over land and ocean', 'Cross-checking rainfall patterns against the POWER monthly series'],
    limitations:
      'Satellite retrieval, not a rain gauge. Light drizzle and orographic enhancement are under- or over-estimated; instantaneous rates vary within a day.',
    priority: 6
  }),

  /* --------------------------------- fire --------------------------------- */
  layer({
    id: 'VIIRS_SNPP_Thermal_Anomalies_375m_All',
    title: 'VIIRS Suomi NPP — Thermal Anomalies / Fires (375 m)',
    summary: 'Active-fire and thermal-anomaly detections (FIRMS) rendered over the globe.',
    category: 'fire',
    service: 'wms',
    format: 'png',
    resolution: '375 m native detections',
    period: 'daily (day and night passes)',
    platform: 'Suomi NPP',
    instrument: 'VIIRS',
    parameter: 'Thermal anomaly detections',
    unit: 'detections (point/area marks, no physical unit)',
    appropriateFor: [
      'Showing where fires and hot spots were detected on a date',
      'Visual comparison of fire activity between two dates in the same season'
    ],
    limitations:
      'Each mark is an individual detection with a confidence class, not an area burned, a fire size, or a severity. GIBS serves this as a raster rendering (the Web Mercator WMTS matrix set is rejected by the service), so detections cannot be counted from the image. Persistent industrial heat sources (kilns, gas flares) also appear.',
    priority: 8
  }),
  layer({
    id: 'MODIS_Terra_Thermal_Anomalies_All',
    title: 'MODIS Terra — Thermal Anomalies / Fires (1 km)',
    summary: 'MODIS active-fire/thermal-anomaly detections (FIRMS), useful for longer historical context.',
    category: 'fire',
    service: 'wms',
    format: 'png',
    resolution: '1 km native detections',
    period: 'daily',
    platform: 'Terra',
    instrument: 'MODIS',
    parameter: 'Thermal anomaly detections',
    unit: 'detections (point/area marks, no physical unit)',
    appropriateFor: ['Historical fire-hunting context alongside VIIRS', 'Deforestation-fire seasonality, viewed with caution'],
    limitations:
      'Coarser than VIIRS (1 km) and detects only larger/ hotter fires; a missing detection is not proof that no fire occurred. Raster rendering only in this application.',
    verification: 'catalog',
    priority: 5
  }),

  /* ------------------------------ night lights ---------------------------- */
  layer({
    id: 'VIIRS_Black_Marble',
    title: 'VIIRS — Black Marble (night lights, annual)',
    summary: 'Annual night-time lights composite (2012 and 2016 epochs available from GIBS).',
    category: 'night',
    service: 'wmts',
    tileMatrixSet: 'GoogleMapsCompatible_Level8',
    format: 'png',
    resolution: '~500 m/pixel (Web Mercator level 8)',
    period: 'annual (2012, 2016)',
    platform: 'Suomi NPP',
    instrument: 'VIIRS Day/Night Band',
    parameter: 'Night-time radiance composite',
    unit: 'radiance (palette, not calibrated here)',
    appropriateFor: ['Settlement extent and electrification context', 'Comparing the 2012 and 2016 epochs'],
    limitations:
      'Only two annual epochs are served by GIBS in this projection; the two images differ in processing and calibration, so pixel-to-pixel brightness differences must not be read as measured change in lighting or emissions.',
    priority: 3
  })
];

export const GIBS_LAYERS: GibsLayerMeta[] = CATALOG.map((item) => ({ ...item }));

const BY_ID = new Map(GIBS_LAYERS.map((item) => [item.id, item]));

export function getGibsLayer(id: string): GibsLayerMeta | undefined {
  return BY_ID.get(id);
}

export function layersByCategory(): Record<string, GibsLayerMeta[]> {
  const grouped: Record<string, GibsLayerMeta[]> = {};
  for (const item of [...GIBS_LAYERS].sort((a, b) => (b.priority || 0) - (a.priority || 0))) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }
  return grouped;
}

/** Default layer for the imagery panel (validated true colour). */
export const DEFAULT_LAYER_ID = 'MODIS_Terra_CorrectedReflectance_TrueColor';

/** Default focus for the lab — Sri Lanka. */
export const DEFAULT_VIEW = {
  center: [7.8731, 80.7718] as [number, number],
  zoom: 6,
  label: 'Sri Lanka'
};

/** Service type guard used by the map component. */
export function serviceOf(layer: GibsLayerMeta): GibsService {
  return layer.service;
}
