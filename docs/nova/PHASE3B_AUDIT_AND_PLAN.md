# NOVA AI — Phase 3B Audit & Implementation Plan

**Date:** 2026-11-05
**Branch:** `arena/471768c6-asa-asan` @ `4efc5b3` (Phase 3A), working tree **clean**, nothing uncommitted.
**Status:** audit complete — **no files modified yet**. This document is the checkpoint the brief asked for.

---

## 1. Audit findings

### 1.1 Repository state

| Item | Finding |
| --- | --- |
| Branch | `arena/471768c6-asa-asan`, in sync with origin at `4efc5b3` |
| History | `116c5c5` (Phase 1/2) → `bbc9fea` (Phase 3A shell) → `4efc5b3` (3A report) |
| Working tree | clean, 0 modifications |
| Test baseline | 162 tests / 11 suites, all passing; `tsc` clean; build 2.5 s |

Phase 3A delivered: design tokens (`nova-tokens.css`, `workspace.css`), History-API router (13 routes), `AppShell` (sidebar / drawer / bottom bar / top bar / command palette), dark+light themes with WCAG-verified tokens, trilingual shell copy (106 keys × 3), truthful home + planned surfaces, and the untouched NASA science suite moved behind `/explore` (lazy chunk).

### 1.2 Existing authentication

**There is no workspace authentication.** What exists is a scoped, in-memory auth used only by the CosmoVision community feature:

| Piece | Location | Behaviour |
| --- | --- | --- |
| Config route | `server/communityVideos.ts` → `GET /api/community/config` | returns `{enabled, url, publicKey}` only after validating: https origin, no path/query/port, key ≠ service key, publishable-key shape |
| Client | `src/features/space-shorts/CommunityTools.tsx` | `createClient(url, publicKey, { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false })` — token kept in component memory, never localStorage |
| Server auth | `server/communityVideos.ts` | `Authorization: Bearer …` → service-role `verifyUser(token)`; 401 on failure |

Nothing for the workspace: no session persistence, no protected routes, no account affordance (Phase 3A deliberately shipped no avatar), no profile.

### 1.3 Existing Supabase configuration

| Item | Finding |
| --- | --- |
| Dependency | `@supabase/supabase-js ^2.118.0` **already installed** (client bundle already includes it via `CommunityTools`) |
| Env vars (`.env.example`, names only) | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; documented as server-only, publishable key allowed in browser |
| Actual env | **no `.env` in this workspace** → cloud features cannot be exercised live here; `.env*` is gitignored (`.env.example` excepted) |
| Server validation | publishable key must pass `isPublishableKey`, must differ from the secret, URL must be bare https |
| CSP | `connect-src 'self' https:` already permits the Supabase origin — no CSP change needed |
| Service worker | runtime caching is allow-listed per path (`/api/apod`, `/api/earth/*`, GIBS tiles, …); Supabase calls are cross-origin and untouched |

### 1.4 Existing database

Only `supabase/cosmovision.sql` (122 lines): 4 community tables, `enable row level security`, `revoke all … from public, anon, authenticated`, `grant … to service_role`, `security definer` functions with pinned `search_path`, tested by `scripts/test-community-sql.mjs` in **PGlite**.

Established conventions to follow exactly: idempotent `create table if not exists`, `check` constraints on text lengths and enum-like columns, explicit indexes, `-- comment` header explaining rollback, no `auth.*` tables created (only referenced).

**No user-owned workspace tables exist.** Nothing to duplicate, nothing to overwrite.

### 1.5 Local data inventory (what a migration could ever touch)

