/**
 * The game's colour vocabulary.
 *
 * Mars is not "red". The surface reads as a warm grey-brown in most MER and MSL
 * imagery because the dominant materials — basaltic sand, dust, and iron-oxide
 * coated grains — sit at different values, and the dusty sky scatters blue-ish
 * light forward rather than red. These constants are deliberately muted; the
 * saturated "Mars red" of stock imagery is what makes a rendering look like a
 * toy.
 *
 * They are literals rather than design tokens because they are *material*
 * colours consumed by the 3D renderer, not interface colours: they must not
 * inherit a light-mode theme override that would turn the planet pale.
 *
 * **Values, not hues, were the first version's mistake.** Mars' geometric albedo
 * is about 0.17 — the planet genuinely is dark grey-brown; the "red planet" look
 * of press imagery comes from the camera's exposure, not from bright sand. Those
 * constants were picked to look right on a swatch, and once the sunlight term
 * multiplied them the red channel integrated to 1.37 and clipped. Everything then
 * tone-mapped to the same pale cream, which is why the surface read as a smooth
 * beige sheet no matter what detail was added on top. The albedos below are ~35 %
 * darker, which keeps the lit result inside the 0–1 range and lets the material
 * variation actually be visible.
 *
 * Cross-check: MER and MSL surface imagery, exposure-corrected, puts typical
 * Gusev and Gale regolith around #7a5a45–#9a7358 in sRGB. That is what `dust`
 * and `highland` represent *after* lighting; as albedos they must be lower.
 *
 * **The sky values had the same fault.** `#d8b08a` linearises to 0.687 in red,
 * which is past the shoulder of the ACES curve — every value above about 0.5
 * compresses toward the same near-white, so the sky rendered as a single flat
 * cream field at every elevation from the horizon to the zenith. The horizon is
 * now `#a87d5c` (0.386 linear), which leaves the whole upper half of the curve
 * for the gradient to use, and the zenith is darker again so the ramp is visible
 * at a glance.
 */

/** Sunlight on Mars carries about 43% of Earth's irradiance at 1 AU. */
export const SUN_IRRADIANCE = 0.43;

export const MARS_PALETTE = {
  /** Basaltic sand — the darkest, most neutral surface material. */
  basalt: '#2a2320',
  /** Iron-oxide coated fines — the familiar ochre. Deliberately dark: see below. */
  ochre: '#6b4630',
  /** Dust-lifted highlands, lighter and greyer. */
  highland: '#8a6148',
  /** Fine dust on rocks and in the air. */
  dust: '#a87d5e',
  /**
   * Exposed bedrock on steep faces: darker and cooler than the dust that covers
   * the flats. Realistic Mars imagery is full of these near-black scarps in an
   * otherwise pale landscape — the value contrast, not the hue, is what sells it.
   */
  bedrock: '#382c25',

  /** Sky at the zenith: dusty, desaturated, slightly cool. */
  skyZenith: '#3a3029',
  /** Sky near the horizon: bright, almost cream where the sun is. */
  skyHorizon: '#a87d5c',
  /** The classic "butterscotch" Martian sunset glow. */
  sunGlow: '#c79a6a',

  /** Ambient bounce from the bright ground — Martian shadows are never black. */
  ambientGround: '#5b4636',
  /** Sky-coloured fill from above. */
  ambientSky: '#8c7a68',
} as const;

/** Night sky above a thin CO₂ atmosphere: stars are visible even by day. */
export const MARS_NIGHT = {
  zenith: '#050a16',
  horizon: '#141b28',
  starColor: '#dfe8ff',
} as const;

/**
 * Science-interaction accent. Deliberately the interface's `--color-atmo`
 * (cyan) so a scannable object reads as part of the COSMORA interface rather
 * than as a game-only highlight.
 */
export const SCAN_ACCENT = '#5ed3f2';
