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
