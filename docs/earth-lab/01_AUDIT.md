# Earth Intelligence Lab — repository audit

Scope: `src/components/EarthIntelligenceLab.jsx`, `src/components/earth/*`,
`src/lib/earth/*`, `server/earthIntelligence.ts`, `server.ts` (Earth routes),
`scripts/test-earth-*.mjs`.
Method: direct reading of the working tree on 2026-10-24, plus the test harnesses
that execute the real components. No claim below rests on the prompt's
description of the app; each one cites the code.

---

## 1. What exists and works

### 1.1 Data path

| Layer | Location | Behaviour |
|---|---|---|
| Client client | `src/lib/earth/power.ts:410` `fetchPowerDataset` | Calls `/api/earth/power`, timeout, abort signal, TTL cache, returns `Sourced<PowerDataset>` with `retrievedAt`, `sourceUrl`, `fromCache`. |
| Response parsing | `power.ts:190` `parsePowerResponse` | Reads `properties.parameter[CODE]`, keys `YYYYMM`, marks parameters with zero usable values as `unavailable` rather than dropping them silently. |
| Fill values | `power.ts:21` `POWER_FILL_VALUE_THRESHOLD = -900` | Anything ≤ −900 treated as no-data. |
| Server route | `server/earthIntelligence.ts` (654 lines) | Owns `/api/earth/power`: parameter allow-list, ≤12 parameters, 60 req/min, TTL cache, `fromCache` flag. |
| Stats | `power.ts:240` `buildSeriesStats` | count, mean, min, max, complete-year annual means, trend. |

This is genuinely defensible engineering: allow-listed parameters, bounded
request size, rate limiting, cache transparency, and explicit unavailable
reporting. Keep it.

### 1.2 Statistics — the core gap

`power.ts:158` `leastSquaresTrend` computes only:

```
slope = (n·Σxy − Σx·Σy) / (n·Σx² − (Σx)²)
```

over annual means of **complete** calendar years (the stricter, defensible
choice — 12 of 12 months required). It returns `{slopePerYear, fromYear,
toYear, years}` and nothing else.

`src/lib/earth/types.ts:161` `PowerSeriesStats` has no field for a p-value, a
confidence interval, an effective sample size, a test statistic, or a method
identifier. Nothing downstream can display significance because nothing upstream
computes it.

`src/lib/earth/analysis.ts:100` `seriesLimitations` states the position plainly (`:107`):

> "This is a descriptive statistic of the retrieved N-month series in °C; no
> statistical significance test, seasonal decomposition or attribution has been
> applied."

That sentence is honest, and it is also the admission that requirement 5 of the
brief is unmet. **This is defect D1 and the single highest-value item for the
event.**

Verified absence: a case-insensitive search for `mann|kendall|pvalue|bootstrap`
across `src/lib/earth/` returns exactly one hit — the Sri Lankan place name
*Mannar* in `geocode.ts:62`. There is no significance machinery in the module at
all.

Additional statistical weaknesses:

- **No uncertainty.** A slope of 0.02 °C/yr with 20 points and a slope of
  0.02 °C/yr with 4 points are presented identically.
- **No autocorrelation handling.** Annual temperature series are serially
  correlated. A plain Mann–Kendall or OLS test on such series over-rejects the
  null; "significant" would be wrong more often than the stated α.
- **No minimum-n rule.** Two complete years produce a slope (`points.length < 2`
  guard only). A two-point "trend" is not a trend.
- **Annual means only.** Seasonality is removed by construction, which is sound
  for temperature, but precipitation totals are a different variable with a
  different distribution; the same code path treats both as if identical.
- **No multiplicity control.** Comparing 7 variables × N locations at α = 0.05
  invites false positives; nothing acknowledges this.

### 1.3 Location and period

`TrendDetective.tsx:118` takes a single `area` and reports one series at a time.
Presets come from `src/lib/earth/geocode.ts` (`SRI_LANKA_PLACES`, `WORLD_PLACES`);
custom latitude/longitude entry exists with range validation; period presets are
10/20/30 years and "all".

