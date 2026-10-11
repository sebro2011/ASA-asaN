/**
 * Builds the grounded context bundle sent to the AI analyst, and the exportable
 * report. Both contain *only* values that were actually retrieved — the bundle
 * is the single source of truth for AI answers, so the model cannot invent
 * measurements that the app never fetched.
 */

import { describeCoverage } from './domains';
import { parameterMeta } from './power';
import { describeSeries, seriesLimitations, type AnalystContext } from './analysis';
import type { AvailabilityVerdict, GibsDomain, GibsLayerMeta, PowerDataset } from './types';

export interface SelectedArea {
  label: string;
  latitude: number;
  longitude: number;
  /** Optional bounding box `[south, west, north, east]` used for imagery comparisons. */
  bounds?: [number, number, number, number];
  source: 'gazetteer' | 'search' | 'map-click' | 'preset';
}

export interface BundleInput {
  area: SelectedArea;
  primaryDate: string;
  compareDate?: string | null;
  layers: Array<{ layer: GibsLayerMeta; domain: GibsDomain | null; availability?: AvailabilityVerdict; probeOk?: boolean | null }>;
  power: PowerDataset | null;
  powerProvenanceUrl?: string;
  powerRetrievedAt?: string;
  probeNotes?: string[];
  renderedDifference?: {
    meanAbsoluteDifference: number;
    changedFraction: number;
    transparentFraction: number;
    method: string;
    computedAt: string;
  } | null;
}

export function buildAnalystContext(input: BundleInput): AnalystContext {
  const dataGaps: string[] = [];

  if (input.compareDate) {
    dataGaps.push(
      `Two dates are selected (${input.primaryDate} and ${input.compareDate}); a single image pair cannot establish a trend.`
    );
  }

  input.layers.forEach((entry) => {
    if (!entry.domain) {
      dataGaps.push(`Observation-date domain for ${entry.layer.id} could not be retrieved; availability is unverified.`);
    }
    if (entry.probeOk === false) {
      dataGaps.push(`${entry.layer.id} did not return a renderable image in EPSG:3857 during a live probe.`);
    }
  });

  if (!input.power) {
    dataGaps.push('No NASA POWER archive was retrieved for the selected area.');
  }

  (input.probeNotes || []).forEach((note) => dataGaps.push(note));

  return {
    areaLabel: input.area.label,
    latitude: input.area.latitude,
    longitude: input.area.longitude,
    dates: [input.primaryDate, input.compareDate].filter(Boolean) as string[],
    layers: input.layers.map((entry) => ({
      id: entry.layer.id,
      title: entry.layer.title,
      category: entry.layer.category,
      unit: entry.layer.unit,
      coverage: describeCoverage(entry.domain),
      availability: entry.availability,
      provenanceUrl: entry.domain?.sourceUrl || `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/${entry.layer.id}/default/all/all.xml`
    })),
    domains: input.layers.map((entry) => ({ layerId: entry.layer.id, domain: entry.domain })),
    power: input.power
      ? {
          placeLabel: input.power.placeLabel,
          latitude: input.power.latitude,
          longitude: input.power.longitude,
          requestedParameters: input.power.requestedParameters,
          available: input.power.available,
          unavailable: input.power.unavailable,
          rows: input.power.rows.length,
          firstMonth: input.power.rows[0]?.date,
          lastMonth: input.power.rows[input.power.rows.length - 1]?.date,
          stats: input.power.available.map((code) => input.power!.stats[code]).filter(Boolean),
          sourceUrl: input.powerProvenanceUrl || 'https://power.larc.nasa.gov/api/temporal/monthly/point',
          retrievedAt: input.powerRetrievedAt || new Date().toISOString()
        }
      : null,
    dataGaps
  };
}

