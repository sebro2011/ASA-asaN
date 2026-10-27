# NASA Space Explorer — UX Simplification & Feature Audit

**Date:** 2026-10-27 · **Branch:** `arena/1fa55716-asa-asan` · **Baseline commit:** `253e286`
**Method:** static evidence from the actual repository (import graph, line counts, dependency manifest, build output, CSS). No usage analytics exist in this project, so every claim about user behaviour is marked as an **assumption to validate**, never asserted as fact.

---

## 1. How the application is structured

There is no URL router. `src/App.tsx` is a tab-state SPA with **14 destinations** (`TabId` in `src/ui/navigation.ts`), grouped into four menus — Explore, Earth, Solar System, Assistant — plus Home. Phones get a 4-item bottom bar (`Home / Earth / NOVA / Saved`) with everything else behind a "More" sheet. All destinations except Home/APOD are `React.lazy` chunks behind one `Suspense` boundary and an `ErrorBoundary`.

Two parallel source trees exist:

| Tree | Status |
|---|---|
| `src/` (Vite entry: `index.html → src/main.tsx`) | **Live application** |
| Root-level `components/ lib/ hooks/ utils/ context/ app/ api/` | Legacy Next.js-style scaffold. Only **6 files are reachable** from the Vite build (see §6); the rest are dead shims that re-export back into `src/`. |

Live cross-tree edges (must never be broken): `@/lib/nasaApi` (alias `@` → repo root, 10 importers), `src/lib/dbCache.js` → root `lib/dbCache.js`, and four `src/components/*.jsx` shims → root `components/{CosmicCalendar,IssTracker2D,RocketLaunchSimulator,AaaRocketLaunch}.jsx`.

---

## 2. Route-by-route audit

| # | Destination (root component, lines) | What the user gets | Evidence-based observations |
|---|---|---|---|
| 1 | **Home** (`pages/home/*`, ~980 LOC) | 3D hero (lazy, poster fallback), SignalStrip (4 service tiles), MissionOverview (ISS/NEO/APOD panels), EarthPreview, Discovery directory (6 cards), NOVA CTA | ISS/NEO/APOD figures appear **twice** (strip + overview). One hero primary CTA — good. Two `#mission-overview` anchor buttons plus a tertiary text link = 3 hero actions. |
| 2 | **APOD** (`ApodViewer.tsx` 473 + `CustomApodDatePicker` 361 + `APODStoryteller`) | Daily image, date archive, storytelling, export | Well-bounded; all three children are used. Keep. |
| 3 | **3D Space Lab** (`Space3DViewer` 149 → `SpaceLab3D` 854 / `CelestialLab3D` 1002 / `ARStarMap` / `SpacecraftViewer` + `ARPlanetViewer`) | Internal sub-tabs (Focused/Full/Star map/Spacecraft), device-performance Eco/WebGL toggle, AR | Progressive disclosure already good. Hardware bar uses hardcoded `lang==='si'` strings and jargon ("ECO PARALLAX (N CORES)"). `apple-liquid-glass` styling differs from the token design system. |
| 4 | **Near-Earth Objects** (`AsteroidRadar.jsx` 1476) | NeoWs feed, risk badges/gauge, planetary-defence context | Mandatory feature. Large single component; no audit-driven change proposed. |
| 5 | **EPIC Earth** (`EPICViewer.jsx` 426) | DSCOVR full-disc imagery | Focused, keep. |
| 6 | **Exoplanet Lab** (`ExoplanetLab.jsx` 564) | Kepler/TESS candidates | Focused, keep. |
| 7 | **Earth Intelligence Lab** (`EarthIntelligenceLab.jsx` 1038, 5 internal tabs) | Overview, POWER trends, Sri Lanka watch, NOVA analyst, AI Earth Viewer | **Protected by mandate:** POWER params/parsing/cache/charts/calcs and GIBS features must not change. No simplification proposed inside this tab beyond what it already ships. |
| 8 | **Landmark Missions** (promo card + `MissionsTimeline` 867 incl. `MissionsAnalytics` 869 + `MarsImageTagger` 214 + `SolarWeather` 254) | Timeline, analytics, Mars hotspots, solar weather | Grab-bag of four unrelated sections; the simulator promo card duplicates a destination that already exists in navigation. Mars tagger and solar weather are valuable but undiscoverable at the bottom of a long scroll. |
| 9 | **Launch Simulator** (root `RocketLaunchSimulator` 806 + `AaaRocketLaunch` 1202) | Physics console | Mandatory feature, keep. Reached both from its own nav item and the missions promo card. |
| 10 | **NASA News** (`CosmicCalendar` 368 + `NewsSection` 68 → sub-switch `NASANewsExplorer` 624 / `NasaNewsFeed` 573) | Calendar + archive/live sub-tabs | Sub-tab pattern is good. Hardcoded label "Decade Archive (2015–2026)" will age and bypasses i18n keys. |
| 11 | **Saved Research** (`SavedFavorites.tsx` 372) | Local favourites with cross-navigation | Keep. |
| 12 | **Space Trivia** (`SmartSpaceQuiz` 319, **4 Q** + `SpaceQuizModule` 386, **4 Q** + `SpaceTriviaQuiz` 546, **14 Q × 3 languages**) | Three quiz UIs stacked vertically | **Strongest redundancy found:** two 4-question modules share identical opening questions (ISS speed, Mars atmosphere), nearly identical trophy/streak UI and both use `LiquidGlassCard`. The user scrolls through three separate quizzes on one page. |
| 13 | **Orbital Tracking** (root `IssTracker2D` 748 + `ISSTracker.jsx` 1185) | Lightweight canvas map **and** full Leaflet/TLE multi-satellite map, stacked | Two maps of the same station mount together: double ISS data fetching, ~1,900 lines of UI on one screen, long scroll. Complementary tech, duplicated presentation. |
| 14 | **NOVA Assistant** (`NasaAi.jsx` 1910) + global `GeminiChatWidget` 1546 (desktop) + `GeminiLiveVoice` modal + global `FloatingVoiceControl` 255 | Full assistant page, floating chat, live-voice modal, voice mic button | Five NOVA entry points (header "Ask NOVA", home CTA, Assistant tab, desktop widget, floating mic). The two chat surfaces share mic/copy/refresh/delete/TTS controls and framer-motion patterns but are separate 1,500–1,900-line implementations. |

