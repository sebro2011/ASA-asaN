# COSMORA: Mars Explorer — test and verification report

**Date** 2026-11-20 · **Branch** `arena/22633301-asa-asan` · **Base** `cf3cc06` · **Route** `/mars-game`

This report follows the repository's rule that a test is only described as passing
if it was executed, and that a thing which could not be tested is named as untested
rather than implied to work.

---

## 1. What was run, and the exact result

| Gate | Command | Result |
| --- | --- | --- |
| Type check | `npm run lint` (`tsc --noEmit`) | **pass** — 0 errors |
| Full test suite | `npm test` | **1155 pass / 0 fail** across 94 suites (was 1092 before this work) |
| Mars game suites | `npm run test:mars-game` | **63 pass / 0 fail** (8 + 14 + 15 + 7 + 13 + 6) |
| Production build | `npm run build` | **exit 0** — 167 precached entries, no inline scripts, service worker 12.8 kB |
| Whole-app DOM audit | `node --import tsx scripts/ui-audit.mjs` | **19 destinations × 3 languages = 57 screens `ok`**, 0 console issues, 0 window errors, mobile "More" sheet opens |
| Bundle sync | `npm run check:bundle` | **in sync** (`api/index.js` unchanged: no server file was touched) |
| Dev server serves the route | `npm run dev` + `curl /mars-game` | **200**, HTML shell returned |
| Dev server compiles the modules | `curl /src/game/MarsScene.tsx`, `TerrainMaterial.ts`, `engine.ts`, `Panels.tsx` | **200** each, transpiled by Vite |

The game chunk built to **99 KB** (`MarsGame-C88Yy6jr.js`) as its own lazily-loaded
chunk. It does not enter the workspace or Explore entry bundle; `three.module` is
shared with the existing 3D surfaces and already charged to `Space3DViewer`.

### Test suites added

| Suite | Tests | What it covers |
| --- | --- | --- |
| `test-mars-game-world.mjs` | 8 | noise determinism, terrain continuity, landing-site walkability, crater profile (bowl, rim, ejecta, continuity), chunk geometry vs. `terrainHeight`, LOD/triangle budget, rock determinism and placement, PRNG stability |
| `test-mars-game-simulation.mjs` | 14 | walking/running speed and grounding, Martian jump height and airtime, slope-limit sliding, rover acceleration/steering/braking/reverse, tilt, odometer, battery drain and recharge, collision push-out (cylinder + rotated box), save round-trip, corrupt-save rejection, damaged-field repair |
| `test-mars-game-ui.mjs` | 13 | route parsing, trilingual copy completeness, simulation disclosure, `any`/blur ratchets, menu render with a failing feed, save/no-save states, HUD values and low-resource warning, panel Escape/focus behaviour, settings controls, map plotting, touch intent, keyboard intent, quality chooser |
| `test-mars-game-engine.mjs` | 13 | the real engine end to end: jumping, camera-relative walking, collision with a building, boarding/driving/exiting, scanning, research accounting, resource drain and the stamina gate, pad recharge and a flat battery, pause/resume, streaming, save/restore, the day cycle, the spawn point |
| `test-mars-game-render.mjs` | 7 | GLSL well-formedness (braces, `main`, precision, GLSL 1 only), varying/uniform agreement between JS and shaders, Three.js accepts the real geometry, material setters, instancing partition, no third-party runtime assets |
| `test-mars-game-nav.mjs` | 6 | the game is **findable**: trilingual labels, a real `<a href="/mars-game">` in the header, client-side routing on plain click with middle-click preserved, the game in the mobile "More" sheet, the game still not an Explore tab, and no destination displaced by the new entry point |

---

## 2. What was **not** verified, and why

| Unverified | Reason | Consequence |
| --- | --- | --- |
| **Any pixel of the 3D scene** | No GPU and no headless browser in this sandbox. Chromium could not be downloaded (the CDN is blocked: `ENOTCONN`/`ECONNRESET`), and no system browser exists. | The shaders are checked for the syntax and linkage errors that cause a black screen, and the geometry is checked to be finite and bounded — but whether Mars *looks* right is unproven until someone opens `/mars-game`. |
| Frame rate on real hardware | Same reason. | The presets and the dynamic-resolution logic are unit-tested; the FPS claim is a design target, not a measurement. |
| Pointer lock and touch feel | Requires a real pointer/finger. | The reducers are tested; the ergonomics are not. |
| IndexedDB persistence across a real reload | jsdom has no IndexedDB. | `validateSave` is tested directly against valid, corrupt and damaged records; the browser round-trip is unproven. |
| The live NASA image on the menu | `/api/mars/latest` was verified during PR #75, but this sandbox cannot reach the deployed API (it returns the app shell for every `/api/*` path). | The menu is written to degrade to a sentence with no broken `<img>`, and a test asserts exactly that. |

