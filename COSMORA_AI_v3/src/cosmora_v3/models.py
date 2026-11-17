"""Model registry: MLP, GRU, LSTM, XGBoost and the GRU+LSTM+MLP ensemble.

Every model exposes the same two calls — ``fit(X, y)`` and ``predict(X)`` — on the
*flat* feature matrix. Sequence models reshape internally, so a fold is defined
once and every model sees exactly the same rows. That is what makes the
"identical test periods" requirement structural rather than a promise in prose.
"""

from __future__ import annotations

from typing import Any, Dict, List, Sequence

import numpy as np

from .features import sequence_view
from .nn import GRURegressor, LSTMRegressor, MLPRegressor


class BaseModel:
    name = "base"
    uses_sequences = False

    def fit(self, X: np.ndarray, y: np.ndarray) -> "BaseModel":
        raise NotImplementedError

    def predict(self, X: np.ndarray) -> np.ndarray:
        raise NotImplementedError

    def export_state(self) -> Dict[str, Any]:
        return {}


class SklearnishModel(BaseModel):
    """Wraps anything with scikit-learn's ``fit``/``predict`` signature."""

    def __init__(self, estimator: Any, name: str) -> None:
        self.estimator = estimator
        self.name = name

    def fit(self, X: np.ndarray, y: np.ndarray) -> "SklearnishModel":
        self.estimator.fit(X, y)
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        return np.asarray(self.estimator.predict(X), dtype="float64").reshape(-1)


class XGBoostModel(SklearnishModel):
    def __init__(self, cfg: Dict[str, Any], seed: int) -> None:
        from xgboost import XGBRegressor  # imported lazily so the rest works without it

        estimator = XGBRegressor(
            objective="reg:squarederror",
            tree_method="hist",
            random_state=seed,
            n_jobs=4,
            **cfg,
        )
        super().__init__(estimator, name="xgboost")


class NeuralModel(BaseModel):
    """MLP (flat) or GRU/LSTM (sequenced) backed by :mod:`cosmora_v3.nn`."""

    def __init__(self, kind: str, cfg: Dict[str, Any], seed: int, lookback: int) -> None:
        self.name = kind
        self.lookback = lookback
        common = dict(
            epochs=int(cfg.get("epochs", 300)),
            batch_size=int(cfg.get("batch_size", 32)),
            lr=float(cfg.get("lr", 0.005)),
            weight_decay=float(cfg.get("weight_decay", 1e-4)),
            patience=int(cfg.get("patience", 40)),
            seed=seed,
        )
        if kind == "mlp":
            self.net = MLPRegressor(hidden=list(cfg.get("hidden", [32, 16])), **common)
            self.uses_sequences = False
        elif kind == "gru":
            self.net = GRURegressor(hidden=int(cfg.get("hidden", 24)), **common)
            self.uses_sequences = True
        elif kind == "lstm":
            self.net = LSTMRegressor(hidden=int(cfg.get("hidden", 24)), **common)
            self.uses_sequences = True
        else:
            raise ValueError(f"unknown neural model {kind!r}")

    def _prepare(self, X: np.ndarray) -> np.ndarray:
        if not self.uses_sequences:
            return X
        return sequence_view(X, _Spec(self.lookback))

    def fit(self, X: np.ndarray, y: np.ndarray) -> "NeuralModel":
        self.net.fit(self._prepare(X), y)
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.net.predict(self._prepare(X))

    def export_state(self) -> Dict[str, Any]:
        return {
            "params": self.net.export(),
            "y_mean": self.net.y_mean_,
            "y_std": self.net.y_std_,
            "history": self.net.history,
        }


class _Spec:
    """Minimal stand-in for FeatureSpec when only ``lookback`` is needed."""

    def __init__(self, lookback: int) -> None:
        self.lookback = lookback


class EnsembleModel(BaseModel):
    """Equal-weight mean of the neural members.

    Equal weights, deliberately: fitting ensemble weights on the same predictions
    used to report performance would leak validation information into the score.
    The dashboard additionally reports each member separately so the ensemble's
    gain (or absence of one) is visible rather than assumed.
    """

    def __init__(self, members: Sequence[BaseModel], weighting: str = "equal") -> None:
        self.members = list(members)
        self.name = "ensemble"
        if weighting != "equal":
            raise ValueError(f"unsupported ensemble weighting: {weighting}")

    def fit(self, X: np.ndarray, y: np.ndarray) -> "EnsembleModel":
        for member in self.members:
            member.fit(X, y)
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        return np.mean([member.predict(X) for member in self.members], axis=0)

    def export_state(self) -> Dict[str, Any]:
        return {member.name: member.export_state() for member in self.members}


def build_model(name: str, config: Dict[str, Any], seed: int, lookback: int) -> BaseModel:
    """Instantiate one model by name, honouring the config's hyperparameters."""
    cfg = config["models"]
    if name == "xgboost":
        return XGBoostModel(cfg["xgboost"], seed=seed)
    if name in {"mlp", "gru", "lstm"}:
        return NeuralModel(name, cfg[name], seed=seed, lookback=lookback)
    if name == "ensemble":
        members = cfg["ensemble"]["members"]
        return EnsembleModel(
            [NeuralModel(m, cfg[m], seed=seed, lookback=lookback) for m in members],
            weighting=cfg["ensemble"].get("weighting", "equal"),
        )
    raise ValueError(f"unknown model {name!r}")


def model_names(config: Dict[str, Any]) -> List[str]:
    return ["mlp", "gru", "lstm", "xgboost", "ensemble"]
