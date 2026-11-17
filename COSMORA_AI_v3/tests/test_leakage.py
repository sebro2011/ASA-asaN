"""Leakage guards, tested by trying to leak.

The strong test is the perturbation test: change the observation at month *T* and
confirm that no feature row at or before *T* moves. Anything that looks forward —
a centred window, an interpolation, a full-record scaler — fails immediately.
"""

from __future__ import annotations

import unittest

import numpy as np
import pandas as pd

import common

from cosmora_v3.features import TrainOnlyScaler, build_features


class LeakageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = common.tiny_config()
        self.frame = common.synthetic_frame(months=96, seed=3)

    def test_future_observation_does_not_reach_past_features(self) -> None:
        X, y_raw, _ = build_features(self.frame, self.config, "temp")
        y = pd.Series(y_raw, index=X.index)
        perturb_date = self.frame.index[70]

        perturbed = self.frame.copy()
        perturbed.loc[perturb_date, "t2m"] += 25.0
        X2, y2_raw, _ = build_features(perturbed, self.config, "temp")
        y2 = pd.Series(y2_raw, index=X2.index)

        # Every feature row that *predicts* a month strictly before the perturbed one
        # must be byte-identical: no window, no interpolation may look forward.
        earlier = X.index[X.index < perturb_date]
        np.testing.assert_allclose(X.loc[earlier].to_numpy(), X2.loc[earlier].to_numpy(), rtol=0, atol=1e-12)

        # The row predicting the perturbed month is built from history only, so it is
        # unchanged — while the *target* at that month moves, because that is the
        # observation we edited. This pair of facts is exactly what "no leakage" means.
        np.testing.assert_allclose(
            X.loc[[perturb_date]].to_numpy(), X2.loc[[perturb_date]].to_numpy(), rtol=0, atol=1e-12
        )
        self.assertNotAlmostEqual(float(y.loc[perturb_date]), float(y2.loc[perturb_date]))
        # Later rows may change, legitimately, through their lagged inputs.
        later = X.index[X.index > perturb_date]
        self.assertFalse(np.allclose(X.loc[later].to_numpy(), X2.loc[later].to_numpy()))

    def test_target_month_is_absent_from_its_own_features(self) -> None:
        X, y, spec = build_features(self.frame, self.config, "rain")
        # No feature may be the unshifted target series.
        self.assertNotIn(spec.target_column, spec.columns)
        for column in spec.columns:
            self.assertTrue(
                column.startswith(("t2m_", "rain_", "rh_", "wind_", "solar_"))
                or column in {"month_sin", "month_cos", "time_index"},
                f"unexpected feature {column}",
            )
        # Every weather feature carries an explicit lag or a trailing window.
        weather = [c for c in spec.columns if c.startswith(("t2m_", "rain_", "rh_", "wind_", "solar_"))]
        for column in weather:
            self.assertRegex(column, r"_(lag|roll)\d+", f"{column} has no lag/rolling marker")

    def test_time_index_is_calendar_not_record_position(self) -> None:
        """Appending months must not rewrite earlier rows' time_index."""
        X, _, spec = build_features(self.frame, self.config, "temp")
        longer = pd.concat([self.frame, self.frame.tail(12).set_index(
            pd.period_range("2008-01", periods=12, freq="M").to_timestamp()
        )])
        X_long, _, _ = build_features(longer, self.config, "temp")
        shared = X.index.intersection(X_long.index)
        pd.testing.assert_series_equal(
            X.loc[shared, "time_index"], X_long.loc[shared, "time_index"], check_names=False
        )

    def test_scaler_uses_training_rows_only(self) -> None:
        X, _, _ = build_features(self.frame, self.config, "temp")
        matrix = X.to_numpy(dtype="float64")
        train = matrix[:50]

        scaler = TrainOnlyScaler().fit(train)
        self.assertIsNotNone(scaler.mean_)
        np.testing.assert_allclose(scaler.mean_, train.mean(axis=0))

        scaled = scaler.transform(matrix)
        # Training rows come out centred; later rows must not (unless coincidence).
        np.testing.assert_allclose(scaled[:50].mean(axis=0), 0.0, atol=1e-9)
        self.assertGreater(np.abs(scaled[50:].mean(axis=0)).max(), 1e-6)

    def test_no_fill_sentinels_reach_the_model(self) -> None:
        X, y, _ = build_features(self.frame, self.config, "temp")
        self.assertTrue(np.isfinite(X.to_numpy()).all())
        self.assertTrue(np.isfinite(y).all())


if __name__ == "__main__":
    unittest.main()
