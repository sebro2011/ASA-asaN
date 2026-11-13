import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { decideCors, parseAllowHosts, platformHosts } from './server/cors.ts';
import { createRateLimiter } from './server/requestRateLimit.ts';

import { GoogleGenAI } from '@google/genai';
import { earthRouter } from './server/earthIntelligence.ts';
import { spaceVideosRouter } from './server/spaceVideos.ts';
import { communityVideosRouter } from './server/communityVideos.ts';
import { getNovaPublicConfig, handleNovaChatRequest } from './server/novaChat.js';
import { handleNovaDiagnostics } from './server/novaDiagnostics.js';
import { setupNasaRoutes } from './server/nasaRoutes.ts';
import { createMarsPhotosRouter } from './server/marsPhotos.ts';
import { workspaceConfigRouter } from './server/workspaceConfig.ts';
import { spaceNewsRouter } from './server/spaceNews.ts';
import { forgeRouter } from './server/forgeRoutes.ts';
import { createLifeRouter } from './server/life/router.js';
import { mountGuardian } from './server/guardian/routes.ts';

dotenv.config();

// Global process error safety guards for Cloud Run container reliability
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Exported so serverless hosts (Vercel — see api/index.ts) can invoke the same
// Express application that runs standalone via `npm run dev` / `npm start`.
export const app = express();
// A malformed or oversized body is a client mistake the API must describe in
// JSON — Express would otherwise answer with its own HTML error page.
app.use(express.json({ limit: '256kb' }));

// Enable CORS for trusted origins only — see server/cors.ts for why an unknown
// Origin is never answered with 403 (it used to break every Vercel preview).
// CORS_ORIGINS is a comma-separated list of allowed origins (no trailing slashes).
const isDev = process.env.NODE_ENV !== 'production';
const corsAllowHosts = parseAllowHosts(process.env.CORS_ORIGINS);
for (const platformHost of platformHosts(process.env)) corsAllowHosts.add(platformHost);

app.use((req, res, next) => {
  const decision = decideCors({
    origin: req.headers.origin,
    host: req.headers.host,
    allowHosts: corsAllowHosts,
    dev: isDev,
  });

  // A denied origin gets no grant: the browser blocks the read, we do not 403.
  res.header('Vary', 'Origin');
  if (decision.grant) {
    res.header('Access-Control-Allow-Origin', decision.origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    );
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(decision.grant ? 200 : 204);
  }
  next();
});

// ====================================================
// Security headers (defense in depth).
// Applied to every response. CSP is permissive enough to keep Vite dev,
// YouTube embeds, NASA/Gemini imagery and the /ws/live proxy working,
// while blocking inline execution surprises and clickjacking.
// ====================================================
const isSecure = process.env.NODE_ENV === 'production';

const csp = [
  "default-src 'self'",
  isSecure
    ? "script-src 'self' 'unsafe-inline'"              // React inline handlers only (prod)
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Vite HMR + React inline handlers (dev only)
  "style-src 'self' 'unsafe-inline'",                  // Tailwind + styled components
  "img-src 'self' data: https: blob:",                 // Unsplash/YouTube/NASA imagery
  "connect-src 'self' https:",               // APIs only
  "font-src 'self' data:",
  "media-src 'self' blob: https:",
  // APOD video entries are YouTube watch URLs, which are rewritten to /embed/;
  // YouTube's player itself loads from youtube-nocookie and player.vimeo.com is
  // used by older entries. Both stay explicit — never `frame-src https:`.
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'SAMEORIGIN');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.header(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );
  res.header('Content-Security-Policy', csp);
  if (isSecure) {
    res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.header('X-Content-Type-Options', 'nosniff');
  next();
});

// ====================================================
// Per-instance rate limiting (defense against abuse).
// The limiter itself lives in server/requestRateLimit.ts so its bucket
// accounting and its memory bound can be tested without booting Express.
// Fleet-wide budgets are a different layer: see server/guardian/rateLimit.ts.
// ====================================================
const rateLimit = createRateLimiter;

// YouTube meta proxy: modest limit — it fetches an external page per call.
app.use('/api/youtube/meta', rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'youtube-meta' }));

