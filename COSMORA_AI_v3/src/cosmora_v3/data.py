"""NASA POWER acquisition with an on-disk cache and an honest provenance record.

Three rules drive this module:

1. **No silent substitution.** If the request fails, the caller gets an exception.
   Nothing downstream ever sees interpolated, forward-filled or invented values —
   a gap in the record stays a gap and is dropped explicitly.
2. **Every series is traceable.** The cache entry stores the exact request URL,
   the retrieval timestamp, the response's own header (POWER echoes version and
   title) and a SHA-256 of the payload. That hash ends up in the run manifest.
3. **Synthetic data cannot masquerade as observations.** ``synthetic_power`` exists
   for engine verification only and stamps ``provenance="SYNTHETIC"`` on every
   frame it produces; reports built from it are marked as not scientific.

POWER monthly values for ``PRECTOTCORR`` are a **daily-rate** quantity (mm/day),
not a monthly total. Extreme-rainfall thresholds in this package are therefore
expressed in mm/day and never multiplied by days-per-month — that conversion is a
classic source of silent 30x errors.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List

import numpy as np
import pandas as pd

FILL_SENTINELS = {-999.0, -9999.0, -99999.0}


class DataUnavailable(RuntimeError):
    """Raised when real observations cannot be obtained. Never caught silently."""


@dataclass
class Provenance:
    location_id: str
    source: str
    url: str
    retrieved_utc: str
    payload_sha256: str
    row_count: int
    first_month: str
    last_month: str
    dropped_months: int
    power_header: Dict[str, Any] = field(default_factory=dict)
    annual_rows_excluded: int = 0

    def as_dict(self) -> Dict[str, Any]:
        return {
            "location_id": self.location_id,
            "source": self.source,
            "url": self.url,
            "retrieved_utc": self.retrieved_utc,
            "payload_sha256": self.payload_sha256,
            "rows": self.row_count,
            "first_month": self.first_month,
            "last_month": self.last_month,
            "dropped_months": self.dropped_months,
            "annual_rows_excluded": self.annual_rows_excluded,
            "power_header": self.power_header,
        }


def build_url(power_cfg: Dict[str, Any], lat: float, lon: float) -> str:
    params = ",".join(power_cfg["parameters"].values())
    return (
        f"{power_cfg['base_url']}?parameters={params}"
        f"&community={power_cfg['community']}"
        f"&longitude={lon}&latitude={lat}"
        f"&start={power_cfg['start_year']}&end={power_cfg['end_year']}"
        "&format=JSON"
    )


def _cache_path(cache_dir: Path, location_id: str, power_cfg: Dict[str, Any]) -> Path:
    stamp = f"{power_cfg['start_year']}_{power_cfg['end_year']}"
    return cache_dir / f"power_{location_id}_{stamp}.json"


ANNUAL_MONTH_SUFFIX = "13"


def _frame_from_payload(
    payload: Dict[str, Any], power_cfg: Dict[str, Any], location_id: str
) -> tuple[pd.DataFrame, int, int]:
    """Turn a POWER point response into a month-indexed frame.

    Returns ``(frame, dropped_months, annual_rows_excluded)``.

    The monthly endpoint returns **thirteen** values per year: ``YYYY01`` ...
    ``YYYY12`` and ``YYYY13``, the latter being the year's aggregate rather than
    a month. ``YYYY13`` is removed here, before the month index is built: it has
    no calendar position, and treating it as a thirteenth month would inject an
    annual mean into what is supposed to be a monthly series.

    A month containing a fill sentinel in any requested parameter is dropped
    whole (rather than blanking the single cell) so that every feature row stays
    internally consistent.
    """
    parameters = payload.get("properties", {}).get("parameter", {})
    if not parameters:
        raise DataUnavailable(f"{location_id}: response has no parameters block")

    columns: Dict[str, pd.Series] = {}
    for alias, code in power_cfg["parameters"].items():
        series = parameters.get(code)
        if series is None:
            raise DataUnavailable(f"{location_id}: parameter {code} missing from response")
        columns[alias] = pd.Series(series, dtype="float64")

    frame = pd.DataFrame(columns)
    frame.index = frame.index.astype(str)
    frame.index.name = "yyyymm"
    frame = frame.sort_index()

    annual_mask = frame.index.str[-2:] == ANNUAL_MONTH_SUFFIX
    annual_rows_excluded = int(annual_mask.sum())
    if annual_rows_excluded:
        frame = frame.loc[~annual_mask]
    if frame.empty:
        raise DataUnavailable(f"{location_id}: no monthly rows after excluding annual aggregates")

    sentinel_mask = frame.isin(list(FILL_SENTINELS))
    bad = sentinel_mask.any(axis=1)
    dropped = int(bad.sum())
    frame = frame.loc[~bad]

    months = pd.PeriodIndex([str(idx) for idx in frame.index], freq="M").to_timestamp()
    frame.index = months
    frame.index.name = "date"
    return frame, dropped, annual_rows_excluded


def fetch_location(
    location: Dict[str, Any],
    config: Dict[str, Any],
    *,
    cache_root: Path | None = None,
    force_refresh: bool = False,
    session: Any | None = None,
) -> tuple[pd.DataFrame, Provenance]:
    """Fetch (or read from cache) one location's monthly record."""
    power_cfg = config["power"]
    base = Path(cache_root) if cache_root is not None else Path(__file__).resolve().parents[2]
    cache_dir = base / power_cfg["cache_dir"]
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = _cache_path(cache_dir, location["id"], power_cfg)
    url = build_url(power_cfg, location["lat"], location["lon"])

    if cache_file.exists() and not force_refresh:
        payload = json.loads(cache_file.read_text(encoding="utf-8"))
        raw_text = json.dumps(payload, sort_keys=True)
        source = "cache"
        retrieved = payload.get("_cosmora_retrieved_utc", "unknown")
        digest = hashlib.sha256(raw_text.encode("utf-8")).hexdigest()
    else:
        raw_text = _download(url, timeout=int(power_cfg["timeout_seconds"]), session=session)
        payload = json.loads(raw_text)
        retrieved = datetime.now(timezone.utc).isoformat(timespec="seconds")
        digest = hashlib.sha256(raw_text.encode("utf-8")).hexdigest()
        payload["_cosmora_retrieved_utc"] = retrieved
        cache_file.write_text(json.dumps(payload), encoding="utf-8")
        source = "power.larc.nasa.gov"

    frame, dropped, annual_rows = _frame_from_payload(payload, power_cfg, location["id"])
    if len(frame) < 60:
        raise DataUnavailable(
            f"{location['id']}: only {len(frame)} usable months returned; refusing to model"
        )

    provenance = Provenance(
        location_id=location["id"],
        source=source,
        url=url,
        retrieved_utc=retrieved,
        payload_sha256=digest,
        row_count=len(frame),
        first_month=str(frame.index[0].strftime("%Y-%m")),
        last_month=str(frame.index[-1].strftime("%Y-%m")),
        dropped_months=dropped,
        power_header=payload.get("header", {}),
        annual_rows_excluded=annual_rows,
    )
    return frame, provenance


