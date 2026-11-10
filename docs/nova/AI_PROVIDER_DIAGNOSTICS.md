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
| `PROVIDER_MODEL_NOT_FOUND` (404) | the model id does not exist (or was withdrawn) | set `NOVA_*_MODEL` to a model the key may use |
| `UPSTREAM_RATE_LIMITED` (429) | provider quota exhausted | wait; OpenRouter's free tier is 50 requests/day |
| `PROVIDER_UNAVAILABLE` (5xx) | provider-side outage | retry later; Auto falls back to local |
| `UPSTREAM_NETWORK_ERROR` | the function could not reach the host | check egress/DNS, not the key |
| `AI_TIMEOUT` | no answer inside the budget | provider is slow; retry |

### 404 is not 503 — and neither is a timeout

Both used to arrive as `AI_TIMEOUT`, which is why "Gemini does not work" stayed
unexplained for so long. They mean different things:

| What the API said | Field | Meaning |
| --- | --- | --- |
| `404 NOT_FOUND` | `modelInvalid: true` | the configured model id does not exist — a configuration error, not an outage |
| `503 UNAVAILABLE` | `code: PROVIDER_UNAVAILABLE` | the model exists and is overloaded right now — retry later, nothing to fix in config |
| no answer | `keyValid` + `keyCheck` | the generation call was too slow; the separate metadata check says whether the key itself is fine |

When the model is the problem, the probe tries the other known ids and reports
`fallbackModel` (the first that answered) plus `modelsTried`, so one report
answers both questions: *is the key good?* and *is the model good?* It also lists
the models the key may actually call (`availableModels`, `availableModelCount`,
read from `GET /v1beta/models` and filtered to `generateContent`). In the app,
**Settings → AI providers** shows the model problem and that list on their own
lines, separately from a key problem, in English, Sinhala and Tamil.

A `503` is treated as *model-scoped* in chat: it retries the other ids once
(bounded by the request budget) and, if one answers, reports which `model`
answered and `modelFallback: true`. If every id is refused the same way, the
report says so — `Every model id tried was refused the same way … quota, billing
or a project restriction` — instead of blaming the model id.

Measured on production `bce50a1` (2026-11-10 13:53 UTC): both `gemini-3.8-flash`
and `gemini-flash-latest` answered **503 "high demand"** (852 ms and 385 ms) while
the key check answered **200 in 95 ms** — a healthy key in front of a refusing
API, and that is now what the report says.

Earlier, on `3a3c1a1` (2026-11-09 15:23 UTC):
`gemini-3.8-flash` answered **503 "currently experiencing high demand"** while the
key check against `GET /v1beta/models` answered **200** — a busy model with a
healthy key, and the report said exactly that.

## 2. What NOVA does with a failure

* **`auto`** tries Arena → OpenRouter → Gemini (only those with a key) inside an
  **18-second budget**, then answers from the bundled local engine and says so
  (`fallback: true`, provider `NOVA Local Space Engine`). A chain of slow
  failures can no longer eat 24 seconds and time out the request.
* **An explicitly chosen provider** never falls back silently: it returns the
  real error code, and the chat surface shows it.

## 3. Known issues on this deployment (checked 2026-11-09)

| Provider | Observation |
| --- | --- |
| Arena | `ARENA_BASE_URL` is **not set**, so the code falls back to `https://api.arena.ai/v1/chat/completions` with model `arena_smart.aria`. Arena's own documentation shows the gateway at `https://api.arena.ai` (no `/v1`) with **workspace-specific model ids** (for example `coding-router-preview`). Neither the URL nor the model id has been confirmed for this key, so treat Arena as unverified until the probe says `OK`. |
| OpenRouter | `openrouter/free` is a valid model id. The free tier is 20 requests/minute and **50 requests/day** (1,000/day after a one-off $10 top-up); a `429` here is a quota problem, not a broken key. |
| Gemini | `gemini-3.8-flash` is the default and **exists** — verified live: a wrong id answers `404 NOT_FOUND`, this one answers `503 UNAVAILABLE` when it is busy. A `400`/`403` usually means the key is invalid or restricted. If the id is ever withdrawn, chat retries `gemini-flash-latest` then `gemini-2.5-flash`, reports which model answered (`model`), which was asked for (`requestedModel`) and `modelFallback: true`. |
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

## 6. Vercel environment layout (cleaned up 2026-11-06)

The keys had been entered **twice**: once on the project, once as team-level
"shared" variables. Vercel resolves project values over shared ones, but the two
copies covered different environments, so the deployed behaviour depended on
which copy applied:

| Key | Before | After |
| --- | --- | --- |
| `GEMINI_API_KEY` | project: production only · shared: preview + production | **project: production + preview + development**; shared copy deleted |
| `OPENROUTER_API_KEY` | project: production only · shared: preview + production | **project: production + preview + development**; shared copy deleted |
| `YOUTUBE_API_KEY` | project: production only · shared: all projects | **project: production + preview + development**; shared copy scoped to `nova-web-os` only |
| `ARENA_API_KEY` | project: production, preview, development (3 records) | unchanged |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | project: all three | unchanged |

Rules worth remembering:

* **Project beats shared.** A shared variable is only a default for projects that
  do not define the key themselves.
