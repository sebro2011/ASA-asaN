# Trend engine — method specification (calibrated)

This document specifies the statistics to implement during 14–15 November. Every
threshold in it was **measured**, not assumed: the numbers in §4 and §6 come from
a seeded simulation study committed at
`scripts/research/trend-method-calibration.mjs` (600 replicates per setting). One
earlier draft of this document recommended two methods that failed that study.
They are recorded in §7 as rejected, with the numbers that killed them.

The governing rule:

> A trend is not significant because the line slopes. It is significant because a
> test with stated assumptions, applied to enough data, returns a small
> probability under the null — and the test's actual false-positive rate has been
> checked.

---

## 1. Three registers that must never be mixed

| Register | Example | Where it may appear |
|---|---|---|
| **Observation** | the 240 monthly POWER values actually returned | chart, table, CSV |
| **Derived summary** | annual mean of a complete year; annual total | chart overlay, table |
| **Inference** | Sen slope, CI, corrected p-value | statistics panel, findings — always with method and n |

An inferred number is never presented with the same visual weight as a measured
one. Product type is a fourth distinction and belongs in provenance, not the
chart: POWER atmospheric variables are **reanalysis/model products**, not direct
satellite retrievals.

---

## 2. Aggregation

### 2.1 Mean-type variables

`T2M`, `T2M_MAX`, `T2M_MIN`, `RH2M`, `WS2M`, `ALLSKY_SFC_SW_DWN`.

- Monthly value is already a monthly mean; annual value is the unweighted mean of
  the 12 monthly values.
- **All 12 months required.** A year missing any month is excluded and counted in
  `excludedYears`. Do not impute.
- Annual means remove the seasonal cycle by construction. Do not deseasonalise
  again.

### 2.2 Precipitation (`PRECTOTCORR`) — a defect to fix, not a formula to reuse

`PRECTOTCORR` is a **rate in mm/day**. The current code (`power.ts:270`) computes
`annual.total` by summing twelve rates, producing a quantity that is not a total
in any unit, and labels it `total`. It is computed and never displayed, so the
bug is latent — it will surface the first time a UI shows it.

Correct annual total:

```
annualTotal_mm = Σ_{m=1..12} rate_m × daysInMonth(year, m)     // leap years use 366
```

`daysInMonth` already exists at `power.ts:130` and is currently called from
nowhere. Trend is computed on annual totals and reported in **mm/decade**.

A trend in annual total says nothing about extremes, intensity or dry-spell
length. State that next to the result.

### 2.3 Period

Clamp requests to `[1981, currentYear − 1]`. The current calendar year is never
included: it is incomplete and would depress any annual aggregate.

---

## 3. Slope — Sen (Theil–Sen)

```
b = median { (x_j − x_i) / (t_j − t_i) }   for all i < j
```

Reported per year and per decade (`b × 10`).

Chosen over the OLS slope currently at `power.ts:158` because OLS is sensitive to
a single anomalous year and requires normality and homoscedasticity that annual
precipitation totals badly violate. The OLS slope may remain for the chart's
fitted line only, clearly labelled, never for inference.

**95 % CI** (Gilbert 1987): with `N = n(n−1)/2` pairwise slopes and `C = 1.96 ·
sqrt(Var*(S))` using the corrected variance from §4:

```
k1 = ceil((N − C)/2)
k2 = floor((N + C)/2) + 1
CI = [ k1-th smallest pairwise slope , k2-th smallest pairwise slope ]
```

If `k1 < 1` or `k2 > N`, return `null` and say the interval is not resolvable
with n = k years. Never fabricate a bound.

---

## 4. Significance — measured behaviour, and what to ship

### 4.1 The problem, quantified

Annual temperature and precipitation series are serially correlated. A plain
Mann–Kendall test on such a series rejects a true null far too often. Measured
here with 1 000 AR(1) replicates per setting, n = 30 years, no trend, α = 0.05:

| AR(1) φ | plain MK false-positive rate | nominal |
|---|---|---|
| 0.0 | 4.7 % | 5 % |
| 0.3 | 16.3 % | 5 % |
| 0.6 | **30.8 %** | 5 % |
| 0.8 | **47.0 %** | 5 % |

