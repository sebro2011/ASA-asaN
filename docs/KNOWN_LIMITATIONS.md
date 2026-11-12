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

## Follow-up limitations — 2026-11-12

- This session did not recheck historical production or provider observations
  above. Live NASA and AI calls are blocked by the sandbox's outbound policy.
- Earth rate limiting is per process. Since Express proxy trust is not configured,
  clients behind a proxy may share an IP bucket. A deployment-specific trusted
  proxy configuration and distributed rate limiter need separate design.
- POWER uses four decimal coordinate precision upstream and in the cache; it still
  represents gridded estimates, not station measurements. Live upstream validity
  was not established in this session.
- Build-time Workbox generation succeeded, but PWA lifecycle/offline behavior and
  mobile/tablet layouts were not verified in a real browser. The broad master
  programme (including Mars gallery, streaming, UI and further API improvements)
  remains incomplete.

- Workbox no longer supplies an unmarked offline POWER proxy response. Offline
  POWER availability therefore depends on the application's own unexpired local
  cache; expired data is not promised. Actual browser/offline behavior has not
  been tested here. Other service-worker-cached telemetry still needs a dedicated
  stale-data/provenance review.
- `aiAnalyst` indicates remote key configuration, not a successful call or a
  guarantee that a provider can answer. No real provider was probed in this run.

## NeoWs / EPIC follow-up

- NeoWs and EPIC now return 503 on failure instead of invented records; empty
  states mean no telemetry or imagery is displayed during an outage. Browser
  smoke, notification behavior and live NASA schema remain unverified. The
  app's asteroid screening thresholds are not impact-risk predictions; incomplete
  NeoWs records are omitted rather than filled with guessed measurements.
- The historical note above saying that all sample fallbacks are labelled was
  too broad: inspection found other questionable fallbacks, particularly APOD
  references, EPIC legacy assets and exoplanet sample/default fields. EPIC and
  NeoWs active paths were addressed in this pass; APOD and exoplanet paths still
  need dedicated scientific and UI review. Prior documentation is not proof of
  their correctness.

## APOD / exoplanet / ISS follow-up

- Active APOD and Exoplanet Archive proxy/client paths now reject synthetic
  fallback data; on an outage these show error/empty states. Other older components
  and legacy exported fixture constants still warrant review; earlier blanket
  claims about all fallbacks being safe should not be relied upon.
- ISS next-pass prediction is **not available**: the former countdown was based on
  distance divided by speed, which does not predict a flyover. Station selection
  and approximate ground distance remain. The local orbit fallback is an
  illustrative approximation, not an accurate orbit or a validated SGP4 model.
- Live upstream responses and real-device rendering remain unverified. Other
  dashboards, translations, AI integrations and imagery require further review;
  this is not completion of the full master programme.

## NOVA / translation follow-up

- Translation requires Gemini configuration and may fail, in which case the
  original text remains. Output shape validation does not prove translation
  accuracy or protect completely against prompt injection. The timeout stops
  waiting but does not cancel the underlying SDK call; rate limits are local to
  a server process. Real Gemini/Arena/OpenRouter availability remains unverified.
- NOVA history is bounded to the latest compatible turns. This prevents server
  rejection on long conversations but is not long-term context summarization;
  streaming remains unimplemented and would require an architectural decision.

## Mars rover imagery follow-up

- Historical gallery covers Curiosity, Opportunity and Spirit, not Perseverance.
  Live NASA API availability, current upstream payloads and image host coverage
  could not be verified in this environment; the NASA-only host allowlist can omit
  legitimate images hosted elsewhere, with the omitted count shown.
- `hasMore` is based on a full 25-record upstream page, not a total count, and
  may lead to an empty next page. Cache and rate limiting are process-local;
  DEMO_KEY can be rate limited. The old image-tagging example is illustrative,
  not imagery or observations from NASA. Real-browser and mobile behavior remain
  unverified.

## News feed integrity follow-up

- The legacy array-returning news helper retains a labelled sample fallback for
  compatibility; other consumers must inspect `_isSample`. The feed now uses a
  separate structured status helper (see follow-up below). Provider data, images,
  translation quality, browser interaction and mobile layout were not verified
  live. APOD remains original language in this feed; its dedicated viewer offers
  translation. Refresh can still use the shared in-memory cache and is not a
  guarantee of a fresh upstream request.

## News status follow-up

- The structured client distinguishes successful empty results, failures and
  partial provider failure, but the server's cached response can still be used
  after an explicit UI refresh. The feed does not display the returned generation
  timestamp or detailed provider status. Timeout behavior and request races are
  not directly exercised; live provider and real device checks remain outstanding.
- The news server's separate rate limiter currently reads `x-forwarded-for`
  directly; its trust and spoofing behavior needs a separate security review.
