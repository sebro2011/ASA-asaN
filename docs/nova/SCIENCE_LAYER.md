# NOVA Forge — scientific computing and research layer

Status of this document: describes what is in the repository **now**, on the
branch that introduced it. Everything marked *implemented* has code and tests in
this tree; everything marked *partial* or *planned* says exactly what is missing.
No claim in this document was written from a plan that has not been executed.

Verification for this layer (commands run in the repository root):

| Command | Result |
| --- | --- |
| `npm run test:forge` | 189 tests, 189 pass, 0 fail (9 suites) |
| `npm test` | 647 tests, 647 pass, 0 fail |
| `npm run lint` (`tsc --noEmit`) | clean |
| `npm run build` | exit 0 |

---

## 1. Why a new layer instead of a rewrite

Before this change the Forge could run **one investigation** in **six space- and
Earth-science domains**, with a fixed variable vocabulary. It had strong honesty
properties (deterministic analysis, evidence classification, counter-evidence,
passport, provenance hashes) but three structural limits:

1. `ScientificDomain` in `src/lib/forge/types.ts` was a closed union, so a
   hypothesis in biology or exoplanetary science could not be represented.
2. `VariableId` was a closed union, so an arbitrary measured quantity could not
   be carried through the pipeline.
3. The unit of work was one investigation; there was no project, no version
   history, no reopening of a past run, no multi-hypothesis programme.

The response was to add a layer **beside** the existing engines, not to replace
them: the investigation engine, connectors, evidence classifier, counter-evidence
engine, passport, journal, deep-sky, orbit lab, star library, observing plan and
intelligence modules are untouched and still tested.

| Existing module | Kept as the single implementation of |
| --- | --- |
| `src/lib/forge/analysis.ts` | investigation-level deterministic analysis (correlation, cross-correlation, trend, scatter, regime split) |
| `src/lib/forge/evidence.ts` | evidence classification rules and strength for investigation datasets |
| `src/lib/forge/counterEvidence.ts` | confounders, falsification tests, bias checks |
| `src/lib/forge/passport.ts` | the Evidence Passport artefacts (JSON / Markdown / HTML) |
| `src/lib/forge/memory.ts` | device-local investigation journal |
| `src/lib/forge/orchestrator.ts` | the investigation pipeline |
| `server/forge/connectors.ts` | the eight live NASA/NOAA connectors |

## 2. The new modules

```
src/lib/forge/science/
  contracts.ts   ComputationResult envelope, claim levels, hashing, missing-value policy
  units.ts       dimensions, conversion, error propagation (linear + Monte Carlo)
  stats.ts       descriptives, correlation, OLS, t-tests, outliers, jackknife, AIC comparison
  bayes.ts       normal–normal, prior sensitivity, Beta–Binomial, Bayes factor
  simulation.ts  projectile, two-body orbit, damped oscillator, Newton cooling
  discovery.ts   pattern screening and the verification gate

src/lib/forge/research/
  project.ts           projects, versions, autosave/recovery, dataset pinning, drift checks
  hypothesis.ts        the thirteen fields, lifecycle and transitions
  evidenceIntel.ts     provenance, source hierarchy, stance counts, citation formatting

server/forge/
  scienceConnectors.ts shared allowlisted adapter (rate limit, timeout, cache, schema, SSRF)
```

### 2.1 One result envelope, one set of claims

Every computation returns `ComputationResult`:

```ts
{ id, kind, claim, value, unit, uncertainty, interval, sampleSize,
  assumptions, limitations, skipped, skipReason, reproducibility }
```

`claim` is one of `observed | computed | statistical | model-prediction |
suggestion | verified`. A `verified` claim is never produced by a computation —
the only path to it is the explicit reproduction gate in `discovery.ts`.

`reproducibility` records the engine version (`nova-science/1.0.0`), the method,
the **formula as executed**, the input vectors with FNV-1a hashes, the parameters,
the assumptions, the missing-value policy, the sample size, the seed (for
stochastic methods) and the timestamp.

### 2.2 Missing data is never invented

`cleanValues()` performs listwise deletion and returns the policy string that the
result carries. Nothing is interpolated, forward-filled or imputed. `detectOutliers`
flags points but states that a flag is not an error, and that removing a point
requires a documented instrument reason.

### 2.3 Assumption gates

Methods that cannot support their own assumptions refuse to run:

* `correlate` → `skipped` below 3 pairs, with the reason.
* `tTestOneSample` / `tTestWelch` → `skipped` below 3 per group.
* `detectOutliers` → `skipped` below 4 values (no robust scale).
* `compareTrendModels` → `skipped` below 5 pairs.
* A hyperbolic two-body state throws instead of being integrated.

A skipped result still carries `value` (NaN where appropriate), never a
plausible-looking number.

## 3. Validated numerics

The tests assert against **hand-derived or published values**, not against the
implementation's own output:

