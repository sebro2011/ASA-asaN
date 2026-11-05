# NOVA AI — Phase 1 Complete Audit

**Product:** NOVA AI (current repository title: *NASA Space Explorer*)
**Repository:** `sebro2011/ASA-asaN`
**Branch:** `arena/471768c6-asa-asan` (branched from `main` @ `e6fe342`)
**Date:** 2026-11-05
**Status:** Phase 1 complete. **No product code, configuration, dependency or asset was modified.** Only this report was added.
**Next gate:** approval of this audit + the Phase 2 blueprint before any implementation.

---

## 0. TL;DR — the honest verdict

1. **This is not a generic chatbot template that needs a redesign.** It is a mature, 46k-line, trilingual NASA science application whose *chat* is one destination among fifteen. The "NOVA AI assistant" already exists (`src/components/NasaAi.jsx`, 1,979 lines) and is genuinely good at what it was built for: space Q&A, TTS/STT, export/import, provider routing, offline fallback.
2. **The requested product (ChatGPT-class AI productivity workspace) is a different product surface than the one deployed.** Everything in your brief — conversations list, projects, documents, writing studio, research, code studio, knowledge space, tasks, settings, light theme, collapsible sidebar — **does not exist today**. There is no router, no accounts, no database for user content, no streaming transport, no settings screen, no light theme.
3. **Three blockers must be decided before Phase 3, not during it:**
   - **AI capacity.** In this environment *no* AI provider is configured (`/api/nova/config` → `gemini:false, openrouter:false, arena:false`). NOVA then answers **only** from a bundled *space* knowledge base. I tested it: a prompt "write a professional email announcing a deadline moved to Friday" returns *"I couldn't pinpoint that exact space inquiry…"*. **A productivity workspace on the current engine would be visibly non-functional until an online model is configured and verified.**
   - **Persistence.** There is no user-data backend. Everything user-authored lives in ~6 `localStorage` keys (chat thread capped at 25 messages). Projects/documents/tasks can only be *local-first and device-scoped* unless we add Supabase tables (credentials currently blank).
   - **Identity collision.** Your sidebar spec has no space destinations; the existing fifteen destinations are this app's substance and were protected by earlier mandates. Retiring them would delete the majority of the product. My recommendation (Section 15) is **NOVA as the shell, with the science suite kept intact under an "Explore" group** — but that is your call, and it changes the whole blueprint.
4. **Verified baseline is healthy:** `tsc --noEmit` clean, **147/147** automated assertions pass, production build succeeds, PWA generated, no credential leakage found. Details in Section 2.

---

## 1. Method and evidence

Read in full: `server.ts`, `server/novaChat.js`, `server/nasaRoutes.ts`, `server/{earthIntelligence,spaceVideos,communityVideos}.ts`, `api/*`, `vercel.json`, `vite.config.ts`, `tsconfig.json`, `package.json`, `.env.example`, `src/App.tsx`, `src/main.tsx`, `src/components/NasaAi.jsx`, `src/ui/*`, `src/pages/home/*`, `src/i18n*`, `src/styles/tokens.css`, `src/hooks/*`, `lib/nasaApi.js`, `lib/novaExport.js`, `src/utils/spaceLocalAiEngine.js`, `src/lib/earth/*`, `supabase/cosmovision.sql`, `public/{manifest.json,sw.js}`, plus the prior in-repo audits (`PHASE1_AUDIT_REPORT.md`, `docs/UX_SIMPLIFICATION_AUDIT.md`, `docs/PHASE7_FINAL_REPORT.md`).

Executed (real results, not estimates):

| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | **exit 0, clean** |
| Full test suite | `npm test` | **147/147 pass, 0 fail** (earth 30, nova-chat 32, space-videos 19, community 10, ai-viewer 23, welcome 11, earth-server 16, build-security 2, security-performance 4) |
| Production build | `npm run build` | **succeeds**, 2.6 s, 70 JS chunks, PWA `generateSW` |
| Dev server boot | `npm run dev` | **starts on :3000**, `/api/health` → 200 |
| Provider config | `curl /api/nova/config` | `{auto:true, local:true, gemini:false, openrouter:false, arena:false}` |
| Chat round-trip | `POST /api/nova/chat` (productivity prompt) | 200, answered by *local space engine* with a topic deflection (see Section 4.4) |
| i18n parity | script over `src/i18n.ts` resources | **647 keys × 3 languages, 0 missing** |
| Contrast | WCAG ratio computation on design tokens | `ink-4` **fails AA** on every surface (Section 11) |
| Repo hygiene | `git status` after build | clean (build output is gitignored; `api/index.js` rebuilt byte-identically) |

Note: `dist/` and `node_modules/` were produced locally for measurement and are gitignored; a transient `package-lock.json` from `npm install` was deleted (the repo pins with `bun.lock`). No tracked file changed.

---

## 2. What the product actually is today

