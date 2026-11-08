# NOVA security model

The security kernel (`server/life/security.js`) decides what the engine may do.
It is small on purpose: a closed capability registry, stored grants, recorded
approvals for the four dangerous capabilities, path confinement, secret
redaction, untrusted-content inspection, and an append-only audit log.

> **Scope, stated up front.** This is a *capability-based* control system for a
> single-user local install. It does not implement multi-tenant roles, and it is
> not an OS sandbox. §8 lists exactly what that excludes.

---

## 1. Capabilities and tiers

`PERMISSION_LEVELS = ['read', 'write', 'execute', 'network', 'transmit']`, ordered
by risk (`RISK` 0–4). Adding a capability to `CAPABILITIES` is the only way to ask
for one; an unknown id raises `UNKNOWN_PERMISSION` at the boundary and
`UNKNOWN_CAPABILITY` inside the kernel.

| Capability | Tier | Granted at bootstrap | Needs approval each use |
| --- | --- | --- | --- |
| `memory.read` | read | yes | no |
| `memory.write` | write | yes | no |
| `memory.delete` | write | yes | no |
| `tasks.read` | read | yes | no |
| `tasks.write` | write | yes | no |
| `tools.read` | read | yes | no |
| `skills.activate` | write | yes | no (the skill itself needs approval) |
| `tools.execute` | execute | **no** | **yes** |
| `network.fetch` | network | **no** | **yes** |
| `transmit.external` | transmit | **no** | **yes** |
| `simulation.apply` | write | **no** | **yes** |

Bootstrap writes the baseline grants once (`ensureDefaults`); a revoke survives
restarts because grants are rows, not defaults recomputed on every boot.

## 2. Grants

`POST /api/nova/life/security/grants { capability, granted }` upserts
`tool_permissions` and writes `permission.changed` to the audit log (severity
`warning` for anything above `read`). `GET /security` returns every capability
with `granted` and `requiresApproval`, so the UI never has to guess.

Revoking `memory.read` immediately makes `GET /memory` answer **403
`PERMISSION_DENIED`** — this is asserted in `scripts/test-life-api.mjs`.

## 3. Approvals

`require(capability, { approvalId })` checks two independent things: the grant,
and — for the four approval-gated capabilities — an `user_approvals` row whose
`decision` is `approved`. Without it the error is `APPROVAL_REQUIRED` (403).

Approvals are written by exactly one function, `security.decide()`, reachable
from the user-facing endpoints `POST /security/approvals` and
`POST /skills/:id/approve`. No provider adapter, orchestrator step or model
output has a reference to it. That is the mechanism behind the rule "an LLM
cannot approve its own claim".

Decisions: `approved`, `rejected`, `revoked`. Anything else → `INVALID_DECISION`.
`approvalFor(type, id)` returns the newest decision; a later `revoked` overrides
an earlier `approved`.

## 4. Tool allowlists

| Guard | Behaviour |
| --- | --- |
| Tool registry | five ids only: `project.list`, `project.read`, `project.search`, `tests.run`, `web.fetch`; anything else → `UNKNOWN_TOOL` |
| Script allowlist | `tests.run` accepts only `test`, `test:workspace`, `test:workspace-modules`, `test:workspace-astronomy`, `test:nova-chat` → otherwise `SCRIPT_NOT_ALLOWED`; no shell metacharacters, no arbitrary command |
| Execution switch | `NOVA_LIFE_ALLOW_EXECUTE=1` required; otherwise `TOOL_DISABLED` (the execution itself is off, not merely unpermitted) |
| Fetch hosts | `api.github.com`, `export.arxiv.org`, `api.spaceflightnewsapi.net`; HTTPS only → `HOST_NOT_ALLOWED` |
| Path confinement | every path resolved with `resolveInside(root, …)`; `..`, absolute paths and NUL bytes → `PATH_OUTSIDE_ROOT` (403) |
| Secret files | `.env`, keys, credentials → `SECRET_FILE_BLOCKED` |
| Size | `FILE_TOO_LARGE` over the read cap; changesets capped at 20 files / 400 KB |

`tests.run` therefore needs three separate things: the env switch, the
`tools.execute` grant, and a recorded approval for the command. The API test
walks exactly that sequence and asserts each refusal.

## 5. Secret handling

