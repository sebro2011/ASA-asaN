# COSMORA AI — pre-implementation audit and methodology

Date: 2026-11-17 · Scope: upgrade "COSMORA AI v2.0" to v3.0 (Advanced Research
Validation Edition) without touching v1/v2 artefacts.

---

## 0. What was actually available to audit

The uploaded file is `vertopal.com_Untitled2.json`, a Vertopal export rather than an
`.ipynb`. It is **not a valid notebook**: it contains no `cells` array, and instead
holds 167 keys — the notebook's *source fragments* used as dictionary keys, each mapped
to `null`. Total recoverable text: 11 011 characters. Concretely:

| Check | Result |
| --- | --- |
| `nbformat` / `nbformat_minor` | absent |
| `cells` | absent (167 string keys, all `null` values) |
| Executable content | none — the JSON cannot be opened by Jupyter |
| Recoverable evidence | imports, dashboard HTML/CSS/JS, a v3 "blueprint" cell, some `torch`/`scikit-learn` usage |

So this audit is of *what the fragments prove*, not of a running v2 system. Anything
below that is not visible in the recovered text is marked **unknown**, and no claim is
made about it. A truncated export is itself the first finding: the experimental
configuration of v2 was not stored in a form that can be re-run.

---

## 1. Findings in the recovered v2 material

### F1 — Numbers in the dashboard that no code computed (critical)

The v3 dashboard template contains straight literals next to interpolated values:

```html
<td>${payload[loc].scores_consensus_temp.R2.toFixed(3)}</td>
...
<tr><td>COSMORA GRU</td><td>0.813</td><td>0.592</td></tr>
<tr><td>COSMORA LSTM</td><td>0.710</td><td>0.424</td></tr>
```

Some cells came from `payload`, others were typed. A reader cannot tell which is which,
which is the practical definition of a fabricated result even when it was unintentional.
**v3 response:** the dashboard is rendered from the metric tables; there is no numeric
literal anywhere in `report.py`'s HTML, and the report states that fact.

### F2 — "±1.96 σ" presented as calibration (major)

The blueprint declares interval uncertainty as residual variance × 1.96. That is a
Gaussian assumption. Rainfall residuals are right-skewed and heteroscedastic, so nominal
95% bands routinely cover less. Nothing in the recovered text measures coverage.
**v3 response:** split-conformal calibration on validation residuals, with *empirical*
coverage, mean width and Winkler score reported on the sealed test tail — plus the
Gaussian band side by side, so the cost of the old assumption is visible rather than
asserted.

### F3 — Extreme rainfall defined by a magic threshold (major)

The blueprint uses "Extreme Rainfall (>15 mm/day)". A fixed constant is not a definition:
it is neither location- nor record-relative, and if it were ever derived from the full
record it would leak the test period into the event definition.
**v3 response:** threshold = configured quantile (default 95th) of **training** rainfall,
in mm/day, computed per location, and reported in every extreme-rainfall row.

### F4 — Metric set too narrow to referee a model (major)

`mean_absolute_error`, `mean_squared_error`, `r2_score` only. R² hides bias, and MAPE on
a near-zero rainfall month is meaningless without a guard.
**v3 response:** MAE, RMSE, bias, R², Pearson r, guarded MAPE, skill score against a
month-of-year climatology learned on training months, plus coverage/Winkler for intervals.

### F5 — No seed stability, no statistical test (major)

The recovered text shows a single `SEED` constant; model comparisons would therefore
rest on one initialisation, and no test distinguishes a real difference from noise.
**v3 response:** every model is refitted under every configured seed; dispersion is
reported; model differences are tested with a paired bootstrap CI *and* Diebold–Mariano,
and the verdict column has an explicit "not distinguishable" state.

### F6 — Preprocessing order cannot be verified from the artefacts (major, unknown cause)

`StandardScaler` is imported and used in v2, but the fragment does not show whether it
was fitted before or after the split. That is precisely the kind of defect that cannot be
audited after the fact — which is the point.
**v3 response:** the scaler is a `TrainOnlyScaler` fitted inside each fold, with a
perturbation test that changes a future observation and asserts past features do not move
(`tests/test_leakage.py`). Leakage is now a failing test rather than a code-review hope.

### F7 — No separation of validation from test (major)

The blueprint describes walk-forward CV and a "consensus ensemble" but no sealed holdout.
**v3 response:** `splits.py` reserves the final `test_months` and every fold's validation
window is asserted to end at or before that boundary (`assert_no_overlap`), so the tail is
touched exactly once — by the final fit and the final evaluation.

### F8 — Engine reproducibility (minor)

`!pip install ... torch` at the top of a notebook, no pinned versions, no exported
environment.
**v3 response:** pinned `requirements.txt`, a config hash stamped on every artefact, and a
written `run_manifest.json` recording dataset hashes, seeds, versions and timings.

---

## 2. What v3.0 must therefore be

Requirements from the brief, mapped to a design decision:

