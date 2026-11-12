# Development changelog

Newest first. Every entry states what changed, which files, and how it was verified.
Nothing here is a plan; if it was not executed it is not listed.

## 2026-11-12 — Phase 1 audit + the two critical integrity fixes (branch `arena/ad469a17-asa-asan`)

### Added
- `docs/audits/MASTER_AUDIT_REPORT.md` — repository-wide audit with 20 findings,
  severity, priority, complexity and the commands whose output backs each claim.
- `server/nasaImageLibrary.ts` — adapter for the public NASA Images API
  (`images-api.nasa.gov`): https + exact-host allowlist, argument validation,
  6 s timeout, 5-minute TTL cache (100 entries), shape validation that drops rows
  without a real `nasa_id`/`title`, and attribution in every payload.
- `scripts/test-solar-weather.mjs` (5), `scripts/test-solar-weather-dom.mjs` (3),
  `scripts/test-nasa-archive.mjs` (10), `scripts/test-nasa-archive-client.mjs` (4)
  — 22 tests, wired into `npm test` through the new `npm run test:nasa`.
- `clearNasaImageCache()` and `clearNasaApiCache()` test seams (both process-wide
  caches; the tests exercise several upstream states in one process).

### Fixed
- **Invented space weather.** `/api/solar-weather` answered a NOAA outage with
  `{ kpIndex: 2, status: 'quiet' }` and `success: true`, which the panel rendered
  as a live "NOAA SWPC feed". The route now parses NOAA's `planetary_k_index.json`
  and `plasma-7-day.json`, keeps the last *measured* sample in memory, serves that
  sample with `stale: true` and its original `fetchedAt` when the upstream fails,
  and answers **503 `UPSTREAM_UNAVAILABLE`** when it has never measured anything.
  Files: `server/nasaRoutes.ts` (`parsePlanetaryKIndex`, `parsePlasmaSpeed`,
  `kpStormScale`, `lastKnownSolarWeather`).
- **Solar weather panel labelling.** `src/components/SolarWeather.jsx` had four
  display states collapsed into two, so a stale or sample value could be labelled
  "NOAA SWPC feed". It now distinguishes `loading | live | stale | sample`, prints
  the observation time, labels a bundled value "(not measured)", and shows
  "not reported" instead of borrowing a solar-wind number it does not have.
  `lib/nasaApi.js` normalises the new payload and marks an outage `_unavailable`.
- **Fabricated NASA archive.** `/api/nasa-archive` served thirteen hardcoded
  records with synthesised NASA IDs (`ARTEMIS-ORION-CREW-2025`,
  `JWST-EARLY-COSMOS-2026`, …) and Unsplash stock photos, which
  `src/components/NASANewsExplorer.jsx` printed as "NASA ID" and deep-linked to
  images.nasa.gov. The 212-line catalogue is deleted; the route now performs a real
  NASA Images search, requires a term, returns `source`/`fetchedAt`/`cached`, and
  answers `503 UPSTREAM_UNAVAILABLE` on an outage.
- **Archive UI.** `NASANewsExplorer.jsx` now renders an explicit "NASA Images is
  unreachable" state with a retry button, shows the live source and retrieval time,
  and links to the real `detailsUrl`. `lib/nasaApi.js` `fetchNasaArchive` returns
  `success: false` on failure instead of an empty successful list (which used to
  render the neutral "no results" state for an outage).
- **Dead code carrying invented identifiers.** Removed `fetchMarsPhotos`,
  `searchNasaMedia`, `MOCK_MARS_PHOTOS_FALLBACK` and `MOCK_NASA_MEDIA_FALLBACK`
  from `lib/nasaApi.js`. They had no callers, called `api.nasa.gov` directly from
  the browser with a hardcoded `DEMO_KEY`, and generated `nasa-${Math.random()}`
  identifiers. Mars Rover imagery comes back as a server-side adapter in the
  Phase 3 work (audit finding M5) rather than as a client-side mock.

### Follow-up after the first production deploy (same day)
- **Live archive verified.** Production `/api/nasa-archive?q=artemis&limit=2`
  returned real records (15 260 hits, `nasaId` values such as
  `Artemis Logo Color Positive RGB-July 2021`, `images-assets.nasa.gov`
  thumbnails, `detailsUrl` on images.nasa.gov). Confirmed from
  `https://nasa-space-expolere.vercel.app` on 2026-11-12T10:52:30Z.
