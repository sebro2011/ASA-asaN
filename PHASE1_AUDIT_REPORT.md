# Phase 1 — Full Project Audit: NASA Space Explorer

**Branch:** `arena/62539e55-asa-asan` (from `main` @ `2a9e660`)
**Date:** 2026-10-29
**Status:** Audit complete — no code changes made. All existing tests pass.

## 1. Method

I read the full repository (224 tracked files): `server.ts`, `server/novaChat.js`, `api/*`, `vercel.json`, `vite.config.ts`, `tsconfig.json`, `package.json`, `src/App.tsx`, `src/main.tsx`, `src/lib/nasaApi.js` (+ `lib/nasaApi.js`), `src/utils/nasaApiClient.ts`, `src/hooks/useApiResource.ts`, the Earth Intelligence Lab components (`EarthIntelligenceLab.jsx`, `TrendDetective.tsx`, `ImageryMap.tsx`, `Globe3D.tsx`, `AiEarthViewer.tsx`), `src/lib/earth/*` (power, gibsClient, gibsCatalog, domains, analysis, geocode, cache, types, viewerState, enhance, aiUpscale), `src/components/NasaAi.jsx`, `src/i18n/*`, `src/ui/ChartFrame.tsx`, `supabase/cosmovision.sql`, `docs/*`, `scripts/*`, and the root `components/*`.

**Verification run (all green):**
- `npm run lint` → `tsc --noEmit` — clean, exit 0
- `node --test scripts/test-earth-intelligence.mjs` — 30/30 pass (domains parsing, POWER stats/trend, analyst engine, GIBS catalog integrity, geocoder)
- `node --test scripts/test-nova-chat.mjs` — 18/18 pass (NOVA request validation, provider routing, rate limiting, no key leakage in responses)
- `node --test scripts/test-space-build-security.mjs` — 2/2 pass (production build succeeds; YouTube/Supabase server credentials never appear in build logs, browser artifacts, API responses, or server logs)

Network-dependent live-service checks (`verify-earth-services.mjs`, POWER/GIBS/FIRMS real HTTP) could not be run end-to-end in this sandbox; the code paths are unit-tested instead.

## 2. Architecture inventory (preserved as-is)

| File | Role |
| --- | --- |
| `server.ts` | Main Express entry: SPA static serving (prod) / Vite middleware (dev), all API routes, WebSocket `/ws/live` Gemini proxy, `vercelEntry_default` export |
| `server/novaChat.js` | NOVA chat handler: OpenRouter → Gemini → local engine fallback, rate limiting, request size/message bounds |
| `api/index.js` | esbuild bundle of `server/vercelEntry.ts` (the Express `app`) — the Vercel serverless function |
| `api/nova/chat.js`, `api/nova/config.js` | Vercel adapters for NOVA chat and provider-config |
| `vercel.json` | SPA rewrite → `index.html`; `/api/(.*)` → `/api/index`; model MIME headers; `api/index.js` maxDuration 30s |
| `vite.config.ts` | React 19 + Tailwind 4 + PWA (workbox runtime caching for NASA API, GIBS tiles, imagery) |
| `src/lib/nasaApi.js` | Central NASA API pipeline (APOD, space weather, ISS, NeoWs, EPIC, exoplanets, news, Mars photos, archive, media search, grounded mission search, translation, NOVA/NASA AI) with 15-min in-memory cache and labeled `_isSample: true` fallbacks |
| `src/lib/earth/power.ts` | NASA POWER monthly point client (historical climate, 1981–present, core/optional parameters, -900 fill sentinel, progressive degradation to core set) |
| `src/lib/earth/gibsClient.ts`, `gibsCatalog.ts`, `domains.ts` | GIBS WMTS/WMS client: DescribeDomains parsing, live probe-verified service/format, 15-layer verified catalog |
| `src/components/EarthIntelligenceLab.jsx` | Earth Lab shell: overview/trends/Sri Lanka/analyst/AI-viewer modes, GIBS + POWER, search, provenance, report export |
| `src/components/earth/TrendDetective.tsx` | POWER monthly charts (recharts), annual + monthly, range selector, study presets (Sri Lanka + world), limitations panel |
| `src/components/earth/ImageryMap.tsx` | Leaflet GIBS map, single/side/swipe compare modes, tile error reporting, keyboard controls |
| `src/components/earth/Globe3D.tsx` | three.js globe, GIBS WMS texture, sun position, atmosphere shader, fallback ladder (WebGL → texture → 2D map) |
| `src/components/earth/AiEarthViewer.tsx` | Canvas GIBS viewer, browser enhancement, honesty labeling for processed imagery |
| `src/components/NasaAi.jsx` | NOVA chat (local/Gemini/OpenRouter), streaming, TTS, speech recognition, APOD quiz, localStorage persistence |
| `src/components/*.jsx` (root) | Rocket launch simulator, ISS tracker, 3D rocket, cosmic calendar |
| `src/features/space-shorts/*` | CosmoVision: YouTube shorts feed + community submissions (Supabase), curation + moderation tooling |
| `src/i18n/*` | `translations.ts`, `pageCopy.ts`, `interfaceCopy.ts`, `earthIntelligence.ts`, `scienceFeed.ts`, `spaceShorts.ts` — EN/SI/TA |
| `src/hooks/useApiResource.ts` | Request state machine (loading/ready/error, explicit live/cached/simulated/unavailable state) |
| `src/ui/ChartFrame.tsx` | Chart container fixing the blank-chart defect (numeric height, HTML legend outside plot, table alternative) |
| `public/models/*`, `public/textures/earth/*` | GLB/USDZ 3D models (Apollo CSM, ISS, JWST, Orion, Perseverance), Earth textures |
| `supabase/cosmovision.sql` | CosmoVision community schema (RLS, moderator gating, rate-limit function) |

