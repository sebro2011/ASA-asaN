# NOVA AI — Phase 3A Implementation Report

**Scope:** tokens, branding, routing, workspace shell.
**Branch:** `arena/471768c6-asa-asan`
**Commit:** `bbc9fea` — `feat(nova): Phase 3A — workspace shell, routing, themes and branding`
**Parent:** `116c5c5` (Phase 1 audit + Phase 2 blueprint, preserved)
**Status:** Phase 3A complete, verified, pushed. **Phase 3B not started.**

---

## 1. What Phase 3A was asked to deliver

From the approved blueprint, Phase 3 splits into:

| Step | Scope | State |
| --- | --- | --- |
| **3A** | Design tokens, branding, routing, workspace shell | **Done — this report** |
| 3B | Supabase auth, migrations, RLS, storage, local-data migration | Not started |
| 3C | Arena SSE streaming route + smoke tests | Not started |
| 3D | Remaining surfaces, accessibility sweep, PWA polish | Not started |

Phase 3A stops at the shell: the workspace exists, is navigable in three languages,
is truthful about what is and is not built, and hands the untouched NASA science
suite over at `/explore`. No productivity module was mocked.

---

## 2. Files

### Created (23)

**Design system**

- `src/styles/nova-tokens.css` — dark/light workspace palettes, geometry tokens, glass/shadow/ring vars, contrast rationale in the header.
- `src/styles/workspace.css` — shell primitives: `.nova-app`, `.nova-sidebar*`, `.nova-nav-*`, `.nova-topbar`, `.nova-icon-btn`, `.nova-btn(--primary/--secondary/--ghost)`, `.nova-card(--interactive)`, `.nova-panel`, `.nova-chip`, `.nova-dot`, `.nova-kbd`, `.nova-scroll`, `.skip-link`, drawer keyframes, `.explore-space` isolation layer.

**Application core (`src/app/`)**

- `router.tsx` — `parseRoute`, `normalisePath`, `routeHref`, `navigate`, `<Link>`, `useRoute`, `useNavigate`, `RouterProvider` (History API + popstate).
- `theme.tsx` — `useTheme()` with `preference | theme | setPreference | toggleTheme | reducedMotion | highContrast`, persisted to `nova_theme | nova_motion | nova_contrast`, applied as `data-nova-theme | data-nova-motion | data-nova-contrast`.
- `navConfig.ts` — `WORKSPACE_NAV`, `EXPLORE_NAV`, `ACCOUNT_NAV`, `MOBILE_NAV_IDS`, `findNavItem`, `ROUTE_LABEL_KEYS`.
- `AppShell.tsx` — composition, global shortcuts (⌘/Ctrl+K, ⌘/Ctrl+\, `/`), route-change focus to `<main>`, per-route `document.title`, skip link.
- `Sidebar.tsx` — 264 px ↔ 72 px rail, `nova_sidebar_collapsed` persistence, workspace + Explore groups, account footer.
- `TopBar.tsx` — breadcrumb/title, palette trigger, theme cycle, language menu; drawer trigger below 1024 px.
- `MobileDrawer.tsx` — modal dialog (`aria-modal`, focus trap, body scroll lock, Escape), full destination list, theme radiogroup.
- `MobileBar.tsx` — four destinations + More, safe-area padding.
- `CommandPalette.tsx` — ⌘K palette over workspace/explore/appearance/language commands.
- `LanguageMenu.tsx` — EN/SI/TA switch, persists `i18nextLng`.
- `Brand.tsx` — `NovaMark` (SVG, inline gradient), `NovaWordmark`.
- `ThemeOptions.tsx` — shared three-way theme radiogroup (drawer + home).
- `hooks.ts` — `useFocusTrap`, `useBodyScrollLock`, `useEscape`, `useMediaQuery`, `useDebouncedValue`.

**Workspace surfaces (`src/workspace/`)**

- `home/HomeSurface.tsx` — greeting, live Explore entry, provider status (reads `/api/nova/config`), theme card, roadmap of unbuilt modules.
- `PlannedSurface.tsx` — per-module "not available yet" card with phase label and planned items.
- `NotFound.tsx` — in-shell 404.
- `useProviderConfig.ts` — reads server-reported provider booleans; no invented connectivity.

**Explore integration**

- `src/explore/ExploreApp.tsx` — copy of the original `src/App.tsx` tab shell with URL ownership removed: `{ tab, onSelectTab, onExitToWorkspace }`. All 15 destinations and their components untouched.

**Copy**

- `src/i18n/workspaceCopy.ts` — 106 keys × EN/SI/TA (shell, menus, home, planned, drawer, palette, themes).

