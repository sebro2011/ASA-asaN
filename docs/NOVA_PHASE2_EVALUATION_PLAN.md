# NOVA Phase 2 — Evaluation and data readiness

**Status (2026-11-24): preparation authorized; model selection, downloads, and training are blocked.** This document records a safe Phase 2 starting scope. It does not select a model, download weights, start a server, or train anything.

## Guardrails

- Continue to use the Phase 1 explicit-Local boundary: application requests go only to a configured loopback runtime; no Arena, OpenRouter, or Gemini fallback.
- For this preparation phase, do not select or download any model and do not start training. Model work remains blocked until the evaluation framework and source-rights review are complete and the user separately authorizes a next step; hardware inventory alone is not approval.
- Do not start 7B training or provision cloud resources.
- Do not call an externally served model an independently trained NOVA model.
- Do not use private workspace transcripts as training or evaluation data by default.

## Repository readiness audit

The audit was read-only and covered the tracked repository contents:

- No tracked LLM weights or model checkpoints (`.gguf`, `.safetensors`, `.pt`, `.pth`, `.ckpt`, `.onnx`, `.tflite`, or `.h5`) and no NOVA instruction-tuning corpus were found. `public/models/` contains 3D assets, not language-model weights.
- The root `package.json` declares `UNLICENSED`, and there is no root `LICENSE` file. Repository source must not be repackaged into a model dataset without the owner's authorization and a rights review.
- `COSMORA_AI_v3/` is a separate climate-prediction research harness, not a NOVA model. Its three small NASA POWER cache payloads cover Colombo, Kandy, and Jaffna (2000–2024) and are time-series climate data, not an instruction corpus or pretrained weights. `COSMORA_AI_v3/data/cache/README.md` says they were hand-transcribed and that the loader rejects the legacy payloads by default unless explicitly allowed for exploratory reproduction. They are not proposed for NOVA language-model training.
- The existing L.I.F.E. benchmark suite evaluates deterministic language detection, memory/security behavior, and similar engine mechanics. `docs/NOVA_EVALUATION_FRAMEWORK.md` explicitly notes that it does not measure LLM answer quality. A local-model quality evaluation is therefore a real gap, not a result already established by those benchmarks.
- The actual target-PC preflight report has now been supplied (Windows 10, 4 logical CPU cores, 7.97 GiB RAM, GTX 960 with 2 GiB VRAM, 274.7 GiB free on the reported volume). The snapshot is recorded in §2A below. Model size, quantization, and training feasibility are still undecided; the user has explicitly asked not to select a model yet.

## Proposed Phase 2 work packages

### 2A. Hardware preflight — evidence received; model choice deferred

Target-PC report supplied at `2026-11-24T14:35:21.009470+00:00`:

| Item | Reported value |
| --- | --- |
| OS / architecture | Windows 10 / AMD64 |
| Python | 3.14.7 |
| CPU | Intel64 Family 6 Model 58 Stepping 9, GenuineIntel; 4 logical cores |
| System memory | 8,552,914,944 bytes total (7.97 GiB); 2,895,122,432 bytes available (2.70 GiB) |
| GPU | NVIDIA GeForce GTX 960; 2,147,483,648 bytes total VRAM (2.00 GiB), 1,746,927,616 bytes free (1.63 GiB) at collection |
| NVIDIA driver | 582.66 |
| Storage | 294,955,606,016 bytes free (274.7 GiB) on the reported working volume |
| Accelerator probe | `nvidia-smi` detected the NVIDIA device; PyTorch is not installed |
| Safety flags | `networkAccess: false`, `modelSelected: false`, `trainingStarted: false` |

This is the target-PC evidence, not the Arena sandbox inventory. Free RAM/VRAM are a time-of-check snapshot and will vary. The report is sufficient to establish the machine's inventory, but **no model, model size, or quantization is selected here**, per the user's instruction. No download or training is authorized by this inventory.

### 2B. Evaluation cases and provenance — draft ready; rights review open

The model-independent case catalogue is `scripts/fixtures/nova-eval-cases.v1.json` (10 shared case families × 3 localized prompts = 30 prompt instances). It covers NASA APOD and planetary-science context, black holes and gravitational waves, Artemis/Mars evidence limits, general scientific method, multilingual follow-up handling, and resistance to unsupported NASA attributions. Expected points and prohibited claims are written as review criteria, not model answers.

The catalogue is deliberately marked `DRAFT_SOURCE_REVIEW_REQUIRED`. Several NASA/ESA URLs are locators found in this repository, but the pages and their usage terms were not fetched or reviewed here. **Do not score factual claims for a case whose source review is pending.** The fixture contains no NASA/ESA source passages, images, captions, or audio. Prompts and rubrics are original evaluation material; no chat transcripts are used. Internal repository locators are anchored to tracked snapshot `1b7f6784f3352f2602216fd438af3594f60bd4cc`, so local uncommitted runtime edits are not treated as evidence. Because the root package is `UNLICENSED` and there is no root license file, the draft is for internal evaluation design only: it grants no redistribution or training/fine-tuning rights. Linked source terms remain to be checked; citation is not a license.

#### Metrics (predeclared; no results or thresholds yet)

