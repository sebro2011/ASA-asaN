# NOVA Hypothesis Forge — Feature Specification

Version: `forge/1` · Status: implemented and verified · Owner: NOVA AI Assistant (NASA Space Explorer)

## 1. Purpose

NOVA Hypothesis Forge is a **scientific-investigation mode inside the existing NOVA AI
Assistant**. It lets a reader take a testable research question, retrieve real NASA and NOAA
observations, compute statistics in deterministic code, search deliberately for evidence that
contradicts the working hypothesis, and export a reproducible Evidence Passport.

It is not a chatbot, not a separate app, and not a replacement for the NOVA conversation
surface. The reader switches between *Chat* and *Scientific investigation* in the NOVA header;
the conversational engine, providers and thinking ladder are unchanged.

## 2. Product principles

| Principle | Consequence in the implementation |
|---|---|
| Observations are real or absent | Every plotted point comes from a retrieved record. A failed source is labelled `unavailable`, never filled with a synthetic series. |
| Statistics are deterministic | Pearson/Spearman correlation, Student's t p-value, linear regression, cross-correlation, 2×2 table, anomaly and missing-data detection are plain TypeScript in `src/lib/forge/analysis.ts`. No language model produces a number. |
| Falsification before confirmation | Every hypothesis ships with explicit falsification criteria and alternatives; the Counter-Evidence Centre always lists at least the assumptions, gaps and confounders that apply. |
| No verdict is `proven` | `ScientificConclusion.verdict` is restricted to `insufficient-evidence`, `not-supported`, `mixed`, `weakly-supported`. |
| Reproducibility over persuasion | Thresholds, method parameters, sample sizes, provenance, payload hashes and the exact API request are inside the passport. |
| Trilingual by construction | Engine strings (`FORGE_STRINGS`) and interface copy (`hypothesisForgeCopy`) both exist in English, Sinhala and Tamil; parity is enforced by tests. |
| Keys stay server-side | The browser never sends or receives a NASA key. The server strips `api_key` from every returned URL and hash-identifies payloads. |
| Device-local memory | Investigations are stored in `localStorage` under `nova_forge_memory_v1`, capped at 12, exportable, never uploaded. |

## 3. User journey

1. Open **Chat → Scientific investigation**.
2. Type a question (or choose one of three examples) and press **Interpret question**.
3. Review the interpretation: domain, UTC window, region, variables, methods, interpretation
   confidence (this is parsing confidence, not scientific confidence), assumptions.
4. Review the plan: dataset compatibility, coverage verdict, key requirement, expected
   limitations, missing information.
5. Open **Hypothesis explorer**: read the generated hypotheses (one is explicitly null),
   accept/reject/edit, and press **Investigate this** on the one to test.
6. The engine retrieves sources and runs deterministic analyses; the UI lands on
   **Scientific analysis** with the sample size, method parameters, limitations and five
   chart types.
7. Read **Evidence laboratory** (supporting / contradicting / neutral / insufficient, each with
   the rule that produced it) and **Counter-evidence** (severity-ranked findings).
8. Export the **Evidence Passport** as JSON, Markdown or printable HTML (Save as PDF).
9. Reopen or compare runs in **Research history**.

## 4. Scope

In scope:

- research interpretation with follow-up inheritance;
- hypothesis generation for space weather, Earth environment, near-Earth objects and orbital
  context;
- planning, retrieval, normalisation, statistics, evidence, counter-evidence, conclusion and
  passport;
- eight interface sections, trilingual, dark liquid-glass;
- device-local research memory.

Out of scope (documented, not silently promised):

- causal inference or mechanism proof;
- peer review, publication, or "discovery" claims;
- arbitrary dataset upload;
- LLM-authored conclusions or statistics;
- server-side accounts or cross-device sync for investigations.

## 5. Non-goals and explicit refusals

- The engine refuses to run when no dataset can cover the requested window (for example the
  1989 Quebec storm against NOAA's rolling ~30-day Kp product). It returns a plan with
  `executable: false`, an empty series set, and an `insufficient-evidence` conclusion.
- The interface never shows a "confidence score" for a scientific claim. Interpretation
  confidence is labelled as such.
- The passport states it is generated content, not a peer-reviewed publication and not an
  official NASA/NOAA finding.

## 6. Integration contract

| Surface | Contract |
|---|---|
| Chat mode switch | `ChatSurface` keeps its provider/thinking logic and adds `mode: 'chat' \| 'forge'`; `ForgeSurface` renders inside `nova-chat-shell--forge`. |
| API | `GET /api/forge/catalogue`, `POST /api/forge/interpret`, `POST /api/forge/investigate`, mounted under `/api/forge` in `server.ts`. |
| Client | `src/lib/forge/client.ts` — typed results, 45 s abort, no automatic provider fallback. |
| Storage | `src/lib/forge/memory.ts` only; no schema migration, no Supabase change. |
| Charts | `src/ui/ChartFrame.tsx` is the only mount; numeric height, initial dimension, HTML legend, data-table alternative. |
| Copy | `src/i18n/hypothesisForge.ts` merged into `src/i18n.ts`. |

## 7. Related documents

- `NOVA_HYPOTHESIS_FORGE_ARCHITECTURE.md`
- `NOVA_HYPOTHESIS_FORGE_RESEARCH_AND_NOVELTY.md`
- `NOVA_HYPOTHESIS_FORGE_DATA_SOURCES.md`
- `NOVA_HYPOTHESIS_FORGE_SCIENTIFIC_METHOD.md`
- `NOVA_HYPOTHESIS_FORGE_UI_UX.md`
- `NOVA_HYPOTHESIS_FORGE_SECURITY_AND_PRIVACY.md`
- `NOVA_HYPOTHESIS_FORGE_TESTING_AND_VERIFICATION.md`
- `NOVA_HYPOTHESIS_FORGE_LIMITATIONS_AND_ROADMAP.md`
- `NOVA_HYPOTHESIS_FORGE_IMPLEMENTATION_REPORT.md`
