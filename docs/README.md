# Documentation index

Start here. Every document below is current unless it says otherwise; the two
older phase reports are kept for provenance and are marked at the top of the file.

## Start with these

| Document | What it answers |
| --- | --- |
| [`../README.md`](../README.md) | What the app is, how to run it |
| [`audits/MASTER_AUDIT_REPORT.md`](audits/MASTER_AUDIT_REPORT.md) | What is broken, what was fixed, what still needs a decision |
| [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) | What does not work, stated plainly |
| [`TEST_RESULTS.md`](TEST_RESULTS.md) | What was actually run, and what it proves |
| [`API_STATUS_REPORT.md`](API_STATUS_REPORT.md) | Every route: source, cache, failure mode, live status |
| [`DEVELOPMENT_CHANGELOG.md`](DEVELOPMENT_CHANGELOG.md) | Dated changes with their verification |

## Architecture and operations

| Document | Contents |
| --- | --- |
| [`TECHNICAL_ARCHITECTURE.md`](TECHNICAL_ARCHITECTURE.md) | System architecture |
| [`NOVA_INSTALLATION_GUIDE.md`](NOVA_INSTALLATION_GUIDE.md) | Environment setup, variable **names** only |
| [`NOVA_LOCAL_RUNTIME_GUIDE.md`](NOVA_LOCAL_RUNTIME_GUIDE.md) | Running the local engine |
| [`BRAND_ASSETS.md`](BRAND_ASSETS.md) | Icons, social preview, asset pipeline |
| [`audits/COSMORA_GUARDIAN.md`](audits/COSMORA_GUARDIAN.md) | Guardian: storage, breakers, rate limits, monitoring |
| [`audits/COSMORA_GUARDIAN_TEST_RESULTS.md`](audits/COSMORA_GUARDIAN_TEST_RESULTS.md) | Guardian verification |

## NOVA

- [`NOVA_NEXUS_ARCHITECTURE.md`](NOVA_NEXUS_ARCHITECTURE.md) — engine, provider fabric, routing
- [`NOVA_API_REFERENCE.md`](NOVA_API_REFERENCE.md) — endpoints and request shapes
- [`NOVA_SECURITY_MODEL.md`](NOVA_SECURITY_MODEL.md) — keys, prompt handling, what is server-side
- [`NOVA_EVALUATION_FRAMEWORK.md`](NOVA_EVALUATION_FRAMEWORK.md) — how answers are judged
- [`NOVA_WORKSPACE_V5.md`](NOVA_WORKSPACE_V5.md) — workspace surfaces
- [`NOVA_MEMORY_SYSTEM.md`](NOVA_MEMORY_SYSTEM.md), [`NOVA_SKILL_EVOLUTION.md`](NOVA_SKILL_EVOLUTION.md), [`NOVA_RESEARCH_AND_NOVELTY.md`](NOVA_RESEARCH_AND_NOVELTY.md), [`NOVA_LIFE_TECHNICAL_SPEC.md`](NOVA_LIFE_TECHNICAL_SPEC.md)
- [`NOVA_DEVELOPMENT_REPORT.md`](NOVA_DEVELOPMENT_REPORT.md), [`NOVA_OPENROUTER.md`](NOVA_OPENROUTER.md)
- [`nova/AI_PROVIDER_DIAGNOSTICS.md`](nova/AI_PROVIDER_DIAGNOSTICS.md) — what `/api/nova/diagnostics` reports and what each `code` means
- [`nova/GEMINI_ACCESS_RUNBOOK.md`](nova/GEMINI_ACCESS_RUNBOOK.md) — **Sinhala**: the console steps for Gemini access (env pin, redeploy, probe, rollback)

### Hypothesis Forge (a NOVA sub-system, 10 documents)

Start at the specification, then follow the track you need:

