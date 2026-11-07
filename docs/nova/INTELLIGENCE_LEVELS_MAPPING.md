# NOVA intelligence levels — model-to-level mapping

**Status: proposal for review. No code written.** Nothing in this document has been
implemented, and no model availability is asserted beyond what the code itself
contains. Env vars and API shapes are proposals.

Audit date: 2026-11-06 · branch `arena/39123449-asa-asan` · gate at `74f9e5c` (284/284).

---

## 1. Audit — what actually exists today

### Providers

| id | Name | Transport | Key variable |
| --- | --- | --- | --- |
| `local` | NOVA Local Space Engine | in-process, no network | — |
| `gemini` | Google Gemini | `generativelanguage.googleapis.com` | `GEMINI_API_KEY` |
| `openrouter` | OpenRouter | `openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |
| `arena` | Arena AI | `api.arena.ai/v1` (or `ARENA_BASE_URL`) | `ARENA_API_KEY` |
| `auto` | — | router over the three above | — |

### Models — exactly one per provider

| Provider | Model identifier | Override | Source |
| --- | --- | --- | --- |
| local | `nasa-local-engine` | — | `server/novaChat.js` (fixed) |
| gemini | `gemini-3.8-flash` | `NOVA_GEMINI_MODEL` | default constant (changed 2026-11-07, see §9) |
| openrouter | `openrouter/free` | `NOVA_OPENROUTER_MODEL` | default constant |
| arena | `arena_smart.aria` | `NOVA_ARENA_MODEL` | default constant |

### Selection, budgets, disclosure

- Explicit `provider` → that provider only; a missing key is `503 PROVIDER_NOT_CONFIGURED`, never a substitution.
- `auto` → `arena → openrouter → gemini` (configured only), then the local engine with `fallback: true`.
- Per-hop timeout **8 s**, whole-chain budget **18 s**, function cap 30 s.
- The reply carries `provider` and `model`; the workspace chat stores both and now renders
  human labels (`src/lib/modelLabels.ts`). The NASA assistant currently sends
  `provider: 'auto'` with no user control.

### Gaps this feature has to close

1. **No capability metadata anywhere.** No model catalogue, no `/models` discovery, no latency/context facts. The router picks by *provider*, never by *capability*.
2. **No user-facing level.** `auto` is invisible; the four-level model does not exist in the API or the UI.
3. **No disclosed downgrade.** Today a fallback changes provider silently in the transcript (the label changes, but nothing says "your level was not available").
4. **No model verification step.** Nothing confirms that a configured model id still exists upstream.

---

## 2. Level definitions

| Level | Intent | Target first token | Reasoning | Typical use in a NASA product |
| --- | --- | --- | --- | --- |
| **1 · Local** | bundled astronomy knowledge, works offline | instant (<50 ms) | none (retrieval) | definitions, constants, mission facts, offline use |
| **2 · Fast** | quick, cheap answers | ≤ 3 s | light | "what is a Lagrange point", follow-ups, summarising a feed |
| **3 · Advanced** | research-grade reasoning | ≤ 12 s | strong | comparing missions, interpreting POWER/GIBS data, multi-step explanations |
| **4 · Expert** | deepest available reasoning | ≤ 20 s | strongest available | long analyses, planning a 3D/Earth workflow, auditing an argument |

Latency targets are product targets, **not measured values** — measuring requires
network and keys, which this environment does not have.

---

## 3. Proposed mapping (marked verified / unverified)

Legend — **exact**: the provider has a distinct model for this level.
**nearest**: the provider has no distinct model; the same model as a lower level
serves it and the UI must say so. **—**: not offered.

### 3.1 Gemini

| Level | Model | Status | Basis |
| --- | --- | --- | --- |
| Fast | `gemini-3.8-flash` | **verified by production probe** (§9) | replaced `2.5-flash`, which Google retired |
| Advanced | `gemini-2.5-pro` | unverified | must be confirmed with `GET /v1beta/models` before it is enabled |
| Expert | `gemini-2.5-pro` with a higher thinking budget | **nearest** (same model as Advanced) | Gemini's public tiers do not include a fourth model; Expert would be *Advanced + deeper budget*, which must be disclosed, not implied |

### 3.2 OpenRouter

| Level | Model | Status | Basis |
| --- | --- | --- | --- |
| Fast | `openrouter/free` (current) | **verified present in config** | already served today |
| Advanced | *unconfigured* | — until an operator sets an id | OpenRouter is a catalogue, not a model; choosing "an advanced model" without a pinned id would be a guess |
| Expert | *unconfigured* | — until an operator sets an id | same |

### 3.3 Arena AI

| Level | Model | Status | Basis |
| --- | --- | --- | --- |
| Fast | `arena_smart.aria` | **verified present in config** | the only Arena model this code knows |
| Advanced | — | not offered | no evidence of a second Arena tier; must not be invented |
| Expert | — | not offered | same |

### 3.4 Local

| Level | Model | Status |
| --- | --- | --- |
| Local | `nasa-local-engine` | **working today** (probe `OK`, `/api/nova/chat` 200) |
| any | — | **final fallback for every level**, always labelled |

### 3.5 Summary matrix

| | Gemini | OpenRouter | Arena | Local |
| --- | --- | --- | --- | --- |
| 1 Local | — | — | — | **exact** |
| 2 Fast | exact | exact | exact | fallback |
| 3 Advanced | unverified | — | — | fallback |
| 4 Expert | nearest (Advanced model, deeper budget) | — | — | fallback |

Consequence, and the most important line in this report: **today's configuration can
serve Levels 1 and 2 fully, Level 4 approximately on Gemini only, and Level 3 not at
all** until an operator pins an Advanced model. The UI must show that rather than
pretend.

---

## 4. Routing rules (proposed)

```
resolve(level):
  candidates = providers offering `level` (exact first, then nearest)
  for each candidate in order: try → on failure record hop → next
  if none succeed:
      if a lower level has an exact candidate → downgrade ONE step, mark downgraded
      else → local engine, mark downgraded
  if a provider has no key → it is "unavailable", never "failed"
