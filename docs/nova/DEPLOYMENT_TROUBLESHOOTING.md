# "Cloud workspace is not configured" — what it actually means

The workspace asks `GET /api/workspace/config` once per page load. The answer
decides whether accounts, sync and Chat are available. Since Phase 8 the client
distinguishes *why* an answer is unusable, and the panel shows the reason instead
of one vague sentence.

## Read the reason

| Reason shown | HTTP | What happened | Who fixes it |
| --- | --- | --- | --- |
| `not-configured` | 200 `{enabled:false}` | Route works; `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` are not set on this environment | Operator (env vars, then redeploy) |
| `invalid-url` / `invalid-key` / `key-conflict` | 200 | A variable is set but rejected: not a bare `https` origin, not a publishable key, or it matches the service-role key | Operator |
| `route-missing` | 404 | This deployment is not serving the route at all | Check `vercel.json` rewrites and that `api/index.js` is built and committed |
| `server-error` | 5xx | The function started and crashed | Vercel → Functions logs |
| `invalid-response` | 200 `text/html` | The SPA rewrite answered instead of the API | Confirm the request path starts with `/api/` and the function exists |
| `timeout` | — | No answer within 15 s (cold start or hung request) | Retry; if it persists, check function duration limits |
| `unreachable` | — | No answer at all: DNS, offline, proxy | Retry; check the URL from another network |

Everything from `route-missing` downwards is **retryable from the UI** — the
panel offers *Try again*, which clears the memoised probe and asks again. The
operator-level reasons deliberately do not offer a retry: pressing it would never
change the answer.

## Probe the deployment yourself

The sandbox has no outbound network, so run this where you have connectivity:

```bash
npm run check:deployment -- https://your-app.vercel.app
```

It calls the same three endpoints the app calls (`/api/workspace/config`,
`/api/nova/config`, `/`), prints status, content type, timing and body, then the
verdict and the next step. Exit code is non-zero when the config endpoint is
unhealthy.

## Two bugs this fixed

1. **A failed probe was cached for the whole session.** One cold start or one
   offline moment at first paint locked Chat until a hard reload. `retryConnection()`
   now clears the cache and re-probes.
2. **The timeout was 8 s** — shorter than a normal serverless cold start, which
   turned a healthy-but-slow deployment into a permanent "unreachable". It is now
   15 s (`CONFIG_TIMEOUT_MS`) and an abort is reported as `timeout`, not as a
   network failure.
