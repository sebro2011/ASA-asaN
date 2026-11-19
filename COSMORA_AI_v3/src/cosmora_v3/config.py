"""Configuration loading, validation and hashing.

A research run is only reproducible if the configuration that produced it can be
identified exactly. Every artefact written by this package carries
``config_hash`` — a SHA-256 over the *canonical* JSON form of the resolved config
(keys sorted, no whitespace, floats normalised via ``repr``). Two runs with the
same hash used the same settings; a run whose hash differs is not comparable to
it, and the report refuses to mix them.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Dict

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "experiment.json"


class ConfigError(ValueError):
    """Raised when a configuration cannot produce a scientific run."""


def load_config(path: str | Path | None = None) -> Dict[str, Any]:
    """Load and validate ``experiment.json``."""
    config_path = Path(path) if path is not None else DEFAULT_CONFIG_PATH
    if not config_path.exists():
        raise ConfigError(f"config not found: {config_path}")
    with config_path.open("r", encoding="utf-8") as handle:
        config = json.load(handle)
    validate_config(config)
    config["_source_path"] = str(config_path)
    config["config_hash"] = config_hash(config)
    return config


def validate_config(config: Dict[str, Any]) -> None:
    """Reject configurations that would silently break the methodology."""
    required = {
        "seeds", "locations", "power", "targets", "features", "splits",
        "models", "uncertainty", "extreme", "evaluation", "output",
    }
    missing = required - set(config)
    if missing:
        raise ConfigError(f"missing config sections: {sorted(missing)}")

    if len(config["seeds"]) < 2:
        raise ConfigError("at least two seeds are required for a stability claim")

    # D21: a location without `lat` reached the model as a raw KeyError, which is
    # not a validation message and gave no clue which entry was wrong.
    for loc in config["locations"]:
        missing_keys = {"id", "lat", "lon"} - set(loc)
        if missing_keys:
            raise ConfigError(
                f"location {loc.get('id', '<no id>')!r} is missing required keys: {sorted(missing_keys)}"
            )
    location_ids = [loc["id"] for loc in config["locations"]]
    if len(location_ids) != len(set(location_ids)):
        raise ConfigError("duplicate location ids")
    for loc in config["locations"]:
        try:
            lat = float(loc["lat"])
            lon = float(loc["lon"])
        except (TypeError, ValueError):
            raise ConfigError(f"location {loc['id']}: lat and lon must be numbers") from None
        if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
            raise ConfigError(f"location out of range: {loc['id']}")

    power = config["power"]
    if int(power["end_year"]) <= int(power["start_year"]) + 10:
        raise ConfigError("POWER window must span more than ten years")

    splits = config["splits"]
    # The seal around the test tail is the whole point of the exercise: if the
    # first CV fold's validation window can reach into the test tail, the
    # independent evaluation is no longer independent.
    total_months = (int(power["end_year"]) - int(power["start_year"]) + 1) * 12
    lookback = int(config["features"]["lookback_months"])
    usable = total_months - lookback
    minimum_train = int(splits["cv_initial_train_months"])
    reserved = int(splits["test_months"])
    if usable <= minimum_train + int(splits["cv_validation_months"]) + reserved:
        raise ConfigError(
            f"window too short: usable={usable} months, need more than "
            f"{minimum_train}+{splits['cv_validation_months']}+{reserved}"
        )
    if int(splits["cv_step_months"]) < 1:
        raise ConfigError("cv_step_months must be positive")
    if int(splits["cv_validation_months"]) < 1:
        raise ConfigError("cv_validation_months must be positive")
    # D21: `test_months = 0` was accepted. The sealed tail was then empty,
    # `run_series` completed anyway and wrote an all-NaN test table with n = 0,
    # still stamped `scientific_results: true`. A run with no held-out months is
    # not a scientific result, so it is refused at load time.
    if reserved < 12:
        raise ConfigError(
            f"splits.test_months must be at least 12 (got {reserved}): a shorter sealed "
            "tail cannot support a monthly comparison test"
        )

    alpha = float(config["uncertainty"]["alpha"])
    if not 0.0 < alpha < 1.0:
        raise ConfigError("uncertainty.alpha must lie in (0, 1)")

    # Significance level of the comparison family (D15). It is declared rather than
    # hard-coded so the verdicts in a report can be traced back to a config value.
    comparison_alpha = float(config["evaluation"].get("alpha", 0.05))
    if not 0.0 < comparison_alpha < 0.5:
        raise ConfigError("evaluation.alpha must lie in (0, 0.5)")

    quantile = float(config["extreme"]["quantile"])
    if not 0.5 <= quantile < 1.0:
        raise ConfigError("extreme.quantile must lie in [0.5, 1)")

    members = set(config["models"]["ensemble"]["members"])
    if not members <= {"gru", "lstm", "mlp"}:
        raise ConfigError(f"unknown ensemble members: {sorted(members - {'gru', 'lstm', 'mlp'})}")


def fold_overlap(splits: Dict[str, Any]) -> Dict[str, int]:
    """How many folds share validation months (D21, D12).

    ``cv_step_months < cv_validation_months`` means consecutive folds overlap, so
    a month can be validated by more than one fold. The aggregation in
    ``splits`` handles that (each month counted once per fold, folds weighted by
    their own month count — D12), but the overlap is a property of the design a
    reader should be able to see, so it is recorded in the manifest rather than
    left implicit in the arithmetic.
    """
    step = int(splits["cv_step_months"])
    window = int(splits["cv_validation_months"])
    return {
        "cv_step_months": step,
        "cv_validation_months": window,
        "months_shared_between_neighbouring_folds": max(0, window - step),
        "overlapping": int(step < window),
    }


def _canonical(config: Dict[str, Any]) -> str:
    cleaned = {k: v for k, v in config.items() if not k.startswith("_") and k != "config_hash"}
    return json.dumps(cleaned, sort_keys=True, separators=(",", ":"), default=str)


def config_hash(config: Dict[str, Any]) -> str:
    """Stable hash of the *scientific* content of a config (not its path)."""
    return hashlib.sha256(_canonical(config).encode("utf-8")).hexdigest()[:16]
