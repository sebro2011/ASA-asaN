# Known limitations

Honest list as of **2026-11-13** (branch `arena/8a962084-asa-asan`).
Each item says what a user or operator would actually see, and where it is
recorded. Entries dated 2026-11-12 below the current table remain accurate unless
the table supersedes them.

## 2026-11-13 — Phase 1 re-audit additions

These are current, measured limits. Each names the command or file behind it.

| Limit | Detail |
| --- | --- |
| **Some trilingual copy still ships eagerly** | The nine interface dictionaries now load per language (entry **170 kB gzip**, `si`/`ta` 37 kB each on demand — a 31 % cut). What remains is the legacy `src/i18n/translations.ts` (83 keys × 3 languages, imported directly by 23 components) and per-component inline copy: roughly another 20–30 kB. Fixing that means moving those components onto i18next. |
| **Per-IP limits are per process** | `server/requestRateLimit.ts` bounds memory (prune at 5,000, cap 10,000) and prevents spoofing by using `req.ip`, but instances do not share counters. Fleet-wide budgets exist only in the Guardian, and only with a shared store configured. |
| **`trust proxy` is unset** | Express reports the socket peer. Behind a proxy, many users can share one bucket; the change cannot be made safely without knowing the real hop count. |
| **The committed server bundle can drift** | `api/index.js` is byte-identical to a fresh build today, but nothing enforces that. A stale commit deploys old server code while the tests pass against new source. |
| ~~**No CI**~~ | **Fixed.** `.github/workflows/verify.yml` runs lint, the full suite, the production build and a dependency audit on every push and pull request (9 steps, green through run 43453484220). The workflow is not yet a *required* check on the default branch. |
| **Gemini generation is unavailable in production** | **Measured 2026-11-13** (four live probes, `aeb601e` then `44c2cc7`): the key is valid (`GET /v1beta/models` 200, 49 models) and the API refuses generation — the pinned `gemini-3.8-flash` answered 503 `UNAVAILABLE` ("currently experiencing high demand") before the merge and **429 "You exceeded your current quota, please check your plan and billing details"** after it; every alternative is refused too (`gemini-flash-latest` 503, `gemini-2.5-pro`/`-flash-lite`/`-flash` 404) even though they are in the key's list. **No pin fixes this**; it is a quota/plan action in Google Cloud or AI Studio. Not a configuration error in this repository; nothing here can enable it. NOVA answers through OpenRouter and the local engine, verified `ok` in the same probes. See `docs/API_STATUS_REPORT.md`; the console procedure is `docs/nova/GEMINI_ACCESS_RUNBOOK.md`. |
| **No browser verification** | No Playwright in this environment; DOM behaviour is proven with jsdom, never pixels. |
| **Build-chain advisories** | 4 low (`npm audit`) in the `deepmerge` chain pulled by `vite-plugin-pwa` → `workbox-build`. `deepmerge` is unfixable by upgrade (the advisory covers `>=4.2.0`); all four are build-time only. See *Dependencies*. |
| ~~**TypeScript is not strict**~~ | **Fixed.** `strict: true`, and explicit `any` is **0** — enforced by `scripts/test-any-budget.mjs`, which also tests its own detector. |


## Dependencies

1. **Four low-severity advisories remain, and one cannot be fixed by upgrading.**
   `deepmerge` (reached through `vite-plugin-pwa → workbox-build →
   @rollup/plugin-node-resolve`) is covered by its advisory from `>=4.2.0`, so no
   released version is exempt; the other three are the packages that pull it and
   are the same story. All are **build-time**: none is reachable from a request
   handler, and none ships in `api/index.js`.
2. **The `glob`/`minimatch` overrides deliberately exceed workbox's declared
   ranges.** `npm run check:pwa` verifies the resulting service worker, which is
   the only way to notice if a future bump makes the matcher return nothing.

## Deployment configuration

1. **The proxy hop count is a default, not a measurement.** `TRUST_PROXY` unset
   means 1 hop (Vercel / Cloud Run). If the real path differs, every per-IP rate
   limit is either shared across all visitors or spoofable via `X-Forwarded-For`.
   Confirming it requires access to the deployment, which this environment does
   not have.
2. **`style-src 'unsafe-inline'` remains.** Inline `style` attributes cannot
   execute script, but a nonce/hash pipeline for styles was not attempted.

## Accessibility

1. **Contrast is computed, not rendered.** `scripts/test-contrast-tokens.mjs`
   proves every text token clears AA on its own surfaces, but the app draws on
   translucent glass over gradients. The effective backdrop is not modelled, and
   no browser was available to check rendering, anti-aliasing or `forced-colors`.
2. ~~Focus is not trapped in the header drawer or the mobile tab sheet.~~
   **Fixed 2026-11-13**: both use `useFocusTrap` + `useBodyScrollLock`, verified in
   `scripts/test-focus-trap.mjs`. Remaining: focus is trapped but the sheets are
   rendered with `lg:hidden`, so a desktop viewport never shows them — untested at
   those breakpoints in a real browser.
3. ~~Icon-only buttons are partially labelled.~~ **Audited 2026-11-13**: 12 of 465
   buttons were genuinely icon-only and all now have translated labels. A test keeps
   it that way. What remains unverified is whether each label *reads well* to a
   screen reader in Sinhala and Tamil — that needs a person with the reader.