**Tech stack:** React 19, Vite 8, Tailwind CSS 4, TypeScript, recharts, leaflet, three.js, @react-three/fiber, i18next/react-i18next, @google/genai, express, ws. PWA via vite-plugin-pwa.

## 3. Verified strengths

- **Real NASA integrations with graceful degradation:** APOD, NeoWs asteroids, EPIC, Exoplanet Archive, Mars rover photos, ISS (api.wheretheiss.at), NOAA/SWPC space weather, FIRMS hotspots (key-gated), NASA Image & Video Library, NASA image archive. Every client call has a timeout, fallback chain, and explicit `_isSample` / `isFallback` flag — fallbacks are never presented as live NASA data.
- **POWER treated correctly as historical climate:** monthly satellite/re-analysis grid estimates (1981–present), documented as *not* weather forecasts and *not* station measurements; core parameter set T2M + PRECTOTCORR with degradation path.
- **GIBS imagery verified, not assumed:** DescribeDomains observation-date parsing, per-layer tile-matrix-set/format probing (WMTS jpg/png + WMS fallback), gap-aware availability — a date inside a GIBS gap is refused rather than silently showing a substituted day.
- **Trilingual localization complete:** English / Sinhala / Tamil across app shell, destination pages, Earth Lab copy, NOVA chat, APOD quiz, science feed, space shorts. Singlish/Tanglish detection in the local AI engine.
- **NOVA AI with honest provider model:** Auto (OpenRouter → Gemini → local), Local, Gemini, OpenRouter; `GET /api/nova/config` returns only availability flags, never keys; bundled deterministic local engine is labeled as such when used.
- **Security hygiene in place:** `.env*` gitignored, `.env.example` documents server-only keys (GEMINI_API_KEY, OPENROUTER_API_KEY, YOUTUBE_API_KEY, SUPABASE_*, FIRMS_MAP_KEY, NASA API keys); build-security test proves no server credential reaches client artifacts or logs.
- **Deployment config preserved:** Vercel rewrites, SPA fallback, function maxDuration 30s, model MIME types, PWA caching rules.
- **UX safeguards:** ChartFrame eliminates the percentage-height blank-chart defect; `useApiResource` enforces explicit data-state honesty; page copy states where values are simulated or historical (ISS orbit propagation, EPIC delay, launch simulator physics).

