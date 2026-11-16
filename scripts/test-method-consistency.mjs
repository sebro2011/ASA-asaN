/**
 * COSMORA — methodological consistency guard.
 *
 * Run: `npm run test:method-consistency`
 *
 * ## Why this file exists
 *
 * The audit that preceded these corrections found the same threshold written
 * literally in four places that disagreed:
 *
 *   - `docs/earth-lab/03_STATISTICAL_METHOD.md` §4.3 said α = 0.01
 *   - `src/lib/earth/climateStatistics.ts` defaulted to α = 0.05
 *   - `src/components/earth/TrendDetective.tsx` rendered "α = 0.05 (two-sided)"
 *   - no test asserted any of it, so the drift was invisible
 *
 * Centralising the value fixes today's drift. This file stops it coming back: it
 * reads the document and the UI source as text and asserts they agree with the
 * single configuration object. If someone edits one and not the others, this
 * suite fails and names the file.
 *
 * This is a *consistency* test, not a scientific one. It cannot prove the
 * statistics are right — `scripts/test-climate-statistics.mjs` is where that
 * happens. It proves the project is telling one story.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { STATISTICS_CONFIG } from '../src/lib/earth/statisticsConfig.ts';
import { mannKendallTest, pettittChangePointTest, tTest } from '../src/lib/earth/climateStatistics.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const read = (relative) => readFileSync(resolve(repoRoot, relative), 'utf8');

/* --------------------------------------------------------------- the config */

