# NOVA NEXUS API reference

Base URL: `/api/nova/life`. Rate limit: 120 requests per minute per key
(`rateLimit({ windowMs: 60_000, max: 120 })`). Content type: JSON in, JSON out.
Hosted deployments require `Authorization: Bearer <Supabase access token>` and
`NOVA_LIFE_OWNER_ID`; each token is verified with Supabase Auth and only the
configured owner is accepted. An offline local install may explicitly set
`NOVA_LIFE_ALLOW_UNAUTHENTICATED_LOCAL=1` in non-production, without Supabase
settings, for loopback requests only.

Every error is `{ error, code, details? }`; see `NOVA_LIFE_TECHNICAL_SPEC.md` §3
for the code list. A permission refusal is 403, an approval refusal is 403 with
`code: "APPROVAL_REQUIRED"`, a missing record is 404, a state conflict is 409, a
policy refusal is 422.

Conventions used below: `?` marks an optional field. Ids are strings prefixed by
type (`mem_`, `task_`, `exp_`, `skill_`, `run_`, `audit_`, `approval_`, …).

---

## Status and configuration

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/status?lang=en\|si\|ta` | — | engine name, architecture, `version`, `schemaVersion`, `storage {engine, fts, path}`, `mode {localOnly, executionEnabled}`, `hardware`, `providers {total, localConfigured, cloudConfigured}`, `counts {memories, tasks, skills, activeSkills, experiences, verifications, auditEvents}`, `permissions`, `graph {edges, byRelation}`, `tools` |
| GET | `/hardware` | — | `{ profile, cpu, totalRamGb, freeRamGb, gpu, source }`; GPU is only present when declared by the operator |
| GET | `/config` | — | `{ localOnly, executionEnabled, providers[], hardware, database {fts, schemaVersion} }`; never contains key material |

## Providers

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/providers` | — | `{ providers: [{ id, label, kind, configured, model }] }` |
| POST | `/providers/health` | — | `{ localOnly, localAvailable, checkedAt, providers: [{ id, kind, status, ok, latencyMs, models[], detail }] }` |
| GET | `/providers/:id/capabilities` | — | adapter capabilities (`chat`, `stream`, `tools`, `json`, `embeddings`) or `UNKNOWN_PROVIDER` |
| POST | `/providers/select` | `{ complexity?: 'simple'|'standard'|'complex', json?: bool, tools?: bool }` | the chosen provider/model with the reason it won; `LOCAL_ONLY_NO_PROVIDER` when nothing local is reachable in local-only mode |

Provider ids: `ollama`, `openai-compatible`, `llama-cpp`, `openrouter`, `gemini`.
Selection prefers the smallest configured local model that satisfies the request
(observed: `llama3.2:3b`).