Where the brief asks for "test on Android tablet-sized viewports", the honest
answer is: the layout is built for them (`h-dvh`, touch pads with
`touch-action: none`, 44 px targets, guarded scroll), and it has not been observed on
a tablet. That remains an open item.

---

## 3. Defects found by the tests during development

These were real bugs, caught before commit, and are the reason the suites exist:

1. **Craters had no rim.** The bowl (`−depth·(1−d²)`) and the rim bump were cancelling
   at the crater edge, so a "crater" was a shallow dimple with an ejecta mound. Fixed
   to a rim crest of 20 % of depth at exactly `d = 1`, continuous with the ejecta
   branch.
2. **A player could end a step on a 49° slope.** The slope limit was checked once; if a
   mover was already on impossible ground, every further step was refused and they
   stayed there. Rewritten as a bounded iterative search (clamp → contour slide → half
   step) with the bound asserted on the *result*. Jumping now works, and so does
   walking downhill off a cliff.
3. **Vertex shaders had no `precision` qualifier.** Desktop drivers accept it; older
   Android GLSL ES drivers are where this bites. Found by the shader audit test.
4. **The sun disc was pinned to its morning position** because it read a ref during
   render. Now repositioned in the frame loop.
5. **The physics ring was one chunk narrower than the visible ring**, so a rock could
   be drawn before it was solid. The ring is now derived from the quality preset plus
   one.
6. **Running was not stamina-gated**, so the stamina meter could sit at 0 % while the
   astronaut sprinted. Running now requires energy above 5 %.
7. **Jumping was impossible in the game.** `stepAstronaut` computed the jump
   correctly and its unit tests passed, but the engine then overwrote `y` with the
   ground height and `grounded` with `true` every step, discarding the result. Found
   only by driving the real engine in `test-mars-game-engine.mjs` — which is the
   reason that suite exists, and the clearest argument in this report for testing the
   integration path and not only the modules.
8. **The game was shipped, but it was not findable.** The route `/mars-game` worked
   and the home page linked to it, yet a card in the fourth section of the front door
   was the *only* entry point: the header's dropdowns are built from `NAV_ENTRIES` and
   the game is deliberately not a `NAV_ENTRIES` member, so nothing in the primary
   navigation mentioned it. A finished product that a user cannot reach is a shipped
   defect, not a documentation gap. Fixed by adding a dedicated terminal to the
   desktop header and to both mobile sheets, and pinned by
   `test-mars-game-nav.mjs` — the test that should have existed in the first place.

---

## 4. Behavioural facts proven by the simulation suites

Numbers below are asserted, not estimated:

| Quantity | Value | Test |
| --- | --- | --- |
| Walk speed | 2.6 m/s | `test-mars-game-simulation` |
| Run speed | 5.1 m/s | idem |
| Jump apex on Mars (3.711 m/s²) | 0.7–1.2 m; airborne 1.1–1.7 s | idem |
| Rover top speed | ≤ 8.5 m/s, reverse ≤ 3.2 m/s | idem |
| Rover charge at full throttle | 12–45 minutes | idem |
| Terrain sample cost | ~0.7 µs (`height()` × 20 k ≈ 14 ms) | measured in development |
| Chunk build (33×33) | ~3.4 ms | measured in development |
| Radius-3 ring, mixed LOD | < 60 000 triangles | `test-mars-game-world` |
| Largest 0.5 m terrain step | < 2 m (no unclimbable seams) | idem |

---

## 5. Deployment instructions

1. Merge the branch to `main`. CI runs typecheck, the full test suite, the production
   build, the bundle-sync check and the dependency audit; all five must be green.
2. Vercel builds automatically. `/mars-game` is a client route, and `vercel.json`
   already rewrites unknown paths to `index.html`, so **no rewrite rule is needed** —
   verify with a hard refresh on `/mars-game` after the deploy.
3. No new environment variables. The game's only network call is the existing
   `/api/mars/latest`, which needs no key.
4. After deploying, open the site's front door and confirm, in order: **"Mars Explorer"
   is visible in the top navigation bar** (it sits to the right of the four group
   menus, and under "More" on a phone/tablet). Clicking it must reach the game with no
   full page reload. Then: the menu appears (not a blank page), "Enter the surface"
   reaches a Mars horizon, WASD moves, the HUD meters read 100 %, `E` scans a rock,
   `F` boards the rover, `Esc` pauses and `M` opens the map. If WebGL is unavailable
   the explanatory screen appears instead.

