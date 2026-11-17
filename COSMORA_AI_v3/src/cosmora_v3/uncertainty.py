"""Calibrated prediction intervals (split conformal).

v2 promised "±1.96σ" intervals. That is a *distributional assumption*, not a
calibration: if the residuals are skewed — which rainfall residuals always are —
the nominal 95% band can cover 80% of outcomes and nobody would notice, because
coverage was never measured.

This module measures it. ``SplitConformal`` takes residuals from the walk-forward
**validation** folds (never the test tail), computes the finite-sample quantile

    q = quantile(|r|, ceil((n+1)(1-alpha)) / n)

and the interval is ``prediction ± q``. The test tail then reports *empirical*
coverage, mean width and the Winkler score — so a claim of "90% intervals" is a
number the reader can check against ``coverage_test`` in the results table.

A Gaussian baseline (±1.96σ of validation residuals) is computed alongside, since
v2 used it; reporting both is the only honest way to show what the old assumption
cost.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List

import numpy as np

from .metrics import interval_score


def conformal_quantile(residuals: np.ndarray, alpha: float) -> float:
    """Finite-sample split-conformal quantile of absolute residuals."""
    abs_residuals = np.abs(np.asarray(residuals, dtype="float64").reshape(-1))
    abs_residuals = abs_residuals[np.isfinite(abs_residuals)]
    n = len(abs_residuals)
    if n == 0:
        raise ValueError("cannot calibrate on zero residuals")
    rank = math.ceil((n + 1) * (1.0 - alpha)) / n
    rank = min(rank, 1.0)
    return float(np.quantile(abs_residuals, rank, method="higher"))


@dataclass
class SplitConformal:
    alpha: float
    q: float
    n_calibration: int
    gaussian_sigma: float

    def interval(self, predictions: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        predictions = np.asarray(predictions, dtype="float64")
        return predictions - self.q, predictions + self.q

    def gaussian_interval(self, predictions: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        predictions = np.asarray(predictions, dtype="float64")
        half = 1.959963984540054 * self.gaussian_sigma
        return predictions - half, predictions + half

    def describe(self) -> Dict[str, float]:
        return {
            "alpha": self.alpha,
            "nominal_coverage": 1.0 - self.alpha,
            "conformal_half_width": self.q,
            "gaussian_half_width": 1.959963984540054 * self.gaussian_sigma,
            "n_calibration": self.n_calibration,
        }


def calibrate(predictions: np.ndarray, observations: np.ndarray, alpha: float) -> SplitConformal:
    residuals = np.asarray(observations, dtype="float64") - np.asarray(predictions, dtype="float64")
    return calibrate_residuals(residuals, alpha)


def calibrate_residuals(residuals: np.ndarray, alpha: float) -> SplitConformal:
    """Build a calibrated interval directly from signed validation residuals."""
    residuals = np.asarray(residuals, dtype="float64").reshape(-1)
    sigma = float(np.std(residuals, ddof=1)) if len(residuals) > 1 else 0.0
    return SplitConformal(
        alpha=alpha,
        q=conformal_quantile(residuals, alpha),
        n_calibration=int(len(residuals)),
        gaussian_sigma=sigma,
    )


def evaluate_intervals(
    observations: np.ndarray, predictions: np.ndarray, interval: SplitConformal
) -> Dict[str, float]:
    """Coverage of both interval types on whatever rows are passed in."""
    lower, upper = interval.interval(predictions)
    conformal = interval_score(observations, lower, upper, interval.alpha)
    g_lo, g_hi = interval.gaussian_interval(predictions)
    gaussian = interval_score(observations, g_lo, g_hi, interval.alpha)
    return {
        "coverage_conformal": conformal["coverage"],
        "width_conformal": conformal["mean_width"],
        "winkler_conformal": conformal["winkler"],
        "coverage_gaussian": gaussian["coverage"],
        "width_gaussian": gaussian["mean_width"],
        "winkler_gaussian": gaussian["winkler"],
        "nominal_coverage": 1.0 - interval.alpha,
    }


def per_seed_band(predictions: List[np.ndarray], level: float = 0.90) -> tuple[np.ndarray, np.ndarray]:
    """Spread across seeds — model-initialisation uncertainty, not weather noise.

    Reported separately from the conformal band, because the two answer different
    questions: this one says "how much does the answer move if we retrain?", the
    conformal one says "how far off is a single prediction?".
    """
    if len(predictions) < 2:
        base = np.asarray(predictions[0], dtype="float64")
        return base, base
    stacked = np.vstack([np.asarray(p, dtype="float64") for p in predictions])
    tail = (1.0 - level) / 2.0
    return (
        np.quantile(stacked, tail, axis=0),
        np.quantile(stacked, 1.0 - tail, axis=0),
    )
