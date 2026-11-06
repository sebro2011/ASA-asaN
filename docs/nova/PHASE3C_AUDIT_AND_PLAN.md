# Phase 3C / 3D — Audit and implementation plan

**Branch:** `arena/fc7173ec-asa-asan` (identical to `main` @ `93cb019`)
**Date:** 2026-11-06
**Status:** plan approved; 3D-1 delivered (see §6)

---

## 0. Scope correction (read this first)

The approved blueprint (§13) numbers the phases like this:

| Blueprint | Content | Current state |
| --- | --- | --- |
| **3A** | Shell, routing, tokens, themes, Explore extraction | done (`bbc9fea`) |
| **3B** | Auth, Supabase schema, sync, profile | done (`d741a81`), live DB verified |
| **3C** | **Settings** — every working preference persisted to`profiles` | not started |
| **3D** | **Chat surface** — conversation list/search/rename/archive/pin/delete+restore, thread, composer, markdown, streaming, regenerate/edit, per-message actions, error taxonomy | not started |

When I offered "Phase 3C (Conversations + Search)" earlier, I was labelling the blueprint's **3D**. The conversation list, search and thread are all 3D. I will use the blueprint's numbering from now on, and this document covers **both 3C and 3D** so you can pick.

---

## 1. Audit findings

### 1.1 What already exists and must not regress

**The chat transport is complete and untouched.** `POST /api/nova/chat` (and the identical `/api/openrouter/chat`, `/api/chat` aliases) call `handleNovaChatRequest`, which:

- validates `{ messages: [{role, content}], lang, provider }` with `MAX_MESSAGES` and byte limits,
- picks a provider order from the server env (`ARENA_API_KEY` → `OPENROUTER_API_KEY` → `GEMINI_API_KEY` → bundled local engine),
- returns `200 { text, suggestions, model, provider, lang, fallback }`,
- returns stable error codes the current UI already maps: `PROVIDER_NOT_CONFIGURED`, `UPSTREAM_RATE_LIMITED`, `UPSTREAM_NETWORK_ERROR`, `PROVIDER_UNAVAILABLE`, `PROVIDER_AUTH_ERROR`, `INTERNAL_ERROR`.

This contract is **frozen** for 3D. The new surface is a client of it, not a replacement.

**`src/components/NasaAi.jsx` (1,979 lines) is the existing chat experience.** It owns:

