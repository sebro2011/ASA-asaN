# MASTER AUDIT REPORT — NASA Space Explorer

Phase 1 of the master development programme. The audit itself modified no source
file; the two P0 findings were fixed immediately afterwards and their remediation
is recorded in §6, because leaving a fabricated NOAA reading and a fabricated NASA
archive live while writing follow-up documentation would have been indefensible.

- Repository: `sebro2011/ASA-asaN`
- Branch: `arena/ad469a17-asa-asan`, branched from `7251652` (main)
- Audit date: 2026-11-12
- Auditor scope: architecture, APIs, AI layer, security, performance, UI/UX,
  tests, build, documentation

Severity scale: **Critical** = shows invented or misattributed science, or breaks
a core promise · **Major** = user-visible failure or a requirement not met ·
**Minor** = debt, polish, or a latent risk.

---

## 0. Method and what was actually executed

Everything below is based on reading this working tree and on commands that were
run, not on assumptions. Verification commands and their real results:

| Command | Result |
| --- | --- |
| `git status --short` | clean before the audit |
| `npm install` | completed; `node_modules` is not persisted between sessions, so this was required before any tooling ran |
| `npm audit` | **6 vulnerabilities** (2 low, 4 moderate), all in the build chain |
| `npm run build` | exit 0 · 86 JS chunks · **5.07 MB** total JS · entry `index-*.js` **888 KB** (242 KB gzip) · PWA precache 158 entries / 7.3 MB |
| `npm run lint` (`tsc --noEmit`) | clean |
| `npm test` | **682 pass / 0 fail** across 40 test scripts |
| `npm run test:forge` | **224 / 224** (11 suites) |
| live `GET /api/nova/config` (production) | providers: auto/local/gemini/openrouter `true`, **arena `false`**; commit `7251652` |
| live `GET /api/nova/diagnostics?probe=1` (production, 2026-11-12T10:32:23Z) | local **ok**, openrouter **ok** (200, 1 754 ms), gemini **error** (`PROVIDER_UNAVAILABLE`, 503), arena `not-configured` |
| live `GET /chat` (production) | 200 |

Not executable from this environment, and therefore **not claimed**: requests to
`api.nasa.gov`, `images-api.nasa.gov`, `ssd.jpl.nasa.gov` or any Gemini
generation endpoint from the sandbox (outbound access is restricted), browser
automation/pixels (no Playwright), and any authenticated spot-check of provider
keys. Where a claim depends on those, it is marked *unverified*.

Current state in one line: the platform builds, tests green, and is
**operationally healthy through OpenRouter and the local engine**, but it has
**two data-integrity defects that put invented science in front of users**, one
effectively dead primary AI provider, three NASA proxies with no cache, and an
`any`-heavy, non-strict TypeScript configuration.

---

## 1. Critical bugs

### C1 — Space weather displays an invented Kp index

**Evidence.** `server/nasaRoutes.ts:1321-1341`:

```ts
app.get('/api/solar-weather', async (_req, res) => {
  try { … fetch NOAA SWPC planetary_k_index … return res.json({ success: true, data, source: 'NOAA SWPC' }); }
  catch { /* fall through */ }
  return res.json({
    success: true,
    data: { kpIndex: 2, status: 'quiet', note: 'Using fallback solar weather data' },
    isFallback: true,
  });
});
```

`src/components/SolarWeather.jsx:38` consumes it as a measurement:

```js
if (typeof sw.kpIndex === 'number') setKpIndex(sw.kpIndex);
```

`isFallback` is never read anywhere in that component (`grep isFallback` → no
hits in `src/components/SolarWeather.jsx`). The UI therefore renders
“**Kp 2.0 / 9.0 — QUIET**” with no indication that the number was manufactured
when NOAA was unreachable.

**Impact.** Direct violation of the platform's own rule (“never invent NASA
scientific data”). A quiet-weather reading is a *reassuring* fabrication, which is
the worst kind: a user checking aurora/geomagnetic conditions is told the field
is calm by a constant.