/** Compact JSON payload posted to `/api/earth/analyst`. */
export function contextForRequest(context: AnalystContext, question: string) {
  return {
    question,
    context: {
      area: {
        label: context.areaLabel,
        latitude: Number(context.latitude.toFixed(4)),
        longitude: Number(context.longitude.toFixed(4))
      },
      dates: context.dates,
      layers: context.layers.map((layer) => ({
        id: layer.id,
        title: layer.title,
        category: layer.category,
        unit: layer.unit,
        coverage: layer.coverage,
        requestedDate: layer.availability?.requestedDate,
        availability: layer.availability?.verdict,
        availabilityDetail: layer.availability?.detail,
        nearestAvailableDate: layer.availability?.nearestDate,
        serviceUrl: layer.provenanceUrl
      })),
      power: context.power
        ? {
            place: context.power.placeLabel,
            latitude: Number(context.power.latitude.toFixed(3)),
            longitude: Number(context.power.longitude.toFixed(3)),
            months: context.power.rows,
            from: context.power.firstMonth,
            to: context.power.lastMonth,
            available: context.power.available,
            unavailable: context.power.unavailable,
            stats: context.power.stats.map((stats) => ({
              code: stats.code,
              unit: stats.unit,
              count: stats.count,
              mean: stats.mean,
              min: stats.min,
              max: stats.max,
              trendPerYear: stats.trend ? Number(stats.trend.slopePerYear.toFixed(4)) : null,
              trendWindow: stats.trend ? `${stats.trend.fromYear}-${stats.trend.toYear}` : null,
              completeYears: stats.annual.filter((entry) => entry.complete).length
            })),
            sourceUrl: context.power.sourceUrl,
            retrievedAt: context.power.retrievedAt
          }
        : null,
      dataGaps: context.dataGaps
    }
  };
}

export interface ReportBundle extends BundleInput {
  context: AnalystContext;
  generatedAt: string;
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Monthly series as CSV — only rows and parameters that were actually retrieved. */
export function powerSeriesCsv(power: PowerDataset): string {
  const codes = power.available;
  const header = ['month', ...codes, ...codes.map((code) => `${code}_unit`)];
  const unitRow = ['', ...codes.map((code) => parameterMeta(code)?.unit || ''), ...codes.map(() => '')];
  const lines = [header.join(','), unitRow.join(',')];
  for (const row of power.rows) {
    lines.push([row.date, ...codes.map((code) => row.values[code] ?? ''), ...codes.map(() => '')].join(','));
  }
  return lines.join('\n');
}

/**
 * Markdown report assembled strictly from the retrieved bundle. Numbers appear
 * only when they were returned by a provider; missing data is stated as missing.
 */
export function buildMarkdownReport(bundle: ReportBundle): string {
  const { context } = bundle;
  const out: string[] = [];
  const date = (value?: string) => value || 'not available';

  out.push('# Earth Intelligence Lab — observation report');
  out.push('');
  out.push(`Generated: ${bundle.generatedAt}`);
  out.push('');
  out.push('## Study area');
  out.push('');
  out.push(`- Label: ${context.areaLabel}`);
  out.push(`- Coordinates (WGS84): ${context.latitude.toFixed(4)}, ${context.longitude.toFixed(4)}`);
  out.push(`- Coordinates source: ${bundle.area.source}`);
  if (bundle.area.bounds) {
    out.push(`- Bounding box [S, W, N, E]: ${bundle.area.bounds.map((value) => value.toFixed(3)).join(', ')}`);
  }
  out.push(`- Observation date(s): ${context.dates.join(', ') || 'none'}`);
  out.push('');

  out.push('## Datasets in view');
  out.push('');
  out.push('| Dataset | Identifier | Service | Requested date | Availability | Reported coverage |');
  out.push('| --- | --- | --- | --- | --- | --- |');
  for (const layer of bundle.layers) {
    out.push(
      `| ${layer.layer.title} | \`${layer.layer.id}\` | ${layer.layer.service.toUpperCase()} (${
        layer.layer.tileMatrixSet || 'WMS raster'
      }) | ${date(layer.availability?.requestedDate)} | ${layer.availability?.verdict || 'unverified'} | ${
        describeCoverage(layer.domain) || 'not retrieved'
      } |`
    );
  }
  out.push('');
  out.push('Provenance URLs:');
  out.push('');
  for (const layer of context.layers) {
    out.push(`- ${layer.id}: ${layer.provenanceUrl}`);
  }
  out.push('');

  out.push('## NASA POWER monthly archive');
  out.push('');
  if (context.power) {
    out.push(`- Place: ${context.power.placeLabel} (${context.power.latitude.toFixed(3)}, ${context.power.longitude.toFixed(3)})`);
    out.push(`- Months retrieved: ${context.power.rows}${context.power.firstMonth ? ` (${context.power.firstMonth} → ${context.power.lastMonth})` : ''}`);
    out.push(`- Parameters available: ${context.power.available.join(', ') || 'none'}`);
    out.push(`- Parameters requested but unavailable: ${context.power.unavailable.join(', ') || 'none'}`);
    out.push(`- Source URL: ${context.power.sourceUrl}`);
    out.push(`- Retrieval timestamp: ${context.power.retrievedAt}`);
    out.push('');
    out.push('| Parameter | Unit | Months | Mean | Minimum | Maximum | Annual-mean slope |');
    out.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const stats of context.power.stats) {
      out.push(
        `| ${stats.code} | ${stats.unit || '—'} | ${stats.count} | ${stats.mean ?? '—'} | ${
          stats.min ? `${stats.min.value} (${stats.min.date})` : '—'
        } | ${stats.max ? `${stats.max.value} (${stats.max.date})` : '—'} | ${
          stats.trend ? `${stats.trend.slopePerYear.toFixed(4)}/year (${stats.trend.fromYear}–${stats.trend.toYear})` : 'not computed'
        } |`
      );
    }
    out.push('');
    out.push('Derived statistics (descriptive only):');
    out.push('');
    for (const stats of context.power.stats) {
      describeSeries(stats).forEach((line) => out.push(`- ${line}`));
    }
    out.push('');
    out.push('Limitations:');
    out.push('');
    context.power.stats.forEach((stats) => {
      seriesLimitations(stats).forEach((line) => out.push(`- ${stats.code}: ${line}`));
    });
  } else {
    out.push('No NASA POWER archive was retrieved for this selection, so no climate-series statements are included.');
  }
  out.push('');

