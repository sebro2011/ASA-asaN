'use client';

/**
 * MissionOverview — the operational dashboard on the home page.
 *
 * Information hierarchy mirrors a control room: orbital state first, then
 * objects being tracked, then the day's imagery. Every panel carries its own
 * data-state badge, source and retrieval time, and each panel has a designed
 * empty / unavailable state — none of them silently disappear.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Aperture, ExternalLink, Info, Satellite, Target } from 'lucide-react';
import {
  Button,
  DataStateBadge,
  ErrorState,
  Metric,
  Panel,
  PanelHeader,
  Skeleton,
  SourceNote,
  cx,
  type DataState
} from '../../ui/primitives';
import type { TabId } from '../../ui/navigation';
import type { Apod, IssPosition, NeoOverview, Sourced } from './homeData';
import type { ResourcePhase } from '../../hooks/useApiResource';

const numberFormat = new Intl.NumberFormat('en-GB');

function toDataState(provenance?: string): DataState {
  if (provenance === 'live') return 'live';
  if (provenance === 'cached') return 'cached';
  if (provenance === 'derived') return 'derived';
  if (provenance === 'simulated') return 'static';
  if (provenance === 'static') return 'static';
  return 'unavailable';
}

function stateLabel(provenance: string | undefined, t: (key: string) => string): string | undefined {
  if (provenance === 'simulated') return t('stateSimulated');
  if (provenance === 'static') return t('stateStatic');
  return undefined;
}

function clockLabel(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toISOString().slice(0, 16).replace('T', ' ')}Z`;
}

function coordinates(value: number, axis: 'lat' | 'lon'): { magnitude: string; hemisphere: string } {
  const hemisphere = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return { magnitude: Math.abs(value).toFixed(2), hemisphere };
}

/* ------------------------------------------------------------------- ISS */

