# CosmoVision

CosmoVision is a lazy-loaded astronomy video destination at **`/cosmovision`**.
Existing **`/space-shorts`** links continue to open the same page, and other
state-based destinations remain unchanged. It provides a short-video feed and
a searchable, filterable gallery from multiple YouTube channels. It is an
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

- `GET /api/space-videos` accepts `mode=shorts|videos`,
  `category=all|missions|solar-system|universe|earth`, an optional `q` (maximum
  80 characters), and an optional `pageToken`. It accepts no arbitrary video
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

```sh
# Existing peer dependency conflict requires this flag in this checkout:
npm install --no-package-lock --legacy-peer-deps
npm run dev
# Open http://localhost:3000/cosmovision (or the legacy /space-shorts link)
npm run test:space-videos
npm run test:space-build-security
npm run lint
npm run build
```

`test:space-videos` uses a mocked upstream and needs no key or network. It
covers diverse fallback channels, astronomy relevance and anti-keyword-stuffing,
pagination, key secrecy, validation, metadata, channel identity, quota/errors,
upstream timeouts, deduplication, rate limiting and translation coverage.
`test:space-build-security` builds with a random, fake server-side sentinel and
checks build logs, the tracked server bundle and client artifacts for leakage;
no real key is used. Existing project tests are `test:nova-chat`, `test:earth`,
`test:ai-viewer`, and `test:earth-server`.

An optional browser test uses `playwright-core` and a Chromium executable; it
mocks the YouTube player API and blocks service workers for deterministic UI
checks rather than claiming to test real playback. It checks, among other cases,
that a pending pagination response cannot overwrite a newly selected filter.
Start a keyless server in a separate terminal with `YOUTUBE_API_KEY= npm run dev`,
then, for example:

```sh
npm install --no-save --no-package-lock --legacy-peer-deps playwright-core
CHROMIUM_PATH=/path/to/chromium node scripts/test-space-ui.mjs
```

Alternatively install `@sparticuz/chromium` alongside `playwright-core` and omit
`CHROMIUM_PATH` where the platform supports its runtime libraries. Set
`SPACE_TEST_BASE` if the dev server uses another URL. Existing optional jsdom
smoke scripts can be run after installing `jsdom` without saving it. Real
YouTube playback, captions and geographic availability still need a manual
check on a network that can reach YouTube. Live search separately requires a
configured API key.

There is no community-upload implementation: the repository has no existing
moderated upload/auth/storage infrastructure, and this feature does not accept
or rehost user-submitted video URLs.
