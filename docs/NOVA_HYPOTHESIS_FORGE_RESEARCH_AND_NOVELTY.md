# NOVA Hypothesis Forge — Research Context and Novelty Assessment

## 1. Method of this assessment

Three questions were asked before writing any code:

1. Does automated hypothesis generation already exist? (Yes — extensively in the LLM-for-science
   literature.)
2. Does an astronomy assistant that grounds answers in live NASA data already exist? (Yes.)
3. Is there a *public* system that combines a trilingual, in-product evidence engine with
   explicit falsification, counter-evidence and a reproducible passport for NASA/NOAA
   observations? (No example was found in the sources reviewed — which is a statement about
   this review, not about the world.)

The result is **precedent-based positioning**: the Forge is an integration and integrity
contribution, not a scientific first. Nothing in the product or its copy says "world's first",
"ground-breaking" or "proven".

## 2. Prior art reviewed

| Work | What it already does | What the Forge does differently |
|---|---|---|
| **The AI Scientist** (Sakana AI, 2024; v2 2025) — <https://sakana.ai/ai-scientist/> | End-to-end idea generation, experiments, paper writing with an LLM in the loop. | The Forge does not write papers and does not let a model produce results. It retrieves observed data and computes statistics deterministically; conclusions are rule-based and deliberately non-causal. |
| **AstroAgents** (arXiv 2503.23170, Mar 2025) | Eight-agent LLM pipeline for astronomy hypothesis generation, including a critic agent. | Precedent for "hypothesis + critic". The Forge keeps a *deterministic* counter-evidence engine (8 finding kinds generated from data properties and thresholds) rather than an LLM critic, and binds every claim to a retrieved observation. |
| **Automated hypothesis generation survey** — <https://www.emergentmind.com/topics/automated-hypothesis-generation> | Surveys RHG, BioDisco, MC-NEST, AGATHA, SciAgents and others; establishes that machine hypothesis generation is an active field. | The Forge is domain-bounded (NASA/NOAA space and Earth observations) and product-bounded (a mode in an existing assistant), optimised for auditability rather than discovery throughput. |
| **AstroAssist-AI** — <https://github.com/mridah-shivakumar/AstroAssist-AI> | AI briefings over live NASA data (APOD, NeoWs) in a conversational UI. | Closest product precedent for "live NASA data in an assistant". The Forge adds a research interpreter, planned retrieval, normalisation, statistical testing, evidence classification, counter-evidence, passport and research memory. |
| **BioDisco / RD-IA / SciAgents style pipelines** | Hypothesis generation and iterative refinement with LLM reasoning. | The Forge's novelty budget is spent on *refusal*: it refuses to run without coverage, refuses to claim proof, refuses to invent numbers, and refuses to hide contradictory evidence. |

## 3. Where the contribution actually sits

1. **Evidence-first classification.** Each `EvidenceItem` stores the literal rule that produced
   its classification (for example "p = 0.031 ≤ α = 0.05, |r| = 0.42 ≥ 0.30, sign matches the
   hypothesis"). A reader can re-derive every label without trusting the interface.
2. **Counter-evidence as a first-class engine.** Eight finding kinds — assumption, alternative
   explanation, missing variable, temporal mismatch, measurement uncertainty, selection bias,
   data gap and falsification — are generated from the retrieved data and the request, and the
   report's highest severity feeds the conclusion.
3. **Honest-failure path.** Out-of-coverage, unavailable and partial states are modelled in the
   API and rendered as such. The conclusion can be, and often is, `insufficient-evidence`.
4. **Reproducible Passport.** A JSON artefact containing the request, plan, thresholds, method
   parameters, payload hashes, official URLs, retrieval timestamps, limitations and a
   neutrality disclaimer — plus Markdown and printable HTML renderings.
5. **Trilingual scientific vocabulary.** Engine and interface copy exist in English, Sinhala and
   Tamil, with dataset/variable/unit names preserved in their published English form and
   technical terms parenthesised. Parity is enforced by tests, not by convention.
6. **In-product integration.** No second chatbot, no second provider, no second auth system:
   the mode shares the NOVA shell, design tokens and existing GIBS/NOAA integrations.

## 4. Claims the project deliberately does not make

- It does not claim to discover new astrophysics.
- It does not claim causal identification: every conclusion carries a causal caveat, and
  observational correlation is labelled as such.
- It does not claim peer review; the passport says the opposite.
- It does not claim that its hypotheses are better than a domain expert's; it claims they are
  testable, falsifiable and traceable.
- It does not claim unique precedent for any single technique. Cross-correlation, Student's t,
  odds ratios and 2×2 tables are textbook statistics.

## 5. Honest novelty statement

> The Forge's contribution is an auditable, trilingual, in-product evidence pipeline that turns
> a natural-language question into a planned NASA/NOAA retrieval, deterministic statistics,
> explicitly ruled evidence, structured counter-evidence and a reproducible passport — while
> remaining able to say "insufficient evidence" and "this dataset cannot cover that period".

That is an engineering and integrity contribution. It sits on well-established prior art in
automated hypothesis generation and in astronomy assistants, and it is presented as such.

## 6. Open research questions

- How should evidence strength aggregate across non-independent analyses without inflating
  significance?
- Can a formal pre-registration step (freeze the hypothesis and thresholds before retrieval) be
  added without slowing the reader down?
- What is a defensible way to communicate autocorrelation-adjusted p-values to non-specialists?
- How do trilingual scientific terms stay consistent as the dataset catalogue grows?

These are listed as future work in `NOVA_HYPOTHESIS_FORGE_LIMITATIONS_AND_ROADMAP.md`, not as
completed features.