| Key | Owner | Shape | Phase 3B action |
| --- | --- | --- | --- |
| `nasa_ai_chat_thread_v3` | `src/components/NasaAi.jsx` | `[{ role, text, id?, isFallback? }]`, trimmed to last 25 | **opt-in import** into a cloud conversation; never deleted |
| `nova_ai_provider_v1` | `NasaAi.jsx` | provider id | untouched (device preference) |
| `nova_theme / nova_motion / nova_contrast` | `src/app/theme.tsx` | preferences | mirrored to `profiles` once signed in, local copy kept |
| `nova_sidebar_collapsed` | `src/app/Sidebar.tsx` | boolean | mirrored to `profiles` |
| `nasa_preferred_lang`, `i18nextLng` | i18n | language | mirrored to `profiles.locale` |
| `nasa_cosmic_saved_apods/_missions` | `src/utils/favorites.ts` | Explore favourites | **left untouched** (belongs to Explore) |
| quiz high scores, asteroid notified ids, earth cache, device performance | science features | — | untouched |

There are **no** local projects, documents or tasks — those surfaces do not exist yet (Phase 4). "Preserve existing local data" therefore means: never write-destroy any of the above, import only the assistant thread (opt-in, verified), and keep device preferences authoritative on the device.

### 1.6 Surfaces, routes, copy

- `WORKSPACE_NAV`: home (live) + 8 planned modules; `ACCOUNT_NAV`: settings (**planned 3C**), profile (**planned 3B** — this phase makes it real).
- `PlannedSurface` renders "not available yet" for `/chat`, `/projects`, `/documents`, `/writing`, `/research`, `/code`, `/knowledge`, `/tasks`.
- Copy system: `src/i18n/workspaceCopy.ts`, 106 keys × EN/SI/TA, merge into `resources`, guarded by tests (key parity, every literal `t()` resolves, no dynamic keys).
- Workspace CSS already has `.nova-input`; `.nova-field / .nova-label / .nova-hint / .nova-error / .nova-divider` are missing and will be added with tokens.

### 1.7 Test & tooling reality

| Tool | Available | Consequence |
| --- | --- | --- |
| `node:test` + `tsx` | yes | unit + DOM + SQL suites |
| `@electric-sql/pglite` | yes (dev dep) | **real migration + RLS testing**, same pattern as `test-community-sql.mjs` |
| `jsdom` v31 | yes | auth UI render tests with an injected fake client |
| Live Supabase project | **no** (no `.env`, no credentials) | sign-in, email delivery, cross-device sync = **manual, documented, unverified here** |
| Headless browser | no | no pixel verification (as in 3A) |

---

## 2. Risks and how the plan handles them

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | RLS written but never executed → "looks secure" | PGlite test sets `role authenticated` + `request.jwt.claims`, drives real `select/insert/update/delete` as two users, asserts denial |
| R2 | Duplicate records after reconnect/retry | client-generated `uuid` primary keys + `upsert(..., { onConflict: 'id' })`; sync test replays the same outbox twice |
| R3 | Concurrent edits clobber each other | `updated_at` set by `set_updated_at()` trigger; client keeps `base_updated_at`, and refuses to overwrite when the server row is newer (surfaced as "kept the newer cloud version") |
| R4 | Migration of local data loses history | import is opt-in, verified by re-read, and **never deletes** the local key; failure path writes nothing |
| R5 | Service-role key leaks to the browser | only `/api/workspace/config` exists (returns the publishable key), the service role is **not used by any new code**, and a security test greps the built bundle for service-role markers |
| R6 | Auth UI lies when cloud is unconfigured | `{enabled:false, reason}` → disabled panel with the reason; no pseudo-auth, no fake session |
| R7 | Phase 3A regressions | existing 162 tests stay untouched; new suites are additive; the shell only gains an account chip + guard |
| R8 | Email verification settings unknown | UI handles all three states: confirmation required ("check your inbox"), confirmed, and "resend"; behaviour driven by the returned session, not by an assumption |

---

## 3. Implementation plan

### 3.1 Server (one additive route, no new privileges)

| File | Change |
| --- | --- |
| `server/workspaceConfig.ts` *(new)* | `GET /api/workspace/config` → `{enabled:true, url, publishableKey}` or `{enabled:false, reason}`. Reuses the community module's validation rules (bare https origin, publishable-key shape, key ≠ service key). Read-only, no secrets, 60 s in-process cache, rate-limited like the other config routes. |
| `server.ts` | mount the route + `rateLimit` (5 lines, additive). |
| `.env.example` | add comments only (no new variables, no values changed). |

