# NOVA provider resilience — the 502 / 504 production repair

**Status:** implemented, tested locally, **not yet deployed**.
**Scope:** the online AI path only (`/api/nova/chat` → `server/novaChat.js`). The
local engine, the provider options (Auto / OpenRouter / Gemini / Local), the chat
history and the astronomy features are untouched.

Production showed the two failures below while the local engine kept answering.

```
OpenRouter  · INVALID_PROVIDER_RESPONSE · HTTP 502
Google Gemini · AI_TIMEOUT             · HTTP 504
```

Both strings come from `describeFallbackChain()` in
`src/workspace/chat/chatClient.ts`, so they are the *chain* behind an offline
answer — not a broken UI. The numbers are the statuses this API returned.

---

## 1. Evidence, measured from the deployment itself

`GET /api/nova/diagnostics` on production `a542980`
(measured 2026-11-18T03:19:26Z, deployment clock):

| Provider | Result | Numbers |
| --- | --- | --- |
| NOVA Local Space Engine | **ok** | in-process, `nasa-local-engine` |
| OpenRouter | **ok** | `openrouter/free`, **HTTP 200 in 401 ms** |
| Google Gemini | **error** | `gemini-3.8-flash` → **503** in 3 753 ms (Google: *"This model is currently experiencing high demand"*) |
| | | `gemini-flash-latest` → **503** in 2 428 ms |
| | | `gemini-2.5-pro` → **404** in 79 ms |
| | | `gemini-2.5-flash-lite` → **404** in 90 ms |
| | | `gemini-2.5-flash` → **404** in 83 ms |
| | | `GET /v1beta/models` → **200** in 51 ms, **49** models, `keyValid: true` |

Two conclusions follow directly, and they are the ones that shape the repair:

1. **The OpenRouter endpoint, key and model id are correct.** The same key, the
   same `openrouter/free` router and the same host answered a real request with
   200 and a JSON body in 401 ms.
2. **Gemini is refused by the vendor, not misconfigured here.** The key is valid;
   the one id that exists answers "high demand", and every id in the
   hand-written fallback list is retired for this key (404) even though
   `/v1beta/models` still lists them.

## 2. Root cause A — OpenRouter's 502

`fetchProviderJson()` started one 8-second timer **before** the request and only
cleared it after the body had been parsed:

```js
const timeout = setTimeout(() => { timeoutExpired = true; controller.abort(); }, 8_000);
const upstream = await fetchImpl(url, { ...init, signal: controller.signal });  // headers
data = await upstream.json();                                                   // body
```

The timer therefore covered *headers **and** the entire JSON body*. A free-router
completion with the NOVA system prompt needs far more than 8 s to finish its
body, so the abort fired mid-stream, `upstream.json()` rejected, and the inner
`catch` reported the reject as

```js
errorResult(502, 'INVALID_PROVIDER_RESPONSE', 'The AI provider returned an unreadable response.')
```

That is a **misclassification**, not an upstream defect: a timed-out body read
was reported as "the provider sent something that is not JSON". Three
consequences made it worse:

* the failure was **not retried** — one bad response killed the hop;
* the response carried **no evidence** (no shape, no phase, no byte count), so
  the next investigation had nothing to work with;
* any 2xx whose body was HTML, truncated or a stream got the same label.

## 3. Root cause B — Gemini's 504

`callGemini()` walked five model ids and gave **each of them the full hop
timeout**:

```js
for (const candidate of geminiModelCandidates(model)) {
  upstreamResult = await fetchProviderJson({ ..., timeoutMs });   // 8 s each
```

With the measured upstream behaviour that is:

* `gemini-3.8-flash` → 503 after 3.75 s (the only id that can answer, busy);
* `gemini-flash-latest` → 503 after 2.43 s;
* three retired ids → 404 ≈ 0.25 s total.

The healthy-model attempt alone can outlast 8 s for a real answer with
`maxOutputTokens: 1200`, so the timer aborted and `AI_TIMEOUT` (504) was
reported. Worse, the loop had **no shared deadline**: five candidates × 8 s is
40 s — longer than the function's `maxDuration: 30`. A slow provider could
therefore consume the whole function and the offline answer would never be sent.

Two further defects:

* a 503 on the *same* model was never retried, even though Google calls 503
  "usually temporary" — the code immediately moved to an id that no longer
  exists;
* the fallback list was hand-written and had gone stale, while the key itself
  could list 49 models in one 51 ms call.

## 4. What changed

All in `server/novaChat.js` unless stated.

