# NOVA Hypothesis Forge — Implementation Report

Date: 2026-11-08 · Branch: `arena/1d4c9897-asa-asan` · Model version: `forge/1`

## 1. What was built

NOVA Hypothesis Forge is implemented as a **second mode inside the existing NOVA AI Assistant**
in NASA Space Explorer. It converts a natural-language research question into:

1. a parsed research request (domain, UTC window, region, variables, methods, assumptions);
2. a set of testable hypotheses, including a null hypothesis, with falsification criteria;
3. a research plan with dataset compatibility, coverage verdicts and key requirements;
4. real NASA/NOAA retrieval with provenance, caching, timeouts and honest failure states;
5. a universal normalisation layer that preserves raw values and missingness;
6. deterministic statistics (correlation, Spearman, regression, lag, before/after, threshold,
   trend, anomaly, missing data);
7. an evidence engine with auditable rules and four classifications;
8. a counter-evidence engine with eight finding kinds and severity;
9. a conclusion restricted to four non-proof verdicts, with a causal caveat;
10. a reproducible Evidence Passport (JSON, Markdown, printable HTML/PDF) and device-local
    research memory;
11. an eight-section trilingual interface in the project's dark liquid-glass language.

It is one assistant, not a second chatbot: the existing NOVA chat engine, providers, thinking
ladder and conversation store are untouched.

## 2. Verified results (executed)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, zero errors |
| `scripts/test-forge-engine.mjs` | 41 / 41 pass |
| `scripts/test-forge-api.mjs` | 12 / 12 pass |
| `scripts/test-forge-ui.mjs` | 13 / 13 pass |
| `scripts/test-forge-dom.mjs` | 3 / 3 pass |
| Forge total | **69 tests, 0 failures** |
| `npm test` (whole repository) | exit 0, **390 / 390 pass**, 0 failures |
| `npm run build` | exit 0, `✓ built in 3.06s`, PWA precache 145 entries |
| Live server smoke (`npm run dev`) | catalogue 200, interpret 200 (3 hypotheses), investigate 200 |

The live investigate smoke ran with no outbound internet in this sandbox, so all three sources
returned `unavailable` / `network error`; the engine produced `insufficient-evidence` with no
fabricated observations and 15 counter-evidence findings. That is the honest-failure behaviour
working as designed, not a data result.

## 3. Acceptance criteria

The 20 criteria used for completion. Each row states the evidence; nothing is claimed without a
test or a file.

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Forge lives inside the existing NOVA assistant as a mode, not a separate app | Met | `ChatSurface.tsx` mode switch; `ForgeSurface` rendered in `nova-chat-shell--forge`; DOM test 1. |
| 2 | Existing NOVA chat engine and NASA features are not replaced or broken | Met | Chat mode unchanged; full suite 390/390; static test asserts `sendChat` remains; no removal of existing modules. |
| 3 | English, Sinhala and Tamil across engine and interface | Met | `FORGE_STRINGS` and `hypothesisForgeCopy` in three languages; UI test parity/fallback/placeholder; DOM test renders si/ta. |
| 4 | Natural-language research interpreter with follow-up context | Met | `interpreter.ts`; engine tests for ranges/regions/variables/follow-ups; API context allow-list test. |
| 5 | Hypothesis generator with ids, variables, expected relationships and falsification criteria | Met | `hypotheses.ts`; engine tests; hypothesis explorer renders criteria. |
| 6 | Research planner with coverage, compatibility, key status and missing information | Met | `planner.ts`; 1989 out-of-coverage test; plan table in Data explorer. |
| 7 | Unified NASA layer (DONKI, POWER, GIBS, NeoWs, APOD, Mars photos, ISS/TLE) | Met | Ten connectors; GIBS imagery attached via existing catalogue; normalisers tested for each family. |
| 8 | NOAA layer (Kp, geomagnetic indices, alerts, solar wind) | Met | `noaa-swpc-kp`, `noaa-swpc-solar-wind`, `noaa-swpc-alerts`; Kp/solar-wind tests and API live statuses. |
| 9 | Retrieval hardening: cache, UTC, provenance, limits, partial data | Met | TTL cache, 45 s abort, payload hash, official URLs, 256 kB limit, `partial`/`unavailable` codes; API tests. |
| 10 | Universal normalisation schema with raw records and missing accounting | Met | `types.ts` + `normalize.ts`; POWER sentinel test, SWPC timestamp test, missing report. |
| 11 | Evidence engine with supporting/contradicting/neutral/insufficient and auditable rules | Met | `evidence.ts`; rule text non-empty for every linked item; thresholds tested. |
| 12 | Counter-evidence engine | Met | Eight kinds; API asserts >3 findings; severity feeds the conclusion. |
| 13 | Deterministic statistics; no LLM-invented numbers | Met | Pure functions in `analysis.ts`; scatter pairs match the correlation sample; no model call in the path. |
| 14 | Seven observation visualisations with accessible alternatives | Met | Time series, scatter, lag, evidence bars, quality bars, hypothesis graph, GIBS imagery; all on `ChartFrame` with tables; DOM asserts mounted surfaces. |
| 15 | Evidence Passport as JSON and PDF, reproducible | Met | `passport.ts`: JSON, Markdown, printable HTML (browser PDF); reproducibility block; UI buttons. |
| 16 | Research memory / history | Met | `memory.ts` (localStorage, cap 12, compare, export); DOM test asserts persistence of the same id. |
| 17 | Integrity rules: no fabricated data, no "proven", missing labelled | Met | Type-level verdict restriction; copy scan; API honest-failure tests; no mock data in production code. |
| 18 | Security: validation, sanitisation, rate limits, keys server-side | Met | API tests: injection, `__proto__`, 429, secret never in responses, `sanitiseUrl`. |
| 19 | Eight-section dark NASA Liquid-Glass UI, responsive and accessible | Met | Tabs, panels, tokens, focus states, reduced motion, responsive rules; UI/DOM tests verify sections and roles. |
| 20 | Ten documents, executed tests, passing build, no regressions | Met | This report plus nine companion documents; 69 forge tests; 390 total; typecheck; build. |

