# COSMORA AI v3.0 — final scientific audit

Date: 2026-11-17 (revised after the phase-2 corrections) · Branch `arena/e5eb545e-asa-asan`
(base `0c37695`) · Package version 3.0.0 · Corrections commit `c452a61` · Run
`run_20261117T182826Z_a6bbe9432b389257`

This document reports what was built, **what was actually executed**, and what remains
unverified. It is written so that a reader can separate the three.

**Revision note.** §8 and §9 below describe the run executed *after* the four defects
D11, D12, D14 and D15 were fixed (see `DEFECT_REPORT.md` §9). The pre-correction version
of this document — including every number it quoted — is preserved verbatim at
`docs/evidence/FINAL_SCIENTIFIC_AUDIT_pre_correction.md`, and the pre-correction run's
tables are committed at `docs/evidence/pre_fix_run/`. Where a conclusion changed, the
change is stated rather than quietly applied.

---

## 1. Headline status

| Item | Status |
| --- | --- |
| Code implemented (all 10 requested items) | ✅ |
| Unit / contract tests | ✅ 79 tests, 0 failures (43 at the pre-correction baseline, 36 added) |
| Engine check on synthetic data | ✅ (`--synthetic`, §2) |
| **End-to-end run on real NASA POWER data** | ✅ 3 cities × 2 targets × 5 seeds × 8 walk-forward folds + sealed 60-month tail, 1 014 s (§8) |
| Real climate metrics (MAE / RMSE / R² on reanalysis data) | ✅ reported in §8, with the window caveat in §7.3 |
| Bit-for-bit reproducibility of the numbers | ✅ two independent full runs produced **identical** tables (§8.0) |
| Evidence that the ensemble beats its members | ❌ **none** — 0 of 24 comparisons favour it once the family-wise correction is applied; 2 come out `worse`, 15 `not distinguishable`, 7 `inconclusive` (§8.2, §9). "Comparable", not "superior" — and no longer better than that |
| Extreme-rainfall detection skill | ❌ recall 0.00–0.33, every observed event underpredicted (§8.4) |
| Calibrated intervals at nominal 90% | ⚠️ **partly** — conformal coverage 0.833–1.000, mean 0.911; 9 of 30 cells fall below 0.90 and 5 sit above 0.95 (§8.3) |
| Phase-2 corrections (D11, D12, D14, D15) | ✅ fixed, tested, experiments re-run on identical data/seeds/folds; evidence in `docs/evidence/` (`DEFECT_REPORT.md` §9) |

**Status after the independent defect pass.** A second audit of the package found 21
further defects (2 that silently change what the experiment measures, 9 that change a
reported number or the provenance record, 10 robustness/hygiene). Four of them were fixed
in phase 2 — D11 (early stopping was driven by one row), D12 (overlapping folds were
counted as independent months), D14 (Diebold–Mariano used a normal reference) and D15 (24
comparisons, no multiplicity control) — and the experiment was re-run end to end. The
other 17 remain open and are listed in `DEFECT_REPORT.md` §9.6. Every item, with evidence
and repro commands, is in [`DEFECT_REPORT.md`](DEFECT_REPORT.md).

Fixing them did **not** rescue the ensemble or the neural models; it made the picture
worse for them, which is the useful direction for a reader. XGBoost, which none of the
four fixes touches, is unchanged to the last digit (test MAE 0.263 / 0.471 / 0.349 °C).

**The one-line version.** On 25 years of NASA POWER data for Colombo, Kandy and Jaffna,
one-month-ahead **temperature** is predictable well enough to beat climatology with
XGBoost (test MAE 0.263 / 0.471 / 0.349 °C, skill +0.61 / +0.22 / +0.23), the neural
models are **not** reliably better than climatology, and **rainfall is not predictable at
all** by this design — every model has negative skill on rainfall in all three cities.
XGBoost is the best model in all six city × target cells and the ensemble is second in all
six, but the ensemble is not *significantly* better than any member in a single comparison
(0 of 24 `better`; 2 `worse`; 7 `inconclusive`; 15 `not distinguishable`). That supports
*comparable*, not *superior* — and after the phase-2 corrections the earlier, weaker claim
("4 of 24 comparisons favour it") no longer holds either.

**What changed from the previous state of this document.** Earlier revisions reported
no real numbers, because this sandbox cannot open a TLS connection to
`power.larc.nasa.gov` (exit 35, no proxy). The three payloads were subsequently captured
through an agent fetch tool, transcribed, and **verified value-by-value** against POWER's
own month-13 identity before being admitted (§7.4). They are committed, so the run is
reproducible offline. The window that could be obtained is 2000–2024 with two parameters,
not the 1985–2025 five-parameter design in `config/experiment.json`; the difference is
enumerated in §7.3 and is not papered over anywhere else in this document.

---

## 2. What the engine check actually did (SYNTHETIC — not a scientific result)

Command:

```bash
python scripts/run_experiments.py --synthetic --quick
```

* 3 synthetic locations (same coordinates and column layout as POWER), 480 months each
* 2 seeds (7, 21) · 2 folds · 40 epochs · 60-month sealed test tail per series
* config hash `3869b632c17ac333` · wall clock **86.8 s** · 60 model artefacts written

Synthetic data is generated by `data.synthetic_power` (seasonal cycle + trend + AR(1)
noise; gamma rainfall with injected spikes) and every artefact carries
`data_provenance: SYNTHETIC`, `scientific_results: false`.

### 2.1 Test-tail MAE and R² (mean over seeds) — **synthetic, illustrative only**

| Target | Model | MAE | R² |
| --- | --- | --- | --- |
| temp (°C) | XGBoost | **0.459** | **0.811** |
| temp | ensemble | 0.518 | 0.756 |
| temp | LSTM | 0.592 | 0.675 |
| temp | MLP | 0.635 | 0.646 |
| temp | GRU | 0.641 | 0.635 |
| rain (mm/day) | XGBoost | **2.135** | **0.023** |
| rain | ensemble | 2.190 | 0.052 |
| rain | LSTM | 2.381 | −0.105 |
| rain | GRU | 2.575 | −0.156 |
| rain | MLP | 2.698 | −0.241 |

Two honest observations, both about the *engine*, not the climate:

1. On this generator the seasonal cycle dominates, so a tree model with an explicit
   month encoding is hard to beat — exactly the kind of result a v2-style "the RNN is
   better" narrative would have hidden. The ensemble (`0.518` °C) does beat both GRU and
   MLP individually; it does not beat XGBoost.
2. Rainfall R² near zero or negative is the normal outcome for monthly precipitation at
   one grid cell, and it is stated plainly rather than dropped from the table.

### 2.2 Statistical comparison

24 model-vs-ensemble comparisons (3 locations × 2 targets × 4 candidates), each with a
5 000-resample paired bootstrap **and** Diebold–Mariano:

| Verdict | Count |
| --- | --- |
| not distinguishable | 13 |
| better (ensemble) | 8 |
| inconclusive (bootstrap and DM disagree) | 2 |
| worse (ensemble) | 1 |

The "inconclusive" state is the point: on 60 test months the two tests can disagree, and
the report says so instead of picking the friendlier one.

### 2.3 Calibrated intervals (nominal 90%)

| Model (Colombo, temp) | conformal coverage | width | Gaussian coverage | width |
| --- | --- | --- | --- | --- |
| MLP | 0.983 | 2.575 | 0.967 | — |
| GRU | 0.900 | 2.741 | 0.967 | — |
| LSTM | 0.967 | 3.382 | 0.967 | — |
| XGBoost | 0.883 | 2.087 | 0.950 | — |
| ensemble | 0.967 | 2.748 | 0.967 | — |

