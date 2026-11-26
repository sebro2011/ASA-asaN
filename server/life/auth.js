/**
 * Single-owner authentication for the NOVA L.I.F.E. API.
 *
 * Hosted access tokens are verified by Supabase Auth rather than trusted from
 * client-side JWT claims. The only unauthenticated mode is an explicit,
 * non-production loopback exception for offline development.
 */
import { createHash } from 'node:crypto';
import { readWorkspaceCloudConfig } from '../workspaceCloudConfig.ts';

const AUTH_TIMEOUT_MS = 5_000;
const MAX_PENDING_AUTH_CHECKS = 128;

function lifeAuthError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function isLoopbackAddress(address) {
  if (typeof address !== 'string') return false;
  const normalised = address.toLowerCase().replace(/^::ffff:/, '');
  return normalised === '127.0.0.1' || normalised === '::1';
}

function bearerToken(request) {
  const header = typeof request.get === 'function'
    ? request.get('authorization')
    : request.headers?.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer[ \t]+([A-Za-z0-9._~+\/-]{16,8192})$/i.exec(header);
  return match?.[1] ?? null;
}

/** Verify each browser bearer token with Supabase Auth, then enforce one owner. */
export function createLifeAuthenticator({ env = process.env, fetchImpl = (...args) => fetch(...args) } = {}) {
  const pending = new Map();

  const verifyToken = async (token, config, ownerId) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(`${config.url}/auth/v1/user`, {
        method: 'GET',
        headers: {
          apikey: config.publishableKey,
          authorization: `Bearer ${token}`,
          accept: 'application/json',
        },
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          throw lifeAuthError(503, 'LIFE_AUTH_UNAVAILABLE', 'The account service is temporarily unavailable.');
        }
        throw lifeAuthError(401, 'LIFE_AUTH_INVALID', 'Sign in again to use NOVA Intelligence.');
      }
      const user = await response.json().catch(() => null);
      if (typeof user?.id !== 'string' || user.id.toLowerCase() !== ownerId.toLowerCase()) {
        throw lifeAuthError(403, 'LIFE_OWNER_ONLY', 'This NOVA Intelligence instance is restricted to its configured owner.');
      }
      return { id: user.id };
    } catch (error) {
      if (error?.status) throw error;
      throw lifeAuthError(503, 'LIFE_AUTH_UNAVAILABLE', 'The account service could not verify this request.');
    } finally {
      clearTimeout(timer);
    }
  };

  return async function authenticateLifeRequest(request) {
    const authVariables = [
      'NOVA_LIFE_OWNER_ID',
      'SUPABASE_URL',
      'SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ];
    const hasSupabaseSettings = authVariables.some((name) => String(env[name] || '').trim());
    const localLoopbackMode =
      env.NODE_ENV !== 'production' &&
      env.VERCEL !== '1' &&
      env.NOVA_LIFE_ALLOW_UNAUTHENTICATED_LOCAL === '1' &&
      !hasSupabaseSettings &&
      isLoopbackAddress(request.socket?.remoteAddress);
    if (localLoopbackMode) return { id: 'local', local: true };

    const token = bearerToken(request);
    if (!token) throw lifeAuthError(401, 'LIFE_AUTH_REQUIRED', 'Sign in to use NOVA Intelligence.');

    const ownerId = String(env.NOVA_LIFE_OWNER_ID || '').trim();
    if (!ownerId) {
      throw lifeAuthError(503, 'LIFE_AUTH_NOT_CONFIGURED', 'NOVA Intelligence owner authentication is not configured.');
    }
    const config = readWorkspaceCloudConfig(env);
    if (!config.enabled) {
      throw lifeAuthError(503, 'LIFE_AUTH_NOT_CONFIGURED', 'NOVA Intelligence account verification is not configured.');
    }

    // Coalesce simultaneous panel requests without retaining bearer tokens or
    // caching a previously valid session after it has been revoked.
    const key = createHash('sha256').update(token).digest('hex');
    let verification = pending.get(key);
    if (!verification) {
      if (pending.size >= MAX_PENDING_AUTH_CHECKS) {
        throw lifeAuthError(503, 'LIFE_AUTH_BUSY', 'NOVA Intelligence is handling too many sign-in checks.');
      }
      verification = verifyToken(token, config, ownerId);
      pending.set(key, verification);
    }
    try {
      return await verification;
    } finally {
      if (pending.get(key) === verification) pending.delete(key);
    }
  };
}
