/**
 * Guardian security: who may look, who may act, and what may be printed.
 *
 * Three separate concerns, deliberately not merged:
 *
 *  1. **Read vs. act.** Health status is a read-only, credential-free summary and
 *     can be served like any other status endpoint. Acting — running a sweep,
 *     performing a recovery — changes fleet state and requires an administrator.
 *  2. **Fail closed.** If `GUARDIAN_ADMIN_TOKEN` is not configured, every admin
 *     action is refused with `GUARDIAN_LOCKED`. An unconfigured secret must never
 *     mean "open"; that is how diagnostic endpoints end up public.
 *  3. **Never print a secret.** Responses carry env var *names* and booleans, and
 *     any free text (a provider reason, a store error) is scrubbed against the
 *     values of the known secret variables before it leaves the process.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/** Env var names whose *values* must never be echoed, logged or returned. */
export const SECRET_ENV_NAMES = [
  'NASA_API_KEY',
  'NEXT_PUBLIC_NASA_API_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'ARENA_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GUARDIAN_STORE_KEY',
  'GUARDIAN_ADMIN_TOKEN',
  'CRON_SECRET',
  'GNEWS_API_KEY',
  'NEWS_API_KEY',
  'GUARDIAN_API_KEY',
  'GUARDIAN_NEWS_API_KEY',
  'YOUTUBE_API_KEY',
] as const;

/**
 * News-feed credentials whose names start with `GUARDIAN_` but have nothing to do
 * with this Guardian (audit m5). They are still *secrets* — their values are
 * scrubbed like any other — but they belong to The Guardian newspaper's Open
 * Platform API, they configure `/api/news`, and they authorise no `/api/guardian/*`
 * route. `GUARDIAN_API_KEY` is the deprecated alias of `GUARDIAN_NEWS_API_KEY`.
 *
 * They are reported separately by `envReadiness` so that a dashboard missing one
 * of them does not read as "this Guardian is not configured".
 */
export const NEWS_ONLY_ENV_NAMES = ['GUARDIAN_NEWS_API_KEY', 'GUARDIAN_API_KEY'] as const;

/** Env var names the Guardian reads for *readiness reporting* (never values). */
export const WATCHED_ENV_NAMES = [
  ...SECRET_ENV_NAMES.filter((name) => !(NEWS_ONLY_ENV_NAMES as readonly string[]).includes(name)),
  'SUPABASE_URL',
  'GUARDIAN_STORE_URL',
  'GUARDIAN_NAMESPACE',
  'NOVA_GEMINI_MODEL',
  'NOVA_OPENROUTER_MODEL',
  'NOVA_ARENA_MODEL',
] as const;

export function constantTimeEquals(a: string, b: string): boolean {
  if (!a || !b) return false;
  // Hash first so the comparison length is constant regardless of input length.
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right) && a.length === b.length;
}

export type AuthResult =
  | { ok: true; actor: string }
  | { ok: false; status: number; code: string; message: string };

function bearer(headers: Record<string, unknown>): string {
  const raw = headers.authorization ?? headers.Authorization;
  if (typeof raw !== 'string') return '';
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match ? match[1].trim() : '';
}

