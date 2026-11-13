# Development changelog

Newest first. Every entry states what changed, which files, and how it was verified.
Nothing here is a plan; if it was not executed it is not listed.

## 2026-11-13 — The Near-Earth objects tile stops saying "UNAVAILABLE" (branch `arena/3b059f6d-asa-asan`)

The home strip showed **Near-Earth objects: UNAVAILABLE** next to three working
services. Measured first:

| Observation | Result |
| --- | --- |
| `GET /api/asteroids/neows` | 503 `NEOWS_UNAVAILABLE`, **body with no reason** |
| `GET /api/epic` — same key, same host | 200, `cached: false`, `fetchedAt` 18:13Z |
| `api.nasa.gov/neo/rest/v1/feed`, same 7-day window, from outside | 200 — 38 objects |
| `ssd-api.jpl.nasa.gov/cad.api`, same window | 200 — 51 approaches within 0.2 AU |

Upstream healthy, key healthy, failure local to the handler — and the handler
discarded the evidence that would have said why (it computed `upstreamStatus` and
`failureKind`, then never used them).

- **It reports why now.** The 503 carries `fallbackReason`
  (`timeout`/`network`/`rate-limited`/`upstream`/`shape`), `upstreamStatus`,
  `upstreamMs` and the fallback's outcome.
- **The budget is honest.** The 7-day feed is ~400 KB and the route allowed 4 s
  while the function has 30 s and the client waits 15 s: NeoWs now gets 12 s.
  Fast answers are unchanged.
- **A dead tile became a derived one.** If NeoWs still fails, JPL's Close Approach
  Data (official NASA, no key) is converted into the NeoWs shape — AU → km and
  lunar distances, `v_rel` in km/s, dates parsed from JPL's `2026-Nov-13 01:22`
  format. Hazard flags and diameters stay **`null`**, so the panel prints `—`
  instead of a green "Not flagged", and the badge reads **DERIVED**.
- The derived payload lives in its own 5-minute cache, so a NeoWs recovery is never
  hidden behind it and nothing derived ever enters the live 10-minute cache.

Tests: `test-nasa-cache` 12 → **16** (fallback shape, conversion maths, JPL date
parsing incl. rejections, cache separation, reason-carrying 503). Suite 891 → **895**.

Not claimed: the timeout was never observed directly — the sandbox cannot reach
`api.nasa.gov`. The reason fields are what will settle it on the next real failure.

## 2026-11-13 — M4 measured live: the refusal is upstream (`modelAttempts`) (branch `arena/8a962084-asa-asan`)

Audit **M4**, last step: it needed a working key *and* egress. This workspace has
neither, but the deployment has both — so the probe was run against the live
deployment of **`aeb601e`** (`main`) instead of against a local process.

### What the live probes returned (15:57:37Z, 15:59:02Z, 15:59:46Z)
| | probe 1 | probe 2 | probe 3 |
| --- | --- | --- | --- |
| `gemini-3.8-flash` | **503** `UNAVAILABLE`, 499 ms | **503**, 6 425 ms | **503**, 246 ms |
| last fallback `gemini-2.5-flash` | **404** `MODEL_NOT_FOUND`, 143 ms | **404**, 149 ms | **404**, 150 ms |
| `GET /v1beta/models` (key check) | **200**, 90 ms | **200**, 76 ms | **200**, 69 ms |
| models listed by the key | **49** (including `gemini-2.5-flash`) | 49 | 49 |
| OpenRouter | **200**, 499 ms | **200**, 10 253 ms | **200**, 509 ms |
| local engine | ok | ok | ok |

The provider's body, identical in all three:

> `{ "error": { "code": 503, "message": "This model is currently experiencing high
> demand. Spikes in demand are usually temporary. Please try again later.",
> "status": "UNAVAILABLE" } }`

So: the key is valid, the primary id exists and is refusing work, and the
alternative 404s *while the key lists it* — a catalogue entry is not an entitlement.
Three probes in two minutes agree, as do the probes recorded on 2026-11-09/-10/-12.
"Usually temporary" has not been temporary for this project. NOVA answers through
OpenRouter and the local engine, both `ok` in the same probes.

### The gap the probe exposed, and the fix
`modelsTried` was five names and `fallbackModel` was only the *last* attempt, so
"which alternative ids are retired (404) and which are merely busy (503)" could not
be answered — the exact question the probes raised. `server/novaDiagnostics.js` now
returns **`modelAttempts`**: `{ model, ok, httpStatus, code, ms }` per attempt, in
the same order as `modelsTried`. Assertions added to
`scripts/test-nova-diagnostics.mjs` (row count, statuses, ordering) without adding a
test block.

### Docs corrected while the numbers were in hand
`docs/API_STATUS_REPORT.md` (new three-probe table, the vendor body verbatim, and
the old "unexplained 404" kept as a labelled correction),
`docs/audits/MASTER_AUDIT_REPORT.md` (M4 → measured; the open-approvals list no
longer includes Gemini access), `docs/nova/AI_PROVIDER_DIAGNOSTICS.md`,
`docs/KNOWN_LIMITATIONS.md` (the four stale rows that still described no CI, six
advisories, non-strict TS and an unresolved Gemini cause).

### The remaining step is a console action, so it is written as one
The audit's last item was "pin `NOVA_GEMINI_MODEL` or enable Gemini access", which
is not a code change. Before writing it down, the production environment was
read — keys only, no values decrypted — and it changed the instructions:

* **`NOVA_GEMINI_MODEL` already exists** in production: `gemini-3.8-flash`, type
  `plain`, all three targets, id `vTnXoATsN5lltQVo`. So the task is an *update*, not
  a *create* — and it is currently pinned to the very id that answers 503.
* Present: `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `NASA_API_KEY`,
  `YOUTUBE_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.
* Absent (unchanged, and unrelated to M4): `GUARDIAN_ADMIN_TOKEN`, `CRON_SECRET`,
  `GUARDIAN_NEWS_API_KEY`, `ARENA_*`, `DATABASE_URL`.

`docs/nova/GEMINI_ACCESS_RUNBOOK.md` (Sinhala) is the resulting procedure: the
decision tree from a probe's `code`, two evidence paths (all five ids at once via
`modelAttempts` once this branch is deployed, or one id per redeploy), the exact
Vercel screens, the `code` → HTTP → action table, the Google Cloud checks for the
"all ids 404" case, rollback, and a closing verification. It records the two traps
the measurement itself fell into: an env change does not reach a running function
until a redeploy, and `?probe=1` is edge-cached — a repeat needs a fresh query
parameter, or the reader sees the old `checkedAt` and believes nothing changed.

### Verification
`npm test` 891 pass / 0 fail · `tsc --noEmit` clean · `npm run build` exit 0
(`check:pwa` 165 entries) · `api/index.js` rebuilt · docs links resolve.

## 2026-11-13 — The Guardian's news key stops impersonating the Guardian (branch `arena/8a962084-asa-asan`)

