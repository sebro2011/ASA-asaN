/**
 * Real astronomy maths for the workspace modules.
 *
 * Nothing here is decorative: Orbit Lab shows these numbers with the formula
 * that produced them, and the observing plan labels each session with the Moon
 * phase for its date. Every helper validates its input and returns `null`
 * instead of a misleading number.
 */

/** Gravitational parameters (km³/s²) and mean radii (km) for the bodies we offer. */
export const CENTRAL_BODIES = {
  earth: { mu: 398600.4418, radius: 6371.0, labelKey: 'wsBodyEarth' },
  moon: { mu: 4902.800118, radius: 1737.4, labelKey: 'wsBodyMoon' },
  sun: { mu: 1.32712440018e11, radius: 695700, labelKey: 'wsBodySun' },
  mars: { mu: 42828.375214, radius: 3389.5, labelKey: 'wsBodyMars' },
} as const;

export type CentralBody = keyof typeof CENTRAL_BODIES;

export const SPEED_OF_LIGHT_KM_S = 299792.458;

function positive(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/** Kepler's third law: T = 2π√(a³/μ), returned in seconds. */
export function orbitalPeriodSeconds(semiMajorAxisKm: unknown, mu: number): number | null {
  const a = positive(semiMajorAxisKm);
  if (a === null || !Number.isFinite(mu) || mu <= 0) return null;
  const period = 2 * Math.PI * Math.sqrt((a * a * a) / mu);
  return Number.isFinite(period) && period > 0 ? period : null;
}

export function orbitalPeriodDays(semiMajorAxisKm: unknown, mu: number): number | null {
  const seconds = orbitalPeriodSeconds(semiMajorAxisKm, mu);
  return seconds === null ? null : seconds / 86_400;
}

/** Circular orbital speed: v = √(μ/r), km/s. */
export function orbitalSpeedKmS(radiusKm: unknown, mu: number): number | null {
  const r = positive(radiusKm);
  if (r === null || !Number.isFinite(mu) || mu <= 0) return null;
  const speed = Math.sqrt(mu / r);
  return Number.isFinite(speed) && speed > 0 ? speed : null;
}

/** Escape speed from the same radius: √2 × circular speed. */
export function escapeSpeedKmS(radiusKm: unknown, mu: number): number | null {
  const speed = orbitalSpeedKmS(radiusKm, mu);
  return speed === null ? null : speed * Math.SQRT2;
}

/** Convert an altitude above the surface into a radius from the centre. */
export function radiusFromAltitude(altitudeKm: unknown, bodyRadiusKm: number): number | null {
  const altitude = typeof altitudeKm === 'number' ? altitudeKm : Number(altitudeKm);
  if (!Number.isFinite(altitude) || altitude < 0) return null;
  if (!Number.isFinite(bodyRadiusKm) || bodyRadiusKm <= 0) return null;
  return bodyRadiusKm + altitude;
}

/** One-way light time for a distance in km, in seconds. */
export function lightTimeSeconds(distanceKm: unknown): number | null {
  const distance = positive(distanceKm);
  return distance === null ? null : distance / SPEED_OF_LIGHT_KM_S;
}

/** Apparent angular diameter in degrees: θ = 2·atan(d / 2D). */
export function angularDiameterDegrees(diameterKm: unknown, distanceKm: unknown): number | null {
  const diameter = positive(diameterKm);
  const distance = positive(distanceKm);
  if (diameter === null || distance === null) return null;
  const radians = 2 * Math.atan(diameter / (2 * distance));
  const degrees = (radians * 180) / Math.PI;
  return Number.isFinite(degrees) ? degrees : null;
}

/* ------------------------------------------------------------------- Moon */

const SYNODIC_MONTH_DAYS = 29.530588853;
/** 2000-01-06 18:14 UTC, a known new moon (JD 2451550.1). */
const REFERENCE_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);

export const MOON_PHASE_KEYS = [
  'wsMoonNew',
  'wsMoonWaxingCrescent',
  'wsMoonFirstQuarter',
  'wsMoonWaxingGibbous',
  'wsMoonFull',
  'wsMoonWaningGibbous',
  'wsMoonLastQuarter',
  'wsMoonWaningCrescent',
] as const;

export interface MoonPhase {
  /** 0 = new, 0.5 = full, 1 = new again. */
  fraction: number;
  /** 0 = dark, 1 = fully lit. */
  illumination: number;
  phaseKey: (typeof MOON_PHASE_KEYS)[number];
  waxing: boolean;
}

/** Lunar phase for an instant, from the mean synodic month. */
export function moonPhase(date: Date | string | number): MoonPhase | null {
  const time = date instanceof Date ? date.getTime() : new Date(date).getTime();
  if (!Number.isFinite(time)) return null;
  const days = (time - REFERENCE_NEW_MOON_MS) / 86_400_000;
  const cycles = days / SYNODIC_MONTH_DAYS;
  const fraction = ((cycles % 1) + 1) % 1;
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
  const index = Math.round(fraction * 8) % 8;
  return {
    fraction,
    illumination,
    phaseKey: MOON_PHASE_KEYS[index],
    waxing: fraction < 0.5,
  };
}

/** `YYYY-MM-DD` for a Date in local time, without a timezone shift. */
export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Compact period label: days when short, years when long. */
export function formatPeriod(days: number): { value: string; unit: 'days' | 'years' } {
  if (days < 1) return { value: days.toFixed(3), unit: 'days' };
  if (days < 365) return { value: days.toFixed(2), unit: 'days' };
  return { value: (days / 365.25).toFixed(2), unit: 'years' };
}
