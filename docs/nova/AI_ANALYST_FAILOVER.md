# AI Earth Science Analyst — provider failover and local intelligence

Status: implemented and tested (see §7).
Scope: `POST /api/earth/analyst` only. NASA POWER retrieval, GIBS tiles, the charts
and every other Earth Lab capability are untouched.

---

## 1. What was wrong

Before this change the analyst was a single `await` on one provider:

```
POST /api/earth/analyst
  └─ genAI.models.generateContent(gemini-3.8-flash)      ← no retry, no timeout
       └─ success → 200 JSON
       └─ any throw → 502 { code: 'ai-error',
                            message: `The AI analyst call failed (${error.message})` }
```

Consequences, all observed in the source rather than inferred:

| Symptom | Cause |
| --- | --- |
| A temporary Google 503 broke the analyst | 5xx was treated as fatal, never retried |
| A 429 (rate limit) was fatal too | no classification of transient vs permanent errors |
| The browser received Google's own error text | `error.message` interpolated into the response |
| No answer was computed server-side without a key | `ai-not-configured` returned `ok:false`, the browser had to compute |
| One slow call could hold a request open | no per-attempt timeout, no deadline |
| Nothing recorded who answered | response carried only `provider:'ai'|'local'` |
| Repeated identical questions cost repeated tokens | no duplicate-request protection |
| A dead provider slowed every later request | no health state at all |

There was also a scientific gap: the model received pre-aggregated statistics
(`mean`, `min`, `max`, one slope) but not the monthly values, so it could not
compute an anomaly, a seasonal pattern or a percentage change — and the local
engine could not either, because it never saw the series.

## 2. Architecture

```
POST /api/earth/analyst   (rate limited: 20 / 5 min / client)
│
├─ validate question (≤800) and context            → 400 invalid-question | missing-context
├─ analyseBundle(context)   ← deterministic, always runs
│     monthly stats · annual means · anomaly vs explicit baseline
│     seasonal means · percentage change · monthly totals · missing cells
├─ buildProviderContext()   ← evidence layer sent to any model
│     location · lat/lon · date range · dataset ids · units · source URLs
│     reported gaps · missing months · localAnalysis (pre-computed arithmetic)
├─ orchestrator.run({ question, context, signal, dedupeKey })
│     for each provider in [gemini, openrouter, arena]:
│        skipped   → key absent, or breaker open
│        attempt 1..3 → timeout · classify · backoff+jitter · retry
│        ok        → parse → validate → allowlist sources → remote answer
│     none ok      → local answer from the deterministic engine
└─ 200 {
     mode: 'remote' | 'local',
     provider, providerLabel, model,
     attempts, retries, fallback, fallbackReason,
     providerChain: [{ provider, outcome, code, status, attempts, ms }],
     generatedAt, durationMs, deduped, noticeCode,
     sections[5], sources[], droppedSources, localEvidence[]
   }
```

Files:

| File | Role |
| --- | --- |
| `server/earth/providerOrchestrator.ts` | retry/classification/backoff/circuit breaker/dedupe/deadline |
| `server/earth/providers.ts` | Gemini adapter (unchanged model, prompt, schema), OpenRouter, Arena, answer validation |
| `server/earth/localAnalysis.ts` | deterministic engine (server side) |
| `server/earthIntelligence.ts` | route, evidence layer, redaction, structured logs, health |
| `src/lib/earth/context.ts` | bundle now carries the retrieved monthly series |
| `src/components/earth/AnalystPanel.tsx` | honest provider display, evidence and attempt panels |

## 3. Fallback behaviour

1. **Gemini** (`gemini-3.8-flash`) — still the primary and still configured from
   `GEMINI_API_KEY` with the same system instruction and response schema.
2. **Retry** the same provider up to 3 attempts, but only for
   `429 / 408 / 5xx / timeout / network`. `400 / 401 / 402 / 403 / 404 / 422` are
   permanent: they move straight to the next provider.
3. **Backoff** `300 ms · 2^(n-1)`, jittered ×0.6–1.4, capped at 3 s, and never
   longer than the remaining deadline. `Retry-After` is honoured when larger.
4. **OpenRouter** — only if `OPENROUTER_API_KEY` is set.
5. **Arena AI** — only if `ARENA_API_KEY` *and* `ARENA_BASE_URL` are set.
6. **Local Intelligence Mode** — the deterministic engine answers. `mode:'local'`,
   `provider:'local'`, `noticeCode` explains which case occurred.

A provider that fails `N` times in a row has its breaker opened for 60 s and is
reported as `skipped / CIRCUIT_OPEN` instead of being retried on every request.

Limits: per-attempt timeout 12 s, whole-run deadline 30 s, 3 attempts per provider.

## 4. Scientific context layer

Every model call receives: location label, latitude/longitude, observation dates
in view, POWER window (`from`/`to`/month count), dataset id and source URL, units
per parameter, available/unavailable parameter lists, gaps reported by the client,
missing months per parameter, and `localAnalysis` — the arithmetic already
computed from the retrieved values, which the model may restate but not recompute.
The prompt forbids using anything outside that bundle and requires the five-section
format (verified / derived / interpretation / limitations / gaps).