Audit **m5**.

### The collision
`GUARDIAN_API_KEY` is The Guardian *newspaper's* Open Platform key: it reads one
news feed. `GUARDIAN_ADMIN_TOKEN` is the COSMORA API Guardian's own credential, and
it is the only thing that authorises `/api/guardian/*`. Two purposes, one prefix —
and the Guardian's own readiness panel listed the news key among its variables, so
a missing news key read as "this Guardian is not configured".

### What changed, without breaking a deployment
- **Canonical name.** `GUARDIAN_NEWS_API_KEY` (`GUARDIAN_NEWS_KEY_ENV` in
  `server/spaceNews.ts`). `GUARDIAN_API_KEY` is read second as a **deprecated
  alias** — a rename must never force a key rotation — and the canonical name wins
  when both are set. A source now carries `envNames` so the alias is a data
  property, not a special case in `isConfigured`.
- **The report teaches the right name.** `/api/news` and `/api/news/sources` show
  `envVar: "GUARDIAN_NEWS_API_KEY"` with `envAliases: ["GUARDIAN_API_KEY"]`.
- **Readiness split.** `envReadiness` returns a separate `newsOnly` bucket
  (`{ set, missing, note }`) and no longer mixes news keys into the Guardian's own
  `set`/`missing`; the note states which variable *does* authorise the Guardian.
  `GUARDIAN_NEWS_API_KEY` was added to `SECRET_ENV_NAMES`, so its value is scrubbed
  from provider reasons exactly like the alias.
- **Dashboard.** The environment-readiness panel gained one translated line
  (`gdNewsKey`, en/si/ta) naming the news keys and why they are separate.
- **`.env.example`** carries both names, with the alias marked deprecated, plus a
  one-line pointer on `GUARDIAN_ADMIN_TOKEN`.

### Tests
`scripts/test-space-news.mjs` +1 test (4 cases): canonical alone configures and is
never echoed, the alias alone still works while the report recommends the canonical
name, canonical wins when both are set, and neither → `unconfigured` (no invented
items). `scripts/test-guardian-monitor.mjs` gained assertions on the `newsOnly`
bucket, its note, and scrubbing of the canonical name.

### Two defects found in the repo's own env audit (`npm run audit:env`)
- it **failed** on a *string literal* — the APOD notice legitimately tells an
  operator that `NASA_API_KEY` exists, and the scanner counted that as browser code
  referencing a secret. Strings are now blanked before the name check; the
  `process.env.X` / `import.meta.env.X` checks still run on the raw source, so the
  change can only remove false positives. Verified by adding
  `process.env.GEMINI_API_KEY` to a browser file: still caught.
- it was **blind to a name reached through a constant** (`key(GUARDIAN_NEWS_KEY_ENV)`),
  which is exactly the shape this change introduces. The scanner now also reads
  `key('NAME')` and `export const X_KEY_ENV = 'NAME'`. Coverage went 27 → **31**
  variables, `GUARDIAN_NEWS_API_KEY`/`GUARDIAN_API_KEY` included, 0 undocumented.

### Verification
`npm run audit:env` exit 0 · `npm test` 891 pass / 0 fail · `tsc --noEmit` clean ·
`npm run build` exit 0 (`check:pwa` 165 entries) · `api/index.js` rebuilt.

## 2026-11-13 — `any` reaches zero, and the ratchet that could not fail (branch `arena/8a962084-asa-asan`)

Audits **m12** (finished) and **M4** (cause identified).

### m12 — 72 explicit `any`s → **0**
The audit counted the words; each one hid a shape. All of them now have a name,
and nothing in `server/` or `src/` writes `any`:

| Area | Was | Now |
| --- | --- | --- |
| YouTube (search + videos) | `Promise<any>`, `(entry: any)` | `YouTubeSearchResponse`/`YouTubeVideoResponse`, every field optional and re-checked |
| Space news (4 providers) | `getJson(): Promise<any>` | one response interface per provider; `getJson<T>` with the cast documented as a boundary |
| Mars photos, APOD science | `normalizePhoto(item: any)`, `post: any` | a validating guard (`asPhotoRecord`, `isRenderableFrame`) and `WpPost`/`WpMedia` |
| NeoWs / EPIC / exoplanets | `createTtlCache<any>`, `Record<string, any>` | `JsonRecord`, `EpicFrame`, and route-local narrowing |
| Supabase (community) | `checked(error: any)`, `toVideo(row: any)` | row interfaces mirroring `supabase/cosmovision.sql` (NOT NULL stays non-optional) |
| Recharts tooltips | `({ active, payload, label }: any)` | `ChartTooltipProps` + a `DrawableTooltipRow` predicate, so `parameterMeta(entry.dataKey)` type-checks |
| Web Speech API | `useRef<any>`, `(window as any)` | the 9 members the component touches (`SpeechRecognitionLike`) |
| Express error middleware | `(error: any, req: any, res: any, next: any)` | `unknown` + `ExpressRequest`/`ExpressResponse`/`NextFunction` |

Two literal datasets (`FALLBACK_APODS`, `GROUNDED_DISCOVERY_ARCHIVE`) lost their
`Record<string, any>` annotation instead of gaining one: the literal is the type,
and a typo in a fixture is now a compile error.

### The ratchet measured 3 while claiming 52
`scripts/test-any-budget.mjs` used `(^|[^A-Za-z0-9_$]):\s*any\b`. The prefix class
excludes identifiers — but an identifier is exactly what precedes a type
annotation (`data: any`), so the pattern matched almost nothing and the budget
never bound. It reported a count of 3 and passed a budget of 52.

A guard that cannot fail is worse than none, so the rewrite fixes both halves:
the pattern now covers `: any`, `as any`, `<any>`, `any[]` and `, any>`;
`BUDGET` is **0**; and a **test of the detector** pins 9 lines that must match and
6 that must not (a comment, a JSDoc `*`, `const company: string`, `items.any(fn)` …).
Verified by appending `const __ratchet_probe: any = 1;` to a source file, watching
the test fail with the per-file summary, then removing it.

### M4 — the 404 on a listed model is the vendor's retirement notice
`docs/nova/INTELLIGENCE_LEVELS_MAPPING.md` §9 already recorded the body of that
404: `models/gemini-2.5-flash is no longer available to new users … use
models/gemini-3.8-flash`. `GET /v1beta/models` is a catalogue, not an entitlement,
so "listed yet 404s" is consistent with "withdrawn for new projects".

`server/novaDiagnostics.js` now acts on it: when the configured id 404s **and**
another id answers with the same key, the report sets `suggestedModel` and appends
`set NOVA_GEMINI_MODEL=<id> … a listing in /v1beta/models is not an entitlement to
call the model`. Two assertions added to `scripts/test-nova-diagnostics.mjs`
(23 pass, no new test blocks). Whether *this* key generates **now** still needs
`/api/nova/diagnostics?probe=1` from a machine with the key and egress; that stays
open in the audit rather than being claimed.