| Requirement | Design decision | Where |
| --- | --- | --- |
| Walk-forward CV | expanding window, validation never overlaps training, stops before the tail | `splits.py` |
| GRU, LSTM, MLP, XGBoost comparison | identical folds, identical rows, identical metrics | `models.py`, `evaluate.py` |
| GRU+LSTM+MLP ensemble | equal weights, members reported separately | `models.py` |
| Calibrated intervals | split conformal on validation residuals + coverage on test | `uncertainty.py` |
| Extreme rainfall | training-quantile threshold, precision/recall/F1/rank-AUC | `extreme.py` |
| Three locations | Colombo, Kandy, Jaffna from one config | `config/experiment.json` |
| MAE, RMSE, R², more | + bias, Pearson, guarded MAPE, skill vs climatology | `metrics.py` |
| Seed stability | all seeds × all folds × test | `evaluate.py` |
| Graphs + dashboard | actual-vs-predicted, comparison, stability, extremes, HTML | `plots.py`, `report.py` |
| Export everything | tables, model weights, scalers, config, manifest, report | `report.py` |
| Fit preprocessing on train only | `TrainOnlyScaler` inside the fold | `features.py` |
| No future input | lags ≥ 1 and trailing windows only; perturbation test | `features.py`, tests |
| Identical test periods | one `Split` object per (location, target), reused by all models | `evaluate.py` |
| Validation ≠ test | two separate tables, never concatenated | `report.py` |

---

## 3. Leakage threat model

Enumerated threats, each with the mechanism that closes it:

1. **Look-ahead in features** — all inputs are `shift(≥1)`; rolling windows are computed
   on the shifted series. Verified by perturbing a future value and asserting earlier
   feature rows are bit-identical.
2. **Scaler fitted on the full record** — `TrainOnlyScaler.fit(X_train)` per fold; a test
   asserts training rows come out centred and later rows do not.
3. **Test tail used for calibration** — conformal quantiles come from fold validation
   residuals; `assert_no_overlap` prevents a fold from reaching the tail.
4. **Hyper-parameter selection on test** — no selection loop exists; the configuration is
   fixed a priori and hashed. Nested selection is listed as a limitation, not claimed.
5. **Threshold leakage in extremes** — quantile taken from training rainfall only.
6. **Seed cherry-picking** — all configured seeds are reported; dispersion is a table
   column, not a footnote.
7. **Metric shopping** — every metric is computed for every model on the same rows, and a
   model difference additionally requires two concordant statistical tests.

---

## 4. Cost and honesty budget

The full configuration is 3 locations × 2 targets × 5 seeds × (10 folds + 1 fit) ×
5 models ≈ 1 650 trainings. On a 2-core machine the NumPy RNNs are the bottleneck, so
`--quick` (2 seeds, 2 folds, 40 epochs) exists for iteration. A quick run has a different
config hash, so its artefacts cannot be mistaken for the full experiment.

Deep models are implemented in NumPy rather than PyTorch (v2 used `torch`). Reasons: the
run must reproduce without a ~540 MB CUDA wheel and its NVIDIA dependencies, and every
hand-written gradient can be verified against finite differences — which
`tests/test_gradients.py` does for MLP, GRU and LSTM. A framework would have hidden that
verification behind a dependency.

---

## 5. Acceptance criteria for the implementation

1. `python -m unittest discover -s tests` passes, including gradient checks.
2. A synthetic end-to-end run produces tables, figures, exports and a dashboard with no
   hand-typed numbers, stamped `data_provenance: SYNTHETIC`, `scientific_results: false`.
3. A real run against NASA POWER either produces the same artefacts stamped
   `NASA_POWER`/`true`, or fails loudly with `DataUnavailable` and exit code 2. No third
   outcome is permitted — in particular, no silent fallback to synthetic data.
4. The report distinguishes validation from test on every page, and never states a model
   is better without a bootstrap interval and a DM p-value.

---

## 6. Post hoc: what phase 2 changed in this design

The document above describes the design as built. Four defects found by the independent
audit (`DEFECT_REPORT.md` §2–§3) contradicted it, and were fixed after the real-data run:

| Design claim above | What was actually true | Now |
| --- | --- | --- |
| Early stopping holds out 20% of the training window | the held-out block was the last **single row** (D11) | 20% by row count, chronological, recorded on the fitted object |
| Walk-forward validation never overlaps training | true, but consecutive **validation** windows overlap by 12 months, and the concatenation counted those months twice (D12) | true, and metrics/calibration use the distinct months; the overlapping forecast instances are reported separately instead of discarded |
| Model differences need a DM test | the test used a normal reference and an un-corrected HAC variance on n = 60 dependent months (D14) | t reference with n−1 df, Newey–West variance, Harvey–Leybourne–Newbold factor |
| A model is better only when the tests agree | 24 comparisons were read at α = 0.05 each with no correction (D15) | Benjamini–Hochberg over the planned family; raw and adjusted p both reported |

None of these changes the threat model in §3, and none of them was a design decision — they
were implementation defects. The acceptance criteria in §5 are now enforced by 79 tests,
36 of which were added with the fixes.
