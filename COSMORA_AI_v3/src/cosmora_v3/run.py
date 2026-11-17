"""End-to-end run: data → folds → models → uncertainty → statistics → artefacts.

Usage::

    python scripts/run_experiments.py                       # real NASA POWER run
    python scripts/run_experiments.py --quick               # 2 seeds, 2 folds
    python scripts/run_experiments.py --synthetic           # engine check only
    python scripts/run_experiments.py --locations colombo    # one site

The ``--synthetic`` flag exists so the pipeline can be verified on a machine with
no route to power.larc.nasa.gov. Its output is stamped SYNTHETIC everywhere and the
dashboard refuses to present it as a scientific result.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from . import report
from .config import load_config
from .data import load_dataset
from .evaluate import SeriesResult, run_series, seed_stability
from .extreme import analyse as analyse_extremes
from .plots import actual_vs_predicted, extreme_chart, model_comparison, overview_dashboard, scatter_panel, seed_stability_chart
from .stats import benjamini_hochberg, summarise_comparison


LIMITATIONS_COMMON = [
    "POWER values are gridded reanalysis/satellite estimates (~0.5 x 0.625 deg), not station observations; "
    "the Kandy highlands and coastal sea-breeze effects are poorly resolved at that scale.",
    "The task is one-month-ahead prediction from a 12-month lookback. Nothing here is a multi-year projection "
    "and the results must not be quoted as such.",
    "The walk-forward design evaluates a fixed configuration. Nested hyper-parameter selection was not performed, "
    "so the reported scores are for a tuned-on-prior-knowledge model, not an oracle.",
    "Only one dataset (NASA POWER) and one grid cell per city are used. Cross-source agreement "
    "(IMD, department of meteorology gauges) is not established.",
    "Ensemble weights are equal by construction to avoid fitting weights on the evaluation window; "
    "a learned weighting could be better or worse and has not been tested.",
]


def _seed_subset(config: Dict[str, Any], quick: bool) -> List[int]:
    seeds = list(config["seeds"])
    return seeds[:2] if quick else seeds


def run(
    config_path: Optional[str] = None,
    *,
    synthetic: bool = False,
    quick: bool = False,
    force_refresh: bool = False,
    out_dir: Optional[str] = None,
    location_ids: Optional[List[str]] = None,
    log=print,
) -> Dict[str, Any]:
    started = time.time()
    config = load_config(config_path)
    seeds = _seed_subset(config, quick)
    max_folds = 2 if quick else None
    epochs_override = 40 if quick else None

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    base = Path(out_dir) if out_dir else Path(config["output"]["results_dir"])
    if synthetic:
        base = base / "engine_check"
    run_dir = base / f"run_{stamp}_{config['config_hash']}"
    run_dir.mkdir(parents=True, exist_ok=True)

    mode = "SYNTHETIC engine check" if synthetic else "NASA POWER"
    log(f"[COSMORA v3] mode: {mode}{' · quick' if quick else ''}")
    log(f"[COSMORA v3] config {config['config_hash']} · output {run_dir}")

    frames, provenance = load_dataset(config, force_refresh=force_refresh, synthetic=synthetic)
    locations = [loc for loc in config["locations"] if not location_ids or loc["id"] in location_ids]
    if not locations:
        raise SystemExit("no matching locations in the configuration")

    series_results: List[SeriesResult] = []
    comparison_rows: List[Dict[str, Any]] = []
    extreme_rows: List[Dict[str, Any]] = []
    interval_rows: List[Dict[str, Any]] = []

    for location in locations:
        frame = frames[location["id"]]
        for target in ("temp", "rain"):
            log(f"[{location['id']}] target={target} ({len(frame)} months)")
            result = run_series(
                frame, location["id"], target, config,
                seeds=seeds, max_folds=max_folds, model_epochs_override=epochs_override, log=log,
            )
            series_results.append(result)
            log(f"  done in {result.elapsed_seconds:.1f}s")

            # --- statistical comparison on the sealed test tail ---------------
            errors = {
                name: np.abs(np.mean(list(per_seed.values()), axis=0) - result.y_true)
                for name, per_seed in result.predictions.items()
            }
            for name in ("mlp", "gru", "lstm", "xgboost"):
                delta, dm, verdict = summarise_comparison(
                    errors["ensemble"], errors[name],
                    resamples=int(config["evaluation"]["bootstrap_resamples"]),
                    seed=int(config["evaluation"]["bootstrap_seed"]),
                    max_lag=int(config["evaluation"]["dm_max_lag"]),
                )
                # Raw, uncorrected numbers. The verdict is finalised across the whole
                # family of planned comparisons once every series has run, because a
                # multiplicity correction is a property of the family, not of a row.
                comparison_rows.append({
                    "location": location["id"], "target": target,
                    "candidate": name, "reference": "ensemble",
                    "ensemble_mae": float(np.mean(errors["ensemble"])),
                    "candidate_mae": float(np.mean(errors[name])),
                    "mae_delta_ensemble_minus_candidate": delta["delta"],
                    "ci_low": delta["ci_low"], "ci_high": delta["ci_high"],
                    "bootstrap_p": delta["p_two_sided"],
                    "dm_stat": dm["dm_stat"], "dm_p": dm["p_value"],
                    "dm_p_normal": dm["p_value_normal"],
                    "dm_lag": dm["lag_used"], "dm_correction": dm["correction"],
                    "verdict_raw": verdict,
                    "n_months": int(len(result.y_true)),
                })

            for name, scores in result.interval_scores.items():
                interval_rows.append({
                    "location": location["id"], "target": target, "model": name,
                    **{k: v for k, v in scores.items()},
                    **{f"calib_{k}": v for k, v in result.intervals[name].describe().items()},
                })

            if target == "rain":
                threshold_q = float(config["extreme"]["quantile"])
                # Align training observations with the feature index used for the test tail.
                test_dates = set(result.dates)
                aligned = frame.loc[frame.index.strftime("%Y-%m").isin(test_dates)]
                pre_test = frame.loc[~frame.index.strftime("%Y-%m").isin(test_dates)]
                for name, per_seed in result.predictions.items():
                    point = np.mean(list(per_seed.values()), axis=0)
                    if len(aligned) != len(point):
                        log(f"  ! alignment mismatch for {name}; skipping extremes")
                        continue
                    rows = analyse_extremes(
                        pre_test["rain"].to_numpy(), aligned["rain"].to_numpy(), point, threshold_q
                    )
                    extreme_rows.append({"location": location["id"], "model": name, **rows})

    # -- tables ---------------------------------------------------------------
    val_frames, inst_frames, test_frames, fold_frames = [], [], [], []
    for result in series_results:
        if not result.metrics_validation.empty:
            val_frames.append(result.metrics_validation.assign(location=result.location_id, target=result.target))
        if not result.metrics_validation_instances.empty:
            inst_frames.append(result.metrics_validation_instances.assign(
                location=result.location_id, target=result.target))
        if not result.metrics_test.empty:
            test_frames.append(result.metrics_test.assign(location=result.location_id, target=result.target))
        if not result.fold_table.empty:
            fold_frames.append(result.fold_table.assign(location=result.location_id, target=result.target))

    alpha = float(config["evaluation"].get("alpha", 0.05))
    _apply_multiplicity(comparison_rows, alpha=alpha)

    tables: Dict[str, pd.DataFrame] = {
        "metrics_validation": pd.concat(val_frames, ignore_index=True) if val_frames else pd.DataFrame(),
        "metrics_validation_instances": (
            pd.concat(inst_frames, ignore_index=True) if inst_frames else pd.DataFrame()
        ),
        "metrics_test": pd.concat(test_frames, ignore_index=True) if test_frames else pd.DataFrame(),
        "folds": pd.concat(fold_frames, ignore_index=True) if fold_frames else pd.DataFrame(),
        "statistical_comparisons": pd.DataFrame(comparison_rows),
        "extreme_rainfall": pd.DataFrame(extreme_rows),
        "interval_scores": pd.DataFrame(interval_rows),
    }
    stability = seed_stability(tables["metrics_test"])
    tables["seed_stability"] = stability
    tables["location_summary"] = _location_summary(tables["metrics_test"])

    # -- figures --------------------------------------------------------------
    if config["output"].get("figures", True):
        _make_figures(run_dir, series_results, tables)

    # -- artefacts ------------------------------------------------------------
    manifest_path = report.write_manifest(
        run_dir, config, provenance, synthetic=synthetic, quick=quick,
        timing={"total_seconds": round(time.time() - started, 1)},
        extra={
            # The executed seed list, not the configured one: a quick run uses a
            # subset, and the report must not imply otherwise.
            "seeds_executed": seeds,
            "locations_executed": sorted({r.location_id for r in series_results}),
            "folds_executed": max_folds,
            # What the run actually used, not only what the config asked for.
            "execution": {
                "epochs_override": epochs_override,
                "epochs_effective": {
                    model: int(config["models"][model].get("epochs", 0))
                    for model in ("mlp", "gru", "lstm")
                } if not epochs_override else {
                    model: int(epochs_override) for model in ("mlp", "gru", "lstm")
                },
                "folds_per_series": {
                    # distinct fold names, not seed × fold rows: the table has one row per
                    # (fold, seed), and reporting 40 where 8 folds exist was wrong in the
                    # first two phase-2 manifests (see docs/evidence/README.md).
                    r.location_id + "/" + r.target: int(r.fold_table["name"].nunique())
                    for r in series_results
                },
                "validation_counts": {r.location_id + "/" + r.target: r.validation_counts
                                      for r in series_results},
                "alpha": float(config["evaluation"].get("alpha", 0.05)),
                "multiplicity_correction": "benjamini-hochberg over the planned comparison family",
                "dm_test": {
                    "variance": "newey-west (bartlett)",
                    "max_lag": int(config["evaluation"]["dm_max_lag"]),
                    "reference": "student-t, df = n-1",
                    "small_sample": "harvey-leybourne-newbold",
                },
            },
            "code": _code_identity(),
            "dataset_file_sha256": _dataset_file_hashes(config),
            "epochs_override": epochs_override,
            "series": [
                {"location": r.location_id, "target": r.target,
                 "test_months": int(len(r.y_true)), "seconds": round(r.elapsed_seconds, 1)}
                for r in series_results
            ]
        },
    )
    import json as _json

    manifest = _json.loads(manifest_path.read_text(encoding="utf-8"))
    report.export_tables(run_dir, tables)
    models_written = report.export_models(run_dir, series_results)
    narrative = {"limitations": LIMITATIONS_COMMON + (
        ["Synthetic data: this run verifies code paths, not climate skill."] if synthetic else []
    )}
    report.render_markdown_report(run_dir, manifest, tables, narrative)
    if config["output"].get("html_dashboard", True):
        report.render_html_dashboard(
            run_dir, manifest, tables,
            {"interval_scores": tables["interval_scores"]},
            tables["extreme_rainfall"],
        )

    summary = {
        "run_dir": str(run_dir),
        "config_hash": config["config_hash"],
        "data_provenance": manifest["data_provenance"],
        "scientific_results": manifest["scientific_results"],
        "seconds": round(time.time() - started, 1),
        "tables": {name: len(frame) for name, frame in tables.items()},
        "models_exported": len(models_written),
        "test_mae": _pivot_test_mae(tables["metrics_test"]),
    }
    log(f"[COSMORA v3] finished in {summary['seconds']}s → {run_dir}")
    return summary


def _apply_multiplicity(rows: List[Dict[str, Any]], *, alpha: float = 0.05) -> None:
    """Benjamini–Hochberg across the *planned* family, then final verdicts.

    The family is every ensemble-vs-member comparison the design specifies (cities ×
    targets × members), not only the rows that happened to run: shrinking the family to
    the tests you chose to report would silently weaken the correction. Adjustments are
    computed on the two p-values separately (Diebold–Mariano, and the paired-bootstrap
    p-value that accompanies the interval), and a verdict now requires **both**
    adjusted values to clear ``alpha`` as well as the bootstrap interval excluding zero.

    Raw values are kept in the same row as ``dm_p`` / ``bootstrap_p`` so a reader can see
    what the correction changed.
    """
    if not rows:
        return
    dm_q = benjamini_hochberg([row["dm_p"] for row in rows])
    boot_q = benjamini_hochberg([row["bootstrap_p"] for row in rows])
    for row, q_dm, q_boot in zip(rows, dm_q, boot_q):
        row["dm_q"] = float(q_dm)
        row["bootstrap_q"] = float(q_boot)
        delta = {"delta": row["mae_delta_ensemble_minus_candidate"],
                 "ci_low": row["ci_low"], "ci_high": row["ci_high"]}
        strict = _verdict_with_family(delta, row["dm_p"], q_dm, q_boot, alpha)
        row["verdict"] = strict
        row["verdict_pre_correction"] = row.get("verdict_raw", strict)
        row["alpha"] = float(alpha)
        row["family_size"] = int(len(rows))


def _verdict_with_family(
    delta: Dict[str, float], p_dm: float, q_dm: float, q_boot: float, alpha: float
) -> str:
    """Verdict that requires both tests to survive the family-wise correction."""
    if not np.isfinite(delta["delta"]):
        return "insufficient data"
    interval_excludes_zero = delta["ci_low"] > 0 or delta["ci_high"] < 0
    boot_sig = bool(np.isfinite(q_boot) and q_boot < alpha)
    dm_sig = bool(np.isfinite(q_dm) and q_dm < alpha)
    if interval_excludes_zero and dm_sig and boot_sig:
        return "better" if delta["delta"] < 0 else "worse"
    if interval_excludes_zero != dm_sig:
        return "inconclusive (tests disagree)"
    return "not distinguishable"


def _code_identity() -> Dict[str, Any]:
    """Package version plus the commit this run executed, when git is available."""
    import os
    import subprocess

    version = "unknown"
    try:
        from . import __version__ as version  # type: ignore
    except Exception:  # noqa: BLE001 - provenance must never break a run
        pass
    sha = os.environ.get("GITHUB_SHA") or os.environ.get("COSMORA_GIT_SHA")
    if not sha:
        try:
            sha = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=str(Path(__file__).resolve().parents[2]),
                capture_output=True, text=True, timeout=5, check=False,
            ).stdout.strip() or None
        except Exception:  # noqa: BLE001
            sha = None
    try:
        dirty = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(Path(__file__).resolve().parents[2]),
            capture_output=True, text=True, timeout=5, check=False,
        ).stdout.strip()
        dirty_flag = bool(dirty)
    except Exception:  # noqa: BLE001
        dirty_flag = None
    return {"package_version": version, "git_sha": sha, "working_tree_dirty": dirty_flag}


def _dataset_file_hashes(config: Dict[str, Any]) -> Dict[str, str]:
    """SHA-256 of each cache file as bytes.

    Deliberately separate from ``payload_sha256`` in the provenance record, which is
    computed over a re-serialised object and therefore cannot be checked against the file
    on disk (DEFECT_REPORT D18, out of scope in this phase). This field can be: it is the
    digest of the exact bytes a reader has.
    """
    import hashlib

    base = Path(__file__).resolve().parents[2]
    cache_dir = base / config["power"]["cache_dir"]
    stamp = f"{config['power']['start_year']}_{config['power']['end_year']}"
    out: Dict[str, str] = {}
    for loc in config["locations"]:
        path = cache_dir / f"power_{loc['id']}_{stamp}.json"
        if path.exists():
            out[loc["id"]] = hashlib.sha256(path.read_bytes()).hexdigest()
    return out


def _location_summary(metrics_test: pd.DataFrame) -> pd.DataFrame:
    if metrics_test.empty:
        return pd.DataFrame()
    return (
        metrics_test.groupby(["location", "target", "model"])[["mae", "rmse", "r2", "bias"]]
        .mean().reset_index().round(4)
    )


def _pivot_test_mae(metrics_test: pd.DataFrame) -> Dict[str, float]:
    """Mean test MAE, keyed ``<target>/<model>``.

    Never pooled across targets: degC and mm/day are different quantities, and a
    single averaged number would be meaningless even though it looks tidier.
    """
    if metrics_test.empty:
        return {}
    grouped = metrics_test.groupby(["target", "model"])["mae"].mean()
    return {f"{target}/{model}": round(float(value), 4) for (target, model), value in grouped.items()}


def _make_figures(run_dir: Path, series_results: List[SeriesResult], tables: Dict[str, pd.DataFrame]) -> None:
    figures = run_dir / "figures"
    figures.mkdir(parents=True, exist_ok=True)
    for result in series_results:
        mean_preds = {
            name: np.mean(list(per_seed.values()), axis=0)
            for name, per_seed in result.predictions.items()
        }
        interval = result.intervals.get("ensemble")
        band = interval.interval(mean_preds["ensemble"]) if interval else None
        actual_vs_predicted(
            result.dates, result.y_true,
            {"ensemble": mean_preds["ensemble"], "xgboost": mean_preds["xgboost"]},
            band,
            f"{result.location_id} · {result.target} · sealed test tail",
            result.unit,
            figures / f"actual_vs_predicted_{result.location_id}_{result.target}.png",
        )
        scatter_panel(
            result.y_true, mean_preds,
            f"{result.location_id} · {result.target} · observed vs predicted (test)",
            result.unit,
            figures / f"scatter_{result.location_id}_{result.target}.png",
        )

    location_summary = tables["location_summary"]
    if not location_summary.empty:
        for target in ("temp", "rain"):
            subset = (
                location_summary[location_summary["target"] == target]
                .groupby("model")["mae"].mean().reset_index()
            )
            if not subset.empty:
                model_comparison(subset, "mae", f"test MAE · {target}", figures / f"comparison_mae_{target}.png")
                r2_subset = (
                    location_summary[location_summary["target"] == target]
                    .groupby("model")["r2"].mean().reset_index()
                )
                model_comparison(r2_subset, "r2", f"test R2 · {target}", figures / f"comparison_r2_{target}.png")

    if not tables["metrics_test"].empty:
        seed_stability_chart(
            tables["seed_stability"], "mae",
            "Test MAE: dispersion across seeds (per location/target, unit-free)",
            figures / "seed_stability_mae.png",
        )
    if not tables["extreme_rainfall"].empty:
        extreme_chart(tables["extreme_rainfall"].head(12), figures / "extreme_rainfall.png")
    overview_dashboard(
        [{"model": m, "target": t, "mae": v}
         for (t, m), v in tables["metrics_test"].groupby(["target", "model"])["mae"].mean().items()],
        figures / "overview.png",
    )
