/**
 * Comprehensive verification suite for COSMORA Earth Intelligence Lab v2:
 *  - Climate Intelligence Engine (quality audit, OLS & Theil–Sen slopes,
 *    multi-baseline anomalies, 12-month climatology, monsoon regimes,
 *    historical epoch split, deseasonalized |z| >= 2.0 unusual observations)
 *  - Multi-location comparison engine, CSV export & LocationComparison UI
 *  - NASA GIBS calibrated legends & cadence metadata across all 16 layers
 *  - AI Earth Analyst 2.0 grounding & trilingual (EN / SI / TA) responses
 *  - Open-source provider adapter (`createOpenSourceProvider`) & secret safety
 *  - Markdown / JSON / CSV research report exports & responsive CSS checks
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import React from 'react';
import { renderToString } from 'react-dom/server';

import '../src/i18n.ts';
import {
  assessDataQuality,
  compareLocations,
  computeAnomalies,
  computeExtendedStats,
  computeHistoricalSplit,
  computeMonthlyClimatology,
  computeSeasonalBreakdown,
  detectUnusualObservations,
  multiLocationCsv
} from '../src/lib/earth/climateEngine.ts';
import { GIBS_LAYERS } from '../src/lib/earth/gibsCatalog.ts';
import { getLayerLegend } from '../src/lib/earth/gibsLegends.ts';
import { buildSeriesStats, daysInMonth, fetchPowerDataset } from '../src/lib/earth/power.ts';
import {
  buildAnalystContext,
  buildMarkdownReport,
  contextForRequest,
  powerSeriesCsv
} from '../src/lib/earth/context.ts';
import { buildLocalAnalystAnswer as buildClientLocalAnswer } from '../src/lib/earth/analysis.ts';
import { analyseBundle, buildLocalAnalystAnswer as buildServerLocalAnswer } from '../server/earth/localAnalysis.ts';
import { createOpenSourceProvider, extractJson, normaliseAnswer } from '../server/earth/providers.ts';
import { createOrchestrator } from '../server/earth/providerOrchestrator.ts';
import { earthRouter, __setAnalystOrchestratorForTests } from '../server/earthIntelligence.ts';
import LocationComparison from '../src/components/earth/LocationComparison.tsx';

function makePowerDataset({
  placeLabel,
  latitude,
  longitude,
  elevationMeters = 18,
  startYear = 2015,
  endYear = 2024,
  baseTemp = 27.2,
  warmingPerYear = 0.04,
  baseRain = 5.0,
  swMonsoonBoost = 3.5,
  neMonsoonBoost = 0.8,
  missingDates = [],
  spikeDate = null,
  spikeDelta = 0
}) {
  const missingSet = new Set(missingDates);
  const rows = [];
  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const mm = String(month).padStart(2, '0');
      const date = `${year}-${mm}`;
      if (missingSet.has(date)) {
        rows.push({ date, year, month, values: { T2M: null, PRECTOTCORR: null } });
        continue;
      }
      const seasonalTemp = Math.sin(((month - 3) / 12) * Math.PI * 2) * 1.1;
      let t2m = baseTemp + (year - startYear) * warmingPerYear + seasonalTemp;
      if (spikeDate === date) t2m += spikeDelta;

      let rain = baseRain;
      if (month >= 5 && month <= 9) rain += swMonsoonBoost;
      if (month === 12 || month <= 2) rain += neMonsoonBoost;

      rows.push({
        date,
        year,
        month,
        values: {
          T2M: Number(t2m.toFixed(3)),
          PRECTOTCORR: Number(rain.toFixed(3))
        }
      });
    }
  }

  return {
    latitude,
    longitude,
    placeLabel,
    startYear,
    endYear,
    requestedParameters: ['T2M', 'PRECTOTCORR', 'WS2M'],
    available: ['T2M', 'PRECTOTCORR'],
    unavailable: ['WS2M'],
    rows,
    stats: {
      T2M: buildSeriesStats(rows, 'T2M', '°C'),
      PRECTOTCORR: buildSeriesStats(rows, 'PRECTOTCORR', 'mm/day')
    },
    elevationMeters,
    gridNote: 'NASA POWER ~0.5° × 0.625° grid-cell estimate.'
  };
}

test('ClimateEngine: assesses completeness, missing-month spans, OLS & Theil–Sen slopes without claiming significance', () => {
  const ds = makePowerDataset({
    placeLabel: 'Colombo',
    latitude: 6.9271,
    longitude: 79.8612,
    startYear: 2015,
    endYear: 2024,
    warmingPerYear: 0.05,
    missingDates: ['2018-06', '2018-07']
  });

  const quality = assessDataQuality(ds, 'T2M');
  assert.equal(quality.expectedMonths, 120);
  assert.equal(quality.retrievedMonths, 118);
  assert.equal(quality.missingMonths, 2);
  assert.equal(quality.completeYears, 9);
  assert.equal(quality.partialYears, 1);
  assert.equal(quality.gapSpans.length, 1);
  assert.deepEqual(quality.gapSpans[0], { start: '2018-06', end: '2018-07', months: 2 });

  const ext = computeExtendedStats(ds, 'T2M');
  assert.ok(ext.olsTrend, 'OLS trend is computed across complete 12-month years');
  assert.ok(ext.senSlope, 'Theil–Sen median slope is computed across complete 12-month years');
  assert.equal(ext.olsTrend.years, 9, 'partial year 2018 is excluded from annual slope calculation');
  // 0.05 °C/yr = +0.50 °C/decade
  assert.ok(Math.abs(ext.olsTrend.slopePerDecade - 0.5) < 0.02, `expected ~0.5 °C/dec, got ${ext.olsTrend.slopePerDecade}`);
  assert.ok(Math.abs(ext.senSlope.slopePerDecade - 0.5) < 0.02);
  assert.match(ext.caveat, /descriptive/i);
  assert.doesNotMatch(ext.caveat, /statistically significant/i);

  const rainExt = computeExtendedStats(ds, 'PRECTOTCORR');
  assert.ok(rainExt.meanAnnualTotalMm && rainExt.meanAnnualTotalMm > 1500, 'annual precipitation total in mm/yr is derived using exact daysInMonth');
});

test('ClimateEngine: computes temperature and precipitation anomalies across selectable baselines', () => {
  const ds = makePowerDataset({
    placeLabel: 'Kandy',
    latitude: 7.2906,
    longitude: 80.6337,
    startYear: 1995,
    endYear: 2024,
    warmingPerYear: 0.03
  });

  const wmo = computeAnomalies(ds, 'T2M', 'wmo-1991-2020');
  assert.equal(wmo.available, true);
  assert.match(wmo.baselineLabel, /1995–2020/);
  assert.equal(wmo.points.length, 30);
  assert.ok(wmo.latest && wmo.latest.anomaly > 0, 'warming series shows positive departure in 2024 vs 1995–2020 overlap');

  const rainAnom = computeAnomalies(ds, 'PRECTOTCORR', 'earliest-5');
  assert.equal(rainAnom.available, true);
  assert.ok(rainAnom.baselineMeanTotalMm !== null);
  assert.ok(rainAnom.latest && rainAnom.latest.percentAnomaly !== null);
  assert.ok(rainAnom.latest && rainAnom.latest.totalAnomalyMm !== null);
});

test('ClimateEngine: computes 12-month climatology, South Asian monsoon regimes, epoch split & |z| >= 2.0 extremes', () => {
  const ds = makePowerDataset({
    placeLabel: 'Galle',
    latitude: 6.0535,
    longitude: 80.221,
    startYear: 2010,
    endYear: 2024,
    warmingPerYear: 0.04,
    swMonsoonBoost: 4.5,
    neMonsoonBoost: 0.4,
    spikeDate: '2023-04',
    spikeDelta: 3.8
  });

  const clim = computeMonthlyClimatology(ds, 'PRECTOTCORR');
  assert.equal(clim.length, 12);
  assert.ok((clim[5].meanTotalMm || 0) > (clim[2].meanTotalMm || 0), 'June SW monsoon rainfall exceeds March');

  const seasons = computeSeasonalBreakdown(ds, 'PRECTOTCORR');
  const swm = seasons.find((s) => s.id === 'SWM');
  const nem = seasons.find((s) => s.id === 'NEM');
  assert.ok(swm && nem && (swm.mean || 0) > (nem.mean || 0), 'South-West Monsoon exceeds North-East Monsoon on western coast');
  assert.ok((swm.shareOfAnnualPct || 0) > 40);

  const split = computeHistoricalSplit(ds, 'T2M');
  assert.ok(split);
  assert.ok(split.delta > 0.2, 'recent epoch is warmer than earlier epoch in synthetic warming series');

  const unusual = detectUnusualObservations(ds, 'T2M', 2.0);
  assert.ok(unusual.some((u) => u.date === '2023-04' && u.direction === 'high' && u.zScore >= 2.0), 'detects 2023-04 warm spike');
});

test('Multi-Location Comparison: aligns Colombo, Nuwara Eliya & Trincomalee and exports RFC-4180 CSV', () => {
  const colombo = makePowerDataset({
    placeLabel: 'Colombo',
    latitude: 6.9271,
    longitude: 79.8612,
    elevationMeters: 12,
    baseTemp: 27.6,
    swMonsoonBoost: 4.8,
    neMonsoonBoost: 0.6
  });
  const nuwaraEliya = makePowerDataset({
    placeLabel: 'Nuwara Eliya',
    latitude: 6.9497,
    longitude: 80.7891,
    elevationMeters: 1880,
    baseTemp: 16.4,
    swMonsoonBoost: 3.1,
    neMonsoonBoost: 1.8
  });
  const trincomalee = makePowerDataset({
    placeLabel: 'Trincomalee',
    latitude: 8.5874,
    longitude: 81.2152,
    elevationMeters: 8,
    baseTemp: 28.4,
    swMonsoonBoost: 0.5,
    neMonsoonBoost: 5.2
  });

  const inputs = [
    { id: 'colombo', label: 'Colombo', dataset: colombo },
    { id: 'nuwara', label: 'Nuwara Eliya', dataset: nuwaraEliya },
    { id: 'trinco', label: 'Trincomalee', dataset: trincomalee }
  ];

  const tempComp = compareLocations(inputs, 'T2M');
  assert.equal(tempComp.summaries.length, 3);
  assert.equal(tempComp.summaries[0].deltaFromPrimary, 0);
  assert.ok((tempComp.summaries[1].deltaFromPrimary || 0) < -10, 'Nuwara Eliya highland cooling offset vs Colombo is < -10 °C');
  assert.equal(tempComp.climatologyRows.length, 12);

  const csv = multiLocationCsv(inputs, 'PRECTOTCORR');
  const lines = csv.trim().split('\n');
  assert.match(lines[0], /^year,Colombo \(PRECTOTCORR mm\/day\),Nuwara Eliya \(PRECTOTCORR mm\/day\),Trincomalee \(PRECTOTCORR mm\/day\)/);
  assert.equal(lines.length, 1 + tempComp.annualRows.length);

  // SSR render check for LocationComparison workspace
  const html = renderToString(
    React.createElement(LocationComparison, {
      primaryArea: { label: 'Colombo', latitude: 6.9271, longitude: 79.8612, source: 'preset' },
      reducedMotion: true
    })
  );
  assert.ok(html.includes('Multi-Location Climate Comparison'));
  assert.ok(html.includes('Nuwara Eliya'));
});

test('POWER Client: deduplicates identical concurrent in-flight requests', async () => {
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async (url) => {
    networkCalls += 1;
    await new Promise((r) => setTimeout(r, 25));
    const urlStr = String(url);
    if (urlStr.includes('/api/earth/power')) {
      return new Response(
        JSON.stringify({
          ok: true,
          sourceUrl: 'https://power.larc.nasa.gov/api/temporal/monthly/point',
          retrievedAt: '2026-11-15T12:00:00Z',
          usedParameters: ['T2M'],
          payload: {
            properties: {
              parameter: {
                T2M: { '202301': 27.1, '202302': 27.4, '202313': -999 }
              }
            }
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw new Error(`Unexpected URL: ${urlStr}`);
  };

  try {
    const args = {
      latitude: 8.3114,
      longitude: 80.4037,
      startYear: 2023,
      endYear: 2023,
      placeLabel: 'Anuradhapura',
      parameters: ['T2M']
    };
    const [resA, resB] = await Promise.all([fetchPowerDataset(args), fetchPowerDataset(args)]);
    assert.equal(networkCalls, 1, 'simultaneous identical fetchPowerDataset calls share a single network request');
    assert.equal(resA.data?.rows.length, 2);
    assert.equal(resB.data?.rows.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('NASA GIBS Legends: every catalog layer has calibrated legend stops, units & cadence metadata', () => {
  assert.ok(GIBS_LAYERS.length >= 16);
  for (const layer of GIBS_LAYERS) {
    const legend = getLayerLegend(layer);
    assert.ok(legend.title.length > 3, `missing legend title for ${layer.id}`);
    assert.ok(legend.unitLabel.length > 0, `missing unitLabel for ${layer.id}`);
    assert.ok(legend.stops.length >= 2, `expected >= 2 stops for ${layer.id}`);
    assert.ok(legend.note.length > 10, `missing non-measurement note for ${layer.id}`);
    assert.ok((legend.stepDays || 0) >= 1, `invalid stepDays for ${layer.id}`);
    if (legend.kind === 'continuous') {
      assert.match(legend.gradient || '', /^linear-gradient\(/, `continuous layer ${layer.id} has CSS gradient`);
    }
  }
  const blackMarble = GIBS_LAYERS.find((l) => l.id === 'VIIRS_Black_Marble');
  assert.deepEqual(getLayerLegend(blackMarble).epochs, ['2012-01-01', '2016-01-01']);
});

test('AI Earth Analyst 2.0: grounds single & multi-location answers and responds in EN, Sinhala (SI) & Tamil (TA)', async () => {
  const colombo = makePowerDataset({
    placeLabel: 'Colombo',
    latitude: 6.9271,
    longitude: 79.8612,
    startYear: 2020,
    endYear: 2024,
    baseTemp: 27.5,
    missingDates: ['2022-05'],
    spikeDate: '2024-04',
    spikeDelta: 3.5
  });
  const nuwara = makePowerDataset({
    placeLabel: 'Nuwara Eliya',
    latitude: 6.9497,
    longitude: 80.7891,
    startYear: 2020,
    endYear: 2024,
    baseTemp: 16.2
  });

  const bundleInput = {
    area: { label: 'Colombo', latitude: 6.9271, longitude: 79.8612, source: 'preset' },
    primaryDate: '2026-11-10',
    compareDate: null,
    layers: [{ layer: GIBS_LAYERS[0], domain: null }],
    power: colombo,
    powerProvenanceUrl: 'https://power.larc.nasa.gov/api/temporal/monthly/point',
    powerRetrievedAt: '2026-11-15T12:00:00Z',
    comparisonPowers: [
      {
        label: 'Nuwara Eliya',
        power: nuwara,
        sourceUrl: 'https://power.larc.nasa.gov/api/temporal/monthly/point',
        retrievedAt: '2026-11-15T12:00:00Z'
      }
    ]
  };

  const clientContext = buildAnalystContext(bundleInput);
  assert.equal(clientContext.comparisonLocations?.length, 1);

  const reqPayload = contextForRequest(clientContext, 'Compare Colombo and Nuwara Eliya');
  assert.equal(reqPayload.context.comparisonLocations.length, 1);

  // Test HTTP route in EN, SI, and TA using deterministic local mode
  __setAnalystOrchestratorForTests(createOrchestrator({ providers: [] }));
  const app = express();
  app.use(express.json({ limit: '512kb' }));
  app.use('/api/earth', earthRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    for (const [lang, scriptRegex] of [
      ['en', /Colombo[\s\S]*Nuwara Eliya/],
      ['si', /[\u0D80-\u0DFF]/],
      ['ta', /[\u0B80-\u0BFF]/]
    ]) {
      const resp = await fetch(`http://127.0.0.1:${port}/api/earth/analyst`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...reqPayload, lang })
      });
      assert.equal(resp.status, 200);
      const body = await resp.json();
      assert.equal(body.ok, true);
      assert.equal(body.mode, 'local');
      const flatText = body.sections.map((s) => `${s.title} ${s.bullets.join(' ')}`).join(' ');
      assert.match(flatText, scriptRegex, `expected ${lang} script/content in analyst response`);
      assert.match(flatText, /Nuwara Eliya/, `expected multi-location comparison evidence in ${lang}`);
      assert.match(flatText, /2022-05|missing|අගයන්|விடுபட்ட/, `expected missing-month gap disclosure in ${lang}`);
    }

    // Browser offline fallback also respects lang
    const siBrowserFallback = buildClientLocalAnswer('කොළඹ දේශගුණය', clientContext, 'si');
    assert.match(siBrowserFallback.sections[0].bullets[0], /[\u0D80-\u0DFF]/);
    const taBrowserFallback = buildClientLocalAnswer('கொழும்பு காலநிலை', clientContext, 'ta');
    assert.match(taBrowserFallback.sections[0].bullets[0], /[\u0B80-\u0BFF]/);

    // Markdown report includes Climate Intelligence + Multi-location table + missing-cell CSV honesty
    const md = buildMarkdownReport({
      ...bundleInput,
      context: clientContext,
      generatedAt: '2026-11-15T12:00:00Z'
    });
    assert.match(md, /### Climate Intelligence & Data Quality Summary/);
    assert.match(md, /## Multi-location climate comparison \(NASA POWER\)/);
    assert.match(md, /Nuwara Eliya/);

    const singleCsv = powerSeriesCsv(colombo);
    assert.match(singleCsv, /^2022-05,,,,$/m, 'missing month 2022-05 stays blank in CSV, never zero');
  } finally {
    __setAnalystOrchestratorForTests(null);
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Open-Source Provider Adapter & Security Hygiene: inactive by default, grounded when configured, zero leaked secrets', async () => {
  const unconfigured = createOpenSourceProvider({ baseUrl: '' });
  assert.equal(unconfigured.isConfigured(), false);

  let capturedAuth = '';
  const configured = createOpenSourceProvider({
    baseUrl: 'http://127.0.0.1:11434/v1/chat/completions',
    apiKey: 'oss-local-test-token',
    model: 'qwen2.5:7b-instruct',
    fetchImpl: async (_url, init) => {
      capturedAuth = (init?.headers)?.Authorization || '';
      return new Response(
        JSON.stringify({
          model: 'qwen2.5:7b-instruct',
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sections: [
                    { kind: 'verified', bullets: ['T2M mean 27.5 °C from NASA POWER.'] },
                    { kind: 'limitations', bullets: ['Gridded ~0.5° × 0.625° estimate, not a station gauge.'] }
                  ],
                  sources: [{ label: 'NASA POWER', url: 'https://power.larc.nasa.gov/api/temporal/monthly/point' }]
                })
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  });
  assert.equal(configured.isConfigured(), true);
  const rawReply = await configured.generate({
    question: 'Summarise T2M',
    lang: 'en',
    context: { datasets: [{ sourceUrl: 'https://power.larc.nasa.gov/api/temporal/monthly/point' }] },
    signal: new AbortController().signal,
    timeoutMs: 5000
  });
  assert.equal(capturedAuth, 'Bearer oss-local-test-token');
  const normalised = normaliseAnswer(extractJson(rawReply), [
    'https://power.larc.nasa.gov/api/temporal/monthly/point'
  ]);
  assert.ok(normalised);
  assert.equal(normalised.sections.length, 2);

  // Verify responsive CSS & zero client-side secret references
  const css = fs.readFileSync(path.resolve('src/styles/earth-lab.css'), 'utf8');
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(css, /\.earth-command-deck/);
  assert.match(css, /\.earth-legend-ramp/);

  const clientEarthFiles = [
    ...fs.readdirSync('src/lib/earth').map((f) => path.join('src/lib/earth', f)),
    ...fs.readdirSync('src/components/earth').map((f) => path.join('src/components/earth', f)),
    'src/components/EarthIntelligenceLab.jsx'
  ];
  for (const file of clientEarthFiles) {
    if (!fs.statSync(file).isFile()) continue;
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /GEMINI_API_KEY|OPENROUTER_API_KEY|EARTH_FIRMS_MAP_KEY|ARENA_API_KEY/, `${file} must never reference server secret names`);
  }
});
