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
  | 'not-configured'
  | 'invalid-url'
  | 'invalid-key'
  | 'key-conflict'
  | 'unreachable'
  | 'invalid-response';

const DISABLED_REASONS: readonly CloudConfigReason[] = [
  'not-configured',
  'invalid-url',
  'invalid-key',
  'key-conflict',
];

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
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
          ? AbortSignal.timeout(8000)
          : undefined,
      });
      if (!response.ok) return { enabled: false, reason: 'unreachable' } as CloudConfig;
      return parseConfig(await response.json());
    } catch {
      return { enabled: false, reason: 'unreachable' } as CloudConfig;
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
    case 'invalid-response':
      return 'The configuration endpoint returned an unexpected response.';
  }
}