**Tooling**

- `scripts/test-workspace-shell.mjs` — 11 pure-contract tests.
- `scripts/test-workspace-dom.mjs` — 4 jsdom render tests.
- `scripts/verify-explore-destinations.mjs` — renders all 15 Explore destinations and asserts their sources are unchanged.
- `scripts/generate-brand-icons.mjs` — deterministic brand raster generation (mark, wordmark, favicons, PWA icons, maskable, OG).
- `public/brand/` — `nova-mark.svg`, `nova-wordmark.svg`, `og-image.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, and `legacy/` (8 archived originals).

### Modified (17)

| File | Change |
| --- | --- |
| `src/App.tsx` | 637-line tab SPA → 70-line route switch: Explore (lazy) or `AppShell` + surface. |
| `src/main.tsx` | `ThemeProvider` → `RouterProvider` → `TrilingualProvider` → `App`; imports the two new stylesheets. |
| `src/index.css` | imports `nova-tokens.css` and `workspace.css`. |
| `src/styles/tokens.css` | science metadata `--color-ink-4` `#5f7290` → `#8494ab` (contrast fix, §6). |
| `src/i18n.ts` | merges `workspaceCopy` into all three resource bundles; syncs `<html lang>` on language change. |
| `src/ui/AppHeader.tsx` | optional `onExitToWorkspace`/`workspaceLabel`; desktop "NOVA Workspace" chip and mobile return row. Nothing else in Explore changes. |
| `index.html` | new title/description/OG/Twitter/theme-color/icons, pre-paint theme boot script, `<noscript>`. |
| `public/manifest.json` | NOVA name, ids, icons, theme colours, shortcuts to workspace + Explore. |
| `package.json` | `test:workspace`, `test:workspace-dom`, `verify:explore`; `jsdom` devDependency; `npm test` now includes the workspace suites. |
| 8 brand rasters (`favicon.ico`, `favicon.png`, `apple-touch-icon.png`, `pwa-192`, `pwa-512`, `pwa-maskable-512`, `logo.png`, `icon.svg`) | regenerated from the new mark; originals archived. |

### Deleted

**None.** Dead-code removal is Phase 5 (R2 + partial R3 in decision D4) and was not in scope.

---

## 3. Features implemented

**Routing.** 11 workspace destinations (`/`, `/chat`, `/projects`, `/documents`, `/writing`, `/research`, `/code`, `/knowledge`, `/tasks`, `/settings`, `/profile`), `/explore/:tab`, legacy `/cosmovision` → `space-shorts`, and an in-shell 404. Deep links, back/forward and refresh all resolve; detail ids are supported (`/chat/:id`). The old URL rewrite in `App.tsx` (`history.replaceState` to `/cosmovision`) is gone — the router owns history now.

**Shell.** Collapsible sidebar (persisted), tablet icon rail, mobile drawer + bottom bar, top bar with palette trigger, theme and language controls, skip link, focus moved to `<main>` on navigation, document title per route. Breakpoints live in CSS (asserted by test), so resizing never re-mounts the shell.

**Command palette.** ⌘K / Ctrl+K and `/`; groups workspace, explore, appearance, language. It deliberately searches *destinations*, not content, because no conversation/ document search API exists yet — an empty "search your chats" box would be a lie. Escape closes, arrows and Enter navigate, focus is trapped and restored.

**Themes.** Dark (Deep Space), Light (Daylight) and System, resolved before first paint by an inline boot script, so there is no flash. Every workspace surface reads `--color-ws-*`; Explore keeps `--color-void/ink/atmo` and is pinned to dark with `color-scheme: dark` inside `.explore-space`, so the science identity survives a light workspace.

**Truthful home.** Greeting, one live action (Explore NASA science), provider status read from the server (`/api/nova/config`), theme switcher, and an explicit roadmap listing each unbuilt module with its phase. No fake "recent documents", no fake usage graph, no avatar.

**Planned modules.** `/chat`, `/projects`, `/documents`, `/writing`, `/research`, `/code`, `/knowledge`, `/tasks` render `PlannedSurface`: "Not available yet", the phase that ships it, and what it will contain. The sidebar marks them with a "Soon" flag. Clicking them is not an error and not a fake product.

**Explore preserved.** All 15 destinations, the science header, voice control, PWA install button, offline indicator and export modal are intact. The only addition is a return path: a "NOVA Workspace" chip on desktop and a return row in the mobile sheet. Explore now loads lazily, so its 84 kB gz shell and the three.js / Leaflet / chart chunks stay out of the workspace's first load.