Mean coverage across all 30 series: **0.944 conformal vs 0.943 Gaussian**. With only 48
calibration points in the quick run the two methods are indistinguishable — the honest
reading is that *this sample is too small to separate them*, not that the Gaussian
assumption is vindicated. The full run (10 folds × 24 months = 240 calibration points)
is what would decide it.

### 2.4 Extreme rainfall

Threshold (Colombo, training 95th percentile): **10.43 mm/day**.

| Model | recall | rank-AUC |
| --- | --- | --- |
| GRU | 0.000 | 0.897 |
| ensemble | 0.000 | 0.871 |
| MLP | 0.000 | 0.835 |
| LSTM | 0.000 | 0.790 |
| XGBoost | 0.000 | 0.777 |

Recall zero with AUC ≈ 0.8–0.9 is the classic regression-to-the-mean signature: the
models rank wet months correctly but none pushes a prediction past the threshold. This is
a *finding about the models*, deliberately surfaced as a table rather than buried — a
v2-style dashboard showing only R² would have reported these models as fine.

---

## 3. Defects found **in this implementation** during verification

Recorded because they show the guards work, and because a report that lists only
successes is not an audit.

| # | Defect | Caught by | Fix |
| --- | --- | --- | --- |
| 1 | `test_split` returned an **empty training window** (`train_start == train_end == n−T`): the model was fitted on zero rows, the scaler produced NaN, and the metrics table still claimed **`n = 24` evaluated months** with blank scores | manual inspection of a printed `describe()` | `Split("test", 0, boundary, boundary, n)`; regression test `test_test_split_trains_on_all_preceding_history`; `n` now counts scored rows |
| 2 | GRU BPTT omitted the `h_{t−1}` factor in the update-gate path (`dp_r`), producing gradients ~40 % low | finite-difference test (`test_gru_gradients`) | corrected chain rule; documented as the classic silent-BPTT bug |
| 3 | `skill_score` discarded the reference vector due to a swapped tuple unpack, yielding `NaN` | `test_skill_score_against_climatology` | `_, r = _clean(...)` |
| 4 | Extreme threshold used interpolated quantiles (a value no observation took) | `test_threshold_comes_from_training_data_only` | `method="higher"` |
| 5 | MAPE on dry months | code review of `mae_daily_scale_mape` | zero band + `mape_zero_guard_used` column |
| 6 | Run summary averaged MAE across °C and mm/day | inspecting the CLI summary | keyed `target/model` |
| 7 | `n` in every metric row counted *supplied* rows, so an all-NaN run reported `n = 60` beside a blank MAE | mutation testing (see §3.1) | `n` counts rows that were actually scored |
| 8 | POWER's monthly endpoint returns **13 values per year**: `YYYY01…YYYY12` plus `YYYY13`, the *annual* aggregate. The parser fed all thirteen keys to `pd.PeriodIndex`, which rejects month 13 (`DateParseError: month must be in 1..12: 200013`). A looser parser would instead have mapped the annual mean onto December and injected a year-average into the monthly series | first real-data load (a crash, not a silent number) | `ANNUAL_MONTH_SUFFIX` is excluded before the index is built; the count is recorded as `Provenance.annual_rows_excluded`; `tests/test_data_payload.py` (6 tests) pins both the exclusion and that December keeps its own value |

### 3.1 Mutation testing — proof that the guards work

A fix without a test that fails when the fix is reverted is a comment, not a guard.
Each repair was therefore re-applied *backwards* on a copy of the package and the
suite was run again:

| Reverted fix | Suite result |
| --- | --- |
| empty test training window | **caught** — `test_test_split_trains_on_all_preceding_history` |
| GRU `dp_r` without `h_{t−1}` | **caught** — `test_gru_gradients` |
| `skill_score` swapped unpack | **caught** — `test_skill_score_against_climatology` |
| interpolated extreme quantile | **caught** — `test_threshold_comes_from_training_data_only` |
| MAPE zero guard removed | **caught** — `test_mape_reports_when_the_zero_guard_matters` |
| summary pools °C with mm/day | **initially MISSED** → `tests/test_reporting.py` added → now caught |
| `n` counts supplied rows | **initially MISSED** → now caught (2 failures) |
| month-13 annual rows kept in the monthly index (fix 8) | **caught** — 4 errors in `tests/test_data_payload.py` |
| `seed_stability` pools °C with mm/day again (grouping by model only) | **caught** — `test_rows_are_keyed_per_location_and_target` fails (1 row where 2 are required) plus 2 errors in the same class |

Two of the first seven mutations survived the first pass. That is the useful outcome: the
suite looked complete and was not. Both gaps are closed, and the tests were written
before the fix was trusted.

### 3.2 Measured size of the two numerical defects

* **GRU BPTT** — against central differences the corrected update-gate gradient
  agrees to `1.3e-10`; the buggy version is off by up to **4 429 %** on the same
  entries. It is not a rounding issue: it is a different function.
* **Empty training window** — `TrainOnlyScaler.fit` on zero rows gives `mean = NaN`,
  every prediction is NaN, and the metric row read `mae = NaN` next to `n = 24`.
  A reader would have seen a populated-looking row with nothing in it.

Defect 1 is the one that matters most: it would have produced a full, plausible,
completely meaningless set of test metrics. Nothing in the design prevented it; only
reading the numbers did. That is why the regression test now asserts the training window
directly.

---

## 4. Requirement-by-requirement status

### Implementation items

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Walk-forward CV | ✅ | `splits.py`; 4 split tests; `assert_no_overlap` |
| 2 | GRU/LSTM/MLP/XGBoost comparison | ✅ | `models.py`; identical folds in `evaluate.py` |
| 3 | GRU+LSTM+MLP ensemble | ✅ | `EnsembleModel`, equal weights, members reported |
| 4 | Calibrated prediction intervals | ✅ | `uncertainty.py`; coverage on the sealed test tail — real data §8.3, synthetic §2.3 |
| 5 | Extreme rainfall analysis | ✅ | `extreme.py`; real data §8.4 (a negative result), synthetic §2.4 |
| 6 | Multi-location Colombo/Kandy/Jaffna | ✅ | all three cities on real POWER data, 2000–2024, §8 |
| 7 | MAE, RMSE, R² + more | ✅ | `metrics.py` (7 metrics + 3 interval scores); skill-vs-climatology reported alongside §8.1 |
| 8 | Multi-seed stability | ✅ | 5 seeds × every fold, per city × target (never pooled across units); §8.5 |
| 9 | Actual-vs-predicted + comparison dashboard | ✅ | `plots.py` (10 figures/run) + `dashboard.html` |
| 10 | Export models, scalers, config, metrics, reports | ✅ | 150 model exports + 9 CSV tables + manifest + REPORT.md + dashboard (§8) |

### Scientific requirements

| Requirement | How it is enforced |
| --- | --- |
| Preprocessing fitted on training only | `TrainOnlyScaler` inside each fold; asserted in tests |
| No future observations as input | lags ≥ 1, trailing windows only; perturbation test is bit-exact |
| Identical test periods | one `Split` per (location, target) consumed by every model and seed |
| Validation clearly separated from test | separate tables, sections, and figures; never concatenated |
| Documented limitations and uncertainty | `LIMITATIONS_COMMON` printed in every report; conformal + seed bands reported |
| No superiority claim without statistics | `verdict` column requires bootstrap CI **and** DM **and** Benjamini–Hochberg across the planned family; raw and adjusted p are both reported, and "not distinguishable" is a first-class outcome |

### Critical rules

