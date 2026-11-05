# NOVA AI — Phase 2 Product Blueprint

**Product:** NOVA AI — AI Assistant + AI Productivity Workspace
**Branch:** `arena/471768c6-asa-asan` · **Date:** 2026-11-05
**Basis:** Phase 1 audit (`docs/nova/PHASE1_AUDIT.md`) + the four decisions you approved
**Status:** Specification only. **No product code has been written.** Implementation begins at Phase 3 after your approval of this document.

### Decisions this blueprint is built on

| # | Decision | Consequence |
|---|---|---|
| D1 | **Science suite kept, demoted to a secondary "Explore" surface** | Workspace-only sidebar; all 15 destinations preserved behind `/explore`; every science chunk stays lazy |
| D2 | **Supabase is the primary cloud backend** — auth, profiles, conversations, projects, documents, tasks, RLS, cross-device sync, migrations, safe localStorage migration | New schema + auth UI + data layer; service-role key never reaches the browser |
| D3 | **Arena key will be provided; add real streaming** | Additive SSE route; existing JSON contract, caps, prompts untouched; provider verified by smoke test before it becomes primary |
| D4 | **Cleanup: dead code only (R2 + partial R3)** | `askNasaAi` + unused `/api/nasa-ai` references + `components/AaaRocketLaunch.jsx`; quizzes, audio, service worker, floating mic all stay |

---

## 1. Product architecture

### 1.1 Two surfaces, one product

```
NOVA AI (single SPA)
├── WORKSPACE  (primary, authenticated)      /            Home
│                                            /chat, /chat/:id
│                                            /projects, /projects/:id
│                                            /documents, /documents/:id
│                                            /writing, /writing/:id
│                                            /research, /research/:id
│                                            /code, /code/:id
│                                            /knowledge
│                                            /tasks
│                                            /settings, /profile
└── EXPLORE    (secondary, public, preserved) /explore                  directory of 15 destinations
                                             /explore/apod, /explore/earth, /explore/3d, …
                                             /cosmovision  (kept as an alias, deep-link compatible)
```

- The workspace is the product's front door. Explore is reachable from the sidebar, the Home "Explore" card and the mobile "More" sheet — never competing with the workspace in primary navigation.
- **Route guard:** workspace routes require a session. Unauthenticated visits render the same shell with a sign-in panel in place of content (no redirect flash, no fake data).
- **Explore is public** and keeps its existing tab-state behaviour internally, so no science component changes.
- `/cosmovision` keeps working (existing `replaceState`/`pushState` bridge in `App.tsx` is preserved and now resolves into `/explore/cosmovision`).

### 1.2 Runtime layering

```
src/
├── app/                     new shell: Router, AppShell, route table, guards
│   ├── Router.tsx           ~140 LOC history router (no new dependency)
│   ├── AppShell.tsx         sidebar / topbar / mobile drawer / bottom bar
│   ├── routes.tsx           typed route table + lazy boundaries
│   └── providers.tsx        Auth, Theme, Settings, Toast, QueryCache-of-hooks
├── workspace/               primary product
│   ├── home/                dashboard
│   ├── chat/                conversation list, thread, composer, message, markdown
│   ├── projects/            list, detail, instructions, related items
│   ├── documents/           unified editor + AI action bar (document/writing/research/code)
│   ├── knowledge/           file upload, index status, ask-about-documents
│   ├── tasks/               board + list, AI plan generation
│   ├── settings/            all preferences (only working controls)
│   └── profile/             account, sign out, export, delete
├── data/                    repository layer (Supabase + adapters)
│   ├── supabaseClient.ts    singleton, runtime config
│   ├── repositories/*.ts    conversations, projects, documents, tasks, knowledge, profiles
│   ├── migrateLegacyChat.ts legacy localStorage → cloud (verified, non-destructive)
│   └── types.ts             domain types
├── explore/                 thin wrapper that mounts today's 15 destinations
├── ui/                      design system primitives (extend existing)
├── components/              existing science components — untouched except where noted
└── styles/                  tokens.css (extended), themes.css (new)
```

