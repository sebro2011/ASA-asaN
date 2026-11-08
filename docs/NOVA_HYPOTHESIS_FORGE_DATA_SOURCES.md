# NOVA Hypothesis Forge — Data Sources, Normalisation and Provenance

## 1. Catalogue

| Dataset id | Organisation | Programme | Access | Native cadence | Coverage used by the planner |
|---|---|---|---|---|---|
| `noaa-swpc-kp` | NOAA | SWPC planetary K index | open | 3 h | rolling ~30 days |
| `noaa-swpc-solar-wind` | NOAA | SWPC DSCOVR/ACE mag + plasma | open | 1 min | rolling 1 day per product |
| `noaa-swpc-alerts` | NOAA | SWPC alerts / watches / warnings | open | event | rolling 7 days |
| `nasa-donki` | NASA | DONKI notifications and CME | open | event | archive from ~2008 |
| `nasa-power` | NASA | POWER monthly climatology | open | month | archive from 1981 |
| `nasa-neows` | NASA | NeoWs near-Earth object feed | API key | per approach | rolling 7 days |
| `nasa-apod` | NASA | Astronomy Picture of the Day | API key | day | archive from 1995 |
| `nasa-mars-photos` | NASA | Mars rover photos | API key | sol | mission-dependent |
| `iss-tle` | Other (CelesTrak) | ISS two-line elements | open | ~hours | rolling current epoch |

`nasa-gibs` is intentionally **not** a plannable dataset: imagery is attached by
`buildImagery` from the existing `src/lib/earth/gibsCatalog.ts` catalogue and rendered as a WMS
GetMap reference with attribution. It never appears as a time series, because it is not one.

The catalogue endpoint returns documentation, coverage, units, limitations and key
requirements — never an endpoint containing a credential.

## 2. Key handling

- `nasaKeyMode` is `key`, `demo` or `none`. Without a key the NASA-keyed datasets are shown as
  `KEY_NOT_CONFIGURED` in the plan and excluded from retrieval; the NOAA layer still runs.
- The server appends the key to the upstream URL only for NASA requests, and `sanitiseUrl`
  removes `api_key` and `key` parameters before any URL is placed in provenance, evidence or a
  passport.
- The browser never receives a key. The API test asserts that
  `SUPER_SECRET_NASA_KEY_42` never appears in a catalogue, interpretation or investigation
  response while the upstream call did carry it.

## 3. Universal normalisation schema

Every source is reduced to the same shapes (`types.ts`):

```ts
Observation { time: ISO-UTC; value: number | null; unit; missing; raw; quality? }
NormalizedSeries {
  id: `${datasetId}:${variableId}`; datasetId; variableId; label; unit; cadence;
  observations: Observation[];
  missing: { count; fraction; expected; method };
  provenance: DataProvenance;
  status: statusDetail?;
  rawRecords?: unknown;
}
```

Rules:

1. **Unit preservation.** Values are never silently converted. If a source changes unit, the
   series unit changes and the evidence rule text records it.
2. **Raw preservation.** `raw` keeps the source's own string; `rawRecords` keeps the original
   records separately from processed values.
3. **Missing values.** A source sentinel (for example POWER's `-999`) becomes `value: null` with
   `missing: true`; it is counted in `missing.count` and `missing.fraction`.
4. **Timestamps.** All times are UTC. SWPC products use `YYYY-MM-DD HH:MM:SS.mmm` (space
   separated, no zone); the parser normalises that and ISO `T…Z` forms. DONKI and NeoWs are
   already UTC ISO.
5. **Cadence.** Each series records its native cadence; alignment uses a 90-minute tolerance
   (three times the Kp cadence) and reports the number of paired samples.

## 4. Retrieval hardening

| Concern | Implementation |
|---|---|
| Timeouts | Per-request `AbortController` (`SOURCE_TIMEOUT`), 45 s client budget. |
| Rate limits | Per-router-instance limiter; `429 RATE_LIMITED` + `Retry-After`. |
| Caching | TTL cache per server instance, keyed by sanitised URL; `cached` status surfaced. |
| Payload size | Body limit 256 kB on the Forge router; response parsing guarded. |
| Errors | `SOURCE_REJECTED`, `SOURCE_TIMEOUT`, `KEY_NOT_CONFIGURED`, `PARSE_FAILED`, `OUT_OF_COVERAGE`. |
| Partial data | A dataset may return `partial` with a subset of series; the UI and passport state which part is missing. |
| Provenance | Official URL, documentation URL, retrieval timestamp, observation start/end, record count, FNV-1a payload hash, processing history. |

## 5. Coverage honesty

The planner refuses windows a dataset cannot serve. Examples verified by tests:

- **1989 Quebec storm** → Kp `out-of-coverage`, no series, no correlation, verdict
  `insufficient-evidence`, and the Kp endpoint is never called.
- **Solar wind for a 7-day window** → available, but only the rolling 1-day product; the plan and
  the analysis limitation state the shorter effective window.
- **POWER monthly for 2015–2024** → in range, monthly resolution, fill-sentinel months retained
  as missing.

## 6. Attribution

Each `DataProvenance` carries the source's own attribution string. The Evidence Passport lists
official documentation URLs and retrieval timestamps so a reader can reproduce the exact
request. Imagery carries `GIBS_ATTRIBUTION` from the existing catalogue.

## 7. What the engine will never do

- invent a value for a missing observation;
- present a cached payload as a fresh retrieval (status becomes `cached`);
- call a source outside its documented endpoint;
- claim a dataset covers a period it does not;
- place a credential in a URL returned to the browser.
