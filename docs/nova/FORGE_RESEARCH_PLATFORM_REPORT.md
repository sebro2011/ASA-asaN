# NOVA Forge → multidisciplinary research platform — final report

Branch: `arena/6a0a09aa-asa-asan`. Base: `cc76daa` (main, after PR #46, which
carried the first version of this report). This revision adds the *user-facing*
half of the platform: the Research Workspace UI, the contextual assistant route
and their tests.

Each of the eighteen points below states what exists, what was verified and what
is missing. The labels are used strictly:

* **implemented** — code exists in this tree.
* **tested** — a named test asserts the behaviour and passed in the final run.
* **partial** — code exists but a required part (usually live integration or UI) does not.
* **planned** — not built. Nothing in this column is claimed anywhere in the UI.

Final verification run, in this repository, in this order:

| Command | Result |
| --- | --- |
| `npm run test:forge` | **224 pass / 0 fail** (41 engine, 12 api, 13 ui, 3 dom, 15 scroll, 48 science, 16 connectors, 32 research, 9 science-dom, 20 assistant, 15 research-workspace) |
| `npm test` | **682 pass / 0 fail** (647 before this branch) |
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

## 3. Research project engine — implemented, tested (library and UI)

`src/lib/forge/research/project.ts`: questions, objectives, variables with roles,
assumptions with failure consequences, methods with pre-registration flags,
hypothesis ids, evidence, dataset snapshots, simulations, conclusions, citations,
reports, investigation ids, timestamps and version history.

Tested: creation, validation, migration of partial payloads, refusal of
identity-less payloads, hash stability, storage round-trip, corrupt-store
tolerance, version cap, restore-without-recalculation, drift reporting.
The project screen now exists: `src/features/hypothesis-forge/research/` renders the
full lifecycle — create, rename, discipline, questions, objectives, variables,
assumptions, methods, dataset snapshots, archive, delete, version history. The
hook `useResearchProjects` owns every mutation so persistence rules live in one
place, and the panels stay declarative.

## 4. Hypothesis generation and the thirteen fields — implemented, tested

`src/lib/forge/research/hypothesis.ts` defines exactly thirteen fields and enforces
them through `FIELD_ORDER` / `missingFields()`. Engine hypotheses are imported via
`fromGenerated()`, which copies only what the engine produced and leaves theory,
methodology, controls and assumptions empty — no invented content.

Tested: 13-field presence, comparison rows, edit history with pre-edit hash,
import without invention.

In the UI (`HypothesisPanel.tsx`): all thirteen fields are editable, the
comparison table marks same/different rows for every pair, and the lifecycle
controls now render **every reachable state, including the blocked ones** — a
blocked button carries `aria-disabled` and explains its refusal when pressed
rather than disappearing (the first version hid them, which left the researcher
guessing; `test-forge-research-workspace` pins the new behaviour).

## 5. Hypothesis lifecycle — implemented, tested

`draft → needs-evidence → testable → under-evaluation → supported | not-supported |
inconclusive → archived`, with a transition table and **content gates**:

* `testable` requires statement + methodology + predictions + falsification conditions.
* `under-evaluation` requires pinned datasets + methodology.
* `supported`/`not-supported`/`inconclusive` require alternative explanations,
  limitations and assumptions.

Tested: the full happy path, a refused `draft → supported` jump, a refused support
with empty fields, that a refused transition leaves the object untouched, and that
no disclosure string ever says "proven" or asserts a discovery. In the UI the
refusal is printed verbatim (`Blocked: Cannot move to testable: methodology,
falsification conditions, predictions must be filled in first.`) and the
`lifecycleDisclosure()` sentence is shown above the fields.

## 6. Variables and assumptions — implemented, tested

Variables carry a role (`independent | dependent | control | mediator | confounder`),
a unit and an operationalisation. Assumptions carry `ifFalse` and a status
(`untested | supported | challenged | violated`). Both are persisted per project.