**Always-present chrome:** `AppHeader` (grouped accessible menus), `MobileTabBar`, `AppFooter` (data-source register), `AmbientSoundscapeControl` (footer), `PWAInstallButton`, `OfflineIndicator`, `ExportHtmlModal`, desktop `GeminiChatWidget`, `FloatingVoiceControl` (fixed, all viewports). On a phone the floating mic sits directly above the bottom tab bar.

---

## 3. Classification table (KEEP / SIMPLIFY / COMBINE / ADVANCED / REMOVE)

### KEEP — essential, valuable or mandated

| Item | Reason |
|---|---|
| Earth Intelligence Lab (POWER + GIBS + AI Viewer, all 5 tabs) | Explicit mandate; flagship science feature |
| APOD viewer, date picker, storyteller | Core NASA content, all components reachable |
| Asteroid Radar + risk badge/gauge | Planetary-defence mandate |
| EPIC, Exoplanet Lab | Focused single-purpose educational tools |
| Rocket Launch Simulator | Explicit mandate |
| Missions Timeline + embedded Analytics | Curated educational record |
| Mars Image Tagger, Solar Weather | Real NASA educational content (needs better placement, not removal) |
| NOVA Assistant (`NasaAi`) incl. local fallback engine | Explicit mandate; trilingual |
| Trilingual EN/SI/TA support, i18next system | Mandate |
| Saved favourites, PWA install, offline indicator, export HTML | Real user workflows |
| News archive/live sub-tabs, Cosmic Calendar | Working NASA integrations |
| Voice navigation | Accessibility feature; keep at least one entry point |
| Footer data-source register | Scientific credibility |
| 3D Lab sub-tab structure + Eco/WebGL device modes | Already progressive disclosure |
| Both ISS tracking engines | Each has distinct value (lightweight canvas vs Leaflet/TLE) — change presentation, not capability |
| All quiz question content | Educational value — consolidate the shell, retain the banks |

### SIMPLIFY — useful but unnecessarily complicated