## Memory

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/memory?category=&limit=50&offset=0` | — | `{ counts, memories[], permissions, retention, categories[] }` |
| POST | `/memory` | `{ category, title, body, language?, tags?, confidence?, pinned?, visibility?, expiresAt? }` | `{ memory, duplicate? }`; 422 `SECRET_IN_MEMORY`, 400 `INVALID_MEMORY_TITLE` |
| GET | `/memory/search?q=&category=&limit=10` | — | `{ query, strategy, results: [{ memory, score, components {keyword, recency, confidence, pinned, vector} }] }` |
| POST | `/memory/summarize` | `{ category?, limit? }` | `{ summary, used[], method: 'extractive' }` |
| POST | `/memory/expire` | — | `{ removed }`; requires the `memory.delete` grant |
| GET | `/memory/:id` | — | `{ memory, versions[] }` |
| PATCH | `/memory/:id` | any mutable field | `{ memory }` (version incremented) |
| POST | `/memory/:id/correct` | `{ body?, reason? }` | `{ memory, correction }` |
| POST | `/memory/:id/revert` | `{ version }` | `{ memory }` (revert recorded as a new version) |
| DELETE | `/memory/:id` | — | `{ deleted: true }` |

## Tasks and orchestration

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| POST | `/tasks` | `{ objective, taskType?, language?, allowedTools?, limits? }` | `{ task }` with `plan { steps, truncated, intents }` |
| GET | `/tasks?limit=20` | — | `{ tasks[] }` |
| GET | `/tasks/:id` | — | `{ task }` including steps and ids |
| POST | `/tasks/:id/run` | `{ approvalId?, toolApprovals? }` | `{ task, verification, experienceId }`; 403 on missing grant/approval |
| POST | `/tasks/:id/cancel` | — | `{ task }` with status `cancelled`; 409 `TASK_FINISHED` if already done |
| POST | `/tasks/:id/skill` | `{ skillId }` | links a skill to the task (`TASK_USED_SKILL`) |
| GET | `/tasks/:id/verification` | — | `{ verifications[] }` |

## Experiences

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/experiences?type=&outcome=&limit=30` | — | `{ experiences[] }` |
| POST | `/experiences` | `{ taskId?, taskType, objective, summary, verificationId?, lessons?, tags? }` | `{ experience, duplicate? }` |
| GET | `/experiences/similar?type=&q=&limit=5` | — | ranked experiences with similarity scores |
| GET | `/experiences/:id` | — | `{ experience, evaluations[] }` |
| POST | `/experiences/:id/replay` | — | `{ plan }` with recorded steps; 409 `EXPERIENCE_NOT_REPLAYABLE` |

## Skills

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/skills?status=` | — | `{ skills[], states[] }` |
| POST | `/skills` | `{ name, description, instructions?, steps?, testCases?, permissions?, dependencies?, inputSchema?, outputSchema? }` | `{ skill, duplicate }` — created as `discovered` with a draft v1 |
| GET | `/skills/candidates/discover` | — | `{ candidates: [{ taskType, occurrences, sampleObjectives, existingSkillId }] }` |
| GET | `/skills/:id` | — | `{ skill, runs[] }` |
| PATCH | `/skills/:id` | `{ instructions?, steps?, testCases? }` | `{ skill }` — on an active skill this creates a new draft version |
| POST | `/skills/:id/submit` | — | `{ skill }` → `sandbox_testing`; 422 `NO_TEST_CASES`, 422 `SKILL_REJECTED` |
| POST | `/skills/:id/test` | — | `{ skill, runId, passed, checks[], executed: false }` |
| POST | `/skills/:id/request-approval` | — | `{ skill, approval, approvalContext }` → `user_approval`; the context identifies the exact version |
| POST | `/skills/:id/approve` | `{ decision: 'approved'\\|'rejected'\\|'revoked', note? }` | `{ skill, approval }`; requires the `skills.activate` grant and records the decision for the pending exact version |
| POST | `/skills/:id/activate` | — | `{ skill }`; requires the `skills.activate` grant and approval for the exact version; 403 `PERMISSION_DENIED`/`APPROVAL_REQUIRED`, 409 `NOT_VERIFIED` |
| POST | `/skills/:id/rollback` | `{ version }` | `{ skill }`; requires the `skills.activate` grant and prior approval for the exact target version |
| POST | `/skills/:id/deprecate` | — | `{ skill }` |

## Verification and evidence

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/verifications?limit=20` | — | `{ verifications[] }` |
| GET | `/verifications/:id` | — | the record with `checksPerformed`, `evidenceIds`, `errors`, `notes` |
| GET | `/evidence?taskId=&limit=50` | — | `{ evidence: [{ id, kind, label, digest, createdAt }] }` |

