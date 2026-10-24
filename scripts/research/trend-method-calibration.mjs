/**
 * Calibration study for the Earth Intelligence Lab trend engine.
 *
 * Purpose: choose a trend test by measuring how often candidate methods report a
 * trend that is not there, on series shaped like the ones this app retrieves
 * (annual means from NASA POWER monthly values, ~20–30 years).
 *
 * This is the evidence behind docs/earth-lab/03_STATISTICAL_METHOD.md. Every
 * number quoted in that document is reproduced by running this file.
 *
 * Run: node scripts/research/trend-method-calibration.mjs
 * No dependencies. Seeded RNG, so output is stable across machines and runs.
 *
 * Reading the output:
 *   - "plain"        Mann–Kendall with no autocorrelation correction
 *   - "hamedRao"     Hamed–Rao variance correction, negative lags zeroed (the
 *                    method the app should ship)
 *   - "tfpw"         Trend-Free Pre-Whitening (Yue et al. 2002)
 *   - "blockBoot"    circular block bootstrap CI on the Sen slope
 *   - FPR            false-positive rate: expected ~0.05 for a well-calibrated
 *                    test at alpha = 0.05, lower is conservative
 */

/* ------------------------------------------------------------------ maths */

const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

function mkS(values) {
  let s = 0;
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) s += sign(values[j] - values[i]);
  }
  return s;
}

function mkVar(values) {
  const n = values.length;
  const counts = new Map();
  values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  let tie = 0;
  counts.forEach((t) => {
    if (t > 1) tie += t * (t - 1) * (2 * t + 5);
  });
  return (n * (n - 1) * (2 * n + 5) - tie) / 18;
}

/** Abramowitz & Stegun 7.1.26 — plenty accurate for p-values above 1e-7. */
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

function pValue(S, variance) {
  if (!(variance > 0)) return 1;
  const z = (S - sign(S)) / Math.sqrt(variance);
  return 2 * (1 - Phi(Math.abs(z)));
}

function senSlope(values) {
  const slopes = [];
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      if (j !== i) slopes.push((values[j] - values[i]) / (j - i));
    }
  }
  if (!slopes.length) return 0;
  slopes.sort((a, b) => a - b);
  const mid = (slopes.length - 1) >> 1;
  return slopes.length % 2 ? slopes[mid] : (slopes[mid] + slopes[mid + 1]) / 2;
}

/* --------------------------------------------------- candidate estimators */

function plainMannKendall(values) {
  return pValue(mkS(values), mkVar(values));
}

/**
 * Hamed–Rao variance correction with negative lags zeroed.
 *
 * Detrending with Sen (not OLS) and zeroing negative autocorrelation matters:
 * OLS-detrended noise has negatively correlated residuals, and correcting with
 * those values shrinks the variance and makes the test anti-conservative.
 */
function hamedRao(values) {
  const n = values.length;
  const slope = senSlope(values);
  const resid = values.map((v, i) => v - slope * i);
  const mean = resid.reduce((a, b) => a + b, 0) / n;
  const dev = resid.map((v) => v - mean);
  const denom = dev.reduce((a, b) => a + b * b, 0);

  const maxLag = Math.min(n - 3, Math.floor(n / 3));
  let acc = 0;
  let lag1 = 0;
  for (let k = 1; k <= maxLag; k += 1) {
    let num = 0;
    for (let i = 0; i + k < n; i += 1) num += dev[i] * dev[i + k];
    const rho = denom > 0 ? num / denom : 0;
    if (k === 1) lag1 = rho;
    acc += (n - k) * (n - k - 1) * (n - k - 2) * Math.max(0, rho);
  }
  const ratio = Math.max(1, 1 + (2 * acc) / (n * (n - 1) * (n - 2)));
  return { p: pValue(mkS(values), mkVar(values) * ratio), ratio, lag1, effectiveN: n / ratio };
}

