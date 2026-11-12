# Test results

Latest full run: **2026-11-12**, branch `arena/ad469a17-asa-asan`.

| Command | Result |
| --- | --- |
| `npm run lint` (`tsc --noEmit`) | clean |
| `npm run build` | exit 0 · 158 precache entries · entry chunk 888 KB |
| `npm test` | **704 pass / 0 fail** |
| `npm run test:forge` | 224 pass / 0 fail |
| `npm run test:nasa` | 22 pass / 0 fail |

`npm test` runs 44 suites: `lint`, `test:api-routes`, `test:apod`, `test:earth`,
`test:nova-chat`, `test:nova-diagnostics`, `test:space-videos`, `test:space-news`,
`test:community`, `test:ai-viewer`, `test:welcome`, `test:earth-server`,
`test:earth-analyst`, `test:earth-analyst-ui`, `test:space-build-security`,
`test:security-performance`, `test:workspace` (17 sub-suites), `test:nasa`,
`test:forge` (11 sub-suites).

## Suites added on this branch

| Suite | Tests | What it pins |
| --- | --- | --- |
| `scripts/test-solar-weather.mjs` | 5 | both published SWPC shapes, official-vs-estimated Kp precedence, NOAA G-scale, outage → 503, last-measured sample marked stale |
| `scripts/test-solar-weather-dom.mjs` | 3 | panel states `live`/`stale`/`sample` and their labels, "not reported" solar wind |
| `scripts/test-nasa-archive.mjs` | 10 | normalisation from real fields only, dropped malformed rows, encoded preview URLs for spaced ids, allowlist, TTL cache, typed failures, route contract |
| `scripts/test-nasa-archive-client.mjs` | 4 | failure is not an empty success, retry not cached, no fabricated ids in the module |

## What these tests do not cover, and cannot here

- **No live network.** Outbound access from this environment reaches the package
  registries and GitHub only. NOAA SWPC, `images-api.nasa.gov` and `api.nasa.gov`
  are exercised through injected `fetch` implementations, not real endpoints.
  Live behaviour is **unverified** and stated as such in the reports.
- **No browser.** No Playwright/Chromium is available, so there are no screenshot
  or pixel assertions. UI tests run in jsdom and assert DOM contracts and copy.
- **No provider keys.** Gemini/OpenRouter/Arena are tested through injected
  adapters. The production diagnostics output is recorded in
  `docs/API_STATUS_REPORT.md`; it is evidence about the deployment, not a test.

## Follow-up run — branch `arena/f34c77a3-asa-asan`, 2026-11-12

- Node 22.22.3; `npm install --no-package-lock --ignore-scripts`: succeeded,
  reported 6 advisories (2 low, 4 moderate). `npm audit --omit=dev` could not run
  without an npm lockfile; no claim is made about production-only advisories.
- `npm test`: exit 0, 707 passed, 0 failed, 0 skipped (sum of node:test suite
  summaries). Includes TypeScript `tsc --noEmit`, API, NASA, NOVA, Earth, security,
  workspace and Forge tests. Remote calls are mocked where tests use stubs.
- `npm run test:earth-server`: 19 passed including the new validation, cache
  precision and untrusted-forwarded-header regression tests.
- `npm run build`: exit 0; API bundle and Vite/Workbox output generated, 158
  precache entries; Vite warned about chunks over 500 kB (entry 907.66 kB).
- PWA install/offline behavior, responsive real-browser/device rendering, live
  NASA APIs, live AI providers, and production authentication were not tested.

### Additional Earth/PWA follow-up (same branch and date)

- `npm run test:earth`: 31 passed; `npm run test:earth-server`: 23 passed.
- After all follow-up changes, `npm test`: exit 0, 713 passed, 0 failed,
  0 skipped; `npm run build`: exit 0 with the existing large-chunk warning,
  Workbox generated 158 precache entries. PWA cache routing is checked by a
  configuration regression test, not by a real browser offline test.