- **Shell:** a tab-state SPA (no URL router) — `src/App.tsx` holds `activeTab`; 15 destinations in `src/ui/navigation.ts`; one shareable route (`/cosmovision`).
- **Navigation:** desktop header with four grouped dropdown menus + mobile bottom tab bar (Home / Earth / CosmoVision / NOVA / Saved / More) + full-screen "More" sheet.
- **AI:** `POST /api/nova/chat` → `server/novaChat.js` → Arena → OpenRouter → Gemini → bundled local space engine. **JSON only, no streaming.** The UI *simulates* streaming with a 16 ms typewriter.
- **Persistence:** `localStorage` only for user content; optional Supabase (community submissions for CosmoVision) with RLS — unused unless configured.
- **Design:** Tailwind 4 `@theme` tokens (`src/styles/tokens.css`, 407 lines), self-hosted Inter / JetBrains Mono / Noto Sinhala / Noto Tamil, **dark only**.
- **Deployment:** Express (`server.ts`) for standalone/Cloud-Run style, esbuild bundle (`api/index.js`) as a Vercel function; `vercel.json` rewrites SPA + `/api/*`; `maxDuration: 30`.

Source size: **229 tracked files**, **46,168 lines** of JS/TS/JSX/TSX under `src/ server/ lib/ components/`.

Largest units (maintainability signal):

| Lines | File |
|---|---|
| 1,979 | `src/components/NasaAi.jsx` |
| 1,477 | `src/components/ARStarMap.jsx` |
| 1,476 | `src/components/AsteroidRadar.jsx` |
| 1,271 | `server/nasaRoutes.ts` |
| 1,202 | `components/AaaRocketLaunch.jsx` *(unreferenced — Section 7, R3)* |
| 1,185 | `src/components/ISSTracker.jsx` |
| 1,039 | `src/components/EarthIntelligenceLab.jsx` |

---

## 3. Feature inventory (KEEP / IMPROVE / REMOVE / INVESTIGATE)

Nothing has been removed. "REMOVE candidate" means *proposed*, awaiting your approval, with the full impact analysis in Section 7.

### 3.1 Destinations

| # | Destination | Root component(s) | Verdict | Rationale / evidence |
|---|---|---|---|---|
| 1 | **Home** (space dashboard) | `pages/home/*` (~1,100 LOC) | **IMPROVE** | Well-built but is a *space* dashboard. Your brief asks for a *workspace* home (recent chats, projects, documents, tools). Needs replacement-in-place, keeping the scientific "signal strip" as an optional module. |
| 2 | **APOD** | `ApodViewer.tsx` + date picker + storyteller | **KEEP** | Core content, complete, no dead ends. |
| 3 | **CosmoVision** (`space-shorts`) | `features/space-shorts/*` | **KEEP** | Real feature; degrades to a curated, labelled collection without `YOUTUBE_API_KEY`. Community writes gated by Supabase auth + RLS. |
| 4 | **3D Space Lab** | `Space3DViewer` → `SpaceLab3D`/`CelestialLab3D`/`ARStarMap`/`SpacecraftViewer` | **KEEP** | Flagship differentiator; already device-performance aware. Heaviest chunks (three.js). |
| 5 | **Landmark Missions** | `MissionsTimeline` + `MissionsAnalytics` + `MarsImageTagger` + `SolarWeather` | **KEEP / IMPROVE** | Content is good; the page is a grab-bag of four unrelated sections in one scroll. Improvable IA, not removable. |
| 6 | **NASA News** | `CosmicCalendar` + `NewsSection` → two sub-feeds | **KEEP** | Working, live. |
| 7 | **Space Trivia** | `SmartSpaceQuiz` + `SpaceQuizModule` + `SpaceTriviaQuiz` **stacked** | **INVESTIGATE → REMOVE candidate** | Three separate quiz UIs mount together; two share near-identical questions and boards. See R2. |
| 8 | **Earth Intelligence Lab** | `EarthIntelligenceLab.jsx` + `lib/earth/*` (5 tabs) | **KEEP (protected)** | The most rigorous part of the codebase: verified GIBS/WMTS probing, POWER monthly historical climate, provenance panel, explicit non-forecast labelling. Must not be simplified away. |
| 9 | **EPIC Earth** | `EPICViewer.jsx` | **KEEP** | Focused, honest about capture latency. |
| 10 | **Orbital Tracking** | `IssTracker2D` + `ISSTracker` stacked | **KEEP / IMPROVE** | Two maps of the same station, double fetch, ~1.9k lines in one view. Consolidate later; keep both implementations. |
| 11 | **Near-Earth Objects** | `AsteroidRadar.jsx` (+ badge/gauge) | **KEEP** | Planetary-defence mandate. |
| 12 | **Exoplanet Lab** | `ExoplanetLab.jsx` | **KEEP** | Focused. |
| 13 | **Launch Simulator** | `RocketLaunchSimulator.tsx` → root `components/*` | **KEEP** | Mandated; physics console. |
| 14 | **NOVA Assistant** | `NasaAi.jsx` | **IMPROVE (core of the new product)** | Good bones, wrong shell. Has: provider picker, simulated streaming, custom markdown + code blocks, copy, retry/regenerate, TTS, speech input, JSON export/import, APOD quiz, offline guard. Lacks: multiple conversations, list/search/rename/archive, real streaming, tables, syntax highlighting, message editing, settings. |
| 15 | **Saved Research** | `SavedFavorites.tsx` + `utils/favorites.ts` | **INVESTIGATE** | Two `localStorage` lists (`nasa_cosmic_saved_apods`, `nasa_cosmic_saved_missions`). In a workspace it overlaps with Projects/Documents; do not delete — migrate. |

