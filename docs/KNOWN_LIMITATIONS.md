# Known limitations

Honest list as of **2026-11-18** (branch `arena/9805b9df-asa-asan`).
Each item says what a user or operator would actually see, and where it is
recorded. Entries dated 2026-11-12 below the current table remain accurate unless
the table supersedes them.

## 2026-11-18 — the analyst answer that drew over itself

The island-wide Sri Lanka answer ("Local Earth Intelligence", 549 POWER months,
7 parameters) rendered its verified bullets outside the card: a bullet pasted the
entire POWER request URL — `?parameters=T2M,PRECTOTCORR,…&community=RE&…`, about
220 characters with no space in it — and the bullet's text node had no
`min-width` or word break, so its min-content width was the whole URL. The
two-column grid let that column overflow, and the URL was painted across the
neighbouring "Calculated from retrieved data" panel, over its first two bullets.

| Behaviour | Detail |
| --- | --- |
| **Bullets wrap mid-token** | `src/components/earth/AnalystPanel.tsx` renders each bullet through `BulletText`: `min-w-0 [overflow-wrap:anywhere]` on the text, `min-w-0` on the flex row and the card, `overflow-hidden` on the section card. A URL is now rendered as a link (`break-all`, `rel="noreferrer noopener"`, sentence punctuation kept outside the href) instead of as a wall of characters. |
| **Prose names the source, not the query** | `server/earth/localAnalysis.ts` used to put `power.larc.nasa.gov/api/temporal/monthly/point?parameters=…` inside the sentence. The bullet now says `source power.larc.nasa.gov, full query under Evidence`; the complete URL is still recorded verbatim in the evidence block and in `sources[].url`, so provenance is unchanged — only its location. Same three languages. |
| **Two attempt pills get tooltips** | `6 attempt(s)` and `6 retry attempt(s)` sit next to each other and read like the same fact twice. Each now carries a tooltip saying what it counts (total provider calls vs calls that were not a first attempt). The numbers themselves are unchanged: they come from `server/earth/providerOrchestrator.ts`, and `retries = Σ(attempts−1)` cannot equal `attempts` for a non-empty chain — the production pair (6/6) is therefore **unexplained** and is recorded as open rather than "fixed" (see the audit report §I). |

## 2026-11-18 — audit pass: what was fixed, what was only measured

A full audit pass (rate limiting, the COSMORA AI v3 defect register, four open
pull requests, build/tests, security, live verification) produced these changes.
The report is `docs/audits/PHASE3_AUDIT_2026-11-18.md`; the scientific register is
`COSMORA_AI_v3/docs/DEFECT_REPORT.md` §10.

| Behaviour | Detail |
| --- | --- |
| **The Earth rate limiter is bounded** | `server/earthIntelligence.ts` kept one `Map` of per-client counters forever: an entry was only replaced when *the same client* returned after its window. A client that appears once — or one rotating source addresses — left a permanent entry, so the map grew with every distinct client the process had ever seen. This is the defect `server/requestRateLimit.ts` had already fixed for the other routes; the Earth router kept its own copy of the unbounded pattern. It now sweeps closed windows at 5,000 tracked clients and enforces a 10,000 ceiling. **No production memory exhaustion was demonstrated** — the ceiling needs thousands of distinct clients in one process lifetime — so this is reported as a bounded-memory fix, level with the `api` limiter that already had it. |
| **The upstream payload cache has a ceiling** | The same file's `cache` swept expired entries above 400 but had no cap if every entry was still live; it now drops the soonest-to-expire entries at 600. |
| **Scientific provenance digests are recomputable** | `payload_sha256` was the hash of a re-serialised object, so it matched neither the file on disk nor the digest published in `data/cache/README.md`. It is now the digest of the file's bytes, and the three committed payloads reproduce their published digests exactly. |
| **A `--quick` run can no longer claim the full run's identity** | The manifest, report, dashboard footer and run directory all carried the hash of the unmodified config even when the epoch budget was overridden. The effective configuration is now hashed, written to `effective_config.json`, and the configured hash is kept beside it with an explicit "overridden" note. Full runs are unaffected (same hash, `a6bbe9432b389257`). |
| **Gaps in a monthly record no longer shift every lag** | Lags were positional, so one dropped month turned `lag1` into `lag2` for every later row, silently. Features are now built on a gap-free monthly calendar and rows that cannot be described from history are dropped. The reported run has `dropped_months = 0`, so its numbers are unchanged. |
| **Still open, deliberately** | `config_hash` still covers presentation settings (D16), conformal coverage is still a measurement rather than a guarantee with no adaptive interval built (D13), the cache filename still omits the request signature for existing files (D19 residual), the MAPE-style metric is still unusable on dry months (D25), the notebook is still never executed in CI (D28), and the ruff style backlog is untouched (D31). Each is argued in `COSMORA_AI_v3/docs/DEFECT_REPORT.md` §10. |
| **APOD is failing upstream right now** | `api.nasa.gov` answered HTTP 500 at 10:44Z on 2026-11-18, so the home APOD panel reads Unavailable and the strip keeps retrying. The key is configured; the failure is NASA's. Nothing is substituted. |

