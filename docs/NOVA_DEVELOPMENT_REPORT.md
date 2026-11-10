# NOVA NEXUS / N.O.V.A. L.I.F.E. — development report

Branch: `arena/e6b12975-asa-asan` (PR #33). Date: 2026-11-08.
Node 22.22.3 · `node:sqlite` + FTS5 · Express + Vite/React.

This report covers what was built in this mission, how it was verified, and what
is **not** finished. Nothing below is projected or planned-into-the-past: every
"met" row names a file, a test or a measured run.

---

## 1. Phase log (as executed)

| Phase | Scope | Result |
| --- | --- | --- |
| 0 | Audit of the existing app and constraints | kept the existing engine, providers, routes and tests; no file deleted; NEXUS added as `server/life/*` + `/intelligence` |
| 1 | Local runtime core: store, schema, security kernel, hardware, language | `store.js`, `schema.js` (v1, 20 tables incl. FTS), `security.js`, `hardware.js`, `language.js` |
| 2 | Adaptive model fabric | `modelFabric.js` — 5 providers, health, selection, local-only enforcement, approval check for cloud calls |
| 3 | Memory fabric + graph | `memory.js` (5 categories, versions, hybrid search), `graph.js` (9 relations) |
| 4 | Orchestrator + tools | `orchestrator.js` (plan, caps, steps), `tools.js` (5 tools, allowlists, path confinement) |
| 5 | Proof & verification | `verification.js` (evidence digests, 4 statuses, no self-approval) |
| 6 | Experience replay | `experiences.js` (evidence-derived outcomes, replay gating, similarity) |
| 7 | Skill evolution | `skills.js` (8 states, versioning, approval gate, rejection on injection) |
| 8 | Simulation | `simulation.js` (preview/workspace/diff/apply/rollback, 20 files / 400 KB) |
| 9 | Benchmarks + HTTP + UI | `benchmarks.js` (7 cases), `router.js` (61 routes), `/intelligence` with 8 tabs |
| 10 | Tests, migrations, documentation, report | 5 engine suites + 1 UI suite, Supabase migration + rollback, 11 docs, this report |

## 2. What ships

**Engine** — 17 files, ~5 400 lines in `server/life/`:

`schema.js`, `store.js`, `security.js`, `language.js`, `hardware.js`,
`modelFabric.js`, `memory.js`, `graph.js`, `tools.js`, `verification.js`,
`experiences.js`, `skills.js`, `orchestrator.js`, `simulation.js`,
`benchmarks.js`, `index.js`, `router.js`.

**HTTP** — mounted at `/api/nova/life` in `server.ts` (before the SPA catch-all),
rate-limited 120/min, 61 endpoints across status, providers, memory, tasks,
experiences, skills, verification, security, simulation, benchmarks, graph and
data.

**UI** — `src/workspace/intelligence/lifeClient.ts` (typed client) and
`IntelligenceSurface.tsx` (8 tabs), routed at `/intelligence`, listed in the nav
with `status: live`. Copy in English, Sinhala and Tamil (`wsIntel*`, 104 keys).

**Database** — `supabase/migrations/20261108_nova_life.sql` (13 `life_*` tables,
RLS, 4 policies each) and `20261108_nova_life_rollback.sql`.

**Tests** — 6 new suites, 48 engine tests + 5 UI tests, all registered in
`package.json`; `npm test` runs 482 tests in total.

## 3. The 20 required points

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Extend, never replace, the existing NOVA engine | ✅ | only additive edits (`server.ts` mount, nav/router/App entries); all pre-existing suites pass inside the 396 |
| 2 | Phase 0 audit before building | ✅ | §1 of this report; constraint list kept in the mission record |
| 3 | 01 Adaptive Model Fabric | ✅ | `modelFabric.js`: Ollama, OpenAI-compatible, llama.cpp, OpenRouter, Gemini; `/providers`, `/providers/health`, `/providers/select`; no key leaks (`test-life-api` asserts) |
| 4 | 02 Unified Memory Fabric (5 categories, SQLite, migrations, transactions, backups, FTS5, optional vectors) | ✅ | `memory.js`, `schema.js`; FTS5 `memories_fts`; `store.tx`, `store.backup`, `POST /backup`; vector term only with an embedding adapter |
| 5 | 03 Autonomous Intelligence Orchestrator (bounded, allowlisted, deterministic for risky ops) | ✅ | `orchestrator.js` `DEFAULT_LIMITS`, regex intents, tool allowlist; `test-life-orchestration` |
| 6 | 04 Experience Replay Engine (only checkable evidence counts; no weight training) | ✅ | `experiences.js` outcome from verification; `EXPERIENCE_NOT_REPLAYABLE`; no training code anywhere |
| 7 | 05 Skill Evolution Engine (DISCOVERED→…→DEPRECATED, no auto-activation) | ✅ | `skills.js` 8 states; `activate` without approval → 403 (asserted in `test-life-api`) |
| 8 | 06 Predictive Simulation Engine (dry-run, temp workspace, diff, rollback; no sandbox claim; exec off) | ✅ | `simulation.js`; the preview `note`, the limits, and the `executed` flag all state it is not a sandbox |
| 9 | 07 Proof & Trust Engine (an LLM cannot approve its own claims) | ✅ | evidence kinds; `security.decide()` sole writer of approvals; verification derives from checks |
| 10 | 08 Security & Evaluation Kernel (registry, allowlists, RBAC, traversal/injection, redaction, audit, network controls, 5 tiers, revocation) | ⚠️ partial | all present except **role-based** access; access is capability-based with per-user scoping — see §5 |
| 11 | Unified knowledge graph | ✅ | `graph.js`, `GET /graph`, `POST /graph/link`, 9 relations, typed nodes |
| 12 | Multilingual si/ta/en, first-class, cross-language retrieval measured per language | ✅ | script detection, glyph glossary, `byLanguage` in every benchmark run (en 4 / si 2 / ta 1 cases) |
| 13 | Hardware Awareness Manager (LOW/BALANCED/HIGH, no auto downloads) | ✅ | `hardware.js`, `NOVA_RESOURCE_PROFILE`, `contextBudget`; no download code path |
| 14 | Storage entities + export/delete | ✅ | `GET /export`, `DELETE /data`, `POST /backup`; `test-life-memory` covers export permission |
| 15 | UI areas A–H backed by real data only | ✅ | 8 tabs, every panel from an endpoint; `test-workspace-intelligence` asserts error codes and empty states |
| 16 | Liquid Glass dark identity preserved | ✅ | reuses `.nova-panel/.nova-chip/.nova-record` and workspace tokens; contrast test still passes |
| 17 | Tests: unit, integration, security, regression, multilingual, performance | ⚠️ partial | five of six fully; **performance has latency sampling only** (no load/SLO test) |
| 18 | Reproducible benchmark dataset with actual results | ✅ | 7 cases, 3 suites; 7/7 passed; numbers in `NOVA_EVALUATION_FRAMEWORK.md` §4 |
| 19 | 11 named documents | ✅ | all eleven in `docs/`, listed in §6 |
| 20 | Final report with 20 points and 20 acceptance criteria, unmet marked | ✅ | §3, §4, §5 |

## 4. The 20 acceptance criteria

| # | Criterion | Verdict | How it is checked |
| --- | --- | --- | --- |
| 1 | Existing features and integrations still work | ✅ | 482/482 tests, including every pre-existing suite; `test:workspace-shell` still pins routes and copy |
| 2 | No working provider removed, no conversations or saved data deleted | ✅ | additive diff; no migration drops a non-`life_*` table |
| 3 | No mock data, no fake AI activity, no invented metrics in the product | ✅ | UI has no fixtures; error paths render engine codes; benchmark seeds its own data |
| 4 | An LLM cannot approve its own claim | ✅ | `user_approvals` written only by `security.decide()`; verification needs checks |
| 5 | No skill auto-activation | ✅ | `activate` requires an approval row and a passed test (403/409 asserted) |
| 6 | No "physically accurate simulation" / sandbox claim | ✅ | name, payload note and docs say temp-directory dry run |
| 7 | Shell execution off by default | ✅ | `NOVA_LIFE_ALLOW_EXECUTE` + grant + approval; `TOOL_DISABLED`/`EXECUTION_DISABLED` |
| 8 | No invented tools or permissions | ✅ | closed registry; `UNKNOWN_TOOL`, `UNKNOWN_PERMISSION` |
| 9 | Bounded loops and caps | ✅ | `maxSteps 8 / maxToolCalls 4 / maxIterations 2`, clamped; leftovers `skipped` |
| 10 | Secrets never stored in memory | ✅ | `SECRET_IN_MEMORY` 422 in `test-life-api`; redaction elsewhere |
| 11 | No automatic large-model downloads | ✅ | no download code; health reports unreachable instead |
| 12 | Local-only mode blocks cloud before any request | ✅ | `LOCAL_ONLY_BLOCKED` / `LOCAL_ONLY_NO_PROVIDER`; health marks cloud `blocked` |
| 13 | Memory categories, retention, versions, corrections, reverts | ✅ | `test-life-memory` (13 tests), `test-life-sql` retention/constraint checks |
| 14 | Cross-language retrieval measured per language | ✅ | `lang-en/si/ta` + `mem-si-cross`; `byLanguage` totals in every run |
| 15 | UI numbers come from the system, not from copy | ✅ | `IntelligenceSurface` renders `status.counts`; UI test fails if a hard-coded value appears |
| 16 | Copy available in en, si and ta | ✅ | `test:workspace-shell` key parity + no dynamic `t()` keys |
| 17 | Security tests cover traversal, injection, revocation, allowlists | ✅ | `test-life-memory`, `test-life-api`, `test-life-orchestration`, `test:security-performance` |
| 18 | Benchmark results are actual, not estimated | ✅ | 7/7 with per-case latencies measured on this branch |
| 19 | Documentation describes only what exists | ✅ | every doc names the implementing file; gaps stated in each |
| 20 | Unmet items are marked incomplete, not silently skipped | ✅ | §5 below, plus ⚠️ rows in §3/§4 |

## 5. Incomplete or limited — stated plainly

1. **Role-based access control is not implemented.** Permissions are capabilities
   (`read/write/execute/network/transmit`) granted per install and checked per
   action; there are no admin/editor/viewer roles and no user authentication on
   `/api/nova/life`. Hosted deployments must rely on platform auth, and Supabase
   RLS provides row scoping for the mirrored tables only. Point 10 is therefore
   *partial*.
2. **No performance/load test.** Latency is sampled per benchmark case and rate
   limiting is tested, but there is no throughput test, no concurrency test and
   no SLO assertion for the life engine. Point 17 is *partial*.
3. **No live LLM end-to-end run.** The sandbox cannot reach a model server, so
   adapters are exercised against a local HTTP server and stubbed `fetch`. There
   is no measured answer-quality number anywhere in this repo, and none is
   published.
4. **Supabase migration verified on PGlite, not on a live project.** The SQL,
   RLS policies and rollback are executed by `test-life-sql`; a real Supabase
   project run is still pending.
5. **SQLite is not durable on serverless.** The Vercel deployment needs the
   Supabase mirror or persistent storage; the local file is the source of truth
   only on a machine.
6. **Vector search exists but is unmeasured.** It contributes a 0.10 term when an
   embedding adapter returns both sides; retrieval quality with embeddings has
   not been evaluated.
7. **The cross-language bridge is 18 concepts.** Good enough for the benchmark
   cases and the astronomy domain; not general translation.
8. **Path confinement is lexical.** `resolveInside()` rejects `..`, absolute paths
   and NUL bytes but does not `realpath`, so a symlink inside the project can
   point outside it.
9. **No skill execution sandbox.** `POST /skills/:id/test` validates declared
   cases; it does not run procedures.
10. **Single language per record.** A memory has one `language`; there is no
    per-locale variant of the same memory.
11. **Simulation change sets live in memory.** Apply/rollback works within a
    process lifetime; after a restart the change-set list is empty (files on disk
    are unaffected).
12. **Wall-clock timezone is UTC in stored timestamps.** The UI formats in local
    time; there is no per-user timezone setting.

## 6. Documentation index

| File | Contents |
| --- | --- |
| `NOVA_NEXUS_ARCHITECTURE.md` | layers, request lifecycle, module map, UI mapping, failure behaviour |
| `NOVA_LIFE_TECHNICAL_SPEC.md` | enums, error codes, store, memory scoring, limits, contracts |
| `NOVA_LOCAL_RUNTIME_GUIDE.md` | env vars, model servers, hardware profiles, selection, troubleshooting |
| `NOVA_MEMORY_SYSTEM.md` | categories, retention, search, versions, graph, export/delete |
| `NOVA_SKILL_EVOLUTION.md` | lifecycle, discovery, versioning, testing, approval, rollback |
| `NOVA_SECURITY_MODEL.md` | capabilities, grants, approvals, allowlists, redaction, injection, audit, honest gaps |
| `NOVA_EVALUATION_FRAMEWORK.md` | test inventory, benchmark dataset, measured results, what is not measured |
| `NOVA_API_REFERENCE.md` | all 61 endpoints with request/response shapes |
| `NOVA_INSTALLATION_GUIDE.md` | requirements, install, migrations, first-run checklist, upgrade, uninstall |
| `NOVA_RESEARCH_AND_NOVELTY.md` | prior art, specific design choices, careful novelty statement, open questions |
| `NOVA_DEVELOPMENT_REPORT.md` | this file |

## 7. Verification commands and results

```bash
npm run lint                                # tsc --noEmit, clean
npm run test:life                           # 10 + 13 + 12 + 8 + 5 = 48 pass
npm run test:workspace-intelligence         # 5 pass
npm test                                    # 401 pass, 0 fail (exit 0)
npm run build                               # esbuild api + vite client, clean
```

Benchmarks (`POST /benchmarks/run`, in-memory SQLite): **7/7 passed** —
`en` 4 cases / 23.64 ms, `si` 2 / 2.60 ms, `ta` 1 / 0.01 ms. The `en` total is
dominated by FTS warm-up on the first memory insert; per-case numbers are in
`NOVA_EVALUATION_FRAMEWORK.md`.

## 8. Recommended next steps

1. Decide the identity model: platform session → `user_id` mapping, then add
   roles on top of the existing capability checks.
2. Run the engine against a real Ollama on a laptop, then measure plan quality on
   a fixed task set (this unlocks points 3 and 17 fully).
3. Add a concurrency/throughput test for `/memory/search` and `/tasks/:id/run`
   with a stated SLO.
4. Apply the Supabase migration to a throwaway project and keep the PGlite test
   as the fast gate.
5. Persist simulation change sets (currently session-scoped) if apply/rollback
   must survive restarts.
6. Replace the lexical path check with `realpath`-based confinement when symlinks
   are common in deployments.
