"""Experimental orchestration: folds, seeds, identical test periods, uncertainty.

The flow for one (location, target) pair:

1. Build features once. Every model and every seed then consumes the *same*
   matrices, so a comparison cannot be explained away by different preprocessing.
2. Walk-forward folds: for each fold, fit on the expanding training window and
   predict the validation window. Predictions are collected out-of-fold; this
   block is "validation" and is also the only source of conformal calibration.
3. Fit once more on everything before the sealed test boundary, predict the test
   tail. This block is "test" and is reported separately, always.
4. Repeat 2–3 for every seed. Seed spread is reported as model-initialisation
   uncertainty, never merged into the weather-noise interval.

Nothing in this module writes files; :mod:`cosmora_v3.report` does that.
"""

from __future__ import annotations

import copy
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from .config import config_hash
from .features import TrainOnlyScaler, build_features
from .metrics import climatology_forecast, summarise
from .models import build_model, model_names
from .splits import assert_no_overlap, test_split, walk_forward_splits
from .uncertainty import SplitConformal, calibrate_residuals, evaluate_intervals, per_seed_band


@dataclass
class SeriesResult:
    location_id: str
    target: str
    unit: str
    dates: List[str]
    y_true: np.ndarray
    # model -> seed -> test-tail predictions
    predictions: Dict[str, Dict[str, np.ndarray]] = field(default_factory=dict)
    # model -> seed -> concatenated out-of-fold validation predictions / truths
    validation: Dict[str, Dict[str, Dict[str, np.ndarray]]] = field(default_factory=dict)
    validation_dates: List[str] = field(default_factory=list)
    intervals: Dict[str, SplitConformal] = field(default_factory=dict)
    interval_scores: Dict[str, Dict[str, float]] = field(default_factory=dict)
    metrics_validation: pd.DataFrame = field(default_factory=pd.DataFrame)
    metrics_test: pd.DataFrame = field(default_factory=pd.DataFrame)
    fold_table: pd.DataFrame = field(default_factory=pd.DataFrame)
    # model -> seed -> {model, scaler, columns, lookback} for artefact export
    trained: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    elapsed_seconds: float = 0.0


