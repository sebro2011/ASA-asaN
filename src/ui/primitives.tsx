/**
 * NASA SPACE EXPLORER — UI PRIMITIVES
 * -----------------------------------------------------------------------------
 * The component layer of the design system. Every primitive is token-driven
 * (see src/styles/tokens.css) so a visual change happens in one place.
 *
 * Conventions
 *  - Surfaces are `Panel`; never hand-roll another glass card.
 *  - Status is always expressed with `DataStateBadge` so live / cached / derived /
 *    unavailable data can never be confused with one another.
 *  - Interactive elements are real <button>/<a> elements with visible focus rings
 *    and accessible names (icon-only buttons require `label`).
 */

import React from 'react';
import { AlertTriangle, ArrowUpRight, Loader2, RefreshCw } from 'lucide-react';

/* ------------------------------------------------------------------ utils */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ----------------------------------------------------------------- panels */

export function Panel({
  children,
  className,
  as: Tag = 'section',
  tone = 'default',
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
  tone?: 'default' | 'flush' | 'quiet';
} & React.HTMLAttributes<HTMLElement>) {
  const tones = {
    default: 'surface surface-highlight p-5 sm:p-6',
    flush: 'surface surface-highlight overflow-hidden',
    quiet: 'surface-quiet p-4 sm:p-5'
  };
  return (
    <Tag className={cx(tones[tone], className)} {...rest}>
      {children}
    </Tag>
  );
}

export function PanelHeader({
  eyebrow,
  title,
  description,
  actions,
  icon: Icon,
  className
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h3 className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-ink sm:text-lg">
          {Icon ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-line bg-surface-2/80">
              <Icon className="h-4 w-4 text-atmo" strokeWidth={1.6} />
            </span>
          ) : null}
          <span className="min-w-0">{title}</span>
        </h3>
        {description ? (
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-2">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- buttons */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'quiet';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-all duration-200 ease-[var(--ease-out-expo)] disabled:cursor-not-allowed disabled:opacity-45 active:translate-y-px';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-atmo text-[#04202b] shadow-[0_10px_30px_-14px_rgba(94,211,242,0.75)] hover:bg-atmo-soft',
  secondary:
    'border border-line-strong bg-surface-2/80 text-ink hover:border-atmo/50 hover:bg-surface-3/70',
  ghost: 'border border-transparent text-ink-2 hover:border-line hover:bg-surface-2/60 hover:text-ink',
  quiet: 'border border-line/70 bg-transparent text-ink-3 hover:text-ink hover:border-line-strong'
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[12px]',
  md: 'h-10 px-4 text-[13px]',
  lg: 'h-12 px-5 text-sm'
};

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  className,
  icon: Icon,
  trailingIcon: Trailing,
  ...rest
}: {
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  trailingIcon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...rest}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" strokeWidth={1.7} /> : null}
      {children}
      {Trailing ? <Trailing className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={1.7} /> : null}
    </button>
  );
}

export function IconButton({
  label,
  icon: Icon,
  className,
  variant = 'secondary',
  size = 'md',
  ...rest
}: {
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const dimensions = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-10 w-10';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], dimensions, 'p-0', className)}
      {...rest}
    >
      <Icon className="h-4 w-4" strokeWidth={1.7} />
    </button>
  );
}

export function LinkButton({
  children,
  href,
  external = true,
  className,
  icon: Icon,
  ...rest
}: {
  children: React.ReactNode;
  href: string;
  external?: boolean;
  className?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer noopener' : undefined}
      className={cx(
        BUTTON_BASE,
        BUTTON_VARIANTS.secondary,
        BUTTON_SIZES.sm,
        'text-ink-2 hover:text-ink',
        className
      )}
      {...rest}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={1.7} /> : null}
      {children}
      {external ? <ArrowUpRight className="h-3 w-3 opacity-70" strokeWidth={1.8} /> : null}
    </a>
  );
}

/* ----------------------------------------------------------------- status */

export type DataState = 'live' | 'cached' | 'derived' | 'static' | 'unavailable' | 'loading';

const STATE_STYLES: Record<DataState, { label: string; dot: string; text: string; border: string }> = {
  live: { label: 'Live', dot: 'bg-signal', text: 'text-signal', border: 'border-signal/30' },
  cached: { label: 'Cached', dot: 'bg-azure', text: 'text-azure', border: 'border-azure/30' },
  derived: { label: 'Derived', dot: 'bg-derived', text: 'text-derived', border: 'border-derived/30' },
  static: { label: 'Static', dot: 'bg-ink-4', text: 'text-ink-3', border: 'border-line' },
  unavailable: { label: 'Unavailable', dot: 'bg-caution', text: 'text-caution', border: 'border-caution/30' },
  loading: { label: 'Requesting', dot: 'bg-atmo', text: 'text-atmo', border: 'border-atmo/30' }
};

/**
 * The single place in the product where "is this data live?" is answered.
 * `label` lets a module be more specific ("Simulated", "Sample", "Archived").
 */