## 7. Scientific AI reasoning boundary — implemented, tested (injected providers)

Two things are kept strictly apart:

**The deterministic layer** contains no provider call at all. The science engines
take numbers and return numbers, and `scripts/test-forge-science-dom.mjs` asserts
the lab panel performs zero network requests.

**The contextual assistant** (`server/forge/projectAssistant.ts`, mounted as
`POST /api/forge/assistant`) is provider-agnostic through the existing
`ProviderAdapter` seam: Gemini → OpenRouter → Arena, 12 s per attempt, 25 s
deadline, then a labelled local brief. Everything that reaches the model is
`buildResearchContext(project, { selectedHypothesisId })` — a bounded, structured
context (`version: 'research-context/1'`, rejected above 96 000 bytes) wrapped in
`<project_context>` and declared as data, never as instructions. The browser sends
only that context; the key stays server-side; the raw project blob, its storage
keys and its version history are never transmitted (asserted in
`test-forge-research-workspace`).

Output is audited before it is shown: `UNPARSABLE_RESPONSE`, `UNUSABLE_ANSWER`,
`CITATION_NOT_IN_CONTEXT`, `UNSUPPORTED_CLAIM`, `INVENTED_NUMBER`. A citation that
is not literally in the project context is refused, and an answer whose numbers do
not appear in the context is discarded **entirely** — the panel then shows the
labelled local brief instead of the model text. Local mode is captioned "not a
model response"; a failure is shown as a failure and the question is not answered
locally.

Tested: 20 tests in `scripts/test-forge-assistant.mjs` (context version and size
gate, question length gates, injection-resistant framing, provider fallback, gate
codes, no secret in any response body), plus the two assistant tests in
`test-forge-research-workspace.mjs` (request body contains only the context; local
brief is labelled; a 400 is displayed as an error).

Not claimed: a live Gemini/OpenRouter call. No key exists in this environment, so
the provider path is verified against injected adapters only.

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

## 13. Premium UI inside the NOVA design language — implemented, tested in jsdom

Two surfaces, both inside the existing Forge shell; nothing was moved or
re-styled globally.

**Science Lab** (`ScienceLab.tsx`, inside the existing Scientific Analysis
section): five tabs (descriptive, trend/models, Bayesian, simulation, screening),
an editable series picker, numeric inputs for priors and simulation parameters,
disclosure blocks, and a reproducibility record for every result.

**Research Workspace** (`src/features/hypothesis-forge/research/`, new Forge
section "Research projects"): project navigation with create/archive/delete, six
panels (overview, hypotheses, evidence, versions, analysis, assistant), a
keyboard-operable `role="separator"` resizer (±16 px, clamped 180–420, Home/End,
pointer drag, width remembered), collapse, a full-screen overlay that owns its own
scroll and locks the body, save-state and storage alerts, and a draft-recovery
banner that names the draft and applies nothing until the user clicks.

Styling is `src/styles/forge-research.css` (`.fr-*`, imported right after
`hypothesis-forge.css`): NOVA tokens, liquid-glass surfaces, `min-width: 0` grids,
a `@media (max-width: 1023px)` stacked layout with a project `<select>`,
`@media (max-width: 640px)` denser padding and larger targets, `@media (pointer:
coarse)` 40 px targets, and a `prefers-reduced-motion` block. No global selector
was overridden.

Accessibility: a real roving-tabindex `tablist` (`ArrowLeft/Right/Home/End`, one
`aria-selected` tab, panels labelled by their tab), `aria-orientation` and
`aria-valuenow` on the separator, `role="status"` alerts, native form controls,
visible focus rings.

Tested in jsdom (15 tests, `scripts/test-forge-research-workspace.mjs`): empty
state and creation, debounced autosave (store untouched before 250 ms, draft
present inside the window, cleared after), draft recovery offered/refused/applied,
lifecycle button set and refusal text, 13-row comparison, DOI validation on save,
version commit + restore + "nothing was recalculated", separator keyboard clamping
and width persistence, full-screen lock/Escape, tab roving focus, assistant local
brief and error path, plus static assertions on the stylesheet (single vertical
scroll container, tablet/phone/coarse-pointer breakpoints, nav grid template) and
on the absence of fabricated data or provider keys in the new components.

