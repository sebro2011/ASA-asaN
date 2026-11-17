# NASA POWER payloads used by the real-data run

Three files, one per city. These are the **source data** for the numbers in
`../../docs/FINAL_SCIENTIFIC_AUDIT.md` §2.5. They are committed so that a clone can
re-run the experiment without network access.

| File | Coordinates returned by POWER | Elevation | SHA-256 |
| --- | --- | --- | --- |
| `power_colombo_2000_2024.json` | 79.861 E, 6.927 N | 123.66 m | `911aac866cb35ef2b6b512db140df0c937282986562425726b666f54525016a5` |
| `power_kandy_2000_2024.json` | 80.634 E, 7.291 N | 296.60 m | `fa9ea32edcbb7e2fd5dc25465b73bb0e828464e029f1cba4901f538cb2a22f58` |
| `power_jaffna_2000_2024.json` | 80.025 E, 9.662 N | 6.95 m | `ef2ea94b66c948feb2353bfbe2d2c85af8cf22c566a9efabf61872b7320bf7a9` |

Parameter request:

```
https://power.larc.nasa.gov/api/temporal/monthly/point
  ?parameters=T2M,PRECTOTCORR&community=RE
  &longitude=<lon>&latitude=<lat>&start=2000&end=2024&format=JSON
```

Response metadata recorded inside each file: POWER API `v2.10.0`, source `MERRA2`,
`time_standard=LST`, `fill_value=-999.0`, `T2M` in °C, `PRECTOTCORR` in mm/day.

## How these files were produced — read this before trusting them

The build sandbox has **no direct HTTPS egress** to `power.larc.nasa.gov`: the TLS
handshake is refused (`exit 35`) and no proxy is configured. The responses were
therefore captured through an agent fetch tool and **transcribed by hand** into
`scripts/build_power_cache.py`, which emits these files. Hand transcription is a copy
step and copy steps fail silently, so two independent checks apply:

1. **Month-13 identity (per value).** POWER's monthly response carries thirteen values
   per year: twelve months plus `YYYY13`, defined as that year's annual mean. The
   script recomputes the mean of the twelve transcribed months and compares it with the
   transcribed annual value, for every year and parameter, **before writing anything**,
   and refuses to emit a payload that fails. Worst absolute difference across the three
   files: 0.016 °C and 0.048 mm/day — rounding level at POWER's two-decimal reporting
   precision. The result is embedded in each file as `_cosmora_transcription_check`.
2. **Site identity (per file).** Each file records the URL it came from, and the
   elevation returned in `geometry.coordinates` is checked against the city: Colombo
   123.66 m, Kandy 296.60 m, Jaffna 6.95 m. A swapped site would show the wrong
   elevation and the wrong rainfall climatology.

`_cosmora_retrieved_utc` is stamped from the build sandbox clock at transcription time.
It records **when the values were written into this workspace**, not an independently
audited record of the HTTP request. Where the two differ, treat the URL, the payload
contents and the month-13 check as the evidence.

## Regenerating

```bash
python scripts/build_power_cache.py     # rewrites all three, re-verifies, prints the checks
```

Output is byte-identical across re-runs (the retrieval stamp is preserved from any
existing file), so the digests above are stable.

The `.gitignore` in the package ignores `data/cache/*` but re-includes exactly these
three files. Any other cache entry — including a future full 1985–2025, five-parameter
download — stays out of version control.
