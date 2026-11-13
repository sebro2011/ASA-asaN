# Test results

Latest full run: **2026-11-13**, branch `arena/8a962084-asa-asan`.

| Command | Result |
| --- | --- |
| `npm run lint` (`tsc --noEmit`) | clean |
| `npm run build` | exit 0 · 89 JS chunks · entry **543.90 kB raw / 170.25 kB gzip** (was 920.85 / 245.83 before the locale split) · `si` 173.34 kB / 37.30 kB gzip on demand · `ta` 202.58 kB / 37.76 kB gzip on demand · CSS 63.65 kB gzip |
| `npm test` | **889 pass / 0 fail** across **78** test scripts |
| `npm run test:guardian` | 56 pass / 0 fail (core 28 · monitor/routes 22 · dashboard 6) |
| `npm run test:rate-limit` | 9 pass / 0 fail |
| `npm run test:nova-diagnostics` | 23 pass / 0 fail (4 new: model-list evidence) |
| `npm run test:a11y` | 7 + 5 pass / 0 fail (keyboard reachability; no nameless icon button; label scripts) |
| `npm run test:any-budget` | 2 pass / 0 fail (explicit `any` ≤ 52, strict mode on) |
| `npm run test:docs-links` | 3 pass / 0 fail (every internal link resolves; no orphan documents) |
| `npm run test:security-headers` | 11 pass / 0 fail (prod CSP has no inline script; dev keeps Vite's; proxy trust bounded; live response header matches the policy) |
| `npm run test:process-guards` | 4 pass / 0 fail (log once → exit 1; rejections non-fatal) |
| `npm run test:hygiene` | 6 pass / 0 fail (one lockfile, name/version agreement, no hardcoded versions, CI uses npm ci) |
| `npm run test:nova-routes` | 4 pass / 0 fail (4 paths routed and identical; `/api/nasa-ai` no longer 404s) |
| `npm run test:focus-trap` | 3 pass / 0 fail (Tab wrap, focus restore, wiring of all 4 overlays) |
| `npm run test:contrast` | 7 pass / 0 fail (WCAG ratios computed from `tokens.css` + `nova-tokens.css`; documented numbers re-verified) |
| `npm run test:a11y` | 7 pass / 0 fail (no pointer-only control; `activateOnKey`; Escape wiring; focus ring CSS) |
| `npm run check:pwa` | post-build: 165 precached entries, external registration, no inline scripts |
| `npm run test:nasa-cache` | 12 pass / 0 fail (TTL cache, honest `cached`/`fetchedAt`, outages never served from cache, client timeouts) |
| `npm run test:workspace-chat` · `test:workspace-settings` | 21 and 11 pass (device-only chat) |
| `npm run test:forge` | 224 pass / 0 fail |
| `npm audit` | 6 advisories (2 low, 4 moderate), all in the build chain |
| `npm start` → `GET /api/health` | 200 after the `tsx` fix (it crashed on `node server.ts`; see the audit's C1) |
| `esbuild server/vercelEntry.ts` vs committed `api/index.js` | byte-identical |

### Suites added since 2026-11-12

| Suite | Tests | What it pins |
| --- | --- | --- |
| `scripts/test-guardian-core.mjs` | 28 | store CAS/TTL/counters/leases, breaker races across two coordinators, fleet budgets, Postgres adapter (no key in a URL, typed timeouts), factory key validation |
| `scripts/test-guardian-monitor.mjs` | 22 | sweep results, incident audit, metered skip vs deep sweep, circuit-open skip, deadline skips, analytics with `null` availability, recovery verification re-opening a breaker, admin/cron auth failing closed, scrubbing |
| `scripts/test-guardian-ui.mjs` | 6 | incident rendering, unprobed provider is "no data", instance-local store labelled, token never in a URL, outage shows its code, metered labels |
| `scripts/test-request-rate-limit.mjs` | 9 | exact `max` boundary, 429 + `Retry-After`, window reset, per-client isolation, per-limiter stores, `skip()`, prune, **bounded growth under 5,200 clients**, `req.ip` over headers |

### Locale split — what changed and what proves it

The three languages no longer ship together. English is imported statically;
Sinhala and Tamil are dynamic imports requested on first selection (or before
first paint for a returning reader, from `main.tsx`).

| Evidence | Result |
| --- | --- |
| Data integrity | all nine dictionaries dumped to JSON before and after the move → **byte-identical** |
| Key parity | **1,688 keys** in each of en/si/ta bundles, 0 missing (the parity suites still read the three-language aggregators) |
| Switching | `i18n.changeLanguage('si')` → `නාසා විශ්ව ගවේෂකය`; `'ta'` → `நாசா விண்வெளி ஆய்வு மையம்`; back to `'en'` → English |
| First load | entry **245.83 → 170.25 kB gzip (−31 %)**; si 37.3 kB and ta 37.8 kB only when needed |
| Tests updated for the async contract | `test-workspace-shell`, `test-workspace-home`, `test-forge-ui`, `scripts/i18n-audit.mjs` — none of their assertions were removed; they now load the bundles before comparing |

### What the 2026-11-13 run does not cover

Same limits as before, stated again because they still apply: no outbound NASA,
Gemini, OpenRouter, Arena or Supabase traffic from this environment, no browser
automation (jsdom for DOM tests), and the Guardian's SQL migration has not been
executed against PostgreSQL. The Guardian's distributed claims are proven with two
coordinators over one store, not across processes.

---

## Earlier run — 2026-11-12, branch `arena/ad469a17-asa-asan`

`npm test` then ran 44 suites: `lint`, `test:api-routes`, `test:apod`, `test:earth`,
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

### News rate limiter / proxy trust audit (2026-11-12)

- The first targeted test attempt could not load `tsx` because dependencies
  were absent. `npm install --no-package-lock --ignore-scripts` succeeded and
  reported 6 advisories (2 low, 4 moderate); no lockfile was created.
- `npm run test:space-news`: 12 passed, including both routes under changing
  forged headers, a simulated trusted loopback proxy chain, separate route
  budgets, 429/Retry-After and exact fixed-window reset.
- `npm run test:security-performance`: 7 passed including real app's default
  `trust proxy` setting. `npm run lint` passed.
- `npm test`: exit 0, 741 passed, 0 failed, 0 skipped. `npm run build`: exit 0,
  159 precache entries; large-chunk warning persists. `git diff --check` passed.
- Tests use local Express servers and simulated headers, not a real Vercel,
  Netlify or reverse-proxy deployment; no live production behavior was tested.

### Live NASA / AI verification preflight — 2026-11-12

- Outbound policy excludes the NASA and remote AI provider hosts, so no live
  provider calls or live-provider results are claimed in this workspace.
- Shell environment presence only: `NASA_API_KEY`, `NEXT_PUBLIC_NASA_API_KEY`,
  `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `ARENA_API_KEY`, `ARENA_BASE_URL` not
  set; `.env`, `.env.local` and `.env.production` absent. This does not inspect
  deployment configuration. No key values were displayed or recorded.
- Existing 741/741 results above are local regression results and are not live
  verification. No new source changes, tests or deployment were performed for
  this preflight. See API status report for the proposed verification scope.

### Authorized live smoke checks and diagnostic wording fix — 2026-11-12

- Page-fetch requests reached the production alias (production `f3d5e21`).
  NeoWs, EPIC and POWER returned plausible requested data; APOD and Mars returned
  explicit unavailable responses. Direct DEMO_KEY probes returned an APOD NASA
  logo for the historical request and a Mars page titled `No such app`.
  Page-fetch did not expose HTTP status for those direct responses; do not infer
  a precise Mars status. See `docs/API_STATUS_REPORT.md` for details.
- A single production deep diagnostics request reported OpenRouter HTTP 200,
  Gemini 503 primary and 404 final fallback, and Arena unconfigured. Diagnostics
  only checks HTTP success, not generated text; actual chat was not tested.
- Corrected misleading Gemini diagnostic hints and English/Sinhala/Tamil status
  copy in this branch. The initial full suite failed on an outdated UI copy
  assertion; updated the fixture/assertions to the corrected wording. Targeted
  diagnostics 19/19 and workspace suite passed. Final `npm test`: 742 passed,
  0 failed or skipped. `npm run lint` and `npm run build` passed; build reports
  large chunks and generated 159 precache entries. No production deployment was
  made, so live diagnostics still uses the previous code until separately deployed.

### Forge rate limiter follow-up — 2026-11-12

- `node --import tsx --test --test-force-exit scripts/test-forge-api.mjs`: 15
  passed, including spoofed forwarding headers on all four endpoints, independent
  budgets, simulated trusted loopback proxy chain, 429/Retry-After and reset at
  60 seconds. These are local tests with stubbed upstreams, not production tests.
- `npm run lint` passed. Full `npm test`: 745 passed, 0 failed, 0 skipped;
  `npm run build` exit 0, 159 precache entries, large-chunk warning persists.
  `git diff --check` passed.

### NASA Mars imagery exploration — 2026-11-12

- Production NASA Images archive search returned actual library metadata for one
  Curiosity query, including an Earth-based testing record. This does not test
  the newly added branch UI or prove all future queries and image URLs work.
- `npm run test:nasa` passed, including existing archive tests with malformed
  collection/total checks and new jsdom tests for source warning, rover search,
  paging, empty, outage, retry and rejection of non-NASA preview/record URLs.
- Full `npm test`: 746 passed, 0 failed or skipped. Lint passed in the full
  suite; `npm run build`: exit 0, 160 precache entries, large-chunk warning.
  Real browser/mobile layouts and actual image rendering were not tested.

### NASA archive validation / APOD outage navigation — 2026-11-12

- `scripts/test-nasa-archive.mjs`: 11 passed, including invalid and duplicate
  parameters rejected without an upstream call. `scripts/test-apod-unavailable-dom.mjs`:
  1 passed, covering selected-date external link, retry and unavailable copy.
- The NASA APOD 2024-01-01 historical link redirected to its matching NASA
  Science record in a point-in-time page-fetch; not all dates were checked.
- Full `npm test`: 748 passed, 0 failed or skipped; lint passed. `npm run build`
  exit 0 with 160 precache entries and the existing large-chunk warning.
  Real-device UI and the undeployed branch against live upstreams were not tested.

### APOD NASA Science fallback — 2026-11-12

- `scripts/test-apod-science.mjs`: 4 passed with stubbed NASA data: exact date,
  source/media handling, ambiguity, video, unsafe URL and failure rejection,
  single-route recovery/cache/client provenance and range rejection.
- `npm run test:apod` passed. Full `npm test`: 752 passed, 0 failed or skipped;
  `npm run build` exit 0, 160 precache entries, large-chunk warning persists.
  Lint is included in the full suite. `git diff --check` passed.
- NASA Science search and media JSON for two individual dates were inspected via
  page-fetch, but the new adapter was not executed against live NASA, deployed,
  or tested in a real browser/device. Tests use representative fixtures, not raw
  live HTTP payload captures. More dates, video days and credits need validation.

### APOD recheck following user-reported key update — 2026-11-12

- Production `/api/apod` for today and 2024-01-01 reported degraded NASA logo
  responses; Vercel listed production `f3d5e21`, which lacks this branch's fix.
  It is unknown whether the reported key change is in that deployed instance.
- Expanded `scripts/test-apod-science.mjs` to 6/6 passing with representative
  title/asset URL patterns observed on two dates and a stubbed legacy network
  failure recovery. These are fixture tests, not a live execution of the adapter.
- Previous full suite and build results (752 tests and build pass) predate these
  two additional test-only cases. `git diff --check` passed; no deploy was made.
