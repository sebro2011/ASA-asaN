# API status report

Status of every server route as of **2026-11-13** (Guardian routes added; the AI
provider evidence block below was re-measured on 2026-11-13 and is labelled with
its timestamps). "Live" means a response was
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

## AI providers — production evidence, re-measured (2026-11-13T15:57–15:59Z)

`GET /api/nova/diagnostics?probe=1` against the live deployment of **`aeb601e`**
(`main`), three probes inside two minutes. Each is a real upstream call made from
Vercel — this sandbox has no egress to `generativelanguage.googleapis.com`, which
is why the measurement had to come from the deployment:

| Provider | Configured | Status | Detail (probe 1 / 2 / 3) |
| --- | --- | --- | --- |
| Local engine | yes | **ok** | in-process `nasa-local-engine` |
| OpenRouter | yes | **ok** | `openrouter/free`, HTTP 200 — 499 ms / 10 253 ms / 509 ms |
| Gemini | yes | **error** | `gemini-3.8-flash` → **503 `PROVIDER_UNAVAILABLE`** every time (499 / 6 425 / 246 ms); last fallback `gemini-2.5-flash` → **404 `PROVIDER_MODEL_NOT_FOUND`** (143 / 149 / 150 ms); `GET /v1beta/models` → **200** (76 / 69 ms), **49** models listed |
| Arena | no | not configured | correctly reported as unavailable |

The provider's own body, returned by all three probes:

```
{ "error": { "code": 503, "message": "This model is currently experiencing high
  demand. Spikes in demand are usually temporary. Please try again later.",
  "status": "UNAVAILABLE" } }
```

What that settles:

1. **The key is valid.** `keyValid: true`, `GET /v1beta/models` → 200 in 69–76 ms.
   No 401, no 403, no 402.
2. **The primary model id is not the problem.** `gemini-3.8-flash` answers 503 —
   the model exists and is refusing work, in the vendor's words.
3. **A listing is not an entitlement.** `gemini-2.5-flash` appears in the key's own
   49-model `generateContent` list, and answers 404 when called. That is the
   "listed yet 404" case, and it is the vendor's retirement notice, not a bug in
   the probe (`docs/nova/INTELLIGENCE_LEVELS_MAPPING.md` §9 records the body:
   *"no longer available to new users … use models/gemini-3.8-flash"*).
4. **It is not a momentary spike in this observation window.** Three probes, two
   minutes, identical outcome — plus the probes recorded on 2026-11-09, -11-10 and
   -11-12 in `docs/nova/AI_PROVIDER_DIAGNOSTICS.md`. The message says "usually
   temporary"; for this project it has not been.

