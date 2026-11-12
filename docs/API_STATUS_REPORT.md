# API status report

Status of every server route as of **2026-11-12**. "Live" means a response was
actually observed; "tested" means covered by injected-fetch tests; "unverified"
means neither was possible from this environment.

## Platform

| Route | Source | Cache | Freshness field | Failure mode |
| --- | --- | --- | --- | --- |
| `GET /api/health` | local | — | — | 200 |
| `GET /api/nova/config` | env | `no-store` | — | 200 |
| `GET /api/nova/diagnostics` | env + optional probe | `no-store`, probe throttled | `checkedAt` | 200 with per-provider status |
| `GET /api/workspace/config` | env | — | — | 200 with booleans only |
| `GET /api/news/sources` | env | — | — | booleans only |

## AI providers — production evidence (2026-11-12T10:32:23Z)

`GET /api/nova/diagnostics?probe=1` on commit `7251652`:

| Provider | Configured | Status | Detail |
| --- | --- | --- | --- |
| Local engine | yes | **ok** | in-process `nasa-local-engine` |
| OpenRouter | yes | **ok** | `openrouter/free`, HTTP 200, 1 754 ms |
| Gemini | yes | **error** | `gemini-3.8-flash` → 503 `UNAVAILABLE`; fallback `gemini-2.5-flash` → 404; `GET /v1beta/models` → 200 (48 models, key valid) |
| Arena | no | not configured | correctly reported as unavailable |

Conclusion: **NOVA answers through OpenRouter and the local engine.** Gemini
generation is refused by the API for this deployment and is *not* operational.
The 404 on a model the same key lists as available is unexplained and needs a live
key to diagnose (audit finding M1).

## NASA data

| Route | Upstream | Cache | Freshness | Status |
| --- | --- | --- | --- | --- |
| `GET /api/apod` | api.nasa.gov/planetary/apod | in-memory + SW | `cached` flag, source line in UI | tested |
| `GET /api/apod-range` | api.nasa.gov | — | — | tested |
| `GET /api/asteroids/neows` | api.nasa.gov/neo | **none** | **none** | live-unverified · audit M2 |
| `GET /api/epic` | api.nasa.gov/EPIC | **none** | **none** | live-unverified · audit M2 |
| `GET /api/exoplanets` | NASA Exoplanet Archive TAP | **none** | **none** | live-unverified · audit M2 |
| `GET /api/nasa-archive` | **images-api.nasa.gov** (new) | 5 min TTL, 100 entries | `fetchedAt`, `cached` | tested · **live-verified** 2026-11-12T10:52:30Z |
| `GET /api/solar-weather` | services.swpc.noaa.gov | last measured sample only | `fetchedAt`, `stale` | tested · **live-verified** 2026-11-12T11:02:48Z |
| `GET /api/iss` | api.wheretheiss.at | last known | `timestamp`, `isFallback` | tested |
| `GET /api/satellites` | static registry | — | — | 200 |
| `GET /api/missions/grounded-search` | curated archive (static) | 10 min TTL | `cached` | 200 |
| `GET /api/youtube/meta` | YouTube oEmbed | — | — | 400/404/502 |
| `POST /api/translate` | Gemini / OpenRouter | in-memory | — | tested |
| `POST /api/mars-photos` | — | — | — | **does not exist** (audit M5) |

## Live verification (production, commit `71d1a80`)

```
GET /api/nasa-archive?q=artemis&limit=2
  → success:true, total:15260, first record nasaId "Artemis Logo Color Positive RGB-July 2021",
    thumbnail https://images-assets.nasa.gov/…, detailsUrl https://images.nasa.gov/details/…,
    fetchedAt 2026-11-12T10:52:30.790Z

GET /api/solar-weather
  → success:true, data.kpIndex 1.67, observedAt 2026-11-12T06:00:00.000Z,
    stormKey "G0", source "NOAA SWPC", fetchedAt 2026-11-12T11:02:48.460Z, stale:false
```

Two notes for operators:

* `services.swpc.noaa.gov` **is** reachable from the Vercel egress; the earlier
  `UPSTREAM_UNAVAILABLE` readings were the edge/CDN serving a cached body for an
  identical URL, not the function failing. Measuring with a cache-busting query is
  the reliable way to read this route.
* `solarWindSpeedKmS` came back `null` while Kp succeeded, so the plasma feed did
  not answer in that call and the panel prints "not reported". Worth revisiting
  with `plasma-2-hour.json` (smaller) in the next NASA pass.

## Earth Intelligence

| Route | Upstream | Cache | Status |
| --- | --- | --- | --- |
| `GET /api/earth/power` | NASA POWER | in-memory | tested |
| `GET /api/earth/domains` | curated | — | tested |
| `GET /api/earth/capabilities` | curated | — | tested |
| `GET /api/earth/gibs/*` | NASA GIBS | tile cache in SW | tested |

## Forge

| Route | Notes |
| --- | --- |
| `POST /api/forge/interpret`, `/investigate` | rate limited, provider seam |
| `POST /api/forge/assistant` | bounded `research-context/1`, output audit, labelled local brief |

## Environment variables (names only)

`NASA_API_KEY`, `NEXT_PUBLIC_NASA_API_KEY` (legacy name, still read), `GEMINI_API_KEY`,
`OPENROUTER_API_KEY`, `ARENA_API_KEY`, `NOVA_GEMINI_MODEL`, `NOVA_ANALYST_MODEL`,
`EARTH_ANALYST_OPENROUTER_MODEL`, `EARTH_ANALYST_ARENA_MODEL`, `CORS_ORIGINS`,
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NEWS_API_KEY`, `GNEWS_API_KEY`,
`GUARDIAN_API_KEY`, `YOUTUBE_API_KEY`, `PORT`.

No values are recorded here or anywhere else in the repository.