// Translation calls a paid remote model; limit anonymous requests per process.
app.use('/api/translate', rateLimit({ windowMs: 60_000, max: 15, keyPrefix: 'translate' }));

// Public NASA proxy: prevent uncontrolled quota consumption.
app.use('/api/mars', rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'mars-photos' }));

// Community submissions/reports: stricter — write operations.
app.use('/api/community', rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'community' }));

// Workspace cloud configuration: cheap, read-only, but still rate-limited so it
// cannot be used to fingerprint the deployment.
app.use('/api/workspace/config', rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'workspace-config' }));

// NOVA chat family: expensive AI calls — strict limit per IP, consolidated
// across all four chat entry points so a single IP cannot burst across paths.
// The limiter is built ONCE: constructing it per request would hand every
// request a fresh bucket and silently disable the limit.
const NOVA_CHAT_PATHS = new Set(['/api/nova/chat', '/api/chat', '/api/openrouter/chat', '/api/nasa-ai']);
const novaChatLimiter = rateLimit({
  windowMs: 60_000,
  max: 15,
  keyPrefix: 'nova-chat',
  // Same code and wording as the handler's own limiter, so a reader who
  // bursts is told to slow down rather than told the provider is busy.
  code: 'RATE_LIMITED',
  message: 'Too many NOVA requests. Please wait a moment and try again.',
});
app.use((req, res, next) => {
  if (NOVA_CHAT_PATHS.has(req.path)) {
    return novaChatLimiter(req, res, next);
  }
  next();
});

// ====================================================
// Cache headers for API responses (performance).
// ====================================================
const CACHEABLE_GET = new Set([
  '/api/health', '/api/nova/config', '/api/gemini-live-token',
]);

app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function (body) {
    if (req.method === 'GET' && CACHEABLE_GET.has(req.path)) {
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    } else if (req.method === 'GET' && req.path.startsWith('/api/') && !res.getHeader('Cache-Control')) {
      // A route that knows its own freshness sets the header itself (the cached
      // NASA proxies do); this default must not overwrite it.
      res.setHeader('Cache-Control', 'no-store');
    }
    return originalSend.call(this, body);
  };
  next();
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Health check endpoint for Cloud Run container lifecycle probes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize Google Gemini API client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Mount all NASA API routes from the modular nasaRoutes module (ISSUE-2)
setupNasaRoutes(app, ai);
app.use('/api/mars', createMarsPhotosRouter());

app.get('/api/nova/config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.json(getNovaPublicConfig());
});

// Per-provider reachability. `?probe=1` performs one one-token request against each
// configured provider and reports a redacted reason when it fails.
app.get('/api/nova/diagnostics', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const probe = req.query?.probe === '1' || req.query?.probe === 'true';
    return res.json(await handleNovaDiagnostics({ probe }));
  } catch {
    return res.status(500).json({ error: 'Diagnostics could not run.', code: 'INTERNAL_ERROR' });
  }
});

// Additive local/Express adapter for the same isolated Vercel Nova chat handler.
app.post('/api/nova/chat', async (req, res) => {
  try {
    const response = await handleNovaChatRequest({
      body: req.body,
      ip: req.ip || req.socket.remoteAddress || 'unknown',
      contentLength: req.headers['content-length'],
    });
    for (const [name, value] of Object.entries(response.headers)) {
      res.setHeader(name, String(value));
    }
    return res.status(response.status).json(response.body);
  } catch {
    return res.status(500).json({
      error: 'NOVA could not process this request. Please retry.',
      code: 'INTERNAL_ERROR',
    });
  }
});

app.post('/api/openrouter/chat', async (req, res) => {
  try {
    const response = await handleNovaChatRequest({
      body: req.body,
      ip: req.ip || req.socket.remoteAddress || 'unknown',
      contentLength: req.headers['content-length'],
    });
    for (const [name, value] of Object.entries(response.headers)) {
      res.setHeader(name, String(value));
    }
    return res.status(response.status).json(response.body);
  } catch {
    return res.status(500).json({
      error: 'NOVA could not process this request. Please retry.',
      code: 'INTERNAL_ERROR',
    });
  }
});
app.post('/api/chat', async (req, res) => {
  try {
    const response = await handleNovaChatRequest({
      body: req.body,
      ip: req.ip || req.socket.remoteAddress || 'unknown',
      contentLength: req.headers['content-length'],
    });
    for (const [name, value] of Object.entries(response.headers)) {
      res.setHeader(name, String(value));
    }
    return res.status(response.status).json(response.body);
  } catch {
    return res.status(500).json({
      error: 'NOVA could not process this request. Please retry.',
      code: 'INTERNAL_ERROR',
    });
  }
});