`redactSecrets()` covers OpenAI-style keys, Google `AIza…` keys, GitHub tokens,
Slack tokens, AWS access key ids, `Bearer` tokens, PEM private keys, JWTs,
credentials embedded in URLs, and `password|secret|token|api_key` assignments.
Each match becomes `[REDACTED:<name>]` (or `[REDACTED]` inside a URL), and the
match names are returned so the caller can audit what was removed.

Rules that use it:

- A memory whose title or body trips the detector is refused with
  `SECRET_IN_MEMORY` (422). Secrets are not stored, even redacted in place, when
  they are the point of the record.
- Free text from documents, web fetches and model output is redacted before it
  is stored or shown.
- Provider keys are read server-side and never returned by `/config`,
  `/providers` or `/status`; the API test asserts no key material appears in the
  config payload.

## 6. Prompt-injection defence

`sanitizeUntrusted()` redacts secrets, truncates at 20 000 characters, and flags
signals: `instruction-override`, `system-prompt-probe`, `role-hijack`,
`tool-request`, `exfiltration`, `approval-forgery`, `invisible-unicode`
(zero-width and bidi control characters).

Nothing is silently dropped: the text and the signals are returned, and the
caller decides. Known enforcement points:

- Skill submission rejects on `instruction-override`, `tool-request`,
  `exfiltration`, `approval-forgery`, or any redaction, with `SKILL_REJECTED`
  (422) and a `critical` audit event.
- Fetched content is inspected before it is used as evidence.

The defence is detector-based. It reduces risk; it does not make a model immune
to manipulation, and the orchestration caps exist partly because of that.

## 7. Audit log

`audit_events` records `kind`, `severity`, `subject`, JSON `detail` and
`created_at`. Kinds emitted today: `permission.changed`, `approval.requested`,
`approval.decided`, `memory.created`, `memory.updated`, `memory.deleted`,
`memory.expired`, `task.created`, `task.finished`, `task.cancelled`,
`tool.used`, `verification.recorded`, `experience.captured`,
`experience.replayed`, `skill.submitted`, `skill.updated`, `skill.tested`,
`skill.rejected`, `skill.activated`, `skill.deprecated`, `simulation.applied`. `GET /security/audit?limit=` returns the newest first
(capped at 500). The Security Center shows the latest 50 from `/security`.

## 8. What is *not* protected — read this before deploying

- **No user authentication on `/api/nova/life`.** The engine runs as the single
  local user `local`; the router is rate-limited (120 requests/minute per key)
  like the other AI endpoints but sits behind the same deployment-level access as
  the rest of the app. If you expose NOVA publicly, put it behind the platform's
  auth (Vercel/Supabase session) — the life router assumes one trusted operator.
- **No role hierarchy.** Access is capability-based, not role-based (admin /
  editor / viewer are not modelled). Supabase RLS on the `life_*` tables scopes
  rows by `auth.uid()` for hosted access; the local SQLite engine uses `user_id`
  scoping without a login.
- **Not an OS sandbox.** `simulation.js` copies files to a temp directory and
  diffs them. It limits what an operation touches; it does not contain a hostile
  binary or a malicious script. `tests.run` executes allowlisted npm scripts with
  the privileges of the server process.
- **Path checks are lexical, not physical.** `resolveInside()` normalises the
  string but does not call `realpath`, so a symlink inside the project pointing
  outside it is not detected. Keep untrusted symlinks out of the workspace, or
  mount the app read-only where that matters.
- **No network egress firewall.** Outbound calls are limited to allowlisted hosts
  in `web.fetch`; provider adapters call the endpoints you configure. There is no
  packet-level control.
- **Detectors are heuristics.** Secret and injection patterns are reviewable
  regexes, not a classifier.

## 9. Environment controls

| Variable | Security effect |
| --- | --- |
| `NOVA_LOCAL_ONLY=1` | every cloud provider refuses before any request is made (`LOCAL_ONLY_BLOCKED`); no local provider → `LOCAL_ONLY_NO_PROVIDER` |
| `NOVA_LIFE_ALLOW_EXECUTE=1` | enables the `tests.run` tool at all |
| `NOVA_LIFE_DB` | database location (keep it out of the web root) |
| `NOVA_RESOURCE_PROFILE`, `NOVA_GPU_VRAM_GB` | resource limits; declared, never guessed |

Provider keys (`OPENROUTER_API_KEY`, `GEMINI_API_KEY`, …) are only read by the
adapters that need them, and never echoed.
