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


def newey_west_lrv(differentials: np.ndarray, max_lag: int) -> float:
    """Newey–West long-run variance of the loss differential (Bartlett kernel).

    ``gamma_0 + 2 * sum_k w_k gamma_k`` with ``w_k = 1 - k/(L+1)``. The kernel
    guarantees a non-negative estimate, which the plain sample covariance of an
    autocorrelated series does not.
    """
    d = _as_1d(differentials)
    n = len(d)
    if n < 2:
        return float("nan")
    demeaned = d - float(np.mean(d))
    lrv = float(np.dot(demeaned, demeaned) / n)
    for lag in range(1, min(int(max_lag), n - 1) + 1):
        weight = 1.0 - lag / (max_lag + 1.0)
        lrv += 2.0 * weight * float(np.dot(demeaned[lag:], demeaned[:-lag]) / n)
    return lrv


def diebold_mariano(
    errors_a: np.ndarray,
    errors_b: np.ndarray,
    *,
    max_lag: int = 6,
    loss: str = "absolute",
    correction: str = "hln",
) -> Dict[str, float]:
    """Diebold–Mariano test of equal expected loss, small-sample corrected.

    Three things the naive version got wrong, all fixed here:

    * **Reference distribution.** ``dm_stat`` is referred to Student's t with
      ``n - 1`` degrees of freedom, not the standard normal. At n = 60 the normal
      approximation inflates significance by up to ~48% (measured: p 0.0025 → 0.0037).
    * **Small-sample bias of the HAC variance.** The Harvey–Leybourne–Newbold (1997)
      correction multiplies the statistic by
      ``sqrt((n + 1 - 2h + h(h-1)/n) / n)``, with ``h`` the forecast horizon
      (``max_lag``). Without it the statistic is biased upward in short samples.
    * **Serial correlation in the loss differentials.** Variance is the Newey–West
      HAC estimate, so consecutive months are not treated as independent draws.

    ``p_value`` is the corrected, t-based value that verdicts must use.
    ``p_value_normal`` is kept so the size of the correction is visible rather than
    asserted. ``hac_lrv`` and ``lag_used`` are recorded for audit.
    """
    a = np.abs(_as_1d(errors_a))
    b = np.abs(_as_1d(errors_b))
    empty = {
        "dm_stat": float("nan"), "p_value": float("nan"), "p_value_normal": float("nan"),
        "mean_loss_diff": float("nan"), "hac_lrv": float("nan"), "df": float("nan"),
        "lag_used": float(max_lag), "correction": "none", "factor": float("nan"),
    }
    if a.shape != b.shape or len(a) < 8:
        return empty

    if loss == "absolute":
        d = a - b
    elif loss == "squared":
        d = a ** 2 - b ** 2
    else:
        raise ValueError(f"unknown loss {loss!r}")

    n = len(d)
    d_mean = float(np.mean(d))
    h = int(max_lag)
    lrv = newey_west_lrv(d, h)
    if not np.isfinite(lrv) or lrv <= 0.0:
        out = dict(empty)
        out.update({"mean_loss_diff": d_mean, "hac_lrv": lrv, "df": float(n - 1)})
        return out

    dm_raw = d_mean / math.sqrt(lrv / n)

    factor = 1.0
    applied = "none"
    if correction == "hln":
        numerator = n + 1 - 2 * h + h * (h - 1) / n
        if numerator > 0:
            factor = math.sqrt(numerator / n)
            applied = "hln"
        else:
            applied = "hln-inapplicable"
    elif correction not in (None, "none"):
        raise ValueError(f"unknown correction {correction!r}")

    dm_stat = dm_raw * factor

    from scipy import stats as _sps  # scipy already arrives with scikit-learn

    df = n - 1
    p_value = float(2.0 * _sps.t.sf(abs(dm_stat), df=df))
    p_normal = float(math.erfc(abs(dm_stat) / math.sqrt(2.0)))
    return {
        "dm_stat": float(dm_stat),
        "p_value": p_value,
        "p_value_normal": p_normal,
        "mean_loss_diff": d_mean,
        "hac_lrv": float(lrv),
        "df": float(df),
        "lag_used": float(h),
        "correction": applied,
        "factor": float(factor),
    }


def benjamini_hochberg(pvalues: Sequence[float]) -> np.ndarray:
    """Benjamini–Hochberg step-up adjustment (q-values).

    Takes a family of p-values and returns adjusted values with the property
    ``q_(i) = min_{j >= i} (m * p_(j) / j)``, capped at 1. ``NaN`` entries are
    excluded from the family and returned as ``NaN``: a test whose p-value could not
    be computed cannot make the others look better.
    """
    p = np.asarray(list(pvalues), dtype="float64").reshape(-1)
    out = np.full(p.shape, np.nan, dtype="float64")
    finite = np.isfinite(p)
    m = int(finite.sum())
    if m == 0:
        return out
    idx = np.where(finite)[0]
    order = idx[np.argsort(p[idx], kind="mergesort")]
    adjusted = np.empty(m, dtype="float64")
    running = 1.0
    for rank in range(m - 1, -1, -1):
        i = order[rank]
        running = min(running, p[i] * m / (rank + 1))
        adjusted[rank] = running
    out[order] = np.clip(adjusted, 0.0, 1.0)
    return out


def conclusion(
    delta: Dict[str, float],
    dm: Dict[str, float],
    alpha: float = 0.05,
    *,
    q_value: float | None = None,
) -> str:
    """Turn numbers into one of three sentences — no over-claiming.

    A difference is called an improvement only when the paired-bootstrap interval
    excludes zero **and** the Diebold–Mariano p-value (``q_value`` when a
    multiplicity-adjusted value is supplied) is below ``alpha``.
    """
    if not np.isfinite(delta.get("delta", float("nan"))):
        return "insufficient data"
    significant_bootstrap = delta["ci_low"] > 0 or delta["ci_high"] < 0
    p_used = float(q_value) if q_value is not None else float(dm.get("p_value", float("nan")))
    significant_dm = bool(np.isfinite(p_used) and p_used < alpha)
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
    """Raw (uncorrected) comparison. Multiplicity correction happens across the whole
    family in :func:`cosmora_v3.run.finalise_comparisons`, not here."""
    delta = paired_bootstrap(reference_errors, candidate_errors, resamples=resamples, seed=seed)
    dm = diebold_mariano(reference_errors, candidate_errors, max_lag=max_lag)
    return delta, dm, conclusion(delta, dm)