| Rule | Compliance |
| --- | --- |
| Preserve v1/v2 files | Nothing was modified outside the new `COSMORA_AI_v3/` directory |
| Separate directory | All new code lives under `COSMORA_AI_v3/` |
| Inspect the notebook before modifying | Done; it is a corrupt Vertopal export — see `docs/00_AUDIT_AND_METHODOLOGY.md` §0. No v2 file was edited |
| Never fabricate experimental results | Real POWER values only, verified against POWER's month-13 identity (§7.4); a failed request exits 2 rather than substituting; every synthetic number stays labelled SYNTHETIC |
| Chronological splits, no leakage | §3 of the audit doc; 7 leakage tests, plus the D11/D12 regression tests that pin the inner split and the fold-overlap accounting |
| Reproducible configuration | SHA-256 config hash on every artefact; two runs produced byte-identical tables (§8.0). Two configs exist — the base design and the narrower real-data run — and `derivation` lists every difference (§7.3) |

---

## 5. Limitations (carried by every report this package writes)

0. **Reported real-data results use 2000–2024 and two parameters** (`T2M`,
   `PRECTOTCORR`), not the 1985–2025 five-parameter design of `config/experiment.json`.
   §7.3 lists the difference; results from the two must not be quoted interchangeably.
1. POWER values are gridded reanalysis/satellite estimates (~0.5 × 0.625°), not station
   observations; Kandy's orography and coastal sea-breeze effects are under-resolved.
2. One-month-ahead prediction only — nothing here is a multi-year projection.
3. No nested hyper-parameter selection: scores describe a fixed, prior-knowledge
   configuration.
4. One data source, one grid cell per city; no cross-source validation against gauges.
5. Ensemble weights are equal by construction to avoid fitting on the evaluation window;
   a learned weighting is untested.
6. The independent test tail is used exactly once per configuration. Re-running with
   different settings and reporting the best tail score would invalidate it — the config
   hash exists so that this is detectable, not so that it is prevented.
7. The NumPy RNNs are correct (gradient-checked) but not tuned for speed; the full run is
   a laptop-scale computation, not an HPC one.

## 6. What would raise confidence next

* Run the full configuration against POWER and publish `run_manifest.json` alongside the
  tables so the dataset hashes are auditable.
* Add nested selection inside each fold if hyper-parameter comparison is wanted.
* Add a probabilistic baseline (climatology + gamma distribution for rainfall) — the
  ensemble should have to beat a distribution, not just a mean.
* Extend the interval evaluation to a per-month coverage curve; a single average hides
  seasonal heteroscedasticity.

---

## 7. Reproduce

```bash
cd COSMORA_AI_v3
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt

python -m unittest discover -s tests        # 79 tests incl. gradient, payload, scope and D11–D15 checks
python scripts/run_experiments.py --synthetic --quick   # engine check (~90 s)
python scripts/run_experiments.py           # real NASA POWER run
python scripts/build_notebook.py            # regenerate the notebook
```

### 7.1 Reproduce one mutation

```bash
cp -r src tests config /tmp/mut/
python - <<'PY'
import io
path = "/tmp/mut/src/cosmora_v3/nn.py"
old = "                dp_r = (d_r_times_h * h_prev) * r * (1.0 - r)"
new = "                dp_r = d_r_times_h * r * (1.0 - r)"
s = io.open(path).read(); assert s.count(old) == 1
io.open(path, "w").write(s.replace(old, new))
PY
cd /tmp/mut && PYTHONPATH=src python -m unittest discover -s tests   # must FAIL
```

### 7.2 Reproduce the month-13 guard

The 13th value in each year of a POWER monthly response is the annual aggregate.
Reverting the exclusion makes the payload tests fail:

```bash
cp -r src tests config /tmp/mut13/
python - <<'EOF'
import io
p = "/tmp/mut13/src/cosmora_v3/data.py"
s = io.open(p).read()
old = (
    "    annual_mask = frame.index.str[-2:] == ANNUAL_MONTH_SUFFIX\n"
    "    annual_rows_excluded = int(annual_mask.sum())\n"
    "    if annual_rows_excluded:\n"
    "        frame = frame.loc[~annual_mask]"
)
assert s.count(old) == 1
io.open(p, "w").write(s.replace(old, "    annual_rows_excluded = 0"))
EOF
cd /tmp/mut13 && PYTHONPATH=src python -m unittest discover -s tests   # 4 errors
```

### 7.3 The data window: what was retrieved versus what the base config asks for

`config/experiment.json` asks for **1985–2025** and five parameters
(`T2M, PRECTOTCORR, RH2M, WS2M, ALLSKY_SFC_SW_DWN`). The real-data run reported in
§2.5 could not honour that, and the gap is recorded here rather than papered over:

| Item | Base config | Retrieved and verified | Effect |
| --- | --- | --- | --- |
| Window | 1985-01 … 2025-12 (492 months) | **2000-01 … 2024-12** (300 months) | 25 years; 288 usable months after the 12-month lookback |
| Parameters | 5 | **2** (`T2M`, `PRECTOTCORR`) | smaller feature set; no humidity, wind or solar covariates |
| `cv_initial_train_months` | 180 | **120** | keeps 8 walk-forward folds instead of 3 on the shorter series |
| Sealed test tail | 60 months | 60 months | unchanged |
| Everything else | — | unchanged | seeds, models, hyper-parameters, conformal α = 0.10, extreme quantile, bootstrap, DM lag |

Why: this build sandbox has no HTTPS egress to `power.larc.nasa.gov` — the TLS
handshake is refused (`exit 35`) and no proxy is configured. The three payloads were
captured through an agent fetch tool and transcribed into
`data/cache/power_<city>_2000_2024.json`, which are **committed**, so the run is
reproducible without network access. Every payload carries its own transcription
check, described in §7.4.

The narrowed run is a **25-year, two-variable** study. It is not the 40-year,
five-variable study the base config describes, and results from one must not be quoted
as if from the other. The config that produced the reported numbers is
`config/experiment_lk_power_2000_2024.json`; its `derivation` block lists every
difference from the base file so the two cannot be confused.

### 7.4 Why the hand-transcribed payloads can be trusted

Transcription is a copy step, so it needs a check that does not depend on the
transcriber. POWER supplies one: the month-13 value is defined as the annual mean of
the twelve monthly values. If a digit is mistyped, the identity breaks.

`scripts/build_power_cache.py` verifies this for every year and every parameter
**before writing the file**, and refuses to emit a payload that fails. Result for the
committed payloads (150 station-years, 6 series):

| City | `T2M` worst \|mean(12 months) − month 13\| | `PRECTOTCORR` worst | Years passing |
| --- | --- | --- | --- |
| Colombo | 0.009 °C | 0.043 mm/day | 25 / 25 |
| Kandy | 0.012 °C | 0.048 mm/day | 25 / 25 |
| Jaffna | 0.016 °C | 0.021 mm/day | 25 / 25 |

All differences are at POWER's own reporting precision (2 decimals), i.e. rounding
level. The check is embedded in each JSON as `_cosmora_transcription_check`, and the
cache files are byte-identical when the script is re-run, so their SHA-256 digests are
stable and are quoted in `data/cache/README.md`.

What this check does *not* prove: that the payload belongs to the right coordinates.
That is covered separately — each file records the exact request URL, and the returned
`geometry.coordinates` elevation (Colombo 123.66 m, Kandy 296.6 m, Jaffna 6.95 m)
matches each city's terrain rather than a swapped site.

---

## 8. Real NASA POWER run — results

Executed `scripts/run_experiments.py --config config/experiment_lk_power_2000_2024.json`
at commit `c452a61` with a clean working tree. Config hash `a6bbe9432b389257`, data
provenance `NASA_POWER`, `scientific_results: true`, run
`run_20261117T182826Z_a6bbe9432b389257`.