**Fix.** Cache the last genuine observation
(`lastKnownSolarWeather = { data, fetchedAt }`); on upstream failure return the
real last-known sample with `stale: true, fetchedAt`; if there has never been one,
return `{ success: false, code: 'UPSTREAM_UNAVAILABLE' }` and make the client show
an explicit unavailable state with retry. No synthetic numbers, ever.

**Priority P0 · Complexity S · Phase 3**

### C2 — The “NASA archive” is a fabricated catalogue with stock photography

**Evidence.** `server/nasaRoutes.ts:221-431` — `HISTORICAL_NASA_ARCHIVE`, 13
records, served by `/api/nasa-archive` (`server/nasaRoutes.ts:1210-1248`).
Programmatic inspection of the live export:

```
archive items 13
years {2014:2, 2015:1, …, 2022:2, 2023:1, 2024:1, 2025:1, 2026:1}
unsplash thumbs 13
pattern-ids 13
sample {"title":"Artemis II Orion Spacecraft Completes Altitude Chamber Tests",
        "nasaId":"ARTEMIS-ORION-CREW-2025","source":"press-release",
        "thumbnail":"https://images.unsplash.com/photo-145118…"}
```

All 13 records carry a **synthesised NASA ID** (`JWST-EARLY-COSMOS-2026`,
`ARTEMIS-ORION-CREW-2025`, …) and an **Unsplash stock photo**. The client prints
that ID and deep-links to it:

`src/components/NASANewsExplorer.jsx:558` → `NASA ID: {nasaId}`;
`src/components/NASANewsExplorer.jsx:592` →
`https://images.nasa.gov/details/{nasaId}`.

**Impact.** Invented NASA identifiers, invented article metadata, and stock
imagery presented as NASA photography — including a *2026* dated article that
cannot be verified anywhere. Every deep link in the archive is dead. This is the
single most damaging finding in the repository.

**Fix (recommended).** Replace the static list with a real proxy to the public
NASA Images API (`https://images-api.nasa.gov/search`), server-side, following
the pattern already proven in `server/forge/scienceConnectors.ts`: exact-host
allowlist, `AbortSignal.timeout`, TTL cache, schema validation, normalisation to
the existing client shape, attribution, and an explicit error state when the
upstream is unavailable. Keep the client contract (`articles`, `total`, `page`,
`hasMore`) so the viewer keeps working.

**Alternative (rejected).** Keeping the entries and relabelling them “curated”.
The IDs are not real; relabelling would preserve the fabrication under a softer
name.

**Priority P0 · Complexity M · Phase 3**

---

## 2. Major bugs and requirement gaps

### M1 — Gemini generation is unavailable in production; the fallback story is wrong

Live evidence (`/api/nova/diagnostics?probe=1`, 2026-11-12):

- `gemini-3.8-flash` → **503 `UNAVAILABLE`** (“This model is currently
  experiencing high demand”).
- Fallback probe `gemini-2.5-flash` → **404 `PROVIDER_MODEL_NOT_FOUND`**.
- `GET /v1beta/models` with the same key → **200**, 48 `generateContent` models
  including `gemini-2.5-flash`.
- `openrouter/free` → **200** in 1 754 ms.
- Diagnostics hint: *“the key is valid but the API is refusing generation
  (quota, billing or a project restriction)”*.

The 404 on a model the same key lists as available does not fit that hint. Two
explanations remain: the deployed project cannot generate with any model (quota /
billing / regional restriction surfacing as 503 then 404), or the fallback
request is built differently from the probe that lists models. The code
(`server/novaChat.js:31-41`, `server/novaDiagnostics.js:135`) already tries five
model ids; **the remaining diagnosis needs a live key, which this environment
does not have**. It is therefore recorded as *unverified*, not fixed.

**Impact.** The advertised primary provider is dead for generation; users are
served by OpenRouter or the local engine. Chat still works and correctly reports
the provider used — but `/api/nova/config` reports `gemini: true` while generation
fails, which reads as “operational”. That is a labelling bug regardless of the
upstream cause.