| Item | Proposed simplification | Risk |
|---|---|---|
| Trivia tab | One quiz shell with an internal mode switch (Guided 4 Q / Challenge 4 Q / Full 14 Q); all questions retained | Low–medium; needs careful i18n |
| Orbital Tracking tab | Internal 2D/Map sub-tab (same pattern as News/3D), mount only the active map | Medium; two different data hooks |
| Missions tab | Remove the simulator promo card (nav already reaches it); give Mars tagger & Solar weather a compact "More mission tools" disclosure | Low |
| Floating controls | On mobile, move the mic inside the Assistant/NOVA surface instead of a permanent fixed button; desktop unchanged | Product decision — validate |
| Home duplication | Merge SignalStrip stats into MissionOverview headers (or make the strip a compact status row) | Medium; touches home data hooks |
| 3D Lab hardware bar | Plain-language label ("Performance: Eco / Full 3D"), move core count to a tooltip | Low |
| News archive label | Replace hardcoded "2015–2026" with computed range and i18n keys | Low |
| Animation | Honour reduced-motion in framer-motion surfaces (page transitions, floating widgets) via `useReducedMotion` | Low |
| i18n consistency | Migrate the 15 components using hardcoded `lang==='si'` ternaries to i18n keys, incrementally | Medium; large text surface |
| Visual language | Gradually replace `apple-liquid-glass` (95 usages, 12 files) with token `surface/line/ink` primitives | Medium; visual regression risk |

### COMBINE — duplicates another feature

| Item | Combine with | Evidence |
|---|---|---|
| `SmartSpaceQuiz.jsx` | `SpaceTriviaQuiz.tsx` shell | Same first two questions, same streak/trophy UX, same `LiquidGlassCard` |
| `SpaceQuizModule.jsx` | Same shell | Same overlap; 4-question bank |
| Missions simulator promo card | Delete — navigation already lists Launch Simulator | Pure navigation duplicate |
| (Long-term, product decision) `GeminiChatWidget` + `NasaAi` | One chat engine, two surfaces | ~3,500 combined lines, overlapping control sets |

### MOVE TO ADVANCED TOOLS

| Item | Rationale |
|---|---|
| AR Star Map, Spacecraft Models | Already a sub-tab of 3D Lab — formally document as advanced |
| `MissionsAnalytics` deep charts | Already nested in the timeline; keep behind its existing disclosure |
| Ambient Soundscape | Niche; currently footer-level — candidate for a settings/disclosure (validate) |
| AI Earth Viewer advanced sliders | Already inside the Earth Lab's fifth tab; no change |

### REMOVE — demonstrably redundant, obsolete or broken (all evidence: zero importers)

**A. Dead components inside `src/components/` (25 files, ≈6,080 lines)**

| File(s) | Lines | Reason / regression risk |
|---|---|---|
| `AnimatedNavbar.jsx`, `FluidNavbar.jsx`, `Navbar.jsx`, `Navbar.tsx`, `Header.tsx` | 1,829 | Superseded by `src/ui/AppHeader.tsx`. Zero importers. `Navbar.tsx` is the **only** user of `jspdf`/`html2canvas`. Risk: none (tree-shaken today; verify build after deletion). |
| `NASABottomBar.tsx`, `NASADragBottomBar.jsx`, `IOSBottomBar.jsx` | 878 | Superseded by `src/ui/MobileTabBar.tsx`. Zero importers. |
| `FloatingLanguageSwitcher.tsx` | 176 | Language switch lives in `AppHeader`. Zero importers. |
| `Logo.tsx` | 139 | Header uses inline SVG brand mark. Zero importers. |
| `CosmicStarfieldBackground.jsx`, `HeroBackgroundEarth.tsx`, `AtmosphericEntryTransition.tsx`, `PulsarLoader.tsx` | 1,022 | Old hero/effects layer; current hero uses `hero/OrbitalEarth` + `PosterEarth`. Zero importers. |
| `SlideToAction.jsx`, `SpaceControls.jsx`, `SolarAlertCard.jsx`, `IssTelemetryIndicator.tsx` | 909 | Legacy widgets with no remaining consumers. |
| `DynamicLiquidFilter.jsx`, `LiquidGlassFilter.jsx` | 18 | Components that `return null` — literal no-ops. |
| `SolarWeatherAlertCard.jsx` | 15 | Alias of the live `SolarWeather.jsx`; unused. |
| `AIChat.jsx` → `OpenRouterChat.jsx` | 581 | `AIChat` has zero importers; `OpenRouterChat` is imported only by `AIChat`. The local engine it used (`spaceLocalAiEngine`) is imported directly by the live `NasaAi` and **must be kept**. |
| `SpaceAudioPlayer.jsx` (shim) | 2 | Re-exports root `SpaceAudioPlayer` (also dead, 502 lines). |
| `AaaRocketLaunch.tsx` (shim) | 9 | Broken self-path shim; the **root** `components/AaaRocketLaunch.jsx` stays (used by the live simulator). |
| `src/i18n.js` | 261 | Legacy inline resource bundle; entry imports `src/i18n.ts`. Zero importers. |

