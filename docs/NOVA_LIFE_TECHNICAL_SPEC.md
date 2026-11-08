# NOVA L.I.F.E. — technical specification

This is the contract-level description of the engine in `server/life/*`. Values
here are the ones the code enforces; the tests assert them
(`scripts/test-life-*.mjs`).

Schema version: **1**. Migration list is append-only (`schema.js`,
`LATEST_SCHEMA_VERSION`); a shipped migration is never edited.

---

## 1. Store

- Driver: `node:sqlite` (`DatabaseSync`) with `journal_mode = WAL`,
  `foreign_keys = ON`, `busy_timeout`. One file, path from `NOVA_LIFE_DB`
  (default `<cwd>/.nova-life/life.sqlite`), `:memory:` for tests.
- `store.transaction(fn)` wraps work in `BEGIN`/`COMMIT` with rollback on throw.
- `store.exportAll()` requires the `memory.read` grant and returns a JSON object
  with every table for the user; `store.deleteUser()` removes user rows
  (`tool_permissions` is deliberately excluded — permissions belong to the
  install, not to the data being deleted); `store.backup()` copies the database
  file next to the original with a timestamp.
- Search uses FTS5 (`memories_fts`, contentless-external with triggers). When FTS
  is unavailable the query falls back to `tokens` strategy, and the response says
  which strategy ran.

Tables (SQLite): `life_meta`, `memories`, `memory_versions`, `memory_links`,
`tasks`, `task_steps`, `experiences`, `experience_evaluations`, `skills`,
`skill_versions`, `skill_runs`, `verification_records`, `evidence_records`,
`user_approvals`, `provider_registry`, `tool_permissions`, `audit_events`,
`benchmark_cases`, `benchmark_results`, `memories_fts`.

The Supabase migration (`supabase/migrations/20261108_nova_life.sql`) mirrors the
persistent subset in 13 `life_*` tables with RLS; the rollback migration drops
all 13 and leaves the workspace tables untouched. Both are exercised by
`scripts/test-life-sql.mjs` on PGlite.

---

## 2. Enumerations

| Concept | Values |
| --- | --- |
| Permission level | `read`, `write`, `execute`, `network`, `transmit` |
| Memory category | `working`, `episodic`, `semantic`, `procedural`, `personal` |
| Memory visibility | `private`, `task`, `shared` |
| Language | `en`, `si`, `ta`, `und` |
| Task status | `planned`, `running`, `awaiting_approval`, `completed`, `failed`, `cancelled` |
| Step status | `pending`, `running`, `completed`, `failed`, `skipped` |
| Verification status | `verified`, `partially_verified`, `failed`, `unverified` |
| Evidence kind | `test`, `file`, `command`, `source`, `model`, `memory`, `manual`, `simulation` |
| Skill status | `discovered`, `draft`, `sandbox_testing`, `verification`, `user_approval`, `active`, `deprecated`, `rejected` |
| Experience outcome | `success`, `partial`, `failure` |
| Graph relation | see §7 |

---

## 3. Error shape

Every rejected request is

```json
{ "error": "human readable sentence", "code": "ENGINE_CODE", "details": { } }
```

with HTTP status 400 (input), 403 (permission/approval), 404 (absent), 409
(state), 422 (policy refusal), 500 (internal), 503 (provider/engine unavailable).

Codes used by the engine, grouped:

- Validation: `INVALID_INPUT`, `INVALID_CATEGORY`, `INVALID_MEMORY_TITLE`,
  `INVALID_MEMORY_BODY`, `INVALID_OBJECTIVE`, `INVALID_TASK`, `INVALID_SKILL`,
  `INVALID_TRANSITION`, `INVALID_DECISION`, `INVALID_EXPERIENCE`, `INVALID_EVIDENCE`,
  `INVALID_EVIDENCE_KIND`, `INVALID_RELATION`, `INVALID_ENTITY_ID`,
  `INVALID_ENTITY_TYPE`, `INVALID_CHANGESET`, `INVALID_URL`.
- Not found: `MEMORY_NOT_FOUND`, `TASK_NOT_FOUND`, `SKILL_NOT_FOUND`,
  `EXPERIENCE_NOT_FOUND`, `VERSION_NOT_FOUND`, `CHANGESET_NOT_FOUND`,
  `WORKSPACE_NOT_FOUND`, `FILE_NOT_FOUND`.
- Permission: `PERMISSION_DENIED`, `APPROVAL_REQUIRED`, `UNKNOWN_PERMISSION`,
  `TOOL_DISABLED`, `EXECUTION_DISABLED`, `LOCAL_ONLY_BLOCKED`,
  `LOCAL_ONLY_NO_PROVIDER`.
- Safety: `PATH_OUTSIDE_ROOT`, `SECRET_FILE_BLOCKED`, `SECRET_IN_MEMORY`,
  `HOST_NOT_ALLOWED`, `SCRIPT_NOT_ALLOWED`, `FILE_TOO_LARGE`,
  `CHANGESET_TOO_LARGE`, `SELF_LINK`, `SKILL_REJECTED`, `SECRET_IN_MEMORY`.
