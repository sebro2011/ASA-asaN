# NOVA skill evolution

Skills are the part of N.O.V.A. that changes over time, and activation also refuses a version whose latest test did not pass
(`NOT_VERIFIED`) or a skill whose declared permissions are not all granted
(`PERMISSION_DENIED` with the missing list). A skill is a named,
versioned procedure with declared permissions and its own test cases; it moves
through a fixed lifecycle and only becomes `active` when a human approves that
exact version. Nothing here trains model weights.

Implementation: `server/life/skills.js`; HTTP in `server/life/router.js`
(`/skills*`); panel C of `/intelligence`.

---

## 1. Lifecycle

```
  verified experiences ──▶ discovered
                              │  (create draft)
                              ▼
                            draft ──────────────┐
                              │ submit          │ reject
                              ▼                 ▼
                       sandbox_testing       rejected
                              │ test passed
                              ▼
                        verification
                              │ submit
                              ▼
                        user_approval
                              │ user approves + activate
                              ▼
                           active ──── deprecate ───▶ deprecated
                              │ rollback (to an older approved version)
                              └──────────────▶ active@vN
```

`SKILL_STATES = ['discovered','draft','sandbox_testing','verification','user_approval','active','deprecated','rejected']`.
An illegal jump raises `INVALID_TRANSITION` (409) rather than being coerced.

## 2. Discovery

`GET /skills/candidates/discover` groups **verified** experiences by task type and
returns groups with at least 2 occurrences:

```json
{ "taskType": "project-review", "occurrences": 3,
  "sampleObjectives": ["…"], "existingSkillId": null }
```

Only verified experiences count. A habit is not a skill because it happened; it
is a candidate because it was checked. `existingSkillId` lets the UI say "you
already have this" instead of proposing duplicates.

## 3. Creating and versioning

- `POST /skills` takes `{ name, description, instructions, steps[], testCases[],
  permissions[] }`. Every entry in `permissions` must be a capability the
  security kernel knows (`UNKNOWN_PERMISSION` otherwise) — a skill cannot invent
  a capability.
- Creating a skill writes version 1 to `skill_versions` and links it with
  `SKILL_PRODUCED_VERSION`.
- `PATCH /skills/:id` while the skill is `active` does **not** mutate the live
  version: it creates a new version in `draft` state, and the active version keeps
  serving until the new one is approved. This is deliberate — an edit cannot
  silently change what is running.
- `GET /skills/:id` returns the skill plus `versions[]` with instructions, steps,
  test cases, verification outcome and approving user.

## 4. Testing

`POST /skills/:id/test` validates each declared test case against the skill's
`input_schema` / `output_schema` and records one `skill_runs` row. It returns

```json
{ "skill": { "…": "…" }, "runId": "run_…", "passed": true,
  "checks": [{ "name": "case: input", "passed": true, "detail": "ok" }],
  "executed": false }
```

`executed: false` is literal: the HTTP endpoint passes no executor, so the
procedure is not run against the machine. Pass/fail is the outcome of real schema
checks on the declared cases — not a claim of model quality. A pass moves the
skill to `verification`; a failure returns it to `draft`. The UI displays the
`executed` flag instead of hiding it.

Untrusted instruction text is passed through `sanitizeUntrusted()`. Signals that
indicate an attempt to control the agent — `instruction-override`,
`tool-request`, `exfiltration`, `approval-forgery` — block promotion, and the
skill is marked `rejected` with the signal recorded.

## 5. Approval

| Step | Endpoint | Effect |
| --- | --- | --- |
| request | `POST /skills/:id/request-approval` | only from `verification`; creates an approval request, state → `user_approval` |
| decide (scoped) | `POST /skills/:id/approve` with `{ decision, note }` | records the decision for that skill; `rejected` moves it to `rejected` |
| decide (generic) | `POST /security/approvals` with `{ subjectType: 'skill', subjectId, decision }` | same table, used by the Security Center |
| activate | `POST /skills/:id/activate` | requires the approval row; without it → **403 `APPROVAL_REQUIRED`** |

The engine has no path where a provider or model output writes an approval. The
approval table is written only by the user-facing decision endpoint, and every
decision adds an audit event.

Activation also requires the `skills.activate` capability (granted at bootstrap,
revocable in the Security Center).

## 6. Rollback and deprecation

- `POST /skills/:id/rollback { version }` re-points the skill at an earlier
  version and records the change; it refuses a version that does not exist
  (`VERSION_NOT_FOUND`).
- `POST /skills/:id/deprecate` stops service without deleting history. A
  deprecated skill cannot run; its versions and runs stay for audit.
- `skill_runs` records each test/activation attempt with its timestamp and
  result, so the timeline in the Skill Library is derived from stored rows.

## 7. Permissions a skill can request

The registry is closed (`security.CAPABILITIES`): `memory.read`,
`memory.write`, `memory.delete`, `tasks.read`, `tasks.write`, `tools.read`,
`tools.execute`, `network.fetch`, `transmit.external`, `skills.activate`,
`simulation.apply`. A skill that requests `tools.execute` or `network.fetch` is
still gated by the kernel at run time — declaring a permission never grants it.

## 8. What is not implemented

- Automatic activation. There is no code path from `user_approval` to `active`
  without a recorded human decision.
- Skill synthesis by a model. Candidates come from verified experience groups;
  the instructions are written by a user or by an explicit authoring request.
- Cross-install skill sharing or a central registry.
- Vector-based skill retrieval; matching is by name, task type and tags.
