/**
 * The two home cards must not overstate what they show.
 *
 * Both defects here were visible on the deployed home page (screenshots,
 * 2026-11-18):
 *
 *  1. The Earth card printed **"Complete years 15"** for a 2012–2026 NASA POWER
 *     series while the live payload only had January–September 2026 (9 of 12
 *     months). There are 14 complete years; 2026 is in progress. The chart drew
 *     the partial year as if it were an ordinary annual mean, which flatters the
 *     upward slope by eye even though the fitted slope already excludes it.
 *  2. The APOD card showed a four-day-old picture labelled only `CACHED`. The
 *     loader knew the reason ("api.nasa.gov returned a site logo instead of the
 *     entry image") and the age ("saved 4 days ago") and the panel printed
 *     neither — and offered no way to retry the tile.
 *
 * Run: node --import tsx --test --force-exit scripts/test-home-preview-honesty.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

import '../src/i18n.ts';
import EarthPreview from '../src/pages/home/EarthPreview.tsx';
import { ApodPanel } from '../src/pages/home/MissionOverview.tsx';
import { Sparkline } from '../src/pages/home/Sparkline.tsx';

/* ------------------------------------------------------------------ helpers */

/** The live POWER series for Colombo 2012–2026, as fetched on 2026-11-18. */
const ANNUAL_MEANS = [
  [2012, 26.255],
  [2013, 26.098],
  [2014, 26.407],
  [2015, 26.415],
  [2016, 26.652],
  [2017, 26.528],
  [2018, 26.275],
  [2019, 26.853],
  [2020, 26.802],
  [2021, 26.404],
  [2022, 26.239],
  [2023, 26.627],
  [2024, 27.121],
  [2025, 26.492],
  [2026, 26.731]
];

function earthPoints({ lastComplete = false } = {}) {
  return ANNUAL_MEANS.map(([year, mean]) => ({
    year,
    mean,
    complete: year < 2026 || lastComplete
  }));
}

function earthResource({ lastComplete = false, state = 'cached' } = {}) {
  const points = earthPoints({ lastComplete });
  return {
    phase: 'ready',
    error: null,
    reload: () => {},
    data: {
      state,
      retrievedAt: '2026-11-18T10:23:20.456Z',
      data: {
        placeLabel: 'Colombo, Sri Lanka',
        latitude: 6.927,
        longitude: 79.861,
        parameter: 'T2M',
        unit: '°C',
        points,
        mean: 26.523,
        slopePerYear: 0.034,
        years: { start: 2012, end: 2026 },
        sourceUrl: 'https://power.larc.nasa.gov/api/temporal/monthly/point',
        retrievedAt: '2026-11-18T10:23:20.456Z',
        state,
        note: undefined
      }
    }
  };
}

const APOD = {
  date: '2026-11-14',
  title: 'Apollo 12 and Surveyor 3',
  explanation: 'Put on your red/blue glasses and gaze across the western Ocean of Storms.',
  url: 'https://apod.nasa.gov/apod/image/2511/apollo12_anaglyph.jpg',
  media_type: 'image',
  source: 'NASA Science APOD archive'
};

function apodResource(state, note) {
  return {
    phase: 'ready',
    error: null,
    reload: () => {},
    data: {
      state,
      note,
      retrievedAt: '2026-11-14T06:30:00.000Z',
      data: APOD
    }
  };
}

/* ------------------------------------------------------------ Earth preview */

test('the "complete years" metric counts complete years, not data points', () => {
  const html = renderToString(
    React.createElement(EarthPreview, { resource: earthResource(), onNavigate: () => {} })
  );

  assert.match(html, />14</, '2012–2025 is 14 complete years');
  assert.doesNotMatch(html, />15</, 'the in-progress 2026 point is not a complete year');
  assert.match(html, /2026 still in progress/, 'the tooltip names the year that is still running');
});

test('a fully complete series still reports 15 years', () => {
  const html = renderToString(
    React.createElement(EarthPreview, {
      resource: earthResource({ lastComplete: true }),
      onNavigate: () => {}
    })
  );
  assert.match(html, />15</);
  assert.doesNotMatch(html, /still in progress/);
});

test('the chart draws the year in progress as provisional, not as an annual mean', () => {
  const html = renderToString(
    React.createElement(Sparkline, {
      points: earthPoints(),
      unit: '°C',
      label: 'Colombo annual mean temperature'
    })
  );

  assert.match(html, /data-incomplete="true"/, 'the partial year has its own marker');
  assert.match(html, /2026 in progress, not in 2012–2025/, 'the caption says it is excluded from the trend');
  assert.match(html, /stroke-dasharray="3 3"/, 'it is joined to the series by a dashed segment');
  assert.match(html, /aria-label="[^"]*2026 is still in progress and excluded from the trend/);
});

test('a chart with no partial year makes no provisional claim', () => {
  const html = renderToString(
    React.createElement(Sparkline, {
      points: earthPoints({ lastComplete: true }),
      unit: '°C',
      label: 'Colombo annual mean temperature'
    })
  );
  assert.doesNotMatch(html, /data-incomplete/);
  assert.doesNotMatch(html, /in progress/);
});

/* --------------------------------------------------------------- APOD panel */

test('a cached APOD says when it was saved and why, and offers its own retry', () => {
  const note =
    'Live request failed (api.nasa.gov returned a site logo instead of the entry image). Showing the value saved 4 days ago.';
  const html = renderToString(
    React.createElement(ApodPanel, { resource: apodResource('cached', note), onNavigate: () => {} })
  );

  assert.match(html, /data-testid="apod-provenance-note"/);
  assert.match(html, /returned a site logo instead of the entry image/, 'the reason survives to the card');
  assert.match(html, /saved 4 days ago/, 'and so does the age');
  assert.match(html, /CACHED/i);
  assert.match(html, /Try again/, 'the tile can retry itself');
});

test('a live APOD shows no staleness note and no retry', () => {
  const html = renderToString(
    React.createElement(ApodPanel, { resource: apodResource('live', undefined), onNavigate: () => {} })
  );
  assert.doesNotMatch(html, /data-testid="apod-provenance-note"/);
  assert.doesNotMatch(html, /Saved copy|Showing the copy saved/);
});

test('a cached APOD without a note still states the saved date', () => {
  const html = renderToString(
    React.createElement(ApodPanel, { resource: apodResource('cached', undefined), onNavigate: () => {} })
  );
  assert.match(html, /Showing the copy saved 2026-11-14/);
});