Conclusion: **NOVA answers through OpenRouter and the local engine.** Gemini
generation is refused by the API for this deployment and is *not* operational.
What is still unknown is narrower than before: the report does not say whether any
of the four *alternative* ids can generate, because `modelsTried` collapsed five
attempts into five names and only the last one kept its status. `modelAttempts`
(the next probe's payload, added on this branch) keeps each attempt's status, so
one probe will answer it.

The earlier revision of this report called the 404 "unexplained"; the vendor's own
message above explains it (a retired id, still listed). It is kept here as a
correction rather than a rewrite, because the first reading — "the list and the
call disagree, so this must be an access problem" — is the trap a future reader
will fall into too.

## AI providers — after the merge, with per-id evidence (2026-11-13T17:50:01Z)

The three probes above ran on `aeb601e`, which could not report *per attempt*
statuses. PR #54 merged as `44c2cc7`; production redeployed and was probed again,
and the one question the earlier probes could not answer is now answered:

| Attempt (in order) | Status | Code | ms |
| --- | --- | --- | --- |
| `gemini-3.8-flash` (pinned) | **429** | `UPSTREAM_RATE_LIMITED` | 124 |
| `gemini-flash-latest` | **503** | `PROVIDER_UNAVAILABLE` | 721 |
| `gemini-2.5-pro` | **404** | `PROVIDER_MODEL_NOT_FOUND` | 147 |
| `gemini-2.5-flash-lite` | **404** | `PROVIDER_MODEL_NOT_FOUND` | 136 |
| `gemini-2.5-flash` | **404** | `PROVIDER_MODEL_NOT_FOUND` | 149 |
| OpenRouter `openrouter/free` | **200** | `OK` | 2 090 |
| local engine | **ok** | `OK` | — |

The primary id's body changed with the same deployment, and it is more specific
than "high demand":

```
{ "error": { "code": 429, "message": "You exceeded your current quota, please
  check your plan and billing details. For more information on this error, head
  to: https://aistudio.go…" } }
```

What this settles, and what it retires:

1. **No model id in the fallback chain can be pinned into working order.** Only
   `gemini-flash-latest` still exists and it answers 503; the three 2.5 ids are
   404 for this project. "Pin a different model" is therefore no longer a
   hypothesis worth testing — the report itself carries the measurement.
2. **The 429 names quota and billing**, which is an account action in Google
   Cloud / AI Studio, not a code change. `modelListed: true` on the same payload
   restates the trap: the id *is* in the key's catalogue.
3. **NOVA is unaffected.** OpenRouter answered 200 in 2.09 s and the local engine
   is `ok`, so the answer path is intact; only this optional provider is refused.

Caveat, stated rather than smoothed over: the primary's code has now been seen as
**503 and 429** on different days, so the upstream refusal is not one fixed cause.
Both readings are recorded with their timestamps. The constant is the key: valid,
listing 49 models, generation refused.

## NASA data

| Route | Upstream | Cache | Freshness | Status |
| --- | --- | --- | --- | --- |
| `GET /api/apod` | api.nasa.gov/planetary/apod | in-memory + SW | `cached` flag, source line in UI | tested |
| `GET /api/apod-range` | api.nasa.gov | — | — | tested |
| `GET /api/asteroids/neows` | api.nasa.gov/neo | **10 min** (keyed by date range) · `cached` + `fetchedAt` | `fetchedAt` | live-unverified upstream · cache tested |
| `GET /api/epic` | api.nasa.gov/EPIC | **15 min** · `cached` + `fetchedAt` | `fetchedAt` | live-unverified upstream · cache tested |
| `GET /api/exoplanets` | NASA Exoplanet Archive TAP | **24 h** · `cached` + `fetchedAt` | `fetchedAt` | live-unverified upstream · cache tested |
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

## COSMORA API Guardian (added 2026-11-13)

Public reads are credential-free and `no-store`; every action fails closed without
`GUARDIAN_ADMIN_TOKEN`, and the cron entry fails closed without `CRON_SECRET`.
"Tested" below means covered by `scripts/test-guardian-*.mjs`; the deployed
behaviour was smoke-tested on the mounted Express app in this environment, **not**
against a live Supabase project.

| Route | Auth | Source | Cache | Failure mode | Verified |
| --- | --- | --- | --- | --- | --- |
| `GET /api/guardian/health` | none | store + monitor | `no-store` | 200 with `distributed: false` when the store is memory | tested + mounted-app smoke |
| `GET /api/guardian/status` | none | store + monitor | `no-store` | 200; providers, breakers, store capability and its reason | tested + mounted-app smoke (13 providers, memory) |
| `GET /api/guardian/providers` | none | catalogue | `no-store` | static | tested |
| `GET /api/guardian/runs` · `GET /api/guardian/analytics` | admin | store | `no-store` | 403 `GUARDIAN_LOCKED` when unconfigured | tested |
| `GET /api/guardian/audit` | admin | store | `no-store` | 403 when unconfigured; append-only rows | tested |
| `GET /api/guardian/config` | admin | env | `no-store` | env **names** and readiness only, never values | tested |
| `POST /api/guardian/run` | admin | 13 providers | — | `ran:false` + holder when a sweep is leased; metered providers skipped unless deep | tested |
| `POST /api/guardian/verify` | admin | one provider | — | probe timeout → typed failure, never "ok" | tested |
| `POST /api/guardian/recovery` | admin, 5/min | recovery actions | — | verification failure re-opens the circuit; human-only actions refused | tested |
| `GET /api/guardian/cron` | `CRON_SECRET` | monitor | — | 503 `SCHEDULE_SECRET_MISSING` when unset; 200 `ran:false` when a sweep is held | tested + mounted-app smoke (503) |

## Proxy caching (2026-11-13)

`/api/asteroids/neows`, `/api/epic` and `/api/exoplanets` used to call their
upstream on every request, spending the shared `DEMO_KEY` quota on identical
answers. They now use a bounded TTL cache (`server/ttlCache.ts`):

| Route | TTL | Entries | Why that TTL |
| --- | --- | --- | --- |
| `/api/asteroids/neows` | 10 min | 40 (one per date range) | the feed changes daily; 10 min covers a browsing session |
| `/api/epic` | 15 min | 4 | a handful of frames per day |
| `/api/exoplanets` | 24 h | 2 | a fixed query over a catalogue that changes on the order of months |

Every response carries `cached: true|false` and `fetchedAt` (the time the value was
actually fetched, not the time of this request), and sets
`Cache-Control: public, max-age=<remaining>`. An **expired entry is deleted, not
served** — when the upstream then fails the answer is a 503 with no data, never
yesterday's numbers presented as today's. Tested in `scripts/test-nasa-cache.mjs`
(12 cases).

## Environment variables (names only)

`NASA_API_KEY`, `NEXT_PUBLIC_NASA_API_KEY` (legacy name, still read), `GEMINI_API_KEY`,
`OPENROUTER_API_KEY`, `ARENA_API_KEY`, `NOVA_GEMINI_MODEL`, `NOVA_ANALYST_MODEL`,
`EARTH_ANALYST_OPENROUTER_MODEL`, `EARTH_ANALYST_ARENA_MODEL`, `CORS_ORIGINS`,
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NEWS_API_KEY`, `GNEWS_API_KEY`,
`GUARDIAN_NEWS_API_KEY` (newspaper news key; `GUARDIAN_API_KEY` is its deprecated
alias), `YOUTUBE_API_KEY`, `PORT`.

No values are recorded here or anywhere else in the repository.

## Follow-up verification — branch `arena/f34c77a3-asa-asan` (2026-11-12)

Previous production observations above are historical, not current health checks.
No live provider or NASA request was made in this session: outbound access is
restricted. POWER proxy validation, cache separation, upstream fallback and
provenance were exercised with stubbed upstream responses. Its cache coordinates
now match the four-decimal precision sent to NASA. Credentials remain server-side;
see `.env.example` for variable names. Provider configuration alone does not prove
availability.

POWER follow-up: the proxy rejects a successful HTTP response lacking an object at
`properties.parameter` and will not cache that malformed response. The client
keeps upstream retrieval times and identifies omitted fallback parameters. Earth
analyst capability now reports whether any supported remote key is configured;
this is configuration only, not proof of provider health. All were tested with
stubs, not live upstreams.

### NeoWs and EPIC follow-up

Both endpoints retain their successful response shapes, but return a JSON 503
with `NEOWS_UNAVAILABLE` or `EPIC_UNAVAILABLE` on upstream failure or invalid
shape instead of fabricated observations. Older fallback payloads are rejected by
the browser helpers. NeoWs direct public fallback is retained; successful client
responses are cached in memory for 30 minutes; EPIC frames for one hour. Server
proxy caching has not yet been added. Tests used injected responses; no live
NASA request or deployed behavior was verified in this session.

### APOD, Exoplanet Archive and ISS follow-up

- APOD and APOD range: valid upstream data retains the success shape; invalid
  dates get 400; upstream failure gets 503 `APOD_UNAVAILABLE` rather than a
  fabricated example. A historical lookup cannot populate the today cache.
- Exoplanet Archive: successful valid catalog records retain their shape;
  failures get 503 `EXOPLANETS_UNAVAILABLE`, not an unverified catalog.
- ISS: a validated upstream observation carries its observation timestamp in
  milliseconds; on a later failure a genuine last-known fix is marked
  `isFallback`; before any fix the endpoint answers 503 `ISS_UNAVAILABLE`.
  The current client uses its labelled simulation instead of treating a stale
  proxy response as live. Verification was stubbed; no live service was tested.

### Translation / NOVA follow-up

`POST /api/translate` accepts bounded title and explanation and `en`, `si`, or
`ta`. English returns the original; other languages use configured Gemini and
return `provider: gemini` on success. On missing configuration, invalid model
output, timeout or failure the route returns 503 `TRANSLATION_UNAVAILABLE`; it
never invents a translation. Per-process rate limit: 15 requests/minute per
Express client IP. Cache keys include the full original text and target language.
These paths and NOVA history limits were tested with stubs; real provider
availability and translation accuracy were not verified.

### Mars Rover Photos

`GET /api/mars/photos` accepts `rover` (curiosity, opportunity, spirit), integer
`sol` (0–10000), and integer `page` (1–100). It returns validated photo metadata,
source, retrieval time, cache status, omitted count and heuristic `hasMore`;
invalid input is rejected and upstream failure returns 503 rather than fake
photos. Server-side NASA key configuration uses the existing `NASA_API_KEY`
environment variable (or DEMO_KEY); the route is rate-limited per process. Tests
use mocked upstream responses: live NASA availability and actual host coverage
have not been verified.

### News feed follow-up

`GET /api/news` returns provider `items` (not just `articles`); the shared news
client now reads these and uses a versioned runtime cache. Provider information
and publication time are preserved in the feed. The existing sample fallback is
still returned by the helper on empty/error and marked `_isSample`; this feed
filters it rather than attributing it to NASA. At that stage the feed could not distinguish an empty result from an outage;
see the structured status follow-up below. Live providers were not verified.

### Structured news status follow-up

The feed now consumes `fetchSpaceNewsStatus`: a successful empty `items` array
is distinct from HTTP/network/timeout/malformed-response failure. A provider
`error` state on a successful aggregate is reported as partial. Refresh bypasses
the client cache, not necessarily the server cache. The existing
`fetchNasaNews` contract remains unchanged. Results were verified with stubs.

### News rate limiting security follow-up

`GET /api/news` and `GET /api/news/papers` each allow 30 requests per 60-second
fixed window per Express-resolved IP and router instance; excess returns 429
with `code: rate-limited` and `Retry-After`. The limit applies before query
validation and cache lookup. `/api/news/sources` has no such limiter. No
production proxy chain was verified, and per-process state cannot enforce a
single global limit. See the security audit in the master report.

### Live NASA / AI verification attempt — 2026-11-12

**Blocked; no live provider request was made.** This workspace's outbound network
policy permits only GitHub, npm and PyPI hosts, not NASA, Gemini, OpenRouter or
Arena API hosts. A shell-environment presence check found `NASA_API_KEY`,
`NEXT_PUBLIC_NASA_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`,
`ARENA_API_KEY` and `ARENA_BASE_URL` unset; `.env`, `.env.local` and
`.env.production` were not present. This is not evidence about configuration in
any deployed environment. NASA routes may use `DEMO_KEY` where implemented,
but that does not overcome the network restriction. No secret values were read
or recorded. Historical deployment/provider observations elsewhere in this
report do not establish current health.

Follow-up requires an approved network-enabled environment and server-side
configuration. Exercise NASA APOD, NeoWs, EPIC, Mars and POWER using bounded
requests and validate provenance, dates, shape and non-fabricated failure; test
NOVA remote providers explicitly (not `auto` alone), record requested and actual
provider/model, and distinguish configured, reachable, failed and local fallback.
Provider calls can consume quota or incur costs. Never record keys, raw secret
headers, key-bearing URLs, private prompts or sensitive output. Do not change
production settings or target production without authorization.

### Authorized production live smoke checks — 2026-11-12 ~15:01 UTC

After the blocked sandbox preflight above, the user authorized production endpoint
checks. The page-fetch tool (separate from sandbox networking) reached the public
production alias; Vercel metadata identified production commit `f3d5e21` as READY
and promoted. These were point-in-time checks, not deployment-wide guarantees:

| Request | Observed response |
| --- | --- |
| `/api/health` | `status: ok` (app health only). |
| `/api/asteroids/neows` for 2024-01-01 | `success: true`, 3 objects under the requested date; upstream key-bearing links were redacted. |
| `/api/epic` | `success: true`, 11 frames with dates and NASA image URLs; image downloads not tested. |
| `/api/earth/power` for 7.2, 79.9, 2023, T2M | `ok: true`, requested/used parameter T2M, undegraded, not from cache, monthly data returned. |
| `/api/apod?date=2024-01-01` | `APOD_UNAVAILABLE`, network reason, no data; subsequent `/api/apod` returned `APOD_UNAVAILABLE`, upstream 200 but a NASA logo was identified as degraded. Direct NASA DEMO_KEY historical request returned the generic NASA Science logo, not the requested picture. Causes of the two failures were not proven. |
| `/api/mars/photos?rover=curiosity&sol=1000&page=1` | `MARS_UPSTREAM_ERROR`, no photos. A direct NASA DEMO_KEY URL produced a page titled `No such app`; the page-fetch tool did not expose HTTP status, so upstream status and cause remain unconfirmed. |
| `/api/nova/diagnostics?probe=1` | OpenRouter configured and probe HTTP 200; Gemini configured, primary model HTTP 503, final reported alternative HTTP 404; model-list metadata HTTP 200; Arena not configured. Local reports in-process. The probe treats 2xx status as success without checking generated content; it is not an end-to-end chat test. |

Gemini's production diagnostic hint incorrectly said all failures were the same
and inferred a cause; mixed 503/404 disproved that assertion. The branch now
makes the hint and UI copy cautious. This local fix has **not** been deployed.
No real chat completion, translation accuracy, image download or device/browser
behavior was verified. No production configuration changed. NASA and provider
availability can change; repeat checks only with authorization and quota care.

### Forge limiter follow-up

Forge rate limits per resolved IP and router instance remain: catalogue 60,
interpret 40, investigate 8 and assistant 20 requests per 60-second fixed
window. Beyond the limit the existing `RATE_LIMITED` response and `Retry-After`
remain. They now use Express IP resolution in this branch; deployment still
runs the older code until changes are deployed. No real proxy chain was tested.

### NASA imagery exploration update — 2026-11-12

An authorized production `/api/nasa-archive` search for `Mars rover Curiosity`
returned three NASA Image Library records and a NASA hit count, including
Earth-based testing. The new branch UI uses that existing route separately from
`/api/mars/photos`; it does not repair the latter or supply sol-based records.
NASA Images responses missing an item array or valid total are now rejected by
the branch adapter. NASA Science WordPress point samples were examined, but no
new APOD provider/fallback was added: source contract, video and historical
coverage require further verification. Branch UI and validation are not deployed.

### NASA archive and APOD navigation follow-up

`GET /api/nasa-archive` now rejects malformed/duplicate `q`, `year`, `page`, or
`limit` in this branch with `INVALID_QUERY`, before contacting the upstream;
previously `parseInt` could silently alter inputs. On APOD failure the viewer
provides an external selected-date NASA record link. The historical 2024-01-01
link redirected to the corresponding NASA Science record during a page-fetch
check; this does not verify every date or fix the APOD API. Branch changes are
not deployed.

### APOD NASA Science fallback — branch implementation

`GET /api/apod` first tries the existing legacy API. If unavailable, malformed
or degraded it may return a date-matched NASA Science featured image with
`data.source: NASA Science APOD archive`, `data.source_url` and a media note.
It returns the existing 503 unavailable response when the alternate cannot be
verified. `GET /api/apod-range` does not use the fallback; it now rejects
out-of-range or degraded records. Primary provider success continues unchanged.
The production alias still runs the prior commit until deployment. NASA Science
search/media samples were observed live, but the new branch adapter and its
end-to-end production behavior were not verified live.

### APOD recheck after reported Vercel key change — 2026-11-12

At the user's request, the production APOD endpoint was rechecked for today and
2024-01-01. Both reported `APOD_UNAVAILABLE`, `fallbackReason: degraded`,
`upstreamStatus: 200`, and `keySource: configured`: the upstream returned the
NASA site logo, not a usable APOD. Vercel metadata still showed production
commit `f3d5e21`, before this branch's NASA Science fallback. This does not prove
whether the newly supplied key was included in the active deployment; key values
were not read. No deployment or environment modification was performed.