There is **no two-location comparison of trends**. `ImageryMap.tsx` has a
`compareDate` mode, but that compares two *dates of imagery*, not two *series* —
a distinction the interface should never blur. Requirement 6 is unmet.

Stale-response safety is handled correctly: `TrendDetective.tsx:127` keeps an
`AbortController` in a ref and aborts the previous request, and checks
`signal.aborted` before every state write (`:153`, `:175`). Good; keep.

### 1.4 Visualisation

`src/ui/ChartFrame.tsx` (new, 123 lines) wraps every chart with a numeric
height, `initialDimension`, `minWidth`, an external HTML legend, an accessible
data-table toggle, a footnote slot and an empty state. `TrendDetective` uses a
`ComposedChart` for monthly values plus annual mean overlay, and a `BarChart`
for annual means with incomplete years dimmed.

Verified defect repair (D0, closed this session): the chart rendered axes, grid
and reference lines while every series disappeared. Root cause was not the data
and not `<Legend>` as such — it was **legend measurement**: when Recharts
measures the legend wrapper as occupying the plot box (jsdom returns the
viewport for every node; a hidden or animating tab, or a `height="100%"` chain
in production, does something similar), the plot area collapses and every series
is dropped silently, with no console error. Fix: numeric height, external HTML
legend, `initialDimension` so the first paint is not −1 × −1.

Proof: `scripts/chart-smoke.mjs` → 10/10, including "observed series rendered
(area/line)", "annual mean overlay rendered", "in-chart legend removed", and a
finite-geometry assertion. The same defect class was found and fixed in the
mission analytics charts (`src/components/MissionsAnalytics.tsx`, four
`height="100%"` containers, one in-chart `<Legend>`), covered by
`scripts/analytics-chart-smoke.mjs` → 7/7.

### 1.5 Findings and provenance

`analysis.ts:73` `describeSeries` renders unit-aware sentences from computed
values only. `analysis.ts:121` `buildLocalAnalystAnswer` is a deterministic
fallback that answers from the retrieved bundle and refuses what it cannot
support. `ProvenancePanel.tsx` and `SourceNote` surface source URL and retrieval
time.

This is the right architecture for requirement 9 — **deterministic first, AI
optional** — but the findings cannot yet contain significance, a confidence
interval or an observation count tied to a test, because those do not exist.

### 1.6 Interface

`EarthIntelligenceLab.jsx` presents four workspaces (trend, imagery map, 3D
globe, Sri Lanka watch) behind underline tabs, with an intro briefing strip and a
provenance hairline. Restyled to the shared token system this session.

Structurally it is still a **tab set of four tools**, not a research workflow.
The brief asks for one investigation spine: question → variable → place → period
→ chart → statistics → interpretation → method. Requirement 10 is partially met.

### 1.7 Coverage and metadata

`power.ts:24` declares 7 parameters — verified at runtime:
`T2M, PRECTOTCORR, RH2M, WS2M, ALLSKY_SFC_SW_DWN, T2M_MAX, T2M_MIN`. Each has a label, unit, kind and a
short note.

Missing per-parameter metadata, all required by requirement 3:

- product type (reanalysis / model / assimilated / satellite-retrieved);
- supported temporal coverage and archive start (a single global
  `EARLIEST_POWER_YEAR = 1981` at `power.ts:90` is not the same claim);
- per-parameter missing-data convention;
- the POWER source dataset name and version behind each parameter;
- spatial resolution statement per parameter.

`PowerParameterMeta` (`types.ts:139`) has no field for any of it.

### 1.8 Tests

`scripts/test-earth-intelligence.mjs` — 30 tests over parsing, stats,
analysis text and CSV/context builders. Passing.
`scripts/test-earth-server.mjs` — route-level behaviour on the server. Passing.
`scripts/test-earth-smoke.mjs` — renders the Lab in en/si/ta, 22 structural
checks each. Passing.
`scripts/chart-smoke.mjs` — 10/10 chart geometry. Passing.
`scripts/tabs-smoke.mjs` — mounts all 13 destinations. Passing.

