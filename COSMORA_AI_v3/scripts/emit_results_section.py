#!/usr/bin/env python3
"""Regenerate §8 of ``docs/FINAL_SCIENTIFIC_AUDIT.md`` from a run directory.

Why this exists: the audit's results section used to be copied out of a run by hand.
Every correction that changed a number therefore left the document stale, and a stale
number in an audit is worse than a missing one. This script reads the CSV tables a run
writes and emits the same section, so updating the document is a command, not a
transcription exercise.

    python scripts/emit_results_section.py --run results/run_2026...
    python scripts/emit_results_section.py --run results/run_2026... --previous <dir> --out /tmp/s8.md

``--previous`` adds a column-level diff of the statistical verdicts, which is how the
D14/D15 corrections are shown to have changed (or not changed) a conclusion.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

TARGET_UNIT = {"temp": "°C", "rain": "mm/day"}
TARGET_LABEL = {"temp": "temperature", "rain": "rainfall"}
MODEL_ORDER = ["xgboost", "ensemble", "gru", "lstm", "mlp"]


def _load(run_dir: Path, name: str) -> pd.DataFrame:
    path = run_dir / "tables" / f"{name}.csv"
    return pd.read_csv(path) if path.exists() else pd.DataFrame()


def _fmt(value: Any, digits: int = 3, signed: bool = False) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "—"
    if pd.isna(number):
        return "—"
    if signed:
        return f"{number:+.{digits}f}"
    return f"{number:.{digits}f}"


def _table(header: List[str], rows: List[List[str]]) -> str:
    lines = ["| " + " | ".join(header) + " |", "| " + " | ".join("---" for _ in header) + " |"]
    lines += ["| " + " | ".join(row) + " |" for row in rows]
    return "\n".join(lines)


def _sort(frame: pd.DataFrame, by: List[str]) -> pd.DataFrame:
    """Sort with temperature before rain, then by the given keys."""
    frame = frame.copy()
    keys: List[str] = []
    if "target" in frame.columns:
        frame["_target_order"] = frame["target"].map({"temp": 0, "rain": 1}).fillna(2).astype(int)
        keys.append("_target_order")
    keys += [c for c in by if c in frame.columns]
    return frame.sort_values(keys).drop(columns=["_target_order"], errors="ignore")


def _order(models: List[str]) -> List[str]:
    known = [m for m in MODEL_ORDER if m in models]
    return known + sorted(set(models) - set(known))


def _cells(frame: pd.DataFrame) -> List[tuple]:
    """(location, target) pairs, temperature first, in sorted location order."""
    keys = set(zip(frame["location"], frame["target"]))
    return sorted(keys, key=lambda item: (item[1] != "temp", item[0]))


def section_test_tail(test: pd.DataFrame) -> List[str]:
    lines = [
        "### 8.1 Sealed test tail — mean over seeds",
        "",
        "Each cell is the mean over the seeds; the ± is the seed standard deviation, which is",
        "the honest way to read a single-seed number. `skill` is **1 − MSE/MSE(climatology)**",
        "with the climatology taken from the training window only: **negative means the model",
        "is worse than the training-window climatological mean**, the floor any claim has to clear.",
        "",
    ]
    for target in ("temp", "rain"):
        subset = test[test["target"] == target]
        if subset.empty:
            continue
        lines += [f"**{target} ({TARGET_UNIT[target]})**", ""]
        rows = []
        for location in sorted(subset["location"].unique()):
            for model in _order(subset[subset["location"] == location]["model"].unique().tolist()):
                cell = subset[(subset["location"] == location) & (subset["model"] == model)]
                rows.append([
                    location, model,
                    f"{_fmt(cell['mae'].mean())} ± {_fmt(cell['mae'].std(ddof=1))}",
                    _fmt(cell["rmse"].mean()),
                    _fmt(cell["r2"].mean()),
                    _fmt(cell["skill_vs_climatology"].mean(), signed=True)
                    if "skill_vs_climatology" in cell else "—",
                ])
        lines += [_table(["City", "Model", "MAE", "RMSE", "R²", "skill vs climatology"], rows), ""]

    means = test.groupby(["location", "target", "model"])["mae"].mean().reset_index()
    rows = []
    for location, target in _cells(means):
        cell = means[(means["location"] == location) & (means["target"] == target)]
        ranked = cell.sort_values("mae")
        best, runner = ranked.iloc[0], ranked.iloc[1]
        rows.append([
            location, target, best["model"], _fmt(best["mae"]), runner["model"],
            _fmt(runner["mae"]), _fmt(float(runner["mae"]) - float(best["mae"])),
        ])
    lines += [
        "Best test MAE per city × target, and the margin over the runner-up:",
        "",
        _table(["City", "Target", "Best", "MAE", "Runner-up", "MAE", "Margin"], rows),
        "",
    ]
    return lines


def section_comparisons(comp: pd.DataFrame, previous: Optional[pd.DataFrame]) -> List[str]:
    lines = [
        "### 8.2 Does the ensemble beat its members? — statistical verdicts",
        "",
        "Two estimators of the same thing appear in this document, and they are not the same",
        "number. §8.1 averages each seed's own MAE. Here the seeds' predictions are *averaged",
        "first* and the error is taken once (the `ensemble_mae` / `candidate_mae` columns).",
        "Every row compares the same estimator on both sides, on the same test months, so the",
        "two tables must not be compared cell-to-cell.",
        "",
        "A difference is called an improvement only when **all three** agree: a paired-bootstrap",
        "95% CI on the MAE difference that excludes zero, a Diebold–Mariano p-value that",
        "survives Benjamini–Hochberg adjustment across the planned comparison family, and the",
        "bootstrap p-value that also survives it. `DM p` is raw, `DM q` adjusted; `BH q (boot)`",
        "is the adjusted bootstrap p. When the tests disagree the verdict says so rather than",
        "picking the convenient one.",
        "",
    ]
    has_q = "dm_q" in comp.columns
    header = ["City", "Target", "Compared with", "MAE ens", "MAE other", "Δ (ens − other)",
              "95% CI", "DM stat", "DM p", "DM q", "BH q (boot)", "Verdict"]
    rows = []
    for _, row in _sort(comp, ["location", "candidate"]).iterrows():
        rows.append([
            str(row["location"]), str(row["target"]), str(row["candidate"]),
            _fmt(row["ensemble_mae"]), _fmt(row["candidate_mae"]),
            _fmt(row["mae_delta_ensemble_minus_candidate"], signed=True),
            f"[{_fmt(row['ci_low'], signed=True)}, {_fmt(row['ci_high'], signed=True)}]",
            _fmt(row["dm_stat"], 2, signed=True),
            _fmt(row["dm_p"], 4),
            _fmt(row["dm_q"], 4) if has_q else "—",
            _fmt(row.get("bootstrap_q"), 4) if "bootstrap_q" in comp else "—",
            str(row["verdict"]),
        ])
    lines += [_table(header, rows), ""]

    family = int(comp["family_size"].iloc[0]) if "family_size" in comp else len(comp)
    tally = comp["verdict"].value_counts()
    lines.append(
        "Planned comparison family: **" + str(family) + "** tests (cities × targets × members). "
        "Verdict tally: " + ", ".join(f"**{name}** {count}" for name, count in tally.items()) + "."
    )
    if "verdict_pre_correction" in comp:
        changed = comp[comp["verdict"] != comp["verdict_pre_correction"]]
        if changed.empty:
            lines.append(
                "No verdict changed once D14 (t-reference, HLN small-sample factor) and D15 "
                "(Benjamini–Hochberg over the family) were applied to this run."
            )
        else:
            items = [
                f"{row['location']} {row['target']} vs {row['candidate']}: "
                f"{row['verdict_pre_correction']} → {row['verdict']}"
                for _, row in changed.iterrows()
            ]
            detail = "; ".join(items[:6])
            if len(items) > 6:
                detail += f"; … and {len(items) - 6} more"
            lines.append(f"**{len(changed)} verdict(s) changed** after correction: {detail}.")
    lines.append("")

    if previous is not None and not previous.empty and "dm_p" in previous:
        lines += [
            "#### 8.2.1 What the correction did to the p-values",
            "",
            "Same data, same seeds, same test months; only the reference distribution and the",
            "multiplicity handling differ.",
            "",
        ]
        merged = comp.merge(
            previous[["location", "target", "candidate", "dm_p", "verdict"]],
            on=["location", "target", "candidate"], suffixes=("", "_pre"), how="left",
        )
        if "dm_p_normal" in merged:
            merged["inflation"] = (merged["dm_p"] - merged["dm_p_normal"]) / merged["dm_p_normal"]
            worst = merged.loc[merged["inflation"].abs().idxmax()]
            lines.append(
                f"Largest raw correction (normal → t + HLN) was "
                f"{_fmt(worst['inflation'] * 100, 1, signed=True)}% at "
                f"{worst['location']} {worst['target']} vs {worst['candidate']}."
            )
            lines.append("")
        rows = []
        for _, row in _sort(merged, ["location", "candidate"]).iterrows():
            rows.append([
                str(row["location"]), str(row["target"]), str(row["candidate"]),
                _fmt(row["dm_p_pre"], 4), _fmt(row["dm_p"], 4),
                _fmt(row.get("dm_q"), 4) if has_q else "—",
                str(row["verdict_pre"]), str(row["verdict"]),
            ])
        lines += [
            _table(["City", "Target", "Compared with", "DM p (pre)", "DM p (now)",
                    "DM q (now)", "Verdict (pre)", "Verdict (now)"], rows),
            "",
        ]
    return lines


def section_intervals(intervals: pd.DataFrame) -> List[str]:
    lines = [
        "### 8.3 Calibrated prediction intervals (nominal 90%)",
        "",
        "Split-conformal intervals are calibrated on the **distinct validation months** and then",
        "scored on the sealed test tail. `coverage` is the fraction of test months inside the",
        "interval: close to 0.90 is correct, far below is over-confident, far above is",
        "needlessly wide.",
        "",
    ]
    if intervals.empty:
        return lines + ["_no interval rows_", ""]
    header = ["City", "Target", "Model", "Coverage (conformal)", "Mean width",
              "Coverage (Gaussian)", "Width (Gaussian)", "Calibration months"]
    rows = []
    for _, row in _sort(intervals, ["location", "model"]).iterrows():
        rows.append([
            str(row["location"]), str(row["target"]), str(row["model"]),
            _fmt(row["coverage_conformal"]), _fmt(row["width_conformal"]),
            _fmt(row["coverage_gaussian"]), _fmt(row["width_gaussian"]),
            _fmt(row.get("calib_n_calibration"), 0),
        ])
    lines += [_table(header, rows), ""]
    conf = intervals["coverage_conformal"]
    gauss = intervals["coverage_gaussian"] if "coverage_gaussian" in intervals else pd.Series(dtype=float)
    below = int((conf < 0.90).sum())
    above = int((conf > 0.95).sum())
    lines.append(
        f"Conformal coverage ranges {_fmt(conf.min())}–{_fmt(conf.max())} against a nominal 0.90 "
        f"(mean {_fmt(conf.mean())}); {below} cell(s) below 0.90 and {above} above 0.95. "
        f"Gaussian intervals give {_fmt(gauss.min())}–{_fmt(gauss.max())} (mean {_fmt(gauss.mean())})."
    )
    lines.append("")
    return lines


def section_extremes(extremes: pd.DataFrame) -> List[str]:
    lines = [
        "### 8.4 Extreme rainfall",
        "",
        "Threshold = the 95th percentile of **training** rain, per city, taken with",
        "`method=\"higher\"` so the threshold is a value an observation actually had. An event",
        "is a test month above it; a predicted event is a prediction above it.",
        "",
    ]
    rows = []
    for _, row in _sort(extremes, ["location", "model"]).iterrows():
        rows.append([
            str(row["location"]), str(row["model"]),
            _fmt(row["threshold_mm_per_day"], 2),
            _fmt(row["observed_events"], 0), _fmt(row["predicted_events"], 0),
            _fmt(row["true_positives"], 0),
            _fmt(row["precision"], 2), _fmt(row["recall"], 2),
            _fmt(row["rank_auc"]),
            f"{_fmt(float(row['underprediction_rate_on_events']) * 100, 0)}%",
        ])
    lines += [_table(["City", "Model", "Threshold", "Observed", "Predicted", "Hits",
                      "Precision", "Recall", "rank-AUC", "Underpredicted"], rows), ""]
    recall = extremes["recall"]
    under = extremes["underprediction_rate_on_events"]
    lines.append(
        f"Recall across all cells: {_fmt(recall.min(), 2)}–{_fmt(recall.max(), 2)}. rank-AUC "
        f"(can the model *order* events above non-events, regardless of threshold): "
        f"{_fmt(extremes['rank_auc'].min())}–{_fmt(extremes['rank_auc'].max())}. "
        f"Underprediction rate on observed events: mean {_fmt(under.mean() * 100, 1)}%, "
        f"min {_fmt(under.min() * 100, 0)}%, max {_fmt(under.max() * 100, 0)}%."
    )
    lines.append("")
    return lines


def section_stability(stability: pd.DataFrame) -> List[str]:
    lines = [
        "### 8.5 Multi-seed stability",
        "",
        "Test MAE across the seeds, per city × target × model. `relative_spread` (std / |mean|)",
        "is unit-free and is the only column comparable across cells.",
        "",
    ]
    if stability.empty:
        return lines + ["_no stability rows_", ""]
    rows = [
        [str(r["location"]), str(r["target"]), str(r["model"]), _fmt(r["mean"]), _fmt(r["std"]),
         _fmt(r["min"]), _fmt(r["max"]), _fmt(r["relative_spread"]), str(int(r["seeds"]))]
        for _, r in _sort(stability, ["location", "model"]).iterrows()
    ]
    lines += [_table(["City", "Target", "Model", "Mean MAE", "Std", "Min", "Max",
                      "Relative spread", "Seeds"], rows), ""]
    worst = stability.loc[stability["relative_spread"].idxmax()]
    lines.append(
        f"Least stable cell: {worst['location']} {worst['target']} {worst['model']} "
        f"(relative spread {_fmt(worst['relative_spread'])})."
    )
    lines.append("")
    return lines


def section_validation_vs_test(validation: pd.DataFrame, test: pd.DataFrame) -> List[str]:
    lines = [
        "### 8.7 Validation versus test, side by side (MAE)",
        "",
        "Validation numbers are computed over **distinct out-of-fold months** (overlapping",
        "forecast instances are averaged, never discarded — `tables/metrics_validation_instances.csv`",
        "holds the instance-level view). The test column is the sealed 60-month tail, evaluated",
        "once. The two columns are not interchangeable and are never averaged together.",
        "",
    ]
    if validation.empty:
        return lines
    val = validation.groupby(["location", "target", "model"])["mae"].mean().reset_index()
    tst = test.groupby(["location", "target", "model"])["mae"].mean().reset_index()
    merged = val.merge(tst, on=["location", "target", "model"], suffixes=("_val", "_test"))
    rows = []
    for _, row in _sort(merged, ["location", "model"]).iterrows():
        rows.append([
            str(row["location"]), str(row["target"]), str(row["model"]),
            _fmt(row["mae_val"]), _fmt(row["mae_test"]),
            _fmt(float(row["mae_test"]) - float(row["mae_val"]), signed=True),
        ])
    lines += [_table(["City", "Target", "Model", "Validation MAE", "Test MAE", "Change"], rows), ""]
    return lines


def section_ordering(validation: pd.DataFrame, test: pd.DataFrame) -> List[str]:
    lines = [
        "### 8.6 Validation folds versus the sealed test tail — does the ranking hold?",
        "",
        "Model order by MAE, best first, in the same city × target.",
        "",
    ]
    if validation.empty or test.empty:
        return lines
    val = validation.groupby(["location", "target", "model"])["mae"].mean()
    tst = test.groupby(["location", "target", "model"])["mae"].mean()
    rows, agree, cells = [], 0, 0
    for location, target in sorted({(k[0], k[1]) for k in val.index}, key=lambda x: (x[1] != "temp", x[0])):
        def order(series, key=(location, target)):
            cell = series.loc[key]
            return list(cell.sort_values().index)
        val_order, test_order = order(val), order(tst)
        cells += 1
        same = val_order[0] == test_order[0]
        agree += int(same)
        rows.append([
            location, target, " > ".join(val_order), " > ".join(test_order),
            "yes" if same else "no — top model changed",
        ])
    lines += [_table(["City", "Target", "Validation order", "Test order", "Top model agreed?"], rows), ""]
    lines.append(f"Top model agreed in {agree} of {cells} city × target cells.")
    lines.append("")
    return lines


def build(run_dir: Path, previous: Optional[Path] = None) -> str:
    manifest_path = run_dir / "run_manifest.json"
    manifest: Dict[str, Any] = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    test = _load(run_dir, "metrics_test")
    validation = _load(run_dir, "metrics_validation")
    comparisons = _load(run_dir, "statistical_comparisons")
    intervals = _load(run_dir, "interval_scores")
    extremes = _load(run_dir, "extreme_rainfall")
    stability = _load(run_dir, "seed_stability")
    previous_comparisons = _load(previous, "statistical_comparisons") if previous else None

    provenance = manifest.get("data_provenance", "unknown")
    execution = manifest.get("execution", {})
    lines = [
        "<!-- generated by scripts/emit_results_section.py — do not edit by hand -->",
        (
            f"_Run artefact: `{run_dir.name}` · config hash "
            f"`{str(manifest.get('config_hash'))[:16]}` · provenance **{provenance}** · "
            f"scientific results: **{manifest.get('scientific_results')}**._"
        ),
        "",
    ]
    if execution:
        # Prefer the folds table over the manifest: the first two phase-2 manifests
        # recorded seed × fold rows (40) instead of folds (8). See docs/evidence/README.md.
        folds_table = _load(run_dir, "folds")
        if not folds_table.empty and "name" in folds_table:
            folds = folds_table.groupby(["location", "target"])["name"].nunique().to_dict()
        else:
            folds = execution.get("folds_per_series") or {}
        counts = execution.get("validation_counts") or {}
        if folds:
            values = sorted(set(folds.values()))
            lines.append(f"- folds per series: {values[0]} (all series)" if len(values) == 1
                         else f"- folds per series: {values}")
        if counts:
            sample = next(iter(counts.values()))
            lines.append(
                f"- validation: {int(sample['forecast_instances'])} forecast instances over "
                f"{int(sample['distinct_months'])} distinct months per series "
                "(overlapping folds are averaged per month, not double-counted)"
            )
        dm = execution.get("dm_test") or {}
        if dm:
            lines.append(
                f"- Diebold–Mariano: {dm.get('variance')} variance, lag {dm.get('max_lag')}, "
                f"{dm.get('reference')}, {dm.get('small_sample')} correction"
            )
        if execution.get("alpha") is not None:
            lines.append(f"- verdicts at alpha = {execution['alpha']}, Benjamini–Hochberg within the family")
    lines.append("")

    lines += section_test_tail(test) if not test.empty else []
    lines += section_comparisons(comparisons, previous_comparisons) if not comparisons.empty else []
    lines += section_intervals(intervals) if not intervals.empty else []
    lines += section_extremes(extremes) if not extremes.empty else []
    lines += section_stability(stability) if not stability.empty else []
    lines += section_ordering(validation, test) if not validation.empty else []
    lines += section_validation_vs_test(validation, test) if not validation.empty else []
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, help="results/run_… directory")
    parser.add_argument("--previous", default=None, help="earlier run directory, for the correction diff")
    parser.add_argument("--out", default=None, help="write here instead of stdout")
    args = parser.parse_args()
    text = build(Path(args.run), Path(args.previous) if args.previous else None)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")
        print(f"wrote {args.out} ({len(text.splitlines())} lines)")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
