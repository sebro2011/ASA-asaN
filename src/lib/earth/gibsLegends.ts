/**
 * Scientific visualization legends and cadence helpers for the verified NASA
 * GIBS layer catalog.
 *
 * GIBS serves pre-rendered RGB composites and color-mapped browse palettes.
 * Legends here document the standard NASA Worldview color ramps and categorical
 * marks so users can interpret satellite overlays accurately while keeping the
 * boundary between browse imagery and calibrated physical measurements explicit.
 */

import type { GibsLayerMeta } from './types';

export interface LegendStop {
  color: string;
  label: string;
}

export interface GibsLayerLegend {
  kind: 'continuous' | 'categorical' | 'rgb';
  title: string;
  unitLabel: string;
  /** CSS linear-gradient string when `kind === 'continuous'`. */
  gradient?: string;
  stops: LegendStop[];
  note: string;
  /** Recommended date-step increments in days for the layer's cadence. */
  stepDays: number;
  /** Optional discrete epoch dates when a layer only publishes fixed epochs. */
  epochs?: string[];
}

const TRUE_COLOR_LEGEND: GibsLayerLegend = {
  kind: 'rgb',
  title: 'Natural-colour reflectance composite',
  unitLabel: 'RGB reflectance (uncalibrated)',
  stops: [
    { color: '#0b2545', label: 'Deep water' },
    { color: '#2d6a4f', label: 'Dense vegetation' },
    { color: '#b08968', label: 'Dry / bare land' },
    { color: '#cfd8dc', label: 'Haze / smoke' },
    { color: '#f8fafc', label: 'Cloud / snow / glint' }
  ],
  note: 'True-colour browse composite, not a calibrated surface-reflectance measurement. Bright white may be cloud, snow, or sun-glint.',
  stepDays: 1
};

