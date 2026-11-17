"""The POWER monthly payload carries a thirteenth value per year.

`power.larc.nasa.gov/api/temporal/monthly/point` returns keys ``YYYY01`` ...
``YYYY12`` **plus** ``YYYY13``, which is the annual aggregate for that year —
not a month. Feeding that key to the month index either crashes
(``pd.PeriodIndex`` rejects month 13) or, in a looser parser, silently injects
the year's mean into the monthly series. These tests pin the exclusion so the
monthly record stays monthly.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

import pandas as pd

from cosmora_v3.data import FILL_SENTINELS, Provenance, _frame_from_payload

POWER_CFG = {
    "parameters": {"t2m": "T2M", "rain": "PRECTOTCORR"},
    "fill_values": list(FILL_SENTINELS),
}


def _payload(years: int = 2, *, fill_year: int | None = None) -> dict:
    """Build a POWER-shaped payload with 12 months and a month-13 annual row."""
    t2m: dict[str, float] = {}
    rain: dict[str, float] = {}
    for year in range(2000, 2000 + years):
        monthly_t = [26.0 + 0.1 * m for m in range(12)]
        monthly_r = [1.0 + 0.5 * m for m in range(12)]
        for month in range(1, 13):
            key = f"{year}{month:02d}"
            t2m[key] = monthly_t[month - 1]
            rain[key] = monthly_r[month - 1]
        # Month 13 = the annual mean of the twelve months above.
        t2m[f"{year}13"] = round(sum(monthly_t) / 12.0, 2)
        rain[f"{year}13"] = round(sum(monthly_r) / 12.0, 2)
    if fill_year is not None:
        t2m[f"{fill_year}03"] = sorted(FILL_SENTINELS)[0]
    return {
        "properties": {"parameter": {"T2M": t2m, "PRECTOTCORR": rain}},
        "header": {"sources": ["MERRA2"], "fill_value": -999.0},
    }


class FrameFromPayloadTests(unittest.TestCase):
    def test_annual_rows_never_become_months(self) -> None:
        frame, dropped, annual = _frame_from_payload(_payload(3), POWER_CFG, "test")
        self.assertEqual(annual, 3, "one month-13 row per year must be excluded")
        self.assertEqual(len(frame), 36)
        self.assertEqual(sorted({ts.month for ts in frame.index}), list(range(1, 13)))
        self.assertEqual(dropped, 0)

    def test_annual_value_is_not_mistaken_for_december(self) -> None:
        """The annual mean must not leak into the December observation."""
        frame, _, _ = _frame_from_payload(_payload(2), POWER_CFG, "test")
        december = frame.loc[pd.Timestamp("2000-12-01"), "t2m"]
        annual_mean = round(sum(26.0 + 0.1 * m for m in range(12)) / 12.0, 2)
        self.assertAlmostEqual(float(december), 26.0 + 0.1 * 11, places=6)
        self.assertNotAlmostEqual(float(december), annual_mean, places=3)

    def test_fill_month_is_dropped_and_counted(self) -> None:
        frame, dropped, annual = _frame_from_payload(
            _payload(2, fill_year=2001), POWER_CFG, "test"
        )
        self.assertEqual(annual, 2)
        self.assertEqual(dropped, 1)
        self.assertEqual(len(frame), 23)
        self.assertNotIn(pd.Timestamp("2001-03-01"), frame.index)

    def test_index_is_monthly_and_ordered(self) -> None:
        frame, _, _ = _frame_from_payload(_payload(4), POWER_CFG, "test")
        self.assertTrue(all(ts.day == 1 for ts in frame.index))
        self.assertEqual(list(frame.index), sorted(frame.index))
        self.assertEqual(frame.index[0], pd.Timestamp("2000-01-01"))
        self.assertEqual(frame.index[-1], pd.Timestamp("2003-12-01"))

    def test_missing_parameter_is_reported_not_invented(self) -> None:
        payload = _payload(1)
        del payload["properties"]["parameter"]["PRECTOTCORR"]
        with self.assertRaises(Exception) as ctx:
            _frame_from_payload(payload, POWER_CFG, "test")
        self.assertIn("PRECTOTCORR", str(ctx.exception))


class ProvenanceTests(unittest.TestCase):
    def test_annual_exclusion_is_recorded(self) -> None:
        prov = Provenance(
            location_id="colombo",
            source="cache",
            url="https://example.invalid",
            retrieved_utc="2026-01-01T00:00:00+00:00",
            payload_sha256="deadbeef",
            row_count=300,
            first_month="2000-01",
            last_month="2024-12",
            dropped_months=0,
            annual_rows_excluded=25,
        )
        record = prov.as_dict()
        self.assertEqual(record["annual_rows_excluded"], 25)
        self.assertEqual(record["rows"], 300)


CACHE = Path(__file__).resolve().parents[1] / "data" / "cache"
CITIES = ("colombo", "kandy", "jaffna")


@unittest.skipUnless(CACHE.is_dir(), "committed POWER payloads not present")
class CommittedPayloadTests(unittest.TestCase):
    """The committed payloads are source data, so their guarantees are tested too.

    These files cannot be re-downloaded in this environment; if they are wrong, every
    real-data number downstream is wrong. Each assertion here corresponds to a claim the
    audit report makes about them.
    """

    def _payload(self, city: str) -> dict:
        path = CACHE / f"power_{city}_2000_2024.json"
        self.assertTrue(path.exists(), f"missing committed payload {path.name}")
        return json.loads(path.read_text(encoding="utf-8"))

    def test_every_city_covers_the_full_window(self) -> None:
        for city in CITIES:
            frame, dropped, annual = _frame_from_payload(self._payload(city), POWER_CFG, city)
            self.assertEqual(len(frame), 300, city)
            self.assertFalse(frame.isna().any().any(), f"{city}: NaN crept in")
            self.assertEqual(dropped, 0, city)
            self.assertEqual(annual, 25, f"{city}: expected one annual row per year")
            self.assertEqual(str(frame.index[0])[:7], "2000-01")
            self.assertEqual(str(frame.index[-1])[:7], "2024-12")

    def test_month_13_identity_holds_for_the_committed_values(self) -> None:
        """POWER's month-13 value is the annual mean: recompute it from the months.

        This is the check that makes hand-transcribed payloads admissible. It is
        recomputed here from the file contents rather than trusted from the field the
        build script wrote.
        """
        tol = {"T2M": 0.08, "PRECTOTCORR": 0.20}
        for city in CITIES:
            params = self._payload(city)["properties"]["parameter"]
            for param, tolerance in tol.items():
                series = params[param]
                years = sorted({key[:4] for key in series})
                self.assertEqual(len(years), 25, city)
                for year in years:
                    months = [series[f"{year}{m:02d}"] for m in range(1, 13)]
                    annual = series[f"{year}13"]
                    diff = abs(sum(months) / 12.0 - annual)
                    self.assertLessEqual(diff, tolerance, f"{city} {param} {year}")

    SITES = {"colombo": ("79.861", "6.927"), "kandy": ("80.634", "7.291"), "jaffna": ("80.025", "9.662")}

    def test_records_its_own_provenance(self) -> None:
        for city in CITIES:
            payload = self._payload(city)
            # The URL must carry that city's own coordinates: a payload filed under the
            # wrong name would point at the wrong site, and the month-13 check could not
            # detect it (it only tests internal consistency).
            lon, lat = self.SITES[city]
            self.assertIn(f"longitude={lon}", payload["_cosmora_retrieval_url"])
            self.assertIn(f"latitude={lat}", payload["_cosmora_retrieval_url"])
            self.assertAlmostEqual(payload["geometry"]["coordinates"][0], float(lon), places=3)
            self.assertAlmostEqual(payload["geometry"]["coordinates"][1], float(lat), places=3)
            coordinates = payload["geometry"]["coordinates"]
            self.assertEqual(len(coordinates), 3)
            self.assertEqual(payload["header"]["sources"], ["MERRA2"])
            self.assertEqual(payload["header"]["fill_value"], -999.0)
            self.assertEqual(
                payload["_cosmora_transcription_check"]["parameters"]["T2M"]["status"], "passed"
            )


if __name__ == "__main__":
    unittest.main()
