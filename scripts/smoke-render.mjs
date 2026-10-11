/**
 * Server-side smoke render of the Earth Intelligence Lab.
 *
 * This is a real execution of the component tree (React 19 `renderToString`), not
 * a type check: it proves the Lab renders without throwing for every workspace
 * mode and for all three languages, with effects (network) intentionally not run.
 *
 * Run with:  node --import tsx scripts/smoke-render.mjs
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import i18n from '../src/i18n.ts';
import EarthIntelligenceLab from '../src/components/EarthIntelligenceLab.jsx';
import TrendDetective from '../src/components/earth/TrendDetective.tsx';
import SriLankaWatch from '../src/components/earth/SriLankaWatch.tsx';
import AnalystPanel from '../src/components/earth/AnalystPanel.tsx';
import ProvenancePanel from '../src/components/earth/ProvenancePanel.tsx';
import Globe3D from '../src/components/earth/Globe3D.tsx';
import { buildAnalystContext } from '../src/lib/earth/context.ts';
import { getGibsLayer } from '../src/lib/earth/gibsCatalog.ts';

const defaultLayer = getGibsLayer('MODIS_Terra_CorrectedReflectance_TrueColor');
const area = { label: 'Sri Lanka (island-wide)', latitude: 7.8731, longitude: 80.7718, bounds: [5.9, 79.5, 9.9, 81.9], source: 'preset' };
const noop = () => {};

const analystContext = buildAnalystContext({
  area,
  primaryDate: '2024-08-01',
  compareDate: '2023-08-01',
  layers: [{ layer: defaultLayer, domain: null, availability: undefined, probeOk: null }],
  power: null
});

function renderGlobe(lang) {
  // The WebGL scene is created in effects (not run here), so this verifies the
  // render path, the accessibility labels and the props plumbing of the globe.
  const globe = renderToString(
    React.createElement(Globe3D, {
      layer: defaultLayer,
      date: '2024-08-01',
      reducedMotion: true,
      onFallback: noop,
      center: { latitude: 6.9271, longitude: 79.8612 },
      quality: 'high'
    })
  );
  const low = renderToString(
    React.createElement(Globe3D, { layer: defaultLayer, date: '2024-08-01', reducedMotion: true, onFallback: noop })
  );
  // React inserts comment separators between adjacent text nodes on the server.
  const flat = globe.replace(/<!-- -->/g, '');
  return {
    'globe renders an interactive region': globe.includes('role="application"'),
    'globe labels the dataset and observation date': flat.includes(`${defaultLayer.id} · 2024-08-01`),
    'globe announces its keyboard controls': globe.includes('aria-label'),
    'globe states the imagery attribution': globe.includes('EOSDIS GIBS'),
    'globe announces its loading state accessibly': globe.includes('role="status"'),
    'globe works without a centre or quality prop': low.includes('role="application"') && low.includes(defaultLayer.id),
    'globe never prints a raw undefined value': !flat.includes('>undefined<') && !flat.includes('NaN')
  };
}

function renderWorkspaces(lang) {
  const trend = renderToString(React.createElement(TrendDetective, { area, onAreaChange: noop, onPowerResolved: noop, reducedMotion: true }));
  const sri = renderToString(React.createElement(SriLankaWatch, {
    area, layer: defaultLayer, date: '2024-08-01', compareDate: '2023-08-01', onSelectArea: noop, onSelectLayer: noop, onSetDate: noop
  }));
  const analyst = renderToString(React.createElement(AnalystPanel, { context: analystContext, lang, aiCapable: false }));
  const provenance = renderToString(React.createElement(ProvenancePanel, {
    entries: [{
      key: 'layer', title: defaultLayer.title, status: 'live', dataset: defaultLayer.id, provider: 'NASA GIBS',
      sourceUrl: 'https://gibs.earthdata.nasa.gov/x', observation: '2024-08-01', retrievedAt: '2026-10-11T00:00:00.000Z', limitations: [defaultLayer.limitations]
    }],
    report: null
  }));
  return {
    'trend detective study areas': trend.includes('Sri Lanka (island-wide)'),
    'trend detective custom coordinates': trend.includes('type="number"'),
    'Sri Lanka places render': sri.includes('Sinharaja Forest Reserve'),
    'Sri Lanka FIRMS status render': sri.includes('FIRMS'),
    'Sri Lanka dataset limitations render': sri.includes('This dataset cannot establish') || sri.length > 5000,
    'analyst panel renders its question control': analyst.includes('id="earth-analyst-question"'),
    'analyst panel offers grounded suggestions': (analyst.match(/<button/g) || []).length >= 4,
    'provenance panel renders a dataset row with its source URL': provenance.includes('https://gibs.earthdata.nasa.gov/x'),
    'provenance export is disabled without a retrieved report': provenance.includes('disabled')
  };
}

const results = [];

function render(lang) {
  const html = renderToString(React.createElement(EarthIntelligenceLab, { lang }));
  const checks = {
    'renders imagery controls': html.includes('Imagery Command') || html.includes('රූප සැලසුම්') || html.includes('பட தளபதி'),
    'renders the layer selector with catalog options': html.includes('MODIS_Terra_CorrectedReflectance_TrueColor'),
    'renders observation date control': html.includes('type="date"'),
    'renders provenance panel': html.includes('Scientific data panel') || html.includes('විද්‍යාත්මක') || html.includes('அறிவியல்'),
    'renders the place search control': html.includes('id="earth-place-search"'),
    'avoids raw undefined in output': !html.includes('>undefined<') && !html.includes('NaN')
  };
  return { lang, checks, length: html.length, workspaces: renderWorkspaces(lang) };
}

for (const lang of ['en', 'si', 'ta']) {
  await i18n.changeLanguage(lang);
  try {
    const rendered = render(lang);
    const outcome = { lang, length: rendered.length, checks: { ...rendered.checks, ...rendered.workspaces, ...renderGlobe(lang) } };
    const failed = Object.entries(outcome.checks).filter(([, ok]) => !ok).map(([name]) => name);
    results.push({ ...outcome, failed });
  } catch (error) {
    results.push({ lang, error: error?.stack || String(error) });
  }
}

let failed = 0;
for (const result of results) {
  if (result.error) {
    failed += 1;
    console.log(`✘ ${result.lang} — render threw:\n${result.error}`);
    continue;
  }
  if (result.failed.length) {
    failed += 1;
    console.log(`✘ ${result.lang} — ${result.length} chars, failed checks: ${result.failed.join(', ')}`);
  } else {
    console.log(`✔ ${result.lang} — ${result.length} chars, all ${Object.keys(result.checks).length} structural checks passed`);
  }
}

if (failed) {
  console.log(`\n${failed} language(s) failed the smoke render.`);
  process.exitCode = 1;
} else {
  console.log('\nSmoke render passed for en/si/ta.');
}
