/**
 * The API surface, in one place.
 *
 * Every HTTP route this app serves is listed here with a sample request and the
 * status codes that are *acceptable* for it. Two consumers:
 *
 *   scripts/test-api-routes.mjs  — starts the Express app in-process and proves
 *                                  the inventory is real (no route is missing, no
 *                                  handler leaks an HTML 500, every error body is
 *                                  machine-readable).
 *   scripts/check-apis.mjs       — replays the same inventory against a deployed
 *                                  origin, where the sandbox has no network.
 *
 * "Acceptable" is deliberately wider than 200: an endpoint whose upstream is
 * unreachable must answer with a typed error (502/504), and a Supabase-backed
 * endpoint must degrade to 503 when the deployment has no credentials. What is
 * never acceptable is 404 (route gone) or 500 (unhandled crash).
 */

const NASA = [200, 502, 503, 504];

export const API_ROUTES = [
  /* ------------------------------------------------------------- platform */
  { method: 'GET', path: '/api/health', expect: [200], why: 'liveness probe' },
  { method: 'GET', path: '/api/nova/config', expect: [200], why: 'which AI providers have keys' },
  { method: 'GET', path: '/api/nova/diagnostics', expect: [200], why: 'provider status without probing' },
  { method: 'GET', path: '/api/nova/diagnostics?probe=1', expect: [200], why: 'deep probe, throttled' },
  { method: 'GET', path: '/api/workspace/config', expect: [200], why: 'publishable Supabase config or a reason' },
  { method: 'GET', path: '/api/community/config', expect: [200], why: 'community feature switch' },
  { method: 'GET', path: '/api/news/sources', expect: [200], why: 'which news providers have keys (booleans only)' },
  { method: 'GET', path: '/api/news?limit=1', expect: [200, 502, 504], why: 'aggregated space news' },
  { method: 'GET', path: '/api/news?topic=weather', expect: [400], why: 'unknown topic is rejected' },
  { method: 'GET', path: '/api/news/papers?limit=1', expect: [200, 502, 504], why: 'arXiv astro-ph preprints' },

  /* ------------------------------------------------------------ AI routes */
  { method: 'POST', path: '/api/nova/chat', body: {}, expect: [400], why: 'validation before any provider call' },
  { method: 'POST', path: '/api/chat', body: {}, expect: [400], why: 'legacy alias of /api/nova/chat' },
  { method: 'POST', path: '/api/openrouter/chat', body: {}, expect: [400], why: 'legacy alias of /api/nova/chat' },
  { method: 'POST', path: '/api/translate', body: {}, expect: [400], why: 'requires title, explanation, targetLang' },

  /* ----------------------------------------------------------- NASA feeds */
  { method: 'GET', path: '/api/apod', expect: NASA, why: 'astronomy picture of the day (fixture fallback)' },
  { method: 'GET', path: '/api/apod-range', expect: [200, ...NASA], why: 'APOD over a date range' },
  { method: 'GET', path: '/api/asteroids/neows', expect: NASA, why: 'near-Earth objects' },
  { method: 'GET', path: '/api/epic', expect: NASA, why: 'EPIC Earth imagery' },
  { method: 'GET', path: '/api/exoplanets', expect: NASA, why: 'exoplanet archive' },
  { method: 'GET', path: '/api/news', expect: [200, 502, 504], why: 'aggregated space news (502 when every provider fails)' },
  {
    method: 'GET',
    path: '/api/nasa-archive',
    expect: [400],
    why: 'live NASA Images search: a term is required, there is no local catalogue',
  },
  {
    method: 'GET',
    path: '/api/nasa-archive?q=artemis&limit=2',
    expect: [200, 502, 503, 504],
    why: 'real NASA Images results, or a typed upstream failure',
  },
  { method: 'GET', path: '/api/iss', expect: NASA, why: 'ISS position' },
  { method: 'GET', path: '/api/solar-weather', expect: NASA, why: 'space weather' },
  { method: 'GET', path: '/api/satellites', expect: [200], why: 'static catalogue' },
  { method: 'GET', path: '/api/missions/grounded-search?q=mars', expect: [200], why: 'offline mission archive search' },
  { method: 'GET', path: '/api/missions/grounded-search', expect: [400], why: 'requires ?q=' },
  { method: 'GET', path: '/api/youtube/meta', expect: [400], why: 'requires ?url=, so 400 is correct here' },
  {
    method: 'GET',
    path: '/api/youtube/meta?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    expect: [200, 404, 502, 504],
    why: '404 the video is gone · 502 YouTube unreachable · 504 timeout',
  },
  { method: 'GET', path: '/api/space-videos', expect: [200], why: 'curated video catalogue' },

  /* -------------------------------------------------------------- Earth */
  { method: 'GET', path: '/api/earth/health', expect: [200], why: 'Earth suite capability report' },
  { method: 'GET', path: '/api/earth/power?lat=6.9&lon=79.8', expect: [400], why: 'requires start and end dates' },
  { method: 'GET', path: '/api/earth/gibs/domains', expect: [400], why: 'requires a layer identifier' },
  {
    method: 'GET',
    path: '/api/earth/gibs/probe?layer=VIIRS_SNPP_CorrectedReflectance_TrueColor&date=2026-11-01',
    expect: [200, 502, 504],
    why: 'upstream tile probe; 504 is the documented timeout',
  },
  { method: 'GET', path: '/api/earth/firms/hotspots?lat=6.9&lon=79.8', expect: [200, 503], why: 'needs a free FIRMS MAP_KEY' },
  { method: 'POST', path: '/api/earth/analyst', body: {}, expect: [400], why: 'requires a question' },

  /* ---------------------------------------------------- community uploads */
  { method: 'GET', path: '/api/community/videos', expect: [200, 503], why: '503 until Supabase is configured' },
  { method: 'GET', path: '/api/community/me', expect: [200, 401, 503], why: 'auth required' },
  { method: 'GET', path: '/api/community/moderation', expect: [200, 403, 503], why: 'moderators only' },
  { method: 'POST', path: '/api/community/submissions', body: {}, expect: [400, 401, 503], why: 'validated submission' },
  {
    method: 'POST',
    path: '/api/community/videos/00000000-0000-0000-0000-000000000000/report',
    body: {},
    expect: [400, 401, 404, 503],
    why: 'report a video',
  },
  {
    method: 'POST',
    path: '/api/community/moderation/00000000-0000-0000-0000-000000000000',
    body: {},
    expect: [400, 401, 403, 404, 503],
    why: 'moderation decision',
  },
  {
    method: 'POST',
    path: '/api/community/moderation/reports/00000000-0000-0000-0000-000000000000/dismiss',
    body: {},
    expect: [400, 401, 403, 404, 503],
    why: 'dismiss a report',
  },
];

/**
 * A status is a failure only when the route is missing or the handler crashed —
 * with one exception: a 5xx is expected only where the table says so.
 */
export function verdict(route, status, body) {
  if (status === 404 && !route.expect.includes(404)) return 'route missing';
  if (status === 500 || status === 501) return 'unhandled crash';
  if (!route.expect.includes(status)) return `unexpected ${status}`;
  if (status >= 400 && !body?.code && !body?.error) return 'error body has no code';
  return 'ok';
}