There is **no test for a significance calculation**, because there is no
significance calculation. Requirement 12 cannot be satisfied for statistics
until `03_STATISTICAL_METHOD.md` is implemented.

---

## 2. Defect register

| ID | Defect | Severity | State |
|---|---|---|---|
| D0 | Earth Lab chart renders axes but drops all series | Critical | **Fixed** this session, verified 10/10 |
| D0b | Same percentage-height + in-chart-legend pattern in mission analytics | High | **Fixed**, verified 7/7 |
| D1 | No statistical significance test, CI or p-value anywhere | Critical (blocks challenge) | Open — specified in `03` |
| D2 | No autocorrelation or seasonality-aware test | High | Open — folded into D1 |
| D3 | Two-point "trends" permitted | Medium | Open — minimum-n rule in `03` |
| D4 | No location-to-location trend comparison | High (block challenge) | Open — specified in `04` |
| D5 | Parameter metadata lacks product type, per-parameter coverage and missing convention | Medium (brief requirement 3) | Open — schema change in `04` |
| D6 | Findings cannot state significance or N | High | Open — depends on D1 |
| D7 | Workspace is four tabbed tools, not one investigation spine | Medium | Open — design in `04` |
| D8 | No trend-by-location spatial view (map shows imagery, not results) | Medium | Open — design in `04` |
| D9 | Live NASA retrieval unverified in this environment | Medium | Environmental; day-1 event task |
| D10 | Official *Resources* tab unreleased | Unknown | Re-check on 14 Nov |
| D11 | Precipitation `annual.total` sums twelve mm/day rates into a quantity labelled *total*; `daysInMonth` (`power.ts:130`) is exported but never called | Medium (latent) | Open — currently computed and never displayed, so the first UI to show it will show a wrong number |

---

## 3. Gap matrix against the brief

| § | Requirement | State | Notes |
|---|---|---|---|
| 3 | Data engine with full per-variable metadata | Partial | 7 params, units and notes present; product type, coverage, missing conventions absent (D5) |
| 4 | Location and time investigation | Partial | Single location, presets and custom coords good; multi-location absent (D4) |
| 5 | Transparent statistical trend analysis | **Fails** | OLS slope only (D1–D3) |
| 6 | Regional comparison | **Fails** | Not implemented (D4) |
| 7 | Visualisation system | Passes | ChartFrame + table + units + missing-data states, verified |
| 8 | Spatial investigation view | Partial | Leaflet + GIBS imagery works; no trend results on map (D8) |
| 9 | Evidence-based findings | Partial | Deterministic engine exists; cannot state significance (D6) |
| 10 | Premium research interface | Partial | Tokens applied; IA still four tabs (D7) |
| 11 | Reliability and performance | Passes | Abort guards, validation, caching, rate limits |
| 12 | Testing and validation | Partial | Strong on parsing/chart; absent on statistics (D1) |
| 13 | Deliverables | Partial | No Figma file authored; no verification report yet |

---

## 4. What must not be broken

Preserve, because it is already correct and expensive to rebuild:

1. `server/earthIntelligence.ts` route contract: allow-list, ≤12 params, 60/min,
   TTL cache, `fromCache`.
2. `fetchPowerDataset` abort/signal handling and `Sourced<>` shape.
3. `parsePowerResponse` unavailable-parameter reporting (never silently drop).
4. `ChartFrame` chart mounting contract — do not reintroduce percentage heights
   or in-chart legends.
5. Deterministic-first analyst; AI stays optional and receives only computed
   values.
6. en / si / ta copy through `src/i18n/*` — every new string, no exceptions.
7. GIBS layer catalogue and date-domain validation (`src/lib/earth/domains.ts`).
