"""Regression tests for the phase-3 repairs: D17, D18, D19, D21, D24, D30.

Each test names the defect it locks down and the behaviour a reader would have
seen before the fix. Nothing here changes an experiment result: the checks are
about identity, provenance and validation, not about model output.

The four phase-2 fixes (D11, D12, D14, D15) keep their own suites
(`test_d11_early_stopping`, `test_d12_validation_aggregation`,
`test_d14_d15_statistics`); these tests do not touch them.
"""

from __future__ import annotations

import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from cosmora_v3.config import ConfigError, config_hash, fold_overlap, load_config, validate_config
from cosmora_v3.data import DataUnavailable, _download, fetch_location
from cosmora_v3.metrics import interval_score
from cosmora_v3.run import _apply_epoch_override

ROOT = Path(__file__).resolve().parents[1]


def lk_config() -> dict:
    return load_config(ROOT / "config" / "experiment_lk_power_2000_2024.json")


class D17EffectiveConfigHash(unittest.TestCase):
    """A reduced-epoch run must not report the full configuration's identity."""

    def test_a_full_run_keeps_its_documented_hash(self) -> None:
        config = lk_config()
        effective = _apply_epoch_override(config, None)
        self.assertIs(effective, config, "no override must not copy or re-hash the config")
        self.assertEqual(config["config_hash"], "a6bbe9432b389257")

    def test_an_epoch_override_changes_the_hash_and_the_budget(self) -> None:
        config = lk_config()
        before = config["config_hash"]
        effective = _apply_epoch_override(config, 40)
        self.assertNotEqual(effective["config_hash"], before)
        self.assertEqual(effective["config_hash"], config_hash(effective))
        for model in ("mlp", "gru", "lstm"):
            self.assertEqual(effective["models"][model]["epochs"], 40)
        self.assertEqual(config["config_hash"], before, "the caller's config is not mutated")
        self.assertNotEqual(
            config["models"]["mlp"]["epochs"], 40, "the configured budget must survive"
        )

    def test_the_effective_hash_is_reproducible_from_the_written_file(self) -> None:
        effective = _apply_epoch_override(lk_config(), 40)
        round_tripped = json.loads(json.dumps(effective))
        self.assertEqual(config_hash(round_tripped), effective["config_hash"])


class D21Validation(unittest.TestCase):
    """Validation must refuse runs that look complete and are not."""

    def test_a_location_without_coordinates_names_the_entry(self) -> None:
        config = lk_config()
        config["locations"][1].pop("lat")
        with self.assertRaises(ConfigError) as caught:
            validate_config(config)
        self.assertIn(config["locations"][1]["id"], str(caught.exception))
        self.assertIn("lat", str(caught.exception))

    def test_a_non_numeric_coordinate_is_a_config_error(self) -> None:
        config = lk_config()
        config["locations"][0]["lon"] = "east"
        with self.assertRaises(ConfigError):
            validate_config(config)

    def test_an_empty_sealed_tail_is_refused(self) -> None:
        config = lk_config()
        config["splits"]["test_months"] = 0
        with self.assertRaises(ConfigError) as caught:
            validate_config(config)
        self.assertIn("test_months", str(caught.exception))

    def test_a_short_sealed_tail_is_refused(self) -> None:
        config = lk_config()
        config["splits"]["test_months"] = 11
        with self.assertRaises(ConfigError):
            validate_config(config)

    def test_a_zero_validation_window_is_refused(self) -> None:
        config = lk_config()
        config["splits"]["cv_validation_months"] = 0
        with self.assertRaises(ConfigError):
            validate_config(config)

    def test_fold_overlap_is_reported_rather_than_implied(self) -> None:
        overlap = fold_overlap(lk_config()["splits"])
        self.assertEqual(overlap["cv_step_months"], 12)
        self.assertEqual(overlap["cv_validation_months"], 24)
        self.assertEqual(overlap["months_shared_between_neighbouring_folds"], 12)
        self.assertEqual(overlap["overlapping"], 1)

    def test_a_non_overlapping_design_reports_no_overlap(self) -> None:
        overlap = fold_overlap({"cv_step_months": 24, "cv_validation_months": 24})
        self.assertEqual(overlap["months_shared_between_neighbouring_folds"], 0)
        self.assertEqual(overlap["overlapping"], 0)


class D18PayloadDigest(unittest.TestCase):
    """The provenance digest must be recomputable from the bytes on disk."""

    def test_the_manifest_digest_matches_the_file_a_reader_has(self) -> None:
        config = lk_config()
        for location in config["locations"]:
            _, provenance = fetch_location(location, config)
            path = ROOT / "data" / "cache" / f"power_{location['id']}_2000_2024.json"
            self.assertTrue(path.exists(), f"committed cache missing: {path.name}")
            self.assertEqual(
                provenance.payload_sha256,
                hashlib.sha256(path.read_bytes()).hexdigest(),
                f"{location['id']}: payload_sha256 must be the file's digest, not a re-serialisation",
            )

    def test_the_published_readme_digest_matches_the_reported_one(self) -> None:
        config = lk_config()
        readme = (ROOT / "data" / "cache" / "README.md").read_text(encoding="utf-8")
        for location in config["locations"]:
            _, provenance = fetch_location(location, config)
            self.assertIn(provenance.payload_sha256, readme)