**Fix.** (a) Make the diagnostics hint branch on *observed* status codes rather
than asserting quota; (b) have `/api/nova/config` distinguish `configured` from
`healthy` (health belongs to diagnostics, but the client should not present a
configured-but-failing provider as available); (c) re-verify model ids once a key
is available.

**Priority P1 · Complexity S (a,b) / blocked (c) · Phase 2**

### M2 — Three NASA proxies re-hit upstream on every request

| Endpoint | Handler size | cache | freshness field |
| --- | --- | --- | --- |
| `/api/apod` | 82 L | yes | yes |
| `/api/asteroids/neows` | 172 L | **no** | **no** |
| `/api/epic` | 121 L | **no** | **no** |
| `/api/exoplanets` | 132 L | **no** | **no** |
| `/api/iss` | 28 L | yes (last known) | yes |
| `/api/solar-weather` | 21 L | no (and fabricates — C1) | no |

`server/nasaRoutes.ts:695,867,988`. With `DEMO_KEY` (see M4) the hourly quota is
exhausted by a handful of page loads, producing exactly the failures the
fallbacks were written to hide. None of the three returns a `fetchedAt`/`stale`
pair, so the UI cannot show data age.

**Fix.** One shared TTL cache helper (already de-facto implemented three different
ways: `apodCache`, `translationCache`, `groundedSearchCache`) plus `fetchedAt` and
`stale` on every payload, and a "retrieved HH:MM" line in the viewer.

**Priority P1 · Complexity M · Phase 3**

### M3 — TypeScript strict mode is off

`tsconfig.json` sets `target`, `module`, `jsx`, `allowJs`, `paths` and **nothing
about strictness** — so `strict`, `strictNullChecks`, `noImplicitAny` and
`noUncheckedIndexedAccess` are all at their defaults (off). Measured debt:

- `: any` / `as any` → **76** occurrences across `src/` and `server/`.
- 3 service modules of the AI layer are plain JS (`server/novaChat.js`,
  `server/novaDiagnostics.js`, `server/novaThinking.js`) and are therefore
  type-checked only as `any`.

**Impact.** `npm run lint` passing is a weaker signal than it looks; null-path bugs
in the NASA adapters (precisely where payload shapes are uncertain) are invisible.

**Fix.** Turn on `strict` in stages: first `noImplicitAny` + `strictNullChecks` for
`server/**` (highest risk surface), then `src/lib/**`, then components. Expect a
large but mechanical diff; do not attempt it in the same PR as feature work.

**Priority P1 · Complexity L · Phase 6 (foundation) — needs a dedicated branch**

### M4 — `DEMO_KEY` fallback is silent

`server/nasaRoutes.ts:1255`:

```ts
const nasaApiKey = process.env.NEXT_PUBLIC_NASA_API_KEY || process.env.NASA_API_KEY || 'DEMO_KEY';
```

Nothing logs, warns or exposes that the app is running on the 30-req/hour demo
tier. `/api/health` does not report key presence. A deployment with a rotated or
missing key degrades to near-certain 429s with no operator signal.

**Fix.** Report `nasaKeyConfigured: boolean` in `/api/health`, log a single startup
warning, and surface “demo quota” in the freshness metadata when active.

**Priority P2 · Complexity S · Phase 3**

### M5 — Mars Rover Photos integration does not exist

The master prompt lists NASA Mars Rover Photos as an integration to maintain and
improve. In this tree it exists only as a **Forge dataset descriptor**
(`src/lib/forge/vocab.ts:338`, `endpoint: …/mars-photos/api/v1/rovers/curiosity/photos`)
and as a count-only normaliser (`src/lib/forge/normalize.ts:576`). There is no
route, no adapter and no viewer (`grep -rn "mars-photos" server/` → no hits).

**Fix.** Add `/api/mars-photos` through the same cached-adapter pattern as M2 and a
gallery surface that shows the camera, sol, Earth date and rover for each frame,
with the image credit printed per item.

**Priority P2 · Complexity M · Phase 3**

### M6 — 6 dependency advisories, all in the build chain

