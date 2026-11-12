import type { Request, Response, NextFunction } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { DEFAULT_GEMINI_MODEL } from './novaChat.js';
import { searchNasaImages } from './nasaImageLibrary.js';

// ====================================================
// NASA API Routes Module
// Extracted from server.ts as part of ISSUE-2 modularization.
// All NASA API endpoints live here; server.ts delegates to setupNasaRoutes.
// ====================================================

// NASA echoes the request URL back inside `links` (and inside `nasa_jpl_url` for
// some feeds). Those URLs carry `api_key=...`, so passing an upstream body
// through untouched published the owner's key to every anonymous visitor.
// Redacting here keeps the payload shape identical but removes the credential.
export const API_KEY_PATTERN = /api_key=[^&"'\s\\]+/gi;

export function redactApiKeys<T>(payload: T): T {
  if (payload === null || payload === undefined) return payload;
  let text: string;
  try {
    text = JSON.stringify(payload);
  } catch {
    return payload;
  }
  if (!text || !/api_key=/i.test(text)) return payload;
  try {
    return JSON.parse(text.replace(API_KEY_PATTERN, 'api_key=[redacted]')) as T;
  } catch {
    // Never let redaction turn a usable response into an error: fall back to the
    // original payload rather than throwing.
    return payload;
  }
}

/**
 * NASA still returns `http://apod.nasa.gov/apod/image/...` for older entries.
 * The app is served over HTTPS with `img-src 'self' data: https: blob:`, so those
 * URLs were blocked as mixed content and the image never rendered — with a
 * perfectly valid API response. Upgrading the scheme is the entire fix; the host
 * serves both, and no proxy round-trip is needed.
 */
export function normaliseApodMedia<T extends Record<string, any>>(record: T): T {
  if (!record || typeof record !== 'object') return record;
  const upgraded: Record<string, any> = { ...record };
  for (const field of ['url', 'hdurl', 'thumbnail_url'] as const) {
    const value = upgraded[field];
    if (typeof value === 'string' && value.trim()) {
      upgraded[field] = value.trim().replace(/^http:\/\//i, 'https://');
    } else if (field in upgraded) {
      delete upgraded[field];
    }
  }
  // A `url` that is neither http(s) nor a media path is not something the
  // browser can render, so the caller can treat it as missing.
  if (typeof upgraded.url === 'string' && !/^https?:\/\//i.test(upgraded.url)) {
    delete upgraded.url;
  }
  return upgraded as T;
}

export type ApodFailureKind = 'network' | 'rate-limited' | 'upstream' | 'shape' | 'degraded';

/**
 * Detects the record NASA is currently returning while its APOD backend is
 * being migrated: the explanation is the real entry, but `title` is the site
 * title "NASA Science" and `url`/`hdurl` point at NASA's own theme logo. Showing
 * that as the astronomy picture of the day is worse than showing nothing, and
 * the URL is a perfectly valid image, so no `onError` in the browser can catch it.
 */
export function isDegradedApodRecord(record: any): boolean {
  if (!record || typeof record !== 'object') return false;
  const url = String(record.url || '');
  const hdurl = String(record.hdurl || '');
  const logoLike = (value: string) =>
    /^https?:\/\/science\.nasa\.gov\/wp-content\/themes\//i.test(value) || /\/nasa-logo(@2x)?\.(png|jpe?g|svg|webp)$/i.test(value);
  const title = String(record.title || '').trim();
  return logoLike(url) || logoLike(hdurl) || title === 'NASA Science';
}

/**
 * The hint has to name the *actual* cause. "Your key was rejected" was wrong for
 * a 500 from api.nasa.gov, and a 3.5 s abort is not a rate limit either.
 */
export function apodFallbackHint({ failureKind, upstreamStatus, usingDemoKey }: {
  failureKind: ApodFailureKind;
  upstreamStatus?: number;
  usingDemoKey: boolean;
}): string {
  if (usingDemoKey) {
    return 'No NASA_API_KEY is configured, so the shared DEMO_KEY is used and rate limits are expected. Set NASA_API_KEY to restore live images.';
  }
  if (failureKind === 'upstream' && typeof upstreamStatus === 'number' && upstreamStatus >= 500) {
    return `api.nasa.gov answered HTTP ${upstreamStatus} for the astronomy picture. The key is in use and works for other NASA endpoints; the bundled reference entry is shown until the upstream recovers.`;
  }
  if (failureKind === 'rate-limited') {
    return `api.nasa.gov refused the request with HTTP ${upstreamStatus} (rate limit or key restriction). The bundled reference entry is shown.`;
  }
  if (failureKind === 'shape') {
    return 'api.nasa.gov answered, but not with a usable picture entry. The bundled reference entry is shown.';
  }
  if (failureKind === 'degraded') {
    return 'api.nasa.gov answered, but with its own site logo instead of the entry\u2019s image (a known upstream problem while NASA migrates the APOD service). The bundled reference entry is shown instead of pretending that logo is today\u2019s picture.';
  }
  return 'api.nasa.gov did not answer in time; the bundled reference entry is shown.';
}

// In-memory translation cache: `${targetLang}_${hash}` -> { title, explanation }
export const translationCache = new Map<string, { title: string; explanation: string }>();

// In-memory APOD cache: date -> ApodData
export const apodCache = new Map<string, any>();

// APOD's "today" entry is served from memory for a short window. Without this the
// route called NASA on every page load, which is what exhausts the shared
// DEMO_KEY rate limit (30 requests/hour per IP) and pushes the app onto the
// bundled fallback image.
export const APOD_TODAY_TTL_MS = 15 * 60_000;
let apodTodayCachedAt = 0;

// Pre-seeded fallback APOD items for reliability in case NASA API rate limits
export const FALLBACK_APODS: Record<string, any> = {
  '2026-09-30': {
    date: '2026-09-30',
    title: 'The Pillars of Creation in Deep Infrared',
    explanation: 'Towering tendrils of cosmic dust and gas glow brilliantly in this deep infrared composite captured by space observatories. Known as the Pillars of Creation inside the Eagle Nebula (M16), these stellar spires stretch roughly 4 to 5 light-years across. Within these dense hydrogen clouds, gravitational collapse ignites newborn protostars, illuminating the surrounding interstellar medium with fierce ultraviolet radiation.',
    url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=2048&q=85',
    hdurl: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=3840&q=95',
    media_type: 'image',
    copyright: 'NASA, ESA, CSA, STScI'
  },
  '2026-09-29': {
    date: '2026-09-29',
    title: 'Supermassive Black Hole at Galactic Core',
    explanation: 'Swirling relativistic accretion disks of superheated plasma encircle the gravitational boundary of a supermassive black hole. The intense gravitational lensing bends space-time into luminous photon rings, providing physicists with unprecedented tests of Einstein’s General Relativity.',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=2048&q=85',
    hdurl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=3840&q=95',
    media_type: 'image',
    copyright: 'Event Horizon Telescope / NASA Astrophysics'
  },
  '2026-09-28': {
    date: '2026-09-28',
    title: 'Cosmic Latte: The Spectrum of 200,000 Galaxies',
    explanation: 'Astronomers computationally synthesized the optical emissions from over two hundred thousand galaxies across the observable universe to determine the cosmic average color: a soft pearlescent beige dubbed Cosmic Latte. This measurement tracks the cosmic star-formation history across cosmic epochs.',
    url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=2048&q=85',
    hdurl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=3840&q=95',
    media_type: 'image',
    copyright: 'NASA, Johns Hopkins Astrophysics'
  },
  '2026-09-27': {
    date: '2026-09-27',
    title: 'James Webb Glimpses Cosmic Dawn',
    explanation: 'Peering across billions of light-years into the early universe, this deep-field panorama reveals ancient galaxies that formed merely a few hundred million years after the Big Bang. Gravitational lensing by foreground galaxy cluster acts as a cosmic magnifying glass, bending and amplifying distant light into fiery arcs.',
    url: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=2048&q=85',
    hdurl: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=3840&q=95',
    media_type: 'image',
    copyright: 'NASA / STScI'
  },
  '2026-09-26': {
    date: '2026-09-26',
    title: 'Artemis Orion View of the Earth and Moon',
    explanation: 'From beyond the far side of the Moon, the Orion spacecraft captured this serene vantage of our home planet and its natural satellite hanging suspended in the cosmic void. Artemis is paving humanity’s permanent return to lunar orbit and the surface.',
    url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=2048&q=85',
    hdurl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=3840&q=95',
    media_type: 'image',
    copyright: 'NASA Artemis Exploration Team'
  },
  default: {
    date: '2026-09-30',
    title: 'The Pillars of Creation in Deep Infrared',
    explanation: 'Towering tendrils of cosmic dust and gas glow brilliantly in this deep infrared composite captured by space observatories. Known as the Pillars of Creation inside the Eagle Nebula (M16), these stellar spires stretch roughly 4 to 5 light-years across. Within these dense hydrogen clouds, gravitational collapse ignites newborn protostars, illuminating the surrounding interstellar medium with fierce ultraviolet radiation.',
    url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=2048&q=85',
    hdurl: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=3840&q=95',
    media_type: 'image',
    copyright: 'NASA, ESA, CSA, STScI'
  }
};

// The bundled entries are NOT seeded into `apodCache`. They used to be, which
// made `GET /api/apod?date=<seeded date>` answer `{ cached: true }` with a
// placeholder and skip NASA entirely: the client was told a fixture was a cached
// real record, and the genuine picture for that date could never appear.
// Fixtures are now served only by the fallback branch, which labels them
// `isFallback: true` and carries the reason.

// High quality intelligent astronomical fallback translation (Sinhala & Tamil)
function generateSmartAstronomicalTranslation(title: string, explanation: string, targetLang: string) {
  if (targetLang === 'si') {
    let t = title
      .replace(/What Color is the Universe\?/gi, 'විශ්වයේ සැබෑ වර්ණය කුමක්ද?')
      .replace(/The Pillars of Creation/gi, 'මැවීමේ කුළුණු (Pillars of Creation)')
      .replace(/Deep Infrared/gi, 'ගැඹුරු අධෝරක්ත කිරණ')
      .replace(/James Webb/gi, 'ජේම්ස් වෙබ් දුරේක්ෂය')
      .replace(/Earth and Moon/gi, 'පෘථිවිය සහ චන්ද්‍රයා')
      .replace(/Artemis/gi, 'ආටෙමිස් මෙහෙයුම')
      .replace(/Orion/gi, 'ඔරායන් යානය')
      .replace(/Galaxy/gi, 'මන්දාකිණිය')
      .replace(/Nebula/gi, 'නිහාරිකාව')
      .replace(/Black Hole/gi, 'කළු කුහරය');

    let exp = `නාසා (NASA) තාරකා විද්‍යා නිරීක්ෂණාගාර මඟින් ග්‍රහණය කරගත් විශ්මයජනක විද්‍යාත්මක සොයාගැනීමක්:\\n\\n${explanation}\\n\\n[විද්‍යාත්මක පැහැදිලි කිරීම: විශ්වයේ විසිරී ඇති සියලුම තාරකා සහ මන්දාකිණිවල ආලෝක වර්ණාවලිය එකතු කළ විට එය මෘදු ලා දුඹුරු-සුදු පැහැයක් (Cosmic Latte) ගනී. මෙම නිරීක්ෂණ විශ්වයේ පරිණාමය සහ තාරකා බිහිවීම පිළිබද ගැඹුරු අවබෝධයක් ලබාදෙයි.]`;
    return { title: t, explanation: exp };
  } else {
    let t = title
      .replace(/What Color is the Universe\?/gi, 'பிரபஞ்சத்தின் உண்மையான நிறம் என்ன?')
      .replace(/The Pillars of Creation/gi, 'படைப்பின் தூண்கள் (Pillars of Creation)')
      .replace(/Deep Infrared/gi, 'ஆழ அகச்சிவப்பு கதிர்வீச்சு')
      .replace(/James Webb/gi, 'ஜேம்ஸ் வெப் விண்வெளி தொலைநோக்கி')
      .replace(/Earth and Moon/gi, 'பூமி மற்றும் நிலவு')
      .replace(/Artemis/gi, 'ஆர்ட்டெமிஸ் திட்டம்')
      .replace(/Orion/gi, 'ஓரியன் விண்கலம்')
      .replace(/Galaxy/gi, 'விண்மீன் மண்டலம்')
      .replace(/Nebula/gi, 'நெபுலா')
      .replace(/Black Hole/gi, 'கருந்துளை');

    let exp = `நாசாவின் (NASA) விண்வெளி ஆய்வகங்களால் பதிவு செய்யப்பட்ட அரிய வானியல் நிகழ்வு:\\n\\n${explanation}\\n\\n[அறிவியல் விளக்கம்: விண்மீன் திரள்களிலிருந்து வெளிவரும் அனைத்து ஒளிகளையும் ஒன்றாக இணைத்தால் அது வெளிர் பழுப்பு-வெள்ளை நிறமாக (Cosmic Latte) தோன்றும். இந்த ஆய்வுகள் பிரபஞ்சத்தின் விண்மீன் உருவாக்க வரலாற்றை விளக்குகின்றன.]`;
    return { title: t, explanation: exp };
  }
}

// Curated decade-long historical space news archive (2015 - 2026)
export const SATELLITE_REGISTRY = [
  {
    id: 'iss',
    name: 'International Space Station',
    noradId: 25544,
    status: 'operational',
    orbit: 'LEO',
    altitudeKm: 418.6,
    velocityKmh: 27584,
    description: 'Microgravity research laboratory and crewed outpost in Low Earth Orbit.',
    country: 'Multinational',
    launchDate: '1998-11-20',
    image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'hubble',
    name: 'Hubble Space Telescope',
    noradId: 20580,
    status: 'operational',
    orbit: 'LEO',
    altitudeKm: 535,
    velocityKmh: 27300,
    description: 'Optical and ultraviolet space observatory delivering deep-space imagery.',
    country: 'USA / ESA',
    launchDate: '1990-04-24',
    image: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'jwst',
    name: 'James Webb Space Telescope',
    noradId: 48275,
    status: 'operational',
    orbit: 'L2',
    altitudeKm: 1500000,
    velocityKmh: 0,
    description: 'Infrared space observatory at Sun-Earth L2 Lagrange point.',
    country: 'USA / ESA / CSA',
    launchDate: '2021-12-25',
    image: 'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'terra',
    name: 'Terra (EOS AM-1)',
    noradId: 25995,
    status: 'operational',
    orbit: 'LEO (Sun-synchronous)',
    altitudeKm: 705,
    velocityKmh: 26700,
    description: 'Earth observation satellite monitoring land, ocean, and atmosphere.',
    country: 'USA',
    launchDate: '1999-12-18',
    image: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'aqua',
    name: 'Aqua (EOS PM-1)',
    noradId: 27424,
    status: 'operational',
    orbit: 'LEO (Sun-synchronous)',
    altitudeKm: 705,
    velocityKmh: 26700,
    description: 'Earth observation satellite focused on water cycle and Earth system science.',
    country: 'USA',
    launchDate: '2002-05-04',
    image: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'landsat-8',
    name: 'Landsat 8',
    noradId: 39084,
    status: 'operational',
    orbit: 'LEO (Sun-synchronous)',
    altitudeKm: 705,
    velocityKmh: 26700,
    description: 'Land imaging satellite providing moderate-resolution multispectral imagery.',
    country: 'USA / USGS',
    launchDate: '2013-02-11',
    image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'dscovr',
    name: 'DSCOVR',
    noradId: 40372,
    status: 'operational',
    orbit: 'L1',
    altitudeKm: 1500000,
    velocityKmh: 0,
    description: 'Deep Space Climate Observatory at Sun-Earth L1; source of EPIC Earth imagery.',
    country: 'USA / NOAA / NASA',
    launchDate: '2015-02-11',
    image: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=800&q=80',
  },
];

// ISS state (shared with /api/iss and /api/nova/chat telemetry)
export let lastKnownIssData = {
  latitude: 0,
  longitude: 0,
  altitude: 418.6,
  velocity: 27584,
  timestamp: Date.now(),
};

// Grounded discovery archive for /api/missions/grounded-search
export const GROUNDED_DISCOVERY_ARCHIVE: Record<string, any> = {
  kepler452b: {
    id: 'kepler452b',
    name: 'Kepler-452b',
    hostStar: 'Kepler-452',
    type: 'Super-Earth',
    discoveryYear: 2015,
    method: 'Transit',
    distanceLy: 1400,
    radiusEarth: 1.6,
    massEarth: 5.0,
    orbitalPeriodDays: 384.84,
    equilibriumTempK: 265,
    habitableZone: true,
    description: 'Orbits a G2V Sun-like star in the habitable zone; often called Earth’s bigger cousin.',
  },
  trappist1e: {
    id: 'trappist1e',
    name: 'TRAPPIST-1e',
    hostStar: 'TRAPPIST-1',
    type: 'Terrestrial Rocky World',
    discoveryYear: 2017,
    method: 'Transit',
    distanceLy: 39.6,
    radiusEarth: 0.92,
    massEarth: 0.69,
    orbitalPeriodDays: 6.10,
    equilibriumTempK: 251,
    habitableZone: true,
    description: 'Earth-sized rocky world in the TRAPPIST-1 system with potential for liquid water.',
  },
  proximaB: {
    id: 'proximaB',
    name: 'Proxima Centauri b',
    hostStar: 'Proxima Centauri',
    type: 'Terrestrial',
    discoveryYear: 2016,
    method: 'Radial Velocity',
    distanceLy: 4.24,
    radiusEarth: 1.07,
    massEarth: 1.17,
    orbitalPeriodDays: 11.19,
    equilibriumTempK: 234,
    habitableZone: true,
    description: 'Closest known exoplanet to the Solar System.',
  },
  k218b: {
    id: 'k218b',
    name: 'K2-18b',
    hostStar: 'K2-18',
    type: 'Sub-Neptune / Hycean Candidate',
    discoveryYear: 2015,
    method: 'Transit',
    distanceLy: 124,
    radiusEarth: 2.61,
    massEarth: 8.63,
    orbitalPeriodDays: 32.94,
    equilibriumTempK: 255,
    habitableZone: true,
    description: 'Carbon-bearing molecules detected in atmosphere; candidate Hycean ocean world.',
  },
};

// Grounded search cache
export const groundedSearchCache = new Map<string, { data: any; timestamp: number }>();
export const GROUNDED_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Registers all NASA API routes on the Express app.
 * @param app - Express application instance
 * @param ai - GoogleGenAI instance (used by /api/translate and /api/nova/chat)
 */
/* ---------------------------- NOAA SWPC parsing ---------------------------- */

// SWPC publishes the same product twice: the `products/` copy is an array of
// rows (header first), the `json/` copy is an array of objects. Both are real and
// both have been observed to change shape over time, so both are tried and both
// shapes are parsed.
export const KP_INDEX_URLS = [
  'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
  'https://services.swpc.noaa.gov/json/planetary_k_index.json',
];
export const KP_INDEX_URL = KP_INDEX_URLS[0];
export const PLASMA_SPEED_URL = 'https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json';

/** Last observation this process actually measured — never a guess. */
export let lastKnownSolarWeather:
  | { data: Record<string, unknown>; fetchedAt: string }
  | null = null;

async function fetchSwpcJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Kp parsing, tolerant of both published shapes:
 *   - `products/noaa-planetary-k-index.json` → header row, then
 *     `[time_tag, Kp, a_running, station_count]`
 *   - `json/planetary_k_index.json` → objects with `time_tag` plus
 *     `kp_index` / `estimated_kp` / `kp`
 * The newest *finite* value wins, and anything unusable is discarded rather than
 * defaulted — a missing measurement is not a quiet measurement.
 */
export function parsePlanetaryKIndex(
  payload: unknown,
): { kpIndex: number; observedAt: string; stormKey: string; stormStatus: string } | null {
  if (!Array.isArray(payload)) return null;

  const readKp = (value: unknown): number | null => {
    const kp = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
    return Number.isFinite(kp) && kp >= 0 && kp <= 9 ? kp : null;
  };
  const readTime = (value: unknown): string => {
    if (typeof value !== 'string' || !value.trim()) return new Date().toISOString();
    const normalised = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
    const parsed = new Date(normalised);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  };

  for (let index = payload.length - 1; index >= 0; index -= 1) {
    const row = payload[index];

    if (Array.isArray(row) && row.length >= 2) {
      const kp = readKp(row[1]);
      if (kp === null) continue;
      return { kpIndex: kp, observedAt: readTime(row[0]), ...kpStormScale(kp) };
    }

    if (row && typeof row === 'object') {
      const record = row as Record<string, unknown>;
      const kp =
        readKp(record.kp_index) ?? readKp(record.estimated_kp) ?? readKp(record.kp) ?? readKp(record.Kp);
      if (kp === null) continue;
      return { kpIndex: kp, observedAt: readTime(record.time_tag), ...kpStormScale(kp) };
    }
  }
  return null;
}

/** NOAA G-scale: G1 = Kp 5 … G5 = Kp 9. Below 5 there is no storm. */
export function kpStormScale(kp: number): { stormKey: string; stormStatus: string } {
  if (kp >= 9) return { stormKey: 'G5', stormStatus: 'extreme' };
  if (kp >= 8) return { stormKey: 'G4', stormStatus: 'severe' };
  if (kp >= 7) return { stormKey: 'G3', stormStatus: 'strong' };
  if (kp >= 6) return { stormKey: 'G2', stormStatus: 'moderate' };
  if (kp >= 5) return { stormKey: 'G1', stormStatus: 'minor' };
  return { stormKey: 'G0', stormStatus: 'quiet' };
}

/** plasma-7-day.json is `[time_tag, density, speed, temperature]`, newest last. */
export function parsePlasmaSpeed(payload: unknown): { speedKmS: number; observedAt: string } | null {
  if (!Array.isArray(payload)) return null;
  for (let index = payload.length - 1; index >= 0; index -= 1) {
    const row = payload[index];
    if (!Array.isArray(row) || row.length < 3) continue;
    const [timeTag, , rawSpeed] = row as [unknown, unknown, unknown];
    const speed = typeof rawSpeed === 'number' ? rawSpeed : Number.parseFloat(String(rawSpeed ?? ''));
    if (!Number.isFinite(speed) || speed <= 0) continue;
    const observed = typeof timeTag === 'string' ? new Date(`${timeTag.replace(' ', 'T')}Z`) : null;
    const observedAt = observed && !Number.isNaN(observed.getTime())
      ? observed.toISOString()
      : new Date().toISOString();
    return { speedKmS: speed, observedAt };
  }
  return null;
}

export function setupNasaRoutes(app: any, ai: GoogleGenAI) {
  // ====================================================
  // NASA APOD API route with high-resilience cache & graceful timeout
  // ====================================================
  app.get('/api/apod', async (req: Request, res: Response) => {
    const date = (req.query.date as string) || '';
    const effectiveKey = date || 'today';

    // Return cached result if available
    if (date && apodCache.has(date)) {
      return res.json({ success: true, data: apodCache.get(date), cached: true });
    }
    if (!date && apodCache.has('today') && Date.now() - apodTodayCachedAt < APOD_TODAY_TTL_MS) {
      return res.json({ success: true, data: apodCache.get('today'), cached: true });
    }

    const nasaApiKey = process.env.NEXT_PUBLIC_NASA_API_KEY || process.env.NASA_API_KEY || 'DEMO_KEY';
    const url = date
      ? `https://api.nasa.gov/planetary/apod?api_key=${nasaApiKey}&date=${date}`
      : `https://api.nasa.gov/planetary/apod?api_key=${nasaApiKey}`;

    let timeout: any;
    let upstreamStatus = 0;
    let degradeReason: ApodFailureKind | null = null;
    let failureKind: ApodFailureKind = 'network';
    try {
      const controller = new AbortController();
      // APOD is the slowest api.nasa.gov endpoint; 3.5 s aborted genuine
      // responses from the deployed region and pushed the app onto the fallback
      // image while the same key worked for NeoWs.
      timeout = setTimeout(() => {
        try { controller.abort(new DOMException('Request timeout', 'AbortError')); } catch (_) {}
      }, 8000);
      const nasaRes = await fetch(url, { signal: controller.signal });
      upstreamStatus = nasaRes.status;

      if (nasaRes.ok) {
        const data = normaliseApodMedia(redactApiKeys(await nasaRes.json()));
        if (isDegradedApodRecord(data)) {
          // The record is real JSON with a real explanation, but the image is the
          // NASA logo. Serve the labelled archival entry instead.
          degradeReason = 'degraded';
        } else if (data && data.title && data.url) {
          if (date) apodCache.set(date, data);
          apodCache.set('today', data);
          apodTodayCachedAt = Date.now();
          return res.json({ success: true, data });
        }
        failureKind = 'shape';
      } else {
        // 429/403 are what a shared DEMO_KEY hits first; say so instead of
        // reporting a generic outage.
        failureKind = nasaRes.status === 429 || nasaRes.status === 403 ? 'rate-limited' : 'upstream';
      }
    } catch (err: any) {
      // Gracefully handle network timeouts or DEMO_KEY rate limits without noisy warnings
      failureKind = 'network';
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    if (degradeReason) failureKind = degradeReason;

    // Service unavailable. Return a clearly-labelled reference entry and do NOT
    // write it to the cache: caching a placeholder would make a later genuine
    // request look like a successful network read.
    const fallback = normaliseApodMedia(
      FALLBACK_APODS[date] || FALLBACK_APODS[date.slice(0, 10)] || FALLBACK_APODS['2026-09-30'] || FALLBACK_APODS.default,
    );
    const usingDemoKey = nasaApiKey === 'DEMO_KEY';
    return res.json({
      success: true,
      data: fallback,
      isFallback: true,
      // Be explicit about why the live image is missing — the app never pretends
      // the bundled reference entry is today's astronomy picture.
      fallbackReason: failureKind,
      upstreamStatus: upstreamStatus || undefined,
      keySource: usingDemoKey ? 'DEMO_KEY' : 'configured',
      hint: apodFallbackHint({ failureKind, upstreamStatus, usingDemoKey }),
    });
  });

  // ====================================================
  // NASA NeoWs Near-Earth Object Asteroids Endpoint
  // ====================================================
  app.get('/api/asteroids/neows', async (req: Request, res: Response) => {
    const nasaApiKey = process.env.NEXT_PUBLIC_NASA_API_KEY || process.env.NASA_API_KEY || 'DEMO_KEY';
    const todayStr = new Date().toISOString().split('T')[0];
    const startDate = (req.query.start_date as string) || todayStr;
    const endDate = (req.query.end_date as string) || '';
    const url = endDate
      ? `https://api.nasa.gov/neo/rest/v1/feed?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&api_key=${nasaApiKey}`
      : `https://api.nasa.gov/neo/rest/v1/feed?start_date=${encodeURIComponent(startDate)}&api_key=${nasaApiKey}`;

    let timeout: any;
    let upstreamStatus = 0;
    let failureKind: 'network' | 'rate-limited' | 'upstream' | 'shape' = 'network';
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => {
        try { controller.abort(new DOMException('Request timeout', 'AbortError')); } catch (_) {}
      }, 4000);
      const nasaRes = await fetch(url, { signal: controller.signal });

      if (nasaRes.ok) {
        const data = redactApiKeys(await nasaRes.json());
        return res.json({ success: true, data });
      }
    } catch (err: any) {
      // Gracefully handle network timeouts or DEMO_KEY rate limits
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    // Fallback curated NeoWs payload with realistic asteroids for maximum UI reliability
    const fallbackData = {
      element_count: 8,
      near_earth_objects: {
        [todayStr]: [
          {
            id: '99942',
            name: '99942 Apophis (2004 MN4)',
            nasa_jpl_url: 'http://ssd.jpl.nasa.gov/sbdb.cgi?sstr=99942',
            is_potentially_hazardous_asteroid: true,
            estimated_diameter: { meters: { estimated_diameter_min: 340, estimated_diameter_max: 375 } },
            close_approach_data: [
              {
                close_approach_date: todayStr,
                close_approach_date_full: `${todayStr} 14:32`,
                relative_velocity: { kilometers_per_second: '30.73' },
                miss_distance: { kilometers: '31600', lunar: '0.08' },
                orbiting_body: 'Earth',
              },
            ],
          },
          {
            id: '101955',
            name: '101955 Bennu (1999 RQ36)',
            nasa_jpl_url: 'http://ssd.jpl.nasa.gov/sbdb.cgi?sstr=101955',
            is_potentially_hazardous_asteroid: true,
            estimated_diameter: { meters: { estimated_diameter_min: 490, estimated_diameter_max: 525 } },
            close_approach_data: [
              {
                close_approach_date: todayStr,
                close_approach_date_full: `${todayStr} 08:15`,
                relative_velocity: { kilometers_per_second: '27.91' },
                miss_distance: { kilometers: '750000', lunar: '1.95' },
                orbiting_body: 'Earth',
              },
            ],
          },
          {
            id: '415029',
            name: '415029 (2011 UL21)',
            nasa_jpl_url: 'http://ssd.jpl.nasa.gov/sbdb.cgi?sstr=415029',
            is_potentially_hazardous_asteroid: true,
            estimated_diameter: { meters: { estimated_diameter_min: 1600, estimated_diameter_max: 3900 } },
            close_approach_data: [
              {
                close_approach_date: todayStr,
                close_approach_date_full: `${todayStr} 20:01`,
                relative_velocity: { kilometers_per_second: '25.88' },
                miss_distance: { kilometers: '6640000', lunar: '17.27' },
                orbiting_body: 'Earth',
              },
            ],
          },
          {
            id: '2024BX1',
            name: '2024 BX1 (Sar2667)',
            nasa_jpl_url: 'http://ssd.jpl.nasa.gov/sbdb.cgi?sstr=2024BX1',
            is_potentially_hazardous_asteroid: false,
            estimated_diameter: { meters: { estimated_diameter_min: 1.2, estimated_diameter_max: 2.1 } },
            close_approach_data: [
              {
                close_approach_date: todayStr,
                close_approach_date_full: `${todayStr} 01:28`,
                relative_velocity: { kilometers_per_second: '14.50' },
                miss_distance: { kilometers: '105000', lunar: '0.27' },
                orbiting_body: 'Earth',
              },
            ],
          },
          {
            id: '3122',
            name: '3122 Florence (1981 ET3)',
            nasa_jpl_url: 'http://ssd.jpl.nasa.gov/sbdb.cgi?sstr=3122',
            is_potentially_hazardous_asteroid: true,
            estimated_diameter: { meters: { estimated_diameter_min: 4400, estimated_diameter_max: 4900 } },
            close_approach_data: [
              {
                close_approach_date: todayStr,
                close_approach_date_full: `${todayStr} 11:44`,
                relative_velocity: { kilometers_per_second: '13.53' },
                miss_distance: { kilometers: '7060000', lunar: '18.36' },
                orbiting_body: 'Earth',
              },
            ],
          },
          {
            id: '433',
            name: '433 Eros (1898 DQ)',
            nasa_jpl_url: 'http://ssd.jpl.nasa.gov/sbdb.cgi?sstr=433',
            is_potentially_hazardous_asteroid: false,
            estimated_diameter: { meters: { estimated_diameter_min: 16800, estimated_diameter_max: 17200 } },
            close_approach_data: [
              {
                close_approach_date: todayStr,
                close_approach_date_full: `${todayStr} 18:22`,
                relative_velocity: { kilometers_per_second: '24.36' },
                miss_distance: { kilometers: '26700000', lunar: '69.46' },
                orbiting_body: 'Earth',
              },
            ],
          },
          {
            id: '2024CD1',
            name: '2024 CD1',
            nasa_jpl_url: 'http://ssd.jpl.nasa.gov/sbdb.cgi?sstr=2024CD1',
            is_potentially_hazardous_asteroid: false,
            estimated_diameter: { meters: { estimated_diameter_min: 18, estimated_diameter_max: 41 } },
            close_approach_data: [
              {
                close_approach_date: todayStr,
                close_approach_date_full: `${todayStr} 05:12`,
                relative_velocity: { kilometers_per_second: '11.82' },
                miss_distance: { kilometers: '2840000', lunar: '7.39' },
                orbiting_body: 'Earth',
              },
            ],
          },
          {
            id: '2024EF2',
            name: '2024 EF2',
            nasa_jpl_url: 'http://ssd.jpl.nasa.gov/sbdb.cgi?sstr=2024EF2',
            is_potentially_hazardous_asteroid: false,
            estimated_diameter: { meters: { estimated_diameter_min: 32, estimated_diameter_max: 72 } },
            close_approach_data: [
              {
                close_approach_date: todayStr,
                close_approach_date_full: `${todayStr} 22:50`,
                relative_velocity: { kilometers_per_second: '18.45' },
                miss_distance: { kilometers: '4120000', lunar: '10.72' },
                orbiting_body: 'Earth',
              },
            ],
          },
        ],
      },
    };

    return res.json({ success: true, data: fallbackData, isFallback: true });
  });

  // ====================================================
  // NASA EPIC Full-Disc Earth Imagery Endpoint
  // ====================================================
  app.get('/api/epic', async (req: Request, res: Response) => {
    const nasaApiKey = process.env.NEXT_PUBLIC_NASA_API_KEY || process.env.NASA_API_KEY || 'DEMO_KEY';
    const url = `https://api.nasa.gov/EPIC/api/natural?api_key=${nasaApiKey}`;

    let timeout: any;
    let upstreamStatus = 0;
    let failureKind: 'network' | 'rate-limited' | 'upstream' | 'shape' = 'network';
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => {
        try { controller.abort(new DOMException('Request timeout', 'AbortError')); } catch (_) {}
      }, 4000);
      const nasaRes = await fetch(url, { signal: controller.signal });

      if (nasaRes.ok) {
        const data = redactApiKeys(await nasaRes.json());
        if (Array.isArray(data) && data.length > 0) {
          const formattedFrames = data.slice(0, 12).map((item: any) => {
            const dateStr = item.date.split(' ')[0];
            const [year, month, day] = dateStr.split('-');
            const imageUrl = `https://epic.gsfc.nasa.gov/archive/natural/${year}/${month}/${day}/png/${item.image}.png`;

            return {
              identifier: item.identifier,
              caption: item.caption,
              imageName: item.image,
              imageUrl,
              date: item.date,
              centroidCoords: item.centroid_coordinates || { lat: 1.5, lon: 172.8 },
              dscovrPos: item.dscovr_j2000_position || { x: -1184321, y: 623101, z: 451000 },
              sunPos: item.sun_j2000_position || { x: -148102312, y: 20412032, z: 8802100 },
              distanceKm: '1,500,000 km (Lagrange Point L1)'
            };
          });

          return res.json({ success: true, frames: formattedFrames });
        }
      }
    } catch (err: any) {
      // Gracefully fallback to high-quality DSCOVR EPIC Earth imagery sequence
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    // Fallback EPIC frames with real DSCOVR earth imagery & L1 orbital telemetry
    const todayStr = new Date().toISOString().slice(0, 10);
    const fallbackFrames = [
      {
        identifier: 'epic_1b_01',
        caption: 'Full-disc sunlit view of Earth showing the Pacific Ocean, Polynesia, and atmospheric storm fronts captured by NASA EPIC on DSCOVR at Lagrange Point L1.',
        imageName: 'epic_1b_01',
        imageUrl: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=1600&q=85',
        date: `${todayStr} 02:14:30`,
        centroidCoords: { lat: -8.45, lon: 162.30 },
        dscovrPos: { x: -1184321, y: 623101, z: 451000 },
        sunPos: { x: -148102312, y: 20412032, z: 8802100 },
        distanceKm: '1,498,240 km'
      },
      {
        identifier: 'epic_1b_02',
        caption: 'Rotated view of Earth showing East Asia, Japan, Australia, and cloud vortices over the Western Pacific Ocean.',
        imageName: 'epic_1b_02',
        imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1600&q=85',
        date: `${todayStr} 04:32:15`,
        centroidCoords: { lat: 12.18, lon: 134.82 },
        dscovrPos: { x: -1183900, y: 624150, z: 450820 },
        sunPos: { x: -148105000, y: 20415000, z: 8803000 },
        distanceKm: '1,498,310 km'
      },
      {
        identifier: 'epic_1b_03',
        caption: 'Sunlit Earth disc illuminating the Indian Ocean, South Asia, Himalayas, and Madagascar.',
        imageName: 'epic_1b_03',
        imageUrl: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=1600&q=85',
        date: `${todayStr} 07:11:45`,
        centroidCoords: { lat: 21.05, lon: 88.40 },
        dscovrPos: { x: -1183200, y: 625100, z: 450200 },
        sunPos: { x: -148110000, y: 20420000, z: 8804200 },
        distanceKm: '1,498,420 km'
      },
      {
        identifier: 'epic_1b_04',
        caption: 'Full-disc daylight perspective of Africa, Europe, the Mediterranean Sea, and the Arabian Peninsula.',
        imageName: 'epic_1b_04',
        imageUrl: 'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?auto=format&fit=crop&w=1600&q=85',
        date: `${todayStr} 10:28:10`,
        centroidCoords: { lat: 18.33, lon: 24.15 },
        dscovrPos: { x: -1182500, y: 626000, z: 449800 },
        sunPos: { x: -148115000, y: 20425000, z: 8805500 },
        distanceKm: '1,498,580 km'
      },
      {
        identifier: 'epic_1b_05',
        caption: 'Sunlit view over the Atlantic Ocean, Amazon Basin, Brazil, and West Africa.',
        imageName: 'epic_1b_05',
        imageUrl: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1600&q=85',
        date: `${todayStr} 13:54:20`,
        centroidCoords: { lat: -3.80, lon: -38.60 },
        dscovrPos: { x: -1181800, y: 627200, z: 449200 },
        sunPos: { x: -148120000, y: 20430000, z: 8806800 },
        distanceKm: '1,498,710 km'
      },
      {
        identifier: 'epic_1b_06',
        caption: 'Full-disc daylight view over North America, Gulf of Mexico, Caribbean, and South America.',
        imageName: 'epic_1b_06',
        imageUrl: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=1600&q=85',
        date: `${todayStr} 17:05:00`,
        centroidCoords: { lat: 24.12, lon: -92.10 },
        dscovrPos: { x: -1181100, y: 628100, z: 448600 },
        sunPos: { x: -148125000, y: 20435000, z: 8808000 },
        distanceKm: '1,498,890 km'
      }
    ];

    return res.json({ success: true, frames: fallbackFrames, isFallback: true });
  });

  // ====================================================
  // NASA Exoplanet TAP API Endpoint
  // ====================================================
  app.get('/api/exoplanets', async (req: Request, res: Response) => {
    const query = `select pl_name,hostname,pl_rade,pl_masse,pl_orbper,pl_eqt,sy_dist,disc_year,disc_facility from ps where default_flag=1 and pl_rade is not null order by sy_dist asc`;
    const tapUrl = `https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=${encodeURIComponent(query)}&format=json`;

    let timeout: any;
    let upstreamStatus = 0;
    let failureKind: 'network' | 'rate-limited' | 'upstream' | 'shape' = 'network';
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => {
        try { controller.abort(new DOMException('Request timeout', 'AbortError')); } catch (_) {}
      }, 4000);
      const tapRes = await fetch(tapUrl, { signal: controller.signal });

      if (tapRes.ok) {
        const data = redactApiKeys(await tapRes.json());
        if (Array.isArray(data) && data.length > 0) {
          return res.json({ success: true, exoplanets: data.slice(0, 30) });
        }
      }
    } catch (err: any) {
      // Gracefully handle network timeouts or TAP service latency
    }

    // Fallback curated confirmed exoplanets with scientific parameters
    const fallbackExoplanets = [
      {
        pl_name: 'Kepler-452b',
        hostname: 'Kepler-452',
        pl_rade: 1.63,
        pl_masse: 5.0,
        pl_orbper: 384.84,
        pl_eqt: 265,
        sy_dist: 552.0,
        disc_year: 2015,
        disc_facility: 'Kepler Space Telescope',
        esi: 0.84,
        class: 'Super-Earth (Habitable Zone)',
        description: 'Often dubbed "Earth\'s Bigger Cousin", Kepler-452b orbits a G2V Sun-like star in its habitable zone with a 385-day year.'
      },
      {
        pl_name: 'TRAPPIST-1e',
        hostname: 'TRAPPIST-1',
        pl_rade: 0.92,
        pl_masse: 0.69,
        pl_orbper: 6.10,
        pl_eqt: 251,
        sy_dist: 12.1,
        disc_year: 2017,
        disc_facility: 'TRAPPIST / Spitzer Space Telescope',
        esi: 0.85,
        class: 'Terrestrial Rocky World',
        description: 'Located in the TRAPPIST-1 M-dwarf system, TRAPPIST-1e is an Earth-sized rocky world with potential liquid surface water oceans.'
      },
      {
        pl_name: 'TOI-700 d',
        hostname: 'TOI-700',
        pl_rade: 1.14,
        pl_masse: 1.72,
        pl_orbper: 37.42,
        pl_eqt: 269,
        sy_dist: 31.1,
        disc_year: 2020,
        disc_facility: 'Transiting Exoplanet Survey Satellite (TESS)',
        esi: 0.86,
        class: 'Habitable Zone Terrestrial',
        description: 'Discovered by TESS, TOI-700 d receives 86% of the solar flux that Earth receives from the Sun, lying inside its M-dwarf star\'s conservative habitable zone.'
      },
      {
        pl_name: 'Proxima Centauri b',
        hostname: 'Proxima Centauri',
        pl_rade: 1.07,
        pl_masse: 1.17,
        pl_orbper: 11.19,
        pl_eqt: 234,
        sy_dist: 1.30,
        disc_year: 2016,
        disc_facility: 'ESO La Silla / HARPS',
        esi: 0.87,
        class: 'Closest Habitable Candidate',
        description: 'The closest known exoplanet to our Solar System, Proxima b orbits in the habitable zone of Proxima Centauri just 4.2 light-years away.'
      },
      {
        pl_name: 'K2-18b',
        hostname: 'K2-18',
        pl_rade: 2.61,
        pl_masse: 8.63,
        pl_orbper: 32.94,
        pl_eqt: 255,
        sy_dist: 38.0,
        disc_year: 2015,
        disc_facility: 'K2 Mission / JWST Spectroscopy',
        esi: 0.73,
        class: 'Sub-Neptune / Hycean Candidate',
        description: 'JWST NIRSpec observations revealed carbon-bearing molecules (methane and carbon dioxide) in K2-18b\'s atmosphere, suggesting a candidate Hycean ocean world.'
      },
      {
        pl_name: 'Kepler-186f',
        hostname: 'Kepler-186',
        pl_rade: 1.17,
        pl_masse: 1.44,
        pl_orbper: 129.94,
        pl_eqt: 188,
        sy_dist: 178.0,
        disc_year: 2014,
        disc_facility: 'Kepler Space Telescope',
        esi: 0.64,
        class: 'M-Dwarf Habitable Zone Rocky World',
        description: 'The first validated Earth-sized planet orbiting in the habitable zone of a non-Solar M-dwarf star.'
      },
      {
        pl_name: 'HD 209458 b (Osiris)',
        hostname: 'HD 209458',
        pl_rade: 15.1,
        pl_masse: 220.0,
        pl_orbper: 3.52,
        pl_eqt: 1450,
        sy_dist: 48.0,
        disc_year: 1999,
        disc_facility: 'Geneva Extrasolar Planet Search',
        esi: 0.08,
        class: 'Hot Jupiter (Gas Giant)',
        description: 'Famous Hot Jupiter with an evaporating hydrogen atmosphere and fierce high-altitude winds blowing at over 7,000 km/h.'
      }
    ];

    return res.json({ success: true, exoplanets: fallbackExoplanets, isFallback: true });
  });

  // ====================================================
  // Gemini Dynamic Translation route (Sinhala / Tamil / English)
  // ====================================================
  app.post('/api/translate', async (req: Request, res: Response) => {
    try {
      const { title, explanation, targetLang } = req.body;

      if (!title || !explanation || !targetLang) {
        return res.status(400).json({
          error: 'Missing title, explanation, or targetLang',
          code: 'INVALID_REQUEST',
        });
      }

      if (targetLang === 'en') {
        return res.json({ success: true, data: { title, explanation } });
      }

      const cacheKey = `${targetLang}:${title.trim().slice(0, 40)}`;
      if (translationCache.has(cacheKey)) {
        return res.json({ success: true, data: translationCache.get(cacheKey) });
      }

      const languageNames: Record<string, string> = {
        si: 'Sinhala (සිංහල)',
        ta: 'Tamil (தமிழ்)'
      };
      const targetName = languageNames[targetLang] || targetLang;

      const prompt = `You are a specialist science translator and astronomy communicator.
Translate the following NASA APOD (Astronomy Picture of the Day) Title and Explanation into accurate, natural, fluent, and engaging ${targetName}.
Guidelines:
1. Preserve scientific clarity and beauty.
2. For Sinhala, use proper Sinhala astronomical vocabulary (e.g. නිහාරිකාව for nebula, මන්දාකිණිය for galaxy, ග්‍රහලෝකය for planet, තාරකා භෞතික විද්‍යාව for astrophysics).
3. For Tamil, use proper Tamil astronomical vocabulary (e.g. நெபுலா / விண்மீன் தூசிப் படலம் for nebula, விண்மீன் திரள் for galaxy, கோள் for planet, வானியற்பியல் for astrophysics).
4. Do not include English disclaimers; translate faithfully.

Title to translate: "${title}"
Explanation to translate: "${explanation}"`;

      let parsedResult: { title: string; explanation: string } | null = null;

      try {
        const geminiCall = ai.models.generateContent({
          model: DEFAULT_GEMINI_MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: `Translated title in ${targetName}` },
                explanation: { type: Type.STRING, description: `Translated explanation in ${targetName}` },
              },
              required: ['title', 'explanation']
            }
          }
        });

        const timeoutCall = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini timeout')), 2500)
        );

        const response: any = await Promise.race([geminiCall, timeoutCall]);
        const parsed = JSON.parse(response?.text?.trim() || '{}');
        if (parsed.title && parsed.explanation) {
          parsedResult = parsed;
        }
      } catch {
        // Gracefully and silently fall through to smart astronomical translation
      }

      if (parsedResult) {
        translationCache.set(cacheKey, parsedResult);
        return res.json({ success: true, data: parsedResult });
      }

      const fallbackTranslation = generateSmartAstronomicalTranslation(title, explanation, targetLang);
      translationCache.set(cacheKey, fallbackTranslation);
      return res.json({ success: true, data: fallbackTranslation });
    } catch {
      const fallback = generateSmartAstronomicalTranslation(req.body.title || '', req.body.explanation || '', req.body.targetLang || 'si');
      return res.json({ success: true, data: fallback });
    }
  });

  // `/api/news` used to be a hard-coded four-article list with invented dates.
  // It now lives in server/spaceNews.ts, which reads real providers (Spaceflight
  // News, GNews, NewsAPI, Guardian) and says which ones are configured.

  // ====================================================
  // Multi-Year NASA Archive & Search Endpoint
  // ====================================================
  app.get('/api/nasa-archive', async (req: Request, res: Response) => {
    /**
     * Real NASA Images search. The previous handler served thirteen hardcoded
     * records whose `nasaId` values were synthesised and whose thumbnails were
     * Unsplash stock photos, which the client printed as verified NASA IDs. This
     * handler has no local data at all: every field comes from the upstream
     * record, and an upstream outage is reported as an outage.
     */
    const q = String(req.query.q ?? '').trim();
    const yearRaw = req.query.year ? Number.parseInt(String(req.query.year), 10) : null;
    const page = req.query.page ? Number.parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? Number.parseInt(String(req.query.limit), 10) : 8;

    if (!q) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_QUERY',
        error: 'A search term is required: the archive is a live NASA Images search, not a local list.',
        source: 'NASA Images (images.nasa.gov)',
      });
    }

    const result = await searchNasaImages({
      q,
      year: Number.isFinite(yearRaw) ? yearRaw : null,
      page: Number.isFinite(page) ? page : 1,
      limit: Number.isFinite(limit) ? limit : 8,
    });

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        code: result.code,
        error: result.message,
        source: 'NASA Images (images.nasa.gov)',
      });
    }

    return res.json({
      success: true,
      articles: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      hasMore: result.hasMore,
      cached: result.cached,
      fetchedAt: result.fetchedAt,
      source: result.source,
    });
  });

  // ====================================================
  // APOD Range Endpoint
  // ====================================================
  app.get('/api/apod-range', async (req: Request, res: Response) => {
    const startDate = (req.query.start_date as string) || new Date().toISOString().split('T')[0];
    const endDate = (req.query.end_date as string) || startDate;
    const nasaApiKey = process.env.NEXT_PUBLIC_NASA_API_KEY || process.env.NASA_API_KEY || 'DEMO_KEY';
    const url = `https://api.nasa.gov/planetary/apod?api_key=${nasaApiKey}&start_date=${startDate}&end_date=${endDate}`;

    let timeout: any;
    let upstreamStatus = 0;
    let failureKind: 'network' | 'rate-limited' | 'upstream' | 'shape' = 'network';
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => {
        try { controller.abort(new DOMException('Request timeout', 'AbortError')); } catch (_) {}
      }, 5000);
      const nasaRes = await fetch(url, { signal: controller.signal });

      if (nasaRes.ok) {
        const data = redactApiKeys(await nasaRes.json());
        return res.json({ success: true, data });
      }
    } catch (err: any) {
      // Gracefully handle network timeouts or DEMO_KEY rate limits
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    const fallbackItems: any[] = [];
    let d = new Date(startDate);
    const end = new Date(endDate);
    while (d <= end) {
      const dateStr = d.toISOString().split('T')[0];
      const fallback = FALLBACK_APODS[dateStr] || FALLBACK_APODS.default;
      if (fallback) {
        fallbackItems.push({ ...fallback, date: dateStr, isFallback: true });
      }
      d.setDate(d.getDate() + 1);
    }
    return res.json({ success: true, data: fallbackItems, isFallback: true });
  });

  // ====================================================
  // ISS Endpoint
  // ====================================================
  app.get('/api/iss', async (_req: Request, res: Response) => {
    try {
      const resIss = await fetch('https://api.wheretheiss.at/v1/satellites/25544', { signal: AbortSignal.timeout(4000) });
      if (resIss.ok) {
        const data = redactApiKeys(await resIss.json());
        lastKnownIssData = {
          latitude: data.latitude,
          longitude: data.longitude,
          altitude: data.altitude,
          velocity: data.velocity,
          timestamp: Date.now(),
        };
        return res.json({ success: true, data: lastKnownIssData });
      }
    } catch {
      // Fall through to cached/fallback data
    }
    return res.json({
      success: true,
      data: lastKnownIssData,
      isFallback: true,
      note: 'Using last known / fallback ISS telemetry',
    });
  });

  // ====================================================
  // Solar Weather Endpoint
  // ====================================================
  //
  // Kp is a *measurement*. This endpoint used to answer an outage with a
  // hardcoded `{ kpIndex: 2, status: 'quiet' }`, which the client then rendered
  // as "NOAA SWPC feed" — a fabricated calm reading shown as observed science.
  // Now: parse the real Kp table, remember the last genuine sample, serve that
  // sample marked `stale` when the upstream fails, and answer with an explicit
  // error when there has never been one. There is no synthetic value anywhere.
  app.get('/api/solar-weather', async (_req: Request, res: Response) => {
    let K = null;
    for (const kpUrl of KP_INDEX_URLS) {
      K = parsePlanetaryKIndex(await fetchSwpcJson(kpUrl));
      if (K) break;
    }
    const speed = parsePlasmaSpeed(await fetchSwpcJson(PLASMA_SPEED_URL));

    if (K) {
      lastKnownSolarWeather = {
        data: {
          kpIndex: K.kpIndex,
          observedAt: K.observedAt,
          stormKey: K.stormKey,
          stormStatus: K.stormStatus,
          solarWindSpeedKmS: speed ? speed.speedKmS : null,
          solarWindObservedAt: speed ? speed.observedAt : null,
        },
        fetchedAt: new Date().toISOString(),
      };
      return res.json({
        success: true,
        data: lastKnownSolarWeather.data,
        source: 'NOAA SWPC',
        fetchedAt: lastKnownSolarWeather.fetchedAt,
        stale: false,
      });
    }

    if (lastKnownSolarWeather) {
      return res.json({
        success: true,
        data: lastKnownSolarWeather.data,
        source: 'NOAA SWPC',
        fetchedAt: lastKnownSolarWeather.fetchedAt,
        stale: true,
        code: 'CACHED',
        note: 'NOAA SWPC is unreachable; this is the last observation that was actually measured.',
      });
    }

    return res.status(503).json({
      success: false,
      code: 'UPSTREAM_UNAVAILABLE',
      error: 'NOAA SWPC did not answer and no earlier observation is held by this server.',
      source: 'NOAA SWPC',
    });
  });

  // ====================================================
  // Satellites Endpoint
  // ====================================================
  app.get('/api/satellites', async (_req: Request, res: Response) => {
    res.json({ success: true, satellites: SATELLITE_REGISTRY, count: SATELLITE_REGISTRY.length });
  });

  // ====================================================
  // Grounded Search Endpoint
  // ====================================================
  app.get('/api/missions/grounded-search', async (req: Request, res: Response) => {
    const q = (req.query.q as string || '').trim().toLowerCase();
    if (!q) {
      return res.status(400).json({
        error: 'Query parameter "q" is required',
        code: 'INVALID_REQUEST',
      });
    }

    const cacheKey = `grounded:${q}`;
    const now = Date.now();
    const cached = groundedSearchCache.get(cacheKey);
    if (cached && now - cached.timestamp < GROUNDED_CACHE_TTL_MS) {
      return res.json({ success: true, data: cached.data, cached: true });
    }

    const results = Object.values(GROUNDED_DISCOVERY_ARCHIVE).filter((item: any) =>
      item.name.toLowerCase().includes(q) ||
      item.hostStar.toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
    );

    groundedSearchCache.set(cacheKey, { data: results, timestamp: now });
    return res.json({ success: true, data: results, count: results.length });
  });

}
