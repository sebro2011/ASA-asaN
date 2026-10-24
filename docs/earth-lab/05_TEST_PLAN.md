# Verification plan

The submission asks for a report describing what was actually tested. This is
the checklist that report must satisfy. Nothing may be marked passed without a
command and its output.

## 1. Statistical correctness

| # | Check | Command | Pass criterion |
|---|---|---|---|
| S1 | Sen slope, corrected MK, CI, refusal rules | `node --import tsx --test scripts/test-trends.mjs` | T1–T10, T12, T13 of `03` §8 pass |
| S2 | Precipitation annual totals and leap years | same suite | T7 exact (366 mm for 1 mm/day in 2020) |
| S3 | CI coverage | same suite | ≥ 90 % of 500 seeded replicates bracket the true slope |
| S3b | **The test's own error rate** | same suite, T11 | corrected FPR at α = 0.01 lies in 1–6 % under AR(1) φ = 0.6. This is the test that catches a plausible-but-wrong implementation |
| S3c | Correction is never anti-conservative | same suite, T12 | `varianceRatio ≥ 1` for every fixture, including pure noise |
| S4 | Comparison verdicts | same suite | T9 "not resolved", T10 "supported" via the CI-overlap screen — and no p-value is printed for the difference |
| S5 | BH correction ordering | same suite | monotone q-values, q ≥ p elementwise |

A test that only asserts "a number was returned" is not a test. Assert the
number.

## 2. Data and parsing

| # | Check | How |
|---|---|---|
| D1 | Real POWER response parses | Live request on event network; `rows`, `available`, `unavailable` inspected |
| D2 | Fill values ≤ −900 rejected | Fixture with `-999` in a month; that month must be `null` and the year excluded |
| D3 | Missing parameter reported, not dropped | Request a bogus code; it appears in `unavailable` |
| D4 | Period clamped to 1981…last complete year | Request 1970–2027; assert resolved range |
| D5 | Unit travels with the variable | Switch variable; assert axis label and statistics unit both change |
| D6 | CSV export matches on-screen values | Diff a sample of rows |

## 3. Chart rendering

| # | Check | Command |
|---|---|---|
| C1 | Series geometry exists | `node --import tsx scripts/chart-smoke.mjs` → 10/10 |
| C2 | No percentage-height / in-chart legend regression | grep for `height="100%"` inside `src/components/earth/` returns nothing |
| C3 | Insufficient-data state | Fixture with 5 years: chart shows data, statistics panel refuses, no p-value anywhere in the DOM |
| C3b | Autocorrelation disclosure | Fixture at φ ≈ 0.6: panel shows effective n and ρ̂₁, and the reason a p < 0.01 threshold applies |
| C4 | Empty and error states | Fixture with zero rows; fixture with HTTP 500 — both render a stated message and a retry |
| C5 | Resize | jsdom harness only here; a real-browser resize must be checked on 14 Nov and recorded honestly |

## 4. Interface

| # | Check |
|---|---|
| U1 | 1440 px, 834 px, 390 px: no horizontal scroll, toolbar readable, chart ≥ 280 px tall |
| U2 | Keyboard: tab order reaches every control; selectors open on Enter/Space and close on Escape; focus is visible |
| U3 | Contrast ≥ 4.5:1 body, ≥ 3:1 large text and graphical boundaries |
| U4 | `prefers-reduced-motion`: chart animation and map transitions stop |
| U5 | Screen-reader names on every icon-only control; chart has an accessible table alternative |
| U6 | Sinhala and Tamil do not clip or overflow at 390 px |

## 5. Honesty checks — the ones judges actually test

| # | Check | Failure looks like |
|---|---|---|
| H1 | Every number in a finding appears in the `TrendTest` object | A sentence with a hard-coded digit |
| H2 | No API failure is presented as live data | A sample/fallback without a visible badge |
| H3 | "Significant" never appears without p and n in the same block | A green badge saying "Significant trend ↑" |
| H3b | No p-value is printed for a location *difference* | A comparison panel showing "p = 0.03: trends differ" — the study in `03` §6 shows that claim is unsupportable at this sample size |
| H4 | No causal language | "warming driven by…" |
| H5 | Reanalysis labelled as reanalysis | provenance block says POWER; product type stated |
| H6 | AI optional | Block the AI route; the finding still renders from deterministic values |

## 6. Build and regression

```
npx tsc --noEmit                      # 0 errors
npm run test:earth                    # existing 30+
npm run test:earth-server
npm run test:earth-smoke              # en/si/ta structural
npm run build                         # succeeds; chunk sizes recorded
node --import tsx scripts/browser-smoke.mjs    # 14/14
node --import tsx scripts/tabs-smoke.mjs       # 13/13
```

Record actual output, including warnings (the `three` >500 kB chunk warning is
expected and should be stated, not hidden).

## 7. Report template — `docs/earth-lab/VERIFICATION.md`

```markdown
# Verification — <date, commit sha>
## Commands run and their real output
## Statistical results (T1–T10, coverage)
## Live retrieval (timestamped request + row count)
## Interface checks (viewports, languages, keyboard)
## Known limitations (unverified metadata, no real-browser pass, …)
## Not done (and why)
```

The last section is not optional. A report with an empty "not done" section is a
report that was not written honestly.