### 3.2 Shell / global chrome

| Item | Files | Verdict | Notes |
|---|---|---|---|
| Header w/ grouped menus + language switcher | `src/ui/AppHeader.tsx` (400) | **IMPROVE** | Accessible (aria-expanded/haspopup, Escape, outside click). Replaced by the workspace sidebar + top bar, preserving the language switcher. |
| Mobile tab bar + "More" sheet | `src/ui/MobileTabBar.tsx` | **IMPROVE** | Good touch ergonomics; must coexist with a mobile drawer. |
| Footer as data-source register | `src/ui/AppFooter.tsx` | **KEEP** | Credibility feature; carries the "not affiliated with NASA" disclaimer. |
| First-run welcome overlay | `WelcomeScreen.tsx`, `lib/welcome.ts` | **IMPROVE** | Rebrand + add workspace onboarding steps. |
| Floating voice control (all screens) | `FloatingVoiceControl.jsx` + `useVoiceNavigation` | **INVESTIGATE** | Third voice entry point; overlaps with the composer mic. On phones it floats above the tab bar. |
| Ambient soundscape | `AmbientSoundscapeControl.tsx` | **INVESTIGATE** | Sci-fi audio; optional in a professional workspace. |
| PWA install button, offline indicator | `PWAInstallButton.tsx`, `OfflineIndicator.tsx`, `usePWAInstall` | **KEEP** | Real, working. |
| Single-file HTML export | `ExportHtmlModal.tsx` | **KEEP** | Genuinely useful offline artifact; verify it survives the rebrand. |
| In-chat sci-fi sound effects (Web Audio synth) | inside `NasaAi.jsx` | **IMPROVE** | Default-on laser/chime conflicts with "professional workspace"; make it an opt-in preference. |
| In-chat APOD quiz | inside `NasaAi.jsx` (`activeQuiz`) | **INVESTIGATE** | Educational flourish inside the assistant; not a productivity feature. Keep but move behind a "Learning" context. |

### 3.3 Chat capability matrix (against your Section 2A requirements)

| Requirement | Status | Evidence |
|---|---|---|
| New conversation | **Partial** — "start new chat" clears the single thread | `handleStartNewChat` clears `STORAGE_KEY` |
| Conversation history (list) | **Missing** | one key `nasa_ai_chat_thread_v3`, array only |
| Conversation search | **Missing** | no search over messages; header's Search icon is a static affordance |
| Message streaming | **Partial (simulated)** | backend sets `stream:false`; client `setInterval` 16 ms reveal |
| Markdown rendering | **Partial** | bespoke line parser: headings/bold/inline code/lists/lists/quotes — **no tables, links, hr, nested lists** |
| Code syntax highlighting | **Missing** | plain `<pre><code>`; no highlighter dependency |
| Copy response / copy code | **Yes** | `handleCopyMessage`, `CodeBlockRenderer` |
| Regenerate | **Yes** | per-message `RotateCcw` → `executeUserQuery(msg.queryText)` |
| Rename / archive conversation | **Missing** | no conversation records exist |
| Conversation organization | **Missing** | none |
| Context-aware interactions | **Partial** | 6-message history window; suggestions parsed from `SUGGESTIONS:` line |
| Persistence limits | 25-message cap, per-message text only | `persistMessages(newMsgs.slice(-25))` |
| Import/export | **Yes** | `lib/novaExport.js` v1 JSON, secret-free, tested |
| Cancel in-flight request | **Yes** | `AbortController` + stop button |
| Edit user message / branch | **Missing** | — |

---

## 4. AI engine and provider audit (critical)

### 4.1 Preserve-the-engine facts

`server/novaChat.js` is provider-agnostic and defensive; **this is the piece that must not be rewritten.** Keep exactly:

- Routes: `/api/nova/chat` (canonical), `/api/chat`, `/api/openrouter/chat` (aliases in `server.ts`), plus Vercel adapters `api/nova/chat.js`, `api/nova/config.js`.
- Order of validation: byte caps → message validation → rate limit → provider selection.
- Caps: 24 KB body, 12 messages, 4,000 chars/message, 20 KB history, 8 s upstream timeout.
- Rate limiting: Express 15/min per IP on chat paths **and** handler-level 8/min (effective **8/min**).
- Error taxonomy: `RATE_LIMITED`, `PROVIDER_NOT_CONFIGURED`, `AI_TIMEOUT`, `UPSTREAM_RATE_LIMITED`, `FREE_MODEL_UNAVAILABLE`, `EMPTY_PROVIDER_RESPONSE`, … all mapped to safe user copy.
- `GET /api/nova/config` returns **booleans only**, never keys. Verified: `{"auto":true,"local":true,"gemini":false,"openrouter":false,"arena":false}`.
- Pointer-ordered fallback: `arena → openrouter → gemini`, then local engine with `fallback: true` and honest provider naming.
- `makeSystemPrompt(language)` — 3-line, language-aware, explicitly forbids claiming live NASA telemetry or web access. **This system prompt must be preserved**; the workspace needs *additional* task-scoped prompts layered on top, not a replacement.