* seeds 7, 21, 42, 84, 123 · 8 walk-forward folds per series · sealed test tail 60 months, evaluated once.
* 240 fold rows (5 seeds × 8 folds × 6 series), 150 test-metric rows, 150 model exports on disk.
* Training window grows 120 → 204 months; each fold scores 24 months; adjacent folds
  overlap by 12 months, and the tables below say so instead of counting those months twice.
* Total runtime 1 014 s.
* SHA-256 of the cache files actually read: `911aac86…`, `fa9ea32e…`, `ef2ea94b…`
  (Colombo, Kandy, Jaffna) — recorded in the manifest, so the data these numbers came
  from can be checked rather than assumed.

Dataset, from `run_manifest.json`:

| City | Months | First | Last | Fill-dropped | Annual rows excluded | Source |
| --- | --- | --- | --- | --- | --- | --- |
| colombo | 300 | 2000-01 | 2024-12 | 0 | 25 | cache |
| kandy | 300 | 2000-01 | 2024-12 | 0 | 25 | cache |
| jaffna | 300 | 2000-01 | 2024-12 | 0 | 25 | cache |

### 8.0 Determinism check

This run was executed twice, start to finish, from the same code and the same committed
payloads, at 18:28 and 18:45 UTC on the same machine (2 vCPU). Both runs used
`config/experiment_lk_power_2000_2024.json` (hash `a6bbe9432b389257`) and the same seeds.

All nine result tables below are **byte-identical** between the two runs:

```
metrics_test  metrics_validation  metrics_validation_instances  folds
statistical_comparisons  interval_scores  extreme_rainfall  seed_stability
location_summary
```

The two manifests record different commit ids (`c452a61` and `be8e325`) only because the
second run started after the first run's tables had been committed as evidence;
`git diff c452a61 be8e325 -- src config tests scripts` is empty. Both manifests report
`working_tree_dirty: false`, and the cache-file digests are the same three values.

So the numbers that follow are a function of code + data + seeds, not of when the run
happened. A reader who re-runs the command on the page gets these numbers, or a bug.

- folds per series: 8 (all series)
- validation: 192 forecast instances over 108 distinct months per series (overlapping folds are averaged per month, not double-counted)
- Diebold–Mariano: newey-west (bartlett) variance, lag 6, student-t, df = n-1, harvey-leybourne-newbold correction
- verdicts at alpha = 0.05, Benjamini–Hochberg within the family

### 8.1 Sealed test tail — mean over seeds

Each cell is the mean over the seeds; the ± is the seed standard deviation, which is
the honest way to read a single-seed number. `skill` is **1 − MSE/MSE(climatology)**
with the climatology taken from the training window only: **negative means the model
is worse than the training-window climatological mean**, the floor any claim has to clear.

**temp (°C)**

| City | Model | MAE | RMSE | R² | skill vs climatology |
| --- | --- | --- | --- | --- | --- |
| colombo | xgboost | 0.263 ± 0.005 | 0.327 | 0.819 | +0.605 |
| colombo | ensemble | 0.424 ± 0.043 | 0.536 | 0.511 | -0.069 |
| colombo | gru | 0.494 ± 0.050 | 0.622 | 0.343 | -0.436 |
| colombo | lstm | 0.473 ± 0.061 | 0.614 | 0.355 | -0.409 |
| colombo | mlp | 0.462 ± 0.077 | 0.579 | 0.422 | -0.262 |
| jaffna | xgboost | 0.349 ± 0.009 | 0.446 | 0.868 | +0.230 |
| jaffna | ensemble | 0.486 ± 0.045 | 0.596 | 0.764 | -0.383 |
| jaffna | gru | 0.586 ± 0.076 | 0.734 | 0.640 | -1.109 |
| jaffna | lstm | 0.491 ± 0.058 | 0.627 | 0.737 | -0.538 |
| jaffna | mlp | 0.631 ± 0.118 | 0.805 | 0.559 | -1.582 |
| kandy | xgboost | 0.471 ± 0.018 | 0.609 | 0.772 | +0.216 |
| kandy | ensemble | 0.607 ± 0.039 | 0.841 | 0.565 | -0.497 |
| kandy | gru | 0.757 ± 0.066 | 1.009 | 0.373 | -1.158 |
| kandy | lstm | 0.700 ± 0.087 | 0.958 | 0.432 | -0.955 |
| kandy | mlp | 0.659 ± 0.076 | 0.887 | 0.512 | -0.677 |

**rain (mm/day)**

| City | Model | MAE | RMSE | R² | skill vs climatology |
| --- | --- | --- | --- | --- | --- |
| colombo | xgboost | 2.722 ± 0.035 | 3.394 | 0.316 | -0.191 |
| colombo | ensemble | 2.772 ± 0.347 | 3.465 | 0.283 | -0.249 |
| colombo | gru | 2.984 ± 0.613 | 3.716 | 0.165 | -0.455 |
| colombo | lstm | 3.036 ± 0.242 | 3.829 | 0.130 | -0.516 |
| colombo | mlp | 3.051 ± 0.490 | 3.884 | 0.089 | -0.587 |
| jaffna | xgboost | 2.276 ± 0.066 | 3.247 | 0.476 | -0.097 |
| jaffna | ensemble | 2.428 ± 0.132 | 3.388 | 0.428 | -0.196 |
| jaffna | gru | 2.504 ± 0.292 | 3.422 | 0.414 | -0.226 |
| jaffna | lstm | 2.605 ± 0.054 | 3.613 | 0.350 | -0.360 |
| jaffna | mlp | 3.182 ± 0.146 | 4.165 | 0.136 | -0.807 |
| kandy | xgboost | 2.473 ± 0.078 | 3.149 | 0.319 | -0.217 |
| kandy | ensemble | 2.594 ± 0.169 | 3.222 | 0.285 | -0.277 |
| kandy | gru | 2.999 ± 0.350 | 3.703 | 0.051 | -0.696 |
| kandy | lstm | 2.719 ± 0.258 | 3.409 | 0.200 | -0.430 |
| kandy | mlp | 2.970 ± 0.366 | 3.674 | 0.061 | -0.678 |

Best test MAE per city × target, and the margin over the runner-up:

| City | Target | Best | MAE | Runner-up | MAE | Margin |
| --- | --- | --- | --- | --- | --- | --- |
| colombo | temp | xgboost | 0.263 | ensemble | 0.424 | 0.161 |
| jaffna | temp | xgboost | 0.349 | ensemble | 0.486 | 0.137 |
| kandy | temp | xgboost | 0.471 | ensemble | 0.607 | 0.136 |
| colombo | rain | xgboost | 2.722 | ensemble | 2.772 | 0.050 |
| jaffna | rain | xgboost | 2.276 | ensemble | 2.428 | 0.152 |
| kandy | rain | xgboost | 2.473 | ensemble | 2.594 | 0.120 |

### 8.2 Does the ensemble beat its members? — statistical verdicts

Two estimators of the same thing appear in this document, and they are not the same
number. §8.1 averages each seed's own MAE. Here the seeds' predictions are *averaged
first* and the error is taken once (the `ensemble_mae` / `candidate_mae` columns).
Every row compares the same estimator on both sides, on the same test months, so the
two tables must not be compared cell-to-cell.

A difference is called an improvement only when **all three** agree: a paired-bootstrap
95% CI on the MAE difference that excludes zero, a Diebold–Mariano p-value that
survives Benjamini–Hochberg adjustment across the planned comparison family, and the
bootstrap p-value that also survives it. `DM p` is raw, `DM q` adjusted; `BH q (boot)`
is the adjusted bootstrap p. When the tests disagree the verdict says so rather than
picking the convenient one.

