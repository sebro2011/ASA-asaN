# Technical architecture

Describes the system as it exists at commit `arena/ad469a17-asa-asan`. No targets,
no aspirations — if it is here, it is in the tree.

## Stack

| Layer | Choice | Evidence |
| --- | --- | --- |
| Build | Vite 7 (rolldown) + `@vitejs/plugin-react` | `vite.config.ts` |
| UI | React 19 + TypeScript + Tailwind v4 + hand-written CSS tokens | `src/styles/*.css`, `src/app/theme.tsx` |
| Router | in-app surface switching (`lazy` + `AppShell`), not a file router | `src/App.tsx` |
| Server | Express 5 in `server.ts`, bundled for Vercel by esbuild into `api/index.js` | `package.json`, `vercel.json` |
| i18n | i18next, 1 627 keys × `en`/`si`/`ta` | `src/i18n.ts`, `src/i18n/*.ts` |
| Tests | `node --import tsx --test` with `.mjs` suites, jsdom for DOM | `scripts/` |
| PWA | `vite-plugin-pwa` (generateSW), 158 precache entries | `vite.config.ts` |
| AI | provider seam + orchestrator (Gemini → OpenRouter → Arena), local engine fallback | `server/earth/providers.ts`, `server/earth/providerOrchestrator.ts`, `server/novaChat.js` |

## Directory map

```
src/
  app/            shell, sidebar, top bar, theme, hooks, nav config
  workspace/      surfaces: chat, home, news, search, settings, modules, intelligence
  explore/        ExploreApp (second, independent shell)
  components/     feature components (APOD, ISS, asteroids, solar weather, 3D …)
  features/       hypothesis-forge (13 modules) incl. research workspace
  lib/            domain libraries: earth/*, forge/*, nasaApi shim, apodMedia
  ui/             shared primitives, chart frame, error boundary
  styles/         tokens.css, nova-tokens.css, workspace.css, forge CSS
server/
  nasaRoutes.ts   all NASA/NOAA proxies (APOD, NeoWs, EPIC, exoplanets, ISS, SWPC)
  nasaImageLibrary.ts  NASA Images search adapter (new)
  earth/          providers + orchestrator + local analysis (persona seam)
  forge/          connectors, science connectors, investigate, project assistant
  spaceNews.ts, spaceVideos.ts, communityVideos.ts, workspaceConfig.ts
  novaChat.js, novaDiagnostics.js, novaThinking.js  (AI core, plain JS)
lib/              legacy root modules (nasaApi.js, dbCache.js), re-exported by src/lib
components/       four legacy root components, imported by path from src/explore
```

`@/` resolves to the **repository root** (`vite.config.ts`), which is why
`@/lib/nasaApi` and `src/lib/nasaApi.js` both exist. See audit finding T1.

## Request flow

