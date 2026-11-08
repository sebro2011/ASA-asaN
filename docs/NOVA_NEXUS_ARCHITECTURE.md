# NOVA NEXUS — architecture

NOVA NEXUS is the intelligence layer built on top of the existing NOVA app. It is
implemented as `server/life/*` on the server and
`src/workspace/intelligence/*` in the browser, mounted at `/api/nova/life` and
`/intelligence` respectively. The name "L.I.F.E." stands for *Local
Intelligence, Feedback & Evolution*: the parts of the system that keep working
when there is no network, learn only from evidence they can check themselves,
and evolve skills through an approval gate a human controls.

Everything in this document exists in this branch. Where something is
deliberately absent or limited, it says so.

## 1. Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│ UI (React, /intelligence)                                               │
│  IntelligenceSurface.tsx — 8 tabs, one fetch client (lifeClient.ts)     │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ /api/nova/life/*   (JSON, rate-limited 120/min)
┌───────────────────────────────┴─────────────────────────────────────────┐
│ HTTP adapter                         server/life/router.js              │
│  validation, error mapping, permission guards per endpoint               │
└───────────────────────────────┬─────────────────────────────────────────┘
┌───────────────────────────────┴─────────────────────────────────────────┐
│ Engines                                                                 │
│  modelFabric.js      adaptive model fabric, provider health, selection  │
│  memory.js graph.js  unified memory fabric + knowledge graph            │
│  orchestrator.js     bounded task execution                             │
│  experiences.js      replay and evaluation                              │
│  skills.js           skill lifecycle and versions                       │
│  simulation.js       dry-run, diff, apply/rollback                      │
│  verification.js     evidence and proof status                          │
│  benchmarks.js       reproducible evaluation suite                      │
│  security.js hardware.js language.js tools.js                           │
└───────────────────────────────┬─────────────────────────────────────────┘
┌───────────────────────────────┴─────────────────────────────────────────┐
│ Store                                server/life/store.js              │
│  node:sqlite (local file) + FTS5, transactions, foreign keys            │
│  identical record shapes in the Supabase migration for hosted accounts  │
└─────────────────────────────────────────────────────────────────────────┘
```

The router is mounted in `server.ts` before the SPA catch-all, so `/api/nova/life`
is served by the same Express app as the rest of NOVA, including the Vercel
single-file bundle built from `api/index.ts` → `server/vercelEntry.ts`. No second
entrypoint was added.

## 2. Design rules the code enforces

1. **Local first.** Records live in one SQLite file. Cloud providers are only
   reachable when they are configured *and* `NOVA_LOCAL_ONLY` is not `1`. In
   local-only mode a cloud call fails with `LOCAL_ONLY_BLOCKED` and a request
   that has no local provider fails with `LOCAL_ONLY_NO_PROVIDER` — it does not
   silently fall back to the cloud.
2. **A model cannot approve its own claim.** `verification.verify()` accepts
   checks and evidence; a natural-language answer is never evidence. A model's
   output is recorded as evidence of kind `model` only, which on its own cannot
   produce `verified`.
3. **Nothing privileged happens by default.** Baseline grants cover only the
   user's own records and the install-level skills switch
   (`memory.read/write/delete`, `tasks.read/write`, `tools.read`,
   `skills.activate`); `tools.execute`, `network.fetch`, `transmit.external` and
   `simulation.apply` are never granted implicitly. Shell execution requires
   `NOVA_LIFE_ALLOW_EXECUTE=1`, an explicit `tools.execute` grant, and a recorded
   approval for the specific command. `web.fetch` is restricted to an allowlist
   of hosts.
4. **No invented data in the UI.** Every panel renders a payload from the engine
   or an explicit empty/error state that shows the engine's error code. There is
   no placeholder metric, no sample chart, and no "demo mode".
5. **Bounded autonomy.** The orchestrator has hard caps (`maxSteps 8`,
   `maxToolCalls 4`, `maxIterations 2`), an allowlisted tool registry, and
   deterministic planning for security-sensitive intents.
6. **Honest simulation.** `simulation.js` copies files into a temporary
   directory, diffs them, and can apply or roll back. It never claims to be an
   OS sandbox; the code comments, the `note` field of the preview response, and
   these docs say so.

## 3. Request lifecycle (a task run)

`POST /api/nova/life/tasks` creates a task with a plan derived from the request.
`POST /tasks/:id/run` then:

1. `security.assertCapability('tasks.write')` — refusal raises
   `PERMISSION_DENIED` (403) or `APPROVAL_REQUIRED` (403).
2. `orchestrator.run()` executes steps. Each step maps to one allowlisted tool
   id (`project.list`, `project.read`, `project.search`, `tests.run`,
   `web.fetch`) with a bounded argument set. Steps that exceed the cap are
   recorded as `skipped`, never silently dropped.
3. `tools.*` re-checks its own permission, root confinement and secret-file
   rules. A path outside the project root is rejected with
   `PATH_OUTSIDE_ROOT`; a `.env` read is rejected with `SECRET_FILE_BLOCKED`.
4. `verification.verify()` runs the task's checks, hashes the evidence
   (32 hex chars) and writes a `verification_records` row.
5. `experiences.record()` stores the run. `replayable` is true only when the
   verification is `verified` or `partially_verified` and the run succeeded.
6. Every mutation writes an `audit_events` row.

The response is the task with steps, verification and experience ids, so the UI
can show exactly what ran.

## 4. Module map

| Concern | File | Notes |
| --- | --- | --- |
| Schema, migrations, FTS | `schema.js` | append-only migrations, `LATEST_SCHEMA_VERSION = 1` |
| Connection, transactions, backup, export/delete | `store.js` | `node:sqlite`, `DatabaseSync`, WAL |
| Permission registry, approvals, redaction, sanitisation | `security.js` | 5 tiers, `resolveInside` path guard |
| Language detection, glossary, tokenising | `language.js` | `en`, `si`, `ta`, `und` |
| Resource profiles | `hardware.js` | `low` / `balanced` / `high`, from `os` + env |
| Provider adapters and selection | `modelFabric.js` | Ollama, OpenAI-compatible, llama.cpp, OpenRouter, Gemini |
| Memory CRUD, versions, search | `memory.js` | hybrid scoring, FTS5, optional vectors |
| Knowledge graph | `graph.js` | 9 relation types, typed nodes |
| Tools | `tools.js` | 5 tools, allowlists, root confinement |
| Verification | `verification.js` | evidence digests, four statuses |
| Experiences | `experiences.js` | replay, similarity, evaluation |
| Skills | `skills.js` | 8-state lifecycle, versions |
| Orchestration | `orchestrator.js` | intents, caps, step records |
| Simulation | `simulation.js` | temp workspace, diff, apply, rollback |
| Benchmarks | `benchmarks.js` | 7 cases, 3 suites |
| Composition + HTTP | `index.js`, `router.js` | engine factory, routes |

## 5. UI

`/intelligence` is one route with eight tabs that map one-to-one onto the eight
required areas:

| Tab | Area | Data source |
| --- | --- | --- |
| Overview | A — Intelligence Dashboard | `GET /status`, `GET /hardware` |
| Memory | B — Memory Center | `GET /memory`, `POST /memory`, `GET /memory/search` |
| Skills | C — Skill Library | `GET /skills`, lifecycle actions |
| Experiences | D — Experience Center | `GET /experiences`, `POST /experiences/:id/replay` |
| Verification | E — Verification Center | `GET /verifications`, `GET /evidence` |
| Models & runtime | F — Model & Runtime Settings | `GET /config`, `POST /providers/health`, `POST /providers/select` |
| Security | G — Security Center | `GET /security`, `POST /security/grants`, `POST /security/approvals`, `GET /security/audit` |
| Benchmarks | H — Benchmark Center | `GET /benchmarks`, `POST /benchmarks/run` |

The surface uses the existing Liquid Glass dark identity: it reuses `.nova-panel`,
`.nova-chip`, `.nova-record` and the workspace tokens from
`src/styles/workspace.css`. New classes are limited to `.nova-stat`,
`.nova-chip--accent`, `.nova-chip--ok` and table header styling.

Copy is in English, Sinhala and Tamil (`wsIntel*` keys in
`src/i18n/workspaceCopy.ts`); the shell test asserts identical key sets across
the three languages and forbids dynamic `t()` keys.

## 6. Failure behaviour

Every error crossing the HTTP boundary is `{ error: <human text>, code: <ENGINE_CODE>, details? }`.
The client raises `LifeApiError` and keeps `code` and `status`, so the UI prints
the engine code instead of inventing a message. The overview shows a single
error panel (`The engine did not answer this request.` + code) rather than
partial tiles, because a half-loaded dashboard would imply data it does not have.

## 7. What this architecture does not do

- No weight training or fine-tuning. Evolution happens in skills, memory and
  routing policy, not in model parameters.
- No OS-level sandbox. Simulation is file-scoped dry-run inside a temp directory
  with size and count limits.
- No automatic model downloads, and no network call at startup.
- No permanent storage of conversations. Memories are written deliberately.
- No multi-user RBAC beyond the per-user scoping that SQLite rows and Supabase
  RLS already provide; see `NOVA_SECURITY_MODEL.md` §8 for the honest scope.