No `delete-account` endpoint in this pass: it needs the service role, which is currently used by exactly one module. Deletion of *workspace data* is handled by a scoped `security definer` RPC instead (no secret leaves the server).

### 3.2 SQL migrations (version-controlled, additive, idempotent)

`supabase/migrations/20261105_nova_workspace.sql` (~380 lines):

- `profiles` (1:1 `auth.users`, created by `handle_new_user()` trigger, `security definer`, pinned `search_path`): `display_name`, `locale`, `theme`, `reduce_motion`, `high_contrast`, `sidebar_collapsed`, `font_scale`, `preferred_provider`, `default_surface`, timestamps.
- `projects`, `conversations`, `messages` (+`message_revisions`), `documents` (+`document_revisions`), `knowledge_files`, `tasks` — columns, checks and FKs as approved in blueprint §5.1.
- `set_updated_at()` trigger on every table; `seq bigserial` + `unique (conversation_id, seq)` for stable message order.
- Indexes: `(user_id, last_message_at desc, id)`, `(conversation_id, seq)`, `(user_id, updated_at desc)` per table, `(user_id, status, due_date)` for tasks, `(project_id)` FKs.
- Quota triggers: 500 conversations, 1 000 documents, 5 000 tasks, 100 MB `knowledge_files` per user → typed `raise exception` the UI can surface.
- `delete_my_workspace_data()` — `security definer`, `auth.uid()`-scoped, keeps the profile.

`supabase/migrations/20261105_nova_workspace_storage.sql` (~60 lines): private `knowledge` bucket, policies on `storage.objects` restricted to `bucket_id = 'knowledge' and (storage.foldername(name))[1] = auth.uid()::text` for select/insert/update/delete.

`supabase/migrations/20261105_nova_workspace_rollback.sql` (~70 lines): documented, **destructive**, never auto-run — drops policies, triggers, functions, then tables in FK order.

`supabase/cosmovision.sql` is **not modified**. No `drop table` anywhere except the rollback file.

### 3.3 Row Level Security (every user-owned table)

```
enable row level security
select own  : using (auth.uid() = user_id)
insert own  : with check (auth.uid() = user_id)
update own  : using + with check (auth.uid() = user_id)
delete own  : using (auth.uid() = user_id)
revoke all from anon;  grant … to authenticated (tables are never public)
```

Additional guards: `messages` insert/update verifies the parent conversation belongs to `auth.uid()`; `documents`/`tasks` verify `project_id` ownership when set; `profiles` keyed on `auth.uid() = id`; `knowledge_files` verifies `storage_path` starts with the user's folder.

### 3.4 Client data layer (`src/data/`)

| File | Responsibility |
| --- | --- |
| `config.ts` | typed fetch of `/api/workspace/config`, module cache, `{enabled:false, reason}` handling |
| `supabaseClient.ts` | lazy singleton: `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true`, `flowType: 'pkce'`, `storageKey: 'nova-auth'`; never created when unconfigured |
| `types.ts` | row types + `Database` shape for typed queries |
| `authApi.ts` | sign-up / sign-in / sign-out / reset / update password / resend verification; maps Supabase errors to stable codes (`invalid-credentials`, `email-not-confirmed`, `rate-limited`, `weak-password`, `network`) |
| `repositories/*.ts` | profile, conversations, messages, projects, documents, tasks: RLS-scoped list/get/create/update/softDelete |
| `outbox.ts` | localStorage-backed outbox (`nova_sync_outbox_v1`): enqueue, dedupe by row id, retry with backoff, cap |
| `sync.ts` | flush loop: idempotent upserts, `updated_at` conflict detection, ordering, offline detection (`navigator.onLine` + failures), status events |
| `legacyImport.ts` | opt-in, validated, verified import of `nasa_ai_chat_thread_v3`; writes `nova_migration_v1` only on success; never deletes the local key |
| `preferences.ts` | mirror `nova_theme/nova_motion/nova_contrast/nova_sidebar_collapsed/locale` into `profiles` on sign-in (device stays authoritative) |