Source: `node scripts/research/trend-method-calibration.mjs`.

At φ = 0.6 — unremarkable for surface temperature — a plain MK test calls roughly
**three in ten trend-free series "significant"**. Shipping that would be the
single most damaging scientific error the project could make, and it is exactly
what an uncorrected implementation would do.

### 4.2 The test to ship: Hamed–Rao corrected MK, negative lags zeroed

1. Detrend with the **Sen slope** (not OLS — see §7.1).
2. Compute lag-k autocorrelation `ρ_k` of the detrended series, k = 1 … min(n−3, ⌊n/3⌋).
3. **Set negative `ρ_k` to zero.** Negative autocorrelation is usually an artifact
   of detrending a noise series (the Stuart–Ord effect); treating it as real
   shrinks the variance and makes the test anti-conservative. §7.1 shows this
   happening.
4. Variance correction:

```
Var(S) = [ n(n−1)(2n+5) − Σ_t t(t−1)(2t+5) ] / 18      // ties
ratio  = max(1, 1 + 2·Σ_k (n−k)(n−k−1)(n−k−2)·ρ_k / (n(n−1)(n−2)))
Var*(S)= Var(S) × ratio
effN   = n / ratio
Z      = (S − sgn(S)) / sqrt(Var*(S))
p      = 2(1 − Φ(|Z|))
```

The `max(1, …)` clamp means the correction can only ever make the test more
conservative. It cannot manufacture significance.

> **Implementation note (added after the correction audit).** Steps 1–3 above are
> now implemented exactly as written, which they previously were not: the shipped
> code took ρ₁ from the raw values while ρ₂…ρ_k came from the ranks, summed
> `|ρ_k|` instead of applying any gate or sign rule, and used a fixed 10-lag
> window instead of `⌊n/3⌋`.
>
> Implementing the *literal* published recipe (significance gate, negative lags
> retained, no clamp) turned out to be **anti-conservative** at n = 30. Measured
> with 600 seeded AR(1) replicates, no trend, false-positive rate at α = 0.05:
>
> | recipe | φ = 0 | φ = 0.3 | φ = 0.6 | φ = 0.8 |
> |---|---|---|---|---|
> | literal published (gate, signed, no clamp) | 9.8 % | 18.0 % | 26.2 % | 30.0 % |
> | **this document's rule (gate, negative lags zeroed, clamp)** | **1.3 %** | **5.3 %** | **12.2 %** | **17.7 %** |
>
> Reproduce both rows with `node --import tsx scripts/verify-statistics-report.mjs`,
> which prints exactly this table from the shipped functions. The full audit trail,
> including which of these rules the shipped code previously failed to implement, is
> in [`06_SCIENTIFIC_CORRECTION_REPORT.md`](06_SCIENTIFIC_CORRECTION_REPORT.md). The shipped rule also
> withholds inference outright in 33.5 % of the φ = 0.8 replicates because the
> effective sample falls below 10, which is why its rate stops climbing as fast as
> the unclamped recipe's.
>
> The reason is visible in the raw numbers: a strong negative lag is a genuine
> signal in an AR(1) process, and retaining it shrinks Var(S) below its
> independent value, so the test over-rejects. Zeroing negative lags leaves the
> variance inflation factor ≥ 1 by construction, which is why the rule in this
> document is the one shipped. Both factors are computed and exposed on the result
> (`varianceInflationFactor` and `varianceInflationFactorPublished`) so the
> difference is auditable rather than hidden.
>
> This does not make the correction calibrated — at φ = 0.6 it still rejects 12.2 %
> at α = 0.05. That is why §4.3 ships α = 0.01 and why §9 adds the bootstrap.

### 4.3 Calibrated threshold: use α = 0.01, not 0.05

Measured false-positive rate of the corrected test (600 seeded AR(1) replicates,
n = 30, no trend), by threshold:

