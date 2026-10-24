/**
 * Shared UI primitives for the Earth Intelligence Lab.
 *
 * These are thin adapters over the product design system (src/ui/primitives)
 * so the Lab inherits the same surfaces, type scale, status vocabulary and
 * focus behaviour as the rest of the application. The exported API is kept
 * from the original Lab so every workspace keeps working unchanged.
 */

import React from 'react';
import { AlertTriangle, Info, RefreshCw } from 'lucide-react';
import type { DataStatus } from '../../lib/earth/types';
import { DataStateBadge, cx, type DataState } from '../../ui/primitives';

export function Panel({
  children,
  className = '',
  as: Tag = 'section',
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  as?: any;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cx('surface surface-highlight p-4 sm:p-5', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function SectionHeading({
  icon: Icon,
  title,
  subtitle,
  badge,
  className = ''
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h3 className="flex items-center gap-2.5 text-[14px] font-semibold tracking-[-0.01em] text-ink sm:text-[15px]">
          {Icon ? (
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border border-line bg-surface-2/70">
              <Icon className="h-3.5 w-3.5 text-atmo" />
            </span>
          ) : null}
          <span className="min-w-0">{title}</span>
        </h3>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-[11.5px] leading-relaxed text-ink-3">{subtitle}</p> : null}
      </div>
      {badge ? <div className="flex shrink-0 flex-wrap items-center gap-2">{badge}</div> : null}
    </div>
  );
}

const STATUS_MAP: Record<DataStatus, { state: DataState; label: string }> = {
  live: { state: 'live', label: 'Live' },
  cached: { state: 'cached', label: 'Cached' },
  derived: { state: 'derived', label: 'Derived' },
  unavailable: { state: 'unavailable', label: 'Unavailable' },
  'not-configured': { state: 'static', label: 'Not configured' }
};

export function StatusBadge({ status, note }: { status: DataStatus; note?: string }) {
  const mapped = STATUS_MAP[status] || STATUS_MAP.unavailable;
  return <DataStateBadge state={mapped.state} label={mapped.label} detail={note} />;
}

export function Pill({
  children,
  tone = 'slate',
  className = ''
}: {
  children: React.ReactNode;
  tone?: 'slate' | 'cyan' | 'lime' | 'amber' | 'rose' | 'emerald' | 'violet';
  className?: string;
}) {
  const tones: Record<string, string> = {
    slate: 'border-line bg-surface/60 text-ink-3',
    cyan: 'border-atmo/30 bg-atmo/10 text-atmo-soft',
    lime: 'border-signal/30 bg-signal/10 text-signal',
    amber: 'border-caution/30 bg-caution/10 text-caution',
    rose: 'border-critical/30 bg-critical/10 text-critical',
    emerald: 'border-signal/30 bg-signal/10 text-signal',
    violet: 'border-derived/30 bg-derived/10 text-derived'
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em]',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  unit,
  note,
  tone = 'slate',
  icon: Icon
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  note?: string;
  tone?: 'slate' | 'cyan' | 'rose' | 'sky' | 'amber' | 'lime' | 'violet';
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="surface-inset flex flex-col gap-1.5 p-3.5">
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-ink-4" /> : null}
        <p className="text-[10.5px] leading-tight text-ink-3">{label}</p>
      </div>
      <p className="metric text-lg leading-none text-ink">
        {value}
        {unit ? <span className="ml-1 font-sans text-[10px] font-medium text-ink-4">{unit}</span> : null}
      </p>
      {note ? <p className="text-[10px] leading-snug text-ink-4">{note}</p> : null}
    </div>
  );
}

export function LoadingBlock({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[12px] border border-line bg-surface/40 p-8" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-atmo/20 border-t-atmo" />
      <p className="text-[12.5px] text-ink-2">{label}</p>
      {detail ? <p className="font-mono text-[10px] text-ink-4">{detail}</p> : null}
    </div>
  );
}

export function ErrorBlock({
  message,
  onRetry,
  retryLabel = 'Try again'
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="rounded-[12px] border border-caution/25 bg-caution/[0.06] p-4" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-caution" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] text-ink">{message}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-line bg-surface/60 px-2.5 text-[11.5px] text-ink-2 transition-colors hover:text-ink"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {retryLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function InfoNote({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'amber' | 'cyan' }) {
  const tones = {
    slate: 'border-line bg-surface/40 text-ink-2',
    amber: 'border-caution/25 bg-caution/[0.06] text-caution',
    cyan: 'border-atmo/25 bg-atmo/[0.06] text-atmo-soft'
  };
  return (
    <div className={cx('flex items-start gap-2 rounded-[10px] border p-3 text-[11px] leading-relaxed', tones[tone])}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function DefinitionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(96px,auto)_1fr] gap-x-3 gap-y-1 border-b border-line/60 py-1.5 last:border-0">
      <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-4">{label}</dt>
      <dd className="min-w-0 break-words text-[11.5px] text-ink-2">{children}</dd>
    </div>
  );
}

export function formatDateTime(iso?: string, locale = 'en-GB'): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return (
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) + ' UTC'
    );
  } catch {
    return date.toISOString();
  }
}

export function formatNumber(value: number | null | undefined, digits = 2, locale = 'en-GB'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  } catch {
    return Number(value).toFixed(digits);
  }
}
