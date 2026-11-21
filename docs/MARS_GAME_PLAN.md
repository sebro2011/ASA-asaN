# COSMORA: Mars Explorer — implementation plan and audit

**Branch** `arena/22633301-asa-asan` · **base** `cf3cc06` · **baseline tag** `mars-game-baseline-cf3cc06`
**Audit date** 2026-11-20

---

## 1. Phase 1 — repository audit (executed, not assumed)

The brief described this repository as "Next.js". It is not, and building on that
assumption would have produced a second, parallel app. The measured facts:

| Claim in the brief | What the repository actually contains |
| --- | --- |
| Next.js / App Router | **No Next.js.** Vite 8 SPA + a hand-written history router (`src/app/router.tsx`, ~150 lines), plus an Express 4 server (`server.ts`) for `/api/*`. `vercel.json` rewrites everything to `index.html`. |
| React Three Fiber present | **Yes.** `@react-three/fiber` 9.8.2, `@react-three/drei` 10.7.9, `three` 0.183.2, `@react-three/postprocessing` 4.x. R3F is already used by `OrbitalEarth`, `SpaceLab3D`, `ExoplanetLab`, `SpacecraftViewer`, `AdvancedMarsGlobe`. |
| Rapier physics | **Not installed.** Adding `@react-three/rapier` would pull a WASM binary and a second transform stack into a bundle that currently precaches at 164 entries / one 12.6 kB service worker. See §2. |
| JavaScript | TypeScript, `strict: true`, with a **zero-`any` ratchet** (`scripts/test-any-budget.mjs`) that fails the build on one explicit `any`. |
| Tailwind CSS | Yes — Tailwind 4 with a token layer (`src/styles/tokens.css`) and three glass tones (`glass`, `glass-strong`, `glass-inset`) enforced by `scripts/test-design-tokens.mjs`. Raw `backdrop-blur-*` in a component **fails the build**. |
| IndexedDB for saves | Not used yet. `localStorage` is used for preferences. |

### Gates every change must pass

`npm run lint` (tsc) · `npm test` (1092 assertions across 44 suites) · `npm run build` ·
`npm run check:bundle` (`api/index.js` must match `server/`) · `npm run check:pwa`.

Suites that scan **every** `.tsx/.jsx` file under `src/` and will therefore see the
new game code on day one:

| Suite | Rule the game must satisfy |
| --- | --- |
| `test-any-budget` | no explicit `any` anywhere |
| `test-design-tokens` | no raw `backdrop-blur`; ≥1 adopter of `src/ui/Glass.tsx` |
| `test-a11y-controls` | any element with `onClick` is a real control, or has `role` + `tabIndex` + a key handler, or `role="dialog"` |
| `test-contrast-tokens` | `--color-azure-deep` is never used as text colour |
| `test-hygiene` | one lockfile; no hardcoded app version outside `src/lib/version.ts` |

### Preserved surface (must not regress)

`/` and `/explore/:tab` (the NASA science suite), `/cosmovision`, the workspace
routes, the Express API routes, the service worker precache contract, and the
`/api/mars/latest` live feed shipped in PR #75.

**Checkpoint:** tag `mars-game-baseline-cf3cc06` plus branch
`checkpoint/mars-game-phase1` (never merged, never deleted) hold the exact
pre-game tree, so the whole feature can be reverted with one command:
`git diff mars-game-baseline-cf3cc06 -- src/game`.

---

## 2. Architecture decisions (with reasons, not preferences)

### 2.1 No Rapier — deterministic analytic terrain physics

Rapier would be the obvious choice for collisions. It is rejected here because:

1. **Determinism.** The same seeded height function (`h(x,z)`) both generates the
   mesh and answers "where is the ground", so the player can never fall through a
   triangle or hover above it — the classic heightfield/mesh impedance mismatch.
2. **Weight.** `@react-three/rapier` ships a WASM core; it would be the largest
   single asset in the bundle, ahead of three.js itself.
3. **Need.** This game needs ground-following, slope limits, cylinder/box
   intersection for rocks and buildings — tens of colliders in range at once, not
   thousands. Analytic queries cost microseconds and allocate nothing.

What is genuinely lost: rigid-body dynamics (tumbling rocks, vehicle suspension).
The rover therefore uses a raycast-spring model — the standard technique in
vehicle simulators — rather than pretending to be a physics engine.

### 2.2 Chunked world, generated from a seed

The world is an **infinite, deterministic** field of 64 m chunks, generated on a
disc around the player and disposed behind them. Height comes from a layered
simplex-style value noise plus explicit impact craters, so a crater is a real
depression in the ground the player walks down into, not a decal.

