"""D12 — walk-forward validation with overlapping folds must not double-count months.

When ``cv_step_months < cv_validation_months`` consecutive folds share months. The
pre-correction code concatenated every fold's predictions and described the result as
"n observations": 192 rows over 108 distinct months in the shipped configuration (+78%).
Sample counts, metrics and the conformal calibration all inherited that inflation.

These tests pin down the fix: instances are kept (nothing is discarded), months are the
unit that metrics and calibration describe, and both counts are reported.
"""

from __future__ import annotations

import unittest

import numpy as np
import pandas as pd

import common  # noqa: F401  — imported for the sys.path side effect

from cosmora_v3.evaluate import _month_level_validation, run_series


class MonthLevelCollapseTests(unittest.TestCase):
    def test_overlapping_folds_collapse_to_distinct_months(self) -> None:
        slot = {
            "index": [np.arange(0, 4), np.arange(2, 6)],
            "pred": [np.array([1.0, 2.0, 3.0, 4.0]), np.array([3.0, 4.0, 5.0, 6.0])],
            "true": [np.array([1.0, 2.0, 3.0, 4.0]), np.array([3.0, 4.0, 5.0, 6.0])],
        }
        months, instances = _month_level_validation(slot)
        self.assertEqual(instances, 8)          # nothing discarded
        self.assertEqual(len(months), 6)        # months 2 and 3 counted once
        self.assertEqual(list(months.index), [0, 1, 2, 3, 4, 5])
        # months covered twice average the two forecasts
        self.assertAlmostEqual(float(months.loc[2, "pred"]), 3.0)

    def test_instance_order_does_not_matter(self) -> None:
        rng = np.random.default_rng(1)
        idx = [np.arange(0, 5), np.arange(3, 8), np.arange(6, 10)]
        pred = [rng.normal(size=5), rng.normal(size=5), rng.normal(size=4)]
        true = [np.arange(5, dtype=float), np.arange(3, 8, dtype=float), np.arange(6, 10, dtype=float)]
        a, _ = _month_level_validation({"index": idx, "pred": pred, "true": true})
        b, _ = _month_level_validation(
            {"index": idx[::-1], "pred": pred[::-1], "true": true[::-1]}
        )
        pd.testing.assert_frame_equal(a, b)

    def test_inconsistent_truth_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            _month_level_validation(
                {
                    "index": [np.arange(0, 3), np.arange(2, 5)],
                    "pred": [np.zeros(3), np.zeros(3)],
                    "true": [np.array([1.0, 2.0, 3.0]), np.array([9.0, 4.0, 5.0])],
                }
            )

    def test_length_mismatch_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            _month_level_validation(
                {"index": [np.arange(0, 3)], "pred": [np.zeros(2)], "true": [np.zeros(3)]}
            )


class SeriesValidationCountsTests(unittest.TestCase):
    """End-to-end through ``run_series``: overlapping folds, real folding code.

    The models are trained for a single epoch on a short synthetic frame — this test is
    about which rows get counted, not about accuracy.
    """

    @classmethod
    def setUpClass(cls) -> None:
        cls.config = common.tiny_config()
        cls.config["splits"] = {
            "cv_initial_train_months": 48,
            "cv_validation_months": 12,
            "cv_step_months": 6,      # step < horizon: adjacent folds overlap by 6 months
            "test_months": 12,
        }
        # XGBoost dominates the wall-clock of a six-model pass; five trees are enough to
        # exercise the plumbing without making the suite wait for a real model.
        cls.config["models"]["xgboost"]["n_estimators"] = 5
        cls.seeds = [1]
        cls.result = run_series(
            common.synthetic_frame(months=132), "synthetic", "temp", cls.config,
            seeds=cls.seeds, max_folds=2, model_epochs_override=1, log=lambda _msg: None,
        )

    def test_counts_separate_instances_from_months(self) -> None:
        horizon = int(self.config["splits"]["cv_validation_months"])
        step = int(self.config["splits"]["cv_step_months"])
        self.assertEqual(len(self.result.fold_table), 2 * len(self.seeds))
        instances = self.result.validation_counts["forecast_instances"]
        months = self.result.validation_counts["distinct_months"]
        self.assertEqual(instances, 2 * horizon)
        self.assertEqual(months, horizon + step)
        self.assertGreater(instances, months)

    def test_metrics_validation_describes_months(self) -> None:
        table = self.result.metrics_validation
        self.assertFalse(table.empty)
        self.assertIn("n_instances", table.columns)
        self.assertEqual(int(table["n"].iloc[0]), int(self.result.validation_counts["distinct_months"]))
        self.assertEqual(
            int(table["n_instances"].iloc[0]), int(self.result.validation_counts["forecast_instances"])
        )

    def test_instance_table_keeps_every_forecast(self) -> None:
        table = self.result.metrics_validation_instances
        self.assertFalse(table.empty)
        self.assertEqual(
            int(table["n"].iloc[0]), int(self.result.validation_counts["forecast_instances"])
        )
        self.assertEqual(
            int(table["n_months"].iloc[0]), int(self.result.validation_counts["distinct_months"])
        )

    def test_conformal_calibration_uses_distinct_months(self) -> None:
        for model, interval in self.result.intervals.items():
            self.assertEqual(
                int(interval.n_calibration),
                int(self.result.validation_counts["distinct_months"]),
                msg=model,
            )


if __name__ == "__main__":
    unittest.main()