Annotate each answer into independently checkable factual claim atoms against reviewed references. Assign exactly one label per atom: `supported` (the reviewed source supports it), `contradicted` (the source conflicts with it), `unsupported` (the reviewed evidence does not support it), or `unverifiable` (the relevant source is missing, inaccessible, or ambiguous). Report atom counts by label. Report all metrics by language, topic, and case, with denominators and missingness:

| Metric | Measurement |
| --- | --- |
| Factual accuracy | Supported factual claim atoms ÷ (supported + contradicted + unsupported factual claim atoms); exclude and separately count unverifiable claims |
| Required-fact coverage | Supported required rubric points ÷ all source-reviewed required points; score each point as met/not met |
| Hallucination rate | (Unsupported + contradicted claim atoms) ÷ the same assessable factual-claim denominator; also report the share of cases with at least one such claim |
| Multilingual quality | Target-language adherence pass rate (substantive answer is in the prompt language, allowing proper names and technical terms), plus fluent-human 1–5 ratings for grammar, idiomaticity, technical-term fidelity, and coherence; report each language and cross-language coverage spread |
| Response consistency | For five identical-input repeat runs per case at fixed settings, mean pairwise Jaccard similarity of adjudicated, normalized supported core-claim sets across the 10 run pairs, plus the fraction of pairs with a contradiction |

For the four language-quality ratings, use the same anchors: 1 = largely unintelligible or materially wrong; 2 = frequent serious errors; 3 = understandable but noticeably awkward or imprecise; 4 = fluent with minor issues; 5 = natural, clear, and technically faithful. For Jaccard similarity, both empty claim sets score 1 and exactly one empty set scores 0; report contradiction-pair rate separately. A zero denominator is `NA`, never zero; always report the relevant count and denominator. Do not turn these dimensions into one unqualified “accuracy” score or set pass thresholds after seeing outputs. Factual measures remain unavailable until reference and rights review is complete.

#### Reproducible procedure (blocked until source and rights review; future execution also needs separate authorization)

1. **Source and language gate:** for each reference, record its exact URL/identifier, title/version or date, checked-at UTC time, terms/rights status, permitted use, and which rubric points it supports. Confirm that the independently authored English, Sinhala, and Tamil prompts are semantically parallel with fluent reviewers. Add a source-to-rubric mapping and freeze the reviewed answer key. If a source is inaccessible, ambiguous, or lacks approved use, mark affected points/cases `unscorable`; do not substitute an unchecked source. Do not copy linked text, images, captions, or media into this dataset.
2. **Freeze the evaluation specification:** freeze the reviewed fixture and its SHA-256, rubric, translations, source map, and test/protocol version before any run. Record a manifest with fixture hash, evaluator/protocol version, timestamp, prompt serialization and system-instruction hash, Local endpoint/runtime version, model identifier only if a later user-authorized run occurs, context/token limits, decoding settings (temperature, top-p, seed where supported), timeout, retrieval state, and hardware snapshot. Keep settings fixed across the compared cases and log unsupported settings as unavailable.
3. **Run only if separately authorized:** use the explicit loopback Local path only, no hosted fallback, private transcripts, automatic model/weight download, or cloud compute. Preserve the full conversation turns for multi-turn cases; send each case in its selected language. Run each case five times under fixed settings, permuting case order with a recorded seed. Record per-run timestamps, order, cold/warm status, errors, and outputs in a restricted local results file; do not publish raw outputs without a separate rights/privacy review.
4. **Score and report:** two fluent human reviewers independently score every language using the same point-level rubric, annotate claim atoms and `mustAvoid` violations, and rate language quality. Record exact agreement and disagreements; adjudicate disagreements with a documented reason (a model must not be the sole judge). Report per-language/topic/case numerators, denominators, `NA` values, excluded cases, and critical errors without a composite score. No evaluation run has been performed.

The dependency-free fixture test is `node --test scripts/test-nova-eval-cases.mjs`; it checks locale coverage, source references, rights flags, required scoring fields, and that the cases remain model-independent. Compute a post-review freeze hash with `sha256sum scripts/fixtures/nova-eval-cases.v1.json`. This draft is preparation only; model selection, download, and training remain prohibited by the current instruction.

### 2C. Future inference-only measurement — not authorized in this preparation

Do not run a model evaluation as part of this preparation. Only after the user separately authorizes it and the evaluation framework and source-rights review are complete may an operator use a model already installed or separately approved, through the existing loopback Local path. The protocol in §2B requires recording runtime/model identifiers and versions, quantization if known, fixed request settings, hardware snapshot, timestamps, and cold/warm status. A later performance study may measure latency, response length, process memory, and accelerator use where the host reports it; it must not route Local requests to a hosted provider. No model size, hardware threshold, or performance acceptance criterion is set here.

### 2D. Training decision — not started

First compare inference-only use and retrieval over appropriately licensed, local reference material. Consider fine-tuning only if a documented gap remains and the data rights, consent, provenance, evaluation, storage, and compute budget have been reviewed. Any training run or new compute spend requires a separate explicit approval and a target-PC feasibility review. No 7B run is planned by this Phase 2 preparation.

## Current next action

The draft cases, metrics, validation test, and run/scoring protocol are prepared. The remaining 2B gate is source-by-source primary-reference and licensing review, mapping each scoring criterion to reviewed evidence, and fluent-reviewer confirmation that the English, Sinhala, and Tamil prompts are semantically parallel. Until those are recorded and the user separately authorizes an evaluation run, do not score factual claims, select or download a model, or train anything.
