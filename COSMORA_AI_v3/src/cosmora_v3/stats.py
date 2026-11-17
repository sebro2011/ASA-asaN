"""Statistical evidence for model comparison.

Rule of the exercise: no model is called better without a test that could have said
otherwise. Two instruments are used together.

* **Paired bootstrap** over forecast rows (resample months, not models) gives a
  confidence interval for the MAE difference. It makes no distributional
  assumption, which matters because monthly rainfall errors are strongly skewed.
* **Diebold–Mariano** tests the null hypothesis of equal expected loss, using a
  Newey–West variance to absorb autocorrelation in the loss differentials —
  consecutive months are not independent, and a naive t-test would overstate
  significance.

A difference is reported as an improvement only when the bootstrap interval
excludes zero *and* DM does not reject the null at 5%. Otherwise the honest
statement is "not distinguishable on this sample".
"""

from __future__ import annotations

import math
from typing import Dict, Sequence, Tuple

import numpy as np


def _as_1d(values: Sequence[float] | np.ndarray) -> np.ndarray:
    return np.asarray(values, dtype="float64").reshape(-1)


def paired_bootstrap(
    errors_a: np.ndarray,
    errors_b: np.ndarray,
    *,
    resamples: int = 5000,
    seed: int = 12345,
    statistic: str = "mae",
) -> Dict[str, float]:
    """Bootstrap CI for ``loss(a) - loss(b)``. Negative favours ``a``."""
    a = np.abs(_as_1d(errors_a))
    b = np.abs(_as_1d(errors_b))
    if a.shape != b.shape:
        raise ValueError("error vectors must align")
    rng = np.random.default_rng(seed)
    n = len(a)
    if n < 5:
        return {"delta": float("nan"), "ci_low": float("nan"), "ci_high": float("nan"),
                "p_two_sided": float("nan"), "n": float(n)}

    if statistic != "mae":
        raise ValueError("only the MAE statistic is supported")

    observed = float(np.mean(a) - np.mean(b))
    deltas = np.empty(resamples)
    for i in range(resamples):
        idx = rng.integers(0, n, n)
        deltas[i] = a[idx].mean() - b[idx].mean()

    ci_low, ci_high = np.quantile(deltas, [0.025, 0.975])
    # Two-sided bootstrap p-value for H0: delta = 0, centred on the observed value.
    centred = deltas - observed
    p_two_sided = float(np.mean(np.abs(centred) >= abs(observed)))
    return {
        "delta": observed,
        "ci_low": float(ci_low),
        "ci_high": float(ci_high),
        "p_two_sided": p_two_sided,
        "n": float(n),
    }


def diebold_mariano(
    errors_a: np.ndarray,
    errors_b: np.ndarray,
    *,
    max_lag: int = 6,
    loss: str = "absolute",
) -> Dict[str, float]:
    """DM statistic on the loss differential with Newey–West variance."""
    a = np.abs(_as_1d(errors_a))
    b = np.abs(_as_1d(errors_b))
    if a.shape != b.shape or len(a) < 8:
        return {"dm_stat": float("nan"), "p_value": float("nan"), "mean_loss_diff": float("nan")}

    if loss == "absolute":
        d = a - b
    elif loss == "squared":
        d = a**2 - b**2
    else:
        raise ValueError(f"unknown loss {loss!r}")

    n = len(d)
    d_mean = float(np.mean(d))
    demeaned = d - d_mean

    lrv = float(np.dot(demeaned, demeaned) / n)
    for lag in range(1, min(max_lag, n - 1) + 1):
        weight = 1.0 - lag / (max_lag + 1.0)
        cov = float(np.dot(demeaned[lag:], demeaned[:-lag]) / n)
        lrv += 2.0 * weight * cov
    if lrv <= 0:
        return {"dm_stat": float("nan"), "p_value": float("nan"), "mean_loss_diff": d_mean}

    dm_stat = d_mean / math.sqrt(lrv / n)
    p_value = math.erfc(abs(dm_stat) / math.sqrt(2.0))  # two-sided normal approximation
    return {"dm_stat": float(dm_stat), "p_value": float(p_value), "mean_loss_diff": d_mean}


def conclusion(delta: Dict[str, float], dm: Dict[str, float], alpha: float = 0.05) -> str:
    """Turn numbers into one of three sentences — no over-claiming."""
    if not np.isfinite(delta.get("delta", float("nan"))):
        return "insufficient data"
    significant_bootstrap = delta["ci_low"] > 0 or delta["ci_high"] < 0
    significant_dm = np.isfinite(dm.get("p_value", float("nan"))) and dm["p_value"] < alpha
    if significant_bootstrap and significant_dm:
        return "better" if delta["delta"] < 0 else "worse"
    if significant_bootstrap != significant_dm:
        return "inconclusive (tests disagree)"
    return "not distinguishable"


def summarise_comparison(
    reference_errors: np.ndarray,
    candidate_errors: np.ndarray,
    *,
    resamples: int,
    seed: int,
    max_lag: int,
) -> Tuple[Dict[str, float], Dict[str, float], str]:
    delta = paired_bootstrap(reference_errors, candidate_errors, resamples=resamples, seed=seed)
    dm = diebold_mariano(reference_errors, candidate_errors, max_lag=max_lag)
    return delta, dm, conclusion(delta, dm)
