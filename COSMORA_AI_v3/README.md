# COSMORA AI v3.0 — Advanced Research Validation Edition

A reproducible research harness for **one-month-ahead monthly climate prediction** over
Colombo, Kandy and Jaffna, using NASA POWER data. It compares MLP, GRU, LSTM and XGBoost
against a GRU+LSTM+MLP ensemble under walk-forward validation with a sealed test tail,
calibrated prediction intervals and statistical model comparison.

Nothing in v1.0/v2.0 is modified. v3 lives entirely in this directory.

## Why a separate package rather than one notebook

The v2 notebook could not be audited after the fact — the uploaded file was a truncated
export with no cells, and its dashboard contained numbers that no code computed. v3 keeps
the science in importable modules with tests, and treats the notebook as a *view* over
those modules (`scripts/build_notebook.py` regenerates it). See
[`docs/00_AUDIT_AND_METHODOLOGY.md`](docs/00_AUDIT_AND_METHODOLOGY.md).

## Quick start

```bash
cd COSMORA_AI_v3
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt

python -m unittest discover -s tests                     # 26 tests, incl. gradient checks
python scripts/run_experiments.py --synthetic --quick    # engine check, ~90 s, NOT science
python scripts/run_experiments.py                        # real NASA POWER run
```

Open `results/<run_id>/dashboard.html` for the comparison dashboard and
`results/<run_id>/REPORT.md` for the generated narrative.

## Data policy

* Requests go to `power.larc.nasa.gov` and are cached in `data/cache/` with the exact URL,
  retrieval timestamp and a SHA-256 of the payload.
* If POWER is unreachable the run **fails with exit code 2**. No interpolation, no
  forward-fill, no synthetic stand-in.
* `--synthetic` exists only for verifying the code paths. Its output is stamped
  `data_provenance: SYNTHETIC`, `scientific_results: false`, and the dashboard carries a
  red banner saying so.

## What a run produces

```
results/<run_id>/
├── run_manifest.json      config hash, dataset hashes, seeds, versions, timings
├── REPORT.md              generated narrative (validation vs test kept apart)
├── dashboard.html         self-contained; every number interpolated from tables
├── tables/                8 CSVs: validation, test, folds, comparisons, intervals,
│                          seed stability, extremes, location summary
├── figures/               actual-vs-predicted, scatter, comparison, stability, extremes
└── exports/models/        fitted weights + scalers + feature lists, per model per seed
```

## Methodology, in one screen

* **Splits** — expanding-window walk-forward; validation never overlaps training and never
  reaches the final `test_months`, which are used once.
* **Features** — lags ≥ 1 and trailing rolling windows only; a test perturbs a future
  observation and asserts earlier rows are bit-identical.
* **Scaling** — fitted inside each fold on training rows only.
* **Intervals** — split conformal on validation residuals; empirical coverage reported on
  the test tail alongside a Gaussian band for comparison.
* **Comparison** — paired bootstrap (5 000 resamples) *and* Diebold–Mariano; a difference is
  called an improvement only when both agree, otherwise "not distinguishable".
* **Extremes** — threshold = configured quantile of *training* rainfall, in mm/day, because
  POWER's `PRECTOTCORR` is a daily rate and a monthly total would need a day-count factor.

## Status of the numbers

The pipeline is verified end to end on synthetic data in the development environment.
Real NASA POWER data was not reachable there, so **no climate metrics have been produced
yet**; `docs/FINAL_SCIENTIFIC_AUDIT.md` states exactly which claims are verified, which are
pending, and why.

## Layout

```
config/experiment.json      single source of truth (hash-stamped on every artefact)
src/cosmora_v3/
  config.py data.py features.py splits.py     inputs and leakage guards
  nn.py models.py                             NumPy MLP/GRU/LSTM + XGBoost + ensemble
  metrics.py uncertainty.py stats.py          scoring and inference
  evaluate.py extreme.py plots.py report.py run.py
scripts/                    run_experiments.py · build_notebook.py
tests/                      26 tests: splits, leakage, gradients, metrics, statistics
notebooks/COSMORA_AI_v3.ipynb   generated view over the package
docs/                       00_AUDIT_AND_METHODOLOGY.md · FINAL_SCIENTIFIC_AUDIT.md
```
