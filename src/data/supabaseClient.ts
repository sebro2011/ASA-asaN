/**
 * Supabase client singleton for the workspace.
 *
 * Created lazily, only when the deployment is configured, and only with the
 * publishable key the server hands out. Session persistence is on (unlike the
 * CosmoVision module, which is deliberately stateless) because the workspace
 * needs a durable, refreshable session across reloads and tabs.
 *
 * The service-role key never appears here — nothing in `src/` may reference it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCloudConfig, type CloudConfig } from './config';

let clientPromise: Promise<SupabaseClient | null> | null = null;

/** localStorage-backed session key; namespaced so it is easy to audit/clear. */
export const AUTH_STORAGE_KEY = 'nova-auth';

export async function getCloudClient(): Promise<SupabaseClient | null> {
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    const config: CloudConfig = await loadCloudConfig();
    if (!config.enabled) return null;

    // Loaded on demand: an unconfigured deployment never downloads the client,
    // and it stays out of the entry chunk.
    const { createClient } = await import('@supabase/supabase-js');

    return createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: AUTH_STORAGE_KEY,
      },
      global: { headers: { 'x-nova-client': 'workspace' } },
    });
  })();

  return clientPromise;
}

/** Test/DI seam. */
export function resetCloudClient(): void {
  clientPromise = null;
}
