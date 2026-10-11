# Earth Intelligence Lab — Upgrade Plan & Verification Log

NASA Space Explorer (React 19 + Vite + Express). The **Earth Intelligence Lab**
(SYS.13 / `activeTab === 'earth'`) is upgraded in place. No other page, route, or
navigation entry is replaced.

## 1. Existing implementation (inspection summary)

| Area | Finding |
| --- | --- |
| Framework | React 19, Vite 8, Tailwind 4 (`@tailwindcss/vite`), Express 4 (`server.ts`) |
| Routing | Single-page tab state in `src/App.tsx` (`TabKey`), no router |
| Earth Lab | `src/components/EarthIntelligenceLab.jsx` (896 lines) — NASA POWER monthly point API, 3 fixed locations, recharts temperature/rainfall charts, stat cards, empty/error/loading states |
| Server APIs | `/api/apod`, `/api/apod-range`, `/api/asteroids/neows`, `/api/epic`, `/api/exoplanets`, `/api/translate`, `/api/news`, `/api/nasa-archive`, `/api/iss`, `/api/solar-weather`, `/api/satellites`, `/api/missions/grounded-search`, `/api/nasa-ai`, `/api/gemini-live-token` (+ `/ws/live`), SPA fallback |
| AI | `@google/genai` (`GoogleGenAI`) on the server only; keys read from `process.env` (`GEMINI_API_KEY`); client never sees a key |
| Mapping | `leaflet@1.9.4` + `@types/leaflet` already dependencies (used by `ISSTracker.jsx`); Leaflet CSS loaded from unpkg in `index.html` |
| 3D | `three`, `@react-three/fiber`, `@react-three/drei` already dependencies (`Space3DViewer`, `HeroBackgroundEarth`) |
| Charts | `recharts@3.10.1` |
| i18n | `src/i18n.ts` (en / si / ta), `react-i18next` |
| Perf hooks | `src/hooks/useDevicePerformance.ts` (cores, RAM, software-WebGL detection → 2D fallback mode) |
| Design system | Cosmic dark slate-950 glass panels, cyan/lime accents, Orbitron headings, `src/globals.css` |
| Lint / build | `npm run lint` = `tsc --noEmit`; `npm run build` = `vite build`; no test runner in repo |

## 2. Reused vs. added

Reused (no change): tab wiring in `App.tsx`, NASA POWER monthly service, `recharts`,
Leaflet + `@types/leaflet`, `three` stack, `useDevicePerformance`, i18n mechanism,
glass-panel design system, Express + `@google/genai` server, existing endpoint
patterns (`/api/missions/grounded-search` grounding + cache + fallback shape).

Added (no existing API replaced):

- `src/lib/earth/*` — typed data layer: verified GIBS catalog, GIBS availability
  (DescribeDomains) parsing, POWER client with progressive degradation, cache,
  deterministic analysis engine, grounded context/report builder, geocoder.
- `src/components/earth/*` — Leaflet GIBS map, two-date compare (side-by-side + swipe),
  trend detective, Sri Lanka watch, AI analyst panel, provenance panel, lazy 3D globe.
- `server/earthIntelligence.ts` — `/api/earth/*` router (POWER proxy, GIBS domain
  probe, FIRMS key-gated proxy, AI analyst with deterministic fallback). Registered
  with a single `app.use` line in `server.ts`; runs alongside existing endpoints.
- `src/i18n/earthIntelligence.ts` — new keys merged into the existing resources.
- `scripts/test-earth-intelligence.mjs` — `node:test` suite for the pure data logic.
- `docs/EARTH_INTELLIGENCE_LAB_UPGRADE.md` — this plan + verification log + report.

## 3. Data services (validated 2026-10-11)

| Service | Endpoint | Key | Role |
| --- | --- | --- | --- |
| NASA GIBS WMTS | `gibs.earthdata.nasa.gov/wmts/epsg3857/best/...` | none | imagery tiles |
| NASA GIBS WMS | `gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi` | none | raster output for vector-derived layers (fires) |
| GIBS DescribeDomains | `.../wmts/epsg3857/best/1.0.0/{layer}/default/{tms}/all/all.xml` | none | authoritative per-layer observation date domain |
| NASA POWER | `power.larc.nasa.gov/api/temporal/monthly/point` | none | monthly climate/land time series |
| NASA FIRMS | `firms.modaps.eosdis.nasa.gov/api/area/csv/...` | `FIRMS_MAP_KEY` (optional) | hotspot counts — enabled **only** if an operator configures the key |
| Nominatim | `nominatim.openstreetmap.org/search` | none | place search (falls back to built-in gazetteer) |
| Google Gemini | `@google/genai` via server | `GEMINI_API_KEY` (optional) | interpretation layer over retrieved data |

