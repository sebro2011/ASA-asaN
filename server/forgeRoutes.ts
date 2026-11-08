/**
 * NOVA HYPOTHESIS FORGE — HTTP surface.
 *
 * Mounted at `/api/forge` (see server.ts). Endpoints:
 *   GET  /api/forge/catalogue    dataset registry + capability flags (no secrets)
 *   POST /api/forge/interpret    question → structured request, hypotheses, plan
 *   POST /api/forge/investigate  full pipeline: retrieve → analyse → evidence → passport input
 *
 * Protections: per-IP rate limits per endpoint, strict body validation, no key
 * material in any response, `Cache-Control: no-store` on POSTs, and a bounded
 * request body (the global Express JSON limit).
 */

import express, { type Request, type Response } from 'express';
import {
  cataloguePayload,
  interpretQuestion,
  investigate,
  validateQuestion,
} from './forge/investigate';
import type { FetchLike } from './forge/connectors';

type Bucket = { count: number; resetAt: number };

/** Per-router limiter state, so two routers in one process cannot share a budget. */
function createRateLimit(buckets: Map<string, Bucket>, name: string, max: number, windowMs: number) {
  return (req: Request, res: Response, next: () => void) => {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown';
    const key = `${name}:${ip}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', '0');
      return res.status(429).json({
        ok: false,
        code: 'RATE_LIMITED',
        error: 'Too many investigation requests. Please wait before running another.',
        retryAfter,
      });
    }
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    return next();
  };
}

/**
 * Dependencies are injectable so the test suite can run the real routes against
 * fixture payloads without any outbound network access.
 */
export interface ForgeRouterDeps {
  fetchImpl?: FetchLike;
  now?: () => Date;
  nasaKey?: string | null;
  timeoutMs?: number;
  /** Isolated connector cache; tests pass a fresh map per server. */
  cache?: Map<string, never>;
}

export function createForgeRouter(deps: ForgeRouterDeps = {}) {
  const router = express.Router();
  const buckets = new Map<string, Bucket>();
  const rateLimit = (name: string, max: number, windowMs: number) =>
    createRateLimit(buckets, name, max, windowMs);

  const nasaKey = () => {
    if (deps.nasaKey !== undefined) return deps.nasaKey;
    const configured = process.env.NASA_API_KEY;
    return configured && configured.trim() ? configured.trim() : 'DEMO_KEY';
  };

  router.get('/catalogue', rateLimit('forge-catalogue', 60, 60_000), (_req, res) => {
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.json(cataloguePayload(nasaKey()));
  });

  router.post('/interpret', rateLimit('forge-interpret', 40, 60_000), (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const validation = validateQuestion(req.body?.question);
    if (validation) {
      return res.status(validation.status).json({
        ok: false,
        code: validation.code,
        error: validation.message,
      });
    }
    try {
      const now = (deps.now ?? (() => new Date()))();
      const outcome = interpretQuestion({
        question: String(req.body.question),
        language: req.body?.language,
        context: req.body?.context,
        now,
        nasaKey: nasaKey(),
      });
      return res.json({
        ok: true,
        request: outcome.request,
        hypotheses: outcome.hypotheses,
        plan: outcome.plan,
      });
    } catch {
      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        error: 'The question could not be interpreted. Please retry.',
      });
    }
  });

  router.post('/investigate', rateLimit('forge-investigate', 8, 60_000), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const validation = validateQuestion(req.body?.question);
    if (validation) {
      return res.status(validation.status).json({
        ok: false,
        code: validation.code,
        error: validation.message,
      });
    }
    try {
      const investigation = await investigate({
        question: String(req.body.question),
        language: req.body?.language,
        context: req.body?.context,
        hypothesisId: req.body?.hypothesisId,
        dependencies: {
          fetchImpl: deps.fetchImpl,
          now: deps.now,
          nasaKey: nasaKey(),
          timeoutMs: deps.timeoutMs,
          cache: deps.cache as never,
        },
      });
      return res.json({ ok: true, investigation });
    } catch (error) {
      // The message may mention a URL, but connectors sanitise key parameters.
      const message =
        error instanceof Error && error.name === 'NormalisationError'
          ? error.message
          : 'The investigation could not be completed. Partial sources are never replaced with simulated values.';
      return res.status(502).json({ ok: false, code: 'SOURCE_UNAVAILABLE', error: message });
    }
  });

  return router;
}

export const forgeRouter = createForgeRouter();
