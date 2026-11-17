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

python -m unittest discover -s tests                     # 35 tests, incl. gradient + payload checks
python scripts/run_experiments.py --synthetic --quick    # engine check, ~90 s, NOT science
python scripts/run_experiments.py --config config/experiment_lk_power_2000_2024.json   # real NASA POWER run
```

Open `results/<run_id>/dashboard.html` for the comparison dashboard and
`results/<run_id>/REPORT.md` for the generated narrative.

## Data policy

* Requests go to `power.larc.nasa.gov` and are cached in `data/cache/` with the exact URL,
  retrieval timestamp and a SHA-256 of the payload.
* If POWER is unreachable the run **fails with exit code 2**. No interpolation, no
  forward-fill, no synthetic stand-in.
* The monthly endpoint returns **thirteen** values per year: `YYYY01…YYYY12` plus
  `YYYY13`, the annual aggregate. The thirteenth value is excluded before the month index
  is built, and the count is recorded in the provenance. Keeping it would inject a
  year-mean into a monthly series — see `tests/test_data_payload.py`.
* The three committed payloads in `data/cache/` (Colombo, Kandy, Jaffna, 2000–2024) are
  the source data of the real run. They were captured through a fetch tool and
  transcribed, so each carries a per-value transcription check — POWER's month-13 value
  must equal the mean of the twelve transcribed months. See
  [`data/cache/README.md`](data/cache/README.md).
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

## Two configs, and why

`config/experiment.json` is the full design: 1985–2025, five POWER parameters, 8 folds on
40 years. `config/experiment_lk_power_2000_2024.json` is the configuration that actually
produced the reported real-data numbers: 2000–2024, two parameters (`T2M`,
`PRECTOTCORR`), 120-month initial training to keep 8 folds on the shorter series. Its
`derivation` block lists every difference, and the gap between the two is written up in
[`docs/FINAL_SCIENTIFIC_AUDIT.md`](docs/FINAL_SCIENTIFIC_AUDIT.md) §7.3. Quote results
against the config that produced them.

## Status of the numbers

Real NASA POWER data has been run: 3 cities × 2 targets × 5 seeds × 8 walk-forward
folds plus a sealed 60-month test tail, in 1 218 s. Headline result, honestly stated:

* **Temperature** is predictable one month ahead — XGBoost test MAE 0.263 / 0.471 /
  0.349 °C (Colombo / Kandy / Jaffna), skill vs climatology +0.61 / +0.22 / +0.23.
* **Rainfall is not**, by this design: skill is negative in half of the cells and the
  validation winner changes on the sealed test tail in all three cities.
* **The ensemble is comparable but not superior** to XGBoost: 1 of 6 comparisons favours
  it (Colombo rainfall), 1 is inconclusive, 4 are not distinguishable. No superiority
  claim is made.
* **Extreme rainfall is ranked but not detected** — rank-AUC 0.79–0.99, recall 0.00–0.33.

The full tables, verdicts and the list of claims these results do **not** support are in
[`docs/FINAL_SCIENTIFIC_AUDIT.md`](docs/FINAL_SCIENTIFIC_AUDIT.md) §8–§9. The synthetic
engine check is §2 and is labelled as such. The data window actually used (2000–2024, two
parameters) differs from the base config's 1985–2025 five-parameter design; §7.3
enumerates the difference.

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