### 4.2 Arena integration — current state

Code exists and is well-formed (OpenAI-compatible call, `stream:false`, Bearer key, availability flag). **It is not verified here**: no `ARENA_API_KEY` is present, so `arena:false` and every request falls to local. Two defaults are *unverified placeholders* and should be treated as such:

- `NOVA_ARENA_MODEL` default `arena_smart.aria`
- `ARENA_BASE_URL` default `https://api.arena.ai/v1/chat/completions`

Per your constraint (no unverified model IDs/endpoints), the blueprint will keep Gemini + OpenRouter intact and treat Arena as *primary only after a live smoke test with a real key* — one request, checking provider echo and `model` in the response.

### 4.3 No real streaming

`callArena` / `callOpenRouter` / `callGemini` all request complete JSON and return `{status, body}`. The client typewriter is cosmetic: time-to-first-token equals full generation time (up to the 8 s cap). ChatGPT-class feel requires an **additive** SSE route (e.g. `POST /api/nova/stream`) that leaves the JSON contract, caps, limiter and prompts untouched, plus client-side incremental render. This is the single largest authenticated engineering item in Phase 4 and needs your approval because it touches the backend.

### 4.4 The local engine is space-only (hard evidence)

Request (auto provider, no keys configured):

```
POST /api/nova/chat
{"messages":[{"role":"user","content":"Write a short professional email to my team announcing a project deadline moved to Friday."}],"lang":"en","provider":"auto"}
```

Response (200): `provider: "NOVA Local Space Engine"`, text:

> "🚀 **NASA Deep Space Intelligence Engine:** I couldn't pinpoint that exact space inquiry, but I have comprehensive built-in telemetry across NASA missions! …"

`src/utils/spaceLocalAiEngine.js` (510 LOC) scores keyword intents against a *space* knowledge base and returns a topic-deflection otherwise. Consequences:

- **Any** writing/research/code/task feature will emit that deflection without an online provider.
- The chat UI's honesty is intact (`fallback: true`, provider label shown) — but a "Writing Studio" that produces this is worse than no studio.
- Therefore Phase 4's productivity surfaces must be **capability-gated**: when only the local engine is available, the UI must disclose that and restrict itself to what actually works (space Q&A, document editing/organisation that is not AI-dependent).

### 4.5 Latent/dead AI paths found

| Finding | Evidence | Impact |
|---|---|---|
| `askNasaAi()` client helper targets `/api/nasa-ai`, which **does not exist** (404 verified) | `lib/nasaApi.js:685-688`; no route in `server/*` | Dead code. Nothing in the live UI imports it. Remove in cleanup (R4). |
| `/api/nasa-ai` still listed in the Express NOVA rate-limit list | `server.ts:144` | Harmless but misleading config. |
| Two `apiKey`-related Gemini warnings at boot when unset | dev log: *"API key should be set when using the Gemini API"* ×2 | `new GoogleGenAI({apiKey: undefined})` at import time. Cosmetic; should be lazily constructed. |
| Prior audit/`CACHEABLE_GET` still references `/api/gemini-live-token` and a `/ws/live` proxy | `server.ts:156`, `api/index.js` bundle | **That route no longer exists**; docs/`PHASE1_AUDIT_REPORT.md` describe it as live. Stale documentation, no security exposure. |
| `ai` instance imported by `setupNasaRoutes` even when unused | `server.ts:180` | Minor startup coupling. |

---

## 5. Data and persistence audit (what a workspace can honestly offer)

| Store | Key / table | Contents | Limits | Loss risk |
|---|---|---|---|---|
| Chat thread | `nasa_ai_chat_thread_v3` | single array of messages | last **25** messages; no schema version beyond key name | Clearing site data / private mode loses everything |
| Provider preference | `nova_ai_provider_v1` | `auto\|local\|gemini\|openrouter` | — | trivial |
| Language | `i18nextLng` | `en\|si\|ta` | — | trivial |
| Saved APODs | `nasa_cosmic_saved_apods` | favourites | unbounded | device-scoped |
| Saved missions | `nasa_cosmic_saved_missions` | favourites | unbounded | device-scoped |
| Welcome pref | `lib/welcome.ts` key | first-run opt-out | — | trivial |
| Quiz highscores | `nasa_quiz_highscore`, `nasa_space_quiz_high_score`, `nasa_trivia_highscore` | numbers | one per quiz module | device-scoped |
| **Server-side user data** | **none** | — | — | Projects/documents/tasks have **no** backend today |
| CosmoVision community | Supabase `cosmovision_*` tables + RLS + rate-limit function | video submissions, reports, moderators | requires `SUPABASE_URL` + keys (blank) | optional feature |

Implications:

- **Projects, Documents, Writing, Research, Code, Knowledge, Tasks** must be **local-first** (IndexedDB preferred over `localStorage` — larger quota, structured records, transactional), clearly labelled *"Stored on this device"*.
- Cross-device sync requires new backend tables + auth → a **new** capability, not "using the existing backend". It also implies user accounts, which do not exist.
- **File upload does not exist.** No endpoint accepts files; no storage bucket is configured. Anything resembling "upload a PDF and ask questions about it" must be either (a) client-side only with an explicit parser (PDF/DOCX/TXT/MD) and a clear "processed in your browser" statement, or (b) built on a new server endpoint + storage. No fake upload UI.

---

## 6. Navigation and IA audit

Current IA: 15 destinations, four desktop dropdown groups (Explore / Earth / Solar System / Assistant), mobile bottom bar of 6.

Your requested IA: NOVA · Home / New Chat / Search / Conversations / Projects / Documents / Research / Writing Studio / Code Studio / Knowledge Space / Tasks + Settings / Profile.

Gaps that block a truthful implementation:

| Requested | Reality | Consequence |
|---|---|---|
| Sidebar, collapsible | none — horizontal header + bottom bar | Build new shell (Phase 3) |
| Search (conversations) | no conversation records | needs the conversation store first |
| Projects, Documents, Tasks | no data model, no backend | local-first data model required |
| Knowledge Space | no uploads, no index | either client-side parsing or new backend |
| Settings | **no settings screen at all** (only header language menu) | build it; must only expose working controls |
| Profile | no auth/accounts | **do not ship** a profile screen — render "Local workspace / no account" instead, or defer until auth exists |
| Light theme | dark only (`color-scheme: dark`, no `[data-theme]`) | new token layer needed |
| Deep links | only `/cosmovision` | a real router is needed for workspace URLs (`/c/:id`, `/p/:id`, `/d/:id`) |

Accessibility of the current nav is good and should be preserved as the pattern for the new sidebar: real `<button>`s, `aria-expanded`, `aria-haspopup`, Escape to close, outside-click, `aria-current="page"` on the active tab bar item, body scroll lock for sheets.

---

## 7. Proposed removals / consolidations — **NOT EXECUTED**

Per your brief, every proposal states why, the files, dependents, data-loss risk and restore path. **Nothing here will happen without an explicit "approved" from you.**

### R1 — Consolidate the three stacked quiz modules into one
- **Why:** the Space Trivia destination mounts `SmartSpaceQuiz` + `SpaceQuizModule` + `SpaceTriviaQuiz` in one scroll. Two of them open with the same questions and near-identical score/trophy UI; the third (14 Q × EN/SI/TA) is the richest.
- **Files:** `src/components/SmartSpaceQuiz.jsx` (319), `src/components/SpaceQuizModule.jsx` (386), `src/components/SpaceTriviaQuiz.tsx` (546), render site `src/App.tsx:566-572`.
- **Dependents:** none outside App (`grep` clean).
- **Data loss:** yes, minor — `nasa_quiz_highscore` and `nasa_space_quiz_high_score`. Mitigation: keep reading them and display the best score once (no user action needed).
- **Restore:** components stay in git; revert is a one-line render change.
- **Risk:** LOW. **Recommendation:** keep `SpaceTriviaQuiz`, delete the other two from the tree in cleanup phase.

### R2 — Remove dead duplicate client path `askNasaAi`
- **Why:** targets a non-existent `/api/nasa-ai` (404 verified) and is imported by nothing in the live UI.
- **Files:** `lib/nasaApi.js:685-762`, plus the `/api/nasa-ai` entry in `server.ts:144`.
- **Dependents:** none (`grep -rn askNasaAi src lib` → only its definition).
- **Data loss:** none.
- **Restore:** git revert.
- **Risk:** NONE.

### R3 — Remove the unreachable legacy root components + committed bundle
- **Why:** `components/AaaRocketLaunch.jsx` (1,202 lines) is referenced by nothing; root `components/{CosmicCalendar,IssTracker2D,RocketLaunchSimulator}.jsx` are only thin shims re-exported by `src/components/*`; `api/index.js` (287 KB) is a **generated** artifact that `npm run build` rebuilds byte-identically — committing it invites drift.
- **Files:** `components/*`, `lib/dbCache.js` (alias of `src/lib/dbCache.js`), `api/index.js`.
- **Dependents:** the three shims **are** live (`@/components/...` imports) — they must be inlined before any deletion. `api/index.js` is referenced by `vercel.json` (`functions: api/index.js`) and the `/api/(.*)` rewrite, so it must remain **committed** or the Vercel config must change — **I recommend keeping it** and only documenting that it is generated.
- **Data loss:** none.
- **Restore:** git revert.
- **Risk:** MEDIUM if shims are removed carelessly. **Recommendation:** remove only `AaaRocketLaunch.jsx`; leave the rest documented.

### R4 — Default-off the sci-fi UI audio (and the floating voice button)
- **Why:** "laser chirp on send" + "receive chime" default-on clashes with a professional workspace; the floating mic is a third voice entry point that collides with the mobile tab bar.
- **Files:** `src/components/NasaAi.jsx` (`SpaceAudioSynthesizer`, `soundEffectsEnabled` default `true`), `FloatingVoiceControl.jsx`, `src/App.tsx:624`.
- **Dependents:** `useVoiceNavigation` (voice commands) — keep the hook, which also serves the in-composer mic.
- **Data loss:** none. **Restore:** one prop/state change.
- **Risk:** LOW. Note: this is a *default* change, not a feature deletion — the controls stay available in Settings.

