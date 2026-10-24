# Earth Intelligence Lab — 2026 challenge preparation

**Status:** preparation only. No challenge-specific feature has been built in this pass.
**Owner:** `sebro2011/ASA-asaN`, branch `arena/da1e706a-asa-asan`.
**Written:** 2026-10-24.

## The date problem comes first

The official 2026 event runs **14–15 November 2026**. Project submission opens
Saturday 14 November at 09:00 and closes Sunday 15 November at 23:59 local time
([official 2026 event page](https://www.spaceappschallenge.org/2026/)).

Today is **24 October 2026** — three weeks before the event. Your brief says:

> Do not begin developing or modifying the competition solution before the
> official hackathon start. Until then, limit work to permitted preparation,
> learning, and planning.

So this pass contains no new Earth Lab feature code. It contains the audit, the
method specification, the design and build plan, and the test plan that make the
48-hour window survivable. Sections that would require writing new analysis code
are specified to the level of function signatures and acceptance criteria, not
implemented.

Two things were changed before this brief arrived and are disclosed here rather
than buried: the blank-chart defect repair (`src/ui/ChartFrame.tsx`,
`src/components/earth/TrendDetective.tsx`) and the equivalent repair in
`src/components/MissionsAnalytics.tsx`. Both are repairs to an existing
application, not challenge features. If you would rather reset them until the
event, say so.

## Read in this order

| # | Document | Why it exists |
|---|---|---|
| 1 | [`01_AUDIT.md`](01_AUDIT.md) | What the repository actually does today, with file and line evidence, and where it fails the challenge. |
| 2 | [`02_OFFICIAL_BRIEF.md`](02_OFFICIAL_BRIEF.md) | The verified challenge text, the corrected URL, and what the brief does and does not require. |
| 3 | [`03_STATISTICAL_METHOD.md`](03_STATISTICAL_METHOD.md) | The trend engine to build: method, assumptions, minimum-data rules, worked acceptance tests. |
| 4 | [`04_DESIGN_AND_BUILD_PLAN.md`](04_DESIGN_AND_BUILD_PLAN.md) | Figma frame list, component inventory, file-level implementation phases, 14–15 November schedule. |
| 5 | [`05_TEST_PLAN.md`](05_TEST_PLAN.md) | What must be proven before submission, and how. |

## What this pass actually produced that is worth something

The audit (§`01`) and the plan (§`04`) are ordinary documents. The valuable
artifact is `03_STATISTICAL_METHOD.md`, because it contains a **calibration
study**: 5 000 seeded simulations measuring how often candidate trend tests
report a trend that is not there.

The headline result, measured not assumed: on a trend-free 30-year annual series
with AR(1) φ = 0.6, a plain Mann–Kendall test reports "significant" at α = 0.05
**30.8 % of the time**. Two better-known corrections — TFPW and circular block
bootstrap — performed *worse* (36.3 % at φ = 0.6, and ~19 % even at φ = 0).
The method specified for the event is the one that survived: Hamed–Rao with
negative lags zeroed at a calibrated α = 0.01, giving 0.2 % / 0.5 % / 4.2 % / 7.7 %
false positives at φ = 0 / 0.3 / 0.6 / 0.8.

Reproduce with `node scripts/research/trend-method-calibration.mjs` (no
dependencies; exits non-zero if the shipped configuration drifts out of
calibration).

This matters beyond the hackathon: an uncorrected MK test is the obvious thing to
implement, it looks entirely credible in a demo, and it would have printed a
signal that is wrong three times in ten. The same study also shows that a formal
"these two locations differ" test is wrong 23.5 % of the time at φ = 0.6, so the
plan deliberately refuses to print a difference p-value and uses a conservative
CI-overlap screen instead.

## One-paragraph summary of the audit

The Lab already retrieves real NASA POWER monthly data through a validated,
cached, rate-limited server route, renders it through a chart path that was
repaired this session, exposes provenance and limitations, and ships a
deterministic non-AI analyst. It is a credible **descriptive** climate browser.
It is not yet a **trend detective**, because the only statistic computed is an
ordinary least-squares slope over annual means (`src/lib/earth/power.ts:158`),
with no p-value, no confidence interval, no seasonality-aware test, no
autocorrelation correction and no cross-location comparison. The product's own
limitations text says so: *"no statistical significance test, seasonal
decomposition or attribution has been applied"* (`src/lib/earth/analysis.ts:100`).
The challenge's central question — *is this change significant?* — is currently
unanswerable by the app. That is the gap to close during the event.

## What is blocked, and by what

| Blocked item | Blocker | Consequence |
|---|---|---|
| Figma design file | No Figma credentials in this environment | Frames are specified as measurements, tokens and states in `04`; they must be drawn in the file on day 1. |
| Official challenge *Resources* tab | Site says *"Resources coming soon."* | The sanctioned dataset list may change the variable catalogue. Re-check on 14 November before locking scope. |
| Live POWER / GIBS calls | Sandbox has no route to `power.larc.nasa.gov` or `gibs.earthdata.nasa.gov` | All verification here uses validated fixtures shaped like real responses. Live retrieval is a day-1 event task. |
| Browser QA | No browser binary in the sandbox | Rendering verified through jsdom harnesses only; real-browser console/network checks remain outstanding. |

## The 2026 rules question you should answer before 14 November

Space Apps expects the project to be produced during the event and asks teams to
disclose pre-existing material. This repository predates the event. The plan in
`04` therefore treats the existing app as **prior work to be disclosed**, and
schedules the challenge-specific analysis, comparison, findings and interface
work inside the event window. Confirm the disclosure wording against the current
rules page when registration is finalised.
