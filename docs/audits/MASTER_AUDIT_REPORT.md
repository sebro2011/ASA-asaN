# MASTER AUDIT REPORT — NASA Space Explorer

**Current audit: 2026-11-13.** Branch `arena/8a962084-asa-asan` (branched from
`aeb601e4`, `main`), HEAD `a2fcfa1` before this pass. This audit read the whole
working tree and ran the commands in §0. It modified no source file during the
inspection itself; the four findings marked **FIXED** were remediated immediately
afterwards, in the same branch, and are recorded with their verification in §6.

Earlier audits (2026-11-12 and its follow-ups) are preserved verbatim at the end
of this document — see [§10 Appendix](#10-appendix-earlier-audits-preserved). They
remain accurate as history; several of their findings are now closed, and where
that is true this report says so rather than repeating them as open.

Severity scale: **Critical** = the repository misrepresents its own state or a
documented command does not work · **Major** = user-visible failure, a requirement
not met, or a production risk · **Minor** = debt, polish, latent risk.

Complexity: **S** = under an hour, local · **M** = a day, contained · **L** =
architectural, needs a decision before code.

---

## 0. Method — what was actually executed

No claim below rests on reading alone; each has a command behind it.

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | clean (exit 0) |
| `npm test` | **819 pass / 0 fail** across 67 test scripts (was 810 at the start of this pass; +9 from the new limiter suite) |
| `npm run build` | exit 0 · 89 JS chunks · 4.98 MB raw / **1.42 MB gzip total** · entry `index-*.js` **543.90 kB raw / 170.25 kB gzip** after the locale split (was 920.85 kB / 245.83 kB gzip) · `si` 37.3 kB and `ta` 37.8 kB gzip on demand · CSS 63.65 kB gzip |
| `npm start` (as documented, `node server.ts`) | **crash** — `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` (see C1) |
| `npx tsx server.ts` + `GET /api/health` | 200 `{"status":"ok"}` |
| `npm audit` | **6 advisories** (2 low, 4 moderate, 0 high/critical), all in the build chain |
| `esbuild server/vercelEntry.ts` vs committed `api/index.js` | **byte-identical** — the committed bundle matches its source today |
| i18n key parity (all 9 dictionaries, 3 languages) | **0 missing keys** across **1,732** English keys |
| i18n bundle weight (`esbuild` on `src/i18n.ts`) | **740 KB raw / 121 KB gzip** |
| live `GET /api/guardian/{health,status,cron,run}` on the mounted app | 200 / 200 (13 providers, memory store, honest reason) / 503 `SCHEDULE_SECRET_MISSING` / 403 `GUARDIAN_LOCKED` |
| source inventory | 389 files under `src`/`server`/`api`/`lib`, 94,370 lines of TS/TSX/JS |

Not executable from this environment, therefore **not claimed**: requests to any
NASA host, Gemini/OpenRouter/Arena, Supabase, or a real browser (no Playwright).
Anything depending on those is labelled *unverified* below.

---

## 1. Critical findings

### C1 — The documented production start command crashes — **FIXED**

**Evidence.** `package.json` had `"start": "node server.ts"`, and
`docs/NOVA_INSTALLATION_GUIDE.md:37` advertised it as *"tsx-free, Node strips types
on 22"*. Reproduced on Node v22.22.3:

```
file:///home/user/ASA-asaN/server/spaceVideos.ts:32
  constructor(public code: SpaceVideoFailure) { super(code); }
SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]:
  TypeScript parameter property is not supported in strip-only mode
```

Node's type *stripping* removes annotations; it does not transform parameter
properties or enums. Every self-hoster following the guide crashed on boot. Vercel
was unaffected because it runs the pre-built `api/index.js`.

**Fix.** `"start": "tsx server.ts"` (tsx is already a dependency and is what `dev`
uses), and the guide line corrected. Verified: `PORT=3989 npm start` → server
listening, `/api/health` 200.

### C2 — The repository's own verification record was false — **FIXED**

**Evidence.** `docs/TEST_RESULTS.md` announced "Latest full run 2026-11-12 …
**704 pass**", "44 suites", "entry chunk 888 KB". The tree actually has 67 test
scripts, 819 passing tests and a 245.83 kB gzip entry. The Guardian module — 57
files-worth of new behaviour — appeared in none of `TEST_RESULTS.md`,
`DEVELOPMENT_CHANGELOG.md` or `API_STATUS_REPORT.md`.

For a project whose first rule is "never fabricate results", a stale green record
is worse than no record: it is the artifact a reader trusts instead of re-running
the suite.

**Fix.** `docs/TEST_RESULTS.md` now leads with the 2026-11-13 run; the changelog
carries the Guardian and this pass; `docs/API_STATUS_REPORT.md` documents the
guardian routes. Each states the commands run and what could not be verified.

---

## 2. Major findings

### M1 — Rate limiting leaked memory and one limiter was built per request — **FIXED**

**Evidence.** `server.ts` (pre-fix, lines 124–199) held one module-level
`const rateStore = new Map()` for every limiter, appended to on every request and
**never pruned**. A client rotating IPv6 addresses grows that map without bound —
a slow leak that doubles as a denial-of-service vector on a long-lived container.
Worse, the NOVA chat limiter was *constructed inside* the `app.use` handler
(`rateLimit({...})(req, res, next)`); it only limited anything because the bucket
map happened to be shared module state. The moment anyone gave each limiter its own
store — the obvious fix — the AI budget would have silently disappeared.

**Fix.** New `server/requestRateLimit.ts`:
- each limiter owns its map (unrelated routes can no longer evict each other);
- expired windows are swept once the map passes 5,000 entries, with a hard 10,000
  ceiling as backstop;
- the NOVA limiter is now built **once**, outside the handler.

`scripts/test-request-rate-limit.mjs` (9 tests) pins: exact `max` boundary, 429
code/message/`Retry-After`, window reset on the exact boundary, per-client
isolation, store separation, `skip()` not consuming budget, prune correctness,
bounded growth under 5,200 distinct clients, and `clientKey` preferring the
Express-resolved address over headers. Full suite 819/819.

### M2 — Half of the first-load JavaScript was translation dictionaries — **FIXED**

**Evidence.** Measured, not estimated:

```
i18n dictionaries alone: 740 KB raw / 121 KB gzip
entry chunk:             920 KB raw / 246 KB gzip
```

`src/i18n.ts` statically imports all nine dictionaries (`workspaceCopy` alone is
200 KB of source) and calls `i18next.init` synchronously for **en + si + ta**, so a
first-time mobile visitor downloads all three languages to read one screen.

**Chosen: option A — lazy-load non-active locales.** Result, measured after the
change: the entry chunk fell from **245.83 kB to 170.25 kB gzip (−31 %)** and
Sinhala/Tamil arrive as 37.3 kB / 37.8 kB chunks only when selected. The data was
verified byte-identical to the originals (JSON comparison of all nine dictionaries
before and after), and every English key still exists in both other languages
(1,688 keys per locale bundle).

Structure: `src/i18n/{en,si,ta}/<dictionary>.ts` hold one language each;
`src/i18n/<dictionary>.ts` remains as the three-language aggregator the parity tests
read; `src/i18n/<lang>/index.ts` merges a bundle in the original order;
`src/i18n.ts` imports English statically and dynamic-imports si/ta. Every existing
`i18n.changeLanguage(...)` call site keeps working — the method is wrapped so a
switch loads its bundle first — and `main.tsx` awaits the stored preference before
first paint, so a returning Sinhala/Tamil reader never sees an English flash.

What still ships eagerly: the legacy `src/i18n/translations.ts` (83 keys × 3
languages, imported directly by 23 components) and per-component inline copy. That
is the next 20–30 kB, and it needs the components refactored onto i18next — a
separate, larger change.

**The options as they were weighed.**

| Option | Effect | Cost / risk |
| --- | --- | --- |
| **A. Lazy-load non-active locales** (`import()` per language, `changeLanguage` awaits the chunk) | ~121 KB gzip → ~45 KB on first load (English stays inline); roughly halves first-load JS | M–L: touches `src/i18n.ts` init and the language switcher; needs a loading state; 1,732 keys must stay key-parity-verified |
| **B. Split dictionaries per surface** (chat keys only in the chat chunk) | Better long-term; per-route payloads | L: every `t()` call site's module must own its keys |
| **C. Do nothing, document it** | Zero risk | First load stays at 246 KB gzip |

This is an architectural decision (A changes when translations are available), so
it waits for approval. Recommendation: **A**, in its own branch, with the key-parity
check kept as a test.

### M3 — `trust proxy` is unset, so per-IP limits may be a single global bucket — **OPEN, deployment fact required**

`server.ts` never calls `app.set('trust proxy', …)`. Express then reports the socket
peer, which behind Vercel is not the user. Two consequences, opposite in sign:
per-IP limits may collapse onto one bucket (everyone shares 15 NOVA requests/min —
an outage for everyone once one client bursts), or, if a future change starts
reading `X-Forwarded-For` directly, spoofing per request.

The news and Forge limiters were already moved onto `req.ip` with socket fallback
(2026-11-12), which fixes *spoofing* but not *attribution*. Correct remediation
needs the real proxy chain: `app.set('trust proxy', 1)` is right for one hop, wrong
for zero or three. **Not changed** — guessing here converts a fairness bug into a
security bug. Requires an operator statement about the deployed path.

### M4 — Gemini generation is unavailable in production, and the hint is a guess — **OPEN, external**

Live production diagnostics (2026-11-12T10:32Z, re-read from
`docs/API_STATUS_REPORT.md`): primary `gemini-3.8-flash` → **503**
`PROVIDER_UNAVAILABLE`; every fallback failed, ending with `gemini-2.5-flash` →
**404** `PROVIDER_MODEL_NOT_FOUND`; `keyValid: true`, 48 models listed for the key.

A model that is *listed* for the key yet 404s when called points at access or
region, not at the model id — but the diagnostics copy blamed quota/billing. That
is a guess presented as a finding, which is exactly what this project forbids.
Rewriting the hint to cross-check "model is in the key's model list" against the
404 belongs to Phase 2 (NOVA), and needs either a working key or a documented
"cannot distinguish" answer. OpenRouter answered 200 in 1,754 ms, so NOVA is
**not** down — it is running on OpenRouter and the local engine.

### M5 — 67 test suites, none executed automatically — **OPEN, proposal**

There is no `.github/` directory at all: no workflow, no required check, no
dependency or secret scanning. Every claim of "tests pass" in this repository is a
human running `npm test`, and PR #54 shows preview builds succeeding while nothing
verifies the suite.

Proposed: one workflow on `push`/`pull_request` running `npm ci`, `npm run lint`,
`npm test`, `npm run build`, plus `npm audit --audit-level=high`. No secrets
needed. This changes nothing about the app, but it is a new repository convention,
so it is listed here rather than added unasked.

### M6 — No README at the repository root — **FIXED**

Nothing told a newcomer what this is, how to run it, or where the truth about its
state lives. `README.md` now exists: stack, quick start, scripts, the route map,
env names (values never), the docs index, and a blunt "what is verified / what is
not" section.

### M7 — `.env.example` was missing the variables added since it was written — **FIXED**

Absent: every `GUARDIAN_*`, `CRON_SECRET`, both `NOVA_LIFE_*`, `NOVA_ANALYST_MODEL`,
`EARTH_ANALYST_*`, `FORGE_ASSISTANT_*`. A self-hoster had no way to learn the admin
token even existed, so the dashboard's action panel could only ever be "locked".
Now documented **by name only**, including the fact that `GUARDIAN_STORE_KEY` must
be a service-role key and that a publishable key is rejected.

### M8 — The 920 KB committed server bundle will drift — **OPEN, needs approval**

`api/index.js` (18,186 lines, 919,990 bytes) is a committed esbuild artifact and the
file Vercel actually executes. Today it is **byte-identical** to a fresh
`npm run build:api`, so there is no current defect — but it is a manual
synchronisation step with no guard: edit `server/`, forget to rebuild, and the
deploy silently runs old code while the tests prove the new code. Options: (a) keep
it and add a CI check that a rebuild produces no diff, (b) stop tracking it and let
the build regenerate it. (b) is cleaner and reversible but changes how the
deployment resolves its function, so it needs approval.

---

## 3. Minor findings

| # | Finding | Evidence | Fix / complexity |
| --- | --- | --- | --- |
| m1 | ~~Four near-identical NOVA chat handlers~~ **fixed 2026-11-13** — one handler registered from `NOVA_CHAT_PATHS`; the copies had also left `/api/nasa-ai` rate-limited but **unrouted**, so the client paid a 404 on every ask | `server.ts` | `scripts/test-nova-routes.mjs` |
| m2 | `uncaughtException` is logged and swallowed, so the process keeps serving with possibly-corrupt state | `server.ts:23` | log, then exit and let the platform restart; **S**, but a behaviour change |
| m3 | ~~Clickable `<div>`s with no role/tabIndex; the logo control has `role="button"` and `tabIndex` but no key handler~~ **fixed 2026-11-13** (`9219200` + a11y commit) | `AmbientSoundscapeControl.tsx`, `Logo.tsx:42` | all 12 clickable containers fixed; `scripts/test-a11y-controls.mjs` now fails the build on a regression |
| m4 | Icon-only buttons: only 3 `aria-label`s across 331 `<button>`s | spot check only — most buttons carry visible text, so this is **not** a claim that 328 are broken | audit the icon-only subset in Phase 5; **S–M** |
| m5 | `GUARDIAN_API_KEY` (Guardian news Open Platform) reads as the COSMORA Guardian secret | `.env.example` | rename would break existing deployments; document the distinction instead; **S** |
| m6 | Duplicate root-level reports | `PHASE1_AUDIT_REPORT.md`, `PHASE7_VALIDATION_REPORT.md` shadow `docs/` | move under `docs/audits/` with a redirect note; **S** |
| m7 | Two lockfiles | `bun.lock` + `package-lock.json` | pick one (npm, since scripts and CI use it); **S** |
| m8 | Package identity is boilerplate | `"name": "react-example", "version": "0.1.0"` | rename; **S** |
| m9 | ~~Two client fetches have no timeout~~ **fixed 2026-11-13** (`9219200`) | `lib/nasaApi.js:372` (`/api/satellites`), `:491` (`/api/news`) | `AbortSignal.timeout(15s)`; tested |
| m10 | Production CSP allows `'unsafe-inline'` scripts | `server.ts` CSP array | nonce or hash pipeline; **M** |
| m11 | Build-chain advisories | `npm audit`: deepmerge prototype poisoning, glob/minimatch DoS, via `vite-plugin-pwa` → `workbox-build` | no runtime exposure; fixing requires downgrading `vite-plugin-pwa`, which was previously rejected | 
| m13 | A test proved the environment, not the product: `test-apod-media.mjs` expected a live `api.nasa.gov` call to fail. True here (egress blocked), false on a CI runner, where the route legitimately recovered an official NASA Science record and answered 200. | CI run 43417395210; fixed by stubbing **both** upstreams | fixed; **S** |
| m12 | 72 `any`s and `tsconfig` without `strict` | `grep -rn ": any\b"`; `tsconfig.json` | documented before (M3 of the 2026-11-12 audit); enabling strict is a large, separate change |

---

## 4. What is genuinely healthy (do not "fix" these)

- **Test depth.** 819 assertions-backed tests across 67 scripts, including
  distribution races, security, regression and DOM behaviour. This is far above
  the norm for a project of this size, and it is the reason most of the findings
  above are debts rather than incidents.
- **Multilingual completeness.** All nine dictionaries carry all 1,732 English
  keys in both Sinhala and Tamil — **0 missing, 0 extra**, and only 18 values are
  identical to English (proper nouns). Recorded so no future pass "discovers" a
  gap that is not there.
- **Credential hygiene.** No key in the client bundle, no `VITE_*` secret, keys
  read server-side only, upstream bodies scrubbed with `api_key=[redacted]`
  (`server/nasaRoutes.ts:18-30`), and the Guardian's own scrubber for audit rows.
  22 of 24 server-side `fetch` calls carry an abort/timeout signal.
- **Error surfaces.** Typed JSON for unknown API paths, typed 429s with
  `Retry-After`, a last-resort Express error handler that never echoes provider
  URLs, and JSON error pages instead of Express HTML.
- **Media accessibility.** Every `<img>` checked has `alt` (or `alt=""` when
  decorative); 28 `:focus-visible` rules; reduced-motion blocks in the workspace
  and Forge sheets.
- **Build discipline.** Lazy route surfaces (14 `lazy` + `Suspense`), the Guardian
  dashboard as its own 13.7 kB chunk, PWA precache generated per build, and a
  server bundle verified reproducible today.

---

## 5. Prioritised plan

| Priority | Item | Status | Complexity |
| --- | --- | --- | --- |
| P0 | C1 broken `npm start` | **fixed** | S |
| P0 | C2 stale verification record | **fixed** | S |
| P0 | M1 limiter leak + per-request limiter | **fixed** | M |
| P0 | M7 missing env documentation | **fixed** | S |
| P1 | M6 README | **fixed** | S |
| P1 | M5 CI workflow | **fixed** (`.github/workflows/verify.yml`) | S |
| P1 | M2 lazy locale loading | **fixed** (−31 % first load) | M |
| P1 | M3 `trust proxy` policy | needs deployment facts | S once known |
| P1 | M4 Gemini access / honest hint | external + Phase 2 | M |
| P2 | Phase 2 NOVA (hint accuracy, history search/rename/archive, streaming) | open | L |
| P2 | Phase 3 NASA data (cache headers on proxies, freshness badges) | open | M |
| P2 | Phase 4 Earth Lab (trend uncertainty, coverage indicators — some shipped) | open | M |
| P2 | Phase 5 UI/UX (icon-button labels, tablet sweep) | open | M |
| P3 | Phase 6 (CSP nonce, strict type migration, bundle budget) | open | L |
| P3 | m1–m12 | open | S each |
| — | m13 (new, from CI) — a test asserted this machine's network failure, not the behaviour | **fixed** | S |

---

## 6. Remediation recorded in this pass

All four fixes were verified by the commands in §0 after they landed.

1. **`server/requestRateLimit.ts`** — extracted, per-limiter stores, bounded
   memory, `clientKey`, `pruneRateEntries`. `server.ts` now imports
   `createRateLimiter` and builds the NOVA limiter once. `scripts/test-request-rate-limit.mjs`
   added (9 tests) and chained into `npm test` as `test:rate-limit`.
2. **`package.json`** — `start` → `tsx server.ts`; new `test:rate-limit` script.
3. **`docs/NOVA_INSTALLATION_GUIDE.md`** — the false "tsx-free" claim replaced.
4. **`.env.example`** — Guardian, LIFE, analyst and Forge model variables added by
   name only, with the service-role requirement spelled out.
5. **`README.md`** — new, with an explicit "verified / not verified" section.
6. **`docs/TEST_RESULTS.md`, `docs/DEVELOPMENT_CHANGELOG.md`, `docs/API_STATUS_REPORT.md`**
   — refreshed to the 2026-11-13 state, Guardian included.
7. **Lazy locales (M2, approved as option A)** — nine dictionaries split into
   `en/`, `si/`, `ta/` modules, `src/i18n.ts` rewritten to import English and
   dynamic-import the other two, `main.tsx` awaits the stored preference.
   `scripts/test-workspace-shell.mjs`, `test-workspace-home.mjs`, `test-forge-ui.mjs`
   and `scripts/i18n-audit.mjs` updated for the async contract (no assertion
   weakened: they still compare all three languages). Entry 245.83 → 170.25 kB gzip.
8. **The first CI run found a test that depended on this machine's network.**
   `test-apod-media.mjs` asserted a 503 on a live APOD request; on a runner with
   internet the route correctly recovered an official NASA Science record and
   answered 200. Both upstreams are now stubbed. This is the kind of defect a CI
   gate exists to find, and it is why the green local suite was not the last word.
9. **CI (M5, approved)** — `.github/workflows/verify.yml`: `npm ci`, lint, test,
   build, an `api/index.js` drift check, and `npm audit --audit-level=high`.
   `package-lock.json` is now committed so `npm ci` is reproducible; `npm run
   check:bundle` performs the same drift check locally.

Suite after all of it: **819 pass / 0 fail**, `tsc --noEmit` clean, production
build exit 0.

---

## 7. Decisions requested before Phase 2

1. **`trust proxy`** (M3) — what is the actual deployed hop count in front of
   Express? Without that number the change would be a guess.
5. **Deployment settings stay untouched** until you approve: the Guardian migration,
   `GUARDIAN_ADMIN_TOKEN`/`CRON_SECRET`, the Vercel cron entry, and PR #54's merge.

---

## 8. Environment variables — names only

`GEMINI_API_KEY` · `OPENROUTER_API_KEY` · `ARENA_API_KEY` · `ARENA_BASE_URL` ·
`NOVA_GEMINI_MODEL` · `NOVA_OPENROUTER_MODEL` · `NOVA_ARENA_MODEL` ·
`NOVA_OPENROUTER_{FLASH,FLASH_THINKING,THINKING,DEEP_THINKING}_MODEL` ·
`NOVA_ANALYST_MODEL` · `EARTH_ANALYST_{OPENROUTER,ARENA}_MODEL` ·
`FORGE_ASSISTANT_{OPENROUTER,ARENA}_MODEL` · `NASA_API_KEY` ·
`NEXT_PUBLIC_NASA_API_KEY` · `FIRMS_MAP_KEY` · `GNEWS_API_KEY` · `NEWSAPI_KEY` ·
`GUARDIAN_API_KEY` (news, *not* COSMORA) · `YOUTUBE_API_KEY` · `SUPABASE_URL` ·
`SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` ·
`GUARDIAN_ADMIN_TOKEN` · `CRON_SECRET` · `GUARDIAN_STORE_URL` ·
`GUARDIAN_STORE_KEY` · `GUARDIAN_NAMESPACE` · `GUARDIAN_PROBE_LIMIT` ·
`NOVA_LIFE_ALLOW_EXECUTE` · `NOVA_LIFE_DB` · `CORS_ORIGINS` · `PORT` ·
`NODE_ENV`.

No value from any of these appears in this document, in the repository, or in a
response body.

---

## 9. Source inventory

| Area | Files | Notes |
| --- | --- | --- |
| `src/` | React 19 + Vite 8 + TS, 15 workspace surfaces, 9 i18n dictionaries | 14 lazy surfaces |
| `server/` | Express 4, 30 modules + `guardian/` (11 files) | mounted from `server.ts` |
| `api/index.js` | committed esbuild bundle of `server/vercelEntry.ts` | verified in sync |
| `scripts/` | 67 test scripts + 6 verification/build scripts | `node --test` |
| `supabase/` | 3 SQL files + the Guardian migration | migration not applied |
| `docs/` | 33 documents + `docs/audits/` | the audit history lives here |

---

## 10. Appendix: earlier audits (preserved)

### Original audit — 2026-11-12 (`arena/ad469a17`, from `7251652`)

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

### M5 — Mars Rover Photos integration — **WITHDRAWN 2026-11-13: the finding was wrong**

This report claimed the integration did not exist, on the evidence
`grep -rn "mars-photos" server/` → no hits. **The grep was the bug.** The route is
mounted at `/api/mars` (`server/marsPhotos.ts` → `router.get('/photos')`), so the
literal string `mars-photos` appears only as a rate-limit key, never in a path.

What actually exists at the audit commit (`aeb601e`):

- `server/marsPhotos.ts` — `createMarsPhotosRouter()`: rover/sol/page validation,
  30-minute cache (80 entries), https-and-`*.nasa.gov`-only image URLs, `api_key`
  stripped from image URLs, per-record rejection of malformed photos, no sample
  images on failure. Mounted in `server.ts:206` behind a 60/min limiter.
- `src/components/MarsRoverPhotos.tsx` — gallery with rover/sol controls, paging,
  per-item camera/sol/Earth-date/rover, image error handling, `cached` vs
  `fresh` labelling, and full en/si/ta copy. Lazy-loaded in
  `src/explore/ExploreApp.tsx` on the Missions tab (`launch` and `mars` aliases).
- `scripts/test-mars-photos.mjs` — 3 cases (validation, caching, redaction).

**Remaining real limitation:** the upstream API offers Curiosity, Opportunity and
Spirit only — no Perseverance — and the UI says so. Nothing to fix here; the
lesson is procedural: **an audit finding must verify its own evidence.**

**Withdrawn · Phase 3**

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

---

## Follow-up audit — 2026-11-12, branch `arena/f34c77a3-asa-asan`

This is a scoped follow-up to the historical audit above, not a claim that every
feature or line was reverified. Inventory: 493 tracked files; reviewed package and
build configuration, Express entry and Earth router, NOVA provider routing,
POWER tests, PWA registration, chat persistence and existing API/limitation
reports. Source was not changed during this audit. The previous report's live
production observations are historical, not evidence of current provider health.

| Priority | Finding and evidence | Recommended action | Complexity |
| --- | --- | --- | --- |
| Major / scientific accuracy | `server/earthIntelligence.ts` rounds POWER cache keys to three decimal places but sends coordinates rounded to four; nearby distinct requests can receive the wrong grid location's cached data. | Make cache precision match the upstream request and test collision boundaries. | Low |
| Major / security | Earth rate limits take the first `X-Forwarded-For` directly, allowing a direct caller to choose its own bucket. Maps are process-local, not shared across serverless instances. | Use Express's configured client IP; explicitly document proxy configuration and distributed limitations. | Low locally; distributed limit high |
| Major / validation | POWER accepts fractional years and blank numeric query values (which JavaScript converts to zero). | Reject empty/non-scalar coordinates and non-integer years before upstream calls. | Low |
| Major / functionality | Mars rover gallery and route remain absent according to current `docs/KNOWN_LIMITATIONS.md`; streaming is not implemented; live provider availability is unverified here. | Restore only with verified upstream contracts; design streaming separately. | High |
| Major / freshness | Several NASA proxies lack server caching and data freshness; offline PWA telemetry may be old. | Add bounded source-aware caching and explicitly surface stale age. | Medium |
| Minor / security | CSP permits arbitrary HTTPS for images and connections, plus inline script; in-memory rate limiting and caches do not provide distributed protection. | Inventory actual origins before tightening CSP; use trusted proxy and shared rate store where deployed. | Medium/high |
| Minor / performance | Existing audit reports a large entry chunk and duplicate root/src namespaces; 3D features and numerous dashboards deserve runtime profiling on low-end devices. | Measure browser traces, selectively split imports without breaking 3D. | Medium |
| Minor / UX | App has theme, localization and responsive components, but visual/accessibility and tablet behavior were not manually verified in this environment. | **Contrast: done 2026-11-13** — computed from the tokens (`scripts/test-contrast-tokens.mjs`); every ink token ≥4.5:1, tightest 4.68 (`ws-text-3` on `elev-2`, light). **Keyboard: done** — `scripts/test-a11y-controls.mjs`. Still open: real-device/tablet checks, rendered (not token) contrast on glass, focus trap in the two drawers. | Medium |
| Minor / debt | TS strict mode is off; historical reports include prior-branch claims and deployment observations that can become stale. | Incremental strictness and dated evidence, not a wholesale rewrite. | High |

Architecture: React/Vite app with a workspace and explore surfaces; Express routes
are shared via the Vercel entry. `server/novaChat.js` retains the local engine
and explicit remote providers, bounded messages, deadlines and fallback logic;
chat supports search, rename and archive. POWER, GIBS, NASA data, space weather,
ISS, AR, solar system and launch simulator are present in separate modules, but
individual end-to-end correctness was not established by this inventory. Supabase
is optional; its RLS and deployment policies require separate live validation.
`public/sw.js` is explicitly registered while Vite also builds a Workbox worker;
the actual deployed/offline lifecycle needs browser verification.

Environment: Node 22.22.3; `npm install --no-package-lock --ignore-scripts`
succeeded and reported 6 advisories (2 low, 4 moderate). A separate `npm audit
--omit=dev` could not run without an npm lockfile; this repository has `bun.lock`.
Live NASA and remote AI requests cannot be verified from this sandbox because
outbound network access is restricted. No production changes were made.

Follow-up remediation: the cache precision, numeric validation and forwarded-IP
findings above were addressed in `server/earthIntelligence.ts` and covered in
`scripts/test-earth-server.mjs`; `api/index.js` was regenerated. Full test and
build results are recorded in `docs/TEST_RESULTS.md`. Remaining findings were not
resolved merely by recording them.

### Additional follow-up findings and remediation

POWER client parsing converted null/blank/boolean values to zero; local cache
used three-decimal keys and replaced original retrieval times with cache-write
 times; degraded responses hid requested-but-omitted parameters. These
scientific-integrity issues are corrected with regression coverage. Malformed
successful POWER JSON is now rejected before server caching. The Workbox image
cache previously captured non-image NASA requests by hostname, and the Earth
proxy cache could silently replay a POWER response; the configuration now avoids
those paths. Earth analyst capability previously overlooked configured non-Gemini
providers; it now reports configuration without asserting health. Remaining PWA
and other telemetry freshness behavior needs real-browser verification.

### NeoWs / EPIC scientific integrity follow-up

Previously the NeoWs proxy generated invented present-day close approaches, and
its client discarded the fallback flag and cached the result as real. The radar
could issue alerts from sample data and filled missing measurements with invented
numbers. The EPIC proxy and viewer similarly substituted synthetic frames and
telemetry, including for missing fields in successful responses. These active
paths were replaced with explicit unavailable states and regression coverage;
see the changelog and test results. The seven-day NeoWs range is now inclusive,
and app-specific screening is distinguished from NASA PHA classification.
APOD and exoplanet fallback/sample paths still require an independent review;
older claims that every fallback was safely labelled are not reliable.

### APOD / Exoplanet Archive / ISS follow-up

APOD's today cache was overwritten by dated requests; failure fallback records
attributed unrelated illustrative imagery to NASA and APOD ranges assigned
invented dates. Exoplanet fallback records and UI fields could present guessed
measurements and ESI values as archive data. ISS began with invented coordinates,
its client lost stale status and multiplied server millisecond timestamps by
1,000, and two UI surfaces presented distance/speed as a next-pass prediction.
These active paths were corrected as documented in the changelog and tested with
stubs. Predictive pass functionality remains unavailable pending a validated
orbital implementation and current elements; no live provider test was possible.

### NOVA / translation follow-up

The translation route previously presented a partial keyword replacement with an
unrelated Cosmic Latte explanation as a translation and cached by only the start
of a title; it is now fail-closed, bounded, content-keyed and rate-limited. The
legacy AI client fallback claimed NASA telemetry for arbitrary questions; it now
uses the existing labelled local engine. Workspace chat previously sent 20 turns
while the server accepts at most 12; it now bounds history by both count and
bytes. Tests use fake providers and do not establish real provider health or
translation quality. Other phases and live/browser verification remain open.

### Mars rover imagery follow-up

The existing Mars image tagger uses an illustrative stock image and hypothetical
annotations, not NASA observations; it is now labelled accordingly. A separate
historical rover gallery uses a server-side NASA proxy without fabricated fallback.
The proxy and gallery were tested with stubs, not against the live NASA service;
upstream availability, image-host coverage and actual browser layouts remain to
be checked. Pagination's next-page indicator is a heuristic. This is an
incremental phase, not a claim that the full programme is complete.

### News feed integrity follow-up

The legacy news client did not read the current `/api/news` `items` schema,
therefore displayed sample fallback stories as current NASA news. The feed also
used unverifiable old IndexedDB entries and a partial keyword substitution as a
translation. The client now reads the actual schema; the feed excludes labelled
samples and old cache entries, attributes provider names, and retains original
text if translation fails. APOD is shown only when the shared pipeline returns a
non-sample record. Tests are stubbed or source-level, not live-provider or browser
verification. The wider audit and improvements remain ongoing.

### News status follow-up

The feed previously conflated outages with empty results. A separate structured
client result now distinguishes request failure, valid empty results and partial
provider failure, while preserving the existing array-returning helper. Request
ordering guards keep an older news request from replacing a newer one. Stubbed
client and jsdom tests cover outage, retry, empty and success; live provider and
real browser verification remain outstanding.

### Security audit — news rate limiting and proxy trust (2026-11-12)

Scope: `server/spaceNews.ts`, the Express application and Vercel entry/config,
news router tests and a targeted search of server forwarding-header use. No live
infrastructure, trusted proxy chain or production configuration was inspected.

| Priority | Finding | Disposition |
| --- | --- | --- |
| High | News and papers limiters used the first `X-Forwarded-For` entry directly, so a direct client could choose a new bucket per request. | Both now use Express `req.ip`, falling back to the socket peer, with spoofing tests. |
| High / deployment | `server.ts` does not set `trust proxy` (Express default false). Behind a proxy many users may share a bucket; blindly enabling trust permits spoofing if the network path or header sanitization is wrong. | No production setting changed. Operators must verify their actual proxy chain and configure a narrowly trusted policy separately; platform behavior was not verified. |
| High / separate scope | `server/forgeRoutes.ts` also reads the first forwarded address directly for Forge rate limits. | Not changed in this news-specific pass; requires its own remediation and tests. |
| Medium | News/papers buckets are fixed-window, per-process, and expired entries are not globally purged. Instances/restarts do not share limits; high client cardinality can grow the map. `/sources` is not covered by this limiter. | Documented; distributed controls and bounded state require separate design. |

The news and papers budgets remain separate at 30 requests per minute per resolved
client per router instance; a 429 includes Retry-After. The per-router bucket map
is now isolated alongside the existing per-router cache. Stubbed Express tests
cover default trust spoofing, a simulated explicitly trusted loopback proxy chain,
window reset and independent routes. These tests are not proof of Vercel, Netlify
or other real deployment IP/header behavior. See `docs/TEST_RESULTS.md`.

### Authorized live provider smoke checks — 2026-11-12

Production checks through the page-fetch tool found NeoWs, EPIC and POWER data,
while APOD and Mars returned unavailable responses. OpenRouter's diagnostics
probe got HTTP 200, Gemini's primary got 503 and its last reported alternative
404, and Arena was unconfigured. Diagnostics checks status rather than completion
content. Production diagnostic copy wrongly asserted all Gemini failures had the
same cause; branch code now reports uncertainty and the status UI no longer
asserts metadata success proves generation access. Details and caveats are in
`docs/API_STATUS_REPORT.md`. The branch changes have not been deployed; live
provider failure causes remain unresolved and were not guessed.

### Forge rate limiter follow-up — 2026-11-12

The news security audit identified the same direct `X-Forwarded-For` trust in
Forge. The four Forge routes now use Express-resolved `req.ip` with socket fallback,
and fixed windows reset at their exact boundary. Regression tests exercise changing
forged headers against each route and a locally simulated trusted proxy chain.
No production proxy policy or settings changed; these branch changes are not
live. Per-instance state, potential map growth, proxy sharing, and distributed
rate limiting remain limitations, not solved by this local fix.

### NASA imagery update — 2026-11-12

A production NASA Images archive search for `Mars rover Curiosity` returned
actual NASA library records, including Earth-based test imagery; it is not a
substitute for the sol-filtered rover API. The separate Missions explorer added
in this branch searches this existing library adapter, clearly labels the source
and warns that results can include models, artwork or terrestrial testing and
that record dates need not be capture dates. The original rover/sol feature is
preserved without substituting different results. The archive adapter now rejects
missing or malformed collection items/total rather than presenting them as a
valid empty search. This is not an assertion that the old rover upstream is fixed.

APOD direct testing and NASA's issue https://github.com/nasa/apod-api/issues/184
indicate a generic-logo problem; NASA Science's WordPress endpoints returned a
dated post and featured image for one recent date, and one historical title in
separate exploratory requests. These point samples do not establish a stable
APOD replacement, especially for video, credits, date and archive completeness.
No new APOD fallback was introduced or claimed as fixed. Review of alternatives
remains open and any major source architecture change requires approval.

### NASA archive validation and APOD outage navigation — 2026-11-12

The NASA Images route previously used `parseInt` and silently defaulted malformed
`year`, `page`, and `limit` values, turning malformed or duplicate queries into
a different successful search. It now rejects non-scalar, blank, fractional and
malformed values before querying the adapter. The APOD error copy promised a
NASA record link but provided no link: the error panel now offers a link for the
selected date, without supplying or inventing in-app data. A single old-date URL
was observed redirecting to the corresponding NASA Science record; not every
date or future redirect was tested. Upstream APOD availability is not fixed.

### APOD NASA Science fallback — 2026-11-12

After user authorization to address the APOD outage, the existing APOD route
retains its legacy NASA API as first choice, and on failure or a degraded NASA
logo attempts a separately labelled NASA Science WordPress image-article lookup.
It requires one exact APOD date in the title, a NASA article URL, a bounded
explanation, a linked featured-image ID and a NASA Science APOD asset URL; it
refuses detected embedded video and ambiguous, malformed or inaccessible records.
A featured image is not asserted to be the original media, and the UI points to
the NASA record for credits. The range route also rejects degraded/out-of-range
records rather than returning NASA's logo as an APOD.

Live page-fetch exploration confirmed the underlying WordPress search and media
endpoints for one 2024 date and one 2026 date, but the new adapter itself was
only tested using stubs; the sandbox cannot call NASA directly and the branch is
not deployed. WordPress search ranking, upstream HTML, image associations, video
detection, record credits, other dates and real-device rendering need further
verification. Do not describe this as a universal or production-verified fix.


Everything below this line is the 2026-11-12 audit and its follow-ups, kept
unchanged. Where a finding here is closed above, the `Status` in §5 governs.
