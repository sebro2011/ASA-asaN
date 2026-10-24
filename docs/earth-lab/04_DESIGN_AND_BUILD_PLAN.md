# Design and build plan

Everything here is specified for execution on 14–15 November 2026. No Figma file
exists yet; §2 is the drawing instruction, not a description of drawn screens.

---

## 1. Information architecture — one spine, not four tabs

Today the Lab is four tools behind tabs (trend, imagery, globe, Sri Lanka). The
brief asks a research question, so the page should read as a single
investigation that the user moves through, with imagery as supporting evidence
rather than a sibling tab.

```
┌ Research header ───────────────────────────────────────────────┐
│ Earth Intelligence Lab     NASA POWER · GIBS · reanalysis      │
│ The question: what is changing here, by how much, and is the   │
│ evidence strong enough to say so?                              │
├ Investigation toolbar (sticky) ────────────────────────────────┤
│ [Variable ▾] [Location A ▾] [+ Compare B ▾] [Period ▾] [Run]   │
├ Workspace (two columns ≥1280 px) ───────────────────────────────┤
│ LEFT  (8/12)                    │ RIGHT (4/12)                 │
│  Chart                          │  Statistics panel            │
│  · monthly obs + annual mean    │  · method, n, period         │
│  · Sen trend line               │  · slope ± CI, p, direction  │
│  · excluded years dimmed        │  · confidence / refusal      │
│  ───────────────                │  ──────────────              │
│  Finding (deterministic)        │  Comparison (if B selected)  │
│  · 4–6 sentences, all numbers   │  · Δ slope CI                │
│    sourced from the test object │  · verdict                   │
│  ───────────────                │  ──────────────              │
│  Data table (collapsible)       │  Provenance                  │
├ Supporting evidence ───────────────────────────────────────────┤
│ Map with A/B markers → click opens that location's result      │
│ GIBS imagery for A and B at the study period's start/end       │
├ Method and limitations ────────────────────────────────────────┤
│ Method card · variable metadata · missing-data rules · grid    │
└────────────────────────────────────────────────────────────────┘
```

Rules:

- The **question** is stated before any control. Requirement 10.
- The map never claims a location-level series represents a region; the marker
  is a point with a grid-cell footprint drawn at ≈0.5°.
- Imagery tab survives as "Supporting evidence", not as a peer destination.
- On < 1024 px the two columns stack in reading order: chart → statistics →
  finding → comparison → table → provenance.

---

## 2. Figma — frames, components, measurements

Use the existing file (`wHcpT3Zp5Lug08R1m7Y6dt`). One page: **Earth Lab**.
Foundations already exist in `src/styles/tokens.css`; mirror them as Figma
variables so design and code cannot drift.

### 2.1 Frames (8 to draw, no more)

| Frame | Size | Contents |
|---|---|---|
| `EL / Desktop / Default` | 1440 × 2200 | Spine with A only, 20-year temperature, significant result |
| `EL / Desktop / Comparison` | 1440 × 2400 | A + B, difference verdict, Δ CI |
| `EL / Desktop / Insufficient` | 1440 × 1600 | Refusal state: 6 years, no p, reason shown |
| `EL / Desktop / Error` | 1440 × 1200 | POWER unreachable, retry, no invented data |
| `EL / Tablet / Default` | 834 × 1800 | Stacked, toolbar wraps to two rows |
| `EL / Mobile / Default` | 390 × 1900 | Toolbar collapses to sheets; chart 280 px tall |
| `EL / Mobile / Finding` | 390 × 1200 | Finding + table + provenance |
| `EL / Components` | 1440 × auto | Every component in §2.2 with variants |

### 2.2 Component inventory with variants

| Component | Variants | Notes |
|---|---|---|
| `VariableSelector` | closed / open / unavailable-param | Shows unit inline: `Air temperature · °C` |
| `LocationChip` | A / B / custom / map-click | A = atmo accent, B = azure; never colour alone — prefix letter |
| `PeriodControl` | preset / custom / clamped | Shows resolved range after clamping to 1981 |
| `TrendChart` | 1 series / 2 series / insufficient / loading / empty | Reuses ChartFrame geometry: numeric height only |
| `StatisticsPanel` | significant / not-significant / insufficient / error | Rows: Method · Period · n · Slope · 95 % CI · p · Direction |
| `FindingCard` | default / comparison / refusal | Monospace numbers; source line always present |
| `ComparisonPanel` | awaiting-B / computed / unresolved / incompatible-period | Shows the Δ CI as a small interval plot |
| `DataTable` | collapsed / expanded | `<caption>`, sortable by year, CSV export |
| `ProvenanceBlock` | power / gibs / mixed | Source URL, retrieved-at, product type, grid size |
| `StateBlock` | loading / empty / error / partial | One component, four states, used everywhere |
| `MethodCard` | expanded / collapsed | MK + Hamed–Rao + Sen, assumptions, refusals |

