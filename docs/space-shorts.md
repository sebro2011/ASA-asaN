# CosmoVision

CosmoVision is a lazy-loaded astronomy video destination at **`/cosmovision`**.
Existing **`/space-shorts`** links continue to open the same page, and other
state-based destinations remain unchanged. It provides a short-video feed and
a searchable, filterable gallery from multiple YouTube channels, with All,
Space Shorts, NASA and Community tabs. All combines YouTube/starter results
with approved community results when the community backend is available; it
explicitly reports when community results could not be loaded. It is an
independent interface, not a NASA or YouTube product. The decorative Earth
banner is an AI-generated illustration, labelled in the interface; video
thumbnails and metadata come from the sources described below.

## Enable YouTube search

1. Create or select a Google Cloud project and enable **YouTube Data API v3**.
2. Create an API key and restrict it to YouTube Data API v3. Apply an appropriate
   server-side restriction where your hosting setup supports it. A browser
   referrer restriction is not suitable for these server-to-server requests.
3. The repository's production homepage and GitHub deployments use **Vercel**.
   In the Vercel dashboard, open the project serving that homepage, then go to
   **Settings → Environment Variables**. Add `YOUTUBE_API_KEY` as a secret for
   **Production** and, if needed, **Preview**. The Express function at
   `api/index.js` reads it at runtime through the `/api/*` rewrite. Do not use a
   `VITE_` prefix or share the value in chat, browser code, logs or Git.
4. For local `npm run dev`, set the same server variable in an untracked `.env`
   and restart the server. Vercel environment changes apply only to new
   deployments; a redeployment is required, but **do not deploy without
   authorization**. The repository alone cannot reveal whether the Vercel
   variable is configured or valid. The repository also has Netlify deploy
   previews documented as static-only; setting the variable there alone does
   not provide this Express API.

With no key, the endpoint returns a clearly labelled, hand-picked starter
collection; the page does **not** pretend those results are live. A key-configuration,
quota, network or upstream error on the first page also produces a labelled fallback.
If a later YouTube page fails, the existing results are retained and the user
can retry instead of silently mixing in starter videos. If the app's own server
is unreachable, the page offers an error and retry.

The server must be able to reach `www.googleapis.com`. Viewers need access to
`i.ytimg.com` for thumbnails and to YouTube's iframe API and player domains for
playback. Some countries, browsers, extensions or networks block these hosts.
The official player reports playback restrictions when possible and an ordinary
YouTube link is always provided. Thumbnail requests occur before playback;
YouTube's iframe API and `youtube-nocookie.com` player are loaded only after a
viewer selects a video. Native YouTube controls provide pause/play, volume,
full screen and captions when the creator supplies them. Playback starts muted.
Video availability, captions, regional restrictions and embeds are controlled
by YouTube and the video owner, not by this app. A stalled app request ends in
an error after 20 seconds; an iframe that never becomes ready ends in a player
error after 15 seconds, with retry and a YouTube link.

## Data and quota behavior

- `GET /api/space-videos` accepts `mode=shorts|videos`, `scope=all|nasa`,
  `category=all|missions|solar-system|universe|earth`, an optional `q` (maximum
  80 characters), and an optional `pageToken`. The NASA scope searches the exact
  official `@NASA` channel in live discovery; its starter fallback includes
  individually verified NASA channels such as Goddard. It accepts no arbitrary video
  URLs. IDs and upstream metadata are validated; live API results that are
  unlisted, private, unprocessed, live/upcoming or non-embeddable are omitted.
  The keyless starter collection cannot re-check availability dynamically.
  Searches are checked against the displayed title, description and channel
  name. Titles and descriptions retain their original language. Astronomy
  relevance is filtered separately using title and opening-description terms,
  with hashtags and links ignored to reduce keyword stuffing. Common off-topic
  matches (such as gaming, astrology and phone reviews) are excluded. This
  conservative heuristic is not a semantic classifier: it may miss relevant
  videos or include unrelated ones, and it works best with English, Sinhala and
  Tamil metadata. The UI discloses this limitation. An empty filtered YouTube
  page may still have a next page.
- Live results use YouTube Data API `search.list` followed by `videos.list` for
  actual metadata and embed status. The key is sent in the server request's
  `x-goog-api-key` header, not in its URL. Searches cover all channels and retain
  YouTube's relevance order rather than prioritizing NASA. A channel is **not**
  treated as an official agency merely because its name says NASA. Continuation
  tokens from YouTube are wrapped separately from `c_` starter offsets and
  decoded only on the server; previously issued raw tokens remain accepted.
- YouTube's `videoDuration=short` means less than four minutes; it does **not**
  guarantee portrait orientation or official Shorts classification. The live
  short-video UI says so and also rejects known durations of four minutes or
  longer. No live item is identified as an official Short. Starter videos were
  selected from short-video listings and NASA's portrait releases, but an
  indexed listing or `#shorts` title is not authoritative proof of official
  Shorts classification. The format of non-NASA entries is not asserted to be
  portrait.
