'use client';

/**
 * EarthPreview — one truthful observation from the Earth Intelligence Lab.
 *
 * The home page shows a single real NASA POWER series (annual means of 2 m air
 * temperature for Colombo) with its units, grid-cell caveat and source link. It
 * is a doorway into the Lab, not a replacement for it: no precipitation is
 * interpolated, no "anomaly" is invented, and a short series is never described
 * as a climate trend.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ExternalLink, Leaf, RefreshCw } from 'lucide-react';
import {
  Button,
  DataStateBadge,
  ErrorState,
  Metric,
  Panel,
  Skeleton,
  SourceNote
} from '../../ui/primitives';
import type { ResourcePhase } from '../../hooks/useApiResource';
import type { EarthPreview as EarthPreviewData, Sourced } from './homeData';
import { Sparkline } from './Sparkline';
import type { TabId } from '../../ui/navigation';

function formatSigned(value: number | null, digits = 3): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

export default function EarthPreview({
  resource,
  onNavigate
}: {
  resource: {
    phase: ResourcePhase;
    data: Sourced<EarthPreviewData> | null;
    error: string | null;
    reload: () => void;
  };
  onNavigate: (tab: TabId) => void;
}) {
  const { t } = useTranslation();
  const sourced = resource.data;
  const preview = sourced?.data;

  return (
    <section className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.15fr] lg:items-start lg:gap-10">
        <div className="lg:sticky lg:top-24">
          <p className="eyebrow flex items-center gap-2">
            <Leaf className="h-3.5 w-3.5 text-atmo" strokeWidth={1.8} />
            {t('earthEyebrow')}
          </p>
          <h2 className="mt-3 max-w-md text-[24px] font-semibold leading-[1.12] tracking-[-0.028em] text-ink sm:text-[30px] lg:text-[34px]">
            {t('earthTitle')}
          </h2>
          <p className="prose-measure mt-4 max-w-md text-[13px] leading-relaxed text-ink-2">
            {t('earthDescription')}
          </p>

          <dl className="mt-6 grid max-w-md grid-cols-3 gap-4 border-t border-line/70 pt-5">
            <div>
              <dt className="eyebrow">{t('earthMeanLabel')}</dt>
              <dd className="metric mt-1.5 text-lg">
                {preview?.mean !== null && preview?.mean !== undefined ? preview.mean.toFixed(1) : '—'}
                <span className="ml-1 font-sans text-[10px] text-ink-4">{preview?.unit || '°C'}</span>
              </dd>
            </div>
            <div>
              <dt className="eyebrow">{t('earthTrendLabel')}</dt>
              <dd className="metric mt-1.5 text-lg">
                {formatSigned(preview?.slopePerYear ?? null, 3)}
                <span className="ml-1 font-sans text-[10px] text-ink-4">/yr</span>
              </dd>
            </div>
            <div>
              <dt className="eyebrow">{t('earthPointsLabel')}</dt>
              <dd className="metric mt-1.5 text-lg">
                {preview ? preview.points.filter((point) => typeof point.mean === 'number').length : '—'}
              </dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="primary" size="md" onClick={() => onNavigate('earth')} trailingIcon={ArrowRight}>
              {t('earthOpenLab')}
            </Button>
            <Button variant="ghost" size="md" onClick={resource.reload} icon={RefreshCw}>
              {t('refresh')}
            </Button>
          </div>
        </div>

        <Panel className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">NASA POWER · monthly archive</p>
              <h3 className="mt-2 text-[15px] font-semibold text-ink">
                {preview ? preview.placeLabel : 'Colombo, Sri Lanka'}
              </h3>
              <p className="mt-1 font-mono text-[10.5px] text-ink-4">
                {preview
                  ? `${preview.latitude.toFixed(3)}°, ${preview.longitude.toFixed(3)}° · T2M · ${preview.years.start}–${preview.years.end}`
                  : '6.927°, 79.861° · T2M'}
              </p>
            </div>
            <DataStateBadge
              state={
                resource.phase === 'loading'
                  ? 'loading'
                  : resource.phase === 'error'
                    ? 'unavailable'
                    : sourced?.state === 'cached'
                      ? 'cached'
                      : 'live'
              }
            />
          </div>

          {resource.phase === 'loading' && !preview ? (
            <div className="space-y-3">
              <Skeleton className="h-[132px] w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ) : null}

          {!preview && resource.phase === 'error' ? (
            <ErrorState
              title="NASA POWER unreachable"
              message={
                <>
                  {resource.error || 'The monthly archive did not respond.'} The full Earth Lab can still be opened — it
                  retries the validated server proxy, then the public service directly.
                </>
              }
              onRetry={resource.reload}
              retryLabel={t('retry')}
            />
          ) : null}

          {preview ? (
            <>
              <Sparkline points={preview.points} unit={preview.unit} label={`${preview.placeLabel} annual mean temperature`} />
              <div className="grid grid-cols-2 gap-4 border-t border-line/60 pt-4">
                <Metric label="Period" value={`${preview.years.start}–${preview.years.end}`} size="sm" />
                <Metric
                  label={t('retrieved')}
                  value={new Date(preview.retrievedAt).toISOString().slice(0, 10)}
                  size="sm"
                />
              </div>
            </>
          ) : null}

          <SourceNote>
            {t('earthGridNote')}{' '}
            {preview?.sourceUrl ? (
              <a
                href={preview.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-atmo underline decoration-dotted underline-offset-2"
              >
                query <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ) : null}
          </SourceNote>
        </Panel>
      </div>
    </section>
  );
}