// ====================================================
// YouTube video meta proxy (CosmoVision submissions).
// Returns durationSeconds for a public YouTube video so the submission form
// can validate length before upload. The key (if any) stays server-side;
// no credentials are ever returned to the browser.
// ====================================================
const YOUTUBE_ID_RE = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?(?:.*&)?v=|.*v=))([A-Za-z0-9_-]{11})/;

export function extractYouTubeId(url: string): string | null {
  const match = YOUTUBE_ID_RE.exec(url.trim());
  return match ? match[1] : null;
}

/**
 * Three different failures used to collapse into one: a deleted video, an
 * unreachable upstream and a slow upstream all came back as 404 "fetch failed".
 * They are now distinct so the caller can tell "this video is gone" from
 * "we could not ask YouTube".
 */
async function fetchYoutubeDuration(videoId: string): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    let response: Response;
    try {
      response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        signal: controller.signal,
        headers: { 'Accept-Language': 'en-US,en;q=0.9', 'Accept': 'text/html' }
      });
    } catch (failure) {
      const aborted = failure instanceof Error && failure.name === 'AbortError';
      throw new Error(aborted ? 'youtube-timeout' : 'youtube-unreachable');
    }
    if (response.status === 404 || response.status === 410) throw new Error('video-not-found');
    if (!response.ok) throw new Error('youtube-unavailable');
    const html = await response.text();
    const lengthSeconds = parseYoutubeDuration(html);
    if (!lengthSeconds || lengthSeconds <= 0) throw new Error('video-not-found');
    return lengthSeconds;
  } finally {
    clearTimeout(timeout);
  }
}

// ytInitialPlayerResponse is embedded in the watch page HTML; lengthSeconds lives
// under videoDetails or microformat.playerMetadata depending on the page variant.
export function parseYoutubeDuration(html: string): number | null {
  const candidates: string[] = [];
  const marker = 'ytInitialPlayerResponse';
  const start = html.indexOf(marker);
  if (start !== -1) {
    const after = html.slice(start + marker.length);
    const brace = after.indexOf('{');
    if (brace !== -1) {
      let depth = 0; let end = -1;
      for (let i = brace; i < after.length; i++) {
        if (after[i] === '{') depth++;
        else if (after[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end !== -1) candidates.push(after.slice(brace, brace + end + 1));
    }
  }
  // Fallback microformat duration (ISO 8601 PT#M#S)
  const iso = html.match(/"lengthSeconds"\s*:\s*"?(\d+)"?/);
  if (iso) return Number(iso[1]);
  for (const blob of candidates) {
    const direct = blob.match(/"lengthSeconds"\s*:\s*(\d+)/);
    if (direct) return Number(direct[1]);
    const micro = blob.match(/"lengthSeconds"\s*:\s*"?(\d+)"?/);
    if (micro) return Number(micro[1]);
  }
  return null;
}

app.get('/api/youtube/meta', async (req, res) => {
  const { url } = req.query;
  if (typeof url !== 'string') { res.status(400).json({ error: 'missing url', code: 'missing-url' }); return; }
  const videoId = extractYouTubeId(url);
  if (!videoId) { res.status(400).json({ error: 'invalid youtube url', code: 'invalid-url' }); return; }
  try {
    const durationSeconds = await fetchYoutubeDuration(videoId);
    res.json({ videoId, durationSeconds });
  } catch (failure) {
    const reason = failure instanceof Error ? failure.message : '';
    if (reason === 'video-not-found') {
      res.status(404).json({ videoId, error: 'video-unavailable', code: 'VIDEO_NOT_FOUND' });
      return;
    }
    if (reason === 'youtube-timeout') {
      res.status(504).json({ videoId, error: 'youtube-unavailable', code: 'YOUTUBE_TIMEOUT' });
      return;
    }
    // 502, not 404: the video may well exist — we simply could not reach YouTube.
    res.status(502).json({ videoId, error: 'youtube-unavailable', code: 'YOUTUBE_UNAVAILABLE' });
  }
});

// ====================================================
// Earth Intelligence Lab endpoints (additive — mounted at /api/earth).
// POWER proxy, GIBS observation-date domains + tile probes,
// optional FIRMS hotspot proxy, grounded AI analyst.
// ====================================================
app.use('/api/earth', earthRouter);
app.use('/api/space-videos', spaceVideosRouter);
app.use('/api/community', communityVideosRouter);
// Workspace cloud config (Phase 3B) — publishable key only, never the service role.
app.use('/api/workspace', workspaceConfigRouter);
// Space news + astronomy papers. Keys are read server-side only; the client
// learns which providers are configured, never the key values.
app.use('/api/news', spaceNewsRouter);
// NOVA Hypothesis Forge — scientific investigation mode inside the NOVA AI
// Assistant. Data connectors, statistical analysis and evidence classification
// are server-side; the dataset registry carries documentation only.
app.use('/api/forge', forgeRouter);
// COSMORA API Guardian — dependency diagnostics, fleet circuit breakers, fleet
// rate limiting, scheduled sweeps, bounded recovery and an append-only audit.
// Read routes are public and credential-free; every action requires an admin
// token or the cron secret (see server/guardian/routes.ts).
mountGuardian(app);

// NOVA NEXUS / L.I.F.E. — local-first intelligence engine. It owns its own
// SQLite file, starts read-only for anything risky, and never shells out unless
// NOVA_LIFE_ALLOW_EXECUTE=1. Rate-limited like the other AI endpoints.
app.use(
  '/api/nova/life',
  rateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'nova-life' }),
  createLifeRouter({ env: process.env, root: __dirname }),
);