- Successful results are cached for 10 minutes in a bounded, per-process cache
  and concurrent identical requests share one upstream request. There is a
  per-IP limit of 30 requests/minute and a per-process limit of 30 uncached
  YouTube searches/minute. These are protective measures, not a strict global
  budget: instances and serverless cold starts do not share memory. Proxy IP
  behavior depends on the host. For substantial public traffic, add a shared
  cache, distributed rate limiter and a project-level quota/budget alert.
  Express's `req.ip` depends on trusted-proxy configuration, so requests behind
  a shared proxy may be counted together. Google's [quota documentation](https://developers.google.com/youtube/data/determine_quota_cost)
  (updated 2026-10-15) describes a default separate `search.list` bucket of
  100 calls/day, costing one unit per call; `videos.list` costs one additional
  unit in the other-endpoints bucket. Each additional page is another search
  call. Check the project's actual limits in Google Cloud. The service worker is
  prevented from caching this endpoint as stale shell data.
- The starter collection includes NASA Goddard, ESA, CrashCourse, PBS Space
  Time, Dr. Becky and Astrum. The source link on each entry identifies the work;
  its video ID and channel are checked against source embeds or matching indexed
  YouTube listings. Starter descriptions are short summaries, while unknown
  dates, durations and aspect ratios are omitted rather than invented. The
  NASA social directory and JPL social directory identify official channels. Some
  historical titles remain as originally published, even where a mission has
  since flown. The fallback catalog should be periodically reviewed for video
  removal or changed embed permissions.

## Local development and tests

Use Node.js 22 or newer for the server and Supabase client. The checked-in
`bun.lock` is refreshed for the optional community dependencies and supports a
frozen Bun install. Alternatively, the existing npm peer dependency conflict
requires the flag below:

```sh
npm install --no-package-lock --legacy-peer-deps
npm run dev
# Open http://localhost:3000/cosmovision (or the legacy /space-shorts link)
npm run test:space-videos
npm run test:community
npm run test:space-build-security
npm run lint
npm run build
```

`test:space-videos` uses a mocked upstream and needs no key or network. It
covers diverse fallback channels, astronomy relevance and anti-keyword-stuffing,
pagination, key secrecy, validation, metadata, channel identity, quota/errors,
upstream timeouts, deduplication, rate limiting and translation coverage.
`test:community` exercises mocked Auth/PostgREST and YouTube route behavior,
plus the actual SQL migration in an embedded PostgreSQL-compatible engine. It is
not a live Supabase test. `test:space-build-security` builds with random, fake
server-side sentinels and checks build logs, the tracked server bundle and client
artifacts for leakage; no real key is used. Existing project tests are `test:nova-chat`, `test:earth`,
`test:ai-viewer`, and `test:earth-server`.

An optional browser test uses `playwright-core`, `axe-core`, and a Chromium
executable. It mocks the YouTube player and community service and blocks
service workers for deterministic UI checks rather than claiming to test real
playback, Supabase or YouTube network access. It exercises tabs, forms,
moderation/reporting states, keyboard interaction, translations, mobile widths,
focus handling, accessibility rules and independent source pagination. Start a
keyless server in a separate terminal with `YOUTUBE_API_KEY= npm run dev`, then:

```sh
npm install --no-save --no-package-lock --legacy-peer-deps playwright-core axe-core
CHROMIUM_PATH=/path/to/chromium node scripts/test-space-ui.mjs
```

Alternatively install `@sparticuz/chromium` alongside `playwright-core` and omit
`CHROMIUM_PATH` where the platform supports its runtime libraries. Set
`SPACE_TEST_BASE` if the dev server uses another URL. Existing optional jsdom
smoke scripts can be run after installing `jsdom` without saving it. Real
YouTube playback, captions and geographic availability still need a manual
check on a network that can reach YouTube. Live search separately requires a
configured API key.

## Community submissions: setup and operation

The repository did not previously have authentication or durable storage. The
optional community feature is implemented for **Supabase Auth and Postgres**,
but it is **disabled until a real project is configured**. The gallery still
works without it. No video files are uploaded or rehosted; the file option
explains that secure storage and processing are not configured. A YouTube link
submission is acknowledged only after the database confirms a pending record.

1. Create or select a Supabase project. On a fresh project, review and run
   `supabase/cosmovision.sql` in the SQL editor as project owner. Back up existing
   projects first; `create table if not exists` is not an upgrade migration for
   an older, differently shaped schema. The script creates the private videos,
   reports, moderators and shared rate-limit tables, their constraints, and
   transactional moderation functions.
2. Enable Supabase email/password Auth, require email confirmation, configure
   the site URL and allow the `/cosmovision` confirmation redirect for each
   intended origin. Configure Supabase's Auth rate limits, CAPTCHA/abuse
   protection, password policy and email provider before opening registration.
   Consider MFA and a documented recovery process for moderators. The UI keeps
   sessions in memory only, so users sign in again after a reload or tab close.