### R5 — Reconcile the duplicate service worker
- **Why:** `public/sw.js` (387 lines, hand-written, `nasa-*` cache names + background sync) is copied into `dist/` **and overwritten** by the Workbox `generateSW` output at the same path `/sw.js`; `src/main.tsx` registers `/sw.js`.
- **Files:** `public/sw.js`, `vite.config.ts` (`VitePWA.workbox`), `src/main.tsx`.
- **Dependents:** `OfflineIndicator` + `useTelemetrySync` rely on the *public* worker's background-sync queue.
- **Data loss:** queued offline telemetry requests could be orphaned (they are requests, not user content).
- **Restore:** git revert; both workers remain in history.
- **Risk:** MEDIUM — offline behaviour needs a manual test. **Recommendation:** investigate before touching; not a Phase 3 task.

**Additional INVESTIGATE items (no proposal yet):** Ambient soundscape control; in-chat APOD quiz; two overlapping ISS trackers; CosmoVision (depends on optional YouTube/Supabase credentials).

---

## 8. Design system and brand audit

**Strengths**

- Real token layer: `@theme` in `src/styles/tokens.css` exposes `bg-surface`, `text-ink-2`, `border-line`, radii, elevation, motion curves; legacy glass classes are aliased to it (`src/globals.css`) so old modules cannot introduce a second theme.
- Self-hosted fonts with Sinhala/Tamil fallbacks already wired in `src/index.css` — exactly what your typography requirement needs.
- `MotionConfig reducedMotion="user"` + CSS media query; `skip-link`; `--focus` ring token.
- No neon soup: the sci-fi residue is mostly restrained.

**Gaps against your spec**

| Requirement | Today |
|---|---|
| Deep Space `#08090D` / surface `#10121A` / elevated `#171A24` | `#03060e` / `#0a1322` / `#14243a` — a *bluer* navy palette. Changing it touches every token consumer (safe, tokens are centralised) but must be validated against the ~30 legacy modules that hardcode `slate-950`/`cyan-400` classes. |
| Light theme | absent |
| Electric blue/violet accents, restrained | cyan `#5ed3f2` + azure `#4f8dff` + derived violet `#c4b5fd` — present but cyan-dominant |
| Liquid glass (translucent, controlled blur, subtle borders) | present, partly as a legacy compat layer |
| NOVA wordmark/logo/app icon/favicon/PWA branding | **no NOVA identity at all**: `public/logo.png`, `icon.svg`, `manifest.json` name *"NASA Learn Space Explorer"*, `index.html` title *"Space Explorer — NASA observation…"*, header brand *"NASA Space Explorer"*. API titles already say "NOVA AI" (`X-Title`). |
| Preserve recoverable originals | plan: copy existing assets to `public/brand/legacy/` before drawing new ones |

Note on branding legality: the current identity leans on "NASA" in the *product name* and asserts "not affiliated with NASA" in the footer. Rebranding to NOVA AI actually **reduces** that confusion — a positive for the new identity, provided the space data sources keep their attribution.

---

## 9. Responsive audit

- Breakpoints in use: `sm 640` / `lg 1024` (+ custom `xs 26rem`). Header nav collapses to the bottom bar below `lg`; the mobile "More" sheet is a full-screen drawer.
- Tablet (≈768–1024) lands in the awkward middle: **header menus hidden, bottom bar shown, no sidebar** — a workspace shell with a rail/sidebar will fix this by design.
- Chat surface: `min-h-[640px] lg:min-h-[720px]` card with `max-w-4xl` inner column and `max-w-[82-92%]` bubbles; fine on phone, but as a *page* it sits inside the `max-w-[1400px]` destination wrapper — a full-height chat layout is needed for the workspace.
- Safe areas handled (`safe-bottom`, `viewport-fit=cover`); body bottom padding `pb-28` reserves the tab bar; `overflow-x` not observed as an issue in review, but the chat page's long unbroken mono content (`<pre>`) relies on `overflow-x-auto` only inside code blocks.

---

## 10. Performance audit (measured)

| Metric | Value |
|---|---|
| Entry JS | **707.28 kB min / 195.97 kB gzip** (`index-*.js`) |
| Entry CSS | **235.71 kB min / 47.38 kB gzip** |
| JS chunks | **70** |
| `dist/` total | **8.1 MB** |
| PWA precache | **130 entries / 5,418 KiB** |
| Build time | 2.6 s |
| Heaviest lazy chunks | `three.module` 716 kB (183 kB gz), `model-viewer` 426 kB (138 kB gz), `BarChart` (recharts) 399 kB (113 kB gz), `Space3DViewer` 398 kB (120 kB gz) |

Observations