If step 4 fails, the first thing to capture is the browser console: the shader audit
tests make a silent GLSL failure unlikely, but a driver-specific one is still possible,
and it would show as a program link error naming the shader.

---

## 6. Summary

The game is implemented, wired into the existing site behind `/mars-game`, and passes
every gate this repository enforces. Its *simulation* is verified thoroughly; its
*rendering* is verified only to the extent possible without a GPU. That distinction is
the honest state of the work.

---

# Phase 2 — realistic Mars world

Phase 1 shipped a *working* game whose world looked like a cartoon. Phase 2 was the
work of making the environment look like Mars. This section records what changed,
what was measured, and what is still wrong.

## 7. What was wrong with the Phase 1 world

Six faults, found in this order, each of which alone was enough to make the surface
read as moulded clay:

| # | Fault | Effect |
|---|---|---|
| 1 | Albedos authored as if linear | Every material clipped to the same pale cream |
| 2 | Sun/ambient gains too high | A lit ochre patch integrated to 1.37 linear; ACES flattened it |
| 3 | Detail tile sampled at 4.6 mm/texel | Mip chain erased it by 10 m; ground was a sheet |
| 4 | Bump applied *after* lighting | Reduced to a ±3 % multiplier — invisible by construction |
| 5 | 2 m vertex spacing | Nothing below 2 m existed in the geometry at all |
| 6 | Sky values past the ACES shoulder | Sky rendered one flat cream value at every elevation |

The common thread: values that were *mathematically present* but sitting outside the
range where the pipeline can show them. Detail that is present but under the vertex
spacing, texture that is present but under a pixel, contrast that is present but past
the tone-map shoulder — all of them look exactly like "nothing was implemented".

## 8. What Phase 2 changed

### Lighting and material

- Sun and ambient gains cut to keep a sunlit ochre patch around 0.6–0.8 linear.
  Sun `1.55 × 0.43 × 2.3 ≈ 1.53`, ambient `0.16 + 0.34·daylight`.
- Surface albedos darkened ~35 %; Mars' geometric albedo is 0.17.
- Four material families widened to a real albedo spread, plus metre-scale tonal
  mottling at two scales.
- Two-octave bump normal sampled at **decimetres** per texel (8 cm and 30 cm), and
  moved *before* the lighting block so it drives the N·L term.
- Rock colours re-authored so their **linearised** values are realistic silicate
  albedos (basalt 0.159, sulphate 0.546).

### Atmosphere and sky

- Sky vertical ramp rebuilt on elevation angle instead of `y·0.5+0.5`, which had
  put the horizon at 59 % of the zenith colour.
- Martian forward-scatter colour inversion near the sun preserved.
- Horizon colour moved from `#d8b08a` (0.687 linear, past the ACES shoulder) to
  `#a87d5c` (0.392), zenith to `#3a3029`.
- Sun disc resized from 2.6° to 0.28° apparent diameter — Mars' is 0.35°.
- Directional aerial perspective retained; fog band widened from 70–260 m to
  150–620 m so the massifs are not behind a wall of dust.
- Radial dissolve at the streamed-ring boundary, so the world's edge is never a
  straight line. **Fogged terrain still writes depth** — a `discard` there punched a
  hole through mountains and let the sky dome show as a pale plane.

### Terrain, props and structure

- Near LOD 33 → **65 vertices** (1 m spacing). Bands retuned so 61 k triangles sit in
  the radius-3 ring and 77 k at radius 6.
- Visual ring 3 → **6 chunks** (384 m). The massifs start ~180 m out and the old ring
  cropped them off entirely.
- Rocks per chunk 14 → **44**, size exponent 4.2 → **2.6**, and flat ground no longer
  skipped outright (it had been 1.4°-slope-gated, so the plain underfoot was the one
  place guaranteed bare).
- Instanced rock geometry: icosahedron detail 1, displaced by a hash of the
  *quantised direction* so coincident vertices stay welded. The previous per-index
  jitter split them into floating shards.
- Ground bounce light added: a warm directional 40 m below the player pointing up,
  plus a brighter hemisphere ground leg. Vertical rock faces measured rgb(15,8,4)
  before this and rgb(74,42,24) after.

## 9. Bugs fixed by category

**Real rendering bugs**

- `patch` is a reserved word in GLSL ES 1.00 and broke the fragment compile in real
  WebGL. Renamed; a render test now scans for reserved-word identifiers.
- A stray backtick inside a GLSL template literal silently terminated the string. Now
  guarded by a test.
- `shadow-mapSize-width` on a `<primitive>` is written to the object as a literal
  dashed key that three.js ignores; set imperatively instead.