  if (bundle.renderedDifference) {
    out.push('## Rendered-pixel difference (derived, two dates)');
    out.push('');
    out.push(`- Mean absolute luminance difference: ${bundle.renderedDifference.meanAbsoluteDifference}`);
    out.push(`- Share of pixels changed by >12/255: ${(bundle.renderedDifference.changedFraction * 100).toFixed(2)}%`);
    out.push(`- Transparent/no-data fraction: ${(bundle.renderedDifference.transparentFraction * 100).toFixed(2)}%`);
    out.push(`- Method: ${bundle.renderedDifference.method}`);
    out.push(`- Computed: ${bundle.renderedDifference.computedAt}`);
    out.push('');
    out.push(
      'This is a difference between two *renderings* of the imagery, not a calibrated physical change. Cloud cover, sun angle, aerosols, sensor and processing differences all contribute. It must not be reported as evidence of surface change on its own.'
    );
    out.push('');
  }

  out.push('## Missing data & caveats reported by the Lab');
  out.push('');
  (context.dataGaps.length ? context.dataGaps : ['None reported for this selection.']).forEach((gap) => out.push(`- ${gap}`));
  out.push('');
  out.push('## What is not included in this report');
  out.push('');
  out.push('- No values are interpolated, estimated or carried over from other dates.');
  out.push('- No disaster alerts, hotspot counts, burned areas or calibrated measurements are reported, because the services used do not return them here.');
  out.push('- No statistical significance, attribution or forecast is claimed.');
  out.push('');
  out.push('## Sources');
  out.push('');
  out.push('- NASA EOSDIS Global Imagery Browse Services (GIBS) — https://nasa-gibs.github.io/gibs-api-docs/');
  out.push('- NASA POWER — https://power.larc.nasa.gov/');
  out.push('- NASA FIRMS (thermal anomalies referenced by the GIBS fire layers) — https://firms.modaps.eosdis.nasa.gov/');
  out.push('');
  out.push('> Imagery and data are provided by NASA. This report was assembled by NASA Space Explorer and is not an official NASA product.');
  return out.join('\n');
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export { csvEscape };
