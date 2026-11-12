# Known limitations

Honest list as of **2026-11-12** (branch `arena/ad469a17-asa-asan`). Each item says
what a user or operator would actually see, and where the audit records it.

## Data integrity

1. **Gemini generation is unavailable in production.** Diagnostics record 503 on
   `gemini-3.8-flash` and 404 on the `gemini-2.5-flash` fallback while the same key
   lists 48 models. Chat therefore runs on OpenRouter and the local engine. The
   provider is reported as *configured*, never as *healthy*. (M1)
2. **Three NASA proxies have no cache** (`/api/asteroids/neows`, `/api/epic`,
   `/api/exoplanets`), so repeated visits spend the `DEMO_KEY` quota (30/hour) and
   can fail intermittently. (M2)
3. **`DEMO_KEY` fallback is silent.** If `NASA_API_KEY` is missing, the server uses
   the demo tier without logging or exposing it. (M4)
4. **Mars Rover Photos is not integrated.** The Forge dataset descriptor exists;
   there is no route and no gallery. The old client-side helper (hardcoded
   `DEMO_KEY`, fabricated ids) was removed on this branch. (M5)
5. **Live connector behaviour is partly verified.** NASA Images and NOAA SWPC Kp
   are confirmed live from production (see `docs/API_STATUS_REPORT.md`). The NOAA
   *plasma* feed returned nothing in that call, so solar-wind speed shows "not
   reported"; `api.nasa.gov` (APOD/NeoWs/EPIC/exoplanets) and the Exoplanet TAP
   service are covered by injected-fetch tests only, because this environment's
   outbound access reaches package registries and GitHub only.
6. **Dataset snapshots do not refresh themselves.** If a remote dataset changes
   version, the project reports drift; it never silently recalculates. (Forge)

## Platform

7. **TypeScript strict mode is off.** `strict`, `strictNullChecks` and
   `noImplicitAny` are unset in `tsconfig.json`; 76 `any` casts exist. (M3)
8. **No streaming responses.** Chat returns one JSON body; time-to-first-token is
   full generation time. SSE would touch the chat client, providers and tests, so
   it needs a decision before implementation. (T4)
9. **Six dependency advisories** remain in the build chain
   (`vite-plugin-pwa → workbox-build → glob/minimatch/deepmerge`); the automated fix
   is a breaking downgrade and was not applied. (M6)
10. **Entry chunk is 888 KB** with no `manualChunks`; `three`, `model-viewer` and
    `recharts` are separate chunks but the entry is still large. (T3)
11. **Two import namespaces.** Root `lib/` and `components/` are imported through
    `@/lib/*` and also re-exported from `src/lib/*`. (T1)
12. **CSP allows any https host** in `img-src` and `connect-src`. (T5)

## Verification limits

13. **No browser automation.** Pixel-level layout, real scroll behaviour and
    cross-browser rendering are asserted only through CSS invariants and jsdom.
14. **No live AI call from this environment.** Provider paths are verified against
    injected adapters and against the production diagnostics endpoint.
15. **The rotated NASA API key is still owed by the operator.** Until it is set,
    production runs on whatever key the deployment holds.
