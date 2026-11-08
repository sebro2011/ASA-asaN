# NOVA Hypothesis Forge — Scientific Method and Decision Rules

## 1. Interpretation

The interpreter (`src/lib/forge/interpreter.ts`) does not use a language model. It uses a
bilingual keyword vocabulary and deterministic parsing:

- **Domain**: space weather, Earth environment, near-Earth objects, orbital, planetary imagery,
  astronomy context, or unsupported.
- **Time range**: explicit date, explicit year, explicit month, relative window ("last 7 days"),
  named event (for example the 1859 Carrington event, 2003 Halloween storms), or a documented
  default. The origin and an `assumed` flag are stored.
- **Region**: gazetteer lookup for cities and regions used by the Earth path; otherwise global.
- **Variables and methods**: matched from the 11 variables and 8 methods.
- **Language**: Sinhala/Tamil script detection, otherwise the requested language.
- **Follow-up**: a short question with no time range inherits the previous range, domain and
  variables. `context` is rebuilt server-side from an allow-list.

`interpretationConfidence` (high/medium/low) describes **parsing**, not science; the UI labels it
as interpretation confidence.

## 2. Hypothesis generation

For each request the engine produces at least two hypotheses, one of which is the explicit null
hypothesis. Each has:

- a stable id (`H1`, `H2`, …);
- a template (`lead-lag`, `threshold-response`, `null-association`, `trend`, `before-after`,
  `descriptive-context`);
- independent and dependent variables, and the observations required;
- an expected relationship (sign, lag in hours, effect threshold);
- falsification criteria (what observation would refute it);
- alternative explanations;
- limitations;
- a test method.

The user's decision (`accepted`, `rejected`, `edited`, `proposed`) is stored with the
investigation but never changes a measurement or an evidence classification.

## 3. Statistics (deterministic)

All functions live in `src/lib/forge/analysis.ts` and are unit-tested against independently
checkable values.

| Method | Implementation | Notes |
|---|---|---|
| Descriptive | mean, median, std dev, min/max, n | Reported per series. |
| Pearson correlation | `correlationTest` | t statistic, df = n − 2, two-tailed p via incomplete beta. |
| Spearman | `spearman` | Rank correlation with tie handling. |
| Linear regression | `linearRegression` | Slope, intercept, R², residuals. |
| Cross-correlation | `crossCorrelation` | Lags up to ±12 h on the aligned median cadence. |
| Before/after | `compareGroups` | Group sizes, means, difference, effect magnitude. |
| Threshold exceedance | `twoByTwoTable` | Odds ratio, φ, cell counts. |
| Trend | `linearRegression` over time | Slope with sample size guard. |
| Anomaly | `detectAnomalies` | Robust threshold on the observed distribution. |
| Missing data | `missingReport` | Count, fraction, expected count, method. |

The browser never computes a reported statistic. The scatter view plots
`AnalysisResult.pairs`, i.e. exactly the pairs the correlation test used (asserted by a test that
recomputes r from the plotted pairs).

## 4. Evidence classification

`buildEvidence` applies fixed thresholds:

| Parameter | Value |
|---|---|
| `ALPHA` | 0.05 |
| `EFFECT_FLOOR` | 0.30 (absolute r) |
| `MIN_CORRELATION_N` | 10 |
| `MIN_THRESHOLD_N` | 20 |
| `MIN_TREND_N` | 12 |

Classification:

- **supporting** — p ≤ α, |r| ≥ effect floor (or the hypothesis's larger threshold), sign matches
  the expected relationship, and n is sufficient.
- **contradicting** — significant result with the opposite sign, a lead-lag result where the
  response leads the driver (`bestLagHours < 0`), or a threshold table whose association runs
  against the hypothesis.
- **insufficient** — sample below the method minimum, zero variance, or a source that could not
  deliver the observations.
- **neutral** — a valid computation whose effect is below the floor or whose p exceeds α.

Each item stores the literal rule text, the numeric values, the analysis id, the dataset title,
the official source URL, the retrieval timestamp, the observation period, quality notes and
limitations. There is no model-generated confidence.

## 5. Counter-evidence

`buildCounterEvidence` always returns findings, independent of whether the hypothesis was
supported:

1. **assumption** — linearity, independence, normality, alignment tolerance;
2. **alternative-explanation** — confounders such as season, solar cycle, other drivers;
3. **missing-variable** — variables in the domain that were not measured;
4. **temporal-mismatch** — cadence differences, window truncation, lead/lag ambiguity;
5. **measurement-uncertainty** — instrument precision and provisional data;
6. **selection-bias** — the window was chosen after the event, or coverage is partial;
7. **data-gap** — missing fractions, unavailable sources;
8. **falsification** — the criteria that would have refuted the hypothesis and whether they were
   testable.

Severity is `low` / `medium` / `high`; the report exposes the maximum severity and a
`dataGapDetected` flag.

## 6. Conclusion

`conclude` maps counts and counter-evidence severity onto four verdicts:

| Verdict | Condition (simplified) |
|---|---|
| `insufficient-evidence` | no usable analysis, no supporting or contradicting items, or a high-severity data gap |
| `not-supported` | contradicting evidence dominates and no supporting item survives |
| `mixed` | both supporting and contradicting items exist |
| `weakly-supported` | at least one supporting item, no contradicting item, and no high-severity counter-evidence |

`proven` is not representable in the type system. Every conclusion carries a causal caveat, and
the passport repeats it.

## 7. Reproducibility requirements

A reader must be able to answer: which data, which window, which pairs, which thresholds, which
method parameters, and which source version? The passport therefore contains:

- the original question, language and parsed request;
- the plan's dataset ids and coverage verdicts;
- the threshold block;
- for every analysis: id, method, variables, dataset refs, assumptions, parameters, results,
  sample size, limitations and skip reason;
- for every evidence item: rule, values, source URL, retrieval time, payload hash;
- the counter-evidence report, limitations and conclusion;
- reproduction instructions and the three API routes.

## 8. Known methodological limits

- Observational data cannot establish causation; the engine says so everywhere.
- Autocorrelation inflates significance in geophysical series; this is stated as a limitation
  rather than corrected with an untested model.
- Multiple comparisons are not yet adjusted; analyses are few and pre-declared by the plan.
- Alignment uses a fixed 90-minute tolerance; a source with a coarser cadence would need its own
  tolerance.
- Evidence strength aggregation is ordinal and deliberately conservative.