## 4. Deviations and decisions

| Decision | Reason | Consequence |
|---|---|---|
| Forge rendered inside `ChatSurface` rather than a new route | The brief requires one assistant, not a separate app; no router change means no navigation regression. | Chat mode state is local; leaving the chat route resets to chat. |
| PDF produced by the browser print pipeline | No PDF dependency was added, and adding a paid service is excluded. | The passport is a self-contained printable HTML page; JSON/Markdown are generated files. |
| Research memory device-local | No verified Supabase migration was possible from this workspace; the brief forbids unverified schema changes. | History is per-browser, capped, exportable, clearly labelled. |
| Imagery attached, not planned | GIBS is a WMS imagery catalogue, not a time series; listing it as a retrievable series would be dishonest. | `nasa-gibs` removed from plan datasets; images appear in analysis/passport when the domain warrants. |
| Fixed vocabulary interpreter, no LLM | Determinism and auditability; no mandatory paid AI API. | Open-ended paraphrases outside the vocabulary fall back to the documented default window and low interpretation confidence. |
| Six chart components, seven views | Two bar views and imagery are distinct observation views sharing components. | The claim is "seven observation views", not "seven chart libraries". |
| Fixtures only in tests | Fabricated data must never reach production. | Connectors are verified against source-shaped fixtures and failure paths; live calls remain the production path. |

## 5. Files added or changed

Added:

- `src/lib/forge/{types,vocab,strings,analysis,interpreter,hypotheses,planner,normalize,evidence,counterEvidence,orchestrator,passport,memory,client}.ts`
- `server/forge/{connectors,investigate}.ts`, `server/forgeRoutes.ts`
- `src/features/hypothesis-forge/{ForgeSurface.tsx,ForgeCharts.tsx}`
- `src/styles/hypothesis-forge.css`
- `src/i18n/hypothesisForge.ts`
- `scripts/test-forge-{engine,api,ui,dom}.mjs`
- `scripts/fixtures/forge/*.json` (test-only)
- `docs/NOVA_HYPOTHESIS_FORGE_*.md` (ten documents including this one)

Changed:

- `server.ts` — mounts `/api/forge` before the JSON 404.
- `src/workspace/chat/ChatSurface.tsx` — adds the mode switch and the Forge surface.
- `src/i18n.ts` — merges the Forge copy.
- `src/index.css` — imports the Forge stylesheet.
- `package.json` — `test:forge` and chaining into `test`.
- `src/lib/forge/types.ts` — paired observations on `AnalysisResult`.
- `src/lib/forge/orchestrator.ts` — records the aligned pairs used by the correlation.

No existing feature was removed. No credential, endpoint or user file was touched destructively.

## 6. Where to look

- Feature specification: `docs/NOVA_HYPOTHESIS_FORGE_SPECIFICATION.md`
- Architecture: `docs/NOVA_HYPOTHESIS_FORGE_ARCHITECTURE.md`
- Prior art and honest novelty: `docs/NOVA_HYPOTHESIS_FORGE_RESEARCH_AND_NOVELTY.md`
- Data sources: `docs/NOVA_HYPOTHESIS_FORGE_DATA_SOURCES.md`
- Method and thresholds: `docs/NOVA_HYPOTHESIS_FORGE_SCIENTIFIC_METHOD.md`
- Interface: `docs/NOVA_HYPOTHESIS_FORGE_UI_UX.md`
- Security and privacy: `docs/NOVA_HYPOTHESIS_FORGE_SECURITY_AND_PRIVACY.md`
- Testing evidence: `docs/NOVA_HYPOTHESIS_FORGE_TESTING_AND_VERIFICATION.md`
- Limitations and roadmap: `docs/NOVA_HYPOTHESIS_FORGE_LIMITATIONS_AND_ROADMAP.md`

## 7. Verdict

All twenty criteria have working implementations with executed evidence. The system can retrieve,
compute, classify, contradict, refuse and export. Its most important property is that it can say
*"I do not have the data to answer that"* — and does, in the tested out-of-coverage and
source-failure paths.
