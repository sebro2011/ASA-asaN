"""Shared test helpers: import path, tiny config, deterministic fixtures."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

import numpy as np

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from cosmora_v3.config import load_config  # noqa: E402


def tiny_config(**overrides):
    """A config small enough to run in a test, structured like the real one."""
    config = load_config()
    config = copy.deepcopy(config)
    config["seeds"] = [1, 2]
    config["splits"] = {
        "cv_initial_train_months": 48,
        "cv_validation_months": 12,
        "cv_step_months": 12,
        "test_months": 24,
    }
    config["features"]["lookback_months"] = 6
    for name in ("mlp", "gru", "lstm"):
        config["models"][name]["epochs"] = 12
        config["models"][name]["patience"] = 4
    config.update(overrides)
    return config


def synthetic_frame(months: int = 120, seed: int = 0):
    """A reproducible frame with the same column layout POWER produces."""
    rng = np.random.default_rng(seed)
    index = __import__("pandas").period_range("2000-01", periods=months, freq="M").to_timestamp()
    seasonal = np.sin(2 * np.pi * index.month.to_numpy() / 12)
    return __import__("pandas").DataFrame(
        {
            "t2m": 27 + 1.5 * seasonal + rng.normal(0, 0.3, months),
            "rain": np.abs(rng.gamma(1.2, 2.0, months) * (1 + seasonal)),
            "rh": 78 + rng.normal(0, 2, months),
            "wind": 3 + rng.gamma(1.2, 1.0, months),
            "solar": 5 + rng.normal(0, 0.2, months),
        },
        index=index,
    )
