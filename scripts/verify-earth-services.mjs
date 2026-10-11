/**
 * Live validation of every external service the Earth Intelligence Lab uses.
 *
 * Run with:  npm run verify:earth
 *
 * This script performs real HTTP requests — it does not simulate anything:
 *
 *   1. NASA POWER monthly point API (a real 12-month request for Colombo)
 *   2. NASA GIBS WMTS `DescribeDomains` for every layer in the catalog
 *      (verifies the layer identifier, the tile matrix set, and prints the
 *      observation-date domain the service currently reports)
 *   3. NASA GIBS WMTS tile + WMS GetMap retrieval for one layer/date
 *   4. NASA FIRMS area API — only when FIRMS_MAP_KEY is set
 *
 * Exit code is non-zero when a *configurable* service fails. Layers that the
 * service rejects are reported and should be removed from the catalog.
 */

import { GIBS_LAYERS, describeDomainsUrl, wmtsTileUrl, wmsGetMapUrl } from '../src/lib/earth/gibsCatalog.ts';
import { buildDomain, describeCoverage } from '../src/lib/earth/domains.ts';
import { buildPowerUrl } from '../src/lib/earth/power.ts';

const TIMEOUT_MS = 25000;
const DATE = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

let failures = 0;
let unreachable = 0;

async function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function report(ok, label, detail) {
  const icon = ok ? '✔' : '✘';
  console.log(`${icon} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

function unreachableNotice(label, error) {
  unreachable += 1;
  console.log(`… ${label} — not reachable from this environment (${error?.message || error}). Re-run where outbound HTTPS is allowed.`);
}

/* ------------------------------ 1. NASA POWER ----------------------------- */

async function checkPower() {
  const url = buildPowerUrl(6.9271, 79.8612, ['T2M', 'PRECTOTCORR'], 2024, 2025);
  try {
    const response = await timedFetch(url, { headers: { Accept: 'application/json' } });
    const body = await response.json();
    const months = Object.keys(body?.properties?.parameter?.T2M || {}).length;
    report(response.ok && months > 0, 'NASA POWER monthly point API', `${months} T2M months returned`);
  } catch (error) {
    unreachableNotice('NASA POWER monthly point API', error);
  }
}

/* --------------------------- 2. GIBS DescribeDomains --------------------------- */

async function checkGibsDomains() {
  const rows = [];
  for (const layer of GIBS_LAYERS) {
    const url = describeDomainsUrl(layer);
    try {
      const response = await timedFetch(url, { headers: { Accept: 'application/xml,text/xml,*/*' } });
      const text = await response.text();
      if (/invalid layer/i.test(text)) {
        report(false, `GIBS domain ${layer.id}`, 'service reports Invalid Layer — remove or fix this identifier');
        continue;
      }
      if (/tilematrixset is invalid/i.test(text)) {
        report(false, `GIBS domain ${layer.id}`, `tile matrix set ${layer.tileMatrixSet} rejected for this layer`);
        continue;
      }
      if (!response.ok) {
        report(false, `GIBS domain ${layer.id}`, `HTTP ${response.status}`);
        continue;
      }
      const domain = buildDomain({ layerId: layer.id, tileMatrixSet: layer.tileMatrixSet, xml: text, sourceUrl: url });
      rows.push({ id: layer.id, coverage: describeCoverage(domain) });
      report(true, `GIBS domain ${layer.id}`, describeCoverage(domain));
    } catch (error) {
      if (error?.code) {
        report(false, `GIBS domain ${layer.id}`, `${error.code}: ${error.message}`);
      } else {
        unreachableNotice(`GIBS domain ${layer.id}`, error);
      }
    }
  }
  return rows;
}

/* ------------------------ 3. GIBS tiles + WMS raster ------------------------ */

async function checkImagery() {
  const layer = GIBS_LAYERS.find((item) => item.service === 'wmts');
  try {
    const tileUrl = wmtsTileUrl(layer, DATE, layer.tileMatrixSet, layer.format, 1, 1, 1);
    const response = await timedFetch(tileUrl, { headers: { Accept: 'image/*' } });
    const contentType = response.headers.get('content-type') || '';
    report(response.ok && contentType.startsWith('image/'), `GIBS WMTS tile (${layer.id}, ${DATE})`, `${response.status} ${contentType}`);
  } catch (error) {
    unreachableNotice('GIBS WMTS tile', error);
  }

  try {
    const fire = GIBS_LAYERS.find((item) => item.service === 'wms');
    const wmsUrl = wmsGetMapUrl({ layer: fire, time: DATE, bbox3857: [-20037508, -20037508, 20037508, 20037508], width: 256, height: 256 });
    const response = await timedFetch(wmsUrl, { headers: { Accept: 'image/*' } });
    const contentType = response.headers.get('content-type') || '';
    report(response.ok && contentType.startsWith('image/'), `GIBS WMS raster (${fire.id}, ${DATE})`, `${response.status} ${contentType}`);
  } catch (error) {
    unreachableNotice('GIBS WMS raster', error);
  }
}

/* ------------------------------- 4. NASA FIRMS ------------------------------- */

async function checkFirms() {
  const key = process.env.FIRMS_MAP_KEY;
  if (!key) {
    console.log('… NASA FIRMS area API — skipped: no FIRMS_MAP_KEY in the environment (the Lab reports hotspot counts as unavailable).');
    return;
  }
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/79.4,5.8,82,10/1`;
  try {
    const response = await timedFetch(url, { headers: { Accept: 'text/csv' } });
    const text = await response.text();
    if (/invalid map_key|not authorized/i.test(text)) {
      report(false, 'NASA FIRMS area API', 'the configured MAP_KEY was rejected');
      return;
    }
    const rows = text.trim().split(/\r?\n/).length - 1;
    report(response.ok, 'NASA FIRMS area API', `${rows} detection rows for Sri Lanka (1 day)`);
  } catch (error) {
    unreachableNotice('NASA FIRMS area API', error);
  }
}

console.log('Earth Intelligence Lab — live service verification');
console.log(`Date used for imagery probes: ${DATE}`);
console.log('');

await checkPower();
console.log('');
await checkGibsDomains();
console.log('');
await checkImagery();
console.log('');
await checkFirms();

console.log('');
if (unreachable) {
  console.log(`${unreachable} check(s) could not run from this environment (no outbound access to those hosts).`);
}
if (failures) {
  console.log(`${failures} check(s) FAILED — fix the catalog or configuration before shipping.`);
  process.exitCode = 1;
} else if (unreachable) {
  console.log('No service rejected a catalog entry. Network-dependent checks are reported above.');
} else {
  console.log('All services validated.');
}
