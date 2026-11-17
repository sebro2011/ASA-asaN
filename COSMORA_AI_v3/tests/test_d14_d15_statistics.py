"""D14 / D15 — the statistical tests behind the verdicts.

D14: the Diebold–Mariano test used a normal reference distribution and an
un-corrected HAC variance on n = 60 dependent monthly differentials. At n = 60 the
normal approximation inflated significance by up to 48% (0.0025 → 0.0037), and one row
crossed alpha after the correction. The test is now t-based with the
Harvey–Leybourne–Newbold small-sample factor.

D15: verdicts were read off 24 unadjusted p-values. They are now Benjamini–Hochberg
adjusted across the planned family, with raw and adjusted values reported side by side.
"""

from __future__ import annotations

import unittest

import numpy as np

import common  # noqa: F401  — imported for the sys.path side effect

from cosmora_v3.run import _apply_multiplicity
from cosmora_v3.stats import benjamini_hochberg, conclusion, diebold_mariano, newey_west_lrv


def reference_dm(errors_a: np.ndarray, errors_b: np.ndarray, lag: int) -> dict:
    """Straight-line re-implementation used to cross-check the vectorised version."""
    d = np.abs(errors_a) - np.abs(errors_b)
    n = len(d)
    mean = d.mean()
    gamma0 = np.sum((d - mean) ** 2) / n
    lrv = gamma0
    for k in range(1, lag + 1):
        gamma_k = np.sum((d[k:] - mean) * (d[:-k] - mean)) / n
        lrv += 2.0 * (1.0 - k / (lag + 1.0)) * gamma_k
    raw = mean / np.sqrt(lrv / n)
    factor = np.sqrt((n + 1 - 2 * lag + lag * (lag - 1) / n) / n)
    return {"stat": raw * factor, "lrv": lrv, "factor": factor, "raw": raw}


