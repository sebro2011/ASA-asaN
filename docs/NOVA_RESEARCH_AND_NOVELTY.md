# NOVA research notes and novelty

What this system takes from existing work, what it does differently in
combination, and what it does **not** claim.

> No "world's first" claim is made anywhere in this document or in the product.
> The mechanisms below have well-known antecedents; the contribution here is a
> specific, working composition with unusually strict evidence and approval rules
> for a single-machine app.

---

## 1. Prior art this builds on

| Line of work | What NEXUS uses | What it does not use |
| --- | --- | --- |
| **Reflexion** (Shinn et al., 2023) — verbal self-reflection stored between attempts | the idea that a failed run produces a written lesson that later runs can read (`experiences.lessons`) | no gradient updates, no self-generated reward model |
| **Voyager** (Wang et al., 2023) — growing skill library, automatic curriculum | skills as explicit, versioned artefacts with dependencies | no automatic curriculum, no unsupervised skill invention |
| **Generative Agents** (Park et al., 2023) — memory stream with recency/importance/relevance retrieval | weighted retrieval (recency, confidence, pinned, keyword, vector) | no emergent social simulation, no LLM-written "reflections" stored as truth |
| **MemGPT** (Packer et al., 2023) — tiered memory with explicit paging | the working/episodic/semantic split with retention windows | no model-controlled paging policy |
| **ReAct / Toolformer / ToolLLM** — tool use driven by a model | a closed tool registry with schemas and per-tool permissions | the plan is regex code, not a model's tool-call proposal, for anything security-relevant |
| **BM25 / FTS5** (Robertson & Zaragoza, 2009) | keyword scoring via SQLite FTS5 `bm25`, token fallback | no learned dense retriever |
| **Capability-based security** (Dennis & Van Horn, 1966) | unforgeable, explicit capabilities with per-use approval | no full object-capability runtime |
| **Local-first software** (Kleppmann et al., 2019) | local database as the source of truth, cloud optional | no CRDT sync protocol |
| **CI/CD approval gates** | a version can only become active after a recorded human decision | no auto-merge analogue |
| **SWE-bench-style evaluation** (Jimenez et al., 2023) | fixed cases with machine-checkable expectations | no SWE task suite |

Sandboxing reference: real isolation means a kernel boundary (gVisor,
Firecracker, container + seccomp). A temporary directory is not that, which is
why `simulation.js` calls itself a dry-run workspace and the docs repeat it.

## 2. Specific choices worth naming

1. **Evidence-gated outcomes.** An experience's outcome is derived from the
   verification record, not from the task's own report
   (`experiences.outcomeFrom`). A model's text is evidence of kind `model` and
   cannot produce `verified` alone. This is a design rule, not an emergent
   property, and it is visible in the schema (both tables) and the tests.
2. **Approval is a row, not a prompt.** `security.decide()` is the only writer of
   `user_approvals`; providers have no reference to it. "An LLM cannot approve
   its own claim" is therefore an architectural fact rather than an instruction
   in a system prompt.
3. **Deterministic planning for risky intents.** Intent detection and tool
   selection are regex + allowlist. A model may explain a plan; it does not get
   to choose which shell command runs.
4. **Editing an active skill forks a draft.** `updateDraft` on an `active` skill
   writes a new version instead of mutating the live one. Combined with
   approval-per-version, this closes a common gap in agent skill libraries.
5. **Honest language coverage.** Cross-language retrieval is an 18-concept
   glossary bridge, measured per language, advertised as exactly that. It is not
   presented as multilingual semantic understanding.
6. **Numbers with provenance.** Every figure in the UI comes from an endpoint;
   benchmarks seed their own data and delete it. The alternative — a dashboard of
   plausible-looking activity — was explicitly rejected.

## 3. What is genuinely new here (careful version)

Within the scope of this repository, the following combination was not present
before this branch:

- one local SQLite schema that holds memory, tasks, proofs, experiences, skills,
  approvals, permissions and benchmark runs under a single versioned migration,
  mirrored to Supabase with RLS;
- a skill lifecycle whose promotion requires a verification pass **and** a
  recorded approval of the specific version, with per-version permission
  declarations checked against a closed registry;
- replay eligibility derived strictly from independently checkable evidence;
- a UI that renders engine error codes verbatim and has no sample data path.

Whether a similar composition exists elsewhere (LangGraph + approval nodes,
OpenAI Assistants' tool approvals, agent frameworks with memory stores) is a
literature-and-tooling question this document does not settle. Treat the list
above as a description of this codebase, not as a priority claim.

## 4. Open questions

1. **Does evidence-gating change behaviour?** Without a live model in the loop we
   can measure the gate (7/7 benchmark checks, 542 tests) but not whether a model
   given feedback produces better plans. Needs an ablation with a real local
   model and a task suite.
2. **How far does the glossary bridge generalise?** The `mem-si-cross` case
   proves one concept. A proper study needs parallel corpora and recall@k per
   language.
3. **Is per-use approval usable?** Every execution asks again. A session-scoped
   grant with an expiry is the obvious next step; it trades friction for a wider
   approval window.
4. **When does the plan regex fail?** Paraphrase and mixed-language objectives
   will fall through to `review`. Measuring that rate is straightforward; fixing
   it without handing control to a model is the hard part.
5. **Serverless durability.** SQLite on a serverless runtime is not persistent.
   The Supabase mirror is the answer for that deployment, but the engine has been
   tested against it only through PGlite, not a live project.

## 5. Ethical and safety posture

- No covert data collection: memory is written deliberately, exportable and
  deletable.
- Secrets are refused at the memory boundary, not merely masked in logs.
- Cloud transmission is off by default and needs a grant plus a per-call
  approval.
- The system prefers refusing (`LOCAL_ONLY_NO_PROVIDER`) to quietly using a cloud
  model.
- Claims are limited to what tests and measurements show; the gaps are listed in
  `NOVA_DEVELOPMENT_REPORT.md` §5.