export function DataStateBadge({
  state,
  label,
  detail,
  className
}: {
  state: DataState;
  label?: string;
  detail?: string;
  className?: string;
}) {
  const style = STATE_STYLES[state];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border bg-surface/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]',
        style.border,
        style.text,
        className
      )}
      title={detail}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', style.dot, state === 'loading' && 'animate-pulse')} />
      {label || style.label}
    </span>
  );
}

export function StatusRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx('flex flex-wrap items-center gap-2', className)}>{children}</div>;
}

/* ------------------------------------------------------------- empty/error */

export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
  compact = false
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  compact?: boolean;
}) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center rounded-[14px] border border-dashed border-line text-center',
        compact ? 'gap-2 p-5' : 'gap-3 p-8'
      )}
      role="status"
    >
      {Icon ? <Icon className="h-5 w-5 text-ink-4" strokeWidth={1.5} /> : null}
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        {description ? <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-ink-3">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Data unavailable',
  message,
  onRetry,
  retryLabel = 'Try again',
  compact = false
}: {
  title?: string;
  message?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cx(
        'rounded-[14px] border border-caution/25 bg-caution/[0.06] text-left',
        compact ? 'p-4' : 'p-6'
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-caution" strokeWidth={1.7} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{title}</p>
          {message ? <div className="mt-1 text-xs leading-relaxed text-ink-2">{message}</div> : null}
          {onRetry ? (
            <Button size="sm" variant="quiet" className="mt-3" onClick={onRetry} icon={RefreshCw}>
              {retryLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-[10px] bg-surface-2/80', className)} aria-hidden="true" />;
}

export function LoadingState({
  label = 'Retrieving data',
  detail,
  rows = 2
}: {
  label?: string;
  detail?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-xs text-ink-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-atmo" strokeWidth={2} />
        <span>{label}</span>
        {detail ? <span className="font-mono text-[10px] text-ink-4">{detail}</span> : null}
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className={cx('h-4', index === 0 ? 'w-3/4' : index === 1 ? 'w-1/2' : 'w-2/3')} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- data */

export function Metric({
  label,
  value,
  unit,
  note,
  size = 'md',
  align = 'left'
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  note?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  align?: 'left' | 'right';
}) {
  const sizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl sm:text-4xl'
  };
  return (
    <div className={cx('min-w-0', align === 'right' && 'text-right')}>
      <p className="eyebrow">{label}</p>
      <p className={cx('metric mt-1.5', sizes[size])}>
        {value}
        {unit ? <span className="ml-1.5 font-sans text-[11px] font-medium tracking-normal text-ink-3">{unit}</span> : null}
      </p>
      {note ? <p className="mt-1 text-[11px] leading-snug text-ink-4">{note}</p> : null}
    </div>
  );
}

export function DataRow({
  label,
  children,
  mono = false
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2 last:border-0">
      <dt className="text-[11px] uppercase tracking-[0.12em] text-ink-4">{label}</dt>
      <dd className={cx('min-w-0 break-words text-right text-xs text-ink-2', mono && 'font-mono text-[11px]')}>
        {children}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------- navigation */

export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  label,
  size = 'md'
}: {
  items: Array<{ value: T; label: string; icon?: React.ComponentType<{ className?: string }> }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-[12px] border border-line bg-abyss/70 p-1"
    >
      {items.map((item) => {
        const active = item.value === value;
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(item.value)}
            className={cx(
              'relative inline-flex shrink-0 items-center gap-1.5 rounded-[9px] font-medium transition-colors duration-200',
              size === 'sm' ? 'h-7 px-2.5 text-[11px]' : 'h-8 px-3 text-xs',
              active
                ? 'bg-surface-3 text-ink shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset]'
                : 'text-ink-3 hover:text-ink-2'
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className
}: {
  items: Array<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cx('no-scrollbar flex gap-6 overflow-x-auto border-b border-line', className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(item.value)}
            className={cx(
              'relative shrink-0 pb-3 pt-1 text-[13px] font-medium transition-colors duration-200',
              active ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
            )}
          >
            {item.label}
            {typeof item.count === 'number' ? (
              <span className="ml-1.5 font-mono text-[10px] text-ink-4">{item.count}</span>
            ) : null}
            <span
              className={cx(
                'absolute inset-x-0 -bottom-px h-px transition-opacity',
                active ? 'bg-atmo opacity-100' : 'opacity-0'
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- page header */

export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  icon: Icon
}: {
  eyebrow: string;
  title: string;
  description?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-line pb-6 sm:pb-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 max-w-3xl">
          <p className="eyebrow flex items-center gap-2">
            {Icon ? <Icon className="h-3.5 w-3.5 text-atmo" strokeWidth={1.8} /> : null}
            {eyebrow}
          </p>
          <h1 className="mt-2.5 text-[26px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[32px] lg:text-[38px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-2 sm:text-sm">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-ink-4">{meta}</div> : null}
    </header>
  );
}

/* ------------------------------------------------------------- attribution */

export function SourceNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cx('text-[11px] leading-relaxed text-ink-4', className)}>{children}</p>
  );
}