| Document | Contents |
| --- | --- |
| [`NOVA_HYPOTHESIS_FORGE_SPECIFICATION.md`](NOVA_HYPOTHESIS_FORGE_SPECIFICATION.md) | Scope and contract |
| [`NOVA_HYPOTHESIS_FORGE_ARCHITECTURE.md`](NOVA_HYPOTHESIS_FORGE_ARCHITECTURE.md) | How it is built |
| [`NOVA_HYPOTHESIS_FORGE_DATA_SOURCES.md`](NOVA_HYPOTHESIS_FORGE_DATA_SOURCES.md) | Where evidence comes from |
| [`NOVA_HYPOTHESIS_FORGE_SCIENTIFIC_METHOD.md`](NOVA_HYPOTHESIS_FORGE_SCIENTIFIC_METHOD.md) | Method and its limits |
| [`NOVA_HYPOTHESIS_FORGE_RESEARCH_AND_NOVELTY.md`](NOVA_HYPOTHESIS_FORGE_RESEARCH_AND_NOVELTY.md) | Positioning |
| [`NOVA_HYPOTHESIS_FORGE_EVALUATION.md`](NOVA_EVALUATION_FRAMEWORK.md) | Evaluation |
| [`NOVA_HYPOTHESIS_FORGE_SECURITY_AND_PRIVACY.md`](NOVA_HYPOTHESIS_FORGE_SECURITY_AND_PRIVACY.md) | Security model |
| [`NOVA_HYPOTHESIS_FORGE_UI_UX.md`](NOVA_HYPOTHESIS_FORGE_UI_UX.md) | Surface design |
| [`NOVA_HYPOTHESIS_FORGE_TESTING_AND_VERIFICATION.md`](NOVA_HYPOTHESIS_FORGE_TESTING_AND_VERIFICATION.md) | Tests |
| [`NOVA_HYPOTHESIS_FORGE_IMPLEMENTATION_REPORT.md`](NOVA_HYPOTHESIS_FORGE_IMPLEMENTATION_REPORT.md) | What was built |
| [`NOVA_HYPOTHESIS_FORGE_LIMITATIONS_AND_ROADMAP.md`](NOVA_HYPOTHESIS_FORGE_LIMITATIONS_AND_ROADMAP.md) | Limits and next steps |

## Earth and science

- [`EARTH_INTELLIGENCE_LAB_UPGRADE.md`](EARTH_INTELLIGENCE_LAB_UPGRADE.md) — POWER pipeline, trends, methodology notes
- Earth Intelligence Lab package: [`earth-lab/README.md`](earth-lab/README.md) —
  [overview](earth-lab/00_OVERVIEW.md), [audit](earth-lab/01_AUDIT.md),
  [official brief](earth-lab/02_OFFICIAL_BRIEF.md),
  [statistical method](earth-lab/03_STATISTICAL_METHOD.md),
  [design and build plan](earth-lab/04_DESIGN_AND_BUILD_PLAN.md),
  [test plan](earth-lab/05_TEST_PLAN.md)
- [`UX_SIMPLIFICATION_AUDIT.md`](UX_SIMPLIFICATION_AUDIT.md) — the earlier UX pass
- [`nova/`](nova/) — the earlier NOVA phase-1 audit and design notes

## Features and recovery

- [`space-shorts.md`](space-shorts.md) — CosmoVision (`/cosmovision`; the pre-rename `/space-shorts` alias redirects here), including the cinematic player's controls and the two capabilities it does not offer
- Recovery notes, written during incident work and kept because they still
  describe how to diagnose a deployment:
  [`VERCEL_PRODUCTION_DIAGNOSTICS.md`](recovery/VERCEL_PRODUCTION_DIAGNOSTICS.md),
  [`BROWSER_TEST_CHECKLIST.md`](recovery/BROWSER_TEST_CHECKLIST.md) (a checklist —
  nothing in it has been executed here),
  [`DONKI_PLAN.md`](recovery/DONKI_PLAN.md),
  [`PLANETARY_DEFENSE_PLAN.md`](recovery/PLANETARY_DEFENSE_PLAN.md)

## Provenance only — not current guidance

These describe the tree as it was and were moved here from the repository root
(audit **m6**). Each carries a "Moved" notice:

- [`audits/PHASE1_AUDIT_REPORT.md`](audits/PHASE1_AUDIT_REPORT.md)
- [`audits/PHASE7_VALIDATION_REPORT.md`](audits/PHASE7_VALIDATION_REPORT.md)
- [`PHASE7_FINAL_REPORT.md`](PHASE7_FINAL_REPORT.md)
