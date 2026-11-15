'use client';

/**
 * SignalStrip — the four service links the home page reads.
 *
 * Each tile reports the actual outcome of the request that populated the page.
 * There is no decorative "live" pulse: a green state only appears once a request
 * has succeeded, and simulated/sample data is labelled as such.
 *
 * Two rules learned from the field:
 *  - A failed tile must say *why* it failed. "UNAVAILABLE" cannot be acted on;
 *    "offline — this device has no connection" and "the server answered HTTP 504"
 *    need different responses from the reader.
 *  - A failed tile must offer the retry. The page-level reload throws away three
 *    healthy tiles to rescue one broken one.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Aperture, Leaf, Satellite } from 'lucide-react';
import { DataStateBadge, cx, type DataState } from '../../ui/primitives';
import type { ResourcePhase } from '../../hooks/useApiResource';
import type { Provenance, Sourced } from './homeData';

export interface Signal {
  phase: ResourcePhase;
  provenance?: Provenance;
}

/** The slice of `useApiResource` a tile needs; the hook's result satisfies it. */
export interface SignalResource {
  phase: ResourcePhase;
  data: Sourced<unknown> | null;
  error?: string | null;
  /** Mechanical detail for the failed request (tooltip). */
  errorDetail?: string | null;
  reload?: () => void;
}

function toDataState(signal: Signal): DataState {
  if (signal.phase === 'loading' || signal.phase === 'idle') return 'loading';
  if (signal.phase === 'error' || !signal.provenance) return 'unavailable';
  switch (signal.provenance) {
    case 'live':
      return 'live';
    case 'cached':
      return 'cached';
    case 'derived':
      return 'derived';
    case 'simulated':
      return 'static';
    default:
      return 'static';
  }
}

function SignalTile({
  icon: Icon,
  title,
  detail,
  state,
  stateLabel,
  stateDetail,
  failure,
  onRetry,
  retryLabel
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  detail: string;
  state: DataState;
  stateLabel?: string;
  stateDetail?: string;
  failure?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 border-line/60 px-4 py-4 sm:px-5 lg:border-l lg:first:border-l-0">
      <span
        className={cx(
          'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[9px] border',
          state === 'live'
            ? 'border-signal/25 bg-signal/10 text-signal'
            : state === 'unavailable'
              ? 'border-caution/25 bg-caution/10 text-caution'
              : 'border-line bg-surface-2/70 text-ink-2'
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.6} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-[12.5px] font-medium text-ink">{title}</p>
          <DataStateBadge state={state} label={stateLabel} detail={stateDetail} />
        </div>
        {/* The failure reason replaces the source line: it is the more useful
            sentence when nothing loaded. */}
        <p className="mt-1 text-[10.5px] leading-snug text-ink-4">{failure || detail}</p>
        {failure && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 rounded-[6px] border border-line px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-3 transition-colors hover:border-ink-4/50 hover:text-ink"
          >
            {retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function SignalStrip({
  apod,
  iss,
  neo,
  earth
}: {
  apod: SignalResource;
  iss: SignalResource;
  neo: SignalResource;
  earth: SignalResource;
}) {
  const { t } = useTranslation();
  const retryLabel = t('retry');

  const tile = (resource: SignalResource) => {
    const resolved = resource;
    const signal: Signal = { phase: resource.phase, provenance: resource.data?.state };
    const failed = resource.phase === 'error';
    const reason = failed ? resource.error || t('retry') : null;
    return {
      state: toDataState(signal),
      // "Offline" is a state of the reader's device, not of NASA: name it.
      stateLabel: failed && reason && /offline/i.test(reason) ? 'Offline' : undefined,
      stateDetail: resolved.data?.note ?? resolved.errorDetail ?? undefined,
      failure: reason,
      onRetry: failed ? resource.reload : undefined,
      retryLabel
    };
  };

  const apodTile = tile(apod);
  const issTile = tile(iss);
  const neoTile = tile(neo);
  const earthTile = tile(earth);

  return (
    <section aria-label={t('signalsTitle')} className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
      <div className="surface surface-highlight grid grid-cols-1 overflow-hidden rounded-[16px] border border-line sm:grid-cols-2 lg:grid-cols-4">
        <SignalTile icon={Aperture} title={t('signalApod')} detail="NASA APOD / NASA Science" {...apodTile} />
        <SignalTile
          icon={Satellite}
          title={t('signalIss')}
          // The route serves the last genuine fix when wheretheiss.at fails; it has
          // no propagated orbit of its own, so the tile says "last known fix".
          detail="api.wheretheiss.at · last known fix on failure"
          {...issTile}
          stateLabel={iss.data?.state === 'simulated' ? t('stateSimulated') : issTile.stateLabel}
        />
        <SignalTile
          icon={Activity}
          title={t('signalNeo')}
          // The tile must name the source it actually used: after the JPL fallback
          // the numbers are real but they are not NeoWs's.
          detail={
            neo.data?.state === 'derived'
              ? 'JPL close-approach data · NeoWs unreachable'
              : 'NASA NeoWs · 7-day close-approach feed'
          }
          {...neoTile}
        />
        <SignalTile icon={Leaf} title={t('signalPower')} detail="power.larc.nasa.gov · monthly archive" {...earthTile} />
      </div>
    </section>
  );
}
