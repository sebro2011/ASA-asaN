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

from cosmora_v3.evaluate import seed_stability
from cosmora_v3.metrics import summarise
from cosmora_v3.report import write_manifest
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


class ManifestScopeTests(unittest.TestCase):
    """A manifest must record what ran, not what was configured.

    ``--locations colombo`` on a three-city config produced a manifest reading
    ``"locations": [colombo, kandy, jaffna]``. Nothing was computed for Kandy or
    Jaffna; the manifest was describing the config file, and a reader would have
    taken it as scope.
    """

    CONFIG = {
        "config_hash": "testhash",
        "_source_path": "config/test.json",
        "seeds": [7, 21],
        "locations": [{"id": "colombo"}, {"id": "kandy"}, {"id": "jaffna"}],
    }

    def _manifest(self, extra):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            path = write_manifest(
                __import__("pathlib").Path(tmp),
                self.CONFIG,
                [],
                synthetic=False,
                quick=True,
                timing={"total_seconds": 1.0},
                extra=extra,
            )
            import json

            return json.loads(path.read_text(encoding="utf-8"))

    def test_configured_scope_is_named_as_configured(self) -> None:
        manifest = self._manifest({"locations_executed": ["colombo"]})
        self.assertEqual(manifest["locations_configured"], ["colombo", "kandy", "jaffna"])
        self.assertNotIn(
            "locations",
            manifest,
            "a bare 'locations' key reads as executed scope; use locations_configured",
        )

    def test_executed_scope_is_what_the_run_touched(self) -> None:
        manifest = self._manifest({"locations_executed": ["colombo"]})
        self.assertEqual(manifest["locations_executed"], ["colombo"])
        self.assertNotEqual(manifest["locations_executed"], manifest["locations_configured"])


class SeedStabilityTests(unittest.TestCase):
    """Dispersion across seeds must be measured inside one unit.

    ``seed_stability`` grouped by model alone, so a 0.3 °C model and a 3 mm/day model
    shared one distribution and the reported "spread" was mostly the gap between the two
    units. The mean, std and min/max of that mixture describe no physical quantity.
    """

    def _metrics(self) -> pd.DataFrame:
        rows = []
        for seed, jitter in [(7, 0.0), (21, 0.01), (42, -0.01)]:
            rows.append({"location": "colombo", "target": "temp", "model": "xgboost",
                         "mae": 0.30 + jitter})
            rows.append({"location": "colombo", "target": "rain", "model": "xgboost",
                         "mae": 2.70 + jitter * 10})
        return pd.DataFrame(rows)

    def test_rows_are_keyed_per_location_and_target(self) -> None:
        table = seed_stability(self._metrics())
        self.assertEqual(len(table), 2, "one row per (location, target, model), not one per model")
        self.assertIn("target", table.columns)
        self.assertEqual(set(table["target"]), {"temp", "rain"})
        self.assertEqual(set(table["seeds"]), {3})

    def test_spread_is_not_the_gap_between_units(self) -> None:
        table = seed_stability(self._metrics())
        temp = table.loc[table["target"] == "temp"].iloc[0]
        rain = table.loc[table["target"] == "rain"].iloc[0]
        # Within-unit spread is a fraction of a percent; pooling °C with mm/day would
        # have produced a std of roughly 1.6, i.e. a relative spread near 1.
        self.assertLess(temp["relative_spread"], 0.1)
        self.assertLess(rain["relative_spread"], 0.1)
        self.assertAlmostEqual(float(temp["std"]), 0.01, places=6)
        self.assertGreater(float(rain["mean"]) - float(temp["mean"]), 2.0)

    def test_mean_and_std_keep_the_units_scale(self) -> None:
        table = seed_stability(self._metrics())
        temp = table.loc[table["target"] == "temp"].iloc[0]
        self.assertAlmostEqual(float(temp["mean"]), 0.30, places=6)
        self.assertAlmostEqual(float(temp["min"]), 0.29, places=6)
        self.assertAlmostEqual(float(temp["max"]), 0.31, places=6)


if __name__ == "__main__":
    unittest.main()
