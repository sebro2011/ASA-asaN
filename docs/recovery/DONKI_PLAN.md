# Implementation plan — NASA DONKI integration

Status: **plan only, no code written.** DONKI does not exist in this repository
today; nothing here is a claim that it does.

Branch to use: `feat/donki-space-weather` (separate branch, per the preservation
rules — this session is pinned to `arena/39123449-asa-asan`, so branch creation is
yours to do).

---

## 1. What DONKI is, and what we will show

DONKI (Database Of Notifications, Knowledge, Information) is NASA's space-weather
event database, served by `https://api.nasa.gov/DONKI/`. Relevant endpoints:

| Endpoint | Content | Notes |
| --- | --- | --- |
| `/DONKI/CME` | Coronal mass ejections | start/end date (max 30-day window per request) |
| `/DONKI/CMEAnalysis` | CME speed/type analysis | pairs with `CME` by `activityID` |
| `/DONKI/FLR` | Solar flares | class (A/B/C/M/X), begin/peak/end |
| `/DONKI/GST` | Geomagnetic storms | Kp index observations, linked `linkedEvents` |
| `/DONKI/notifications` | Raw notification stream | optional; heavier payload |

All require `api_key` (`DEMO_KEY` works with tighter limits). Every response is
public scientific data — **no new dependency, no new provider, no secret beyond the
existing `NASA_API_KEY`**.

**Non-goal:** predicting events. DONKI reports what was observed, with timestamps
and source links. The UI must never phrase an observation as a forecast.

---

## 2. Server layer (mirrors the existing NASA proxy pattern)

New router `server/donki.ts`, mounted at `/api/donki` in `server.ts` **and** rebuilt
into `api/index.js` (`npm run build:api`, automatic in `npm run build`).

| Route | Upstream | Cache | Rate limit |
| --- | --- | --- | --- |
| `GET /api/donki/cme?start=&end=` | `DONKI/CME` | 10 min (in-memory, per window) | 30/min/IP |
| `GET /api/donki/flares?start=&end=` | `DONKI/FLR` | 10 min | 30/min |
| `GET /api/donki/storms?start=&end=` | `DONKI/GST` | 10 min | 30/min |
| `GET /api/donki/timeline?start=&end=` | the three above, merged server-side | 10 min | 20/min |

Rules baked into the router (same contract as the rest of the API):

- Window validation: max 30 days, `end ≥ start`, ISO `YYYY-MM-DD`, else
  `400 { code: 'INVALID_RANGE' }`.
- Upstream failure → `502 { code: 'DONKI_UNAVAILABLE' }`; timeout → `504
  { code: 'DONKI_TIMEOUT' }`; 429 → proxied `UPSTREAM_RATE_LIMITED` with
  `Retry-After`. Never a fabricated event array.
- Response items are normalised to one shape:
  `{ id, type: 'CME' | 'FLR' | 'GST', startTime, peakTime, endTime, summary,
  severity?, sourceUrl, instruments?, linkedIds[] }`.
- `NASA_API_KEY` is read server-side only (`DEMO_KEY` fallback), exactly like
  `/api/apod`.

## 3. Client layer

| File | Purpose |
| --- | --- |
| `src/components/SpaceWeather.tsx` | Tab shell: Timeline · CME · Flares · Storms |
| `src/components/spaceWeather/EventTimeline.tsx` | Vertical timeline, one row per event, severity colour-coded by *class*, not by invented risk |
| `src/components/spaceWeather/EventDetail.tsx` | Instrument, linked events, source link, plain-language explanation |
| `src/components/spaceWeather/NotificationBell.tsx` | Optional: "new since your last visit" using `localStorage` watermark — **no push, no email** in v1 |

Registration: a new destination in `src/ui/navigation.ts` (`id: 'weather'`,
group `system`) and a lazy import in `ExploreApp.tsx` — the same pattern as
`SolarWeather`, which already exists and stays untouched until DONKI replaces its
data source in a later step.

Accessibility: the timeline is a `role="list"`; severity is never colour-only (a
letter class `M5.1` is always present); the detail panel is a labelled region.

## 4. Localisation

New keys in `en` / `si` / `ta` (all three, non-negotiable — the repo has a parity
test):

`wxTitle`, `wxTabTimeline`, `wxTabCme`, `wxTabFlares`, `wxTabStorms`,
`wxEmptyRange`, `wxLoading`, `wxErrorUnavailable`, `wxErrorTimeout`,
`wxSeverityClass`, `wxSourceNasa`, `wxExplanationCme`, `wxExplanationFlare`,
`wxExplanationStorm`, `wxNewSinceVisit`, `wxRangeLabel`.

Scientific terms stay untranslated (`CME`, `Kp`, `M-class`); the surrounding
sentence is translated.

## 5. Tests (definition of done)

1. `scripts/test-donki.mjs` — router contract with a stubbed `fetchImpl`:
   window validation, normalisation, caching (second call does not hit upstream),
   timeout → 504, upstream 500 → 502, 429 passthrough with `Retry-After`.
2. Route added to `scripts/api-routes.mjs` (in-process contract test picks it up).
3. DOM test: an empty window renders the empty state; a failure renders retry.
4. i18n parity test for the 16 new keys.
5. `npm test`, `npm run build`, then a real browser pass (checklist §2).

## 6. Rollout

1. Router + tests on the feature branch (no UI). 2. Timeline UI behind the new tab.
3. Replace `SolarWeather`'s data source only after DONKI parity is proven, in its
own commit. 4. Delete nothing.

## 7. Risks

- DONKI payloads are large and irregular; the 30-day window and server-side cache
  are what keep the client cheap.
- `DEMO_KEY` is rate-limited hard; production should set `NASA_API_KEY` (already
  documented in `.env.example`).
- Event times are UTC; the UI must render a timezone explicitly, never a bare clock.
