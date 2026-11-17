"""Finite-difference verification of every hand-written gradient.

This is the test that makes the words "GRU" and "LSTM" mean something in this
package. A silent sign error in BPTT still produces a model that trains — it just
trains to a worse optimum — so the failure would show up as a suspiciously weak
baseline rather than a crash. Comparing each analytic gradient against a central
difference removes that whole class of doubt.
"""

from __future__ import annotations

import unittest

import numpy as np

import common  # noqa: F401  — imported for the sys.path side effect

from cosmora_v3.nn import GRURegressor, LSTMRegressor, MLPRegressor, numerical_gradient


def _analytic_gradients(net, X, y_scaled):
    pred, cache = net._forward(X, net.params)
    dy = (2.0 / len(y_scaled)) * (pred.reshape(-1) - y_scaled).reshape(-1, 1)
    return net._backward(cache, dy, net.params)


class GradientTests(unittest.TestCase):
    def setUp(self) -> None:
        self.rng = np.random.default_rng(7)

    def _check(self, net, X, atol=2e-4, samples=6):
        y = self.rng.normal(size=len(X))
        y_scaled = (y - y.mean()) / (y.std() or 1.0)
        net._init_params(np.random.default_rng(11), X.shape[-1])
        grads = _analytic_gradients(net, X, y_scaled)

        checked = 0
        for name, grad in grads.items():
            flat_analytic = grad.reshape(-1)
            step = max(len(flat_analytic) // samples, 1)
            for flat_index in range(0, len(flat_analytic), step):
                index = np.unravel_index(flat_index, grad.shape)
                numeric = numerical_gradient(net, X, y_scaled, name, index)
                analytic = flat_analytic[flat_index]
                self.assertAlmostEqual(
                    analytic, numeric, delta=atol,
                    msg=f"{type(net).__name__}.{name}{index}: analytic={analytic:.6f} numeric={numeric:.6f}",
                )
                checked += 1
        self.assertGreater(checked, 10, "the gradient check must exercise a meaningful number of entries")

    def test_mlp_gradients(self) -> None:
        X = self.rng.normal(size=(12, 5))
        X = self.rng.normal(size=(12, 5))
        # tanh: a ReLU kink at pre==0 makes central differences ambiguous, which would
        # test the tester rather than the gradient.
        self._check(MLPRegressor(hidden=[6, 4], activation="tanh", epochs=1), X)

    def test_gru_gradients(self) -> None:
        X = self.rng.normal(size=(10, 4, 3))
        self._check(GRURegressor(hidden=4, epochs=1), X)

    def test_lstm_gradients(self) -> None:
        X = self.rng.normal(size=(10, 4, 3))
        self._check(LSTMRegressor(hidden=4, epochs=1), X)


if __name__ == "__main__":
    unittest.main()