function headerValue(headers: Record<string, unknown>, name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Admin authorisation. Accepts `Authorization: Bearer <token>` or
 * `x-guardian-token: <token>`; both are compared in constant time.
 */
export function authorizeAdmin(
  headers: Record<string, unknown>,
  env: Record<string, string | undefined>,
): AuthResult {
  const expected = (env.GUARDIAN_ADMIN_TOKEN || '').trim();
  if (!expected) {
    return {
      ok: false,
      status: 403,
      code: 'GUARDIAN_LOCKED',
      message: 'GUARDIAN_ADMIN_TOKEN is not configured, so administrative actions are disabled.',
    };
  }
  const presented = bearer(headers) || headerValue(headers, 'x-guardian-token');
  if (!presented) {
    return { ok: false, status: 401, code: 'GUARDIAN_UNAUTHORIZED', message: 'An administrator token is required.' };
  }
  if (!constantTimeEquals(presented, expected)) {
    return { ok: false, status: 401, code: 'GUARDIAN_UNAUTHORIZED', message: 'The administrator token was rejected.' };
  }
  // The actor label is derived, never the token itself.
  return { ok: true, actor: `admin:${createHash('sha256').update(expected).digest('hex').slice(0, 8)}` };
}

/** Cron authorisation, following the Vercel convention (`Authorization: Bearer $CRON_SECRET`). */
export function authorizeCron(
  headers: Record<string, unknown>,
  env: Record<string, string | undefined>,
): AuthResult {
  const expected = (env.CRON_SECRET || '').trim();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      code: 'SCHEDULE_SECRET_MISSING',
      message: 'CRON_SECRET is not configured, so the scheduled sweep endpoint is disabled.',
    };
  }
  const presented = bearer(headers) || headerValue(headers, 'x-cron-secret');
  if (!presented || !constantTimeEquals(presented, expected)) {
    return { ok: false, status: 401, code: 'CRON_UNAUTHORIZED', message: 'The schedule secret was rejected.' };
  }
  return { ok: true, actor: 'cron' };
}

/**
 * Scrubs every configured secret value out of a string. Applied to provider
 * reasons and store errors before they are stored or returned, because an
 * upstream error message can echo the query string that carried a key.
 */
export function scrubSecrets(text: string, env: Record<string, string | undefined>): string {
  if (!text) return text;
  let output = text;
  for (const name of SECRET_ENV_NAMES) {
    const value = (env[name] || '').trim();
    if (value.length < 8) continue; // too short to be a real credential
    output = output.split(value).join('[redacted]');
  }
  // Also catch the generic shapes, in case a secret arrives from another path.
  output = output
    .replace(/api_key=[^&\s"']+/gi, 'api_key=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/g, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, '[redacted-jwt]')
    .replace(/\bsb_(secret|publishable)_[A-Za-z0-9_-]{6,}/g, '[redacted-key]');
  return output.slice(0, 2_000);
}

/**
 * Env readiness by name only: `{ set: ['NASA_API_KEY'], missing: [...] }`.
 *
 * News-feed keys are split out of `set`/`missing` into `newsOnly` — same
 * names-only discipline, different bucket — so `missing` answers exactly one
 * question: *can this Guardian act?* (`GUARDIAN_ADMIN_TOKEN` is what decides that,
 * and `adminConfigured` says so separately.)
 */
export function envReadiness(env: Record<string, string | undefined>) {
  const set: string[] = [];
  const missing: string[] = [];
  for (const name of WATCHED_ENV_NAMES) {
    if ((env[name] || '').trim()) set.push(name);
    else missing.push(name);
  }
  const newsOnly = {
    set: NEWS_ONLY_ENV_NAMES.filter((name) => (env[name] || '').trim()),
    missing: NEWS_ONLY_ENV_NAMES.filter((name) => !(env[name] || '').trim()),
    note: 'GUARDIAN_NEWS_API_KEY (alias: GUARDIAN_API_KEY) is The Guardian newspaper\'s news API key. It configures /api/news and never authorises /api/guardian/*; that is GUARDIAN_ADMIN_TOKEN.',
  };
  return { set, missing, total: WATCHED_ENV_NAMES.length, newsOnly };
}

/** Stable, non-reversible key for per-caller rate limiting. */
export function callerKey(headers: Record<string, unknown>, fallback: string): string {
  const forwarded = headerValue(headers, 'x-forwarded-for').split(',')[0]?.trim();
  const address = forwarded || headerValue(headers, 'x-real-ip') || fallback || 'unknown';
  return createHash('sha256').update(address).digest('hex').slice(0, 16);
}
