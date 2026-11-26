# NOVA security model

The security kernel (`server/life/security.js`) decides what the engine may do.
It is small on purpose: a closed capability registry, stored grants, recorded
approvals for the four dangerous capabilities, path confinement, secret
redaction, untrusted-content inspection, and an append-only audit log.

> **Scope, stated up front.** This is a *capability-based* control system for a
> single-owner install. Hosted requests are verified against Supabase Auth and
> must match `NOVA_LIFE_OWNER_ID`; offline local development can opt into a
> loopback-only bypass. It does not implement multi-tenant roles and is not an OS
> sandbox. §8 lists exactly what that excludes.

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

`require(capability, { approvalId, approvalContext })` checks the capability grant
and, for approval-gated actions, an approved `user_approvals` row whose subject
and optional note match the exact action context. It also requires that row to be
the latest decision for that subject, so a later rejection or revocation defeats
an older approval. Missing, unrelated or revoked approval returns
`APPROVAL_REQUIRED` (403).

Approvals are written by exactly one function, `security.decide()`, reachable
from the user-facing endpoints `POST /security/approvals` and
`POST /skills/:id/approve`. No provider adapter, orchestrator step or model
output has a reference to it. That is the mechanism behind the rule "an LLM
cannot approve its own claim".

Decisions: `approved`, `rejected`, `revoked`. Anything else → `INVALID_DECISION`.
`approvalFor(type, id)` returns the newest decision; a later `revoked` overrides
an earlier `approved`. Skill approvals use `subjectId: '<skillId>:v<version>'`,
so approving or revoking one version does not authorize another.

Cloud generation and streaming require both the `transmit.external` grant and a
matching, latest approval. Missing grant returns `PERMISSION_DENIED`; an absent,
unrelated or revoked approval returns `APPROVAL_REQUIRED` before any provider
request is sent.

## 4. Tool allowlists

| Guard | Behaviour |
| --- | --- |
| Tool registry | five ids only: `project.list`, `project.read`, `project.search`, `tests.run`, `web.fetch`; anything else → `UNKNOWN_TOOL` |
| Script allowlist | `tests.run` accepts only fixed npm script names → otherwise `SCRIPT_NOT_ALLOWED`; those scripts can still execute edited repository code, so this is not a sandbox |
| Execution switch | `NOVA_LIFE_ALLOW_EXECUTE=1` required; otherwise `TOOL_DISABLED` (the execution itself is off, not merely unpermitted) |
| Fetch hosts | `api.github.com`, `export.arxiv.org`, `api.spaceflightnewsapi.net`; HTTPS only → `HOST_NOT_ALLOWED` |
| Path confinement | every path is resolved under `root`; traversal and NUL bytes are refused, and existing symlinks are rejected before reads/writes |
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

- **Single-owner only.** Hosted `/api/nova/life` requests are checked against
  Supabase Auth and must match `NOVA_LIFE_OWNER_ID`. There is no role hierarchy
  (admin / editor / viewer), no multi-user data partitioning, and no Supabase
  RLS layer for the local SQLite store. Do not share the configured owner account.
- **Local bypass is deliberately narrow.**
  `NOVA_LIFE_ALLOW_UNAUTHENTICATED_LOCAL=1` works only outside production, when
  no Supabase auth settings are configured, and when the TCP peer is loopback.
  It is intended for offline development, not a public or LAN-facing deployment.
- **Not an OS sandbox.** Simulation previews are read-only, bounded, refuse
  sensitive paths and reject existing symlinks. Temporary workspaces exclude
  sensitive files and symlinks, but `tests.run` still executes edited project
  code with the server process's privileges. Keep `NOVA_LIFE_ALLOW_EXECUTE` off
  unless that code and host are trusted; do not run the server as root.
- **Filesystem checks are not race-free.** Paths are lexically confined and
  existing symlink components are checked before operations, but a hostile local
  process able to mutate the project concurrently can still race filesystem
  checks. Use read-only mounts and OS-level isolation where that threat matters.
- **No network egress firewall.** Outbound calls are limited to allowlisted hosts
  in `web.fetch`; provider adapters call the endpoints you configure. There is no
  packet-level control.
- **Detectors are heuristics.** Secret and injection patterns are reviewable
  regexes, not a classifier.

## 9. Environment controls

| Variable | Security effect |
| --- | --- |
| `NOVA_LOCAL_ONLY=1` | every cloud provider refuses before any request is made (`LOCAL_ONLY_BLOCKED`); no local provider → `LOCAL_ONLY_NO_PROVIDER` |
| `NOVA_LIFE_OWNER_ID` | required hosted identity; only this Supabase Auth user may call the engine |
| `NOVA_LIFE_ALLOW_UNAUTHENTICATED_LOCAL=1` | explicit non-production loopback bypass, only with no Supabase auth settings |
| `NOVA_LIFE_ALLOW_EXECUTE=1` | enables allowlisted test execution (not a sandbox) |
| `NOVA_LIFE_DB` | database location (keep it out of the web root) |
| `NOVA_RESOURCE_PROFILE`, `NOVA_GPU_VRAM_GB` | resource limits; declared, never guessed |

Provider keys (`OPENROUTER_API_KEY`, `GEMINI_API_KEY`, …) are only read by the
adapters that need them, and never echoed.