**B. Dead root-level legacy tree (unreachable from the Vite build)**

- `app/` — Next.js App Router scaffold (`layout.jsx`, `page.jsx`, `api/nasa-ai/route.js`, 139 lines). This Vite app enters via `index.html`; `vercel.json` rewrites everything to `/index.html` and `/api/*` to the express bundle.
- 24 root `components/*` 1–4-line re-export shims back into `src/`, plus dead `components/SpaceAudioPlayer.jsx` (502) and `components/planets/AdvancedMarsGlobe.jsx`.
- Root `hooks/` (2 shims), `context/` (1 shim), `utils/` (shims + unreferenced `calculateAsteroidRisk.js`). Live code imports its `src/` siblings via relative paths; the only root-tree import in production is `@/lib/nasaApi`.
- **Preserved:** root `lib/nasaApi.js`, root `lib/dbCache.js`, root `components/{CosmicCalendar,IssTracker2D,RocketLaunchSimulator,AaaRocketLaunch}.jsx` (all proven reachable).

**C. Dependencies**

| Package | Evidence | Proposal |
|---|---|---|
| `motion` | 0 imports across `src`, `server`, root `components`; `framer-motion@13` is the actual package | Remove |
| `jspdf`, `html2canvas` | Only imported by dead `src/components/Navbar.tsx`; no matching chunk exists in `dist/` (already tree-shaken) | Remove together with that file, then verify build |

**D. Items reported, NOT removed without deployment verification**

- Tracked build artifact `api/index.js` (regenerated by `build:api`) and root `api/nova/*` route handlers: `vercel.json` rewrites `/api/(.*)` → `/api/index`, so the standalone handlers appear unreachable, but deployment behaviour should be confirmed before deletion.
- No source file is deleted solely on usage assumptions; every removal above is provably unreferenced in the import graph.

---

## 4. The 10 most important UX problems (priority order)

1. **Three stacked quizzes with duplicated questions** — users meet the same ISS/Mars questions twice; longest scroll of any educational tab. *(Evidence: component source, question-bank diff.)*
2. **Two ISS maps mounted at once** — double network fetching and ~1,900 lines of competing UI on one tab.
3. **Missions tab is a grab-bag** — simulator promo (duplicates nav), timeline, Mars hotspots and solar weather stacked with no grouping or primary action.
4. **Floating-control overload on mobile** — fixed mic above the bottom bar, plus PWA/offline/sound controls; multiple glass overlays compete for attention.
5. **Five NOVA entry points and two parallel chat implementations** — diffuses the "one obvious primary action" principle; ~3,500 lines of overlapping chat UI.
6. **Reduced-motion gap** — the CSS media query neutralises CSS animations, but framer-motion JS animations (41 files; only 6 handle reduced-motion), including page transitions and the three floating widgets, are not fully covered.
7. **Inconsistent trilingual implementation** — 15 components hardcode `lang==='si'` strings instead of i18n keys (23 components use the proper system), risking terminology drift and missed translations.
8. **Two visual languages** — legacy `apple-liquid-glass`/`font-black`/cyan-gradient components (95 glass usages) vs the refined token-based `ui/` design system; the product looks like two generations of design on one screen.
9. **Home-page data repetition** — ISS/NEO/APOD status appears in both SignalStrip and MissionOverview; four network resources are rendered twice.
10. **~7,000 lines of dead code and a dual directory tree** — no user-visible bundle cost today (tree-shaking), but high regression/onboarding cost and real risk of editing a dead lookalike (e.g. three files named `Navbar`).

---

## 5. Proposed navigation structure

The existing four-group IA is sound and already meets the 5–7 top-level guideline (Home + 4 groups). Keep it; reduce *perceived* complexity inside destinations:

