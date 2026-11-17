#!/usr/bin/env python3
"""Generate ``notebooks/COSMORA_AI_v3.ipynb`` from a single source of truth.

The notebook is a thin, readable view over the package: each cell performs one step
and prints what it produced. Keeping the notebook generated means it cannot drift
from the modules — if a function signature changes, this script is the thing that
must be updated, and the notebook follows automatically.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "notebooks" / "COSMORA_AI_v3.ipynb"

CELLS: list[tuple[str, str]] = [
    ("markdown", """# COSMORA AI v3.0 — Advanced Research Validation Edition

**What this notebook is.** A reproducible research harness for one-month-ahead monthly
climate prediction over three Sri Lankan cities, comparing MLP, GRU, LSTM, XGBoost and a
GRU+LSTM+MLP ensemble with walk-forward validation, a sealed test tail, calibrated
prediction intervals and statistical model comparison.

**Two rules that shape everything below**

1. *No fabricated numbers.* Every figure is printed from a computed table. A run whose
   data did not come from NASA POWER is stamped `SYNTHETIC` and refuses to present itself
   as a scientific result.
2. *Validation is not test.* The walk-forward folds produce one set of numbers; the
   held-out tail produces another, exactly once. They are never merged in a table.

Run order: config → data → features → splits → models → uncertainty → extremes →
statistics → artefacts."""),
    ("markdown", "## 1 · Setup"),
    ("code", """import sys, json
from pathlib import Path

ROOT = Path.cwd().parent if Path.cwd().name == "notebooks" else Path.cwd()
sys.path.insert(0, str(ROOT / "src"))

from cosmora_v3.config import load_config
from cosmora_v3.data import load_dataset, DataUnavailable
from cosmora_v3.features import build_features
from cosmora_v3.splits import walk_forward_splits, test_split
from cosmora_v3.evaluate import run_series
from cosmora_v3.extreme import analyse as analyse_extremes
from cosmora_v3.plots import actual_vs_predicted
import pandas as pd, numpy as np

pd.set_option("display.width", 140)
pd.set_option("display.max_columns", 30)

config = load_config(ROOT / "config" / "experiment.json")
print("config hash:", config["config_hash"])
print("seeds:", config["seeds"])
print("locations:", [loc["id"] for loc in config["locations"]])"""),
    ("markdown", """## 2 · Data acquisition (NASA POWER)

Cached responses are reused; a failed request raises `DataUnavailable` rather than
substituting values. To verify the engine without internet, run the CLI with
`--synthetic` — the notebook deliberately does not offer that switch, because a
notebook with no visible provenance banner is how fabricated results get cited."""),
    ("code", """try:
    frames, provenance = load_dataset(config)
except DataUnavailable as exc:
    raise SystemExit(f"NASA POWER unreachable — no analysis performed.\\n{exc}")

audit = pd.DataFrame([p.as_dict() for p in provenance])
display(audit[["location_id", "source", "first_month", "last_month", "rows", "dropped_months"]])"""),
    ("markdown", "## 3 · Feature build + leakage assertions\n\nA row for month *t* may only contain information available at the end of *t-1*. The cell asserts that, rather than asserting it in prose."),
    ("code", """loc_id = config["locations"][0]["id"]
target = "temp"
X, y, spec = build_features(frames[loc_id], config, target)
print(f"{loc_id}/{target}: X={X.shape}, y={y.shape}, features={len(spec.columns)}")
print("feature names:", spec.columns[:6], "…")
assert np.isfinite(X.to_numpy()).all(), "non-finite feature values"
assert spec.target_column not in spec.columns, "target leaked into its own features"
print("leakage checks passed")"""),
    ("markdown", "## 4 · Chronological splits"),
    ("code", """test = test_split(len(y), config)
folds = walk_forward_splits(len(y), config)
print("test tail:", test.describe())
display(pd.DataFrame([f.describe() for f in folds]))"""),
    ("markdown", """## 5 · Train every model on every fold, then once more on the sealed test tail

Cost note: the full configuration is 3 locations × 2 targets × 5 seeds × (10 folds + 1)
× 5 models. Reduce `seeds`, `max_folds` or `epochs` while exploring, and record that you
did — a reduced run has a different config hash, so its numbers will not be confused
with the full one."""),
    ("code", """result = run_series(
    frames[loc_id], loc_id, target, config,
    seeds=config["seeds"][:2],   # exploration only; the report uses all seeds
    log=print,
)
print(f"elapsed: {result.elapsed_seconds:.1f}s")"""),
    ("markdown", "## 6 · Validation metrics (walk-forward, out-of-fold)"),
    ("code", """val = result.metrics_validation.copy()
display(val.groupby("model")[["mae", "rmse", "r2", "bias"]].mean().round(4))"""),
    ("markdown", "## 7 · Independent test tail (used once)"),
    ("code", """test_metrics = result.metrics_test.copy()
display(test_metrics.groupby("model")[["mae", "rmse", "r2", "bias", "skill_vs_climatology"]].mean().round(4))"""),
    ("markdown", """## 8 · Calibrated prediction intervals