## Security

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/security` | — | `{ permissions[], audit[], capabilities[], simulation[], tools[], executionEnabled }` |
| POST | `/security/grants` | `{ capability, granted: boolean }` | updated `permissions[]`; 400 `INVALID_GRANT` for a non-boolean or `UNKNOWN_PERMISSION` |
| POST | `/security/approvals` | `{ subjectType, subjectId, decision: 'approved'\|'rejected'\|'revoked', note? }` | `{ approval }` |
| GET | `/security/audit?limit=100` | — | `{ events[] }` newest first (max 500) |

## Simulation

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/simulation` | — | `{ workspaces[], changeSets[], executionEnabled }` |
| POST | `/simulation/preview` | `{ files: [{ path, next }] }` | `{ dryRun: true, applied: false, files: [{ path, existed, beforeBytes, afterBytes, added, removed, diff }], totals, approvalContext, note }` — read-only; approval context is bound to this exact diff |
| POST | `/simulation/workspace` | `{ files, copyProject? }` | `{ id, files[], copied, approvalContexts[] }` — no server filesystem path is returned |
| POST | `/simulation/run-tests` | `{ workspaceId, script, approvalId? }` | `{ workspaceId, script, exitCode, passed, durationMs, output }`; approval binds to the workspace and script |
| POST | `/simulation/apply` | `{ files, approvalId, tests? }` | `{ changeSetId, applied[], rollbackApprovalContext, tests }`; approval must match the exact preview and current file contents; 403 `APPROVAL_REQUIRED`; 409 `STALE_PREVIEW` if contents change during apply or `READ_ONLY_FILESYSTEM` on a read-only workspace |
| POST | `/simulation/rollback` | `{ changeSetId, approvalId }` | `{ restored[] }`; requires a separate approval bound to that changeset and returns 409 `STALE_CHANGESET` rather than overwriting files changed after apply |

Limits: at most 20 files and 400 KB of proposed UTF-8 content per changeset;
diffs are capped at 500 lines per file. Credential files, `.nova-life`,
`node_modules` and existing symlink paths are refused. Simulation scripts are
limited to `test:workspace`, `test:workspace-modules`, `test:nova-chat`. A
temporary workspace is **not** an OS sandbox; edited code can run with the
server process's privileges when execution is enabled.

## Benchmarks and graph

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/benchmarks` | — | `{ dataset[], cases[], history[] }` |
| POST | `/benchmarks/run` | `{ suites?: ['language','memory','security'] }` | `{ runId, measuredAt, total, passed, byLanguage, results[] }` |
| GET | `/graph?type=&id=&depth=1&relation=` | — | neighbourhood edges, or `{ edges, byRelation }` without params |
| POST | `/graph/link` | `{ fromType, fromId, toType, toId, relation }` | `{ link }`; `INVALID_ENTITY_TYPE`, `INVALID_RELATION`, `SELF_LINK` |

## Data

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/export` | — | `application/json` download (`nova-life-export.json`) with every table for the user; requires `memory.read` |
| DELETE | `/data` | — | deletes this user's rows; install-level permissions are kept |
| POST | `/backup` | — | `{ path, file }` — a copy of the SQLite file |

## Examples

```bash
BASE=http://localhost:3000/api/nova/life

# Create a memory and find it
curl -s -X POST $BASE/memory -H 'content-type: application/json' \
  -d '{"category":"semantic","title":"Moon phase","body":"Phase follows elongation.","language":"en"}'
curl -s "$BASE/memory/search?q=phase"

# Run a read-only task
TASK=$(curl -s -X POST $BASE/tasks -H 'content-type: application/json' \
  -d '{"objective":"List the project files","taskType":"project-review"}' | jq -r .task.id)
curl -s -X POST $BASE/tasks/$TASK/run -H 'content-type: application/json' -d '{}'

# Security: grant, then run the allowlisted test suite (needs the env switch too)
curl -s -X POST $BASE/security/grants -H 'content-type: application/json' \
  -d '{"capability":"tools.execute","granted":true}'
APPROVAL=$(curl -s -X POST $BASE/security/approvals -H 'content-type: application/json' \
  -d '{"subjectType":"tool","subjectId":"tests.run","decision":"approved"}' | jq -r .approval.id)
curl -s -X POST $BASE/tasks -H 'content-type: application/json' \
  -d '{"objective":"run the tests","allowedTools":["tests.run"]}'
```

## Client

`src/workspace/intelligence/lifeClient.ts` wraps every endpoint above with typed
results. `LifeApiError` keeps the engine `code` and HTTP `status`, so callers can
branch on the code without parsing prose.
