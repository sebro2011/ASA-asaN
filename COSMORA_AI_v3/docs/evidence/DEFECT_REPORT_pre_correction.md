# COSMORA AI v3.0 — full defect report

Audit date: 2026-11-17 · Branch `arena/e5eb545e-asa-asan` @ `d987e22` · Package 3.0.0
Scope: everything in `COSMORA_AI_v3/` (config, data, features, splits, models, nn,
metrics, uncertainty, stats, extreme, evaluate, plots, report, run, scripts, tests,
notebook).

This is an *independent* pass over the package after the real-data run was reported. It
looks for defects the earlier audit did not cover — methodological, provenance,
robustness and documentation — and it states which findings change a reported number and
which do not. Every claim below was produced by running the code shown in
[§6](#6-reproduce); none is inferred from reading alone.

---

## 1. Summary

| Severity | Meaning | Count |
| --- | --- | --- |
| **S1** | Silently changes what the experiment measures | 2 |
| **S2** | Changes a reported number, a claim, or the provenance record | 9 |
| **S3** | Robustness, hygiene, documentation | 10 |

Nothing found invalidates the *shape* of the reported conclusions (§4): temperature is
predictable and XGBoost is the best model; rainfall is not predictable by this design;
the ensemble is not superior. Several findings *weaken the neural-network numbers
specifically* (D11) and one of the four "ensemble better" verdicts (D14).

Defects 1–10 were found earlier and are already fixed, with tests; they are listed in
§5 so this document is a complete register rather than a delta.

---

## 2. S1 — silently changes what the experiment measures

### D11. Neural-network early stopping is driven by a single sample

`src/cosmora_v3/nn.py`, `_BaseNet.fit`:

```python
split = max(int(n * (1.0 - self.inner_val_fraction)), n - 1)
split = min(max(split, 1), n - 1) if n > 1 else n
```

`inner_val_fraction` is 0.2, so the intent is "train on 80%, hold out 20%". The `max(...)`
makes the second argument win for every `n > 10`, because `n-1 > 0.8n` whenever `n > 5`.
Result: **the inner validation set is one row** (`n=200` → split 199, validation 1;
`n=60` → split 59, validation 1).

Evidence:

* `len(history) = 13`, with `val_mse` jumping 0.698 → 0.101 → 5.1e-05 → …, the signature
  of a one-sample loss.
* With the formula corrected to `split = int(round(n * (1 - f)))`, the held-out set
  becomes 20% and the training curve changes shape.

Impact: the best-epoch snapshot is chosen by a single month's error, so early stopping is
effectively random and `patience` never binds as intended. Every MLP/GRU/LSTM number —
and the ensemble, which is their mean — is an arbitrary snapshot rather than an
early-stopped fit. Measured effect on one series (Colombo temperature, seed 7, 2 folds,
300 epochs), buggy → fixed:

| model | test MAE (buggy) | test MAE (fixed) | Δ |
| --- | --- | --- | --- |
| mlp | 0.5494 | 0.4818 | −0.068 |
| gru | 0.4736 | 0.5390 | +0.065 |
| lstm | 0.5653 | 0.5486 | −0.017 |
| ensemble | 0.3744 | 0.4771 | +0.103 |
| xgboost (unaffected) | 0.2579 | 0.2579 | 0 |

The effect has **no consistent sign**: the defect injects noise into model selection
rather than a bias in one direction. That is still a defect — it is why the neural
models move so much across seeds (§8.5 of the scientific audit) and why a single-seed
comparison between them means little.

XGBoost, the model every headline temperature claim rests on, does not use this code.

**Fix:** `split = int(round(n * (1.0 - self.inner_val_fraction)))`, clamp to `[1, n-1]`,
and assert `n - split >= 2` (a validation set of one cannot early-stop anything).
**Test to add:** fit on `n=200` and assert `0 < n - split < n/2`, plus a test that the
number of validation rows is at least 10% of `n`.

### D12. Walk-forward validation windows overlap, so months are counted as independent evidence twice

`splits.py` builds folds with `cv_validation_months = 24` and `cv_step_months = 12`. Each
fold's validation window therefore overlaps the previous one by 12 months, and
`evaluate.run_series` concatenates them:

```
folds/series = 8   scored rows = 192   distinct months = 108   duplicated rows = 84 (+78%)
```

Two consequences, both silent:

1. **Validation metrics** (`metrics_validation`, and every "validation MAE" in the
   reports) weight interior months twice as heavily as the first and last months. They
   are not a plain average over the validation period.
2. **The conformal calibration set** is the same concatenation. `calib_n_calibration =
   192` claims 192 independent residuals; only 108 distinct months exist. The finite-sample
   conformal quantile assumes exchangeable, non-duplicated points.

**Fix:** build the validation prediction vector once per model over the *union* of
validation windows (or set `cv_step_months == cv_validation_months` so folds tile
instead of overlap), and key calibration to distinct months.
**Test to add:** assert `len(val_index) == len(set(val_index))` for any config, and that
`n_calibration` equals the number of distinct validation months.

---

## 3. S2 — changes a reported number, a claim, or the provenance record

### D13. Conformal intervals miss their own 0.90 guarantee in both directions

Measured on the sealed test tail, 30 model × city × target cells:

| | value |
| --- | --- |
| coverage range | 0.817 – 1.000 |
| mean coverage | 0.924 (nominal 0.900) |
| cells below 0.90 | 6 |
| cells above 0.95 | 6 |
| worst | Kandy temperature / XGBoost **0.817** |

Split conformal promises `P(y ∈ interval) ≥ 1 − α` *under exchangeability between the
calibration data and the test point*. The calibration residuals come from 2010–2019
walk-forward folds and the test tail is 2020–2024, so the assumption does not hold and the
guarantee is void — the intervals are over-confident where the residual scale grew
(Kandy, Jaffna temperature) and needlessly wide where it shrank.

This is not a coding error, it is a **mis-stated claim**: the audit and README speak of
"calibrated intervals" as if coverage were assured. The honest statement is "empirically
close to nominal on average, not guaranteed".

**Fix (documentation, now):** describe coverage as measured, not guaranteed. **Fix
(method, later):** time-weighted or adaptive conformal (ACI), or calibrate on the most
recent folds only.

### D14. Diebold–Mariano uses a normal approximation where a t-distribution is required

`stats.diebold_mariano` computes `p = erfc(|DM| / √2)`, which is the large-sample limit.
With `n = 60` monthly observations the correct reference is `t_{n-1}` (or the
Harvey–Leybourne–Newbold small-sample correction). Measured effect across the 24
comparisons:

| comparison | DM | p (normal, as coded) | p (t₅₉) | inflation |
| --- | --- | --- | --- | --- |
| Colombo rain vs XGBoost | −3.028 | 0.0025 | 0.0037 | +48% |
| Kandy temp vs GRU | −2.923 | 0.0035 | 0.0049 | +42% |
| Jaffna temp vs MLP | −2.579 | 0.0099 | 0.0124 | +25% |
| **Kandy temp vs LSTM** | −1.961 | **0.0499** | **0.0546** | **+9.5%** |

The last row crosses 0.05. The verdict for that comparison (`better`, reported in §8.2 and
counted in §9.1 of the scientific audit) is a product of the approximation: with the
correct test it becomes `inconclusive (tests disagree)`. So **three** of the four
"ensemble better" claims survive, not four.

**Fix:** `p = 2 * t.sf(|DM|, df=n-1)` via `scipy.stats`, or implement HLN.
**Test to add:** for a symmetric loss differential with n=20, the coded p-value must
exceed the normal-approximation p-value.

### D15. Twenty-four simultaneous comparisons, no multiplicity control

`statistical_comparisons.csv` contains 24 tests (3 cities × 2 targets × 4 candidates) at
α = 0.05 each. Nothing corrects for that. Applying Benjamini–Hochberg to the bootstrap
p-values:

```
comparisons = 24   raw p < 0.05: 6   BH q ≤ 0.05: 6   marginal rows: 0
"better" verdicts surviving BH: 4 of 4
```

So in *this* run no claim depends on the correction — but a run with 20 marginal effects
would produce false positives and nothing in the code would notice. Report the mechanism
as missing; the conclusions stand.

### D16. `config_hash` covers presentation settings, and misses the ones that matter

`config.py::_canonical` hashes everything except keys starting with `_`. Measured:

```
baseline                      6da3a2ceb621a903
output.figures = false        7fdd5264f8a3bd45   <- identical science
description edited            8f7b331e92f38063   <- prose only, no science at all
```

Two runs with identical predictions are therefore declared incomparable, while the one
thing that genuinely changes the model — the epoch override of a `--quick` run — is *not*
in the hash at all (D17). The hash is measuring the wrong set of fields.

**Fix:** hash a whitelist of scientific sections (`seeds, locations, power, targets,
features, splits, models, uncertainty, extreme, evaluation`) and record presentation
settings separately.

### D17. A reduced-epoch run reports the hash of the full configuration

`run_experiments.py --quick` (and any `epochs_override`) calls `_with_epochs`, which
recomputes a hash for the reduced config, but `run()` writes `config["config_hash"]` —
the untouched one — into the manifest, the report, the dashboard footer and every
exported artefact:

```
hash written to the manifest : 6da3a2ceb621a903
hash of the config used      : 81e0a3efdee61f47
epochs in file / run         : 300 / 40
```

`REPORT.md` compounds it: it prints `quick mode: True` and the seed list, but nothing
about folds actually run or the epoch budget ([`folds_executed`] is also `null` in a full
run, which reads as "unknown"). A reader cannot tell a 40-epoch smoke run from the
300-epoch run it claims to be.

**Fix:** write the *effective* config (post-override) into the run directory and hash
that; print `epochs`, `folds_executed` and `max_folds` in `REPORT.md`.

### D18. `payload_sha256` is not a digest of any file a reader can check

`fetch_location` hashes the raw response text on a cold fetch, but on a cache hit it
hashes `json.dumps(payload, sort_keys=True)` of the re-serialised object. The three
values for the *same* payload:

```
sha256(file bytes on disk)      911aac866cb35ef2b6b512db140df0c9…
sha256(json.dumps sort_keys)    443d6d9b86057bde1d6b724ef06d2ef4…   <- what the manifest reports
sha256(compact separators)      cd3011db08b19d8ca736c584dd2a0336…
```

`data/cache/README.md` publishes the *first* digest; the manifest publishes the second.
Neither can be used to verify the other, and re-serialising the payload (which `fetch`
does anyway, by adding `_cosmora_retrieved_utc`) changes the hash. A provenance digest
that cannot be recomputed by a third party is decoration.

**Fix:** hash the bytes on disk in both paths (`hashlib.sha256(path.read_bytes())` after
writing), and store the digest next to the file.

### D19. The cache key encodes the window but not the request

`_cache_path` builds `power_<id>_<start>_<end>.json` from the window only:

```
2 parameters, community=RE : power_colombo_2000_2024.json
3 parameters, community=AG : power_colombo_2000_2024.json
```

A cache written for one request is served to a different one. Today it fails loudly —
`_frame_from_payload` raises when a requested parameter is absent — but only in that
direction: an *extra* parameter in the payload, or a different `community`/source with
the same variables, is served silently. The provenance record then describes a request
that was never made.

**Fix:** include a hash of (parameters, community, base_url) in the filename, or store a
request signature inside the payload and verify it on read. **Test:** two configs that
differ only in `community` must not share a cache file.

### D20. Lag and rolling features are positional, so one missing month shifts every lag

`features.build_features` uses `Series.shift(k)` and `rolling(w)` on a calendar-indexed
frame. Pandas shifts **by row**, not by calendar month. The pipeline explicitly supports
dropping fill months (`data.py` drops the whole month), so this is a live path:

```
2020-08 value (what lag-1 must return for 2020-09): 16.2836
full record   lag1 for 2020-09                   : 16.2836
one month missing (2020-08 dropped)              : 14.9239   <- lag-1 silently became lag-2
```

`t2m_roll12_mean` similarly spans 13 calendar months after a gap. Every downstream number
would be quietly wrong, with no error and no flag.

The reported run is unaffected (`dropped_months = 0` for all three cities), which is
exactly why it went unnoticed.

**Fix:** reindex to a complete monthly range before shifting (`asfreq("MS")`), so a
missing month produces NaN and the row is dropped rather than silently mis-lagged; or
build lags from an explicit period offset. **Test:** inject a missing month and assert
`lag1` equals the value one calendar month back.

### D21. Configuration validation leaves the expensive failure modes open

`validate_config` checks ranges and cross-section consistency, but four holes are open and
each produces a run that looks complete:

| input | behaviour |
| --- | --- |
| location missing `lat` | raw `KeyError: 'lat'`, not a `ConfigError` with a message |
| `splits.test_months = 0` | **accepted**; `test_split` returns an empty tail; `run_series` completes and writes an all-NaN test table with `n = 0`, still stamped `scientific_results: true` |
| `cv_step_months = 1` with a 24-month horizon | accepted; 200-fold overlap, no warning (see D12) |
| `power` window 1985–2025 against a 300-month cache | accepted; the window is validated against the config's own arithmetic, never against the data actually loaded |

The `test_months = 0` case is the same family as defect 1 (empty training window) and was
supposed to be closed by it: the guard was added on the training side only.

**Fix:** require `test_months ≥ 12`, `cv_step_months ≥ 1` *and* warn when step < horizon,
validate required location keys, and assert the loaded frame length matches the configured
window (or record the mismatch explicitly in the manifest).

---

## 4. S3 — robustness, hygiene, documentation

| # | Defect | Evidence | Note |
| --- | --- | --- | --- |
| D22 | Duplicate months are accepted silently | 55 rows for 40 distinct months → `X` has 43 rows; no de-duplication | one duplicated month becomes two training rows |
| D23 | Constant series produce NaN metrics with no warning | constant `t2m` → `X=(48, 25)`, `r2`/`skill` NaN by construction | acceptable, but a guard would be cheaper than a reader noticing |
| D24 | `interval_score` cleans lower/upper independently | `_clean(y, lower)` and `_clean(y, upper)` | latent misalignment if only one bound is NaN |
| D25 | `mae_daily_scale_mape` named for a daily quantity, applied to monthly values; divide-by-`max(|y|,1e-3)` still explodes | code + docstring | the guard flag is honest; the metric itself is not usable on dry months |
| D26 | Documentation says skill = 1 − MAE/MAE_ref; the code computes 1 − MSE/MSE_ref | illustrative: 0.4545 (code) vs 0.4000 (text) | the audit's §8.1 sentence must be corrected |
| D27 | `REPORT.md` prints `scientific results: True` (Python bool) and omits folds/epochs | generated report | see D17 |
| D28 | Notebook is generated but never executed anywhere | `scripts/build_notebook.py`, no CI step | 15 code cells can rot silently; the CLI is the only tested path |
| D29 | `XGBoostModel` hardcodes `n_jobs=4`; `EnsembleModel.fit` refits its members instead of reusing the standalone fits | `models.py` | ≈3× wasted compute; results identical only because the seeds are deterministic |
| D30 | `_download` validates a response by the substring `"parameter"` and sends no `User-Agent`; the cache has no TTL | `data.py` | a malformed JSON body containing that word would be cached as data |
| D31 | 240 ruff findings: 155 `UP006`, 30 `UP035`, 7 unused `noqa`, 2 scripts with a shebang but no executable bit (`EXE001`) | `ruff check src scripts tests` | all style modernisation; **no** unused imports, bare `except`, or undefined names |

### Checked and found correct (not defects)

Recording these matters as much as the list above:

* **No leakage found.** Lags and rolling windows are shifted ≥ 1 month; the scaler is
  fitted per fold on `X[train]`; `time_index` is a deterministic calendar feature; the
  target column never appears in its own features. Tests assert all of it.
* **Extreme threshold** uses `method="higher"` on training data only — no interpolation,
  no test-period contamination.
* **Climatology reference** for `skill_vs_climatology` is the training-window
  month-of-year mean, not the test mean.
* **Determinism** holds: three complete runs of the same config produced identical test
  tables (`temp/xgboost 0.361`, `temp/ensemble 0.4711`, `rain/ensemble 2.3384`, …).
* **No secrets.** `api_key|apikey|bearer|authorization` does not occur anywhere in the
  package; POWER is keyless and the request URL carries only coordinates, window and
  parameters.
* **Month-13 handling** (defect 8) is correct and covered by tests on the committed
  payloads.
* **The transcription check** on the committed payloads recomputes cleanly from the file
  contents (worst 0.016 °C / 0.048 mm/day over 150 station-years).

---

## 5. Previously found, already fixed (register)

| # | Defect | Fixed in |
| --- | --- | --- |
| 1 | empty training window on the sealed tail (model fitted on zero rows, `n=24` reported) | `e519593` |
| 2 | GRU BPTT missing the `h_{t−1}` factor in `dp_r` (4429% gradient error) | `e519593` |
| 3 | `skill_score` swapped unpack → `-inf` | `e519593` |
| 4 | extreme threshold from interpolated quantile | `e519593` |
| 5 | unguarded MAPE on dry months | `e519593` |
| 6 | run summary pooled °C with mm/day | `e519593` |
| 7 | `n` counted supplied rows, not scored rows | `e519593` |
| 8 | POWER's month-13 annual row parsed as a month | `d987e22` |
| 9 | `seed_stability` pooled °C with mm/day | `d987e22` |
| 10 | manifest reported configured locations as executed | `d987e22` |

Mutation testing (revert each fix, confirm the suite fails) covers 1–9; 10 is covered by
`tests/test_reporting.py::ManifestScopeTests`.

---

## 6. Reproduce

```bash
cd COSMORA_AI_v3
python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt

python -m unittest discover -s tests          # 43 tests, all passing today
python scripts/run_experiments.py --config config/experiment_lk_power_2000_2024.json

python - <<'PY'   # D11: the inner validation set is one row
import numpy as np
from cosmora_v3.nn import MLPRegressor
n = 200; f = 0.2
print("inner validation rows:", n - min(max(max(int(n*(1-f)), n-1), 1), n-1))   # 1
PY

python - <<'PY'   # D12 / D13 / D14 / D15 read the run's own tables
import pandas as pd
from pathlib import Path
run = sorted(Path("results").glob("run_*"))[-1]
folds = pd.read_csv(run / "tables" / "folds.csv")
one = folds[(folds.location == "colombo") & (folds.target == "temp") & (folds.seed == 7)]
rows = sum(int(f.eval_end - f.eval_start) for _, f in one.iterrows())
months = len({m for _, f in one.iterrows() for m in range(int(f.eval_start), int(f.eval_end))})
print("validation rows:", rows, "distinct months:", months)        # 192 / 108
iv = pd.read_csv(run / "tables" / "interval_scores.csv")
print("coverage:", iv.coverage_conformal.min(), iv.coverage_conformal.max())  # 0.817 / 1.0
PY
```

D20 (positional lags), D21 (validation holes), D16 (hash scope) and D19 (cache key) are
reproduced in the probe script quoted inline in each section.

---

## 7. What this changes about the reported results

| Reported claim | Status after this audit |
| --- | --- |
| XGBoost is best for temperature (MAE 0.263 / 0.471 / 0.349 °C) | **unchanged** — XGBoost does not use the affected code, and the ordering is identical in validation and test |
| Rainfall is not predictable by this design | **unchanged and strengthened** — the neural models, which the audit already called unreliable, carry an additional defect (D11) |
| The ensemble is not superior to XGBoost | **unchanged**; one of its four supporting verdicts (Kandy temperature vs LSTM) becomes `inconclusive` under the correct DM test (D14) |
| Conformal intervals are calibrated (coverage 0.817–1.000) | **unchanged as a measurement, reworded as a claim** — this is an empirical coverage, not a guarantee (D13) |
| Validation MAE is the average over the validation period | **corrected** — it is a 24-month-window average over overlapping folds, weighting some months twice (D12) |
| `--quick` runs are comparable to full runs by hash | **withdrawn** — the hash identifies the wrong config (D17) |

None of the S1/S2 findings changes the direction of the study. They change how much
weight the neural numbers and the "calibrated" wording can carry.

---

## 8. Recommended order of work

1. **D11** (one-line fix + test) — every neural number in the package is currently an
   arbitrary snapshot. Re-run afterwards; expect the neural scores to move.
2. **D12** (tile the folds, or deduplicate the validation union) — this changes validation
   MAE and interval widths everywhere.
3. **D14 + D15** (t-distribution, BH) — cheap, and they make the comparison table
   defensible.
4. **D17 + D16 + D18** (provenance) — an audit trail that cannot be recomputed is worse
   than none, because it looks like one.
5. **D20 + D19 + D21** (latent correctness) — no effect on today's numbers, full effect on
   the next dataset.
6. **D13** (adaptive conformal) and the S3 items as hygiene.