| φ | p < 0.05 | **p < 0.01** | p < 0.001 | median effN |
|---|---|---|---|---|
| 0.0 | 1.2 % | 0.2 % | 0.0 % | 20.4 |
| 0.3 | 5.2 % | 0.5 % | 0.2 % | 17.9 |
| 0.6 | 13.0 % | **4.2 %** | 0.5 % | 13.9 |
| 0.8 | 18.3 % | 7.7 % | 1.8 % | 11.2 |

At α = 0.01 the test is conservative when autocorrelation is weak (0.2–0.5 %
instead of 5 %) and still imperfect at extreme autocorrelation (7.7 %), but it
never reaches the 31–47 % failure of an uncorrected test. For a public-facing
climate tool, erring toward "no trend detected" is the right direction.

**Ship α = 0.01 for the "significant" label.** Display `p` alongside, and display
`effN` and `ρ̂₁` so a reader can see why the verdict is what it is.

Note also that the detrended lag-1 autocorrelation (~0.42 at true φ = 0.6)
**underestimates** the process autocorrelation — detrending removes low-frequency variance. That is a
further reason to keep the threshold conservative rather than nominal.

### 4.4 Refusal rules — all enforced in code

| Condition | Result |
|---|---|
| n < 10 annual values | `insufficient data`, no p, no CI |
| effN < 10 | `insufficient data` — the record cannot support inference |
| 10 ≤ effN < 14 | test computed, flagged `confidence: 'short record'` |
| all values identical | slope 0, p = 1, `no clear trend` (statistic is exactly at its null centre — this is *not* "insufficient data") |
| duplicate year in the input | collapsed to the first record; never double-counted in S |
| `Var*(S) = 0` | refuse, do not divide by zero |
| any month missing in a year | year excluded, counted in `excludedYears` |

At φ = 0.6 the median effN is 13.9, so the effN ≥ 10 floor is achievable but does
bind — as it should.

---

## 5. Reporting

```ts
export interface TrendTest {
  method: 'mann-kendall-hamed-rao';
  variable: string;
  unit: string;
  n: number;                  // annual values used
  fromYear: number;
  toYear: number;
  excludedYears: number;
  S: number;
  varSCorrected: number;
  varianceRatio: number;      // >= 1 by construction
  z: number | null;
  pValue: number | null;
  effectiveN: number;
  lag1Autocorrelation: number; // before clamping, for display
  slopePerYear: number;        // Sen
  slopePerDecade: number;
  ci95: [number, number] | null;
  direction: 'increasing' | 'decreasing' | 'no clear trend';
  significance: 'significant' | 'not significant' | 'insufficient data';
  confidence: 'strong' | 'short record';
  alpha: 0.01;
}
```

### 5.1 Language rules

Permitted:
- "increased by 0.31 °C per decade (95 % CI 0.18 to 0.44); p = 0.002, n = 24 years"
- "no monotonic trend detected (p = 0.41, n = 24)"
- "insufficient data: 7 complete years, 10 required"
- "autocorrelated record: effective sample 14 years, so a p-value below 0.01 is required"

Forbidden:
- "97 % chance the climate is changing" — a p-value is not a probability of a hypothesis.
- "significant" in any block that does not also state p and n.
- "caused by", "due to", "driven by" — no attribution, ever.
- "no change" when the result is *not significant*. Say "no trend detected".
- a green "Significant ↑" badge. Significance is a sentence with numbers, not a badge.

### 5.2 Multiplicity

When k tests appear together, apply Benjamini–Hochberg at q = 0.05, show both
`p` and `q`, and footnote the count: "k tests run; q controls the false discovery
rate at 5 %." Never let the user pick the smallest of fourteen uncorrected
p-values.

---

## 6. Comparing two locations — refuse more than you would like

### 6.1 What was tested

Measured false-positive rate for "the trends differ", A and B generated from the
same AR(1) process with the same true trend, n = 25, 300 replicates:

| φ | paired label-permutation test |
|---|---|
| 0.0 | 6.0 % |
| 0.3 | 11.0 % |
| 0.6 | **23.5 %** |

Measured in the same script, n = 25 shared years, 200 replicate pairs, 1 000
permutations each.