- provider selection persisted at `nova_ai_provider_v1`,
- provider availability flags read from `GET /api/nova/config` (booleans only, no secrets),
- a **typewriter reveal** — the server returns the whole reply, and a timer reveals it (`streamingMessageId`, `streamingText`, `streamTimerRef`); it is *not* a real stream,
- the error-code → copy map,
- local thread persistence at `nasa_ai_chat_thread_v3` (which 3B's import already reads).

3D reuses this behaviour (typewriter + taxonomy) inside the new shell; the old component stays untouched behind `/explore` until 4A/cleanup.

**Data layer is ready and tested.** `src/data/repositories.ts` already exposes what the surface needs:

- `conversationRepo.list(limit, before)` — keyset pagination on `(last_message_at, id)`,
- `conversationRepo.get(id)`, `.create(userId, {id, title, projectId})`, `.update(id, patch)`, `.softDelete(id)`,
- `messageRepo.list(conversationId, afterSeq)`, `.countForConversation(id)`, `.create(userId, {conversationId, role, content, provider, model, createdAt})`,
- sync engine + outbox for offline writes.

**Copy is partly there.** `workspaceCopy.ts` already ships `wsNewChat`, `wsSearch`, `wsSearchHint`, `wsAreaChatDesc`, `wsMenuChat` in EN/SI/TA — used today only by the "planned module" card.

### 1.2 What is missing

| Gap | Evidence |
| --- | --- |
| No conversation route | `RouteName` has `chat` (with optional `:id`) but no conversation-list route; `/chat` currently renders `PlannedSurface` |
| No search surface | No `search` route; `CommandPalette.tsx` searches **commands only** and its own comment says conversation/document search "arrives with the modules that own that data" |
| No markdown rendering | No `react-markdown`, `remark-gfm` or `highlight.js` in `package.json` dependencies — replies render as plain text today |
| Messages are never persisted to Supabase | `messageRepo.create` exists but nothing calls it; the only history is `nasa_ai_chat_thread_v3` in localStorage |
| Settings are local-only | Theme/language/sidebar/motion/contrast persist to `localStorage`; `AuthProvider` pushes device values up on sign-in, but no UI writes a *cloud* preference directly |
| Search indexing | No `tsvector` columns or GIN indexes in the 3B schema; only `documents_user_title_idx` (btree on `lower(title)`) |

### 1.3 Search options (decision needed)

| Option | Cost | Quality |
| --- | --- | --- |
| **A. PostgREST `ilike`** on `conversations.title`, `messages.content`, `documents.title` | zero migration, works today, RLS-safe | substring match, no ranking, slow beyond a few thousand rows |
| **B. `tsvector` + GIN** generated columns on the three tables | one small additive migration; `websearch_to_tsquery` ranking | proper ranking, fast, still RLS-safe |

Recommendation: **B**, with the migration written and PGlite-tested like 3B's. It is additive and idempotent; A remains the fallback if you prefer no new migration now.

---

## 2. Risks and how the plan handles them

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | Rewriting the chat UI breaks the AI engine | New surface only *calls* `/api/nova/chat`; `server.ts`, `server/novaChat.js`, prompts and providers are untouched. The 15 science destinations keep the old component. |
| R2 | Signed-out users lose chat | Chat must work without a session (localStorage thread), identical to today; Supabase persistence is layered on when signed in. Migration of the local thread already exists from 3B. |
| R3 | Markdown = XSS | `react-markdown` renders to React elements with no `dangerouslySetInnerHTML`; raw HTML disabled; links get `rel="noopener noreferrer"`. No `rehype-raw`. |
| R4 | Bundle budget | markdown + highlighter are heavy; they load only inside the chat route chunk (already lazy). Entry chunk must stay ≤ 620 kB (currently 614 kB). |
| R5 | Streaming claims | True SSE is 3D-3 and needs a live provider key to test. Until it is implemented **and** proven, the UI keeps the honest typewriter reveal and does not say "streaming". |
| R6 | Duplicate/missed messages on retry | Inserts use client-generated UUIDs (idempotent on retry) and `createdAt` is sent so ordering survives offline replay. |
| R7 | Search leaks other users' rows | Search goes through PostgREST with the caller's JWT; RLS applies. Verified live: `anon` has no grant, `authenticated` only sees own rows. |
| R8 | Provider unconfigured in local dev | The surface reads `/api/nova/config` and disables provider picks that are off, exactly like `NasaAi.jsx`; the local engine still answers. |

---

## 3. Implementation plan

### 3C — Settings (small, ~1 day)

1. `src/workspace/settings/SettingsSurface.tsx`: theme, motion, contrast, language, sidebar, font scale, default surface, preferred provider — every control writes `localStorage` **and** `profiles` (via `profileRepo.update` + outbox).
2. Reuse `ThemeOptions` and `LanguageMenu`; add the missing controls only where behaviour exists (no decorative toggles).
3. `/settings` becomes `live` in `navConfig`; `AuthProvider` keeps device-wins-on-first-sign-in.
4. Tests: preference round-trip, signed-out vs signed-in, SI/TA copy.

### 3D-1 — Chat core (the bulk)

1. `src/workspace/chat/ChatSurface.tsx` + `ConversationList.tsx` + `Thread.tsx` + `Composer.tsx`.
2. `/chat` = new conversation; `/chat/:id` = existing thread (route already typed, `id` already supported).
3. Send flow: append user message → `POST /api/nova/chat` → append assistant message; both persisted via `messageRepo.create` when signed in, and to `nasa_ai_chat_thread_v3` when not.
4. Conversation list: keyset pagination (`conversationRepo.list`), rename, pin, archive, soft-delete + restore, honest empty state.
5. Error taxonomy ported verbatim from `NasaAi.jsx`; retry button; the reply is labelled with its real provider/model.
6. Typewriter reveal kept (honest, no "streaming" claim).

### 3D-2 — Rich messages

1. `react-markdown` + `remark-gfm` + `highlight.js` inside the chat chunk only; sanitised by construction.
2. Per-message actions: copy, regenerate (re-send the preceding user turn), edit-and-resend (user message), and a "showing cached reply" note when a reply was not persisted.
3. Virtualised-ish rendering cap (last 200 messages, `afterSeq` paging for older).

### 3D-3 — Real streaming (only if you approve and a key is available)

1. Additive `POST /api/nova/stream` (SSE) that reuses the same validation and provider calls with `stream: true`; `/api/nova/chat` stays exactly as-is.
2. Arena smoke test requires `ARENA_API_KEY`; without it I can only verify the plumbing with a mocked upstream, which I will state plainly.
3. UI upgrades to render deltas only when the endpoint answers `text/event-stream`; falls back to the typewriter path otherwise.

### Search

- Option B migration `20261106_nova_search.sql`: generated `tsvector` columns + GIN indexes on `conversations.title`, `messages.content`, `documents.title`; `searchRepo` calling `websearch_to_tsquery` through PostgREST RPC.
- `SearchSurface` at `/search` + palette integration (Cmd/Ctrl+K gains a second group once results exist).
- PGlite tests: ranking order, RLS isolation, empty query, SI/TA text.

### Verification for every stage

`tsc --noEmit` · full `npm test` (currently 206/206) · `npm run build` with the 620 kB entry budget · `npm run verify:explore` (15/15) · SI/TA/EN render tests · keyboard-only pass (composer, list, palette) · no new console errors in jsdom.

---

## 4. Rollback

All work is additive and route-scoped:

- `navConfig` entries flip back to `planned` → the existing `PlannedSurface` returns, nothing else changes.
- New files live under `src/workspace/chat|settings|search`; deleting the folder plus the two route lines restores 3B exactly.
- One optional migration (`20261106_nova_search.sql`) with its own `..._rollback.sql` that drops only the generated columns and indexes.
- No existing table, column, policy, route, provider or component is modified or removed.

---

## 5. Decisions I need before writing code

1. **Scope of this next delivery** — settings first (3C), chat core (3D-1), or chat + rich messages (3D-1+3D-2)?
2. **Markdown** — add the three packages (better replies, ~120 kB in the chat chunk) or keep plain text for now?
3. **Search** — additive `tsvector` migration (ranked, recommended) or `ilike` only (no migration)?
4. **Signed-out chat** — keep working locally and sync on sign-in (recommended, matches today), or require sign-in for `/chat`?

---

## 6. Decisions recorded and what was delivered

**Your decisions (this delivery):**

| Question | Answer |
| --- | --- |
| Scope | **3D-1 chat core** (list + thread + composer + persistence) |
| Markdown | **added** — `react-markdown`, `remark-gfm`, `rehype-highlight` |
| Search | **`tsvector` + GIN** — recorded; the migration ships with the search surface, not now (an unused index is dead weight) |
| Signed-out chat | **sign-in required** — `/chat` is wrapped in `RequireAuth`, so every row has a real owner |

**Delivered files**

| File | Purpose |
| --- | --- |
| `src/workspace/chat/chatClient.ts` | typed client of `POST /api/nova/chat`, error-code normaliser |
| `src/workspace/chat/useChatData.ts` | `useConversations`, `useThread` over the 3B repositories |
| `src/workspace/chat/MessageBody.tsx` | markdown + GFM + highlighting, no raw HTML, safe links |
| `src/workspace/chat/ChatSurface.tsx` | list, thread, composer, list actions, typewriter reveal |
| `src/styles/workspace.css` | `.nova-prose` typography for replies |
| `scripts/test-workspace-chat.mjs` | 7 behaviour tests |
| `src/auth/AuthProvider.tsx` | exposes `client` so surfaces can use repositories |
| `src/data/repositories.ts` | `messageRepo.create` now writes `is_error` |
| `src/App.tsx` | `/chat` and `/chat/:id` behind `RequireAuth`, lazily loaded |
| `src/app/navConfig.ts` | Chat flipped `planned` → `live` |

**Results:** `tsc` clean · `npm test` **213/213** (18 suites, +7 new) · build 2.85 s · entry **624.44 kB / 169.79 kB gz** with chat in its own 348 kB chunk · `verify:explore` **15/15**, sources unchanged.

**Bugs the tests caught before you would have:**
1. messages sent to a *just-created* conversation were never persisted (the hook still held a null id) — fixed by passing the new id explicitly;
2. `is_error` was silently dropped by `messageRepo.create`, so failed replies looked like normal ones — the column is now written.

**Not in this delivery:** search surface + `tsvector` migration, real SSE streaming, and 3C Settings. The typewriter reveal stays honest — nothing in the UI claims streaming.

## 7. Settings (3C) and search — delivered

Both were asked for in the same breath ("කෙලින්ම settings/search එකට යමු"), so they are recorded together.

### 7.1 Settings — `/settings`

The rule for this surface: **only controls that do something**. Every control below writes state that something else reads.

| Control | Where it persists | What reads it |
| --- | --- | --- |
| Theme (dark / light / system) | `localStorage` `nova_theme` | `ThemeProvider` → `data-nova-theme` |
| Higher contrast (switch) | `localStorage` `nova_contrast` | `ThemeProvider` → `data-nova-contrast` |
| Reduce motion (switch) | `localStorage` `nova_motion` | `ThemeProvider` → `data-nova-motion` |
| Language (English / සිංහල / தமிழ்) | `localStorage` `i18nextLng` | i18next, whole app |
| Chat provider default (select) | `profiles.preferred_provider` | the chat composer's provider select |
| Account card | — | links to `/profile` (verification, export, import live there) |

* Appearance and language are **device** preferences and work signed out; the provider default lives in `profiles`, so the select is **rendered only when signed in** — signed out, the surface says why instead of showing a dead control.
* **Deliberately absent:** `font_scale` and `default_surface`. Both columns exist in the schema, but nothing in the app reads them; a slider that changes nothing would be a lie. They stay for the phase that wires them up.
* Settings reuses `ThemeOptions` and `useLanguage()` rather than duplicating either, so the settings page and the top-bar menus can never disagree.
* `settings` flipped `planned` → `live` in `navConfig.ts`; `/settings` is lazy-loaded (5.08 kB) to keep it out of the entry bundle.

**Tests** — `scripts/test-workspace-settings.mjs`, 5 cases: theme flips the attribute *and* persists; both switches flip `data-nova-contrast` / `data-nova-motion`; language switches the visible copy to Sinhala and Tamil and persists; signed out there is **no** `select` and the reason is shown; signed in, choosing a provider writes `preferred_provider` to the profile and confirms with `aria-live` copy.

### 7.2 Search — `/search`

**Database** — `supabase/migrations/20261106_nova_search.sql`, additive and idempotent:

* `search_vector tsvector` **generated always … stored** on `messages`, `documents` (title weight `A`, body `B`) and `conversations` (title `A`), each with a **GIN** index. Generated columns cannot drift from the row, so there is no trigger to forget.
* `to_tsvector('simple', …)` on purpose: NOVA is trilingual, and the language-specific configs would stem Sinhala and Tamil wrongly. `simple` tokenises and lowercases without inventing stems.
* Bodies are indexed to 200 000 characters (a tsvector is capped at 1 MB; `documents.content` allows 400 000), so the index cannot overflow.
* `public.nova_search(query, match_limit)` — `security invoker`, so **RLS decides what comes back**; `websearch_to_tsquery` (never raises on odd input), `ts_rank` ordering, `ts_headline` snippets, limit clamped to 1–50, and one **substring fallback pass** only when the ranked pass found nothing (so "streami" still finds "streaming"). Input shorter than two characters returns nothing, and `%`/`_` are escaped, not treated as patterns.
* Applied to the live project (`fktqzfzzsjaaaiqfimax`) as `nova_search_full_text`; verified: 3 `search_vector` columns, 3 GIN indexes, `EXECUTE` granted to `authenticated` and **not** to `anon`.

**Surface** — `src/workspace/search/SearchSurface.tsx`, route `/search`, behind `RequireAuth`, lazy-loaded (9.09 kB):

* 220 ms debounce, query mirrored into `?q=` (deep links work), so the same burst of typing is one round trip.
* `ts_headline` `<mark>` markers are parsed into segments and rendered as React text — no `dangerouslySetInnerHTML`, and a title that looks like `<img onerror=…>` stays text.
* Scope chips (all / messages / documents / conversations) filter the returned rows locally with counts; no second query.
* Failure shows an **alert with a retry**, never an empty "no results".
* Message and conversation hits link to the thread. Document hits are listed **without a link** and labelled Phase 4B — the documents module does not exist yet, and a link into its placeholder would be a dead end.
* ↑ / ↓ / Enter / Esc work from the search field; ⌘K now offers "Search your workspace".
* 24 new `wsSearch*` keys in English, Sinhala and Tamil.

**Tests** — `scripts/test-workspace-sql.mjs` +3 (real PGlite PostgreSQL): ranking and RLS isolation through the function, title weight `A` beating body weight `B`, snippet markers, the substring fallback, short/noisy/wildcard input, limit clamping, `anon` denied. `scripts/test-workspace-search.mjs` +6: two-character gate, debounce → one RPC call with the exact arguments, render order and highlights, HTML-looking titles staying text, local scope filtering, error → retry recovery, document hits not linked, keyboard → `/chat/:id`, `?q=` deep link.

### 7.3 Results

`tsc` clean · `npm test` **227/227** (20 suites; 213 → 227) · build 2.88 s · entry **565.12 kB / 149.54 kB gz** (down from 624.44 kB, because Settings and Search are now their own chunks: 5.08 kB and 9.09 kB, chat 348.13 kB) · `verify:explore` **15/15**, science sources unchanged.

### 7.4 Live-database check of the search function

The function was then exercised **against the live project** (`fktqzfzzsjaaaiqfimax`), not only PGlite, through the Management API query endpoint. The probe seeded two accounts in an explicit transaction, switched to `authenticated` with a real JWT subject (`request.jwt.claim.sub`), called `public.nova_search` and rolled the transaction back:

| Check | Result |
| --- | --- |
| `auth.uid()` inside the call | the acting user's own id |
| Rows visible to account A | 2 (the document + the message); **0** of B's rows |
| Ordering | `document / Radiation notes / 0.76807` then `message / Arena live probe / 0.09910` — title weight `A` ahead of body weight `B` |
| Substring fallback (`'radia'`) | 2 rows on the live engine |
| Rows visible to account B | 1 (its own message); **0** of A's conversations or documents |
| Cleanup | `auth.users`, `profiles`, `conversations`, `messages`, `documents`, `storage.objects` all back to **0** after the rollback |

So ranking, the fallback and RLS are proven on the real Postgres 17 engine with real rows — but through the SQL endpoint, **not** through a browser talking to `supabase.co`. The HTTP path (browser → PostgREST → `rpc/nova_search`, with the anon/publishable key and a user JWT) has still not been exercised; the project has no real accounts yet, and this sandbox has no network route to the project.

### 7.5 Storage policies — still a dashboard task

`storage.objects` is owned by `supabase_storage_admin`; `postgres` is not a member of that role (`pg_has_role` → false) and `SET ROLE` is refused (42501), so the four `knowledge` object policies **cannot** be created from SQL. Checked live: 0 policies, so the bucket currently fails closed — nothing can be read or uploaded by a client. Exact dashboard steps, the four policy definitions and the verification queries are in **`docs/nova/STORAGE_POLICIES_DASHBOARD.md`**. No shipped feature uploads yet (Knowledge is Phase 4E), so nothing is blocked today.

### 7.6 Not verified / not delivered

* No browser → PostgREST round trip: the search surface was exercised against a fake Supabase client, the SQL against PGlite **and** the live engine (§7.4). The HTTP leg is unproven.
* `storage.objects` policies must be created in the dashboard (§7.5).
* Documents, writing, research, code, knowledge and tasks are still `planned`; document search returns hits that lead nowhere until 4B.
* No streaming, no offline search, no recent searches.
