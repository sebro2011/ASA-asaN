/**
 * Shared UI primitives for the Earth Intelligence Lab.
 * Styling follows the existing Cosmic Dark glass-panel design system
 * (slate-950/80 panels, cyan/lime accents, rounded-2xl, Orbitron headings).
 */

import React from 'react';
import { AlertTriangle, Info, RefreshCw } from 'lucide-react';
import type { DataStatus } from '../../lib/earth/types';

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
    <Tag
      className={`rounded-2xl border border-slate-800/80 bg-slate-950/80 backdrop-blur-xl p-4 sm:p-5 shadow-xl ${className}`}
      {...rest}
    >
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
    <div className={`flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm sm:text-base font-semibold text-white">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-cyan-400" /> : null}
          <span className="font-['Orbitron'] tracking-wide">{title}</span>
        </h3>
        {subtitle ? <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">{subtitle}</p> : null}
      </div>
      {badge}
    </div>
  );
}

const STATUS_STYLES: Record<DataStatus, { label: string; className: string }> = {
  live: { label: 'Live', className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
  cached: { label: 'Cached', className: 'border-sky-500/40 bg-sky-500/10 text-sky-300' },
  derived: { label: 'Derived', className: 'border-violet-500/40 bg-violet-500/10 text-violet-300' },
  unavailable: { label: 'Unavailable', className: 'border-amber-500/40 bg-amber-500/10 text-amber-300' },
  'not-configured': { label: 'Not configured', className: 'border-slate-600/60 bg-slate-700/20 text-slate-300' }
};

export function StatusBadge({ status, note }: { status: DataStatus; note?: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.unavailable;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${style.className}`}
      title={note}
    >
      {style.label}
    </span>
  );
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
    slate: 'border-slate-700 bg-slate-900/70 text-slate-300',
    cyan: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
    lime: 'border-lime-500/40 bg-lime-500/10 text-lime-200',
    amber: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
    rose: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
    emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
    violet: 'border-violet-500/40 bg-violet-500/10 text-violet-200'
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${tones[tone]} ${className}`}>
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
  const borders: Record<string, string> = {
    slate: 'border-slate-800',
    cyan: 'border-cyan-500/25',
    rose: 'border-rose-500/25',
    sky: 'border-sky-500/25',
    amber: 'border-amber-500/25',
    lime: 'border-lime-500/25',
    violet: 'border-violet-500/25'
  };
  return (
    <div className={`flex flex-col gap-1.5 rounded-xl border ${borders[tone]} bg-slate-950/70 p-3.5`}>
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : null}
        <p className="text-[11px] leading-tight text-slate-400">{label}</p>
      </div>
      <p className="text-lg font-bold text-white sm:text-xl">
        {value}
        {unit ? <span className="ml-1 text-xs font-medium text-slate-400">{unit}</span> : null}
      </p>
      {note ? <p className="text-[11px] leading-snug text-slate-500">{note}</p> : null}
    </div>
  );
}

export function LoadingBlock({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-8" role="status" aria-live="polite">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-cyan-500/20 border-t-cyan-400" />
      </div>
      <p className="text-sm text-slate-300">{label}</p>
      {detail ? <p className="font-mono text-[10px] text-slate-500">{detail}</p> : null}
    </div>
  );
}

export function ErrorBlock({ message, onRetry, retryLabel = 'Try again' }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-5" role="alert">
      <div className="flex flex-col items-center gap-3 text-center">
        <AlertTriangle className="h-7 w-7 text-amber-300" />
        <p className="text-sm text-amber-100">{message}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-2 rounded-lg border border-amber-400/50 bg-amber-500/10 px-4 py-2 text-sm text-amber-100 transition hover:bg-amber-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
          >
            <RefreshCw className="h-4 w-4" />
            {retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function InfoNote({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'amber' | 'cyan' }) {
  const tones = {
    slate: 'border-slate-800 bg-slate-900/50 text-slate-300',
    amber: 'border-amber-500/30 bg-amber-950/20 text-amber-100',
    cyan: 'border-cyan-500/30 bg-cyan-950/20 text-cyan-100'
  };
  return (
    <div className={`flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed ${tones[tone]}`}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function DefinitionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(96px,auto)_1fr] gap-x-3 gap-y-1 border-b border-slate-800/60 py-1.5 last:border-0">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-xs text-slate-200">{children}</dd>
    </div>
  );
}

export function formatDateTime(iso?: string, locale = 'en-GB'): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) + ' UTC';
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
