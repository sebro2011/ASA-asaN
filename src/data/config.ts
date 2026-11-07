/**
 * Runtime cloud configuration.
 *
 * The browser never holds a build-time Supabase secret: it asks the server for
 * the publishable key (`GET /api/workspace/config`), exactly like the existing
 * CosmoVision module does. When the deployment is not configured the workspace
 * must degrade honestly — a disabled sign-in panel with a reason, never fake
 * local authentication.
 */
export type CloudConfig =
  | { enabled: true; url: string; publishableKey: string }
  | { enabled: false; reason: CloudConfigReason };

export type CloudConfigReason =
  /** The server answered and has no credentials: an operator problem. */
  | 'not-configured'
  | 'invalid-url'
  | 'invalid-key'
  | 'key-conflict'
  /** Never got a usable answer — these are all retryable. */
  | 'unreachable'
  | 'timeout'
  /** 404: the deployment is not serving `/api/workspace/config` at all. */
  | 'route-missing'
  /** 5xx: the function started but failed. */
  | 'server-error'
  | 'invalid-response';

/** Reasons only the server may send; anything else is normalised to a default. */
const DISABLED_REASONS: readonly CloudConfigReason[] = [
  'not-configured',
  'invalid-url',
  'invalid-key',
  'key-conflict',
];

/** Long enough for a cold start, short enough that a hung request still ends. */
export const CONFIG_TIMEOUT_MS = 15_000;

let cached: Promise<CloudConfig> | null = null;

function parseConfig(payload: unknown): CloudConfig {
  if (!payload || typeof payload !== 'object') return { enabled: false, reason: 'invalid-response' };
  const record = payload as Record<string, unknown>;

  if (record.enabled === false) {
    const reason = typeof record.reason === 'string' ? record.reason : 'not-configured';
    return {
      enabled: false,
      reason: (DISABLED_REASONS as readonly string[]).includes(reason)
        ? (reason as CloudConfigReason)
        : 'not-configured',
    };
  }

  const url = typeof record.url === 'string' ? record.url.trim() : '';
  const publishableKey =
    typeof record.publishableKey === 'string' ? record.publishableKey.trim() : '';

  if (!url || !publishableKey) return { enabled: false, reason: 'invalid-response' };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return { enabled: false, reason: 'invalid-url' };
  } catch {
    return { enabled: false, reason: 'invalid-url' };
  }

  return { enabled: true, url, publishableKey };
}

/** Load (and memoise) the cloud configuration for this page load. */
export function loadCloudConfig(): Promise<CloudConfig> {
  if (cached) return cached;

  cached = (async () => {
    try {
      const response = await fetch('/api/workspace/config', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        // A cold serverless start routinely takes longer than the old 8s budget,
        // which turned a slow-but-healthy deployment into a permanent "unreachable".
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
          ? AbortSignal.timeout(CONFIG_TIMEOUT_MS)
          : undefined,
      });

      if (!response.ok) {
        if (response.status === 404) return { enabled: false, reason: 'route-missing' } as CloudConfig;
        if (response.status >= 500) return { enabled: false, reason: 'server-error' } as CloudConfig;
        return { enabled: false, reason: 'unreachable' } as CloudConfig;
      }

      // A deployment whose rewrite fell through to the SPA answers 200 text/html.
      const contentType = response.headers?.get?.('content-type') ?? '';
      if (contentType && !contentType.includes('json')) {
        return { enabled: false, reason: 'invalid-response' } as CloudConfig;
      }
      return parseConfig(await response.json());
    } catch (error) {
      const aborted = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
      return { enabled: false, reason: aborted ? 'timeout' : 'unreachable' } as CloudConfig;
    }
  })();

  return cached;
}

/** Test/DI seam: drop the memoised config. */
export function resetCloudConfigCache(): void {
  cached = null;
}

/** Human-readable explanation for the disabled state (English fallback). */
export function cloudConfigReasonText(reason: CloudConfigReason): string {
  switch (reason) {
    case 'not-configured':
      return 'Cloud sync is not configured on this deployment.';
    case 'invalid-url':
      return 'The configured Supabase URL is not a bare https origin.';
    case 'invalid-key':
      return 'The configured publishable key is not a Supabase publishable/anon key.';
    case 'key-conflict':
      return 'The publishable key matches the service key, so cloud sync was disabled for safety.';
    case 'unreachable':
      return 'The configuration endpoint could not be reached.';
    case 'timeout':
      return `The configuration endpoint did not answer within ${Math.round(CONFIG_TIMEOUT_MS / 1000)}s.`;
    case 'route-missing':
      return 'The configuration endpoint is missing (HTTP 404) — this deployment is not serving /api/workspace/config.';
    case 'server-error':
      return 'The configuration endpoint failed on the server (HTTP 5xx).';
    case 'invalid-response':
      return 'The configuration endpoint returned something that is not JSON — the request was probably answered by the app shell.';
  }
}