## 4. Constraint compliance check

| User constraint | Status | Evidence |
| --- | --- | --- |
| Preserve architecture, working features, API integrations, deployment config | OK | Nothing modified; all integrations intact |
| No rebuild from scratch | OK | In-place structure throughout |
| No mock data presented as real | OK | `_isSample: true` / `isFallback` flags on every fallback in `lib/nasaApi.js`; page copy labels simulated content |
| Trilingual EN/SI/TA | OK | i18n resources cover all three; local AI detects Sinhala/Tamil including Singlish/Tanglish |
| No key leakage / no unnecessary paid services | Partially — see ISSUE-1 below | Server-only key convention + build-security test pass, BUT `/api/gemini-live-token` returns `GEMINI_API_KEY` to the browser |
| POWER ≠ forecasts | OK | docs + code describe POWER as historical monthly climate |
| AI-enhanced imagery not presented as original NASA | OK | `AiEarthViewer` labels browser enhancement / optional AI upscale as processed |
| Test after each phase | OK for Phase 1 | lint + 3 node:test suites all pass |

## 5. Issues found — Status

### ISSUE-1 (CRITICAL) — Server API key leaked to the browser ✅ FIXED
`server.ts` `GET /api/gemini-live-token` previously returned `{ apiKey, endpoint, hasKey }` to the browser, and `GeminiLiveVoice.jsx` could connect directly to `wss://generativelanguage.googleapis.com/...?key=<API_KEY>`, exposing the secret in the URL.

**Fix applied:**
- `server.ts`: `/api/gemini-live-token` now returns only `{ hasKey, endpoint, proxyPath: '/ws/live' }` — the key value is never sent to the browser.
- `src/components/GeminiLiveVoice.jsx`: removed the `GEMINI_LIVE_BIDI_WS_URL` constant, removed the `/api/gemini-live-token` fetch, removed the direct Bidi API connection path; the component now always connects via the server-side `/ws/live` WebSocket proxy where the key remains server-side only.

**Verification:** `tsc --noEmit` clean, 18/18 NOVA chat tests pass, production `npm run build` succeeds.

Remaining items from the original audit (ISSUE-2 through ISSUE-5) are still valid and will be addressed in later phases.

### ISSUE-2 (MEDIUM) — Monolithic server.ts
`server.ts` (~134 KB) contains the local AI knowledge base, earth router, video catalogs, archive, ISS/weather/satellite endpoints, AI endpoints, and the Vercel entry in one file. It works, but Phases 2–7 additions (Earth Viewer premium features, CosmoVision community backend, security hardening) should be added as separate modules/routes (`server/earthIntelligence.ts` already shows the pattern) rather than inflating `server.ts` further.

### ISSUE-3 (MEDIUM) — No unified test runner
Tests exist under `scripts/` (`node:test`) and are invoked via individual `package.json` scripts; there is no `npm test` that runs the whole suite, and CI/deployment does not gate on tests. Suggest adding `npm test` running all `scripts/test-*.mjs` plus lint.

### ISSUE-4 (LOW) — Optional services degrade honestly but silently
FIRMS hotspot counts are unavailable without `FIRMS_MAP_KEY`; Gemini/OpenRouter absent → local engine. These are labeled in `/api/earth/health` and `/api/nova/config`. Keep this behavior; document it in user-facing copy (Phase 6).

### ISSUE-5 (LOW) — Peer dependency conflict at install
`npm install` fails on `three` peer resolution (`@google/model-viewer@^4.3.1` wants `three@^0.183.0`, repo pins `^0.186.1`) unless `--legacy-peer-deps` is used. Pre-existing; does not affect runtime. Consider aligning versions in Phase 6.

## 6. Data-service inventory

