# COSMORA API Guardian — test results

Run on branch `arena/8a962084-asa-asan`, 2026-11-12, in this repository. Every
number below is from an executed command, not an estimate.

| Command | Result |
| --- | --- |
| `npm run test:guardian` | **56 pass / 0 fail** (28 core + 22 monitor/routes + 6 dashboard) |
| `npm test` (whole repository) | **810 pass / 0 fail** (754 before this branch) |
| `npm run lint` (`tsc --noEmit`) | clean |
| `npm run build` | exit 0 · `GuardianSurface` is a 13.7 kB lazy chunk (4.0 kB gzip) · PWA precache 161 entries |
| API smoke against the real Express app | `/health` ok, `/status` 13 providers, memory store with reason, `/cron` 503 locked, admin `/run` 403 locked |

## What each suite proves

### `scripts/test-guardian-core.mjs` (28)

| Group | Assertions |
| --- | --- |
| Memory store | value/version semantics, TTL expiry and prune, create-only CAS, stale-version refusal, fixed-window counter reset, lease ownership/renewal/expiry takeover, bounded audit/sample/run retention, filters, `putRun` upsert |
| Breaker | opens at threshold, denies during cooldown, half-open single trial **across two coordinators sharing one store**, cooldown jitter band, fail-open when the store throws, degraded outcomes do not open the circuit, explicit reset |
| Rate limiter | limit enforcement, window rollover, **fleet-wide budget across two limiters**, cost weighting, conservative default for unknown buckets, fail-open labelling, defaults sit below published provider quotas |
| Lease | two instances cannot hold the same lease, `withLease` releases on success and on throw, holder reported |
| Postgres adapter | RPC bodies are namespaced, **no key in any URL** (header only), HTTP error → typed `StoreError` without the URL, non-JSON body rejected, hanging store → `STORE_TIMEOUT`, lost CAS reported not retried, row mapping for audit/samples/runs, `describe()` exposes only the host |
| Factory | service-role detection rejects publishable/anon/malformed keys, https required, memory fallback names what is missing, valid config selects the shared store |

### `scripts/test-guardian-monitor.mjs` (22)

- A clean sweep records one run, one sample per provider, no alarm.
- A failing provider makes the run an incident and writes exactly one critical
  audit entry naming it.
- Metered providers are `skipped` (`METERED_SKIPPED`) in a cheap sweep and are
  probed on a deep sweep — and a probe that throws is reported `PROBE_THREW`, not
  swallowed.
- An open circuit skips the probe (`CIRCUIT_OPEN`) instead of hammering.
- Two monitors sharing one store cannot both run a sweep; the loser reports the
  holder.
- The run deadline marks remaining providers `RUN_DEADLINE` (skipped, not down).
- Analytics: availability, p50/p95, code histogram, incident count; a provider
  with no samples reports `availability: null`, never 100 %.
- Recovery: `reset-breaker` verifies the provider, and a failed verification
  **re-opens** the circuit and reports `verified: false`; unknown/incomplete
  actions are refused (and the refused attempt is audited); prune and cache
  actions are idempotent; no action id touches a credential.
- Security: constant-time comparison, `GUARDIAN_LOCKED` when unconfigured,
  derived actor labels (no token in the label), `SCHEDULE_SECRET_MISSING` for
  cron, secret scrubbing for env values/`api_key=`/JWT/`sb_*`, readiness lists
  names only.
- Routes: public reads credential-free and `no-store`; every admin route locked
  without a token and the refusals audited; admin can sweep/read/act; recovery
  rate limited (5/min); cron requires the secret; a held lease yields
  `ran: false` with the holder; unknown sub-path is a JSON 404.

### `scripts/test-guardian-ui.mjs` (6)

- Incident state rendered from the API payload; open circuit shows its code.
- **An unprobed provider renders "no data" and carries no green chip.**
- **An instance-local store says "instance-local only"** with the reason.
- Administrative actions are disabled without a token, unlock with one, and the
  token is sent only as a bearer header (never in a URL).
- A guardian outage renders the error and the machine code, and does **not**
  render "Nominal".
- Metered providers are labelled.

## Distributed verification — method and its limit

The distributed claims are tested by constructing **two independent
coordinators (breaker, limiter, monitor) over one store** and asserting that only
one can win a half-open trial, that a budget is shared, and that only one sweep
runs. That is the same code path two serverless instances use; what it does not
prove is behaviour across processes, which needs a deployed environment with a
real Supabase project.

**Not verified here (and not claimed):**

- Live reachability of `api.nasa.gov`, `images-api.nasa.gov`,
  `power.larc.nasa.gov`, `gibs.earthdata.nasa.gov`, the Exoplanet TAP service,
  JPL SBDB or OSDR — this environment's outbound access is limited to package
  registries.
- Live Gemini / OpenRouter / Arena generation from the Guardian (no keys here).
- The SQL migration has not been executed against a PostgreSQL instance.
- Browser-level rendering (no Playwright): the dashboard is verified in jsdom
  against fixtures, so no pixel-level claim is made.

## Attempts to verify on a deployed URL (both blocked)

The PR builds two previews. Neither could be used to verify the Guardian
endpoints from here, for reasons that are infrastructure, not code:

| Preview | Result |
| --- | --- |
| Vercel branch preview `nasa-space-explorer-git-arena-8a962084-…` | `/api/guardian/health` returns the **Vercel login wall** (deployment protection). Anonymous requests cannot reach the function. |
| Netlify `deploy-preview-54--nasaspacexplorer` | `/api/guardian/health` is a **404**: that target serves the static build only, with no Express API. |

So the health of the mounted router is proven by the in-process smoke test
above (real Express app, real mount, real responses: 13 providers, memory store
with its reason, `503 SCHEDULE_SECRET_MISSING`, `403 GUARDIAN_LOCKED`) and by a
production environment with the preview protection disabled or an admin token —
which is a deployment decision, not a code one.

## Regression statement

The suite that existed before this branch (754 tests across 40 scripts — API
contract, APOD, Earth lab, NOVA chat/diagnostics, videos, news, community, AI
viewer, welcome, workspace shell/modules/settings/search/astronomy, security and
performance, NASA routes, and all 11 Forge suites) still passes unchanged. Three
existing tests needed no edits; the only shared file touched is `server.ts`
(one import + one mount) and `src/app/{router,navConfig}.ts` + `src/App.tsx` for
the new route.