class DieboldMarianoTests(unittest.TestCase):
    def setUp(self) -> None:
        rng = np.random.default_rng(11)
        self.n = 60
        self.lag = 6
        # Autocorrelated differentials: an AR(1) with phi = 0.6, plus a small bias.
        eps = rng.normal(size=self.n)
        d = np.zeros(self.n)
        for t in range(1, self.n):
            d[t] = 0.6 * d[t - 1] + eps[t]
        base = np.abs(rng.normal(0, 1.0, self.n)) + 1.0
        self.a = base
        self.b = base + 0.3 + d

    def test_matches_reference_implementation(self) -> None:
        got = diebold_mariano(self.a, self.b, max_lag=self.lag)
        want = reference_dm(self.a, self.b, self.lag)
        self.assertAlmostEqual(got["dm_stat"], float(want["stat"]), places=10)
        self.assertAlmostEqual(got["hac_lrv"], float(want["lrv"]), places=10)
        self.assertAlmostEqual(got["factor"], float(want["factor"]), places=10)

    def test_t_reference_is_more_conservative_than_normal(self) -> None:
        got = diebold_mariano(self.a, self.b, max_lag=self.lag)
        self.assertGreater(got["p_value"], got["p_value_normal"])
        self.assertAlmostEqual(got["df"], self.n - 1)

    def test_small_sample_factor_shrinks_the_statistic(self) -> None:
        got = diebold_mariano(self.a, self.b, max_lag=self.lag, correction="none")
        corrected = diebold_mariano(self.a, self.b, max_lag=self.lag)
        self.assertLess(corrected["factor"], 1.0)
        self.assertLess(abs(corrected["dm_stat"]), abs(got["dm_stat"]))
        self.assertEqual(corrected["correction"], "hln")

    def test_hac_variance_exceeds_independence_assumption(self) -> None:
        """Ignoring serial correlation would understate the variance, hence overstate |t|."""
        d = np.abs(self.a) - np.abs(self.b)
        naive = np.sum((d - d.mean()) ** 2) / len(d)
        self.assertGreater(newey_west_lrv(d, self.lag), naive)

    def test_identical_models_have_no_statistic(self) -> None:
        errors = np.abs(np.random.default_rng(3).normal(size=self.n))
        got = diebold_mariano(errors, errors)
        self.assertFalse(np.isfinite(got["p_value"]))
        self.assertFalse(np.isfinite(got["dm_stat"]))

    def test_too_few_observations_returns_nan(self) -> None:
        for n in (0, 3, 7):
            got = diebold_mariano(np.ones(n), np.zeros(n))
            self.assertFalse(np.isfinite(got["p_value"]), msg=f"n={n}")

    def test_mismatched_lengths_return_nan(self) -> None:
        got = diebold_mariano(np.ones(30), np.zeros(31))
        self.assertFalse(np.isfinite(got["p_value"]))

    def test_sign_convention(self) -> None:
        """Positive statistic == the first model has the larger loss."""
        bigger = self.a + 2.0
        got = diebold_mariano(bigger, self.a)
        self.assertGreater(got["dm_stat"], 0.0)
        self.assertGreater(got["mean_loss_diff"], 0.0)

    def test_p_value_is_monotone_in_the_gap(self) -> None:
        """Fixed AR(1) noise, growing bias: the p-value must fall as the gap widens."""
        rng = np.random.default_rng(7)
        eps = rng.normal(size=120)
        noise = np.zeros(120)
        for t in range(1, 120):
            noise[t] = 0.5 * noise[t - 1] + eps[t]
        noise *= 0.2
        gaps = [0.05, 0.20, 0.80]
        p_values = [
            diebold_mariano(5.0 + gap + noise, np.full(120, 5.0), max_lag=3)["p_value"]
            for gap in gaps
        ]
        self.assertTrue(all(np.isfinite(p) for p in p_values))
        self.assertGreater(p_values[0], p_values[1])
        self.assertGreater(p_values[1], p_values[2])

    def test_squared_loss_option(self) -> None:
        got = diebold_mariano(self.a, self.b, max_lag=2, loss="squared")
        self.assertTrue(np.isfinite(got["dm_stat"]))
        with self.assertRaises(ValueError):
            diebold_mariano(self.a, self.b, loss="absolute-squared")

    def test_hln_inapplicable_when_lag_equals_n(self) -> None:
        """With lag = n the correction factor is exactly zero; say so, do not guess."""
        n = 30
        got = diebold_mariano(self.a[:n], self.b[:n], max_lag=n)
        self.assertEqual(got["correction"], "hln-inapplicable")
        self.assertEqual(got["factor"], 1.0)

    def test_verdict_uses_adjusted_p_when_supplied(self) -> None:
        delta = {"delta": -0.5, "ci_low": -0.9, "ci_high": -0.1}
        dm = {"p_value": 0.01, "dm_stat": -3.0}
        self.assertEqual(conclusion(delta, dm), "better")
        self.assertEqual(conclusion(delta, dm, q_value=0.20), "inconclusive (tests disagree)")