```

Ordering inside a level is latency-first (`fast`), quality-first
(`advanced`/`expert`), and always respects what is configured. **No silent change:**
every response reports `requestedLevel`, `levelUsed`, `provider`, `model`,
`downgraded`, `fallbackChain`.

Proposed request/response additions (backwards compatible — `provider` keeps working):

```jsonc
// request
{ "messages": [...], "level": "fast" }          // level wins; provider optional
// response
{ "text": "...", "provider": "Google Gemini", "model": "gemini-2.5-flash",
  "level": "fast", "levelUsed": "fast", "downgraded": false, "fallbackChain": [] }
```

## 5. Configuration (proposed, additive)

```bash
NOVA_GEMINI_MODEL_FAST="gemini-3.8-flash"
NOVA_GEMINI_MODEL_ADVANCED=""        # empty = level unavailable (no guess)
NOVA_GEMINI_MODEL_EXPERT=""          # empty = nearest = Advanced
NOVA_OPENROUTER_MODEL_FAST="openrouter/free"
NOVA_OPENROUTER_MODEL_ADVANCED=""    # must be pinned by an operator
NOVA_OPENROUTER_MODEL_EXPERT=""
NOVA_ARENA_MODEL_FAST="arena_smart.aria"
NOVA_ARENA_MODEL_ADVANCED=""         # empty = not offered
NOVA_ARENA_MODEL_EXPERT=""
```

Empty means **unavailable**, never "use whatever is around". The existing
`NOVA_*_MODEL` variables stay as the fallback for `_FAST`, so nothing breaks.

## 6. UI (proposed)

- One control, same component in both assistants: `Local · Fast · Advanced · Expert`.
- Each option shows availability before selection: available / needs configuration / not offered.
- The reply bubble shows `provider · model` (already humanised) plus a chip when
  `downgraded: true`: *"Expert unavailable — answered with Advanced (Gemini 2.5 Pro)"*.
- `/api/nova/diagnostics` gains a `levels` section listing, per level, the resolved
  provider+model and whether it is exact, nearest or unavailable.

## 7. Test plan (definition of done, when approved)

1. Mapping unit tests: level → ordered candidates, exact/nearest/unavailable.
2. Router tests with stubbed providers: exact hit; provider failure → next provider
   in the same level; all fail → one-step downgrade with `downgraded: true`; local
   always reachable.
3. Contract tests: `level: 'bogus'` → `400 INVALID_LEVEL`; `provider` still honoured
   when `level` is absent (backwards compatibility).
4. Disclosure test: a downgraded reply renders the "answered with …" chip; an exact
   reply does not.
5. i18n parity for every new string in en/si/ta.
6. NASA grounding unchanged: the system instruction for the assistant must not change
   (a regression test on the prompt constant).

## 8. Decisions needed before implementation

1. **Gemini Advanced id** — confirm `gemini-2.5-pro` is enabled for the key, or supply
   the id you want. Until then Level 3 is unavailable on every provider.
2. **OpenRouter Advanced/Expert ids** — pin one each, or accept Level 3/4 as
   unreachable on OpenRouter.
3. **Expert on Gemini** — accept "Advanced model + deeper thinking budget, disclosed"
   as Expert, or leave Level 4 unavailable?
4. **Arena** — confirm it has no second tier (current assumption), or provide ids.
5. **Latency targets** — accept 3 s / 12 s / 20 s as the product targets for
   Fast / Advanced / Expert?
6. **Fallback policy** — is one-step downgrade + disclosure acceptable, or must an
   unavailable level hard-fail with a "configure Advanced" message?

Nothing above is implemented. On approval I will implement in this order: mapping
module + router (no UI) → config + diagnostics → UI control and disclosure → tests,
each as its own commit.

---

## 9. Production verification — 2026-11-07 (real requests, no assumptions)

Run against `https://nasa-space-expolere.vercel.app/api/nova/diagnostics?probe=1`
on deployment `09f78a2` (production, branch `main`). This is the first time these
providers could be measured at all; the sandbox used for development has no egress.