### Verified GIBS layers (EPSG:3857, `DescribeDomains` probe)

| Layer | TileMatrixSet | Domains reported |
| --- | --- | --- |
| `MODIS_Terra_CorrectedReflectance_TrueColor` | `GoogleMapsCompatible_Level9` | 2000-02-24 → 2026-10-11 |
| `MODIS_Aqua_CorrectedReflectance_TrueColor` | `GoogleMapsCompatible_Level9` | 2002-07-03 → 2026-10-11 |
| `VIIRS_SNPP_CorrectedReflectance_TrueColor` | `GoogleMapsCompatible_Level9` | 2015-11-24 → 2026-10-11 |
| `VIIRS_NOAA20_CorrectedReflectance_TrueColor` | `GoogleMapsCompatible_Level9` | 2018-01-05 → 2026-10-11 |
| `MODIS_Terra_NDVI_8Day` | `GoogleMapsCompatible_Level9` | 2025-02-12 → 2026-10-10 (limited history) |
| `MODIS_Terra_Land_Surface_Temp_Day` | `GoogleMapsCompatible_Level7` | 2000-02-24 → 2026-10-11 |
| `MODIS_Terra_L3_NDSI_Snow_Cover_Daily` | `GoogleMapsCompatible_Level8` | 2000-02-24 → 2026-10-08 |
| `MODIS_Combined_Flood_2-Day` | `GoogleMapsCompatible_Level8` | 2021-01-01 → 2026-10-11 |
| `MODIS_Terra_L2_Chlorophyll_A` | `GoogleMapsCompatible_Level7` | 2000-02-24 → 2026-10-11 (gap 2023-10 → 2025-02) |
| `GHRSST_L4_MUR_Sea_Surface_Temperature` | `GoogleMapsCompatible_Level7` | 2002-06-01 → 2026-10-10 |
| `GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies` | `GoogleMapsCompatible_Level7` | 2019-07-23 → 2026-10-10 |
| `MODIS_Terra_Cloud_Fraction_Day` | `GoogleMapsCompatible_Level6` | 2000-02-24 → 2026-10-11 |
| `MODIS_Terra_Aerosol` | `GoogleMapsCompatible_Level6` | 2000-02-24 → 2026-10-11 |
| `IMERG_Precipitation_Rate` | `GoogleMapsCompatible_Level5` | 2000-06-01 → 2026-10-10 |
| `VIIRS_Black_Marble` | `GoogleMapsCompatible_Level8` | 2012-01-01, 2016-01-01 (annual only) |
| `VIIRS_SNPP_Thermal_Anomalies_375m_All` | vector layer — `GoogleMapsCompatible_Level9` rejected by WMTS; served as raster through WMS | 2012-01-20 → 2026-10-11 |
| `MODIS_Terra_Thermal_Anomalies_All` | vector layer — WMS raster path | catalog entry (Worldview metadata) |

Rejected during validation (never shipped): `MODIS_Aqua_Chlorophyll_A` (invalid
identifier), `MODIS_Terra_Snow_Cover` (invalid), `MOD44B_Combined_Fractional_Non-
Photosynthetic_Vegetation` (invalid), `SMAP_L3_Active_Passive_Soil_Moisture`
(reports a single 2015 period only → effectively unavailable).

## 4. Scientific-integrity rules built into the code

1. Every result carries provenance: provider, dataset id, service URL, observation
   date, retrieval timestamp, units, coverage, status (`live` / `cached` /
   `unavailable` / `not-configured` / `derived`).
2. Imagery dates are checked against the layer's reported domain; a date outside it
   is refused with the nearest available date offered instead of silently rendering
   a substitute day.
3. Layer/tile-matrix/format are validated by a live tile probe at runtime; failures
   degrade to an explicit "unavailable in this projection" state.
4. Trend statements are limited to descriptive statistics over the retrieved series
   (count, mean, min/max, least-squares slope) with explicit caveats; no attribution,
   significance, or causal claims.
5. AI answers are generated only from a structured bundle of retrieved values and
   are split into Verified / Derived / Interpretation / Limitations; missing data is
   reported as missing. Without an API key or on AI failure, a deterministic engine
   answers from the same bundle.
