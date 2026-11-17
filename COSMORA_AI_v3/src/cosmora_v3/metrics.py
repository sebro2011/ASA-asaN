"""Climate-appropriate evaluation metrics.

R² alone is a poor referee for rainfall: a model can raise R² while missing every
extreme, and MAPE explodes on dry months where the truth sits near zero. So every
score here is paired with something that can contradict it —

* ``mae``/``rmse`` — absolute error in physical units (degC, mm/day);
* ``bias`` — systematic over/under-prediction, which MAE hides;
* ``r2`` — variance explained, computed on the same identical rows;
* ``pearson`` — linear association, insensitive to bias;
* ``skill_vs_climatology`` — 1 - MSE_model/MSE_climatology, where climatology is
  the training-period monthly mean repeated. A model that cannot beat a
  twelve-number lookup table has not earned a place in the ensemble;
* ``mape_pct`` — reported with an explicit zero-band guard, and flagged when the
  guard had to be used, because otherwise the number is fiction.
"""

from __future__ import annotations

from typing import Dict, Optional

import numpy as np

ZERO_BAND = 1e-3


def _clean(y_true: np.ndarray, y_pred: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    y_true = np.asarray(y_true, dtype="float64").reshape(-1)
    y_pred = np.asarray(y_pred, dtype="float64").reshape(-1)
    if y_true.shape != y_pred.shape:
        raise ValueError(f"shape mismatch: {y_true.shape} vs {y_pred.shape}")
    mask = np.isfinite(y_true) & np.isfinite(y_pred)
    return y_true[mask], y_pred[mask]


def mae(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    t, p = _clean(y_true, y_pred)
    return float(np.mean(np.abs(t - p))) if len(t) else float("nan")


def rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    t, p = _clean(y_true, y_pred)
    return float(np.sqrt(np.mean((t - p) ** 2))) if len(t) else float("nan")


def bias(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    t, p = _clean(y_true, y_pred)
    return float(np.mean(p - t)) if len(t) else float("nan")


def r2(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    t, p = _clean(y_true, y_pred)
    if len(t) < 3:
        return float("nan")
    denominator = float(np.sum((t - t.mean()) ** 2))
    if denominator < 1e-12:
        return float("nan")
    return float(1.0 - np.sum((t - p) ** 2) / denominator)


def pearson(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    t, p = _clean(y_true, y_pred)
    if len(t) < 3 or np.std(t) < 1e-12 or np.std(p) < 1e-12:
        return float("nan")
    return float(np.corrcoef(t, p)[0, 1])


def mae_daily_scale_mape(y_true: np.ndarray, y_pred: np.ndarray) -> tuple[float, bool]:
    """MAPE with a zero band; returns (value, guard_used)."""
    t, p = _clean(y_true, y_pred)
    if not len(t):
        return float("nan"), True
    band = np.maximum(np.abs(t), ZERO_BAND)
    guard_used = bool(np.mean(np.abs(t) < ZERO_BAND) > 0.05)
    return float(100.0 * np.mean(np.abs(p - t) / band)), guard_used


def skill_score(y_true: np.ndarray, y_pred: np.ndarray, y_reference: np.ndarray) -> float:
    """1 - MSE_model / MSE_reference. Positive means better than the reference."""
    t, p = _clean(y_true, y_pred)
    _, r = _clean(y_true, y_reference)
    if len(t) < 3:
        return float("nan")
    mse_ref = float(np.mean((t - r) ** 2))
    if mse_ref < 1e-12:
        return float("nan")
    return float(1.0 - np.mean((t - p) ** 2) / mse_ref)


def pinball_loss(y_true: np.ndarray, quantile_pred: np.ndarray, quantile: float) -> float:
    t, q = _clean(y_true, quantile_pred)
    if not len(t):
        return float("nan")
    delta = t - q
    return float(np.mean(np.maximum(quantile * delta, (quantile - 1.0) * delta)))


def interval_score(
    y_true: np.ndarray, lower: np.ndarray, upper: np.ndarray, alpha: float
) -> Dict[str, float]:
    """Coverage, mean width and the Winkler (interval) score.

    The Winkler score penalises both a missed observation and a needlessly wide
    interval, so it cannot be gamed by widening the band until coverage looks good.
    """
    t, lo = _clean(y_true, lower)
    _, hi = _clean(y_true, upper)
    if not len(t):
        return {"coverage": float("nan"), "mean_width": float("nan"), "winkler": float("nan")}
    inside = (t >= lo) & (t <= hi)
    width = hi - lo
    penalty = np.where(inside, width, width + (2.0 / alpha) * (lo - t) * (t < lo) + (2.0 / alpha) * (t - hi) * (t > hi))
    return {
        "coverage": float(np.mean(inside)),
        "mean_width": float(np.mean(width)),
        "winkler": float(np.mean(penalty)),
    }


def climatology_forecast(train_values: np.ndarray, train_months: np.ndarray,
                         target_months: np.ndarray) -> np.ndarray:
    """Month-of-year mean learned on training months only."""
    table: Dict[int, float] = {}
    for month in range(1, 13):
        subset = train_values[train_months == month]
        table[month] = float(np.mean(subset)) if len(subset) else float(np.mean(train_values))
    return np.array([table[int(m)] for m in target_months], dtype="float64")


def summarise(y_true: np.ndarray, y_pred: np.ndarray, *, reference: Optional[np.ndarray] = None) -> Dict[str, float]:
    """Full metric bundle for one (model, location, target, split).

    ``n`` counts rows that were actually scored, not rows that were passed in: a run
    whose predictions were all NaN reports ``n = 0`` and NaN metrics, rather than
    ``n = 60`` next to a blank MAE — the difference between "we measured nothing" and
    "we measured 60 months and they were all unusable".
    """
    scored, _ = _clean(y_true, y_pred)
    mape_value, guard = mae_daily_scale_mape(y_true, y_pred)
    out = {
        "mae": mae(y_true, y_pred),
        "rmse": rmse(y_true, y_pred),
        "bias": bias(y_true, y_pred),
        "r2": r2(y_true, y_pred),
        "pearson": pearson(y_true, y_pred),
        "mape_pct": mape_value,
        "mape_zero_guard_used": float(guard),
        "n": float(len(scored)),
    }
    if reference is not None:
        out["skill_vs_climatology"] = skill_score(y_true, y_pred, reference)
    return out