- **Space weather still returned `UPSTREAM_UNAVAILABLE` in production**, which was
  correct behaviour but the wrong outcome: SWPC publishes the same product in two
  shapes and the parser only accepted the array form. `parsePlanetaryKIndex` now
  accepts both `products/noaa-planetary-k-index.json` (header + rows) and
  `json/planetary_k_index.json` (objects with `kp_index` / `estimated_kp`), tries
  both URLs in order, and prefers the official `kp_index` over the preliminary
  estimate. Rows with no Kp are still discarded, never read as calm.
- **Thumbnail encoding.** Real NASA ids contain spaces
  (`Artemis Logo RGB`), so preview URLs are now `encodeURI`-ed before they reach
  `<img src>`.

### Live verification (end to end, production)
- `GET /api/nasa-archive?q=artemis&limit=2` → real records, 15 260 hits, real ids
  and `images-assets` thumbnails (2026-11-12T10:52:30Z).
- `GET /api/solar-weather` → real observation: Kp 1.67, `observedAt`
  2026-11-12T06:00:00Z, `stormKey` G0, `fetchedAt` 2026-11-12T11:02:48Z,
  `stale: false` (commit `71d1a80`). The plasma feed returned nothing in that call,
  so `solarWindSpeedKmS` is `null` and the panel says "not reported".
- Lesson recorded for operators: an identical URL can be answered from the edge
  cache, so a route that *looked* broken was returning a cached body. Use a
  cache-busting query when verifying a function.

### Verification
- `npm test` → **704 pass / 0 fail** (was 682; +22 from the new suites).
- `npm run lint` (`tsc --noEmit`) → clean.
- `npm run build` → exit 0, 158 precache entries, entry chunk 888 KB (the build
  still warns that it exceeds 500 KB; see audit finding T3).
- `scripts/api-routes.mjs` updated: `/api/nasa-archive` now expects `400` without a
  query and `[200,502,503,504]` with one.

### Not done in this change
- Live verification of the NASA Images API and NOAA SWPC from this environment
  (outbound access is restricted to package registries and GitHub). Both adapters
  are covered by injected-fetch tests; their live behaviour is unverified here.
- Gemini generation remains unavailable in production (audit finding M1) — the
  diagnosis needs a live key.

## 2026-11-12 — POWER proxy follow-up

- `server/earthIntelligence.ts`: cache POWER requests using the same four-decimal
  coordinate precision sent upstream; reject empty/repeated numeric parameters and
  fractional POWER years; derive rate-limit identity from Express's `req.ip`
  instead of an untrusted forwarded header.
- `scripts/test-earth-server.mjs`: added regressions for cache separation, input
  validation and forwarded-header spoofing. `api/index.js` regenerated by build.
- Updated the master audit and the architecture, API status, test and limitation
  reports. No deployment or production configuration changes.

## 2026-11-12 — Earth data integrity and PWA follow-up

- `src/lib/earth/power.ts`: reject missing and nonnumeric monthly values rather
  than converting them to zero; retain real zeroes; use versioned four-decimal
  browser cache keys; preserve upstream retrieval timestamps on cache hits; show
  requested parameters omitted by fallback as unavailable.
- `server/earthIntelligence.ts`: reject malformed successful POWER JSON instead
  of caching it; health reports remote analyst configuration for OpenRouter and
  Arena as well as Gemini without claiming the provider is healthy. API bundle
  regenerated in `api/index.js`.
- `vite.config.ts`: exclude POWER proxy responses from generic Earth service-worker
  caching and limit long-lived imagery cache to image requests, avoiding silent
  long-lived caching of NASA JSON. Other offline caching remains in place.
- Regression tests added in `scripts/test-earth-intelligence.mjs`,
  `scripts/test-earth-server.mjs`, and `scripts/test-security-performance.mjs`.

## 2026-11-12 — NeoWs and EPIC integrity

- `server/nasaRoutes.ts`: NeoWs no longer returns invented current close-approach
  records on failure; malformed feeds and outages return `503 NEOWS_UNAVAILABLE`.
  EPIC outages similarly return `503 EPIC_UNAVAILABLE` rather than fabricated
  frames; live frames omit absent centroid, position and distance metadata rather
  than inventing it.
- `lib/nasaApi.js`: rejects legacy server sample responses (and avoids caching
  them); NeoWs still tries its direct public fallback. EPIC returns an empty list
  when unavailable and now has a request timeout.