| City | Target | Compared with | MAE ens | MAE other | Δ (ens − other) | 95% CI | DM stat | DM p | DM q | BH q (boot) | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| colombo | temp | gru | 0.391 | 0.415 | -0.024 | [-0.054, +0.006] | -0.90 | 0.3731 | 0.6323 | 0.2057 | not distinguishable |
| colombo | temp | lstm | 0.391 | 0.440 | -0.049 | [-0.081, -0.018] | -2.33 | 0.0230 | 0.0996 | 0.0168 | inconclusive (tests disagree) |
| colombo | temp | mlp | 0.391 | 0.360 | +0.031 | [-0.015, +0.081] | +0.81 | 0.4216 | 0.6323 | 0.2911 | not distinguishable |
| colombo | temp | xgboost | 0.391 | 0.260 | +0.132 | [+0.060, +0.204] | +2.18 | 0.0330 | 0.1106 | 0.0048 | inconclusive (tests disagree) |
| jaffna | temp | gru | 0.452 | 0.485 | -0.033 | [-0.081, +0.016] | -0.73 | 0.4668 | 0.6458 | 0.2911 | not distinguishable |
| jaffna | temp | lstm | 0.452 | 0.453 | -0.001 | [-0.046, +0.046] | -0.02 | 0.9856 | 0.9856 | 0.9832 | not distinguishable |
| jaffna | temp | mlp | 0.452 | 0.518 | -0.066 | [-0.137, +0.002] | -1.00 | 0.3192 | 0.6323 | 0.1478 | not distinguishable |
| jaffna | temp | xgboost | 0.452 | 0.345 | +0.107 | [+0.041, +0.173] | +3.26 | 0.0018 | 0.0220 | 0.0160 | worse |
| kandy | temp | gru | 0.565 | 0.605 | -0.041 | [-0.087, +0.009] | -1.36 | 0.1789 | 0.4294 | 0.1940 | not distinguishable |
| kandy | temp | lstm | 0.565 | 0.643 | -0.078 | [-0.122, -0.039] | -2.36 | 0.0217 | 0.0996 | 0.0048 | inconclusive (tests disagree) |
| kandy | temp | mlp | 0.565 | 0.525 | +0.040 | [-0.021, +0.102] | +0.82 | 0.4178 | 0.6323 | 0.2911 | not distinguishable |
| kandy | temp | xgboost | 0.565 | 0.466 | +0.099 | [-0.020, +0.225] | +0.95 | 0.3465 | 0.6323 | 0.2057 | not distinguishable |
| colombo | rain | gru | 2.637 | 2.657 | -0.020 | [-0.190, +0.146] | -0.16 | 0.8700 | 0.9856 | 0.9643 | not distinguishable |
| colombo | rain | lstm | 2.637 | 2.882 | -0.245 | [-0.459, -0.035] | -2.02 | 0.0479 | 0.1279 | 0.0978 | inconclusive (tests disagree) |
| colombo | rain | mlp | 2.637 | 2.625 | +0.012 | [-0.279, +0.316] | +0.06 | 0.9538 | 0.9856 | 0.9832 | not distinguishable |
| colombo | rain | xgboost | 2.637 | 2.708 | -0.071 | [-0.362, +0.226] | -0.49 | 0.6259 | 0.7906 | 0.7963 | not distinguishable |
| jaffna | rain | gru | 2.263 | 2.057 | +0.206 | [+0.060, +0.348] | +3.55 | 0.0008 | 0.0184 | 0.0269 | worse |
| jaffna | rain | lstm | 2.263 | 2.472 | -0.210 | [-0.393, -0.013] | -2.30 | 0.0249 | 0.0996 | 0.0978 | inconclusive (tests disagree) |
| jaffna | rain | mlp | 2.263 | 2.511 | -0.248 | [-0.508, -0.010] | -2.65 | 0.0103 | 0.0828 | 0.1365 | inconclusive (tests disagree) |
| jaffna | rain | xgboost | 2.263 | 2.269 | -0.006 | [-0.399, +0.374] | -0.05 | 0.9637 | 0.9856 | 0.9832 | not distinguishable |
| kandy | rain | gru | 2.448 | 2.615 | -0.167 | [-0.363, +0.035] | -2.14 | 0.0369 | 0.1106 | 0.1940 | not distinguishable |
| kandy | rain | lstm | 2.448 | 2.614 | -0.166 | [-0.316, -0.013] | -1.29 | 0.2019 | 0.4405 | 0.0978 | inconclusive (tests disagree) |
| kandy | rain | mlp | 2.448 | 2.557 | -0.109 | [-0.362, +0.155] | -0.70 | 0.4843 | 0.6458 | 0.5571 | not distinguishable |
| kandy | rain | xgboost | 2.448 | 2.452 | -0.004 | [-0.343, +0.335] | -0.02 | 0.9804 | 0.9856 | 0.9832 | not distinguishable |

Planned comparison family: **24** tests (cities × targets × members). Verdict tally: **not distinguishable** 15, **inconclusive (tests disagree)** 7, **worse** 2.
**7 verdict(s) changed** after correction: colombo temp vs lstm: better → inconclusive (tests disagree); colombo temp vs xgboost: worse → inconclusive (tests disagree); colombo rain vs lstm: better → inconclusive (tests disagree); kandy temp vs lstm: better → inconclusive (tests disagree); kandy rain vs gru: inconclusive (tests disagree) → not distinguishable; jaffna rain vs mlp: better → inconclusive (tests disagree); … and 1 more.

#### 8.2.1 What the correction did to the p-values

Same data, same seeds, same test months; only the reference distribution and the
multiplicity handling differ.

Largest raw correction (normal → t + HLN) was +98.2% at jaffna rain vs gru.

| City | Target | Compared with | DM p (pre) | DM p (now) | DM q (now) | Verdict (pre) | Verdict (now) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| colombo | temp | gru | 0.7499 | 0.3731 | 0.6323 | not distinguishable | not distinguishable |
| colombo | temp | lstm | 0.0907 | 0.0230 | 0.0996 | inconclusive (tests disagree) | inconclusive (tests disagree) |
| colombo | temp | mlp | 0.9566 | 0.4216 | 0.6323 | not distinguishable | not distinguishable |
| colombo | temp | xgboost | 0.1681 | 0.0330 | 0.1106 | not distinguishable | inconclusive (tests disagree) |
| jaffna | temp | gru | 0.6671 | 0.4668 | 0.6458 | not distinguishable | not distinguishable |
| jaffna | temp | lstm | 0.9568 | 0.9856 | 0.9856 | not distinguishable | not distinguishable |
| jaffna | temp | mlp | 0.0099 | 0.3192 | 0.6323 | better | not distinguishable |
| jaffna | temp | xgboost | 0.0539 | 0.0018 | 0.0220 | inconclusive (tests disagree) | worse |
| kandy | temp | gru | 0.0035 | 0.1789 | 0.4294 | better | not distinguishable |
| kandy | temp | lstm | 0.0499 | 0.0217 | 0.0996 | better | inconclusive (tests disagree) |
| kandy | temp | mlp | 0.6398 | 0.4178 | 0.6323 | not distinguishable | not distinguishable |
| kandy | temp | xgboost | 0.6804 | 0.3465 | 0.6323 | not distinguishable | not distinguishable |
| colombo | rain | gru | 0.0515 | 0.8700 | 0.9856 | not distinguishable | not distinguishable |
| colombo | rain | lstm | 0.0845 | 0.0479 | 0.1279 | not distinguishable | inconclusive (tests disagree) |
| colombo | rain | mlp | 0.4477 | 0.9538 | 0.9856 | not distinguishable | not distinguishable |
| colombo | rain | xgboost | 0.0025 | 0.6259 | 0.7906 | better | not distinguishable |
| jaffna | rain | gru | 0.7080 | 0.0008 | 0.0184 | not distinguishable | worse |
| jaffna | rain | lstm | 0.1842 | 0.0249 | 0.0996 | not distinguishable | inconclusive (tests disagree) |
| jaffna | rain | mlp | 0.2375 | 0.0103 | 0.0828 | not distinguishable | inconclusive (tests disagree) |
| jaffna | rain | xgboost | 0.1565 | 0.9637 | 0.9856 | not distinguishable | not distinguishable |
| kandy | rain | gru | 0.3494 | 0.0369 | 0.1106 | not distinguishable | not distinguishable |
| kandy | rain | lstm | 0.9103 | 0.2019 | 0.4405 | not distinguishable | inconclusive (tests disagree) |
| kandy | rain | mlp | 0.1511 | 0.4843 | 0.6458 | not distinguishable | not distinguishable |
| kandy | rain | xgboost | 0.0561 | 0.9804 | 0.9856 | not distinguishable | not distinguishable |