3. Add `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (or legacy
   `SUPABASE_ANON_KEY`), and `SUPABASE_SERVICE_ROLE_KEY` to the **server**
   environment, along with `YOUTUBE_API_KEY`. The Supabase URL must be an HTTPS
   project origin. The publishable/anon key is intentionally returned by
   `/api/community/config` for browser Auth; it is not a service credential.
   Never put a Supabase secret/service-role key in the publishable variable,
   `VITE_*`, source control, logs, chat, or client code. The server rejects
   recognizable secret/service-role keys in the public-key slot. Configure the
   proper Vercel environment scopes and deploy only with explicit authorization.
4. Create a trusted moderator in Supabase Auth, then grant that existing user's
   UUID a row in `public.cosmovision_moderators` using the SQL editor. The
   commented example in the migration shows the shape; never commit real user
   identifiers or credentials. Moderator authorization is checked on the server
   against this table for every moderation operation, and checked again inside
   the transactional database functions. Revoke a moderator by deleting that
   row. Use the UI's Moderation button after signing in to approve or reject
   pending links, dismiss reports, and take down approved links.
5. Verify end-to-end against the configured project before enabling public
   use: sign-up/confirmation, authenticated submission, duplicate detection,
   non-moderator denial, approval, public visibility, reporting, dismissal,
   takedown, rate limits, regional playback and key secrecy. A config flag only
   says variables are present; it does not prove that the schema, keys or Auth
   settings are operational. The repository's tests use mocks and an embedded
   PostgreSQL-compatible engine, not a live Supabase project.

The server strictly accepts HTTPS `youtube.com/watch?v=…`,
`youtube.com/shorts/…`, or `youtu.be/…` links, extracts an 11-character ID, and
never fetches or embeds the supplied URL. It uses YouTube Data API v3 to check
that the ID is public, processed and embeddable and to retrieve the actual
channel identity before inserting it as **pending**. Title (3–160 characters),
description (10–2000) and topic are submitted by the user and are reviewed by a
moderator; they are rendered as plain React text, not HTML. The database has a
unique video ID across all review states, including rejected entries. Only
approved entries appear in public lists; video availability may change later.
The owner can see their Pending review, Approved, and Rejected statuses. Reports
are private to moderators and limited to approved community entries. For videos
from ordinary YouTube discovery, use YouTube's own reporting tools.

### Community endpoints and security

All endpoints are same-origin under `/api/community` and send `Cache-Control:
no-store`. Authentication uses a bearer token obtained directly from Supabase
Auth; the server calls Supabase to verify the token and does not trust decoded
JWT role claims. Public responses contain no submitter IDs, email addresses or
reporter IDs.

- `GET /config`: returns `{enabled:false}` without configuration, or the
  Supabase project URL and **public** publishable/anon key.
- `GET /videos?category=…&q=…&pageToken=…`: approved entries only; page size 12.
  Offset pagination can shift if moderation changes the collection mid-scroll;
  the UI deduplicates IDs. The All tab tracks YouTube and community pagination
  separately and never silently replaces a failed later page with unrelated data.
- `GET /me`: authenticated user's statuses and server-checked moderator flag.
- `POST /submissions`: authenticated YouTube link, title, description and topic;
  returns `201 {status:"pending"}` only after confirmed database insertion.
- `POST /videos/:id/report`: authenticated report on an approved entry.
- `GET /moderation`: moderator-only pending queue, open reports and approved
  entries. Each list is capped at 100; oldest pending items appear first and the
  latest approved items appear first. Older approved entries can still be
  reviewed through reports or the project database; operational tooling should
  add pagination before relying on this at larger scale.
- `POST /moderation/:id`: moderator-only `approve`, `reject`, or `takedown`.
  `POST /moderation/reports/:id/dismiss` resolves an open report. Takedown changes
  an approved item to rejected and resolves its open reports in one transaction.

The SQL enables RLS and revokes direct table/function access from public,
`anon`, and `authenticated` roles; only the server's service role can access
these tables. Supabase's service credential bypasses RLS and must be guarded as
highly privileged. PostgreSQL-backed per-account limits apply across serverless
instances: five submission attempts, 20 reports, and 100 moderation operations
per hour. An additional 80-requests/minute IP guard is per process only; it is
not a distributed WAF and shared proxy addresses may be grouped together.
Configure platform-level abuse protection, quota alerts, database backups,
privacy/retention policy and operational monitoring for production. These limits
cannot replace Supabase Auth protections or moderation. Never expose a service
key to untrusted clients. The legacy service worker bypasses these API routes.

A real file-upload capability is deliberately not implemented. It would require
separate protected direct-to-storage uploads, size/type limits, server-side
content validation and malware/media processing, lifecycle cleanup, secure
playback, storage policy and demonstrable upload progress. Until those pieces
are designed and configured, no file input or simulated upload is offered.
