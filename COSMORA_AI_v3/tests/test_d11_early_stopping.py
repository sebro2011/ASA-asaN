"""D11 — the early-stopping split must actually hold out the intended fraction.

The pre-correction code computed ``split = max(int(n * (1 - f)), n - 1)``. Because
``n - 1 > n * (1 - f)`` for every n > 5, ``max`` always returned ``n - 1`` and the inner
validation set was a single row: the best epoch was chosen by one month's error.

These tests fail on that code and pass on the current one.
"""

from __future__ import annotations

import unittest

import numpy as np

import common  # noqa: F401  — imported for the sys.path side effect

from cosmora_v3.nn import GRURegressor, LSTMRegressor, MLPRegressor


def toy(n: int = 200, features: int = 8, seed: int = 0):
    rng = np.random.default_rng(seed)
    X = rng.normal(size=(n, features))
    y = 2.0 * X[:, 0] - 1.5 * X[:, 1] + 0.10 * rng.normal(size=n)
    return X, y


class EarlyStoppingSplitTests(unittest.TestCase):
    def test_n200_f020_holds_out_40_rows(self) -> None:
        """The audited configuration: 200 rows, 20% validation → 160 / 40."""
        X, y = toy(200)
        net = MLPRegressor(hidden=[8], epochs=5, patience=3, seed=1).fit(X, y)
        self.assertEqual(net.inner_split_, 160)
        self.assertEqual(net.inner_val_rows_, 40)

    def test_validation_fraction_is_respected_across_sizes(self) -> None:
        for n in (20, 40, 60, 200, 300):
            for fraction in (0.10, 0.20, 0.25):
                X, y = toy(n)
                net = MLPRegressor(
                    hidden=[8], epochs=2, patience=2, seed=1, inner_val_fraction=fraction
                ).fit(X, y)
                expected = int(round(n * fraction))
                self.assertEqual(
                    net.inner_val_rows_, expected,
                    msg=f"n={n} fraction={fraction}: held out {net.inner_val_rows_}, expected {expected}",
                )

    def test_split_is_a_partition_in_time_order(self) -> None:
        """Train and validation partitions must be disjoint, in order, and cover n.

        The arrays are positional, so this is equivalent to asserting that every
        validation row is strictly later than every training row.
        """
        X, y = toy(120)
        net = MLPRegressor(hidden=[8], epochs=2, patience=2, seed=1).fit(X, y)
        train_idx = np.arange(0, net.inner_split_)
        val_idx = np.arange(net.inner_split_, len(X))
        self.assertEqual(net.inner_split_ + net.inner_val_rows_, len(X))
        self.assertEqual(int(np.intersect1d(train_idx, val_idx).size), 0)
        self.assertLess(train_idx.max(), val_idx.min())

    def test_validation_block_only_steers_stopping_never_gradients(self) -> None:
        """The held-out rows may change *when* training stops, never *what* it learns.

        With early stopping effectively disabled (huge patience) and the target left
        untouched, replacing the validation block's features must leave every training
        gradient step bit-identical — while the validation loss itself changes, proving
        the block is genuinely read.
        """
        X, y = toy(200)
        split = 160
        X2 = X.copy()
        rng = np.random.default_rng(99)
        X2[split:] = rng.normal(scale=50.0, size=X[split:].shape)

        kwargs = dict(hidden=[8], epochs=5, patience=10**6, seed=3)
        a = MLPRegressor(**kwargs).fit(X, y)
        b = MLPRegressor(**kwargs).fit(X2, y)

        self.assertEqual(len(a.history), len(b.history))
        for step_a, step_b in zip(a.history, b.history):
            self.assertEqual(step_a["train_mse"], step_b["train_mse"])
        self.assertNotEqual(a.history[-1]["val_mse"], b.history[-1]["val_mse"])

    def test_gru_and_lstm_share_the_contract(self) -> None:
        rng = np.random.default_rng(5)
        X = rng.normal(size=(200, 6, 4))
        y = 2.0 * X[:, -1, 0] + 0.1 * rng.normal(size=200)
        for cls in (GRURegressor, LSTMRegressor):
            net = cls(hidden=6, epochs=2, patience=2, seed=1).fit(X, y)
            self.assertEqual(net.inner_split_, 160, msg=cls.__name__)
            self.assertEqual(net.inner_val_rows_, 40, msg=cls.__name__)

    def test_tiny_input_still_trains_without_crashing(self) -> None:
        """One training row and one validation row is degenerate but must not crash."""
        X, y = toy(2)
        net = MLPRegressor(hidden=[4], epochs=2, patience=1, seed=1).fit(X, y)
        self.assertEqual(net.inner_split_, 1)
        self.assertEqual(net.inner_val_rows_, 1)


if __name__ == "__main__":
    unittest.main()