At φ = 0.6 the permutation test is wrong about one time in four, and power barely
rises above chance. **A formal "the trends differ" claim cannot be supported by a
25-year autocorrelated record.** Any implementation that prints such a p-value is
reporting noise.

### 6.2 What to ship

1. **Intersect the periods.** Both series must cover the same years; if the
   intersection is under 15 years, refuse and say which location limits it.
2. Report both slopes with their 95 % CIs, side by side, in the same units.
3. **CI-overlap screen, explicitly labelled as a screen:**
   - CIs do not overlap → "the difference is supported by this record".
   - CIs overlap → "the difference is not resolved by this record".
   - State: *"No formal difference test is reported. Non-overlapping 95 %
     confidence intervals imply a difference at p < 0.05; overlapping intervals
     do not prove the trends are equal."* This is conservative by construction —
     it will miss real differences rather than invent them.
4. Show effective n for both series.
5. Never compare p-values across locations. "A is significant and B is not" is
   not evidence that A and B differ (Gelman & Stern 2006).

Also always show, as description only (never tested): the 12-month climatology of
each location, and the grid-cell caveat that each series is one ≈0.5° × 0.625°
cell, not a region.

---

## 7. Rejected alternatives, and why

### 7.1 Naive detrend-then-correct (OLS residuals)

Detrending a noise series with OLS leaves **negatively** autocorrelated residuals.
Correcting with those produced `varianceRatio = 0.60` on AR(1) φ = 0.6 — the
correction *shrank* the variance and raised significance from p = 0.035 to
p = 0.007. An anti-conservative correction is worse than none. Fixed by Sen
detrending plus zeroing negative lags (§4.2).

### 7.2 Trend-Free Pre-Whitening (TFPW, Yue et al. 2002)

Standard in the literature, and it failed here:

| φ | 0.0 | 0.3 | 0.6 | 0.8 |
|---|---|---|---|---|
| TFPW false-positive rate | 4.7 % | 16.5 % | **36.3 %** | 59.0 % |

Exactly nominal when there is no autocorrelation, and worse than plain MK at
high φ.

Worse than plain MK at high φ. Cause: with n ≈ 30 the pre-whitening coefficient
estimated from a detrended series under-corrects, and only lag-1 is removed.
Rejected on evidence, not on taste.

### 7.3 Circular block bootstrap CI on the Sen slope

| block length | φ = 0 | φ = 0.6 |
|---|---|---|
| sqrt(n) | 18.8 % | 24.5 % |
| n/3 | 21.0 % | 29.5 % |
| n/2 | 25.5 % | 34.0 % |

A false-positive rate of ~19 % **with no autocorrelation at all** means the
percentile interval itself is broken at this sample size. Rejected entirely —
including for the comparison, where an earlier draft of this document had put it.

### 7.4 Paired block bootstrap of the slope difference

Not separately tested after 7.3 failed at φ = 0 with n = 30; the paired permutation
in §6.1 covers the same ground and also failed at high φ. Rejected.

---

## 8. Acceptance tests — with the expectations the study established

Scripts: `scripts/fixtures/*.json`, `scripts/test-trends.mjs`. Seeded RNG only.

| ID | Fixture | Assertion |
|---|---|---|
| T1 | exact line, slope 0.25, 2000–2019 | Sen = 0.25 ± 1e−9; **S = 190** (20·19/2); p < 1e−6; CI brackets 0.25; varianceRatio = 1; effN = 20 |
| T2 | seeded N(0,1), n = 30, no trend | p > 0.01; direction `no clear trend` |
| T3 | AR(1) φ = 0.6 seeded, n = 30, no trend | plain-MK p < 0.05 **and** corrected p > 0.01 — proves the correction is active |
| T4 | 5 complete years | `insufficient data`; `pValue === null`; no CI |
| T5 | constant series, n = 20 | slope 0, p = 1, `no clear trend`, no division error |
| T6 | n = 20, one month missing in 2011 | n = 19, excludedYears = 1 |
| T7 | precipitation 1 mm/day through 2020 | annual total = **366 mm** (leap year); 2019 = 365 mm |
| T8 | 500 seeded replicates, slope 0.2, σ = 0.5, φ = 0 | CI contains 0.2 in ≥ 90 % |
| T9 | two identical series | CI-overlap screen → "difference not resolved" |
| T10 | A +0.3, B −0.3, n = 25, φ = 0 | CIs disjoint → "difference supported" |
| T11 | φ = 0.6, no trend, ≥ 400 replicates | corrected FPR at α = 0.01 is between 1 % and 6 % — the calibration test; the shipped calibration script asserts this and exits non-zero otherwise |
| T12 | any series, check `varianceRatio` | ratio ≥ 1 always; never below 1 |
| T13 | BH on known p-vector | q monotone, q ≥ p elementwise |

