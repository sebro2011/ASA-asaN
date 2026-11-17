# Evidence preserved across the phase-2 corrections

This directory exists because a correction is only credible if the state it corrected is
still on the record. Everything here was produced by the code at tag
`pre-d11-d15-corrections` (commit `1bc56e2`) — before a single line of `nn.py`,
`evaluate.py`, `stats.py` or `run.py` was touched.

## `pre_fix_run/` — the run every "before" number comes from

Produced by, with no modifications to the working tree:

```
cd COSMORA_AI_v3
PYTHONPATH=src python scripts/run_experiments.py \
    --config config/experiment_lk_power_2000_2024.json --out results_pre_fix
```

* run directory name: `run_20261117T180042Z_6da3a2ceb621a903` (config hash `6da3a2ceb621a903`)
* wall clock 1529 s · 2 vCPU sandbox · seeds 7, 21, 42, 84, 123 · 8 folds per series
* data provenance `NASA_POWER`, `scientific_results: true`
* committed here: `tables/*.csv`, `run_manifest.json`, `REPORT.md`
* **not** committed: `exports/` (21 MB of weights) and `figures/` (2 MB of PNGs). Both are
  regenerable from the same command; the numbers in `tables/` are what a reader needs to
  check a claim.

Why this matters for the four defects fixed in phase 2, all visible in these files:

| Defect | Where to see it in `pre_fix_run/` |
| --- | --- |
| D11 early-stopping split collapsed to one row | not in a table — it is inside every neural fit; measured separately in `docs/evidence/nn_split_experiment/` |
| D12 overlapping folds double-counted | `tables/metrics_validation.csv` has `n = 192` on every row, while `tables/folds.csv` shows 8 folds × 24 months over 108 distinct months (192/108 = 1.78×) |
| D12 conformal calibration over duplicated months | `tables/interval_scores.csv` → `calib_n_calibration = 192` (should be 108) |
| D14 normal-approximation DM test | `tables/statistical_comparisons.csv` → `dm_p` column; compare with the corrected run's `dm_p` / `dm_q` |
| D15 no multiplicity correction | `tables/statistical_comparisons.csv` has no `dm_q` column at all — the 24 p-values were read raw |

## `pre_fix_run/../FINAL_SCIENTIFIC_AUDIT_pre_correction.md` and `DEFECT_REPORT_pre_correction.md`

Verbatim copies of the two documents as committed at `1bc56e2`. The live documents are
updated by the corrections; these snapshots keep the original claims, including the ones
that turned out to be wrong, so the difference between them can be inspected.

## How to regenerate §8 of the audit

```
python scripts/emit_results_section.py --run <run-dir> [--previous docs/evidence/pre_fix_run]
```

The `--previous` flag adds the pre/post p-value and verdict diff, which is how the D14/D15
changes are documented without hand-copying numbers.