The existing `src/App.tsx` (637 lines) is split into: `explore/ExploreApp.tsx` (today's tab shell, behaviour preserved) and `app/AppShell.tsx` (new). No science component file is rewritten.

### 1.3 Dependencies

| Add | Why | Size (gz, est.) |
|---|---|---|
| `react-markdown` + `remark-gfm` | correct GFM (tables, nested lists, links, task lists) beats extending the 130-line bespoke parser; renders to React nodes → no `dangerouslySetInnerHTML` | ~26 kB |
| `highlight.js` (core + 9 languages, **lazy per code block**) | real syntax highlighting with a token-tinted theme | ~12 kB on demand |
| *(existing)* `@supabase/supabase-js` | already a dependency; reuse | 0 |

**Not added:** router library (140-line internal router), state library (context + hooks), data-fetch library (repository hooks), chart lib, PDF parser, code-execution sandbox.

---

## 2. Navigation and UX specification

### 2.1 Sidebar (desktop ≥1024 px)

```
┌ NOVA ✦  AI Workspace ─────────── ⌘K ┐   ← brand + command palette trigger
│  ＋ New chat                        │   ← primary action, always visible
│                                     │
│  Home                               │
│  Chat                               │
│  Projects                           │
│  Documents                          │
│  Writing Studio                     │
│  Research                           │
│  Code Studio                        │
│  Knowledge Space                    │
│  Tasks                              │
│  ──────────────────────────────     │
│  Explore  ↗                         │   ← secondary surface
│                                     │
│  ⋯ recent conversations (5)          │   ← collapsible sub-list
│                                     │
│ ⚙ Settings            ◐ Avatar      │   ← bottom, sticky
└─────────────────────────────────────┘
```

- **Collapse:** 264 px expanded ↔ 72 px icon rail. Persisted per user in `user_settings`. Collapsed state keeps tooltips + `aria-label`s.
- **Active state:** 3 px accent bar + tinted row + `aria-current="page"`; parent row stays active on `/chat/:id`.
- **Recents:** last 5 conversations, each a real link; "Show all" → `/chat` list view.
- **Keyboard:** `⌘K`/`Ctrl K` command palette (conversations, projects, documents, tasks, science destinations, actions). `/` focuses search when not in an input. `⌘\` toggles the sidebar. `⌘⇧O` new chat.
- **No unsupported items:** no "Billing", no "Teams", no "Integrations".

### 2.2 Tablet (768–1023 px)

Icon rail by default with a hover/focus flyout; drawer on tap. Workspace content gets the full width. This is a first-class target, not a squeeze of mobile.

### 2.3 Mobile (<768 px)

- Top bar: menu (drawer), current context title, overflow (⚙/account).
- Bottom bar (5): **Home · Chat · Documents · Tasks · More** (More opens the drawer).
- Drawer: full-height sheet, focus trap, Escape/backdrop closes, body scroll lock, safe-area padding.
- Composer: sticky to the bottom above the safe area; grows to 40vh then scrolls; `Enter` sends on desktop, `⌘/Ctrl+Enter` sends on touch keyboards (configurable).

### 2.4 Command palette

Single component, three modes: navigate, search (conversations/documents/projects/tasks via server-side `ilike`/`websearch_to_tsquery`), and act (new chat/project/document/task, toggle theme, switch language). Fully keyboard-driven, `role="dialog"`, `aria-activedescendant`.

---

## 3. Feature specification

Each area lists **what ships**, **what the AI does through the existing engine**, and **honest limits**.

### 3.1 NOVA Home (`/`)

| Block | Behaviour |
|---|---|
| Greeting | Time-aware, uses `display_name`, localised (EN/SI/TA) |
| Composer (hero) | One-line "Ask NOVA anything…" → creates a conversation and sends |
| Continue | Last 3 conversations with relative timestamps |
| Recent projects | Up to 4, with item counts |
| Recent documents | Up to 4 (all kinds), edited-at |
| Quick tools | New document / New task / Research question / Code review — each opens the relevant surface |
| Explore card | One compact entry to the science suite (D1) |
| Suggestions | 3 contextual prompts derived from recent activity; hidden when there is none |

No vanity statistics. Empty accounts get a 3-step "get started" block instead of fake recents.

### 3.2 Chat (`/chat`, `/chat/:id`)

| Capability | Implementation |
|---|---|
| New conversation | created on first send (project-scoped if started inside a project) |
| Conversation list | virtualised beyond 50 items, grouped Today / Previous 7 days / Older, infinite scroll via keyset pagination |
| Search | server-side `ilike` on title + message content, snippet with highlight |
| Rename / archive / pin / delete | inline menu; archive hides from default list; delete is soft (`deleted_at`) with 30-day "Recently deleted" restore |
| Streaming | **real SSE** via `POST /api/nova/stream`; first token typically < 1 s |
| Cancel | aborts client fetch **and** upstream request (server listens to `close`) |
| Regenerate | replaces the last assistant message (same model/provider) and keeps the prior version in `message_revisions` |
| Edit user message | edit → truncate following turns → resend (confirmation dialog) |
| Copy per message / per code block | clipboard with 2 s confirmation |
| Markdown | `react-markdown` + GFM: tables, task lists, links (safe `rel="noopener noreferrer ugc"`), headings, nested lists; raw HTML **disabled** |
| Code blocks | lazy `highlight.js`, language chip, copy, line-wrap toggle |
| Regenerate metadata | provider + model shown per answer; local-engine answers marked **"Offline knowledge engine"** |
| Project context | opening a project's chat injects the project's instructions as an *additional* system message |
| Attachments | **not in v1** (needs storage + extraction policy); the composer hides the button rather than showing a dead control |
| Errors | typed states: offline, rate-limited (`retry after`), provider unavailable, timeout, cancelled — each with a retry affordance |
| Long threads | keyset-paginated message history (50 per page) + "jump to latest" |

### 3.3 Projects (`/projects`)

- CRUD; title, description, instructions (system-prompt extension, max 4,000 chars), colour, archive.
- Project detail: related conversations, documents, tasks, knowledge files, and a project activity timeline.
- Isolation: every row carries `user_id` + RLS; a project's items are filtered by `project_id` **and** `user_id`.
- AI: "Summarise project", "Draft next steps", "Generate task plan" — all through the existing chat route with project instructions + selected context only.
- Deleting a project asks whether to detach (default) or delete its items (explicit, typed confirmation).

### 3.4 Documents · Writing · Research · Code — one engine, four surfaces

All four are **documents with a `kind`** (`document | writing | research | code | note`), sharing an editor, autosave, versioning and AI actions. Only the chrome and prompts differ.

| Surface | Adds |
|---|---|
| **Documents** | blank/template create, rich text (headings, lists, tables, quotes), word count, autosave (debounced 800 ms + on blur), export TXT/MD/HTML/PDF(print), "summarise / rewrite / shorten / fix grammar / outline" actions |
| **Writing Studio** | format presets (essay, report, email, proposal, creative), tone/length controls, "continue writing", "rewrite selection", side-by-side original vs suggestion with **Accept / Reject / Insert** (original never overwritten automatically) |
| **Research** | research question, notes, findings list, comparison-table builder, **source register** (user-supplied URL/title/notes, marked *user-supplied*). AI output is labelled *AI-generated, unverified*. No "Search the web" control exists — there is no web-search integration; a source's content is never fabricated |
| **Code Studio** | language selector, monospace editor with line numbers, explain / generate / debug / review / document, diff view for suggestions. States plainly: **code is not executed here** |

Safety rails common to all four:

- Every AI action is **non-destructive**: it produces a suggestion you insert, replace-with-undo, or discard.
- Editor keeps an in-memory undo stack plus last 20 autosaved revisions in `document_revisions`.
- Leaving with unsaved changes warns before navigation (`beforeunload` + router guard).
- Offline edits are queued locally and pushed on reconnect; conflicts resolved last-write-wins with a visible banner.

### 3.5 Knowledge Space (`/knowledge`)

- Upload to a **private** Supabase Storage bucket under `{user_id}/…`, metadata in `knowledge_files`.
- **v1 indexes text-extractable files only**: `.txt .md .csv .json .log .yml`. PDF/DOCX/images can be stored as **metadata-only** and are visibly labelled *"stored, not indexed — NOVA cannot read this yet"*. No pretend extraction.
- Validation: MIME + extension allowlist, per-file 5 MB, per-user 100 MB, filename sanitisation, no executable types.
- "Ask about these documents": select up to 3 indexed files; extracted text (truncated to the existing 20 KB history budget) is sent as a clearly delimited context block with an instruction to answer only from it and to say when the answer is absent.
- Every answer shows which files were in scope. Nothing is sent that the user did not select.

### 3.6 Tasks (`/tasks`)

- CRUD: title, notes, status (`todo | doing | done`), priority (`low | normal | high | urgent`), due date, project link, manual ordering.
- Views: list (default), board by status, filter by project/priority/due.
- AI: "Plan this goal" → proposes 3–10 tasks **as a reviewable list**; nothing is written until you press *Add selected*. Project task plans follow the same rule.
- No fake recurrence, no calendar sync, no notifications that don't exist.

### 3.7 Settings (`/settings`) — every control works

| Group | Controls |
|---|---|
| Appearance | Theme: Dark / Light / System · Density: comfortable/compact · Reduce motion (default: follow OS) |
| Language | English / සිංහල / தமிழ் (applies immediately, persisted server-side + local) |
| Chat | Preferred provider (Auto/Arena/OpenRouter/Gemini/Local, only available ones selectable) · Show suggestions · Send with ⌘Enter · UI sounds (default **off**) · Response language follows app language |
| Workspace | Sidebar collapsed · Default landing surface · Conversation sort (updated/created) |
| Accessibility | Font scale 90/100/112 % · High-contrast text · Focus-ring always visible · Reduce transparency (solid surfaces) |
| Data & privacy | Export everything (JSON) · Remove local legacy copy · Delete all workspace data · Delete account |
| About | Model/provider availability (live booleans), version, data-source attribution |

Nothing is greyed-out-and-inert: a control that cannot work is not rendered; if a provider is unavailable it is listed with the reason instead of a dead switch.

### 3.8 Profile (`/profile`)

Display name, email (read-only), avatar initial, locale, member since, sign out, delete account. No fake subscription/plan UI.

---

## 4. Design system

### 4.1 Colour tokens (NOVA)

Dark (default):

| Token | Value | Use |
|---|---|---|
| `--nova-bg` | `#08090D` | app background |
| `--nova-surface` | `#10121A` | sidebar, cards |
| `--nova-elevated` | `#171A24` | menus, modals, composer |
| `--nova-line` | `rgba(255,255,255,.07)` | hairlines |
| `--nova-text` | `#F5F7FF` | primary |
| `--nova-text-2` | `#9299AA` | secondary (contrast-verified ≥ 4.5:1 on bg/surface) |
| `--nova-text-3` | `#6E7686` | **large/bold or decorative only** (audit fix) |
| `--nova-accent` | `#5B84FF` | electric blue |
| `--nova-accent-2` | `#8B6BFF` | restrained violet (gradient endpoints, never text) |
| `--nova-danger` | `#FF6B7A` | destructive |
| `--nova-success` | `#4ADE9B` | success |

Light: `#F7F8FB` bg · `#FFFFFF` surface · `#0C1020` text · `#5A6376` secondary · `#3B63F6` accent. Both themes derive every surface from the token layer; **no component hardcodes a hex** in new code.

**Light-theme scope rule:** workspace chrome + all workspace surfaces follow the theme. The Explore science pages keep their dark astronomical treatment via `data-surface="space"` (imagery, 3D and starfield are dark-native; forcing white would break legibility of overlays). This is an explicit, documented decision, not an oversight — the theme switch states it.

### 4.2 Type, spacing, shape, motion

- Type: Inter Variable (UI), JetBrains Mono (code), Noto Sans Sinhala / Tamil (script coverage). Scale: 28/32 display, 20/28 h2, 15/24 body, 13/20 small, 11/16 meta.
- Spacing: 4 px base; content max-width 760 px for chat, 1120 px for editors and lists.
- Radii: 10 (controls), 14 (panels), 20 (modals); pills only for chips/status.
- Borders: 1 px hairline; shadows subtle and layered; no glow except a single focus/active accent.
- Glass: `background: color-mix(in srgb, var(--nova-surface) 72%, transparent)`, `backdrop-filter: blur(20px) saturate(120%)` — limited to sidebar, top bar, composer and modals.
- Motion: 160 ms (micro) / 240 ms (panels), `cubic-bezier(.16,1,.3,1)`; every animation respects `prefers-reduced-motion` **and** the in-app Reduce-motion toggle.
- Focus: 2 px accent ring, 2 px offset, always visible on keyboard focus.

### 4.3 Component inventory (new)

`Sidebar`, `SidebarItem`, `TopBar`, `MobileDrawer`, `CommandPalette`, `ConversationList`, `ConversationItem`, `ChatThread`, `MessageBubble` (borderless assistant, tinted user), `StreamingCursor`, `Markdown`, `CodeBlock`, `Composer`, `AttachmentChip` (v1: none), `EmptyState`, `Skeleton`, `Toast`, `Modal`, `ConfirmDialog`, `Dropdown`, `SegmentedControl`, `Switch`, `Field`, `Select`, `Badge`, `DataTable` (research comparison), `Editor`, `EditorToolbar`, `AIActionBar`, `DiffView`, `TaskItem`, `TaskBoard`, `UploadDropzone`, `FileRow`, `ThemeSwitcher`, `AuthPanel`, `Avatar`, `Kbd`, `Callout`.

Existing `src/ui/primitives.tsx` (`Button`, `Panel`, `PageHeader`, `DataStateBadge`, `cx`) is extended, not replaced, so science pages keep working.

### 4.4 Brand

- **Mark:** an eight-point NOVA star inside an orbital ellipse (`<svg>`, currentColor, 24 px grid). **Wordmark:** "NOVA" tight tracking with a muted "AI" suffixed chip.
- Deliverables: `public/brand/nova-mark.svg`, `nova-wordmark.svg`, `favicon.svg`, `favicon.ico`, `icon-192/512`, `maskable-512`, `apple-touch-icon`, OG image.
- `public/manifest.json`: name **NOVA AI**, short_name **NOVA**, `theme_color #08090D`, `background_color #08090D`, categories `productivity, education`; keep `/cosmovision` in scope.
- `index.html`: title `NOVA AI — AI assistant & productivity workspace`, description, OG/Twitter, `theme-color`, `color-scheme` for both themes.
- Loading screen: NOVA mark + progress hairline, < 400 ms fade, reduced-motion safe.
- **Originals preserved** at `public/brand/legacy/` (logo.png, icon.svg, pwa-*.png, apple-touch-icon.png, favicon.*) before any replacement; `index.html` diff kept minimal so restore is one revert.

---

## 5. Data architecture (Supabase)

### 5.1 Schema — `supabase/migrations/20261105_nova_workspace.sql`

Idempotent, additive; `supabase/cosmovision.sql` is **not** modified.

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` (→`auth.users`), `display_name`, `locale`, `theme`, `reduce_motion`, `sidebar_collapsed`, `font_scale`, `high_contrast`, `sounds`, `preferred_provider`, `default_surface`, `created_at`, `updated_at` | 1:1 with `auth.users`, created by trigger |
| `projects` | `id`, `user_id`, `name` (1–120), `description` (≤2,000), `instructions` (≤4,000), `color`, `archived`, timestamps | |
| `conversations` | `id`, `user_id`, `project_id` (null), `title` (≤160), `archived`, `pinned`, `last_message_at`, `deleted_at`, timestamps | keyset index `(user_id, last_message_at desc, id)` |
| `messages` | `id`, `conversation_id`, `user_id`, `role` (`user\|assistant\|system`), `content` (≤32,000), `provider`, `model`, `is_error`, `seq` (`bigserial`), `created_at` | `seq` gives stable ordering; `user_id` duplicated for RLS defence-in-depth |
| `message_revisions` | `id`, `message_id`, `user_id`, `content`, `created_at` | regenerate/edit history |
| `documents` | `id`, `user_id`, `project_id`, `kind` (`document\|writing\|research\|code\|note`), `title`, `content`, `language`, `metadata` jsonb, `pinned`, `deleted_at`, timestamps | one table powers four surfaces |
| `document_revisions` | `id`, `document_id`, `user_id`, `content`, `created_at` | last 20 kept (trigger prunes) |
| `knowledge_files` | `id`, `user_id`, `project_id`, `name`, `mime`, `size_bytes`, `storage_path`, `extracted_text` (≤200,000), `index_status` (`ready\|metadata_only`), `created_at` | |
| `tasks` | `id`, `user_id`, `project_id`, `title` (≤200), `notes` (≤4,000), `status`, `priority`, `due_date`, `position`, timestamps | |

Constraints mirror the codebase's existing SQL style: `check (char_length(trim(title)) between 1 and 160)`, enum-like `check (status in (…))`, unique `(conversation_id, seq)`.

### 5.2 RLS — the security core

For **every** user-owned table:

```sql
alter table public.<t> enable row level security;
create policy "<t>_select_own" on public.<t> for select to authenticated using (auth.uid() = user_id);
create policy "<t>_insert_own" on public.<t> for insert to authenticated with check (auth.uid() = user_id);
create policy "<t>_update_own" on public.<t> for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "<t>_delete_own" on public.<t> for delete to authenticated using (auth.uid() = user_id);
revoke all on public.<t> from anon;
```

- `messages` additionally verifies conversation ownership on insert (`exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid())`) so a forged `conversation_id` cannot inject into another user's thread.
- `profiles`: `auth.uid() = id`; the trigger runs `security definer` with a pinned `search_path`.
- Storage bucket `knowledge`: private, policies restricted to `bucket_id = 'knowledge' and (storage.foldername(name))[1] = auth.uid()::text`.
- Quotas via `before insert` triggers: 500 conversations, 1,000 documents, 5,000 tasks, 100 MB knowledge per user → typed errors the UI surfaces.
- Service-role key: **never** in client code; only the existing community-moderation module uses it server-side. Workspace reads/writes go through the publishable key + the user's JWT, so RLS is the actual enforcement layer (not app-level filters).

### 5.3 Client & runtime configuration

- `GET /api/workspace/config` (new, additive) → `{ enabled, url, publishableKey }` or `{ enabled:false, reason }`. Server reads `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY`. **No VITE_ build-time secret**, no rebuild to rotate config; mirrors the proven `/api/community/config` pattern.
- `supabaseClient.ts`: `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true`, flow type `pkce`; auth state mirrored into a React context.
- When config is absent: the workspace renders a clear "Cloud workspace not configured" state with a local read-only demo? **No** — it renders the sign-in panel disabled with the reason, and the public Explore surface still works. (No fake local pseudo-auth.)

### 5.4 Legacy conversation migration (safe, verified, reversible)

1. On first successful sign-in, read `nasa_ai_chat_thread_v3`.
2. Validate shape (`[{role, text|content, timestamp?}]`), drop error/system entries, cap at 100 messages.
3. Insert a conversation titled from the first user message (or "Imported conversation") + its messages.
4. **Verify**: re-read the inserted row count and compare with the source count.
5. Only then write `nova_migration_v1 = { status:'done', conversationId, count, at }`.
6. **The local key is never deleted automatically.** Settings → Data shows "Old local conversation (N messages) — still on this device" with an explicit *Remove local copy* button.
7. Failure at any step leaves local data intact and shows a dismissible, retryable notice.
8. Also migrated: `nasa_cosmic_saved_apods` / `nasa_cosmic_saved_missions` are left untouched (they belong to the preserved Explore surface).

### 5.5 Export / delete

- Export-all → single JSON (`nova-workspace-export-v1`) streamed client-side from RLS-scoped queries; secrets never included.
- Delete-all workspace data → server-side RPC `delete_my_workspace_data()` (security definer, `auth.uid()` scoped) with typed confirmation; keeps the profile.
- Delete account → Supabase account deletion requires the service role: implemented as a **server endpoint** `POST /api/workspace/delete-account` that verifies the caller's JWT and uses the service-role key server-side only. If the service role is not configured, the endpoint returns a clear "ask the administrator" state rather than pretending.

---

## 6. AI integration (preserve the engine, extend only additively)

### 6.1 Untouched

`server/novaChat.js` behaviour, `makeSystemPrompt`, caps (12 messages / 4,000 chars / 20 KB / 24 KB / 8 s), error taxonomy, `GET /api/nova/config`, provider order `arena → openrouter → gemini → local`, and `/api/nova/chat`'s JSON contract. Its existing 32 tests must keep passing unchanged.

### 6.2 Additive changes

| Addition | Detail |
|---|---|
| `POST /api/nova/stream` | SSE. Same validation helpers (exported, not modified), same prompts/caps/limiter. Events: `meta` → `delta*` → (`suggestion`) → `done` \| `error`. `req.on('close')` aborts upstream. Providers called with `stream: true`; if a provider fails mid-stream, the client shows a retryable partial-answer state and the server never silently switches provider mid-answer |
| Auth-aware quota | Optional `Authorization: Bearer <supabase access token>`; when present and valid → 30 req/min per user; absent → existing 8/min per IP. Invalid token → 401, never a silent downgrade |
| `POST /api/nova/context` (optional, Phase 4) | Builds a **server-side** context block from RLS-scoped project/document ids (service-role not required — uses the caller's JWT) so large document text never has to round-trip through the browser twice. Deferred unless needed |
| `/api/workspace/config` | Supabase runtime config (Section 5.3) |
| `/api/workspace/delete-account` | JWT-verified, service-role server-side (Section 5.5) |
| Boot fix | construct `GoogleGenAI` lazily so unset keys stop logging twice |

**No prompt changes to NOVA's system prompt.** Project instructions and document context are *appended* as separate `system` messages after the base prompt, in this order: base → task framing (e.g. "You are in Code Studio") → project instructions → document context. All four providers receive them identically (Gemini maps system → `systemInstruction`, which means appending becomes concatenation there; the adapter handles it).

### 6.3 Capability gating (honesty requirement)

`/api/nova/config` already reports which providers are live. The UI derives a `capabilities` record:

- `ai.online === false` → banner in every AI surface: *"No AI provider is configured on this deployment. NOVA can only answer from its offline space knowledge base."* Writing/Research/Code AI buttons render disabled **with that reason**, not a spinner.
- `streaming === true` only when the SSE route answers (probed once, cached for the session).
- A local-engine answer is always labelled **Offline knowledge engine**, never presented as an online model.

### 6.4 Provider verification (D3)

On receiving the Arena key (set in the host's environment / `.env`, never pasted in chat):

1. `curl /api/nova/config` → `arena:true`.
2. One `POST /api/nova/chat` with `provider:"arena"` → expect `provider:"Arena AI"` and a real `model` echo.
3. One streaming request → expect ≥ 2 `delta` events.
4. Only then does Arena become the default in the provider picker; if step 2 or 3 fails, `NOVA_ARENA_MODEL` / `ARENA_BASE_URL` are corrected or Arena is demoted to "configured but unverified".

---

## 7. Security plan

| Control | Implementation |
|---|---|
| Credentials | `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `ARENA_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `YOUTUBE_API_KEY`, `FIRMS_MAP_KEY` server-only; `.env*` gitignored; publishable/anon key is the only Supabase key in the browser |
| Authorisation | RLS on every table + storage policy; no client-side-only filtering |
| Auth | Supabase Auth (email+password, PKCE); session refresh; sign-out clears local session; protected routes render a sign-in state, never a redirect loop |
| Rate limiting | existing per-IP limiter + per-user quota on the streaming route; DB triggers for storage quotas |
| XSS | ReactMarkdown renders to React nodes with raw HTML disabled; link rel hardening; CSP tightened for scripts when the shell lands (`'unsafe-inline'` removed for scripts if Vite's build permits; styles keep inline) |
| CSRF | no cookie-auth mutations; bearer JWT only |
| Input validation | length/format checks in SQL **and** in the client; filename sanitisation; MIME allowlist |
| Data isolation tests | PGlite harness replicates `auth.uid()` + roles and proves cross-user reads/writes fail (Section 9) |
| Deletion | soft-delete + restore window; account deletion via server endpoint only |
| Logging | no message content, no tokens, no keys in logs; provider errors mapped to codes |
| Headers | keep existing CSP/XCTO/XFO/Referrer-Policy/Permissions-Policy/HSTS; remove `X-Powered-By`; `connect-src` narrowed to `self`, the configured Supabase origin and the two AI endpoints used by the server (server-to-server is unaffected) |
| Prompt injection | document/project context wrapped in explicit `<document>` delimiters with an instruction that content is data, not commands; UI never auto-executes anything the model proposes |

---

## 8. Performance plan

| Budget | Target | Baseline (audit) |
|---|---|---|
| Shell JS (gz) | ≤ 120 kB | entry 196 kB |
| Shell CSS (gz) | ≤ 25 kB | 47 kB |
| Chat route chunk (gz) | ≤ 170 kB incl. markdown | n/a |
| LCP (mid-tier mobile, 4G) | ≤ 2.0 s | unmeasured |
| CLS | ≤ 0.02 | unmeasured |
| Precache | ≤ 3.5 MB | 5.42 MB |

Mechanisms: workspace-first entry (science chunks become one lazy group), lazy markdown/highlighter, route-level code splitting, keyset pagination, list virtualisation > 50 rows, debounced autosave, `content-visibility` for long threads, rAF-batched streamed text, CSS pruning by deleting the legacy compat layer only where no science page uses it, image/icon discipline (SVG, no icon fonts).

---

## 9. Testing plan (Phase 6, real results only)

| Suite | Tool | Covers |
|---|---|---|
| Types | `tsc --noEmit` | whole repo; new `src/data|app|workspace` code written under `strict`-clean rules |
| Unit — AI | existing `test-nova-chat.mjs` (32) | must pass **unchanged** |
| New — streaming | `node:test` | SSE framing, abort on disconnect, invalid token 401, caps preserved, no key echo |
| New — RLS/schema | **PGlite** (already a dev dep; same pattern as `test-community-sql.mjs`) | migration applies cleanly; cross-user select/update/delete blocked; forged `conversation_id` blocked; quota triggers; profile trigger |
| New — repositories | `node:test` + in-memory adapter | pagination, soft-delete/restore, revision pruning |
| New — migration | `node:test` | legacy thread → conversation, idempotent, never deletes local key, failure path keeps data |
| New — rendering | `node:test` + `react-dom/server` where feasible | markdown tables/code/links, empty states, capability gating |
| Build | `npm run build` | succeeds, budgets checked by a script, no server key in `dist/` |
| Security | existing build/security suites (6) + new greps | no service role in client bundle; RLS SQL present for all tables |
| Responsive/PWA | manual checklist + Lighthouse (if available) | 360/390/768/1024/1440, drawer focus trap, install, offline read |
| Cross-device sync | **manual, documented** | needs two real sessions against your Supabase project; not simulatable in this sandbox — I will provide exact steps and expected observations |

Where a check cannot be executed here (live Supabase auth, real Arena round-trip, cross-device sync), the report will say so explicitly rather than implying it passed.

---

## 10. Localisation plan

- New namespaces: `workspace`, `settings`, `auth`, `errors`, `explore` (thin wrapper labels) — merged into the existing i18next resources, same pattern as `interfaceCopy.ts`.
- **No inline `lang === 'si' ? … : …`** in new code; all strings via keys.
- Parity test (`node:test`) asserting EN/SI/TA key sets are identical; fails the build on drift.
- Estimated 300–380 new keys per language (chat, projects, documents, settings, auth, errors, tasks, knowledge).
- Dates/numbers via `Intl` with the active locale; relative times ("2 hours ago") via `Intl.RelativeTimeFormat`.
- Sinhala/Tamil fonts already self-hosted; no fallback flash.

---

## 11. Accessibility plan (targets WCAG 2.2 AA)

- Fix `--nova-text-3` so metadata ≥ 4.5:1 (audit defect #1).
- Chat: labelled composer, `role="log"` + `aria-live="polite"` for completed responses, streaming region `aria-busy`, per-message `aria-label` on every icon button, visible "Sending…/Generating…/Stopped" status text.
- Navigation: `<nav aria-label="Workspace">`, `aria-current="page"`, skip link to main, sidebar `aria-expanded`, drawer as `role="dialog"` with focus trap and focus return.
- Command palette: combobox pattern, `aria-activedescendant`, Escape closes, results announced.
- Editor: `<textarea>`/contenteditable with proper labelling, keyboard shortcuts documented, no keyboard traps.
- Forms: label + description + error association (`aria-describedby`, `aria-invalid`), error summary on submit.
- Focus visible everywhere (2 px ring); targets ≥ 44×44 px on touch.
- Motion/transparency respecting OS + in-app settings; `prefers-contrast` respected by high-contrast toggle.
- Automated: axe-core run in the test script if it installs cleanly; otherwise a documented manual checklist.

---

## 12. File-level change map

### New (approx.)

```
src/app/                    Router, AppShell, routes, providers, guards          ~900 LOC
src/workspace/home/                                                              ~350
src/workspace/chat/         list, thread, message, composer, markdown, actions   ~1,600
src/workspace/projects/                                                          ~600
src/workspace/documents/    editor, toolbar, AI actions, diff, exports          ~1,300
src/workspace/knowledge/                                                         ~450
src/workspace/tasks/                                                             ~550
src/workspace/settings/                                                          ~500
src/workspace/profile/                                                           ~200
src/data/                   client, repositories, types, migration              ~900
src/explore/                ExploreApp (today's App.tsx), destination registry     ~250
src/ui/workspace/*          new primitives                                       ~800
src/styles/themes.css                                                            ~150
supabase/migrations/20261105_nova_workspace.sql                                  ~350 SQL
api/workspace/config.js · api/workspace/delete-account.js (Vercel adapters)
```

### Modified (surgical)

| File | Change |
|---|---|
| `src/main.tsx` | mount new providers/router; keep chunk-recovery + SW registration |
| `src/App.tsx` | now the route switch: `AppShell` for workspace, `ExploreApp` for `/explore/*`; tab logic moves into `ExploreApp` unchanged |
| `server.ts` | mount `/api/nova/stream`, `/api/workspace/*`; lazy Gemini client; remove `X-Powered-By`; drop dead `/api/nasa-ai` limiter entry |
| `server/novaChat.js` | **export** existing validation/prompt helpers + add streaming call functions (no behaviour change) |
| `vite.config.ts` | manual chunk groups for workspace/explore; PWA manifest icons |
| `index.html`, `public/manifest.json` | NOVA brand |
| `src/styles/tokens.css` | NOVA palette + light theme; keep legacy aliases so science pages are unaffected |
| `src/i18n.ts` | merge new namespaces |
| `lib/nasaApi.js` | remove dead `askNasaAi` (D4) |
| `package.json` | add `react-markdown`, `remark-gfm`, `highlight.js`; add test scripts |
| `components/AaaRocketLaunch.jsx` | delete (D4) |
| `docs/nova/*` | this blueprint, phase reports |

**Explicitly untouched:** all 15 science destination components, `server/nasaRoutes.ts`, `server/earthIntelligence.ts`, `server/spaceVideos.ts`, `server/communityVideos.ts`, `supabase/cosmovision.sql`, `lib/earth/*`, science i18n modules.

---

## 13. Implementation roadmap

### Phase 3 — Design implementation (no productivity data yet)
1. **3A Foundation:** tokens (dark+light), themes, brand assets, manifest/index.html, Router, AppShell, sidebar/rail/drawer/bottom bar, command palette, `ExploreApp` extraction + `/explore` routes + `/cosmovision` alias, a11y foundation, loading/empty/error states.
2. **3B Auth:** `/api/workspace/config`, Supabase client, AuthProvider, sign-in/sign-up/verify/reset panels, route guard, profile shell, migration of legacy chat.
3. **3C Settings:** all working preference controls persisted in `profiles`.
4. **3D Chat surface:** conversation list/search/rename/archive/pin/delete+restore, thread, composer, markdown+highlight, streaming SSE, regenerate/edit, per-message actions, error taxonomy. Existing `/api/nova/chat` remains the fallback transport.

**Gate:** `tsc`, all existing tests, build, budgets, manual a11y pass, science suite still fully reachable.

### Phase 4 — Productivity features
5. **4A Home dashboard** (real recents from RLS queries).
6. **4B Projects** (CRUD, instructions, related items, AI actions).
7. **4C Documents + Writing Studio** (editor, autosave, revisions, exports, accept/reject AI suggestions).
8. **4D Research + Code Studio** (shared document engine; source register with honest labelling; no code execution).
9. **4E Knowledge Space** (private storage, text-only indexing with explicit metadata-only labelling).
10. **4F Tasks** (CRUD, board, AI plan → review → insert).

### Phase 5 — Cleanup (approved subset only)
11. Remove `askNasaAi` + dead `/api/nasa-ai` references; delete `components/AaaRocketLaunch.jsx`; document the committed `api/index.js`; fix `scripts/i18n-audit.mjs`. Nothing else removed (R1/R4/R5 remain proposals).

### Phase 6 — Testing
12. Full suite + new RLS/streaming/migration/render tests, build-budget script, security greps, manual responsive/PWA/sync checklist. Report **actual outputs**.

### Phase 7 — Final review
13. Implementation report: preserved / added / improved / removed-by-approval, file list, performance before-after, test results, deployment notes (Vercel env vars, migration order, rollback).

---

## 14. Acceptance criteria (per area)

| Area | Pass condition |
|---|---|
| Shell | Sidebar collapses (264↔72 px) and persists; tablet rail; mobile drawer traps focus; no horizontal overflow at 360/390/768/1024/1440 |
| Chat | Send → first token < 1.5 s with a live provider; cancel stops both sides; regenerate replaces only the last answer; search finds a message by content; archive hides; delete restores within 30 days |
| Markdown | GFM table, nested list, task list, link and fenced code all render correctly; raw HTML never executes |
| Projects | Instructions measurably change answers; deleting a project detaches by default; another user's project id returns empty, not data |
| Documents | Autosave survives reload; AI suggestion never overwrites text without Accept; export MD/HTML valid |
| Research | No citation is produced without a user-supplied source; every AI paragraph carries the *unverified* label |
| Code | Language switch, diff view, copy; a visible "not executed" notice |
| Knowledge | Non-indexable file uploads show *metadata only*; asking sends only selected files; 5 MB/100 MB limits enforced client **and** DB |
| Tasks | Status/priority/due persist; AI plan writes nothing until approved |
| Settings | Every visible control has an effect; unavailable providers listed with reasons, not dead switches |
| Auth | Sign out clears session; cross-tab session sync; protected route shows sign-in, never content |
| Migration | Legacy thread appears as a cloud conversation; local key still present until the user removes it; failure path loses nothing |
| Security | No service-role key or AI key in `dist/`; RLS tests prove isolation; invalid JWT → 401 |
| i18n | 100 % key parity; no English leakage in SI/TA on workspace screens |

---

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Square peg: a science app becoming a productivity shell | Explore demoted but fully preserved; workspace-first routing; no science component edited |
| No Supabase project reachable from this sandbox | schema + RLS proven locally with PGlite; live auth/sync documented as manual verification with exact steps |
| Arena endpoint/model unverified | verify before defaulting; keep Gemini/OpenRouter; auto-fallback remains honest |
| Bundle growth from markdown/highlighter | lazy-load both; enforce budget script in CI-style `npm test` |
| Light theme breaking legacy science screens | theme scoped to workspace chrome; `data-surface="space"` keeps astro pages dark; documented in Settings |
| Data loss during migration/redesign | never delete local data; soft deletes; revisions; export-all; all changes on this branch, no merge/deploy without approval |
| Scope size | phase gates with testable acceptance criteria; each phase independently shippable |

---

## 16. What I need from you to proceed

1. **Approve this blueprint** (or amend D1–D4 / any section).
2. **Supabase:** create the project and set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in the host environment (never paste them in chat). I will write the migration; **running it is your action** (or you can authorise me to hand you the exact SQL + verification queries).
3. **Arena:** set `ARENA_API_KEY` (plus `NOVA_ARENA_MODEL` / `ARENA_BASE_URL` if your instance differs) in the environment. Until then, streaming is implemented and tested against the local engine + whichever provider is live, and the UI states provider availability truthfully.
4. **Confirm the light-theme scope rule** (workspace follows the theme; Explore science pages stay dark by design).

On approval I start **Phase 3A (foundation: tokens, brand, router, shell, Explore demotion)** and will report test results at each gate.

---

*End of Phase 2 blueprint.*
