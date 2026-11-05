/**
 * Workspace cloud configuration — `GET /api/workspace/config`
 *
 * Returns the *publishable* Supabase URL + key so the browser can create its own
 * auth client. Nothing privileged is exposed, and the service-role key is never
 * read here at all: workspace reads and writes are authorised by the user's JWT
 * plus RLS, so the server does not need elevated credentials.
 *
 * Mirrors the proven `/api/community/config` contract:
 *   { enabled: true, url, publishableKey } | { enabled: false, reason }
 */
import { Router } from 'express';

export type WorkspaceCloudConfig =
  | { enabled: true; url: string; publishableKey: string }
  | { enabled: false; reason: 'not-configured' | 'invalid-url' | 'invalid-key' | 'key-conflict' };

/**
 * A Supabase publishable/anon key is intentionally public. This guards against
 * an operator pasting a secret into the public variable: new-style
 * `sb_publishable_…` keys pass, legacy anon JWTs must carry `role: "anon"`, and
 * anything that matches the service-role key is rejected by the caller.
 */
export function isPublishableKey(key: string): boolean {
  if (!key) return false;
  if (key.startsWith('sb_publishable_')) return key.length >= 24;
  try {
    const parts = key.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload?.role === 'anon';
  } catch {
    return false;
  }
}

export function readWorkspaceCloudConfig(
  env: Record<string, string | undefined> = process.env,
): WorkspaceCloudConfig {
  const rawUrl = (env.SUPABASE_URL || '').trim();
  const publishableKey = (env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '').trim();
  const secret = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!rawUrl || !publishableKey) return { enabled: false, reason: 'not-configured' };

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { enabled: false, reason: 'invalid-url' };
  }
  // Must be a bare https origin: no credentials, port, path, query or fragment.
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    return { enabled: false, reason: 'invalid-url' };
  }

  if (!isPublishableKey(publishableKey)) return { enabled: false, reason: 'invalid-key' };
  if (secret && publishableKey === secret) return { enabled: false, reason: 'key-conflict' };

  return { enabled: true, url: parsed.origin, publishableKey };
}

export const workspaceConfigRouter = Router();

workspaceConfigRouter.get('/config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(readWorkspaceCloudConfig());
});