`npm audit`: `deepmerge` (prototype poisoning), `glob` (AbortSignal bypass →
post-timeout filesystem traversal), `minimatch` (globparts DoS), reached via
`vite-plugin-pwa → workbox-build → @rollup/plugin-node-resolve`. None is reachable
from runtime request handling — they are build-time. `npm audit fix --force` wants
to *downgrade* `vite-plugin-pwa` to 1.1.0, which is a breaking change to the PWA
setup.

**Fix.** Track upstream; upgrade `vite-plugin-pwa`/`workbox-build` when a
non-breaking release lands. Do not force-downgrade.

**Priority P2 · Complexity S · Phase 6**

---

## 3. Minor bugs, technical debt, UI/UX and performance

### T1 — Two import namespaces for the same modules

`vite.config.ts:resolve.alias['@'] = <repo root>`, so `@/lib/nasaApi` resolves to
**root `lib/nasaApi.js`** (921 lines), while `src/lib/nasaApi.js` is a 2-line
re-export shim of it, and `src/lib/dbCache.js` likewise re-exports root
`lib/dbCache.js` (386 lines). Components import the same module through both
paths (`src/components/AsteroidRadar.jsx:8` uses `@/lib/…`;
`src/components/NasaNewsFeed.jsx:12` uses `../lib/…`). Root `components/` (4 files,
140 KB) sits beside `src/components/` for the same reason.

**Impact.** Two answers to “where does this live”, duplicated path resolution in
review, and a root that is neither `src` nor tooling.

**Fix.** Move `lib/*` and `components/*` under `src/`, keep the `@/` alias pointing
at `src/`, update the shims to re-export the new location, and delete the root
copies in the same PR. Verify with `tsc` and the full suite.

**Priority P2 · Complexity M · Phase 6**

### T2 — Duplicate shells and two styling systems

Two application shells exist: `src/app/AppShell.tsx` (workspace) and
`src/explore/ExploreApp.tsx` (explore mode), each with its own skip link, mobile
bar and layout. Styling is a mix of Tailwind v4 utilities and hand-written CSS
(`src/styles/{tokens,nova-tokens,workspace,hypothesis-forge,forge-research}.css`,
140 KB, 32 media queries).

**Impact.** Not a bug today; a regression risk tomorrow (a fix in one shell misses
the other). The scroll audit work already had to reason about both.

**Fix.** No rewrite. Extract the shared shell primitives (skip link, mobile bar,
focus rings) into `src/ui/` and have both shells compose them.

**Priority P3 · Complexity M · Phase 5**

### T3 — Performance: entry chunk and heavy optional libraries

Measured build (this branch):

| Chunk | Size |
| --- | --- |
| `index-*.js` (entry) | **888 KB** (242 KB gzip) |
| `three.module-*.js` | 700 KB |
| `ChatSurface-*.js` | 636 KB |
| `model-viewer-*.js` | 416 KB |
| `Space3DViewer-*.js` | 392 KB |
| `BarChart-*.js` (recharts) | 380 KB |
| `ExploreApp-*.js` | 300 KB |
| `react-three-fiber.esm-*.js` | 176 KB |
| `leaflet-src-*.js` | 148 KB |

86 chunks / 5.07 MB JS total. Route-level `React.lazy` is in place
(`src/App.tsx:25-40`), but there is **no `manualChunks`**, so the entry carries a
large share of the static import graph; and the PWA precaches 158 entries / 7.3 MB
(`maximumFileSizeToCacheInBytes: 6 MB`), which is heavy for an Android tablet
install.

**Fix.** (a) `build.rollupOptions.output.manualChunks` for `three`,
`@google/model-viewer`, `recharts`, `leaflet`; (b) load `three` only when a 3D
surface is opened (it is already a separate chunk — move the static imports behind
`lazy`); (c) trim precache `globPatterns` so heavy media is runtime-cached instead
of precached; (d) `loading="lazy"` + explicit dimensions on the 13 of 21 `<img>`
that lack it.

**Priority P1 · Complexity M · Phase 6**

### T4 — No streaming responses

`/api/nova/chat` returns one JSON body (`server/novaChat.js` reads
`await upstream.json()`). Time-to-first-token equals full generation time; the UI
shows a thinking indicator for the whole call (measured provider round trip:
1.75 s for OpenRouter, with generation typically longer).