```
Home
Explore   → APOD · 3D Space Lab · Landmark Missions · NASA News · Space Trivia (single entry)
Earth     → Earth Intelligence Lab · EPIC Earth · Orbital Tracking (single entry, 2D/Map toggle inside)
Solar System → Near-Earth Objects · Exoplanet Lab · Launch Simulator
Assistant → NOVA Assistant · Saved Research
```

- Tab count stays at 14 destinations — every one carries NASA science/educational value; none is removed for count's sake.
- Trivia and Orbital Tracking become single entries with internal mode switches (matching the proven News/3D Lab pattern).
- Mobile bottom bar unchanged (`Home / Earth / NOVA / Saved / More`) — already thumb-optimal.
- Long-term option requiring product sign-off: fold the desktop chat widget into the Assistant destination, leaving one NOVA button in the header.

---

## 6. Performance & accessibility evidence

**Measured baseline (production build at commit `253e286`):** SW precache 6,080.49 KiB / 134 entries; largest chunks `three.module` 737.6 kB (gzip 187.3), `index` 650.5 kB (gzip 183.2), `model-viewer` 428.7 kB, `BarChart` 386.4 kB. All heavy destinations are lazy chunks; `AiEarthViewer` ships as a 21.5 kB (6.8 kB gzip) isolated chunk.

- Dead-code removal will **not** shrink the user bundle by itself (the files are already tree-shaken — no Navbar/jspdf/html2canvas chunk appears in `dist/`). Its benefit is maintainability and install weight (`motion`, `jspdf`, `html2canvas` leave `node_modules`). No bundle-size improvement will be claimed without a fresh before/after measurement.
- Real, measurable runtime win available: mounting only the active ISS map removes one duplicated live data fetch and one Leaflet initialisation per Orbital Tracking visit — to be measured after implementation.
- Reduced-motion: `src/styles/tokens.css` correctly kills CSS animation/transition; framer-motion needs explicit `useReducedMotion` handling (gap).
- Accessibility strengths found: header menus use `aria-expanded/haspopup/menuitem`, Escape/outside-click close, mobile sheets are `aria-modal` dialogs, progressbar/status roles in newer components, language switcher is a `menuitemradio` group.
- Gap: legacy `.jsx` components favour div+onclick patterns and hardcoded English microcopy; focus styles exist in the token system but several legacy glass buttons define no `focus-visible` style.

---

## 7. Implementation tiers (for approval)

**Tier A — zero-product-decision cleanup (reversible, no user-visible behaviour change):**
1. Delete the 25 dead `src` components/files and the dead root legacy tree (§3 A–B), preserving the 6 proven live root files.
2. Remove unused deps `motion`, `jspdf`, `html2canvas`; run install, type-check, full test suite and production build to prove no reachable import broke.
3. Add framer-motion reduced-motion handling to the App page transition and global floating widgets.

**Tier B — structural UX simplification (same features, better presentation):**
4. Trivia tab → single shell with internal mode switch (all question banks retained).
5. Orbital Tracking → 2D/Map sub-tab, only the active map mounts.
6. Missions tab → remove simulator promo card; "More mission tools" disclosure for Mars tagger/Solar Weather.
7. News archive label → computed range + i18n keys; 3D hardware bar plain-language label.

**Tier C — product decisions (specification only, not implemented without sign-off):**
8. Floating mic placement on mobile; NOVA chat-surface consolidation; home strip/overview merge; full glass→token migration; hardcoded-i18n migration programme.

---

## 8. Verification plan & unresolved items

- After each tier: `tsc --noEmit`, `test:earth` (30), `test:ai-viewer` (23), `test:nova-chat` (18), `test:earth-server` (16), EN/SI/TA smoke render, production build + chunk diff.
- Manual responsive pass (360/768/1280 px) on Home, Trivia, Orbital Tracking, Missions.
- POWER/GIBS protected: diff must show zero changes under `src/lib/earth/power*` and the Earth Lab's data path.
- **Could not be verified:** real-user feature preferences (no analytics — assumptions flagged), Vercel's handling of the tracked `api/index.js`/`api/nova/*`, runtime behaviour in a mobile browser (no device farm in sandbox), framer-motion GPU cost on low-end devices.
- **Broken-feature watch (reported separately, not fixed as part of UX cleanup):** root `api/nova` route handlers appear shadowed by the express rewrite; several root shims contain self-referential paths that would fail if ever imported directly (they are currently unreachable).