### Verification
`npm test` **890 pass / 0 fail** across 78 scripts (`tsc --noEmit` clean, `strict`
on, `any` 0); `npm run build` exit 0 including `check:pwa` (165 precached entries,
0 inline scripts); `api/index.js` rebuilt and in sync.

## 2026-11-13 — Advisories halved, diagnosable provider errors, `any` ratchet (branch `arena/8a962084-asa-asan`)

Audits **m11**, **M4**, **m12** (the `any` half).

### m11 — 6 advisories → 4, and the remaining four have no fix to take
`glob` and `minimatch` (both **moderate**, both reached through
`vite-plugin-pwa → workbox-build`) are cleared with npm `overrides` to their
patched releases (`glob@^14.0.6`, `minimatch@^11.0.8`).

The four that remain are **low**, and `deepmerge` is unfixable by upgrade: the
advisory covers `>=4.2.0`, so no released version is exempt. All four are
build-time only.

Overrides bypass the range workbox declared, so the risk they create is silent:
a broken matcher still produces a service worker — with an **empty precache** —
and the app looks fine online while being broken offline. `npm run build` now ends
with `check:pwa`, which fails the build unless the worker precaches ≥100 entries,
registration is external, and the built HTML contains no inline `<script>`
(the CSP is `script-src 'self'` now, so one would be fatal in production only).
Current build: **165 precached entries, 0 inline scripts**.

### M4 — a provider failure now names the model
`providerError` returns the model id, the upstream status and a hint that points at
`/api/nova/diagnostics`, plus a status-specific sentence for 404/422, 401/403 and
429. Previously a 404 said only "the selected model is unavailable", which is the
exact failure the audit could not diagnose. Tests assert the words *quota* and
*billing* never appear — the cause is still unknown here, and pretending otherwise
is the one thing this project does not do.

### m12 — 72 explicit `any`s → 52, with a budget that can only fall
Converted: Express handler params in `server/communityVideos.ts`, error shapes in
`server/earth/providers.ts` (now `unknown` + a named `ErrorLike`), every
`catch (err: any)` and `let timeout: any` in `server/nasaRoutes.ts`,
`isDegradedApodRecord` and `setupNasaRoutes` signatures, and four `src/utils`
sites. `scripts/test-any-budget.mjs` fails above 52 and prints the per-file counts
so the next pass can pick a file instead of a number.

### Verification
`npm test` → **889 pass / 0 fail** (was 887) · `tsc --noEmit` clean · `npm run build` ok
(including `check:pwa`) · `npm audit` → 4 low (from 6).

## 2026-11-13 — Icon-only labels, strict mode, documentation index (branch `arena/8a962084-asa-asan`)

Audits **m4**, **m12**, **T6**.

### m4 — the icon-only buttons, actually audited
`tsc` and a hand count cannot tell you which buttons have no accessible name, so
the scan was written to be **conservative**: a button is flagged only when its
entire subtree holds no literal text and no `{…}` expression. That found **12**
real cases out of 465 buttons — all close/dismiss controls and the date picker's
month arrows. All now have `aria-label` via `src/lib/a11yLabels.ts`, translated
into en/si/ta. The scan lives in `scripts/test-a11y-icon-buttons.mjs` and fails
the build if a new nameless icon button appears.

### m12 — `strict: true`
The codebase already type-checked cleanly under `--strict` (0 errors), so the flag
was free: the guarantee had been living in a one-off command line instead of the
compiler everyone runs. 72 explicit `any`s remain — enabling `strict` does not
remove them, and pretending otherwise would be the same mistake as the audit's
"3 aria-labels" arithmetic.

### T6 — a documentation index, and links that are checked
`docs/README.md` now indexes all 56 documents (including a section for the ten
Forge documents, which nothing had linked to). `scripts/test-docs-links.mjs`
checks that every internal link resolves, that the index still covers the files
in `docs/`, and — the direction nobody checks — that no document is orphaned.
It immediately found one genuinely broken link (`docs/nova/API_INVENTORY.md`
pointed at `../scripts/` from inside `docs/nova/`).

### Near miss worth recording
While writing `a11yLabels.ts` I typed the Tamil for "previous month" in **Sinhala
characters**. It type-checked, it rendered, and it was wrong. The label tests now
assert each string is written in its own script, and the same check runs across
both translation dictionaries (with the four legitimate exceptions, where a value
names the other language).

### Verification
`npm test` → **887 pass / 0 fail** (was 878) · `tsc --noEmit` clean with `strict` on ·
`npm run build` ok.

## 2026-11-13 — Fatal-error policy, tightened CSP, proxy trust, report consolidation (branch `arena/8a962084-asa-asan`)

Four audit items in one pass: **m2**, **m6**, **m10**, **M3**.

### m2 — an uncaught exception now ends the process
`server/processGuards.ts`: log once, flush on the next tick, `exit(1)`. After an
uncaught throw nothing about the state is trustworthy, and continuing turns one
crash into an unbounded series of possibly-malformed responses while denying the
platform the signal to replace the instance. Unhandled *rejections* stay
non-fatal on purpose — a rejected promise usually leaves state coherent, and
crashing there would turn one bad `await` into an outage.

### m10 — production CSP no longer allows inline script
`script-src 'self'`. Both inline scripts moved to files: the theme boot is now
`public/theme-boot.js` (still blocking, still in `<head>`, so no palette flash) and
vite-plugin-pwa now emits an external `/registerSW.js` (`injectRegister: 'script'`).
The old comment justified the exception with "React inline handlers", which was
wrong — React attaches listeners through the DOM. Verified against a real build:
`dist/index.html` contains three `<script>` tags and **all three have `src`**.
`style-src 'unsafe-inline'` stays: hundreds of components set `style` attributes,
and a style value cannot execute. The header set now lives in
`server/securityHeaders.ts` so tests can assert what production sends.

### M3 — proxy trust is set, bounded, and overridable
`server/trustProxy.ts` + `TRUST_PROXY`. Unset defaults to **1 hop** (Vercel / Cloud
Run); `0`/`false` trusts nothing; `true`/`*` is refused because it makes `req.ip`
forgeable; unusable input is reported at startup and replaced with the default.
**Still needs an operator confirmation of the real hop count** — recorded in the
audit, not assumed away.

### m6 — two root reports moved under `docs/audits/`
`PHASE1_AUDIT_REPORT.md` and `PHASE7_VALIDATION_REPORT.md`, each with a "Moved"
notice. The repository root now holds only `README.md`.

### Changed test, not deleted
`scripts/test-security-performance.mjs` asserted `trust proxy === false` — it
pinned the M3 bug as intended behaviour. It now asserts the property that is
actually correct: a bounded hop count, never `true`.

### Verification
`npm test` → **878 pass / 0 fail** (was 863) · `tsc --noEmit` clean · `npm run build` ok
· production build inspected: 3 `<script>` tags, 3 with `src` · `api/index.js` rebuilt.

