'use client';

/**
 * ChartFrame — the only way charts are mounted in this product.
 *
 * Why this exists (verified defect, see docs/EARTH_INTELLIGENCE_LAB_UPGRADE.md):
 * a `<ResponsiveContainer height="100%">` inside a fixed-height box, combined
 * with an in-chart `<Legend>`, can leave Recharts with a plot area of zero
 * height. Recharts then renders axes, grid and reference lines but silently
 * drops every series — the UI shows values while the chart looks empty, with no
 * console error. This frame removes all three preconditions for that failure:
 *
 *  1. the height is a *number*, never a percentage chain;
 *  2. `initialDimension` supplies a usable size before ResizeObserver reports,
 *     so a chart mounted inside a hidden/animating tab still paints;
 *  3. the legend is HTML we own, outside the plotting surface, so it can never
 *     consume the plot height.
 *
 * It also guarantees: labelled axes with units, a table alternative for screen
 * readers and researchers, and an explicit state when nothing is plottable.
 */

import React from 'react';
import { ResponsiveContainer } from 'recharts';
import { Table2 } from 'lucide-react';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  hint?: string;
}

export function ChartLegend({ series }: { series: ChartSeries[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {series.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5" title={item.hint}>
          <span
            aria-hidden="true"
            className="h-0 w-4 border-t-2"
            style={{
              borderColor: item.color,
              borderTopStyle: item.dashed ? 'dashed' : 'solid'
            }}
          />
          <span className="text-[11px] text-ink-2">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function ChartFrame({
  height = 320,
  series,
  xLabel,
  yLabel,
  eyebrow,
  title,
  children,
  table,
  footnote,
  empty
}: {
  height?: number;
  series: ChartSeries[];
  xLabel: string;
  yLabel: string;
  eyebrow?: string;
  title?: string;
  children: React.ReactNode;
  table?: React.ReactNode;
  footnote?: React.ReactNode;
  empty?: React.ReactNode;
}) {
  if (empty) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-[12px] border border-dashed border-line text-center"
        style={{ height }}
      >
        <p className="text-sm text-ink-2">{empty}</p>
      </div>
    );
  }

  return (
    <figure className="m-0 min-w-0">
      {eyebrow || title ? (
        <div className="mb-3 space-y-1">
          {eyebrow ? (
            <p className="eyebrow">{eyebrow}</p>
          ) : null}
          {title ? (
            <h4 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h4>
          ) : null}
        </div>
      ) : null}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <ChartLegend series={series} />
        <span className="font-mono text-[10px] text-ink-4">{yLabel}</span>
      </div>

      <div className="min-w-0" style={{ height }}>
        <ResponsiveContainer
          width="100%"
          height={height}
          minWidth={280}
          initialDimension={{ width: 720, height }}
        >
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-ink-4">{xLabel}</span>
        {table ? (
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[10.5px] text-ink-3 underline decoration-dotted underline-offset-2 hover:text-ink">
              <Table2 className="h-3 w-3" strokeWidth={1.8} />
              data table
            </summary>
            <div className="absolute bottom-full right-0 z-20 mb-2 max-h-72 w-[min(22rem,80vw)] overflow-auto rounded-[10px] border border-line bg-abyss p-2 shadow-2xl">
              {table}
            </div>
          </details>
        ) : null}
      </figcaption>

      {footnote ? <div className="mt-2 text-[10.5px] leading-relaxed text-ink-4">{footnote}</div> : null}
    </figure>
  );
}

export default ChartFrame;
