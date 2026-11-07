# API & backend stability audit

Date: 2026-11-06 · Scope: every server route, every environment variable, the
browser bundle, and the failure paths between them. No AI provider, model or
integration was changed.

## 1. Integrations

| Integration | Variables (names only) | Where it runs | Failure mode if absent |
| --- | --- | --- | --- |
| Arena AI | `ARENA_API_KEY`, `ARENA_BASE_URL`, `NOVA_ARENA_MODEL` | server (`server/novaChat.js`) | skipped; Auto tries the next provider |
| OpenRouter | `OPENROUTER_API_KEY`, `NOVA_OPENROUTER_MODEL` | server | skipped |
| Google Gemini | `GEMINI_API_KEY`, `NOVA_GEMINI_MODEL` | server | skipped |
| NOVA local engine | — (bundled) | server | always available; answers are labelled offline |
| NASA Open API | `NASA_API_KEY`, `NEXT_PUBLIC_NASA_API_KEY` (default `DEMO_KEY`) | server proxies `/api/apod`, `/api/asteroids/neows`, `/api/epic`, `/api/exoplanets`, `/api/news`, `/api/iss`, `/api/nasa-archive` | fixture/fallback data, `isFallback` flagged |
| NASA POWER / GIBS | — | server (`/api/earth/*`) | documented 504 / typed `not-configured` |
| NASA FIRMS | `FIRMS_MAP_KEY` | server | `{ ok:false, code:'not-configured' }`, never an estimate |
| YouTube Data API | `YOUTUBE_API_KEY` | server | curated catalogue or 503 |
| Supabase (auth + data) | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (or legacy `SUPABASE_ANON_KEY`), `SUPABASE_SERVICE_ROLE_KEY` | URL + publishable key via `/api/workspace/config`; service-role key **never leaves the server** | `/api/workspace/config` → `{enabled:false, reason}`; the UI says why |
| Vercel platform | `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF` | server | diagnostics show a shorter deployment block |

## 2. Environment audit — `npm run audit:env`

**26 variables · 0 undocumented · 0 referenced from browser code.**
`npm run audit:env -- --dist` additionally scans `dist/assets/*.js` for key
patterns (`AIza…`, `sk-…`, `arena-sk-…`, `gsk_…`, `sb_secret_…`,
`"role":"service_role"`) and for the literal value of any variable set in the
environment. Result: **clean**.

Variables referenced but not set in this sandbox (optional): `ARENA_API_KEY`,
`OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `NASA_API_KEY`,
`NEXT_PUBLIC_NASA_API_KEY`, `FIRMS_MAP_KEY`, `YOUTUBE_API_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`.

### Leak fixed
`src/utils/nasaApiClient.ts` resolved `process.env.NASA_API_KEY`,
`import.meta.env.VITE_NASA_API_KEY` and `VITE_PUBLIC_NASA_API_KEY` **in browser
code**. `process.env` does not exist in a Vite bundle, so it always fell back to
`DEMO_KEY` — but if anyone had "fixed" that with a `VITE_` variant, Vite would
have inlined the value into a public asset. The module now returns the public
`DEMO_KEY` unconditionally; real NASA traffic already goes through the server
proxies, where `NASA_API_KEY` belongs.

## 3. Backend findings and fixes

### 3.1 CORS could 403 real users (production-only)
The old middleware answered **403** to any request whose `Origin` was not listed
in `CORS_ORIGINS`. Two consequences:

- Browsers attach `Origin` to same-origin **POSTs**, so with `CORS_ORIGINS` set,
  chat and community submissions could fail from a Vercel **preview** deployment
  (every preview has a different hostname) while GETs kept working — a
  production-only failure that looks like "the AI is down".
- CORS is enforced by the browser; the 403 added an outage mode without adding
  protection.

Now: same-host, allow-listed and platform (Vercel) hostnames are echoed back;
anything else simply gets **no grant** and the browser refuses the read. The
request is never rejected for its `Origin`. See `server/cors.ts`.

### 3.2 API errors could be HTML
- Malformed JSON returned Express's HTML 400 page (with a stack in dev).
- Unknown `/api/*` paths returned an HTML 404.

Both now answer JSON: `INVALID_JSON` (400), `PAYLOAD_TOO_LARGE` (413),
`NOT_FOUND` (404), `INTERNAL_ERROR` (500) — and 5xx never echoes the error
object, because it can carry provider URLs or headers.

### 3.3 Cloud-config probe (from the previous fix, still relevant)
`/api/workspace/config` is probed with a 15 s timeout (was 8 s, shorter than a
normal cold start), the failure is no longer memoised for the session, and the
reason is one of `route-missing` / `server-error` / `invalid-response` /
`timeout` / `unreachable` / `not-configured`.

### 3.4 YouTube verification status (fixed in the previous commit)
`/api/youtube/meta` returned 404 + `code:"fetch failed"` for any upstream failure.
Now `VIDEO_NOT_FOUND` (404), `YOUTUBE_UNAVAILABLE` (502), `YOUTUBE_TIMEOUT` (504).

## 4. Reliability of the AI path (unchanged engine)

Already present and verified, not modified: per-hop timeout
`min(8 s, 18 s − elapsed)`, chain `arena → openrouter → gemini → local`,
`Retry-After` on 429, typed codes (`PROVIDER_AUTH_ERROR`, `UPSTREAM_RATE_LIMITED`,
`AI_TIMEOUT`, …), and an offline answer that names every hop that failed.
Automatic retries are deliberately **not** added on the server: a retry after a
provider already accepted a request risks double billing for no user benefit, and
the UI already offers Regenerate.

## 5. Verification

| Check | Command | Result |
| --- | --- | --- |
| Route contract (all 38) | `npm run test:api-routes` | 9/9 |
| Full suite | `npm test` | 276/276 → see final commit |
| Env + secret audit | `npm run audit:env -- --dist` | clean |
| Production build | `npm run build` | OK |
| Live deployment | `npm run check:apis -- <url>` | run where there is network |

## 6. Remaining issues

- **This sandbox has no outbound network**, so Vercel environment scoping,
  production logs and live provider keys could not be inspected. `check:apis`
  and `check:deployment` are the tools for that; they report names, statuses and
  verdicts, never values.
- **Rate limits are per serverless instance** (in-memory). With several warm
  lambdas the effective limit is `limit × instances`. Acceptable for this app;
  a shared store would be the fix if it ever matters.
- `SUPABASE_SERVICE_ROLE_KEY` is read only to detect a mis-scoped publishable
  key (conflict check). If the deployment never sets it, that check is simply
  skipped.
