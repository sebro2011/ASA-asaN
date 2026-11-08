# NOVA Hypothesis Forge — Testing and Verification

All results below were produced in this workspace. Commands are copy-pasteable from
`ASA-asaN/`.

## 1. Summary

| Gate | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | exit 0, zero errors |
| Forge engine tests | `node --import tsx --test scripts/test-forge-engine.mjs` | **41 / 41 pass** |
| Forge API/security tests | `node --import tsx --test --test-force-exit scripts/test-forge-api.mjs` | **12 / 12 pass** |
| Forge copy/wiring tests | `node --import tsx --test scripts/test-forge-ui.mjs` | **13 / 13 pass** |
| Forge jsdom rendering | `node --import tsx --test --test-force-exit scripts/test-forge-dom.mjs` | **3 / 3 pass** |
| Full repository suite | `npm test` | exit 0, **390 / 390 pass**, 0 failures |
| Production build | `npm run build` | exit 0, `✓ built in 3.06s`, PWA precache 145 entries |

Forge-specific total: **69 tests**.

## 2. Engine tests (`scripts/test-forge-engine.mjs`)

Pure functions and assembled investigations, with no network. Reference values are
independently checkable (for example Pearson r for `{1..5}` vs `{2,4,5,4,5}` is 0.7745966692…;
Student's t two-tailed p at t = 2.048, df = 28 is 0.05; a synthetic one-step lead must be
recovered by cross-correlation).

Covered:

- `erfc`, incomplete beta, t distribution, p-value, correlation, Spearman, regression,
  cross-correlation, anomalies, group comparison, 2×2 table, missing report, alignment;
- interpreter: English/Sinhala/Tamil detection, variables, regions, ranges (explicit,
  relative, month, named event), follow-up inheritance;
- hypothesis generation: ids, null hypothesis, falsification criteria, decisions, statements;
- planner: coverage verdicts, compatibility, key modes, executable flag;
- normalisers for Kp, solar wind, DONKI, NeoWs, POWER, TLE, APOD, Mars photos, including
  missing sentinels and SWPC timestamps;
- evidence thresholds, sign handling, lead-lag contradiction, strength;
- counter-evidence kinds, severity and data-gap flag;
- conclusion verdicts (never `proven`), causal caveat;
- passport JSON/Markdown/HTML and reproducibility block;
- memory comparison rules;
- vocabulary integrity (11 variables, 9 datasets, no imagery dataset in the plan);
- the correlation scatter pairs match the statistic's sample (`pairs.length === sampleSize`,
  recomputed r within display rounding).

## 3. API and security tests (`scripts/test-forge-api.mjs`)

A real Express router on an ephemeral port; only outbound fetch is replaced, with the synthetic
payloads in `scripts/fixtures/forge/`.

Verified:

- catalogue shape, documentation URLs, capability flags, no credential;
- `POST /interpret`: request/plan/hypotheses, ≥2 hypotheses incl. null, UTC window;
- `POST /investigate`: `forge/1`, `INV-…`, injected clock, live statuses, 200 Kp observations,
  8-hex payload hash, official source URL, finite r, 2×2 cells summing to n, every
  hypothesis-linked evidence item has a rule, verdict within the allowed set, causal caveat,
  >3 counter-evidence findings;
- out-of-coverage refusal (1989 Quebec): Kp `out-of-coverage`, no series, no correlation,
  `insufficient-evidence`, endpoint not called;
- upstream 503 and timeout: `unavailable` with `SOURCE_TIMEOUT` / `SOURCE_REJECTED`;
- partial plasma failure: `partial` with a series subset;
- input validation (short, oversized, wrong type);
- follow-up context sanitisation (`evil`, `__proto__`, unknown ids dropped);
- prompt-injection question cannot produce `proven` or reuse injected text as evidence;
- rate limiting returns 429 with `RATE_LIMITED` and `Retry-After`;
- a server key never appears in any response while it was used upstream;
- `sanitiseUrl` strips `api_key`/`key`.

## 4. Copy and wiring tests (`scripts/test-forge-ui.mjs`)

- three language objects present; ≥180 keys each;
- identical key sets and no duplicates per language block;
- no empty values; prose keys differ from English in Sinhala and Tamil;
- interpolation placeholders identical across languages;
- no transliteration corruption (script glued to Latin text);
- no proof/precedence claims, no HTML, no template artefacts;
- every statically referenced `hf*` key exists (including lookup tables and template keys);
- copy merged into `src/i18n.ts`;
- `ChartFrame` usage, six chart components mounted, eight sections present, passport renderers;
- the surface does not call NASA directly, does not contain a key, does not import mock data;
- generated content is labelled as generated.

## 5. jsdom rendering (`scripts/test-forge-dom.mjs`)

Payloads are produced by the **real engine** (`interpretQuestion` → `investigate`) against the
fixtures; only the network boundary is mocked.

- the surface is wired into `ChatSurface` as a second mode without touching `sendChat`;
- workspace renders the honesty note; choosing the example calls `/interpret`;
- hypotheses render with falsification criteria;
- `Investigate this` calls `/investigate` and lands on the analysis section;
- analysis shows the real method label and sample size; the hypothesis graph SVG and at least
  three Recharts surfaces mount (time series, scatter, lag);
- evidence shows the engine's rule text; counter-evidence shows the first finding; passport
  shows the investigation id and the peer-review disclaimer;
- history persists `nova_forge_memory_v1` with the same investigation id;
- Sinhala and Tamil render the tabs and honesty note without English fallback.

jsdom has no layout, so the test installs a deterministic 720×300 box and a `ResizeObserver`
stub; this is stated here so the passing chart assertions are not over-read as visual testing.

## 6. Live smoke test in this sandbox

With `npm run dev` on port 3000 and no NASA key:

| Request | Result |
|---|---|
| `GET /api/forge/catalogue` | 200, engine `nova-hypothesis-forge/1`, datasets with documentation only |
| `POST /api/forge/interpret` | 200, domain `space-weather`, 3 hypotheses, plan `noaa-swpc-kp`, `noaa-swpc-solar-wind`, `nasa-donki` |
| `POST /api/forge/investigate` | 200, all three sources `unavailable` (`network error` — outbound internet is blocked here), verdict `insufficient-evidence`, 3 evidence items, 15 counter-evidence findings, no fabricated values |
| `GET /chat` | 200, SPA shell served |

The last row is the important one: when the sandbox could not reach NOAA, the engine reported
failure honestly instead of inventing a series.

## 7. What is *not* verified

- Pixel-level visual regression, colour contrast measurement and responsive breakpoints were not
  automated.
- Real NASA/NOAA responses were not exercised in this sandbox (network blocked); the connectors
  are verified against documented-format fixtures and against the failure paths.
- Rate limiting is verified within one process; a multi-instance deployment needs a shared store.
- PDF export uses the browser's print pipeline; no PDF was generated by a test.
- Screen-reader behaviour was reasoned from semantics, not tested with assistive technology.

## 8. Reproduce

```bash
cd ASA-asaN
npx tsc --noEmit
node --import tsx --test scripts/test-forge-engine.mjs
node --import tsx --test --test-force-exit scripts/test-forge-api.mjs
node --import tsx --test scripts/test-forge-ui.mjs
node --import tsx --test --test-force-exit scripts/test-forge-dom.mjs
npm run build
npm test          # full repository suite, includes test:forge
```
