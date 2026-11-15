# COSMORA — improvement plan

Status: **living document.** Audit taken 2026-11-14 against `main` @ `63d03da`
(branch `arena/46e05931-asa-asan`). Every claim below was read or run, not assumed.

The brief asks for a premium astronomy/Earth-intelligence platform under one Liquid
Glass design system, with the existing engines preserved. This document records
what the codebase actually contains, what is genuinely broken, the order the work
should happen in, and the decisions that need a product owner (not a checkbox).

---

## 1. What the audit found

| Area | Reality today |
| --- | --- |
| Size | 260 source files, ~73 kLOC of TS/TSX/JSX, ~12.6 kLOC of CSS across 7 stylesheets, 98 test scripts. |
| Architecture | React 19 + Vite, a hand-written history router (`src/app/router.tsx`), Express API mounted as one Vercel function (`api/index.js`, 30 s cap), i18next with English/Sinhala/Tamil dictionaries loaded per language. |
| Test suite | 932 assertions across 98 scripts; `npm test` is green on `main`. There is no browser in this environment, so DOM behaviour is proven in jsdom and never in pixels. |
| Design system | Two layers: `src/styles/tokens.css` (colour/type/space tokens) and `nova-tokens.css`. 41 glass-related declarations exist, but they are ad-hoc (`.liquid-glass`, `surface-highlight`, `cv-*`, `ws-*`). There is **no single glass primitive**; each surface re-invents blur, border and highlight. |
| Branding | The product calls itself *NASA Space Explorer* in the UI and *NOVA* for the assistant; **COSMORA** currently names only the API Guardian dashboard. A rename is therefore not a find-and-replace: it touches the PWA manifest, OG images, document titles, 3 language dictionaries and the tests that assert those strings. |
| Earth Intelligence Lab | The POWER pipeline (`src/lib/earth/power.ts`) is real: server proxy → public service → labelled cache, with provenance. Charts are recharts and were **silently wrong** (see §2). |
| AI Earth Viewer | Already exists (`AiEarthViewer.tsx`, GIBS catalog + client, upscaling). NASA POWER is a separate module as the brief requires. |
| NOVA AI | Real engine behind OpenRouter/local fallback; Gemini generation is refused by the vendor (measured, `docs/API_STATUS_REPORT.md`). Chat UI lives in `src/workspace/chat/`. |
| Space features | APOD, DONKI/solar weather, NeoWs + JPL fallback, Mars rover, ISS, Space Shorts/CosmoVision (with a real Liquid Glass player), AR viewer, rocket simulator all present and reachable. |

**Conclusion:** this is not a greenfield rebuild. The value is in (a) correctness
defects that no test caught, (b) one glass system instead of forty one-off rules,
(c) consistent loading/empty/error states, and (d) the brand. Rewriting the engines
would destroy working behaviour the brief explicitly protects.

---

## 2. Correctness defects found (and what was done)

| Defect | Why it mattered | Status |
| --- | --- | --- |
| NEO tile aborted at 15 s while `/api/asteroids/neows` may take 20 s | A successful JPL answer was discarded and the tile said UNAVAILABLE. | **Fixed** — `NEOWS_CLIENT_BUDGET_MS = 26_000`, asserted against the server's own constants. |
| No retry anywhere; one dropped request was permanent | A blip became a dead page until the reader reloaded. | **Fixed** — bounded `withRetry` (never retries a caller abort), opt-in per resource. |
| A failed home tile said only "UNAVAILABLE" and kept no history | NASA POWER was the only tile that survived a bad connection, because it was the only one with a cache. | **Fixed** — `withLastKnown` + typed `HomeApiError` + per-tile retry + honest reason text. |
| Service worker cached the three tile endpoints (`NetworkFirst`) | A stale or poisoned entry could turn a healthy endpoint into a visible failure, and a fetch that fails inside a worker is indistinguishable from a dead network. | **Fixed** — `NetworkOnly` for `/api/apod`, `/api/iss`, `/api/asteroids/neows`. One cache, and it labels what it serves. |
| POWER dual-axis chart declared two `<YAxis>` without `yAxisId` | Recharts defaults every axis to `0`, so the precipitation axis belonged to nobody and its series was drawn against the temperature scale and clipped. The chart looked empty, not broken. | **Fixed** — axes bound to ids 0/1, precipitation drawn as bars. |
| Precipitation series filled with `url(#earthMonthlyFillPrecip1)`, a gradient that did not exist | SVG paints an unresolvable paint server as nothing: the series was invisible even after the axis fix. | **Fixed** — real gradient defined. |
| `/space-shorts` documented as working, actually a 404 | Docs and a smoke test promised a route the router never had. | **Fixed** — alias resolves to CosmoVision and canonicalises to `/cosmovision`. |

`scripts/test-chart-contracts.mjs` now guards both chart defect classes from the
source, because a jsdom render has no layout and would pass vacuously. The test was
verified by reintroducing the bug: it fails on exactly the two assertions that
describe it.

---

## 3. Phases