4. **Some `aria-label`s are English-only** inside otherwise localised components
   (the planet globe, a few AR controls).

## Data integrity

1. **Gemini generation is unavailable in production — cause measured 2026-11-13.**
   Three live probes against `aeb601e` (15:57–15:59Z) returned 503 `UNAVAILABLE` on
   `gemini-3.8-flash` ("This model is currently experiencing high demand…"), 404 on
   each fallback while the same key lists 49 models including them, and 200 on
   `GET /v1beta/models` in 69–76 ms. The key is healthy; the API refuses the
   generation. Chat therefore runs on OpenRouter and the local engine. The provider
   is reported as *configured*, never as *healthy*. (M1/M4)
2. ~~Three NASA proxies have no cache~~ — **fixed 2026-11-13**: NeoWs (10 min,
   keyed by date range), EPIC (15 min) and the Exoplanet Archive (24 h) use a
   bounded TTL cache with `cached`/`fetchedAt` and `Cache-Control`. An expired
   entry is deleted rather than served, so an outage still reports as an outage.
   Remaining: the cache is **per instance**, so several serverless instances each
   fetch once per TTL. Shared caching would need a store (the Guardian's Postgres
   adapter is the natural place).
3. **`DEMO_KEY` fallback is silent.** If `NASA_API_KEY` is missing, the server uses
   the demo tier without logging or exposing it. (M4)
4. ~~Mars Rover Photos is not integrated.~~ **Withdrawn 2026-11-13 — the finding
   was wrong.** The route (`/api/mars/photos`, cached, validated, rate-limited) and
   a trilingual gallery were already in the tree; the audit's `grep` used a string
   that only appears as a rate-limit key. Real limitation: the upstream API has no
   Perseverance images, and the UI says so.
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
- The news server previously read `x-forwarded-for` directly. See the news
  security follow-up below for the fix and remaining deployment constraints.

## News rate limiter / proxy trust security audit

- Express proxy trust remains disabled. Proxied users may share a bucket; the
  actual deployment chain and header sanitization must be verified before any
  narrowly scoped trusted-proxy configuration is considered. Trusting all
  proxies or blindly picking a hop count can enable spoofing. No production
  settings were changed.
- News/papers limits are per router and process and reset on process restart;
  serverless instances do not share budgets. Fixed-window buckets have no global
  expired-entry purge or cardinality cap. `/api/news/sources` is not rate-limited
  by this router. These limits alone are not a distributed DoS defense.
- At the news-scoped pass, Forge's independent limiter also read the first
  `x-forwarded-for` directly. See the subsequent Forge security follow-up below.
  No real proxy/deployment testing was performed.

## Authorized live provider smoke checks

- At ~15:01 UTC on 2026-11-12, production APOD and Mars photo requests failed;
  direct APOD returned generic logo data and direct Mars showed `No such app`.
  The cause and direct Mars HTTP status are not established. No production
  workaround or provider configuration change was made.
- Production diagnostics returned OpenRouter probe HTTP 200, Gemini primary 503
  and last reported alternative 404, Arena unconfigured. HTTP status alone is
  not proof that valid chat text was generated; metadata success does not prove
  generation access. Branch wording was corrected but is not yet deployed.
- Live checks cover only the requested paths and point in time, not images,
  actual chat output, translation quality, browser rendering or future health.

## Forge rate limiter follow-up

- The branch fix removes direct forwarded-header trust for Forge, but it is not
  deployed. Express trust proxy remains off; users behind a proxy can share a
  bucket. Do not enable proxy trust without verifying the actual deployment path.
- Forge limits remain process-local fixed windows with no shared store, global
  expired-entry purge or cardinality cap. A distributed rate-limit strategy and
  real deployment proxy verification remain future work.

## NASA imagery exploration update

- The Mars Image Library explorer is a keyword search, not a rover/sol photo
  feed. NASA results can include artwork, models and Earth testing; the metadata
  date is not necessarily capture date. No guarantee every record is relevant,
  and the UI caps page navigation at the archive adapter's page 100 limit.
- The old rover API and APOD remain unavailable/degraded in observed production
  checks. NASA Science WordPress samples do not establish a safe APOD replacement
  for video, credit and historic-date cases. Neither provider was changed and no
  new UI has been deployed. Real browser/mobile rendering remains unverified.

## NASA archive / APOD outage navigation

- The APOD viewer's failure state now links to the selected date on NASA's
  historical URL pattern. One historic date's redirect was checked; other dates
  and NASA's future redirect behavior were not verified. This link is not an
  in-app fallback and does not resolve the degraded APOD API response.
- NASA archive input validation and UI changes are branch-only, not deployed.
  Real browser and device behavior remain unverified.

## APOD NASA Science fallback — branch only

- APOD fallback uses observed NASA Science WordPress search, title and HTML
  structure; upstream changes, search ranking or missing records can make it
  return unavailable. Only the first 20 search hits are inspected. Two data
  points are not proof of historical or future coverage. Actual branch adapter
  execution against live NASA has not been verified or deployed.
- Only matched featured images are supported; detected video entries are refused,
  but detection is heuristic and a featured image may not be the original media.
  The viewer labels it and directs users to NASA for credits. Credit is not
  guessed. The APOD range endpoint remains legacy-only and can still return 503.
- On a legacy timeout the extra requests can increase latency; client timeouts
  were raised accordingly. APOD upstream and production remain unchanged.
