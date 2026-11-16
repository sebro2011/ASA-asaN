/**
 * COSMORA — reproducible statistics verification report.
 *
 * Run: `node --import tsx scripts/verify-statistics-report.mjs`
 *      (or `npm run verify:stats`)
 *
 * This script prints, from the **shipped** functions, every measured number that
 * `docs/earth-lab/03_STATISTICAL_METHOD.md` asserts. If a number in the document
 * is not reproduced here, the document is wrong.
 *
 * It is deliberately separate from `scripts/research/trend-method-calibration.mjs`:
 * that study compares *candidate* methods on a standalone reimplementation and is
 * the evidence for choosing a method. This report exercises the actual production
 * code path, and is the evidence that the method that was chosen is the method
 * that ships.
 *
 * No network, no clock, no unseeded randomness.
 */

import {
  STATISTICS_CONFIG,
  mannKendallTest,
  twoSidedNormalPValue,
  pettittChangePointTest,
  seasonalMannKendallTest,
  tTest,
  blockBootstrapMannKendall
} from '../src/lib/earth/climateStatistics.ts';

/* ------------------------------------------------------------------ RNG */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(seed) {
  const r = mulberry32(seed);
  return () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

/** AR(1) with an optional exact linear drift added after the recursion. */
function ar1(n, phi, seed, driftPerStep = 0, scale = 1) {
  const g = gaussian(seed);
  const out = [];
  let prev = 0;
  for (let i = 0; i < n; i += 1) {
    prev = phi * prev + g() * scale;
    out.push(prev + driftPerStep * i);
  }
  return out;
}

const asSeries = (values, startYear = 1990) => values.map((value, i) => ({ year: startYear + i, value }));
const pct = (x) => `${(x * 100).toFixed(1)} %`;
const pad = (s, n) => String(s).padEnd(n);

/* --------------------------------------------------------------- report */

console.log('COSMORA — statistics verification report (shipped code path)');
console.log(`configuration: alpha = ${STATISTICS_CONFIG.trendAlpha} · ` +
  `min n = ${STATISTICS_CONFIG.minAnnualObservations} · ` +
  `min n* = ${STATISTICS_CONFIG.minEffectiveObservations} · ` +
  `short-record band < ${STATISTICS_CONFIG.shortRecordEffectiveObservations} · ` +
  `bootstrap reps = ${STATISTICS_CONFIG.bootstrapReplicates}`);
console.log('');

/* ---- 1. Hamed-Rao false-positive rate, specified vs published recipe ---- */

const RUNS = 600;
const PHIS = [0, 0.3, 0.6, 0.8];

console.log('1. Mann-Kendall false-positive rate, n = 30, NO trend, ' + RUNS + ' seeded replicates');
console.log('   (' + 'docs/earth-lab/03_STATISTICAL_METHOD.md' + ' §4.2 table)');
console.log('');
console.log(`   ${pad('phi', 6)}${pad('shipped a=.05', 16)}${pad('shipped a=.01', 16)}${pad('published a=.05', 18)}${pad('withheld', 10)}`);
console.log('   ' + '-'.repeat(66));

for (const phi of PHIS) {
  let at05 = 0;
  let at01 = 0;
  let withheld = 0;
  let published = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const r = mannKendallTest(asSeries(ar1(30, phi, 9000 + run)));
    // The literal published recipe, reconstructed from the disclosed factors:
    // Var(S) * publishedFactor, with the sign retained and no clamp. Reported so
    // the difference from the shipped rule is auditable, not asserted.
    if (r.rawVariance !== null && r.varianceInflationFactorPublished !== null && r.sStatistic !== null) {
      const adj = r.rawVariance * r.varianceInflationFactorPublished;
      if (adj > 0) {
        const s = r.sStatistic;
        const z = s > 0 ? (s - 1) / Math.sqrt(adj) : s < 0 ? (s + 1) / Math.sqrt(adj) : 0;
        if (twoSidedNormalPValue(z) < 0.05) published += 1;
      } else if (r.sStatistic === 0) {
        published += 0; // z = 0, p = 1
      }
    }
    if (!r.inferenceEligible) {
      withheld += 1;
    } else {
      if (r.significantAt05) at05 += 1;
      if (r.significant) at01 += 1;
    }
  }
  console.log(
    `   ${pad(phi, 6)}${pad(pct(at05 / RUNS), 16)}${pad(pct(at01 / RUNS), 16)}${pad(pct(published / RUNS), 18)}${pad(pct(withheld / RUNS), 10)}`
  );
}
console.log('');

/* ---- 2. Uncorrected vs corrected, to show the correction is doing work ---- */

console.log('2. Is the correction actually doing anything? (same replicates)');
console.log('');
console.log(`   ${pad('phi', 6)}${pad('uncorrected p<.05', 20)}${pad('corrected p<.05', 20)}${pad('ratio', 8)}`);
console.log('   ' + '-'.repeat(54));
for (const phi of PHIS) {
  let plain = 0;
  let corrected = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const r = mannKendallTest(asSeries(ar1(30, phi, 9000 + run)));
    if (r.pClassical !== null && r.pClassical < 0.05) plain += 1;
    if (r.significantAt05) corrected += 1;
  }
  const plainRate = plain / RUNS;
  const correctedRate = corrected / RUNS;
  const ratio = plainRate > 0 ? (correctedRate / plainRate).toFixed(2) : 'n/a';
  console.log(
    `   ${pad(phi, 6)}${pad(pct(plainRate), 20)}${pad(pct(correctedRate), 20)}${pad(ratio, 8)}`
  );
}
console.log('');