Consequence: no world file, no download, no memory ceiling, and the same seed
("Mars" · `2047`) always yields the same planet — which is what makes a save file
of a few hundred bytes sufficient.

### 2.3 Frame-budget split

React renders the HUD and the DOM overlays. The render loop mutates Three.js
objects and the player/rover state **without** calling `setState` per frame; a
`useSyncExternalStore`-style subscription pushes telemetry to React at ≤10 Hz.
Without that split a 60 FPS game re-renders React 60 times a second and drops to
single digits on a tablet.

### 2.4 Overlays outside the canvas (no drei Html)

`@react-three/drei`'s `<Html>` creates a DOM subtree per instance and re-renders
through React. Interaction prompts, markers and notifications are projected from
3D to screen coordinates once per frame in the HUD layer instead — one DOM node
regardless of the number of markers.

### 2.5 Persistence

IndexedDB (native API, no dependency) with an in-memory fallback when the API is
blocked (Safari private mode, embedded webviews). Every read validates shape and
version and **resets rather than throwing** on a corrupt record, because a game
that fails to boot after a bad write is worse than one that loses progress.

---

## 3. Module layout

```
src/game/
  world/      noise.ts  terrain.ts  craters.ts  rocks.ts  chunks.ts
  physics/    heightfield.ts  colliders.ts  raycast-spring.ts
  entities/   astronaut.ts  rover.ts
  input/      keyboard.ts  touch.ts  gamepad.ts (stretch)
  state/      store.ts  resources.ts  save.ts (IndexedDB)
  science/    samples.ts  journal.ts  catalogue.ts (static, sourced)
  render/     MarsGameCanvas.tsx  Terrain.tsx  Sky.tsx  Dust.tsx  Lighting.tsx
  ui/         MainMenu.tsx  Hud.tsx  PauseMenu.tsx  Settings.tsx  Inventory.tsx
              MarsMap.tsx  JournalPanel.tsx  QualityPanel.tsx  TouchControls.tsx
              WebGLFallback.tsx
  MarsGame.tsx            (route shell, mounts the above)
  quality.ts              (HIGH / BALANCED / LOW presets + auto-detect)
docs/MARS_GAME_PLAN.md    (this file)
```

`src/game/**` is added to **no** existing test's exclusion list — the code must
pass the repository's audits rather than be exempted from them.

---

## 4. Phases and their verifiable exit criteria

Each phase ends with a green gate run and a commit. "Playable" below means the
previous phase's controls still work.

| # | Phase | Exit criterion (verified how) |
| --- | --- | --- |
| 1 | Audit | this document; gates green on the untouched base |
| 2 | Terrain + environment | seeded heightfield, chunk LOD, sky/sun, dust; screenshot-free unit tests on `height()`, chunk bounds, seam continuity |
| 3 | Astronaut | walk/run/jump on the analytic ground, slope limit, gravity; unit tests on movement integration |
| 4 | Camera + interaction | third/first person, pointer-lock with fallback, proximity prompts; tests on the projection maths |
| 5 | Rover | enter/exit, raycast-spring driving, battery/distance; tests on the drive model |
| 6 | Science | scan/sample/journal/inventory; catalogue provenance tests |
| 7 | HUD, map, save | telemetry at 10 Hz, map projection, IndexedDB round-trip incl. corrupt-record recovery |
| 8 | Touch | virtual stick, drag-look, context buttons; tests on the input reducer |
| 9 | Performance | HIGH/BALANCED/LOW presets, auto-detect, dynamic resolution, adaptive quality; budget assertions |
| 10 | Testing + deployment | full `npm test`, `npm run build`, bundle check, jsdom mount of the route, honest test report |

---

## 5. Honesty contract for the game itself

- Resource HUD values (O₂, suit battery, rover battery) are **simulated** and
  labelled as such in the interface, not presented as telemetry.
- Rock and mineral identifications are **illustrative classifications** drawn from
  published Mars mineralogy (olivine basalt, hematite "blueberries", jarosite,
  hydrated silica…), attributed as *educational simulation*, never as measured
  results from a real sample.
- NASA imagery references come from the existing, already-audited endpoints
  (`/api/mars/latest`, `/api/mars/photos`); the game itself makes **no** direct
  third-party requests, so a NASA outage degrades a panel, never the frame loop.
- No feature is described as working before it is executed. Where a phase cannot
  be verified in this sandbox (WebGL rendering needs a GPU), that is stated in the
  test report rather than replaced with a claim.
