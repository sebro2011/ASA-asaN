"""Leakage-safe feature construction.

The contract, in one sentence: **a row for month t may only contain information
that was available at the end of month t-1.**

That rules out, by construction:

* centred or forward-looking rolling windows (``center=True``, ``bfill``);
* interpolation across the target month;
* a scaler whose mean or variance was computed on the whole record;
* any feature that is a function of ``y_t`` itself.

``time_index`` deserves a note. It is the month's position on a fixed calendar
origin, which is a deterministic function of the date and therefore known before
the month happens — unlike, say, the record's total length, which changes when a
new month is appended and would make earlier features drifts upward over time.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

import numpy as np
import pandas as pd


def _complete_monthly_index(frame: pd.DataFrame) -> pd.DataFrame:
    """Reindex to a gap-free monthly calendar before any shift (D20).

    ``Series.shift(k)`` and ``rolling(w)`` move *rows*, not calendar months. The
    pipeline drops a month that contains a fill sentinel (``data.py``), so after
    one dropped month ``shift(1)`` for the next month silently returns the value
    from two months back, and ``roll12`` spans thirteen calendar months — every
    downstream number is wrong with no error.

    Reindexing to the full monthly range turns each gap into a NaN row. The
    notna mask below then drops that row, so a gap costs one training row and
    every lag stays calendar-true. ``dropped_months = 0`` in the reported run,
    where this is a no-op; it is the live path that needed it.
    """
    if not isinstance(frame.index, pd.DatetimeIndex) or frame.empty:
        return frame
    full = pd.date_range(frame.index.min(), frame.index.max(), freq="MS")
    if len(full) == len(frame):
        return frame
    complete = frame.reindex(full)
    complete.index.name = frame.index.name
    return complete


@dataclass
class FeatureSpec:
    """Names and layout of one feature matrix, so prediction can rebuild it."""

    columns: List[str]
    target_column: str
    lookback: int

    @property
    def input_dim(self) -> int:
        return len(self.columns)


def build_features(frame: pd.DataFrame, config: Dict[str, Any], target_key: str) -> tuple[pd.DataFrame, np.ndarray, FeatureSpec]:
    """Return (X, y, spec) for one location and one target.

    ``X`` is indexed by the *target* month: row ``t`` predicts ``y_t`` from data up
    to and including ``t-1``.
    """
    feat_cfg = config["features"]
    target_cfg = config["targets"][target_key]
    target_col = target_cfg["column"]
    if target_col not in frame.columns:
        raise KeyError(f"column {target_col!r} missing from frame")

    lookback = int(feat_cfg["lookback_months"])
    values = frame.sort_index()
    values = _complete_monthly_index(values)

    features: Dict[str, pd.Series] = {}

    # Every input is shifted at least one month: the predictor for t never sees t.
    for column in values.columns:
        shifted = values[column].shift(1)
        for lag in feat_cfg["lags"]:
            features[f"{column}_lag{int(lag)}"] = values[column].shift(int(lag))
        for window in feat_cfg["rolling_windows"]:
            features[f"{column}_roll{int(window)}_mean"] = shifted.rolling(int(window)).mean()
            features[f"{column}_roll{int(window)}_std"] = shifted.rolling(int(window)).std()

    if feat_cfg.get("include_calendar", True):
        month = values.index.month.to_numpy(dtype="float64")
        features["month_sin"] = pd.Series(np.sin(2 * np.pi * month / 12), index=values.index)
        features["month_cos"] = pd.Series(np.cos(2 * np.pi * month / 12), index=values.index)

    if feat_cfg.get("include_time_index", True):
        # Fixed calendar origin (2000-01 = 0), not "months since series start".
        months_since_2000 = (
            (values.index.year - 2000) * 12 + (values.index.month - 1)
        ).to_numpy(dtype="float64")
        features["time_index"] = pd.Series(months_since_2000 / 120.0, index=values.index)

    X = pd.DataFrame(features, index=values.index)
    y = values[target_col].astype("float64")

    # Drop only rows that cannot be built from history. No filling, no interpolation.
    valid = X.notna().all(axis=1) & y.notna()
    X = X.loc[valid]
    y = y.loc[valid]
    if len(X) <= lookback:
        raise ValueError("not enough complete rows to build a dataset")

    spec = FeatureSpec(columns=list(X.columns), target_column=target_col, lookback=lookback)
    return X, y.to_numpy(dtype="float64"), spec


def sequence_view(X: np.ndarray, spec: FeatureSpec) -> np.ndarray:
    """Reshape a flat matrix into ``(n, lookback, d)`` windows for the RNNs.

    The window ending at row ``t`` is made of the feature rows ``t-lookback+1..t``,
    all of which already exclude month ``t`` itself. Padding uses the earliest
    available row repeated backwards, which is still *past-only* information.
    """
    n, d = X.shape
    lookback = spec.lookback
    out = np.empty((n, lookback, d), dtype="float64")
    for i in range(n):
        start = i - lookback + 1
        if start >= 0:
            out[i] = X[start : i + 1]
        else:
            pad = X[0:1].repeat(-start, axis=0)
            out[i] = np.vstack([pad, X[0 : i + 1]])
    return out


class TrainOnlyScaler:
    """Standardisation fitted on training rows and applied everywhere else.

    ``fit`` must receive only rows the model is allowed to learn from. The class is
    deliberately explicit rather than a scikit-learn transformer so the call sites
    read as an assertion: ``scaler.fit(X_train)``.
    """

    def __init__(self) -> None:
        self.mean_: np.ndarray | None = None
        self.scale_: np.ndarray | None = None

    def fit(self, X: np.ndarray) -> "TrainOnlyScaler":
        self.mean_ = X.mean(axis=0)
        scale = X.std(axis=0)
        scale[scale < 1e-9] = 1.0
        self.scale_ = scale
        return self

    def transform(self, X: np.ndarray) -> np.ndarray:
        if self.mean_ is None or self.scale_ is None:
            raise RuntimeError("scaler used before fit")
        return (X - self.mean_) / self.scale_

    def fit_transform(self, X: np.ndarray) -> np.ndarray:
        return self.fit(X).transform(X)

    def inverse(self, X: np.ndarray) -> np.ndarray:
        if self.mean_ is None or self.scale_ is None:
            raise RuntimeError("scaler used before fit")
        return X * self.scale_ + self.mean_

    def state(self) -> Dict[str, List[float]]:
        assert self.mean_ is not None and self.scale_ is not None
        return {"mean": self.mean_.tolist(), "scale": self.scale_.tolist()}