**Branding.** New NOVA mark (ring + orbital arc + star), wordmark, favicons, maskable PWA icons, 1200×630 OG image, manifest, and metadata. All rasters are generated deterministically by `scripts/generate-brand-icons.mjs`.

---

## 4. Verification results

### 4.1 TypeScript

```
npx tsc --noEmit   →  0 errors
```

### 4.2 Tests — 162 passed, 0 failed

| Suite | Tests | Result |
| --- | --- | --- |
| `test:earth` | 30 | 30 pass |
| `test:nova-chat` | 32 | 32 pass |
| `test:space-videos` | 19 | 19 pass |
| `test:community` | 10 | 10 pass |
| `test:ai-viewer` | 23 | 23 pass |
| `test:welcome` | 11 | 11 pass |
| `test:earth-server` | 16 | 16 pass |
| `test:space-build-security` | 2 | 2 pass |
| `test:security-performance` | 4 | 4 pass |
| `test:workspace-shell` | 11 | 11 pass |
| `test:workspace-dom` | 4 | 4 pass |
| **Total** | **162** | **162 pass / 0 fail** |

Baseline before Phase 3A was 147; this phase adds 15 and changes none.

What the new tests actually assert:

1. `normalisePath` canonicalisation (empty, bare, duplicate slashes, query/hash stripping).
2. Every workspace route parses to its own name.
3. Detail ids parse; extra segments 404.
4. All Explore paths, including `/cosmovision` → `space-shorts` canonicalisation.
5. `routeHref` round-trips through `parseRoute` (ids are URL-encoded).
6. Every nav href resolves to the route it declares.
7. Workspace copy has identical key sets in EN/SI/TA and no empty values.
8. Every nav item has a label and, if planned, a phase and description.
9. **Render:** sidebar links all destinations; home greets and shows the Explore card; ≥8 planned flags; ⌘K opens the palette and filters on "earth"; Escape closes; Light theme writes `data-nova-theme` and `nova_theme`; `/tasks` shows the planned card with phase `4F`; unknown path shows the 404.
10. Every literal `t('…')` key in `src/app` + `src/workspace` resolves in all three languages, and no dynamic `t(\`…\`)` keys exist.
11. Explore mounts under the workspace, renders APOD data from a stubbed API, hands `onExitToWorkspace` and tab selection back to the router.
12. WCAG contrast, computed from the CSS itself (§4.6).
13. Responsive breakpoints are declared in CSS (sidebar hidden → rail at 768 px → full at 1024 px → collapsed override).
14. Desktop / tablet / phone affordances: rail + drawer trigger on tablet, drawer opens as a modal, links present, Escape closes, bottom bar present, sidebar stays mounted and CSS-hidden on phones.
15. The shell renders in Sinhala and Tamil (nav labels come from the translated bundles, no English leakage), and `<html lang>` follows the language.

### 4.3 Production build

```
npm run build  →  built in 2.61s, 0 errors
```

| Asset | Raw | gzip |
| --- | --- | --- |
| `index-*.js` (workspace entry) | 549.63 kB | **152.16 kB** |
| `index-*.css` | 250.50 kB | **49.95 kB** |
| `ExploreApp-*.js` (lazy) | 299.09 kB | 84.20 kB |
| `three.module-*.js` (lazy) | 716.39 kB | 182.88 kB |
| `model-viewer`, `BarChart`, `Space3DViewer`, `SpaceShortsPage` | 257–426 kB each | lazy |

Baseline entry was 195.97 kB gz; the workspace shell is **22 % smaller** because Explore left the critical path. PWA: 137 precache entries, 5.84 MiB. The only build warning remains `chunk > 500 kB` (pre-existing, three.js/model-viewer).

### 4.4 All 15 NASA science destinations

```
npm run verify:explore
```

```
PASS  home           2541 chars · Earth observation · Planetary science · Deep s…
PASS  space-shorts   329 chars · THE ASTRONOMY COLLECTIONCosmoVisionAstrono…
PASS  apod           1182 chars · Astronomy Picture of the Day…
PASS  3d             504 chars · 3D visualisationInteractive 3D C…
PASS  missions       3068 chars · Flight historyLandmark NASA Spac…
PASS  news           3197 chars · Agency releasesLive NASA Science…
PASS  quiz           1163 chars · LearningSpace triviaShort, sourc…
PASS  earth          5183 chars · Intelligence LabEarth Intelligence…
PASS  epic           886 chars · DSCOVR imageryEPIC EarthFull-disc …
PASS  iss            501 chars · Orbital trackingOrbital trackingPo…
PASS  asteroids      3523 chars · Near-Earth objectsNear-Earth…
PASS  exoplanets     488 chars · Exoplanet laborat…
PASS  launch         494 chars · SimulationRocket launch sim…
PASS  assistant      1528 chars · Grounded AINOVA — mission cont…
PASS  saved          540 chars · Your collectionSaved researchA…
----------------------------------------------------------------
15 destinations · 15 rendered · 0 env-limited · 0 errors · 0 empty
legacy /cosmovision → space-shorts
router: all 15 paths resolve
distinct pages: 15/15
science sources: unchanged since HEAD
```