- Code-splitting is deliberate and healthy: home/APOD in the shell, three.js/Leaflet/charts behind `React.lazy` with a poster fallback (`Hero.tsx` lazy-loads `OrbitalEarth`).
- The **entry** is still large (~196 kB gz) for a workspace shell. A workspace-first Phase 3 should be able to cut it materially: the space destinations become one lazy group, and the shell needs only router + chat + data layer.
- The 236 kB CSS is a Tailwind-scan artifact of 30+ legacy science modules; a workspace pass will trim unused variants.
- Runtime: chat uses a 16 ms interval typewriter; simulated streaming renders character-by-character into React state (fine for short answers, wasteful for 10k-char responses). Real SSE + rAF-batched append will be cheaper *and* honest.
- Cache headers: `/api/health`, `/api/nova/config` `max-age=60, swr=120`; all other API GETs `no-store`. Sensible.
- No virtualisation anywhere; 25-message cap hides the problem today. A conversation list with 500 items needs virtualisation or pagination.

---

## 11. Accessibility audit

**Present:** skip link; `aria-current` on tab bar; `aria-expanded/haspopup` menus; Escape/outside-click closes; `prefers-reduced-motion` (CSS + MotionConfig); `role="status"` skeletons; 9 files with `aria-live`; focus-visible token; `lang` kept in sync on `<html>`.

**Defects found**