**Impact.** Perceived latency only; nothing is broken.

**Fix/decision needed.** SSE streaming would touch the chat client, the provider
adapters, the Workspace shell and every test that asserts a single response. This
is an architectural change: options are (1) keep JSON and shorten the perceived
wait with progressive UI, (2) add SSE alongside the JSON endpoint behind a
capability flag. **Awaiting approval before implementing.**

**Priority P2 · Complexity L · Phase 2 (blocked on decision)**

### T5 — Open-ended CSP directives

`server.ts:75-96`: `img-src 'self' data: https: blob:` and
`connect-src 'self' https:`. Correct for this app (NASA imagery, GIBS, YouTube
thumbnails, provider APIs) and there is no `unsafe-eval` in production, but both
directives permit *any* https host. Tightening them to the enumerated hosts used
by the app would cut exfiltration surface; the cost is a maintenance list that
must be updated whenever a connector is added.

**Priority P3 · Complexity M · Phase 6**

### T6 — Documentation sprawl

56 files under `docs/`, including 10 Hypothesis-Forge documents, plus
`PHASE1_AUDIT_REPORT.md` and `PHASE7_VALIDATION_REPORT.md` at the repository root,
and no `docs/audits/` directory (this report creates it). Some documents predate
the current architecture (e.g. root-level phase reports reference surfaces that no
longer exist under those names).

**Fix.** This programme creates `docs/audits/`, `docs/TECHNICAL_ARCHITECTURE.md`,
`docs/API_STATUS_REPORT.md`, `docs/TEST_RESULTS.md`, `docs/KNOWN_LIMITATIONS.md`,
`docs/DEVELOPMENT_CHANGELOG.md`; move the root-level phase reports into
`docs/archive/` once superseded.

**Priority P3 · Complexity S · Phase 9**

### T7 — i18n is in good shape (recorded so it is not “fixed” twice)

1 627 keys in each of `en`/`si`/`ta`, zero missing keys, only 16 (si) and 17 (ta)
values identical to English (proper nouns and units). Rendered scripts are wired
through `@fontsource/noto-sans-{sinhala,tamil}`. No action needed beyond
translating the new Mars/photos strings when M5 lands.

### T8 — Accessibility baseline is sound

Two skip links (`src/app/AppShell.tsx:110`, `src/explore/ExploreApp.tsx:352`), 17
`aria-live` regions, visible focus rings in the token layer, native form controls,
`role="tablist"` patterns, dark/light/system theming with `prefers-color-scheme`
(`src/app/theme.tsx:44-50`). Residual work: contrast audit of the light theme and
keyboard traversal of the 3D surfaces, both requiring a browser.

---

## 4. What is healthy and must not be disturbed