Each destination renders its own content (breadcrumbs differ), and `git status` over `src/components`, `src/features`, `src/hooks`, `src/lib` and `server` is empty — the science code is byte-identical to the last commit. Earth Intelligence Lab, NASA POWER, GIBS, APOD, asteroid tracking, Mars imagery, ISS and the rest are untouched.

### 4.5 Sinhala, Tamil, English

- 106 new shell keys × 3 languages; identical key sets (test 7).
- Every `t()` key used in the new code resolves in all three (test 10): 0 missing, 0 dynamic keys.
- Rendered shell verified in `si` and `ta` (test 15) — e.g. `Chat → සංවාදය / உரையாடல்`, `Projects → ව්‍යාපෘති / திட்டங்கள்`, `Explore → ගවේෂණය / ஆராயுங்கள்`.
- `<html lang>` now follows the active language (new `syncDocumentLanguage` in `src/i18n.ts`), which also fixes the science surface.
- Noto Sans Sinhala / Tamil bundles were already imported; no new font work was needed.
- One deliberate exception: the top-bar eyebrow reads "AI Workspace" in all languages as a brand descriptor (like "NOVA AI"); the translatable section heading `wsWorkspace` is localised.

### 4.6 Dark / light themes and WCAG contrast

Contrast is computed from the shipped CSS by test 12, not copied from a comment. Failures found and fixed during this phase:

| # | Issue found by the test | Fix | After |
| --- | --- | --- | --- |
| 1 | Light accent `#3b63f6` as link text on `elev-2` = **4.40:1** | light accent → `#375cea` | 4.88 / 5.09 / 5.41 |
| 2 | White label on dark accent `#5b84ff` = **3.39:1** (primary buttons) | new `--color-ws-accent-solid` `#3b63f6` (dark) / `#375cea` (light) | 4.88 / 5.41 |
| 3 | Accent text inside the 16 % active-nav tint = **4.11:1** dark / **4.32:1** light | new `--color-ws-accent-ink` `#7aa0ff` / `#2445c4` | 5.24 / 5.93 |
| 4 | Science metadata `#5f7290` = **3.20–4.15:1** (pre-existing) | `--color-ink-4` → `#8494ab` | 5.07–6.57 |

Measured now (all ≥ AA):

| Pair | Dark | Light |
| --- | --- | --- |
| body text on bg / surface / elev / elev-2 | 18.60 / 17.47 / 16.23 / 14.96 | 17.81 / 18.91 / 18.91 / 17.04 |
| `text-2` | 6.97 / 6.55 / 6.08 / 5.61 | 5.68 / 6.03 / 6.03 / 5.44 |
| `text-3` | 6.13 / 5.75 / 5.34 / 4.93 | 4.89 / 5.20 / 5.20 / 4.68 |
| `accent-ink` (accent as text) | 7.87 / 7.39 / 6.86 / 6.32 | 7.26 / 7.71 / 7.71 / 6.95 |
| white on primary button | 4.88 | 5.41 |
| nav label on active tint | 14.7 | 15.5 |

Theme mechanics: `data-nova-theme` on `<html>`, set pre-paint by the inline boot script from `nova_theme` (`dark | light | system`), overwritten by the provider on change; `meta[name=theme-color]` follows. Light mode is a complete palette, not an inverted one.

### 4.7 Routing, navigation, responsive layouts

- All routes return the SPA shell (HTTP 200) from the running server: `/`, `/chat`, `/projects`, `/explore`, `/cosmovision`, `/explore/earth`, `/tasks`, `/does-not-exist`.
- Palette: ⌘K/Ctrl+K and `/`, filter, arrow keys, Enter, Escape (tested).
- Drawer: trigger only below 1024 px, modal semantics, focus trap, Escape, body lock (tested).
- Tablet (768–1023 px): icon rail + bottom bar + drawer; labels reachable in the drawer, titles on rail icons.
- Phone (<768 px): drawer + bottom bar, sidebar CSS-hidden but mounted (instant resize), safe-area padding.
- Desktop (≥1024 px): full sidebar with collapse toggle, no drawer trigger.
- No horizontal overflow is enforced with `min-width: 0` / `overflow-wrap` inside the shell; long Sinhala/Tamil labels truncate rather than widen the rail.