| Service | Purpose | Key required? | Key location | Fallback |
| --- | --- | --- | --- | --- |
| NASA APOD | Picture of the day | No (DEMO_KEY) | `lib/nasaApi.js` | Labeled bundled reference entry |
| NeoWs | Near-Earth asteroids | No (DEMO_KEY) | client resolver | `null` |
| EPIC | Full-disc Earth imagery | No | server `/api/epic` | Labeled sample frame |
| Exoplanet Archive | Exoplanet catalog | No | server `/api/exoplanets` | Labeled sample list |
| Mars rover photos | Surface imagery | No (DEMO_KEY) | `lib/nasaApi.js` | Labeled samples |
| ISS location | Real-time orbit | No | wheretheiss.at + `/api/iss` | Local orbit propagation (labeled simulated) |
| NOAA SWPC | Space weather / K-index | No | `/api/solar-weather` | Labeled fallback telemetry |
| NASA GIBS | Satellite imagery tiles | No | `gibs.earthdata.nasa.gov` | "unverified" availability report |
| NASA POWER | Monthly historical climate | No | `power.larc.nasa.gov` | Unavailable is reported, never estimated |
| NASA FIRMS | Fire hotspot counts | **Yes** (`FIRMS_MAP_KEY`) | server env only | "not configured" — never estimated |
| Google Gemini | NOVA chat / analyst / APOD translation | **Yes** (`GEMINI_API_KEY`) | server env only | Local deterministic engine |
| OpenRouter | NOVA chat (alternative) | **Yes** (`OPENROUTER_API_KEY`) | server env only | Local deterministic engine |
| YouTube Data v3 | CosmoShorts discovery | **Yes** (`YOUTUBE_API_KEY`) | server env only | Curated labeled collection |
| Supabase | CosmoVision community submissions | **Yes** (service role, server only) | server env only | Community tab disabled |

## 7. Localization audit

- `src/i18n/translations.ts`: full `TranslationDictionary` for `en`, `si`, `ta` (app shell, nav, APOD, 3D, missions, news, export).
- `src/i18n/pageCopy.ts`: destination framing copy (asteroids, ISS, EPIC, exoplanets, quiz, simulator, assistant, saved) in all three languages; each page states whether data is live/simulated/historical.
- `src/i18n/earthIntelligence.ts`, `scienceFeed.ts`, `spaceShorts.ts`, `interfaceCopy.ts`: Earth Lab, feed, and UI copy in all three languages.
- Local AI engine (`server.ts` embedded `spaceLocalAiEngine` + `server/novaChat.js` → `src/utils/spaceLocalAiEngine.js`): keyword detection for Sinhala (`\u0D80-\u0DFF`) and Tamil (`\u0B80-\u0BFF`) scripts plus Singlish/Tanglish romanized hints; responses in all three languages.

No gaps found: every English key has SI and TA counterparts.

## 8. Phase 2–7 entry points (recommended)

Based on this audit, the natural implementation order:

- **Phase 2 — Earth Intelligence Lab:** extend `src/lib/earth/*` and `src/components/earth/*` (already present); keep POWER as historical climate; GIBS probe-verified layers only; any AI analyst output clearly separated into verified / derived / interpretation / limitations / gaps (already the analysis.ts contract).
- **Phase 3 — Earth Viewer:** build on `Globe3D.tsx` / `ImageryMap.tsx` fallback ladder; no new API keys needed.
- **Phase 4 — Premium design:** Tailwind design-system tokens; preserve existing glass-panel system and i18n.
- **Phase 5 — CosmoVision/NOVA AI:** `server/novaChat.js` pattern (provider routing, no key leakage); Supabase only after `supabase/cosmovision.sql` is applied and Auth configured; **fix ISSUE-1 first** if Gemini Live is used.
- **Phase 6 — Security & Performance:** fix ISSUE-1, add `npm test` gate, resolve `three` peer conflict, review PWA cache TTLs, rate-limit headers.
- **Phase 7 — Validation + Final Report:** run `verify-earth-services.mjs` against real NASA services where network allows; verify trilingual rendering; signed-off audit trail.

## 9. Immediate next step

ISSUE-1 blocks any secure use of the Gemini Live path. Recommend fixing `/api/gemini-live-token` + `/ws/live` as server-side-only proxy before Phase 5 work begins. Everything else in Phase 1 is verified green and ready to build on.
