# NOVA Forge → multidisciplinary research platform — final report

Branch: `arena/2d65cc11-asa-asan`. Base: `3d2dd4d` (main, after PR #45).

Each of the eighteen points below states what exists, what was verified and what
is missing. The labels are used strictly:

* **implemented** — code exists in this tree.
* **tested** — a named test asserts the behaviour and passed in the final run.
* **partial** — code exists but a required part (usually live integration or UI) does not.
* **planned** — not built. Nothing in this column is claimed anywhere in the UI.

Final verification run, in this repository, in this order:

| Command | Result |
| --- | --- |
| `npm run test:forge` | **189 pass / 0 fail** (41 engine, 12 api, 13 ui, 3 dom, 15 scroll, 48 science, 16 connectors, 32 research, 9 science-dom) |
| `npm test` | **647 pass / 0 fail** (was 542 before this branch) |
| `npm run lint` | clean (`tsc --noEmit`) |
| `npm run build` | exit 0, PWA precache generated |
| `npx tsc --noEmit` on the whole project | clean |

---

## 1. Audit before change — implemented

The audit was performed on the working tree, not from assumption. Findings:

* Stack is Vite + React + Express (`server.ts`), tests are `node --import tsx --test`
  `.mjs` scripts, PWA via `vite-plugin-pwa`, styling by plain CSS with NOVA tokens.
* The Forge is a **mode inside `ChatSurface`**, not a route. Its eight sections
  (workspace, hypotheses, data, evidence, analysis, counter, passport, history)
  are all present and pinned by `scripts/test-forge-ui.mjs`.
* Fourteen engine modules already existed under `src/lib/forge/`, plus
  `server/forge/{connectors,investigate}.ts` and `server/forgeRoutes.ts`.
* The genuine limits were structural: closed `ScientificDomain` and `VariableId`
  unions, one-investigation-at-a-time, no project/version concept.
* `git status` was clean before any edit; nothing of the user's was overwritten.

## 2. No rebuilt system — implemented

No module was replaced, renamed, hidden or disabled. The new code sits in
`src/lib/forge/science/`, `src/lib/forge/research/` and
`server/forge/scienceConnectors.ts` and *calls into* existing modules where they
already implement something (see the mapping table in `SCIENCE_LAYER.md` §1).

## 3. Research project engine — implemented, tested (library), partial (UI)

`src/lib/forge/research/project.ts`: questions, objectives, variables with roles,
assumptions with failure consequences, methods with pre-registration flags,
hypothesis ids, evidence, dataset snapshots, simulations, conclusions, citations,
reports, investigation ids, timestamps and version history.

Tested: creation, validation, migration of partial payloads, refusal of
identity-less payloads, hash stability, storage round-trip, corrupt-store
tolerance, version cap, restore-without-recalculation, drift reporting.
Not done: a project screen in the UI (see §13).

## 4. Hypothesis generation and the thirteen fields — implemented, tested

`src/lib/forge/research/hypothesis.ts` defines exactly thirteen fields and enforces
them through `FIELD_ORDER` / `missingFields()`. Engine hypotheses are imported via
`fromGenerated()`, which copies only what the engine produced and leaves theory,
methodology, controls and assumptions empty — no invented content.

Tested: 13-field presence, comparison rows, edit history with pre-edit hash,
import without invention.

## 5. Hypothesis lifecycle — implemented, tested

`draft → needs-evidence → testable → under-evaluation → supported | not-supported |
inconclusive → archived`, with a transition table and **content gates**:

* `testable` requires statement + methodology + predictions + falsification conditions.
* `under-evaluation` requires pinned datasets + methodology.
* `supported`/`not-supported`/`inconclusive` require alternative explanations,
  limitations and assumptions.

Tested: the full happy path, a refused `draft → supported` jump, a refused support
with empty fields, that a refused transition leaves the object untouched, and that
no disclosure string ever says "proven" or asserts a discovery.

## 6. Variables and assumptions — implemented, tested

Variables carry a role (`independent | dependent | control | mediator | confounder`),
a unit and an operationalisation. Assumptions carry `ifFalse` and a status
(`untested | supported | challenged | violated`). Both are persisted per project.

## 7. Scientific AI reasoning boundary — implemented, tested where testable

The new layer contains **no provider call at all**: the science engines take
numbers and return numbers, and `scripts/test-forge-science-dom.mjs` asserts the
panel performs zero network requests. The existing AI paths (interpretation,
Earth analyst failover) are unchanged and still covered by their suites.

Conditions met by construction: deterministic fallback is labelled, no AI output
is presented as a computed statistic, keys stay server-side (unchanged), external
text is treated as untrusted (unchanged), and the prompt-injection posture is
pinned by the existing security suite (`test:space-build-security`).

Not claimed: a new provider-agnostic orchestration layer. `client.ts` and
`interpreter.ts` remain the single implementation; duplicating them here would
have violated the "no duplicate implementations" rule.

## 8. Evidence intelligence — implemented, tested

`src/lib/forge/research/evidenceIntel.ts`: full field set, five stances, five
source types with printed caveats, allowlisted hosts, DOI syntax validation,
never-composed identifiers, metadata-only access notes, per-hypothesis stance
counts, and a balance summary that is **counts plus a sentence, never a percentage**.

Tested: DOI rejection, off-allowlist marking, `ai-generated` never verified,
identifier-less claims kept visible as unverified, ranking, indeterminate
balance, citation formatting that prints "Authors not recorded" rather than
inventing them.

## 9. Scientific data integration — implemented, tested against injected fetch, partial live

`server/forge/scienceConnectors.ts` is one adapter for NASA Exoplanet Archive TAP,
JPL SBDB, NASA OSDR and NASA Open APIs, with descriptors (host, docs URL,
attribution, rate limit, TTL, env key, scope). NASA POWER and the existing eight
connectors are untouched and still verified by `test-forge-api`.

Guarantees tested without network: exact-host https allowlist, redirect refusal,
credential parameter stripping, token-bucket refusal, cache hit and explicit
refresh, timeout typing, schema rejection, 429 handling, 5xx retry, network-failure
typing without leaking internal paths, attribution presence, availability check
that makes no request, row normalisation that keeps nulls missing.

**Not tested live**: no request to those four services has been made from this
environment, so their live schemas are unconfirmed. They are optional and
fault-isolated, and no frontend code holds a key.

## 10. Deterministic computing — implemented, tested

`stats.ts` and `units.ts`: descriptives, Pearson/Spearman with Fisher intervals,
OLS with slope standard error and t interval, one-sample and Welch t-tests with
assumption gates, robust outliers, jackknife sensitivity, AIC model comparison,
linear and Monte Carlo error propagation, dimension-checked conversion.

Tested against t-tables and hand calculations (see `SCIENCE_LAYER.md` §3). Every
result states that correlation is not causation and that small samples widen the
interval; nothing in the layer emits a causal claim.

## 11. Mathematical modelling and simulation — implemented, tested

`simulation.ts`: projectile with quadratic drag (RK4), two-body Kepler orbit
(velocity Verlet), damped harmonic oscillator (RK4 vs analytic), Newton cooling
(RK4 vs closed form). Each run prints equations, numerical method, parameters,
units, assumptions, diagnostics and a validation verdict where an independent
solution exists.

Tested: vacuum range against `v²sin2θ/g` (< 0.2 %), orbit closure (< 2 %) and
energy drift (< 1e-6), oscillator in all four damping regimes (< 1 %), Newton
cooling against the closed form (< 1e-6), hyperbolic state rejection, and that a
drag run honestly reports *no* validation rather than a fabricated one.

Two genuine numerical bugs were found by these tests and fixed: a spurious
`1/(ab)` factor in the regularised incomplete beta (wrong t-tail p-values for
a ≠ 1) and a missing sine term in the underdamped analytic solution.

## 12. Discovery intelligence and the verification gate — implemented, tested

`discovery.ts` screens for robust anomalies, cadence gaps, a Mann–Kendall trend
and lag structure. Each candidate carries `claim ∈ {observed, statistical}`,
the verification it would require, and `verified: false`.

`verificationGate()` is the only path to `verified`, and it refuses unless the
record names the reproducer, the method and an independent dataset, and the
result agreed. Its success message still says "not yet a scientific discovery,
which also requires community review".

Tested: no candidate is ever verified; a flat series yields no candidates and
states that this is a valid outcome; short series list the screens they could not
run; the gate refuses null, incomplete and disagreeing records; the rendered panel
never uses the word "discovery" without negation.

## 13. Premium UI inside the NOVA design language — implemented, tested in jsdom, partial

`ScienceLab.tsx` sits inside the existing Scientific Analysis section: five tabs
(descriptive, trend/models, Bayesian, simulation, screening), an editable series
picker, numeric inputs for priors and simulation parameters, disclosure blocks,
and a reproducibility record for every result. It uses the existing NOVA tokens
and `forge-*`/`forge-lab*` classes; no global CSS was overridden, no new palette
was invented.

Accessibility: real `role="tablist"`/`role="tab"` with `aria-selected`, visible
focus rings, native `<select>`/`<input>`/`<details>`, no keyboard traps.

Tested in jsdom: known statistics rendered, audit record present, validation
verdict shown, prior echoed, candidates labelled, empty state, zero network calls.

**Partial**: the project/hypothesis authoring screens (§3, §4) are not built, and
resizable panels / full-screen mode / a contextual assistant were **not** added —
the existing assistant and layout are untouched, and adding them without a
browser to verify them would have produced unverifiable UI.

## 14. Scrolling and layout regressions — verified, no regression

This branch adds no scroll container: no `overflow-y`, no fixed heights, and the
new panel uses `minmax(min(...), 1fr)` grids with `min-width: 0`. The scroll suite
(`scripts/test-forge-scroll.mjs`, 15 tests) still passes, including its
comment-stripped CSS invariants, the `(^|[^-])height:` rule and the ≤1023 px
mobile-bar reservation.

## 15. Security and performance — implemented, tested

* No credential in frontend code; the adapter injects keys server-side and strips
  them from every exposed URL.
* SSRF: https-only, exact-host allowlist, credentials-in-URL refused, redirects
  not followed.
* Rate limiting per host, timeouts, cache caps, entry caps — all tested.
* Payload schema validation refuses a mismatched body rather than partially
  trusting it.
* Error text is typed and never carries a key, a stack trace or an internal path
  (asserted).
* No user-supplied formula is evaluated: model selection is a closed enum.
* Performance: computations are `useMemo`-scoped per series; the simulation with
  the default settings completes in a few thousand steps; the heaviest run is
  bounded (`maxSteps` caps) so a bad parameter set cannot hang the UI.

## 16. Tests per the enumerated lists — implemented

| Area | Suite | Count |
| --- | --- | --- |
| Hypothesis lifecycle | `test-forge-research.mjs` | 10 tests (+ 12 project tests) |
| Evidence | `test-forge-research.mjs` | 10 tests |
| Deterministic computing | `test-forge-science.mjs` | 36 tests (contracts, units, propagation, descriptives, correlation, regression, t-tests, outliers, sensitivity, model comparison, screening) |
| Simulation | `test-forge-science.mjs` | 7 tests |
| Connectors/security | `test-forge-science-connectors.mjs` | 16 |
| UI | `test-forge-science-dom.mjs` | 9 |

## 17. Regression across every NOVA module — tested

The full suite (647 tests) covers APOD, Earth analyst (server + UI), space videos,
space news, community, AI viewer, welcome, workspace shell, security/performance,
NOVA diagnostics, chat, and all nine Forge suites. Zero failures.

## 18. Honest account of what remains — see the table

| Item | Label |
| --- | --- |
| Live Exoplanet / JPL / OSDR queries | partial |
| Project & hypothesis authoring UI | partial |
| Linking a stored investigation to a project in the UI | planned |
| Resizable panels, full-screen mode, contextual assistant in the lab | planned (deliberately not added unverified) |
| Causal inference, ML surrogates, PDE solvers | planned (explicitly out of scope) |
| Publication/submission workflow | planned (report artefact only) |
| Multi-user / server-side projects | planned (device-local storage, no invented auth) |
| Browser-level pixel verification | impossible in this environment |

Nothing above is presented to a user as finished work. The UI never shows a
number without its method, sample size and assumptions, never labels a hypothesis
a discovery, and never renders a citation the user or a connector did not supply.