Returned source URLs are checked against the URLs actually present in the bundle;
anything invented is dropped and counted in `droppedSources`.

## 5. Local deterministic capabilities

`analyseSeries()` works on the real monthly values (`dates[]`, `values[]`, nulls
preserved) and produces, per parameter:

* usable value count, missing month list, first/last month;
* mean, minimum, maximum with the month each occurred;
* annual means from complete calendar years only;
* **anomaly against an explicitly defined baseline** — the earliest *N* complete
  years, `N = min(5, completeYears − 1)`, so at least one year remains to compare
  against. The label always states the years used and that this is *not* the WMO
  1991–2020 normal. Fewer than two complete years → no anomaly, and a gap bullet
  says why;
* seasonal means for DJF / MAM / JJA / SON;
* first-half vs second-half comparison with absolute and percentage change
  (percentage withheld when the reference mean is effectively zero);
* monthly totals in mm for rate-style units (`mm/day` × days in month);
* per-parameter limitations (grid-cell estimates, no significance test, no
  attribution).

The answer is reproducible: same bundle in, same text out. Nothing is
interpolated, and a missing month is named rather than filled.

## 6. Errors, logging, safety

* Upstream error text never reaches the client: the response carries a
  classification code, the provider's HTTP status, and a `reason` of the form
  `Google Gemini: PROVIDER_UNAVAILABLE`.
* `redact()` strips `api_key=`, `AIza…`, `sk-…`, `or-…`, `arena-…` and bearer
  tokens from anything logged or returned.
* Structured logs (`scope: 'earth.analyst'`) record `request`, `provider.attempt`,
  `provider.skipped`, `provider.unparsable`, `answer` and `client_closed` events
  with provider, attempt, code, status and duration — never a key or a prompt.
* Cancellation: `res.on('close')` aborts the run, so a user who navigates away
  stops the provider call.
* Duplicate protection: identical concurrent requests (question + language +
  location + series signature) share one execution; the second is marked
  `deduped: true`.
* `GET /api/earth/health` now reports `analystProviders` (configured / closed /
  open + consecutive failures) without spending a provider request.

## 7. Tests

`npm run test:earth-analyst` — 30 tests (orchestrator, engine, route):

* HTTP classification: 429/408/5xx/timeout retryable; 400/401/402/403/404/422 not.
* Gemini 200 → `mode:'remote'`, provider/model/attempts/fallback all correct.
* Gemini 503 → retried, then success on the second attempt (one backoff wait).
* Persistent 503 → 3 attempts, backoff twice, OpenRouter answers,
  `fallback:true`, `noticeCode:'primary-unavailable'`, identity reported honestly.
* 429 with `Retry-After: 0.5` → waits 500 ms, then falls over.
* Timeout → attempt cut short (started 5 s call, chain finished in ms) and falls over.
* 401 → single attempt, no backoff, next provider.
* All providers down → `mode:'local'`, 6 attempts, full error chain.
* No provider configured → nothing contacted, `local-mode`.
* Malformed model JSON / JSON without sections / fenced JSON.
* Circuit breaker opens after repeated failures and stops calling.
* Concurrent identical requests → one provider call, second marked deduped.
* Local engine: mean/min/max, baseline definition, seasonal means, +20 % period
  change, mm totals, missing/fill value handling, single-year window, unknown unit,
  empty bundle, all-missing series.
* Route contract: 503 → alternative, no key material or upstream text in the body,
  all-down → local with real numbers, unreadable answer → local, input validation,
  no-provider case, `/health` provider states.
* Regression: the analytics bundle still carries the monthly series with nulls
  preserved and the chart statistics still present.

`npm run test:earth-analyst-ui` — 3 jsdom tests: a local answer is labelled local
with no model pill and no spinner, a fallback names OpenRouter (never Gemini) with
its retry count and HTTP 503, and an unreachable API still yields a browser-side
deterministic answer.

## 8. Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | no | primary provider |
| `OPENROUTER_API_KEY` | no | first alternative |
| `ARENA_API_KEY` + `ARENA_BASE_URL` | no | second alternative (OpenAI-compatible) |
| `NOVA_ANALYST_MODEL` | no | override the Gemini model id (default `gemini-3.8-flash`) |
| `EARTH_ANALYST_OPENROUTER_MODEL` | no | default `google/gemini-2.0-flash-001` |
| `EARTH_ANALYST_ARENA_MODEL` | no | default `gemini-2.5-flash` |

Nothing is required for the analyst to work: with no key at all it runs in Local
Intelligence Mode.

## 9. Remaining limitations

* No live Gemini/OpenRouter/Arena call was made from the build environment: the
  Gemini project returns 503 for every model id (fix at the Google project, see
  `AI_PROVIDER_DIAGNOSTICS.md`) and the sandbox has no egress to those hosts. All
  provider behaviour above is verified against mocked providers at the same
  boundaries the real adapters use; the local path is verified end to end over
  HTTP.
* The circuit breaker is per process; on a serverless deployment each instance
  keeps its own state, so a cold start begins with closed breakers.
* Deduplication is per process and only covers identical concurrent requests.
* Baselines are window-relative, not climatological: a 3-year POWER window cannot
  produce a climate normal, and the text says so rather than implying otherwise.
