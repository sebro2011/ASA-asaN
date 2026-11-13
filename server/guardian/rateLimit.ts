/**
 * Fleet-wide rate limiting.
 *
 * Two different limits exist in this application and they are easy to confuse:
 *
 *  - `server.ts` rate-limits *inbound* requests per IP with an in-memory bucket.
 *    That protects one instance from a noisy client and is correct as far as it
 *    goes.
 *  - This module limits *outbound* spend — how many times the deployment as a
 *    whole may call a metered provider (NASA with a real key, Gemini, OpenRouter)
 *    inside a window. A per-instance counter cannot do that: ten instances each
 *    believing they hold a 10/min budget will spend 100/min.
 *
 * The counter is a fixed window in the store (atomic increment), which is the
 * only primitive a serverless fleet can use without a long-lived connection.
 * Fixed windows can burst across a boundary, so the configured limit is applied
 * to a window that is *smaller* than the provider's quota (see DEFAULT_QUOTAS).
 *
 * Failure behaviour: **fail open**, but say so. A Guardian outage must not stop
 * the product from working; the decision carries `degraded: true` so the
 * dashboard can show that the limit was not enforced.
 */

import type { GuardianStore } from './types';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
  bucket: string;
  /** True when the store was unreachable and the request was allowed anyway. */
  degraded: boolean;
}

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
  /** Cost of one request, for providers that charge per KB/large payload. */
  cost?: number;
}

export interface FleetRateLimiter {
  check(bucket: string, rule?: RateLimitRule): Promise<RateLimitDecision>;
  /** Read-only view: what the fleet has already spent in the current window. */
  peek(bucket: string, rule?: RateLimitRule): Promise<{ used: number; resetAt: number } | null>;
}

/**
 * Default budgets. Each is deliberately below the provider's published quota so
 * that a burst at a window boundary cannot exceed it:
 *
 *  - NASA with a personal key: 1 000/hour → 12/min here (≈720/hour).
 *  - NASA DEMO_KEY: 30/hour, 50/day → 25/hour here, and the Guardian reports
 *    `demo-quota` so the dashboard can explain the 429s before they happen.
 *  - Gemini free tier and `openrouter/free`: 10/min, because these are the paths
 *    that actually cost money when a loop misbehaves.
 */
export const DEFAULT_QUOTAS: Record<string, RateLimitRule> = {
  'nasa:key': { limit: 12, windowMs: 60_000 },
  'nasa:demo': { limit: 25, windowMs: 60 * 60_000 },
  'gemini:generate': { limit: 10, windowMs: 60_000 },
  'openrouter:generate': { limit: 10, windowMs: 60_000 },
  'arena:generate': { limit: 10, windowMs: 60_000 },
  'guardian:probe': { limit: 30, windowMs: 60_000 },
  'guardian:recovery': { limit: 5, windowMs: 60_000 },
};

export function createFleetRateLimiter(
  store: GuardianStore,
  options: {
    now?: () => number;
    quotas?: Record<string, RateLimitRule>;
    /** Prefix so test runs and namespaces cannot collide. */
    prefix?: string;
  } = {},
): FleetRateLimiter {
  const now = options.now ?? Date.now;
  const quotas = { ...DEFAULT_QUOTAS, ...(options.quotas ?? {}) };
  const prefix = options.prefix ?? 'ratelimit';

  function ruleFor(bucket: string, rule?: RateLimitRule): RateLimitRule {
    if (rule) return { cost: 1, ...rule };
    const known = quotas[bucket];
    if (known) return { cost: 1, ...known };
    // Unknown bucket: a conservative default rather than "unlimited".
    return { limit: 30, windowMs: 60_000, cost: 1 };
  }

  async function check(bucket: string, rule?: RateLimitRule): Promise<RateLimitDecision> {
    const effective = ruleFor(bucket, rule);
    const cost = Math.max(1, Math.floor(effective.cost ?? 1));
    const at = now();
    const windowKey = `${prefix}:${bucket}:${Math.floor(at / effective.windowMs)}`;
    try {
      const counter = await store.increment(windowKey, effective.windowMs, cost);
      const allowed = counter.count <= effective.limit;
      return {
        allowed,
        remaining: Math.max(0, effective.limit - counter.count),
        limit: effective.limit,
        resetAt: counter.resetAt,
        bucket,
        degraded: false,
      };
    } catch {
      return {
        allowed: true,
        remaining: effective.limit,
        limit: effective.limit,
        resetAt: at + effective.windowMs,
        bucket,
        degraded: true,
      };
    }
  }

  async function peek(bucket: string, rule?: RateLimitRule): Promise<{ used: number; resetAt: number } | null> {
    const effective = ruleFor(bucket, rule);
    const at = now();
    const windowKey = `${prefix}:${bucket}:${Math.floor(at / effective.windowMs)}`;
    try {
      const stored = await store.getJson<{ count: number; resetAt: number }>(`counter-view:${windowKey}`);
      if (!stored) return { used: 0, resetAt: at + effective.windowMs };
      return { used: stored.value.count, resetAt: stored.value.resetAt };
    } catch {
      return null;
    }
  }

  return { check, peek };
}

/** Normalises a provider's configured budget from the environment. */
export function quotaFromEnv(
  env: Record<string, string | undefined>,
  key: string,
  fallback: RateLimitRule,
): RateLimitRule {
  const raw = env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return { ...fallback, limit: parsed };
}