6. No fabricated hotspots, alerts, measurements, or sources. FIRMS hotspot counts
   appear only when the operator configures `FIRMS_MAP_KEY`.

## 5. Implementation steps

1. Data layer (`src/lib/earth/*`) + unit tests.
2. Server router (`server/earthIntelligence.ts`), registered in `server.ts`.
3. UI: map + compare, trend detective, Sri Lanka watch, analyst, provenance; lazy
   loading, keyboard/ARIA support, reduced-motion respect.
4. i18n key merge, PWA caching for `/api/earth/*` + GIBS tiles, `.env.example`.
5. Verify: `npm run lint`, `npm run build`, `node --import tsx --test`, dev-server
   smoke test (tile + POWER requests), responsive walkthrough.
6. Report modified files, dependencies, API sources, verified tests, limitations.

See the final section of this file for the delivered report.


---

## Addendum A — 3D globe: cinematic rendering upgrade

Requested after the Lab upgrade: make the Earth Lab's 3D globe a visually
stronger surface without weakening the scientific contract.

**Files**

| File | Change |
| --- | --- |
| `src/components/earth/Globe3D.tsx` | rewritten (was a bare textured sphere) |
| `src/components/EarthIntelligenceLab.jsx` | passes the study-area centre and a device quality tier into the globe |
| `src/i18n/earthIntelligence.ts` | 8 new keys × 3 languages (`earthGlobeGrid`, `earthGlobeSpin`, `earthGlobeSpinPause`, `earthGlobeKeyboardHint`, `earthGlobeShadingNote`, `earthGlobeTextureRes`, `earthGlobeSunReadout`, `earthGlobeAriaLabel`) |
| `scripts/smoke-render.mjs` | renders the globe and asserts 7 structural/accessibility checks per language |

**Imagery**

* GIBS WMS `GetMap` is requested at **4096 × 2048** with an automatic ladder
  `4096 → 2048 → 1024`; `quality: 'low'` (low-end devices) starts at 2048. The
  size actually served is shown in the badge, so the user can see which rung the
  globe is rendering from.
* Anisotropic filtering, sRGB output and mipmapped linear filtering are applied
  per renderer; textures are disposed when replaced.

**Interaction & accessibility**

* Drag with inertial release, wheel/pinch zoom, double-click reset, and a full
  keyboard path: arrow keys rotate, `+`/`−` zoom, `R` resets. The canvas is
  focusable and labelled with the dataset and observation date.
* The render loop pauses when the globe scrolls out of view (`IntersectionObserver`)
  or the tab is hidden, so a background tab costs no GPU time.
* `prefers-reduced-motion` disables auto-rotation, starts the rotation toggle off
  and skips the texture fade.

**Rendering (cinematic layer)**

* Sun direction and declination are **computed from the observation date** at
  12:00 UTC (Cooper's approximation) and drive a directional light whose intensity
  is normalised to 1/cos(declination) — so the polar day/night is represented
  correctly rather than a fixed daylight patch.
* Day/night-aware atmosphere: a custom fresnel shell (inner limb + outer halo,
  additive) whose glow follows the sun.
* Deterministic star field, graticule + brighter equator overlay (toggleable),
  vignette, neutral tone mapping (ACES fallback for older three revisions).
* Axis tilt of 23.44° is applied to the globe and its lighting frame; the globe
  opens oriented on the Lab's current study area instead of a default meridian.

**What is data and what is rendering** (asserted in the UI via
`earthGlobeShadingNote`): the surface image, the served render size and the
sub-solar point are data; lighting, atmosphere, graticule, star field and
rotation are rendering aids. The night side is deliberately kept partly lit so
that imagery on the dark limb stays legible — a rendering choice, not an
observation. Fallbacks are unchanged: no WebGL → 2D map; every texture rung
failing → 2D map with the reason shown.

**Verification**

* `npx tsc --noEmit` clean; `npx vite build` clean — `Globe3D` stays a separate
  lazy chunk (14.73 kB, was 4.15 kB).
* `npm run test:earth` 30/30 · `npm run test:earth-server` 16/16 ·
  `npm run test:earth-smoke` 22 checks × en/si/ta.
* GIBS accepts the 4096 × 2048 `GetMap` (checked with an invalid-LAYER control
  that returns the plain-text MapServer error, versus an image for a valid layer).
* **Not verifiable from the agent sandbox:** the rendered WebGL pixels — the
  visual result has to be judged in a browser (the dev preview is the check).
