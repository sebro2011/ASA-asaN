/**
 * Chart contracts — the two defects that render a chart silently wrong.
 *
 * Both bug classes below shipped in the NASA POWER panels and neither threw,
 * warned, or failed a test:
 *
 * 1. **An orphaned axis.** Recharts defaults every `<YAxis>` to `yAxisId={0}`.
 *    The dual-axis chart declared two axes and bound its series to ids 0 and 1,
 *    so the right-hand (precipitation) axis belonged to nobody and its series was
 *    drawn against the temperature scale — where a 5 mm/day value sits far below a
 *    25–30 °C domain and is simply clipped. The chart looked "empty", not broken.
 * 2. **A fill that resolves to nothing.** A series filled with
 *    `url(#earthMonthlyFillPrecip1)` while the chart defined only
 *    `earthMonthlyFillTemp`. SVG paints an unresolvable paint server as empty.
 *
 * These are checked structurally, from the source, because the alternative — a
 * jsdom render — has no layout, so recharts draws no ticks at all and every
 * assertion would pass vacuously. The test states exactly what it inspects.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-chart-contracts.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const NAMED = ['src/components/earth/TrendDetective.tsx', 'src/features/hypothesis-forge/ForgeCharts.tsx'];
const fromDirectory = readdirSync('src/components/earth')
  .filter((name) => name.endsWith('.tsx'))
  .map((name) => `src/components/earth/${name}`);

const files = [...new Set([...NAMED, ...fromDirectory])].filter((file) => {
  try {
    return readFileSync(file, 'utf8').includes('YAxis');
  } catch {
    return false;
  }
});

/**
 * Comments explain these defects — and quote the broken markup while doing so —
 * so they must not be mistaken for code. Only comments are removed; string
 * literals are left alone.
 */
function stripComments(source) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const read = (file) => stripComments(readFileSync(file, 'utf8'));

test('at least one chart file is inspected', () => {
  assert.ok(files.length >= 2, `expected chart sources, found ${files.join(', ')}`);
});

test('every paint server a chart references is defined in the same file', () => {
  for (const file of files) {
    const source = read(file);
    const defined = new Set([...source.matchAll(/(?:linearGradient|radialGradient|marker|pattern)[^>]*\sid=["']([^"']+)["']/g)].map((m) => m[1]));
    const used = [...source.matchAll(/url\(#([^)"']+)\)/g)]
      .map((m) => m[1])
      // A template-built id cannot be checked statically; the charts build none.
      .filter((id) => !id.includes('${'));
    for (const id of used) {
      assert.ok(defined.has(id), `${file} uses url(#${id}) but never defines it — SVG paints that as empty`);
    }
  }
});

test('every series axis id has an axis that declares it', () => {
  for (const file of files) {
    const source = read(file);
    // <YAxis ... yAxisId={0} .../> and yAxisId="left"
    const axisIds = new Set([
      ...[...source.matchAll(/<YAxis[\s\S]*?yAxisId=\{([^}]+)\}/g)].map((m) => m[1].trim()),
      ...[...source.matchAll(/<YAxis[\s\S]*?yAxisId="([^"]+)"/g)].map((m) => m[1])
    ]);
    const seriesIds = new Set([
      ...[...source.matchAll(/<(?:Area|Line|Bar|Scatter)[\s\S]*?yAxisId=\{([^}]+)\}/g)].map((m) => m[1].trim()),
      ...[...source.matchAll(/<(?:Area|Line|Bar|Scatter)[\s\S]*?yAxisId="([^"]+)"/g)].map((m) => m[1])
    ]);

    if (seriesIds.size === 0) continue;
    // A series may pass a variable that resolves to a declared id (`yAxisId`),
    // so only literal ids are checked here.
    const literal = [...seriesIds].filter((id) => /^'[^']+'$/.test(id) || /^"[^"]+"$/.test(id) || /^\d+$/.test(id));
    for (const id of literal) {
      const bare = id.replace(/^['"]|['"]$/g, '');
      assert.ok(
        axisIds.has(bare) || axisIds.has(id),
        `${file} binds a series to yAxisId ${id} but no <YAxis> declares it — recharts would plot it against the default axis`
      );
    }
  }
});

test('a chart with two axes labels both of them (recharts defaults every axis to 0)', () => {
  for (const file of files) {
    const source = read(file);
    const axes = [...source.matchAll(/<YAxis(?![\s\S]{0,400}?<YAxis)[\s\S]{0,400}?\/>/g)];
    void axes;
    const axisCount = (source.match(/<YAxis/g) || []).length;
    if (axisCount < 2) continue;
    const labelled = (source.match(/<YAxis[\s\S]{0,400}?yAxisId=/g) || []).length;
    assert.ok(
      labelled >= 2,
      `${file} renders ${axisCount} axes but only ${labelled} declare yAxisId — unlabelled axes both become id 0, orphaning the right-hand scale`
    );
  }
});

test('the POWER dual-axis chart draws precipitation as bars on the right axis', () => {
  const source = read('src/components/earth/TrendDetective.tsx');
  assert.match(source, /<YAxis\s+yAxisId=\{0\}/, 'temperature axis declares id 0');
  assert.match(source, /<YAxis\s+yAxisId=\{1\}/, 'precipitation axis declares id 1');
  assert.match(source, /<Bar[\s\S]{0,300}yAxisId=\{yAxisId\}/, 'precipitation is drawn as bars');
  assert.match(source, /id="earthMonthlyFillPrecip"/, 'the precipitation gradient exists');
  assert.doesNotMatch(source, /earthMonthlyFillPrecip\$\{/, 'no fill references a template-built gradient id');
});