### 4.8 Brand assets preserved

Eight originals archived in `public/brand/legacy/` are **byte-identical** to `HEAD` (sha256 compared against `git show HEAD:public/<file>`):

```
OK favicon.ico · favicon.png · apple-touch-icon.png · pwa-192x192.png
OK pwa-512x512.png · pwa-maskable-512x512.png · logo.png · icon.svg
```

Restore: `cp public/brand/legacy/* public/` (and `git checkout HEAD -- public/manifest.json index.html` for the old metadata).

---

## 5. Git

- Branch: **`arena/471768c6-asa-asan`** (pushed, in sync with origin).
- Commit: **`bbc9fea`** — `feat(nova): Phase 3A — workspace shell, routing, themes and branding`.
- Previous commits preserved: `116c5c5` (Phase 1/2 docs) still in history.
- `main` untouched. Nothing merged. Nothing deployed.

---

## 6. Known issues and incomplete work

**Verification limits of this sandbox**

1. **No headless browser.** Chromium/Playwright cannot be installed here, so visual verification is structural (jsdom assertions on markup, classes, ARIA, tokens) plus a production build. Gradient falloffs, glass blur and font metrics must be eyeballed. A dev server is running on port 4173 for that review.
2. **WebGL / Leaflet cannot paint in jsdom.** The 3D, Earth and EPIC surfaces fall back through their own error boundaries there; they are covered by unchanging sources, successful chunk builds and the live preview instead.
3. **No AI provider keys, no Supabase project and no CORS-valid egress** in this environment, so `/api/nova/config` reports every provider `false`. The home card says so honestly. Provider quality is unchanged and unverified here.

**Deliberate scope boundaries**

4. `/chat`, `/projects`, `/documents`, `/writing`, `/research`, `/code`, `/knowledge`, `/tasks` are **planned surfaces**, not products. They are labelled "Soon" and explain their phase.
5. **No account affordance** until Supabase auth exists (3B). No fake avatar, no fake sign-in.
6. **Two IA items from the brief are represented differently**, and need a decision in 3B: "Search" is the ⌘K command palette over destinations (content search needs the document/conversation indexes from Phase 4), and "Conversations" is not a separate route (the `/chat` history sidebar lands with the chat surface). Say the word if you want dedicated `/search` and `/conversations` routes.
7. Reduced-motion and high-contrast preferences are wired in the theme store, applied through `data-nova-motion` / `data-nova-contrast` and honoured by CSS, but there is **no visible control yet** (Settings, Phase 4). Nothing pretends otherwise.
8. The light theme around Explore: the science surface pins itself dark, but iOS overscroll can flash the light page background behind it.

**Budget / performance**

9. Entry JS is **152 kB gz** against my own 120 kB target (still −22 % vs baseline). The largest remaining contributor is the trilingual bundle: 753 keys × 3 languages ≈ 128 kB raw. Lazy-loading translations per language should recover ~25–30 kB gz and belongs in 3C/4C.
10. CSS is **49.95 kB gz** (target was 25 kB) because Tailwind compiles utilities for the science components too. Route-scoped CSS is not supported out of the box by Tailwind v4; the lever is scoping `@source` per surface.
11. PWA precache is **5.84 MiB / 137 entries**, including brand PNGs and the science chunks. Phase 6 should trim what is precached versus fetched on demand.
12. 404s are client-side only: the server returns 200 for unknown paths (soft 404). Needs a hosting-level rewrite decision in Phase 7.

**Shell details**

13. `document.title` updates per route; per-route `meta description` / OG tags do not (single-page metadata).
14. The sidebar collapse preference and theme are per-device (localStorage) until the profile lands in 3B.
15. `jsdom` was added as a devDependency (31.0.0) — used only by tests; it is not in the client bundle.
16. The palette's explore commands are destinations, so typing a science topic ("earth") jumps to the Earth destination rather than filtering articles.

---

## 7. Next (Phase 3B, awaiting approval)

Supabase: schema for profiles, conversations, messages, projects, documents, tasks; strict per-user RLS; storage buckets; complete SQL migration plus verification queries; a **non-destructive** local-data migration that only offers to import existing localStorage history after the cloud write is confirmed; no service-role key anywhere client-side; and the sign-in UI that the shell deliberately left out.

Nothing in Phase 3B has been written yet.