### 8.3 Calibrated prediction intervals (nominal 90%)

Split-conformal intervals are calibrated on the **distinct validation months** and then
scored on the sealed test tail. `coverage` is the fraction of test months inside the
interval: close to 0.90 is correct, far below is over-confident, far above is
needlessly wide.

| City | Target | Model | Coverage (conformal) | Mean width | Coverage (Gaussian) | Width (Gaussian) | Calibration months |
| --- | --- | --- | --- | --- | --- | --- | --- |
| colombo | temp | ensemble | 0.833 | 1.405 | 0.883 | 1.487 | 108 |
| colombo | temp | gru | 0.850 | 1.447 | 0.883 | 1.616 | 108 |
| colombo | temp | lstm | 0.900 | 1.756 | 0.900 | 1.820 | 108 |
| colombo | temp | mlp | 0.933 | 1.493 | 0.917 | 1.421 | 108 |
| colombo | temp | xgboost | 0.983 | 1.393 | 0.983 | 1.398 | 108 |
| jaffna | temp | ensemble | 0.900 | 1.791 | 0.900 | 1.911 | 108 |
| jaffna | temp | gru | 0.900 | 1.905 | 0.950 | 2.309 | 108 |
| jaffna | temp | lstm | 0.950 | 2.120 | 0.950 | 2.254 | 108 |
| jaffna | temp | mlp | 0.833 | 1.549 | 0.850 | 1.688 | 108 |
| jaffna | temp | xgboost | 0.833 | 1.327 | 0.900 | 1.519 | 108 |
| kandy | temp | ensemble | 0.883 | 2.435 | 0.900 | 2.552 | 108 |
| kandy | temp | gru | 0.850 | 2.449 | 0.900 | 2.927 | 108 |
| kandy | temp | lstm | 0.850 | 2.535 | 0.917 | 3.008 | 108 |
| kandy | temp | mlp | 0.883 | 2.211 | 0.900 | 2.339 | 108 |
| kandy | temp | xgboost | 0.883 | 1.910 | 0.933 | 2.138 | 108 |
| colombo | rain | ensemble | 0.917 | 11.575 | 0.950 | 12.846 | 108 |
| colombo | rain | gru | 0.933 | 12.273 | 0.967 | 13.035 | 108 |
| colombo | rain | lstm | 0.917 | 12.508 | 0.933 | 13.953 | 108 |
| colombo | rain | mlp | 0.917 | 12.619 | 0.917 | 12.672 | 108 |
| colombo | rain | xgboost | 0.917 | 11.506 | 0.950 | 12.611 | 108 |
| jaffna | rain | ensemble | 0.933 | 10.977 | 0.933 | 10.390 | 108 |
| jaffna | rain | gru | 0.917 | 9.457 | 0.950 | 10.681 | 108 |
| jaffna | rain | lstm | 0.950 | 10.959 | 0.950 | 11.026 | 108 |
| jaffna | rain | mlp | 0.900 | 10.363 | 0.917 | 10.685 | 108 |
| jaffna | rain | xgboost | 0.900 | 10.767 | 0.883 | 10.121 | 108 |
| kandy | rain | ensemble | 0.967 | 13.011 | 1.000 | 15.015 | 108 |
| kandy | rain | gru | 0.983 | 13.651 | 1.000 | 16.346 | 108 |
| kandy | rain | lstm | 0.967 | 13.716 | 0.983 | 16.260 | 108 |
| kandy | rain | mlp | 0.950 | 12.385 | 0.967 | 13.872 | 108 |
| kandy | rain | xgboost | 1.000 | 14.122 | 1.000 | 15.404 | 108 |

Conformal coverage ranges 0.833–1.000 against a nominal 0.90 (mean 0.911); 9 cell(s) below 0.90 and 5 above 0.95. Gaussian intervals give 0.850–1.000 (mean 0.932).

### 8.4 Extreme rainfall

Threshold = the 95th percentile of **training** rain, per city, taken with
`method="higher"` so the threshold is a value an observation actually had. An event
is a test month above it; a predicted event is a prediction above it.

| City | Model | Threshold | Observed | Predicted | Hits | Precision | Recall | rank-AUC | Underpredicted |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| colombo | ensemble | 13.33 | 6 | 0 | 0 | — | 0.00 | 0.799 | 100% |
| colombo | gru | 13.33 | 6 | 0 | 0 | — | 0.00 | 0.855 | 100% |
| colombo | lstm | 13.33 | 6 | 0 | 0 | — | 0.00 | 0.722 | 100% |
| colombo | mlp | 13.33 | 6 | 3 | 2 | 0.67 | 0.33 | 0.787 | 100% |
| colombo | xgboost | 13.33 | 6 | 0 | 0 | — | 0.00 | 0.793 | 100% |
| jaffna | ensemble | 9.65 | 7 | 0 | 0 | — | 0.00 | 0.916 | 100% |
| jaffna | gru | 9.65 | 7 | 0 | 0 | — | 0.00 | 0.949 | 100% |
| jaffna | lstm | 9.65 | 7 | 0 | 0 | — | 0.00 | 0.930 | 100% |
| jaffna | mlp | 9.65 | 7 | 5 | 1 | 0.20 | 0.14 | 0.895 | 100% |
| jaffna | xgboost | 9.65 | 7 | 4 | 2 | 0.50 | 0.29 | 0.892 | 100% |
| kandy | ensemble | 12.42 | 4 | 0 | 0 | — | 0.00 | 0.938 | 100% |
| kandy | gru | 12.42 | 4 | 0 | 0 | — | 0.00 | 0.951 | 100% |
| kandy | lstm | 12.42 | 4 | 0 | 0 | — | 0.00 | 0.888 | 100% |
| kandy | mlp | 12.42 | 4 | 1 | 1 | 1.00 | 0.25 | 0.951 | 100% |
| kandy | xgboost | 12.42 | 4 | 1 | 1 | 1.00 | 0.25 | 0.938 | 100% |

Recall across all cells: 0.00–0.33. rank-AUC (can the model *order* events above non-events, regardless of threshold): 0.722–0.951. Underprediction rate on observed events: mean 100.0%, min 100%, max 100%.

### 8.5 Multi-seed stability

Test MAE across the seeds, per city × target × model. `relative_spread` (std / |mean|)
is unit-free and is the only column comparable across cells.