1. Browser calls a relative `/api/*` path.
2. Express (`server.ts`) applies, in order: JSON body limit (256 kb) → CORS
   decision (`server/cors.ts`) → security headers (CSP, `nosniff`,
   `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) → per-route rate
   limit → the router.
3. NASA/NOAA routes call the upstream with `AbortSignal.timeout`, redact any
   `api_key=` echo (`redactApiKeys`), and either return data with provenance
   (`source`, `fetchedAt`, `stale`, `cached`) or a typed failure
   (`{ success: false, code }`). There is no synthetic fallback value anywhere in
   the data routes as of this branch.
4. AI routes adapt the request into `handleNovaChatRequest`, which selects a
   provider, applies retry/backoff for transient statuses only, and returns either
   a provider answer with metadata or the labelled local engine answer.
5. In production the same Express app is exported from `server/vercelEntry.ts` and
   bundled to `api/index.js`; `vercel.json` rewrites `/api/*` to it.

## Data integrity rules (enforced, tested)

- Every NASA record carries a real upstream identifier or it is dropped
  (`server/nasaImageLibrary.ts`, `test-nasa-archive.mjs`).
- A measurement is never substituted: outage → last *measured* sample marked
  `stale`, or a 503 (`server/nasaRoutes.ts`, `test-solar-weather.mjs`).
- The client distinguishes `loading | live | stale | sample` and prints the
  distinction (`src/components/SolarWeather.jsx`, `test-solar-weather-dom.mjs`).
- Research projects treat evidence as untrusted input: citations require a real
  identifier, and the assistant refuses citations that are not in the context.

## Security model

| Concern | Control |
| --- | --- |
| Secrets | server-side only; `src/` contains zero `import.meta.env` reads |
| Provider responses | keys redacted from echoed URLs (`API_KEY_PATTERN`) |
| SSRF | exact-host https allowlists in connectors; redirects not followed |
| CSP | explicit `frame-src`, `object-src 'none'`, no `unsafe-eval` in production |
| Rate limits | per-route token buckets (`rateLimit`) on AI, community, Forge, YouTube |
| Prompt injection | external text declared as data; assistant output audited before display |
| Payloads | typed validation, bounded sizes (`express.json` 256 kb, context ≤96 kb) |

## Testing strategy

- **Unit/contract**: pure modules (`src/lib/**`, adapters) tested directly.
- **Route contract**: `scripts/api-routes.mjs` + `test-api-routes.mjs` boot the real
  app on an ephemeral port and assert status/code shape for every route.
- **Injected transport**: adapters accept a `fetchImpl` so outages, timeouts and
  malformed bodies are testable without network (`test-nasa-archive.mjs`,
  `test-forge-science-connectors.mjs`).
- **DOM**: jsdom + `react-dom/client` and React `act`, asserting ARIA contracts and
  user-visible copy (`test-forge-research-workspace.mjs`, `test-solar-weather-dom.mjs`).
- **Static invariants**: CSS scroll rules, copy overclaims, and "no fabricated id"
  regexes are asserted as tests so a regression fails CI, not review.

## Where to add things

| Task | Where |
| --- | --- |
| New NASA proxy | `server/nasaRoutes.ts`; copy the cache/freshness/typed-failure shape; add to `scripts/api-routes.mjs` |
| New external dataset | adapter module under `server/` or `server/forge/` accepting `fetchImpl`; add injected-fetch tests |
| New AI provider | `server/earth/providers.ts` + `ProviderId`; the orchestrator handles retry/fallback |
| New surface | `src/workspace/**` + `React.lazy` in `src/App.tsx`; add a nav entry in `src/app/navConfig.ts` |
| New Forge module | `src/features/hypothesis-forge/**`, section id in `src/lib/forge/types.ts`; keep the `role="tab"` contract in `test-forge-scroll.mjs` honest |

### POWER proxy and Earth rate limits — follow-up 2026-11-12

POWER cache keys use the four-decimal coordinates sent to the upstream service;
results retain the original retrieval time and source URL on cache hits. POWER
start/end years must be integers and numeric query fields must be nonempty scalar
strings. Earth rate limits use Express `req.ip`, not the raw forwarded header.
The app does not configure `trust proxy`: behind a reverse proxy, clients may
share a bucket. Configure trusted proxy hops only for a known deployment topology;
never trust arbitrary forwarded headers. The existing in-memory limits are per
process and are not a distributed abuse-control mechanism.

### POWER client provenance and offline behavior

The browser POWER cache uses versioned four-decimal keys; previous three-decimal
entries are not reused. Cached results preserve the original upstream retrieval
time. Invalid, blank and null monthly values are missing, not zero. If a provider
falls back to a subset, omitted requested parameters are reported unavailable.
Workbox's generic long-lived image rule no longer matches arbitrary NASA JSON,
and POWER proxy responses bypass Workbox runtime caching to avoid presenting an
unmarked offline response as live. POWER's own application-level cache remains.

### NeoWs / EPIC outage handling

NeoWs reports unavailable rather than producing a synthetic close-approach feed.
The radar screens only usable Earth-approach records, with a seven-day inclusive
UTC window; thresholds are app-defined and not NASA impact predictions or PHA
classifications. The test-alert control remains explicitly simulated. EPIC's
proxy preserves missing metadata as null and returns no fabricated frames on
failure. Playback remains disabled when the frame list is empty. Both client
helpers reject legacy flagged fallback payloads, including cached old-server
responses; offline imagery and asteroid telemetry therefore require a valid
cached observation rather than a made-up sample.

### APOD, Exoplanet Archive and ISS integrity

APOD validates requested dates, separates today from dated cache entries, rejects
legacy sample responses and does not fabricate range entries. The viewer ignores
out-of-order responses. The Exoplanet Archive viewer shows missing values as N/A
and labels procedurally generated imagery as illustrative, not observations.
The ISS proxy stores only a validated real fix and preserves its acquisition
 timestamp; the client does not promote stale fixes to live. Ground distance is
not used to infer a next pass: neither ISS display currently predicts pass times.
The simplified fleet orbital code is not an SGP4 implementation.

### NOVA history and translation integrity

Workspace chat sends at most 12 turns, fitting within the server's 20 KiB text
limit and reserving JSON envelope space; it preserves the current turn for server
validation rather than truncating it. Translation requires a configured Gemini
provider, validates input/output shape and uses bounded full-content-keyed cache.
When translation fails, the existing UI can retain the source and report failure;
old unlabelled fallback translations are rejected by the client. The legacy AI
helper falls back to the same labelled deterministic local engine used by NOVA.
The 2.5-second translation timeout bounds the response wait but does not cancel
an already-started Gemini SDK request; rate limiting is per process, not global.

### Historical Mars rover gallery

The Missions gallery requests the same-origin `/api/mars/photos` proxy for
Curiosity, Opportunity or Spirit by sol and page. The server uses the configured
NASA key (or DEMO_KEY), bounds input and upstream wait, accepts trusted NASA image
hosts only and removes key query parameters before returning image URLs. An
80-entry, 30-minute process-local cache retains retrieval time. Upstream pages
are interpreted as having a possible next page when 25 records are returned;
this is not a verified total count. Existing conceptual image tagging is separate
from this gallery and is not presented as NASA observations.

### News feed data and translation

The news feed uses `/api/news` through the shared client; it reads the endpoint's
`items` array and displays each provider's source label. Its legacy IndexedDB
cache is bypassed because its provenance is not reliable. The shared helper's
sample fallback remains labelled for compatibility, but this feed filters it
out. News translations use the existing translation endpoint; unavailable
translations leave the original visible. The APOD highlight shows original text;
the dedicated APOD viewer offers translation.

### Structured news status

`fetchSpaceNewsStatus` is a separate API from the legacy array helper. It validates
`/api/news` response structure, uses a 12-second abort timer and a 30-minute
in-memory success cache, preserves upstream `generatedAt` and cache status, and
reports failed providers as partial. Refresh drops and bypasses the client cache,
but the server may still respond from its own cache. A request sequence prevents
stale news responses from replacing a newer request in the component.

### News limiter and proxy trust

News and papers use separate 30-request/60-second fixed-window buckets per
Express-resolved client address and router instance. The router no longer parses
forwarding headers itself. The application leaves Express `trust proxy` at its
default false, so `req.ip` is normally the socket peer; behind a reverse proxy
users can share that peer's bucket. Do not set trust to true or a hop count
without verifying every network path and header sanitization. The fixed-window
map is in process memory, not shared or globally purged; it is not a distributed
abuse-control mechanism. Forge has its own separate forwarding-header issue.

### Live diagnostics caveat

Provider deep diagnostics performs upstream probe requests and classifies success
by HTTP status, not by a validated completion body. A successful metadata key
check proves only that metadata request succeeded, not generation permission.
Legacy `modelInvalid` and `keyValid` fields are retained for compatibility, while
UI copy and hints now qualify their meanings. Live production observations and
branch changes are separately documented; this change was not deployed.

### Forge limiter and proxy trust

Forge's independent fixed-window limiter now uses Express `req.ip` and socket
fallback instead of parsing forwarded headers. The four route-specific budgets
remain per router instance and process. Express `trust proxy` remains disabled by
default; deployment-specific proxy topology and header sanitization must be
verified before trust is changed. Bucket maps do not provide global enforcement
or bound long-term cardinality.

### Mars archive explorer

The Missions explorer calls the existing same-origin NASA Images archive proxy,
not the unavailable sol-based Mars Rover Photos endpoint. It searches `Mars
rover <name>` and exposes the NASA record link and source; results are not
claimed to be captured on Mars or on any selected sol. Only NASA Images asset
and record hosts are used as browser links/previews; rejected or missing previews
are not replaced with stock imagery. Server collection parsing requires an items
array and a valid nonnegative integer total. Source schema, cache, pagination
and other clients remain shared with the existing archive.

### NASA archive input and APOD outage navigation

`/api/nasa-archive` requires a scalar query and rejects blank, fractional,
duplicate or malformed optional numeric parameters rather than defaulting them.
The adapter enforces numeric ranges. When the APOD proxy fails, the viewer
exposes the selected date's historical NASA APOD record URL as an external link;
it does not turn that link into in-app data. NASA controls redirects and source
availability, and no universal date-link guarantee is made.

### APOD NASA Science image recovery

On legacy APOD failure/degraded response, the single-record proxy searches NASA
Science's WordPress image-article endpoint with the requested date (UTC date when
omitted). It matches the APOD title's full date rather than the CMS publication
date, rejects ambiguity and obvious video embeds, extracts bounded plain-text
explanation, and resolves the associated image ID from NASA Science media. It
accepts only NASA Science article and APOD asset hosts/paths, times out each
request after 3 seconds, and returns source and original record URL. No scraped
credit is invented; the featured image may not always represent original media,
so the UI labels it and links to the source. Fallback uses the existing APOD
cache. Range requests remain on the legacy provider and fail closed on degraded
or out-of-range records. The WordPress integration is dependent on an observed
schema and markup, not a formally verified stable APOD API contract.