Shared specs: radius 10 px controls, 14 px panels, 18 px page sections; borders
1 px `line`; body 13.5/1.6 `ink-2`; numbers `JetBrains Mono` 11–12 px; headings
`Inter Variable` 600; **no** blur above 12 px on mobile; motion ≤ 180 ms and
disabled under `prefers-reduced-motion`.

### 2.3 What the design must make obvious in a 5-second look

1. Which variable and unit.
2. Which place(s) and which years.
3. Whether the change is significant — as a word plus a p-value, never as a
   colour alone.
4. What the data actually is (reanalysis grid cell, not a station).

---

## 3. Code plan — modules, signatures, order

### Phase 0 — during the event, first 90 minutes

1. `npm install --legacy-peer-deps` — plain install fails ERESOLVE on a `three`
   peer conflict between the root package and `@google/model-viewer`. Verified
   repeatedly in this environment. `jsdom` is not a saved dependency; install it
   with `npm i --no-save --legacy-peer-deps jsdom` before running any smoke
   harness, and expect a later `npm install` to prune it.
2. Verify **live** POWER retrieval from the event network:
   `curl "http://localhost:3000/api/earth/power?latitude=6.9271&longitude=79.8612&startYear=2005&endYear=2024&parameters=T2M,PRECTOTCORR"`.
   If this fails, everything downstream is theatre — fix it before writing UI.
3. Re-check the official Resources tab.

### Phase 1 — statistics engine (highest value, ~4 h)

New file `src/lib/earth/trends.ts` — pure functions, no React, no fetch:

```ts
export function senSlope(points: Array<{ year: number; value: number }>): number | null
export function pairwiseSlopes(points): number[]              // sorted, for the CI
export function senConfidenceInterval(slopes: number[], varSCorrected: number): [number, number] | null
export function mannKendallS(points): { S: number; varS: number; ties: number }
export function hamedRaoCorrection(residuals: number[]): { ratio: number; effectiveN: number; lag1: number; lags: number[] }
export function analyseTrend(annual: AnnualValue[], meta: VariableMeta): TrendTest | null
export function compareByIntervals(a: TrendTest, b: TrendTest): TrendComparison | null
export function benjaminiHochberg(pValues: number[], q = 0.05): number[]
```

Modify:

- `src/lib/earth/types.ts` — add `TrendTest`, `TrendComparison`, extend
  `PowerSeriesStats` with `test?: TrendTest | null`. Keep `trend` (OLS) for the
  chart's fitted line only; **do not delete it**, existing tests reference it.
- `src/lib/earth/power.ts` — `buildSeriesStats` gains the test; precipitation
  annual totals computed from rate × days-in-month.
- `src/lib/earth/analysis.ts` — `describeSeries` and
  `buildLocalAnalystAnswer` emit significance, CI and n from `TrendTest` only.

Tests: `scripts/test-trends.mjs`, all thirteen cases in `03` §8 — including T11,
which asserts the corrected test's false-positive rate under AR(1) φ = 0.6, and
T12, which asserts `varianceRatio ≥ 1` on every fixture.

### Phase 2 — comparison (~3 h)

`src/lib/earth/compare.ts`: period intersection (refuse under 15 shared years),
per-location `TrendTest` from Phase 1, then the **CI-overlap screen** validated in
`03` §6 — no p-value is produced for the difference, because the study showed a
formal difference test misleads at this sample size. Verdict strings:
"difference supported by this record" / "difference not resolved by this record",
plus effective n for both series. UI: `ComparisonPanel`, second `LocationChip`,
second series on the chart (A solid, B dashed, same units only — refuse
cross-variable comparison or convert explicitly and label the conversion).

### Phase 3 — findings and provenance (~2 h)

`src/lib/earth/findings.ts`: `buildFinding(input): { sentences: string[]; sources: SourceRef[] }`
— every number interpolated from `TrendTest`, no template may contain a literal
digit. Refusal variant when `significance === 'insufficient data'`.
AI (optional) receives the serialised `TrendTest` plus method note and is
prompted to *explain*, not to compute; if the AI is down the deterministic
finding stands alone.

### Phase 4 — interface (~6 h)