| Provider | configured | probe | detail |
| --- | --- | --- | --- |
| local | true | **OK** | in-process, no network |
| openrouter | true | **OK** | HTTP 200, **453 ms**, `openrouter/free` |
| gemini | true | `PROVIDER_MODEL_NOT_FOUND` (404) | `models/gemini-2.5-flash is no longer available to new users … use models/gemini-3.8-flash` |
| arena | **false** | `PROVIDER_NOT_CONFIGURED` | `ARENA_API_KEY` is not in the project environment (it was present in an earlier build, so it was removed) |

### What this changes in this document

1. **OpenRouter is verified working**, not merely configured. Level 2 (Fast) is
   therefore available on two providers today; `ask` routing may prefer it.
2. **Gemini's default model was retired upstream.** The default is now
   `gemini-3.8-flash`. This also proves the mapping's core warning: a model id in
   configuration is not a model that exists.
3. **Arena cannot serve any level** until `ARENA_API_KEY` is restored; every level
   that lists Arena must render as *unavailable*, not as *failed*.
4. Level 3 (Advanced) remains unavailable everywhere: no Advanced id is pinned for
   Gemini or OpenRouter, and `gemini-3.8-flash` is a Fast-tier model.

### Consequence for the four-level design

| Level | Available today | Provider + model |
| --- | --- | --- |
| 1 Local | yes | NOVA Local Space Engine |
| 2 Fast | yes | OpenRouter `openrouter/free` (verified), Gemini `gemini-3.8-flash` (pending re-probe) |
| 3 Advanced | **no** | needs a pinned Advanced id |
| 4 Expert | **no** | needs a pinned Expert id, or the disclosed "Advanced + deeper budget" policy |

The mapping still needs the six decisions in §8 — but decisions 1 and 4 are now
partly answered by measurement: Gemini's Fast id is `gemini-3.8-flash`, and Arena
contributes nothing until its key returns.
