# AI providers — how to find out why one is failing

_"The AI APIs don't work" is not a diagnosis._ A key can be present and still be
expired, out of free-tier credit, or attached to a model it may not call. This
page explains the one command that turns the symptom into a named cause.

## 1. Ask the server directly

```
https://nasa-space-expolere.vercel.app/api/nova/diagnostics
```

Returns, for each provider, whether a key is configured and which model and
endpoint would be used. Nothing is called upstream.

```
https://nasa-space-expolere.vercel.app/api/nova/diagnostics?probe=1
```

Additionally performs **one one-token request per configured provider** and
reports what came back: HTTP status, latency, an error code, and a redacted
reason. The deep probe is throttled to once every 10 seconds and can never
return a key or a key fragment.

The same information is in the app: **Settings → AI providers → Re-check**.

### Codes and what each one means

| Code | Meaning | Usual fix |
| --- | --- | --- |
| `OK` | provider answered | — |
| `NOT_PROBED` | key present, no request made yet | add `?probe=1` |
| `PROVIDER_NOT_CONFIGURED` | no key in this deployment | add the env var, then redeploy |
| `PROVIDER_AUTH_ERROR` (401/403) | key rejected | issue a new key in the provider's console |
| `PROVIDER_CREDIT_REQUIRED` (402) | out of credit / free quota | top up, or stay on the local engine |
| `PROVIDER_MODEL_NOT_FOUND` (404) | the model id is not available to this key | set `NOVA_*_MODEL` to a model the key may use |
| `UPSTREAM_RATE_LIMITED` (429) | provider quota exhausted | wait; OpenRouter's free tier is 50 requests/day |
| `PROVIDER_UNAVAILABLE` (5xx) | provider-side outage | retry later; Auto falls back to local |
| `UPSTREAM_NETWORK_ERROR` | the function could not reach the host | check egress/DNS, not the key |
| `AI_TIMEOUT` | no answer inside the budget | provider is slow; retry |

## 2. What NOVA does with a failure

* **`auto`** tries Arena → OpenRouter → Gemini (only those with a key) inside an
  **18-second budget**, then answers from the bundled local engine and says so
  (`fallback: true`, provider `NOVA Local Space Engine`). A chain of slow
  failures can no longer eat 24 seconds and time out the request.
* **An explicitly chosen provider** never falls back silently: it returns the
  real error code, and the chat surface shows it.

## 3. Known issues on this deployment (checked 2026-11-06)

| Provider | Observation |
| --- | --- |
| Arena | `ARENA_BASE_URL` is **not set**, so the code falls back to `https://api.arena.ai/v1/chat/completions` with model `arena_smart.aria`. Arena's own documentation shows the gateway at `https://api.arena.ai` (no `/v1`) with **workspace-specific model ids** (for example `coding-router-preview`). Neither the URL nor the model id has been confirmed for this key, so treat Arena as unverified until the probe says `OK`. |
| OpenRouter | `openrouter/free` is a valid model id. The free tier is 20 requests/minute and **50 requests/day** (1,000/day after a one-off $10 top-up); a `429` here is a quota problem, not a broken key. |
| Gemini | `gemini-2.5-flash` is the default. A `400`/`403` usually means the key is invalid, restricted, or the model is not enabled for that key's project. |
| Local | Always available; it is the bundled space-knowledge engine, not a model provider. |

## 4. Fixing Arena properly

Arena's OpenAI-compatible surface is **not** confirmed by its public docs, which
describe the gateway for Claude Code. If you want Arena used:

1. confirm the base URL and a chat-capable model id with the Arena dashboard;
2. set both env vars in Vercel (Production):

```
ARENA_BASE_URL = https://api.arena.ai     # or the exact endpoint shown for your key
NOVA_ARENA_MODEL = <a model id your workspace allows>
```

3. redeploy and re-run `?probe=1` — the expectation is `code: "OK"`.

Until that is done, Arena will honestly report a failure and Auto will move on to
the next provider instead of pretending it works.

## 5. What this does not do

The endpoint reports reachability; it does not prove answer **quality**, and it
does not test the browser → `/api/nova/chat` path end to end. It also cannot run
inside the Arena sandbox preview, which has no outbound network to any provider —
there, every online provider correctly reports `UPSTREAM_NETWORK_ERROR`.