| City | Target | Model | Mean MAE | Std | Min | Max | Relative spread | Seeds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| colombo | temp | ensemble | 0.424 | 0.043 | 0.382 | 0.477 | 0.102 | 5 |
| colombo | temp | gru | 0.494 | 0.050 | 0.429 | 0.539 | 0.101 | 5 |
| colombo | temp | lstm | 0.473 | 0.061 | 0.396 | 0.549 | 0.129 | 5 |
| colombo | temp | mlp | 0.462 | 0.077 | 0.379 | 0.571 | 0.167 | 5 |
| colombo | temp | xgboost | 0.263 | 0.005 | 0.258 | 0.269 | 0.017 | 5 |
| jaffna | temp | ensemble | 0.486 | 0.045 | 0.449 | 0.561 | 0.093 | 5 |
| jaffna | temp | gru | 0.586 | 0.076 | 0.498 | 0.686 | 0.129 | 5 |
| jaffna | temp | lstm | 0.491 | 0.058 | 0.408 | 0.560 | 0.118 | 5 |
| jaffna | temp | mlp | 0.631 | 0.118 | 0.550 | 0.839 | 0.186 | 5 |
| jaffna | temp | xgboost | 0.349 | 0.009 | 0.336 | 0.359 | 0.026 | 5 |
| kandy | temp | ensemble | 0.607 | 0.039 | 0.547 | 0.653 | 0.064 | 5 |
| kandy | temp | gru | 0.757 | 0.066 | 0.661 | 0.841 | 0.088 | 5 |
| kandy | temp | lstm | 0.700 | 0.087 | 0.622 | 0.825 | 0.124 | 5 |
| kandy | temp | mlp | 0.659 | 0.076 | 0.571 | 0.760 | 0.116 | 5 |
| kandy | temp | xgboost | 0.471 | 0.018 | 0.442 | 0.486 | 0.039 | 5 |
| colombo | rain | ensemble | 2.772 | 0.347 | 2.528 | 3.348 | 0.125 | 5 |
| colombo | rain | gru | 2.984 | 0.613 | 2.619 | 4.052 | 0.205 | 5 |
| colombo | rain | lstm | 3.036 | 0.242 | 2.680 | 3.328 | 0.080 | 5 |
| colombo | rain | mlp | 3.051 | 0.490 | 2.567 | 3.627 | 0.161 | 5 |
| colombo | rain | xgboost | 2.722 | 0.035 | 2.679 | 2.775 | 0.013 | 5 |
| jaffna | rain | ensemble | 2.428 | 0.132 | 2.314 | 2.634 | 0.055 | 5 |
| jaffna | rain | gru | 2.504 | 0.292 | 2.198 | 2.972 | 0.116 | 5 |
| jaffna | rain | lstm | 2.605 | 0.054 | 2.510 | 2.639 | 0.021 | 5 |
| jaffna | rain | mlp | 3.182 | 0.146 | 3.003 | 3.367 | 0.046 | 5 |
| jaffna | rain | xgboost | 2.276 | 0.066 | 2.177 | 2.337 | 0.029 | 5 |
| kandy | rain | ensemble | 2.594 | 0.169 | 2.374 | 2.779 | 0.065 | 5 |
| kandy | rain | gru | 2.999 | 0.350 | 2.660 | 3.591 | 0.117 | 5 |
| kandy | rain | lstm | 2.719 | 0.258 | 2.370 | 3.006 | 0.095 | 5 |
| kandy | rain | mlp | 2.970 | 0.366 | 2.517 | 3.402 | 0.123 | 5 |
| kandy | rain | xgboost | 2.473 | 0.078 | 2.399 | 2.580 | 0.031 | 5 |

Least stable cell: colombo rain gru (relative spread 0.205).

### 8.6 Validation folds versus the sealed test tail — does the ranking hold?

Model order by MAE, best first, in the same city × target.

| City | Target | Validation order | Test order | Top model agreed? |
| --- | --- | --- | --- | --- |
| colombo | temp | xgboost > ensemble > lstm > mlp > gru | xgboost > ensemble > mlp > lstm > gru | yes |
| jaffna | temp | xgboost > ensemble > mlp > lstm > gru | xgboost > ensemble > lstm > gru > mlp | yes |
| kandy | temp | xgboost > ensemble > lstm > mlp > gru | xgboost > ensemble > mlp > lstm > gru | yes |
| colombo | rain | ensemble > xgboost > mlp > lstm > gru | xgboost > ensemble > gru > lstm > mlp | no — top model changed |
| jaffna | rain | xgboost > ensemble > lstm > gru > mlp | xgboost > ensemble > gru > lstm > mlp | yes |
| kandy | rain | ensemble > xgboost > mlp > lstm > gru | xgboost > ensemble > lstm > mlp > gru | no — top model changed |

Top model agreed in 4 of 6 city × target cells.

### 8.7 Validation versus test, side by side (MAE)

Validation numbers are computed over **distinct out-of-fold months** (overlapping
forecast instances are averaged, never discarded — `tables/metrics_validation_instances.csv`
holds the instance-level view). The test column is the sealed 60-month tail, evaluated
once. The two columns are not interchangeable and are never averaged together.

| City | Target | Model | Validation MAE | Test MAE | Change |
| --- | --- | --- | --- | --- | --- |
| colombo | temp | ensemble | 0.336 | 0.424 | +0.087 |
| colombo | temp | gru | 0.427 | 0.494 | +0.067 |
| colombo | temp | lstm | 0.400 | 0.473 | +0.073 |
| colombo | temp | mlp | 0.419 | 0.462 | +0.044 |
| colombo | temp | xgboost | 0.279 | 0.263 | -0.017 |
| jaffna | temp | ensemble | 0.420 | 0.486 | +0.066 |
| jaffna | temp | gru | 0.571 | 0.586 | +0.015 |
| jaffna | temp | lstm | 0.509 | 0.491 | -0.018 |
| jaffna | temp | mlp | 0.479 | 0.631 | +0.152 |
| jaffna | temp | xgboost | 0.320 | 0.349 | +0.029 |
| kandy | temp | ensemble | 0.584 | 0.607 | +0.023 |
| kandy | temp | gru | 0.765 | 0.757 | -0.008 |
| kandy | temp | lstm | 0.676 | 0.700 | +0.024 |
| kandy | temp | mlp | 0.735 | 0.659 | -0.076 |
| kandy | temp | xgboost | 0.434 | 0.471 | +0.038 |
| colombo | rain | ensemble | 2.624 | 2.772 | +0.148 |
| colombo | rain | gru | 2.999 | 2.984 | -0.015 |
| colombo | rain | lstm | 2.890 | 3.036 | +0.146 |
| colombo | rain | mlp | 2.753 | 3.051 | +0.297 |
| colombo | rain | xgboost | 2.634 | 2.722 | +0.088 |
| jaffna | rain | ensemble | 2.058 | 2.428 | +0.371 |
| jaffna | rain | gru | 2.399 | 2.504 | +0.105 |
| jaffna | rain | lstm | 2.256 | 2.605 | +0.349 |
| jaffna | rain | mlp | 2.407 | 3.182 | +0.775 |
| jaffna | rain | xgboost | 1.939 | 2.276 | +0.338 |
| kandy | rain | ensemble | 2.912 | 2.594 | -0.319 |
| kandy | rain | gru | 3.483 | 2.999 | -0.484 |
| kandy | rain | lstm | 3.172 | 2.719 | -0.453 |
| kandy | rain | mlp | 3.073 | 2.970 | -0.102 |
| kandy | rain | xgboost | 2.968 | 2.473 | -0.494 |


## 9. What these results do and do not support

These are the claims the corrected run supports. Where the pre-correction document made a
stronger claim, the difference is called out in parentheses.

### 9.1 Supported

