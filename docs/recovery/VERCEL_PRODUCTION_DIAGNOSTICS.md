# Production API diagnostics — Vercel environments

**Status of this document:** everything under "verified here" was executed in this
workspace on 2026-11-06. Everything under "requires network" was **not** executed:
this sandbox has no outbound access, so no claim about your live deployment is made.

---

## 1. What the provider flags actually mean

`GET /api/nova/config` reports one boolean per provider. It means **"this variable
is present in the running process"** — never "this key works".

Verified locally by starting the server with a throw-away value:

```
$ GEMINI_API_KEY="not-a-real-key-for-mapping-test" PORT=3103 npx tsx server.ts
$ curl -s localhost:3103/api/nova/config
{"providers":{"auto":true,"local":true,"gemini":true,"openrouter":false,"arena":false}, ...}
```

The key is nonsense and `gemini` still reads `true`. Consequences:

- **Flag `false`** → the variable is genuinely absent from that function's
  environment (or the function was not redeployed after it was added).
- **Flag `true` + chat still falls back** → the variable is present but the key is
  invalid, expired, out of credit or blocked. `fallbackChain` says which.

And the fallback chain is precise. Same run, invalid Gemini key, no network:

```json
{ "provider": "NOVA Local Space Engine", "model": "nasa-local-engine",
  "fallback": true,
  "fallbackChain": [{ "provider": "Google Gemini", "code": "UPSTREAM_NETWORK_ERROR", "status": 503 }] }
```

So "all providers OFF" on a deployment means one of exactly three things:

| Symptom on the live site | Meaning | Fix |
| --- | --- | --- |
| All three flags `false` | The variables are not in the environment serving **that URL** | Set them for the right scope, then redeploy |
| Flags `true`, every answer is the offline engine | Keys present but rejected upstream | Read `fallbackChain` (`PROVIDER_AUTH_ERROR` → re-issue key; `PROVIDER_CREDIT_REQUIRED` → top up) |
| Flags `true`, answers hang then fall back | Network/timeout from the function | Check `AI_TIMEOUT` / `UPSTREAM_NETWORK_ERROR` and function region |

---

## 2. Variable matrix

Names only. No value appears in this repository, in logs, or in any API response.

| Variable | Production | Preview | Development | Secret? | Read by | If missing |
| --- | --- | --- | --- | --- | --- | --- |
| `ARENA_API_KEY` | required for Arena | optional | optional | **yes** | `server/novaChat.js` | provider skipped |
| `OPENROUTER_API_KEY` | required for OpenRouter | optional | optional | **yes** | `server/novaChat.js` | provider skipped |
| `GEMINI_API_KEY` | required for Gemini | optional | optional | **yes** | `server/novaChat.js`, `server.ts` | provider skipped |
| `NOVA_ARENA_MODEL` / `NOVA_OPENROUTER_MODEL` / `NOVA_GEMINI_MODEL` | optional | optional | optional | no | `server/novaChat.js` | documented defaults |
| `ARENA_BASE_URL` | optional | optional | optional | no | `server/novaChat.js` | `https://api.arena.ai/v1/chat/completions` |
| `NASA_API_KEY` | recommended | recommended | optional | no (rate-limit ID) | `server/nasaRoutes.ts` | falls back to `DEMO_KEY`, higher 429 rate |
| `FIRMS_MAP_KEY` | optional | optional | — | no | `server/earthIntelligence.ts` | hotspot counts report `not-configured` |
| `YOUTUBE_API_KEY` | optional | optional | — | **yes** | `server/spaceVideos.ts` | curated catalogue |
| `SUPABASE_URL` | required for accounts | optional | optional | no | `server/workspaceConfig.ts` | `/api/workspace/config` → `not-configured` |
| `SUPABASE_PUBLISHABLE_KEY` | required for accounts | optional | optional | no (public by design) | same | same |
| `SUPABASE_SERVICE_ROLE_KEY` | optional | — | — | **yes, never to the browser** | `workspaceConfig.ts` (conflict check only) | check skipped |
| `CORS_ORIGINS` | optional | optional | — | no | `server/cors.ts` | same-origin + Vercel hosts still allowed |
| `APP_URL` | optional | optional | optional | no | attribution links | generic links |

**Scopes are separate in Vercel.** A variable ticked only for *Production* is
absent in every Preview deployment — that is the single most common reason the same
commit works on the production URL and shows "all providers OFF" on a preview URL.

---

## 3. Manual Vercel actions (exact steps)

Do these yourself; nothing here was executed against your account.

1. **See what exists, names only**
   Dashboard → your project → *Settings* → *Environment Variables*.
   (CLI equivalent: `vercel env ls production`, `vercel env ls preview`,
   `vercel env ls development` — it prints names, never values.)
2. **Compare the three columns.** For each of `GEMINI_API_KEY`,
   `OPENROUTER_API_KEY`, `ARENA_API_KEY`: they must have a tick under every scope
   you actually browse. If Preview is unticked, add it for Preview.
3. **Redeploy after any change.** Environment variables are injected at build/run
   time; an existing deployment keeps the old environment.
   Deployments → … → *Redeploy* (leave "use existing build cache" **off** for the
   first redeploy after an env change).
4. **If a key is rejected upstream** (`PROVIDER_AUTH_ERROR` in `fallbackChain`):
   re-issue it in the provider's console and paste the new value into **all three
   scopes at once**. Do not rotate a key that is working — the recovery brief
   forbids it and there is no need.
5. **Never** paste a key into a `VITE_*` name, an issue, a commit message or a
   screenshot. `npm run audit:env -- --dist` fails the build if one reaches `src/`
   or `dist/`.

---

## 4. Verification commands

Run where there is network (this sandbox has none):

```bash
npm run check:deployment -- https://your-app.vercel.app   # config endpoint verdict + next step
npm run check:apis       -- https://your-app.vercel.app   # all 38 routes, degraded vs failed
curl -s https://your-app.vercel.app/api/nova/config        # provider flags (booleans only)
curl -s https://your-app.vercel.app/api/nova/diagnostics   # per-provider status, no probe
curl -s https://your-app.vercel.app/api/nova/diagnostics?probe=1   # one-token live probe (throttled)
```

`?probe=1` is the only call that proves a key *works*: it sends one token to each
configured provider and reports `OK`, `PROVIDER_AUTH_ERROR`,
`PROVIDER_CREDIT_REQUIRED`, `UPSTREAM_RATE_LIMITED`, `AI_TIMEOUT` … It is throttled
by design, so do not loop it.

Expected production result when everything is correct:

```
providers: { auto: true, local: true, gemini: true, openrouter: true, arena: true }
diagnostics?probe=1: every configured provider reports status "ok", code "OK"
```

---

## 5. What is verified vs. not

**Verified here** (local process, dummy key, no network):
provider flags track variable presence; an invalid key does not crash the endpoint;
`fallbackChain` names the failing provider, code and HTTP status; the offline engine
still answers with `200`.

**Not verified** (needs network / your account): which variables are set in your
Production/Preview/Development scopes; whether the live keys are valid; function
logs; region and cold-start timings. No live claim is made.
