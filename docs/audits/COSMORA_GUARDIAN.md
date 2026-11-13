# COSMORA API Guardian — architecture, deployment and limitations

Status: **implemented and tested** for everything the deployment can verify here.
Live provider compatibility is **partially verified** and labelled as such below.

| Area | State |
| --- | --- |
| Distributed store abstraction (memory + Postgres) | implemented, tested |
| SQL migration (atomic primitives, RLS, immutable audit) | written, **not applied** (needs approval) |
| Fleet circuit breakers | implemented, tested (shared-store race) |
| Fleet rate limiting | implemented, tested (two instances, one budget) |
| Scheduled monitoring + lease | implemented, tested |
| Provider coverage (13 providers) | implemented; **live reachability not verified from this environment** |
| Recovery actions + verification | implemented, tested |
| Security (admin/cron auth, scrubbing, audit) | implemented, tested |
| Dashboard (13 panels) | implemented, tested in jsdom |
| Notification delivery (email/Slack) | **planned** — needs an approved provider |
| Multi-region verification | **not possible here** (single environment) |

---

## 1. Why it exists

The application already had strong *per-request* reliability: retries with
backoff in `server/earth/providerOrchestrator.ts`, an in-process circuit breaker,
per-IP rate limiting in `server.ts`, and a diagnostics endpoint per AI provider.
What it did not have was anything that survives a serverless boundary:

- a breaker in one lambda does not stop the other ninety-nine;
- a rate limit counted per instance multiplies by the instance count;
- a schedule that fires twice spends twice;
- nobody could answer "when did APOD last work, and for how long has it been down".

COSMORA API Guardian is that missing layer. It is deliberately **additive**: no
existing route, provider adapter, cache or UI path was replaced.

## 2. Components

```
server/guardian/
  types.ts        contracts (store, probes, runs, audit, samples)
  store.ts        MemoryStore | PostgresStore + factory (+ service-role validation)
  breaker.ts      fleet circuit breaker (CAS state, single half-open trial)
  rateLimit.ts    fleet fixed-window budgets, below published provider quotas
  lease.ts        TTL lease with heartbeat (one sweep at a time)
  providers.ts    13 real dependencies; AI probes reuse novaDiagnostics
  monitor.ts      the sweep, verification, analytics
  recovery.ts     idempotent actions + verification + human-only boundary
  security.ts     constant-time admin/cron auth, secret scrubbing, env readiness
  routes.ts       /api/guardian/* (public reads, admin actions, cron sweep)
supabase/migrations/20261112000000_guardian.sql
src/workspace/guardian/GuardianSurface.tsx   the dashboard (/guardian)
src/styles/guardian.css
```

### 2.1 Storage and the honesty contract

`createGuardianStore()` picks an adapter from the environment:

| Condition | Adapter | `capabilities.distributed` |
| --- | --- | --- |
| `GUARDIAN_STORE_URL`/`SUPABASE_URL` + service-role key, https | Postgres | `true` |
| Missing URL, missing key, non-https URL, or a publishable/anon key | Memory | `false` |

The dashboard prints the capability and the reason it was chosen
(`store.reason`), never an implied guarantee. A memory store means: correct for
one instance, no fleet protection — stated plainly at `/api/guardian/status` and
in the UI card.

### 2.2 Atomicity

Three operations must be atomic across instances, and all three are SQL functions
in the migration:

| Operation | Function | Why HTTP round trips are not enough |
| --- | --- | --- |
| CAS (breaker state) | `guardian_kv_cas` | read-then-write lets two instances both "win" |
| Counter (rate limit) | `guardian_counter` | same, and windows must reset consistently |
| Lease | `guardian_lease` | two instances would both take the sweep |

`MemoryStore` implements the same semantics synchronously inside the event loop —
its `compareAndSet` performs the comparison and the write without an `await`
between them, which is the only way it can behave like the SQL version. (An early
version awaited between the two and two "instances" both won the trial; the test
that caught it is `breaker: exactly one instance wins the half-open trial`.)

### 2.3 Failure behaviour

| Failure | Behaviour | Visible as |
| --- | --- | --- |
| Store unreachable | breakers/limits **fail open** | `storeDegraded: true`, dashboard shows the store health |
| Provider down | circuit opens after 3 consecutive failures | breaker state + `sweep-incident` audit (critical) |
| Provider slow/degraded | counted, does not open the circuit | `degradations` counter |
| Sweep already running | second run returns `ran: false` + holder | `reason` string in the response |
| Probe budget spent | probe skipped, `PROBE_BUDGET` | skipped row with reason |
| Run deadline exceeded | remaining probes skipped, `RUN_DEADLINE` | skipped rows, no false incident |
| Verification fails after a reset | circuit **re-opened** | `verified: false` + warning audit |

## 3. Scheduled monitoring

Endpoint: `GET /api/guardian/cron`, authenticated with `Authorization: Bearer
$CRON_SECRET`. No secret → `503 SCHEDULE_SECRET_MISSING` (fail closed).

**Recommended configuration (needs approval before it is committed to
`vercel.json`):**

```json
{
  "crons": [{ "path": "/api/guardian/cron", "schedule": "*/10 * * * *" }]
}
```

Vercel's plan decides what schedule is accepted: Hobby allows only daily crons,
Pro allows minute-level. Because an invalid schedule fails a deployment, the
entry is documented rather than committed. Any external scheduler works too
(GitHub Actions, cron-job.org, an uptime service), because the endpoint only needs
the bearer secret — and it is GET-only and idempotent thanks to the lease.

