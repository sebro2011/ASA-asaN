/**
 * CORS policy — deliberately boring, because the previous version was not.
 *
 * The old middleware answered **403** to any request whose `Origin` was not in
 * `CORS_ORIGINS`. Two problems with that:
 *
 *  1. Browsers attach `Origin` to same-origin POSTs, so an operator who set
 *     `CORS_ORIGINS` to the production URL could still break chat from a Vercel
 *     **preview** deployment (every preview gets its own hostname).
 *  2. CORS is enforced by the browser, not the server. A 403 adds an outage mode
 *     without adding any protection the browser was not already providing.
 *
 * The rule now: echo the origin back only when it is same-host or explicitly
 * allowed; otherwise send no CORS grant at all and let the browser refuse the
 * *read*. The request is never rejected for its `Origin`.
 */

export interface CorsInput {
  origin?: string | null;
  /** `Host` header of the incoming request. */
  host?: string | null;
  /** Hostnames from `CORS_ORIGINS` plus the Vercel-provided hostnames. */
  allowHosts: Set<string>;
  /** Development allows any origin so iframe previews keep working. */
  dev: boolean;
}

export type CorsDecision =
  | { grant: true; origin: string; reason: 'dev' | 'same-origin' | 'allow-list' }
  | { grant: false; reason: 'no-origin' | 'not-allowed' };

/** `https://a.example:8443/x` → `a.example:8443`. Never throws. */
export function hostFromOrigin(origin: string): string {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return '';
  }
}

export function normaliseHost(value: string | null | undefined): string {
  const raw = (value || '').trim().toLowerCase();
  if (!raw) return '';
  // Accept both "host" and "https://host" so operators can paste either.
  return raw.includes('://') ? hostFromOrigin(raw) : raw;
}

/** Parse a comma-separated `CORS_ORIGINS` value into hostnames. */
export function parseAllowHosts(cors_env: string | undefined | null): Set<string> {
  return new Set(
    (cors_env || '')
      .split(',')
      .map((entry) => normaliseHost(entry))
      .filter(Boolean),
  );
}

export function decideCors({ origin, host, allowHosts, dev }: CorsInput): CorsDecision {
  if (!origin) return { grant: false, reason: 'no-origin' };
  if (dev) return { grant: true, origin, reason: 'dev' };

  const originHost = hostFromOrigin(origin);
  if (!originHost) return { grant: false, reason: 'not-allowed' };

  const requestHost = normaliseHost(host);
  if (requestHost && originHost === requestHost) {
    return { grant: true, origin, reason: 'same-origin' };
  }
  if (allowHosts.has(originHost)) return { grant: true, origin, reason: 'allow-list' };
  return { grant: false, reason: 'not-allowed' };
}

/**
 * Hostnames the platform itself hands us. A Vercel preview URL is a real origin
 * for a real deployment, so it must not require an operator to keep the list in
 * sync on every push.
 */
export function platformHosts(env: Record<string, string | undefined>): string[] {
  return [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]
    .map((value) => normaliseHost(value))
    .filter(Boolean);
}