* **An empty project list on a shared variable means "every project".** Disconnecting
  a project-scoped shared secret from its only project silently widens it to the
  whole team — which is why the Gemini and OpenRouter shared copies were **deleted**
  rather than disconnected. Only the YouTube copy was re-scoped, because
  `nova-web-os` has no key of its own and would otherwise lose video support.
* Environment changes apply to the **next deployment**; a running deployment keeps
  the values it was built with.

Not verified here: the actual key **values** (they are sensitive and were never
read). That is exactly what `?probe=1` is for.

## 7. What the chat bubble tells you now

A failure used to be one vague sentence, which is how three broken providers
looked like one mysterious outage. Every assistant turn now carries the reason:

* **A refused provider** keeps the sentence and adds one line underneath:

  ```
  The provider could not process this request. Please try again later.
  Google Gemini · PROVIDER_AUTH_ERROR · HTTP 403
  ```

* **An offline answer** (Auto fell back to the bundled engine) says so, and
  lists every provider it tried:

  ```
  …the answer…
  Answered offline — the online providers did not respond. Arena AI · PROVIDER_AUTH_ERROR · HTTP 401 | OpenRouter · UPSTREAM_RATE_LIMITED · HTTP 429
  ```

The details are stored with the message, so they survive a reload; only the
provider name, the code and the upstream HTTP status are recorded — never a key,
never the upstream response body.

Server contract additions (all optional for older clients):

| Field | Where | Meaning |
| --- | --- | --- |
| `provider` | error body | Which provider refused (`Arena AI`, `OpenRouter`, `Google Gemini`). |
| `upstreamStatus` | error body | The status that provider returned (503 is ours, 401 is theirs). |
| `fallbackChain` | 200 body when `fallback: true` | `[{ provider, code, status }]`, one entry per failed hop. |

Reading the line: `401`/`403` = the key is wrong, revoked, or restricted;
`429` = quota (OpenRouter free tier is 50 requests/day); `404`/`422` = the model
name no longer exists. That single word decides the fix.

## 8. "Is this even the new build?"

Two failures look identical from the browser: a rejected key, and a page (or a
service worker) serving an older deployment. Both endpoints now answer it:

```json
// GET /api/nova/config
{"providers":{"auto":true,"local":true,"gemini":true,"openrouter":true,"arena":true},
 "deployment":{"environment":"production","commit":"4a1d42d","branch":"main"}}
```

`/api/nova/diagnostics` reports the same pair as one label (`production · 4a1d42d`),
which the Settings card prints under the timestamp. If the commit is not the one
you just merged, you are looking at a cached client or an un-promoted deployment —
not at a provider problem.

`providers` stays what it always was: "a non-empty key is set". It is *not* a
health check; only `?probe=1` (or a real chat request) can say whether the
provider accepts that key.

## 9. Why `/api/...` opened in a tab shows the app

The PWA service worker answers every navigation with the cached `index.html`.
That includes someone typing an API URL into the address bar to check it — the
response is HTTP 200, `text/html`, and the endpoint looks broken while it is
perfectly healthy. `navigateFallbackDenylist: [/^\/api\//]` in `vite.config.ts`
keeps API paths off the app shell (locked by a test).

Two ways to check an endpoint until that build is live:

* a private/incognito window (no service worker registered), or
* the DevTools console on the site — a `fetch` is not a navigation:

```js
fetch('/api/nova/config').then(r => r.json()).then(j => console.log(JSON.stringify(j)));
fetch('/api/nova/diagnostics?probe=1').then(r => r.json()).then(j => console.log(JSON.stringify(j, null, 2)));
```

## 5. APOD media — what "the image does not render" actually means

Four different failures look identical on screen, and only one of them is a
network error. `GET /api/apod` now names each of them:

| `fallbackReason` | Meaning |
| --- | --- |
| `network` | api.nasa.gov did not answer inside 8 s (the browser client waits 12 s, so it never gives up first) |
| `upstream` | api.nasa.gov answered with a 5xx |
| `rate-limited` | 429/403 — quota or a restricted key |
| `shape` | answered 200 but without a usable picture entry |
| `degraded` | answered 200 with **its own site logo** (`nasa-logo`, `science.nasa.gov/wp-content/themes/…`) and the site title `NASA Science` — measured live on 2026-11-11 while NASA migrates the APOD service |

Media handling that used to fail silently:

* `http://apod.nasa.gov/...` URLs (still returned for older entries) are upgraded
  to `https://` on the server and in the browser client — an HTTPS page blocks
  them as mixed content, which is the classic "valid response, blank image".
* `media_type: "video"` is no longer put into an `<iframe>`: YouTube *watch* and
  `youtu.be` URLs are rewritten to `/embed/`, direct `.mp4` files use `<video>`,
  unembeddable players fall back to `thumbnail_url` plus a link.
* every `<img>` walks `hdurl → url → thumbnail_url` and then states the failure
  and links to the original, instead of leaving an empty panel.
* the bundled fixtures are never seeded into the APOD cache, so a placeholder is
  always labelled `isFallback` and never `cached`.

Tests: `scripts/test-apod-media.mjs` (12 cases, including two jsdom renders).