- `src/components/AsteroidRadar.jsx`: uses seven inclusive UTC dates, rejects
  incomplete measurements, removes mock outage data/automatic sample alerts,
  displays an unavailable state, labels the app's screening separately from NASA
  PHA designation, and marks simulated alert notices as tests.
- `src/components/EPICViewer.jsx`: no synthetic image or telemetry on outages;
  disabled empty playback, trilingual unavailable message and signed centroid
  coordinates. J2000 position values no longer get divided by 1,000 in display.
- `scripts/test-neows-integrity.mjs` adds stubbed outage, fallback and response
  checks and is included in `test:api-routes`; `api/index.js` regenerated.

## 2026-11-12 — APOD, Exoplanet Archive and ISS follow-up

- `server/nasaRoutes.ts` and `lib/nasaApi.js`: APOD and exoplanet outages no
  longer substitute unverified examples; return explicit 503 JSON at the proxy
  and empty/error state in clients. APOD validates dates, rejects mismatched
  records and no longer overwrites the today cache with a historical request;
  range requests validate dates and cannot generate synthetic entries.
- `src/components/ApodViewer.tsx`: ignore stale asynchronous responses after a
  newer date is requested. Existing image/video playback logic remains intact.
- `src/components/ExoplanetLab.jsx`: absent measurements and ESI show N/A, no
  guessed facility/date/distance/temperature, and procedural appearance and
  clamped display scale are explicitly labelled as illustrative. Added empty
  state and disposal of generated textures.
- `server/nasaRoutes.ts`, `lib/nasaApi.js`: ISS proxy no longer initializes a
  fabricated current fix; validates upstream fields, preserves observation time,
  and marks a last-known fix as stale. The client never treats the server's stale
  response as live and normalizes seconds/milliseconds.
- `src/components/ISSTracker.jsx`, `components/IssTracker2D.jsx`: removed
  unvalidated pass-time/countdown and visibility claims; retained station
  selection and ground-distance display, with explanatory notices. Corrected
  misleading SGP4 labeling. Existing approximate simulated tracking remains
  explicitly labelled; a real pass-prediction capability is still outstanding.
- `scripts/test-neows-integrity.mjs`, `scripts/test-apod-media.mjs`,
  `scripts/test-api-routes.mjs`, `scripts/test-workspace-dom.mjs`: added or
  updated regressions. `api/index.js` regenerated by build.

## 2026-11-12 — NOVA conversation and translation integrity

- `server/nasaRoutes.ts`: removed the keyword-based translation fallback that
  appended unrelated scientific claims. Invalid input is rejected; missing,
  failed, or malformed Gemini translations return `TRANSLATION_UNAVAILABLE` so
  clients retain the original. Cache keys hash the complete input and language,
  and the cache is capped at 200 successful entries. Successful responses carry a
  provider field; no key is returned.
- `server.ts`: added a per-process rate limit for translation calls.
- `lib/nasaApi.js`: translation client checks the provider field and keys its
  cache on full content, rejecting old unlabelled fallback replies. The legacy
  `askNasaAi` fallback now uses the existing local knowledge engine rather than
  inventing NASA telemetry; unknown remote provider metadata is not guessed.
- `src/workspace/chat/chatClient.ts`: history now fits the server's 12-message,
  per-message and byte limits, preserves the latest user turn, and accounts for
  JSON escaping. Oversized current turns still produce the server's error.
- Added `scripts/test-translation-chat.mjs`, included in `test:api-routes`;
  `api/index.js` regenerated by build. Existing NOVA provider routing is retained.

### Mars rover imagery follow-up

- Added `server/marsPhotos.ts` and rate-limited `/api/mars/photos` mounting;
  validated inputs and NASA image hosts, bounded the in-process cache, and return
  explicit upstream failures rather than sample data.
- Added `src/components/MarsRoverPhotos.tsx` to Missions with en/si/ta controls,
  source, retrieval time, cached state, pagination and retry. Labelled the
  existing Mars image tagger's stock image and annotations as illustrative.
- Added `scripts/test-mars-photos.mjs` to `test:api-routes`; regenerated
  `api/index.js` via the production build. No deployment was performed.

### News feed integrity follow-up

- `lib/nasaApi.js`: read `/api/news` `items` and version the in-memory cache;
  labelled legacy sample fallback remains available to other callers.
- `src/components/NasaNewsFeed.jsx`: do not consume legacy IndexedDB cache or
  sample fallback, use provider names, real dates and image URLs when available,
  retain original text on translation failure, and fix translation busy-state
  cleanup. APOD outages are visible and video is not rendered as an image.
