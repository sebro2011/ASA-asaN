# NOVA Hypothesis Forge — Interface and Experience

## 1. Entry point

The Forge is a **mode**, not a destination:

```
NOVA Chat header
└── [ Chat ] ── [ Scientific investigation ]   ← new chip, aria-label explains the switch
```

Choosing the second chip renders `ForgeSurface` inside the existing chat shell
(`nova-chat-shell--forge`). A back control returns to the conversation. The conversation rail,
provider selector, thinking ladder and composer are untouched and still present in chat mode.

## 2. Eight sections

| Tab | Key content |
|---|---|
| Investigation workspace | Question box, three examples, interpret/run controls, interpreted request, plan, follow-up input, conclusion summary, source status list. |
| Hypothesis explorer | Hypothesis cards with id, status, statement, explanation, variables, expected relationship, required observations, falsification criteria, alternatives; accept / reject / edit / investigate. |
| Data explorer | Plan table (dataset, organisation, coverage, units, docs) with expected limitations; expandable full catalogue. |
| Evidence laboratory | Classification filters, evidence cards with rule, measurements, units, retrieval time, observation period, official URL, limitations. |
| Scientific analysis | Analysis cards (method, sample size, results grid, assumptions, limitations, parameters) plus six visualisations and GIBS imagery. |
| Counter-evidence | Severity summary and severity-ranked findings with kind chips. |
| Evidence passport | Investigation id, timestamp, verdict, question, window, region, contributing sources, counts, disclaimer; JSON / Markdown / print buttons. |
| Research history | Device-local runs, two-way compare, open, delete, export, clear. |

## 3. Visual language

- Dark NASA Liquid Glass: `--color-void`, `--color-abyss`, layered surfaces, 1 px translucent
  borders, inner highlight, soft shadow.
- Hero panel uses a radial atmosphere glow and a masked dot grid; no external imagery is
  required.
- Evidence classification colours: supporting `--color-signal`, contradicting
  `--color-critical`, neutral `--color-ink-4`, insufficient `--color-caution`.
- Typography uses the project fonts: Inter for interface, JetBrains Mono for ids, timestamps,
  measured values and code blocks.
- Existing tokens only — no new palette, no new font, no external CDN.

## 4. Charts

All charts mount through `src/ui/ChartFrame.tsx` (numeric height, `initialDimension`, HTML legend
outside the plot, data-table alternative, footnote). Six components cover seven observation
views:

1. **Time series** — dual-axis line chart of retrieved series, selectable variables, brush above
   80 points, gaps preserved (no interpolation).
2. **Relationship scatter** — driver vs response pairs exactly as aligned for the correlation.
3. **Lag profile** — cross-correlation coefficient against lag, with zero references.
4. **Evidence distribution** — bar chart of hypothesis-linked classifications.
5. **Data quality** — bar chart of per-series coverage with present/total/expected table.
6. **Hypothesis graph** — deterministic node-link diagram: independent variables → hypotheses →
   required observations.
7. **GIBS imagery** — satellite layer for Earth-domain investigations with attribution.

Charts render only when real data exists; otherwise a localised empty state is shown. The
`ChartFrame` table makes every plotted number readable without colour or hover.

## 5. Trilingual behaviour

- Every `hf*` key exists in English, Sinhala and Tamil; parity, non-empty values and placeholder
  equality are enforced by `scripts/test-forge-ui.mjs`.
- Dataset names, variable ids, units and API identifiers stay in their published English form;
  the interface says so (`hfTechnicalTermsNote`).
- Technical terms are parenthesised in Sinhala and Tamil rather than transliterated blindly.
- No prose key may silently fall back to English; a test compares prose keys across languages.
- A jsdom test renders the surface in Sinhala and Tamil and asserts the honesty note is
  translated, not the English string.

## 6. Accessibility

- Tabs use `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls` and a labelled
  `role="tabpanel"`.
- Focus-visible outlines on buttons, inputs, filters, toggles and checkboxes.
- Charts have `figure` semantics, an accessible SVG label for the graph, and table alternatives.
- Evidence and counter-evidence use definition lists; status is conveyed by text, not colour
  alone.
- Motion respects `prefers-reduced-motion`.
- Responsive layout: two-column grids collapse under 320 px, the follow-up composer stacks, the
  mode chip hides its label under 720 px while retaining the aria-label.

## 7. Empty, error and loading states

| State | Presentation |
|---|---|
| No interpretation yet | "Interpret a question to begin", engine note, examples. |
| Interpretation failed | Localised error by code (`INVALID_REQUEST`, `RATE_LIMITED`, `TIMEOUT`, `NETWORK`, …). |
| Running | Spinner on the run control, label "Retrieving data and computing…". |
| No hypothesis-linked evidence | Localised empty state; classifications are never fabricated. |
| Source unavailable | Red status chip in the source list with its detail and error code. |
| Passport without investigation | Instruction to run an investigation first. |
| History empty | Explanation that nothing is stored on the server. |
| Storage blocked | Notice "not saved" instead of pretending persistence. |

## 8. Copy rules

- Never say "proven", "guaranteed", "world's first" or "peer-reviewed" (tests enforce this).
- Distinguish generated content from observations on every relevant screen.
- Say "insufficient evidence" in words, not only with colour.
- State that memory is device-local.
- Name the engine's determinism in the footer and the workspace hint.