## 2026-11-13 — One lockfile, real package identity (branch `arena/8a962084-asa-asan`)

Audits **m7** and **m8**.

### Changed
- **`bun.lock` removed.** Two lockfiles describe two dependency graphs that drift
  silently; CI, the scripts and the docs all use npm, so `package-lock.json` is the
  one graph. Bun still works — it regenerates its lock on `bun install`.
- **`package.json` renamed** `react-example` → `asa-asan`, with `description` and
  `license: UNLICENSED`. `package-lock.json` updated to match in all three places
  npm records the name.
- **Version stays `0.1.0`.** Bumping to 1.0.0 would be a release claim this
  repository cannot support (`src/lib/version.ts` reports the channel as
  `preview` precisely because no verified release process exists).

### Added
- `scripts/test-hygiene.mjs` (5 cases): exactly one lockfile; `package.json` and the
  lock agree on name *and* version in every place npm stores them; the name is not
  boilerplate and the package stays private; no source file hardcodes a version
  string (comments excluded); CI installs with `npm ci` and never with bun.

### Verification
`npm test` → **863 pass / 0 fail** (was 858) · `npm ci --dry-run` resolves the
renamed lock cleanly · `tsc --noEmit` clean · `npm run build` ok.

## 2026-11-13 — One NOVA chat route instead of three copies (branch `arena/8a962084-asa-asan`)

Audit **m1**. `server.ts` carried three byte-identical Express handlers for
`/api/nova/chat`, `/api/openrouter/chat` and `/api/chat`.

### Fixed
- One `novaChatHandler` registered with
  `for (const path of NOVA_CHAT_PATHS) app.post(path, novaChatHandler)` — the same
  set the rate limiter already used, so the limit and the routes cannot drift.
- **The copies had already drifted.** `NOVA_CHAT_PATHS` contained a fourth path,
  `/api/nasa-ai`, that the limiter counted but nothing routed — and
  `lib/nasaApi.js#askNasaAi` calls it **first**, so every AI ask from that helper
  spent a 404 before falling back to `/api/chat`. It now answers.

### Added
- `scripts/test-nova-routes.mjs` (4 cases): all four paths are routed, answer
  identically to the same input (400 `INVALID_MESSAGES`), answer a `provider:
  'local'` request without any key or network, exactly one place calls the chat
  handler, and the limiter's list equals the tested paths.

### Verification
`npm test` → **858 pass / 0 fail** (was 854) · `tsc --noEmit` clean · `npm run build` ok · `api/index.js` rebuilt and in sync.

## 2026-11-13 — Focus trap in both mobile sheets, and a withdrawn audit finding (branch `arena/8a962084-asa-asan`)

### Fixed
- The header sheet and the mobile tab sheet are `role="dialog" aria-modal="true"`
  but let Tab walk out into the page behind. Both now use the existing
  `useFocusTrap` + `useBodyScrollLock` (the same pair `MobileDrawer` and
  `CommandPalette` already used), so focus enters the panel, wraps at both ends,
  and returns to the trigger on close.

### Corrected — audit **M5 was wrong**
`MASTER_AUDIT_REPORT.md` claimed Mars Rover Photos was "not integrated", citing
`grep -rn "mars-photos" server/` → no hits. **The grep was the bug**: the route
lives at `/api/mars/photos` (`server/marsPhotos.ts`), so the string `mars-photos`
appears only as a rate-limit key. What actually existed at the audit commit:

- `createMarsPhotosRouter()` — rover/sol/page validation, 30-min cache (80
  entries), `*.nasa.gov`-only image URLs with `api_key` stripped, malformed
  records dropped, no sample images on failure; mounted behind a 60/min limiter.
- `MarsRoverPhotos.tsx` — paging gallery with per-item camera/sol/Earth-date/rover,
  image error handling, `cached` vs `fresh` labels, full en/si/ta copy; lazy-loaded
  on the Missions tab.
- `scripts/test-mars-photos.mjs` — 3 passing cases.

M5 is marked **withdrawn** rather than deleted, with the procedural lesson written
down: an audit finding must verify its own evidence.

### Added
- `scripts/test-focus-trap.mjs` (3 cases): Tab wraps at both ends, a mid-panel Tab
  is not hijacked, focus is restored to the trigger, an inactive trap listens to
  nothing, and all four overlays pass a real panel ref. jsdom has no layout, so the
  test fakes `offsetWidth/offsetHeight` on the prototype instead of weakening the
  visibility filter in production code.

### Verification
`npm test` → **854 pass / 0 fail** (was 851) · `tsc --noEmit` clean · `npm run build` ok · `api/index.js` in sync.

## 2026-11-13 — Contrast computed from the tokens, not estimated (branch `arena/8a962084-asa-asan`)

### Added
- `scripts/test-contrast-tokens.mjs` (7 cases). It parses the **real** token files
  rather than a copy of them, so it fails when the palette drifts, and enforces:
  every ink token ≥ 4.5:1 on every surface of its palette; every accent used as
  text ≥ 4.5:1; white on `--color-ws-accent-solid` ≥ 4.5:1 in both workspace
  themes. It also re-computes the numbers printed in the `nova-tokens.css` header
  and fails if that comment and its tokens disagree.

### Measured (WCAG 2.1, `(L1+0.05)/(L2+0.05)`)

| Palette | Token | Worst surface | Ratio |
| --- | --- | --- | --- |
| science | `--color-ink` | surface-3 | 14.03 |
| science | `--color-ink-2` | surface-3 | 9.05 |
| science | `--color-ink-3` | surface-3 | 5.05 |
| science | `--color-ink-4` | surface-3 | 5.07 |
| science | tightest accent used as text (`--color-azure`) | surface-3 | 4.90 |
| workspace dark | `--color-ws-text-3` | elev-2 | 4.93 |
| workspace light | `--color-ws-text-3` | elev-2 | 4.68 |
| workspace both | white on `--color-ws-accent-solid` | — | 4.88 / 5.41 |

`--color-azure-deep` (3.53 → 2.72) is the one token below AA — it is a **fill**,
never a text colour, and the test enforces that by scanning the sources for
`text-blue-600`. White on it is 5.36:1.

### Corrected in this pass
- **The science palette has no light theme.** Only the workspace (`data-nova-theme`)
  is themed light; Explore surfaces are dark-only. The earlier changelog entry
  implied a light-theme contrast problem on science surfaces — that surface does
  not exist.
- **A focus ring already existed** in `src/styles/tokens.css` (`--focus`, an
  `outline` on `:focus-visible`). The previous commit added a second, competing
  rule in `globals.css`. It now only adds what was genuinely missing —
  `[role="button"]` and a `forced-colors` variant — and a test forbids a
  competing base rule.

### Not covered (recorded)
- Glass surfaces are translucent (`--glass-fill` is `rgba`, panels sit on
  gradients), so the effective backdrop is lighter than the token. Ratios here are
  the **token-on-token** case, which is the worst case only if the glass darkens
  the backdrop; light glass could reduce them.