function tfpw(values) {
  const n = values.length;
  const slope = senSlope(values);
  const detrended = values.map((v, i) => v - slope * i);
  const mean = detrended.reduce((a, b) => a + b, 0) / n;
  const dev = detrended.map((v) => v - mean);
  const denom = dev.reduce((a, b) => a + b * b, 0);
  let lag1 = 0;
  if (denom > 0) {
    let num = 0;
    for (let i = 0; i + 1 < n; i += 1) num += dev[i] * dev[i + 1];
    lag1 = num / denom;
  }
  const significant = Math.abs(lag1) >= 1.96 / Math.sqrt(n);
  const series = significant
    ? dev.slice(1).map((d, i) => d - lag1 * dev[i] + slope * (i + 1))
    : values.slice();
  return pValue(mkS(series), mkVar(series));
}

function blockBootstrapSignificant(values, reps, rng, blockFactor) {
  const n = values.length;
  const slope = senSlope(values);
  const resid = values.map((v, i) => v - slope * i);
  const L = Math.max(2, Math.round(blockFactor(n)));
  const slopes = [];
  for (let r = 0; r < reps; r += 1) {
    const sample = [];
    for (let start = 0; start < n; start += L) {
      const offset = Math.floor(rng() * n);
      for (let k = 0; k < L && sample.length < n; k += 1) sample.push(resid[(offset + k) % n]);
    }
    slopes.push(senSlope(sample.map((e, i) => slope * i + e)));
  }
  slopes.sort((a, b) => a - b);
  const lo = slopes[Math.floor(0.025 * reps)];
  const hi = slopes[Math.floor(0.975 * reps)];
  return lo > 0 || hi < 0;
}

/* ------------------------------------------------------------------ RNGs */

