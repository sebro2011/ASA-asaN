# API inventory and contract

Every route this app serves, what it needs, and how it is allowed to fail.
The machine-readable version is [`scripts/api-routes.mjs`](../../scripts/api-routes.mjs);
this page explains the rules it enforces.

## The four rules

1. **A route that exists answers JSON.** An HTML error page from an API path is a
   bug, because the client cannot parse it and falls into its generic branch.
2. **404 means "this route is not here", nothing else.** A video that YouTube says
   is gone is a 404; YouTube being unreachable is a **502**. Conflating the two is
   how an outage starts to look like "content deleted".
3. **5xx means the handler crashed.** Upstream failure is 502 (unreachable) or 504
   (timeout); missing credentials are 503. A 500 fails the contract test.
4. **Every failure is machine-readable.** `{ code }` for platform routes,
   `{ error: 'kebab-code' }` for the community router (legacy, tested). The UI must
   never have to match an English sentence.

## Running the checks

```bash
npm run test:api-routes                                  # in-process, no network, part of npm test
npm run check:apis -- https://your-app.vercel.app        # the same inventory against a deployment
```

`check:apis` prints one line per route, then splits the result into **degraded**
(200–503 with a documented reason: no keys, no upstream) and **failed** (route
missing, crash, HTML, wrong status). It exits non-zero only when something failed.

## What "degraded" is allowed to look like

| Route family | Without credentials / upstream | Why that is correct |
| --- | --- | --- |
| `/api/community/*` | 503 `community-unavailable` | Supabase is not configured on this deployment |
| `/api/earth/gibs/probe` | 504 `gibs-timeout` | The tile never answered; the code documents the timeout |
| `/api/earth/firms/hotspots` | 200 `{ ok:false, code:'not-configured' }` | FIRMS needs a free MAP_KEY; the answer is a status, not an error |
| `/api/youtube/meta?url=…` | 502 `YOUTUBE_UNAVAILABLE` | We could not reach YouTube — the video is not necessarily gone |
| NASA feeds (`/api/apod`, `/api/iss`, …) | 200 with fixture/fallback data | The app stays usable offline and says `isFallback` |

## The surface (41 routes)

**Platform** `GET /api/health` · `GET /api/nova/config` · `GET /api/nova/diagnostics` (and `?probe=1`) ·
`GET /api/workspace/config` · `GET /api/community/config`

**AI** `POST /api/nova/chat` · `POST /api/chat` · `POST /api/openrouter/chat` (legacy aliases) ·
`POST /api/translate`

**NASA** `GET /api/apod` · `/api/apod-range` · `/api/asteroids/neows` · `/api/epic` · `/api/exoplanets` ·
`/api/nasa-archive` · `/api/iss` · `/api/solar-weather` · `/api/satellites` ·
`/api/missions/grounded-search` · `/api/youtube/meta` · `/api/space-videos`

**News & papers** `GET /api/news` (Spaceflight News + GNews + NewsAPI + Guardian, aggregated and
deduped) · `/api/news/sources` (which keys are configured — booleans only) · `/api/news/papers`
(arXiv astro-ph). Keys: `GNEWS_API_KEY`, `NEWSAPI_KEY`, `GUARDIAN_NEWS_API_KEY` (alias:
`GUARDIAN_API_KEY`); the first and arXiv need none. The old hard-coded `/api/news` list was deleted.

**Earth** `GET /api/earth/health` · `/api/earth/power` · `/api/earth/gibs/domains` · `/api/earth/gibs/probe` ·
`/api/earth/firms/hotspots` · `POST /api/earth/analyst`

**Community** `GET /api/community/videos` · `/me` · `/moderation` ·
`POST /api/community/submissions` · `/videos/:id/report` · `/moderation/:id` ·
`/moderation/reports/:id/dismiss`

## Fixed while building this inventory

- `/api/youtube/meta` answered **404 with `code: "fetch failed"`** whenever YouTube
  could not be reached — a raw error string used as a code, and a status that
  claimed the video was deleted. It now separates `VIDEO_NOT_FOUND` (404),
  `YOUTUBE_UNAVAILABLE` (502) and `YOUTUBE_TIMEOUT` (504).
- `/api/translate` and `/api/missions/grounded-search` returned a 400 with no code;
  both now carry `code: "INVALID_REQUEST"`.