- Added `scripts/test-news-feed-integrity.mjs` to `test:api-routes`. No deployment.

### News status follow-up

- Added `fetchSpaceNewsStatus` with timeout, shape validation, bounded lifetime
  cache, empty/error distinction and partial-provider status; preserved the legacy
  `fetchNasaNews` array contract.
- Feed now displays multilingual failure/retry, empty/search and partial-source
  states. Explicit refresh bypasses its client cache, and request sequence guards
  prevent older news requests from overwriting newer results.
- Expanded news integrity tests with structured-result and jsdom retry flows.

### News rate limiter / proxy trust security audit (2026-11-12)

- `server/spaceNews.ts`: use Express-resolved `req.ip` (socket fallback) rather
  than directly trusting `X-Forwarded-For` for both news and papers. Isolated
  bucket state per router and reset a fixed window at its exact boundary.
- `scripts/test-space-news.mjs`: cover spoofed forwarding headers, separate
  route limits, simulated trusted proxy chain and window reset.
- `scripts/test-security-performance.mjs`: assert the real Express app leaves
  proxy trust disabled by default. Rebuilt the tracked `api/index.js` bundle.
- No trust policy, production configuration or deployment was changed.

### Live verification and diagnostic honesty — 2026-11-12

- Ran user-authorized production read-only smoke checks and one deep diagnostics
  request; results and limitations are in `docs/API_STATUS_REPORT.md`.
- `server/novaDiagnostics.js`: stop asserting all Gemini failures share a cause,
  or that a 404 proves an invalid model ID; retain compatible response fields.
- `src/i18n/workspaceCopy.ts`: make provider metadata, model-list and fallback
  status copy appropriately qualified in English, Sinhala and Tamil.
- Added a mixed-status diagnostic regression and updated workspace copy assertions;
  regenerated `api/index.js`. No production deployment/settings changed.

### Forge rate limiter follow-up — 2026-11-12

- `server/forgeRoutes.ts`: replace direct forwarded-header trust with Express IP
  resolution and align fixed-window expiry to the boundary. Existing endpoint
  budgets, response codes and per-router state are preserved.
- `scripts/test-forge-api.mjs`: cover forged headers on all four routes, local
  trusted proxy chain resolution and fixed-window reset. Rebuilt `api/index.js`.
- No production configuration change or deployment was performed.

### NASA Mars imagery exploration — 2026-11-12

- Added `src/components/MarsArchiveExplorer.tsx` to Missions, separately from the
  existing sol-based rover gallery. It uses the existing `/api/nasa-archive`
  route for NASA Images searches by rover name, including Perseverance, and
  displays source, record date, center, NASA ID, retrieval time, paging, error
  and retry states, with multilingual source/interpretation warnings.
- `server/nasaImageLibrary.ts` now rejects malformed collection item arrays and
  missing/invalid total hit counts rather than fabricating an empty/partial total.
- Added jsdom search, paging, failure/retry and unsafe-link coverage in
  `scripts/test-mars-archive-dom.mjs`, included in `test:nasa`. No deployment.

### NASA archive validation and APOD outage navigation — 2026-11-12

- `server/nasaRoutes.ts`: parse archive `q`, `year`, `page` and `limit` as
  scalar, valid values instead of silently accepting partial or malformed input.
- `src/components/ApodViewer.tsx`: make the selected date's NASA record link
  available when APOD data is unavailable; retain retry and no fabricated fallback.
- Added archive route validation tests and `scripts/test-apod-unavailable-dom.mjs`
  to `test:apod`; production bundle regenerated, no deployment performed.

### APOD NASA Science recovery — 2026-11-12

- Added `server/apodScience.ts`: date-matched, NASA-host-restricted image-article
  and featured-media lookup as an additive fallback when the legacy APOD API
  fails or returns the NASA logo. Unverifiable/video records remain unavailable.
- `server/nasaRoutes.ts`: integrate fallback with existing cache and reject
  degraded/out-of-range range entries. Existing endpoint shapes are retained.
- `lib/nasaApi.js`, APOD viewer, news, home and workspace: preserve and label the
  alternative source and point users to the original record for credits. Client
  timeouts were increased for the additional bounded upstream requests.
- Added stubbed `scripts/test-apod-science.mjs` to `test:apod` and regenerated
  `api/index.js`. No production settings or deployment changed.
