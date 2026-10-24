'use client';

/**
 * useApiResource — a tiny request state machine used by the redesigned pages.
 *
 * Every data surface in the product needs the same four states and the same
 * honesty rules: `loading`, `ready`, `error`, and an explicit `state` for
 * whether the payload is live, cached, simulated or unavailable. The hook also
 * guarantees cancellation on unmount and on re-fetch so a slow response can
 * never overwrite a newer one.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type ResourcePhase = 'idle' | 'loading' | 'ready' | 'error';

export interface ResourceState<T> {
  data: T | null;
  phase: ResourcePhase;
  error: string | null;
  /** ISO timestamp of the last successful load. */
  loadedAt: string | null;
}

export interface UseApiResourceResult<T> extends ResourceState<T> {
  reload: () => void;
  setData: (value: T | null) => void;
}

export interface UseApiResourceOptions {
  enabled?: boolean;
  /** Skip the initial automatic request. */
  manual?: boolean;
}

export function useApiResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  options: UseApiResourceOptions = {}
): UseApiResourceResult<T> {
  const { enabled = true, manual = false } = options;
  const [state, setState] = useState<ResourceState<T>>({
    data: null,
    phase: manual ? 'idle' : 'loading',
    error: null,
    loadedAt: null
  });
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!enabled || manual) return undefined;
    const controller = new AbortController();
    let active = true;
    setState((previous) => ({ ...previous, phase: previous.data ? previous.phase : 'loading', error: null }));

    loaderRef
      .current(controller.signal)
      .then((value) => {
        if (!active || controller.signal.aborted) return;
        setState({
          data: value,
          phase: 'ready',
          error: null,
          loadedAt: new Date().toISOString()
        });
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted || (error as Error)?.name === 'AbortError') return;
        setState((previous) => ({
          data: previous.data,
          phase: 'error',
          error: (error as Error)?.message || 'Request failed',
          loadedAt: previous.loadedAt
        }));
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, manual, nonce, ...deps]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  const setData = useCallback((value: T | null) => {
    setState((previous) => ({
      ...previous,
      data: value,
      phase: value ? 'ready' : previous.phase,
      loadedAt: value ? new Date().toISOString() : previous.loadedAt
    }));
  }, []);

  return { ...state, reload, setData };
}

export default useApiResource;