// Unknown API paths answer JSON, so a typo never arrives at the client as an
// HTML page it cannot parse.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

// Last line of defence for the API: any thrown error (bad JSON, oversized body,
// a handler bug) becomes a typed JSON response instead of a stack trace.
app.use((error: any, req: any, res: any, next: any) => {
  if (res.headersSent) return next(error);
  if (!String(req.path || '').startsWith('/api')) return next(error);

  const status = Number(error?.status || error?.statusCode) || 500;
  const code =
    status === 413
      ? 'PAYLOAD_TOO_LARGE'
      : status === 400
        ? 'INVALID_JSON'
        : status === 429
          ? 'UPSTREAM_RATE_LIMITED'
          : 'INTERNAL_ERROR';
  const message =
    status === 413
      ? 'The request body is too large.'
      : status === 400
        ? 'The request body is not valid JSON.'
        : 'NOVA could not process this request. Please retry.';

  if (status >= 500) {
    // Never echo the error object: it can carry provider URLs or headers.
    console.error(`[api] ${req.method} ${req.path} failed with ${status}`);
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error: message, code });
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isProduction = 
    process.env.NODE_ENV === 'production' || 
    process.env.npm_lifecycle_event === 'start' || 
    (process.env.PORT !== undefined && process.env.PORT !== '3000');

  const distPath = path.resolve(__dirname, 'dist');
  const indexHtmlPath = path.resolve(distPath, 'index.html');

  if (isProduction && fs.existsSync(indexHtmlPath)) {
    console.log(`[Production] Serving static build assets from: ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(indexHtmlPath);
    });
  } else {
    console.log('[Development] Initializing Vite middleware mode...');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`NASA Space Exploration Server running at http://0.0.0.0:${PORT}`);
  });

  // Graceful shutdown handler for Cloud Run container lifecycle
  const handleShutdown = (signal: string) => {
    console.log(`[Lifecycle] Received ${signal}. Gracefully closing HTTP server...`);
    server.close(() => {
      console.log('[Lifecycle] HTTP server closed cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

// Boot the standalone HTTP + WebSocket server only when this file is executed
// directly. When the app is imported as a module (the Vercel serverless entry
// in api/index.ts), the platform invokes the exported Express app itself, so no
// listener, Vite middleware or WebSocket proxy is created here.
const isDirectExecution =
  !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  startServer();
}