- Providers: `NO_PROVIDER`, `PROVIDER_NOT_CONFIGURED`, `PROVIDER_UNREACHABLE`,
  `PROVIDER_ERROR`, `AI_TIMEOUT`, `UNKNOWN_PROVIDER`, `STREAM_UNSUPPORTED`.
- Lifecycle: `TASK_FINISHED`, `CANCELLED`, `EXPERIENCE_NOT_REPLAYABLE`,
  `NOT_VERIFIED`, `SKILL_NOT_ACTIVE`, `NO_TEST_CASES`, `NO_VERSION`,
  `SKILLS_UNAVAILABLE`, `BACKUP_FAILED`.

`LifeError` carries `code`, `status` and optional `details`; the router maps
`error.status` and never leaks a stack.

---

## 4. Memory fabric

Record fields: `id`, `user_id`, `category`, `title`, `body`, `language`, `tags[]`,
`source`, `visibility`, `confidence` (0–1), `pinned` (bool), `version`, `embedding`
(optional), `created_at`, `updated_at`, `expires_at`.

Rules:

- `title` 1–200 chars, `body` ≤ 20 000 chars after redaction.
- If `SECRET_IN_MEMORY` is raised the write is refused with **422**; credentials
  are never persisted, not even redacted-in-place, when they appear in the
  title. Redaction still applies to free text.
- `visibility: 'private'` is the default; a private memory never leaves the
  device through any adapter.
- Editing creates a new row in `memory_versions`; `PATCH /memory/:id` bumps
  `version`; `POST /memory/:id/revert` restores an earlier version as a new
  version (history is never rewritten).
- `POST /memory/:id/correct` stores a correction with a reason and links it via
  `RELATED_TO`.
- Duplicate suppression on create: Jaccard similarity ≥ 0.8 **and** at least 8
  shared tokens. Both conditions are required, so short records are not merged by
  accident.
- Retention: `working` expires after 7 days, `episodic` after 180 days;
  `semantic`, `procedural` and `personal` do not expire. `POST /memory/expire`
  deletes what is past `expires_at` and returns the ids.

Retrieval score (0–1):

```
0.45 · keyword (FTS bm25 or token overlap)
0.20 · recency (30-day half-life)
0.15 · confidence
0.10 · pinned
0.10 · cosine similarity (only when both sides have embeddings)
```

The response reports `strategy: 'fts' | 'fts+vector' | 'tokens'` and per-hit
components, so the ranking is auditable rather than opaque.

---

## 5. Orchestrator

```js
DEFAULT_LIMITS = { maxSteps: 8, maxToolCalls: 4, maxIterations: 2 }
```

- `maxSteps` is clamped to 2–12, `maxToolCalls` to 0–8, `maxIterations` to 1–4.
  Exceeding the step cap marks the remainder `skipped` and sets
  `plan.truncated = true`; nothing is dropped silently.
- Intent detection is deterministic regex code, not a model: `run-tests`,
  `read:<path>`, `search:<query>`, `list`, `review`. An unmatched objective
  becomes `review` (list the project), which is read-only.
- Tools are selected from the task's allowlist; an intent that maps to a tool
  outside the allowlist produces a `skipped` step with a reason.
- `toolCallCount` is counted independently of steps, so a plan cannot exceed the
  call budget by naming more steps.
- A run that performs checks ends with a verification record; a run with no
  independently checkable evidence stays `unverified`.

---

## 6. Verification and evidence

`verification.verify({ taskId, checks, notes })`:

- A check is `{ id, kind, passed, detail }`. Unknown `kind` → `INVALID_EVIDENCE_KIND`.
- `passed` must be a real boolean; a truthy string is rejected (`INVALID_EVIDENCE`).
- Evidence rows store `kind`, `label`, `detail`, `digest` (32 hex chars, sha256
  prefix over task, kind, label, detail).