A cheap sweep probes only free endpoints. Metered providers (APOD, NeoWs, EPIC,
Gemini, OpenRouter, Arena) run only when a deep sweep is requested:

`POST /api/guardian/run {"includeMetered": true}` (admin).

## 4. Provider coverage

| Provider | Probe | Cost |
| --- | --- | --- |
| `ai:local` | in-process | free |
| `nasa:apod` | GET APOD + schema check (`date`, `title`) | metered |
| `nasa:neows` | GET NeoWs feed for today + schema check | metered |
| `nasa:epic` | GET EPIC natural list | metered |
| `nasa:images` | GET image library search | free |
| `earth:power` | GET POWER monthly point + `properties.parameter` check | free |
| `earth:gibs` | GET one 256 px tile, requires `image/*` | free |
| `nasa:exoplanet-tap` | TAP sync `select top 1` | free |
| `nasa:jpl-sbdb` | SBDB `sstr=433` | free |
| `nasa:osdr` | OSDR search | free |
| `ai:gemini` / `ai:openrouter` / `ai:arena` | `createDiagnosticsHandler({probe:true})` | metered |

The AI probes intentionally call the existing diagnostics handler instead of
re-implementing provider probing: two implementations would disagree within a
release. Their verdicts (`ok` / `error` / `not-configured` / `NOT_PROBED`) are
translated, not re-derived.

## 5. Security

- **No credential in the frontend.** The dashboard asks the operator for an admin
  token and keeps it in React state only: not localStorage, not sessionStorage,
  not a URL (asserted by a test).
- **Admin auth fails closed.** No `GUARDIAN_ADMIN_TOKEN` → every admin route
  returns `403 GUARDIAN_LOCKED`.
- **Constant-time comparison** of the SHA-256 of both tokens, so neither length
  nor content leaks through timing.
- **Actor labels are derived**, never the token: `admin:<8 hex chars>`.
- **Redaction.** Provider reasons and store errors pass through `scrubSecrets`
  before being stored or returned: known secret values, `api_key=…`, bearer
  tokens, JWTs and `sb_secret_*` / `sb_publishable_*` keys.
- **Audit is append-only** — enforced by a trigger that raises on UPDATE/DELETE,
  not by convention.
- **RLS** is enabled with zero policies on all six tables; only the service role
  (server-side) can read them.
- **No recovery action touches a credential.** Key rotation and model-id changes
  are listed as human-only operations in the API and the UI.

## 6. Deployment

### Required for distributed guarantees
| Variable | Purpose | Note |
| --- | --- | --- |
| `SUPABASE_URL` or `GUARDIAN_STORE_URL` | PostgREST base | https only |
| `SUPABASE_SERVICE_ROLE_KEY` or `GUARDIAN_STORE_KEY` | server-side key | must be a service-role key; the anon/publishable key is rejected |
| `GUARDIAN_NAMESPACE` | optional shared-project prefix | default `cosmora` |

### Required for actions
| Variable | Purpose |
| --- | --- |
| `GUARDIAN_ADMIN_TOKEN` | authorises `/run`, `/recovery`, `/audit`, `/config`, `/runs`, `/verify` |
| `CRON_SECRET` | authorises `/cron` (Vercel sends it automatically when set) |

### Applying the migration
```bash
supabase db push            # or: psql "$DATABASE_URL" -f supabase/migrations/20261112000000_guardian.sql
```
Then confirm: `GET /api/guardian/health` should report `"distributed": true`.

### Rollback
1. **Feature only:** revert the merge commit. The Guardian is additive; no
   existing route or table changes.
2. **Data:** `drop table guardian_kv, guardian_leases, guardian_counters,
   guardian_samples, guardian_runs;` and `drop table guardian_audit;` (the audit
   trigger goes with the table). Dropping is safe: the Guardian holds no
   application data, only monitoring state.
3. **Immediate disable without a deploy:** unset `GUARDIAN_ADMIN_TOKEN` and
   `CRON_SECRET`. All actions then return `GUARDIAN_LOCKED` /
   `SCHEDULE_SECRET_MISSING`, and the read endpoints keep working.
4. **Stop scheduled spend:** delete the `crons` entry (or the external
   scheduler's job). The sweep also stops by itself if the secret is removed.

## 7. Known limitations (not hidden in the UI)

1. **Live reachability of the NASA science endpoints was not verified from the
   build environment**, whose outbound access is limited to package registries.
   The probes are written against documented endpoints and their schema checks
   are covered by injected tests; the first production sweep is what will prove
   them. The dashboard shows exactly what it observed, so a wrong endpoint
   appears as `ENDPOINT_MISSING`, not as green.
2. **The Postgres adapter is tested against a simulated PostgREST**, not against
   a live Supabase project (no credentials here). Request shapes, error mapping,
   timeout handling and CAS-loss handling are covered; the SQL migration itself
   has not been executed.
3. **Distributed behaviour is verified by running two coordinators against one
   store** — the same code path two lambdas use, but inside one process. True
   multi-region verification needs a deployed environment with a shared
   Supabase project.
4. **No push notifications.** Failure notifications (email/Slack/webhook) are
   planned; they need an approved provider and a secret. Recovery is currently
   pull-based: the dashboard, the audit log and the `/cron` response.
5. **Metered providers need a deep sweep**, so their data ages. That is a cost
   decision, not an oversight: the dashboard labels a metered provider's last
   known status with its timestamp.
6. **Analytics retention** is 90 days for samples and 30 days for runs (SQL
   prune); audit is never pruned.
