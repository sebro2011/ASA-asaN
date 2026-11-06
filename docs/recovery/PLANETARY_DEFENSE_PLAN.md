# Implementation plan — Planetary Defense Dashboard

Status: **plan only, no code written.** No dedicated Planetary Defense module exists
in this repository; `AsteroidRadar.jsx` (NeoWs) is the closest surface and is the
foundation this plan builds on, not a replacement for it.

Branch to use: `feat/planetary-defense`.

---

## 1. Data sources (authoritative only)

| Source | Endpoint | Used for |
| --- | --- | --- |
| NASA NeoWs feed | `GET /api/asteroids/neows` (already proxied) | close approaches within a date window |
| NASA NeoWs browse | `api.nasa.gov/neo/rest/v1/neo/browse` | object catalogue, physical parameters |
| NASA NeoWs lookup | `api.nasa.gov/neo/rest/v1/neo/{id}` | per-object detail (orbit class, velocity, size range) |
| NASA Sentry (CNEOS) | `https://ssd-api.jpl.nasa.gov/sentry.api` | impact-risk *watchlist*, Palermo/Torino scale |
| JPL SBDB Close-Approach Data | `https://ssd-api.jpl.nasa.gov/cad.api` | historical + future close approaches |

Sentry and CAD are public JPL endpoints with no key; NeoWs uses the existing
`NASA_API_KEY` (`DEMO_KEY` fallback). Two new server proxies are needed
(`/api/defense/sentry`, `/api/defense/approaches`) following the same contract as
every other route: validated window, cached, typed errors, never invented rows.

## 2. Scientific honesty rules (hard requirements)

These are product requirements, not style notes:

1. **No prediction without a named source.** Every risk number is labelled with the
   dataset it came from and the date it was retrieved.
2. **Torino scale, not adjectives.** Show the numeric Torino/Palermo value and the
   official definition; never "dangerous asteroid".
3. **The default answer is "no known threat".** NASA's Sentry list is empty most
   days; an empty list is rendered as a positive, explicit statement, not a blank
   panel.
4. **Distinguish approaches from risks.** A close approach is not an impact. The two
   live in separate sections with separate explanations.
5. **Never aggregate numbers we did not receive.** No estimated probabilities, no
   interpolated sizes, no "chance" arithmetic of our own.
6. **Units always.** km, lunar distances (LD), km/s, metres/metres range.

## 3. Dashboard structure

```
/api/defense/summary      → counts + retrieval timestamps (server-side merge)
/api/defense/approaches   → CAD rows for the selected window (±7/30 days)
/api/defense/sentry       → current Sentry watchlist (usually empty)
/api/defense/object/:id   → NeoWs lookup pass-through
```

| Section | Content | Empty state |
| --- | --- | --- |
| Watchlist | Sentry objects, Torino/Palermo, diameter range, source link | "No object is currently on NASA's impact-risk list." |
| Close approaches | Next 30 days, distance in LD + km, relative velocity, size range, hazard flag from NeoWs | "No close approaches in this window." |
| Historical events | Known impact/airburst events with authoritative references (e.g. Chelyabinsk 2013 — 20 m class) | n/a |
| Learn | What Torino/Palermo mean, why most near-misses are harmless, how detection works | n/a |

Each row links to the JPL/NASA page for the object — the source of truth.

## 4. Client files

```
src/components/defense/PlanetaryDefense.tsx      tab shell + summary band
src/components/defense/SentryWatchlist.tsx       risk list (empty-state first)
src/components/defense/CloseApproachTable.tsx    sortable, virtualised if >50 rows
src/components/defense/ObjectDetail.tsx          orbit class, size, velocity, provenance
src/components/defense/RiskExplainer.tsx         Torino/Palermo in plain language
src/components/defense/ImpactHistory.tsx         historical events
```

Registered as a new destination `id: 'defense'` (group `system`) in
`src/ui/navigation.ts` + a lazy import in `ExploreApp.tsx`. `AsteroidRadar` stays
and can deep-link into the new dashboard.

Visualisations: reuse the existing chart stack (recharts is already a dependency) for
"distance vs. date" — no new library.

## 5. Accessibility & localisation

- Tables are real `<table>`s with `<caption>` and scope; sortable headers expose
  `aria-sort`.
- Colour never carries risk alone: Torino value + label are always text.
- New keys in `en`/`si`/`ta`: `pdTitle`, `pdWatchlist`, `pdEmptyWatchlist`,
  `pdApproaches`, `pdEmptyApproaches`, `pdDistanceLd`, `pdVelocity`, `pdDiameter`,
  `pdTorino`, `pdPalermo`, `pdSource`, `pdRetrieved`, `pdLearnTitle`,
  `pdHistoryTitle`, `pdDisclaimer`, `pdObjectDetail`.
- The disclaimer sentence ("Data retrieved from NASA/JPL on …; this app does not
  make impact predictions") sits under the summary band and is not dismissible.

## 6. Tests (definition of done)

1. `scripts/test-defense.mjs` — proxy contract against stubbed upstreams: empty
   Sentry list renders the positive empty state; upstream failure is 502 with a
   code; window validation; caching.
2. DOM test — a row with Torino 0 shows "No hazard" text, and no wording from a
   banned list (`dangerous`, `will hit`, `apocalypse`) appears anywhere in the
   rendered output. This is a regression guard for rule 2/4.
3. Route entries added to `scripts/api-routes.mjs`.
4. i18n parity for the new keys.
5. `npm test` + `npm run build`, then browser pass on desktop and phone.

## 7. Rollout

1. Server proxies + contract tests (no UI). 2. Watchlist + empty state.
3. Close approaches + object detail. 4. History + explainer. 5. Cross-link from
`AsteroidRadar`. Nothing removed at any step.

## 8. Risks

- JPL endpoints are outside our control and occasionally rate-limit; caching plus a
  typed error is the whole mitigation.
- Sentry is usually empty — a dashboard that looks "broken" when the news is good is
  the main UX risk, which is why the empty state is the primary design.
- Numbers that look authoritative invite misuse: keep the retrieval timestamp and
  the source link adjacent to every figure.