| # | Change | Why |
| --- | --- | --- |
| 1 | `UPSTREAM_TIMEOUT_MS` 8 000 → **15 000**, `AUTO_CHAIN_BUDGET_MS` 18 000 → **25 000**, both env-tunable (`NOVA_UPSTREAM_TIMEOUT_MS`, `NOVA_AUTO_CHAIN_BUDGET_MS`) and clamped | A completion needs more than 8 s; 25 s still fits `maxDuration: 30` with time left for the offline answer |
| 2 | Bodies are read as **text first**, then parsed | The *shape* of a 2xx is now known: `html`, `truncated-json`, `event-stream`, `empty`, `text` |
| 3 | A body read aborted by the timer → **`AI_TIMEOUT` with `phase: "body"`** | The 502 that started this investigation is now named correctly |
| 4 | Unparseable 2xx → `INVALID_PROVIDER_RESPONSE` **with `bodyShape` and `bodyBytes`**, and it is **retried once** | Transient proxy/truncation faults self-heal; a real one is diagnosable |
| 5 | Bounded retry for `AI_TIMEOUT`, `INVALID_PROVIDER_RESPONSE`, `UPSTREAM_NETWORK_ERROR`, `PROVIDER_UNAVAILABLE`, `EMPTY_PROVIDER_RESPONSE` (350 ms apart, only if ≥ 4 s of budget remain) | Safe retries without a retry storm; a 401/404/429 is never retried |
| 6 | Absolute **deadline** per hop and per chain (`chainDeadline`), each hop `min(timeout, remaining)`, retries sized to what is left | No provider can outlive the chain, and the local engine always gets ~1.2 s of reserve |
| 7 | Gemini: one shared deadline for the whole hop, the configured id always tried, a 503 **retried once on the same id**, extra ids only when they can finish | Retries the model that can actually answer, instead of walking retired ids |
| 8 | Gemini: **model discovery** — when every static candidate fails, `GET /v1beta/models` (51 ms) is consulted and up to two `gemini-3.x` chat ids are tried (10-minute cache) | The catalogue cannot go stale; the key's own list decides |
| 9 | Gemini: ids that answered 404/422 are remembered for 30 min (never the configured one) | Stops paying ~250 ms per request for three retired ids |
| 10 | OpenRouter: `openrouter/free` → **`openrouter/auto`** on 404/422, reported as `requestedModel` + `modelFallback`; the *configured* model's error is what gets reported if both fail | The free router's pool varies by design; one documented alternative beats a dead hop |
| 11 | SSE bodies are **reassembled** (`textFromEventStream`) into the normal non-streaming shape | A provider that streams anyway still answers the non-streaming client |
| 12 | A 2xx carrying `{ error }` is mapped to `providerError()`, not treated as an answer | Some gateways answer 200 with an error object |
| 13 | Chain hops now carry `attempts`, `bodyShape`, `phase`; Gemini errors carry `modelsTried` | Diagnostics without content, keys or headers |

`server/novaDiagnostics.js` + `server.ts`:

| # | Change | Why |
| --- | --- | --- |
| 14 | `GET /api/nova/diagnostics?chat=1` runs the **real chat handler** once per configured provider (30 s throttle, own rate-limit bucket) and reports `httpStatus`, `code`, `answeredBy`, `model`, `hasText`, `textChars`, `fallback`, `fallbackChain`, `ms` | A green probe meant "a host answered"; it did not mean "a completion works". This closes that gap end-to-end — and it is how the fix is meant to be verified on the live deployment |
| 15 | The report now includes `budgets: { upstreamTimeoutMs, chainBudgetMs }` | A stale deployment answers with 8 000 / 18 000; that is now visible without reading logs |

No API key, header, provider body or answer text is added to any response. The
existing redaction (`redactReason`) still guards the one free-text field.

## 5. Verification

Local (this branch, `npm ci` from the committed lockfile):

* `npm run test:nova-chat` — 51/51 (the seven assertions that pinned the old
  8-second / one-attempt behaviour were updated to the new policy and say so);
* `node --test scripts/test-nova-resilience.mjs` — **13/13 new cases**, including:
  * a 200 whose body is cut off by the timer → `AI_TIMEOUT`, not `INVALID_PROVIDER_RESPONSE`;
  * HTML body → retried once → healthy answer on the second attempt;
  * two HTML bodies → `INVALID_PROVIDER_RESPONSE` + `bodyShape: "html"` + local fallback, key never echoed;
  * truncated JSON → `bodyShape: "truncated-json"`;
  * SSE body → reassembled answer;
  * Gemini 503 → same-id retry → success;
  * every static model failing → discovery → `gemini-3.9-flash-preview` answers, `modelFallback: true`;
  * `openrouter/free` 404 → `openrouter/auto` answers;
  * all three providers hanging → local answer in < 3 s, all three hops attempted;
  * the budget constants fit inside `maxDuration`;
* `npm run test:nova-diagnostics` — 25/25 (two new self-test cases);
* `npm run test:nova-routes` — 4/4;
* `npm run lint` (`tsc --noEmit`) — clean;
* `npm run build:api` — `api/index.js` regenerated (`npm run check:bundle` enforces
  that the committed bundle matches `server/`).

Live (after deploy — not yet done):

```
curl -s "https://nasa-space-expolere.vercel.app/api/nova/diagnostics?chat=1" | jq '.budgets, .chatSelfTest'
```

Expect `budgets.upstreamTimeoutMs = 15000`, and a `chatSelfTest` entry per
provider. Gemini is expected to still report its vendor 503; OpenRouter is
expected to answer.

## 6. Remaining limitations (honest list)

1. **Gemini generation is unavailable for this deployment** — the vendor
   answers 503 "high demand" on the only id that exists for this key, and 404 on
   everything else. Nothing in this repository can enable it; `?chat=1` will keep
   reporting the live status. NOVA keeps answering through OpenRouter and the
   local engine, and now says exactly why Gemini was skipped.
2. **The free router has documented daily caps.** `openrouter/free` is shared
   pool infrastructure; a 429 is mapped to `UPSTREAM_RATE_LIMITED` with
   `Retry-After`, never retried.
3. **The chat API is non-streaming end to end.** The client
   (`src/workspace/chat/chatClient.ts`) posts once and renders one JSON answer;
   there is no SSE path in the UI to preserve. Streamed *upstream* bodies are
   reassembled, so a provider that streams cannot break the answer — but the
   browser still receives one JSON response. Adding real streaming would be a
   UI change, not a repair, and was deliberately left out.
4. **`maxDuration` stays 30 s.** Raising it to 60 s is a one-line change in
   `vercel.json`, but it depends on the plan; the 25 s chain budget was chosen so
   the current limit is never the reason a request dies.
5. **The exact trigger of the original OpenRouter 502 is not reproducible from
   this sandbox** (no egress to `openrouter.ai`). What is proven is the
   classification defect and the missing retry; the next occurrence will now name
   the body shape, the phase and the attempt count instead of saying "unreadable".