**Still partial**: no pixel-level verification is possible here (no browser
automation), so layout claims rest on the CSS invariants above and on the scroll
suite, not on screenshots.

## 14. Scrolling and layout regressions — verified, no regression

The workspace follows the rule the earlier scroll audit established: **the
document is the only scroll owner** in normal flow. `forge-research.css` contains
exactly one vertical scroll container — the full-screen overlay
(`.fr-workspace--full`) — and `test-forge-research-workspace` pins that by
scanning the stylesheet for every `overflow-y: auto` selector. Horizontal scrolling
is confined to `.fr-tablewrap`. The resizer only changes a CSS custom property
(`--fr-nav-width`); it never sets a height.

`scripts/test-forge-scroll.mjs` still passes in full (15 tests). Two of its
assertions were updated deliberately, not relaxed: the tab count moved from 8 to 9
because a ninth section was added, and ArrowRight now lands on `research` before
`hypotheses`. The original eight section ids are still asserted individually.

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
| Project model | `test-forge-research.mjs` | 12 |
| Hypothesis lifecycle | `test-forge-research.mjs` | 10 |
| Evidence | `test-forge-research.mjs` | 10 |
| Deterministic computing | `test-forge-science.mjs` | 36 (contracts, units, propagation, descriptives, correlation, regression, t-tests, outliers, sensitivity, model comparison, screening) |
| Simulation | `test-forge-science.mjs` | 7 |
| Connectors/security | `test-forge-science-connectors.mjs` | 16 |
| Science UI | `test-forge-science-dom.mjs` | 9 |
| Assistant boundary | `test-forge-assistant.mjs` | 20 |
| Research Workspace UI | `test-forge-research-workspace.mjs` | 15 |
| Forge regression (shell, api, tabs, scroll) | `test-forge-{engine,api,ui,dom,scroll}.mjs` | 84 |

Every suite is wired into `npm run test:forge` (the assistant and workspace suites
were added to that script on this branch).

## 17. Regression across every NOVA module — tested

The full suite (682 tests) covers APOD, Earth analyst (server + UI), space videos,
space news, community, AI viewer, welcome, workspace shell, security/performance,
NOVA diagnostics, chat, and all nine Forge suites. Zero failures.

## 18. Honest account of what remains — see the table

| Item | Label |
| --- | --- |
| Live Exoplanet / JPL / OSDR queries | **partial** — adapters and injected-fetch tests exist; no live request has been made from this environment, and outbound access here is limited to the package registries |
| Live Gemini / OpenRouter assistant call | **partial** — verified against injected adapters only; no key in this environment |
| Causal inference, ML surrogates, PDE solvers | **planned** (explicitly out of scope) |
| Publication/submission workflow | **planned** — report artefacts only, no DOI minting, no preprint claims |
| Multi-user / server-side projects | **planned** — device-local storage; no auth scheme was invented |
| Browser-level pixel verification | **impossible here** — no browser automation, so no screenshot claims are made |
| Dataset snapshot refresh when a remote version changes | **planned** — drift is reported, never silently applied |
| Bayesian posterior sampling beyond the closed-form tools | **planned** |

Implemented and tested, for the avoidance of doubt: project lifecycle with autosave
and draft recovery, the thirteen hypothesis fields, the gated lifecycle, evidence
validation and links, version commit/restore without recalculation, deterministic
computing, simulation with reproducibility records, discovery separation and the
verification gate, the contextual assistant contract and gate codes, the Research
Workspace UI, and the Forge-wide scroll invariants.

Nothing above is presented to a user as finished work. The UI never shows a number
without its method, sample size and assumptions, never labels a hypothesis a
discovery, and never renders a citation the user or a connector did not supply.