def run_series(
    frame: pd.DataFrame,
    location_id: str,
    target_key: str,
    config: Dict[str, Any],
    *,
    seeds: Optional[List[int]] = None,
    max_folds: Optional[int] = None,
    model_epochs_override: Optional[int] = None,
    log: Optional[Any] = None,
) -> SeriesResult:
    """Run every model × seed over the walk-forward folds and the sealed test tail."""
    started = time.time()
    cfg = _with_epochs(config, model_epochs_override) if model_epochs_override else config

    seeds = list(seeds or config["seeds"])
    X_df, y, spec = build_features(frame, cfg, target_key)
    X = X_df.to_numpy(dtype="float64")
    dates = [d.strftime("%Y-%m") for d in X_df.index]
    months = np.array([int(d[5:7]) for d in dates])
    n = len(y)

    folds = walk_forward_splits(n, cfg)
    if max_folds is not None:
        folds = folds[-max_folds:]
    test = test_split(n, cfg)
    assert_no_overlap(folds, test, n)

    names = model_names(cfg)
    validation: Dict[str, Dict[str, Dict[str, np.ndarray]]] = {name: {} for name in names}
    predictions: Dict[str, Dict[str, np.ndarray]] = {name: {} for name in names}
    fold_rows: List[Dict[str, Any]] = []
    trained: Dict[str, Dict[str, Any]] = {}
    val_index = np.concatenate([np.arange(f.eval_start, f.eval_end) for f in folds])

    for seed in seeds:
        for fold in folds:
            scaler = TrainOnlyScaler().fit(X[fold.train_slice])
            X_tr = scaler.transform(X[fold.train_slice])
            X_ev = scaler.transform(X[fold.eval_slice])
            y_tr = y[fold.train_slice]
            for name in names:
                pred = _fit_predict(name, cfg, seed, spec.lookback, X_tr, y_tr, X_ev)
                slot = validation[name].setdefault(str(seed), {"pred": [], "true": []})
                slot["pred"].append(pred)
                slot["true"].append(y[fold.eval_slice])
            fold_rows.append({**fold.describe(), "seed": seed})

        scaler = TrainOnlyScaler().fit(X[test.train_slice])
        X_tr = scaler.transform(X[test.train_slice])
        X_te = scaler.transform(X[test.eval_slice])
        for name in names:
            model = build_model(name, cfg, seed=seed, lookback=spec.lookback)
            model.fit(X_tr, y[test.train_slice])
            predictions[name][str(seed)] = model.predict(X_te)
            trained.setdefault(name, {})[str(seed)] = {
                "model": model,
                "scaler": scaler.state(),
                "columns": spec.columns,
                "lookback": spec.lookback,
            }
        if log:
            log(f"    seed {seed}: {len(folds)} folds + test fitted")

    y_test = y[test.eval_slice]
    result = SeriesResult(
        location_id=location_id,
        target=target_key,
        unit=cfg["targets"][target_key]["unit"],
        dates=dates[test.eval_start : test.eval_end],
        y_true=y_test,
        predictions=predictions,
        validation=validation,
        validation_dates=[dates[i] for i in val_index],
        trained=trained,
        fold_table=pd.DataFrame(fold_rows),
    )

    train_months = months[test.train_slice]
    test_months = months[test.eval_start : test.eval_end]
    reference = climatology_forecast(y[test.train_slice], train_months, test_months)

    val_rows: List[Dict[str, Any]] = []
    test_rows: List[Dict[str, Any]] = []
    for name in names:
        for seed, slot in validation[name].items():
            v_pred = np.concatenate(slot["pred"])
            v_true = np.concatenate(slot["true"])
            row = {"model": name, "seed": int(seed), "split": "validation"}
            row.update(summarise(v_true, v_pred))
            val_rows.append(row)

        for seed, pred in predictions[name].items():
            row = {"model": name, "seed": int(seed), "split": "test"}
            row.update(summarise(y_test, pred, reference=reference))
            test_rows.append(row)

    result.metrics_validation = pd.DataFrame(val_rows)
    result.metrics_test = pd.DataFrame(test_rows)

    # -- uncertainty ---------------------------------------------------------
    # Calibration uses the seed-mean out-of-fold prediction for each validation
    # month: one residual per month, because the months — not the seed runs — are
    # the independent units. Feeding all seeds in would inflate n fivefold and
    # shrink the conformal quantile for no scientific reason.
    alpha = float(cfg["uncertainty"]["alpha"])
    for name in names:
        preds = np.vstack([np.concatenate(slot["pred"]) for slot in validation[name].values()])
        truths = np.concatenate(next(iter(validation[name].values()))["true"])
        mean_val = preds.mean(axis=0)
        interval = calibrate_residuals(truths - mean_val, alpha)

        seed_preds = [predictions[name][s] for s in predictions[name]]
        point = np.mean(seed_preds, axis=0)
        result.intervals[name] = interval
        scores = evaluate_intervals(y_test, point, interval)
        lo, hi = per_seed_band(seed_preds)
        scores["seed_band_mean_width"] = float(np.mean(hi - lo))
        scores["mean_prediction"] = float(np.mean(point))
        result.interval_scores[name] = scores

    result.elapsed_seconds = time.time() - started
    return result


def _fit_predict(
    model_name: str,
    config: Dict[str, Any],
    seed: int,
    lookback: int,
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_eval: np.ndarray,
) -> np.ndarray:
    model = build_model(model_name, config, seed=seed, lookback=lookback)
    model.fit(X_train, y_train)
    return model.predict(X_eval)


def _with_epochs(config: Dict[str, Any], epochs: int) -> Dict[str, Any]:
    """Copy with a reduced training budget (smoke tests and engine checks only)."""
    cfg = copy.deepcopy(config)
    for name in ("mlp", "gru", "lstm"):
        cfg["models"][name]["epochs"] = int(epochs)
        cfg["models"][name]["patience"] = max(5, int(epochs) // 4)
    cfg["config_hash"] = config_hash(cfg)
    return cfg


def aggregate_metrics(rows: List[pd.DataFrame], **extra: Any) -> pd.DataFrame:
    frame = pd.concat(rows, ignore_index=True) if rows else pd.DataFrame()
    for key, value in extra.items():
        frame[key] = value
    return frame


def seed_stability(metrics_test: pd.DataFrame, metric: str = "mae") -> pd.DataFrame:
    """Dispersion of a test metric across seeds, per model."""
    if metrics_test.empty or metric not in metrics_test:
        return pd.DataFrame()
    grouped = metrics_test.groupby("model")[metric]
    return pd.DataFrame({
        "mean": grouped.mean(),
        "std": grouped.std(ddof=1),
        "min": grouped.min(),
        "max": grouped.max(),
        "relative_spread": grouped.std(ddof=1) / grouped.mean().abs().replace(0, np.nan),
    }).reset_index()
