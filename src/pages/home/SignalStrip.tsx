'use client';

/**
 * SignalStrip — the four service links the home page reads.
 *
 * Each tile reports the actual outcome of the request that populated the page.
 * There is no decorative "live" pulse: a green state only appears once a request
 * has succeeded, and simulated/sample data is labelled as such.
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
  stateLabel
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  detail: string;
  state: DataState;
  stateLabel?: string;
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
          <DataStateBadge state={state} label={stateLabel} />
        </div>
        <p className="mt-1 text-[10.5px] leading-snug text-ink-4">{detail}</p>
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
  apod: { phase: ResourcePhase; data: Sourced<unknown> | null };
  iss: { phase: ResourcePhase; data: Sourced<unknown> | null };
  neo: { phase: ResourcePhase; data: Sourced<unknown> | null };
  earth: { phase: ResourcePhase; data: Sourced<unknown> | null };
}) {
  const { t } = useTranslation();
  const signal = (resource: { phase: ResourcePhase; data: Sourced<unknown> | null }): Signal => ({
    phase: resource.phase,
    provenance: resource.data?.state
  });

  return (
    <section aria-label={t('signalsTitle')} className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
      <div className="surface-highlight grid grid-cols-1 overflow-hidden rounded-[16px] border border-line bg-surface/40 sm:grid-cols-2 lg:grid-cols-4">
        <SignalTile
          icon={Aperture}
          title={t('signalApod')}
          detail="api.nasa.gov/planetary/apod"
          state={toDataState(signal(apod))}
        />
        <SignalTile
          icon={Satellite}
          title={t('signalIss')}
          detail="api.wheretheiss.at · propagated fallback"
          state={toDataState(signal(iss))}
          stateLabel={iss.data?.state === 'simulated' ? t('stateSimulated') : undefined}
        />
        <SignalTile
          icon={Activity}
          title={t('signalNeo')}
          detail="NASA NeoWs · 7-day close-approach feed"
          state={toDataState(signal(neo))}
        />
        <SignalTile
          icon={Leaf}
          title={t('signalPower')}
          detail="power.larc.nasa.gov · monthly archive"
          state={toDataState(signal(earth))}
        />
      </div>
    </section>
  );
}
