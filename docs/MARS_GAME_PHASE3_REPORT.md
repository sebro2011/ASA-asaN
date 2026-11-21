# Mars Explorer — Phase 3 report

## Terrain artifact

At the documented `(76, -237)` canyon viewpoint the original third-person camera
sat below the rising ground: the analytic ground height at the desired camera
position is higher than the camera. A diagnostic changed **only the sky shader** to
magenta, leaving the terrain fog color unchanged; the pale wedge became magenta,
confirming that sky was visible through the front-face-culled ground. Prior tests of
dissolve and fog did not account for this camera intersection.

The third-person camera is now clamped above the ground after smoothing, sampling
its immediate footprint with a margin for the near plane and mesh approximation.
This removed the wedge at the documented view in headless Chromium. It is not a
full camera collision solver: terrain can still occlude the player in very steep
terrain, and other camera angles and devices need further real-world testing.

- [Canyon before](screenshots/mars-phase3/canyon-before.png)
- [Canyon after](screenshots/mars-phase3/canyon-after.png)
- [Tablet portrait](screenshots/mars-phase3/tablet-portrait.png)
- [Tablet landscape](screenshots/mars-phase3/tablet-landscape.png)
- [Mission journal](screenshots/mars-phase3/missions.png)

## Controls and missions

- Partial movement-stick deflection now results in partial astronaut speed.
  Boarding and scanning are edge-triggered, so holding a button does not repeatedly
  activate it. Held input is cleared on blur, menu transitions and pointer loss;
  touch steering and action pointers cannot be stolen by a second pointer. Touch
  controls are hidden behind menus and raised above the telemetry strip. The
  touch jump button becomes a brake in rover mode.
- Rover gravity now follows the actual downhill component of the terrain gradient;
  the gradient and slope share four height samples rather than calculating the slope
  twice. Streaming ring sorting is skipped unless the player enters a new chunk;
  per-frame sun vector/color allocations were removed.
- The journal has geology, crater-rim and ordered rover-traverse exercises with
  saved progress. The geology objective counts distinct simulated sample types;
  the rim and checkpoints are generated-world locations, not actual Mars sites.
  Older saves default to no checkpoint flags. English, Sinhala and Tamil copy
  distinguishes scientific context from simulated observations. NASA's Mars
  science overview is linked from the journal.

## Verification

- `npm test`: **1,164 passed, 0 failed**, including the focused Mars suites
  (**72/72**).
- `npm run lint`: passed; `npm run build`: passed; `check:pwa`: passed with 167
  precached entries; `check:bundle` and documentation links passed.
- Chromium/SwiftShader: the canyon before/after scene rendered at 1440×900; the
  journal opened at 1280×800. Emulated touch layouts at 800×1280 and 1280×800 had
  no horizontal document overflow. This was browser emulation, not a physical
  tablet or a complete playthrough of every mission.
- The development browser emitted a blocked Vite WebSocket CSP message and two
  502 resource responses in this network-restricted environment. The scene and
  journal rendered; these messages were not verified as production failures.

## Limitations

GTX 960 and Android tablet frame rates, memory use, thermal behavior, fullscreen
and real touch handling have not been measured on physical hardware. SwiftShader
FPS is not representative. Mission progress and physics have automated tests, but
complete missions, all camera angles and device orientations still need human
playtesting. Procedural terrain, rock identification, mission locations, battery
figures and rover speeds are gameplay simulations, not NASA telemetry or a real
Mars reconstruction. The tests do not prove scientific identification in-game.