1. **`ink-4` (#5f7290) fails WCAG AA for normal text on every surface** — measured ratios: 4.15 (void), 3.80 (surface), 3.57 (surface-2), 3.20 (elevated); AA requires 4.5. It is used for meta labels at 9.5–11 px (e.g. header subtitle, nav hints). `ink-3` (#8294ad) passes: 6.55/6.01/5.64/5.05. **Fix:** raise `--color-ink-4` (or restrict it to ≥18.66 px bold / decorative).
2. **Chat component has exactly one `aria-label`** in 1,979 lines. The mic toggle, stop/send, copy, export, import and speed buttons rely on `title`/icons. Screen-reader names are therefore missing or generated from icons.
3. **Composer textarea has no accessible name** (placeholder only) — `NasaAi.jsx:1884-1901`.
4. **Streaming replies are not announced**: no `role="log"`, `aria-live` or `aria-busy` on the message list or the streaming bubble.
5. **10 px text in the mobile tab bar** (`text-[10px]`, and `text-[8px]` for CosmoVision) is below comfortable mobile legibility, though not a WCAG failure per se.
6. Contrast of body copy is strong (`ink-2` 10.8–11.7), accent `atmo` 10.7–11.7 — good.

These become acceptance criteria for Phase 3 (shell) and Phase 4 (chat).

---

## 12. Security audit

**Present and verified**

- **All API keys are server-side.** `.env*` gitignored, `.env.example` documents them; `GET /api/nova/config` returns booleans only (verified by curl and by `test-nova-chat.mjs` / `test-security-performance.mjs`).
- **No credential in build artifacts** — `test-space-build-security.mjs` passes and greps the bundle/logs.
- **Validation** on the chat handler: body caps, message count/length/roles, language and provider allowlists, last message must be user.
- **Rate limiting**: chat 15/min (Express) + 8/min (handler); YouTube meta 30/min; community 20/min. Per-process, in-memory (documented limitation).
- **Headers**: CSP (`object-src 'none'`, `frame-src` YouTube-only, `base-uri 'self'`, `form-action 'self'`), `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy` (camera/mic/geo off), HSTS in production.
- **Supabase** used only for community writes, with RLS and server-validated JWT (`auth.getUser`), service-role key server-only.

**Weaknesses / to watch**

| Issue | Detail | Severity |
|---|---|---|
| CSP allows `'unsafe-inline'` for scripts (and `'unsafe-eval'` in dev) | no nonce/hash; Tailwind-injected styles need `'unsafe-inline'` **styles**, not scripts | MEDIUM — tighten scripts when the shell is rebuilt |
| `connect-src https:` is wide open | allows any HTTPS exfil endpoint if XSS occurs | MEDIUM |
| `Access-Control-Allow-Origin: *` **with** `Allow-Credentials: true` in dev/unset-origins | invalid combination; browsers reject credentialed `*`, but it signals loose config | LOW |
| In-memory rate limiter | resets per warm process; not deployment-wide | LOW (documented) |
| Markdown renderer is custom React elements (not `dangerouslySetInnerHTML`) | **good**: no HTML injection path today; keep it that way; if you add a markdown library, sanitise | positive |
| `X-Powered-By: Express` | fingerprinting | cosmetic |
| Prompt-injection surface | workspace features that paste document text into prompts will need clear delimiters + instruction hierarchy | future MEDIUM |
| Local-first storage | user documents in IndexedDB: no encryption at rest beyond disk encryption; must be stated in UI | future LOW |

---

## 13. Localisation audit

- **647 keys in each of EN / SI / TA, 0 missing** (scripted check against `src/i18n.ts` resources).
- Modules: `translations.ts` (379), `interfaceCopy.ts` (479), `earthIntelligence.ts` (765), `spaceShorts.ts` (227), `scienceFeed.ts` (87), `pageCopy.ts` (98).
- Sinhala/Tamil fonts self-hosted (`@fontsource/noto-sans-sinhala|tamil`) with `--font-sans` fallback chain — correct for Unicode shaping.
- Local engine detects Sinhala/Tamil, including Singlish/Tanglish (`spaceLocalAiEngine.js`).
- **Gaps to plan for:** no `dir` handling (fine — all three are LTR); no date/number localisation strategy beyond `toLocaleString`; **every workspace string will need 3 new translations** (est. 250–350 new keys); the chat provider labels and some page copy bypass i18n with inline `lang === 'si' ? … : …` ternaries (e.g. `SpaceLab3D`, `NasaAi` placeholders, `App.tsx` header labels) — the new shell must not repeat this.
- `scripts/i18n-audit.mjs` is **broken** on current Node (imports `src/i18n.ts` without a TS loader → `ERR_MODULE_NOT_FOUND`). Not in `npm test`, so it rots silently. Fix in cleanup.

---

## 14. Repository / process hygiene

- **No ESLint/Prettier**; "lint" is `tsc --noEmit` only.
- **`tsconfig` is not strict** — no `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`. `allowJs: true` lets 1,979-line `.jsx` files go unchecked. A workspace build should turn `strict` on for *new* code at minimum (full-repo strict would surface hundreds of errors in legacy components).
- **No component/UI tests, no E2E.** 147 assertions cover the server, AI handler, Earth maths, PWA/security — zero cover the chat UI, navigation, or rendering. Phase 6's "responsive tests" requirement has no existing harness (no Playwright).
- Committed generated bundle `api/index.js` (287 KB) — reproducible from source (`npm run build` produced an identical file), so it is safe but drift-prone.
- `.aistudio/artifacts/brain/<uuid>` is committed (build-agent scratch).
- Two parallel trees (`src/` live, root `components|lib|hooks|utils` legacy shims) — documented, but a trap for new contributors and for me: `@/lib/nasaApi` resolves to **root** `lib/`, not `src/lib/`.
- `package.json` name is `react-example`; version `0.1.0`; no license metadata.

---

## 15. Gap analysis — requested NOVA workspace vs. today

| Your requirement | Today | Work type |
|---|---|---|
| ChatGPT-quality chat | good bones, custom markdown, simulated stream | **Rebuild surface + add SSE + conversation store** |
| Conversation list / search / rename / archive | none | New data model (local-first) + UI |
| NOVA Home dashboard (welcome, recents, quick tools) | space dashboard | **Replace in place** |
| Projects (convos, instructions, docs, history) | none | New model, project-scoped prompts passed to the *existing* handler as message context |
| Document Studio (create/edit/summarise/export) | none | New module; edits are local, AI actions call existing chat route |
| Writing Studio | none | New module over the same route |
| Research workspace + honest citations | none (no web search exists) | New module, **no fabricated citations**: sources only when user supplies them; label AI-suggested vs user-supplied |
| Code Studio | none; chat renders code blocks | New module; no execution environment → must say so |
| Knowledge Space (upload, ask about docs) | none; no upload endpoint | Client-side parsing, or new backend — decision needed |
| Task workspace | none | Local-first CRUD; AI task plans via existing route |
| Sidebar + collapsible + mobile drawer | header menus + bottom bar | New shell |
| Settings (theme, language, chat, workspace, a11y) | none | New screen, **only working controls** |
| Profile | no auth | **Not shippable as-is** — either local "workspace" identity or defer |
| Light theme | dark only | New token layer |
| NOVA brand (logo, wordmark, icons, favicon, PWA) | NASA-branded | New assets + manifest/title/meta |
| Preserve AI engine | yes | No rewrite; additive only |
| Trilingual EN/SI/TA | 647×3 complete | Extend to all new strings |
| Streamlined performance | 196 kB gz entry | Should improve with workspace-first shell |

---

## 16. Blocking decisions required before Phase 2

These change the blueprint materially. I will not start Phase 3 until they are answered.

1. **The science suite.** Keep the fifteen space destinations as a grouped section inside NOVA ("Explore"), or retire/relocate them? *(My recommendation: keep, grouped, lazy — they are the product's substance and were mandate-protected.)*
2. **Persistence model.** Local-first only (device-scoped, no accounts, honest labels), or add Supabase user accounts + tables for cross-device sync (requires credentials and a schema migration)?
3. **AI capacity.** Can you supply a working `ARENA_API_KEY` (or OpenRouter/Gemini) for verification? Without one, productivity features are gated to "AI unavailable" states and Phase 6's "AI chat tests" cannot include a real model round-trip. Also: may I add an **additive** SSE stream route (JSON contract untouched) to get genuine streaming?
4. **Removals.** Approve R1–R5 as scoped, or a subset? (Nothing is removed until you say so.)
5. **Branding.** Confirm the NOVA wordmark direction and that "NASA" leaves the *product* name while remaining the attributed *data source*. Legacy assets will be preserved under `public/brand/legacy/`.

---

## 17. What this audit did not do

- No product file, dependency, env var, asset, manifest, config or test was modified.
- No feature was removed, no data migrated, nothing deployed, nothing merged.
- The only new file is this report. `dist/`, `node_modules/` exist locally from verification and are gitignored.

**Current live preview (dev server) is the untouched application**, provided only so you can sanity-check the claims above.

---

*End of Phase 1.*