T11 is the test that matters most: it checks the test's *error rate*, not just
that it returns a number. It is the reason this document has a §7.

---

## 8.1 A dependence-aware cross-check: circular block bootstrap on S

The analytic correction in §4.2 is the primary test, but it is not calibrated at
strong autocorrelation (§4.3). A second, resampling-based inference therefore runs
alongside it, and the UI shows both.

**What is bootstrapped, and what is deliberately not.** The bootstrap resamples
the **Mann–Kendall S statistic**, not the Theil–Sen slope. This matters:

| construction | false-positive rate at α = 0.05, n = 30 |
|---|---|
| percentile bootstrap CI on the Sen slope, block = √n | 16.8 % (φ = 0) · 23.3 % (φ = 0.6) |
| inverted-null bootstrap CI on the Sen slope, block = 3 | 13.0 % (φ = 0) · 24.0 % (φ = 0.6) |
| **circular block bootstrap on S, block = ⌈n^(1/3)⌉ (shipped)** | **4.0 % (φ = 0)** · 9.0 % (φ = 0.6) |

A Sen-slope interval fails **at φ = 0**, where there is no autocorrelation at all
to blame: the slope estimator's sampling distribution is too discrete at n = 30
for a percentile interval to be honest. S is bounded, integer-valued and free of
nuisance parameters, so bootstrapping it behaves. §7.3 recorded the slope-based
failure; this section records that the *statistic* choice, not the block length,
was the problem.

The first two rows were measured in a scratch experiment during this audit and are
not part of the shipped code path; the third row is reproduced by
`npm run verify:stats` (200 replicates) and by `npm run test:stats`.

**Procedure.** Centre the series (under H₀ there is no trend, so de-meaning is the
null-preserving step — do **not** de-trend, which manufactures a spurious null
centred away from zero). Resample with a circular moving block of length ⌈n^(1/3)⌉
to retain serial dependence. Recompute S. Report
`p = (1 + #{|S*| ≥ |S_obs|}) / (B + 1)` with B = 999 fixed-seed replicates.

**Interpretation.** `inferenceAgreement` on the result says how the two p-values
relate. `bootstrap-more-conservative` is the expected and welcome outcome for
short autocorrelated records; `analytic-more-conservative` is rare and recorded
rather than suppressed. The bootstrap is *not* used to upgrade a claim — it can
only add doubt, never remove it, because the verdict is `significant` only when
the analytic test passes at α.

**Limitation stated plainly.** At φ = 0.6 the bootstrap still rejects 9.0 % of true
nulls at α = 0.05 and 3.0 % at α = 0.01. It is a genuine improvement over an
uncorrected test (30.8 % at α = 0.05) and roughly comparable to the analytic
correction at the same threshold (12.2 %), not a solution. A 30-year
autocorrelated record cannot fully identify its own trend; no method changes that.

---

## 9. What the chart shows once this exists

- Monthly observations: existing area series, unchanged.
- Annual means: existing overlay, unchanged.
- **Trend line**: Sen slope anchored at the median year, labelled
  "Sen's slope, 0.31 °C/decade". One trend line, correctly labelled.
- **Uncertainty**: a CI band only if `ci95` exists; if `null`, draw nothing and
  say why in the panel.
- **Excluded years**: dimmed bars (already implemented) plus the count in the
  panel.

The statistics panel sits beside or beneath the chart, never inside it: method,
period, n, effN, ρ̂₁, slope ± CI, p, direction, confidence, refusal reason. A
table of numbers, not a badge.
