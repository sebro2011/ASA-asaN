# NASA Space Explorer — Phase 1 Design Review

**Status:** Repository and live-site audit complete; proposed design direction ready for review. Phase 2 implementation is intentionally held for approval, per the requested workflow.

## 1. Audit: what is here today

### Repository and runtime

- React 19 + TypeScript/JSX, Vite 8, Tailwind CSS 4, Express 4, Recharts, Leaflet, Three.js, Framer Motion, and Lucide are present. NASA routes are split between `server.ts` and `server/earthIntelligence.ts`.
- The app is a single-page experience in `src/App.tsx`; navigation switches among 13 workspaces rather than separate routes. Desktop and mobile navigation components, a mobile bottom bar, PWA/offline helpers, and a trilingual provider exist.
- English, Sinhala, and Tamil translation dictionaries are present (`src/i18n.ts`, `src/i18n/translations.ts`, and `src/i18n/earthIntelligence.ts`). Some text in the current app is still hard-coded in components.
- The existing hero Earth is procedurally drawn in `HeroBackgroundEarth.tsx`, not a photographic Earth image. The live site currently leads with the “Explore the Cosmos in Three Languages” headline, an animated Earth treatment, system tiles, then APOD.
- `src/globals.css` applies a broad, repeated glass-card treatment; the existing hierarchy is dense, with small telemetry labels and several persistent controls. This is a key opportunity for a more editorial, calmer visual system.
- The repository has no installed dependencies by default. `npm install` initially refused the declared peer dependency combination (`three@0.186.1` versus `@google/model-viewer`'s current peer range); installation succeeded with `--legacy-peer-deps` without changing the manifest or lockfiles.

### Feature and integration inventory

| Capability | Existing implementation / source | Audit status |
|---|---|---|
| APOD | `ApodViewer.tsx`, `/api/apod`, APOD range/archive routes | Present and rendered on the live page. Full date/media/error interaction was not browser-tested in this audit. |
| Space / planet 3D | `Space3DViewer`, `ARPlanetViewer`, `ArModelViewer`, related components | Present; interactive Three.js/model-viewer features should be retained. |
| Near-Earth objects | `AsteroidRadar`, risk components, `/api/asteroids/neows` | Present; source-backed NeoWs route and object/risk presentation exist. Runtime details require browser validation. |
| Earth / EPIC | `EPICViewer`, `/api/epic` | Present; endpoint contains fallback records, so UI must distinguish provider data from fallback/unavailable content. |
| Exoplanets | `ExoplanetLab`, `/api/exoplanets` | Present. |
| Mission content | `MissionsTimeline`, mission data, `/api/missions/grounded-search` | Present. |
| ISS | `ISSTracker`, `IssTracker2D`, telemetry indicator, `/api/iss` | Present; verify actual update cadence and source before calling it “live.” |
| Earth Intelligence | `EarthIntelligenceLab.jsx`, `earth/*`, `/api/earth/*` | Substantial workspace: verified GIBS catalog/date checks, Leaflet imagery, optional 3D globe, NASA POWER series and descriptive analysis, location presets, Sri Lanka workspace, analyst and provenance. Its API and unit tests are strong. |
| Rocket simulator | `RocketLaunchSimulator.tsx` | Interactive component is wired to the launch tab; preserve its existing controls/telemetry behavior. |
| AI assistant | `NasaAi`, `OpenRouterChat`, `GeminiChatWidget`, `/api/nasa-ai`, `/api/openrouter/chat`, `/api/chat`, `/api/nova/chat` | Several assistant paths exist. Keep provider errors explicit and avoid presenting fallback answers as provider output. |
| News / quizzes / saved items | News, quiz, favorites components and related endpoints | Existing features; retain access in the information architecture, even if they are not primary home sections. |
| Internationalization | i18next + `TrilingualProvider` | Translation infrastructure exists for all three languages; preserve it and move remaining new/visible copy into dictionaries. |

The source tree and API definitions were inspected. I fetched the public site page and verified its current content outline. This was a page-content audit, not a full end-to-end browser test.

### External design-file limitation

The Figma connector is not available in this session. Fetching the supplied Figma URL did not expose the design file; it returned Figma's public landing page instead. Therefore I **cannot honestly claim to have inspected or changed the existing Figma canvas**, built Auto Layout components there, or linked a Figma prototype. This review is a code-aligned design specification. The Figma-specific deliverable remains blocked unless the file can be made accessible through an enabled connector or provided as an export/screenshots.

## 2. Earth chart finding — known risk, not yet a proven root cause

The actual POWER chart is implemented in `src/components/earth/TrendDetective.tsx`; it uses real rows from `fetchPowerDataset`, explicit fixed-height wrappers (`h-64`, `sm:h-80`), and `ResponsiveContainer`. Parsing and statistical processing are in `src/lib/earth/power.ts`; the server proxy is in `server/earthIntelligence.ts`. The parser intentionally excludes POWER's month-13 annual aggregate, handles fill values, and computes annual summaries from returned monthly data.

Static inspection does **not** establish the reported render failure's root cause: the chart currently has a height-bearing wrapper and no obviously invalid chart import. A data-processing defect, a transient zero-size measurement during tab transitions, or a browser-only runtime error are all possible; none should be asserted without reproduction. In Phase 2 I will instrument/reproduce the loaded chart path, verify measured container dimensions and valid series counts, inspect console/runtime behavior, and add a regression check for the actual fix. A static or invented chart is explicitly out of scope.

## 3. Proposed visual direction: “Orbital Field Notes”

A cinematic but evidence-first identity: the quiet depth of space frames a living Earth image, while typography, fine coordinate details, and carefully prioritized controls make the application feel like a scientific instrument rather than a generic dashboard. Use public NASA/GIBS imagery with source/date attribution wherever the chosen endpoint supports it. Do not use generated planet art as a substitute for observational imagery.

### Foundations (proposed tokens)

| Token | Proposed value / use |
|---|---|
| `space-950` | `#050A12` — primary page background |
| `space-900` | `#0A1220` — raised work surfaces |
| `space-850` | `#101B2B` — selected control / inset surface |
| `ink-100` | `#F4F7FB` — primary text |
| `ink-300` | `#B3C0D0` — secondary text |
| `ink-500` | `#77869A` — captions only; never essential low-contrast data |
| `signal-cyan` | `#64C8E8` — primary action / selected scientific series |
| `signal-blue` | `#8CAEFF` — secondary series / navigation accents |
| `signal-amber` | `#E6B86A` — caution, gaps, pending states (not a hazard claim) |
| `signal-green` | `#76C6A4` — verified/available, only when status is sourced |
| `line-subtle` | `rgba(178, 202, 226, .15)` — dividers, chart grids, panel edges |
| Type | System sans / Inter-like sans; editorial display face only if reliably available. Tabular numerals for telemetry; Sinhala/Tamil fallback fonts remain first-class. |
| Scale | 12 / 14 / 16 / 20 / 28 / 40 / 56 px, with fluid display sizing and language-safe line height. |
| Spacing | 4 px base; layout rhythm in 8 px multiples; 24 px panel interior on desktop, 16–20 px on mobile. |
| Radius | 6 px control, 10 px panel, 16 px feature image; avoid pill shapes except compact status/chip controls. |
| Grid | 12 columns, max content width ~1440 px; breakpoints 640 / 768 / 1024 / 1280 px; mobile-first single-column workspaces. |
| Glass | Reserved for global navigation and a small number of floating overlays: opaque-enough navy, 1 px border, modest blur. Data panels remain solid for legibility. |
| Motion | Short, purposeful transitions (160–240 ms), no looping attention effects by default; respect reduced motion and pause expensive scenes off-screen. |
| Accessibility | AA contrast for text and controls; visible keyboard focus, semantic sections, 44 px touch targets, accessible chart summary/table alternative, explicit units/status/source labels. |

### Information architecture and screen intent

1. **Home / Discover:** full-bleed photographic Earth-from-orbit hero with restrained overlay, headline “Explore Beyond the Horizon.”, clear Explore and Mission Control actions; below it, a selected real APOD feature, mission index, Earth lab preview, and compact discovery links. Avoid invented counts or live status claims.
2. **Mission Control:** operational overview from existing source-backed capabilities (ISS, NeoWs, mission records, latest APOD/news). Each module includes provider and observation/update time where supplied; missing services appear as unavailable, not as blank “live” tiles.
3. **Earth Intelligence Lab:** flagship full-width workstation. A narrow study-area/date/parameter rail; imagery/map and POWER time-series workspace; responsive chart with units, valid count, gap notes, source and retrieval date; annual view and accessible tabular alternative; provenance/limitations remain visible. GIBS imagery and POWER values are distinct datasets, never visually conflated.
4. **Satellite Viewer:** map canvas first, layer and date controls second; include selected layer identifier/source, reported date coverage, projection/tile failure state, keyboard/touch map controls, and honest temporal wording.
5. **Near-Earth Object Explorer:** date range and searchable actual object list with measured approach values and their units, linked detail context and source classifications. Explain that close approach is not equivalent to impact probability or danger.
6. **Rocket Simulator:** preserve the live Three.js scene and actual simulator state machine; telemetry/control strip overlays with readable preparation, launch, paused, completed, and error states.
7. **AI Space Assistant:** calm conversation canvas, explicit provider/connection state, suggested prompts based on actual available data, compact composer and clear retry/error affordances. Preserve all three languages.
8. **APOD & Discovery:** image/video-aware editorial feature with title, date, caption, credit, quality fallback, archive navigation, and unavailable-media state.
9. **Mobile:** dedicated compact home, bottom/tab navigation with accessible labels, collapsed mission summary, full-width Earth chart with horizontal date ticks and data table alternative, map controls reachable by thumb, bottom-sheet asteroid detail, simulator controls separated from the viewport, and a sticky assistant composer. No desktop-only hover dependency.

### Component system to map to React

- Global shell: top nav, mobile nav/bottom rail, language selector, source/status badge, skip link.
- Primitives: primary/quiet/icon buttons; field/select/date range; segmented control/tabs; status chip; tooltip/popover; confirmation dialog; skeleton, empty, error and unavailable messages.
- Science surfaces: source-attributed metric row; data panel; chart panel with legend/units/valid-N note; accessible data table; map toolbar/layer picker; result list/detail; provenance drawer.
- Editorial/mission: feature image, mission row/card, APOD media frame, compact discovery link.
- Simulator and AI: telemetry strip, launch-state control group, chat message, composer, provider state.

## 4. Phase 1 review decisions / unresolved items

1. **Design direction:** approve or adjust “Orbital Field Notes,” its restrained cyan/amber palette, photographic Earth hero, and home-first discovery structure.
2. **Figma access:** if the existing Figma file must be changed directly before code, provide an accessible Figma connector or export/reference screens; the current toolset cannot edit it. Otherwise, I can proceed from this review and deliver the reusable visual system in the existing codebase, while clearly marking Figma work as unavailable.
3. **Homepage language:** the proposed English headline is the requested “Explore Beyond the Horizon.” Sinhala and Tamil equivalents should be authored/reviewed in the project's translation resources rather than machine-invented as a design artifact.
4. **Mission Control freshness:** agree that no “live” badge/metric appears without a trustworthy source timestamp or an explicitly documented refresh interval.

## 5. Baseline verification before redesign

After installing the existing dependencies using `--legacy-peer-deps` (the manifest itself was not changed):

- `npm run lint` — passed (`tsc --noEmit`).
- `npm run build` — passed. Existing warning: the primary JS bundle is ~3.19 MB minified (883.59 kB gzip), over Vite's 500 kB advisory threshold.
- `npm run test:earth` — 30/30 passed.
- `npm run test:earth-server` — 16/16 passed.
- `npm run test:earth-smoke` — 22 checks each for en/si/ta passed.
- `npm run test:nova-chat` — 18/18 passed.
- Browser-only interactions, actual Figma file, and the reported POWER chart rendering failure remain unverified at this phase.