const LEGENDS: Record<string, GibsLayerLegend> = {
  MODIS_Terra_CorrectedReflectance_TrueColor: TRUE_COLOR_LEGEND,
  MODIS_Aqua_CorrectedReflectance_TrueColor: TRUE_COLOR_LEGEND,
  VIIRS_SNPP_CorrectedReflectance_TrueColor: TRUE_COLOR_LEGEND,
  VIIRS_NOAA20_CorrectedReflectance_TrueColor: TRUE_COLOR_LEGEND,

  MODIS_Terra_NDVI_8Day: {
    kind: 'continuous',
    title: 'Normalised Difference Vegetation Index (NDVI)',
    unitLabel: 'Dimensionless index (−0.2 to +1.0)',
    gradient: 'linear-gradient(90deg, #5c4033 0%, #c2b280 22%, #a3c962 48%, #3a8f3e 74%, #0b4f1d 100%)',
    stops: [
      { color: '#5c4033', label: '≤ 0.0 Water / bare' },
      { color: '#c2b280', label: '0.2 Sparse' },
      { color: '#a3c962', label: '0.4 Shrub / crop' },
      { color: '#3a8f3e', label: '0.7 Woodland' },
      { color: '#0b4f1d', label: '0.9+ Dense canopy' }
    ],
    note: '8-day composite browse palette. NDVI saturates over dense wet-zone rainforest and is affected by residual cloud.',
    stepDays: 8
  },

  MODIS_Terra_Land_Surface_Temp_Day: {
    kind: 'continuous',
    title: 'Daytime Land Surface Skin Temperature',
    unitLabel: '°C (radiometric skin temperature palette)',
    gradient: 'linear-gradient(90deg, #313695 0%, #4575b4 24%, #fee090 55%, #f46d43 78%, #a50026 100%)',
    stops: [
      { color: '#313695', label: '−25 °C' },
      { color: '#4575b4', label: '0 °C' },
      { color: '#fee090', label: '25 °C' },
      { color: '#f46d43', label: '45 °C' },
      { color: '#a50026', label: '60 °C+' }
    ],
    note: 'Radiometric land skin temperature, not 2 m air temperature (which is retrieved separately from NASA POWER). Cloud-covered pixels are masked.',
    stepDays: 1
  },

  MODIS_Terra_L3_NDSI_Snow_Cover_Daily: {
    kind: 'continuous',
    title: 'Normalised Difference Snow Index (NDSI)',
    unitLabel: '% snow cover index',
    gradient: 'linear-gradient(90deg, #1e293b 0%, #38bdf8 35%, #bae6fd 70%, #ffffff 100%)',
    stops: [
      { color: '#1e293b', label: '0% Snow-free' },
      { color: '#38bdf8', label: '35% Fractional' },
      { color: '#bae6fd', label: '70% High cover' },
      { color: '#ffffff', label: '100% Snow / ice' }
    ],
    note: 'Classification/index browse layer; cloud-obscured pixels are masked and snow-water equivalent is not represented.',
    stepDays: 1
  },

  'MODIS_Combined_Flood_2-Day': {
    kind: 'categorical',
    title: 'MODIS Combined Surface Water & Flood Extent (2-day)',
    unitLabel: 'Surface water classification (250 m)',
    stops: [
      { color: '#ef4444', label: 'Anomalous / flood water' },
      { color: '#3b82f6', label: 'Reference / permanent water' },
      { color: '#64748b', label: 'Cloud / terrain shadow mask' }
    ],
    note: '2-day composite at 250 m resolution. Cloud shadows and turbid water can cause false positives; never use as an operational flood warning.',
    stepDays: 2
  },

  MODIS_Terra_L2_Chlorophyll_A: {
    kind: 'continuous',
    title: 'Near-Surface Chlorophyll-a Concentration',
    unitLabel: 'mg/m³ (logarithmic scale)',
    gradient: 'linear-gradient(90deg, #1d1147 0%, #1f6feb 28%, #22c55e 58%, #facc15 82%, #dc2626 100%)',
    stops: [
      { color: '#1d1147', label: '0.01 Oligotrophic' },
      { color: '#1f6feb', label: '0.1' },
      { color: '#22c55e', label: '1.0 Mesotrophic' },
      { color: '#facc15', label: '10' },
      { color: '#dc2626', label: '30+ mg/m³' }
    ],
    note: 'Log-scaled palette: equal colour steps represent order-of-magnitude changes. Turbid coastal sediment and sun-glint bias nearshore values.',
    stepDays: 1
  },

  GHRSST_L4_MUR_Sea_Surface_Temperature: {
    kind: 'continuous',
    title: 'GHRSST MUR Foundation Sea Surface Temperature (L4)',
    unitLabel: '°C (gap-filled L4 analysis)',
    gradient: 'linear-gradient(90deg, #1e1b4b 0%, #2563eb 25%, #06b6d4 48%, #f59e0b 76%, #b91c1c 100%)',
    stops: [
      { color: '#1e1b4b', label: '−2 °C' },
      { color: '#2563eb', label: '10 °C' },
      { color: '#06b6d4', label: '20 °C' },
      { color: '#f59e0b', label: '28 °C' },
      { color: '#b91c1c', label: '34 °C' }
    ],
    note: 'Multi-sensor blended L4 analysis (gap-free), not single-pass raw radiances.',
    stepDays: 1
  },

  GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies: {
    kind: 'continuous',
    title: 'GHRSST MUR Sea Surface Temperature Anomaly',
    unitLabel: '°C departure from product climatology',
    gradient: 'linear-gradient(90deg, #1d4ed8 0%, #60a5fa 28%, #f8fafc 50%, #fb923c 72%, #b91c1c 100%)',
    stops: [
      { color: '#1d4ed8', label: '−4 °C Cooler' },
      { color: '#60a5fa', label: '−1.5 °C' },
      { color: '#f8fafc', label: '0 °C Normal' },
      { color: '#fb923c', label: '+1.5 °C' },
      { color: '#b91c1c', label: '+4 °C Warmer' }
    ],
    note: 'Diverging SST anomaly relative to the MUR product baseline. Warm anomalies indicate elevated SST, not confirmed ecological impact.',
    stepDays: 1
  },

  MODIS_Terra_Cloud_Fraction_Day: {
    kind: 'continuous',
    title: 'Daytime Cloud Fraction',
    unitLabel: '% grid-cell cloud cover',
    gradient: 'linear-gradient(90deg, #0f172a 0%, #334155 30%, #94a3b8 65%, #f8fafc 100%)',
    stops: [
      { color: '#0f172a', label: '0% Clear' },
      { color: '#334155', label: '30%' },
      { color: '#94a3b8', label: '65%' },
      { color: '#f8fafc', label: '100% Overcast' }
    ],
    note: 'Single daytime Terra overpass snapshot (~10:30 local solar time), not a 24-hour mean.',
    stepDays: 1
  },

  MODIS_Terra_Aerosol: {
    kind: 'continuous',
    title: 'Column Aerosol Optical Depth (550 nm)',
    unitLabel: 'Dimensionless AOD',
    gradient: 'linear-gradient(90deg, #fef9c3 0%, #fde047 28%, #fb923c 60%, #dc2626 84%, #7f1d1d 100%)',
    stops: [
      { color: '#fef9c3', label: '0.05 Clean' },
      { color: '#fde047', label: '0.25 Moderate' },
      { color: '#fb923c', label: '0.6 Haze' },
      { color: '#dc2626', label: '1.0+ Dense smoke/dust' }
    ],
    note: 'Total atmospheric column extinction — does not measure breathing-height surface PM2.5.',
    stepDays: 1
  },

  IMERG_Precipitation_Rate: {
    kind: 'continuous',
    title: 'GPM IMERG Satellite Precipitation Rate',
    unitLabel: 'mm/hour',
    gradient: 'linear-gradient(90deg, #bae6fd 0%, #38bdf8 24%, #22c55e 50%, #facc15 74%, #ef4444 90%, #a855f7 100%)',
    stops: [
      { color: '#bae6fd', label: '0.1 Light' },
      { color: '#38bdf8', label: '1.0' },
      { color: '#22c55e', label: '5.0 Moderate' },
      { color: '#facc15', label: '15 Heavy' },
      { color: '#ef4444', label: '35+' },
      { color: '#a855f7', label: '50+ mm/h' }
    ],
    note: 'Multi-satellite precipitation retrieval on a 0.1° grid — distinct from NASA POWER monthly bias-corrected precipitation.',
    stepDays: 1
  },

  VIIRS_SNPP_Thermal_Anomalies_375m_All: {
    kind: 'categorical',
    title: 'VIIRS 375 m Active Thermal Anomalies',
    unitLabel: 'Discrete thermal detections (WMS)',
    stops: [
      { color: '#f97316', label: 'Active thermal / fire pixel (375 m)' },
      { color: '#ef4444', label: 'High radiative intensity cluster' }
    ],
    note: 'Rendered raster marks show detection locations only — not burned area, fire perimeter, or hotspot count.',
    stepDays: 1
  },

  MODIS_Terra_Thermal_Anomalies_All: {
    kind: 'categorical',
    title: 'MODIS 1 km Active Thermal Anomalies',
    unitLabel: 'Discrete thermal detections (WMS)',
    stops: [
      { color: '#ef4444', label: 'Active thermal / fire pixel (1 km)' },
      { color: '#f59e0b', label: 'Lower-intensity thermal mark' }
    ],
    note: '1 km MODIS thermal detections. Clouds obscure surface fires; industrial heat sources also trigger marks.',
    stepDays: 1
  },

  VIIRS_Black_Marble: {
    kind: 'continuous',
    title: 'VIIRS Day/Night Band — Black Marble Nighttime Lights',
    unitLabel: 'Relative nighttime radiance composite',
    gradient: 'linear-gradient(90deg, #020617 0%, #1e293b 32%, #f59e0b 68%, #fef08a 100%)',
    stops: [
      { color: '#020617', label: 'Unlit ocean / wilderness' },
      { color: '#1e293b', label: 'Rural scatter' },
      { color: '#f59e0b', label: 'Peri-urban / highway' },
      { color: '#fef08a', label: 'Dense urban core' }
    ],
    note: 'Annual composite available for 2012-01-01 and 2016-01-01 epochs in EPSG:3857. Differences reflect sensor calibration as well as lighting.',
    stepDays: 365,
    epochs: ['2012-01-01', '2016-01-01']
  }
};

export function getLayerLegend(layer: GibsLayerMeta): GibsLayerLegend {
  return (
    LEGENDS[layer.id] || {
      kind: 'categorical',
      title: layer.title,
      unitLabel: layer.unit || layer.parameter,
      stops: [{ color: '#5ed3f2', label: layer.parameter }],
      note: layer.limitations,
      stepDays: 1
    }
  );
}