- Tests simulate POWER and provider configuration; they do not verify live NASA
  or remote AI responses. Real-device visual, accessibility and PWA checks remain
  outstanding.

### NeoWs and EPIC follow-up (same branch and date)

- `npm run test:api-routes`: passed, including new stubbed tests for NeoWs and
  EPIC failures, malformed data, legacy sample rejection and null EPIC metadata.
  The radar outage check is source-level, not a rendered UI test.
- Final `npm test`: exit 0, 718 passed, 0 failed, 0 skipped; includes TypeScript,
  API, security, NASA, NOVA, Earth and workspace suites.
- `npm run build`: exit 0; Workbox generated 158 precache entries; Vite warned
  that some chunks exceed 500 kB.
- No live NASA/AI, browser rendering, real notification, or real-device tests
  were performed. Stub tests do not prove current upstream schema or availability.

### APOD, Exoplanet Archive and ISS follow-up (same branch and date)

- New injected-fetch tests cover APOD date cache separation, invalid dates,
  failure and legacy sample rejection; Exoplanet Archive failure/sample handling;
  ISS no-fix, timestamp and stale-fix handling. Some UI integrity checks are
  source-level rather than rendered browser tests.
- An initial `npm test` failed in `test-workspace-dom`: its hard-coded APOD date
  differed from the requested date and the new validation correctly rejected it.
  The fixture was corrected to return the requested date; final `npm test` exit 0,
  725 passed, 0 failed, 0 skipped.
- `npm run build` exit 0, 158 Workbox precache entries; large chunks still warned.
  TypeScript is included in `npm test`. Live NASA and AI calls, real browser
  rendering, PWA lifecycle, and real ISS pass predictions were not tested.

### NOVA / translation follow-up (same branch and date)

- `scripts/test-translation-chat.mjs`: five tests pass for input validation,
  distinct-content caching, provider failure and malformed output, rejection of
  legacy fallback, local AI fallback, multilingual byte-aware history limits,
  and Express rate limiting. Gemini calls were simulated.
- Final `npm test`: exit 0, 730 passed, 0 failed, 0 skipped. `npm run build`:
  exit 0, Workbox generated 158 precache entries, with the large-chunk warning.
- No real AI provider responses, translation accuracy, live NASA API calls,
  PWA lifecycle or mobile-device layouts were verified in this environment.

### Mars rover imagery follow-up (same branch and date)

- `node --import tsx --test --test-force-exit scripts/test-mars-photos.mjs`:
  3 passed. Stubbed tests cover validation, caching, image normalization,
  empty/malformed/upstream failure and pagination, plus jsdom gallery success
  and unavailable/retry rendering. Retry and page navigation interactions,
  loading rendering and real browser layouts were not separately exercised.
- `npm run lint`: exit 0. Full `npm test`: exit 0, 733 passed, 0 failed,
  0 skipped. `npm run build`: exit 0; 159 PWA precache entries and a
  large-chunk warning. NASA and real devices were not tested live.

### News feed integrity follow-up (same branch and date)

- `scripts/test-news-feed-integrity.mjs`: 2 passed for stubbed current `items`
  schema, caching and labelled failure fallback; feed safeguards are checked
  at source level, not by a browser interaction test.
- `npm run lint`: exit 0; `npm test`: exit 0, 735 passed, 0 failed or skipped;
  `npm run build`: exit 0, 159 PWA precache entries with large-chunk warning.
  No live news, NASA or translation provider was contacted.

### News status follow-up (same branch and date)

- `scripts/test-news-feed-integrity.mjs`: 4 tests passed, including stubbed
  structured empty/partial/error/malformed responses, client cache/refresh and
  jsdom outage, retry to empty and refresh to provider result. No real upstream
  or real browser/device test was performed; timeout duration and stale-request
  race were not separately exercised.
- `npm run lint` exit 0; `npm test` exit 0, 737 passed, 0 failed or skipped;
  `npm run build` exit 0, 159 PWA precache entries, large-chunk warning persists.
  `git diff --check` passed.
