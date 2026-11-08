# NOVA Hypothesis Forge — Limitations and Roadmap

## 1. Deliberate limitations

These are design decisions, not bugs. They are communicated in the interface and the passport.

1. **No causal inference.** The engine tests association, threshold response, lag and trend. It
   cannot identify a mechanism, and every conclusion carries a causal caveat.
2. **No LLM in the scientific path.** Interpretation, hypotheses, statistics, evidence and
   conclusions are deterministic code. This improves auditability and removes hallucinated
   numbers, but it also means the interpreter understands a bounded vocabulary rather than open
   prose.
3. **A source's coverage is a hard limit.** NOAA's Kp product is a rolling window; NASA POWER is
   monthly from 1981; NeoWs is a short rolling feed. The planner refuses incompatible windows
   instead of substituting a different dataset silently.
4. **Fixed alignment tolerance.** Paired analyses align within 90 minutes, chosen for the
   3-hour Kp cadence. A dataset with a coarser cadence needs its own tolerance.
5. **No multiple-comparison correction.** The plan pre-declares a small number of analyses, but
   p-values are unadjusted and the limitation is stated.
6. **Autocorrelation is disclosed, not corrected.** Geophysical series are serially correlated;
   a formal correction (for example effective sample size or block bootstrap) is future work.
7. **Device-local memory only.** Research history is not synced, not shared and not searchable
   across devices. No schema was added to Supabase, because a migration could not be verified
   against the live project from this workspace.
8. **No PDF library.** The passport is rendered as printable, self-contained HTML and the
   browser produces the PDF ("Save as PDF"). JSON and Markdown are generated directly.
9. **Catalogue depth.** Eleven variables across nine datasets; adding variables requires
   vocabulary, normaliser, planner and evidence work, so it is intentionally conservative.
10. **In-memory rate limiting.** Suitable for the current single-process server; a horizontal
    deployment needs a shared counter.
11. **No live-network verification here.** The sandbox blocks NASA/NOAA; connectors are tested
    against fixtures shaped like the published responses and against failure paths.
12. **No automated visual regression.** Charts are verified structurally (frame, surfaces,
    tables, empty states), not pixel by pixel.

## 2. Known defects and constraints discovered during implementation

| Issue | Resolution |
|---|---|
| NOAA SWPC timestamps use `YYYY-MM-DD HH:MM:SS.mmm`, not ISO `T…Z` | Normalisers accept both; fixtures regenerated in the source format, which restored the retrieval tests. |
| POWER fill sentinels (`-999`) were dropping months | The normaliser keeps the observation with `value: null`, so the grid is complete and missingness is reported. |
| Cross-correlation with a negative best lag implied the response leads the driver | Reclassified from `supporting` to `contradicting` and the falsification criterion is appended to the rule. |
| Module-global cache and rate-limit buckets leaked between tests | Both are now per-router/dependency instances. |
| `nasa-gibs` appeared as a plannable dataset | Removed from domain dataset lists; imagery is attached by `buildImagery`. |
| Bare year tokens in named-event vocabulary hijacked "March 2024" | Years removed from event names; explicit-month parsing wins. |
| Tamil key contained a transliteration artefact | Corrected; a test now rejects script-glued-to-Latin sequences. |
| CSS imported from a component broke the Node/jsdom test import | Moved to `src/styles/hypothesis-forge.css`, imported from `src/index.css`, matching project convention. |

## 3. Roadmap (not implemented)

Ordered by scientific value, not by novelty:

1. **Pre-registration.** Freeze the hypothesis, thresholds and window before retrieval; store the
   frozen record in the passport.
2. **Autocorrelation-aware inference.** Effective sample size or block bootstrap, disclosed in
   the method parameters.
3. **Multiple-comparison control.** Holm–Bonferroni across the planned analyses, reported
   alongside unadjusted p.
4. **Causal designs where the data allow.** Difference-in-differences around a known event, with
   explicit control windows.
5. **Server-side memory with consent.** Cross-device history behind the existing auth, with
   deletion and export.
6. **Generated PDF artefact.** A server-side renderer producing a signed, stable PDF (no
   external paid service).
7. **More variables and sources.** Solar cycle index, geomagnetic Ap/Dst, ionospheric TEC,
   earthquake catalogues, sea-ice extent — each with coverage metadata and a normaliser.
8. **Language expansion.** Hindi, Arabic and French, with the same parity test.
9. **Accessibility audit.** Automated axe checks plus a screen-reader pass.
10. **Live-contract tests in CI.** Optional, key-gated smoke calls against NASA/NOAA with strict
    budget and never in the deterministic suite.

## 4. Maintenance notes

- Any new dataset must appear in `DATASETS`, the connector map, the normaliser switch, the plan
  compatibility rules and the tests.
- Any new interface key must be added to all three languages in `src/i18n/hypothesisForge.ts`.
- Any change to a threshold must update `evidence.ts`, the passport threshold block and the
  method document.
- Keep `nasa-gibs` out of the plan; attach imagery instead.
- Never add a bare year to `NAMED_EVENTS.names`.