* `describe([2,4,4,4,5,5,7,9])` → mean 5, sample variance 32/7, sd 2.13809….
* Percentiles use linear interpolation (R type 7): q1 of `1,2,3,4` is 1.75.
* `tTwoSidedP(2.0, 10) = 0.07339`, `tTwoSidedP(1.812461, 10) = 0.10`,
  `tTwoSidedP(2.228139, 10) = 0.05` — checked against a t-table.
* One-sample t-test on `1…5` → t = 4.24264, df = 4, p = 0.013236.
* Welch t-test with equal variances reduces to df = n₁+n₂−2 = 4.
* Beta(8,4) 95 % credible interval ≈ [0.390, 0.891].
* Normal–normal posterior matches the conjugate closed form exactly.
* Projectile in vacuum reproduces `R = v²sin(2θ)/g` to < 0.2 % at dt = 1 ms.
* Two-body orbit closes to < 2 % of r₀ after one computed period, with relative
  energy drift < 1e-6 (velocity Verlet).
* Damped oscillator matches its analytic solution in all four regimes
  (ζ = 0, 0.2, 1, 2) within 1 %; Newton cooling within 1e-6 of the closed form.

Two real bugs were found and fixed by these tests rather than by inspection:
the regularised incomplete beta used for t-tail probabilities had a spurious
`1/(ab)` factor (wrong p-values for a ≠ 1), and the underdamped analytic solution
omitted the sine term required by ẋ(0) = 0.

## 4. Evidence rules

`evidenceIntel.ts` encodes the directive's evidence requirements as code:

| Requirement | Implementation |
| --- | --- |
| Full field set | `EvidenceRecord` (id, title, authors, url, doi, publisher, published/published date, retrieval date, dataset id + version, observation, unit, method, limitations, citation) |
| Stance | `supporting \| contradicting \| neutral \| insufficient \| unverified` |
| Source hierarchy | `peer-reviewed \| official-dataset \| preprint \| secondary \| ai-generated`, each with a printed caveat |
| Never fabricate identifiers | `validateEvidenceRecord()` never adds a URL or DOI; a missing identifier stays `null` and the record is marked `unverified` |
| Full-text limits | `accessNote` states that dataset records are `metadata-only` and that no paper was read |
| Hypothesis links | `hypothesisIds` + `stanceCounts()`; there is no global evidence score |

`evidenceBalance()` returns **counts and a sentence**, never a percentage, and
sets `indeterminate` when there is unverified or insufficient material.

## 5. Projects, versions, reproduction

`project.ts` adds the research-programme layer on the same storage family as the
journal (`nova_forge_projects_v1`, draft in `nova_forge_project_draft_v1`):

* `ResearchProject` holds questions, objectives, variables (with roles), assumptions
  (with what breaks if false), methods (with pre-registration flag), hypothesis ids,
  evidence, **dataset snapshots**, simulations, conclusions, citations, reports and
  investigation ids.
* `DatasetSnapshot` pins `datasetId / version / retrievedAt / payloadHash / rowCount
  / units / query`, so a run can be replayed rather than re-guessed.
* `commitVersion()` stores a snapshot plus the FNV-1a content hash; the snapshot
  deliberately excludes `versions` (embedding history inside history grows
  exponentially — this was caught by a test that hit a `RangeError`).
* `restoreVersion()` returns the values **as recorded** and says so; it never
  recalculates.
* `checkReproducibility()` compares pinned hashes with the source's current hash
  and reports drift (changed *and* unreachable datasets separately) instead of
  silently absorbing it.
* `saveDraft()`/`readDraft()` verify the hash on read; a partially written draft
  is refused rather than restored.
* `migrateProject()` fills missing arrays and refuses payloads without id/title.
  Corrupt store contents are treated as empty, never as a crash.

## 6. Hypothesis lifecycle

Thirteen fields are enforced by type and by `missingFields()`:
statement, rationale, theory, IV, DV, controls, assumptions, predictions,
methodology, datasets, limitations, alternative explanations, falsification
conditions.

Lifecycle: `draft → needs-evidence → testable → under-evaluation → supported |
not-supported | inconclusive → archived`, with an explicit transition table.

Transitions are gated on **content**, not clicks: `testable` needs a method,
predictions and falsification conditions; `under-evaluation` needs pinned
datasets; `supported`/`not-supported`/`inconclusive` need alternatives,
limitations and assumptions. `lifecycleDisclosure()` returns the sentence shown
next to the hypothesis and always states that support is not proof and not a
discovery.

Engine-generated hypotheses are imported through `fromGenerated()`, which copies
what exists and leaves `theory`, `methodology`, `controls`, `assumptions` empty
rather than inventing them.

## 7. Shared connector adapter

`server/forge/scienceConnectors.ts` is the one path for optional science
connectors, with descriptors for the NASA Exoplanet Archive TAP service, JPL
Small-Body Database, NASA OSDR and NASA Open APIs. It provides:

* an https + exact-host allowlist, checked before any socket opens, with
  redirects refused (`redirect: 'manual'`) rather than followed off-list;
* a token bucket per host, refusing rather than queueing;
* an `AbortController` timeout reported as `status: 'timeout'`;
* a TTL cache with an entry cap, bypassable only by an explicit `refresh`;
* caller-supplied schema validation — a payload that fails is rejected whole;
* row → series normalisation that keeps nulls as missing and reports the count;
* attribution carried on every result, and refusal (`no-attribution`) when a
  source declares none;
* fault isolation: the function never throws; failures are typed results, and
  error text never contains a key or an internal path;
* `connectorAvailability()` is descriptor-based, so checking availability makes
  **no** network call;
* `sanitiseUrl()` strips `api_key` and similar parameters from anything exposed.

These connectors are **implemented and unit-tested against an injected `fetch`,
but not exercised against the live services from this environment** — see §10.

## 8. The Computational Laboratory panel

`src/features/hypothesis-forge/ScienceLab.tsx` is mounted inside the existing
Scientific Analysis section (no new route, no new navigation, no second chat).
It computes on the series the investigation already retrieved:

* **Descriptive statistics** — mean, median, sd, quartiles, 95 % interval,
  outliers (modified z-score), most influential point (jackknife), missing count.
* **Trend and models** — OLS slope with a t interval, R², AIC comparison of a
  linear and an exponential family (ΔAIC < 2 is reported as *indistinguishable*),
  and a timestamp-aligned cross-series correlation when two series exist.
* **Bayesian update** — prior mean and sd are editable and echoed back; posterior
  mean, 95 % credible interval, weight carried by the data, and a prior
  sensitivity sweep so the dependence on the prior is visible.
* **Simulation** — four validated models with editable parameters, the internal
  validation verdict, all diagnostics, and the statement that the output is a
  model prediction, not an observation of the selected series.
* **Pattern screening** — anomalies, cadence gaps, Mann–Kendall trend and an
  autocorrelation scan, each labelled with its claim level, the verification it
  would require, and `candidate, not a discovery`. Screens that could not run
  are listed with the reason.

Every panel prints a **Reproducibility record** (method, formula, engine version,
input hashes, assumptions, missing-value policy) and the footer repeats that the
engine is deterministic. The panel makes **no network request** — asserted by a
test that replaces `fetch` with a throwing stub.

i18n: 44 new `hfLab*` keys in English, Sinhala and Tamil, with the existing
key-parity, placeholder-parity and honesty-wording tests still passing.

## 9. Test coverage added

| Suite | Tests | What it proves |
| --- | --- | --- |
| `scripts/test-forge-science.mjs` | 48 | units, propagation, descriptives, correlation, OLS, t-tests, outliers, jackknife, AIC, Bayes, simulations, screening, verification gate |
| `scripts/test-forge-science-connectors.mjs` | 16 | SSRF guard, key redaction, cache, refresh, timeout, schema rejection, redirect refusal, 429, retries, token bucket, availability, row normalisation |
| `scripts/test-forge-research.mjs` | 32 | project validation/migration, hash stability, draft recovery + tamper rejection, versioning + cap, restore-without-recalculation, drift reporting, 13 fields, lifecycle gating, comparison, evidence validation, ranking, balance, citation formatting |
| `scripts/test-forge-science-dom.mjs` | 9 | the panel renders hand-checked numbers, prints its audit record, reports validation, shows the prior, labels candidates, empty state, no network |

## 10. What is **not** done — read this before quoting the feature list

| Item | State | Detail |
| --- | --- | --- |
| Live Exoplanet/JPL/OSDR queries | **partial** | adapter + descriptors + fixtures-tested behaviour exist; no request has been made to those services from this environment, so their live schemas are unconfirmed |
| Project UI (create/browse/version screens) | **partial** | the project/hypothesis/evidence models, storage, migration and tests exist; the Forge UI currently surfaces the *science lab* only, so projects are driven through the library API |
| Project ↔ investigation linking UI | **planned** | `investigationIds` exists on the model; no screen wires a stored investigation into a project yet |
| Causal inference | **not attempted** | the layer says `correlate ≠ cause` in every relevant result and implements no causal estimator |
| Causal/Bayesian network modelling, PDE solvers, ML surrogates | **planned** | out of scope for this increment; nothing pretends to be there |
| External peer review, publication | **not modelled** | a report artefact exists on the model; no journal submission path is implemented |
| Multi-user collaboration / server-side projects | **not implemented** | storage is device-local, as the existing journal is; no auth scheme was invented |
| Browser-level visual verification | **not possible here** | jsdom is used; no Chromium is installable in this environment, so no pixel-level claim is made |

## 11. How to re-verify

```bash
npm install
npm run test:forge     # 189 tests across 9 suites
npm test               # 647 tests
npm run lint
npm run build
```

The science layer can be exercised without the UI:

```bash
node --import tsx --test scripts/test-forge-science.mjs
```