- Status: no checks → `unverified` (and an error note "no independent checks were
  performed"); all pass → `verified`; some pass → `partially_verified`; none
  pass → `failed`.
- Model text is evidence of kind `model` only and can never on its own produce
  `verified`. Approval is a user action recorded in `user_approvals`; the engine
  has no code path where a provider/model output writes an approval row.

---

## 7. Knowledge graph

Nodes are typed ids (`memory`, `task`, `skill`, `experience`, `evidence`,
`project`). `graph.link({ fromType, fromId, toType, toId, relation })` validates
both ends, rejects unknown types (`INVALID_ENTITY_TYPE`), unknown relations
(`INVALID_RELATION`) and self-links (`SELF_LINK`).

Relations in use: `EXPERIENCE_CREATED_SKILL`, `TASK_USED_SKILL`,
`MEMORY_SUPPORTS_TASK`, `EVIDENCE_VERIFIES_RESULT`, `SKILL_DEPENDS_ON_SKILL`,
`PROJECT_ASSOCIATED_WITH_MEMORY`, `TASK_PRODUCED_EXPERIENCE`,
`SKILL_PRODUCED_VERSION`, `RELATED_TO`.

`GET /graph` returns edges plus `byRelation` counts. There is no graph database
dependency; the edges live in `memory_links` and are indexed on
`(user_id, from_type, from_id)`.

---

## 8. Experience replay

`experiences.record()` derives the outcome from the verification record — never
from the task's own claim:

| verification | outcome | `replayable` |
| --- | --- | --- |
| `verified` | `success` | true |
| `partially_verified` | `partial` | false |
| `failed` / none | `failure` | false |

(Replay requires `verified`; partial runs are recorded but not replayed.)

Similarity between experiences is `0.7 · token overlap + 0.25 · same task type +
0.1 · verified`. `POST /experiences/:id/replay` returns the recorded steps,
objective and lessons, and refuses an unverified experience with
`EXPERIENCE_NOT_REPLAYABLE` (409). **No weights are trained.**

---

## 9. Skills

Lifecycle: `discovered → draft → sandbox_testing → verification → user_approval
→ active → deprecated`, with `rejected` reachable from any pre-active state.

- Discovery requires ≥ 2 verified experiences of the same task type
  (`GET /skills/candidates/discover`).
- `POST /skills/:id/test` validates the declared test cases against the skill's
  input/output schemas and returns `{ skill, runId, passed, checks, executed }`.
  Over HTTP `executed` is always `false`: the engine does not execute the
  procedure against the user's machine.
- Activation needs an approval row for that exact skill version. `POST
  /skills/:id/activate` without one → 403. Approval is user-initiated
  (`/request-approval` creates the request, `/approve` records the decision).
- Editing an `active` skill's instructions creates a **new draft version**
  (`updateDraft`) instead of mutating the active one; the active version keeps
  serving until the new one is approved.
- `rollback` re-points the skill at a previous version; `deprecate` ends service
  without deleting history.

---

## 10. Simulation

- `POST /simulation/workspace` creates a changeset in a temp directory.
- `POST /simulation/preview` returns a unified-style line diff
  (`lineDiff(before, after)`); limits: **20 files**, **400 KB** per changeset.
- `POST /simulation/run-tests` runs an allowlisted script inside the temp copy
  and records output as evidence of kind `simulation`/`test`.
- `POST /simulation/apply` requires `simulation.apply` plus a recorded approval
  and copies the temp files over the workspace; `POST /simulation/rollback`
  restores the previous content.
- The temp directory is **not** an OS sandbox. It limits blast radius and gives
  you a diff to review; it does not contain a hostile binary. This is stated in
  the preview `note`, in `/simulation`'s limits, and in the UI.

---

## 11. Benchmarks

Seven cases in three suites (`language`, `memory`, `security`), all offline and
deterministic. Each case has `id`, `suite`, `name`, `language`, `input` and an
`expectation`. The memory suite seeds its own records, measures, then deletes
them. Results persist in `benchmark_results` with `run_id`, total, passed,
`by_language`, `details` and timestamps. `GET /benchmarks` returns `dataset` (id, suite,
name, language — never the expected answer), `cases()` (full definitions for the
UI) and `history`; `POST /benchmarks/run` executes and returns the
measured result.

Measured on this branch (Node 22.22.3, Linux x64): 7/7 passed; `en` 4 cases
(23.64 ms total, dominated by the first FTS insert), `si` 2 cases 2.60 ms, `ta`
1 case 0.01 ms. Individual cases: `lang-en` 0.11, `lang-si` 0.04, `lang-ta` 0.01,
`mem-en` 22.15, `mem-si-cross` 2.56, `sec-injection` 0.86, `sec-redaction` 0.52
(ms). Numbers differ per machine; the harness is the reproducible part.

---

## 12. Configuration

| Variable | Meaning |
| --- | --- |
| `NOVA_LIFE_DB` | SQLite path (`:memory:` in tests) |
| `NOVA_LIFE_ALLOW_EXECUTE` | `1` enables `tests.run` |
| `NOVA_LOCAL_ONLY` | `1` blocks every cloud provider |
| `NOVA_RESOURCE_PROFILE` | override hardware profile: `low` / `balanced` / `high` |
| `NOVA_GPU_VRAM_GB`, `NOVA_GPU_VENDOR` | operator-declared GPU; never guessed |
| `OLLAMA_BASE_URL`, `NOVA_LOCAL_MODEL`, `NOVA_LOCAL_CONTEXT` | local adapter |
| `OPENAI_COMPAT_BASE_URL` | llama.cpp / vLLM / LM Studio compatible endpoint |
| `LLAMA_CPP_BASE_URL` | explicit llama.cpp server |
| `NOVA_EMBED_MODEL` | embedding model name (vectors are optional) |
| `NOVA_GEMINI_MODEL` | override the Gemini model id |

No provider key is ever returned by `/config` or `/providers`; the payload only
reports `configured: true|false`.