class D19CacheSignature(unittest.TestCase):
    """A cache file may only answer the request it was fetched for."""

    def test_a_mismatched_signature_is_refused(self) -> None:
        config = lk_config()
        location = config["locations"][0]
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp) / "data" / "cache"
            cache.mkdir(parents=True)
            payload = json.loads(
                (ROOT / "data" / "cache" / "power_colombo_2000_2024.json").read_text(encoding="utf-8")
            )
            payload["_cosmora_request"] = {
                "parameters": ["PRECTOTCORR"],
                "community": "AG",
                "base_url": "https://example.invalid/other",
                "start_year": 2000,
                "end_year": 2024,
                "latitude": 6.927,
                "longitude": 79.8612,
            }
            (cache / "power_colombo_2000_2024.json").write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaises(DataUnavailable) as caught:
                fetch_location(location, config, cache_root=Path(tmp))
            self.assertIn("different request", str(caught.exception))

    def test_a_legacy_cache_without_a_signature_is_accepted_and_flagged(self) -> None:
        config = lk_config()
        location = config["locations"][0]
        _, provenance = fetch_location(location, config)
        self.assertFalse(
            provenance.request_signature_checked,
            "caches written before D19 cannot be checked; the provenance says so",
        )
        self.assertIn("parameters", provenance.request_signature)


class D22DuplicateMonths(unittest.TestCase):
    """A month listed twice is one observation, not two training rows."""

    def test_a_duplicated_month_is_removed_and_counted(self) -> None:
        payload = {
            "properties": {"parameter": {"T2M": {}}},
            "header": {"title": "test"},
        }
        series = {}
        for year in range(2010, 2020):
            for month in range(1, 13):
                series[f"{year}{month:02d}"] = 26.0 + (month / 100.0)
        # A second key that parses to the same month (2015-03), carrying the same
        # value: the same observation listed twice.
        series["2015-03"] = 26.03
        payload["properties"]["parameter"]["T2M"] = series

        config = {
            "parameters": {"t2m": "T2M"},
            "start_year": 2010,
            "end_year": 2019,
            "cache_dir": "data/cache",
            "base_url": "https://example.invalid",
            "community": "RE",
            "fill_values": [-999],
        }
        location = {"id": "test", "lat": 6.9, "lon": 79.8}
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp) / "data" / "cache"
            cache.mkdir(parents=True)
            (cache / "power_test_2010_2019.json").write_text(json.dumps(payload), encoding="utf-8")
            frame, provenance = fetch_location(location, {"power": config}, cache_root=Path(tmp))
        self.assertEqual(len(frame), 120, "120 distinct months, not 121 rows")
        self.assertEqual(provenance.duplicate_month_rows, 1)
        self.assertAlmostEqual(float(frame.loc[pd.Timestamp("2015-03-01"), "t2m"]), 26.03)

    def test_conflicting_copies_of_one_month_are_refused(self) -> None:
        series = {}
        for year in range(2010, 2020):
            for month in range(1, 13):
                series[f"{year}{month:02d}"] = 26.0
        series["2015-03"] = 99.0  # same month, a different value: unreconcilable
        payload = {"properties": {"parameter": {"T2M": series}}, "header": {"title": "test"}}
        config = {
            "parameters": {"t2m": "T2M"}, "start_year": 2010, "end_year": 2019,
            "cache_dir": "data/cache", "base_url": "https://example.invalid",
            "community": "RE", "fill_values": [-999],
        }
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp) / "data" / "cache"
            cache.mkdir(parents=True)
            (cache / "power_test_2010_2019.json").write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaises(DataUnavailable) as caught:
                fetch_location({"id": "test", "lat": 6.9, "lon": 79.8}, {"power": config}, cache_root=Path(tmp))
        self.assertIn("conflicting values", str(caught.exception))


class D24IntervalAlignment(unittest.TestCase):
    """One joint mask, so a NaN bound cannot misalign the three series."""

    def test_a_nan_lower_bound_drops_the_whole_observation(self) -> None:
        y = np.array([1.0, 2.0, 3.0, 4.0])
        lower = np.array([0.0, np.nan, 2.0, 3.0])
        upper = np.array([2.0, 3.0, 4.0, 5.0])
        scores = interval_score(y, lower, upper, alpha=0.1)
        self.assertEqual(scores["coverage"], 1.0)
        self.assertAlmostEqual(scores["mean_width"], 2.0)

    def test_mismatched_lengths_raise_instead_of_scoring(self) -> None:
        with self.assertRaises(ValueError):
            interval_score(np.array([1.0, 2.0]), np.array([0.0]), np.array([2.0, 3.0]), alpha=0.1)


class D30ResponseValidation(unittest.TestCase):
    """A body is data only if it parses into the POWER structure."""

    class _Response:
        def __init__(self, body: str) -> None:
            self.status = 200
            self._body = body.encode("utf-8")

        def read(self) -> bytes:
            return self._body

        def __enter__(self):
            return self

        def __exit__(self, *exc) -> None:
            return None

    class _Opener:
        def __init__(self, body: str) -> None:
            self.body = body

        def urlopen(self, request, timeout=None):
            return D30ResponseValidation._Response(self.body)

    def test_html_that_mentions_parameter_is_not_accepted_as_data(self) -> None:
        with self.assertRaises(DataUnavailable):
            _download(
                "https://power.larc.nasa.gov/example",
                timeout=1,
                session=self._Opener("<html>parameter not found</html>"),
                attempts=1,
            )

    def test_a_real_power_body_is_accepted(self) -> None:
        body = json.dumps({"properties": {"parameter": {"T2M": {"202001": 26.5}}}})
        self.assertEqual(
            json.loads(_download("https://power.larc.nasa.gov/x", timeout=1, session=self._Opener(body), attempts=1)),
            json.loads(body),
        )


if __name__ == "__main__":
    unittest.main()
