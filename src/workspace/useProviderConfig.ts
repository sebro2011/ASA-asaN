/**
 * Live AI provider availability, read from the server's own health endpoint.
 *
 * `/api/nova/config` returns booleans only (never keys). The workspace uses it
 * to tell the truth about what NOVA can actually do on this deployment, so no
 * AI surface can imply an online model that is not configured.
 */
import { useEffect, useState } from 'react';

export interface ProviderAvailability {
  auto: boolean;
  local: boolean;
  gemini: boolean;
  openrouter: boolean;
  arena: boolean;
}

type Status = 'loading' | 'ready' | 'error';

let cached: ProviderAvailability | null = null;

export function useProviderConfig(): { status: Status; providers: ProviderAvailability | null } {
  const [status, setStatus] = useState<Status>(cached ? 'ready' : 'loading');
  const [providers, setProviders] = useState<ProviderAvailability | null>(cached);

  useEffect(() => {
    if (cached) return;
    const controller = new AbortController();
    let mounted = true;

    fetch('/api/nova/config', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('config-unavailable'))))
      .then((payload) => {
        if (!mounted) return;
        const next: ProviderAvailability = {
          auto: payload?.providers?.auto === true,
          local: payload?.providers?.local === true,
          gemini: payload?.providers?.gemini === true,
          openrouter: payload?.providers?.openrouter === true,
          arena: payload?.providers?.arena === true,
        };
        cached = next;
        setProviders(next);
        setStatus('ready');
      })
      .catch((error) => {
        if (!mounted || error?.name === 'AbortError') return;
        setStatus('error');
      });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  return { status, providers };
}

export function onlineProviderNames(providers: ProviderAvailability | null): string[] {
  if (!providers) return [];
  const names: string[] = [];
  if (providers.arena) names.push('Arena AI');
  if (providers.openrouter) names.push('OpenRouter');
  if (providers.gemini) names.push('Google Gemini');
  return names;
}