- No browser: rendering, anti-aliasing and forced-colors behaviour are unverified.

### Verification
`npm test` → **851 pass / 0 fail** (was 844) · `tsc --noEmit` clean · `npm run build` ok.

## 2026-11-13 — Keyboard reachability and one focus ring (branch `arena/8a962084-asa-asan`)

Audit **m3** (Phase 5). Twelve clickable containers were pointer-only.

### Fixed
- **Real buttons**: the soundscape label (the toggle is now announced once, with
  `aria-pressed`; the equaliser bars stay clickable but are a hidden mouse-only
  duplicate), the news headline inside its `<h3>`, and the title inside the news
  card.
- **`role="button"` + `tabIndex` + Enter/Space** (via the new `activateOnKey` in
  `src/app/hooks.ts`): AR markers, AR edge guides, asteroid blips, the asteroid
  list cards, the planet globe (`aria-pressed` reflects rotation), the logo, and
  `LiquidGlassCard` when it is given an `onClick`.
- **Overlays**: Escape now closes the header drawer, the mobile tab sheet and the
  APOD lightbox (`useEscape`). Their backdrops are `aria-hidden` — they were
  clickable but not announced, and they are not controls.
- **One focus ring** for the whole app in `src/globals.css`, on `:focus-visible`
  with an `outline` (so it survives dark glass) and a `forced-colors` variant for
  Windows high-contrast mode. Nothing global existed before.

### Added
- `scripts/test-a11y-controls.mjs` (7 cases) encodes the rule rather than the
  patches: an element with an `onClick` must be a real control, carry
  role+tabIndex+key handler, or be explicitly `aria-hidden`. It also includes a
  "guard against the guard" case, checks `activateOnKey` behaviour, and asserts
  the focus-ring CSS and the Escape wiring.

### Not done (recorded, not hidden)
- The custom components the scanner cannot see through (`IconButton`, `Section`,
  `ErrorBoundary`, …) are skipped by name; their internals are not verified.
- The two drawers close on Escape but do not trap focus; `MobileDrawer` and
  `CommandPalette` already do, so this is a known gap in `AppHeader`/`MobileTabBar`.
- Contrast was not measured; the light theme's `text-ink-3` on glass still needs a
  real contrast check in a browser.
- A few `aria-label`s are English-only in otherwise localised components.

### Verification
`npm test` → **844 pass / 0 fail** (was 837) · `tsc --noEmit` clean · `npm run build` ok.

## 2026-11-13 — NASA proxy caching and client request timeouts (branch `arena/8a962084-asa-asan`)

### Added
- `server/ttlCache.ts` — a bounded TTL cache with an injectable clock, no timers,
  and no stale-while-error: an expired entry is deleted, so a later upstream
  failure is still reported as a failure.
- `/api/asteroids/neows` (10 min, keyed by date range, 40 entries),
  `/api/epic` (15 min, 4) and `/api/exoplanets` (24 h, 2) now answer from that
  cache. Every response carries `cached` and `fetchedAt` — the time the value was
  really fetched — plus `Cache-Control: public, max-age=<remaining>`.
- `scripts/test-nasa-cache.mjs` (12 cases): TTL boundary, eviction, overwrite,
  explicit timestamps, honest fresh/cached labelling, per-date-range keys, an
  outage never served from cache, EPIC caching, and the two client helpers.

### Fixed
- **The `/api/*` `no-store` default overwrote a route's own `Cache-Control`.** The
  middleware now only applies `no-store` when the route has not set the header.
- **Two client helpers had no timeout** (`lib/nasaApi.js` → `/api/satellites`,
  `/api/news`). A stalled request left a spinner up forever; both now carry
  `AbortSignal.timeout(15s)` and resolve to an empty list / clearly labelled
  sample items.

### Verification
`npm test` → **837 pass / 0 fail** (was 825) · `tsc --noEmit` clean.

Limitation recorded rather than hidden: the cache is **per instance**, so N
serverless instances still fetch once per TTL each.

## 2026-11-13 — NOVA diagnostics: evidence before explanation; device-only chats (branch `arena/8a962084-asa-asan`)

### Changed
- **The Gemini diagnostic hint no longer guesses.** It asked what the key can
  actually call *before* deciding what to say, and reports `modelListed`:
  - model listed for the key but the call 404s → "access or API-version
    restrictions on this key or project", which is what production's 48-listed-
    models-yet-404 shape actually means;
  - model absent from the key's list → names `NOVA_GEMINI_MODEL` and points at
    `availableModels`;
  - list unreadable → stays hedged ("failures may have different causes").
  No path claims quota or billing any more.
- **Fallbacks are ordered by what the key can see.** An id the key does not list is
  tried after the ones it does, so a wasted round trip no longer comes first. The
  configured id is still tried exactly once.

### Added
- **"Keep chats on this device"** (`src/workspace/chat/chatStorage.ts`): a real
  switch in Settings. When on, chat reads and writes the device store even while
  signed in, an open surface switches immediately, and the rail says
  "Chats stay in this browser and are not saved to your account". Turning it off
  returns to syncing; nothing is deleted either way.
- Chat rail: a signed-in reader with device-only enabled now gets the same honest
  banner a signed-out reader sees, instead of no banner at all.

### Verification
`npm test` → **825 pass / 0 fail** (was 819; +4 diagnostics, +1 chat, +1 settings) ·
`tsc --noEmit` clean. New cases: listed-but-404 blames access (and never quota),
absent-from-list names the variable, listed ids are probed first, unreadable list
stays hedged, device-only beats a cloud session, the settings switch persists.

## 2026-11-13 — Lazy locale bundles, CI verification (branch `arena/8a962084-asa-asan`)

### Changed
- **Trilingual resources are now split by language.** `src/i18n/{en,si,ta}/` hold
  one language each (nine dictionaries plus the former inline base dictionary);
  `src/i18n/<name>.ts` stays as the three-language aggregator the parity suites
  read; `src/i18n.ts` imports English statically and dynamic-imports Sinhala and
  Tamil. `i18n.changeLanguage` is wrapped so every existing call site keeps
  working, and `src/main.tsx` awaits the stored preference before first paint so a
  returning Sinhala/Tamil reader never sees an English flash.
  Measured: entry chunk **245.83 → 170.25 kB gzip (−31 %)**, `si` 37.3 kB and `ta`
  37.8 kB fetched only when selected. The data was verified byte-identical before
  and after the move.

### Added
- `.github/workflows/verify.yml` — `npm ci`, typecheck, the full suite, production
  build, an `api/index.js` drift check and `npm audit --audit-level=high`. No
  secrets, no deploy step.
- `npm run check:bundle` — the same drift check locally.
- `package-lock.json` is committed so `npm ci` is reproducible.

### Updated for the async locale contract (no assertion removed)
`scripts/test-workspace-shell.mjs`, `scripts/test-workspace-home.mjs`,
`scripts/test-forge-ui.mjs` and `scripts/i18n-audit.mjs` now load the language
bundles before comparing them; the Forge test reads the per-language modules
instead of one file.