- **Security headers and CORS**: `server.ts:44-160` — CSP, `nosniff`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Vary: Origin`, and a
  CORS decision function that refuses an unknown origin by *withholding* the grant
  rather than 403-ing (`server/cors.ts`). Correct and deliberately documented.
- **Rate limiting** on `/api/youtube/meta`, `/api/community`, `/api/workspace/config`
  and every Forge route (`server.ts:165-175`, `server/forgeRoutes.ts`).
- **No credentials in frontend code**: zero `import.meta.env` reads in `src/`
  (only a comment in `src/utils/nasaApiClient.ts` explaining why).
- **Provider orchestration**: `server/earth/providerOrchestrator.ts` — retry only
  transient statuses, exponential backoff with jitter, hard deadline, typed
  `ProviderError`, redacted reasons. This is the model any new adapter should copy.
- **Deterministic science layer**: `src/lib/forge/science/*` with assumption gates
  and reproducibility records; 224 Forge tests.
- **Earth Intelligence Lab**: `src/lib/earth/*` (5 474 lines total with the server
  side) — POWER monthly series, GIBS layer kept separate, and a deterministic
  analysis module that explicitly states *“no statistical significance test,
  seasonal decomposition or attribution has been applied”* (`src/lib/earth/analysis.ts:149`).
- **Test depth**: 682 tests across 40 scripts, including jsdom UI tests and
  injected-fetch connector tests.

---

## 5. Prioritised plan

| ID | Finding | Priority | Complexity | Phase |
| --- | --- | --- | --- | --- |
| C1 | Solar weather fabricates a Kp index | **P0** | S | 3 |
| C2 | “NASA archive” is a fabricated catalogue with Unsplash images | **P0** | M | 3 |
| M2 | No cache/freshness on Neows, EPIC, Exoplanets | P1 | M | 3 |
| T3 | Entry chunk 888 KB, no manualChunks, heavy precache | P1 | M | 6 |
| M1 | Gemini generation down; config says “configured” | P1 | S (+blocked) | 2 |
| M3 | TypeScript strict mode off | P1 | L | 6 |
| M4 | Silent `DEMO_KEY` fallback | P2 | S | 3 |
| M5 | Mars Rover Photos missing | P2 | M | 3 |
| T4 | No streaming (needs an architectural decision) | P2 | L | 2 |
| T1 | Dual `lib/` namespaces | P2 | M | 6 |
| M6 | 6 build-chain advisories | P2 | S | 6 |
| T2 | Duplicate shells / two styling systems | P3 | M | 5 |
| T5 | Open-ended CSP directives | P3 | M | 6 |
| T6 | Documentation sprawl | P3 | S | 9 |

**Proposed execution order.** C1 and C2 first (they are the only findings that put
wrong science in front of a user), each with a test that fails before the fix.
Then M2 + M4 together (one shared cache/freshness helper), then T3 (perf, no
behavioural change), then M5, then M1's labelling half, then the strict-mode
migration on its own branch, then T1, then the UI/UX pass.

**Decisions requested before the corresponding work starts**

1. **Streaming (T4)** — adopt SSE, or keep JSON and improve perceived latency?
2. **Strict TypeScript (M3)** — it is a large mechanical diff; confirm it may land
   as its own PR that touches many files at once.
3. **`lib/`/`components/` relocation (T1)** — confirm moving 7 root files into
   `src/` is acceptable (import paths change in ~15 components).

## 6. Remediation status (same branch, after the audit)

| ID | Was | Now | Evidence |
| --- | --- | --- | --- |
| C1 | `/api/solar-weather` invented `{kpIndex: 2, status: 'quiet'}` on outage; panel labelled it "NOAA SWPC feed" | Parses the real Kp and plasma tables; keeps the last **measured** sample; serves it with `stale: true` + its original `fetchedAt`; 503 `UPSTREAM_UNAVAILABLE` when nothing was ever measured; the panel distinguishes `loading/live/stale/sample` and prints the observation time | `scripts/test-solar-weather.mjs` (5), `scripts/test-solar-weather-dom.mjs` (3) |
| C2 | `/api/nasa-archive` served 13 invented records with synthesised NASA IDs and Unsplash photos; client printed the IDs and deep-linked them | Real NASA Images search through a new adapter (allowlist, timeout, 5-min TTL cache, shape validation, attribution); 400 without a term, 503 on outage; client renders an explicit unreachable state with retry and a live source line | `scripts/test-nasa-archive.mjs` (10), `scripts/test-nasa-archive-client.mjs` (4) |
| T-dead | `fetchMarsPhotos`, `searchNasaMedia` and two mock bundles carried `nasa-${Math.random()}` ids, `PIA25000`-style ids on Unsplash images, and a hardcoded `DEMO_KEY` in browser code, with no callers | Removed. Mars imagery will return as a server adapter (M5) | assertion in `test-nasa-archive-client.mjs` |

Verification after the fixes: `npm test` **704 pass / 0 fail** (was 682),
`npm run lint` clean, `npm run build` exit 0.

Still open and unchanged by this remediation: **M1** (Gemini generation down),
**M2** (no cache on Neows/EPIC/Exoplanets), **M3** (strict mode off), **M4**
(silent `DEMO_KEY`), **M5** (Mars Rover Photos), **M6** (build-chain advisories),
**T1–T6**. They remain live at the current commit and are the next phases' work.