test('consistency: the specification document states the same alpha as the code', () => {
  const doc = read('docs/earth-lab/03_STATISTICAL_METHOD.md');

  // §4.3 is the section that measured the false-positive rates and chose 0.01.
  assert.match(doc, /§4\.3|### 4\.3/, 'the document must keep a §4.3 calibration section');
  assert.match(
    doc,
    /use α = 0\.01, not 0\.05/,
    'the specification must still say "use α = 0.01, not 0.05"'
  );

  // And the number the document picks must be the number the code uses. Read it
  // from the §4.3 decision line specifically, not from the earlier §4.1 table that
  // quotes 0.05 as the *rejected* value.
  const decision = /Ship α = (0\.0\d+) for the "significant" label/.exec(doc);
  assert.ok(decision, 'the document should keep its "Ship α = ..." decision line');
  assert.equal(
    Number(decision[1]),
    STATISTICS_CONFIG.trendAlpha,
    'the alpha the specification ships must equal STATISTICS_CONFIG.trendAlpha'
  );
});

test('consistency: the trend UI does not hard-code a significance threshold', () => {
  const ui = read('src/components/earth/TrendDetective.tsx');

  // The panel used to render the literal string "α = 0.05 (two-sided)". It must
  // now derive that label from the configuration.
  assert.match(ui, /describeTrendAlpha\(\)/, 'the stats panel must render describeTrendAlpha()');
  assert.doesNotMatch(
    ui,
    /α = 0\.05 \(two-sided\)/,
    'the hard-coded "α = 0.05 (two-sided)" chip must not return'
  );
  // No significance verdict may be driven by the literal-0.05 field.
  assert.doesNotMatch(
    ui,
    /significantAt05\s*\?/,
    'verdicts must use the `significant` field (config alpha), not the literal significantAt05'
  );
});

test('consistency: every threshold the document names is the configured value', () => {
  const doc = read('docs/earth-lab/03_STATISTICAL_METHOD.md');
  const cfg = STATISTICS_CONFIG;

  // §4.4 refusal rules.
  assert.match(doc, /n < 10 annual values/, 'the document still says n < 10 is refused');
  assert.equal(cfg.minAnnualObservations, 10);

  assert.match(doc, /effN < 10/, 'the document still requires effN >= 10');
  assert.equal(cfg.minEffectiveObservations, 10);

  assert.match(doc, /10 ≤ effN < 14/, 'the document still defines a short-record band');
  assert.equal(cfg.shortRecordEffectiveObservations, 14);

  // §4.2 lag range.
  assert.match(
    doc,
    /k = 1 … min\(n−3, ⌊n\/3⌋\)/,
    'the document still specifies the floor(n/3) lag rule'
  );
  assert.equal(cfg.maxAutocorrelationLagDivisor, 3);
});

test('consistency: the calibration study is the source of the numbers the document quotes', () => {
  const script = read('scripts/research/trend-method-calibration.mjs');
  // The study must keep reporting the quantities the document cites, otherwise
  // the document's numbers become unverifiable.
  assert.match(script, /hr01/, 'the study must still measure the alpha = 0.01 rate');
  assert.match(script, /hr05/, 'the study must still measure the alpha = 0.05 rate');
  assert.match(script, /plainMannKendall/, 'the study must still measure the uncorrected rate');
  assert.match(
    script,
    /Math\.max\(0, rho\)/,
    'the study must still zero negative lags, matching the shipped correction'
  );
});

/* ------------------------------------------------- behaviour follows config */

test('consistency: the test default alpha is the configured one, not a literal 0.05', () => {
  // A strongly trending but short series: at alpha = 0.01 this is significant, and
  // the default call must agree with the configured threshold.
  const series = Array.from({ length: 20 }, (_, i) => ({ year: 2000 + i, value: i }));
  const withDefault = mannKendallTest(series);
  const explicit = mannKendallTest(series, '', STATISTICS_CONFIG.trendAlpha);
  assert.equal(withDefault.alpha, STATISTICS_CONFIG.trendAlpha);
  assert.equal(withDefault.pValue, explicit.pValue);
  assert.equal(withDefault.significant, explicit.significant);
});

test('consistency: changing alpha moves the verdict, so the field is not inert', () => {
  // p is somewhere near 0.02 for this seeded series; at 0.01 it must not be
  // significant while at 0.05 it must be. The test finds such a case first rather
  // than assuming one exists.
  let found = null;
  for (let seed = 1; seed <= 200 && !found; seed += 1) {
    let a = seed >>> 0;
    const rand = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const values = Array.from({ length: 30 }, () => rand());
    const series = values.map((value, i) => ({ year: 1990 + i, value }));
    const strict = mannKendallTest(series, '', 0.01);
    const loose = mannKendallTest(series, '', 0.05);
    if (strict.pValue !== null && strict.pValue > 0.01 && strict.pValue < 0.05) found = { strict, loose };
  }
  assert.ok(found, 'the seeded search should find a p-value between 0.01 and 0.05');
  assert.equal(found.strict.significant, false, 'at alpha 0.01 this must not be called significant');
  assert.equal(found.loose.significant, true, 'at alpha 0.05 this would be called significant');
  assert.equal(found.strict.pValue, found.loose.pValue, 'the p-value itself must not depend on alpha');
});

test('consistency: significantAt05 keeps its literal historical meaning', () => {
  // Changing the verdict threshold must not silently change this field, which
  // existing consumers may read.
  const series = Array.from({ length: 20 }, (_, i) => ({ year: 2000 + i, value: 10 + 0.25 * i }));
  const r = mannKendallTest(series);
  assert.equal(r.inferenceEligible, true);
  assert.equal(r.significantAt05, r.pValue < 0.05);
  assert.equal(r.significantAt01, r.pValue < 0.01);
  assert.equal(r.significant, r.pValue < STATISTICS_CONFIG.trendAlpha);
});

test('consistency: the t-test default alpha is the configured comparison alpha', () => {
  const r = tTest([1, 2, 3, 4, 5], [2, 3, 4, 5, 6]);
  assert.equal(r.alpha, STATISTICS_CONFIG.comparisonAlpha);
});

test('consistency: Pettitt eligibility follows the configured minimum', () => {
  const below = pettittChangePointTest(
    Array.from({ length: STATISTICS_CONFIG.minPettittObservations - 1 }, (_, i) => ({ year: 2000 + i, value: i }))
  );
  assert.equal(below.eligible, false);
  const at = pettittChangePointTest(
    Array.from({ length: STATISTICS_CONFIG.minPettittObservations }, (_, i) => ({ year: 2000 + i, value: i }))
  );
  assert.equal(at.eligible, true);
});

/* -------------------------------------------- no secret / no silent change */

test('hygiene: the statistical modules contain no credentials', () => {
  for (const file of [
    'src/lib/earth/statisticsConfig.ts',
    'src/lib/earth/climateStatistics.ts',
    'src/lib/earth/climateEngine.ts'
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /\b(api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]+['"]/i,
      `${file} must not contain a credential literal`);
    assert.doesNotMatch(source, /eyJ[A-Za-z0-9_-]{10,}/, `${file} must not contain a JWT`);
  }
});