Each phase ends with `npm test`, `npx tsc --noEmit`, `npm run build`,
`npm run build:api`, `npm run check:bundle` green, and a short written result.
Phases are ordered so that correctness precedes styling: a beautiful page that
lies about its data is worse than an ugly one that does not.

### Phase 1 — Design foundation (no visual regressions)
1. One glass primitive: `src/ui/Glass.tsx` + `.glass` / `.glass-inset` /
   `.glass-strong` in a single stylesheet, built from the existing tokens
   (`--surface`, `--line`, blur, specular highlight, 1 px inner border).
2. Motion tokens: three durations and two easings, `prefers-reduced-motion`
   honoured globally. No animation that carries meaning is skippable.
3. Audit every `backdrop-blur` in the app and migrate it to the primitive, so the
   glass reads identically on Home, Explore, Earth Lab, workspace and the Guardian.
4. Acceptance: `scripts/test-design-tokens.mjs` asserts no raw `backdrop-blur-*`
   utility survives outside the primitive; build size does not grow.

### Phase 2 — Brand: COSMORA  · **done (text layer, 2026-11-15)**

Delivered: product name in the document title, manifest, header, footer, install
prompt, welcome screen, the three language dictionaries, report exports, the
analyst's system instruction and the server's startup banner. NOVA remains the
assistant's name — "ask NOVA" still means something. Guarded by
`scripts/test-brand.mjs`, which also asserts NASA is credited as the source on
every surface that names the brand.

Not delivered: the binary artwork (OG image, lockup, icons) still carries the old
wordmark — see `docs/BRAND_ASSETS.md`. That needs new artwork, not code.

Original plan follows.

Rename in one pass, with the decisions in §4 answered first:
- UI strings (3 dictionaries), `<title>` templates, PWA manifest, OG/lockup assets,
  Guardian already says COSMORA so it becomes consistent rather than a special case.
- Keep "NASA" as the *data source*, never as the product name — the platform is an
  independent interface and says so.
- Acceptance: no remaining user-visible "NASA Space Explorer"; tests updated in the
  same commit so the suite is never red across the rename.

### Phase 3 — Earth Intelligence Lab
- Chart: tick density, unit-aware axes, gaps shown as gaps (`connectNulls={false}`
  already), an explicit "incomplete month" marker where POWER returns partial data.
- Insights: the descriptive statistics already exist in `lib/earth/analysis.ts`;
  surface them as 3 sentences a scientist would accept (trend, significance,
  limitation) with the retrieval date attached.
- Location selection: keyboard-first gazetteer search, recent places, coordinates
  validated before a request.
- Acceptance: no request is issued for an unchanged selection; every panel has
  loading, empty, partial and error states with a reason.

### Phase 4 — AI Earth Viewer
- GIBS date/layer controls with honest availability (the catalog already reports it).
- Keep `lib/earth/power.ts` untouched, as the brief requires.
- Acceptance: imagery requests are cancelled on layer change; provenance panel
  names layer, date and provider for whatever is on screen.

### Phase 5 — NOVA
- Streaming states, retry with the same bounded policy, per-message error recovery
  that keeps the draft.
- Trilingual UI copy verified for every new state.
- Acceptance: a failed turn never loses the user's text and never claims an answer.

### Phase 6 — Space surfaces
- APOD/DONKI/NeoWs/Mars/ISS/CosmoVision/AR/rocket: shared loading/empty/error
  primitives, keyboard paths, and the glass primitive applied.
- Acceptance: each surface states its source and retrieval time; no surface shows
  a spinner without a timeout story.

### Phase 7 — Verification
- Full suite, production build, `check:bundle`, Lighthouse-style budgets from the
  existing `check:pwa` output, and the accessibility checks already in
  `scripts/` (axe runs in jsdom, not pixels — stated, not implied).

---

## 4. Decisions needed (not engineering calls)

1. **Brand scope.** Rename the product to COSMORA everywhere (UI, manifest, OG
   image, titles, docs, tests), or keep the current name in the page title for SEO
   and introduce COSMORA as the product mark only? The second is reversible; the
   first is a one-way door for indexed pages and shared links.
2. **The domain question.** The deployed alias is `nasa-space-expolere.vercel.app`.
   Any rename should land with its own domain, otherwise the name and the URL
   disagree in every share preview.
3. **Visual direction.** Liquid Glass is specified, but "premium" needs a
   reference: Apple visionOS-like translucency over imagery, or a darker NASA
   Mission Control instrument panel? The existing tokens lean the second way; the
   CosmoVision player leans the first. One has to win.
4. **Scope of "fix the charts".** The two silent defects above are fixed. If the
   reported problem was visual rather than numerical, a screenshot of the broken
   state is worth more than another guess.

---

## 5. What not to touch

- `server/nasaRoutes.ts`, `server/spaceVideos.ts`, `lib/earth/power.ts`: working,
  budgeted, and covered by tests. Improve their presentation, not their contracts.
- The YouTube IFrame engine in `features/space-shorts`: official API, lazy load,
  retry and fallback. Only the surrounding chrome may change.
- The NOVA engine and its provider order.
- Any test that pins an honesty rule (`Label: Live/Cached/Derived`, "no fabricated
  values"). New UI must satisfy them, not bypass them.
