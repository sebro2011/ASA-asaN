"""Reporting-layer contracts.

Mutation testing found these untested: reverting the fix that keeps °C and mm/day
apart still left the suite green, and a run whose predictions were all NaN reported
``n = 60`` beside a blank MAE. Both are presentation failures that make a broken run
look like a measured one, so they get their own tests.
"""

from __future__ import annotations

import unittest

import numpy as np
import pandas as pd

import common  # noqa: F401  — imported for the sys.path side effect

from cosmora_v3.metrics import summarise
from cosmora_v3.run import _pivot_test_mae


class SummaryTests(unittest.TestCase):
    def test_n_counts_scored_rows_not_supplied_rows(self) -> None:
        truth = np.array([1.0, 2.0, 3.0, 4.0])
        pred = np.array([1.0, np.nan, 3.0, np.nan])
        bundle = summarise(truth, pred)
        self.assertEqual(bundle["n"], 2.0)
        self.assertAlmostEqual(bundle["mae"], 0.0)

    def test_all_nan_predictions_report_zero_rows(self) -> None:
        """The failure mode from the empty-training-window bug: blank metrics, honest n."""
        truth = np.arange(24, dtype="float64")
        pred = np.full(24, np.nan)
        bundle = summarise(truth, pred)
        self.assertEqual(bundle["n"], 0.0)
        self.assertTrue(np.isnan(bundle["mae"]))

    def test_targets_are_never_pooled(self) -> None:
        frame = pd.DataFrame([
            {"target": "temp", "model": "gru", "mae": 0.6},
            {"target": "rain", "model": "gru", "mae": 2.6},
            {"target": "temp", "model": "ensemble", "mae": 0.5},
            {"target": "rain", "model": "ensemble", "mae": 2.4},
        ])
        pivoted = _pivot_test_mae(frame)
        # degC and mm/day must stay in separate keys, at their own scale.
        self.assertEqual(set(pivoted), {"temp/gru", "rain/gru", "temp/ensemble", "rain/ensemble"})
        self.assertAlmostEqual(pivoted["temp/gru"], 0.6)
        self.assertAlmostEqual(pivoted["rain/gru"], 2.6)
        self.assertNotAlmostEqual(pivoted["temp/gru"], pivoted["rain/gru"])


if __name__ == "__main__":
    unittest.main()