Calibration residuals come from the validation folds only. Coverage is then measured on
the test tail — the number that shows whether "90% intervals" means anything."""),
    ("code", """intervals = pd.DataFrame([
    {"model": name, **scores, **{f"calib_{k}": v for k, v in result.intervals[name].describe().items()}}
    for name, scores in result.interval_scores.items()
])
display(intervals[[
    "model", "nominal_coverage", "coverage_conformal", "width_conformal",
    "coverage_gaussian", "width_gaussian", "winkler_conformal", "seed_band_mean_width",
]].round(3))"""),
    ("code", """from pathlib import Path
from IPython.display import Image

fig_dir = Path("figures"); fig_dir.mkdir(exist_ok=True)
mean_preds = {name: np.mean(list(per_seed.values()), axis=0) for name, per_seed in result.predictions.items()}
band = result.intervals["ensemble"].interval(mean_preds["ensemble"])
path = actual_vs_predicted(
    result.dates, result.y_true,
    {"ensemble": mean_preds["ensemble"], "xgboost": mean_preds["xgboost"]},
    band, f"{loc_id} · {target} · sealed test tail", result.unit,
    fig_dir / f"nb_actual_vs_predicted_{loc_id}_{target}.png",
)
Image(filename=str(path))"""),
    ("markdown", "## 9 · Extreme rainfall\n\nThreshold is the configured quantile of **training** rainfall, in mm/day, so an event is a value that actually occurred before the test period."),
    ("code", """frame = frames[loc_id]
dates = set(result.dates)
aligned = frame.loc[frame.index.strftime("%Y-%m").isin(dates)]
pre_test = frame.loc[~frame.index.strftime("%Y-%m").isin(dates)]
point = mean_preds["ensemble"]

extremes = analyse_extremes(pre_test["rain"].to_numpy(), aligned["rain"].to_numpy(), point, config["extreme"]["quantile"])
display(pd.DataFrame([extremes]).T.rename(columns={0: "value"}).round(3))"""),
    ("markdown", "## 10 · Statistical comparison\n\nA model is called better only when the paired bootstrap interval excludes zero **and** Diebold–Mariano does not reject equal loss."),
    ("code", """from cosmora_v3.stats import summarise_comparison
from cosmora_v3.metrics import mae

errors = {name: np.abs(np.mean(list(per.values()), axis=0) - result.y_true) for name, per in result.predictions.items()}
rows = []
for name in ("mlp", "gru", "lstm", "xgboost"):
    delta, dm, verdict = summarise_comparison(
        errors["ensemble"], errors[name],
        resamples=config["evaluation"]["bootstrap_resamples"],
        seed=config["evaluation"]["bootstrap_seed"],
        max_lag=config["evaluation"]["dm_max_lag"],
    )
    rows.append({"candidate": name, "ensemble_mae": mae(result.y_true, mean_preds["ensemble"]),
                 "candidate_mae": mae(result.y_true, mean_preds[name]),
                 "delta": delta["delta"], "ci_low": delta["ci_low"], "ci_high": delta["ci_high"],
                 "dm_p": dm["p_value"], "verdict": verdict})
display(pd.DataFrame(rows).round(4))"""),
    ("markdown", "## 11 · Seed stability"),
    ("code", """spread = result.metrics_test.groupby("model").agg(
    mae_mean=("mae", "mean"), mae_std=("mae", "std"), mae_min=("mae", "min"), mae_max=("mae", "max")
)
spread["relative_spread"] = spread["mae_std"] / spread["mae_mean"]
display(spread.round(4))"""),
    ("markdown", "## 12 · Full experimental run and artefacts\n\nSwitches to the CLI so the heavy run happens once and every artefact lands in a timestamped directory."),
    ("code", """import subprocess, sys
summary = subprocess.run(
    [sys.executable, str(ROOT / "scripts" / "run_experiments.py")],
    capture_output=True, text=True,
)
print(summary.stdout[-4000:])
print(summary.stderr[-2000:])
print("exit code:", summary.returncode)"""),
    ("markdown", "## 13 · Limitations to carry into any write-up"),
    ("code", """from cosmora_v3.run import LIMITATIONS_COMMON
for item in LIMITATIONS_COMMON:
    print("•", item)"""),
    ("markdown", """---

### Reading the results honestly

* A table column marked `validation` answers "did the method work while being developed?"
* A column marked `test` answers "did it work on months it had never seen?" — the one that counts.
* If the bootstrap interval for a model difference spans zero, the correct sentence is
  "no detectable difference on this sample", not "model A beats model B".
* Interval coverage far from nominal means the intervals are decorative, whatever their width."""),
]


def build() -> Path:
    cells = []
    for kind, source in CELLS:
        if kind == "markdown":
            cells.append({"cell_type": "markdown", "metadata": {}, "source": source.splitlines(keepends=True)})
        else:
            cells.append({
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": source.splitlines(keepends=True),
            })
    notebook = {
        "cells": cells,
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python", "version": "3.11"},
            "cosmora": {"version": "3.0.0", "generated_by": "scripts/build_notebook.py"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(notebook, indent=1), encoding="utf-8")
    return OUT


if __name__ == "__main__":
    path = build()
    notebook = json.loads(path.read_text(encoding="utf-8"))
    print(f"wrote {path} — {len(notebook['cells'])} cells "
          f"({sum(1 for c in notebook['cells'] if c['cell_type'] == 'code')} code)")