### Fixed after CI exposed it
- `scripts/test-apod-media.mjs` asserted that a live `api.nasa.gov` request fails.
  That is true in this sandbox (egress blocked) and false on a runner with
  internet, where the route legitimately recovers an official NASA Science record
  and answers 200. Both upstreams are now stubbed, so the test proves the "no
  fabricated cache hit" contract instead of the network. Found by CI run
  43417395210; CI run 43418607086 is fully green (9/9 steps).

### Verification
`npm test` → **819 pass / 0 fail** · `tsc --noEmit` clean · `npm run build` exit 0 ·
`npm run check:bundle` reports the bundle in sync · language switching exercised
directly against i18next (`si`/`ta`/`en`) · GitHub Actions `Verify` workflow green.

## 2026-11-13 — COSMORA API Guardian, Phase 1 re-audit, bounded request limiting (branch `arena/8a962084-asa-asan`)

### Added
- **COSMORA API Guardian** (`server/guardian/`, 11 modules + migration): one store
  contract with `MemoryStore` and `PostgresStore` adapters; fleet circuit breakers
  with a single half-open trial; fleet rate limits below provider quotas; TTL lease
  so overlapping sweeps cannot double-spend; 13-provider coverage where the AI
  probes reuse `novaDiagnostics`; idempotent recovery actions that verify
  themselves and never rotate credentials; constant-time admin/cron auth that fails
  closed; secret scrubbing; an append-only audit table enforced by a trigger.
- `/guardian` dashboard (`src/workspace/guardian/GuardianSurface.tsx`,
  `src/styles/guardian.css`), 45 i18n keys in en/si/ta, route + nav wiring.
- `supabase/migrations/20261112000000_guardian.sql` — **written, not applied**.
- `server/requestRateLimit.ts` — the API's coarse limiter, extracted so it can be
  tested; per-limiter stores, self-pruning, hard cap.
- `scripts/test-request-rate-limit.mjs` (9 tests), `scripts/test-guardian-*.mjs`
  (56 tests), `README.md`, `.env.example` coverage for Guardian/LIFE/analyst/Forge.

