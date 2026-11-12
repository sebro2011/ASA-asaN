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
