"""NumPy implementations of MLP, GRU and LSTM with analytic gradients.

Why hand-written instead of a framework: the deep models have to run wherever the
report is reproduced, with no multi-gigabyte CUDA wheel to download, and every
gradient in this file is verified against finite differences in
``tests/test_gradients.py``. That test is the licence to trust the numbers this
package produces — without it, "GRU" would be a claim rather than an artefact.

Conventions
-----------
* Inputs are 2-D ``(n, d)`` for the MLP and 3-D ``(n, lookback, d)`` for the RNNs.
* The target is standardised internally with statistics of the rows passed to
  ``fit`` only, and ``predict`` returns original units.
* Loss is mean squared error; the optimiser is Adam with decoupled L2 penalty.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Tuple

import numpy as np


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -60.0, 60.0)))


def _he(rng: np.random.Generator, shape: Tuple[int, ...]) -> np.ndarray:
    fan_in = shape[0]
    return rng.normal(0.0, np.sqrt(2.0 / max(fan_in, 1)), size=shape)


@dataclass
class AdamState:
    m: Dict[str, np.ndarray] = field(default_factory=dict)
    v: Dict[str, np.ndarray] = field(default_factory=dict)
    t: int = 0

    def step(
        self,
        params: Dict[str, np.ndarray],
        grads: Dict[str, np.ndarray],
        lr: float,
        weight_decay: float = 0.0,
        beta1: float = 0.9,
        beta2: float = 0.999,
        eps: float = 1e-8,
    ) -> None:
        self.t += 1
        for name, grad in grads.items():
            if weight_decay:
                grad = grad + weight_decay * params[name]
            if name not in self.m:
                self.m[name] = np.zeros_like(grad)
                self.v[name] = np.zeros_like(grad)
            self.m[name] = beta1 * self.m[name] + (1 - beta1) * grad
            self.v[name] = beta2 * self.v[name] + (1 - beta2) * (grad * grad)
            m_hat = self.m[name] / (1 - beta1**self.t)
            v_hat = self.v[name] / (1 - beta2**self.t)
            params[name] -= lr * m_hat / (np.sqrt(v_hat) + eps)


class _BaseNet:
    """Shared training loop: chronological inner validation, Adam, early stopping.

    The inner split is positional (earliest rows train, latest rows validate) because
    the data are a time series: a random split would let the model early-stop on a
    month it has effectively already seen through its neighbours. ``inner_val_rows_``
    records how many rows the early-stopping decision actually used.
    """

    def __init__(self, epochs: int = 300, batch_size: int = 32, lr: float = 0.005,
                 weight_decay: float = 1e-4, patience: int = 40, seed: int = 42,
                 inner_val_fraction: float = 0.2) -> None:
        self.epochs = epochs
        self.batch_size = batch_size
        self.lr = lr
        self.weight_decay = weight_decay
        self.patience = patience
        self.seed = seed
        self.inner_val_fraction = inner_val_fraction
        self.params: Dict[str, np.ndarray] = {}
        self.y_mean_: float = 0.0
        self.y_std_: float = 1.0
        self.history: List[Dict[str, float]] = []

    # -- to be provided by subclasses -------------------------------------
    def _init_params(self, rng: np.random.Generator, n_features: int) -> None:
        raise NotImplementedError

    def _forward(self, X: np.ndarray, params: Dict[str, np.ndarray]) -> Tuple[np.ndarray, Dict[str, np.ndarray]]:
        raise NotImplementedError

    def _backward(self, cache: Dict[str, np.ndarray], dy: np.ndarray,
                  params: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        raise NotImplementedError

    # -- training ----------------------------------------------------------
    def fit(self, X: np.ndarray, y: np.ndarray) -> "_BaseNet":
        rng = np.random.default_rng(self.seed)
        self.y_mean_ = float(np.mean(y))
        self.y_std_ = float(np.std(y)) or 1.0
        y_scaled = (y - self.y_mean_) / self.y_std_
        n = len(X)

        # Chronological inner split: the earliest (1 - fraction) of the rows train,
        # the most recent `fraction` early-stop. The earlier revision wrote
        # `max(int(n * (1 - f)), n - 1)`, and since n - 1 > n * (1 - f) for every
        # n > 5 the held-out set collapsed to a single row: best-epoch selection was
        # then driven by one month's error. See docs/DEFECT_REPORT.md D11.
        split = int(round(n * (1.0 - self.inner_val_fraction)))
        split = min(max(split, 1), n - 1) if n > 1 else n
        train_idx = np.arange(split)
        val_idx = np.arange(split, n)
        # Recorded so a test (and a reader) can check the split rather than trust it.
        # Inner validation is chronological by construction: val_idx follows train_idx
        # in time, and no row appears in both.
        self.inner_split_ = int(split)
        self.inner_val_rows_ = int(n - split)

        self._init_params(rng, X.shape[-1])
        optimiser = AdamState()
        best_loss = np.inf
        best_params = {k: v.copy() for k, v in self.params.items()}
        stale = 0

        for epoch in range(self.epochs):
            order = rng.permutation(train_idx)
            for start in range(0, len(order), self.batch_size):
                batch = order[start : start + self.batch_size]
                if len(batch) < 2:
                    continue
                pred, cache = self._forward(X[batch], self.params)
                residual = pred.reshape(-1) - y_scaled[batch]
                grad_out = (2.0 / len(batch)) * residual.reshape(-1, 1)
                grads = self._backward(cache, grad_out, self.params)
                optimiser.step(self.params, grads, self.lr, self.weight_decay)

            if len(val_idx):
                val_pred, _ = self._forward(X[val_idx], self.params)
                val_loss = float(np.mean((val_pred.reshape(-1) - y_scaled[val_idx]) ** 2))
            else:
                val_loss = float("nan")
            train_pred, _ = self._forward(X[train_idx], self.params)
            train_loss = float(np.mean((train_pred.reshape(-1) - y_scaled[train_idx]) ** 2))
            self.history.append({"epoch": epoch, "train_mse": train_loss, "val_mse": val_loss})

            if np.isfinite(val_loss) and val_loss < best_loss - 1e-6:
                best_loss = val_loss
                best_params = {k: v.copy() for k, v in self.params.items()}
                stale = 0
            else:
                stale += 1
                if stale >= self.patience:
                    break

        if np.isfinite(best_loss):
            self.params = best_params
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        pred, _ = self._forward(X, self.params)
        return pred.reshape(-1) * self.y_std_ + self.y_mean_

    def export(self) -> Dict[str, np.ndarray]:
        return {k: v.copy() for k, v in self.params.items()}

    def load(self, state: Dict[str, np.ndarray]) -> "_BaseNet":
        self.params = {k: np.array(v, dtype="float64") for k, v in state.items()}
        return self


class MLPRegressor(_BaseNet):
    """Two hidden layers over the flattened feature row.

    ``activation="relu"`` is the production default. ``"tanh"`` exists so the
    finite-difference gradient check in ``tests/test_gradients.py`` is not straddling
    a ReLU kink: at ``pre == 0`` the numerical and analytic derivatives legitimately
    disagree, which would make the test flaky rather than informative.
    """

    def __init__(self, hidden: List[int] | None = None, activation: str = "relu", **kwargs) -> None:
        super().__init__(**kwargs)
        self.hidden = hidden or [32, 16]
        if activation not in {"relu", "tanh"}:
            raise ValueError(f"unsupported activation {activation!r}")
        self.activation = activation

    def _init_params(self, rng: np.random.Generator, n_features: int) -> None:
        sizes = [n_features] + list(self.hidden) + [1]
        self.params = {}
        for i in range(len(sizes) - 1):
            self.params[f"W{i}"] = _he(rng, (sizes[i], sizes[i + 1]))
            self.params[f"b{i}"] = np.zeros(sizes[i + 1])

    def _forward(self, X: np.ndarray, params: Dict[str, np.ndarray]) -> Tuple[np.ndarray, Dict[str, np.ndarray]]:
        activations = [X]
        pre = []
        h = X
        layers = len(params) // 2
        for i in range(layers):
            z = h @ params[f"W{i}"] + params[f"b{i}"]
            pre.append(z)
            if i < layers - 1:
                h = np.maximum(z, 0.0) if self.activation == "relu" else np.tanh(z)
            else:
                h = z
            activations.append(h)
        return h, {"activations": activations, "pre": pre}

    def _backward(self, cache: Dict[str, np.ndarray], dy: np.ndarray,
                  params: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        grads: Dict[str, np.ndarray] = {}
        activations = cache["activations"]
        layers = len(params) // 2
        delta = dy
        for i in reversed(range(layers)):
            grads[f"W{i}"] = activations[i].T @ delta
            grads[f"b{i}"] = delta.sum(axis=0)
            if i > 0:
                upstream = delta @ params[f"W{i}"].T
                if self.activation == "relu":
                    delta = upstream * (cache["pre"][i - 1] > 0)
                else:
                    delta = upstream * (1.0 - np.tanh(cache["pre"][i - 1]) ** 2)
        return grads


class _RecurrentRegressor(_BaseNet):
    """Shared head and training-loop shape for GRU/LSTM."""

    cell = "gru"

    def __init__(self, hidden: int = 24, **kwargs) -> None:
        super().__init__(**kwargs)
        self.hidden = hidden

    def _gate_count(self) -> int:
        return 3 if self.cell == "gru" else 4

    def _init_params(self, rng: np.random.Generator, n_features: int) -> None:
        g = self._gate_count()
        self.params = {
            "W": _he(rng, (n_features, g * self.hidden)),
            "U": _he(rng, (self.hidden, g * self.hidden)),
            "b": np.zeros(g * self.hidden),
            "Wy": _he(rng, (self.hidden, 1)),
            "by": np.zeros(1),
        }

    def _forward(self, X: np.ndarray, params: Dict[str, np.ndarray]):
        if X.ndim != 3:
            raise ValueError("recurrent models expect (n, lookback, features)")
        batch, steps, _ = X.shape
        H = self.hidden

        W, U, b = params["W"], params["U"], params["b"]
        h = np.zeros((batch, H))
        c = np.zeros((batch, H)) if self.cell == "lstm" else None

        gates_hist: List[Dict[str, np.ndarray]] = []
        h_hist = [h.copy()]
        c_hist = [c.copy()] if c is not None else []

        for t in range(steps):
            x_t = X[:, t, :]
            pre = x_t @ W + h @ U + b
            if self.cell == "gru":
                z = _sigmoid(pre[:, :H])
                r = _sigmoid(pre[:, H : 2 * H])
                n = np.tanh(x_t @ W[:, 2 * H :] + (r * h) @ U[:, 2 * H :] + b[2 * H :])
                h_new = (1.0 - z) * n + z * h
                gates_hist.append({"z": z, "r": r, "n": n, "h_prev": h})
                h = h_new
                h_hist.append(h.copy())
            else:
                i_g = _sigmoid(pre[:, :H])
                f_g = _sigmoid(pre[:, H : 2 * H])
                o_g = _sigmoid(pre[:, 2 * H : 3 * H])
                g_g = np.tanh(pre[:, 3 * H :])
                c_new = f_g * c + i_g * g_g
                tanh_c = np.tanh(c_new)
                h_new = o_g * tanh_c
                gates_hist.append({"i": i_g, "f": f_g, "o": o_g, "g": g_g, "c_prev": c,
                                   "tanh_c": tanh_c, "h_prev": h})
                c = c_new
                h = h_new
                h_hist.append(h.copy())
                c_hist.append(c.copy())

        pred = h @ params["Wy"] + params["by"]
        cache = {
            "X": X, "gates": gates_hist, "h_hist": h_hist,
            "c_hist": c_hist, "h_last": h,
        }
        return pred, cache

    def _backward(self, cache: Dict[str, np.ndarray], dy: np.ndarray,
                  params: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        H = self.hidden
        X = cache["X"]
        gates_hist = cache["gates"]
        h_last = cache["h_last"]
        batch, steps, _ = X.shape

        grads = {
            "W": np.zeros_like(params["W"]),
            "U": np.zeros_like(params["U"]),
            "b": np.zeros_like(params["b"]),
            "Wy": h_last.T @ dy,
            "by": dy.sum(axis=0),
        }

        dh_next = dy @ params["Wy"].T
        dc_next = np.zeros((batch, H))
        U = params["U"]

        for t in reversed(range(steps)):
            gate = gates_hist[t]
            x_t = X[:, t, :]
            h_prev = gate["h_prev"]

            if self.cell == "gru":
                z, r, n = gate["z"], gate["r"], gate["n"]
                dz = dh_next * (h_prev - n)
                dn = dh_next * (1.0 - z)
                dh_next = dh_next * z

                dp_z = dz * z * (1.0 - z)

                dn_pre = dn * (1.0 - n * n)
                # d/d(r*h) = d/dn_pre . Un ; then chain through r = sigmoid(.) and
                # through h_prev. Dropping the h_prev factor here is the classic
                # silent BPTT bug: training still converges, just to a worse optimum.
                d_r_times_h = dn_pre @ U[:, 2 * H :].T
                dp_r = (d_r_times_h * h_prev) * r * (1.0 - r)
                dh_next = dh_next + d_r_times_h * r

                grads["W"][:, :H] += x_t.T @ dp_z
                grads["W"][:, H : 2 * H] += x_t.T @ dp_r
                grads["W"][:, 2 * H :] += x_t.T @ dn_pre
                grads["U"][:, :H] += h_prev.T @ dp_z
                grads["U"][:, H : 2 * H] += h_prev.T @ dp_r
                grads["U"][:, 2 * H :] += (r * h_prev).T @ dn_pre
                grads["b"][:H] += dp_z.sum(axis=0)
                grads["b"][H : 2 * H] += dp_r.sum(axis=0)
                grads["b"][2 * H :] += dn_pre.sum(axis=0)

                dh_next = dh_next + dp_z @ U[:, :H].T + dp_r @ U[:, H : 2 * H].T
            else:
                i_g, f_g, o_g, g_g = gate["i"], gate["f"], gate["o"], gate["g"]
                c_prev, tanh_c = gate["c_prev"], gate["tanh_c"]

                do = dh_next * tanh_c
                dc = dc_next + dh_next * o_g * (1.0 - tanh_c * tanh_c)
                df = dc * c_prev
                di = dc * g_g
                dg = dc * i_g
                dc_next = dc * f_g

                dp_o = do * o_g * (1.0 - o_g)
                dp_i = di * i_g * (1.0 - i_g)
                dp_f = df * f_g * (1.0 - f_g)
                dp_g = dg * (1.0 - g_g * g_g)

                grads["W"][:, :H] += x_t.T @ dp_i
                grads["W"][:, H : 2 * H] += x_t.T @ dp_f
                grads["W"][:, 2 * H : 3 * H] += x_t.T @ dp_o
                grads["W"][:, 3 * H :] += x_t.T @ dp_g
                grads["U"][:, :H] += h_prev.T @ dp_i
                grads["U"][:, H : 2 * H] += h_prev.T @ dp_f
                grads["U"][:, 2 * H : 3 * H] += h_prev.T @ dp_o
                grads["U"][:, 3 * H :] += h_prev.T @ dp_g
                grads["b"][:H] += dp_i.sum(axis=0)
                grads["b"][H : 2 * H] += dp_f.sum(axis=0)
                grads["b"][2 * H : 3 * H] += dp_o.sum(axis=0)
                grads["b"][3 * H :] += dp_g.sum(axis=0)

                dh_next = (
                    dp_i @ U[:, :H].T
                    + dp_f @ U[:, H : 2 * H].T
                    + dp_o @ U[:, 2 * H : 3 * H].T
                    + dp_g @ U[:, 3 * H :].T
                )

        return grads


class GRURegressor(_RecurrentRegressor):
    cell = "gru"


class LSTMRegressor(_RecurrentRegressor):
    cell = "lstm"


def numerical_gradient(
    net: _BaseNet, X: np.ndarray, y_scaled: np.ndarray, name: str, index: Tuple[int, ...],
    eps: float = 1e-6,
) -> float:
    """Central difference of the MSE loss w.r.t. one parameter element."""
    def loss() -> float:
        pred, _ = net._forward(X, net.params)
        return float(np.mean((pred.reshape(-1) - y_scaled) ** 2))

    original = net.params[name][index]
    net.params[name][index] = original + eps
    plus = loss()
    net.params[name][index] = original - eps
    minus = loss()
    net.params[name][index] = original
    return (plus - minus) / (2 * eps)
