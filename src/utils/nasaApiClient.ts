/**
 * NASA API URL helpers.
 *
 * The key is always the public DEMO_KEY: browser code must never resolve a
 * credential from the environment. See `getNasaApiKey` for why.
 */

/**
 * The browser never holds a NASA key.
 *
 * This module used to resolve `process.env.NASA_API_KEY`, `import.meta.env.VITE_*`
 * and friends. In a Vite build `process.env` does not exist, so it always fell
 * through to DEMO_KEY — and had anyone "fixed" that by defining a `VITE_` variant,
 * the key would have been inlined into a public bundle. Both paths are gone.
 *
 * Real NASA traffic in NOVA is proxied by the server (`/api/apod`, `/api/iss`,
 * `/api/asteroids/neows`, …), which is where the `NASA_API_KEY` belongs. This
 * helper only exists for direct `api.nasa.gov` URLs, where DEMO_KEY is the
 * documented public key.
 */
export const NASA_PUBLIC_KEY = 'DEMO_KEY';

export function getNasaApiKey(): string {
  return NASA_PUBLIC_KEY;
}

/**
 * Builds NASA APOD URL with safe API Key
 */
export function buildNasaApodUrl(date?: string): string {
  const key = getNasaApiKey();
  return date
    ? `https://api.nasa.gov/planetary/apod?api_key=${key}&date=${encodeURIComponent(date)}`
    : `https://api.nasa.gov/planetary/apod?api_key=${key}`;
}

/**
 * Formats a Date object as YYYY-MM-DD in UTC/local ISO format
 */
export function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Builds NASA NeoWs Asteroid Feed URL with dynamic 7-day range and safe API Key
 * https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&end_date=${nextWeek}&api_key=${API_KEY}
 */
export function buildNasaNeoWsUrl(customStartDate?: string, customEndDate?: string): string {
  const key = getNasaApiKey();
  
  let startDateStr = customStartDate;
  let endDateStr = customEndDate;

  if (!startDateStr) {
    const today = new Date();
    startDateStr = formatISODate(today);
  }

  if (!endDateStr) {
    const start = new Date(startDateStr);
    const nextWeek = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    endDateStr = formatISODate(nextWeek);
  }

  return `https://api.nasa.gov/neo/rest/v1/feed?start_date=${encodeURIComponent(startDateStr)}&end_date=${encodeURIComponent(endDateStr)}&api_key=${key}`;
}

/**
 * Builds NASA EPIC Earth Observation URL with safe API Key
 */
export function buildNasaEpicUrl(): string {
  const key = getNasaApiKey();
  return `https://api.nasa.gov/EPIC/api/natural?api_key=${key}`;
}

/**
 * Robust, resilient JSON fetch wrapper with Abort timeout and guaranteed fallback
 */
export async function safeFetchNASA<T>(
  url: string,
  fallbackData: T,
  timeoutMs: number = 4000
): Promise<{ data: T; isFallback: boolean; error?: string }> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, timeoutMs);

    const response = await fetch(url, { signal: controller.signal });
    if (response.ok) {
      const json = await response.json();
      return { data: json, isFallback: false };
    }
  } catch (err: any) {
    // Gracefully catch any network rejection, timeout, or rate-limit
    return { data: fallbackData, isFallback: true, error: err?.message || 'Network error' };
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  return { data: fallbackData, isFallback: true };
}

export default getNasaApiKey;