### Fixed
- **`npm start` crashed.** `node server.ts` cannot transform TypeScript parameter
  properties (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`); it is now `tsx server.ts`, and
  `docs/NOVA_INSTALLATION_GUIDE.md` no longer claims Node strips types on 22.
- **The rate-limit store grew without bound** and the NOVA limiter was constructed
  inside a request handler (it only worked because the bucket map was module-level
  shared state). Both fixed and pinned by tests.
- **Stale verification record.** `docs/TEST_RESULTS.md` reported 704 tests and an
  888 KB entry while the tree had 810 and 239 kB gzip; the Guardian appeared in no
  status document. All three now reflect a real run.

### Verification
`npm test` → **819 pass / 0 fail** (67 scripts) · `tsc --noEmit` clean ·
`npm run build` exit 0 · `npm start` + `/api/health` 200 · `api/index.js`
byte-identical to a fresh esbuild · Guardian endpoints smoke-tested on the mounted
app (13 providers, memory store with its reason, 503/403 when locked).

### Not verified
Live NASA/Gemini/OpenRouter/Supabase traffic, the Guardian SQL migration, and
browser rendering. No deployment setting was changed.

## 2026-11-12 — Phase 1 audit + the two critical integrity fixes (branch `arena/ad469a17-asa-asan`)

### Added
- `docs/audits/MASTER_AUDIT_REPORT.md` — repository-wide audit with 20 findings,
  severity, priority, complexity and the commands whose output backs each claim.
- `server/nasaImageLibrary.ts` — adapter for the public NASA Images API
  (`images-api.nasa.gov`): https + exact-host allowlist, argument validation,
  6 s timeout, 5-minute TTL cache (100 entries), shape validation that drops rows
  without a real `nasa_id`/`title`, and attribution in every payload.
- `scripts/test-solar-weather.mjs` (5), `scripts/test-solar-weather-dom.mjs` (3),
  `scripts/test-nasa-archive.mjs` (10), `scripts/test-nasa-archive-client.mjs` (4)
  — 22 tests, wired into `npm test` through the new `npm run test:nasa`.
- `clearNasaImageCache()` and `clearNasaApiCache()` test seams (both process-wide
  caches; the tests exercise several upstream states in one process).

### Fixed
- **Invented space weather.** `/api/solar-weather` answered a NOAA outage with
  `{ kpIndex: 2, status: 'quiet' }` and `success: true`, which the panel rendered
  as a live "NOAA SWPC feed". The route now parses NOAA's `planetary_k_index.json`
  and `plasma-7-day.json`, keeps the last *measured* sample in memory, serves that
  sample with `stale: true` and its original `fetchedAt` when the upstream fails,
  and answers **503 `UPSTREAM_UNAVAILABLE`** when it has never measured anything.
  Files: `server/nasaRoutes.ts` (`parsePlanetaryKIndex`, `parsePlasmaSpeed`,
  `kpStormScale`, `lastKnownSolarWeather`).
- **Solar weather panel labelling.** `src/components/SolarWeather.jsx` had four
  display states collapsed into two, so a stale or sample value could be labelled
  "NOAA SWPC feed". It now distinguishes `loading | live | stale | sample`, prints
  the observation time, labels a bundled value "(not measured)", and shows
  "not reported" instead of borrowing a solar-wind number it does not have.
  `lib/nasaApi.js` normalises the new payload and marks an outage `_unavailable`.
- **Fabricated NASA archive.** `/api/nasa-archive` served thirteen hardcoded
  records with synthesised NASA IDs (`ARTEMIS-ORION-CREW-2025`,
  `JWST-EARLY-COSMOS-2026`, …) and Unsplash stock photos, which
  `src/components/NASANewsExplorer.jsx` printed as "NASA ID" and deep-linked to
  images.nasa.gov. The 212-line catalogue is deleted; the route now performs a real
  NASA Images search, requires a term, returns `source`/`fetchedAt`/`cached`, and
  answers `503 UPSTREAM_UNAVAILABLE` on an outage.
- **Archive UI.** `NASANewsExplorer.jsx` now renders an explicit "NASA Images is
  unreachable" state with a retry button, shows the live source and retrieval time,
  and links to the real `detailsUrl`. `lib/nasaApi.js` `fetchNasaArchive` returns
  `success: false` on failure instead of an empty successful list (which used to
  render the neutral "no results" state for an outage).
- **Dead code carrying invented identifiers.** Removed `fetchMarsPhotos`,
  `searchNasaMedia`, `MOCK_MARS_PHOTOS_FALLBACK` and `MOCK_NASA_MEDIA_FALLBACK`
  from `lib/nasaApi.js`. They had no callers, called `api.nasa.gov` directly from
  the browser with a hardcoded `DEMO_KEY`, and generated `nasa-${Math.random()}`
  identifiers. Mars Rover imagery comes back as a server-side adapter in the
  Phase 3 work (audit finding M5) rather than as a client-side mock.

### Follow-up after the first production deploy (same day)
- **Live archive verified.** Production `/api/nasa-archive?q=artemis&limit=2`
  returned real records (15 260 hits, `nasaId` values such as
  `Artemis Logo Color Positive RGB-July 2021`, `images-assets.nasa.gov`
  thumbnails, `detailsUrl` on images.nasa.gov). Confirmed from
  `https://nasa-space-expolere.vercel.app` on 2026-11-12T10:52:30Z.
- **Space weather still returned `UPSTREAM_UNAVAILABLE` in production**, which was
  correct behaviour but the wrong outcome: SWPC publishes the same product in two
  shapes and the parser only accepted the array form. `parsePlanetaryKIndex` now
  accepts both `products/noaa-planetary-k-index.json` (header + rows) and
  `json/planetary_k_index.json` (objects with `kp_index` / `estimated_kp`), tries
  both URLs in order, and prefers the official `kp_index` over the preliminary
  estimate. Rows with no Kp are still discarded, never read as calm.
- **Thumbnail encoding.** Real NASA ids contain spaces
  (`Artemis Logo RGB`), so preview URLs are now `encodeURI`-ed before they reach
  `<img src>`.

### Live verification (end to end, production)
- `GET /api/nasa-archive?q=artemis&limit=2` → real records, 15 260 hits, real ids
  and `images-assets` thumbnails (2026-11-12T10:52:30Z).
- `GET /api/solar-weather` → real observation: Kp 1.67, `observedAt`
  2026-11-12T06:00:00Z, `stormKey` G0, `fetchedAt` 2026-11-12T11:02:48Z,
  `stale: false` (commit `71d1a80`). The plasma feed returned nothing in that call,
  so `solarWindSpeedKmS` is `null` and the panel says "not reported".
- Lesson recorded for operators: an identical URL can be answered from the edge
  cache, so a route that *looked* broken was returning a cached body. Use a
  cache-busting query when verifying a function.

### Verification
- `npm test` → **704 pass / 0 fail** (was 682; +22 from the new suites).
- `npm run lint` (`tsc --noEmit`) → clean.
- `npm run build` → exit 0, 158 precache entries, entry chunk 888 KB (the build
  still warns that it exceeds 500 KB; see audit finding T3).
- `scripts/api-routes.mjs` updated: `/api/nasa-archive` now expects `400` without a
  query and `[200,502,503,504]` with one.

### Not done in this change
- Live verification of the NASA Images API and NOAA SWPC from this environment
  (outbound access is restricted to package registries and GitHub). Both adapters
  are covered by injected-fetch tests; their live behaviour is unverified here.
- Gemini generation remains unavailable in production (audit finding M1) — the
  diagnosis needs a live key.

## 2026-11-12 — POWER proxy follow-up

- `server/earthIntelligence.ts`: cache POWER requests using the same four-decimal
  coordinate precision sent upstream; reject empty/repeated numeric parameters and
  fractional POWER years; derive rate-limit identity from Express's `req.ip`
  instead of an untrusted forwarded header.
- `scripts/test-earth-server.mjs`: added regressions for cache separation, input
  validation and forwarded-header spoofing. `api/index.js` regenerated by build.
- Updated the master audit and the architecture, API status, test and limitation
  reports. No deployment or production configuration changes.

## 2026-11-12 — Earth data integrity and PWA follow-up

- `src/lib/earth/power.ts`: reject missing and nonnumeric monthly values rather
  than converting them to zero; retain real zeroes; use versioned four-decimal
  browser cache keys; preserve upstream retrieval timestamps on cache hits; show
  requested parameters omitted by fallback as unavailable.
- `server/earthIntelligence.ts`: reject malformed successful POWER JSON instead
  of caching it; health reports remote analyst configuration for OpenRouter and
  Arena as well as Gemini without claiming the provider is healthy. API bundle
  regenerated in `api/index.js`.
- `vite.config.ts`: exclude POWER proxy responses from generic Earth service-worker
  caching and limit long-lived imagery cache to image requests, avoiding silent
  long-lived caching of NASA JSON. Other offline caching remains in place.
- Regression tests added in `scripts/test-earth-intelligence.mjs`,
  `scripts/test-earth-server.mjs`, and `scripts/test-security-performance.mjs`.

## 2026-11-12 — NeoWs and EPIC integrity

- `server/nasaRoutes.ts`: NeoWs no longer returns invented current close-approach
  records on failure; malformed feeds and outages return `503 NEOWS_UNAVAILABLE`.
  EPIC outages similarly return `503 EPIC_UNAVAILABLE` rather than fabricated
  frames; live frames omit absent centroid, position and distance metadata rather
  than inventing it.
- `lib/nasaApi.js`: rejects legacy server sample responses (and avoids caching
  them); NeoWs still tries its direct public fallback. EPIC returns an empty list
  when unavailable and now has a request timeout.
- `src/components/AsteroidRadar.jsx`: uses seven inclusive UTC dates, rejects
  incomplete measurements, removes mock outage data/automatic sample alerts,
  displays an unavailable state, labels the app's screening separately from NASA
  PHA designation, and marks simulated alert notices as tests.
- `src/components/EPICViewer.jsx`: no synthetic image or telemetry on outages;
  disabled empty playback, trilingual unavailable message and signed centroid
  coordinates. J2000 position values no longer get divided by 1,000 in display.
- `scripts/test-neows-integrity.mjs` adds stubbed outage, fallback and response
  checks and is included in `test:api-routes`; `api/index.js` regenerated.

## 2026-11-12 — APOD, Exoplanet Archive and ISS follow-up

- `server/nasaRoutes.ts` and `lib/nasaApi.js`: APOD and exoplanet outages no
  longer substitute unverified examples; return explicit 503 JSON at the proxy
  and empty/error state in clients. APOD validates dates, rejects mismatched
  records and no longer overwrites the today cache with a historical request;
  range requests validate dates and cannot generate synthetic entries.
- `src/components/ApodViewer.tsx`: ignore stale asynchronous responses after a
  newer date is requested. Existing image/video playback logic remains intact.
- `src/components/ExoplanetLab.jsx`: absent measurements and ESI show N/A, no
  guessed facility/date/distance/temperature, and procedural appearance and
  clamped display scale are explicitly labelled as illustrative. Added empty
  state and disposal of generated textures.
- `server/nasaRoutes.ts`, `lib/nasaApi.js`: ISS proxy no longer initializes a
  fabricated current fix; validates upstream fields, preserves observation time,
  and marks a last-known fix as stale. The client never treats the server's stale
  response as live and normalizes seconds/milliseconds.
- `src/components/ISSTracker.jsx`, `components/IssTracker2D.jsx`: removed
  unvalidated pass-time/countdown and visibility claims; retained station
  selection and ground-distance display, with explanatory notices. Corrected
  misleading SGP4 labeling. Existing approximate simulated tracking remains
  explicitly labelled; a real pass-prediction capability is still outstanding.
- `scripts/test-neows-integrity.mjs`, `scripts/test-apod-media.mjs`,
  `scripts/test-api-routes.mjs`, `scripts/test-workspace-dom.mjs`: added or
  updated regressions. `api/index.js` regenerated by build.

## 2026-11-12 — NOVA conversation and translation integrity

- `server/nasaRoutes.ts`: removed the keyword-based translation fallback that
  appended unrelated scientific claims. Invalid input is rejected; missing,
  failed, or malformed Gemini translations return `TRANSLATION_UNAVAILABLE` so
  clients retain the original. Cache keys hash the complete input and language,
  and the cache is capped at 200 successful entries. Successful responses carry a
  provider field; no key is returned.
- `server.ts`: added a per-process rate limit for translation calls.
- `lib/nasaApi.js`: translation client checks the provider field and keys its
  cache on full content, rejecting old unlabelled fallback replies. The legacy
  `askNasaAi` fallback now uses the existing local knowledge engine rather than
  inventing NASA telemetry; unknown remote provider metadata is not guessed.
- `src/workspace/chat/chatClient.ts`: history now fits the server's 12-message,
  per-message and byte limits, preserves the latest user turn, and accounts for
  JSON escaping. Oversized current turns still produce the server's error.
- Added `scripts/test-translation-chat.mjs`, included in `test:api-routes`;
  `api/index.js` regenerated by build. Existing NOVA provider routing is retained.

### Mars rover imagery follow-up

- Added `server/marsPhotos.ts` and rate-limited `/api/mars/photos` mounting;
  validated inputs and NASA image hosts, bounded the in-process cache, and return
  explicit upstream failures rather than sample data.
- Added `src/components/MarsRoverPhotos.tsx` to Missions with en/si/ta controls,
  source, retrieval time, cached state, pagination and retry. Labelled the
  existing Mars image tagger's stock image and annotations as illustrative.
- Added `scripts/test-mars-photos.mjs` to `test:api-routes`; regenerated
  `api/index.js` via the production build. No deployment was performed.

### News feed integrity follow-up

- `lib/nasaApi.js`: read `/api/news` `items` and version the in-memory cache;
  labelled legacy sample fallback remains available to other callers.
- `src/components/NasaNewsFeed.jsx`: do not consume legacy IndexedDB cache or
  sample fallback, use provider names, real dates and image URLs when available,
  retain original text on translation failure, and fix translation busy-state
  cleanup. APOD outages are visible and video is not rendered as an image.
- Added `scripts/test-news-feed-integrity.mjs` to `test:api-routes`. No deployment.

### News status follow-up

- Added `fetchSpaceNewsStatus` with timeout, shape validation, bounded lifetime
  cache, empty/error distinction and partial-provider status; preserved the legacy
  `fetchNasaNews` array contract.
- Feed now displays multilingual failure/retry, empty/search and partial-source
  states. Explicit refresh bypasses its client cache, and request sequence guards
  prevent older news requests from overwriting newer results.
- Expanded news integrity tests with structured-result and jsdom retry flows.

### News rate limiter / proxy trust security audit (2026-11-12)

- `server/spaceNews.ts`: use Express-resolved `req.ip` (socket fallback) rather
  than directly trusting `X-Forwarded-For` for both news and papers. Isolated
  bucket state per router and reset a fixed window at its exact boundary.
- `scripts/test-space-news.mjs`: cover spoofed forwarding headers, separate
  route limits, simulated trusted proxy chain and window reset.
- `scripts/test-security-performance.mjs`: assert the real Express app leaves
  proxy trust disabled by default. Rebuilt the tracked `api/index.js` bundle.
- No trust policy, production configuration or deployment was changed.

### Live verification and diagnostic honesty — 2026-11-12

- Ran user-authorized production read-only smoke checks and one deep diagnostics
  request; results and limitations are in `docs/API_STATUS_REPORT.md`.
- `server/novaDiagnostics.js`: stop asserting all Gemini failures share a cause,
  or that a 404 proves an invalid model ID; retain compatible response fields.
- `src/i18n/workspaceCopy.ts`: make provider metadata, model-list and fallback
  status copy appropriately qualified in English, Sinhala and Tamil.
- Added a mixed-status diagnostic regression and updated workspace copy assertions;
  regenerated `api/index.js`. No production deployment/settings changed.

### Forge rate limiter follow-up — 2026-11-12

- `server/forgeRoutes.ts`: replace direct forwarded-header trust with Express IP
  resolution and align fixed-window expiry to the boundary. Existing endpoint
  budgets, response codes and per-router state are preserved.
- `scripts/test-forge-api.mjs`: cover forged headers on all four routes, local
  trusted proxy chain resolution and fixed-window reset. Rebuilt `api/index.js`.
- No production configuration change or deployment was performed.

### NASA Mars imagery exploration — 2026-11-12

- Added `src/components/MarsArchiveExplorer.tsx` to Missions, separately from the
  existing sol-based rover gallery. It uses the existing `/api/nasa-archive`
  route for NASA Images searches by rover name, including Perseverance, and
  displays source, record date, center, NASA ID, retrieval time, paging, error
  and retry states, with multilingual source/interpretation warnings.
- `server/nasaImageLibrary.ts` now rejects malformed collection item arrays and
  missing/invalid total hit counts rather than fabricating an empty/partial total.
- Added jsdom search, paging, failure/retry and unsafe-link coverage in
  `scripts/test-mars-archive-dom.mjs`, included in `test:nasa`. No deployment.

### NASA archive validation and APOD outage navigation — 2026-11-12

- `server/nasaRoutes.ts`: parse archive `q`, `year`, `page` and `limit` as
  scalar, valid values instead of silently accepting partial or malformed input.
- `src/components/ApodViewer.tsx`: make the selected date's NASA record link
  available when APOD data is unavailable; retain retry and no fabricated fallback.
- Added archive route validation tests and `scripts/test-apod-unavailable-dom.mjs`
  to `test:apod`; production bundle regenerated, no deployment performed.

### APOD NASA Science recovery — 2026-11-12

- Added `server/apodScience.ts`: date-matched, NASA-host-restricted image-article
  and featured-media lookup as an additive fallback when the legacy APOD API
  fails or returns the NASA logo. Unverifiable/video records remain unavailable.
- `server/nasaRoutes.ts`: integrate fallback with existing cache and reject
  degraded/out-of-range range entries. Existing endpoint shapes are retained.
- `lib/nasaApi.js`, APOD viewer, news, home and workspace: preserve and label the
  alternative source and point users to the original record for credits. Client
  timeouts were increased for the additional bounded upstream requests.
- Added stubbed `scripts/test-apod-science.mjs` to `test:apod` and regenerated
  `api/index.js`. No production settings or deployment changed.