def _download(url: str, *, timeout: int, session: Any | None = None, attempts: int = 3) -> str:
    """GET with bounded retries. Raises DataUnavailable — never invents data."""
    import urllib.error
    import urllib.request

    opener = session or urllib.request
    last_error: str = "unknown"
    for attempt in range(1, attempts + 1):
        try:
            with opener.urlopen(url, timeout=timeout) as response:  # type: ignore[attr-defined]
                if getattr(response, "status", 200) != 200:
                    last_error = f"HTTP {response.status}"
                else:
                    body = response.read().decode("utf-8")
                    if '"parameter"' not in body:
                        last_error = "response does not contain a parameter block"
                    else:
                        return body
        except Exception as exc:  # noqa: BLE001 - the message is what matters
            last_error = f"{type(exc).__name__}: {exc}"
        if attempt < attempts:
            time.sleep(1.5 * attempt)
    raise DataUnavailable(
        f"NASA POWER unreachable after {attempts} attempts ({last_error}).\n"
        f"  url: {url}\n"
        "  No data has been substituted. Run this on a host with internet access "
        "to power.larc.nasa.gov, or place a previously downloaded response in "
        "data/cache/ and re-run."
    )


def synthetic_power(
    locations: Iterable[Dict[str, Any]],
    config: Dict[str, Any],
    *,
    months: int = 480,
    seed: int = 12345,
) -> Dict[str, pd.DataFrame]:
    """Engine-verification data. **Not observations, never reported as such.**

    The generator mixes a seasonal cycle, a slow trend, autoregressive weather
    noise and a gamma-shaped, seasonal rainfall process. It is used only by
    ``scripts/verify_engine.py`` and by the test suite, and every artefact it
    feeds is stamped ``provenance=SYNTHETIC``.
    """
    rng = np.random.default_rng(seed)
    index = pd.period_range("1985-01", periods=months, freq="M").to_timestamp()
    month = index.month.to_numpy()
    out: Dict[str, pd.DataFrame] = {}

    for offset, location in enumerate(locations):
        phase = 0.35 * offset
        # Temperature: annual cycle + gentle warming trend + AR(1) noise.
        seasonal = 27.0 + 1.6 * np.sin(2 * np.pi * (month - 4) / 12 + phase)
        trend = 0.0016 * np.arange(months)
        noise = np.zeros(months)
        for i in range(1, months):
            noise[i] = 0.72 * noise[i - 1] + rng.normal(0.0, 0.45)
        t2m = seasonal + trend + noise

        # Rainfall: monsoonal seasonality, gamma noise, occasional extremes.
        wet = 4.2 * (0.5 + 0.5 * np.sin(2 * np.pi * (month - 10) / 12 + phase))
        rain = rng.gamma(shape=1.1, scale=np.maximum(wet, 0.15))
        spikes = rng.random(months) < 0.03
        rain[spikes] *= rng.uniform(3.5, 6.0, spikes.sum())

        out[location["id"]] = pd.DataFrame(
            {
                "t2m": t2m,
                "rain": rain,
                "rh": np.clip(78 + 9 * np.cos(2 * np.pi * (month - 1) / 12) + rng.normal(0, 2.0, months), 40, 100),
                "wind": np.clip(3.1 + rng.gamma(1.4, 0.6, months), 0.2, 20),
                "solar": np.clip(5.0 + 0.9 * np.sin(2 * np.pi * (month - 2) / 12) + rng.normal(0, 0.25, months), 1.0, 8.0),
            },
            index=index,
        )
        out[location["id"]].index.name = "date"
    return out


def load_dataset(
    config: Dict[str, Any],
    *,
    force_refresh: bool = False,
    synthetic: bool = False,
) -> tuple[Dict[str, pd.DataFrame], List[Provenance]]:
    """Load every configured location. Returns frames plus provenance."""
    if synthetic:
        frames = synthetic_power(config["locations"], config)
        provenance = [
            Provenance(
                location_id=loc_id,
                source="SYNTHETIC",
                url="generator:synthetic_power",
                retrieved_utc=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                payload_sha256="synthetic",
                row_count=len(frame),
                first_month=frame.index[0].strftime("%Y-%m"),
                last_month=frame.index[-1].strftime("%Y-%m"),
                dropped_months=0,
                power_header={"title": "SYNTHETIC engine-verification data"},
            )
            for loc_id, frame in frames.items()
        ]
        return frames, provenance

    frames: Dict[str, pd.DataFrame] = {}
    provenance: List[Provenance] = []
    for location in config["locations"]:
        frame, prov = fetch_location(location, config, force_refresh=force_refresh)
        frames[location["id"]] = frame
        provenance.append(prov)
    return frames, provenance
