# Phase 1 — Full Project Audit: NASA Space Explorer

**Branch:** `arena/a9e6bb36-asa-asan` (from `main` @ `5733a57`, PR #21 merged)
**Date:** 2026-11-02
**Status:** Audit complete — baseline verified, no code changes made yet. All existing tests pass.

## 0. Baseline verification (all green)

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run lint` → `tsc --noEmit` | clean, exit 0 |
| Earth Intelligence tests | `npm run test:earth` | 30/30 pass |
| NOVA chat tests | `npm run test:nova-chat` | 18/18 pass |
| Space-videos tests | `npm run test:space-videos` | 19/19 pass |
| Community tests | `npm run test:community` | 23/23 pass |
| AI Earth Viewer tests | `npm run test:ai-viewer` | 11/11 pass |
| Welcome screen tests | `npm run test:welcome` | 16/16 pass |
| Earth server tests | `npm run test:earth-server` | 10/10 pass |
| Space build/security | `npm run test:space-build-security` | 2/2 pass |
| Security/performance | `npm run test:security-performance` | 4/4 pass |
| **Total** | | **133/133 pass, 0 failures** |
| Production build | `npm run build` | succeeds, PWA SW generated (chunks > 500 kB warned) |

**Note:** `npm test` currently runs only lint + earth + nova-chat + space-build-security + security-performance (54 tests). The remaining suites (`test:space-videos`, `test:community`, `test:ai-viewer`, `test:welcome`, `test:earth-server`) must be added to the `npm test` gate (see ISSUE-3 below).

Network-dependent live-service checks (POWER / GIBS / FIRMS real HTTP) could not be run end-to-end in this sandbox; the code paths are unit-tested instead. Real YouTube Live Search and Community Feed are NOT locally verified (no valid API key / Supabase project configured).

## 1. Repository inventory (current state)

| File / dir | Role | Status |
| --- | --- | --- |
| `server.ts` | Express entry: SPA static serving / Vite dev middleware, API mounts, security headers, rate limiting | Fixed import extensions (PR #21) |
| `server/earthIntelligence.ts` | Earth Lab server: `/api/earth/{health,power,gibs/domains,gibs/probe,firms/hotspots,analyst}`; rate limiting; caching; no key leakage | Present |
| `server/spaceVideos.ts` | YouTube Data API v3 backend at `/api/space-videos`; server-side key, curated fallback, rate limiting, caching | Present |
| `server/communityVideos.ts` | Supabase-backed community feed at `/api/community`; auth, submissions, moderation, reports | Present |
| `server/spaceVideoCatalog.ts` | Hand-picked curated astronomy fallback (NOT live YouTube) | Present |
| `server/astronomyRelevance.ts` | Conservative metadata-based relevance classifier | Present |
| `server/channelIds.ts` | Exact NASA channel IDs (@NASA, @NASAGoddard, @NASAJPL, @ReelNASA) | Present |
| `server/novaChat.js` | NOVA chat: OpenRouter → Gemini → local engine fallback; validation, rate limiting, size bounds | Present |
| `api/index.js` | esbuild bundle of `server/vercelEntry.ts` — Vercel serverless function | Present |
| `api/nova/chat.js`, `api/nova/config.js` | Vercel adapters for NOVA chat and provider config | Present |
| `vercel.json` | SPA rewrite; `/api/*` → `/api/index`; MIME headers; maxDuration 30s | Present |
| `vite.config.ts` | React 19 + Tailwind 4 + PWA (workbox runtime caching) | Present |
| `src/App.tsx` | Shell: lazy-loaded destinations, navigation, error boundary, welcome, PWA, mobile tab bar | Present |
| `src/lib/nasaApi.js` | Central NASA API pipeline (APOD, NeoWs, EPIC, exoplanets, Mars, ISS, space weather, news, archive, media search, grounded search) with 15-min cache + labeled fallbacks | Present |
| `src/lib/earth/power.ts` | NASA POWER monthly point client; fill sentinel; progressive degradation; least-squares trend of annual means | Present |
| `src/lib/earth/gibsClient.ts`, `gibsCatalog.ts`, `domains.ts` | GIBS WMTS/WMS client; DescribeDomains parsing; live probe; 20-layer verified catalog | Present |
| `src/lib/earth/analysis.ts` | Deterministic analyst: describeSeries, seriesLimitations, buildLocalAnalystAnswer, question classification | Present |
| `src/lib/earth/context.ts`, `imagediff.ts`, `geocode.ts`, `cache.ts`, `types.ts`, `viewerState.ts` | Earth support modules | Present |
| `src/components/EarthIntelligenceLab.jsx` | Lab shell: overview/trends/Sri Lanka/analyst/AI-viewer modes; provenance; report export (MD/JSON/CSV) | Present |
| `src/components/earth/TrendDetective.tsx` | POWER monthly charts (recharts), dual-axis, annual means, range selector, study presets | Present |
| `src/components/earth/ImageryMap.tsx`, `Globe3D.tsx`, `AiEarthViewer.tsx` | Leaflet map, three.js globe, canvas enhancement viewer | Present |
| `src/components/NasaAi.jsx` | NOVA chat UI: local/Gemini/OpenRouter, streaming, TTS, speech recognition, APOD quiz, localStorage | Present |
| `src/features/space-shorts/*` | CosmoVision: YouTube shorts feed + community submissions (Supabase); starter-notice handling | Present |
| `src/i18n/*` | `translations.ts`, `pageCopy.ts`, `interfaceCopy.ts`, `earthIntelligence.ts`, `scienceFeed.ts`, `spaceShorts.ts` — EN/SI/TA | Present |
| `src/hooks/useApiResource.ts` | Request state machine: loading/ready/error; live/cached/simulated/unavailable honesty | Present |
| `src/ui/ChartFrame.tsx` | Chart container fixing blank-chart defect | Present |
| `supabase/cosmovision.sql` | CosmoVision community schema (RLS, moderator gating, rate-limit function) | Present |
| `.env.example` | Tracked server-only key template (never committed with real values) | Present |

**Tech stack:** React 19, Vite, Tailwind CSS 4, TypeScript, recharts, leaflet, three.js, @react-three/fiber, i18next/react-i18next, @google/genai, express, ws. PWA via vite-plugin-pwa.

## 2. Verified strengths

- **Real NASA integrations with graceful degradation:** APOD, NeoWs asteroids, EPIC, Exoplanet Archive, Mars rover photos, ISS (api.wheretheiss.at), NOAA/SWPC space weather, FIRMS hotspots (key-gated), NASA Image & Video Library, NASA image archive. Every client call has a timeout, fallback chain, and explicit fallback flag — fallbacks are never presented as live NASA data.
- **POWER treated correctly as historical climate:** monthly satellite/re-analysis grid estimates (1981–present), documented as *not* weather forecasts and *not* station measurements; core parameter set T2M + PRECTOTCORR with degradation path.
- **GIBS imagery verified, not assumed:** DescribeDomains observation-date parsing, per-layer tile-matrix-set/format probing (WMTS jpg/png + WMS fallback), gap-aware availability — a date inside a GIBS gap is refused rather than silently showing a substituted day.
- **Trilingual localization complete:** English / Sinhala / Tamil across app shell, destination pages, Earth Lab copy, NOVA chat, APOD quiz, science feed, space shorts.
- **NOVA AI with honest provider model:** Auto (OpenRouter → Gemini → local), Local, Gemini, OpenRouter; `GET /api/nova/config` returns only availability flags, never keys; bundled deterministic local engine is labeled as such when used.
- **Security hygiene in place:** `.env*` gitignored; `.env.example` documents server-only keys; build-security test proves no server credential reaches client artifacts or logs; server-side rate limiting on all earth/nova endpoints; input validation on every endpoint.
- **Deployment config preserved:** Vercel rewrites, SPA fallback, function maxDuration 30s, model MIME types, PWA caching rules.
- **UX safeguards:** ChartFrame eliminates the percentage-height blank-chart defect; `useApiResource` enforces explicit data-state honesty; page copy states where values are simulated or historical.
- **Scientific honesty in Earth Lab:** every value carries provider, dataset, observation date, retrieval timestamp; dates outside GIBS observation domains are refused; no measurement is invented or interpolated; trend is explicitly labeled descriptive-only.

## 3. Constraint compliance check

| User constraint | Status | Evidence |
| --- | --- | --- |
| Preserve architecture, working features, API integrations, deployment config | OK | Nothing modified; all integrations intact |
| No rebuild from scratch | OK | In-place structure throughout |
| No mock data presented as real | OK | Fallback flags on every fallback; page copy labels simulated content |
| Trilingual EN/SI/TA | OK | i18n resources cover all three; local AI detects Sinhala/Tamil |
| No key leakage / no unnecessary paid services | OK | Server-only key convention; build-security test passes |
| POWER ≠ forecasts | OK | Docs + code describe POWER as historical monthly climate |
| AI-enhanced imagery not presented as original NASA | OK | AiEarthViewer labels browser enhancement / optional AI upscale as processed |
| Test after each phase | PARTIAL | 5 of 9 suites in `npm test`; missing 4 suites |

## 4. Issues found

### ISSUE-1 (MEDIUM) — `npm test` does not run the full suite
`npm test` runs lint + test:earth + test:nova-chat + test:space-build-security + test:security-performance (54 tests). Four suites are excluded: `test:space-videos` (19), `test:community` (23), `test:ai-viewer` (11), `test:welcome` (16), `test:earth-server` (10). Total actual suite = 133 tests, but CI only gates on 54.

**Recommendation:** extend the `test` script to run all `scripts/test-*.mjs` suites plus lint, so every phase's additions are gated.

### ISSUE-2 (MEDIUM) — Production build has chunks > 500 kB
Vite build warns: `three.module-*.js` (737 kB) and likely others exceed the 500 kB chunk limit. This affects initial-load performance on low-end hardware.

**Recommendation:** code-split Three.js and heavy chunks further; adjust `build.chunkSizeWarningLimit` or use dynamic imports. Address in Phase 5 (Performance).

### ISSUE-3 (MEDIUM) — Monolithic server.ts remains
`server.ts` still hosts the local AI knowledge base, archive endpoints, ISS/weather/satellite endpoints, and AI endpoints alongside route mounts. Earth router was extracted to `server/earthIntelligence.ts` (good pattern). Video/community endpoints are in separate modules. Further extraction of remaining inline handlers into `server/*.ts` modules would improve maintainability.

**Recommendation:** continue module extraction in later phases; do not touch working endpoints.

### ISSUE-4 (LOW) — Optional services degrade honestly but silently
FIRMS hotspot counts unavailable without `FIRMS_MAP_KEY`; Gemini/OpenRouter absent → local engine. Labeled in `/api/earth/health` and `/api/nova/config`. Keep behavior; document in user-facing copy (Phase 6).

### ISSUE-5 (LOW) — Peer dependency conflict at install
`npm install` requires `--legacy-peer-deps` (`@google/model-viewer` wants `three@^0.183.0`, repo pins `^0.186.1`). Pre-existing; does not affect runtime. Consider aligning versions in Phase 6.

### ISSUE-6 (MEDIUM) — Real YouTube Live Search and Community Feed not locally verifiable
CosmoVision falls back to curated labeled collection when `YOUTUBE_API_KEY` is unset, and community tab is disabled when Supabase env vars are missing. These are labeled in UI (`ssStarterMissing`, `ssStarterConfig`). Not a bug — but cannot be end-to-end verified in this sandbox.

## 5. Phase 2–10 entry points (recommended implementation order)

Based on this audit, the natural implementation order for the remaining phases:

- **Phase 2 — Earth Intelligence Lab (scientific rigor):** extend `src/lib/earth/power.ts` and `analysis.ts` with Mann-Kendall trend test, Sen's slope estimator, confidence intervals, Hamed-Rao autocorrelation correction, statistical significance, missing-data handling, data quality validation, multiple-comparison correction; PRECTOTCORR mm/day → monthly accumulation via days-per-month; location comparison (two locations side-by-side); scientific evidence blocks with CI. Add corresponding unit tests in `scripts/test-earth-intelligence.mjs`.
- **Phase 3 — Security hardening:** CSP headers in server.ts/vite config; output sanitization; file upload validation for community submissions; dependency vulnerability review (npm audit shows 10); error handling that never exposes stack traces/secrets.
- **Phase 4 — UI/UX simplification:** NASA Mission Control + Apple Liquid Glass + Cosmic Dark design system; remove duplicates (Space Trivia, ISS tracking, NOVA AI entry points consolidation); Explore→Discover→Analyze→Understand journey.
- **Phase 5 — Performance optimization:** Three.js lazy loading, code splitting for >500 kB chunks, image optimization, low-end hardware mode (useDevicePerformance exists), memory management.
- **Phase 6 — Trilingual support EN/SI/TA:** already implemented — verify completeness, fix gaps, test rendering.
- **Phase 7 — NASA API reliability:** all integrations with validation/loading/error states; no fabricated data — already largely present; audit remaining endpoints.
- **Phase 8 — NOVA AI:** reliability, error handling, security, loading states, trilingual — already present; audit loading states in UI.
- **Phase 9 — Testing and validation:** TypeScript ✓, build ✓, unit tests ✓, scientific tests (Phase 2 additions), API tests ✓, security tests ✓, localization, responsive, PWA.
- **Phase 10 — Implementation strategy:** produce final rollout plan with rollback points.

## 6. Immediate next step

Produce the Phase 1 audit report (this document), commit it on the feature branch, then begin Phase 2 — Earth Intelligence Lab statistical upgrades (Mann-Kendall, Sen's slope, confidence intervals, Hamed-Rao, significance testing) with accompanying unit tests.
