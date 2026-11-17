"""Extreme rainfall: does the model that wins on average also see the deluge?

Two mistakes this module is designed to avoid.

* **Threshold leakage.** The extreme threshold is the ``q`` quantile of *training*
  rainfall only. Taking it from the full record — as a ">15 mm/day" style rule
  invites — bakes the test period into the definition of an event.
* **Ranking by average error.** A model can have the best MAE and still miss every
  extreme, because extremes are rare and contribute little to the mean. Precision,
  recall and the rank-AUC below are the counters.

POWER's ``PRECTOTCORR`` is a daily-rate quantity in mm/day, so thresholds stay in
mm/day throughout. A monthly total would need a days-in-month factor, and mixing
the two is the most common unit error in this kind of analysis.
"""

from __future__ import annotations

from typing import Dict

import numpy as np

from .metrics import mae, rmse


def rank_auc(scores: np.ndarray, labels: np.ndarray) -> float:
    """Mann–Whitney AUC: P(score of a positive > score of a negative)."""
    scores = np.asarray(scores, dtype="float64").reshape(-1)
    labels = np.asarray(labels, dtype=bool).reshape(-1)
    positives = scores[labels]
    negatives = scores[~labels]
    if len(positives) == 0 or len(negatives) == 0:
        return float("nan")
    order = np.argsort(np.concatenate([positives, negatives]), kind="mergesort")
    ranks = np.empty(len(order), dtype="float64")
    ranks[order] = np.arange(1, len(order) + 1)
    rank_sum = ranks[: len(positives)].sum()
    return float((rank_sum - len(positives) * (len(positives) + 1) / 2.0) / (len(positives) * len(negatives)))


def analyse(
    train_observations: np.ndarray,
    test_observations: np.ndarray,
    test_predictions: np.ndarray,
    quantile: float,
) -> Dict[str, float]:
    """Threshold-constrained evaluation of one model's rainfall predictions."""
    train_observations = np.asarray(train_observations, dtype="float64").reshape(-1)
    test_observations = np.asarray(test_observations, dtype="float64").reshape(-1)
    test_predictions = np.asarray(test_predictions, dtype="float64").reshape(-1)

    # "higher" interpolation: the threshold is an observed rainfall amount, so an
    # event is defined by a value that actually occurred in the training record.
    threshold = float(np.quantile(train_observations, quantile, method="higher"))
    observed_event = test_observations >= threshold
    predicted_event = test_predictions >= threshold

    tp = int(np.sum(observed_event & predicted_event))
    fp = int(np.sum(~observed_event & predicted_event))
    fn = int(np.sum(observed_event & ~predicted_event))

    precision = tp / (tp + fp) if (tp + fp) else float("nan")
    recall = tp / (tp + fn) if (tp + fn) else float("nan")
    f1 = (
        2 * precision * recall / (precision + recall)
        if np.isfinite(precision) and np.isfinite(recall) and (precision + recall) > 0
        else float("nan")
    )

    event_rows = observed_event
    out = {
        "threshold_mm_per_day": threshold,
        "threshold_quantile": float(quantile),
        "train_months": float(len(train_observations)),
        "test_months": float(len(test_observations)),
        "observed_events": float(observed_event.sum()),
        "predicted_events": float(predicted_event.sum()),
        "true_positives": float(tp),
        "false_positives": float(fp),
        "false_negatives": float(fn),
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "underprediction_rate_on_events": float(np.mean(test_predictions[event_rows] < test_observations[event_rows]))
        if event_rows.any()
        else float("nan"),
        "mae_on_events": mae(test_observations[event_rows], test_predictions[event_rows]) if event_rows.any() else float("nan"),
        "rmse_on_events": rmse(test_observations[event_rows], test_predictions[event_rows]) if event_rows.any() else float("nan"),
        "max_observed": float(test_observations.max()) if len(test_observations) else float("nan"),
        "max_predicted": float(test_predictions.max()) if len(test_predictions) else float("nan"),
        "rank_auc": rank_auc(test_predictions, observed_event),
    }
    return out
