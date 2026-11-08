# NOVA Hypothesis Forge — Architecture

## 1. Placement in the product

```
ChatSurface (existing NOVA assistant)
├── mode = 'chat'   → existing conversation rail + thread + composer (unchanged)
└── mode = 'forge'  → ForgeSurface (new investigation workspace)
                        ├── ForgeCharts (ChartFrame + Recharts)
                        ├── src/lib/forge/* (engine, shared by server and browser)
                        └── /api/forge/* (Express router, server-side keys)
```

The investigation engine is deliberately isomorphic: the same pure modules that the server
runs for a request are imported by the tests and can be imported by the browser for memory
comparison. Nothing in `src/lib/forge/` performs I/O except `client.ts` (browser transport).

## 2. Pipeline

```
question + language + context
        │
        ▼
interpret (interpreter.ts)            domain, window, region, variables, methods,
        │                             follow-up inheritance, parsing confidence
        ▼
generateHypotheses (hypotheses.ts)    IDs, statements, variables, expected relationship,
        │                             falsification criteria, alternatives, null hypothesis
        ▼
buildPlan (planner.ts)                dataset compatibility, coverage verdicts,
        │                             key requirements, verification checklist
        ▼
retrieveDatasets (server/forge/connectors.ts)
        │                             NASA + NOAA, TTL cache, timeout, sanitised URLs
        ▼
normalise (normalize.ts)              universal Observation/Series model,
        │                             preserved raw values, missing accounting
        ▼
runAnalyses (orchestrator.ts)         descriptive, correlation, cross-correlation,
        │                             before/after, threshold, trend, anomaly, missing
        ▼
buildEvidence (evidence.ts)           rule → classification + strength, never a model score
        │
        ▼
buildCounterEvidence (counterEvidence.ts)   8 finding kinds, severity, data-gap flag
        │
        ▼
conclude (orchestrator.ts)            verdict, counts, causal caveat, limitations
        │
        ▼
buildPassport (passport.ts)           JSON / Markdown / printable HTML
```

## 3. File map

| File | Responsibility |
|---|---|
| `src/lib/forge/types.ts` | Versioned models: request, dataset descriptor, provenance, observation, series, analysis, evidence, hypothesis, plan, conclusion, investigation, section ids. |
| `src/lib/forge/vocab.ts` | 11 variables, 9 datasets, domain definitions, named events, coverage metadata. |
| `src/lib/forge/strings.ts` | Engine copy in EN/SI/TA and label helpers (`var_*`, `method_*`, `ce_*`, `rule_*`, `verdict_*`, `passport_*`, `plan*`, `compat*`). |
| `src/lib/forge/analysis.ts` | Pure statistics: `erfc`, incomplete beta, Student's t two-tailed p, Pearson, Spearman, regression, cross-correlation, anomalies, group comparison, 2×2, missing report, alignment, effect magnitude. |
| `src/lib/forge/interpreter.ts` | Language/variable/domain detection, time-range parsing, region parsing, follow-up inheritance, request summary, stable hashing. |
| `src/lib/forge/hypotheses.ts` | Hypothesis templates, decision state, driver thresholds, storm threshold. |
| `src/lib/forge/planner.ts` | Plan construction, coverage verdict, key mode, catalogue. |
| `src/lib/forge/normalize.ts` | Per-source parsers into the universal schema; `NormalisationError`. |
| `src/lib/forge/evidence.ts` | Thresholds (`ALPHA`, `EFFECT_FLOOR`, minimum samples), rule text, classification. |
| `src/lib/forge/counterEvidence.ts` | Assumptions, alternatives, missing variables, temporal mismatch, measurement uncertainty, selection bias, data gaps, falsification. |
| `src/lib/forge/orchestrator.ts` | Runs analyses, builds imagery from the existing GIBS catalogue, assembles the investigation. |
| `src/lib/forge/passport.ts` | Evidence Passport object and three renderings. |
| `src/lib/forge/memory.ts` | Device-local storage, compare, export. |
| `src/lib/forge/client.ts` | Typed browser transport with abort and error codes. |
| `src/features/hypothesis-forge/ForgeSurface.tsx` | Eight-section interface, decisions, passport export, history. |
| `src/features/hypothesis-forge/ForgeCharts.tsx` | Six chart components on `ChartFrame`. |
| `src/styles/hypothesis-forge.css` | Liquid-glass styling on existing NOVA tokens. |
| `src/i18n/hypothesisForge.ts` | Trilingual interface copy (`hf*`). |
| `server/forge/connectors.ts` | Ten connectors, TTL cache, timeout, `sanitiseUrl`, key injection. |
| `server/forge/investigate.ts` | Validation, context allow-list, interpretation, investigation, catalogue payload. |
| `server/forgeRoutes.ts` | Router factory with per-instance rate limiting. |
| `scripts/test-forge-engine.mjs` | 41 engine tests. |
| `scripts/test-forge-api.mjs` | 12 HTTP/security tests. |
| `scripts/test-forge-ui.mjs` | 13 copy/wiring tests. |
| `scripts/test-forge-dom.mjs` | 3 jsdom rendering tests. |

## 4. API contract

### `GET /api/forge/catalogue`

```json
{
  "ok": true,
  "engine": "nova-hypothesis-forge/1",
  "datasets": [ { "id": "noaa-swpc-kp", "organisation": "NOAA", "...": "..." } ],
  "capabilities": {
    "nasaKey": "key | demo | none",
    "noaaKeyless": true,
    "liveInvestigation": true,
    "llmRequired": false,
    "engine": "nova-hypothesis-forge/1"
  }
}
```

No endpoint, parameter or key is included beyond documented `documentationUrl` values.

### `POST /api/forge/interpret`

Body: `{ question, language?, context? }` → `{ ok, request, hypotheses, plan }`.

`context` is rebuilt through an allow-list (`sanitiseContext`); unknown keys, `__proto__`,
injected dataset/method ids and arbitrary text are dropped.

### `POST /api/forge/investigate`

Body: `{ question, language?, context?, hypothesisId? }` → `{ ok, investigation }`.

Failure semantics:

- `400 INVALID_REQUEST` for missing/short/non-string questions and over-long input;
- `429 RATE_LIMITED` with `Retry-After` per client;
- source failures are **inside** a `200` investigation as `unavailable`, `partial` or
  `out-of-coverage` with an error code (`SOURCE_TIMEOUT`, `SOURCE_REJECTED`, `KEY_NOT_CONFIGURED`, …).

## 5. Determinism and reproducibility

- Request ids are hashes of question + language + window; investigation ids are derived from
  the request id and a server-supplied suffix.
- Every series carries `provenance.payloadHash` (FNV-1a, 8 hex chars) and the official URL.
- The passport embeds the request, plan dataset ids, thresholds, method parameters and
  instructions to reproduce the run against the same API.
- Time is UTC end to end; timestamps are normalised from each source's native format.

## 6. Extension points

- Add a variable → `types.ts`, `vocab.ts`, `normalize.ts`, planner compatibility.
- Add a dataset → `DATASETS`, connector, normaliser, planner coverage.
- Add a hypothesis template → `hypotheses.ts` plus `strings.ts` keys.
- Add a statistic → `analysis.ts`, orchestrator wiring, evidence rule, chart.
- Add a language → extend `FORGE_STRINGS` and `hypothesisForgeCopy`; tests fail until parity is
  restored.
