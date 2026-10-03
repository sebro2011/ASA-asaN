/**
 * NASA API Client & Environment Variable Helper
 * Safely resolves NEXT_PUBLIC_NASA_API_KEY with guaranteed fallback to 'DEMO_KEY'.
 * Provides robust try-catch fetch wrappers to prevent blank screens on Netlify/Cloud deployments.
 */

export function getNasaApiKey(): string {
  // 1. Next.js / Node.js process.env environment variable
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.NEXT_PUBLIC_NASA_API_KEY && process.env.NEXT_PUBLIC_NASA_API_KEY.trim() !== '') {
      return process.env.NEXT_PUBLIC_NASA_API_KEY.trim();
    }
    if (process.env.NASA_API_KEY && process.env.NASA_API_KEY.trim() !== '') {
      return process.env.NASA_API_KEY.trim();
    }
  }

  // 2. Vite / Client-side import.meta.env environment variable
  try {
    const metaEnv = (import.meta as any)?.env;
    if (metaEnv) {
      if (metaEnv.NEXT_PUBLIC_NASA_API_KEY && metaEnv.NEXT_PUBLIC_NASA_API_KEY.trim() !== '') {
        return metaEnv.NEXT_PUBLIC_NASA_API_KEY.trim();
      }
      if (metaEnv.VITE_NASA_API_KEY && metaEnv.VITE_NASA_API_KEY.trim() !== '') {
        return metaEnv.VITE_NASA_API_KEY.trim();
      }
      if (metaEnv.VITE_PUBLIC_NASA_API_KEY && metaEnv.VITE_PUBLIC_NASA_API_KEY.trim() !== '') {
        return metaEnv.VITE_PUBLIC_NASA_API_KEY.trim();
      }
    }
  } catch {}

  // 3. Guaranteed Safe Fallback
  return 'DEMO_KEY';
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
  let timeout: any;
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
