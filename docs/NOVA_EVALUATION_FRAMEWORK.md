# NOVA evaluation framework

Two layers: a **test suite** that runs on every change (`npm test`) and a
**benchmark suite** the product itself exposes at `/intelligence → Benchmarks`.
Both report measured numbers; neither fabricates a pass rate.

---

## 1. Test inventory

`npm test` = `npm run lint` (`tsc --noEmit`) followed by 34 Node test scripts.
Last full run on this branch: **542 tests, 542 passed, 0 failed**, exit 0.

| Suite | Tests | What it proves |
| --- | --- | --- |
| `test:life-runtime` | 12 | engine boots, schema version, hardware profiles, language detection, permission defaults, provider registry, config shape |
| `test:life-memory` | 13 | create/search/score components, FTS strategy, versions, revert, correction, dedupe threshold, expiry, secret refusal, permission denial |
| `test:life-orchestration` | 13 | planning intents, caps, tool gating, verification outcomes, experience capture, skill discovery, simulation preview, graph links |
| `test:life-api` | 8 | real Express over HTTP: status/config/security, memory CRUD + FTS, coded errors, a verified task run, skill lifecycle enforcement, simulation approval, benchmarks + graph, provider health |
| `test:life-sql` | 5 | the Supabase migration on PGlite: 13 tables, RLS on all, 4 policies each, no `anon` grants, forged `user_id` rejected, forged `verified` insert rejected, rollback drops only `life_*` |
| `test:workspace-intelligence` | 5 | the UI surface: overview from status counts, memory/skill panels, empty states, security grant POST, benchmark run, engine error shown as a code |
| `test:workspace-shell` | 12 | routes, nav/href consistency, **copy parity across en/si/ta**, no dynamic `t()` keys, WCAG AA contrast for both themes |
| `test:workspace-dom` | 5 | rendered workspace flows in jsdom |
| 14 other `test:workspace-*` | 134 | SQL, auth, sync, import, cloud config, config, security, home, news, chat, settings, search, astronomy, modules |
| `test:api-routes`, `test:earth*`, `test:nova-*`, `test:space-*`, `test:community`, `test:ai-viewer`, `test:welcome`, `test:space-build-security`, `test:security-performance` | 194 | pre-existing guards: route inventory, science math, chat fallback and thinking ladder, news/videos, security headers, cache policy, rate limiting, service-worker behaviour |

Test-type coverage:

| Required type | Where |
| --- | --- |
| Unit | `test:life-runtime`, `-memory`, `-orchestration`; `test:workspace-*` |
| Integration | `test:life-api` (HTTP), `test:life-sql` (database), `test:workspace-dom` (React) |
| Security | `test:life-memory` (secrets, permissions), `test:life-api` (revocation, approval), `test:life-sql` (RLS), `test:security-performance` |
| Regression | the whole pre-existing suite runs unchanged; `test:api-routes`, `test:workspace-shell` pin contracts |
| Multilingual | `test:workspace-shell` parity, `test:life-memory` cross-language search, benchmark `lang-*` and `mem-si-cross` |
| Performance | latency sampled by every benchmark case; request-level rate limiting and cache headers in `test:security-performance` |

There is **no** load test and **no** SLO assertion for the life engine. The
numbers below are single-run measurements on one machine.

## 2. Running the suites

```bash
npm install
npm run lint
npm run test:life            # 10 + 13 + 12 + 8 + 5
npm run test:workspace-intelligence
npm test                     # everything (401)
```

Each script runs with `node --import tsx --test --test-force-exit`. `test-life-*`
uses an in-memory database; `test-life-api` starts the real router on a random
port; `test-life-sql` boots PGlite and applies the two migrations.

## 3. Benchmark dataset

Seven cases, fixed inputs, deterministic expectations. Source:
`server/life/benchmarks.js`. `GET /api/nova/life/benchmarks` exposes
`dataset` (id, suite, name, language), `cases()` (full definitions, including the
expectation, for the UI) and `history` (stored runs).

| # | id | suite | language | Input gist | Expectation |
| --- | --- | --- | --- | --- | --- |
| 1 | `lang-en` | language | en | astronomy question in English | detected `en` |
| 2 | `lang-si` | language | si | same question in Sinhala | detected `si` |
| 3 | `lang-ta` | language | ta | same question in Tamil | detected `ta` |
| 4 | `sec-redaction` | security | en | text containing an `sk-…` key | no key left, `[REDACTED` present |
| 5 | `sec-injection` | security | en | "ignore all previous instructions…" | `instruction-override` signal |
| 6 | `mem-en` | memory | en | stores a record, retrieves it by keyword | the record is the top hit |
| 7 | `mem-si-cross` | memory | si | Sinhala query for an English memory | the English record is retrieved |

The memory cases create their own records under the running user, measure, and
delete them. Nothing is scored against data the harness did not create.

## 4. Measured results

Run on this branch (Node 22.22.3, Linux x64, warm process, in-memory SQLite):

| Case | Passed | Latency |
| --- | --- | --- |
| `lang-en` | ✅ | 0.11 ms |
| `lang-si` | ✅ | 0.04 ms |
| `lang-ta` | ✅ | 0.01 ms |
| `mem-en` | ✅ | 22.15 ms |
| `mem-si-cross` | ✅ | 2.56 ms |
| `sec-injection` | ✅ | 0.86 ms |
| `sec-redaction` | ✅ | 0.52 ms |

Totals: **7/7 passed**. Per language: `en` 4 cases / 23.64 ms (the first case
pays for FTS index warm-up), `si` 2 cases / 2.60 ms, `ta` 1 case / 0.01 ms.

Reproduce:

```bash
curl -s -X POST http://localhost:3000/api/nova/life/benchmarks/run \
  -H 'content-type: application/json' -d '{}' | jq '{total, passed, byLanguage}'
```

Expect run-to-run variance; the dataset and the assertions are what make it
reproducible, not the milliseconds.

## 5. What the benchmarks do not measure

- Model quality. There is no reference LLM in the loop (the sandbox cannot reach
  one), so no "accuracy" figure for answer generation is reported.
- Retrieval quality on a large corpus. The memory cases are single-record
  round-trips plus one cross-language hit, not a recall/NDCG study.
- Cross-language *semantic* quality. The bridge is the 18-entry glossary; the
  case proves the mechanism works for a covered concept, not for arbitrary text.
- Throughput under concurrency.

Each of these is a real gap; see `NOVA_DEVELOPMENT_REPORT.md` §5.