function IssPanel({
  resource,
  onNavigate
}: {
  resource: { phase: ResourcePhase; data: Sourced<IssPosition> | null; error: string | null; reload: () => void };
  onNavigate: (tab: TabId) => void;
}) {
  const { t } = useTranslation();
  const sourced = resource.data;
  const iss = sourced?.data;
  const lat = iss ? coordinates(iss.latitude, 'lat') : null;
  const lon = iss ? coordinates(iss.longitude, 'lon') : null;

  return (
    <Panel className="flex flex-col gap-5 lg:col-span-7">
      <PanelHeader
        eyebrow="Orbital mechanics"
        title={t('issTitle')}
        description={t('issSubtitle')}
        icon={Satellite}
        actions={
          <>
            <DataStateBadge state={toDataState(sourced?.state)} label={stateLabel(sourced?.state, t)} />
          </>
        }
      />

      {resource.phase === 'loading' && !iss ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : null}

      {!iss && resource.phase === 'error' ? (
        <ErrorState
          title={t('stateUnavailable')}
          message={resource.error || undefined}
          onRetry={resource.reload}
          retryLabel={t('retry')}
          compact
        />
      ) : null}

      {iss ? (
        <>
          <div className="grid gap-4 sm:grid-cols-[1.1fr_1fr]">
            <div className="surface-inset relative overflow-hidden p-4">
              <div className="pointer-events-none absolute inset-0 grid-field opacity-60" aria-hidden="true" />
              <p className="eyebrow relative">{t('issLatitude')} / {t('issLongitude')}</p>
              <div className="relative mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
                <span className="metric text-[30px] leading-none">
                  {lat?.magnitude}
                  <span className="ml-1 font-mono text-[13px] font-normal text-atmo">{lat?.hemisphere}</span>
                </span>
                <span className="h-6 w-px bg-line-strong" aria-hidden="true" />
                <span className="metric text-[30px] leading-none">
                  {lon?.magnitude}
                  <span className="ml-1 font-mono text-[13px] font-normal text-atmo">{lon?.hemisphere}</span>
                </span>
              </div>
              <p className="relative mt-3 font-mono text-[10px] text-ink-4">
                epoch {clockLabel(iss.timestamp ? new Date(iss.timestamp).toISOString() : null)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <Metric
                label={t('issAltitude')}
                value={iss.altitude ? numberFormat.format(Math.round(iss.altitude)) : '—'}
                unit="km"
                size="sm"
              />
              <Metric
                label={t('issVelocity')}
                value={iss.velocity ? numberFormat.format(Math.round(iss.velocity)) : '—'}
                unit="km/h"
                size="sm"
              />
              <Metric label={t('issVisibility')} value={iss.visibility ? iss.visibility : '—'} size="sm" />
              <Metric
                label={t('lastUpdated')}
                value={sourced ? clockLabel(sourced.retrievedAt) : '—'}
                size="sm"
              />
            </div>
          </div>

          {sourced?.state === 'simulated' ? (
            <div className="flex items-start gap-2 rounded-[10px] border border-caution/25 bg-caution/[0.06] p-3 text-[11.5px] leading-relaxed text-caution">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
              <span>{t('issSimulatedNote')}</span>
            </div>
          ) : null}

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-4">
            <SourceNote>api.wheretheiss.at · propagated two-body fallback</SourceNote>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('iss')} trailingIcon={ArrowRight}>
              {t('issOpenTracker')}
            </Button>
          </div>
        </>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------- NEO */

function formatLunar(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)} LD`;
}

function NeoPanel({
  resource,
  onNavigate
}: {
  resource: { phase: ResourcePhase; data: Sourced<NeoOverview> | null; error: string | null; reload: () => void };
  onNavigate: (tab: TabId) => void;
}) {
  const { t } = useTranslation();
  const sourced = resource.data;
  const overview = sourced?.data;
  const isReference = sourced?.state === 'static';
  const closest = overview?.closest;

  return (
    <Panel className="flex flex-col gap-5 lg:col-span-5">
      <PanelHeader
        eyebrow="Planetary defence"
        title={t('neoTitle')}
        description={t('neoSubtitle')}
        icon={Target}
        actions={<DataStateBadge state={toDataState(sourced?.state)} label={stateLabel(sourced?.state, t)} />}
      />

      {resource.phase === 'loading' && !overview ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-20" />
        </div>
      ) : null}

      {!overview && resource.phase === 'error' ? (
        <ErrorState
          title={t('stateUnavailable')}
          message={resource.error || undefined}
          onRetry={resource.reload}
          retryLabel={t('retry')}
          compact
        />
      ) : null}

      {overview ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Metric
              label={t('neoCount')}
              value={numberFormat.format(overview.count)}
              note={sourced ? `${overview.window.start} → ${overview.window.end}` : undefined}
            />
            <Metric
              label={t('neoHazardous')}
              value={isReference ? '—' : numberFormat.format(overview.hazardousCount)}
              note={isReference ? t('unavailableShort') : undefined}
            />
          </div>

          {!isReference && closest ? (
            <div className="surface-inset p-4">
              <p className="eyebrow">{t('neoClosest')}</p>
              <p className="mt-2 text-[14px] font-medium leading-snug text-ink">{closest.name}</p>
              <dl className="mt-3 space-y-1.5 text-[11.5px]">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-4">{t('neoDistance')}</dt>
                  <dd className="font-mono text-ink-2">
                    {formatLunar(closest.missDistanceLunar)}
                    <span className="ml-1.5 text-ink-4">
                      {closest.missDistanceKm ? `(${numberFormat.format(Math.round(closest.missDistanceKm))} km)` : ''}
                    </span>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-4">{t('neoDiameter')}</dt>
                  <dd className="font-mono text-ink-2">
                    {closest.diameterMinM !== null && closest.diameterMaxM !== null
                      ? `${Math.round(closest.diameterMinM)}–${Math.round(closest.diameterMaxM)} m`
                      : '—'}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-4">{t('neoVelocity')}</dt>
                  <dd className="font-mono text-ink-2">
                    {closest.velocityKps !== null ? `${closest.velocityKps.toFixed(2)} km/s` : '—'}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-4">Classification</dt>
                  <dd className={cx('font-mono', closest.hazardous ? 'text-caution' : 'text-signal')}>
                    {closest.hazardous ? 'PHA — flagged' : 'Not flagged'}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}

          <p className="text-[11px] leading-relaxed text-ink-4">
            {isReference ? t('neoStaticNote') : t('neoDisclaimer')}
          </p>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-4">
            <SourceNote>NASA NeoWs · JPL close-approach data</SourceNote>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('asteroids')} trailingIcon={ArrowRight}>
              {t('neoOpen')}
            </Button>
          </div>
        </>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ APOD */

function ApodPanel({
  resource,
  onNavigate
}: {
  resource: { phase: ResourcePhase; data: Sourced<Apod> | null; error: string | null; reload: () => void };
  onNavigate: (tab: TabId) => void;
}) {
  const { t } = useTranslation();
  const sourced = resource.data;
  const apod = sourced?.data;

  return (
    <Panel className="overflow-hidden p-0 lg:col-span-12">
      <div className="grid lg:grid-cols-[1.35fr_1fr]">
        <div className="relative min-h-[240px] bg-abyss">
          {apod ? (
            apod.media_type === 'image' ? (
              <img
                src={apod.url}
                alt={apod.title}
                loading="lazy"
                decoding="async"
                className="h-full max-h-[420px] w-full object-cover"
              />
            ) : (
              <div className="flex h-full min-h-[240px] items-center justify-center p-6 text-center">
                <div>
                  <p className="text-[12px] text-ink-2">This entry is {apod.media_type}, not a still image.</p>
                  <a
                    href={apod.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-atmo underline decoration-dotted"
                  >
                    Open the original media <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )
          ) : (
            <Skeleton className="h-full min-h-[240px] w-full rounded-none" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-abyss/80 via-transparent to-transparent lg:bg-gradient-to-r" />
        </div>

        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <PanelHeader
            eyebrow={apod ? apod.date : 'NASA APOD'}
            title={t('apodTitle')}
            icon={Aperture}
            actions={<DataStateBadge state={toDataState(sourced?.state)} label={stateLabel(sourced?.state, t)} />}
          />

          {resource.phase === 'error' && !apod ? (
            <ErrorState
              title={t('stateUnavailable')}
              message={resource.error || undefined}
              onRetry={resource.reload}
              retryLabel={t('retry')}
              compact
            />
          ) : null}

          {apod ? (
            <>
              <h4 className="text-[19px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[22px]">
                {apod.title}
              </h4>
              <p className="line-clamp-4 text-[12.5px] leading-relaxed text-ink-2">{apod.explanation}</p>
              {sourced?.state === 'static' ? (
                <p className="text-[11px] leading-relaxed text-caution">{t('apodSampleNote')}</p>
              ) : null}
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-4">
                <SourceNote className="max-w-[18rem]">
                  {t('apodCredit')}: {apod.copyright || 'NASA'}
                </SourceNote>
                <Button variant="ghost" size="sm" onClick={() => onNavigate('apod')} trailingIcon={ArrowRight}>
                  {t('apodOpen')}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

/* --------------------------------------------------------------- wrapper */

export default function MissionOverview({
  iss,
  neo,
  apod,
  onNavigate
}: {
  iss: { phase: ResourcePhase; data: Sourced<IssPosition> | null; error: string | null; reload: () => void };
  neo: { phase: ResourcePhase; data: Sourced<NeoOverview> | null; error: string | null; reload: () => void };
  apod: { phase: ResourcePhase; data: Sourced<Apod> | null; error: string | null; reload: () => void };
  onNavigate: (tab: TabId) => void;
}) {
  const { t } = useTranslation();
  return (
    <section id="mission-overview" className="mx-auto max-w-[1400px] scroll-mt-24 px-4 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{t('overviewEyebrow')}</p>
          <h2 className="mt-2.5 max-w-2xl text-[22px] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[28px]">
            {t('overviewTitle')}
          </h2>
        </div>
        <p className="max-w-sm text-[12px] leading-relaxed text-ink-3">{t('overviewDescription')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <IssPanel resource={iss} onNavigate={onNavigate} />
        <NeoPanel resource={neo} onNavigate={onNavigate} />
        <ApodPanel resource={apod} onNavigate={onNavigate} />
      </div>
    </section>
  );
}