/* ---- 3. Block bootstrap on S ---- */

console.log('3. Circular block bootstrap on S, n = 30, NO trend, 200 replicates (999 resamples each)');
console.log('');
const BOOT_RUNS = 200;
console.log(`   ${pad('phi', 6)}${pad('p<.05', 12)}${pad('p<.01', 12)}`);
console.log('   ' + '-'.repeat(30));
for (const phi of [0, 0.3, 0.6]) {
  let at05 = 0;
  let at01 = 0;
  for (let run = 0; run < BOOT_RUNS; run += 1) {
    const b = blockBootstrapMannKendall(ar1(30, phi, 50000 + run), 0.05);
    if (!b) continue;
    if (b.pValue < 0.05) at05 += 1;
    if (b.pValue < 0.01) at01 += 1;
  }
  console.log(`   ${pad(phi, 6)}${pad(pct(at05 / BOOT_RUNS), 12)}${pad(pct(at01 / BOOT_RUNS), 12)}`);
}
console.log('');

/* ---- 4. t-test on epoch splits ---- */

console.log('4. Epoch-split t-test (12 vs 12 years), NO true difference, 600 replicates');
console.log('   (the case a textbook t-test gets badly wrong)');
console.log('');
console.log(`   ${pad('phi', 6)}${pad('plain p<.05', 15)}${pad('aware p<.05', 15)}${pad('withheld', 12)}${pad('median n*', 10)}`);
console.log('   ' + '-'.repeat(68));
for (const phi of [0, 0.3, 0.6, 0.8]) {
  let plain = 0;
  let aware = 0;
  let withheld = 0;
  const nstars = [];
  for (let run = 0; run < 600; run += 1) {
    const v = ar1(24, phi, 4000 + run);
    const x = v.slice(0, 12);
    const y = v.slice(12);
    if (tTest(x, y, 0.05, { structure: 'independent' }).significantAt05 === true) plain += 1;
    const dep = tTest(x, y, 0.05, { structure: 'serial-blocks', orderedSeries: v });
    if (!dep.inferenceEligible) withheld += 1;
    else if (dep.significant === true) aware += 1;
    nstars.push(dep.effectiveSampleSize);
  }
  nstars.sort((a, b) => a - b);
  console.log(
    `   ${pad(phi, 6)}${pad(pct(plain / 600), 15)}${pad(pct(aware / 600), 15)}${pad(pct(withheld / 600), 12)}${pad(nstars[300], 10)}`
  );
}
console.log('');

/* ---- 5. Power ---- */

console.log('5. Power — the tests must still find real trends and real shifts');
console.log('');
let trendDetected = 0;
for (let run = 0; run < 300; run += 1) {
  if (mannKendallTest(asSeries(ar1(30, 0, 20000 + run, 0.2, 0.5))).significant === true) trendDetected += 1;
}
console.log(`   Mann-Kendall power, slope 0.2/step, sigma 0.5, phi 0, n 30, alpha ${STATISTICS_CONFIG.trendAlpha}: ${pct(trendDetected / 300)}`);

const seasonalRows = [];
for (let y = 0; y < 25; y += 1) {
  for (let m = 1; m <= 12; m += 1) {
    seasonalRows.push({ year: 1990 + y, month: m, value: 100 + 2 * y + 10 * Math.sin((2 * Math.PI * m) / 12) });
  }
}
const seasonal = seasonalMannKendallTest(seasonalRows);
console.log(`   Seasonal MK on a synthetic +2/yr trend common to all months: p = ${seasonal.pValue}, direction = ${seasonal.direction}`);

const step = [
  ...Array.from({ length: 15 }, (_, i) => 10 + (i % 3) * 0.1),
  ...Array.from({ length: 15 }, (_, i) => 20 + (i % 3) * 0.1)
];
const pettitt = pettittChangePointTest(asSeries(step));
console.log(`   Pettitt on a known +10 step between 2004 and 2005: changeYear = ${pettitt.changeYear}, p = ${pettitt.pValue}`);
console.log('');

/* ---- 6. Invariants ---- */

console.log('6. Invariants that must hold in every replicate');
const invariants = [];
let varianceStable = true;
let bootstrapStable = true;
for (const phi of [-0.8, -0.4, 0, 0.4, 0.8]) {
  for (let run = 0; run < 60; run += 1) {
    const r = mannKendallTest(asSeries(ar1(30, phi, 700 + run)));
    if (r.varianceInflationFactor !== null && r.varianceInflationFactor < 1) varianceStable = false;
    if (r.pValue !== null && (r.pValue <= 0 || r.pValue > 1)) bootstrapStable = false;
  }
}
invariants.push(['variance inflation factor >= 1 for every replicate (incl. negative phi)', varianceStable]);
invariants.push(['every published p-value lies in (0, 1]', bootstrapStable]);
const determinismA = blockBootstrapMannKendall(ar1(30, 0.4, 6161));
const determinismB = blockBootstrapMannKendall(ar1(30, 0.4, 6161));
invariants.push(['bootstrap is bit-identical across runs (seeded)', JSON.stringify(determinismA) === JSON.stringify(determinismB)]);

for (const [label, ok] of invariants) {
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

const allPassed = invariants.every(([, ok]) => ok);
console.log('');
if (!allPassed) {
  console.error('VERIFICATION FAILED — a documented invariant does not hold.');
  process.exit(1);
}
console.log('All invariants hold. Every number above is reproducible from the shipped code.');