- The terrain `ShaderMaterial` received **no shadow uniforms at all**. three.js only
  feeds lights to a `ShaderMaterial` when `material.lights === true`, and even then
  the uniform names are generated from the define set. The shader now includes the
  stock `shadowmap_pars_*` and `lights_pars_begin` chunks and calls `getShadowMask()`.

**Bugs the denser terrain exposed downstream**

- Collider threshold was 0.45 m, tuned when a chunk held 14 rocks. At 44 rocks that
  was 2 721 colliders per physics ring — a 6× increase in per-step resolution cost —
  and made 0.46 m pebbles solid to a 1.35 m rover. Raised to 0.9 m.
- The rover spawns centred on its own charging pad, and recharge (1.2 %/s) beat drain
  (0.025 %/s). The battery never left 100 % and the flat-battery warning was
  unreachable. Charging is now gated on throttle *intent*.
- Stations were seated on a single y across footprints spanning up to 2.8 m of relief,
  which exposed an unlit box side as a black wedge. They now sit a third of the way up
  from the low corner with a buried foundation covering the worst drop.

## 10. Measurements

Continuity, ±1 400 m at 1 m steps:

| Metric | Before | After |
|---|---|---|
| Worst 1 m height step | 24.21 m @ 88° | **5.76 m @ 80°** (a canyon wall, not a seam) |

Cost:

| Metric | Value |
|---|---|
| `terrainHeight` median | 2.16 µs (min 1.57, max 2.91) |
| `mesaField` | 0.25 µs (was 0.73) |
| `canyonField` | 0.26–0.50 µs |
| `craterField` | 0.17–0.24 µs |
| 33×33 chunk build | ≈ 2.4 ms main thread |
| Radius-6 ring | 77 k triangles, 169 chunks |

## 11. Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run lint` | clean |
| `npm test` | **1 157 pass / 0 fail** across 94 suites |
| `npm run build` | 0 errors, 167 precached, SW 12.8 kB |
| `npm run check:bundle` | in sync |
| `npm run test:docs-links` | 3 pass / 0 fail |
| `test:mars-game` | 6 suites, all green |

Render suite grew to **9 tests**, including the reserved-word guard and the
stray-backtick guard.

## 12. Screenshots

All captured from the built app in headless Chromium via CDP at 1440×900, WebGL2,
high quality preset.

- `docs/screenshots/mars-phase2/03-landing-site.png` — the landing site at first light:
  hab, lab, rover, the astronaut's contact shadow, rock field, mesa on the horizon.
- `docs/screenshots/mars-phase2/02-canyon-rim.png` — standing beside a canyon wall,
  with the rim above and dust shading on the slope.
- `docs/screenshots/mars-phase2/01-open-plain.png` — an open basin: rolling rust
  terrain, rock-strewn slopes, layered horizon, sky gradient.

## 13. Known limitations

These are honest gaps, not oversights.

1. **The world is a square, not a sphere.** The streamed ring is an axis-aligned
   block of chunks. The radial dissolve hides the edge, but a player who walks far
   enough will see terrain fade out rather than a continuous horizon.
2. **No volumetric dust.** Suspended dust is a uniform screen-space fog plus a
   particle field. Mars' dust devils, storm fronts and the light shafts through them
   are not simulated.
3. **Mesa and canyon placement is procedural.** They are real *landforms* — the
   escarpment at (263,−446) rises 34 m over a 58° band — but they are generated from
   a seeded field, not derived from any actual Martian location. Nothing in this
   scene is a reconstruction; the menu says so explicitly.
4. **Photogrammetry would be better and is not used.** HiRISE DEMs are available for
   real sites; a mesh from one would beat this for fidelity. The download budget
   (GTX 960 / 2 GB, Android tablets) and the no-network-assets rule made procedural
   the right trade for this phase.
5. **Shadows are bounded to a 64 m box.** Beyond that, terrain self-shadowing comes
   from the analytic hillshade, which is much softer.
6. **The sandbox cannot measure performance.** SwiftShader renders at 4–6 FPS here.
   No FPS figure quoted from this environment means anything. Triangle counts, sample
   costs and draw-call counts are the meaningful numbers, and those are above.
7. **Quality selection is automatic.** A software renderer is detected and forced to
   the `low` preset, which has shadows disabled. Real hardware gets `high` or
   `balanced`; the settings panel lets the player override.

8. **Pale canyon artifact (Phase 2 screenshot).** The historical
   `02-canyon-rim.png` shows a pale triangular region. Phase 3 diagnosed and fixed
   this specific camera-ground intersection; see `MARS_GAME_PHASE3_REPORT.md`.