### 3.5 Auth UI (`src/auth/`)

`AuthProvider.tsx` (session + config + `onAuthStateChange` + sync lifecycle) · `AuthPanel.tsx` (sign in / sign up / reset / check-inbox, accessible, motion-safe) · `RequireAuth.tsx` (loading skeleton → unconfigured reason → panel → children) · `AccountMenu.tsx` (top-bar chip: email, profile, sign out) · `SyncBadge.tsx` (idle / syncing / offline / error / pending count).

Surfaces: `/profile` becomes real (name, locale, theme mirror, cloud status, local-data status with "Remove local copy", sign out); `/settings` stays planned (3C). `home` gains a truthful cloud card (signed out / signed in / unconfigured + last sync). Copy added to `workspaceCopy.ts` in EN/SI/TA (~45 keys × 3) and guarded by the existing key tests.

### 3.6 Cloud synchronisation (scope reality check)

The **engine** (outbox, idempotent upsert, conflict handling, offline/reconnect, status) ships in 3B with tests, and is wired to the only data that exists today: the imported legacy conversation and the profile/preferences. Projects, documents and tasks get their repositories *and* sync paths now, but their **UIs arrive in Phase 4** — so there is no "sync project button" pretending to work. Status is always visible in the account chip; "0 pending" is shown, not invented activity.

### 3.7 Tests (new, additive — existing 162 untouched)

| Suite | Tool | Covers |
| --- | --- | --- |
| `test:workspace-sql` | PGlite | migration applies twice (idempotent); cross-user SELECT/UPDATE/DELETE denied; forged `conversation_id` denied; profile auto-created on signup; quota errors; `delete_my_workspace_data()` scoped; storage path policy |
| `test:workspace-auth` | jsdom + injected fake client | panel states (loading/unconfigured/signed-out/signed-in/email-unconfirmed), validation, error mapping, guard, si/ta copy, no token in storage or DOM |
| `test:workspace-sync` | node | outbox dedupe, retry/backoff, replay produces no duplicates, newer-server-wins conflict, offline→online flush, failure keeps the queue |
| `test:workspace-migration` | node | legacy thread import: shape validation, idempotency, verified count, local key preserved, failure writes nothing |
| security greps | node | no `service_role` / `SERVICE_ROLE_KEY` in `src/**` or `dist/**`; no secret-looking literals; `.env.example` names only |

Then: `tsc --noEmit`, full `npm test` (162 + ~20 new), `npm run build`.

### 3.8 What cannot be verified in this sandbox (will be stated as such)

Live sign-up/sign-in, email delivery and confirmation links, session refresh across reloads, real RLS against your project, realtime/poll sync between two devices, storage upload — all require your Supabase project. I will provide the exact SQL to run, the env vars to set (names only), and a manual checklist with expected observations.

---

## 4. Rollback story

| Layer | Rollback |
| --- | --- |
| SQL | `20261105_nova_workspace_rollback.sql` (destructive, manual). `cosmovision.sql` untouched |
| Server | the single route is additive; removing its mount restores prior behaviour |
| Client | guard/account UI is additive; the workspace still runs with cloud disabled (`enabled:false`) exactly as in 3A |
| Local data | never written destructively; outbox keys are namespaced `nova_*` and can be cleared independently |

---

## 5. Decisions I need from you before writing code

1. **Go/no-go on this plan.**
2. **Sync mechanism:** on-demand + focus/reconnect refresh (works with plain HTTPS, no project setting) vs Supabase Realtime subscriptions (needs Realtime enabled on the tables) vs both (Realtime now = more moving parts to verify manually).
3. **Email verification:** will your project require confirmation (UI must show "check your inbox", and `/chat` etc. stay behind a verified session) or is it off during development?
4. **Account deletion / data export in 3B:** include data export (client-side, no secrets) + `delete_my_workspace_data()` RPC now, and defer *account* deletion (needs the service role) to a later phase with a documented dashboard step — or defer both.
