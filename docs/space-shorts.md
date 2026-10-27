# Space Shorts

Space Shorts is a lazy-loaded destination at **`/space-shorts`**. The existing
state-based destinations remain unchanged. It provides a portrait player for
short videos and a searchable, filterable video gallery. It is an independent
interface, not a NASA or YouTube product. The decorative Earth banner is an
AI-generated illustration, labelled in the interface; video thumbnails and
metadata come from the sources described below.

## Enable YouTube search

1. Create or select a Google Cloud project and enable **YouTube Data API v3**.
2. Create an API key and restrict it to YouTube Data API v3. Apply an appropriate
   server-side restriction where your hosting setup supports it. Do not use a
   browser/Vite key.
3. Set `YOUTUBE_API_KEY` **only on the server**, e.g. in an untracked `.env` for
   `npm run dev`, or as a server environment variable in the Vercel project.
   Never commit it, put it in a `VITE_` variable, or send it to the browser.
4. Restart the server after changing the key. A deployment requires a new build
   and the configured server environment. Do not deploy without authorization.

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
by YouTube and the video owner, not by this app.

## Data and quota behavior

- `GET /api/space-videos` accepts `mode=shorts|videos`,
  `category=all|missions|solar-system|universe|earth`, an optional `q` (maximum
  80 characters), and an optional `pageToken`. It accepts no arbitrary video
  URLs. IDs and upstream metadata are validated; live API results that are
  unlisted, private, unprocessed, live/upcoming or non-embeddable are omitted.
  The keyless starter collection cannot re-check availability dynamically.
  Matches are checked against the displayed title, description and channel name. Titles and
  descriptions retain their original language.
- Live results use YouTube Data API `search.list` followed by `videos.list` for
  actual metadata and embed status. The key is sent in the server request's
  `x-goog-api-key` header, not in its URL. Verified NASA channel IDs are prioritized;
  a channel is **not** treated as official merely because its name says NASA.
- YouTube's `videoDuration=short` means less than four minutes; it does **not**
  guarantee portrait orientation or official Shorts classification. The live
  short-video UI says so and also rejects known durations of four minutes or
  longer. The three NASA starter videos were individually checked against
  NASA's portrait releases.
- Successful results are cached for 10 minutes in a bounded, per-process cache
  and concurrent identical requests share one upstream request. There is a
  per-IP limit of 30 requests/minute and a per-process limit of 30 uncached
  YouTube searches/minute. These are protective measures, not a strict global
  budget: instances and serverless cold starts do not share memory. Proxy IP
  behavior depends on the host. For substantial public traffic, add a shared
  cache, distributed rate limiter and a project-level quota/budget alert.
  `search.list` is quota-expensive (100 units per call); `videos.list` costs
  additional quota. The generic service worker is prevented from caching this
  endpoint as stale shell data.
- The starter collection links each ID to its source page, mostly from NASA's
  Scientific Visualization Studio and one from ESA's science portal. Starter
  descriptions are short agency-source summaries; unknown dates, durations and
  other metadata are omitted rather than invented. The NASA social directory
  and JPL social directory identify the agency's official channels. Some
  historical titles remain as originally published, even where a mission has
  since flown. The fallback catalog should be periodically reviewed for video
  removal or changed embed permissions.

## Local development and tests

```sh
# Existing peer dependency conflict requires this flag in this checkout:
npm install --no-package-lock --legacy-peer-deps
npm run dev
# Open http://localhost:3000/space-shorts
npm run test:space-videos
npm run lint
npm run build
```

`test:space-videos` uses a mocked upstream and needs no key or network. It
covers fallback, filtering, pagination, key secrecy, validation, metadata,
channel identity, quota/errors, deduplication, rate limiting and translation
coverage. Existing project tests are `test:nova-chat`, `test:earth`,
`test:ai-viewer`, and `test:earth-server`.

An optional browser test uses `playwright-core` and a Chromium executable; it
mocks the YouTube player API and blocks service workers for deterministic UI
checks rather than claiming to test real playback. Start a keyless server in a
separate terminal with `YOUTUBE_API_KEY= npm run dev`, then, for example:

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