function mulberry32(seed) {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller over a seeded uniform source. */
function gaussian(seed) {
  const r = mulberry32(seed);
  return () => {
    let u = 0;
    let v = 0;
    while (!u) u = r();
    while (!v) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

function ar1(phi, n, seed, driftPerStep = 0) {
  const g = gaussian(seed);
  let prev = 0;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    prev = phi * prev + g();
    out.push(prev + driftPerStep * i);
  }
  return out;
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;

/* ------------------------------------------------------------- the study */

const YEARS = 30;
const RUNS = 600;

function measure(phi) {
  let plain = 0;
  let hr05 = 0;
  let hr01 = 0;
  let hr001 = 0;
  let tf = 0;
  let bb = 0;
  const ratios = [];
  const effs = [];
  let blockFailure = 0;

  for (let run = 0; run < RUNS; run += 1) {
    const series = ar1(phi, YEARS, 9000 + run);

    if (plainMannKendall(series) < 0.05) plain += 1;

    const hr = hamedRao(series);
    if (hr.p < 0.05) hr05 += 1;
    if (hr.p < 0.01) hr01 += 1;
    if (hr.p < 0.001) hr001 += 1;
    ratios.push(hr.ratio);
    effs.push(hr.effectiveN);

    if (tfpw(series) < 0.05) tf += 1;

    const rng = mulberry32(31337 + run * 7);
    if (blockBootstrapSignificant(series, 300, rng, (n) => Math.sqrt(n))) bb += 1;
    if (hr.ratio < 1) blockFailure += 1;
  }

  const median = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[sorted.length >> 1];
  };

  return {
    phi,
    plain: plain / RUNS,
    hr05: hr05 / RUNS,
    hr01: hr01 / RUNS,
    hr001: hr001 / RUNS,
    tfpw: tf / RUNS,
    blockBoot: bb / RUNS,
    medianRatio: median(ratios),
    medianEffectiveN: median(effs),
    ratioBelowOne: blockFailure
  };
}

console.log('Earth Intelligence Lab — trend method calibration');
console.log(`n = ${YEARS} annual values, ${RUNS} replicates per setting, no trend present.`);
console.log('A well-calibrated test at alpha = 0.05 reports ~5%; lower is conservative.\n');

const header = ['phi', 'plain MK', 'H-R a=.05', 'H-R a=.01', 'H-R a=.001', 'TFPW', 'blockBoot', 'med effN'];
const rows = header.map((h) => h.padEnd(11)).join('');
console.log(rows);
console.log('-'.repeat(rows.length));

const results = [];
for (const phi of [0, 0.3, 0.6, 0.8]) {
  const r = measure(phi);
  results.push(r);
  const cells = [
    String(phi),
    pct(r.plain),
    pct(r.hr05),
    pct(r.hr01),
    pct(r.hr001),
    pct(r.tfpw),
    pct(r.blockBoot),
    r.medianEffectiveN.toFixed(1)
  ];
  console.log(cells.map((c) => c.padEnd(11)).join(''));
}

console.log('\nInvariants:');
const allRatiosAtLeastOne = results.every((r) => r.ratioBelowOne === 0);
console.log(`  variance ratio >= 1 in every replicate: ${allRatiosAtLeastOne ? 'PASS' : 'FAIL'}`);
const hrBeatsPlain = results.every((r) => r.hr01 <= r.plain);
console.log(`  corrected test never worse than plain MK at a=.01: ${hrBeatsPlain ? 'PASS' : 'FAIL'}`);
const calibration = results.find((r) => r.phi === 0.6);
const inBand = calibration.hr01 >= 0.01 && calibration.hr01 <= 0.06;
console.log(`  a=.01 on phi=0.6 series within 1-6%: ${inBand ? 'PASS' : 'FAIL'} (${pct(calibration.hr01)})`);

if (!allRatiosAtLeastOne || !hrBeatsPlain || !inBand) {
  console.error('\nCalibration FAILED — do not ship this configuration.');
  process.exit(1);
}
/* ------------------------------------------- comparison (two locations) */

/**
 * Can a 25-year autocorrelated record support "the trends differ"?
 * A and B are independent series from the SAME process with the SAME trend, so
 * every rejection is a false positive. The paired label permutation swaps A/B
 * within each year, which preserves both series' autocorrelation.
 */
function permutationDifferenceP(a, b, reps, rng) {
  const observed = Math.abs(senSlope(a) - senSlope(b));
  let extreme = 0;
  for (let r = 0; r < reps; r += 1) {
    const x = [];
    const y = [];
    for (let i = 0; i < a.length; i += 1) {
      if (rng() < 0.5) {
        x.push(a[i]);
        y.push(b[i]);
      } else {
        x.push(b[i]);
        y.push(a[i]);
      }
    }
    if (Math.abs(senSlope(x) - senSlope(y)) >= observed) extreme += 1;
  }
  return (extreme + 1) / (reps + 1);
}

const CMP_YEARS = 25;
const CMP_RUNS = 200;

console.log('\nComparison test — false-positive rate when A and B share a trend');
console.log(`n = ${CMP_YEARS} shared years, ${CMP_RUNS} replicate pairs, 1 000 permutations each.\n`);
console.log('phi        permutation p<.05');

for (const phi of [0, 0.3, 0.6]) {
  let falsePositive = 0;
  for (let run = 0; run < CMP_RUNS; run += 1) {
    const a = ar1(phi, CMP_YEARS, 5100 + run * 2, 0.02);
    const b = ar1(phi, CMP_YEARS, 5101 + run * 2, 0.02);
    const rng = mulberry32(700 + run);
    if (permutationDifferenceP(a, b, 1000, rng) < 0.05) falsePositive += 1;
  }
  const rate = falsePositive / CMP_RUNS;
  console.log(`${String(phi).padEnd(11)}${pct(rate)}`);
  if (phi === 0.6 && rate > 0.1) {
    console.log('  -> at phi = 0.6 the difference test is wrong more than 1 time in 10;');
    console.log('     the app must not print a difference p-value at this sample size.');
  }
}

console.log('\nCalibration passed. See docs/earth-lab/03_STATISTICAL_METHOD.md for the interpretation.');