## 2026-11-18 — what the two long home cards claim

The APOD panel and the Earth preview under the service strip both overstated
or under-explained their own numbers. Recorded here because the fix is a
statement about what those cards are allowed to claim, not just a layout change.

| Behaviour | Detail |
| --- | --- |
| **"Complete years" counts complete years** | NASA POWER returns the current year with the months it has so far (on 2026-11-18, 2026 had January–September). The card counted every annual bucket with a number — 15 for a 2012–2026 request — and printed it under the label *Complete years*. There are 14: `src/pages/home/EarthPreview.tsx` now counts `point.complete`, and `src/lib/earth/power.ts` already defined complete as 12 monthly values. |
| **The year in progress is drawn as provisional** | The partial 2026 mean was plotted as an ordinary vertex, which reads as "2026 warmed" even though `leastSquaresTrend` had always excluded it. `src/pages/home/Sparkline.tsx` now draws it hollow, joins it with a dashed segment, leaves it out of the period-mean line, and the caption names it: `2026 in progress, not in 2012–2025`. |
| **The metric labels no longer collide** | *Least-squares slope* wraps to two lines in a ~350 px column, and `.eyebrow` sets `line-height: 1`, so the wrapped label pushed `+0.034 /yr` below its neighbours. The three `dt`s now carry a shared `min-h` and `leading-[1.35]`, so the three values share a baseline. |
| **A saved APOD says why and when** | The card's only signal was a small **CACHED** badge beside a four-day-old picture. It now prints the loader's own reason (*"Live request failed (api.nasa.gov returned a site logo instead of the entry image). Showing the value saved 4 days ago."*) in the space that used to be empty, carries the same sentence in the badge tooltip, and offers its own *Try again* — the Earth card already had one. |
| **APOD has no live picture to show** | This is not a defect the card can fix: `/api/apod` answers `success: false`, `APOD_UNAVAILABLE`, `fallbackReason: "degraded"` because `api.nasa.gov` served its own site logo instead of the entry. The card is a labelled archival fallback (`apod.regression` covers that path) and its date will lag the Earth card's `retrievedAt` until the upstream recovers. |
| **These notes are English-only** | Like the per-tile failure notes in `src/pages/home/SignalStrip.tsx`, the provenance sentence and the chart caption are hard-coded English inside a trilingual page. The metric labels themselves are translated. |

## 2026-11-14 — the four home-page service tiles

The strip above the home fold reports four services (APOD, orbital tracking,
near-Earth objects, NASA POWER). What a reader should expect when one of them
cannot be reached:

| Behaviour | Detail |
| --- | --- |
| **A failed tile may show a saved value** | Each live tile now keeps its last successful answer (`src/pages/home/homeData.ts`, `withLastKnown`): APOD for 7 days, the ISS fix for 6 hours, the NEO window for 24 hours. On failure the tile reads **CACHED**, the source line becomes the reason the live request failed, and the badge tooltip carries the original retrieval time. NASA POWER already worked this way, which is why it was the only tile that survived a bad connection while the others said UNAVAILABLE. |
| **A tile says why it failed** | `offline — this device has no connection`, `the request did not leave this device`, `the server did not answer within N s`, `the server answered HTTP 504`, `the answer was not valid JSON`. A tile that only says UNAVAILABLE cannot be acted on, and "check your connection" is wrong when the connection is fine. |
| **Each tile retries alone** | A failed tile offers its own *Try again*, which re-runs that one request. Reloading the page to rescue one tile discarded three healthy ones. |
| **One cache, not two** | `vite.config.ts` hands `/api/apod`, `/api/iss` and `/api/asteroids/neows` straight to the network (`NetworkOnly`). The service worker used to keep its own copy, which could label a month-old image LIVE — or turn a healthy endpoint into UNAVAILABLE — and a request that fails *inside* a worker is indistinguishable from a dead network in the UI. The trade is explicit: those three endpoints no longer work offline from the worker; the app's labelled last-known value is what a reader sees instead. |
| **NASA POWER is a monthly archive** | Its **CACHED** badge is correct even on a good connection: `power.larc.nasa.gov` publishes monthly means, so a 12-hour local cache is the honest reading of the data, not a failure. |

## 2026-11-13 — Phase 1 re-audit additions

These are current, measured limits. Each names the command or file behind it.

| Limit | Detail |
| --- | --- |
| **Some trilingual copy still ships eagerly** | The nine interface dictionaries now load per language (entry **170 kB gzip**, `si`/`ta` 37 kB each on demand — a 31 % cut). What remains is the legacy `src/i18n/translations.ts` (83 keys × 3 languages, imported directly by 23 components) and per-component inline copy: roughly another 20–30 kB. Fixing that means moving those components onto i18next. |
| **Per-IP limits are per process** | `server/requestRateLimit.ts` bounds memory (prune at 5,000, cap 10,000) and prevents spoofing by using `req.ip`, but instances do not share counters. Fleet-wide budgets exist only in the Guardian, and only with a shared store configured. |
| **`trust proxy` is unset** | Express reports the socket peer. Behind a proxy, many users can share one bucket; the change cannot be made safely without knowing the real hop count. |
| **The committed server bundle can drift** | `api/index.js` is byte-identical to a fresh build today, but nothing enforces that. A stale commit deploys old server code while the tests pass against new source. |
| ~~**No CI**~~ | **Fixed.** `.github/workflows/verify.yml` runs lint, the full suite, the production build and a dependency audit on every push and pull request (9 steps, green through run 43453484220). The workflow is not yet a *required* check on the default branch. |
| **Gemini generation is unavailable in production** | **Measured 2026-11-13** (three live probes, `aeb601e`): the key is valid (`GET /v1beta/models` 200, 49 models) and the API refuses generation — 503 `UNAVAILABLE` on `gemini-3.8-flash` in the vendor's own words ("currently experiencing high demand"), 404 on the `gemini-2.5-flash` alternative even though that id is in the key's list. Not a configuration error in this repository; nothing here can enable it. NOVA answers through OpenRouter and the local engine, verified `ok` in the same probes. See `docs/API_STATUS_REPORT.md`; the console procedure is `docs/nova/GEMINI_ACCESS_RUNBOOK.md`. |
| **The NEO panel can be *derived*, not live** | When NASA NeoWs fails, `/api/asteroids/neows` falls back to JPL's Close Approach Data (Earth approaches within 0.2 AU). That source publishes no PHA flags and no diameters, so the panel shows `—` for them and the badge reads **DERIVED** — it is real data, but it is not the NeoWs feed, and the hazardous count is unknown rather than zero. |
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
