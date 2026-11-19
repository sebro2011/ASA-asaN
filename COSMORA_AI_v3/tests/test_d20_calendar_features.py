"""D20 — lags and rolling windows must follow the calendar, not the row order.

`Series.shift(k)` moves rows. The pipeline drops a month that contains a fill
sentinel (`data.py`, whole-month drop), so with one month missing every later
lag silently returns a value from further back than its name says: "lag1" for
2020-09 returned the 2020-07 value once 2020-08 was dropped, and `roll12`
spanned thirteen calendar months. Nothing errored and nothing was flagged; the
reported run is unaffected only because it has `dropped_months = 0`.

The fix reindexes to a complete monthly calendar before any shift, so a gap
becomes a NaN row that the existing notna mask drops. These tests assert the
calendar contract directly, and assert that the defective behaviour (a mis-lagged
row reaching the model) cannot recur.
"""

from __future__ import annotations

import unittest

import numpy as np
import pandas as pd

from cosmora_v3.features import build_features


def frame(months: int = 120) -> pd.DataFrame:
    index = pd.period_range("2010-01", periods=months, freq="M").to_timestamp()
    values = np.arange(months, dtype="float64")
    return pd.DataFrame({"t2m": values, "rain": values * 2.0}, index=index)


def config() -> dict:
    return {
        "features": {
            "lookback_months": 12,
            "lags": [1, 2, 3, 6, 12],
            "rolling_windows": [3, 6, 12],
            "include_calendar": True,
            "include_time_index": True,
        },
        "targets": {"temp": {"column": "t2m"}},
    }


class CalendarLags(unittest.TestCase):
    def test_lag_k_is_the_value_k_calendar_months_back(self) -> None:
        data = frame()
        X, y, _ = build_features(data, config(), "temp")
        for lag in (1, 2, 3, 6, 12):
            for month in X.index[::17]:
                expected = data.loc[month - pd.DateOffset(months=lag), "t2m"]
                self.assertAlmostEqual(X.loc[month, f"t2m_lag{lag}"], expected)
        self.assertEqual(len(X), len(y))

    def test_a_missing_month_is_dropped_instead_of_shifting_every_later_lag(self) -> None:
        data = frame()
        gap_month = data.index[60]
        holed = data.drop(gap_month)

        X_full, _, _ = build_features(data, config(), "temp")
        X_holed, _, _ = build_features(holed, config(), "temp")

        # The month immediately after the gap cannot be described from history
        # (its lag-1 does not exist), so it must not appear in the matrix at all.
        next_month = data.index[61]
        self.assertIn(next_month, X_full.index)
        self.assertNotIn(
            next_month,
            X_holed.index,
            "a row whose lag-1 is missing must be dropped, not silently filled with lag-2",
        )

        # Everything that survives still carries calendar-true lags.
        for month in X_holed.index:
            for lag in (1, 2, 3, 6, 12):
                source = month - pd.DateOffset(months=lag)
                if source in holed.index:
                    self.assertAlmostEqual(X_holed.loc[month, f"t2m_lag{lag}"], holed.loc[source, "t2m"])

    def test_rolling_windows_span_missing_calendar_months_not_extra_rows(self) -> None:
        data = frame()
        holed = data.drop(data.index[60])
        X_holed, _, _ = build_features(holed, config(), "temp")
        for month in X_holed.index:
            window_start = month - pd.DateOffset(months=12)
            # A 12-month window ending the month before `month` must cover exactly
            # the previous twelve calendar months: shift(1) then rolling(12).
            span = pd.date_range(window_start, month - pd.DateOffset(months=1), freq="MS")
            if any(day not in holed.index for day in span):
                self.assertNotIn(month, X_holed.index, "a window spanning a gap must not be built")
            else:
                expected = holed.loc[span, "t2m"].mean()
                self.assertAlmostEqual(X_holed.loc[month, "t2m_roll12_mean"], expected)

    def test_a_gapless_frame_is_unchanged_by_the_reindex(self) -> None:
        data = frame()
        X, _, spec = build_features(data, config(), "temp")
        self.assertEqual(spec.lookback, 12)
        self.assertTrue(np.all(np.isfinite(X.to_numpy())))


if __name__ == "__main__":
    unittest.main()
