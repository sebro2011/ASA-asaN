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

export interface ThinkingCatalogueEntry {
  id: string;
  effort: 'low' | 'medium' | 'high' | null;
  maxTokens: number;
  requiresReasoning: boolean;
  /** A per-level OpenRouter model pinned by the deployment, if any. */
  model: string | null;
  available: boolean;
}

export interface ThinkingCatalogue {
  default: string;
  levels: ThinkingCatalogueEntry[];
}

type Status = 'loading' | 'ready' | 'error';

interface ConfigSnapshot {
  providers: ProviderAvailability;
  thinking: ThinkingCatalogue | null;
}

let cached: ConfigSnapshot | null = null;

export function useProviderConfig(): {
  status: Status;
  providers: ProviderAvailability | null;
  thinking: ThinkingCatalogue | null;
} {
  const [status, setStatus] = useState<Status>(cached ? 'ready' : 'loading');
  const [providers, setProviders] = useState<ProviderAvailability | null>(cached?.providers ?? null);
  const [thinking, setThinking] = useState<ThinkingCatalogue | null>(cached?.thinking ?? null);

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
        const catalogue = normaliseThinkingCatalogue(payload?.thinking);
        cached = { providers: next, thinking: catalogue };
        setProviders(next);
        setThinking(catalogue);
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

  return { status, providers, thinking };
}

function asEffort(value: unknown): ThinkingCatalogueEntry['effort'] {
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  return null;
}

/**
 * The server's thinking ladder, narrowed to what the browser can trust. An
 * unknown shape becomes `null` and the UI falls back to the static five levels.
 */
function normaliseThinkingCatalogue(value: unknown): ThinkingCatalogue | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { default?: unknown; levels?: unknown };
  if (!Array.isArray(raw.levels)) return null;
  const levels: ThinkingCatalogueEntry[] = raw.levels
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      id: typeof entry.id === 'string' ? entry.id.slice(0, 32) : '',
      effort: asEffort(entry.effort),
      maxTokens: Number(entry.maxTokens) > 0 ? Number(entry.maxTokens) : 0,
      requiresReasoning: entry.requiresReasoning === true,
      model: typeof entry.model === 'string' && entry.model ? entry.model.slice(0, 160) : null,
      available: entry.available !== false,
    }))
    .filter((entry) => Boolean(entry.id));
  if (levels.length === 0) return null;
  return {
    default: typeof raw.default === 'string' ? raw.default : 'auto',
    levels,
  };
}

export function onlineProviderNames(providers: ProviderAvailability | null): string[] {
  if (!providers) return [];
  const names: string[] = [];
  if (providers.arena) names.push('Arena AI');
  if (providers.openrouter) names.push('OpenRouter');
  if (providers.gemini) names.push('Google Gemini');
  return names;
}