class BenjaminiHochbergTests(unittest.TestCase):
    def brute_force(self, p: np.ndarray) -> np.ndarray:
        m = len(p)
        order = np.argsort(p)
        out = np.empty(m)
        for rank, i in enumerate(order):
            out[i] = min(1.0, min(m * p[order[j]] / (j + 1) for j in range(rank, m)))
        return out

    def test_matches_brute_force(self) -> None:
        p = np.array([0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.94])
        got = benjamini_hochberg(p)
        np.testing.assert_allclose(got, self.brute_force(p), atol=1e-12)

    def test_adjusted_is_never_smaller_than_raw(self) -> None:
        p = np.random.default_rng(4).uniform(0, 1, 50)
        q = benjamini_hochberg(p)
        self.assertTrue(np.all(q >= p - 1e-12))
        self.assertTrue(np.all(q <= 1.0))

    def test_never_exceeds_bonferroni(self) -> None:
        p = np.random.default_rng(5).uniform(0, 1, 24)
        q = benjamini_hochberg(p)
        self.assertTrue(np.all(q <= np.minimum(1.0, len(p) * p) + 1e-12))

    def test_ordering_of_adjusted_values_follows_raw(self) -> None:
        p = np.random.default_rng(6).uniform(0, 1, 30)
        q = benjamini_hochberg(p)
        order = np.argsort(p)
        self.assertTrue(np.all(np.diff(q[order]) >= -1e-12))

    def test_nan_is_excluded_from_the_family(self) -> None:
        p = np.array([0.01, np.nan, 0.04])
        q = benjamini_hochberg(p)
        self.assertTrue(np.isnan(q[1]))
        # family size is 2, so the smallest p is multiplied by 2/1
        self.assertAlmostEqual(q[0], 0.02)

    def test_single_and_empty_inputs(self) -> None:
        self.assertAlmostEqual(float(benjamini_hochberg([0.03])[0]), 0.03)
        out = benjamini_hochberg([])
        self.assertEqual(out.size, 0)
        all_nan = benjamini_hochberg([np.nan, np.nan])
        self.assertTrue(np.all(np.isnan(all_nan)))

    def test_ties_are_handled(self) -> None:
        p = np.array([0.02, 0.02, 0.02, 0.02])
        q = benjamini_hochberg(p)
        np.testing.assert_allclose(q, np.full(4, 0.02))


class FamilyVerdictTests(unittest.TestCase):
    """The 24 planned comparisons: 3 cities × 2 targets × 4 members."""

    def _rows(self) -> list[dict]:
        rng = np.random.default_rng(9)
        rows = []
        for i in range(24):
            rows.append({
                "location": f"city{i // 8}",
                "target": "temp" if (i // 4) % 2 == 0 else "rain",
                "candidate": ["mlp", "gru", "lstm", "xgboost"][i % 4],
                "mae_delta_ensemble_minus_candidate": float(rng.normal(-0.1, 0.3)),
                "ci_low": -0.5, "ci_high": -0.01,
                "dm_p": float(min(0.99, abs(rng.normal(0.2, 0.25)))),
                "bootstrap_p": float(min(0.99, abs(rng.normal(0.2, 0.25)))),
                "verdict_raw": "better",
            })
        return rows

    def test_family_size_is_the_planned_one(self) -> None:
        rows = self._rows()
        _apply_multiplicity(rows)
        self.assertTrue(all(row["family_size"] == 24 for row in rows))
        self.assertTrue(all(row["dm_q"] >= row["dm_p"] - 1e-12 for row in rows))
        self.assertTrue(all(row["bootstrap_q"] >= row["bootstrap_p"] - 1e-12 for row in rows))

    def test_a_marginal_result_loses_its_claim(self) -> None:
        """p = 0.0499 alone is 'significant'; inside a family of 24 it is not."""
        rows = self._rows()
        for row in rows:
            row["dm_p"] = 0.5
            row["bootstrap_p"] = 0.5
        rows[0].update({"dm_p": 0.0499, "bootstrap_p": 0.0499, "verdict_raw": "better"})
        _apply_multiplicity(rows)
        self.assertGreater(rows[0]["dm_q"], 0.05)
        self.assertNotEqual(rows[0]["verdict"], "better")
        self.assertEqual(rows[0]["verdict_pre_correction"], "better")

    def test_a_clear_result_survives(self) -> None:
        rows = self._rows()
        for row in rows:
            row["dm_p"] = 0.8
            row["bootstrap_p"] = 0.8
        rows[0].update({"dm_p": 1e-6, "bootstrap_p": 1e-6, "verdict_raw": "better"})
        _apply_multiplicity(rows)
        self.assertLess(rows[0]["dm_q"], 0.05)
        self.assertEqual(rows[0]["verdict"], "better")


if __name__ == "__main__":
    unittest.main()