1. **One-month-ahead temperature is predictable from the previous 12 months.**
   XGBoost reaches test MAE 0.263 °C (Colombo), 0.471 °C (Kandy), 0.349 °C (Jaffna) and
   beats the training-window climatological mean with skill +0.605 / +0.216 / +0.230.
   It is first and the ensemble second in **both** validation and the sealed test tail in
   all three cities for temperature (§8.6) — the placement of the top two is not a
   selection artefact, although the order below them is not stable (MLP and LSTM swap
   places between validation and test in all three cities). These three numbers are
   identical to the pre-correction run: XGBoost uses none of the code that was fixed.
2. **The ensemble is a variance reducer, not a winner.** It is second in all six
   city × target cells, and its advantage is stability rather than accuracy: across seeds
   its relative spread is 0.084 on average (worst 0.125) against 0.126–0.133 for the
   neural members and 0.026 for XGBoost (§8.5). But averaging does not make it better than
   the best member: after Benjamini–Hochberg across the 24 planned comparisons, **no**
   comparison favours the ensemble, **2** come out `worse` (Jaffna rainfall vs GRU,
   Δ MAE +0.206 mm/day; Jaffna temperature vs XGBoost, +0.114 °C), 15 are `not
   distinguishable` and 7 are `inconclusive`. *(The pre-correction document said 4 of 24
   favoured it; that count was read off unadjusted p-values and does not survive the
   correction.)*
3. **Conformal intervals are close to calibrated on unseen data — and their failure mode
   is visible.** Against a nominal 90%, measured coverage on the sealed test tail is
   0.833–1.000 (mean 0.911) over the 30 model × city × target cells, calibrated on the
   108 distinct validation months (not the 192 overlapping fold instances). They are
   narrower than the Gaussian baseline in 27 of 30 cells and have the better Winkler
   score in 19 of 30. They are also over-confident in places: 9 of 30 cells fall below
   0.90, and 5 sit above 0.95, i.e. wider than necessary. Reporting the mean alone would
   hide both directions; §8.3 reports every cell.
4. **The pipeline is deterministic.** Two independent full runs, from the same commit and
   payloads, produced byte-identical result tables (§8.0). The numbers are a property of
   code + data + seeds, not of when the run happened.
5. **Extreme rainfall can be ranked but not flagged.** rank-AUC 0.722–0.951 means the
   models order wet months above dry months well. Recall at a fixed 95th-percentile
   threshold is 0.00–0.33, and **every** observed extreme month was under-predicted in
   every cell: the highest prediction anywhere is 14.77 mm/day against an observed
   maximum of 20.90. Ordering skill ≠ threshold skill.
6. **The corrections were verified, not assumed.** Each of the four fixes ships with a
   regression test that fails on the old code (36 new tests, 79 total), the pre-fix run is
   preserved as evidence (`docs/evidence/pre_fix_run/`), and the D11 ablation isolates its
   effect by training the same series twice under both split rules
   (`docs/evidence/nn_split_experiment/`). The measured effect of D11 on test MAE was
   −0.068 to +0.103 °C depending on the model — a correctness defect with **no consistent
   sign**, which is why it had to be fixed rather than argued about.

### 9.2 Not supported — do not write these

* **"Rainfall is predictable by this model."** Rainfall skill is negative for **every**
  model in **every** city (§8.1): the best cell is Jaffna with XGBoost at −0.097. The
  model ranking also does not survive the move from validation to test in 2 of 6 cells
  (Colombo and Kandy rainfall: the ensemble leads in validation, XGBoost in the test tail).
* **"The ensemble is superior to its members."** 0 of 24 comparisons support it, and 2
  statistically reject it (Jaffna rainfall vs GRU, q = 0.018; Jaffna temperature vs
  XGBoost, q = 0.022). *(The pre-correction document reported 1 win in 6 for the ensemble
  against XGBoost; that win was a p-value read outside its family.)*
* **"Deep learning beats gradient boosting here."** XGBoost is best in all six city ×
  target cells in validation **and** in the sealed test tail (§8.6). The neural members —
  and the ensemble built from them — have **negative** temperature skill in all three
  cities (−0.069 to −1.158 against a positive +0.216 to +0.605 for XGBoost, §8.1), and
  their seed spread is 3.6–5.1× XGBoost's (§8.5).
* **"The model is ready for operational warning."** Recall at the extreme threshold is
  0.00–0.33, every observed event is under-predicted, and the maximum predicted rainfall
  never reaches the observed maximum. §8.4 is a negative result and is reported as one.
* **"These numbers describe the full 1985–2025, five-parameter design."** They describe
  2000–2024 with two parameters (§7.3).
* **"The earlier audit's ensemble claims still hold."** They do not. Four "the ensemble is
  better" verdicts in the pre-correction document became 0 after D14 (t-reference,
  Harvey–Leybourne–Newbold) and D15 (Benjamini–Hochberg over 24 planned tests) were applied
  to the same kind of evidence. This is the clearest illustration in the package of why
  the corrections mattered: the fix did not change the data, it changed what the data was
  allowed to claim.

### 9.3 Why the negative results are trustworthy

A negative result is only worth reporting if the machinery that produced it is known to
work. Four independent lines of evidence say it does:

* **The guards were attacked.** Seven fixes were reverted one at a time; all seven are
  now caught by the suite (§3.1), including two that initially survived. A further two
  defects found during the real-data work (the month-13 annual row, §3 defect 8, and
  `seed_stability` pooling °C with mm/day) are pinned by tests as well.
* **The new fixes were attacked the same way.** Each of D11, D12, D14 and D15 has a test
  that fails on the pre-correction code: 36 tests were run against the old sources and
  fail there, and pass on the committed ones (`DEFECT_REPORT.md` §9).
* **The pipeline reproduces bit-for-bit** across two full runs at the same commit (§9.1
  item 4, §8.0).
* **The data verifies itself** — every transcribed value is checked against POWER's own
  month-13 identity, worst case 0.016 °C / 0.048 mm/day (§7.4), the committed payloads are
  re-checked by the test suite rather than trusted from the build script, and the run
  manifest records the SHA-256 of the exact cache files that were read.

### 9.4 What would change the conclusions

In descending order of expected effect:

1. **More predictors.** Two variables in, one out. Humidity, wind, solar radiation and a
   large-scale index (ENSO / IOD) are what a rainfall model is missing; the base config
   already asks for them.
2. **More years.** 25 years is 8 folds; the 40-year design gives 10 folds and more extreme
   events to score against. Serial correlation in the folds is the binding limit here.
3. **Station data.** POWER is a ~0.5° gridded product; the Kandy highlands and coastal
   sea-breeze effects are poorly resolved. Gauges would change the target, not just the
   sample.
4. **Nested model selection.** Hyper-parameters were fixed on prior knowledge and
   identical across folds; the reported scores are for a configured model, not an oracle.
   Now that early stopping actually holds out 20% of the training window (D11), an inner
   selection loop would be meaningful — it was not meaningful before.
5. **A high-resolution extreme model.** Predicting monthly mean rainfall and then
   thresholding it at the 95th percentile is the wrong tool for extremes; a separate
   event-classifier or a quantile-regression head would test the §8.4 negative result
   properly.

---

## 10. Sign-off

Every number in §8 was produced by `scripts/run_experiments.py` from the committed
payloads in `data/cache/`, on the machine and date recorded in each
`run_manifest.json`. Nothing in this document was typed from memory: §8 is generated
from the run's CSV tables by `scripts/emit_results_section.py`, and the tables are
committed under `docs/evidence/post_fix_run/tables/` (pre-correction: `pre_fix_run/`).
Re-running the generator against a different run directory produces a different §8, which
is the point — the document cannot drift from the artefacts. The synthetic engine
check in §2 is labelled as such wherever it appears, and is never mixed into §8.

Where the design asked for more than the environment could deliver, this document says
so (§7.3) instead of presenting the smaller run as the larger one.
