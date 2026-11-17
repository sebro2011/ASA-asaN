"""Known-answer tests for metrics, conformal intervals and the statistics layer."""

from __future__ import annotations

import unittest

import numpy as np

import common  # noqa: F401  — imported for the sys.path side effect

from cosmora_v3 import metrics
from cosmora_v3.extreme import analyse, rank_auc
from cosmora_v3.stats import diebold_mariano, paired_bootstrap, conclusion
from cosmora_v3.uncertainty import calibrate_residuals, evaluate_intervals


class MetricTests(unittest.TestCase):
    def test_hand_computed_values(self) -> None:
        y = np.array([1.0, 2.0, 3.0, 4.0])
        p = np.array([1.0, 2.0, 3.0, 6.0])
        self.assertAlmostEqual(metrics.mae(y, p), 0.5)
        self.assertAlmostEqual(metrics.rmse(y, p), 1.0)
        self.assertAlmostEqual(metrics.bias(y, p), 0.5)
        self.assertAlmostEqual(metrics.r2(y, p), 1.0 - 4.0 / 5.0)

    def test_perfect_prediction(self) -> None:
        y = np.array([3.1, 3.2, 3.3, 3.4, 3.5])
        self.assertAlmostEqual(metrics.mae(y, y), 0.0)
        self.assertAlmostEqual(metrics.r2(y, y), 1.0)
        self.assertAlmostEqual(metrics.bias(y, y), 0.0)

    def test_skill_score_against_climatology(self) -> None:
        y = np.array([1.0, 2.0, 3.0, 2.0])
        reference = np.full(4, 2.0)
        better = np.array([1.1, 2.1, 2.9, 2.1])
        worse = np.array([0.0, 0.0, 0.0, 0.0])
        self.assertGreater(metrics.skill_score(y, better, reference), 0.0)
        self.assertLess(metrics.skill_score(y, worse, reference), 0.0)

    def test_mape_reports_when_the_zero_guard_matters(self) -> None:
        value, guard = metrics.mae_daily_scale_mape(np.array([0.0, 0.0, 1.0]), np.array([0.1, 0.1, 1.0]))
        self.assertTrue(guard)
        self.assertTrue(np.isfinite(value))
        _, guard_dry = metrics.mae_daily_scale_mape(np.array([5.0, 6.0, 7.0]), np.array([5.1, 6.1, 7.1]))
        self.assertFalse(guard_dry)

    def test_nan_rows_are_dropped_not_counted(self) -> None:
        y = np.array([1.0, np.nan, 3.0])
        p = np.array([1.0, 2.0, 3.0])
        self.assertAlmostEqual(metrics.mae(y, p), 0.0)


class UncertaintyTests(unittest.TestCase):
    def test_conformal_half_width_grows_with_residual_scale(self) -> None:
        rng = np.random.default_rng(0)
        narrow = calibrate_residuals(rng.normal(0, 0.5, 400), alpha=0.1)
        wide = calibrate_residuals(rng.normal(0, 2.0, 400), alpha=0.1)
        self.assertLess(narrow.q, wide.q)
        self.assertGreater(narrow.q, 0.0)

    def test_coverage_is_close_to_nominal_on_held_out_draws(self) -> None:
        rng = np.random.default_rng(1)
        calibration = rng.normal(0, 1.0, 2000)
        interval = calibrate_residuals(calibration, alpha=0.10)
        held_out = rng.normal(0, 1.0, 4000)
        predictions = np.zeros_like(held_out)
        scores = evaluate_intervals(held_out, predictions, interval)
        self.assertAlmostEqual(scores["coverage_conformal"], 0.90, delta=0.03)
        # The Gaussian band is reported alongside so the reader can see the difference.
        self.assertIn("coverage_gaussian", scores)

    def test_wider_alpha_gives_narrower_band(self) -> None:
        rng = np.random.default_rng(2)
        residuals = rng.normal(0, 1.0, 500)
        self.assertLess(calibrate_residuals(residuals, 0.30).q, calibrate_residuals(residuals, 0.05).q)


class StatisticsTests(unittest.TestCase):
    def test_identical_models_are_not_distinguishable(self) -> None:
        errors = np.abs(np.random.default_rng(3).normal(0, 1, 120))
        delta, dm, verdict = paired_bootstrap(errors, errors, resamples=500, seed=1), diebold_mariano(errors, errors), None
        self.assertAlmostEqual(delta["delta"], 0.0, places=12)
        verdict = conclusion(delta, dm)
        self.assertEqual(verdict, "not distinguishable")

    def test_clear_improvement_is_detected(self) -> None:
        rng = np.random.default_rng(4)
        good = np.abs(rng.normal(0, 0.5, 200))
        bad = np.abs(rng.normal(0, 2.0, 200))
        delta = paired_bootstrap(good, bad, resamples=1000, seed=2)
        dm = diebold_mariano(good, bad)
        self.assertLess(delta["delta"], 0.0)
        self.assertLess(delta["ci_high"], 0.0)
        self.assertLess(dm["p_value"], 0.05)
        self.assertEqual(conclusion(delta, dm), "better")


class ExtremeTests(unittest.TestCase):
    def test_threshold_comes_from_training_data_only(self) -> None:
        train = np.array([1.0] * 95 + [20.0] * 5)
        test = np.array([1.0, 30.0, 2.0, 25.0])
        predictions = np.array([1.0, 28.0, 1.0, 2.0])
        result = analyse(train, test, predictions, quantile=0.95)
        self.assertAlmostEqual(result["threshold_mm_per_day"], 20.0)
        self.assertEqual(result["observed_events"], 2.0)
        self.assertEqual(result["true_positives"], 1.0)
        self.assertEqual(result["false_negatives"], 1.0)

    def test_rank_auc_is_one_for_perfect_ordering(self) -> None:
        self.assertAlmostEqual(rank_auc(np.array([1.0, 2.0, 3.0, 4.0]), np.array([False, False, True, True])), 1.0)
        self.assertAlmostEqual(rank_auc(np.array([4.0, 3.0, 2.0, 1.0]), np.array([False, False, True, True])), 0.0)


if __name__ == "__main__":
    unittest.main()
