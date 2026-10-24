# Earth Intelligence Lab — preparation package

For the 2026 NASA Space Apps Challenge, *Be An Earth System Trend Detective!*
Event: **14–15 November 2026**.

This package exists because the event gives roughly 20 productive hours and the
statistics cannot be improvised inside them.

| Document | Read it for |
|---|---|
| [`00_OVERVIEW.md`](00_OVERVIEW.md) | Why nothing was built yet, and what was produced instead |
| [`01_AUDIT.md`](01_AUDIT.md) | What the repository does today, with file:line evidence, and the defect register D0–D11 |
| [`02_OFFICIAL_BRIEF.md`](02_OFFICIAL_BRIEF.md) | The verified challenge text, the corrected URL, and the event rules |
| [`03_STATISTICAL_METHOD.md`](03_STATISTICAL_METHOD.md) | The trend engine: method, calibrated thresholds, refusal rules, 13 acceptance tests |
| [`04_DESIGN_AND_BUILD_PLAN.md`](04_DESIGN_AND_BUILD_PLAN.md) | Figma frames, component inventory, module signatures, hour-by-hour schedule |
| [`05_TEST_PLAN.md`](05_TEST_PLAN.md) | What must be proven before submission |

## The one number to remember

On a trend-free 30-year annual series with AR(1) φ = 0.6, a plain Mann–Kendall
test calls the series "significant" **30.8 % of the time** at α = 0.05.

Reproduce:

```bash
node scripts/research/trend-method-calibration.mjs
```

The script has no dependencies, uses a seeded RNG, and **exits non-zero** if the
recommended configuration's false-positive rate drifts outside 1–6 % at φ = 0.6,
or if any variance ratio falls below 1. It is the reason the recommended method
is Hamed–Rao at α = 0.01 and not the textbook default.

## Status

- No challenge feature has been implemented. Implementation starts 14 November.
- The blank-chart defect (D0) and its twin in mission analytics (D0b) were fixed
  and verified before this brief arrived; both are disclosed in `00_OVERVIEW.md`.
- Blocked here and outstanding for the event: Figma authoring, live NASA
  retrieval, real-browser QA, and the official *Resources* tab (currently
  "coming soon").