Rebuild `EarthIntelligenceLab.jsx` around §1. Migrate `TrendDetective` to the
two-column spine; keep `ChartFrame`, `ProvenancePanel`, `ImageryMap`,
`SriLankaWatch`, `Globe3D` as supporting components rather than deleting them.
Add trend markers to the map (A/B), with click → load that location's result.

### Phase 5 — i18n (~2 h)

New keys under `earthTrend*` in `src/i18n/interfaceCopy.ts` for en/si/ta:
method names, significance words, refusal reasons, comparison verdicts, unit
labels. Sinhala and Tamil are not decoration — if a string is missing the Lab
must fall back to English and say so, never show a key.

### Phase 6 — QA and report (~3 h)

`05_TEST_PLAN.md`, then `docs/earth-lab/VERIFICATION.md` with actual command
output, including failures.

---

## 4. Data model changes

```ts
interface VariableMeta {
  code: string;
  label: { en: string; si: string; ta: string };
  unit: string;
  kind: 'temperature' | 'precipitation' | 'humidity' | 'wind' | 'radiation';
  productType: 'reanalysis' | 'model' | 'satellite-retrieved' | 'assimilated';
  temporalResolution: 'monthly';
  coverage: { start: number; end: 'present' | number; global: boolean };
  gridDegrees: [number, number];
  missingConvention: string;    // e.g. "-999 fill; values <= -900 discarded"
  sourceDataset: string;        // POWER product name, verified against POWER docs
  limitations: string[];
}
```

`productType` and `sourceDataset` must be filled from NASA POWER's own
documentation, verified on the event network, not guessed. If a value cannot be
verified for a parameter, the parameter is marked `unverified` and the UI says
so — better a gap than a confident error.

---

## 5. Server work (small)

`server/earthIntelligence.ts` already validates, rate-limits and caches. Two
additions only:

1. Accept `parameters` from the extended catalogue with the same allow-list
   discipline (still ≤12 per request).
2. Return `productType` and `sourceDataset` in the response echo so the client
   cannot drift from the server's view of the catalogue.

No statistical computation server-side: analysis belongs beside the data on the
client where the fixture tests run, and the payload is small.

---

## 6. Schedule for 14–15 November

**Sat 14**

| Time | Work |
|---|---|
| 09:00–10:30 | Phase 0: install, live POWER check, Resources re-check, fixtures committed |
| 10:30–14:30 | Phase 1: `trends.ts` + T1–T10 green |
| 14:30–15:30 | Wire `TrendTest` into `buildSeriesStats`, findings text |
| 15:30–18:30 | Phase 2: comparison engine + bootstrap, T9–T10 |
| 18:30–19:30 | Figma frames for desktop + mobile (only the 4 that ship) |
| 19:30–23:00 | Phase 4a: chart + statistics panel + finding in the spine |

**Sun 15**

| Time | Work |
|---|---|
| 08:00–11:00 | Phase 4b: comparison panel, map markers, supporting evidence |
| 11:00–13:00 | Phase 5: si/ta copy, keyboard pass, reduced motion |
| 13:00–16:00 | QA: three viewports, three languages, failure states, build |
| 16:00–18:00 | `VERIFICATION.md` with real output; demo script; submission |
| 18:00–21:00 | Buffer only. Do not plan new features here. |

**Cut list, in order, if time runs out:** globe → imagery comparison → AI
narration → data-table CSV export → map trend markers. **Never cut:** the
significance test and its calibration, the refusal rules, the provenance block,
si/ta copy for the statistics panel.

---

## 7. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| POWER unreachable from event network | Low | Day-0 curl; documented fixture fallback clearly labelled as fixture, never as live |
| Hamed–Rao implemented on raw instead of detrended series | Medium | T3 catches it; `03` §4.2/§7.1 say why, with the measured anti-conservative result |
| Implementing a familiar-but-wrong test (plain MK, TFPW, block bootstrap) | **High** | `03` §4/§7 records the measured false-positive rates; T11 fails the build if the shipped test drifts back to an anti-conservative variant |
| Judges read "significant" as "large" | Medium | Language rules in `03` §5.1; significance and magnitude always on separate lines |
| Scope creep back into the whole space app | High | The brief says keep unrelated features secondary. Nav may stay, but the Lab is the landing destination during judging |
| Sinhala/Tamil strings lag behind | High | Phase 5 is scheduled, not optional; missing keys fall back visibly |
| Reanalysis presented as measurement | Medium | `productType` in the provenance block, beside every chart |
